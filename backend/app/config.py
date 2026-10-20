"""Configuration loaded from environment variables.

Secrets and database URLs are never hard-coded: they come from the process
environment, which `python-dotenv` fills from the repository-level `.env` file
during local development.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")


def _split_csv(value):
    return [item.strip() for item in value.split(",") if item.strip()]


class Config:
    APP_ENV = os.getenv("APP_ENV", "development")
    SECRET_KEY = os.getenv("SECRET_KEY")
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "experiment_tracker")
    # Fail fast when MongoDB is unreachable instead of hanging a request for 30s.
    MONGO_TIMEOUT_MS = int(os.getenv("MONGO_TIMEOUT_MS", "3000"))
    CORS_ORIGINS = _split_csv(os.getenv("CORS_ORIGINS", "http://localhost:5173"))
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    JSON_SORT_KEYS = False
    TESTING = False


class TestingConfig(Config):
    TESTING = True
    APP_ENV = "test"
    SECRET_KEY = "test-secret"
    SQLALCHEMY_DATABASE_URI = os.getenv("TEST_DATABASE_URL")
    MONGO_DB_NAME = os.getenv("TEST_MONGO_DB_NAME", "experiment_tracker_test")
    LOG_LEVEL = "WARNING"
