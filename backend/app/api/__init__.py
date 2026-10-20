from flask import Blueprint

api_v1 = Blueprint("api_v1", __name__, url_prefix="/api/v1")

# Route modules register themselves on the blueprint when imported.
from app.api import dashboard, experiments, health, researchers, runs  # noqa: E402,F401
