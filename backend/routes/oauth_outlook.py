"""
Microsoft OAuth Authentication Routes
Handles Microsoft/Outlook login and Outlook API integration
"""

from flask import Blueprint, request, jsonify, session, redirect
from msal import ConfidentialClientApplication
import os
import re
from datetime import datetime, timedelta
from utils.firebase_config import get_collection, COLLECTIONS

oauth_outlook_bp = Blueprint('oauth_outlook', __name__)

# Microsoft OAuth configuration
CLIENT_ID = os.getenv('MICROSOFT_CLIENT_ID', '')
CLIENT_SECRET = os.getenv('MICROSOFT_CLIENT_SECRET', '')
REDIRECT_URI = os.getenv('MICROSOFT_REDIRECT_URI', 'http://localhost:5000/auth/outlook/callback')
AUTHORITY = 'https://login.microsoftonline.com/common'
SCOPES = [
    'User.Read',
    'Mail.Read',
    'Mail.Send',
    'Calendars.Read',  # For Teams meetings
    'Files.Read',  # For OneDrive
]

def get_msal_app():
    """Create and return MSAL application instance"""
    app = ConfidentialClientApplication(
        CLIENT_ID,
        authority=AUTHORITY,
        client_credential=CLIENT_SECRET
    )
    return app

@oauth_outlook_bp.route('/login', methods=['GET'])
def outlook_login():
    """
    Initiate Microsoft OAuth login
    Returns authorization URL for frontend to redirect
    """
    try:
        # Check if credentials are set
        if not CLIENT_ID or not CLIENT_SECRET:
            return jsonify({
                'error': 'Microsoft OAuth credentials not configured',
                'message': 'Please set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in .env file'
            }), 500
        
        app = get_msal_app()
        
        # Convert scopes to list to avoid frozenset issue
        scopes_list = list(SCOPES)
        
        # Generate authorization URL
        auth_url = app.get_authorization_request_url(
            scopes=scopes_list,
            redirect_uri=REDIRECT_URI,
            prompt='consent'
        )
        
        return jsonify({
            'auth_url': auth_url
        }), 200
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        return jsonify({
            'error': 'Failed to initiate Microsoft OAuth',
            'message': str(e),
            'trace': error_trace
        }), 500

@oauth_outlook_bp.route('/callback', methods=['GET'])
def outlook_callback():
    """
    Handle Microsoft OAuth callback
    Receives authorization code and exchanges for tokens
    """
    try:
        # Get authorization code from query params
        code = request.args.get('code')
        error = request.args.get('error')
        
        if error:
            return jsonify({
                'error': 'Microsoft OAuth error',
                'message': error
            }), 400
        
        if not code:
            return jsonify({'error': 'Authorization code not provided'}), 400
        
        # Exchange code for tokens
        app = get_msal_app()
        # Convert scopes to list to avoid frozenset issue
        scopes_list = list(SCOPES)
        result = app.acquire_token_by_authorization_code(
            code,
            scopes=scopes_list,
            redirect_uri=REDIRECT_URI
        )
        
        if 'error' in result:
            return jsonify({
                'error': 'Token acquisition failed',
                'message': result.get('error_description', result.get('error'))
            }), 500
        
        # Extract token information
        access_token = result.get('access_token')
        refresh_token = result.get('refresh_token')
        expires_in = result.get('expires_in', 3600)
        expiry = datetime.utcnow() + timedelta(seconds=expires_in)
        
        # Get user info from Microsoft Graph API
        import requests
        graph_endpoint = 'https://graph.microsoft.com/v1.0/me'
        headers = {'Authorization': f'Bearer {access_token}'}
        user_response = requests.get(graph_endpoint, headers=headers)
        
        if user_response.status_code != 200:
            return jsonify({
                'error': 'Failed to get user info',
                'message': user_response.text
            }), 500
        
        user_info = user_response.json()
        user_id = user_info.get('id')
        user_email = user_info.get('mail') or user_info.get('userPrincipalName')
        user_name = user_info.get('displayName')
        
        # Store tokens in Firebase
        tokens_ref = get_collection('oauth_tokens').document(user_id)
        tokens_data = {
            'outlook_token': {
                'access_token': access_token,
                'refresh_token': refresh_token,
                'expires_in': expires_in,
                'expiry': expiry.isoformat(),
                'scopes': SCOPES,
                'token_type': 'Bearer'
            },
            'user_email': user_email,
            'user_name': user_name,
            'updated_at': datetime.utcnow(),
            'provider': 'microsoft'
        }
        tokens_ref.set(tokens_data, merge=True)
        
        # Create/update user in Firebase
        users_ref = get_collection('users').document(user_id)
        user_doc = users_ref.get()
        existing_data = user_doc.to_dict() if user_doc.exists else {}
        user_data = {
            'email': user_email,
            'name': user_name,
            'microsoft_id': user_id,
            'last_login': datetime.utcnow(),
            'created_at': existing_data.get('created_at', datetime.utcnow())
        }
        users_ref.set(user_data, merge=True)
        
        # Redirect to frontend with user info
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
        redirect_url = (
            f"{frontend_url}/dashboard?"
            f"provider=microsoft&email={user_email}"
            f"&name={user_name.replace(' ', '+') if user_name else ''}"
            f"&id={user_id}"
        )
        return redirect(redirect_url)
        
    except Exception as e:
        return jsonify({
            'error': 'Microsoft OAuth callback failed',
            'message': str(e)
        }), 500

