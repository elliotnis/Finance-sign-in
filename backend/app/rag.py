"""Portal help agent with local retrieval and optional OpenRouter tools.

The model is kept behind the backend so the OpenRouter credential never reaches
the browser.  When the credential is unavailable (or a provider is down), the
small indexed corpus still gives a useful deterministic answer.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime

from .utils import (
    get_student_calendar_view,
    get_student_registrations,
    list_classes,
    search_public_profiles,
)


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"

KNOWLEDGE = [
    {
        "id": "access",
        "title": "Portal access",
        "text": "Use your approved HKUST connect.ust.hk or ust.hk email. If the code does not arrive, check the address and ask a portal administrator to add the account to the Allowed Emails list.",
    },
    {
        "id": "profile",
        "title": "Profile and biography",
        "text": "Complete your name, student ID, programme, study year and graduation year before using sessions. Your biography is private by default; you can explicitly make it public in Profile so other students can find your credentials and optional LinkedIn link.",
    },
    {
        "id": "sessions",
        "title": "Tutoring sessions",
        "text": "Choose Register Session to browse open tutoring times. Hosts can select a start time and a duration rather than being limited to one hour. A session may be visible only to its selected FINA or QFIN programme audience.",
    },
    {
        "id": "classes",
        "title": "Classes and events",
        "text": "Classes are shared events with a date, time, capacity, programme audience and optional attachments. Register from the Classes calendar; registered students receive confirmation when email notifications are configured.",
    },
    {
        "id": "linkedin",
        "title": "Finding a LinkedIn profile",
        "text": "Use the People directory to search public biographies and credentials. LinkedIn links are self-provided and only shown when the owner has made their biography public; the portal does not scrape LinkedIn.",
    },
]


PAGE_ROUTES = {
    "dashboard": {"path": "/dashboard", "label": "Open dashboard"},
    "profile": {"path": "/profile", "label": "Open my profile"},
    "classes": {"path": "/classes", "label": "Open classes"},
    "tutoring": {"path": "/register-session", "label": "Find tutoring sessions"},
    "host_session": {"path": "/tutor-calendar", "label": "Host a tutoring session"},
    "directory": {"path": "/directory", "label": "Open people directory"},
}


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_classes",
            "description": "Find visible classes and events in the portal. Use this when a student asks what classes are available or asks about an event date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "Inclusive date in YYYY-MM-DD format, if known."},
                    "date_to": {"type": "string", "description": "Inclusive date in YYYY-MM-DD format, if known."},
                    "program": {"type": "string", "enum": ["ALL", "FINA", "QFIN"]},
                    "query": {"type": "string", "description": "Optional words to match in title, description, location, or audience."},
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_people_directory",
            "description": "Search the opt-in People directory for public biographies, credentials, and self-provided LinkedIn links. Never expose private profiles.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Name, programme, credential, or biography words to search."},
                    "program": {"type": "string", "enum": ["ALL", "FINA", "QFIN"]},
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_tutoring_sessions",
            "description": "Find currently available tutoring slots. Use this for scheduling help; never invent a slot when this tool returns no match.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "Date in YYYY-MM-DD format, if known."},
                    "session_type": {"type": "string", "description": "Optional category such as Course Tutoring or Market News sharing."},
                    "program": {"type": "string", "enum": ["ALL", "FINA", "QFIN"]},
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_schedule",
            "description": "Read the signed-in student's existing tutoring registrations so the assistant can avoid suggesting conflicts.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "prepare_session_registration",
            "description": "Prepare a handoff to review one available tutoring slot. This opens the registration page and selects the slot, but never submits a booking.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "Slot date in YYYY-MM-DD format."},
                    "time_slot": {"type": "string", "description": "Exact slot time such as 13:00-14:00."},
                    "session_type": {"type": "string", "description": "Optional appointment type to narrow the handoff."},
                },
                "required": ["date", "time_slot"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "highlight_portal_content",
            "description": "Navigate to a portal page and visually highlight a matching button, heading, class, session, or search result. Use this when the student asks where something is or wants help while navigating.",
            "parameters": {
                "type": "object",
                "properties": {
                    "page": {"type": "string", "enum": list(PAGE_ROUTES)},
                    "target": {"type": "string", "description": "Short visible text to highlight on the destination page."},
                },
                "required": ["page", "target"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_portal_page",
            "description": "Offer a link to a portal page when the student asks to open a section or wants to continue a scheduling task. This only returns a navigation suggestion; it never changes data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "page": {"type": "string", "enum": list(PAGE_ROUTES)},
                },
                "required": ["page"],
                "additionalProperties": False,
            },
        },
    },
]


def _tokens(text):
    return set(re.findall(r"[a-z0-9]{2,}", (text or "").lower()))


def _selected_sources(question):
    query_tokens = _tokens(question)
    scored = []
    for entry in KNOWLEDGE:
        score = len(query_tokens & _tokens(entry["title"] + " " + entry["text"]))
        if score:
            scored.append((score, entry))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [entry for _, entry in scored[:3]]


def _source_payload(entries):
    return [{"id": entry["id"], "title": entry["title"]} for entry in entries]


def _local_answer(question, selected):
    if not question:
        return "Ask me about signing in, completing your profile, finding sessions, classes, or public biographies."
    if not selected:
        return "I could not find that in the sign-up guide. Try asking about access codes, profiles, sessions, classes, or the People directory."
    return " ".join(entry["text"] for entry in selected)


def _clean_date(value):
    value = (
        str(value or "")
        .strip()
        .replace("‑", "-")
        .replace("–", "-")
        .replace("—", "-")
    )
    if not value:
        return None
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return None
    return value


def _clean_time_slot(value):
    return (
        str(value or "")
        .strip()
        .replace("‑", "-")
        .replace("–", "-")
        .replace("—", "-")
        .replace(" ", "")
    )


def _session_type_matches(actual, requested):
    """Match friendly labels such as `free chat` to `FINA free chat`."""
    requested = str(requested or "").strip().lower()
    actual = str(actual or "").strip().lower()
    if not requested:
        return True
    if not actual:
        return False
    requested_tokens = re.findall(r"[a-z0-9]+", requested)
    actual_tokens = re.findall(r"[a-z0-9]+", actual)
    return requested in actual or all(token in actual_tokens for token in requested_tokens)


def _clean_program(value):
    value = str(value or "").strip().upper()
    return value if value in {"ALL", "FINA", "QFIN"} else None


def _matches_program(item, program):
    if not program or program == "ALL":
        return True
    audience = {str(value).upper() for value in item.get("audience") or ["ALL"]}
    return "ALL" in audience or program in audience


def _class_summary(item):
    return {
        "id": item.get("id"),
        "title": item.get("title"),
        "date": item.get("date"),
        "time_slot": item.get("time_slot"),
        "duration_minutes": item.get("duration_minutes", 60),
        "location": item.get("location"),
        "capacity": item.get("capacity"),
        "registered": len(item.get("registered_students") or []),
        "is_full": bool(item.get("is_full")),
        "audience": item.get("audience") or ["ALL"],
        "description": item.get("description"),
    }


def _session_summary(slot, tutor):
    return {
        "id": tutor.get("id"),
        "date": slot.get("date"),
        "time_slot": slot.get("time_slot"),
        "duration_minutes": tutor.get("duration_minutes", 60),
        "session_type": slot.get("session_type"),
        "tutor_name": tutor.get("tutor_name"),
        "location": tutor.get("location"),
        "description": tutor.get("description"),
        "audience": tutor.get("audience") or ["ALL"],
    }


def _execute_tool(name, arguments, user_email):
    """Execute only read-only portal tools and return serializable data."""
    arguments = arguments if isinstance(arguments, dict) else {}
    viewer_email = (user_email or "").strip().lower() or None

    if name == "search_classes":
        program = _clean_program(arguments.get("program"))
        date_from = _clean_date(arguments.get("date_from"))
        date_to = _clean_date(arguments.get("date_to"))
        records = list_classes(date_from=date_from, date_to=date_to, viewer_email=viewer_email)
        query = str(arguments.get("query") or "").strip().lower()
        if query:
            records = [
                item for item in records
                if query in " ".join(str(item.get(key) or "") for key in ("title", "description", "location")).lower()
                or query in " ".join(str(value) for value in item.get("audience") or []).lower()
            ]
        records = [item for item in records if _matches_program(item, program)]
        return {"events": [_class_summary(item) for item in records[:10]], "count": len(records)}

    if name == "search_people_directory":
        program = _clean_program(arguments.get("program"))
        query = str(arguments.get("query") or "").strip()
        records = search_public_profiles(query=query, program=None if program in {None, "ALL"} else program)
        return {
            "profiles": [
                {
                    "name": item.get("preferred_name") or item.get("full_name"),
                    "programme": item.get("major"),
                    "study_year": item.get("study_year"),
                    "graduation_year": item.get("graduation_year"),
                    "credentials": item.get("credentials") or [],
                    "biography": item.get("biography"),
                    "linkedin_url": item.get("linkedin_url"),
                }
                for item in records[:10]
            ],
            "count": len(records),
        }

    if name == "search_tutoring_sessions":
        program = _clean_program(arguments.get("program"))
        date = _clean_date(arguments.get("date"))
        session_type = str(arguments.get("session_type") or "").strip() or None
        slots = get_student_calendar_view(date=date, student_email=viewer_email)
        results = []
        for slot in slots:
            if not _session_type_matches(slot.get("session_type"), session_type):
                continue
            for tutor in slot.get("available_tutors") or []:
                if _matches_program(tutor, program):
                    results.append(_session_summary(slot, tutor))
        return {"sessions": results[:10], "count": len(results)}

    if name == "get_my_schedule":
        if not viewer_email:
            return {"error": "A signed-in email is needed to check an existing schedule."}
        registrations = get_student_registrations(viewer_email)
        return {
            "registrations": [
                {
                    "id": item.get("id"),
                    "date": item.get("date"),
                    "time_slot": item.get("time_slot"),
                    "duration_minutes": item.get("duration_minutes", 60),
                    "session_type": item.get("session_type"),
                    "tutor_name": item.get("tutor_name"),
                    "location": item.get("location"),
                    "status": item.get("status"),
                }
                for item in registrations[:10]
            ],
            "count": len(registrations),
        }

    if name == "prepare_session_registration":
        date = _clean_date(arguments.get("date"))
        time_slot = _clean_time_slot(arguments.get("time_slot"))
        session_type = str(arguments.get("session_type") or "").strip() or None
        if not date or not time_slot:
            return {"error": "A valid date and time slot are required."}
        slots = get_student_calendar_view(date=date, student_email=viewer_email)
        match = next(
            (
                slot
                for slot in slots
                if _clean_time_slot(slot.get("time_slot")) == time_slot
                and _session_type_matches(slot.get("session_type"), session_type)
            ),
            None,
        )
        if not match or not match.get("available_tutors"):
            return {"error": "That tutoring slot is no longer available."}
        return {
            "action": {
                "type": "navigate",
                "path": PAGE_ROUTES["tutoring"]["path"],
                "query": {"assistant_date": date, "assistant_time": time_slot},
                "label": f"Review {date} · {time_slot}",
            },
            "date": date,
            "time_slot": time_slot,
            "session_type": match.get("session_type"),
        }

    if name == "open_portal_page":
        page = str(arguments.get("page") or "").strip()
        route = PAGE_ROUTES.get(page)
        if not route:
            return {"error": "That portal page is not available."}
        return {"action": {"type": "navigate", "path": route["path"], "label": route["label"]}}

    if name == "highlight_portal_content":
        page = str(arguments.get("page") or "").strip()
        target = str(arguments.get("target") or "").strip()[:120]
        route = PAGE_ROUTES.get(page)
        if not route or not target:
            return {"error": "A valid portal page and visible target are required."}
        return {
            "action": {
                "type": "highlight",
                "path": route["path"],
                "target": target,
                "label": f"Show {target}",
            }
        }

    return {"error": "Unknown assistant tool."}


def _openrouter_key():
    return os.getenv("OPENROUTER_API_KEY", "").strip()


def _openrouter_model():
    return os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def _openrouter_request(payload):
    request = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {_openrouter_key()}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:8080"),
            "X-Title": os.getenv("OPENROUTER_APP_NAME", "HKUST Finance Portal"),
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=35) as response:
        body = response.read().decode("utf-8")
    data = json.loads(body)
    if data.get("error"):
        raise RuntimeError(str(data["error"].get("message") or "OpenRouter request failed"))
    return data


def _history_messages(history):
    safe = []
    for item in (history or [])[-8:]:
        if not isinstance(item, dict) or item.get("role") not in {"user", "assistant"}:
            continue
        content = str(item.get("content") or "").strip()
        if content:
            safe.append({"role": item["role"], "content": content[:1600]})
    return safe


def _openrouter_answer(question, selected, user_email=None, history=None, context_path=None):
    source_text = "\n".join(f"- {entry['title']}: {entry['text']}" for entry in selected)
    system = (
        "You are the HKUST Finance student portal guide. Be concise, warm, and concrete. "
        "Use the indexed guide as your source of truth. Never invent availability, registration status, "
        "people, or deadlines. When a student asks about classes, tutoring, or scheduling, call the relevant "
        "read-only tool first. For a specific slot handoff, search first and then call "
        "prepare_session_registration with the exact date and time_slot returned by the search. When they ask where "
        "something is, use the navigation or highlight tool so the "
        "portal can take them to the relevant page. You may help prepare a scheduling handoff, but you must not "
        "create, cancel, register, or change anything. Ask the student to use the page's explicit confirmation "
        "controls for changes. "
        "If a tool returns no result, say so clearly and offer the next useful step.\n\n"
        f"Indexed guide:\n{source_text or '- No matching guide entry; use the tools or explain the limitation.'}"
    )
    messages = [{"role": "system", "content": system}]
    messages.extend(_history_messages(history))
    messages.append({"role": "user", "content": question})
    actions = []

    for _ in range(3):
        response = _openrouter_request({
            "model": _openrouter_model(),
            "messages": messages,
            "tools": TOOLS,
            "tool_choice": "auto",
            "parallel_tool_calls": False,
            "temperature": 0.2,
            "max_tokens": 700,
        })
        choice = (response.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        tool_calls = message.get("tool_calls") or []
        if not tool_calls:
            content = message.get("content")
            if isinstance(content, list):
                content = " ".join(str(part.get("text") or "") for part in content if isinstance(part, dict))
            return {
                "answer": str(content or "").strip(),
                "sources": _source_payload(selected),
                "actions": actions,
                "provider": "openrouter",
                "model": _openrouter_model(),
                "context_path": context_path,
            }

        assistant_message = {"role": "assistant", "content": message.get("content") or "", "tool_calls": tool_calls}
        messages.append(assistant_message)
        for call in tool_calls:
            function = call.get("function") or {}
            name = function.get("name") or ""
            try:
                arguments = json.loads(function.get("arguments") or "{}")
            except (TypeError, ValueError):
                arguments = {}
            result = _execute_tool(name, arguments, user_email)
            action = result.get("action") if isinstance(result, dict) else None
            if action:
                actions.append(action)
            public_result = {key: value for key, value in (result or {}).items() if key != "action"}
            messages.append({
                "role": "tool",
                "tool_call_id": call.get("id") or f"tool-{len(messages)}",
                "name": name,
                "content": json.dumps(public_result, ensure_ascii=False),
            })

    raise RuntimeError("Assistant tool loop exceeded its limit")


def _deterministic_schedule_handoff(question, user_email):
    """Keep an explicit date/time request actionable during an LLM outage."""
    text = str(question or "")
    lowered = text.lower()
    if not any(word in lowered for word in ("schedule", "register", "book", "prepare", "slot", "appointment")):
        return None
    date_match = re.search(r"\b\d{4}[-‑–—]\d{2}[-‑–—]\d{2}\b", text)
    time_match = re.search(r"\b\d{1,2}:\d{2}\s*[-‑–—]\s*\d{1,2}:\d{2}\b", text)
    if not date_match or not time_match:
        return None
    session_type = None
    for label in ("fina free chat", "qfin free chat"):
        if label in lowered:
            session_type = label
            break
    result = _execute_tool(
        "prepare_session_registration",
        {
            "date": date_match.group(0),
            "time_slot": time_match.group(0),
            "session_type": session_type,
        },
        user_email,
    )
    action = result.get("action") if isinstance(result, dict) else None
    if not action:
        return None
    return {
        "answer": (
            f"I prepared the {result.get('session_type') or 'tutoring'} slot on "
            f"{result['date']} from {result['time_slot']} for your review. "
            "No booking was submitted."
        ),
        "action": action,
    }


def answer_question(question, user_email=None, history=None, context_path=None):
    question = (question or "").strip()[:2000]
    selected = _selected_sources(question)
    fallback = {
        "answer": _local_answer(question, selected),
        "sources": _source_payload(selected),
        "actions": [],
        "provider": "local",
        "model": None,
        "context_path": context_path,
    }
    if not question or not _openrouter_key():
        handoff = _deterministic_schedule_handoff(question, user_email)
        if handoff:
            return {**fallback, "answer": handoff["answer"], "actions": [handoff["action"]]}
        return fallback
    try:
        result = _openrouter_answer(question, selected, user_email=user_email, history=history, context_path=context_path)
        if result.get("answer") and result.get("actions"):
            return result
        handoff = _deterministic_schedule_handoff(question, user_email)
        if handoff:
            return {**result, "answer": handoff["answer"], "actions": [handoff["action"]]}
        return result if result.get("answer") else fallback
    except (OSError, RuntimeError, ValueError, urllib.error.URLError, json.JSONDecodeError):
        handoff = _deterministic_schedule_handoff(question, user_email)
        if handoff:
            return {**fallback, "answer": handoff["answer"], "actions": [handoff["action"]]}
        return fallback
