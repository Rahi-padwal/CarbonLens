"""Activity payload validation and normalization utilities."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

ALLOWED_ACTIVITY_TYPES = {
    'email',
    'meeting',
    'storage',
    'browsing',
}

ALLOWED_PROVIDERS = {
    'gmail',
    'outlook',
    'google_meet',
    'microsoft_teams',
    'google_drive',
    'onedrive',
    'web',
}

DEFAULT_EXTENSION_VERSION = 'unknown'
DEFAULT_MODE = 'awareness'

class ActivityValidationError(ValueError):
    """Raised when an incoming activity payload fails validation."""


@dataclass
class NormalizedActivity:
    activity_type: str
    provider: str
    timestamp: datetime
    platform: str
    mode: str
    extension_version: str
    user_id: Optional[str]
    user_email: Optional[str]
    payload: Dict[str, Any]
    metadata: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            'activity_type': self.activity_type,
            'provider': self.provider,
            'timestamp': self.timestamp,
            'platform': self.platform,
            'mode': self.mode,
            'extension_version': self.extension_version,
            'user_id': self.user_id,
            'user_email': self.user_email,
            'payload': self.payload,
            'metadata': self.metadata,
        }


def validate_activity_payload(payload: Dict[str, Any]) -> NormalizedActivity:
    """Validate and normalize an incoming activity payload.

    Args:
        payload: Raw JSON payload from extension/background worker

    Returns:
        NormalizedActivity: structured payload ready for persistence

    Raises:
        ActivityValidationError: if validation fails
    """
    if not isinstance(payload, dict):
        raise ActivityValidationError('Payload must be a JSON object')

    activity_type = _require_string(payload, 'activityType').lower()
    if activity_type not in ALLOWED_ACTIVITY_TYPES:
        raise ActivityValidationError(f'Unsupported activityType: {activity_type}')

    provider = _optional_string(payload, 'provider', '').lower()
    if provider and provider not in ALLOWED_PROVIDERS:
        raise ActivityValidationError(f'Unsupported provider: {provider}')
    elif not provider:
        provider = _infer_provider(activity_type, payload)

    platform = _optional_string(payload, 'platform', provider)
    mode = _optional_string(payload, 'mode', DEFAULT_MODE)
    extension_version = _optional_string(payload, 'extensionVersion', DEFAULT_EXTENSION_VERSION)

    timestamp = _parse_timestamp(_optional_string(payload, 'timestamp', ''))

    user_info = payload.get('user')
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    if isinstance(user_info, dict):
        user_id = _optional_string(user_info, 'id', None)
        user_email = _optional_string(user_info, 'email', None)
    # Also check for top-level user_email (from extension)
    if not user_email:
        user_email = _optional_string(payload, 'user_email', None)
    # Also check metadata for account_email
    if not user_email:
        metadata_temp = payload.get('metadata')
        if isinstance(metadata_temp, dict):
            user_email = _optional_string(metadata_temp, 'account_email', None)

    metadata = payload.get('metadata') if isinstance(payload.get('metadata'), dict) else {}
    normalized_payload = _normalize_activity_details(activity_type, payload)

    return NormalizedActivity(
        activity_type=activity_type,
        provider=provider,
        timestamp=timestamp,
        platform=platform,
        mode=mode,
        extension_version=extension_version,
        user_id=user_id,
        user_email=user_email,
        payload=normalized_payload,
        metadata=metadata,
    )


def _normalize_activity_details(activity_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if activity_type == 'email':
        direction = _optional_string(payload, 'direction', 'outbound')
        direction = direction.lower() if direction else 'outbound'
        return {
            'subject': _optional_string(payload, 'subject', ''),
            'recipients': _normalize_recipients(payload.get('recipients')),
            'body_preview': _optional_string(payload, 'bodyPreview', ''),
            'attachment_count': _optional_int(payload, 'attachmentCount', 0),
            'attachment_bytes': _optional_int(payload, 'attachmentBytes', 0),
            'direction': direction,
            'sender': _optional_string(payload, 'sender', ''),
        }

    if activity_type == 'meeting':
        return {
            'title': _optional_string(payload, 'title', ''),
            'duration_minutes': _optional_int(payload, 'durationMinutes', 0),
            'participants_count': _optional_int(payload, 'participantsCount', 1),
            'has_video': bool(payload.get('hasVideo', True)),
        }

    if activity_type == 'storage':
        return {
            'action': _optional_string(payload, 'action', ''),
            'size_mb': _optional_float(payload, 'sizeMb', 0.0),
            'total_storage_gb': _optional_float(payload, 'totalStorageGb', 0.0),
            'days_stored': _optional_int(payload, 'daysStored', 0),
        }

    if activity_type == 'browsing':
        return {
            'site': _optional_string(payload, 'site', ''),
            'category': _optional_string(payload, 'category', ''),
            'duration_minutes': _optional_int(payload, 'durationMinutes', 0),
        }

    return {}


def _normalize_recipients(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [entry.strip() for entry in value.split(',') if entry.strip()]
    return []


def _parse_timestamp(value: str) -> datetime:
    if not value:
        return datetime.utcnow()
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            return dt
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError as exc:
        raise ActivityValidationError('timestamp must be in ISO 8601 format') from exc


def _require_string(container: Dict[str, Any], key: str) -> str:
    value = container.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ActivityValidationError(f'Missing or invalid {key}')
    return value.strip()


def _optional_string(container: Dict[str, Any], key: str, default: Optional[str]) -> Optional[str]:
    value = container.get(key)
    if value is None:
        return default
    if isinstance(value, str):
        return value.strip()
    return default


def _optional_int(container: Dict[str, Any], key: str, default: int) -> int:
    value = container.get(key)
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _optional_float(container: Dict[str, Any], key: str, default: float) -> float:
    value = container.get(key)
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _infer_provider(activity_type: str, payload: Dict[str, Any]) -> str:
    platform = _optional_string(payload, 'platform', '')
    if platform:
        return platform
    if activity_type == 'email':
        return 'gmail'
    if activity_type == 'meeting':
        return 'google_meet'
    if activity_type == 'storage':
        return 'google_drive'
    return 'web'
