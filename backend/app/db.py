import os

from dotenv import load_dotenv
from supabase import Client, create_client

if not os.getenv("RENDER"):
    load_dotenv()


def _first_env(*names: str) -> str | None:
    for name in names:
        v = os.getenv(name)
        if v and str(v).strip():
            return str(v).strip()
    return None


_supabase_url = _first_env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
_supabase_key = _first_env(
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
)

if not _supabase_url or not _supabase_key:
    raise RuntimeError(
        "Missing Supabase configuration. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL, "
        "and SUPABASE_SERVICE_ROLE_KEY (recommended for the API) or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    )

supabase: Client = create_client(_supabase_url, _supabase_key)
