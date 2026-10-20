"""Shared fixtures.

Tests run against the real PostgreSQL and MongoDB containers, but use separate
databases (TEST_DATABASE_URL / TEST_MONGO_DB_NAME) so demo data is untouched.
The Postgres schema is built by running the real Alembic migrations.
"""
import pytest
from flask_migrate import upgrade
from sqlalchemy import text

from app import create_app
from app.config import TestingConfig
from app.extensions import db


@pytest.fixture(scope="session")
def app():
    if not TestingConfig.SQLALCHEMY_DATABASE_URI:
        pytest.exit("TEST_DATABASE_URL is not set. Copy .env.example to .env first.")
    app = create_app(TestingConfig)
    with app.app_context():
        # Start each test session from an empty schema, then apply migrations.
        db.session.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
        db.session.commit()
        upgrade()
    yield app


@pytest.fixture(autouse=True)
def clean_databases(app):
    yield
    with app.app_context():
        db.session.rollback()
        db.session.execute(
            text("TRUNCATE runs, experiment_researchers, experiments, researchers RESTART IDENTITY CASCADE")
        )
        db.session.commit()
        app.extensions["mongo_db"].client.drop_database(app.config["MONGO_DB_NAME"])


@pytest.fixture
def client(app):
    return app.test_client()
