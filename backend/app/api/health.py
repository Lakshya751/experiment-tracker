import logging

from sqlalchemy import text

from app.api import api_v1
from app.errors import ok
from app.extensions import db
from app.mongo import get_mongo_db

logger = logging.getLogger(__name__)


@api_v1.get("/health")
def health():
    """Report whether each database is reachable. Returns 503 if either is down."""
    checks = {}
    try:
        db.session.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception:
        logger.warning("Health check: PostgreSQL unreachable", exc_info=True)
        db.session.rollback()
        checks["postgres"] = "unavailable"
    try:
        get_mongo_db().command("ping")
        checks["mongodb"] = "ok"
    except Exception:
        logger.warning("Health check: MongoDB unreachable", exc_info=True)
        checks["mongodb"] = "unavailable"

    healthy = all(value == "ok" for value in checks.values())
    return ok({"status": "ok" if healthy else "degraded", "checks": checks}, 200 if healthy else 503)
