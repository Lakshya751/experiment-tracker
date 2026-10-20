# Experiment Tracker

A full-stack experiment tracking platform for research teams (Flask + PostgreSQL + MongoDB + React).

> Work in progress. Full documentation is added in a later milestone.

## Quick start

```bash
cp .env.example .env            # then replace the placeholder password/secret
docker compose up -d            # PostgreSQL on :5433, MongoDB on :27017

cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
flask run                       # API on http://localhost:5001

cd ../frontend
npm install
npm run dev                     # UI on http://localhost:5173
```

Health check: `curl http://localhost:5001/api/v1/health`
