"""Request validation with Pydantic.

Every write endpoint parses its JSON body through one of these models. Unknown
fields are rejected (`extra="forbid"`) so typos surface as clear 400 errors
instead of being silently ignored.
"""
import math
import re
from datetime import date, datetime, timezone
from typing import Annotated, Literal, Optional, Union

from flask import request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, field_validator, model_validator

from app.errors import ApiError
from app.models import EXPERIMENT_STATUSES, RUN_STATUSES

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
KEY_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,49}$")
TAG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")

STANDARD_METRICS = ("accuracy", "loss", "duration_seconds", "sample_size")
MAX_PARAMS = 50
MAX_METRICS = 50
MAX_LOGS = 500

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
ExperimentStatus = Literal[EXPERIMENT_STATUSES]
RunStatus = Literal[RUN_STATUSES]
ParamValue = Union[bool, int, float, Annotated[str, StringConstraints(max_length=500)]]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _as_utc(value):
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


# --- Researchers -----------------------------------------------------------------

class ResearcherCreate(_Strict):
    name: Name
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=254)]
    role: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    team: Annotated[str, StringConstraints(min_length=1, max_length=80)]

    @field_validator("email")
    @classmethod
    def check_email(cls, value):
        if not EMAIL_RE.match(value):
            raise ValueError("must be a valid email address")
        return value


# --- Experiments -----------------------------------------------------------------

def _check_tags(tags):
    cleaned = []
    for tag in tags:
        tag = tag.strip().lower()
        if not TAG_RE.match(tag):
            raise ValueError(f"'{tag}' is not a valid tag (use lowercase letters, numbers and hyphens, max 40 chars)")
        if tag not in cleaned:
            cleaned.append(tag)
    return cleaned


class ExperimentFields(_Strict):
    name: Annotated[str, StringConstraints(min_length=1, max_length=160)]
    description: Annotated[str, StringConstraints(max_length=5000)] = ""
    hypothesis: Annotated[str, StringConstraints(max_length=2000)] = ""
    status: ExperimentStatus = "draft"
    owner_id: Annotated[int, Field(gt=0)]
    member_ids: Annotated[list[Annotated[int, Field(gt=0)]], Field(max_length=25)] = []
    tags: Annotated[list[str], Field(max_length=10)] = []
    start_date: date
    end_date: Optional[date] = None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value):
        return _check_tags(value)

    @field_validator("member_ids")
    @classmethod
    def dedupe_members(cls, value):
        return list(dict.fromkeys(value))


class ExperimentCreate(ExperimentFields):
    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class ExperimentUpdate(_Strict):
    """All fields optional; date ordering is checked after merging with the stored values."""

    name: Optional[Annotated[str, StringConstraints(min_length=1, max_length=160)]] = None
    description: Optional[Annotated[str, StringConstraints(max_length=5000)]] = None
    hypothesis: Optional[Annotated[str, StringConstraints(max_length=2000)]] = None
    status: Optional[ExperimentStatus] = None
    owner_id: Optional[Annotated[int, Field(gt=0)]] = None
    member_ids: Optional[Annotated[list[Annotated[int, Field(gt=0)]], Field(max_length=25)]] = None
    tags: Optional[Annotated[list[str], Field(max_length=10)]] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value):
        return None if value is None else _check_tags(value)

    @field_validator("member_ids")
    @classmethod
    def dedupe_members(cls, value):
        return None if value is None else list(dict.fromkeys(value))

    @field_validator("name", "start_date", "status", "owner_id", mode="before")
    @classmethod
    def not_null(cls, value):
        if value is None:
            raise ValueError("cannot be null")
        return value


# --- Runs -----------------------------------------------------------------------

class LogEntry(_Strict):
    timestamp: Optional[datetime] = None
    level: Literal["debug", "info", "warning", "error"] = "info"
    message: Annotated[str, StringConstraints(min_length=1, max_length=2000)]

    @field_validator("timestamp")
    @classmethod
    def to_utc(cls, value):
        return _as_utc(value)


def _check_parameters(params):
    if len(params) > MAX_PARAMS:
        raise ValueError(f"at most {MAX_PARAMS} parameters are allowed")
    for key in params:
        if not KEY_RE.match(key):
            raise ValueError(f"'{key}' is not a valid name (letters, numbers, underscores; must start with a letter)")
    return params


