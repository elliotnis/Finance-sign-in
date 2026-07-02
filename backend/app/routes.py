from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from .utils import (
    check_email_exists, create_user, verify_user_credentials, get_all_users,
    user_password_status, set_password_if_passwordless,
    create_user_profile, get_user_profile, update_user_profile, delete_user_profile,
    register_student_for_tutor_slot, cancel_student_registration_for_tutor_slot,
    # Tutor availability management functions
    create_tutor_availability, get_tutor_availability, delete_tutor_availability,
    # Student registration function
    get_student_calendar_view, 
    get_student_registrations,
    # Verification functions
    get_user_sessions_for_verification,
    submit_reflection,
    # Admin + classes
    is_admin, is_email_allowed, normalize_email_for_access,
    create_class, list_classes, get_class, delete_class,
    register_for_class, unregister_from_class, get_my_classes,
)
from .magic_link import (
    create_magic_link, create_magic_link_for_email, consume_magic_link, MagicLinkError,
    build_email_address, normalize_email,
)
from .email_service import EmailConfigError, EmailSendError
from .admin_database import (
    list_database_collections,
    list_documents,
    create_document,
    update_document,
    delete_document,
    import_allowed_emails,
)

    
from .schema import (
    UserSignup, UserLogin, ProfileCreate, ProfileUpdate, ProfileResponse,
    # Passwordless email-link login
    EmailLinkRequest, EmailLinkVerify, TradingEmailCodeRequest, SetPasswordRequest,
    # Tutor availability schemas
    TutorAvailabilityCreate, SessionTypesList,
    # Student registration schemas
    StudentSessionSelection, StudentCalendarView,
    # Verification schemas
    ReflectionSubmit, ReflectionResponse, VerificationSessionResponse,
    # Classes
    ClassCreate, ClassRegister, ClassResponse,
)


router = APIRouter()


class AdminDatabasePayload(BaseModel):
    document: dict


class AllowedEmailImportPayload(BaseModel):
    text: str


def require_admin(email: str):
    if not is_admin(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can manage database entries",
        )


def require_allowed_email(email: str):
    if not is_email_allowed(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This email is not on the allowed access list. Ask an admin to add it.",
        )


@router.post("/signup")
def signup(user_data: UserSignup):
    email = normalize_email_for_access(user_data.email)
    require_allowed_email(email)

    # Check if email already exists
    if check_email_exists(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    user_id = create_user(email, user_data.password)
    
    return {
        "message": "User created successfully",
        "email": email,
        "user_id": user_id
    }

@router.post("/login")
def login(user_data: UserLogin):
    email = normalize_email_for_access(user_data.email)
    require_allowed_email(email)

    # Verify user credentials
    user = verify_user_credentials(email, user_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    return {
        "message": "Login successful",
        "email": email,
        "user_id": str(user["_id"])
    }

# ==================== Passwordless Email Login (HKUST email code) ====================

@router.post("/auth/email-link/request")
def request_email_link(payload: EmailLinkRequest):
    """Send a one-time sign-in code to a supported HKUST email address."""
    try:
        require_allowed_email(build_email_address(payload.username, payload.domain))
        result = create_magic_link(payload.username, payload.domain)
    except MagicLinkError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except EmailConfigError as exc:
        # Misconfigured server-side; surface a clear 500 so we don't pretend it worked.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Email service is not configured: {exc}",
        )
    except EmailSendError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not send the sign-in email: {exc}",
        )

    return {
        "message": f"Sign-in code sent to {result['email']}",
        "email": result["email"],
        "expires_at": result["expires_at"],
    }


@router.post("/auth/trading/email-code/request")
def request_trading_email_code(payload: TradingEmailCodeRequest):
    """Send a one-time sign-in code to any valid email for the trading simulation."""
    try:
        require_allowed_email(normalize_email(payload.email))
        result = create_magic_link_for_email(
            payload.email,
            subject="Your Student Trading Competition sign-in code",
            title="Student Trading Competition",
        )
    except MagicLinkError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except EmailConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Email service is not configured: {exc}",
        )
    except EmailSendError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not send the sign-in email: {exc}",
        )

    return {
        "message": f"Sign-in code sent to {result['email']}",
        "email": result["email"],
        "expires_at": result["expires_at"],
    }


@router.get("/auth/password-status")
def password_status(email: str):
    """Whether this account can set a first password (magic-link only users)."""
    email = normalize_email_for_access(email)
    require_allowed_email(email)
    password_info = user_password_status(email)
    if not password_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return {
        "has_password": password_info["has_password"],
        "can_set_password": not password_info["has_password"],
    }


