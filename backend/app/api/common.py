"""Helpers shared by the API route modules."""
from app.extensions import db
from app.validation import query_int, validation_error

MAX_PER_PAGE = 100


def paginate(statement, default_per_page=20):
    """Run a SELECT with page/per_page query params. Returns (items, meta)."""
    page = query_int("page", 1)
    per_page = query_int("per_page", default_per_page, maximum=MAX_PER_PAGE)
    result = db.paginate(statement, page=page, per_page=per_page, error_out=False, count=True)
    meta = {"page": page, "per_page": per_page, "total": result.total, "pages": result.pages}
    return result.items, meta


def apply_sort(statement, sort_value, columns, default):
    """Order by a whitelisted column; a leading '-' means descending.

    Only names in `columns` are accepted, so user input never reaches SQL directly.
    """
    sort_value = sort_value or default
    descending = sort_value.startswith("-")
    key = sort_value.lstrip("-")
    if key not in columns:
        allowed = ", ".join(sorted(columns))
        raise validation_error({"sort": f"must be one of: {allowed} (prefix with '-' for descending)"},
                               "Invalid query parameter.")
    column = columns[key]
    return statement.order_by(column.desc() if descending else column.asc())


def like_pattern(term):
    """Escape LIKE wildcards so a search for '50%' matches literally."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
