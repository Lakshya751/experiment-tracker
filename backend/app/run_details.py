"""MongoDB storage for flexible run details.

Collection `run_details`, one document per run:

    {
      "_id": <runs.id from PostgreSQL>,
      "parameters": {"learning_rate": 0.001, "optimizer": "adamw", ...},
      "metrics": {"accuracy": 0.91, "loss": 0.23, "f1_macro": 0.88, ...},
      "logs": [{"timestamp": <datetime>, "level": "info", "message": "..."}],
      "notes": "free text",
      "updated_at": <datetime>
    }

PostgreSQL decides whether a run exists; MongoDB only stores what is too
flexible for fixed columns. Every function here raises DetailsStoreError when
MongoDB cannot be reached, so callers can roll back or degrade gracefully.
"""
import logging
from datetime import datetime, timezone

from pymongo.errors import PyMongoError

from app.mongo import get_mongo_db

logger = logging.getLogger(__name__)

COLLECTION = "run_details"
DETAIL_FIELDS = ("parameters", "metrics", "logs", "notes")


class DetailsStoreError(Exception):
    """MongoDB was unreachable or rejected the operation."""


def _collection():
    return get_mongo_db()[COLLECTION]


def _clean(doc):
    if doc is None:
        return None
    return {field: doc.get(field, default) for field, default in
            (("parameters", {}), ("metrics", {}), ("logs", []), ("notes", ""))}


def get_details(run_id):
    try:
        return _clean(_collection().find_one({"_id": run_id}))
    except PyMongoError as exc:
        logger.error("Failed to read run details for run %s: %s", run_id, exc)
        raise DetailsStoreError(str(exc)) from exc


def get_many(run_ids, include_logs=False):
    """Return {run_id: details} for the given IDs (missing documents are omitted)."""
    if not run_ids:
        return {}
    projection = None if include_logs else {"logs": 0}
    try:
        cursor = _collection().find({"_id": {"$in": list(run_ids)}}, projection)
        return {doc["_id"]: _clean(doc) for doc in cursor}
    except PyMongoError as exc:
        logger.error("Failed to read run details for %d runs: %s", len(run_ids), exc)
        raise DetailsStoreError(str(exc)) from exc


def create(run_id, details):
    document = {"_id": run_id, **{field: details[field] for field in DETAIL_FIELDS}}
    document["updated_at"] = datetime.now(timezone.utc)
    try:
        _collection().insert_one(document)
    except PyMongoError as exc:
        logger.error("Failed to create run details for run %s: %s", run_id, exc)
        raise DetailsStoreError(str(exc)) from exc


def update(run_id, changes):
    """Set the given top-level detail fields, creating the document if needed."""
    fields = {field: changes[field] for field in DETAIL_FIELDS if field in changes}
    fields["updated_at"] = datetime.now(timezone.utc)
    try:
        _collection().update_one({"_id": run_id}, {"$set": fields}, upsert=True)
    except PyMongoError as exc:
        logger.error("Failed to update run details for run %s: %s", run_id, exc)
        raise DetailsStoreError(str(exc)) from exc


def restore(run_id, previous):
    """Put back a previously read document (or delete it if there was none).

    Used to undo a MongoDB write when the matching PostgreSQL commit fails.
    Returns True on success; failures are logged, not raised, because this runs
    while another error is already being handled.
    """
    try:
        if previous is None:
            _collection().delete_one({"_id": run_id})
        else:
            _collection().replace_one(
                {"_id": run_id},
                {"_id": run_id, **previous, "updated_at": datetime.now(timezone.utc)},
                upsert=True,
            )
        return True
    except PyMongoError:
        logger.exception("Could not restore run details for run %s; run `flask check-consistency`", run_id)
        return False


def all_ids():
    try:
        return {doc["_id"] for doc in _collection().find({}, {"_id": 1})}
    except PyMongoError as exc:
        raise DetailsStoreError(str(exc)) from exc


def delete_many(run_ids):
    try:
        return _collection().delete_many({"_id": {"$in": list(run_ids)}}).deleted_count
    except PyMongoError as exc:
        raise DetailsStoreError(str(exc)) from exc


def drop_all():
    try:
        _collection().drop()
    except PyMongoError as exc:
        raise DetailsStoreError(str(exc)) from exc
