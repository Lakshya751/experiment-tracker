from flask import request
from sqlalchemy import func, or_, select

from app.api import api_v1
from app.api.common import apply_sort, like_pattern, paginate
from app.errors import ok
from app.extensions import db
from app.models import EXPERIMENT_STATUSES, RUN_STATUSES, Experiment, ExperimentResearcher, Researcher, Run
from app.run_service import (
    create_run,
    experiment_or_404,
    get_run_with_details,
    latest_completed_run,
    serialize_runs,
)
from app.validation import (
    ExperimentCreate,
    ExperimentUpdate,
    RunCreate,
    parse_body,
    query_choice,
    query_int,
    validation_error,
)

SORT_COLUMNS = {
    "name": Experiment.name,
    "status": Experiment.status,
    "start_date": Experiment.start_date,
    "created_at": Experiment.created_at,
    "updated_at": Experiment.updated_at,
}
RUN_SORT_COLUMNS = {"started_at": Run.started_at, "name": Run.name, "status": Run.status}


def _run_counts(experiment_ids):
    if not experiment_ids:
        return {}
    rows = db.session.execute(
        select(Run.experiment_id, func.count(Run.id)).where(Run.experiment_id.in_(experiment_ids))
        .group_by(Run.experiment_id)
    ).all()
    return dict(rows)


def _check_researchers_exist(owner_id, member_ids):
    wanted = {owner_id, *member_ids} - {None}
    found = set(db.session.scalars(select(Researcher.id).where(Researcher.id.in_(wanted))))
    errors = {}
    if owner_id is not None and owner_id not in found:
        errors["owner_id"] = f"researcher {owner_id} does not exist"
    missing = sorted(set(member_ids) - found)
    if missing:
        errors["member_ids"] = f"unknown researcher IDs: {', '.join(map(str, missing))}"
    if errors:
        raise validation_error(errors)


def _set_members(experiment, member_ids):
    # The owner is stored on the experiment itself, so it is not duplicated as a member.
    wanted = [rid for rid in member_ids if rid != experiment.owner_id]
    experiment.memberships = [m for m in experiment.memberships if m.researcher_id in wanted]
    existing = {m.researcher_id for m in experiment.memberships}
    for rid in wanted:
        if rid not in existing:
            experiment.memberships.append(ExperimentResearcher(researcher_id=rid))


def _experiment_detail(experiment):
    counts = dict(
        db.session.execute(
            select(Run.status, func.count(Run.id)).where(Run.experiment_id == experiment.id).group_by(Run.status)
        ).all()
    )
    latest = latest_completed_run(experiment.id)
    data = experiment.to_dict(run_count=sum(counts.values()))
    data["run_status_counts"] = {status: counts.get(status, 0) for status in RUN_STATUSES}
    data["latest_result"] = None
    if latest is not None:
        serialized, _ = serialize_runs([latest])
        data["latest_result"] = serialized[0]
    return data


@api_v1.get("/experiments")
def list_experiments():
    statement = select(Experiment)

    q = request.args.get("q", "").strip()
    if q:
        pattern = like_pattern(q)
        statement = statement.where(
            or_(
                Experiment.name.ilike(pattern),
                Experiment.description.ilike(pattern),
                Experiment.hypothesis.ilike(pattern),
                Experiment.tags.contains([q.lower()]),
            )
        )

    # status: one status, "all", or omitted (= everything except archived).
    status = query_choice("status", EXPERIMENT_STATUSES + ("all",))
    if status is None:
        statement = statement.where(Experiment.status != "archived")
    elif status != "all":
        statement = statement.where(Experiment.status == status)

    if tag := request.args.get("tag", "").strip().lower():
        statement = statement.where(Experiment.tags.contains([tag]))
    if owner_id := query_int("owner_id", None):
        statement = statement.where(Experiment.owner_id == owner_id)
    if researcher_id := query_int("researcher_id", None):
        member_subquery = select(ExperimentResearcher.experiment_id).where(
            ExperimentResearcher.researcher_id == researcher_id
        )
        statement = statement.where(
            or_(Experiment.owner_id == researcher_id, Experiment.id.in_(member_subquery))
        )

    statement = apply_sort(statement, request.args.get("sort"), SORT_COLUMNS, "-start_date").order_by(Experiment.id)
    experiments, meta = paginate(statement)
    counts = _run_counts([e.id for e in experiments])
    return ok([e.to_dict(run_count=counts.get(e.id, 0)) for e in experiments], meta=meta)


@api_v1.get("/experiments/tags")
def list_tags():
    tags = db.session.scalars(select(func.unnest(Experiment.tags)).distinct().order_by(func.unnest(Experiment.tags)))
    return ok(sorted(set(tags)))


@api_v1.post("/experiments")
def create_experiment():
    payload = parse_body(ExperimentCreate)
    _check_researchers_exist(payload.owner_id, payload.member_ids)
    experiment = Experiment(**payload.model_dump(exclude={"member_ids"}))
    _set_members(experiment, payload.member_ids)
    db.session.add(experiment)
    db.session.commit()
    return ok(_experiment_detail(experiment), 201)


@api_v1.get("/experiments/<int:experiment_id>")
def get_experiment(experiment_id):
    return ok(_experiment_detail(experiment_or_404(experiment_id)))


@api_v1.put("/experiments/<int:experiment_id>")
def update_experiment(experiment_id):
    """Update an experiment. Only the fields present in the body are changed."""
    experiment = experiment_or_404(experiment_id)
    payload = parse_body(ExperimentUpdate)
    changes = payload.model_dump(exclude_unset=True)

    start = changes.get("start_date", experiment.start_date)
    end = changes["end_date"] if "end_date" in changes else experiment.end_date
    if end is not None and end < start:
        raise validation_error({"end_date": "end_date must be on or after start_date"})
    member_ids = changes.pop("member_ids", None)
    _check_researchers_exist(changes.get("owner_id"), member_ids or [])

    for key, value in changes.items():
        setattr(experiment, key, value)
    if member_ids is not None:
        _set_members(experiment, member_ids)
    elif "owner_id" in changes:
        # A new owner who was a team member is no longer listed twice.
        _set_members(experiment, [m.researcher_id for m in experiment.memberships])
    db.session.commit()
    return ok(_experiment_detail(experiment))


@api_v1.delete("/experiments/<int:experiment_id>")
def archive_experiment(experiment_id):
    """Archive (soft-delete) an experiment. Runs and details are kept for the record."""
    experiment = experiment_or_404(experiment_id)
    experiment.status = "archived"
    db.session.commit()
    return ok(_experiment_detail(experiment))


@api_v1.get("/experiments/<int:experiment_id>/runs")
def list_experiment_runs(experiment_id):
    experiment_or_404(experiment_id)
    statement = select(Run).where(Run.experiment_id == experiment_id)
    status = query_choice("status", RUN_STATUSES)
    if status:
        statement = statement.where(Run.status == status)
    statement = apply_sort(statement, request.args.get("sort"), RUN_SORT_COLUMNS, "-started_at").order_by(Run.id)
    runs, meta = paginate(statement, default_per_page=50)
    data, details_available = serialize_runs(runs)
    meta["details_available"] = details_available
    return ok(data, meta=meta)


@api_v1.post("/experiments/<int:experiment_id>/runs")
def create_experiment_run(experiment_id):
    experiment = experiment_or_404(experiment_id)
    payload = parse_body(RunCreate)
    run = create_run(experiment, payload)
    return ok(get_run_with_details(run), 201)
