import pytest
from sqlalchemy import func, select

from app import run_details
from app.extensions import db
from app.models import Experiment, Run
from app.run_service import find_inconsistencies
from app.seed import seed_database

API = "/api/v1"


# --- helpers / fixtures ------------------------------------------------------------

def create_researcher(client, name="Ada Example", email=None, team="NLP"):
    email = email or f"{name.lower().replace(' ', '.')}@example.org"
    response = client.post(f"{API}/researchers", json={"name": name, "email": email, "role": "Scientist", "team": team})
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


@pytest.fixture
def people(client):
    return [create_researcher(client, name) for name in ("Ada Example", "Bo Sample", "Cy Placeholder")]


@pytest.fixture
def experiment(client, people):
    response = client.post(f"{API}/experiments", json={
        "name": "Baseline classifier",
        "description": "Test experiment",
        "hypothesis": "It works",
        "status": "running",
        "owner_id": people[0]["id"],
        "member_ids": [people[1]["id"]],
        "tags": ["nlp", "baseline"],
        "start_date": "2026-03-01",
    })
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


def run_payload(**overrides):
    payload = {
        "name": "r01-baseline",
        "status": "completed",
        "started_at": "2026-03-02T10:00:00Z",
        "ended_at": "2026-03-02T11:30:00Z",
        "notes": "first try",
        "parameters": {"learning_rate": 0.001, "optimizer": "adamw", "use_amp": True},
        "metrics": {"accuracy": 0.91, "loss": 0.25, "sample_size": 5000, "f1_macro": 0.88},
        "logs": [{"level": "info", "message": "started"}],
    }
    payload.update(overrides)
    return payload


def create_run(client, experiment_id, **overrides):
    response = client.post(f"{API}/experiments/{experiment_id}/runs", json=run_payload(**overrides))
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


# --- health ---------------------------------------------------------------------------

def test_health_reports_both_databases(client):
    response = client.get(f"{API}/health")
    assert response.status_code == 200
    assert response.get_json()["data"]["checks"] == {"postgres": "ok", "mongodb": "ok"}


def test_unknown_route_returns_json_404(client):
    response = client.get(f"{API}/does-not-exist")
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


# --- researchers ------------------------------------------------------------------

def test_researcher_create_list_search_and_detail(client, people):
    response = client.get(f"{API}/researchers?q=bo&per_page=1")
    body = response.get_json()
    assert response.status_code == 200
    assert [r["name"] for r in body["data"]] == ["Bo Sample"]
    assert body["meta"]["total"] == 1

    detail = client.get(f"{API}/researchers/{people[0]['id']}").get_json()["data"]
    assert detail["owned_experiments"] == [] and detail["member_experiments"] == []


def test_researcher_validation_and_duplicate_email(client, people):
    bad = client.post(f"{API}/researchers", json={"name": "", "email": "nope", "role": "x", "team": "y"})
    assert bad.status_code == 400
    assert set(bad.get_json()["error"]["details"]) == {"name", "email"}

    duplicate = client.post(
        f"{API}/researchers", json={"name": "Copy", "email": people[0]["email"].upper(), "role": "x", "team": "y"}
    )
    assert duplicate.status_code == 409


def test_researcher_not_found(client):
    assert client.get(f"{API}/researchers/12345").status_code == 404


def test_pagination_bounds_are_validated(client):
    assert client.get(f"{API}/researchers?per_page=500").status_code == 400
    assert client.get(f"{API}/researchers?page=abc").status_code == 400


# --- experiments ----------------------------------------------------------------

def test_create_experiment_returns_owner_members_and_tags(experiment, people):
    assert experiment["owner"]["id"] == people[0]["id"]
    assert [m["id"] for m in experiment["members"]] == [people[1]["id"]]
    assert experiment["tags"] == ["nlp", "baseline"]
    assert experiment["run_count"] == 0 and experiment["latest_result"] is None


def test_owner_is_not_duplicated_as_member(client, people):
    response = client.post(f"{API}/experiments", json={
        "name": "Dup", "owner_id": people[0]["id"], "member_ids": [people[0]["id"], people[2]["id"]],
        "start_date": "2026-01-01",
    })
    assert [m["id"] for m in response.get_json()["data"]["members"]] == [people[2]["id"]]


