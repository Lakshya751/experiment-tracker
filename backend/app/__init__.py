"""Flask application factory."""
import logging
import time

from flask import Flask, request
from flask_cors import CORS

from app.config import Config
from app.errors import register_error_handlers
from app.extensions import db, migrate
from app.mongo import init_mongo
from app import models  # noqa: F401  (registers models for Flask-Migrate)


def configure_logging(level):
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    if not app.config["SQLALCHEMY_DATABASE_URI"]:
        raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    configure_logging(app.config["LOG_LEVEL"])
    app.json.sort_keys = False

    db.init_app(app)
    migrate.init_app(app, db)
    init_mongo(app)
    # Only the API is exposed cross-origin, and only to the configured dev origins.
    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})

    from app.api import api_v1

    app.register_blueprint(api_v1)
    register_error_handlers(app)

    from app.seed import register_commands

    register_commands(app)

    request_logger = logging.getLogger("app.request")

    @app.before_request
    def start_timer():
        request.environ["app.start_time"] = time.perf_counter()

    @app.after_request
    def log_request(response):
        started = request.environ.get("app.start_time")
        elapsed_ms = (time.perf_counter() - started) * 1000 if started else 0
        request_logger.info("%s %s -> %s (%.1f ms)", request.method, request.path, response.status_code, elapsed_ms)
        return response

    return app
