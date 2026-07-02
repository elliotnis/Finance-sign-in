from datetime import datetime
import re
from typing import Any

from bson import ObjectId

from .mongo import (
    user_collection,
    session_collection,
    registration_collection,
    reflection_collection,
    class_collection,
    allowed_email_collection,
)


EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
HEADER_CELLS = {
    "email",
    "emails",
    "student email",
    "student emails",
    "name",
    "student name",
    "full name",
}

COLLECTIONS = {
    "allowed_emails": {
        "label": "Allowed Emails",
        "collection": allowed_email_collection,
        "description": "Students with active emails here can access the portal. Admin emails are always allowed.",
        "title_fields": ["email", "name"],
        "fields": [
            {"name": "email", "label": "Allowed email", "type": "email", "required": True},
            {"name": "name", "label": "Student name", "type": "text"},
            {"name": "active", "label": "Can access", "type": "boolean", "help": "Turn off instead of deleting when access should be paused."},
            {"name": "notes", "label": "Notes", "type": "textarea"},
        ],
    },
    "users": {
        "label": "Users",
        "collection": user_collection,
        "description": "Student accounts and profile details.",
        "title_fields": ["email", "profile.preferred_name", "profile.full_name"],
        "hidden_fields": {"password"},
        "fields": [
            {"name": "email", "label": "Login email", "type": "email", "required": True},
            {"name": "password", "label": "Password", "type": "password", "create_only": True},
            {"name": "profile.full_name", "label": "Full name", "type": "text"},
            {"name": "profile.preferred_name", "label": "Preferred name", "type": "text"},
            {"name": "profile.SID", "label": "Student ID", "type": "text"},
            {"name": "profile.study_year", "label": "Study year", "type": "text"},
            {"name": "profile.major", "label": "Major", "type": "text"},
            {"name": "profile.contact_phone", "label": "Phone", "type": "text"},
            {"name": "profile.personal_email", "label": "Profile email", "type": "email"},
        ],
    },
    "sessions": {
        "label": "Tutor Sessions",
        "collection": session_collection,
        "description": "Tutor availability slots and session status.",
        "title_fields": ["session_type", "tutor_name", "date"],
        "fields": [
            {"name": "tutor_email", "label": "Tutor email", "type": "email", "required": True},
            {"name": "tutor_name", "label": "Tutor name", "type": "text", "required": True},
            {"name": "session_type", "label": "Session type", "type": "text", "required": True},
            {"name": "date", "label": "Date", "type": "date", "required": True},
            {"name": "time_slot", "label": "Time slot", "type": "text", "placeholder": "14:00-15:00", "required": True},
            {"name": "location", "label": "Location", "type": "text", "required": True},
            {"name": "description", "label": "Description", "type": "textarea"},
            {"name": "status", "label": "Status", "type": "text", "placeholder": "active"},
            {"name": "is_registered", "label": "Already registered", "type": "boolean"},
            {"name": "registered_student", "label": "Registered student email", "type": "email"},
        ],
    },
    "registrations": {
        "label": "Registrations",
        "collection": registration_collection,
        "description": "Student bookings for tutor sessions.",
        "title_fields": ["student_email", "session_type", "date"],
        "fields": [
            {"name": "student_email", "label": "Student email", "type": "email", "required": True},
            {"name": "session_id", "label": "Session ID", "type": "text", "required": True},
            {"name": "tutor_email", "label": "Tutor email", "type": "email"},
            {"name": "session_type", "label": "Session type", "type": "text"},
            {"name": "date", "label": "Date", "type": "date"},
            {"name": "time_slot", "label": "Time slot", "type": "text"},
            {"name": "location", "label": "Location", "type": "text"},
            {"name": "status", "label": "Status", "type": "text", "placeholder": "active"},
        ],
    },
    "classes": {
        "label": "Classes",
        "collection": class_collection,
        "description": "Admin-created class events and their student registrations.",
        "title_fields": ["title", "date", "time_slot"],
        "fields": [
            {"name": "title", "label": "Title", "type": "text", "required": True},
            {"name": "description", "label": "Description", "type": "textarea"},
            {"name": "date", "label": "Date", "type": "date", "required": True},
            {"name": "time_slot", "label": "Time slot", "type": "text", "placeholder": "14:00-15:00", "required": True},
            {"name": "location", "label": "Location", "type": "text", "required": True},
            {"name": "capacity", "label": "Capacity", "type": "number", "required": True},
            {"name": "created_by", "label": "Created by", "type": "email", "required": True},
            {"name": "registered_students", "label": "Registered students", "type": "list", "help": "Comma-separated emails"},
            {"name": "status", "label": "Status", "type": "text", "placeholder": "active"},
        ],
    },
    "reflections": {
        "label": "Reflections",
        "collection": reflection_collection,
        "description": "Verification/reflection submissions.",
        "title_fields": ["submitted_by", "role", "session_id"],
        "fields": [
            {"name": "session_id", "label": "Session ID", "type": "text", "required": True},
            {"name": "submitted_by", "label": "Submitted by", "type": "email", "required": True},
            {"name": "role", "label": "Role", "type": "text", "placeholder": "student or tutor"},
            {"name": "other_person_name", "label": "Other person", "type": "text"},
            {"name": "attitude_rating", "label": "Attitude rating", "type": "text"},
            {"name": "meeting_content", "label": "Meeting content", "type": "textarea"},
        ],
    },
}


