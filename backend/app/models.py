"""PostgreSQL models (structured, relational data).

Flexible run details (parameters, metrics, logs, notes) are NOT stored here;
they live in MongoDB, keyed by `Run.id`. See docs/ARCHITECTURE.md.
"""
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Index, String, func
from sqlalchemy.dialects.postgresql import ARRAY

from app.extensions import db

EXPERIMENT_STATUSES = ("draft", "running", "completed", "archived")
RUN_STATUSES = ("running", "completed", "failed")


def utcnow():
    return datetime.now(timezone.utc)


def _iso(value):
    return value.isoformat() if value is not None else None


class Researcher(db.Model):
    __tablename__ = "researchers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(254), nullable=False, unique=True)
    role = db.Column(db.String(80), nullable=False)
    team = db.Column(db.String(80), nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now())

    owned_experiments = db.relationship("Experiment", back_populates="owner", lazy="select")
    memberships = db.relationship(
        "ExperimentResearcher", back_populates="researcher", cascade="all, delete-orphan", lazy="select"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "team": self.team,
            "created_at": _iso(self.created_at),
        }

    def to_summary(self):
        return {"id": self.id, "name": self.name, "role": self.role, "team": self.team}


class Experiment(db.Model):
    __tablename__ = "experiments"
    __table_args__ = (
        CheckConstraint(f"status IN {EXPERIMENT_STATUSES}", name="ck_experiments_status"),
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name="ck_experiments_dates"),
        Index("ix_experiments_tags", "tags", postgresql_using="gin"),
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    hypothesis = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("researchers.id", ondelete="RESTRICT"), nullable=False, index=True)
    tags = db.Column(ARRAY(String(40)), nullable=False, default=list, server_default="{}")
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now())
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow, server_default=func.now()
    )

    owner = db.relationship("Researcher", back_populates="owned_experiments")
    memberships = db.relationship(
        "ExperimentResearcher", back_populates="experiment", cascade="all, delete-orphan", lazy="selectin"
    )
    runs = db.relationship("Run", back_populates="experiment", cascade="all, delete-orphan", lazy="select")

    @property
    def members(self):
        return [membership.researcher for membership in self.memberships]

    def to_dict(self, run_count=None):
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "hypothesis": self.hypothesis,
            "status": self.status,
            "owner": self.owner.to_summary() if self.owner else None,
            "members": [member.to_summary() for member in self.members],
            "tags": list(self.tags or []),
            "start_date": _iso(self.start_date),
            "end_date": _iso(self.end_date),
            "created_at": _iso(self.created_at),
            "updated_at": _iso(self.updated_at),
        }
        if run_count is not None:
            data["run_count"] = run_count
        return data

    def to_summary(self):
        return {"id": self.id, "name": self.name, "status": self.status}


class ExperimentResearcher(db.Model):
    """Association table: which researchers are team members on an experiment.

    The owner is stored on `Experiment.owner_id` and is not duplicated here.
    """

    __tablename__ = "experiment_researchers"

    experiment_id = db.Column(
        db.Integer, db.ForeignKey("experiments.id", ondelete="CASCADE"), primary_key=True
    )
    researcher_id = db.Column(
        db.Integer, db.ForeignKey("researchers.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    added_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now())

    experiment = db.relationship("Experiment", back_populates="memberships")
    researcher = db.relationship("Researcher", back_populates="memberships", lazy="joined")


class Run(db.Model):
    """Run metadata. Parameters/metrics/logs/notes live in MongoDB (`run_details`)."""

    __tablename__ = "runs"
    __table_args__ = (
        CheckConstraint(f"status IN {RUN_STATUSES}", name="ck_runs_status"),
        CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="ck_runs_times"),
        Index("ix_runs_experiment_started", "experiment_id", "started_at"),
    )

    id = db.Column(db.Integer, primary_key=True)
    experiment_id = db.Column(
        db.Integer, db.ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = db.Column(db.String(120), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="running")
    started_at = db.Column(db.DateTime(timezone=True), nullable=False)
    ended_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now())
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow, server_default=func.now()
    )

    experiment = db.relationship("Experiment", back_populates="runs")

    def to_dict(self):
        return {
            "id": self.id,
            "experiment_id": self.experiment_id,
            "name": self.name,
            "status": self.status,
            "started_at": _iso(self.started_at),
            "ended_at": _iso(self.ended_at),
            "created_at": _iso(self.created_at),
            "updated_at": _iso(self.updated_at),
        }