@pytest.mark.parametrize("payload, field", [
    ({"start_date": "2026-01-05", "end_date": "2026-01-01"}, "body"),
    ({"owner_id": 9999}, "owner_id"),
    ({"member_ids": [9999]}, "member_ids"),
    ({"status": "paused"}, "status"),
    ({"tags": ["Not A Slug"]}, "tags"),
    ({"surprise": True}, "surprise"),
])
def test_experiment_validation_errors(client, people, payload, field):
    body = {"name": "X", "owner_id": people[0]["id"], "start_date": "2026-01-01", **payload}
    response = client.post(f"{API}/experiments", json=body)
    assert response.status_code == 400
    assert field in response.get_json()["error"]["details"]


def test_experiment_list_filters_search_and_sort(client, experiment, people):
    client.post(f"{API}/experiments", json={
        "name": "Archived thing", "status": "archived", "owner_id": people[2]["id"], "start_date": "2025-01-01",
        "tags": ["old"],
    })

    default = client.get(f"{API}/experiments").get_json()
    assert [e["name"] for e in default["data"]] == ["Baseline classifier"]  # archived hidden by default

    everything = client.get(f"{API}/experiments?status=all&sort=name").get_json()["data"]
    assert [e["name"] for e in everything] == ["Archived thing", "Baseline classifier"]

    assert client.get(f"{API}/experiments?q=classifier").get_json()["meta"]["total"] == 1
    assert client.get(f"{API}/experiments?status=all&tag=old").get_json()["data"][0]["name"] == "Archived thing"
    assert client.get(f"{API}/experiments?researcher_id={people[1]['id']}").get_json()["meta"]["total"] == 1
    assert client.get(f"{API}/experiments?sort=password").status_code == 400


def test_search_input_is_treated_as_data_not_sql(client, experiment):
    response = client.get(f"{API}/experiments", query_string={"q": "'; DROP TABLE experiments; --"})
    assert response.status_code == 200 and response.get_json()["data"] == []
    response = client.get(f"{API}/experiments", query_string={"q": "%"})
    assert response.get_json()["data"] == []  # LIKE wildcard is escaped
    assert client.get(f"{API}/experiments").get_json()["meta"]["total"] == 1


def test_update_experiment_partial_and_date_check(client, experiment, people):
    url = f"{API}/experiments/{experiment['id']}"
    response = client.put(url, json={"status": "completed", "end_date": "2026-04-01", "member_ids": [people[2]["id"]]})
    data = response.get_json()["data"]
    assert response.status_code == 200
    assert data["status"] == "completed" and data["end_date"] == "2026-04-01"
    assert [m["id"] for m in data["members"]] == [people[2]["id"]]
    assert data["name"] == "Baseline classifier"  # untouched

    bad = client.put(url, json={"end_date": "2025-01-01"})
    assert bad.status_code == 400 and "end_date" in bad.get_json()["error"]["details"]
    assert client.put(url, json={"name": None}).status_code == 400


def test_delete_archives_experiment(client, experiment):
    response = client.delete(f"{API}/experiments/{experiment['id']}")
    assert response.status_code == 200
    assert response.get_json()["data"]["status"] == "archived"
    assert client.get(f"{API}/experiments/{experiment['id']}").status_code == 200


def test_experiment_not_found(client):
    assert client.get(f"{API}/experiments/999").status_code == 404
    assert client.put(f"{API}/experiments/999", json={"name": "x"}).status_code == 404
    assert client.get(f"{API}/experiments/999/runs").status_code == 404


# --- runs ----------------------------------------------------------------------

def test_create_run_stores_metadata_in_postgres_and_details_in_mongo(app, client, experiment):
    run = create_run(client, experiment["id"])
    assert run["details_status"] == "ok"
    assert run["metrics"]["accuracy"] == 0.91
    assert run["metrics"]["duration_seconds"] == 5400.0  # filled from timestamps
    assert run["parameters"]["optimizer"] == "adamw"
    assert run["logs"][0]["message"] == "started" and run["logs"][0]["timestamp"]

    with app.app_context():
        stored = db.session.get(Run, run["id"])
        assert stored.name == "r01-baseline"
        doc = app.extensions["mongo_db"][run_details.COLLECTION].find_one({"_id": run["id"]})
        assert doc["metrics"]["f1_macro"] == 0.88
        assert "name" not in doc  # metadata is not duplicated in MongoDB


