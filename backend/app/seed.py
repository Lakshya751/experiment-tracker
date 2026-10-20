"""`flask seed`: load deterministic demo data.

Safety rules:
  * refuses to run when APP_ENV=production;
  * refuses to touch a database that already has researchers unless --reset is passed;
  * --reset asks for confirmation (skip with --yes) before wiping demo tables.
"""
import random
from datetime import date, datetime, time, timedelta, timezone

import click
from flask import current_app
from sqlalchemy import func, select, text

from app.extensions import db
from app.models import Experiment, ExperimentResearcher, Researcher, Run
from app.seed_data import EXPERIMENTS, RESEARCHERS, RUN_LABELS, STATUS_PLAN

RNG_SEED = 42


def _email_for(name):
    local = name.lower().replace(" ", ".").replace("-", "")
    return f"{local}@example.org"


def _reset_postgres():
    # Static SQL with no user input; RESTART IDENTITY makes IDs start at 1 again.
    db.session.execute(
        text("TRUNCATE runs, experiment_researchers, experiments, researchers RESTART IDENTITY CASCADE")
    )
    db.session.commit()


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
            }
        )
    return runs


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

    run_total = 0
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

        for planned in _plan_runs(rng, experiment, now):
            db.session.add(
                Run(
                    experiment_id=experiment.id,
                    name=planned["name"],
                    status=planned["status"],
                    started_at=planned["started_at"],
                    ended_at=planned["ended_at"],
                )
            )
            run_total += 1

    db.session.commit()
    return {"researchers": len(researchers), "experiments": len(EXPERIMENTS), "runs": run_total}


def register_commands(app):
    @app.cli.command("seed")
    @click.option("--reset", is_flag=True, help="Delete existing demo data before seeding.")
    @click.option("--yes", is_flag=True, help="Do not ask for confirmation when using --reset.")
    def seed_command(reset, yes):
        """Seed the databases with fictional demo data."""
        if current_app.config["APP_ENV"] == "production":
            raise click.ClickException("Refusing to seed when APP_ENV=production.")

        existing = db.session.scalar(select(func.count(Researcher.id)))
        if existing and not reset:
            raise click.ClickException(
                f"Database already contains {existing} researchers. Re-run with --reset to replace the demo data."
            )
        if reset:
            if not yes:
                click.confirm("This deletes ALL researchers, experiments and runs. Continue?", abort=True)
            _reset_postgres()

        counts = seed_database()
        click.echo(
            f"Seeded {counts['researchers']} researchers, {counts['experiments']} experiments, "
            f"and {counts['runs']} runs."
        )
