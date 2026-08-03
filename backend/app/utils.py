import base64
import os
import re
import uuid

from .mongo import (
    user_collection, session_collection, registration_collection,
    reflection_collection, class_collection, allowed_email_collection,
    admin_access_collection, trading_allowed_email_collection,
    trading_gamemaster_access_collection,
)
from datetime import datetime
from bson import ObjectId


# ==================== Admin helpers ====================

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

YOUTH_DUAL_ACCESS_EMAILS = {
    "cylaucb@connect.ust.hk",
    "mikiyeung@ust.hk",
    "mhman@connect.ust.hk",
    "firstacforbks@gmail.com",
    "marcoleung0713@gmail.com",
    "mayeechunandy@gmail.com",
}

def get_admin_emails():
    """Comma-separated ADMIN_EMAILS env var → set of normalized emails."""
    raw = os.getenv("ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def get_gamemaster_emails():
    """Comma-separated GAMEMASTER_EMAILS env var → normalized host emails."""
    raw = os.getenv("GAMEMASTER_EMAILS", "")
    configured = {e.strip().lower() for e in raw.split(",") if e.strip()}
    return YOUTH_DUAL_ACCESS_EMAILS | configured


def get_trading_participant_emails():
    """Comma-separated participant emails with direct Youth access."""
    raw = os.getenv("TRADING_PARTICIPANT_EMAILS", "")
    configured = {e.strip().lower() for e in raw.split(",") if e.strip()}
    return YOUTH_DUAL_ACCESS_EMAILS | configured


def is_admin(email):
    if not email:
        return False
    normalized = email.strip().lower()
    if normalized in get_admin_emails():
        return True
    admin_access = admin_access_collection.find_one({"email": normalized})
    if not admin_access:
        return False
    return admin_access.get("active", True) is not False


def is_gamemaster(email):
    """Whether an email can operate Youth Financetopia round controls.

    This role intentionally does not inherit normal portal-admin access. The
    ordinary portal admin APIs use a different access list and must not grant
    event-control privileges by default.
    """
    normalized = normalize_email_for_access(email)
    if not normalized or not EMAIL_RE.match(normalized):
        return False
    if normalized in get_gamemaster_emails():
        return True
    access = trading_gamemaster_access_collection.find_one({"email": normalized})
    if not access:
        return False
    return access.get("active", True) is not False


def normalize_email_for_access(email):
    return (email or "").strip().lower()


PROGRAMS = {"FINA", "QFIN"}


def normalize_audience(audience):
    """Normalize event visibility to a small, backwards-compatible set."""
    if audience is None:
        return ["ALL"]
    if isinstance(audience, str):
        audience = audience.split(",")
    values = {str(value).strip().upper() for value in audience if str(value).strip()}
    values &= PROGRAMS | {"ALL"}
    return ["ALL"] if not values or "ALL" in values else sorted(values)


def profile_program(email):
    """Return the user's programme code, if their profile has one."""
    user = user_collection.find_one({"email": normalize_email_for_access(email)}, {"profile.major": 1})
    major = ((user or {}).get("profile") or {}).get("major", "")
    major = str(major).strip().upper()
    if major in PROGRAMS:
        return major
    # Accept the longer labels used by older profile records, e.g.
    # "Quantitative Finance (QFIN)".
    for program in PROGRAMS:
        if program in major:
            return program
    return None


def audience_allows(audience, viewer_email=None):
    """Whether an event is visible to a viewer under its programme filter."""
    normalized = normalize_audience(audience)
    if "ALL" in normalized:
        return True
    if not viewer_email:
        return False
    return profile_program(viewer_email) in normalized


def _clean_credentials(credentials):
    if credentials is None:
        return []
    if isinstance(credentials, str):
        credentials = credentials.splitlines()
    return [str(item).strip()[:160] for item in credentials if str(item).strip()][:12]


def _clean_profile_fields(
    biography="", biography_public=False, linkedin_url=None,
    graduation_year=None, credentials=None,
):
    year = None
    if graduation_year not in (None, ""):
        try:
            candidate = int(graduation_year)
            if 1900 <= candidate <= 2200:
                year = candidate
        except (TypeError, ValueError):
            year = None
    linkedin = (linkedin_url or "").strip() or None
    if linkedin and not re.match(r"^https?://(www\.)?linkedin\.com/", linkedin, re.I):
        linkedin = None
    return {
        "biography": str(biography or "").strip()[:3000],
        "biography_public": bool(biography_public),
        "linkedin_url": linkedin,
        "graduation_year": year,
        "credentials": _clean_credentials(credentials),
    }


def profile_biography(profile):
    """Build a concise, reusable biography from structured profile fields."""
    profile = profile or {}
    name = profile.get("preferred_name") or profile.get("full_name") or "Student"
    programme = profile.get("major") or "Finance student"
    year = profile.get("graduation_year")
    year_text = f"Class of {year}" if year else (f"Year {profile.get('study_year')}" if profile.get("study_year") else "")
    headline = " · ".join(part for part in (name, programme, year_text) if part)
    body = profile.get("biography") or ""
    credentials = profile.get("credentials") or []
    if credentials:
        body = f"{body.rstrip()}\n\nCredentials: " + "; ".join(credentials)
    return f"{headline}\n\n{body}".strip()


def search_public_profiles(query="", program=None):
    """Search only profiles that explicitly opted their biography into the directory."""
    query = (query or "").strip().lower()
    program = (program or "").strip().upper()
    results = []
    for user in user_collection.find({"profile.biography_public": True}, {"password": 0}):
        profile = user.get("profile") or {}
        major = str(profile.get("major", "")).upper()
        if program and program not in major:
            continue
        haystack = " ".join([
            str(profile.get("full_name", "")),
            str(profile.get("preferred_name", "")),
            str(profile.get("major", "")),
            str(profile.get("biography", "")),
            " ".join(profile.get("credentials") or []),
        ]).lower()
        if query and query not in haystack:
            continue
        results.append({
            "full_name": profile.get("full_name", ""),
            "preferred_name": profile.get("preferred_name", ""),
            "major": profile.get("major", ""),
            "study_year": profile.get("study_year", ""),
            "graduation_year": profile.get("graduation_year"),
            "biography": profile_biography(profile),
            "linkedin_url": profile.get("linkedin_url"),
            "credentials": _clean_credentials(profile.get("credentials")),
        })
    return sorted(results, key=lambda item: (item["preferred_name"] or item["full_name"]).lower())[:100]


def is_email_allowed(email):
    normalized = normalize_email_for_access(email)
    if not normalized or not EMAIL_RE.match(normalized):
        return False
    if is_admin(normalized):
        return True
    allowed = allowed_email_collection.find_one({"email": normalized})
    if not allowed:
        return False
    return allowed.get("active", True) is not False


def is_trading_email_allowed(email):
    normalized = normalize_email_for_access(email)
    if not normalized or not EMAIL_RE.match(normalized):
        return False
    if is_gamemaster(normalized):
        return True
    allowed = trading_allowed_email_collection.find_one({"email": normalized})
    if not allowed:
        return False
    return allowed.get("active", True) is not False


def is_trading_player_email_allowed(email):
    """Whether an email can enter the participant side of the challenge.

    A person can be approved for both participant and gamemaster access. The
    sign-in route still determines the server-issued session audience, so a
    participant session never receives gamemaster controls.
    """
    normalized = normalize_email_for_access(email)
    if not normalized or not EMAIL_RE.match(normalized):
        return False
    if normalized in get_trading_participant_emails():
        return True
    allowed = trading_allowed_email_collection.find_one({"email": normalized})
    if not allowed:
        return False
    return allowed.get("active", True) is not False


def check_email_exists(email):
    """Check if email already exists in database"""
    key = normalize_email_for_access(email)
    return user_collection.find_one({"email": key})

def create_user(email, password):
    """Create a new user in database"""
    user = {
        "email": normalize_email_for_access(email),
        "password": password
    }
    result = user_collection.insert_one(user)
    return str(result.inserted_id)

def verify_user_credentials(email, password):
    """Verify if email and password match exactly"""
    key = normalize_email_for_access(email)
    user = user_collection.find_one({"email": key})
    if not user:
        return None
    stored = user.get("password")
    if stored is None or stored == "":
        return None
    if stored != password:
        return None
    return user


def user_password_status(email):
    """Return whether the account exists and whether it has a password set."""
    key = email.strip()
    user = user_collection.find_one({"email": key})
    if not user and "@" in key:
        user = user_collection.find_one({"email": key.lower()})
    if not user:
        return None
    p = user.get("password")
    has_password = p is not None and p != ""
    return {"exists": True, "has_password": has_password}


def set_password_if_passwordless(email, new_password):
    """
    Set password for accounts that only had magic-link login (no password yet).
    Returns: True, or error string: "user_not_found", "already_has_password", "password_too_short"
    """
    key = email.strip()
    if not new_password or len(new_password) < 8:
        return "password_too_short"

    user = user_collection.find_one({"email": key})
    if not user and "@" in key:
        user = user_collection.find_one({"email": key.lower()})
        if user:
            key = user["email"]
    if not user:
        return "user_not_found"

    stored = user.get("password")
    if stored is not None and stored != "":
        return "already_has_password"

    user_collection.update_one(
        {"email": key},
        {"$set": {"password": new_password, "auth_method": "password"}},
    )
    return True

def get_all_users():
    """Get all users from database (without passwords)"""
    users = list(user_collection.find({}, {"password": 0}))
    for user in users:
        user["_id"] = str(user["_id"])
    return users

def create_user_profile(
    email, SID, full_name, preferred_name, study_year, major, contact_phone,
    profile_email, profile_picture=None, biography="", biography_public=False,
    linkedin_url=None, graduation_year=None, credentials=None,
):
    """Create a profile for a user"""
    # First check if user exists
    user = user_collection.find_one({"email": email})
    if not user:
        return None

    # Check if profile already exists
    if "profile" in user and user["profile"]:
        return "Profile already exists"

    # Create profile
    profile_data = {
        "full_name": full_name,
        "preferred_name": preferred_name,
        "SID": SID,
        "study_year": study_year,
        "major": major,
        "contact_phone": contact_phone,
        "personal_email": profile_email,
        "profile_picture": profile_picture,
        **_clean_profile_fields(
            biography, biography_public, linkedin_url, graduation_year, credentials
        ),
    }

    # Update user with profile
    result = user_collection.update_one(
        {"email": email},
        {"$set": {"profile": profile_data}}
    )

    return str(result.modified_count) if result.modified_count > 0 else None

def get_user_profile(email):
    """Get a user's profile"""
    user = user_collection.find_one({"email": email}, {"password": 0})
    if not user:
        return None

    if "profile" not in user:
        return "Profile not found"

    # Convert ObjectId to string for JSON serialization
    user["_id"] = str(user["_id"])
    return user["profile"]

def update_user_profile(
    email, SID=None, full_name=None, preferred_name=None, study_year=None,
    major=None, contact_phone=None, profile_email=None, profile_picture=None,
    biography=None, biography_public=None, linkedin_url=None,
    graduation_year=None, credentials=None,
):
    """Update a user's profile"""
    # First check if user exists
    user = user_collection.find_one({"email": email})
    if not user:
        return None

    # Check if profile exists
    if "profile" not in user:
        return "Profile not found"

    # Build update data with only provided fields
    update_data = {}
    if full_name is not None:
        update_data["profile.full_name"] = full_name
    if preferred_name is not None:
        update_data["profile.preferred_name"] = preferred_name
    if SID is not None:
        update_data["profile.SID"] = SID
    if study_year is not None:
        update_data["profile.study_year"] = study_year
    if major is not None:
        update_data["profile.major"] = major
    if contact_phone is not None:
        update_data["profile.contact_phone"] = contact_phone
    if profile_email is not None:
        update_data["profile.personal_email"] = profile_email  # Note: this is profile_email, not login email
    if profile_picture is not None:
        update_data["profile.profile_picture"] = profile_picture
    if biography is not None:
        update_data["profile.biography"] = str(biography).strip()[:3000]
    if biography_public is not None:
        update_data["profile.biography_public"] = bool(biography_public)
    if linkedin_url is not None:
        clean_linkedin = _clean_profile_fields(linkedin_url=linkedin_url)["linkedin_url"]
        update_data["profile.linkedin_url"] = clean_linkedin
    if graduation_year is not None:
        update_data["profile.graduation_year"] = _clean_profile_fields(graduation_year=graduation_year)["graduation_year"]
    if credentials is not None:
        update_data["profile.credentials"] = _clean_credentials(credentials)

    if not update_data:
        return "No fields to update"

    # Update user profile
    result = user_collection.update_one(
        {"email": email},
        {"$set": update_data}
    )

    # If we matched a document, the update is considered successful even if no changes were made
    return str(result.matched_count) if result.matched_count > 0 else None

def delete_user_profile(email):
    """Delete a user's profile"""
    # Check if user exists
    user = user_collection.find_one({"email": email})
    if not user:
        return None

    # Check if profile exists
    if "profile" not in user:
        return "Profile not found"

    # Remove profile from user
    result = user_collection.update_one(
        {"email": email},
        {"$unset": {"profile": 1}}
    )

    return str(result.modified_count) if result.modified_count > 0 else None

# ==================== Tutor Availability Management Functions ====================
# create tutor availability
def create_tutor_availability(
    tutor_email, tutor_name, session_type, date, time_slot, location,
    description=None, force_cancel_booking=False, duration_minutes=60,
    audience=None,
):
    """Create a new tutor availability slot"""
    
    # Check if the tutor (creator) has already booked a session (as student) at the same time
    booking_conflict = check_student_booking_conflict(tutor_email, date, time_slot)
    if booking_conflict:
        if not force_cancel_booking:
            # Return conflict info to ask for confirmation
            return {
                "error": "student_booking_exists",
                "message": "You already have a booked session at this time. If you create this session, your booking will be automatically cancelled.",
                "conflict_info": booking_conflict
            }
        else:
            # User confirmed, cancel the student booking
            # Update registration status to cancelled
            registration_collection.update_one(
                {"_id": ObjectId(booking_conflict["registration_id"])},
                {"$set": {
                    "status": "cancelled",
                    "updated_at": datetime.utcnow()
                }}
            )
            # Free up the session slot
            session_collection.update_one(
                {"_id": ObjectId(booking_conflict["session_id"])},
                {"$set": {
                    "is_registered": False,
                    "registered_student": None
                }}
            )
    
    availability_data = {
        "tutor_email": tutor_email,
        "tutor_name": tutor_name,
        "session_type": session_type,
        "date": date,
        "time_slot": time_slot,
        "location": location,
        "description": description,
        "duration_minutes": max(15, min(int(duration_minutes or 60), 480)),
        "audience": normalize_audience(audience),
        "is_registered": False,  # Track if a student registered for this slot
        "registered_student": None,  # Email of registered student
        "status": "active",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = session_collection.insert_one(availability_data)
    return str(result.inserted_id)

def get_tutor_availability(tutor_email=None, date=None, session_type=None, status="active"):
    """Get tutor availability slots with optional filters"""
    # Legacy slots may not have a status field; they are active unless marked
    # otherwise, just like the student calendar query.
    query = {"$or": [{"status": status}, {"status": {"$exists": False}}]}
    
    if tutor_email:
        query["tutor_email"] = tutor_email
    if date:
        query["date"] = date
    if session_type:
        query["session_type"] = session_type
    
    availabilities = list(session_collection.find(query))
    for availability in availabilities:
        availability["_id"] = str(availability["_id"])
        availability["id"] = availability["_id"]
        availability["is_available"] = not availability.get("is_registered", False)
        availability["student_registered"] = availability.get("registered_student")
        availability["duration_minutes"] = int(availability.get("duration_minutes") or _slot_duration_minutes(availability.get("time_slot")))
        availability["audience"] = normalize_audience(availability.get("audience"))
        
        # Add student profile information if someone is registered
        if availability.get("registered_student"):
            student_email = availability.get("registered_student")
            student_user = user_collection.find_one({"email": student_email})
            if student_user and "profile" in student_user:
                availability["student_profile"] = {
                    "email": student_email,
                    "preferred_name": student_user["profile"].get("preferred_name"),
                    "study_year": student_user["profile"].get("study_year"),
                }
            else:
                # If no profile, just provide email
                availability["student_profile"] = {
                    "email": student_email,
                    "preferred_name": None,
                    "study_year": None,
                }
        else:
            availability["student_profile"] = None
    
    if len(availabilities) == 0:
        return None
    
    return availabilities

def delete_tutor_availability(availability_id, tutor_email):
    """Delete a tutor's availability slot (only if it's their own)"""
    try:
        # Check if the slot belongs to the tutor
        availability = session_collection.find_one({
            "_id": ObjectId(availability_id),
            "tutor_email": tutor_email
        })
        
        if not availability:
            return "Availability slot not found or not owned by this tutor"
        
        # Check if someone is registered
        if availability.get("is_registered", False):
            return "Cannot delete slot with registered student"
        
        # Delete the availability slot
        result = session_collection.delete_one({"_id": ObjectId(availability_id)})
        return str(result.deleted_count) if result.deleted_count > 0 else None
    except:
        return None

# ==================== Student register sessions Functions ====================
    
def get_student_calendar_view(session_type=None, date=None, student_email=None):
    """Get calendar view for students - grouped by date/time with multiple tutor options"""
    # Older records predate is_registered/status defaults. Treat missing
    # availability flags as active and available so shared sessions do not
    # disappear after a deployment/schema change.
    query = {
        "$and": [
            {"$or": [{"status": "active"}, {"status": {"$exists": False}}]},
            {"$or": [{"is_registered": False}, {"is_registered": {"$exists": False}}]},
        ]
    }
    
    if session_type:
        query["session_type"] = session_type
    if date:
        query["date"] = date
    
    # Exclude sessions created by the student themselves
    if student_email:
        query["tutor_email"] = {"$ne": student_email}
    
    availabilities = list(session_collection.find(query))
    
    # Group by date, time_slot, and session_type
    calendar_slots = {}
    
    for availability in availabilities:
        if not audience_allows(availability.get("audience"), student_email):
            continue
        availability["_id"] = str(availability["_id"])
        availability["id"] = availability["_id"]
        availability["is_available"] = True  # All in this query are available
        availability["student_registered"] = None
        availability["duration_minutes"] = int(availability.get("duration_minutes") or _slot_duration_minutes(availability.get("time_slot")))
        availability["audience"] = normalize_audience(availability.get("audience"))
        
        # Create a key for grouping
        key = f"{availability['date']}_{availability['time_slot']}_{availability['session_type']}"
        
        if key not in calendar_slots:
            calendar_slots[key] = {
                "date": availability["date"],
                "time_slot": availability["time_slot"],
                "session_type": availability["session_type"],
                "available_tutors": []
            }
        
        calendar_slots[key]["available_tutors"].append(availability)
    
    return list(calendar_slots.values())

def register_student_for_tutor_slot(student_email, availability_id, force_cancel_creator_session=False):
    """Register a student for a specific tutor's availability slot"""
    try:
        # Check if availability slot exists and is active
        availability = session_collection.find_one({"_id": ObjectId(availability_id)})
        if not availability:
            return "Availability slot not found"
        
        if availability.get("status", "active") != "active":
            return "Availability slot is not active"

        if not audience_allows(availability.get("audience"), student_email):
            return "This session is not available for your programme"
        
        # Check if student is trying to register for their own session
        if student_email == availability.get("tutor_email"):
            return "You cannot register for your own session"
        
        # Check if slot is already registered (one-on-one)
        if availability.get("is_registered", False):
            return "This tutor slot is already taken"
        
        # Check if student is already registered for this specific slot
        existing_registration = registration_collection.find_one({
            "student_email": student_email,
            "session_id": ObjectId(availability_id),
            "status": "registered"
        })
        
        if existing_registration:
            return "Already registered for this tutor slot"
        
        # Check for time conflicts (same student can't book multiple sessions at same time)
        if check_time_conflict(student_email, availability["date"], availability["time_slot"]):
            return "Time conflict with existing registration"
        
        # Check if student has created a session at the same time (as creator/tutor)
        creator_conflict = check_creator_time_conflict(student_email, availability["date"], availability["time_slot"])
        if creator_conflict:
            if creator_conflict["is_booked"]:
                # Creator session is already booked by a student - cannot proceed
                return {
                    "error": "creator_session_booked",
                    "message": "You already have a booked session at this time. Cannot book another session at the same time.",
                    "conflict_info": creator_conflict
                }
            else:
                # Creator session is not booked yet
                if not force_cancel_creator_session:
                    # Return conflict info to ask for confirmation
                    return {
                        "error": "creator_session_exists",
                        "message": "You have created a session at this time. If you confirm this booking, your created session will be automatically cancelled.",
                        "conflict_info": creator_conflict
                    }
                else:
                    # User confirmed, delete the creator session
                    session_collection.delete_one({"_id": ObjectId(creator_conflict["session_id"])})
        
        # Create registration
        registration_data = {
            "student_email": student_email,
            "session_id": ObjectId(availability_id),
            "registration_time": datetime.utcnow(),
            "status": "registered",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = registration_collection.insert_one(registration_data)
        
        # Update availability slot registration status
        session_collection.update_one(
            {"_id": ObjectId(availability_id)},
            {"$set": {
                "is_registered": True,
                "registered_student": student_email
            }}
        )
        
        return str(result.inserted_id)
    
    except Exception as e:
        return None

def cancel_student_registration_for_tutor_slot(student_email, availability_id):
    """Cancel a student's registration for a specific tutor slot"""
    try:
        # Find and update the registration
        result = registration_collection.update_one(
            {
                "student_email": student_email,
                "session_id": ObjectId(availability_id),
                "status": "registered"
            },
            {
                "$set": {
                    "status": "cancelled",
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        if result.modified_count > 0:
            # Free up the tutor slot (make it available again)
            session_collection.update_one(
                {"_id": ObjectId(availability_id)},
                {"$set": {
                    "is_registered": False,
                    "registered_student": None
                }}
            )
            return str(result.modified_count)
        
        return None
    except:
        return None


# ==================== Session Registration Helper Functions ====================

def _slot_bounds(time_slot):
    try:
        start, end = [part.strip() for part in str(time_slot).split("-", 1)]
        start_minutes = sum(int(part) * factor for part, factor in zip(start.split(":"), (60, 1)))
        end_minutes = sum(int(part) * factor for part, factor in zip(end.split(":"), (60, 1)))
        return start_minutes, end_minutes
    except (TypeError, ValueError):
        return None, None


def _slot_duration_minutes(time_slot):
    start, end = _slot_bounds(time_slot)
    if start is None or end is None or end <= start:
        return 60
    return end - start


def _slots_overlap(left, right):
    left_start, left_end = _slot_bounds(left)
    right_start, right_end = _slot_bounds(right)
    if None in (left_start, left_end, right_start, right_end):
        return left == right
    return left_start < right_end and right_start < left_end


def check_time_conflict(student_email, date, time_slot):
    """Check if student has a time conflict with existing registrations"""
    # Get all active registrations for the student
    registrations = list(registration_collection.find({
        "student_email": student_email,
        "status": "registered"
    }))
    
    for reg in registrations:
        # Get session details for each registration
        session = session_collection.find_one({"_id": reg["session_id"]})
        if session and session.get("date") == date and _slots_overlap(session.get("time_slot"), time_slot):
            return True  # Conflict found
    
    return False  # No conflict

def check_creator_time_conflict(student_email, date, time_slot):
    """
    Check if student has created a session at the same time
    Returns:
        None: No conflict
        dict: Conflict info with session details
    """
    # Check if the student has created a session (as tutor) at the same time
    creator_sessions = session_collection.find({
        "tutor_email": student_email,
        "date": date,
        "$or": [{"status": "active"}, {"status": {"$exists": False}}],
    })
    creator_session = next(
        (session for session in creator_sessions if _slots_overlap(session.get("time_slot"), time_slot)),
        None,
    )

    if creator_session:
        return {
            "session_id": str(creator_session["_id"]),
            "is_booked": creator_session.get("is_registered", False),
            "booked_by": creator_session.get("registered_student"),
            "session_type": creator_session.get("session_type"),
            "location": creator_session.get("location")
        }
    
    return None

def check_student_booking_conflict(tutor_email, date, time_slot):
    """
    Check if the person creating a session (as tutor) has already booked a session (as student) at the same time
    Returns:
        None: No conflict
        dict: Conflict info with registration and session details
    """
    # Find all active registrations for this person as a student
    registrations = list(registration_collection.find({
        "student_email": tutor_email,
        "status": "registered"
    }))
    
    for reg in registrations:
        # Get session details for each registration
        session = session_collection.find_one({"_id": reg["session_id"]})
        if session and session.get("date") == date and _slots_overlap(session.get("time_slot"), time_slot):
            # Found a conflict - this person has booked a session at the same time
            return {
                "registration_id": str(reg["_id"]),
                "session_id": str(session["_id"]),
                "session_type": session.get("session_type"),
                "tutor_name": session.get("tutor_name"),
                "location": session.get("location")
            }
    
    return None

def get_student_registrations(student_email):
    """Get active registrations for a student"""
    # Only get registrations with "registered" status
    registrations = list(registration_collection.find({
        "student_email": student_email,
        "status": "registered"
    }))
    
    result = []
    for reg in registrations:
        try:
            # Get session details (tutor availability)
            session = session_collection.find_one({"_id": reg["session_id"]})
            if not session:
                continue
            
            # Get tutor email safely
            tutor_email = session.get("tutor_email")
            
            reg_data = {
                "registration_id": str(reg["_id"]),
                "availability_id": str(reg["session_id"]),  # This is actually availability_id in the new system
                "student_email": reg["student_email"],
                "registration_time": reg["registration_time"].isoformat() if isinstance(reg["registration_time"], datetime) else str(reg["registration_time"]),
                "status": reg["status"],
                "session_details": {
                    "session_type": session.get("session_type", ""),
                    "tutor_name": session.get("tutor_name", ""),
                    "tutor_email": tutor_email if tutor_email else "",
                    "date": session.get("date", ""),
                    "time_slot": session.get("time_slot", ""),
                    "location": session.get("location", ""),
                    "description": session.get("description", "")
                }
            }
            
            # Add tutor profile information - wrapped in try-catch to prevent errors
            try:
                if tutor_email:
                    tutor_user = user_collection.find_one({"email": tutor_email})
                    if tutor_user and "profile" in tutor_user:
                        reg_data["tutor_profile"] = {
                            "email": tutor_email,
                            "preferred_name": tutor_user["profile"].get("preferred_name"),
                            "study_year": tutor_user["profile"].get("study_year")
                        }
                    else:
                        # If no profile, just provide email
                        reg_data["tutor_profile"] = {
                            "email": tutor_email,
                            "preferred_name": None,
                            "study_year": None
                        }
                else:
                    reg_data["tutor_profile"] = None
            except Exception as e:
                # If getting profile fails, just set it to None
                reg_data["tutor_profile"] = None
            
            result.append(reg_data)
        except Exception as e:
            # If there's any error processing this registration, skip it and continue
            print(f"Error processing registration {reg.get('_id')}: {e}")
            continue
    
    return result

# ==================== Verification / Reflection Functions ====================

def get_user_sessions_for_verification(user_email):
    """
    Get all sessions that a user is involved in (as tutor or student)
    Only return sessions that have been booked/registered
    """
    result = []
    
    # 1. Get sessions where user is the tutor and a student has registered
    tutor_sessions = list(session_collection.find({
        "tutor_email": user_email,
        "status": "active",
        "is_registered": True
    }))
    
    for session in tutor_sessions:
        # Check if both parties have submitted reflections
        tutor_reflection = reflection_collection.find_one({
            "session_id": str(session["_id"]),
            "role": "tutor"
        })
        student_reflection = reflection_collection.find_one({
            "session_id": str(session["_id"]),
            "role": "student"
        })
        
        # Get student profile
        student_email = session.get("registered_student")
        student_name = student_email
        if student_email:
            student_user = user_collection.find_one({"email": student_email})
            if student_user and "profile" in student_user:
                student_name = student_user["profile"].get("preferred_name", student_email)
        
        session_data = {
            "session_id": str(session["_id"]),
            "date": session.get("date"),
            "time_slot": session.get("time_slot"),
            "session_type": session.get("session_type"),
            "location": session.get("location"),
            "tutor_email": user_email,
            "tutor_name": session.get("tutor_name"),
            "student_email": student_email,
            "student_name": student_name,
            "user_role": "tutor",
            "tutor_reflected": tutor_reflection is not None,
            "student_reflected": student_reflection is not None,
            "is_verified": tutor_reflection is not None,  # User (tutor) verified if they submitted
            "user_reflection": format_reflection(tutor_reflection) if tutor_reflection else None
        }
        result.append(session_data)
    
    # 2. Get sessions where user is the student (registered)
    registrations = list(registration_collection.find({
        "student_email": user_email,
        "status": "registered"
    }))
    
    for reg in registrations:
        session = session_collection.find_one({"_id": reg["session_id"]})
        if not session:
            continue
        
        # Check if both parties have submitted reflections
        tutor_reflection = reflection_collection.find_one({
            "session_id": str(session["_id"]),
            "role": "tutor"
        })
        student_reflection = reflection_collection.find_one({
            "session_id": str(session["_id"]),
            "role": "student"
        })
        
        session_data = {
            "session_id": str(session["_id"]),
            "date": session.get("date"),
            "time_slot": session.get("time_slot"),
            "session_type": session.get("session_type"),
            "location": session.get("location"),
            "tutor_email": session.get("tutor_email"),
            "tutor_name": session.get("tutor_name"),
            "student_email": user_email,
            "student_name": user_email,  # We can get preferred name if needed
            "user_role": "student",
            "tutor_reflected": tutor_reflection is not None,
            "student_reflected": student_reflection is not None,
            "is_verified": student_reflection is not None,  # User (student) verified if they submitted
            "user_reflection": format_reflection(student_reflection) if student_reflection else None
        }
        result.append(session_data)
    
    return result

def format_reflection(reflection):
    """Format a reflection document for API response"""
    if not reflection:
        return None
    
    return {
        "id": str(reflection["_id"]),
        "session_id": reflection.get("session_id"),
        "submitted_by": reflection.get("submitted_by"),
        "role": reflection.get("role"),
        "other_person_name": reflection.get("other_person_name"),
        "attitude_rating": reflection.get("attitude_rating"),
        "meeting_content": reflection.get("meeting_content"),
        "photo_base64": reflection.get("photo_base64"),
        "submitted_at": reflection.get("submitted_at").isoformat() if isinstance(reflection.get("submitted_at"), datetime) else str(reflection.get("submitted_at"))
    }

def submit_reflection(session_id, submitted_by, role, other_person_name, attitude_rating, meeting_content, photo_base64):
    """
    Submit a reflection for a session
    Returns the reflection_id or error message
    """
    try:
        # Check if session exists
        session = session_collection.find_one({"_id": ObjectId(session_id)})
        if not session:
            return "Session not found"
        
        # Check if user has already submitted a reflection for this session
        existing_reflection = reflection_collection.find_one({
            "session_id": session_id,
            "submitted_by": submitted_by,
            "role": role
        })
        
        if existing_reflection:
            return "Reflection already submitted"
        
        # Verify that the user is actually part of this session
        if role == "tutor":
            if session.get("tutor_email") != submitted_by:
                return "You are not the tutor for this session"
        elif role == "student":
            if session.get("registered_student") != submitted_by:
                return "You are not registered for this session"
        
        # Create reflection
        reflection_data = {
            "session_id": session_id,
            "submitted_by": submitted_by,
            "role": role,
            "other_person_name": other_person_name,
            "attitude_rating": attitude_rating,
            "meeting_content": meeting_content,
            "photo_base64": photo_base64,
            "submitted_at": datetime.utcnow(),
            "created_at": datetime.utcnow()
        }
        
        result = reflection_collection.insert_one(reflection_data)
        return str(result.inserted_id)
    
    except Exception as e:
        print(f"Error submitting reflection: {e}")
        return None

# ==================== Classes (admin-created group classes) ====================

def _serialize_attachment(attachment, include_data=False):
    payload = {
        "id": str(attachment.get("id") or attachment.get("_id") or ""),
        "filename": attachment.get("filename", "attachment"),
        "content_type": attachment.get("content_type", "application/octet-stream"),
        "size": int(attachment.get("size", 0) or 0),
    }
    if include_data:
        payload["data_base64"] = attachment.get("data_base64", "")
    return payload


def _serialize_class(doc):
    registered = doc.get("registered_students") or []
    capacity = int(doc.get("capacity", 0))
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "description": doc.get("description"),
        "date": doc.get("date", ""),
        "time_slot": doc.get("time_slot", ""),
        "location": doc.get("location", ""),
        "capacity": capacity,
        "registered_count": len(registered),
        "seats_left": max(0, capacity - len(registered)),
        "is_full": len(registered) >= capacity,
        "registered_students": registered,
        "created_by": doc.get("created_by", ""),
        "status": doc.get("status", "active"),
        "duration_minutes": int(doc.get("duration_minutes") or _slot_duration_minutes(doc.get("time_slot"))),
        "audience": normalize_audience(doc.get("audience")),
        "attachments": [_serialize_attachment(item) for item in (doc.get("attachments") or [])],
    }


def create_class(
    title, description, date, time_slot, location, capacity, created_by,
    duration_minutes=60, audience=None, attachments=None,
):
    """Insert a new class. Caller must already have verified admin status."""
    if capacity is None or int(capacity) <= 0:
        return "Capacity must be a positive integer"

    now = datetime.utcnow()
    stored_attachments = []
    for item in attachments or []:
        filename = str(item.get("filename") or "attachment").strip()[:180]
        content_type = str(item.get("content_type") or "application/octet-stream").strip()[:120]
        data_base64 = str(item.get("data_base64") or "")
        try:
            decoded = base64.b64decode(data_base64, validate=True)
        except (ValueError, TypeError):
            return "Each attachment must contain valid base64 data"
        if not decoded or len(decoded) > 5 * 1024 * 1024:
            return "Each attachment must be between 1 byte and 5 MB"
        stored_attachments.append({
            "id": uuid.uuid4().hex,
            "filename": filename,
            "content_type": content_type,
            "size": len(decoded),
            "data_base64": data_base64,
        })
    if len(stored_attachments) > 5:
        return "A class can include at most five attachments"
    doc = {
        "title": title.strip(),
        "description": (description or "").strip() or None,
        "date": date,
        "time_slot": time_slot,
        "location": location.strip(),
        "capacity": int(capacity),
        "duration_minutes": max(15, min(int(duration_minutes or 60), 480)),
        "audience": normalize_audience(audience),
        "attachments": stored_attachments,
        "registered_students": [],
        "created_by": created_by.strip().lower(),
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    result = class_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize_class(doc)


def list_classes(date_from=None, date_to=None, status="active", viewer_email=None):
    """List classes, optionally filtered to a date range (inclusive, YYYY-MM-DD)."""
    query = {"$or": [{"status": status}, {"status": {"$exists": False}}]}
    if date_from and date_to:
        query["date"] = {"$gte": date_from, "$lte": date_to}
    elif date_from:
        query["date"] = {"$gte": date_from}
    elif date_to:
        query["date"] = {"$lte": date_to}

    docs = list(class_collection.find(query).sort([("date", 1), ("time_slot", 1)]))
    return [_serialize_class(d) for d in docs if audience_allows(d.get("audience"), viewer_email)]


def get_class(class_id, viewer_email=None, ignore_audience=False):
    try:
        doc = class_collection.find_one({"_id": ObjectId(class_id)})
    except Exception:
        return None
    if not doc or (not ignore_audience and not audience_allows(doc.get("audience"), viewer_email)):
        return None
    return _serialize_class(doc)


def get_class_attachment(class_id, attachment_id):
    try:
        doc = class_collection.find_one({"_id": ObjectId(class_id)})
    except Exception:
        return None
    if not doc:
        return None
    for attachment in doc.get("attachments") or []:
        if str(attachment.get("id")) == str(attachment_id):
            return _serialize_attachment(attachment, include_data=True)
    return None


def get_class_notification_data(class_id):
    """Return attachment data for the mailer without exposing it in API lists."""
    try:
        doc = class_collection.find_one({"_id": ObjectId(class_id)})
    except Exception:
        return []
    return [_serialize_attachment(item, include_data=True) for item in (doc or {}).get("attachments") or []]


def get_class_notification_recipients(audience=None):
    """Find active portal users eligible for a class announcement."""
    recipients = set(get_admin_emails())
    for row in allowed_email_collection.find({"active": {"$ne": False}}, {"email": 1}):
        email = normalize_email_for_access(row.get("email"))
        if email and audience_allows(audience, email):
            recipients.add(email)
    return sorted(recipients)


def delete_class(class_id, requested_by):
    """Cancel (soft-delete) a class. Caller must verify admin first."""
    try:
        result = class_collection.update_one(
            {"_id": ObjectId(class_id)},
            {"$set": {
                "status": "cancelled",
                "cancelled_by": requested_by,
                "updated_at": datetime.utcnow(),
            }}
        )
    except Exception:
        return None
    if result.matched_count == 0:
        return "Class not found"
    return "Cancelled"


def register_for_class(class_id, student_email):
    """Atomically register a student for a class if seats remain."""
    student_email = student_email.strip().lower()
    try:
        oid = ObjectId(class_id)
    except Exception:
        return "Class not found"

    doc = class_collection.find_one({"_id": oid})
    if not doc:
        return "Class not found"
    if doc.get("status", "active") != "active":
        return "Class is not active"
    if not audience_allows(doc.get("audience"), student_email):
        return "Class is not available for your programme"

    registered = doc.get("registered_students") or []
    if student_email in registered:
        return "Already registered"

    capacity = int(doc.get("capacity", 0))
    if len(registered) >= capacity:
        return "Class is full"

    # Atomic guard: only push if we still have a free seat and the student
    # isn't yet in the list. The size check via $expr prevents a race.
    result = class_collection.update_one(
        {
            "_id": oid,
            "$or": [{"status": "active"}, {"status": {"$exists": False}}],
            "registered_students": {"$ne": student_email},
            "$expr": {"$lt": [{"$size": {"$ifNull": ["$registered_students", []]}}, "$capacity"]},
        },
        {
            "$push": {"registered_students": student_email},
            "$set": {"updated_at": datetime.utcnow()},
        },
    )
    if result.modified_count == 0:
        # Re-read to figure out which precondition failed.
        doc = class_collection.find_one({"_id": oid})
        if doc and student_email in (doc.get("registered_students") or []):
            return "Already registered"
        return "Class is full"

    return "Registered"


def unregister_from_class(class_id, student_email):
    student_email = student_email.strip().lower()
    try:
        oid = ObjectId(class_id)
    except Exception:
        return "Class not found"

    result = class_collection.update_one(
        {"_id": oid},
        {
            "$pull": {"registered_students": student_email},
            "$set": {"updated_at": datetime.utcnow()},
        },
    )
    if result.matched_count == 0:
        return "Class not found"
    if result.modified_count == 0:
        return "Not registered"
    return "Unregistered"


def get_my_classes(student_email):
    """Active classes the student is registered for, soonest first."""
    student_email = student_email.strip().lower()
    docs = list(class_collection.find({
        "registered_students": student_email,
        "$or": [{"status": "active"}, {"status": {"$exists": False}}],
    }).sort([("date", 1), ("time_slot", 1)]))
    return [_serialize_class(d) for d in docs if audience_allows(d.get("audience"), student_email)]
