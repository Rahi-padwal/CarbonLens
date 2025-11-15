"""
Google OAuth Authentication Routes
Handles Google login and Gmail API integration
"""

from flask import Blueprint, request, jsonify, redirect, session
import os
import re
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import json
from datetime import datetime, timedelta
from utils.firebase_config import get_collection, COLLECTIONS
from utils.oauth_tokens import resolve_google_token_document

oauth_google_bp = Blueprint('oauth_google', __name__)

# OAuth 2.0 configuration
CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
REDIRECT_URI = os.getenv('GOOGLE_REDIRECT_URI', 'http://localhost:5000/auth/google/callback')
SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar.readonly',  # For Google Meet
    'https://www.googleapis.com/auth/drive.readonly',  # For Google Drive
]

# OAuth flow configuration
flow_config = {
    "web": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [REDIRECT_URI]
    }
}

def _get_frontend_url() -> str:
    """Return a usable frontend base URL with sensible default."""
    env_url = os.getenv('FRONTEND_URL')
    if env_url and env_url.strip():
        return env_url.rstrip('/')
    return 'http://localhost:5173'


def get_flow():
    """Create and return OAuth flow instance"""
    flow = Flow.from_client_config(
        flow_config,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI
    )
    return flow

@oauth_google_bp.route('/login', methods=['GET'])
def google_login():
    """
    Initiate Google OAuth login
    Returns authorization URL for frontend to redirect
    """
    try:
        flow = get_flow()
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent'  # Force consent to get refresh token
        )
        
        # Store state in session for security
        session['oauth_state'] = state
        
        return jsonify({
            'auth_url': authorization_url,
            'state': state
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': 'Failed to initiate Google OAuth',
            'message': str(e)
        }), 500

@oauth_google_bp.route('/callback', methods=['GET'])
def google_callback():
    """
    Handle Google OAuth callback
    Receives authorization code and exchanges for tokens
    """
    try:
        # Handle error responses from Google (e.g., user denied consent)
        error_param = request.args.get('error')
        if error_param:
            error_description = request.args.get('error_description', error_param)
            frontend_url = _get_frontend_url()
            # Redirect back to frontend with clear error context
            from urllib.parse import quote_plus
            redirect_url = (
                f"{frontend_url}/auth/error?"
                f"provider=google&error={quote_plus(error_param)}"
                f"&message={quote_plus(error_description)}"
            )
            return redirect(redirect_url, code=302)

        # Get authorization code from query params
        code = request.args.get('code')
        state = request.args.get('state')
        
        if not code:
            return jsonify({'error': 'Authorization code not provided'}), 400
        
        # Verify state (security check)
        if state != session.get('oauth_state'):
            return jsonify({'error': 'Invalid state parameter'}), 400
        
        # Exchange code for tokens
        flow = get_flow()
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        # Get user info
        user_info_service = build('oauth2', 'v2', credentials=credentials)
        user_info = user_info_service.userinfo().get().execute()
        
        user_email = user_info.get('email')
        user_name = user_info.get('name')
        user_id = user_info.get('id')
        
        # Store tokens in Firebase
        tokens_ref = get_collection('oauth_tokens').document(user_id)
        tokens_data = {
            'google_token': {
                'token': credentials.token,
                'refresh_token': credentials.refresh_token,
                'token_uri': credentials.token_uri,
                'client_id': credentials.client_id,
                'client_secret': credentials.client_secret,
                'scopes': credentials.scopes,
                'expiry': credentials.expiry.isoformat() if credentials.expiry else None
            },
            'user_email': user_email,
            'user_name': user_name,
            'updated_at': datetime.utcnow(),
            'provider': 'google'
        }
        tokens_ref.set(tokens_data, merge=True)
        
        # Create/update user in Firebase
        users_ref = get_collection('users').document(user_id)
        user_doc = users_ref.get()
        existing_data = user_doc.to_dict() if user_doc.exists else {}
        user_data = {
            'email': user_email,
            'name': user_name,
            'google_id': user_id,
            'last_login': datetime.utcnow(),
            'created_at': existing_data.get('created_at', datetime.utcnow())
        }
        users_ref.set(user_data, merge=True)
        
        # Redirect to frontend with user info
        frontend_url = _get_frontend_url()
        redirect_url = (
            f"{frontend_url}/dashboard?"
            f"provider=google&email={user_email}"
            f"&name={user_name.replace(' ', '+') if user_name else ''}"
            f"&id={user_id}"
        )
        return redirect(redirect_url)
        
    except Exception as e:
        return jsonify({
            'error': 'Google OAuth callback failed',
            'message': str(e)
        }), 500

