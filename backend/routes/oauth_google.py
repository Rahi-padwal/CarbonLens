"""Google OAuth / Gmail sync routes."""

from flask import Blueprint, request, jsonify, redirect
import re
import time
from datetime import datetime, timedelta
import threading
import concurrent.futures

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from google_auth_oauthlib.flow import Flow
import os
import requests

from utils.oauth_tokens import resolve_google_token_document
from utils.firebase_config import get_collection


oauth_google_bp = Blueprint('oauth_google', __name__)

# Allow insecure transport for local development when explicitly enabled.
# Do NOT enable this in production. We enable when DEBUG env is true or
# when REDIRECT_URI is HTTP.
try:
    debug_env = os.getenv('DEBUG', 'False').lower()
    redirect_env = os.getenv('GOOGLE_REDIRECT_URI', '')
    if debug_env in ('1', 'true', 'yes') or (redirect_env and redirect_env.startswith('http://')):
        os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
except Exception:
    # Fail safe: don't block execution if env access fails
    pass


@oauth_google_bp.route('/token/<user_id>', methods=['GET'])
def get_google_token(user_id):
    try:
        tokens_doc, _ = resolve_google_token_document(user_id)
        if not tokens_doc or not tokens_doc.exists:
            return jsonify({'error': 'No tokens found for user'}), 404

        tokens_data = tokens_doc.to_dict()
        google_token = tokens_data.get('google_token')
        if not google_token:
            return jsonify({'error': 'Google token not found'}), 404

        expiry = google_token.get('expiry')
        if expiry:
            try:
                expiry_dt = datetime.fromisoformat(expiry)
                if datetime.utcnow() >= expiry_dt:
                    return jsonify({'error': 'Token expired', 'needs_refresh': True}), 401
            except Exception:
                # ignore parse errors and continue returning token info
                pass

        return jsonify({
            'token': google_token.get('token'),
            'expiry': google_token.get('expiry'),
            'scopes': google_token.get('scopes')
        }), 200

    except Exception as exc:
        return jsonify({'error': 'Failed to get Google token', 'message': str(exc)}), 500