@pytest.mark.parametrize("overrides, field", [
    ({"ended_at": None}, "ended_at"),                                # completed without end time
    ({"status": "running"}, "ended_at"),                             # running with end time
    ({"ended_at": "2026-03-01T00:00:00Z"}, "ended_at"),              # ends before it starts
    ({"metrics": {"accuracy": 1.5}}, "metrics"),
    ({"metrics": {"loss": -1}}, "metrics"),
    ({"metrics": {"sample_size": 10.5}}, "metrics"),
    ({"metrics": {"bad name!": 1}}, "metrics"),
    ({"metrics": {"accuracy": "high"}}, "metrics.accuracy"),
    ({"parameters": {"lr": [1, 2]}}, "parameters.lr.bool"),
    ({"logs": [{"level": "loud", "message": "x"}]}, "logs.0.level"),
])
def test_run_validation_errors(client, experiment, overrides, field):
    response = client.post(f"{API}/experiments/{experiment['id']}/runs", json=run_payload(**overrides))
    assert response.status_code == 400, response.get_json()
    details = response.get_json()["error"]["details"]
    assert any(key.startswith(field) for key in details), details


def test_runs_cannot_be_added_to_archived_experiment(client, experiment):
    client.delete(f"{API}/experiments/{experiment['id']}")
    response = client.post(f"{API}/experiments/{experiment['id']}/runs", json=run_payload())
    assert response.status_code == 409


def test_list_runs_and_experiment_latest_result(client, experiment):
    create_run(client, experiment["id"], name="r01", metrics={"accuracy": 0.8})
    create_run(client, experiment["id"], name="r02", started_at="2026-03-03T10:00:00Z",
               ended_at="2026-03-03T12:00:00Z", metrics={"accuracy": 0.9, "custom_score": 7})
    create_run(client, experiment["id"], name="r03", status="running", started_at="2026-03-04T10:00:00Z",
               ended_at=None, metrics={})

    body = client.get(f"{API}/experiments/{experiment['id']}/runs").get_json()
    assert [r["name"] for r in body["data"]] == ["r03", "r02", "r01"]
    assert "logs" not in body["data"][0]  # list view leaves out logs
    assert body["data"][1]["metrics"]["custom_score"] == 7

    detail = client.get(f"{API}/experiments/{experiment['id']}").get_json()["data"]
    assert detail["run_count"] == 3
    assert detail["run_status_counts"] == {"running": 1, "completed": 2, "failed": 0}
    assert detail["latest_result"]["name"] == "r02"


def test_update_run_metadata_and_details(client, experiment):
    run = create_run(client, experiment["id"], status="running", ended_at=None, metrics={"loss": 0.5})
    response = client.put(f"{API}/runs/{run['id']}", json={
        "status": "completed",
        "ended_at": "2026-03-02T12:00:00Z",
        "metrics": {"loss": 0.2, "accuracy": 0.93},
        "notes": "converged",
    })
    data = response.get_json()["data"]
    assert response.status_code == 200
    assert data["status"] == "completed"
    assert data["metrics"] == {"loss": 0.2, "accuracy": 0.93, "duration_seconds": 7200.0}
    assert data["notes"] == "converged"
    assert data["parameters"]["optimizer"] == "adamw"  # untouched field kept

    invalid = client.put(f"{API}/runs/{run['id']}", json={"status": "running"})
    assert invalid.status_code == 400  # a run with ended_at cannot go back to running without clearing it
    assert client.put(f"{API}/runs/{run['id']}", json={"status": "running", "ended_at": None}).status_code == 200
    assert client.get(f"{API}/runs/424242").status_code == 404


# --- partial failure handling -----------------------------------------------------------

def _count_runs(app):
    with app.app_context():
        return db.session.scalar(select(func.count(Run.id)))


def test_create_run_rolls_back_postgres_when_mongo_fails(app, client, experiment, monkeypatch):
    def boom(*args, **kwargs):
        raise run_details.DetailsStoreError("mongo down")

    monkeypatch.setattr(run_details, "create", boom)
    response = client.post(f"{API}/experiments/{experiment['id']}/runs", json=run_payload())
    assert response.status_code == 503
    assert response.get_json()["error"]["code"] == "service_unavailable"
    assert _count_runs(app) == 0


