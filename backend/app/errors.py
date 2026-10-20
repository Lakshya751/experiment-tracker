"""Consistent JSON responses and error handling.

Success:  {"data": ..., "meta": {...}}           (meta only on paginated lists)
Error:    {"error": {"code": "...", "message": "...", "details": {...}}}

Unexpected exceptions are logged with a stack trace on the server but the
client only receives a generic message.
"""
import logging

from flask import jsonify
from werkzeug.exceptions import HTTPException

logger = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


class NotFound(ApiError):
    def __init__(self, resource, resource_id):
        super().__init__(404, "not_found", f"{resource} {resource_id} was not found.")


class Conflict(ApiError):
    def __init__(self, message, details=None):
        super().__init__(409, "conflict", message, details)


class ServiceUnavailable(ApiError):
    def __init__(self, message):
        super().__init__(503, "service_unavailable", message)


def ok(data, status=200, meta=None):
    body = {"data": data}
    if meta is not None:
        body["meta"] = meta
    return jsonify(body), status


def error_response(status, code, message, details=None):
    body = {"code": code, "message": message}
    if details:
        body["details"] = details
    return jsonify({"error": body}), status


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def handle_api_error(err):
        return error_response(err.status, err.code, err.message, err.details)

    @app.errorhandler(HTTPException)
    def handle_http_error(err):
        code = (err.name or "error").lower().replace(" ", "_")
        return error_response(err.code, code, err.description)

    @app.errorhandler(Exception)
    def handle_unexpected(err):
        logger.exception("Unhandled error")
        return error_response(500, "internal_error", "An unexpected error occurred.")
