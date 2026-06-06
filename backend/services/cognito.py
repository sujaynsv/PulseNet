"""
PulseNet — AWS Cognito User Management
========================================
Handles Cognito user pool operations:
  - InitiateAuth (login → returns JWT tokens)
  - SignUp (donor/patient self-registration)
  - AdminAddUserToGroup (assign role group)
  - AdminConfirmSignUp (auto-confirm in DEMO_MODE)

In DEMO_MODE: skips Cognito entirely, generates HS256 JWTs locally.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Literal

import boto3
import hmac, hashlib, base64
from jose import jwt
from botocore.exceptions import ClientError

from config import Settings, get_settings

logger = logging.getLogger(__name__)

Role = Literal["Admin", "Donor", "Patient"]


# ── DEMO_MODE: local JWT generation ──────────────────────────────────────────

def create_demo_token(sub: str, email: str, role: Role, settings: Settings) -> str:
    """Creates a local HS256 JWT for DEMO_MODE testing."""
    now = datetime.utcnow()
    payload = {
        "sub": sub,
        "email": email,
        "role": role,
        "cognito:groups": [role],
        "iat": now,
        "exp": now + timedelta(hours=24),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


# ── Cognito client factory ────────────────────────────────────────────────────

def _cognito_client(settings: Settings):
    import os
    # Aggressively remove any lingering session token from the shell environment
    # so boto3 doesn't implicitly use an expired one when you just want to use IAM keys.
    if "AWS_SESSION_TOKEN" in os.environ:
        del os.environ["AWS_SESSION_TOKEN"]

    kwargs = {
        "region_name": settings.COGNITO_REGION,
        "aws_access_key_id": settings.AWS_ACCESS_KEY_ID or None,
        "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY or None,
    }
    if settings.AWS_SESSION_TOKEN:
        kwargs["aws_session_token"] = settings.AWS_SESSION_TOKEN

    return boto3.client("cognito-idp", **kwargs)


def _get_secret_hash(username: str, client_id: str, client_secret: str) -> str:
    """Required if Cognito app client has a client secret."""
    msg = username + client_id
    dig = hmac.new(
        client_secret.encode("utf-8"),
        msg.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    return base64.b64encode(dig).decode()


# ── Login ─────────────────────────────────────────────────────────────────────

async def cognito_login(email: str, password: str, settings: Settings) -> dict:
    """
    Authenticates against Cognito USER_PASSWORD_AUTH flow.
    Returns: { access_token, id_token, refresh_token, role }
    """
    if settings.DEMO_MODE:
        # Demo users: admin@demo.com / donor@demo.com / patient@demo.com
        demo_users = {
            "admin@demo.com":   ("Admin",   "Admin123!"),
            "donor@demo.com":   ("Donor",   "Donor123!"),
            "patient@demo.com": ("Patient", "Patient123!"),
        }
        user_data = demo_users.get(email.lower())
        if user_data is None or user_data[1] != password:
            raise ValueError("Invalid demo credentials")
        role, _ = user_data
        sub = f"demo-{role.lower()}-sub"
        token = create_demo_token(sub, email, role, settings)  # type: ignore[arg-type]
        return {
            "access_token": token,
            "id_token": token,
            "refresh_token": "demo-refresh",
            "role": role,
            "sub": sub,
            "email": email,
            "expires_in": 86400,
        }

    client = _cognito_client(settings)
    auth_params: dict = {"USERNAME": email, "PASSWORD": password}
    if settings.COGNITO_CLIENT_SECRET:
        auth_params["SECRET_HASH"] = _get_secret_hash(
            email, settings.COGNITO_CLIENT_ID, settings.COGNITO_CLIENT_SECRET
        )

    try:
        resp = client.initiate_auth(
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters=auth_params,
            ClientId=settings.COGNITO_CLIENT_ID,
        )
        tokens = resp["AuthenticationResult"]

        # Decode id_token to get user groups/role (no verify — already authenticated)
        id_payload = jwt.get_unverified_claims(tokens["IdToken"])
        groups: list[str] = id_payload.get("cognito:groups", ["Donor"])
        role = groups[0]

        return {
            "access_token": tokens["AccessToken"],
            "id_token": tokens["IdToken"],
            "refresh_token": tokens.get("RefreshToken", ""),
            "role": role,
            "sub": id_payload["sub"],
            "email": id_payload.get("email", email),
            "expires_in": tokens.get("ExpiresIn", 3600),
        }
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code in ("NotAuthorizedException", "UserNotFoundException"):
            raise ValueError("Incorrect email or password")
        raise


# ── Register ──────────────────────────────────────────────────────────────────

async def cognito_register(
    email: str,
    password: str,
    role: Role,
    name: str,
    phone: str,
    settings: Settings,
) -> str:
    """
    Creates a Cognito user, auto-confirms, and adds to role group.
    Returns: cognito_sub
    """
    if settings.DEMO_MODE:
        # In DEMO_MODE, just return a fake sub — user goes straight to DB
        return str(uuid.uuid4())

    client = _cognito_client(settings)
    user_attrs = [
        {"Name": "email", "Value": email},
        {"Name": "email_verified", "Value": "true"},
        {"Name": "name", "Value": name},
    ]
    if phone:
        user_attrs.append({"Name": "phone_number", "Value": phone})

    kwargs: dict = {
        "UserPoolId": settings.COGNITO_USER_POOL_ID,
        "Username": email,
        "TemporaryPassword": password,
        "UserAttributes": user_attrs,
        "MessageAction": "SUPPRESS",   # Don't send welcome email during hackathon
    }

    try:
        resp = client.admin_create_user(**kwargs)
        sub = next(
            a["Value"] for a in resp["User"]["Attributes"] if a["Name"] == "sub"
        )

        # Auto-confirm the user
        client.admin_set_user_password(
            UserPoolId=settings.COGNITO_USER_POOL_ID,
            Username=email,
            Password=password,
            Permanent=True,
        )

        # Assign to the correct group (Admin / Donor / Patient)
        try:
            client.admin_add_user_to_group(
                UserPoolId=settings.COGNITO_USER_POOL_ID,
                Username=email,
                GroupName=role,
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ResourceNotFoundException":
                logger.warning("Group %s not found in Cognito. Creating it now.", role)
                client.create_group(
                    GroupName=role,
                    UserPoolId=settings.COGNITO_USER_POOL_ID,
                    Description=f"{role} users group"
                )
                client.admin_add_user_to_group(
                    UserPoolId=settings.COGNITO_USER_POOL_ID,
                    Username=email,
                    GroupName=role,
                )
            else:
                raise

        logger.info("Cognito user created: %s (sub=%s, role=%s)", email, sub, role)
        return sub

    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code == "UsernameExistsException":
            raise ValueError("An account with this email already exists")
        raise
