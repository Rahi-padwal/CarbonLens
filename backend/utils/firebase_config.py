"""
Firebase Configuration and Database Connection
Handles Firebase Admin SDK initialization and Firestore database operations
"""

import firebase_admin
from firebase_admin import credentials, firestore
import os
from pathlib import Path

# Initialize Firebase Admin SDK (singleton pattern)
_db = None

def initialize_firebase():
    """
    Initialize Firebase Admin SDK with service account key
    Should be called once at application startup
    """
    global _db
    
    if _db is not None:
        return _db
    
    # Path to service account key
    current_dir = Path(__file__).parent.parent
    service_key_path = current_dir / "serviceAccountKey.json"
    
    if not service_key_path.exists():
        raise FileNotFoundError(
            f"Firebase service account key not found at {service_key_path}. "
            "Please add your serviceAccountKey.json file."
        )
    
    # Initialize Firebase Admin SDK
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(service_key_path))
        firebase_admin.initialize_app(cred)
    
    # Get Firestore database instance
    _db = firestore.client()
    return _db

def get_db():
    """
    Get Firestore database instance
    Returns the initialized database client
    """
    if _db is None:
        return initialize_firebase()
    return _db

# Collection name constants
COLLECTIONS = {
    'users': 'users',
    'activities': 'activities',
    'oauth_tokens': 'oauth_tokens',
    'insights': 'insights',
    'teams': 'teams',
    'reports': 'reports',
    'audit_logs': 'audit_logs',
    'settings': 'settings',
    'analytics_cache': 'analytics_cache'
}

def get_collection(collection_name):
    """
    Get a Firestore collection reference
    """
    db = get_db()
    return db.collection(COLLECTIONS.get(collection_name, collection_name))

