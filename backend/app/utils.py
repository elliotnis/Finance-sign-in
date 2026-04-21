from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from .db import supabase

# Table names (Supabase / Postgres)
T_USERS = "users"
T_SLOTS = "availability_slots"
T_REGS = "registrations"
T_REFL = "reflections"


def _now():
    return datetime.now(timezone.utc)


def _uuid_str(s: str) -> str:
    return str(uuid.UUID(s))


def _row_slot_to_doc(row: dict[str, Any]) -> dict[str, Any]:
    """Match legacy Mongo-shaped availability document for API responses."""
    sid = str(row["id"])
    out = {
        "_id": sid,
        "id": sid,
        "tutor_email": row["tutor_email"],
        "tutor_name": row["tutor_name"],
        "session_type": row["session_type"],
        "date": row["date"],
        "time_slot": row["time_slot"],
        "location": row.get("location"),
        "description": row.get("description"),
        "is_registered": row.get("is_registered", False),
        "registered_student": row.get("registered_student"),
        "status": row.get("status", "active"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "is_available": not row.get("is_registered", False),
        "student_registered": row.get("registered_student"),
    }
    return out


def check_email_exists(email):
    r = supabase.table(T_USERS).select("id").eq("email", email).limit(1).execute()
    return bool(r.data)


def create_user(email, password):
    r = (
        supabase.table(T_USERS)
        .insert({"email": email, "password": password})
        .execute()
    )
    if not r.data:
        raise RuntimeError("Failed to create user")
    return str(r.data[0]["id"])


def verify_user_credentials(email, password):
    r = supabase.table(T_USERS).select("id, email, password").eq("email", email).limit(1).execute()
    if not r.data:
        return None
    user = r.data[0]
    if user.get("password") != password:
        return None
    user["_id"] = str(user["id"])
    return user


def get_all_users():
    r = supabase.table(T_USERS).select("id, email, profile").execute()
    users = r.data or []
    for user in users:
        user["_id"] = str(user["id"])
    return users


def create_user_profile(
    email, SID, full_name, preferred_name, study_year, major, contact_phone, profile_email, profile_picture=None
):
    r = supabase.table(T_USERS).select("id, profile").eq("email", email).limit(1).execute()
    if not r.data:
        return None
    row = r.data[0]
    if row.get("profile"):
        return "Profile already exists"

    profile_data = {
        "full_name": full_name,
        "preferred_name": preferred_name,
        "SID": SID,
        "study_year": study_year,
        "major": major,
        "contact_phone": contact_phone,
        "personal_email": profile_email,
        "profile_picture": profile_picture,
    }
    ur = supabase.table(T_USERS).update({"profile": profile_data}).eq("email", email).execute()
    if not ur.data:
        return None
    return "1"


def get_user_profile(email):
    r = supabase.table(T_USERS).select("id, profile").eq("email", email).limit(1).execute()
    if not r.data:
        return None
    user = r.data[0]
    if not user.get("profile"):
        return "Profile not found"
    prof = user["profile"]
    if isinstance(prof, str):
        return "Profile not found"
    user["_id"] = str(user["id"])
    return prof


def update_user_profile(
    email,
    SID=None,
    full_name=None,
    preferred_name=None,
    study_year=None,
    major=None,
    contact_phone=None,
    profile_email=None,
    profile_picture=None,
):
    r = supabase.table(T_USERS).select("profile").eq("email", email).limit(1).execute()
    if not r.data:
        return None
    current = r.data[0].get("profile") or {}
    if not current:
        return "Profile not found"

    if full_name is not None:
        current["full_name"] = full_name
    if preferred_name is not None:
        current["preferred_name"] = preferred_name
    if SID is not None:
        current["SID"] = SID
    if study_year is not None:
        current["study_year"] = study_year
    if major is not None:
        current["major"] = major
    if contact_phone is not None:
        current["contact_phone"] = contact_phone
    if profile_email is not None:
        current["personal_email"] = profile_email
    if profile_picture is not None:
        current["profile_picture"] = profile_picture

    if not any(
        [
            full_name is not None,
            preferred_name is not None,
            SID is not None,
            study_year is not None,
            major is not None,
            contact_phone is not None,
            profile_email is not None,
            profile_picture is not None,
        ]
    ):
        return "No fields to update"

    ur = supabase.table(T_USERS).update({"profile": current}).eq("email", email).execute()
    if not ur.data:
        return None
    return "1"


def delete_user_profile(email):
    r = supabase.table(T_USERS).select("profile").eq("email", email).limit(1).execute()
    if not r.data:
        return None
    if not r.data[0].get("profile"):
        return "Profile not found"
    ur = supabase.table(T_USERS).update({"profile": None}).eq("email", email).execute()
    if not ur.data:
        return None
    return "1"


def create_tutor_availability(
    tutor_email, tutor_name, session_type, date, time_slot, location, description=None, force_cancel_booking=False
):
    booking_conflict = check_student_booking_conflict(tutor_email, date, time_slot)
    if booking_conflict:
        if not force_cancel_booking:
            return {
                "error": "student_booking_exists",
                "message": "You already have a booked session at this time. If you create this session, your booking will be automatically cancelled.",
                "conflict_info": booking_conflict,
            }
        supabase.table(T_REGS).update({"status": "cancelled", "updated_at": _now().isoformat()}).eq(
            "id", booking_conflict["registration_id"]
        ).execute()
        supabase.table(T_SLOTS).update(
            {"is_registered": False, "registered_student": None, "updated_at": _now().isoformat()}
        ).eq("id", booking_conflict["session_id"]).execute()

    availability_data = {
        "tutor_email": tutor_email,
        "tutor_name": tutor_name,
        "session_type": session_type,
        "date": date,
        "time_slot": time_slot,
        "location": location,
        "description": description,
        "is_registered": False,
        "registered_student": None,
        "status": "active",
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    }
    r = supabase.table(T_SLOTS).insert(availability_data).execute()
    if not r.data:
        return None
    return str(r.data[0]["id"])


def get_tutor_availability(tutor_email=None, date=None, session_type=None, status="active"):
    q = supabase.table(T_SLOTS).select("*")
    q = q.eq("status", status)
    if tutor_email:
        q = q.eq("tutor_email", tutor_email)
    if date:
        q = q.eq("date", date)
    if session_type:
        q = q.eq("session_type", session_type)
    r = q.execute()
    availabilities = r.data or []
    for availability in availabilities:
        row = _row_slot_to_doc(availability)
        se = row.get("student_registered")
        if se:
            student_user = supabase.table(T_USERS).select("profile").eq("email", se).limit(1).execute()
            if student_user.data and student_user.data[0].get("profile"):
                p = student_user.data[0]["profile"]
                row["student_profile"] = {
                    "email": se,
                    "preferred_name": p.get("preferred_name"),
                    "study_year": p.get("study_year"),
                }
            else:
                row["student_profile"] = {"email": se, "preferred_name": None, "study_year": None}
        else:
            row["student_profile"] = None
        availability.clear()
        availability.update(row)

    if len(availabilities) == 0:
        return None
    return availabilities


def delete_tutor_availability(availability_id, tutor_email):
    try:
        aid = _uuid_str(availability_id)
    except ValueError:
        return None
    try:
        r = (
            supabase.table(T_SLOTS)
            .select("*")
            .eq("id", aid)
            .eq("tutor_email", tutor_email)
            .limit(1)
            .execute()
        )
        if not r.data:
            return "Availability slot not found or not owned by this tutor"
        availability = r.data[0]
        if availability.get("is_registered", False):
            return "Cannot delete slot with registered student"
        dr = supabase.table(T_SLOTS).delete().eq("id", aid).execute()
        if not dr.data:
            return None
        return "1"
    except Exception:
        return None


def get_student_calendar_view(session_type=None, date=None, student_email=None):
    q = supabase.table(T_SLOTS).select("*").eq("status", "active").eq("is_registered", False)
    if session_type:
        q = q.eq("session_type", session_type)
    if date:
        q = q.eq("date", date)
    if student_email:
        q = q.neq("tutor_email", student_email)
    r = q.execute()
    availabilities = r.data or []

    calendar_slots: dict[str, dict] = {}
    for availability in availabilities:
        row = _row_slot_to_doc(availability)
        key = f"{row['date']}_{row['time_slot']}_{row['session_type']}"
        if key not in calendar_slots:
            calendar_slots[key] = {
                "date": row["date"],
                "time_slot": row["time_slot"],
                "session_type": row["session_type"],
                "available_tutors": [],
            }
        calendar_slots[key]["available_tutors"].append(row)

    return list(calendar_slots.values())


def register_student_for_tutor_slot(student_email, availability_id, force_cancel_creator_session=False):
    try:
        aid = _uuid_str(availability_id)
    except ValueError:
        return "Availability slot not found"

    try:
        ar = supabase.table(T_SLOTS).select("*").eq("id", aid).limit(1).execute()
        if not ar.data:
            return "Availability slot not found"
        availability = ar.data[0]

        if availability.get("status") != "active":
            return "Availability slot is not active"

        if student_email == availability.get("tutor_email"):
            return "You cannot register for your own session"

        if availability.get("is_registered", False):
            return "This tutor slot is already taken"

        ex = (
            supabase.table(T_REGS)
            .select("id")
            .eq("student_email", student_email)
            .eq("session_id", aid)
            .eq("status", "registered")
            .limit(1)
            .execute()
        )
        if ex.data:
            return "Already registered for this tutor slot"

        if check_time_conflict(student_email, availability["date"], availability["time_slot"]):
            return "Time conflict with existing registration"

        creator_conflict = check_creator_time_conflict(
            student_email, availability["date"], availability["time_slot"]
        )
        if creator_conflict:
            if creator_conflict["is_booked"]:
                return {
                    "error": "creator_session_booked",
                    "message": "You already have a booked session at this time. Cannot book another session at the same time.",
                    "conflict_info": creator_conflict,
                }
            if not force_cancel_creator_session:
                return {
                    "error": "creator_session_exists",
                    "message": "You have created a session at this time. If you confirm this booking, your created session will be automatically cancelled.",
                    "conflict_info": creator_conflict,
                }
            supabase.table(T_SLOTS).delete().eq("id", creator_conflict["session_id"]).execute()

        ts = _now().isoformat()
        ins = (
            supabase.table(T_REGS)
            .insert(
                {
                    "student_email": student_email,
                    "session_id": aid,
                    "registration_time": ts,
                    "status": "registered",
                    "created_at": ts,
                    "updated_at": ts,
                }
            )
            .execute()
        )
        if not ins.data:
            return None
        reg_id = str(ins.data[0]["id"])

        supabase.table(T_SLOTS).update(
            {"is_registered": True, "registered_student": student_email, "updated_at": _now().isoformat()}
        ).eq("id", aid).execute()

        return reg_id
    except Exception:
        return None


def cancel_student_registration_for_tutor_slot(student_email, availability_id):
    try:
        aid = _uuid_str(availability_id)
    except ValueError:
        return None
    try:
        ur = (
            supabase.table(T_REGS)
            .update({"status": "cancelled", "updated_at": _now().isoformat()})
            .eq("student_email", student_email)
            .eq("session_id", aid)
            .eq("status", "registered")
            .execute()
        )
        if not ur.data:
            return None
        supabase.table(T_SLOTS).update(
            {"is_registered": False, "registered_student": None, "updated_at": _now().isoformat()}
        ).eq("id", aid).execute()
        return "1"
    except Exception:
        return None


def check_time_conflict(student_email, date, time_slot):
    r = supabase.table(T_REGS).select("session_id").eq("student_email", student_email).eq("status", "registered").execute()
    for reg in r.data or []:
        sid = reg["session_id"]
        sr = supabase.table(T_SLOTS).select("date, time_slot").eq("id", sid).limit(1).execute()
        if sr.data and sr.data[0]["date"] == date and sr.data[0]["time_slot"] == time_slot:
            return True
    return False


def check_creator_time_conflict(student_email, date, time_slot):
    s = (
        supabase.table(T_SLOTS)
        .select("*")
        .eq("tutor_email", student_email)
        .eq("date", date)
        .eq("time_slot", time_slot)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    if not s.data:
        return None
    creator_session = s.data[0]
    cid = str(creator_session["id"])
    return {
        "session_id": cid,
        "is_booked": creator_session.get("is_registered", False),
        "booked_by": creator_session.get("registered_student"),
        "session_type": creator_session.get("session_type"),
        "location": creator_session.get("location"),
    }


def check_student_booking_conflict(tutor_email, date, time_slot):
    r = supabase.table(T_REGS).select("id, session_id").eq("student_email", tutor_email).eq("status", "registered").execute()
    for reg in r.data or []:
        sid = reg["session_id"]
        sr = supabase.table(T_SLOTS).select("*").eq("id", sid).limit(1).execute()
        if not sr.data:
            continue
        session = sr.data[0]
        if session["date"] == date and session["time_slot"] == time_slot:
            return {
                "registration_id": str(reg["id"]),
                "session_id": str(session["id"]),
                "session_type": session.get("session_type"),
                "tutor_name": session.get("tutor_name"),
                "location": session.get("location"),
            }
    return None


def get_student_registrations(student_email):
    r = supabase.table(T_REGS).select("*").eq("student_email", student_email).eq("status", "registered").execute()
    registrations = r.data or []
    result = []
    for reg in registrations:
        try:
            sid = reg["session_id"]
            session = supabase.table(T_SLOTS).select("*").eq("id", sid).limit(1).execute()
            if not session.data:
                continue
            srow = session.data[0]
            tutor_email = srow.get("tutor_email")

            reg_time = reg.get("registration_time")
            if hasattr(reg_time, "isoformat"):
                rt_str = reg_time.isoformat()
            else:
                rt_str = str(reg_time) if reg_time else ""

            reg_data = {
                "registration_id": str(reg["id"]),
                "availability_id": str(sid),
                "student_email": reg["student_email"],
                "registration_time": rt_str,
                "status": reg["status"],
                "session_details": {
                    "session_type": srow.get("session_type", ""),
                    "tutor_name": srow.get("tutor_name", ""),
                    "tutor_email": tutor_email or "",
                    "date": srow.get("date", ""),
                    "time_slot": srow.get("time_slot", ""),
                    "location": srow.get("location", ""),
                    "description": srow.get("description", ""),
                },
            }
            try:
                if tutor_email:
                    tu = supabase.table(T_USERS).select("profile").eq("email", tutor_email).limit(1).execute()
                    if tu.data and tu.data[0].get("profile"):
                        p = tu.data[0]["profile"]
                        reg_data["tutor_profile"] = {
                            "email": tutor_email,
                            "preferred_name": p.get("preferred_name"),
                            "study_year": p.get("study_year"),
                        }
                    else:
                        reg_data["tutor_profile"] = {
                            "email": tutor_email,
                            "preferred_name": None,
                            "study_year": None,
                        }
                else:
                    reg_data["tutor_profile"] = None
            except Exception:
                reg_data["tutor_profile"] = None
            result.append(reg_data)
        except Exception as e:
            print(f"Error processing registration {reg.get('id')}: {e}")
            continue
    return result


def get_user_sessions_for_verification(user_email):
    result = []

    tutor_sessions = (
        supabase.table(T_SLOTS)
        .select("*")
        .eq("tutor_email", user_email)
        .eq("status", "active")
        .eq("is_registered", True)
        .execute()
    ).data or []

    for session in tutor_sessions:
        sid_str = str(session["id"])
        tutor_ref = (
            supabase.table(T_REFL)
            .select("*")
            .eq("session_id", sid_str)
            .eq("role", "tutor")
            .limit(1)
            .execute()
        )
        student_ref = (
            supabase.table(T_REFL)
            .select("*")
            .eq("session_id", sid_str)
            .eq("role", "student")
            .limit(1)
            .execute()
        )
        student_email = session.get("registered_student")
        student_name = student_email
        if student_email:
            su = supabase.table(T_USERS).select("profile").eq("email", student_email).limit(1).execute()
            if su.data and su.data[0].get("profile"):
                student_name = su.data[0]["profile"].get("preferred_name", student_email)

        tr = tutor_ref.data[0] if tutor_ref.data else None
        sr = student_ref.data[0] if student_ref.data else None

        session_data = {
            "session_id": sid_str,
            "date": session.get("date"),
            "time_slot": session.get("time_slot"),
            "session_type": session.get("session_type"),
            "location": session.get("location"),
            "tutor_email": user_email,
            "tutor_name": session.get("tutor_name"),
            "student_email": student_email,
            "student_name": student_name,
            "user_role": "tutor",
            "tutor_reflected": tr is not None,
            "student_reflected": sr is not None,
            "is_verified": tr is not None,
            "user_reflection": format_reflection(tr) if tr else None,
        }
        result.append(session_data)

    registrations = (
        supabase.table(T_REGS).select("*").eq("student_email", user_email).eq("status", "registered").execute()
    ).data or []

    for reg in registrations:
        sid = reg["session_id"]
        sr_s = supabase.table(T_SLOTS).select("*").eq("id", sid).limit(1).execute()
        if not sr_s.data:
            continue
        session = sr_s.data[0]
        sid_str = str(session["id"])

        tutor_ref = (
            supabase.table(T_REFL)
            .select("*")
            .eq("session_id", sid_str)
            .eq("role", "tutor")
            .limit(1)
            .execute()
        )
        student_ref = (
            supabase.table(T_REFL)
            .select("*")
            .eq("session_id", sid_str)
            .eq("role", "student")
            .limit(1)
            .execute()
        )

        tr = tutor_ref.data[0] if tutor_ref.data else None
        sr = student_ref.data[0] if student_ref.data else None

        session_data = {
            "session_id": sid_str,
            "date": session.get("date"),
            "time_slot": session.get("time_slot"),
            "session_type": session.get("session_type"),
            "location": session.get("location"),
            "tutor_email": session.get("tutor_email"),
            "tutor_name": session.get("tutor_name"),
            "student_email": user_email,
            "student_name": user_email,
            "user_role": "student",
            "tutor_reflected": tr is not None,
            "student_reflected": sr is not None,
            "is_verified": sr is not None,
            "user_reflection": format_reflection(sr) if sr else None,
        }
        result.append(session_data)

    return result


def format_reflection(reflection):
    if not reflection:
        return None
    sa = reflection.get("submitted_at")
    if hasattr(sa, "isoformat"):
        sa_str = sa.isoformat()
    else:
        sa_str = str(sa) if sa else ""
    return {
        "id": str(reflection["id"]),
        "session_id": reflection.get("session_id"),
        "submitted_by": reflection.get("submitted_by"),
        "role": reflection.get("role"),
        "other_person_name": reflection.get("other_person_name"),
        "attitude_rating": reflection.get("attitude_rating"),
        "meeting_content": reflection.get("meeting_content"),
        "photo_base64": reflection.get("photo_base64"),
        "submitted_at": sa_str,
    }


def submit_reflection(session_id, submitted_by, role, other_person_name, attitude_rating, meeting_content, photo_base64):
    try:
        sid = _uuid_str(session_id)
    except ValueError:
        return "Session not found"

    try:
        sr = supabase.table(T_SLOTS).select("*").eq("id", sid).limit(1).execute()
        if not sr.data:
            return "Session not found"
        session = sr.data[0]

        ex = (
            supabase.table(T_REFL)
            .select("id")
            .eq("session_id", session_id)
            .eq("submitted_by", submitted_by)
            .eq("role", role)
            .limit(1)
            .execute()
        )
        if ex.data:
            return "Reflection already submitted"

        if role == "tutor":
            if session.get("tutor_email") != submitted_by:
                return "You are not the tutor for this session"
        elif role == "student":
            if session.get("registered_student") != submitted_by:
                return "You are not registered for this session"

        ts = _now().isoformat()
        reflection_data = {
            "session_id": session_id,
            "submitted_by": submitted_by,
            "role": role,
            "other_person_name": other_person_name,
            "attitude_rating": attitude_rating,
            "meeting_content": meeting_content,
            "photo_base64": photo_base64,
            "submitted_at": ts,
            "created_at": ts,
        }
        r = supabase.table(T_REFL).insert(reflection_data).execute()
        if not r.data:
            return None
        return str(r.data[0]["id"])
    except Exception as e:
        print(f"Error submitting reflection: {e}")
        return None
