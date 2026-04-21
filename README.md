# Sign-up system

Web app (Vite + React) and API (FastAPI). Data lives in **Supabase (PostgreSQL)**; the backend uses the Supabase REST API via the official Python client.

---

## Prerequisites

- **Supabase project** with tables created (see below).
- **Docker Compose** (for the containerized stack), *or* **Node 20+** and **Python 3.12+** for local dev.

---

## One-time setup

### 1. Create database tables

In the [Supabase SQL Editor](https://supabase.com/dashboard), run:

[`supabase/migrations/20260421120000_sign_up_system_schema.sql`](supabase/migrations/20260421120000_sign_up_system_schema.sql)

(Or apply the same file with the [Supabase CLI](https://supabase.com/docs/guides/cli) if you use it.)

### 2. Configure environment variables

**Docker (repo root):** copy [`.env.docker.example`](.env.docker.example) to `.env` and fill in:

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Publishable / anon key (Dashboard → **Settings → API**) |
| `SUPABASE_SERVICE_ROLE_KEY` | Strongly recommended | Service role secret; avoids RLS blocking the API |
| `VITE_API_URL` | No | API URL **as the browser sees it** (default `http://localhost:8000`) |
| `FRONTEND_PORT` | No | Host port for the web UI (default `8080`) |
| `CORS_ORIGINS` | No | Comma-separated origins. If **unset**, the API allows `http://localhost:5173`, `http://localhost:8080`, and a few defaults—see `backend/main.py`. |

**Local backend only:** use [`backend/.env.example`](backend/.env.example) as `backend/.env` with the same Supabase variables.

The frontend calls the API using `VITE_API_URL` (defaults to `http://localhost:8000` in code if unset). For `npm run dev`, that matches the backend on port **8000**.

---

## Launch: Docker Compose (recommended)

From the **repository root** (after `.env` exists with Supabase keys):

```bash
docker compose up --build
```

| Service | URL |
|--------|-----|
| Web app | [http://localhost:8080](http://localhost:8080) — use `FRONTEND_PORT` in `.env` to change the host port |
| API + Swagger | [http://localhost:8000](http://localhost:8000) |
| Health | [http://localhost:8000/_health](http://localhost:8000/_health) |

Stop: `Ctrl+C` or `docker compose down`.

If the UI is opened from another host/port, set `VITE_API_URL` to the API base URL the **browser** must use, and add that UI origin via `CORS_ORIGINS` on the backend if needed.

---

## Launch: local (no Docker)

Use **two terminals**.

**Terminal 1 — backend**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r app/requirements.txt
export PYTHONPATH=.
# Load Supabase vars, e.g. from backend/.env:
#   set -a && source .env && set +a
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — frontend**

```bash
cd frontend
npm ci
npm run dev
```

| Service | URL |
|--------|-----|
| Web app (Vite) | [http://localhost:5173](http://localhost:5173) |
| API | [http://localhost:8000](http://localhost:8000) |

Optional: create `frontend/.env` with `VITE_API_URL=http://localhost:8000` if you need a non-default API URL.

---

## Verify (optional, before push)

From the repo root:

```bash
cd frontend && npm ci && npm run build && npm run lint
```

Optional — after you add tests under `backend/tests/`:

```bash
cd backend && source .venv/bin/activate && pip install -r app/requirements.txt
export PYTHONPATH=.
python -m pytest tests -q --tb=short
```

---

## History

Earlier versions used MongoDB; the app now uses Supabase only.