@router.post("/auth/set-password")
def set_password_endpoint(payload: SetPasswordRequest):
    """Let email-link-only users choose a password so they can use the Password tab."""
    email = normalize_email_for_access(payload.email)
    require_allowed_email(email)
    result = set_password_if_passwordless(email, payload.new_password)
    if result == "user_not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if result == "already_has_password":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account already has a password. Use login with your password.",
        )
    if result == "password_too_short":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters",
        )
    return {"success": True, "message": "Password saved. You can sign in with email and password."}


@router.post("/auth/email-link/verify")
def verify_email_link(payload: EmailLinkVerify):
    """Consume a sign-in code; returns the same shape as POST /login."""
    user = consume_magic_link(payload.code)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This sign-in code is invalid, expired, or already used.",
        )

    return {
        "message": "Login successful",
        "email": user["email"],
        "user_id": str(user["_id"]),
    }


@router.get("/users")
def get_users(admin_email: str):

    # Get all users for admin purposes
    require_admin(admin_email)
    users = get_all_users()
    return users

# ==================== Personal Profile Endpoints ====================

@router.post("/profile")
def create_profile(profile_data: ProfileCreate):
    """
    Create a new profile for a user
    """
    login_email = normalize_email_for_access(profile_data.login_email)
    require_allowed_email(login_email)
    result = create_user_profile(
        login_email,  # Use login_email to find the user
        profile_data.SID,
        profile_data.full_name,
        profile_data.preferred_name,
        profile_data.study_year,
        profile_data.major,
        profile_data.contact_phone,
        profile_data.profile_email,  # Use profile_email for the profile data
        profile_data.profile_picture
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if result == "Profile already exists":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile already exists for this user"
        )

    # return successful creation message
    return{
        "success": True,
        "message": "Profile created successfully",
        "user_email": login_email
    }

@router.get("/profile/{login_email}", response_model=ProfileResponse)
def get_profile(login_email: str):
    """
    Get a user's profile by login email
    """
    login_email = normalize_email_for_access(login_email)
    require_allowed_email(login_email)
    profile = get_user_profile(login_email)

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if profile == "Profile not found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found for this user"
        )

    return ProfileResponse(**profile)

@router.put("/profile/{login_email}")
def update_profile(login_email: str, profile_update: ProfileUpdate):
    """
    Update a user's profile
    """
    login_email = normalize_email_for_access(login_email)
    require_allowed_email(login_email)
    result = update_user_profile(
        login_email,  # Use login_email to find the user
        profile_update.SID,
        profile_update.full_name,
        profile_update.preferred_name,
        profile_update.study_year,
        profile_update.major,
        profile_update.contact_phone,
        profile_update.profile_email,  # Use profile_email for the update
        profile_update.profile_picture
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if result == "Profile not found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found for this user"
        )

    if result == "No fields to update":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )
    
    # return successful update message
    return{
        "success": True,
        "message": "Profile updated successfully",
        "user_email": login_email
    }
    

@router.delete("/profile/{login_email}")
def delete_profile(login_email: str):
    """
    Delete a user's profile
    """
    login_email = normalize_email_for_access(login_email)
    require_allowed_email(login_email)
    result = delete_user_profile(login_email)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if result == "Profile not found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found for this user"
        )

    return {
        "message": "Profile deleted successfully"
    }

# ==================== Tutor Availability Management Endpoints ====================

@router.post("/tutor/availability")
def create_tutor_availability_endpoint(availability_data: TutorAvailabilityCreate):
    """Create a new tutor availability slot"""
    tutor_email = normalize_email_for_access(availability_data.tutor_email)
    require_allowed_email(tutor_email)
    availability_id = create_tutor_availability(
        tutor_email,
        availability_data.tutor_name,
        availability_data.session_type,
        availability_data.date,
        availability_data.time_slot,
        availability_data.location,
        availability_data.description
    )
    
    return {
        "success": True,
        "message": "Tutor availability created successfully",
        "availability_id": availability_id
    }

@router.get("/tutor/availability/{tutor_email}")
def get_tutor_availability_endpoint(tutor_email: str, date: str = None, session_type: str = None):
    """Get a tutor's availability slots"""
    tutor_email = normalize_email_for_access(tutor_email)
    require_allowed_email(tutor_email)
    availabilities = get_tutor_availability(tutor_email, date, session_type)
    
    if availabilities is None:
        availabilities = []
    
    return {
        "tutor_email": tutor_email,
        "availabilities": availabilities,
        "total_slots": len(availabilities)
    }

