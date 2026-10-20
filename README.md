# Experiment Tracker

A full-stack web app where a research team can create experiments, assign
researchers, log experiment runs with flexible metrics, and compare results.

- **Backend:** Python, Flask, SQLAlchemy, Flask-Migrate, Pydantic
- **Databases:** PostgreSQL (structured data) + MongoDB (flexible run details)
- **Frontend:** React 19 + Vite, React Router, Recharts
- **Tests:** Pytest (backend, against real databases) and Vitest + Testing Library (frontend)

> **Local demo — no login.** There is no authentication or authorization.
> Anyone who can reach the API can read and change data. Do not deploy it publicly as-is.

## Features

- **Dashboard:** experiment and researcher counts, recent runs, and a chart
  comparing the best and latest value of any metric across selected experiments
  (with a data-table view).
- **Experiments:** search, filter by status, tag, or owner, sort, and paginate.
  Create, edit, and archive experiments. The detail page shows the latest result,
  a metric trend chart, and run history.
- **Runs:** log runs with status, timestamps, notes, parameters, standard metrics
  (accuracy, loss, duration, sample size), custom metrics, and logs. Edit runs and
  compare 2–5 runs side by side, with the best value highlighted.
- **Researchers:** searchable directory with team filter, an add form, and a
  detail page listing owned and member experiments.
- **Demo data:** 12 fictional researchers, 32 experiments across 6 teams, and
  ~125 runs with realistic metrics.

## Architecture

PostgreSQL stores researchers, experiments, team membership, and run metadata.
MongoDB stores each run's parameters, metrics, logs, and notes in one document
whose `_id` equals the PostgreSQL run ID. Nothing is duplicated between them.
Run writes follow a fixed order with rollback and compensation so a failure in
either database does not leave half-saved runs.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the diagram, data
placement, write ordering, and consistency limitations.

```
experiment-tracker/
├── docker-compose.yml       PostgreSQL + MongoDB for local development
├── .env.example             environment variables (placeholders only)
├── docker/postgres-init/    creates the separate test database
├── docs/ARCHITECTURE.md
├── backend/                 Flask API (app/, migrations/, tests/)
└── frontend/                React app (src/api, components, charts, hooks, pages, utils)
```

## Prerequisites

- Docker Desktop (or Docker Engine) with Docker Compose v2
- Python 3.11+ (developed with 3.13)
- Node.js 20+ (developed with 22)

## Setup from a fresh checkout

```bash
git clone <your-repo-url> experiment-tracker
cd experiment-tracker

# 1. Environment: copy the template and set a real password and secret key
cp .env.example .env
#    edit .env: replace every "change-me" (in POSTGRES_PASSWORD *and* both
#    database URLs) and the SECRET_KEY placeholder

# 2. Databases
docker compose up -d
docker compose ps            # wait until both services show "healthy"

# 3. Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
flask db upgrade             # create tables via migrations
flask seed                   # load demo data
flask run                    # http://localhost:5001  (settings in backend/.flaskenv)

# 4. Frontend (new terminal)
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

Open http://localhost:5173. To check the API directly, run
`curl http://localhost:5001/api/v1/health`.

## Environment variables

All variables live in the repository-level `.env` (git-ignored). The backend
loads it automatically, and Docker Compose reads it for the database containers.

| Variable | Used by | Purpose |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Docker Compose | Credentials for the Postgres container |
| `POSTGRES_PORT`, `MONGO_PORT` | Docker Compose | Host ports (default 5433 and 27017) |
| `DATABASE_URL` | Flask | SQLAlchemy URL for the app database |
| `TEST_DATABASE_URL` | Pytest | Separate database used by the tests |
| `MONGO_URI`, `MONGO_DB_NAME`, `TEST_MONGO_DB_NAME` | Flask / Pytest | MongoDB connection and database names |
| `SECRET_KEY` | Flask | Flask secret (set a long random value) |
| `APP_ENV` | Flask | `development`, `test`, or `production` (seeding is refused in production) |
| `LOG_LEVEL` | Flask | Python logging level, e.g. `INFO` |
| `CORS_ORIGINS` | Flask | Comma-separated browser origins allowed to call the API |
| `VITE_API_PROXY_TARGET` | Vite (optional) | Where the dev server proxies `/api` (default `http://127.0.0.1:5001`) |

## Database migrations

Run these from `backend/` with the virtualenv active:

```bash
flask db upgrade                       # apply all migrations
flask db migrate -m "describe change"  # after editing app/models.py, generate a migration
flask db downgrade                     # roll back the last migration
```

Migrations live in `backend/migrations/versions/`. Always review an
auto-generated migration before applying it.

## Seeding demo data

```bash
flask seed                  # only works on an empty database
flask seed --reset          # wipes researchers/experiments/runs (both DBs) after a confirmation prompt
flask seed --reset --yes    # same, without the prompt
flask check-consistency     # report runs and MongoDB documents that don't match
```

