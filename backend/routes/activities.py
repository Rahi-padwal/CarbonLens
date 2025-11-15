"""
Activities Routes
Handles activity ingestion, validation, emission calculation, and retrieval.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from flask import Blueprint, jsonify, request
from google.cloud import firestore

from utils.activity_validator import (
    ActivityValidationError,
    NormalizedActivity,
    validate_activity_payload,
)
from utils.emissions import calculate_activity_emission
from utils.firebase_config import get_collection, get_db

activities_bp = Blueprint('activities', __name__)


@activities_bp.route('/log', methods=['POST', 'OPTIONS'])
def log_activity():
    """Ingest a new activity from the extension or other clients."""
    if request.method == 'OPTIONS':
        return _cors_preflight_response()

    raw_payload = request.get_json(silent=True)
    if raw_payload is None:
        return _error('Request body must be JSON'), 400

    print(f"[Activities API] Received activity log request: {raw_payload.get('activityType', 'unknown')}")
    print(f"[Activities API] Payload user_email: {raw_payload.get('user_email')}")
    print(f"[Activities API] Payload metadata: {raw_payload.get('metadata', {})}")
    print(f"[Activities API] Full payload keys: {list(raw_payload.keys())}")

    try:
        normalized = validate_activity_payload(raw_payload)
        print(f"[Activities API] Normalized - user_email: {normalized.user_email}, user_id: {normalized.user_id}")
        
        # Warn if email is still None after normalization
        if not normalized.user_email:
            print(f"[Activities API] WARNING: user_email is None after normalization! Payload had: user_email={raw_payload.get('user_email')}, metadata.account_email={raw_payload.get('metadata', {}).get('account_email')}")
    except ActivityValidationError as exc:
        print(f"[Activities API] Validation error: {exc}")
        return _error(str(exc)), 400

    try:
        emission_kg = _calculate_emission(normalized)
        print(f"[Activities API] Emission calculated: {emission_kg}kg")
        
        activity_doc = _build_activity_document(normalized, emission_kg, raw_payload)
        print(f"[Activities API] Activity document built: activity_type={activity_doc.get('activity_type')}, user_email={activity_doc.get('user_email')}, timestamp={activity_doc.get('timestamp')}")
        
        activity_id = _persist_activity(activity_doc)
        print(f"[Activities API] Activity persisted to Firebase: {activity_id}")
        
        # Update user totals (non-blocking - errors are logged but don't fail the request)
        try:
            _update_user_totals(activity_doc)
        except Exception as totals_exc:
            print(f"[Activities API] Warning: Failed to update user totals (non-fatal): {totals_exc}")
        
        print(f"[Activities API] Activity logged successfully: {activity_id}, email: {normalized.user_email}, emission: {emission_kg}kg")
    except Exception as exc:  # pylint: disable=broad-except
        print(f"[Activities API] ERROR storing activity: {exc}")
        print(f"[Activities API] Error type: {type(exc).__name__}")
        import traceback
        print("[Activities API] Full traceback:")
        traceback.print_exc()
        return _error('Failed to store activity', details=f"{type(exc).__name__}: {str(exc)}"), 500

    return jsonify({
        'success': True,
        'activityId': activity_id,
        'emissionKg': emission_kg,
        'message': 'Activity logged successfully',
    }), 201


@activities_bp.route('', methods=['GET', 'OPTIONS'])
def list_activities():
    """List activities with optional filtering by user and timeframe."""
    if request.method == 'OPTIONS':
        return _cors_preflight_response()

    user_id = request.args.get('userId')
    user_email = request.args.get('userEmail')
    since_str = request.args.get('since')
    until_str = request.args.get('until')
    limit = min(int(request.args.get('limit', 50)), 2000)  # Increased max limit to 2000 for all-time data

    print(f"[Activities API] Request params: userEmail={user_email}, userId={user_id}, limit={limit}, since={since_str}, until={until_str}")

    activities_ref = get_collection('activities')
    # For all-time queries (no date filters), use higher limit
    query_limit = limit * 5 if not since_str and not until_str else limit * 3
    query = activities_ref.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(query_limit)

    since_ts = _parse_iso_timestamp(since_str) if since_str else None
    until_ts = _parse_iso_timestamp(until_str) if until_str else None

    try:
        docs = query.stream()
    except Exception as exc:  # pylint: disable=broad-except
        print(f"[Activities API] Error loading activities: {exc}")
        return _error('Failed to load activities', details=str(exc)), 500

    items = []
    total_docs = 0
    filtered_by_email = 0
    filtered_by_time = 0
    
    for doc in docs:
        total_docs += 1
        data = doc.to_dict() or {}
        
        # Debug: print first few documents
        if total_docs <= 3:
            print(f"[Activities API] Doc {total_docs}: user_email={data.get('user_email')}, activity_type={data.get('activity_type')}, timestamp={data.get('timestamp')}")
        
        if user_id and data.get('user_id') != user_id:
            continue
        if user_email:
            doc_email_raw = data.get('user_email')
            # If email is None or empty, skip this document (it's invalid)
            if not doc_email_raw:
                filtered_by_email += 1
                continue
            doc_email = str(doc_email_raw).lower().strip()
            req_email = str(user_email).lower().strip()
            if doc_email != req_email:
                filtered_by_email += 1
                continue
        ts = data.get('timestamp')
        if since_ts and isinstance(ts, datetime) and ts < since_ts:
            filtered_by_time += 1
            continue
        if until_ts and isinstance(ts, datetime) and ts > until_ts:
            filtered_by_time += 1
            continue

        data['id'] = doc.id
        if isinstance(ts, datetime):
            data['timestamp'] = ts.isoformat()
        created_at = data.get('created_at')
        if isinstance(created_at, datetime):
            data['created_at'] = created_at.isoformat()

        items.append(data)
        if len(items) >= limit:
            break

    print(f"[Activities API] Results: total_docs={total_docs}, filtered_by_email={filtered_by_email}, filtered_by_time={filtered_by_time}, returned={len(items)}")
    
    # If no items found, let's check if there are ANY activities at all
    if len(items) == 0:
        all_activities_ref = get_collection('activities')
        all_docs = list(all_activities_ref.limit(10).stream())
        print(f"[Activities API] DEBUG: Found {len(all_docs)} total activities in database")
        print(f"[Activities API] DEBUG: Requested email: '{user_email}'")
        for i, doc in enumerate(all_docs[:5]):
            doc_data = doc.to_dict() or {}
            doc_email = doc_data.get('user_email') or 'NO_EMAIL'
            print(f"[Activities API] DEBUG Sample {i+1}: user_email='{doc_email}' (type: {type(doc_email).__name__}), activity_type={doc_data.get('activity_type')}")
        
        if user_email:
            # Try to find activities with similar emails
            matching_docs = []
            for doc in all_docs:
                doc_data = doc.to_dict() or {}
                doc_email = str(doc_data.get('user_email') or '').lower().strip()
                req_email = str(user_email).lower().strip()
                if req_email in doc_email or doc_email in req_email:
                    matching_docs.append(doc_email)
            if matching_docs:
                print(f"[Activities API] DEBUG: Found similar emails: {set(matching_docs)}")

    response = jsonify({
        'success': True,
        'count': len(items),
        'activities': items,
    })
    return response, 200


def _calculate_emission(activity: NormalizedActivity) -> float:
    payload = activity.payload
    if activity.activity_type == 'email':
        attachment_mb = (payload.get('attachment_bytes', 0) or 0) / 1_000_000
        recipients_count = max(len(payload.get('recipients', [])) or 1, 1)
        return calculate_activity_emission(
            'email',
            attachment_size_mb=attachment_mb,
            recipients_count=recipients_count,
        )
    if activity.activity_type == 'meeting':
        return calculate_activity_emission(
            'meeting',
            duration_minutes=payload.get('duration_minutes', 0) or 0,
            has_video=bool(payload.get('has_video', True)),
            participants_count=payload.get('participants_count', 1) or 1,
        )
    if activity.activity_type == 'storage':
        return calculate_activity_emission(
            'storage',
            upload_size_mb=payload.get('size_mb', 0.0) or 0.0,
            storage_gb=payload.get('total_storage_gb', 0.0) or 0.0,
            days_stored=payload.get('days_stored', 0) or 0,
        )
    if activity.activity_type == 'browsing':
        return calculate_activity_emission(
            'browsing',
            duration_minutes=payload.get('duration_minutes', 0) or 0,
        )
    return 0.0


def _build_activity_document(normalized: NormalizedActivity, emission_kg: float, raw_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Build activity document for Firebase storage."""
    # Ensure timestamp is a datetime object
    if isinstance(normalized.timestamp, datetime):
        timestamp = normalized.timestamp
    elif normalized.timestamp is None:
        timestamp = datetime.utcnow()
    else:
        # Try to parse if it's a string
        try:
            if isinstance(normalized.timestamp, str):
                timestamp = datetime.fromisoformat(normalized.timestamp.replace('Z', '+00:00'))
                # Remove timezone info for Firestore compatibility
                if timestamp.tzinfo:
                    timestamp = timestamp.replace(tzinfo=None)
            else:
                timestamp = datetime.utcnow()
        except (ValueError, AttributeError):
            timestamp = datetime.utcnow()
    
    now = datetime.utcnow()
    
    # Ensure user_email is set - try multiple sources
    user_email = normalized.user_email
    if not user_email:
        # Try from raw payload
        user_email = raw_payload.get('user_email')
    if not user_email:
        # Try from metadata
        metadata = raw_payload.get('metadata', {})
        if isinstance(metadata, dict):
            user_email = metadata.get('account_email')
    
    if not user_email:
        print(f"[Activities API] WARNING: Building activity document with user_email=None!")
        # Don't fail, but log the warning

    # Build the document
    activity_doc = {
        'activity_type': normalized.activity_type,
        'provider': normalized.provider,
        'timestamp': timestamp,
        'platform': normalized.platform,
        'mode': normalized.mode,
        'extension_version': normalized.extension_version,
        'user_id': normalized.user_id,
        'user_email': user_email,  # Use the extracted email (may be None)
        'emission_kg': float(emission_kg),  # Ensure it's a float
        'payload': normalized.payload,
        'metadata': normalized.metadata,
        'created_at': now,
        'updated_at': now,
    }
    
    # Only include raw_payload if it's not too large (Firestore has size limits)
    try:
        import json
        raw_payload_str = json.dumps(raw_payload)
        if len(raw_payload_str) < 1000000:  # 1MB limit
            activity_doc['raw_payload'] = raw_payload
        else:
            print(f"[Activities API] WARNING: raw_payload too large, omitting it")
    except Exception as e:
        print(f"[Activities API] WARNING: Could not serialize raw_payload: {e}")
    
    return activity_doc