@router.delete("/tutor/availability/{availability_id}")
def delete_tutor_availability_endpoint(availability_id: str, tutor_email: str):
    """Delete a tutor's availability slot"""
    tutor_email = normalize_email_for_access(tutor_email)
    require_allowed_email(tutor_email)
    result = delete_tutor_availability(availability_id, tutor_email)
    
    if result == "Availability slot not found or not owned by this tutor":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Availability slot not found or not owned by this tutor"
        )
    
    if result == "Cannot delete slot with registered student":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete slot with registered student"
        )
    
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete availability slot"
        )
    
    return {
        "success": True,
        "message": "Availability slot deleted successfully"
    }

# # ==================== Student Calendar and Registration Endpoints ====================

@router.get("/student/calendar", response_model=StudentCalendarView)
def get_student_calendar(session_type: str = None, date: str = None, student_email: str = None):
    """Get calendar view for students - shows available tutors grouped by time slots"""
    if student_email:
        student_email = normalize_email_for_access(student_email)
        require_allowed_email(student_email)
    calendar_slots = get_student_calendar_view(session_type, date, student_email)
    
    return StudentCalendarView(calendar_slots=calendar_slots)

@router.post("/student/register")
def register_student_for_session(selection_data: StudentSessionSelection):
    """Register a student for a specific tutor's availability slot"""
    student_email = normalize_email_for_access(selection_data.student_email)
    require_allowed_email(student_email)
    result = register_student_for_tutor_slot(
        student_email,
        selection_data.availability_id,
        selection_data.force_cancel_creator_session
    )
    
    # Handle dict responses (creator conflict cases)
    if isinstance(result, dict):
        if result.get("error") == "creator_session_booked":
            # Creator session is already booked - cannot proceed
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=result
            )
        elif result.get("error") == "creator_session_exists":
            # Creator session exists but not booked - needs confirmation
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=result
            )
    
    # Handle different error cases
    if result == "Availability slot not found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Availability slot not found"
        )
    
    if result == "Availability slot is not active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Availability slot is not active"
        )
    
    if result == "You cannot register for your own session":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot register for your own session"
        )
    
    if result == "This tutor slot is already taken":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This tutor slot is already taken"
        )
    
    if result == "Already registered for this tutor slot":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already registered for this tutor slot"
        )
    
    if result == "Time conflict with existing registration":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Time conflict with existing registration"
        )
    
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )
    
    return {
        "success": True,
        "message": "Successfully registered for tutor session",
        "registration_id": result
    }

@router.delete("/student/register")
def cancel_student_registration(selection_data: StudentSessionSelection):
    """Cancel a student's registration for a specific tutor slot"""
    student_email = normalize_email_for_access(selection_data.student_email)
    require_allowed_email(student_email)
    result = cancel_student_registration_for_tutor_slot(
        student_email,
        selection_data.availability_id
    )
    
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found or already cancelled"
        )
    
    return {
        "success": True,
        "message": "Registration cancelled successfully"
    }

# ==================== Session Types Endpoint ====================

@router.get("/session-types", response_model=SessionTypesList)
def get_session_types():
    """Get available session types"""
    return SessionTypesList()

# ==================== Student My Sessions Endpoint ====================

@router.get("/my-sessions/{student_email}")
def get_my_sessions(student_email: str):
    """Get active sessions registered by a student"""
    student_email = normalize_email_for_access(student_email)
    require_allowed_email(student_email)
    registrations = get_student_registrations(student_email)
    
    return {
        "student_email": student_email,
        "registrations": registrations,
        "total_registrations": len(registrations)
    }

# ==================== Verification / Reflection Endpoints ====================

@router.get("/verification/{user_email}")
def get_verification_sessions(user_email: str):
    """Get all sessions for a user that need verification"""
    user_email = normalize_email_for_access(user_email)
    require_allowed_email(user_email)
    sessions = get_user_sessions_for_verification(user_email)
    
    return {
        "user_email": user_email,
        "sessions": sessions,
        "total_sessions": len(sessions),
        "verified_count": sum(1 for s in sessions if s["is_verified"]),
        "pending_count": sum(1 for s in sessions if not s["is_verified"])
    }

@router.post("/verification/reflect")
def submit_session_reflection(reflection_data: ReflectionSubmit):
    """Submit a reflection for a session"""
    submitted_by = normalize_email_for_access(reflection_data.submitted_by)
    require_allowed_email(submitted_by)
    result = submit_reflection(
        reflection_data.session_id,
        submitted_by,
        reflection_data.role,
        reflection_data.other_person_name,
        reflection_data.attitude_rating,
        reflection_data.meeting_content,
        reflection_data.photo_base64
    )
    
    # Handle different error cases
    if result == "Session not found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    if result == "Reflection already submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already submitted a reflection for this session"
        )
    
    if result == "You are not the tutor for this session":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to submit a reflection as tutor for this session"
        )
    
    if result == "You are not registered for this session":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not registered for this session"
        )
    
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit reflection"
        )
    
    return {
        "success": True,
        "message": "Reflection submitted successfully",
        "reflection_id": result
    }


