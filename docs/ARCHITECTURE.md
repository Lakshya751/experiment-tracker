# Architecture

## Overview

```
┌──────────────────────┐   /api/v1 (JSON over HTTP)   ┌────────────────────────────┐
│  React + Vite (5173) │ ───────────────────────────▶ │  Flask API (5001)          │
│  pages, charts, forms│ ◀─────────────────────────── │  blueprints → run_service  │
└──────────────────────┘                              └──────┬──────────────┬──────┘
                                                             │ SQLAlchemy   │ PyMongo
                                                             ▼              ▼
                                              ┌───────────────────┐  ┌────────────────────┐
                                              │ PostgreSQL (5433) │  │ MongoDB (27017)    │
                                              │ researchers       │  │ run_details        │
                                              │ experiments       │  │  _id = runs.id     │
                                              │ experiment_       │  │  parameters        │
                                              │   researchers     │  │  metrics           │
                                              │ runs (metadata)   │  │  logs, notes       │
                                              └───────────────────┘  └────────────────────┘
```

During development the Vite dev server proxies `/api` to Flask, so the browser
only talks to one origin. CORS is also configured (`CORS_ORIGINS`) for clients
that call the API directly.

## What lives where

| Data | Store | Why |
|---|---|---|
| Researchers (name, email, role, team) | PostgreSQL `researchers` | Fixed shape, unique email constraint, joined to experiments |
| Experiments (name, description, hypothesis, status, owner, tags, dates) | PostgreSQL `experiments` | Fixed shape; filtering, sorting, and pagination are SQL queries; check constraints guard status and date order |
| Team membership | PostgreSQL `experiment_researchers` | Many-to-many association with a composite primary key |
| Run metadata (experiment, name, status, started/ended timestamps) | PostgreSQL `runs` | Needed for listing, sorting, counting, and dashboard queries; foreign key to the experiment |
| Run parameters, metrics, logs, notes | MongoDB `run_details` | Different experiments track different parameters and metrics (e.g. `f1_macro`, `mean_reward`, `latency_p95_ms`); a document avoids a sparse table or an entity-attribute-value schema |

Nothing is stored in both databases. The only shared value is the run ID:
a MongoDB document's `_id` **is** `runs.id`. PostgreSQL is the source of truth
for *whether a run exists*; MongoDB holds only the flexible details.

Example document:

```json
{
  "_id": 42,
  "parameters": {"learning_rate": 0.0003, "batch_size": 64, "optimizer": "adamw"},
  "metrics": {"accuracy": 0.912, "loss": 0.231, "duration_seconds": 5400, "sample_size": 25000, "f1_macro": 0.88},
  "logs": [{"timestamp": "2026-07-18T04:17:00Z", "level": "info", "message": "Run started"}],
  "notes": "Weight decay chosen from the previous sweep.",
  "updated_at": "2026-07-18T05:45:00Z"
}
```

## Writing across two databases

There is no transaction that spans PostgreSQL and MongoDB, so
`backend/app/run_service.py` uses a fixed order of steps with explicit undo:

**Create run**
1. `INSERT` into `runs` and flush. PostgreSQL assigns an ID, but nothing is committed yet.
2. Insert the MongoDB document with that ID.
   *If MongoDB fails:* roll back PostgreSQL and return `503`. Nothing was saved.
3. `COMMIT` PostgreSQL.
   *If the commit fails:* delete the MongoDB document (compensation) and return `503`.

**Update run**
1. Read the current MongoDB document and keep it as an undo snapshot.
2. Apply metadata changes in PostgreSQL and flush (not committed).
3. Write the changed detail fields to MongoDB.
   *If MongoDB fails:* roll back PostgreSQL. Nothing changed.
4. `COMMIT` PostgreSQL.
   *If the commit fails:* restore the snapshot in MongoDB.

**Reads** never fail because of MongoDB. If it is unreachable, run metadata is
still returned with `"details_status": "unavailable"`, and the UI shows a
warning instead of metrics. A run with no document at all reports
`"details_status": "missing"`.

### Consistency limitations (and why they are acceptable here)

- **Double failure.** If PostgreSQL's commit fails *and* MongoDB is also down,
  so that the compensation fails too, an orphaned MongoDB document can remain.
  PostgreSQL sequences never reuse IDs, so an orphan can never become attached
  to a different run. `flask check-consistency` lists orphans and
  `--delete-orphans` removes them.
- **Concurrent edits.** Two simultaneous updates to the same run are
  last-write-wins, and an undo snapshot could overwrite a concurrent change
  made in between. A production system would add optimistic locking (a version
  column checked on update) or move to an outbox or event-based design.
- **Not atomic for readers.** For a few milliseconds during a write, a reader
  can see new metadata with old details. For a team dashboard this is harmless.
- **Archiving, not deleting.** `DELETE /experiments/:id` archives the
  experiment. Runs are never hard-deleted through the API, which avoids a
  second cross-database delete path.

## Backend layout

```
backend/app/
  __init__.py      app factory: config, logging, CORS, blueprints, CLI
  config.py        settings from environment variables (.env in development)
  models.py        SQLAlchemy models + check constraints
  run_details.py   MongoDB collection access (raises DetailsStoreError)
  run_service.py   cross-database create/update/read logic
  validation.py    Pydantic request models + query-param helpers
  errors.py        JSON envelope and error handlers (no stack traces to clients)
  api/             route modules: researchers, experiments, runs, dashboard, health
  seed.py          deterministic demo-data generator
  cli.py           `flask seed`, `flask check-consistency`
```

## Security notes

- All SQL goes through SQLAlchemy expressions with bound parameters. Sort
  fields come from a whitelist, and `LIKE` wildcards in search input are escaped.
- MongoDB queries only ever use integer IDs from PostgreSQL; user-supplied
  metric and parameter *names* are validated against `^[A-Za-z][A-Za-z0-9_]{0,49}$`
  before they become document keys.
- Request bodies are validated with Pydantic, and unknown fields are rejected.
- Unhandled exceptions are logged server-side; clients get a generic message.
- **There is no authentication.** This is a local demo. Database ports are
  bound to `127.0.0.1` in Docker Compose.
