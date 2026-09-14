import os
import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router

@asynccontextmanager
async def lifespan(app):
    from app.people import init_indexes, expire_requests, deliver_notifications
    from app.portal_session import sessions
    init_indexes()
    sessions.create_index('expires_at', expireAfterSeconds=0)
    async def recover():
        while True:
            try:
                await asyncio.to_thread(expire_requests)
                await asyncio.to_thread(deliver_notifications)
            except Exception:
                logging.exception('People Finder recovery failed')
            await asyncio.sleep(30)
    task = asyncio.create_task(recover())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

app = FastAPI(docs_url="/", lifespan=lifespan)

_cors_extra = os.getenv("CORS_ORIGINS", "")
if _cors_extra.strip():
    _allow_origins = [o.strip() for o in _cors_extra.split(",") if o.strip()]
else:
    _allow_origins = [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:8080",
        "http://127.0.0.1:4173",
        "http://127.0.0.1:8080",
        "https://fina-sign-up-system.vercel.app",
        # Current HKUST development host. The normal browser path is same
        # origin through /api, but keeping it in the fallback CORS list also
        # supports direct API calls during the transition from Drupal.
        "https://yfc.docker-dev01.ust.hk",
    ]

# Optional regex for managed hosts (e.g. Cloud Run: https://*.a.run.app)
_cors_regex = os.getenv("CORS_ORIGIN_REGEX", "").strip() or None

# Cloud Run sets K_SERVICE. If CI/env forgot CORS_ORIGINS, the browser still needs a
# permitted origin for the sibling *.a.run.app web service (different subdomain = CORS).
_disable_run_regex = os.getenv("DISABLE_CLOUD_RUN_CORS_REGEX", "").strip().lower() in (
    "1",
    "true",
    "yes",
)
# Cloud Run may expose either *.REGION.run.app (e.g. asia-east2) or *.a.run.app.
# gcloud often reports one shape in deploy output and another in `services describe`.
# If users open the "other" URL, CORS must still allow that origin.
if os.getenv("K_SERVICE") and _cors_regex is None and not _disable_run_regex:
    _cors_regex = r"https://.*\.run\.app$"

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_origin_regex=_cors_regex,
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods including OPTIONS
    allow_headers=["*"],
    expose_headers=["*"]
)
# Include router
app.include_router(router)
from app.people import router as people_router
app.include_router(people_router)

@app.get("/_health")
def health():
    """
    Returns the health status of the application.

    return: A string "OK" if working
    """
    return "OK"
