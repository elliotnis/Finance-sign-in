import os
import pymongo

from dotenv import load_dotenv

load_dotenv()
# Older deployments used MONGODB_URL while Docker Compose now calls the
# setting DATABASE_URI.  Prefer the current name, but keep the legacy name as
# a compatibility fallback so the application does not silently connect to a
# new empty local database and hide existing classes/sessions.
DATABASE_URI = (
    os.getenv("DATABASE_URI")
    or os.getenv("MONGODB_URL")
    or "mongodb://mongo:27017"
)

try:
    client = pymongo.MongoClient(DATABASE_URI)
    db = client.get_database("sign_up_system")  # Use the exact database name from Atlas
    user_collection = db["user_collection"]
    session_collection = db["session_collection"]  # For storing session information
    registration_collection = db["registration_collection"]  # For storing session registrations
    reflection_collection = db["reflection_collection"]  # For storing session reflections/verifications
    magic_link_collection = db["magic_link_collection"]  # For passwordless email sign-in codes
    magic_link_request_collection = db["magic_link_request_collection"]  # Atomic per-email code request cooldowns
    class_collection = db["class_collection"]  # For admin-created group classes
    allowed_email_collection = db["allowed_email_collection"]  # Students allowed to access the portal
    admin_access_collection = db["admin_access_collection"]  # Admins managed from the database page
    trading_allowed_email_collection = db["trading_allowed_email_collection"]  # Youth Financetopia Challenge access list
    trading_gamemaster_access_collection = db["trading_gamemaster_access_collection"]  # Youth Financetopia gamemaster access list
    trading_team_collection = db["trading_team_collection"]  # Youth Financetopia Challenge teams
    trading_order_collection = db["trading_order_collection"]  # Youth Financetopia Challenge orders
    trading_game_collection = db["trading_game_collection"]  # Youth Financetopia Challenge round state
    trading_session_collection = db["trading_session_collection"]  # Short-lived challenge login sessions
    # Finance student-services workflows.
    resume_book_collection = db["resume_book_collection"]
    business_card_order_collection = db["business_card_order_collection"]
    event_registration_collection = db["event_registration_collection"]
    merch_order_collection = db["merch_order_collection"]

    # Indexes (idempotent — safe to run on every startup).
    # TTL index auto-deletes expired email codes from the collection.
    magic_link_collection.create_index("expires_at", expireAfterSeconds=0)
    magic_link_collection.create_index("token", unique=True)
    magic_link_request_collection.create_index("key", unique=True)
    magic_link_request_collection.create_index("expires_at", expireAfterSeconds=0)
    # Helps the weekly classes calendar query.
    class_collection.create_index([("date", 1), ("status", 1)])
    allowed_email_collection.create_index("email", unique=True)
    allowed_email_collection.create_index([("active", 1), ("email", 1)])
    admin_access_collection.create_index("email", unique=True)
    admin_access_collection.create_index([("active", 1), ("email", 1)])
    trading_allowed_email_collection.create_index("email", unique=True)
    trading_allowed_email_collection.create_index([("active", 1), ("email", 1)])
    trading_gamemaster_access_collection.create_index("email", unique=True)
    trading_gamemaster_access_collection.create_index([("active", 1), ("email", 1)])
    trading_team_collection.create_index("team_code", unique=True)
    trading_team_collection.create_index("api_key", unique=True)
    trading_team_collection.create_index("members")
    trading_order_collection.create_index([("team_code", 1), ("period_index", 1)])
    trading_game_collection.create_index("key", unique=True)
    trading_session_collection.create_index("token_hash", unique=True)
    trading_session_collection.create_index("expires_at", expireAfterSeconds=0)
    resume_book_collection.create_index("student_email", unique=True)
    business_card_order_collection.create_index([("student_email", 1), ("created_at", -1)])
    event_registration_collection.create_index([("event_id", 1), ("student_email", 1)], unique=True)
    merch_order_collection.create_index([("student_email", 1), ("created_at", -1)])

    print("MongoDB connection successful")
    print("Connected to database:", db.name)
    print("Available collections:", db.list_collection_names())

except Exception as e:
    print("MongoDB connection failed:", e)
