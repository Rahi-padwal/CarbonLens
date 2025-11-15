"""
Meeting Tracking Routes
Handles Google Meet and Microsoft Teams meeting tracking via APIs
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import requests
from utils.firebase_config import get_collection
from utils.oauth_tokens import resolve_google_token_document
from utils.activity_validator import validate_activity_payload
from utils.emissions import calculate_activity_emission

meetings_bp = Blueprint('meetings', __name__)


@meetings_bp.route('/google-meet/sync/<user_id>', methods=['POST'])
def sync_google_meet(user_id):
    """
    Sync Google Meet meetings for a user
    Fetches calendar events and identifies Google Meet meetings
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
        
        # Get sync parameters
        days_back = int(request.json.get('days_back', 30) if request.is_json else 30)
        max_results = int(request.json.get('max_results', 100) if request.is_json else 100)
        
        # Calculate date range
        time_min = (datetime.utcnow() - timedelta(days=days_back)).isoformat() + 'Z'
        time_max = datetime.utcnow().isoformat() + 'Z'
        
        # Build Calendar service
        service = build('calendar', 'v3', credentials=creds)
        
        # Fetch calendar events
        events_result = service.events().list(
            calendarId='primary',
            timeMin=time_min,
            timeMax=time_max,
            maxResults=min(max_results, 2500),
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        
        events = events_result.get('items', [])
        
        # Filter for Google Meet events
        meet_events = [
            e for e in events
            if e.get('conferenceData') or 
               'meet.google.com' in str(e.get('hangoutLink', '')) or
               'meet.google.com' in str(e.get('description', ''))
        ]
        
        user_email = tokens_data.get('user_email')
        activities_ref = get_collection('activities')
        processed_count = 0
        skipped_count = 0
        
        for event in meet_events[:max_results]:
            try:
                # Check if already exists
                event_id = event.get('id')
                existing_query = activities_ref.where('metadata.google_calendar_event_id', '==', event_id).limit(1).stream()
                if list(existing_query):
                    skipped_count += 1
                    continue
                
                # Extract meeting data
                start_time = event.get('start', {}).get('dateTime') or event.get('start', {}).get('date')
                end_time = event.get('end', {}).get('dateTime') or event.get('end', {}).get('date')
                
                if not start_time or not end_time:
                    continue
                
                start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
                duration_minutes = int((end_dt - start_dt).total_seconds() / 60)
                
                # Get attendees count
                attendees = event.get('attendees', [])
                participants_count = len([a for a in attendees if a.get('responseStatus') != 'declined']) or 1
                
                # Check if video is enabled (default True for Meet)
                has_video = True  # Google Meet typically has video
                if 'audio' in event.get('conferenceData', {}).get('conferenceSolution', {}).get('name', '').lower():
                    has_video = False
                
                # Create activity payload
                activity_payload = {
                    'activityType': 'meeting',
                    'provider': 'google_meet',
                    'timestamp': start_dt.isoformat(),
                    'title': event.get('summary', 'Untitled Meeting'),
                    'durationMinutes': duration_minutes,
                    'participantsCount': participants_count,
                    'hasVideo': has_video,
                    'user_email': user_email,
                    'metadata': {
                        'source': 'google_calendar_api',
                        'google_calendar_event_id': event_id,
                        'account_email': user_email,
                        'meet_link': event.get('hangoutLink') or event.get('conferenceData', {}).get('entryPoints', [{}])[0].get('uri', ''),
                    }
                }
                
                # Validate and save
                normalized = validate_activity_payload(activity_payload)
                emission_kg = calculate_activity_emission(
                    'meeting',
                    duration_minutes=duration_minutes,
                    has_video=has_video,
                    participants_count=participants_count
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
                processed_count += 1
                
            except Exception as e:
                print(f"[Google Meet Sync] Error processing event {event.get('id')}: {e}")
                skipped_count += 1
                continue
        
        return jsonify({
            'success': True,
            'events_found': len(meet_events),
            'processed': processed_count,
            'skipped': skipped_count,
            'message': f'Google Meet sync completed: {processed_count} new meetings processed'
        }), 200
        
    except HttpError as e:
        return jsonify({
            'error': 'Google Calendar API error',
            'message': str(e)
        }), 500
    except Exception as e:
        return jsonify({
            'error': 'Failed to sync Google Meet',
            'message': str(e)
        }), 500


@meetings_bp.route('/teams/sync/<user_id>', methods=['POST'])
def sync_teams(user_id):
    """
    Sync Microsoft Teams meetings for a user
    Fetches calendar events and identifies Teams meetings
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
            return jsonify({'error': 'Microsoft token not found'}), 404
        
        access_token = outlook_token.get('access_token')
        
        # Get sync parameters
        days_back = int(request.json.get('days_back', 30) if request.is_json else 30)
        max_results = int(request.json.get('max_results', 100) if request.is_json else 100)
        
        # Calculate date range
        time_min = (datetime.utcnow() - timedelta(days=days_back)).isoformat() + 'Z'
        time_max = datetime.utcnow().isoformat() + 'Z'
        
        # Fetch calendar events from Microsoft Graph
        graph_endpoint = 'https://graph.microsoft.com/v1.0/me/calendar/events'
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        params = {
            '$top': min(max_results, 100),
            '$filter': f"start/dateTime ge '{time_min}' and end/dateTime le '{time_max}'",
            '$orderby': 'start/dateTime desc'
        }
        
        response = requests.get(graph_endpoint, headers=headers, params=params)
        
        if response.status_code == 401:
            return jsonify({
                'error': 'Token expired',
                'needs_refresh': True
            }), 401
        
        if response.status_code != 200:
            return jsonify({
                'error': 'Microsoft Graph API error',
                'message': response.text
            }), 500
        
        events = response.json().get('value', [])
        
        # Filter for Teams meetings
        teams_events = [
            e for e in events
            if e.get('isOnlineMeeting') or
               'teams.microsoft.com' in str(e.get('onlineMeeting', {}).get('joinUrl', '')) or
               'teams' in str(e.get('onlineMeeting', {})).lower()
        ]
        
        user_email = tokens_data.get('user_email')
        activities_ref = get_collection('activities')
        processed_count = 0
        skipped_count = 0
        
        for event in teams_events[:max_results]:
            try:
                # Check if already exists
                event_id = event.get('id')
                existing_query = activities_ref.where('metadata.microsoft_event_id', '==', event_id).limit(1).stream()
                if list(existing_query):
                    skipped_count += 1
                    continue
                
                # Extract meeting data
                start_time = event.get('start', {}).get('dateTime')
                end_time = event.get('end', {}).get('dateTime')
                
                if not start_time or not end_time:
                    continue
                
                start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
                duration_minutes = int((end_dt - start_dt).total_seconds() / 60)
                
                # Get attendees count
                attendees = event.get('attendees', [])
                participants_count = len([a for a in attendees if a.get('status', {}).get('response') != 'declined']) or 1
                
                # Check if video is enabled
                has_video = event.get('isOnlineMeeting', True)  # Teams meetings typically have video
                
                # Create activity payload
                activity_payload = {
                    'activityType': 'meeting',
                    'provider': 'microsoft_teams',
                    'timestamp': start_dt.isoformat(),
                    'title': event.get('subject', 'Untitled Meeting'),
                    'durationMinutes': duration_minutes,
                    'participantsCount': participants_count,
                    'hasVideo': has_video,
                    'user_email': user_email,
                    'metadata': {
                        'source': 'microsoft_graph_api',
                        'microsoft_event_id': event_id,
                        'account_email': user_email,
                        'teams_link': event.get('onlineMeeting', {}).get('joinUrl', ''),
                    }
                }
                
                # Validate and save
                normalized = validate_activity_payload(activity_payload)
                emission_kg = calculate_activity_emission(
                    'meeting',
                    duration_minutes=duration_minutes,
                    has_video=has_video,
                    participants_count=participants_count
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
                processed_count += 1
                
            except Exception as e:
                print(f"[Teams Sync] Error processing event {event.get('id')}: {e}")
                skipped_count += 1
                continue
        
        return jsonify({
            'success': True,
            'events_found': len(teams_events),
            'processed': processed_count,
            'skipped': skipped_count,
            'message': f'Microsoft Teams sync completed: {processed_count} new meetings processed'
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': 'Failed to sync Microsoft Teams',
            'message': str(e)
        }), 500

