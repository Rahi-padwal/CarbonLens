"""
Insights Routes
Rule-based AI insights generation for activities
"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta, timezone
from utils.firebase_config import get_collection
from firebase_admin import firestore as admin_firestore
from utils.insights import (
    generate_email_insight,
    generate_meeting_insight,
    generate_storage_insight,
    generate_web_insight,
)

insights_bp = Blueprint('insights', __name__)


@insights_bp.route('', methods=['GET', 'OPTIONS'])
def get_insights():
    """Generate rule-based insights for user activities"""
    if request.method == 'OPTIONS':
        return _cors_preflight_response()

    user_email = request.args.get('userEmail')
    user_id = request.args.get('userId')
    period = request.args.get('period', 'weekly')  # daily, weekly, monthly

    if not user_email and not user_id:
        return jsonify({'error': 'userEmail or userId required'}), 400

    try:
        # Get activities for the period
        try:
            activities_ref = get_collection('activities')
        except Exception as exc:
            print(f"[Insights API] Firebase unavailable: {exc}")
            return jsonify({'error': 'Firebase not available', 'details': str(exc)}), 503
        query = activities_ref.order_by('timestamp', direction=admin_firestore.Query.DESCENDING).limit(500)

        # Calculate date range based on period
        now = datetime.now(timezone.utc)
        if period == 'daily':
            start_date = now - timedelta(days=1)
        elif period == 'weekly':
            start_date = now - timedelta(days=7)
        elif period == 'monthly':
            start_date = now - timedelta(days=30)
        else:
            start_date = now - timedelta(days=7)

        insights = []
        activities = []
        
        for doc in query.stream():
            data = doc.to_dict() or {}
            doc_email = str(data.get('user_email') or '').lower().strip()
            req_email = str(user_email or '').lower().strip()
            
            if user_email and doc_email != req_email:
                continue
            if user_id and data.get('user_id') != user_id:
                continue

            # Check if activity is within period
            ts = data.get('timestamp')
            if isinstance(ts, datetime):
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                else:
                    ts = ts.astimezone(timezone.utc)
                if ts < start_date:
                    continue

            activities.append(data)

        # Generate insights based on activities
        email_activities = [a for a in activities if (a.get('activity_type') or a.get('activityType')) == 'email']
        meeting_activities = [a for a in activities if (a.get('activity_type') or a.get('activityType')) == 'meeting']
        storage_activities = [a for a in activities if (a.get('activity_type') or a.get('activityType')) == 'storage']
        browsing_activities = [a for a in activities if (a.get('activity_type') or a.get('activityType')) == 'browsing']

        # Email insights
        if email_activities:
            email_count = len(email_activities)
            total_attachment_bytes = sum(
                (e.get('payload', {}).get('attachment_bytes') or e.get('payload', {}).get('attachmentBytes') or 0)
                for e in email_activities
            )
            avg_attachment_size = (total_attachment_bytes / email_count / 1_000_000) if email_count > 0 else 0
            
            email_insight = generate_email_insight(email_count, avg_attachment_size)
            if email_insight:
                insights.append({
                    'id': f'email_{len(insights)}',
                    'category': 'email',
                    'message': email_insight,
                    'created_at': datetime.utcnow().isoformat(),
                })

        # Meeting insights
        if meeting_activities:
            total_minutes = sum(
                (m.get('payload', {}).get('duration_minutes') or m.get('payload', {}).get('durationMinutes') or 0)
                for m in meeting_activities
            )
            meeting_hours = total_minutes / 60
            avg_duration = total_minutes / len(meeting_activities) if meeting_activities else 0
            has_video_count = sum(
                1 for m in meeting_activities
                if m.get('payload', {}).get('has_video') or m.get('payload', {}).get('hasVideo', True)
            )
            
            meeting_insight = generate_meeting_insight(
                meeting_hours, avg_duration, has_video_count, len(meeting_activities)
            )
            if meeting_insight:
                insights.append({
                    'id': f'meeting_{len(insights)}',
                    'category': 'meeting',
                    'message': meeting_insight,
                    'created_at': datetime.utcnow().isoformat(),
                })

        # Storage insights
        if storage_activities:
            total_storage_gb = sum(
                (s.get('payload', {}).get('total_storage_gb') or s.get('payload', {}).get('totalStorageGb') or 0)
                for s in storage_activities
            )
            # Estimate unused storage (simplified - 20% of total)
            unused_estimate_gb = total_storage_gb * 0.2
            
            storage_insight = generate_storage_insight(total_storage_gb, unused_estimate_gb)
            if storage_insight:
                insights.append({
                    'id': f'storage_{len(insights)}',
                    'category': 'storage',
                    'message': storage_insight,
                    'created_at': datetime.utcnow().isoformat(),
                })

        # Browsing insights (simplified)
        if browsing_activities:
            total_minutes = sum(
                (b.get('payload', {}).get('duration_minutes') or b.get('payload', {}).get('durationMinutes') or 0)
                for b in browsing_activities
            )
            streaming_hours = total_minutes / 60  # Simplified
            
            browsing_insight = generate_web_insight(0, streaming_hours)
            if browsing_insight:
                insights.append({
                    'id': f'browsing_{len(insights)}',
                    'category': 'browsing',
                    'message': browsing_insight,
                    'created_at': datetime.utcnow().isoformat(),
                })

        return jsonify({
            'success': True,
            'insights': insights,
            'count': len(insights),
        }), 200

    except Exception as e:
        print(f"[Insights API] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def _cors_preflight_response():
    response = jsonify({'status': 'ok'})
    origin = request.headers.get('Origin', '*')
    response.headers.add('Access-Control-Allow-Origin', origin)
    response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
    response.headers.add('Access-Control-Allow-Headers', request.headers.get('Access-Control-Request-Headers', 'Content-Type'))
    return response, 204