# ==================== Admin Role Endpoint ====================

@router.get("/me/role")
def get_my_role(email: str):
    """Tell the frontend whether this email is in the admin allow-list."""
    email = normalize_email_for_access(email)
    return {"email": email, "is_admin": is_admin(email), "is_allowed": is_email_allowed(email)}


# ==================== Admin Database Manager ====================

@router.get("/admin/database/collections")
def admin_database_collections(admin_email: str):
    require_admin(admin_email)
    return {"collections": list_database_collections()}


@router.get("/admin/database/{collection_key}")
def admin_database_documents(
    collection_key: str,
    admin_email: str,
    search: str = "",
    limit: int = 100,
):
    require_admin(admin_email)
    try:
        return list_documents(collection_key, search=search, limit=limit)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown database section",
        )


@router.post("/admin/database/{collection_key}")
def admin_database_create(collection_key: str, admin_email: str, payload: AdminDatabasePayload):
    require_admin(admin_email)
    try:
        document = create_document(collection_key, payload.document)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown database section",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not create entry: {exc}",
        )
    return {"success": True, "document": document}


@router.post("/admin/database/allowed-emails/import")
def admin_allowed_email_import(admin_email: str, payload: AllowedEmailImportPayload):
    require_admin(admin_email)
    try:
        result = import_allowed_emails(payload.text, normalize_email_for_access(admin_email))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not import allowed emails: {exc}",
        )
    return {"success": True, **result}


@router.put("/admin/database/{collection_key}/{document_id}")
def admin_database_update(
    collection_key: str,
    document_id: str,
    admin_email: str,
    payload: AdminDatabasePayload,
):
    require_admin(admin_email)
    try:
        document = update_document(collection_key, document_id, payload.document)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown database section",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not update entry: {exc}",
        )
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entry not found",
        )
    return {"success": True, "document": document}


@router.delete("/admin/database/{collection_key}/{document_id}")
def admin_database_delete(collection_key: str, document_id: str, admin_email: str):
    require_admin(admin_email)
    try:
        deleted = delete_document(collection_key, document_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown database section",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not delete entry: {exc}",
        )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entry not found",
        )
    return {"success": True, "message": "Entry deleted"}


# ==================== Classes (admin-created group classes) ====================

@router.post("/classes", response_model=ClassResponse)
def create_class_endpoint(data: ClassCreate):
    if not is_admin(data.created_by):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create classes",
        )

    result = create_class(
        title=data.title,
        description=data.description,
        date=data.date,
        time_slot=data.time_slot,
        location=data.location,
        capacity=data.capacity,
        created_by=data.created_by,
    )

    if isinstance(result, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result,
        )
    return result


@router.get("/classes")
def list_classes_endpoint(date_from: str = None, date_to: str = None):
    classes = list_classes(date_from=date_from, date_to=date_to)
    return {"classes": classes, "total": len(classes)}


@router.get("/classes/my/{student_email}")
def my_classes_endpoint(student_email: str):
    student_email = normalize_email_for_access(student_email)
    require_allowed_email(student_email)
    classes = get_my_classes(student_email)
    return {
        "student_email": student_email,
        "classes": classes,
        "total": len(classes),
    }


@router.get("/classes/{class_id}", response_model=ClassResponse)
def get_class_endpoint(class_id: str):
    cls = get_class(class_id)
    if cls is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class not found",
        )
    return cls


@router.delete("/classes/{class_id}")
def delete_class_endpoint(class_id: str, requested_by: str):
    if not is_admin(requested_by):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can cancel classes",
        )
    result = delete_class(class_id, requested_by)
    if result is None or result == "Class not found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class not found",
        )
    return {"success": True, "message": "Class cancelled"}


@router.post("/classes/{class_id}/register")
def register_for_class_endpoint(class_id: str, payload: ClassRegister):
    student_email = normalize_email_for_access(payload.student_email)
    require_allowed_email(student_email)
    result = register_for_class(class_id, student_email)
    if result == "Class not found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=result)
    if result == "Class is not active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result)
    if result == "Already registered":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=result)
    if result == "Class is full":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=result)
    if result != "Registered":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not register for class",
        )
    cls = get_class(class_id)
    return {"success": True, "message": "Registered for class", "class": cls}


@router.delete("/classes/{class_id}/register")
def unregister_from_class_endpoint(class_id: str, payload: ClassRegister):
    student_email = normalize_email_for_access(payload.student_email)
    require_allowed_email(student_email)
    result = unregister_from_class(class_id, student_email)
    if result == "Class not found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=result)
    if result == "Not registered":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result)
    cls = get_class(class_id)
    return {"success": True, "message": "Unregistered from class", "class": cls}
