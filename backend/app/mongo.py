import os
import pymongo

from dotenv import load_dotenv

load_dotenv()
DATABASE_URI = os.getenv("DATABASE_URI", "mongodb://mongo:27017")

try:
    client = pymongo.MongoClient(DATABASE_URI)
    db = client.get_database("sign_up_system")  # Use the exact database name from Atlas
    user_collection = db["user_collection"]
    session_collection = db["session_collection"]  # For storing session information
    registration_collection = db["registration_collection"]  # For storing session registrations
    reflection_collection = db["reflection_collection"]  # For storing session reflections/verifications
    magic_link_collection = db["magic_link_collection"]  # For passwordless email sign-in codes
    class_collection = db["class_collection"]  # For admin-created group classes
    allowed_email_collection = db["allowed_email_collection"]  # Students allowed to access the portal
    admin_access_collection = db["admin_access_collection"]  # Admins managed from the database page

    # Indexes (idempotent — safe to run on every startup).
    # TTL index auto-deletes expired email codes from the collection.
    magic_link_collection.create_index("expires_at", expireAfterSeconds=0)
    magic_link_collection.create_index("token", unique=True)
    # Helps the weekly classes calendar query.
    class_collection.create_index([("date", 1), ("status", 1)])
    allowed_email_collection.create_index("email", unique=True)
    allowed_email_collection.create_index([("active", 1), ("email", 1)])
    admin_access_collection.create_index("email", unique=True)
    admin_access_collection.create_index([("active", 1), ("email", 1)])

    print("MongoDB connection successful")
    print("Connected to database:", db.name)
    print("Available collections:", db.list_collection_names())

except Exception as e:
    print("MongoDB connection failed:", e)