@oauth_google_bp.route('/token/<user_id>', methods=['GET'])
def get_google_token(user_id):
    """
    Get stored Google OAuth token for a user
    Used by backend to make Gmail API calls
    """
    try:
        tokens_doc, _ = resolve_google_token_document(user_id)
        
        if not tokens_doc or not tokens_doc.exists:
            return jsonify({'error': 'No tokens found for user'}), 404
        
        tokens_data = tokens_doc.to_dict()
        google_token = tokens_data.get('google_token')
        
        if not google_token:
            return jsonify({'error': 'Google token not found'}), 404
        
        # Check if token is expired and refresh if needed
        if google_token.get('expiry'):
            expiry = datetime.fromisoformat(google_token['expiry'])
            if datetime.utcnow() >= expiry:
                # Token expired, need to refresh
                return jsonify({
                    'error': 'Token expired',
                    'needs_refresh': True
                }), 401
        
        return jsonify({
            'token': google_token.get('token'),
            'expiry': google_token.get('expiry'),
            'scopes': google_token.get('scopes')
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': 'Failed to get Google token',
            'message': str(e)
        }), 500

@oauth_google_bp.route('/refresh/<user_id>', methods=['POST'])
def refresh_google_token(user_id):
    """
    Refresh expired Google OAuth token
    """
    try:
        tokens_doc, tokens_ref = resolve_google_token_document(user_id)
        
        if not tokens_doc or not tokens_doc.exists or not tokens_ref:
            return jsonify({'error': 'No tokens found for user'}), 404
        
        tokens_data = tokens_doc.to_dict()
        google_token = tokens_data.get('google_token')
        
        if not google_token or not google_token.get('refresh_token'):
            return jsonify({'error': 'Refresh token not available'}), 400
        
        # Import Request for token refresh
        from google.auth.transport.requests import Request
        
        # Create credentials object and refresh
        creds = Credentials(
            token=None,
            refresh_token=google_token['refresh_token'],
            token_uri=google_token['token_uri'],
            client_id=google_token['client_id'],
            client_secret=google_token['client_secret'],
            scopes=google_token['scopes']
        )
        
        creds.refresh(Request())
        
        # Update stored token
        google_token['token'] = creds.token
        google_token['expiry'] = creds.expiry.isoformat() if creds.expiry else None
        
        tokens_ref.update({
            'google_token': google_token,
            'updated_at': datetime.utcnow()
        })
        
        return jsonify({
            'success': True,
            'token': creds.token,
            'expiry': creds.expiry.isoformat() if creds.expiry else None
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': 'Failed to refresh Google token',
            'message': str(e)
        }), 500

