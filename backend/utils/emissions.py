"""
CO₂ Emission Calculation Module
Calculates carbon emissions for different digital activities based on emission coefficients
"""

# Emission coefficients (in kg CO₂)
EMISSION_COEFFICIENTS = {
    # Email emissions
    # Aligning with user formula: C = 0.3 g base, A = 15 g per MB
    'email_base': 0.0003,  # 0.3 g per email (base) -> 0.0003 kg
    'email_attachment_per_mb': 0.015,  # 15 g per MB -> 0.015 kg per MB
    
    # Meeting emissions
    'meeting_per_hour_video': 1.6,  # 1.6kg per hour with video
    'meeting_per_hour_audio': 0.4,  # 0.4kg per hour audio-only
    
    # Storage emissions
    'storage_per_gb_per_year': 3.6,  # 3.6kg per GB per year
    'storage_upload_per_mb': 0.0001,  # 0.1g per MB uploaded
    'storage_download_per_mb': 0.0001,  # 0.1g per MB downloaded
    
    # Web browsing emissions
    'web_browsing_per_minute': 0.0002,  # 0.2g per minute
    'pdf_reading_per_minute': 0.00015,  # 0.15g per minute
    'streaming_per_minute': 0.0005,  # 0.5g per minute
}

def calculate_email_emission(attachment_size_mb=0, recipients_count=1):
    """
    Calculate CO₂ emission for sending an email
    
    Args:
        attachment_size_mb: Size of attachments in MB
        recipients_count: Number of recipients (default: 1)
    
    Returns:
        float: CO₂ emission in kg
    """
    base_emission = EMISSION_COEFFICIENTS['email_base']
    attachment_emission = attachment_size_mb * EMISSION_COEFFICIENTS['email_attachment_per_mb']
    
    # Multiply by number of recipients (each recipient receives a copy)
    total_emission = (base_emission + attachment_emission) * recipients_count
    
    return round(total_emission, 6)  # Round to 6 decimal places (milligrams precision)

def calculate_meeting_emission(duration_minutes, has_video=True, participants_count=1):
    """
    Calculate CO₂ emission for a virtual meeting
    
    Args:
        duration_minutes: Meeting duration in minutes
        has_video: Whether video was enabled (default: True)
        participants_count: Number of participants (default: 1)
    
    Returns:
        float: CO₂ emission in kg
    """
    duration_hours = duration_minutes / 60.0
    
    if has_video:
        emission_per_hour = EMISSION_COEFFICIENTS['meeting_per_hour_video']
    else:
        emission_per_hour = EMISSION_COEFFICIENTS['meeting_per_hour_audio']
    
    # Emission scales with participants (each participant consumes energy)
    total_emission = emission_per_hour * duration_hours * participants_count
    
    return round(total_emission, 6)

def calculate_storage_emission(upload_size_mb=0, download_size_mb=0, storage_gb=0, days_stored=0):
    """
    Calculate CO₂ emission for cloud storage operations
    
    Args:
        upload_size_mb: Size uploaded in MB
        download_size_mb: Size downloaded in MB
        storage_gb: Total storage used in GB
        days_stored: Number of days data is stored (for annual calculation)
    
    Returns:
        float: CO₂ emission in kg
    """
    upload_emission = upload_size_mb * EMISSION_COEFFICIENTS['storage_upload_per_mb']
    download_emission = download_size_mb * EMISSION_COEFFICIENTS['storage_download_per_mb']
    
    # Annual storage emission (prorated by days)
    if storage_gb > 0 and days_stored > 0:
        annual_emission = EMISSION_COEFFICIENTS['storage_per_gb_per_year'] * storage_gb
        storage_emission = (annual_emission * days_stored) / 365.0
    else:
        storage_emission = 0
    
    total_emission = upload_emission + download_emission + storage_emission
    
    return round(total_emission, 6)

def calculate_web_emission(activity_type, duration_minutes):
    """
    Calculate CO₂ emission for web browsing and other activities
    
    Args:
        activity_type: Type of activity ('browsing', 'pdf_reading', 'streaming')
        duration_minutes: Duration in minutes
    
    Returns:
        float: CO₂ emission in kg
    """
    coefficient_key = {
        'browsing': 'web_browsing_per_minute',
        'pdf_reading': 'pdf_reading_per_minute',
        'streaming': 'streaming_per_minute'
    }.get(activity_type, 'web_browsing_per_minute')
    
    emission_per_minute = EMISSION_COEFFICIENTS[coefficient_key]
    total_emission = emission_per_minute * duration_minutes
    
    return round(total_emission, 6)

def calculate_activity_emission(activity_type, **kwargs):
    """
    Universal function to calculate emission for any activity type
    
    Args:
        activity_type: Type of activity ('email', 'meeting', 'storage', 'web')
        **kwargs: Activity-specific parameters
    
    Returns:
        float: CO₂ emission in kg
    """
    if activity_type == 'email':
        return calculate_email_emission(
            attachment_size_mb=kwargs.get('attachment_size_mb', 0),
            recipients_count=kwargs.get('recipients_count', 1)
        )
    
    elif activity_type == 'meeting':
        return calculate_meeting_emission(
            duration_minutes=kwargs.get('duration_minutes', 0),
            has_video=kwargs.get('has_video', True),
            participants_count=kwargs.get('participants_count', 1)
        )
    
    elif activity_type == 'storage':
        return calculate_storage_emission(
            upload_size_mb=kwargs.get('upload_size_mb', 0),
            download_size_mb=kwargs.get('download_size_mb', 0),
            storage_gb=kwargs.get('storage_gb', 0),
            days_stored=kwargs.get('days_stored', 0)
        )
    
    elif activity_type in ['browsing', 'pdf_reading', 'streaming']:
        return calculate_web_emission(
            activity_type=activity_type,
            duration_minutes=kwargs.get('duration_minutes', 0)
        )
    
    else:
        raise ValueError(f"Unknown activity type: {activity_type}")

def get_emission_coefficients():
    """
    Get current emission coefficients (for settings/configuration)
    
    Returns:
        dict: Dictionary of emission coefficients
    """
    return EMISSION_COEFFICIENTS.copy()