def _persist_activity(activity_doc: Dict[str, Any]) -> str:
    """Persist activity to Firebase. Returns document ID."""
    try:
        activities_ref = get_collection('activities')
        if not activities_ref:
            raise Exception("Firebase activities collection is not available")
        
        ref = activities_ref.document()
        ref.set(activity_doc)
        return ref.id
    except Exception as e:
        print(f"[Activities API] Error persisting activity to Firebase: {e}")
        import traceback
        traceback.print_exc()
        raise


def _update_user_totals(activity_doc: Dict[str, Any]) -> None:
    """Update user totals in Firebase. Fails silently if there's an error."""
    try:
        user_id = activity_doc.get('user_id')
        user_email = activity_doc.get('user_email')
        emission_kg = activity_doc.get('emission_kg', 0.0)

        if not user_id and not user_email:
            print("[Activities API] Skipping user totals update: no user_id or user_email")
            return

        users_ref = get_collection('users')
        doc_id = user_id or user_email
        if not doc_id:
            print("[Activities API] Skipping user totals update: doc_id is None")
            return
        
        user_ref = users_ref.document(doc_id)

        db = get_db()
        if not db:
            print("[Activities API] WARNING: Firebase db is None, skipping user totals update")
            return
            
        transaction = db.transaction()

        @firestore.transactional
        def update_totals(txn: firestore.Transaction, ref: firestore.DocumentReference) -> None:
            try:
                snapshot = ref.get(transaction=txn)
                total_emission = emission_kg
                activity_count = 1

                if snapshot.exists:
                    data = snapshot.to_dict() or {}
                    total_emission += data.get('total_emission_kg', 0.0)
                    activity_count += data.get('activity_count', 0)

                update_data = {
                    'total_emission_kg': round(total_emission, 6),
                    'activity_count': activity_count,
                    'last_activity_at': activity_doc.get('timestamp'),
                    'updated_at': datetime.utcnow(),
                }
                
                if user_email:
                    update_data['email'] = user_email
                if user_id:
                    update_data['user_id'] = user_id

                txn.set(ref, update_data, merge=True)
            except Exception as e:
                print(f"[Activities API] Error in transaction: {e}")
                raise

        update_totals(transaction, user_ref)
    except Exception as exc:
        # Don't fail the whole request if user totals update fails
        print(f"[Activities API] Error updating user totals (non-fatal): {exc}")
        import traceback
        traceback.print_exc()


def _cors_preflight_response():
    response = jsonify({'status': 'ok'})
    origin = request.headers.get('Origin', '*')
    response.headers.add('Access-Control-Allow-Origin', origin)
    response.headers.add('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    response.headers.add('Access-Control-Allow-Headers', request.headers.get('Access-Control-Request-Headers', 'Content-Type'))
    return response, 204


def _error(message: str, *, details: Optional[str] = None):
    payload: Dict[str, Any] = {'success': False, 'error': message}
    if details:
        payload['details'] = details
    return jsonify(payload)


def _parse_iso_timestamp(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(tz=None)
    except ValueError:
        return None
