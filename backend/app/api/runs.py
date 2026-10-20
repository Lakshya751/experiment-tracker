from app.api import api_v1
from app.errors import NotFound, ok
from app.extensions import db
from app.models import Run
from app.run_service import get_run_with_details, update_run
from app.validation import RunUpdate, parse_body


def _run_or_404(run_id):
    run = db.session.get(Run, run_id)
    if run is None:
        raise NotFound("Run", run_id)
    return run


@api_v1.get("/runs/<int:run_id>")
def get_run(run_id):
    return ok(get_run_with_details(_run_or_404(run_id)))


@api_v1.put("/runs/<int:run_id>")
def put_run(run_id):
    """Update a run. Only fields present in the body change; detail fields replace stored values."""
    run = _run_or_404(run_id)
    payload = parse_body(RunUpdate)
    update_run(run, payload)
    return ok(get_run_with_details(run))
