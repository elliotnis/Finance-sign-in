# Sign-up system

Web app (Vite + React) and API (FastAPI). Data is stored in **MongoDB** (local via Docker Compose, or [MongoDB Atlas](https://www.mongodb.com/atlas) / any MongoDB deployment).

---

## Prerequisites

- **MongoDB** reachable from the API (included in Docker Compose), *or* **Node 20+** and **Python 3.12+** for local dev.

---

## Environment variables

**Docker (repo root):** copy [`.env.docker.example`](.env.docker.example) to `.env` and adjust if needed:

| Variable | Required | Notes |
|----------|----------|--------|
| `MONGODB_URL` | No (has default) | Default in Compose: `mongodb://mongo:27017` (the `mongo` service). Override for Atlas or another host. |
| `VITE_API_URL` | No | API base URL **as the browser sees it** (default `http://localhost:8000`). |
| `FRONTEND_PORT` | No | Host port for the web UI (default `8080`). |
| `CORS_ORIGINS` | No | Comma-separated origins. If **unset**, the API allows `http://localhost:5173`, `http://localhost:8080`, and a few defaults—see `backend/main.py`. |

**Local backend only:** copy [`backend/.env.example`](backend/.env.example) to `backend/.env` and set `MONGODB_URL` (e.g. `mongodb://localhost:27017` or your Atlas URI).

The frontend calls the API using `VITE_API_URL` (defaults to `http://localhost:8000` in code if unset). For `npm run dev`, that matches the backend on port **8000**.

---

## Launch: Docker Compose (recommended)

From the **repository root**:

```bash
docker compose up --build
```

This starts **MongoDB**, the **API**, and the **frontend** (nginx serving the built Vite app). Data is persisted in the `mongo_data` volume.

| Service | URL |
|--------|-----|
| Web app | [http://localhost:8080](http://localhost:8080) — override host port with `FRONTEND_PORT` in `.env` |
| API + Swagger | [http://localhost:8000](http://localhost:8000) |
| Health | [http://localhost:8000/_health](http://localhost:8000/_health) |

Stop: `Ctrl+C` or `docker compose down`.

If the UI is opened from another host/port, set `VITE_API_URL` to the API base URL the **browser** must use, and add that UI origin via `CORS_ORIGINS` on the backend if needed.

---

## Launch: local (no Docker)

Run **MongoDB** yourself (local install or Atlas), then use **two terminals**.

**Terminal 1 — backend**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r app/requirements.txt
export PYTHONPATH=.
# Set MONGODB_URL, e.g. in backend/.env:
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
