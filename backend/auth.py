"""
PulseNet — Cognito JWT Authentication
======================================
Two modes:
  DEMO_MODE=true  → validates a simple HS256 JWT signed with SECRET_KEY.
                    No AWS required. Use demo login endpoint.
  DEMO_MODE=false → validates RS256 JWTs from AWS Cognito via JWKS.

Usage (FastAPI dependency injection):
    from auth import require_role, CurrentUser

    @router.get("/admin/patients")
    async def list_patients(user: CurrentUser = Depends(require_role("Admin"))):
        ...
"""

from __future__ import annotations

import logging
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwk, jwt
from pydantic import BaseModel

from config import Settings, get_settings

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)

# ── JWKS cache (fetched once on first auth request) ───────────────────────────
_jwks_cache: dict | None = None


async def _get_jwks(settings: Settings) -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(settings.cognito_jwks_url)
                resp.raise_for_status()
                _jwks_cache = resp.json()
        except Exception as exc:
            logger.error("Failed to fetch Cognito JWKS: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Auth service unavailable — cannot fetch JWKS",
            )
    return _jwks_cache


# ── Token payload model ───────────────────────────────────────────────────────
class TokenPayload(BaseModel):
    sub: str
    email: str | None = None
    role: str          # "Admin" | "Donor" | "Patient"
    cognito_groups: list[str] = []


# ── Core decoder ─────────────────────────────────────────────────────────────

async def decode_token(
    token: str,
    settings: Settings,
) -> TokenPayload:
    """
    Decodes and validates a JWT.
    In DEMO_MODE: HS256 signed with SECRET_KEY.
    In production: RS256 from Cognito JWKS.
    """
    if settings.DEMO_MODE:
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            role = payload.get("role", payload.get("cognito:groups", ["Donor"])[0] if isinstance(payload.get("cognito:groups"), list) else "Donor")
            return TokenPayload(
                sub=payload["sub"],
                email=payload.get("email"),
                role=role,
                cognito_groups=payload.get("cognito:groups", [role]),
            )
        except ExpiredSignatureError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
        except JWTError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {exc}")

    # ── Production: Cognito RS256 ────────────────────────────────────────────
    jwks = await _get_jwks(settings)
    try:
        headers = jwt.get_unverified_headers(token)
        kid = headers.get("kid")
        key_data = next(
            (k for k in jwks.get("keys", []) if k.get("kid") == kid), None
        )
        if key_data is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown token key ID")

        public_key = jwk.construct(key_data)
        payload = jwt.decode(
            token,
            public_key.to_pem(),
            algorithms=["RS256"],
            issuer=settings.cognito_issuer,
            options={"verify_aud": False},  # Audience check optional for access tokens
        )

        groups: list[str] = payload.get("cognito:groups", [])
        role = groups[0] if groups else "Donor"

        return TokenPayload(
            sub=payload["sub"],
            email=payload.get("email"),
            role=role,
            cognito_groups=groups,
        )
    except ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Cognito token: {exc}")


# ── FastAPI dependency: get current user ──────────────────────────────────────

async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    settings: Settings = Depends(get_settings),
) -> TokenPayload:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await decode_token(credentials.credentials, settings)


# ── Role-gated dependency factory ─────────────────────────────────────────────

def require_role(*roles: str):
    """
    Usage: Depends(require_role("Admin"))
           Depends(require_role("Admin", "Donor"))
    """
    async def _check(user: TokenPayload = Depends(get_current_user)) -> TokenPayload:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(roles)}",
            )
        return user
    return _check


# ── Type alias for annotated dependencies ─────────────────────────────────────
CurrentUser = Annotated[TokenPayload, Depends(get_current_user)]
AdminUser   = Annotated[TokenPayload, Depends(require_role("Admin"))]
DonorUser   = Annotated[TokenPayload, Depends(require_role("Donor"))]
PatientUser = Annotated[TokenPayload, Depends(require_role("Patient"))]
