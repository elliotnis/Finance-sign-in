# Sign-up system

Web app (Vite + React) and API (FastAPI). Data is stored in **MongoDB** through the Docker Compose database service.

---

## Prerequisites

- **Docker Compose** for the full app stack, *or* **Node 20+** and **Python 3.12+** for local frontend/backend development.

---

## Environment variables

**Docker (repo root):** copy [`.env.docker.example`](.env.docker.example) to `.env` and adjust if needed:

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_API_URL` | No | API base URL **as the browser sees it** (default `http://localhost:8000`). |
| `FRONTEND_PORT` | No | Host port for the web UI (default `8080`). |
| `TRADING_SIM_PORT` | No | Host port for the dedicated Youth Financetopia frontend (default `4173`). |
| `CORS_ORIGINS` | No | Comma-separated origins. If **unset**, the API allows `http://localhost:5173`, `http://localhost:8080`, and a few defaults—see `backend/main.py`. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Yes for magic-link login | Gmail SMTP credentials. `SMTP_PASSWORD` must be a [Gmail App Password](https://myaccount.google.com/apppasswords), **not** your normal password. |
| `FRONTEND_URL` | Yes for magic-link login | Public URL of the frontend (e.g. `http://localhost:8080`). Used to build the link inside the email. |
| `MAGIC_LINK_TTL_MINUTES` | No (default 15) | Minutes before a magic-link token expires. |
| `MAGIC_LINK_REQUEST_COOLDOWN_SECONDS` | No (default 60) | Minimum delay between sign-in code requests for the same email and access scope, clamped to 15-300 seconds. |
| `TRADING_SESSION_TTL_HOURS` | No (default 12) | Lifetime of the challenge's server-issued bearer session, clamped to 1-72 hours. |
| `ADMIN_EMAILS` | Yes for admin tools | Comma-separated normal-portal admin emails. These accounts can use classes and data tools. |
| `GAMEMASTER_EMAILS` | Yes for the challenge control room | Comma-separated Youth Financetopia gamemaster emails. This role is separate from `ADMIN_EMAILS`. |

**Local backend only:** copy [`backend/.env.example`](backend/.env.example) to `backend/.env` and run the database service with Docker Compose. The same `SMTP_*`, `FRONTEND_URL`, `MAGIC_LINK_TTL_MINUTES`, `MAGIC_LINK_REQUEST_COOLDOWN_SECONDS`, `TRADING_SESSION_TTL_HOURS`, `ADMIN_EMAILS`, and `GAMEMASTER_EMAILS` variables apply for non-Docker dev.

### Setting up Gmail SMTP (one-time)

1. Sign in to a Gmail account and turn on 2-step verification.
2. Create an App Password at <https://myaccount.google.com/apppasswords> (16-char string).
3. Set:

   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-gmail@gmail.com
   SMTP_PASSWORD=the-16-char-app-password
   SMTP_FROM=HKUST FINA Portal <your-gmail@gmail.com>
   FRONTEND_URL=http://localhost:8080   # or your Vercel URL in prod
   ```

The frontend calls the API using `VITE_API_URL` (defaults to `http://localhost:8000` in code if unset). For `npm run dev`, that matches the backend on port **8000**.

---

## Launch: Docker Compose (recommended)

From the **repository root**:

```bash
docker compose up --build
```

This starts **MongoDB**, the **API**, the normal sign-up frontend, and a dedicated Youth Financetopia frontend. Data is persisted in the `mongo_data` volume.

| Service | URL |
|--------|-----|
| Web app | [http://localhost:8080](http://localhost:8080) — override host port with `FRONTEND_PORT` in `.env` |
| Youth Financetopia Challenge (participants) | [http://localhost:4173/youth-financetopia](http://localhost:4173/youth-financetopia) — override host port with `TRADING_SIM_PORT` |
| Youth Financetopia Gamemaster Console | [http://localhost:4173/youth-financetopia/gamemaster](http://localhost:4173/youth-financetopia/gamemaster) |
| API + Swagger | [http://localhost:8000](http://localhost:8000) |
| Health | [http://localhost:8000/_health](http://localhost:8000/_health) |

Stop: `Ctrl+C` or `docker compose down`.

If the UI is opened from another host/port, set `VITE_API_URL` to the API base URL the **browser** must use, and add that UI origin via `CORS_ORIGINS` on the backend if needed.

For VPS deployment with MongoDB hosted on the VPS, use the included Compose database service. To migrate existing hosted data into the VPS Docker volume, see [docs/migrate-atlas-to-vps-mongo.md](docs/migrate-atlas-to-vps-mongo.md).

To split the HKUST sign-up portal and Youth Financetopia Challenge onto separate public domains, see [docs/domain-separation-drupal.md](docs/domain-separation-drupal.md).
Their access lists are separate: use `Allowed Emails` for the sign-up portal, `Youth Financetopia Access` for high-school participants, and `GAMEMASTER_EMAILS` (or the protected `trading_gamemaster_access_collection`) for event hosts. Ordinary portal admins do not automatically become gamemasters.

The challenge uses separate participant and gamemaster one-time-code logins. Each produces a server-issued session bound to that audience: a participant token cannot load gamemaster data or run round controls, and a gamemaster token cannot use player endpoints. Facilitator news cards and cited source notes are in [the facilitator guide](output/pdf/youth-financetopia-facilitator-guide.pdf).

---

## Launch: local (no Docker)

Run the database service with Docker Compose, then use **two terminals** if you want to run frontend/backend outside Docker.

**Terminal 1 — backend**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r app/requirements.txt
export PYTHONPATH=.
#   set -a && source .env && set +a
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — normal portal frontend**

```bash
cd frontend
npm ci
npm run dev
```

**Terminal 3 — Youth Financetopia frontend**

```bash
cd frontend
VITE_APP_AUDIENCE=youth-financetopia npm run dev -- --port 5174
```

| Service | URL |
|--------|-----|
| Web app (Vite) | [http://localhost:5173](http://localhost:5173) |
| API | [http://localhost:8000](http://localhost:8000) |
| Youth Financetopia Challenge (participants) | [http://localhost:5174/youth-financetopia](http://localhost:5174/youth-financetopia) |
| Youth Financetopia Gamemaster Console | [http://localhost:5174/youth-financetopia/gamemaster](http://localhost:5174/youth-financetopia/gamemaster) |

Optional: create `frontend/.env` with `VITE_API_URL=http://localhost:8000` if you need a non-default API URL.

---

## Deploy to FNZ231 (CI/CD)

Pushes to **`main`** or **`master`** test the app and deploy the Docker Compose stack to FNZ231 via its repository-scoped self-hosted GitHub Actions runner. See **[docs/deploy-vps.md](docs/deploy-vps.md)** for the optional variable and deployment behaviour.

## Verify (optional, before push)

From the repo root:

```bash
cd frontend && npm ci && npm run build && npm run lint
```

Run the backend challenge security and data-release tests:

```bash
cd backend && source .venv/bin/activate && pip install -r app/requirements.txt
export PYTHONPATH=.
python -m unittest discover -s tests -v
```
