"""Send transactional email through the configured SMTP account.

Reads SMTP_* env vars at call time so changes to .env take effect on reload.
Designed to fail loudly with a clear error so the route handler can decide
whether to surface it to the user.
"""

import os
import smtplib
import ssl
from email.message import EmailMessage


class EmailConfigError(RuntimeError):
    """Raised when SMTP env vars are missing/invalid."""


class EmailSendError(RuntimeError):
    """Raised when the SMTP server rejects or the connection fails."""


SMTP_PROFILES = {
    "finaugevents": {
        "user_env": "SMTP_USERFINAUGEVENTS",
        "password_env": "SMTP_PASSWORDFINAUGEVENTS",
        "from_env": "SMTP_FROMFINAUGEVENTS",
        "default_user": "finaugevents",
        "default_from": "HKUST FINA Portal <finaugevents@ust.hk>",
    },
    "yfc": {
        "user_env": "SMTP_USERYFC",
        "password_env": "SMTP_PASSWORDYFC",
        "from_env": "SMTP_FROMYFC",
        "default_user": "yfc",
        "default_from": "Youth Financetopia <yfc@ust.hk>",
    },
}


def smtp_profile_for_access_scope(access_scope: str) -> str:
    """Map Youth challenge scopes to YFC; all other logins use FINA."""
    return "yfc" if (access_scope or "").startswith("trading") else "finaugevents"


def _load_config(profile: str | None = None):
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))

    profile_config = None
    if profile is not None:
        profile_config = SMTP_PROFILES.get(profile)
        if profile_config is None:
            raise EmailConfigError(f"Unknown SMTP profile: {profile}")

    # A dedicated password opts this flow into its project account. If the
    # profile has not been configured yet, retain the legacy single-account
    # variables so an existing deployment continues working during rollout.
    profile_password = (
        os.getenv(profile_config["password_env"])
        if profile_config is not None
        else None
    )
    if profile_config is not None and profile_password:
        user = os.getenv(profile_config["user_env"]) or profile_config["default_user"]
        password = profile_password
        sender = os.getenv(profile_config["from_env"]) or profile_config["default_from"]
    else:
        user = os.getenv("SMTP_USER")
        password = os.getenv("SMTP_PASSWORD")
        sender = os.getenv("SMTP_FROM") or user

    if not user or not password:
        profile_hint = (
            f"{profile_config['password_env']} or legacy "
            if profile_config is not None
            else ""
        )
        raise EmailConfigError(
            f"{profile_hint}SMTP_USER and SMTP_PASSWORD must be set in the "
            "backend environment."
        )

    return host, port, user, password, sender


def send_email(
    to_address: str,
    subject: str,
    html_body: str,
    text_body: str | None = None,
    smtp_profile: str | None = None,
) -> None:
    """Send a single email. Blocks until the SMTP server returns.

    Uses STARTTLS on port 587 or implicit TLS on 465.
    """
    host, port, user, password, sender = _load_config(smtp_profile)

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to_address
    msg["Subject"] = subject
    msg.set_content(text_body or _strip_html(html_body))
    msg.add_alternative(html_body, subtype="html")

    try:
        if port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=15) as server:
                server.login(user, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                server.login(user, password)
                server.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        raise EmailSendError(f"Failed to send email: {exc}") from exc


def _strip_html(html: str) -> str:
    """Very small HTML→text fallback for the multipart/alternative plain part."""
    import re

    no_tags = re.sub(r"<[^>]+>", "", html)
    return re.sub(r"\s+\n", "\n", no_tags).strip()