@oauth_outlook_bp.route('/token/<user_id>', methods=['GET'])
def get_outlook_token(user_id):
    """
    Get stored Microsoft OAuth token for a user
    Used by backend to make Outlook API calls
    """
    try:
        tokens_ref = get_collection('oauth_tokens').document(user_id)
        tokens_doc = tokens_ref.get()
        
        if not tokens_doc.exists:
            return jsonify({'error': 'No tokens found for user'}), 404
        
        tokens_data = tokens_doc.to_dict()
        outlook_token = tokens_data.get('outlook_token')
        
        if not outlook_token:
            return jsonify({'error': 'Outlook token not found'}), 404
        
        # Check if token is expired
        if outlook_token.get('expiry'):
            expiry = datetime.fromisoformat(outlook_token['expiry'])
            if datetime.utcnow() >= expiry:
                return jsonify({
                    'error': 'Token expired',
                    'needs_refresh': True
                }), 401
        
        return jsonify({
            'access_token': outlook_token.get('access_token'),
            'expiry': outlook_token.get('expiry'),
            'scopes': outlook_token.get('scopes')
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': 'Failed to get Outlook token',
            'message': str(e)
        }), 500

@oauth_outlook_bp.route('/refresh/<user_id>', methods=['POST'])
def refresh_outlook_token(user_id):
    """
    Refresh expired Microsoft OAuth token
    """
    try:
        tokens_ref = get_collection('oauth_tokens').document(user_id)
        tokens_doc = tokens_ref.get()
        
        if not tokens_doc.exists:
            return jsonify({'error': 'No tokens found for user'}), 404
        
        tokens_data = tokens_doc.to_dict()
        outlook_token = tokens_data.get('outlook_token')
        
        if not outlook_token or not outlook_token.get('refresh_token'):
            return jsonify({'error': 'Refresh token not available'}), 400
        
        # Refresh token using MSAL
        app = get_msal_app()
        # Convert scopes to list to avoid frozenset issue
        scopes_list = list(SCOPES)
        result = app.acquire_token_by_refresh_token(
            outlook_token['refresh_token'],
            scopes=scopes_list
        )
        
        if 'error' in result:
            return jsonify({
                'error': 'Token refresh failed',
                'message': result.get('error_description', result.get('error'))
            }), 500
        
        # Update stored token
        expires_in = result.get('expires_in', 3600)
        expiry = datetime.utcnow() + timedelta(seconds=expires_in)
        
        outlook_token['access_token'] = result.get('access_token')
        outlook_token['refresh_token'] = result.get('refresh_token', outlook_token['refresh_token'])
        outlook_token['expires_in'] = expires_in
        outlook_token['expiry'] = expiry.isoformat()
        
        tokens_ref.update({
            'outlook_token': outlook_token,
            'updated_at': datetime.utcnow()
        })
        
        return jsonify({
            'success': True,
            'access_token': result.get('access_token'),
            'expiry': expiry.isoformat()
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': 'Failed to refresh Outlook token',
            'message': str(e)
        }), 500

