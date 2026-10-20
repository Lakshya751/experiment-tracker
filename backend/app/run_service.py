"""Run create/update/read logic that spans PostgreSQL and MongoDB.

There is no distributed transaction between the two databases, so writes
follow a fixed order that keeps them consistent when one side fails:

Create:
  1. INSERT the run into PostgreSQL and flush (assigns an ID, not committed).
  2. Insert the details document into MongoDB using that ID.
     -> on failure: roll back PostgreSQL. Nothing was saved.
  3. COMMIT PostgreSQL.
     -> on failure: delete the MongoDB document (compensation).

Update:
  1. Read the current MongoDB document (kept for undo).
  2. Apply metadata changes in PostgreSQL and flush (not committed).
  3. Write the changed detail fields to MongoDB.
     -> on failure: roll back PostgreSQL. Nothing changed.
  4. COMMIT PostgreSQL.
     -> on failure: restore the MongoDB document read in step 1.

If a compensation step itself fails (both databases failing at once), a
MongoDB document can be left behind without a matching run. PostgreSQL IDs
come from a sequence and are never reused, so such an orphan can never be
attached to a different run; `flask check-consistency` finds and removes them.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app import run_details
from app.errors import ApiError, NotFound, ServiceUnavailable
from app.extensions import db
from app.models import Experiment, Run
from app.validation import check_run_timeline, validation_error

logger = logging.getLogger(__name__)

# Metrics where a smaller value is better (used to pick "best" results).
_LOWER_IS_BETTER_HINTS = (
    "loss", "error", "mape", "rmse", "mae", "perplexity", "latency", "duration",
    "p_value", "size_mb", "trials_to_target", "r_hat",
)


def lower_is_better(metric):
    return any(hint in metric for hint in _LOWER_IS_BETTER_HINTS)


def _duration_seconds(run):
    if run.started_at and run.ended_at:
        return round((run.ended_at - run.started_at).total_seconds(), 1)
    return None


def serialize_run(run, details, details_status, include_logs=False, experiment=None):
    """Combine PostgreSQL metadata with MongoDB details.

    details_status is "ok", "missing" (no document) or "unavailable" (MongoDB down),
    so clients can tell an empty run apart from one whose details could not be loaded.
    """
    data = run.to_dict()
    data["duration_seconds"] = _duration_seconds(run)
    if experiment is not None:
        data["experiment"] = experiment.to_summary()
    data["details_status"] = details_status
    details = details or {}
    data["parameters"] = details.get("parameters", {})
    data["metrics"] = details.get("metrics", {})
    data["notes"] = details.get("notes", "")
    logs = details.get("logs", [])
    if include_logs:
        data["logs"] = [
            {**entry, "timestamp": entry["timestamp"].isoformat() if entry.get("timestamp") else None}
            for entry in logs
        ]
    return data


def load_details(run_ids, include_logs=False):
    """Return ({run_id: details}, available). Never raises for MongoDB outages."""
    try:
        return run_details.get_many(run_ids, include_logs=include_logs), True
    except run_details.DetailsStoreError:
        return {}, False


def serialize_runs(runs, include_experiment=False):
    details_by_id, available = load_details([run.id for run in runs])
    result = []
    for run in runs:
        if not available:
            status = "unavailable"
        else:
            status = "ok" if run.id in details_by_id else "missing"
        result.append(
            serialize_run(
                run,
                details_by_id.get(run.id),
                status,
                experiment=run.experiment if include_experiment else None,
            )
        )
    return result, available


def get_run_with_details(run):
    try:
        details = run_details.get_details(run.id)
        status = "ok" if details is not None else "missing"
    except run_details.DetailsStoreError:
        details, status = None, "unavailable"
    return serialize_run(run, details, status, include_logs=True, experiment=run.experiment)


def _prepare_logs(logs):
    now = datetime.now(timezone.utc)
    return [{**entry.model_dump(), "timestamp": entry.timestamp or now} for entry in logs]


def _fill_duration(metrics, run):
    # duration_seconds defaults to the run's wall-clock time when not supplied.
    if "duration_seconds" not in metrics and run.started_at and run.ended_at:
        metrics["duration_seconds"] = _duration_seconds(run)
    return metrics


def _commit_or_compensate(run_id, undo):
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception("PostgreSQL commit failed for run %s; undoing MongoDB write", run_id)
        undo()
        raise ServiceUnavailable("The run could not be saved. No changes were made; please try again.")


def create_run(experiment, payload):
    if experiment.status == "archived":
        raise ApiError(409, "conflict", "Runs cannot be added to an archived experiment. Unarchive it first.")
    errors = check_run_timeline(payload.status, payload.started_at, payload.ended_at)
    if errors:
        raise validation_error(errors)

    run = Run(
        experiment_id=experiment.id,
        name=payload.name,
        status=payload.status,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
    )
    db.session.add(run)
    try:
        db.session.flush()  # assigns run.id inside the open transaction
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception("Failed to insert run metadata")
        raise ServiceUnavailable("The run could not be saved. Please try again.")

    details = {
        "parameters": payload.parameters,
        "metrics": _fill_duration(dict(payload.metrics), run),
        "logs": _prepare_logs(payload.logs),
        "notes": payload.notes,
    }
    try:
        run_details.create(run.id, details)
    except run_details.DetailsStoreError:
        db.session.rollback()
        raise ServiceUnavailable("Run details storage (MongoDB) is unavailable. The run was not created.")

    run_id = run.id
    _commit_or_compensate(run_id, lambda: run_details.restore(run_id, None))
    return run


def update_run(run, payload):
    changes = payload.model_dump(exclude_unset=True)
    metadata_fields = {key: changes[key] for key in ("name", "status", "started_at", "ended_at") if key in changes}
    detail_fields = {key: changes[key] for key in run_details.DETAIL_FIELDS if key in changes}

    status = metadata_fields.get("status", run.status)
    started_at = metadata_fields.get("started_at", run.started_at)
    ended_at = metadata_fields["ended_at"] if "ended_at" in metadata_fields else run.ended_at
    errors = check_run_timeline(status, started_at, ended_at)
    if errors:
        raise validation_error(errors)

    # Step 1: snapshot current details so a failed commit can be undone.
    previous = None
    if detail_fields:
        try:
            previous = run_details.get_details(run.id)
        except run_details.DetailsStoreError:
            raise ServiceUnavailable("Run details storage (MongoDB) is unavailable. No changes were made.")

    # Step 2: metadata changes inside the open PostgreSQL transaction.
    for key, value in metadata_fields.items():
        setattr(run, key, value)
    if metadata_fields:
        run.updated_at = datetime.now(timezone.utc)
    try:
        db.session.flush()
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception("Failed to update run metadata for run %s", run.id)
        raise ServiceUnavailable("The run could not be updated. Please try again.")

    # Step 3: MongoDB write.
    if detail_fields:
        if "logs" in detail_fields:
            detail_fields["logs"] = _prepare_logs(payload.logs)
        if "metrics" in detail_fields:
            detail_fields["metrics"] = _fill_duration(dict(detail_fields["metrics"]), run)
        try:
            run_details.update(run.id, detail_fields)
        except run_details.DetailsStoreError:
            db.session.rollback()
            raise ServiceUnavailable("Run details storage (MongoDB) is unavailable. No changes were made.")

    # Step 4: commit, undoing the MongoDB write if PostgreSQL fails.
    run_id = run.id
    _commit_or_compensate(run_id, lambda: detail_fields and run_details.restore(run_id, previous))
    return run


def find_inconsistencies():
    """Return (runs_without_details, details_without_runs) as sorted ID lists."""
    run_ids = set(db.session.scalars(select(Run.id)))
    detail_ids = run_details.all_ids()
    return sorted(run_ids - detail_ids), sorted(detail_ids - run_ids)


def latest_completed_run(experiment_id):
    return db.session.scalar(
        select(Run)
        .where(Run.experiment_id == experiment_id, Run.status == "completed")
        .order_by(Run.ended_at.desc(), Run.id.desc())
        .limit(1)
    )


def experiment_or_404(experiment_id):
    experiment = db.session.get(Experiment, experiment_id)
    if experiment is None:
        raise NotFound("Experiment", experiment_id)
    return experiment
