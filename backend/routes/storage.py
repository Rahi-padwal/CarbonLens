"""
Storage Tracking Routes
Handles Google Drive and OneDrive storage tracking via APIs
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

storage_bp = Blueprint('storage', __name__)


@storage_bp.route('/google-drive/sync/<user_id>', methods=['POST'])
def sync_google_drive(user_id):
    """
    Sync Google Drive storage for a user
    Tracks file uploads and storage usage
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
        since_date = (datetime.utcnow() - timedelta(days=days_back)).isoformat() + 'Z'
        
        # Build Drive service
        service = build('drive', 'v3', credentials=creds)
        
        # Get storage quota
        about = service.about().get(fields='storageQuota').execute()
        storage_quota = about.get('storageQuota', {})
        total_storage_bytes = int(storage_quota.get('limit', 0))
        used_storage_bytes = int(storage_quota.get('usage', 0))
        total_storage_gb = total_storage_bytes / (1024 ** 3)
        
        # Fetch recent files
        results = service.files().list(
            pageSize=min(max_results, 100),
            fields='nextPageToken, files(id, name, size, createdTime, modifiedTime, mimeType)',
            orderBy='modifiedTime desc',
            q=f"modifiedTime >= '{since_date}'"
        ).execute()
        
        files = results.get('files', [])
        
        user_email = tokens_data.get('user_email')
        activities_ref = get_collection('activities')
        processed_count = 0
        skipped_count = 0
        
        for file in files[:max_results]:
            try:
                # Check if already exists
                file_id = file.get('id')
                existing_query = activities_ref.where('metadata.google_drive_file_id', '==', file_id).limit(1).stream()
                if list(existing_query):
                    skipped_count += 1
                    continue
                
                # Extract file data
                file_size_bytes = int(file.get('size', 0))
                size_mb = file_size_bytes / (1024 ** 2)
                modified_time = file.get('modifiedTime')
                
                if not modified_time:
                    continue
                
                modified_dt = datetime.fromisoformat(modified_time.replace('Z', '+00:00'))
                
                # Calculate days stored (from creation to now)
                created_time = file.get('createdTime')
                if created_time:
                    created_dt = datetime.fromisoformat(created_time.replace('Z', '+00:00'))
                    days_stored = (datetime.utcnow() - created_dt.replace(tzinfo=None)).days
                else:
                    days_stored = 0
                
                # Create activity payload
                activity_payload = {
                    'activityType': 'storage',
                    'provider': 'google_drive',
                    'timestamp': modified_dt.isoformat(),
                    'action': 'upload',
                    'sizeMb': size_mb,
                    'totalStorageGb': total_storage_gb,
                    'daysStored': days_stored,
                    'user_email': user_email,
                    'metadata': {
                        'source': 'google_drive_api',
                        'google_drive_file_id': file_id,
                        'file_name': file.get('name', ''),
                        'mime_type': file.get('mimeType', ''),
                        'account_email': user_email,
                    }
                }
                
                # Validate and save
                normalized = validate_activity_payload(activity_payload)
                emission_kg = calculate_activity_emission(
                    'storage',
                    upload_size_mb=size_mb,
                    storage_gb=total_storage_gb,
                    days_stored=days_stored
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
                print(f"[Google Drive Sync] Error processing file {file.get('id')}: {e}")
                skipped_count += 1
                continue
        
        return jsonify({
            'success': True,
            'files_found': len(files),
            'processed': processed_count,
            'skipped': skipped_count,
            'total_storage_gb': total_storage_gb,
            'used_storage_gb': used_storage_bytes / (1024 ** 3),
            'message': f'Google Drive sync completed: {processed_count} new files processed'
        }), 200
        
    except HttpError as e:
        return jsonify({
            'error': 'Google Drive API error',
            'message': str(e)
        }), 500
    except Exception as e:
        return jsonify({
            'error': 'Failed to sync Google Drive',
            'message': str(e)
        }), 500


@storage_bp.route('/onedrive/sync/<user_id>', methods=['POST'])
def sync_onedrive(user_id):
    """
    Sync OneDrive storage for a user
    Tracks file uploads and storage usage
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
        since_date = (datetime.utcnow() - timedelta(days=days_back)).isoformat() + 'Z'
        
        # Get drive info and recent files
        graph_endpoint = 'https://graph.microsoft.com/v1.0/me/drive'
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        # Get drive storage quota
        drive_info = requests.get(f'{graph_endpoint}', headers=headers).json()
        quota = drive_info.get('quota', {})
        total_storage_bytes = int(quota.get('total', 0))
        used_storage_bytes = int(quota.get('used', 0))
        total_storage_gb = total_storage_bytes / (1024 ** 3)
        
        # Fetch recent files
        files_endpoint = f'{graph_endpoint}/root/children'
        params = {
            '$top': min(max_results, 100),
            '$orderby': 'lastModifiedDateTime desc',
            '$filter': f"lastModifiedDateTime ge {since_date}"
        }
        
        response = requests.get(files_endpoint, headers=headers, params=params)
        
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
        
        files = response.json().get('value', [])
        
        user_email = tokens_data.get('user_email')
        activities_ref = get_collection('activities')
        processed_count = 0
        skipped_count = 0
        
        for file in files[:max_results]:
            try:
                # Check if already exists
                file_id = file.get('id')
                existing_query = activities_ref.where('metadata.onedrive_file_id', '==', file_id).limit(1).stream()
                if list(existing_query):
                    skipped_count += 1
                    continue
                
                # Extract file data
                file_size_bytes = int(file.get('size', 0))
                size_mb = file_size_bytes / (1024 ** 2)
                modified_time = file.get('lastModifiedDateTime')
                
                if not modified_time:
                    continue
                
                modified_dt = datetime.fromisoformat(modified_time.replace('Z', '+00:00'))
                
                # Calculate days stored
                created_time = file.get('createdDateTime')
                if created_time:
                    created_dt = datetime.fromisoformat(created_time.replace('Z', '+00:00'))
                    days_stored = (datetime.utcnow() - created_dt.replace(tzinfo=None)).days
                else:
                    days_stored = 0
                
                # Create activity payload
                activity_payload = {
                    'activityType': 'storage',
                    'provider': 'onedrive',
                    'timestamp': modified_dt.isoformat(),
                    'action': 'upload',
                    'sizeMb': size_mb,
                    'totalStorageGb': total_storage_gb,
                    'daysStored': days_stored,
                    'user_email': user_email,
                    'metadata': {
                        'source': 'onedrive_api',
                        'onedrive_file_id': file_id,
                        'file_name': file.get('name', ''),
                        'mime_type': file.get('file', {}).get('mimeType', ''),
                        'account_email': user_email,
                    }
                }
                
                # Validate and save
                normalized = validate_activity_payload(activity_payload)
                emission_kg = calculate_activity_emission(
                    'storage',
                    upload_size_mb=size_mb,
                    storage_gb=total_storage_gb,
                    days_stored=days_stored
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
                print(f"[OneDrive Sync] Error processing file {file.get('id')}: {e}")
                skipped_count += 1
                continue
        
        return jsonify({
            'success': True,
            'files_found': len(files),
            'processed': processed_count,
            'skipped': skipped_count,
            'total_storage_gb': total_storage_gb,
            'used_storage_gb': used_storage_bytes / (1024 ** 3),
            'message': f'OneDrive sync completed: {processed_count} new files processed'
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': 'Failed to sync OneDrive',
            'message': str(e)
        }), 500

