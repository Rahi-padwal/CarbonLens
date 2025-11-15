"""
AI Insights Module - Rule-based AI Engine (MVP)
Generates intelligent suggestions based on activity patterns and thresholds
"""

from datetime import datetime, timedelta
from utils.firebase_config import get_collection

def generate_email_insight(email_count, avg_attachment_size, team_avg=None):
    """
    Generate insight for email activities
    
    Args:
        email_count: Number of emails sent
        avg_attachment_size: Average attachment size in MB
        team_avg: Team average email count (optional)
    
    Returns:
        str: Insight message
    """
    insights = []
    
    # High email volume insight
    if team_avg and email_count > team_avg * 1.4:
        percentage = int(((email_count - team_avg) / team_avg) * 100)
        insights.append(
            f"You sent {percentage}% more emails this week than your team average. "
            "Try batching updates or using collaboration tools instead."
        )
    elif email_count > 100:
        insights.append(
            f"You sent {email_count} emails this week. "
            "Consider consolidating multiple updates into fewer, comprehensive emails."
        )
    
    # Large attachment insight
    if avg_attachment_size > 5:
        insights.append(
            f"Your average attachment size is {avg_attachment_size:.1f}MB. "
            "Use cloud storage links (Drive/OneDrive) instead of attachments to reduce emissions."
        )
    
    return insights[0] if insights else None

def generate_meeting_insight(meeting_hours, avg_duration, has_video_count, total_meetings):
    """
    Generate insight for meeting activities
    
    Args:
        meeting_hours: Total hours in meetings
        avg_duration: Average meeting duration in minutes
        has_video_count: Number of meetings with video
        total_meetings: Total number of meetings
    
    Returns:
        str: Insight message
    """
    insights = []
    
    # Long meetings insight
    if avg_duration > 60:
        insights.append(
            f"Your average meeting duration is {avg_duration:.0f} minutes. "
            "Try keeping meetings under 30 minutes when possible, or split longer sessions."
        )
    
    # Video usage insight
    video_percentage = (has_video_count / total_meetings * 100) if total_meetings > 0 else 0
    if video_percentage > 80 and avg_duration < 15:
        insights.append(
            "For short meetings (<15 min), consider audio-only mode to reduce emissions by 75%."
        )
    
    # High meeting hours insight
    if meeting_hours > 20:
        insights.append(
            f"You spent {meeting_hours:.1f} hours in meetings this week. "
            "Evaluate if all meetings are necessary or if async communication could work."
        )
    
    return insights[0] if insights else None

def generate_storage_insight(storage_gb, unused_estimate_gb):
    """
    Generate insight for storage activities
    
    Args:
        storage_gb: Total storage used in GB
        unused_estimate_gb: Estimated unused storage in GB
    
    Returns:
        str: Insight message
    """
    insights = []
    
    # Unused storage insight
    if unused_estimate_gb > 1:
        co2_saved = unused_estimate_gb * 3.6  # 3.6kg per GB per year
        insights.append(
            f"Deleting {unused_estimate_gb:.1f}GB of unused data could save ~{co2_saved:.1f}kg CO₂ per year. "
            "Review and clean up old files regularly."
        )
    
    # High storage usage insight
    if storage_gb > 50:
        insights.append(
            f"You're using {storage_gb:.1f}GB of cloud storage. "
            "Consider archiving old files or using compression for large documents."
        )
    
    return insights[0] if insights else None

def generate_web_insight(idle_tabs, streaming_hours):
    """
    Generate insight for web browsing activities
    
    Args:
        idle_tabs: Number of idle/unused tabs detected
        streaming_hours: Hours spent streaming
    
    Returns:
        str: Insight message
    """
    insights = []
    
    # Idle tabs insight
    if idle_tabs > 10:
        insights.append(
            f"Detected {idle_tabs} idle browser tabs. "
            "Close unused tabs to reduce energy consumption and emissions."
        )
    
    # High streaming insight
    if streaming_hours > 5:
        insights.append(
            f"You streamed {streaming_hours:.1f} hours this week. "
            "Consider downloading content for offline viewing when possible."
        )
    
    return insights[0] if insights else None

def generate_insight(activity_type, **kwargs):
    """
    Universal function to generate insights for any activity type
    
    Args:
        activity_type: Type of activity ('email', 'meeting', 'storage', 'web')
        **kwargs: Activity-specific parameters
    
    Returns:
        str: Insight message or None
    """
    if activity_type == 'email':
        return generate_email_insight(
            email_count=kwargs.get('email_count', 0),
            avg_attachment_size=kwargs.get('avg_attachment_size', 0),
            team_avg=kwargs.get('team_avg', None)
        )
    
    elif activity_type == 'meeting':
        return generate_meeting_insight(
            meeting_hours=kwargs.get('meeting_hours', 0),
            avg_duration=kwargs.get('avg_duration', 0),
            has_video_count=kwargs.get('has_video_count', 0),
            total_meetings=kwargs.get('total_meetings', 0)
        )
    
    elif activity_type == 'storage':
        return generate_storage_insight(
            storage_gb=kwargs.get('storage_gb', 0),
            unused_estimate_gb=kwargs.get('unused_estimate_gb', 0)
        )
    
    elif activity_type == 'web':
        return generate_web_insight(
            idle_tabs=kwargs.get('idle_tabs', 0),
            streaming_hours=kwargs.get('streaming_hours', 0)
        )
    
    return None

def check_thresholds(user_id, period='weekly'):
    """
    Check if user activities exceed thresholds and generate insights
    
    Args:
        user_id: User ID
        period: Time period ('daily', 'weekly', 'monthly')
    
    Returns:
        list: List of insight messages
    """
    # This will be implemented when we have activity data
    # For now, returns empty list
    return []

