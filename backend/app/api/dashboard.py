from flask import request
from sqlalchemy import func, select

from app.api import api_v1
from app.errors import ok
from app.extensions import db
from app.models import EXPERIMENT_STATUSES, Experiment, Researcher, Run
from app.run_service import load_details, lower_is_better, serialize_runs
from app.validation import KEY_RE, query_id_list, query_int, validation_error

DEFAULT_COMPARISON_SIZE = 6
CANDIDATE_POOL = 20
DEFAULT_METRIC = "accuracy"


@api_v1.get("/dashboard/summary")
def dashboard_summary():
    status_counts = dict(
        db.session.execute(select(Experiment.status, func.count(Experiment.id)).group_by(Experiment.status)).all()
    )
    recent_limit = query_int("recent", 8, maximum=25)
    recent = db.session.scalars(select(Run).order_by(Run.started_at.desc(), Run.id.desc()).limit(recent_limit)).all()
    recent_runs, details_available = serialize_runs(recent, include_experiment=True)

    return ok({
        "counts": {
            "total_experiments": sum(status_counts.values()),
            "active_experiments": status_counts.get("running", 0),
            "completed_experiments": status_counts.get("completed", 0),
            "researchers": db.session.scalar(select(func.count(Researcher.id))),
            "total_runs": db.session.scalar(select(func.count(Run.id))),
            "by_status": {status: status_counts.get(status, 0) for status in EXPERIMENT_STATUSES},
        },
        "recent_runs": recent_runs,
        "details_available": details_available,
    })


@api_v1.get("/dashboard/metric-comparison")
def metric_comparison():
    """Latest and best value of one metric for each selected experiment.

    Query params:
      experiment_ids=1,2,3  (default: up to 6 experiments with the most completed runs that report the metric)
      metric=accuracy       (default: accuracy)
    Only completed runs are considered.
    """
    requested_ids = query_id_list("experiment_ids", maximum=10)
    metric = request.args.get("metric", "").strip() or DEFAULT_METRIC
    if not KEY_RE.match(metric):
        raise validation_error({"metric": "must be a metric name (letters, numbers, underscores)"},
                               "Invalid query parameter.")

    if requested_ids:
        candidate_ids = requested_ids
        found = set(db.session.scalars(select(Experiment.id).where(Experiment.id.in_(requested_ids))))
        missing = [eid for eid in requested_ids if eid not in found]
        if missing:
            raise validation_error({"experiment_ids": f"unknown experiment IDs: {', '.join(map(str, missing))}"})
    else:
        candidate_ids = list(db.session.scalars(
            select(Run.experiment_id).where(Run.status == "completed").group_by(Run.experiment_id)
            .order_by(func.count(Run.id).desc(), func.max(Run.ended_at).desc(), Run.experiment_id)
            .limit(CANDIDATE_POOL)
        ))

    runs = db.session.scalars(
        select(Run).where(Run.experiment_id.in_(candidate_ids), Run.status == "completed")
        .order_by(Run.ended_at.asc(), Run.id.asc())
    ).all()
    details, available = load_details([run.id for run in runs])

    frequency = {}
    for doc in details.values():
        for name in doc["metrics"]:
            frequency[name] = frequency.get(name, 0) + 1
    available_metrics = sorted(frequency, key=lambda name: (-frequency[name], name))

    values_by_experiment = {eid: [] for eid in candidate_ids}
    for run in runs:
        value = details.get(run.id, {}).get("metrics", {}).get(metric)
        if value is not None:
            values_by_experiment[run.experiment_id].append((run, value))

    experiment_ids = requested_ids or [eid for eid in candidate_ids if values_by_experiment[eid]][:DEFAULT_COMPARISON_SIZE]
    experiments = {e.id: e for e in db.session.scalars(select(Experiment).where(Experiment.id.in_(experiment_ids)))}
    prefer_low = lower_is_better(metric)

    rows = []
    for experiment_id in experiment_ids:
        values = values_by_experiment[experiment_id]
        best = (min if prefer_low else max)(values, key=lambda pair: pair[1]) if values else None
        latest = values[-1] if values else None
        rows.append({
            "experiment": experiments[experiment_id].to_summary(),
            "completed_runs": sum(1 for run in runs if run.experiment_id == experiment_id),
            "runs_with_metric": len(values),
            "latest_value": latest[1] if latest else None,
            "latest_run": latest[0].name if latest else None,
            "best_value": best[1] if best else None,
            "best_run": best[0].name if best else None,
        })

    return ok({
        "metric": metric,
        "lower_is_better": prefer_low,
        "available_metrics": available_metrics,
        "details_available": available,
        "experiments": rows,
    })