@oauth_outlook_bp.route('/outlook/sync/<user_id>', methods=['POST'])
def sync_outlook(user_id):
    """
    Sync Outlook data for a user
    Fetches emails and calculates emissions
    """
    try:
        # Get user's Microsoft token
        tokens_ref = get_collection('oauth_tokens').document(user_id)
        tokens_doc = tokens_ref.get()
        
        if not tokens_doc.exists:
            return jsonify({'error': 'User not authenticated'}), 401
        
        tokens_data = tokens_doc.to_dict()
        outlook_token = tokens_data.get('outlook_token')
        
        if not outlook_token:
            return jsonify({'error': 'Outlook token not found'}), 404
        
        access_token = outlook_token.get('access_token')
        
        # Get sync parameters
        days_back = int(request.json.get('days_back', 30) if request.is_json else 30)
        max_results = int(request.json.get('max_results', 100) if request.is_json else 100)
        
        since_dt = datetime.utcnow() - timedelta(days=days_back)
        since_iso = since_dt.isoformat() + 'Z'
        
        import requests
        graph_base = 'https://graph.microsoft.com/v1.0/me'
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        from utils.activity_validator import validate_activity_payload
        from utils.emissions import calculate_activity_emission
        from utils.firebase_config import get_collection as get_fb_collection
        
        user_email = tokens_data.get('user_email')
        activities_ref = get_fb_collection('activities')
        
        stats = {
            'outbound': {'found': 0, 'processed': 0, 'skipped': 0},
            'inbound': {'found': 0, 'processed': 0, 'skipped': 0},
        }
        
        def collect_recipients(entries):
            addresses = []
            seen = set()
            for entry in entries or []:
                address = entry.get('emailAddress', {}).get('address')
                if address:
                    lowered = address.lower()
                    if lowered not in seen:
                        seen.add(lowered)
                        addresses.append(address)
            return addresses
        
        def fetch_attachment_stats(message_id: str):
            attach_count = 0
            attach_bytes = 0
            attachments_resp = requests.get(
                f'{graph_base}/messages/{message_id}/attachments?$select=size',
                headers=headers
            )
            if attachments_resp.status_code == 200:
                attachments = attachments_resp.json().get('value', [])
                attach_count = len(attachments)
                attach_bytes = sum(int(att.get('size', 0)) for att in attachments)
            return attach_count, attach_bytes
        
        def process_message(message: dict, direction: str, timestamp_field: str):
            try:
                outlook_id = message.get('id')
                if not outlook_id:
                    return
                
                existing_query = activities_ref.where('metadata.outlook_message_id', '==', outlook_id).limit(1).stream()
                if list(existing_query):
                    stats[direction]['skipped'] += 1
                    return
                
                recipients = []
                for field in ('toRecipients', 'ccRecipients', 'bccRecipients'):
                    recipients.extend(collect_recipients(message.get(field)))
                
                # Ensure uniqueness while preserving order
                seen_recipients = set()
                deduped_recipients = []
                for addr in recipients:
                    lowered = addr.lower()
                    if lowered not in seen_recipients:
                        seen_recipients.add(lowered)
                        deduped_recipients.append(addr)
                
                sender_email = (
                    message.get('from', {}) or {}
                ).get('emailAddress', {}).get('address', user_email)
                
                timestamp_raw = message.get(timestamp_field)
                if timestamp_raw:
                    timestamp = datetime.fromisoformat(timestamp_raw.replace('Z', '+00:00'))
                else:
                    timestamp = datetime.utcnow()
                
                body_preview = message.get('bodyPreview', '')
                
                attachment_count = 0
                attachment_bytes = 0
                if message.get('hasAttachments'):
                    attachment_count, attachment_bytes = fetch_attachment_stats(outlook_id)
                
                activity_payload = {
                    'activityType': 'email',
                    'provider': 'outlook',
                    'timestamp': timestamp.isoformat(),
                    'subject': message.get('subject', ''),
                    'recipients': deduped_recipients,
                    'bodyPreview': body_preview,
                    'attachmentCount': attachment_count,
                    'attachmentBytes': attachment_bytes,
                    'direction': direction,
                    'sender': sender_email,
                    'user_email': user_email,
                    'metadata': {
                        'source': 'outlook_api_sync',
                        'outlook_message_id': outlook_id,
                        'account_email': user_email,
                        'direction': direction,
                    }
                }
                
                normalized = validate_activity_payload(activity_payload)
                emission_kg = calculate_activity_emission(
                    'email',
                    attachment_size_mb=attachment_bytes / 1_000_000,
                    recipients_count=len(deduped_recipients) or 1
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
                print(f"[Outlook Sync] Error processing message {message.get('id')}: {exc}")
                import traceback
                traceback.print_exc()
                stats[direction]['skipped'] += 1
        
        list_configs = [
            (
                'outbound',
                f'{graph_base}/messages',
                {
                    '$top': min(max_results, 100),
                    '$filter': f"isSent eq true and sentDateTime ge {since_iso}",
                    '$orderby': 'sentDateTime desc',
                    '$select': 'id,subject,hasAttachments,sentDateTime,from,toRecipients,ccRecipients,bccRecipients,bodyPreview',
                },
                'sentDateTime',
            ),
            (
                'inbound',
                f'{graph_base}/mailFolders/Inbox/messages',
                {
                    '$top': min(max_results, 100),
                    '$filter': f"receivedDateTime ge {since_iso}",
                    '$orderby': 'receivedDateTime desc',
                    '$select': 'id,subject,hasAttachments,receivedDateTime,from,toRecipients,ccRecipients,bccRecipients,bodyPreview',
                },
                'receivedDateTime',
            ),
        ]
        
        for direction, endpoint, params, timestamp_field in list_configs:
            response = requests.get(endpoint, headers=headers, params=params)
            
            if response.status_code == 401:
                return jsonify({
                    'error': 'Token expired',
                    'needs_refresh': True
                }), 401
            
            if response.status_code != 200:
                return jsonify({
                    'error': 'Outlook API error',
                    'message': response.text
                }), 500
            
            messages = response.json().get('value', []) or []
            stats[direction]['found'] = len(messages)
            for message in messages[:max_results]:
                process_message(message, direction, timestamp_field)
        
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
                'Outlook sync completed: '
                f"{stats['outbound']['processed']} sent, "
                f"{stats['inbound']['processed']} received processed"
            )
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': 'Failed to sync Outlook',
            'message': str(e)
        }), 500

