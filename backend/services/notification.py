"""
PulseNet — AWS SNS Notification Service
=========================================
Sends SMS reminders to donors via AWS SNS direct SMS (no topic needed for 1:1 SMS).

Usage:
    from services.notification import send_sms_reminder
    await send_sms_reminder("+919876543210", "Your transfusion slot is due in 3 days...")
"""

from __future__ import annotations

import logging

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from config import get_settings

logger = logging.getLogger(__name__)


def _get_sns_client():
    settings = get_settings()
    return boto3.client(
        "sns",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
    )


async def send_sms_reminder(phone_number: str, message: str) -> dict:
    """
    Send a direct SMS via AWS SNS.
    phone_number must be in E.164 format: +91XXXXXXXXXX
    Returns the SNS response or raises HTTPException on failure.
    """
    settings = get_settings()

    # In DEMO_MODE: just log — no actual SMS sent
    if settings.DEMO_MODE:
        logger.info("[DEMO_MODE] SMS to %s: %s", phone_number, message)
        return {"MessageId": "demo-message-id", "demo": True}

    if not phone_number.startswith("+"):
        phone_number = f"+91{phone_number.lstrip('0')}"  # Assume India if no country code

    try:
        client = _get_sns_client()
        response = client.publish(
            PhoneNumber=phone_number,
            Message=message,
            MessageAttributes={
                "AWS.SNS.SMS.SMSType": {
                    "DataType": "String",
                    "StringValue": "Transactional",  # Highest delivery priority
                },
                "AWS.SNS.SMS.SenderID": {
                    "DataType": "String",
                    "StringValue": "PulseNet",
                },
            },
        )
        logger.info("SMS sent to %s: MessageId=%s", phone_number, response.get("MessageId"))
        return response
    except ClientError as exc:
        logger.error("SNS ClientError sending SMS to %s: %s", phone_number, exc)
        raise
    except BotoCoreError as exc:
        logger.error("BotoCoreError sending SMS to %s: %s", phone_number, exc)
        raise


def build_donor_reminder_message(donor_name: str, patient_name: str, due_date: str) -> str:
    """Standard reminder message template."""
    return (
        f"Hi {donor_name}, you are scheduled to donate blood for {patient_name} "
        f"on {due_date}. Please confirm your availability. "
        f"Contact Blood Warriors at bloodwarriors.in or reply YES to confirm. "
        f"Your donation saves a life. 🩸"
    )


def build_eligibility_message(donor_name: str, eligible_date: str) -> str:
    """Sent when a donor becomes eligible again."""
    return (
        f"Hi {donor_name}, great news! You are now eligible to donate blood again "
        f"from {eligible_date}. Log in to PulseNet to confirm your availability. "
        f"Blood Warriors thanks you! 🩸"
    )