def list_database_collections():
    out = []
    for key, meta in COLLECTIONS.items():
        out.append({
            "key": key,
            "label": meta["label"],
            "description": meta["description"],
            "fields": meta["fields"],
            "count": meta["collection"].count_documents({}),
        })
    return out


def _get_nested(doc: dict[str, Any], path: str):
    value: Any = doc
    for part in path.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _serialize_value(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_serialize_value(v) for v in value]
    if isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    return value


def _public_doc(collection_key: str, doc: dict[str, Any]):
    meta = COLLECTIONS[collection_key]
    hidden = meta.get("hidden_fields", set())
    clean = {}
    for key, value in doc.items():
        if key in hidden:
            if value:
                clean["has_password"] = True
            continue
        clean[key] = _serialize_value(value)
    clean["id"] = str(doc["_id"])
    clean.pop("_id", None)
    title_parts = []
    for field in meta["title_fields"]:
        value = _get_nested(doc, field)
        if value:
            title_parts.append(str(value))
    clean["_display_title"] = " · ".join(title_parts) or str(doc["_id"])
    return clean


def _collection_meta(collection_key: str):
    meta = COLLECTIONS.get(collection_key)
    if not meta:
        raise KeyError(collection_key)
    return meta


def list_documents(collection_key: str, search: str = "", limit: int = 100):
    meta = _collection_meta(collection_key)
    collection = meta["collection"]
    limit = max(1, min(int(limit or 100), 250))

    query = {}
    if search.strip():
        query = {"$text": {"$search": search.strip()}}
        try:
            docs = list(collection.find(query).limit(limit))
        except Exception:
            docs = list(collection.find({}).limit(250))
            needle = search.strip().lower()
            docs = [d for d in docs if needle in str(_serialize_value(d)).lower()][:limit]
    else:
        docs = list(collection.find({}).sort([("_id", -1)]).limit(limit))

    return {
        "collection": collection_key,
        "documents": [_public_doc(collection_key, d) for d in docs],
        "total": collection.count_documents({}),
    }


def _drop_empty(value):
    if isinstance(value, dict):
        return {k: _drop_empty(v) for k, v in value.items() if v != ""}
    if isinstance(value, list):
        return [_drop_empty(v) for v in value if v != ""]
    return value


