"""Server-side sessions for the Youth Financetopia Challenge.

The challenge used to trust an email supplied by the browser for every request.
These opaque bearer tokens make the verified email and its participant or
gamemaster audience a server-side fact instead.
"""

from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from .mongo import trading_session_collection
from .utils import (
    is_gamemaster,
    is_trading_player_email_allowed,
    normalize_email_for_access,
)


PLAYER_AUDIENCE = "player"
GAMEMASTER_AUDIENCE = "gamemaster"
TRADING_AUDIENCES = {PLAYER_AUDIENCE, GAMEMASTER_AUDIENCE}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _session_ttl_hours() -> int:
    try:
        return max(1, min(72, int(os.getenv("TRADING_SESSION_TTL_HOURS", "12"))))
    except ValueError:
        return 12


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _is_allowed_for_audience(email: str, audience: str) -> bool:
    if audience == PLAYER_AUDIENCE:
        return is_trading_player_email_allowed(email)
    if audience == GAMEMASTER_AUDIENCE:
        return is_gamemaster(email)
    return False


def create_trading_session(raw_email: str, audience: str = PLAYER_AUDIENCE) -> dict:
    email = normalize_email_for_access(raw_email)
    if audience not in TRADING_AUDIENCES:
        raise ValueError("invalid_audience")
    if not _is_allowed_for_audience(email, audience):
        raise ValueError("email_not_allowed")

    token = secrets.token_urlsafe(36)
    now = _now()
    expires_at = now + timedelta(hours=_session_ttl_hours())
    trading_session_collection.insert_one(
        {
            "token_hash": _hash_token(token),
            "email": email,
            "audience": audience,
            "created_at": now,
            "expires_at": expires_at,
            "revoked_at": None,
        }
    )
    return {
        "token": token,
        "email": email,
        "audience": audience,
        "is_gamemaster": audience == GAMEMASTER_AUDIENCE,
        "expires_at": expires_at.isoformat(),
    }


def authenticate_trading_session(
    authorization: str | None,
    expected_audience: str | None = None,
) -> str | None:
    if not authorization:
        return None
    scheme, separator, token = authorization.strip().partition(" ")
    if separator != " " or scheme.lower() != "bearer" or not token:
        return None

    session = trading_session_collection.find_one(
        {
            "token_hash": _hash_token(token),
            "revoked_at": None,
            "expires_at": {"$gt": _now()},
        }
    )
    if not session:
        return None

    email = normalize_email_for_access(session.get("email", ""))
    audience = session.get("audience")
    # Legacy challenge sessions predate the role split. Force a fresh,
    # audience-bound login instead of guessing whether they are player or host.
    if audience not in TRADING_AUDIENCES:
        return None
    if expected_audience and audience != expected_audience:
        return None
    if not _is_allowed_for_audience(email, audience):
        return None
    return email


def revoke_trading_session(authorization: str | None) -> None:
    if not authorization:
        return
    scheme, separator, token = authorization.strip().partition(" ")
    if separator != " " or scheme.lower() != "bearer" or not token:
        return
    trading_session_collection.update_one(
        {"token_hash": _hash_token(token), "revoked_at": None},
        {"$set": {"revoked_at": _now()}},
    )
