"""Deterministic demo data generation used by `flask seed` (see app/cli.py).

A fixed random seed means every machine gets the same experiments, runs and
metrics; only dates shift so the data always looks recent.
"""
import random
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import text

from app import run_details
from app.extensions import db
from app.models import Experiment, ExperimentResearcher, Researcher, Run
from app.seed_data import EXPERIMENTS, RESEARCHERS, RUN_LABELS, STATUS_PLAN

RNG_SEED = 42


def _email_for(name):
    local = name.lower().replace(" ", ".").replace("-", "")
    return f"{local}@example.org"


def reset_demo_data():
    # Static SQL with no user input; RESTART IDENTITY makes IDs start at 1 again.
    db.session.execute(
        text("TRUNCATE runs, experiment_researchers, experiments, researchers RESTART IDENTITY CASCADE")
    )
    db.session.commit()
    run_details.drop_all()


def _seed_researchers():
    researchers = [
        Researcher(name=name, email=_email_for(name), role=role, team=team) for name, role, team in RESEARCHERS
    ]
    db.session.add_all(researchers)
    db.session.flush()
    return researchers


def _experiment_dates(rng, status, today):
    if status in ("completed", "archived"):
        start = today - timedelta(days=rng.randint(70, 260))
        end = start + timedelta(days=rng.randint(21, 55))
        return start, end
    if status == "running":
        return today - timedelta(days=rng.randint(6, 60)), None
    # Drafts are planned experiments that have not started yet.
    return today + timedelta(days=rng.randint(3, 30)), None


def _run_count(rng, status):
    return {"draft": 0, "running": rng.randint(2, 6), "completed": rng.randint(4, 8), "archived": rng.randint(2, 4)}[
        status
    ]


def _plan_runs(rng, experiment, now):
    """Return run metadata dicts spread across the experiment's active window."""
    count = _run_count(rng, experiment.status)
    if count == 0:
        return []
    window_start = datetime.combine(experiment.start_date, time(9, 0), tzinfo=timezone.utc)
    if experiment.end_date:
        window_end = datetime.combine(experiment.end_date, time(18, 0), tzinfo=timezone.utc)
    else:
        window_end = now - timedelta(hours=2)
    span = max((window_end - window_start).total_seconds(), 3600)

    runs = []
    for index in range(count):
        is_last = index == count - 1
        offset = span * (index + rng.uniform(0.05, 0.6)) / count
        started_at = window_start + timedelta(seconds=offset)
        duration = timedelta(minutes=rng.randint(18, 540))
        if experiment.status == "running" and is_last:
            status, ended_at = "running", None
        elif not is_last and rng.random() < 0.12:
            status, ended_at = "failed", started_at + duration / 4
        else:
            status, ended_at = "completed", started_at + duration
        if ended_at and ended_at > now:
            ended_at = now
        label = RUN_LABELS[index % len(RUN_LABELS)]
        runs.append(
            {
                "name": f"r{index + 1:02d}-{label}",
                "status": status,
                "started_at": started_at,
                "ended_at": ended_at,
                "progress": index / max(count - 1, 1),
                "index": index,
            }
        )
    return runs


_BOUNDED_METRIC_HINTS = ("accuracy", "precision", "recall", "f1", "auroc", "rate", "exact_match", "iou",
                         "rouge", "spearman", "silhouette", "r2", "index", "ece", "calibration", "p_value")


def _metric_value(rng, name, first, best, decimals, progress):
    # Fast early improvement that flattens out, plus noise proportional to the range.
    curve = 1 - (1 - progress) ** 1.6
    value = first + (best - first) * curve + rng.gauss(0, abs(best - first) * 0.06)
    if any(hint in name for hint in _BOUNDED_METRIC_HINTS) and 0 <= min(first, best) and max(first, best) <= 1:
        value = min(max(value, 0.0), 1.0)
    if first >= 0 and best >= 0:
        value = max(value, 0.0)
    return round(value, decimals) if decimals else int(round(value))


def _run_parameters(rng, spec, label, index):
    params = dict(spec["params"])
    params.update({
        "learning_rate": rng.choice([1e-4, 3e-4, 5e-4, 1e-3, 3e-3]),
        "batch_size": rng.choice([16, 32, 64, 128]),
        "epochs": rng.choice([10, 20, 30, 50]),
        "seed": 1000 + index,
    })
    if label == "lr-sweep":
        params["learning_rate"] = rng.choice([1e-5, 5e-5, 1e-2])
    elif label == "dropout-0.3":
        params["dropout"] = 0.3
    elif label == "warmup-cosine":
        params["scheduler"] = "cosine"
        params["warmup_steps"] = 500
    elif label == "longer-schedule":
        params["epochs"] = 100
    return params


