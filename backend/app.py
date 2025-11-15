"""
CarbonLens - Main Flask Application
Digital Carbon Footprint Tracker Backend
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)

# Configure CORS for frontend communication
default_cors_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
]

# Allow Chrome extension origins configured via environment variables
# CHROME_EXTENSION_IDS supports a comma-separated list for multiple builds
chrome_extension_ids = os.getenv("CHROME_EXTENSION_IDS")
if chrome_extension_ids:
    for ext_id in chrome_extension_ids.split(","):
        ext_id = ext_id.strip()
        if ext_id:
            default_cors_origins.append(f"chrome-extension://{ext_id}")
else:
    # Fallback: check both environment variable and use common extension IDs
    fallback_extension_id = os.getenv("CHROME_EXTENSION_ID", "").strip()
    if not fallback_extension_id:
        # Default to the extension ID from the error message
        fallback_extension_id = "capkbibnoldoldfccbeeanlopdmemdbp"
    if fallback_extension_id:
        default_cors_origins.append(f"chrome-extension://{fallback_extension_id}")

# Debug: print allowed origins
print(f"[CORS] Allowed origins: {default_cors_origins}")

CORS(app, resources={
    r"/api/*": {
        "origins": default_cors_origins,
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
    }
})

# Configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['DEBUG'] = os.getenv('DEBUG', 'False').lower() == 'true'

# Session configuration (for OAuth state management)
# Flask uses signed cookie-based sessions by default
# SECRET_KEY is used to sign session cookies

# Initialize Firebase (will be initialized on first import)
from utils.firebase_config import initialize_firebase

# Initialize Firebase connection
try:
    db = initialize_firebase()
    print("[OK] Firebase initialized successfully")
except Exception as e:
    print(f"[WARNING] Firebase initialization error: {e}")
    db = None

# Import routes
from routes.oauth_google import oauth_google_bp
from routes.oauth_outlook import oauth_outlook_bp
from routes.activities import activities_bp
from routes.insights import insights_bp
from routes.meetings import meetings_bp
from routes.storage import storage_bp

# Register blueprints
app.register_blueprint(oauth_google_bp, url_prefix='/auth/google')
app.register_blueprint(oauth_outlook_bp, url_prefix='/auth/outlook')
app.register_blueprint(activities_bp, url_prefix='/api/activities')
app.register_blueprint(insights_bp, url_prefix='/api/insights')
app.register_blueprint(meetings_bp, url_prefix='/api/meetings')
app.register_blueprint(storage_bp, url_prefix='/api/storage')

# Background Gmail poller (short-term fix for delayed inbound tracking)
def start_gmail_poller(poll_interval_seconds: int = 60):
    """Start a background thread that polls Gmail for new messages for
    all users with stored Google tokens. This is a short-term measure to
    reduce inbound tracking delay. For production, prefer Gmail push/history.
    """
    import threading
    import time
    from utils.firebase_config import get_collection

    def poller():
        print(f"[Gmail Poller] Starting poller (interval={poll_interval_seconds}s)")
        while True:
            try:
                tokens_coll = get_collection('oauth_tokens')
                query = tokens_coll.where('provider', '==', 'google').stream()
                for doc in query:
                    try:
                        user_id = doc.id
                        # Import here to avoid circular import at module load
                        from routes.oauth_google import sync_gmail_for_user
                        # Poll recent messages (last ~15 minutes) with small page
                        # days_back accepts fractional days (0.011 ~= 15.8 minutes)
                        result = sync_gmail_for_user(user_id, days_back=0.011, max_results=50)
                        print(f"[Gmail Poller] Synced {user_id}: {result.get('processed',0)} processed")
                    except Exception as e:
                        print(f"[Gmail Poller] Error syncing user {doc.id}: {e}")
            except Exception as e:
                print(f"[Gmail Poller] Polling loop error: {e}")
            time.sleep(poll_interval_seconds)

    thread = threading.Thread(target=poller, daemon=True)
    thread.start()

# Health check endpoint
@app.route('/api/health', methods=['GET', 'OPTIONS'])
def health_check():
    """Health check endpoint to verify server is running"""
    if request.method == 'OPTIONS':
        # Handle preflight request
        response = jsonify({'status': 'ok'})
        origin = request.headers.get('Origin', '')
        if origin in default_cors_origins or origin.startswith('chrome-extension://'):
            response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        return response, 204
    response = jsonify({
        'status': 'healthy',
        'message': 'CarbonLens API is running',
        'firebase_connected': db is not None
    })
    # Add CORS headers to response
    origin = request.headers.get('Origin', '')
    if origin in default_cors_origins or origin.startswith('chrome-extension://'):
        response.headers.add('Access-Control-Allow-Origin', origin)
    return response, 200

# Debug endpoint to check activities count
@app.route('/api/debug/activities-count', methods=['GET'])
def debug_activities_count():
    """Debug endpoint to check total activities in database"""
    if db is None:
        return jsonify({'error': 'Firebase not connected'}), 500
    
    try:
        from utils.firebase_config import get_collection
        activities_ref = get_collection('activities')
        # Get a sample to count
        all_docs = list(activities_ref.limit(1000).stream())
        
        # Group by email
        by_email = {}
        for doc in all_docs:
            data = doc.to_dict() or {}
            email = data.get('user_email') or 'unknown'
            by_email[email] = by_email.get(email, 0) + 1
        
        return jsonify({
            'total_activities': len(all_docs),
            'by_email': by_email,
            'sample_emails': list(by_email.keys())[:10]
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Root endpoint
@app.route('/', methods=['GET'])
def root():
    """Root endpoint"""
    return jsonify({
        'message': 'CarbonLens API',
        'version': '1.0.0',
        'endpoints': {
            'health': '/api/health',
            'auth_google_login': '/auth/google/login',
            'auth_google_callback': '/auth/google/callback',
            'auth_outlook_login': '/auth/outlook/login',
            'auth_outlook_callback': '/auth/outlook/callback',
            'activities': '/api/activities (coming soon)'
        }
    }), 200

# Error handlers
@app.errorhandler(404)
def not_found(error):
    # Enhanced 404 logging to help diagnose missing resources
    try:
        req_path = request.path
        method = request.method
        origin = request.headers.get('Origin', '')
        print(f"[404] Not Found: {method} {req_path} Origin={origin}")
    except Exception:
        print("[404] Not Found: (failed to read request details)")
    return jsonify({'error': 'Endpoint not found', 'path': request.path}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = app.config['DEBUG']
    
    print(f"\n[STARTING] CarbonLens Backend Server...")
    print(f"[INFO] Port: {port}")
    print(f"[INFO] Debug: {debug}")
    print(f"[INFO] API URL: http://localhost:{port}\n")
    
    app.run(host='0.0.0.0', port=port, debug=debug)