def sync_gmail_for_user(user_identifier: str, days_back: float = 30, max_results: int = 100):
    """Fetch recent Gmail messages for a user and store them as activities.

    Returns a dict with stats: {'success': True, 'processed': X, ...}
    This helper can be called from the Flask route or from a background poller.
    """
    tokens_doc, _ = resolve_google_token_document(user_identifier)
    if not tokens_doc or not tokens_doc.exists:
        raise ValueError('No tokens found for user')

    tokens_data = tokens_doc.to_dict()
    google_token = tokens_data.get('google_token')
    if not google_token:
        raise ValueError('Google token not found in token document')

    creds = Credentials(
        token=google_token.get('token'),
        refresh_token=google_token.get('refresh_token'),
        token_uri=google_token.get('token_uri'),
        client_id=google_token.get('client_id'),
        client_secret=google_token.get('client_secret'),
        scopes=google_token.get('scopes', []),
    )

    service = build('gmail', 'v1', credentials=creds)

    since_dt = datetime.utcnow() - timedelta(days=days_back)
    since_query = int(since_dt.timestamp())

    activities_ref = get_collection('activities')

    stats = {
        'outbound': {'found': 0, 'processed': 0, 'skipped': 0},
        'inbound': {'found': 0, 'processed': 0, 'skipped': 0},
    }

    email_regex = re.compile(r'[\w\.-]+@[\w\.-]+\.[A-Za-z]{2,}')

    def parse_addresses(raw: str):
        if not raw:
            return []
        seen = set()
        out = []
        for m in email_regex.findall(raw):
            lowered = m.lower()
            if lowered not in seen:
                seen.add(lowered)
                out.append(m)
        return out

    def get_header(headers, name):
        for h in headers:
            if h.get('name', '').lower() == name.lower():
                return h.get('value', '')
        return ''

    def count_attachments(parts_list):
        cnt = 0
        size = 0
        for p in parts_list or []:
            if p.get('filename'):
                cnt += 1
                size += int(p.get('body', {}).get('size', 0) or 0)
            if p.get('parts'):
                sub_cnt, sub_size = count_attachments(p.get('parts'))
                cnt += sub_cnt
                size += sub_size
        return cnt, size

    from utils.activity_validator import validate_activity_payload
    from utils.emissions import calculate_activity_emission

    stats_lock = threading.Lock()

    def process_message(message_id: str, direction: str, user_email: str):
        try:
            # Fetch only necessary fields to reduce payload
            msg = service.users().messages().get(
                userId='me', id=message_id,
                format='full',
                fields='id,internalDate,payload(headers,parts(filename,body,size,parts)),snippet,threadId,labelIds'
            ).execute()

            headers = msg.get('payload', {}).get('headers', [])
            subject = get_header(headers, 'Subject')
            sender_candidates = parse_addresses(get_header(headers, 'From'))
            sender_email = sender_candidates[0] if sender_candidates else user_email

            recipient_fields = ' '.join([get_header(headers, 'To'), get_header(headers, 'Cc'), get_header(headers, 'Bcc')])
            recipients = parse_addresses(recipient_fields)

            snippet = msg.get('snippet', '')
            parts = msg.get('payload', {}).get('parts', [])
            attachment_count, attachment_bytes = count_attachments(parts)

            existing = list(activities_ref.where('metadata.gmail_message_id', '==', message_id).limit(1).stream())
            if existing:
                with stats_lock:
                    stats[direction]['skipped'] += 1
                return

            timestamp_iso = datetime.fromtimestamp(int(msg['internalDate']) / 1000).isoformat()

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
                    'thread_id': msg.get('threadId'),
                    'label_ids': msg.get('labelIds', []),
                }
            }

            normalized = validate_activity_payload(activity_payload)
            emission_kg = calculate_activity_emission(
                'email',
                attachment_size_mb=(attachment_bytes or 0) / 1_000_000,
                recipients_count=len(recipients) or 1,
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
            with stats_lock:
                stats[direction]['processed'] += 1

        except Exception as exc:
            print(f"[Gmail Sync] Error processing message {message_id}: {exc}")
            with stats_lock:
                stats[direction]['skipped'] += 1

    directions = [
        ('outbound', {'userId': 'me', 'maxResults': min(max_results, 500), 'q': f'is:sent after:{since_query}'}),
        ('inbound', {'userId': 'me', 'maxResults': min(max_results, 500), 'labelIds': ['INBOX'], 'q': f'after:{since_query}'}),
    ]

    for direction, base_params in directions:
        params = dict(base_params)
        processed_count = 0
        page_token = None
        total_found = 0

        max_workers = min(8, max_results or 1)
        futures = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            while True:
                if page_token:
                    params['pageToken'] = page_token
                t0 = time.time()
                resp = service.users().messages().list(**params).execute()
                t1 = time.time()
                print(f"[Gmail Sync] list() took {t1-t0:.2f}s for {direction}")

                messages = resp.get('messages', []) or []
                total_found += len(messages)
                for m in messages:
                    if processed_count >= max_results:
                        break
                    message_id = m.get('id')
                    if not message_id:
                        continue
                    futures.append(executor.submit(process_message, message_id, direction, tokens_data.get('user_email')))
                    processed_count += 1

                page_token = resp.get('nextPageToken')
                if not page_token or processed_count >= max_results:
                    break

            if futures:
                concurrent.futures.wait(futures)

        stats[direction]['found'] = total_found

    total_found = sum(v['found'] for v in stats.values())
    total_processed = sum(v['processed'] for v in stats.values())
    total_skipped = sum(v['skipped'] for v in stats.values())

    return {
        'success': True,
        'messages_found': total_found,
        'processed': total_processed,
        'skipped': total_skipped,
        'processed_sent': stats['outbound']['processed'],
        'processed_received': stats['inbound']['processed'],
        'message': f"Gmail sync completed: {stats['outbound']['processed']} sent, {stats['inbound']['processed']} received processed",
    }


@oauth_google_bp.route('/login', methods=['GET'])
def google_login():
    """Initiate Google OAuth login; redirect user to Google's consent screen."""
    try:
        CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
        CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')
        REDIRECT_URI = os.getenv('GOOGLE_REDIRECT_URI', 'http://localhost:5000/auth/google/callback')

        if not CLIENT_ID or not CLIENT_SECRET:
            return jsonify({'error': 'Google OAuth credentials not configured'}), 500

        client_config = {
            'web': {
                'client_id': CLIENT_ID,
                'client_secret': CLIENT_SECRET,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token'
            }
        }

        # Use full scope URIs for userinfo to avoid mismatches
        scopes = [
            'openid',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
        ]

        flow = Flow.from_client_config(client_config, scopes=scopes, redirect_uri=REDIRECT_URI)
        # Do not include previously granted scopes automatically; this prevents
        # Google from merging older scopes into the token response which can
        # trigger a "Scope has changed" error during token exchange.
        auth_url, state = flow.authorization_url(access_type='offline', include_granted_scopes=False, prompt='consent')

        # Redirect directly to Google's consent page
        return redirect(auth_url)
    except Exception as e:
        return jsonify({'error': 'Failed to start Google OAuth', 'message': str(e)}), 500


@oauth_google_bp.route('/callback', methods=['GET'])
def google_callback():
    """Handle Google OAuth callback, exchange code for tokens, store in Firestore, and redirect to frontend."""
    try:
        CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
        CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')
        REDIRECT_URI = os.getenv('GOOGLE_REDIRECT_URI', 'http://localhost:5000/auth/google/callback')

        client_config = {
            'web': {
                'client_id': CLIENT_ID,
                'client_secret': CLIENT_SECRET,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token'
            }
        }

        # Use full scope URIs for userinfo to avoid mismatches
        scopes = [
            'openid',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
        ]

        flow = Flow.from_client_config(client_config, scopes=scopes, redirect_uri=REDIRECT_URI)
        # Exchange the authorization response (includes code) for tokens
        flow.fetch_token(authorization_response=request.url)
        creds = flow.credentials

        access_token = creds.token
        refresh_token = getattr(creds, 'refresh_token', None)
        expires = getattr(creds, 'expiry', None)
        expiry_iso = expires.isoformat() if expires else None

        # Fetch user info
        user_resp = requests.get('https://www.googleapis.com/oauth2/v2/userinfo', headers={'Authorization': f'Bearer {access_token}'})
        if user_resp.status_code != 200:
            return jsonify({'error': 'Failed to fetch user info', 'message': user_resp.text}), 500

        user_info = user_resp.json()
        user_id = user_info.get('id')
        user_email = user_info.get('email')
        user_name = user_info.get('name')

        # Store tokens in Firestore
        tokens_ref = get_collection('oauth_tokens').document(user_id)
        tokens_data = {
            'google_token': {
                'token': access_token,
                'refresh_token': refresh_token,
                'token_uri': 'https://oauth2.googleapis.com/token',
                'client_id': CLIENT_ID,
                'client_secret': CLIENT_SECRET,
                'scopes': scopes,
                'expiry': expiry_iso,
            },
            'user_email': user_email,
            'user_name': user_name,
            'provider': 'google',
            'updated_at': datetime.utcnow(),
        }
        tokens_ref.set(tokens_data, merge=True)

        # Create/update user doc
        users_ref = get_collection('users').document(user_id)
        user_doc = users_ref.get()
        existing = user_doc.to_dict() if user_doc.exists else {}
        users_ref.set({
            'email': user_email,
            'name': user_name,
            'google_id': user_id,
            'last_login': datetime.utcnow(),
            'created_at': existing.get('created_at', datetime.utcnow())
        }, merge=True)

        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
        redirect_url = f"{frontend_url}/dashboard?provider=google&email={user_email}&name={user_name if user_name else ''}&id={user_id}"
        return redirect(redirect_url)

    except Exception as e:
        return jsonify({'error': 'Google OAuth callback failed', 'message': str(e)}), 500


@oauth_google_bp.route('/gmail/sync/<user_id>', methods=['POST'])
def sync_gmail(user_id):
    try:
        payload = request.get_json(silent=True) or {}
        days_back = float(payload.get('days_back', 30))
        max_results = int(payload.get('max_results', 100))

        result = sync_gmail_for_user(user_id, days_back=days_back, max_results=max_results)
        return jsonify(result), 200

    except HttpError as he:
        return jsonify({'error': 'Gmail API error', 'message': str(he)}), 500
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400
    except Exception as exc:
        return jsonify({'error': 'Failed to sync Gmail', 'message': str(exc)}), 500