The seed is deterministic (fixed random seed), so everyone gets the same data;
only dates shift so the data looks recent. It refuses to run when
`APP_ENV=production`. All people are fictional and use `@example.org` emails.

## Running tests

```bash
# Backend: needs `docker compose up -d`; uses the *_test databases, never your demo data
cd backend && source .venv/bin/activate && pytest

# Frontend: no backend needed (fetch is mocked)
cd frontend && npm test
```

The backend tests cover validation, filtering, pagination, SQL-injection-style
input, error responses, and the partial-failure paths (MongoDB down during a
create or update, and a PostgreSQL commit failing after the MongoDB write). The
frontend tests cover form validation, metric helpers, shared components, and
page loading, empty, and error states.

## API reference

All endpoints are under `/api/v1`. Success responses are `{"data": ...}`, plus
`"meta"` for paginated lists. Errors are
`{"error": {"code", "message", "details?"}}`.

| Method & path | Description |
|---|---|
| `GET /health` | Database connectivity (`503` if either is down) |
| `GET /researchers` | List. Params: `q`, `team`, `sort`, `page`, `per_page` (≤100) |
| `POST /researchers` | Create (`409` if the email exists) |
| `GET /researchers/:id` | Detail with owned and member experiments |
| `GET /experiments` | List. Params: `q`, `status` (`draft`, `running`, `completed`, `archived`, `all`; default hides archived), `tag`, `owner_id`, `researcher_id`, `sort` (`name`, `status`, `start_date`, `created_at`, `updated_at`; prefix `-` for descending), `page`, `per_page` |
| `POST /experiments` | Create |
| `GET /experiments/:id` | Detail with run counts and latest completed run |
| `PUT /experiments/:id` | Update (only the fields sent are changed) |
| `DELETE /experiments/:id` | Archive (soft delete) |
| `GET /experiments/tags` | All tags in use |
| `GET /experiments/:id/runs` | Runs with metrics and parameters. Params: `status`, `sort`, `page`, `per_page` |
| `POST /experiments/:id/runs` | Create a run (`409` if the experiment is archived) |
| `GET /runs/:id` | Run with full details, including logs |
| `PUT /runs/:id` | Update (only the fields sent are changed; detail fields replace the stored value) |
| `GET /dashboard/summary` | Counts and recent runs |
| `GET /dashboard/metric-comparison` | Best and latest value of `metric` for `experiment_ids` |

Example:

```bash
curl -X POST http://localhost:5001/api/v1/experiments/1/runs \
  -H 'Content-Type: application/json' \
  -d '{"name": "r09-lower-lr", "status": "completed",
       "started_at": "2026-10-01T09:00:00Z", "ended_at": "2026-10-01T10:30:00Z",
       "parameters": {"learning_rate": 0.0001, "optimizer": "adamw"},
       "metrics": {"accuracy": 0.912, "loss": 0.24, "f1_macro": 0.88}}'
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `port is already allocated` on `docker compose up` | Another service uses 5433 or 27017. Change `POSTGRES_PORT` or `MONGO_PORT` in `.env`, and update `DATABASE_URL`, `TEST_DATABASE_URL`, and `MONGO_URI` to match. |
| `Address already in use` for port 5001 | Another process is on 5001. Run `flask run --port 5002` and start the frontend with `VITE_API_PROXY_TARGET=http://127.0.0.1:5002 npm run dev`. (Port 5000 is avoided because macOS AirPlay uses it.) |
| `DATABASE_URL is not set` | `.env` is missing. Copy `.env.example` to `.env` in the repository root. |
| `password authentication failed` | The password in `DATABASE_URL` doesn't match `POSTGRES_PASSWORD`. The container keeps the password from its first start; to reset it, run `docker compose down -v` (deletes local data) and then `docker compose up -d`. |
| Tests fail with `database "experiment_tracker_test" does not exist` | The test database is created only when the volume is first initialized. Run `docker compose exec postgres createdb -U <POSTGRES_USER> experiment_tracker_test`. |
| UI says "Cannot reach the API server" | Start Flask (`flask run` in `backend/`) and check `curl localhost:5001/api/v1/health`. |
| Run pages show "MongoDB unreachable" | Start MongoDB with `docker compose up -d mongo`. Metadata still works while it's down; editing details is disabled until it's back. |
| `Database already contains … researchers` when seeding | This is expected. Use `flask seed --reset` to replace the demo data. |

## Limitations

- No authentication, user accounts, or permissions (local demo only).
- No real-time updates. Pages refresh when you navigate or retry.
- Cross-database writes are ordered with compensation, not truly atomic;
  concurrent edits to the same run are last-write-wins
  (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#consistency-limitations-and-why-they-are-acceptable-here)).
- Run lists load up to 100 runs per page; the trend chart and comparison work on the loaded page.
- Experiments are archived, never hard-deleted, through the UI or API.
- Researchers can be created but not edited or removed through the UI.
- The light theme only; no dark mode.