_NOTES = {
    "baseline": "Reference configuration. All later runs are compared against this one.",
    "lr-sweep": "Learning-rate sweep point; watch for instability in early epochs.",
    "wider-model": "Doubled hidden width to test whether capacity is the bottleneck.",
    "longer-schedule": "Extended training schedule; checking whether validation metrics keep improving.",
    "heavy-augmentation": "Stronger augmentation to reduce overfitting seen in earlier runs.",
    "dropout-0.3": "Increased dropout after the train/validation gap widened.",
    "warmup-cosine": "Linear warmup followed by cosine decay.",
    "tuned-regularization": "Weight decay chosen from the previous sweep.",
    "ensemble": "Average of the three best checkpoints so far.",
    "final-candidate": "Candidate configuration for the write-up; re-run with a fresh seed to confirm.",
}


def _run_details(rng, spec, planned, sample_size):
    label = planned["name"].split("-", 1)[1]
    progress = planned["progress"]
    started = planned["started_at"]
    metrics = {}
    if planned["status"] == "completed":
        for name, first, best, decimals in spec["metrics"]:
            metrics[name] = _metric_value(rng, name, first, best, decimals, progress)
    elif planned["status"] == "running":
        # Partial results reported so far.
        name, first, best, decimals = spec["metrics"][-1] if spec["metrics"][-1][0] == "loss" else spec["metrics"][0]
        metrics[name] = _metric_value(rng, name, first, best, decimals, progress * 0.6)
    else:  # failed
        loss_spec = next((m for m in spec["metrics"] if m[0] == "loss"), None)
        if loss_spec:
            metrics["loss"] = _metric_value(rng, *loss_spec, progress=0.0)
    metrics["sample_size"] = int(sample_size * rng.uniform(0.9, 1.1)) if planned["status"] != "failed" else 0
    if planned["ended_at"]:
        metrics["duration_seconds"] = round((planned["ended_at"] - started).total_seconds(), 1)

    params = _run_parameters(rng, spec, label, planned["index"])
    logs = [
        {"timestamp": started, "level": "info", "message": f"Run started with seed {params['seed']}."},
        {"timestamp": started + timedelta(minutes=2), "level": "info",
         "message": f"Loaded {metrics['sample_size'] or sample_size:,} samples."},
    ]
    if planned["status"] == "failed":
        logs.append({"timestamp": planned["ended_at"], "level": "error",
                     "message": rng.choice(["CUDA out of memory at batch 412.", "Loss became NaN at step 1,830.",
                                            "Data loader worker exited unexpectedly."])})
    elif planned["status"] == "running":
        logs.append({"timestamp": started + timedelta(minutes=10), "level": "info",
                     "message": f"Epoch 1/{params['epochs']} finished."})
    else:
        if rng.random() < 0.3:
            logs.append({"timestamp": started + timedelta(minutes=15), "level": "warning",
                         "message": "Validation loss plateaued for 3 epochs; reducing learning rate."})
        logs.append({"timestamp": planned["ended_at"], "level": "info",
                     "message": "Run completed; final checkpoint saved."})
    notes = _NOTES.get(label, "")
    if planned["status"] == "failed":
        notes = "Failed run kept for reference. " + notes
    return {"parameters": params, "metrics": metrics, "logs": logs, "notes": notes}


def seed_database(today=None, now=None):
    """Create researchers, experiments, memberships and runs. Returns counts."""
    rng = random.Random(RNG_SEED)
    today = today or date.today()
    now = now or datetime.now(timezone.utc)

    researchers = _seed_researchers()
    by_team = {}
    for researcher in researchers:
        by_team.setdefault(researcher.team, []).append(researcher)

    statuses = STATUS_PLAN[:]
    rng.shuffle(statuses)

    details_by_run = []
    for spec, status in zip(EXPERIMENTS, statuses):
        team = by_team[spec["team"]]
        owner = rng.choice(team)
        start_date, end_date = _experiment_dates(rng, status, today)
        experiment = Experiment(
            name=spec["name"],
            description=spec["description"],
            hypothesis=spec["hypothesis"],
            status=status,
            owner=owner,
            tags=spec["tags"],
            start_date=start_date,
            end_date=end_date,
        )
        # Team members: the owner's teammate plus up to two collaborators from other teams.
        members = [r for r in team if r.id != owner.id]
        others = [r for r in researchers if r.team != spec["team"]]
        members += rng.sample(others, rng.randint(0, 2))
        for member in members:
            experiment.memberships.append(ExperimentResearcher(researcher=member))
        db.session.add(experiment)
        db.session.flush()

        sample_size = rng.choice([4_800, 12_000, 25_000, 60_000, 150_000])
        for planned in _plan_runs(rng, experiment, now):
            run = Run(
                experiment_id=experiment.id,
                name=planned["name"],
                status=planned["status"],
                started_at=planned["started_at"],
                ended_at=planned["ended_at"],
            )
            db.session.add(run)
            details_by_run.append((run, _run_details(rng, spec, planned, sample_size)))

    db.session.commit()
    try:
        for run, details in details_by_run:
            run_details.create(run.id, details)
    except run_details.DetailsStoreError:
        # Keep the databases consistent: without details, remove the seeded rows too.
        reset_demo_data()
        raise
    return {"researchers": len(researchers), "experiments": len(EXPERIMENTS), "runs": len(details_by_run)}
