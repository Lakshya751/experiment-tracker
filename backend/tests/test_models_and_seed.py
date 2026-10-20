from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import Experiment, Researcher, Run
from app.seed import seed_database


def test_seed_creates_expected_demo_data(app):
    with app.app_context():
        counts = seed_database()
        assert counts["researchers"] == 12
        assert counts["experiments"] >= 30
        assert db.session.scalar(select(func.count(Run.id))) == counts["runs"] > 0

        statuses = set(db.session.scalars(select(Experiment.status)))
        assert statuses == {"draft", "running", "completed", "archived"}

        emails = list(db.session.scalars(select(Researcher.email)))
        assert all(email.endswith("@example.org") for email in emails)

        drafts = db.session.scalars(select(Experiment).where(Experiment.status == "draft")).all()
        assert all(len(e.runs) == 0 for e in drafts)


def test_experiment_end_date_cannot_precede_start_date(app):
    with app.app_context():
        owner = Researcher(name="Test Owner", email="owner@example.org", role="Scientist", team="QA")
        db.session.add(owner)
        db.session.flush()
        db.session.add(
            Experiment(name="Bad dates", owner_id=owner.id, start_date=date(2026, 5, 2), end_date=date(2026, 5, 1))
        )
        with pytest.raises(IntegrityError):
            db.session.flush()


def test_invalid_status_rejected_by_database(app):
    with app.app_context():
        owner = Researcher(name="Test Owner", email="owner@example.org", role="Scientist", team="QA")
        db.session.add(owner)
        db.session.flush()
        db.session.add(Experiment(name="Bad status", owner_id=owner.id, status="paused", start_date=date(2026, 5, 1)))
        with pytest.raises(IntegrityError):
            db.session.flush()