@oauth_google_bp.route('/gmail/sync/<user_id>', methods=['POST'])
def sync_gmail(user_id):
    """
    Sync Gmail data for a user
    Fetches emails and calculates emissions
    """
    try:
        # Get user's Google token
        tokens_doc, _ = resolve_google_token_document(user_id)
        
        if not tokens_doc or not tokens_doc.exists:
            return jsonify({'error': 'User not authenticated'}), 401
        
        tokens_data = tokens_doc.to_dict()
        google_token = tokens_data.get('google_token')
        
        if not google_token:
            return jsonify({'error': 'Google token not found'}), 404
        
        # Create credentials
        creds = Credentials(
            token=google_token['token'],
            refresh_token=google_token.get('refresh_token'),
            token_uri=google_token['token_uri'],
            client_id=google_token['client_id'],
            client_secret=google_token['client_secret'],
            scopes=google_token['scopes']
        )
        
        # Build Gmail service
        service = build('gmail', 'v1', credentials=creds)
        
        # Get sync parameters
        days_back = int(request.json.get('days_back', 30) if request.is_json else 30)
        max_results = int(request.json.get('max_results', 100) if request.is_json else 100)
        
        since_dt = datetime.utcnow() - timedelta(days=days_back)
        since_query = since_dt.strftime('%Y/%m/%d')
        
        from utils.activity_validator import validate_activity_payload
        from utils.emissions import calculate_activity_emission
        from utils.firebase_config import get_collection as get_fb_collection
        
        user_email = tokens_data.get('user_email')
        activities_ref = get_fb_collection('activities')
        
        stats = {
            'outbound': {'found': 0, 'processed': 0, 'skipped': 0},
            'inbound': {'found': 0, 'processed': 0, 'skipped': 0},
        }
        
        email_regex = re.compile(r'[\w\.-]+@[\w\.-]+\.[A-Za-z]{2,}')
        
        def parse_addresses(raw: str):
            if not raw:
                return []
            seen = set()
            addresses = []
            for match in email_regex.findall(raw):
                lowered = match.lower()
                if lowered not in seen:
                    seen.add(lowered)
                    addresses.append(match)
            return addresses
        
        def get_header(headers, name):
            for header in headers:
                if header.get('name', '').lower() == name.lower():
                    return header.get('value', '')
            return ''
        
        def count_attachments(parts_list):
            count = 0
            size = 0
            for part in parts_list or []:
                if part.get('filename'):
                    count += 1
                    size += int(part.get('body', {}).get('size', 0))
                if part.get('parts'):
                    sub_count, sub_size = count_attachments(part.get('parts'))
                    count += sub_count
                    size += sub_size
            return count, size
        
        def process_message(message_id: str, direction: str):
            try:
                msg_detail = service.users().messages().get(userId='me', id=message_id).execute()
                headers = msg_detail.get('payload', {}).get('headers', [])
                
                subject = get_header(headers, 'Subject')
                sender_candidates = parse_addresses(get_header(headers, 'From'))
                sender_email = sender_candidates[0] if sender_candidates else user_email
                
                recipient_fields = ' '.join([
                    get_header(headers, 'To'),
                    get_header(headers, 'Cc'),
                    get_header(headers, 'Bcc'),
                ])
                recipients = parse_addresses(recipient_fields)
                
                snippet = msg_detail.get('snippet', '')
                parts = msg_detail.get('payload', {}).get('parts', [])
                attachment_count, attachment_bytes = count_attachments(parts)
                
                existing_query = activities_ref.where('metadata.gmail_message_id', '==', message_id).limit(1).stream()
                if list(existing_query):
                    stats[direction]['skipped'] += 1
                    return
                
                timestamp_iso = datetime.fromtimestamp(int(msg_detail['internalDate']) / 1000).isoformat()
                
                activity_payload = {
                    'activityType': 'email',
                    'provider': 'gmail',
                    'timestamp': timestamp_iso,
                    'subject': subject,
                    'recipients': recipients,
                    'bodyPreview': snippet,
                    'attachmentCount': attachment_count,
                    'attachmentBytes': attachment_bytes,
                    'direction': direction,
                    'sender': sender_email,
                    'user_email': user_email,
                    'metadata': {
                        'source': 'gmail_api_sync',
                        'gmail_message_id': message_id,
                        'account_email': user_email,
                        'direction': direction,
                        'thread_id': msg_detail.get('threadId'),
                        'label_ids': msg_detail.get('labelIds', []),
                    }
                }
                
                normalized = validate_activity_payload(activity_payload)
                emission_kg = calculate_activity_emission(
                    'email',
                    attachment_size_mb=attachment_bytes / 1_000_000,
                    recipients_count=len(recipients) or 1
                )
                
                activity_doc = {
                    'activity_type': normalized.activity_type,
                    'provider': normalized.provider,
                    'timestamp': normalized.timestamp,
                    'platform': normalized.platform,
                    'mode': 'sync',
                    'extension_version': 'api-sync',
                    'user_id': None,
                    'user_email': normalized.user_email,
                    'emission_kg': emission_kg,
                    'payload': normalized.payload,
                    'metadata': normalized.metadata,
                    'raw_payload': activity_payload,
                    'created_at': datetime.utcnow(),
                    'updated_at': datetime.utcnow(),
                }
                
                activities_ref.document().set(activity_doc)
                stats[direction]['processed'] += 1
            except Exception as exc:
                print(f"[Gmail Sync] Error processing message {message_id}: {exc}")
                stats[direction]['skipped'] += 1
        
        directions = [
            ('outbound', {
                'userId': 'me',
                'maxResults': min(max_results, 500),
                'q': f'is:sent after:{since_query}',
            }),
            ('inbound', {
                'userId': 'me',
                'maxResults': min(max_results, 500),
                'labelIds': ['INBOX'],
                'q': f'after:{since_query}',
            }),
        ]
        
        for direction, params in directions:
            response = service.users().messages().list(**params).execute()
            messages = response.get('messages', []) or []
            stats[direction]['found'] = len(messages)
            for msg in messages[:max_results]:
                message_id = msg.get('id')
                if not message_id:
                    continue
                process_message(message_id, direction)
        
        total_found = sum(item['found'] for item in stats.values())
        total_processed = sum(item['processed'] for item in stats.values())
        total_skipped = sum(item['skipped'] for item in stats.values())
        
        return jsonify({
            'success': True,
            'messages_found': total_found,
            'processed': total_processed,
            'skipped': total_skipped,
            'processed_sent': stats['outbound']['processed'],
            'processed_received': stats['inbound']['processed'],
            'message': (
                'Gmail sync completed: '
                f"{stats['outbound']['processed']} sent, "
                f"{stats['inbound']['processed']} received processed"
            ),
        }), 200
        
    except HttpError as e:
        return jsonify({
            'error': 'Gmail API error',
            'message': str(e)
        }), 500
    except Exception as e:
        return jsonify({
            'error': 'Failed to sync Gmail',
            'message': str(e)
        }), 500

