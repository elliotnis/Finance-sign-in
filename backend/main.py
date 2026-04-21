import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router

app = FastAPI(docs_url="/")

_cors_extra = os.getenv("CORS_ORIGINS", "")
if _cors_extra.strip():
    _allow_origins = [o.strip() for o in _cors_extra.split(",") if o.strip()]
else:
    _allow_origins = [
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "https://fina-sign-up-system.vercel.app",
    ]

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods including OPTIONS
    allow_headers=["*"],
    expose_headers=["*"]
)
# Include router
app.include_router(router)

@app.get("/_health")
def health():
    """
    Returns the health status of the application.

    return: A string "OK" if working
    """
    return "OK"

