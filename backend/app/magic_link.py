"""Passwordless email login for HKUST email addresses.

Flow:
    1. `create_magic_link(username, domain)` validates the username/domain,
       generates a short numeric code, stores it in `magic_link_collection`,
       and emails the user.
    2. The user enters the code on the website, frontend POSTs the code back, and
       we call `consume_magic_link(code)` which marks it used and returns the user.

A user record is auto-created on first use with `auth_method="email_link"` and
`password=None` so existing password-based reads keep working.
"""

import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from .email_service import send_email, smtp_profile_for_access_scope
from .mongo import (
    magic_link_collection,
    magic_link_request_collection,
    user_collection,
)
from .utils import (
    is_email_allowed,
    is_gamemaster,
    is_trading_email_allowed,
    is_trading_player_email_allowed,
)

ALLOWED_EMAIL_DOMAINS = ("connect.ust.hk", "ust.hk")
DEFAULT_EMAIL_DOMAIN = ALLOWED_EMAIL_DOMAINS[0]
ALLOWED_EMAIL_DOMAIN_LABEL = " or ".join(
    f"@{domain}" for domain in ALLOWED_EMAIL_DOMAINS
)
USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CODE_LENGTH = 6
MAX_VERIFY_ATTEMPTS = 5


class MagicLinkError(ValueError):
    """Raised for invalid usernames / tokens."""


def _ttl_minutes() -> int:
    try:
        return max(1, int(os.getenv("MAGIC_LINK_TTL_MINUTES", "15")))
    except ValueError:
        return 15


def _request_cooldown_seconds() -> int:
    """Return a bounded cooldown even when the environment is misconfigured."""
    try:
        return max(
            15,
            min(300, int(os.getenv("MAGIC_LINK_REQUEST_COOLDOWN_SECONDS", "60"))),
        )
    except ValueError:
        return 60