def _check_metrics(metrics):
    if len(metrics) > MAX_METRICS:
        raise ValueError(f"at most {MAX_METRICS} metrics are allowed")
    for key, value in metrics.items():
        if not KEY_RE.match(key):
            raise ValueError(f"'{key}' is not a valid metric name (letters, numbers, underscores; must start with a letter)")
        if isinstance(value, bool) or not math.isfinite(value):
            raise ValueError(f"metric '{key}' must be a finite number")
    if "accuracy" in metrics and not 0 <= metrics["accuracy"] <= 1:
        raise ValueError("accuracy must be between 0 and 1")
    for key in ("loss", "duration_seconds", "sample_size"):
        if key in metrics and metrics[key] < 0:
            raise ValueError(f"{key} cannot be negative")
    if "sample_size" in metrics:
        if metrics["sample_size"] != int(metrics["sample_size"]):
            raise ValueError("sample_size must be a whole number")
        metrics["sample_size"] = int(metrics["sample_size"])
    return metrics


class RunCreate(_Strict):
    name: Name
    status: RunStatus = "running"
    started_at: datetime
    ended_at: Optional[datetime] = None
    notes: Annotated[str, StringConstraints(max_length=10000)] = ""
    parameters: dict[str, ParamValue] = {}
    metrics: dict[str, float] = {}
    logs: Annotated[list[LogEntry], Field(max_length=MAX_LOGS)] = []

    @field_validator("started_at", "ended_at")
    @classmethod
    def to_utc(cls, value):
        return _as_utc(value)

    @field_validator("parameters")
    @classmethod
    def validate_parameters(cls, value):
        return _check_parameters(value)

    @field_validator("metrics")
    @classmethod
    def validate_metrics(cls, value):
        return _check_metrics(value)


class RunUpdate(_Strict):
    """All fields optional. Detail fields (parameters/metrics/logs/notes) replace the stored value."""

    name: Optional[Name] = None
    status: Optional[RunStatus] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    notes: Optional[Annotated[str, StringConstraints(max_length=10000)]] = None
    parameters: Optional[dict[str, ParamValue]] = None
    metrics: Optional[dict[str, float]] = None
    logs: Optional[Annotated[list[LogEntry], Field(max_length=MAX_LOGS)]] = None

    @field_validator("name", "status", "started_at", "notes", "parameters", "metrics", "logs", mode="before")
    @classmethod
    def not_null(cls, value):
        if value is None:
            raise ValueError("cannot be null")
        return value

    @field_validator("started_at", "ended_at")
    @classmethod
    def to_utc(cls, value):
        return _as_utc(value)

    @field_validator("parameters")
    @classmethod
    def validate_parameters(cls, value):
        return _check_parameters(value)

    @field_validator("metrics")
    @classmethod
    def validate_metrics(cls, value):
        return _check_metrics(value)


def check_run_timeline(status, started_at, ended_at):
    """Cross-field rules shared by create and update. Returns {field: message}."""
    errors = {}
    if ended_at is not None and ended_at < started_at:
        errors["ended_at"] = "ended_at must be on or after started_at"
    if status == "running" and ended_at is not None:
        errors["ended_at"] = "a running run cannot have ended_at; set status to completed or failed"
    if status in ("completed", "failed") and ended_at is None:
        errors["ended_at"] = f"ended_at is required when status is {status}"
    return errors


# --- Helpers ---------------------------------------------------------------------

def _format_errors(exc):
    details = {}
    for err in exc.errors():
        loc = ".".join(str(part) for part in err["loc"]) or "body"
        message = err["msg"]
        if message.startswith("Value error, "):
            message = message[len("Value error, "):]
        if err["type"] == "extra_forbidden":
            message = "unknown field"
        details.setdefault(loc, message)
    return details


def validation_error(details, message="Request validation failed."):
    return ApiError(400, "validation_error", message, details)


def parse_body(model):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError(400, "invalid_json", "Request body must be a JSON object.")
    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        raise validation_error(_format_errors(exc)) from None


def query_int(name, default, minimum=1, maximum=None):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise validation_error({name: "must be an integer"}, "Invalid query parameter.") from None
    if value < minimum or (maximum is not None and value > maximum):
        bound = f"between {minimum} and {maximum}" if maximum is not None else f"at least {minimum}"
        raise validation_error({name: f"must be {bound}"}, "Invalid query parameter.")
    return value


def query_choice(name, choices, default=None):
    value = request.args.get(name) or default
    if value is not None and value not in choices:
        raise validation_error({name: f"must be one of: {', '.join(choices)}"}, "Invalid query parameter.")
    return value


def query_id_list(name, maximum=20):
    raw = request.args.get(name, "")
    if not raw.strip():
        return []
    try:
        ids = [int(part) for part in raw.split(",") if part.strip()]
    except ValueError:
        raise validation_error({name: "must be a comma-separated list of integers"}, "Invalid query parameter.") from None
    if len(ids) > maximum:
        raise validation_error({name: f"at most {maximum} IDs are allowed"}, "Invalid query parameter.")
    return list(dict.fromkeys(ids))
