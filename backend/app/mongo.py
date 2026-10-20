"""MongoDB connection setup.

One MongoClient is created per app (it manages its own connection pool) and
the selected database handle is stored on `app.extensions`.
"""
from flask import current_app
from pymongo import MongoClient


def init_mongo(app):
    client = MongoClient(
        app.config["MONGO_URI"],
        serverSelectionTimeoutMS=app.config["MONGO_TIMEOUT_MS"],
        connectTimeoutMS=app.config["MONGO_TIMEOUT_MS"],
        tz_aware=True,
    )
    app.extensions["mongo_client"] = client
    app.extensions["mongo_db"] = client[app.config["MONGO_DB_NAME"]]


def get_mongo_db():
    return current_app.extensions["mongo_db"]