def test_create_run_removes_mongo_doc_when_postgres_commit_fails(app, client, experiment, monkeypatch):
    def failing_commit():
        raise db.exc.OperationalError("COMMIT", {}, Exception("connection lost"))

    monkeypatch.setattr(db.session, "commit", failing_commit)
    response = client.post(f"{API}/experiments/{experiment['id']}/runs", json=run_payload())
    monkeypatch.undo()

    assert response.status_code == 503
    assert _count_runs(app) == 0
    with app.app_context():
        assert find_inconsistencies() == ([], [])


def test_update_run_leaves_postgres_unchanged_when_mongo_fails(app, client, experiment, monkeypatch):
    run = create_run(client, experiment["id"])

    def boom(*args, **kwargs):
        raise run_details.DetailsStoreError("mongo down")

    monkeypatch.setattr(run_details, "update", boom)
    response = client.put(f"{API}/runs/{run['id']}", json={"name": "renamed", "notes": "new"})
    monkeypatch.undo()

    assert response.status_code == 503
    after = client.get(f"{API}/runs/{run['id']}").get_json()["data"]
    assert after["name"] == "r01-baseline" and after["notes"] == "first try"


def test_update_run_restores_mongo_when_postgres_commit_fails(app, client, experiment, monkeypatch):
    run = create_run(client, experiment["id"])

    def failing_commit():
        raise db.exc.OperationalError("COMMIT", {}, Exception("connection lost"))

    monkeypatch.setattr(db.session, "commit", failing_commit)
    response = client.put(f"{API}/runs/{run['id']}", json={"name": "renamed", "metrics": {"accuracy": 0.1}})
    monkeypatch.undo()

    assert response.status_code == 503
    after = client.get(f"{API}/runs/{run['id']}").get_json()["data"]
    assert after["name"] == "r01-baseline"
    assert after["metrics"]["accuracy"] == 0.91


def test_reads_degrade_gracefully_when_mongo_is_down(client, experiment, monkeypatch):
    run = create_run(client, experiment["id"])

    def boom(*args, **kwargs):
        raise run_details.DetailsStoreError("mongo down")

    monkeypatch.setattr(run_details, "get_many", boom)
    monkeypatch.setattr(run_details, "get_details", boom)

    listing = client.get(f"{API}/experiments/{experiment['id']}/runs").get_json()
    assert listing["meta"]["details_available"] is False
    assert listing["data"][0]["details_status"] == "unavailable"

    single = client.get(f"{API}/runs/{run['id']}")
    assert single.status_code == 200 and single.get_json()["data"]["details_status"] == "unavailable"


def test_errors_do_not_leak_internals(client, monkeypatch):
    from app.api import researchers as researchers_module

    def explode(*args, **kwargs):
        raise RuntimeError("secret connection string postgresql://user:pw@host")

    monkeypatch.setattr(researchers_module, "_experiment_counts", explode)
    create_researcher(client)
    response = client.get(f"{API}/researchers")
    assert response.status_code == 500
    assert response.get_json() == {"error": {"code": "internal_error", "message": "An unexpected error occurred."}}


# --- dashboard ----------------------------------------------------------------------

def test_dashboard_summary_and_metric_comparison_with_seed_data(app, client):
    with app.app_context():
        counts = seed_database()
        assert find_inconsistencies() == ([], [])
        experiment_count = db.session.scalar(select(func.count(Experiment.id)))

    summary = client.get(f"{API}/dashboard/summary").get_json()["data"]
    assert summary["counts"]["total_experiments"] == experiment_count
    assert summary["counts"]["researchers"] == 12
    assert summary["counts"]["total_runs"] == counts["runs"]
    assert len(summary["recent_runs"]) == 8
    assert summary["recent_runs"][0]["experiment"]["name"]

    comparison = client.get(f"{API}/dashboard/metric-comparison").get_json()["data"]
    assert comparison["metric"] == "accuracy"
    assert 0 < len(comparison["experiments"]) <= 6
    assert all(row["best_value"] is not None for row in comparison["experiments"])

    loss = client.get(f"{API}/dashboard/metric-comparison?metric=loss").get_json()["data"]
    assert loss["lower_is_better"] is True
    assert all(row["best_value"] <= row["latest_value"] for row in loss["experiments"])

    assert client.get(f"{API}/dashboard/metric-comparison?experiment_ids=99999").status_code == 400
    assert client.get(f"{API}/dashboard/metric-comparison?metric=$where").status_code == 400