def _prepare_doc(collection_key: str, doc: dict[str, Any], existing: dict[str, Any] | None = None):
    prepared = _drop_empty(dict(doc or {}))
    prepared.pop("_id", None)
    prepared.pop("id", None)
    prepared.pop("_display_title", None)
    prepared.pop("has_password", None)

    now = datetime.utcnow()
    if collection_key == "allowed_emails":
        if "email" in prepared and isinstance(prepared["email"], str):
            prepared["email"] = prepared["email"].strip().lower()
        prepared.setdefault("active", True)
    if collection_key == "users":
        if "email" in prepared and isinstance(prepared["email"], str):
            prepared["email"] = prepared["email"].strip().lower()
        if existing and "password" not in prepared:
            prepared.pop("password", None)
    if collection_key == "classes":
        prepared.setdefault("registered_students", [])
        if isinstance(prepared.get("registered_students"), str):
            prepared["registered_students"] = [
                e.strip().lower()
                for e in prepared["registered_students"].split(",")
                if e.strip()
            ]
        if "capacity" in prepared:
            prepared["capacity"] = int(prepared["capacity"])
    if collection_key == "sessions":
        prepared.setdefault("is_registered", False)
        prepared.setdefault("registered_student", None)
        prepared.setdefault("status", "active")
    if collection_key == "registrations":
        prepared.setdefault("status", "active")

    if not existing:
        prepared.setdefault("created_at", now)
    prepared["updated_at"] = now
    return prepared


def create_document(collection_key: str, doc: dict[str, Any]):
    meta = _collection_meta(collection_key)
    prepared = _prepare_doc(collection_key, doc)
    result = meta["collection"].insert_one(prepared)
    created = meta["collection"].find_one({"_id": result.inserted_id})
    return _public_doc(collection_key, created)


def update_document(collection_key: str, document_id: str, doc: dict[str, Any]):
    meta = _collection_meta(collection_key)
    oid = ObjectId(document_id)
    existing = meta["collection"].find_one({"_id": oid})
    if not existing:
        return None
    prepared = _prepare_doc(collection_key, doc, existing=existing)
    if not prepared:
        return _public_doc(collection_key, existing)
    meta["collection"].update_one({"_id": oid}, {"$set": prepared})
    updated = meta["collection"].find_one({"_id": oid})
    return _public_doc(collection_key, updated)


def delete_document(collection_key: str, document_id: str):
    meta = _collection_meta(collection_key)
    result = meta["collection"].delete_one({"_id": ObjectId(document_id)})
    return result.deleted_count == 1


def _split_table_row(row: str):
    return [cell.strip() for cell in re.split(r"[\t,;]", row) if cell.strip()]


def _extract_allowed_email_rows(raw_text: str):
    records = []
    for row in (raw_text or "").splitlines():
        cells = _split_table_row(row)
        if not cells:
            continue

        row_emails = []
        for cell in cells:
            row_emails.extend(match.group(0).lower() for match in EMAIL_RE.finditer(cell))
        if not row_emails:
            continue

        name = ""
        for cell in cells:
            normalized = cell.strip().lower()
            if normalized in HEADER_CELLS or EMAIL_RE.search(cell):
                continue
            name = cell.strip()
            break

        for email in row_emails:
            records.append({"email": email, "name": name})

    if not records and raw_text:
        records = [{"email": match.group(0).lower(), "name": ""} for match in EMAIL_RE.finditer(raw_text)]

    deduped = []
    seen = set()
    duplicate_count = 0
    for record in records:
        email = record["email"]
        if email in seen:
            duplicate_count += 1
            continue
        seen.add(email)
        deduped.append(record)

    return deduped, duplicate_count


def import_allowed_emails(raw_text: str, admin_email: str):
    records, duplicate_count = _extract_allowed_email_rows(raw_text)
    if not records:
        return {
            "added": 0,
            "updated": 0,
            "unchanged": 0,
            "duplicates": duplicate_count,
            "total": 0,
        }

    now = datetime.utcnow()
    added = 0
    updated = 0
    unchanged = 0

    for record in records:
        changes = {
            "email": record["email"],
            "active": True,
            "updated_at": now,
            "updated_by": admin_email,
        }
        if record.get("name"):
            changes["name"] = record["name"]

        result = allowed_email_collection.update_one(
            {"email": record["email"]},
            {
                "$set": changes,
                "$setOnInsert": {
                    "created_at": now,
                    "created_by": admin_email,
                    "source": "bulk_import",
                },
            },
            upsert=True,
        )
        if result.upserted_id:
            added += 1
        elif result.modified_count:
            updated += 1
        else:
            unchanged += 1

    return {
        "added": added,
        "updated": updated,
        "unchanged": unchanged,
        "duplicates": duplicate_count,
        "total": len(records),
    }
