from flask import request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app.api import api_v1
from app.api.common import apply_sort, like_pattern, paginate
from app.errors import Conflict, NotFound, ok
from app.extensions import db
from app.models import Experiment, ExperimentResearcher, Researcher
from app.validation import ResearcherCreate, parse_body

SORT_COLUMNS = {"name": Researcher.name, "team": Researcher.team, "role": Researcher.role,
                "created_at": Researcher.created_at}


def _experiment_counts(researcher_ids):
    """Return {researcher_id: (owned_count, member_count)} using two grouped queries."""
    owned = dict(
        db.session.execute(
            select(Experiment.owner_id, func.count(Experiment.id))
            .where(Experiment.owner_id.in_(researcher_ids))
            .group_by(Experiment.owner_id)
        ).all()
    )
    member = dict(
        db.session.execute(
            select(ExperimentResearcher.researcher_id, func.count())
            .where(ExperimentResearcher.researcher_id.in_(researcher_ids))
            .group_by(ExperimentResearcher.researcher_id)
        ).all()
    )
    return {rid: (owned.get(rid, 0), member.get(rid, 0)) for rid in researcher_ids}


@api_v1.get("/researchers")
def list_researchers():
    statement = select(Researcher)
    q = request.args.get("q", "").strip()
    if q:
        pattern = like_pattern(q)
        statement = statement.where(
            or_(Researcher.name.ilike(pattern), Researcher.email.ilike(pattern), Researcher.team.ilike(pattern),
                Researcher.role.ilike(pattern))
        )
    if team := request.args.get("team", "").strip():
        statement = statement.where(Researcher.team == team)
    statement = apply_sort(statement, request.args.get("sort"), SORT_COLUMNS, "name").order_by(Researcher.id)

    researchers, meta = paginate(statement)
    counts = _experiment_counts([r.id for r in researchers])
    data = []
    for researcher in researchers:
        owned, member = counts[researcher.id]
        data.append({**researcher.to_dict(), "owned_experiment_count": owned, "member_experiment_count": member})
    teams = list(db.session.scalars(select(Researcher.team).distinct().order_by(Researcher.team)))
    meta["teams"] = teams
    return ok(data, meta=meta)


@api_v1.post("/researchers")
def create_researcher():
    payload = parse_body(ResearcherCreate)
    if db.session.scalar(select(Researcher.id).where(Researcher.email == payload.email)):
        raise Conflict("A researcher with this email already exists.", {"email": "already in use"})
    researcher = Researcher(**payload.model_dump())
    db.session.add(researcher)
    try:
        db.session.commit()
    except IntegrityError:
        # Another request inserted the same email between our check and commit.
        db.session.rollback()
        raise Conflict("A researcher with this email already exists.", {"email": "already in use"})
    return ok(researcher.to_dict(), 201)


@api_v1.get("/researchers/<int:researcher_id>")
def get_researcher(researcher_id):
    researcher = db.session.get(Researcher, researcher_id)
    if researcher is None:
        raise NotFound("Researcher", researcher_id)

    owned = db.session.scalars(
        select(Experiment).where(Experiment.owner_id == researcher_id).order_by(Experiment.start_date.desc())
    ).all()
    member_of = db.session.scalars(
        select(Experiment)
        .join(ExperimentResearcher)
        .where(ExperimentResearcher.researcher_id == researcher_id)
        .order_by(Experiment.start_date.desc())
    ).all()

    def summary(experiment):
        return {**experiment.to_summary(), "start_date": experiment.start_date.isoformat(),
                "end_date": experiment.end_date.isoformat() if experiment.end_date else None,
                "tags": list(experiment.tags or [])}

    return ok({
        **researcher.to_dict(),
        "owned_experiments": [summary(e) for e in owned],
        "member_experiments": [summary(e) for e in member_of],
    })
