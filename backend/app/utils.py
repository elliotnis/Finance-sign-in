from .mongo import user_collection, session_collection, registration_collection, reflection_collection
from datetime import datetime
from bson import ObjectId

def check_email_exists(email):
    """Check if email already exists in database"""
    return user_collection.find_one({"email": email})

def create_user(email, password):
    """Create a new user in database"""
    user = {
        "email": email,
        "password": password
    }
    result = user_collection.insert_one(user)
    return str(result.inserted_id)

def verify_user_credentials(email, password):
    """Verify if email and password match exactly"""
    user = user_collection.find_one({"email": email})
    if not user:
        return None
    if user["password"] != password:
        return None
    return user

def get_all_users():
    """Get all users from database (without passwords)"""
    users = list(user_collection.find({}, {"password": 0}))
    for user in users:
        user["_id"] = str(user["_id"])
    return users

def create_user_profile(email, SID, full_name, preferred_name, study_year, major, contact_phone, profile_email, profile_picture=None):
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
        "profile_picture": profile_picture
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

def update_user_profile(email, SID=None, full_name=None, preferred_name=None, study_year=None, major=None, contact_phone=None, profile_email=None, profile_picture=None):
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
def create_tutor_availability(tutor_email, tutor_name, session_type, date, time_slot, location, description=None, force_cancel_booking=False):
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
    query = {"status": status}
    
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
    query = {"status": "active", "is_registered": False}  # Only show available slots
    
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
        availability["_id"] = str(availability["_id"])
        availability["id"] = availability["_id"]
        availability["is_available"] = True  # All in this query are available
        availability["student_registered"] = None
        
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
        
        if availability["status"] != "active":
            return "Availability slot is not active"
        
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
        if session and session["date"] == date and session["time_slot"] == time_slot:
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
    creator_session = session_collection.find_one({
        "tutor_email": student_email,
        "date": date,
        "time_slot": time_slot,
        "status": "active"
    })
    
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
        if session and session["date"] == date and session["time_slot"] == time_slot:
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