def _claim_request_slot(email: str, access_scope: str, cooldown_seconds: int) -> tuple[str, str]:
    """Atomically reserve the next code request for one email and scope."""
    now = datetime.now(timezone.utc)
    key = f"{access_scope}:{email}"
    request_id = secrets.token_urlsafe(18)
    try:
        claim = magic_link_request_collection.find_one_and_update(
            {
                "key": key,
                "$or": [
                    {"next_request_at": {"$lte": now}},
                    {"next_request_at": {"$exists": False}},
                ],
            },
            {
                "$set": {
                    "email": email,
                    "access_scope": access_scope,
                    "request_id": request_id,
                    "next_request_at": now + timedelta(seconds=cooldown_seconds),
                    "expires_at": now + timedelta(days=1),
                    "updated_at": now,
                },
                "$setOnInsert": {"key": key, "created_at": now},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError as exc:
        raise MagicLinkError(
            f"Wait {cooldown_seconds} seconds before requesting another code."
        ) from exc

    if not claim or claim.get("request_id") != request_id:
        raise MagicLinkError(
            f"Wait {cooldown_seconds} seconds before requesting another code."
        )
    return key, request_id


def _release_request_slot(key: str, request_id: str) -> None:
    """Allow an immediate retry when delivery failed for the current claim."""
    magic_link_request_collection.delete_one(
        {"key": key, "request_id": request_id}
    )


def normalize_username(raw: str) -> str:
    username = (raw or "").strip().lower()
    if "@" in username:
        raise MagicLinkError(
            f"Enter only the part before the domain and choose {ALLOWED_EMAIL_DOMAIN_LABEL}."
        )
    if not USERNAME_RE.match(username):
        raise MagicLinkError("That doesn't look like a valid HKUST username.")
    return username


def normalize_domain(raw: str | None = None) -> str:
    domain = (raw or DEFAULT_EMAIL_DOMAIN).strip().lower().lstrip("@")
    if domain not in ALLOWED_EMAIL_DOMAINS:
        raise MagicLinkError(f"Use an HKUST email domain: {ALLOWED_EMAIL_DOMAIN_LABEL}.")
    return domain


def build_email_address(username: str, domain: str | None = None) -> str:
    return f"{normalize_username(username)}@{normalize_domain(domain)}"


def normalize_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise MagicLinkError("Enter a valid email address.")
    return email


def _generate_code(length: int = CODE_LENGTH) -> str:
    length = max(4, min(8, int(length)))
    return f"{secrets.randbelow(10 ** length):0{length}d}"


def create_magic_link(username: str, domain: str | None = None) -> dict:
    """Create + email a one-time sign-in code. Returns {email, expires_at}."""
    email = build_email_address(username, domain)
    return create_magic_link_for_email(
        email,
        subject="Your HKUST FINA Portal sign-in code",
        title="HKUST FINA Portal",
    )


def create_magic_link_for_email(
    raw_email: str,
    subject: str = "Your sign-in code",
    title: str = "Sign-in code",
    access_scope: str = "portal",
) -> dict:
    """Create + email a one-time sign-in code for a full email address."""
    email = normalize_email(raw_email)

    now = datetime.now(timezone.utc)
    cooldown_seconds = _request_cooldown_seconds()
    request_key, request_id = _claim_request_slot(
        email,
        access_scope,
        cooldown_seconds,
    )

    expires_at = now + timedelta(minutes=_ttl_minutes())
    while True:
        code = _generate_code()
        pending_record = {
            "token": code,
            "code": code,
            "email": email,
            "created_at": now,
            "expires_at": expires_at,
            # A pending code cannot be consumed before delivery succeeds.
            "used": True,
            "used_at": now,
            "failed_attempts": 0,
            "access_scope": access_scope,
            "delivery_status": "pending",
            "invalidated_reason": "pending_delivery",
        }
        try:
            insert_result = magic_link_collection.insert_one(pending_record)
            break
        except DuplicateKeyError:
            # Six digits are intentionally easy to type; retry rare global
            # collisions against the unique token index.
            continue

    html_body = _render_email(email, code, _ttl_minutes(), title)
    try:
        send_email(
            email,
            subject,
            html_body,
            smtp_profile=smtp_profile_for_access_scope(access_scope),
        )
    except Exception:
        magic_link_collection.delete_one(
            {
                "_id": insert_result.inserted_id,
                "delivery_status": "pending",
            }
        )
        _release_request_slot(request_key, request_id)
        raise

    activated_at = datetime.now(timezone.utc)
    # Only the newest successfully delivered code remains usable. Keeping the
    # previous code valid until delivery succeeds avoids locking a user out on
    # an SMTP failure.
    magic_link_collection.update_many(
        {
            "_id": {"$ne": insert_result.inserted_id},
            "email": email,
            "access_scope": access_scope,
            "used": False,
        },
        {
            "$set": {
                "used": True,
                "used_at": activated_at,
                "invalidated_reason": "superseded",
            }
        },
    )
    magic_link_collection.update_one(
        {"_id": insert_result.inserted_id, "delivery_status": "pending"},
        {
            "$set": {
                "used": False,
                "used_at": None,
                "delivery_status": "sent",
                "activated_at": activated_at,
            },
            "$unset": {"invalidated_reason": ""},
        },
    )

    return {"email": email, "expires_at": expires_at.isoformat()}


def consume_magic_link(
    code: str,
    *,
    expected_email: str | None = None,
    expected_scope: str = "portal",
) -> dict | None:
    """Validate the code and return the (auto-created) user document."""
    if not code or not isinstance(code, str):
        return None

    now = datetime.now(timezone.utc)
    normalized_email = (
        normalize_email(expected_email)
        if expected_email is not None
        else None
    )
    query = {
        "token": code.strip(),
        "used": False,
        "expires_at": {"$gt": now},
        "access_scope": expected_scope,
        "$or": [
            {"failed_attempts": {"$lt": MAX_VERIFY_ATTEMPTS}},
            {"failed_attempts": {"$exists": False}},
        ],
    }
    if normalized_email:
        query["email"] = normalized_email

    record = magic_link_collection.find_one_and_update(
        query,
        {"$set": {"used": True, "used_at": now}},
        return_document=ReturnDocument.BEFORE,
    )
    if not record:
        if normalized_email:
            # With one active code per email/scope, a wrong code increments the
            # same record atomically. Five misses lock it until it expires.
            magic_link_collection.find_one_and_update(
                {
                    "email": normalized_email,
                    "access_scope": expected_scope,
                    "used": False,
                    "expires_at": {"$gt": now},
                    "$or": [
                        {"failed_attempts": {"$lt": MAX_VERIFY_ATTEMPTS}},
                        {"failed_attempts": {"$exists": False}},
                    ],
                },
                {"$inc": {"failed_attempts": 1}, "$set": {"last_failed_at": now}},
                return_document=ReturnDocument.AFTER,
            )
        return None

    expires_at = record.get("expires_at")
    if isinstance(expires_at, datetime):
        # Mongo strips tzinfo; treat naive timestamps as UTC.
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            return None

    email = record["email"]
    access_scope = record.get("access_scope", "portal")
    if access_scope == "trading_player":
        allowed = is_trading_player_email_allowed(email)
    elif access_scope == "trading_gamemaster":
        allowed = is_gamemaster(email)
    elif access_scope == "trading":
        # Compatibility for codes created before player and gamemaster scopes
        # were split. A session endpoint still validates its target audience.
        allowed = is_trading_email_allowed(email)
    else:
        allowed = is_email_allowed(email)
    if not allowed:
        return None

    user = user_collection.find_one({"email": email})
    if not user:
        result = user_collection.insert_one(
            {
                "email": email,
                "password": None,
                "auth_method": "email_link",
                "created_at": datetime.now(timezone.utc),
            }
        )
        user = user_collection.find_one({"_id": result.inserted_id})

    # This transient value is never written to the user collection. It lets the
    # verify endpoint issue a challenge-only session for challenge login codes.
    return {**user, "_access_scope": access_scope}


def _render_email(email: str, code: str, ttl_minutes: int, title: str = "HKUST FINA Portal") -> str:
    return f"""\
<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #222; line-height: 1.5;">
    <div style="max-width: 520px; margin: 24px auto; padding: 24px; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="margin-top: 0; color: #003366;">{title}</h2>
      <p>Hi <strong>{email}</strong>,</p>
      <p>Your one-time sign-in code is:</p>
      <p style="text-align: center; margin: 24px 0;">
        <span style="display: inline-block; letter-spacing: 4px; font-size: 2rem; font-weight: 700; color: #003366;">
          {code}
        </span>
      </p>
      <p style="font-size: 13px; color: #666;">
        Enter this code on the sign-in page within <strong>{ttl_minutes} minutes</strong>. This code can only be used once.
      </p>
      <p style="font-size: 12px; color: #999; margin-top: 32px;">
        If you didn't request this email, you can safely ignore it.
      </p>
    </div>
  </body>
</html>
"""
