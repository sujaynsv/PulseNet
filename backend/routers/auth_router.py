"""
PulseNet — Auth Router
========================
POST /api/auth/login    → Cognito / DEMO_MODE login → JWT tokens
POST /api/auth/register → Create Cognito user + DB record
GET  /api/auth/me       → Current user profile from DB
"""

from __future__ import annotations

import logging
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import CurrentUser, get_current_user
from config import get_settings
from database import get_db
from models import User
from services.cognito import cognito_login, cognito_register

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request / Response schemas ────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    id_token: str
    role: str
    sub: str
    email: str
    expires_in: int = 3600


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: str   # "Donor" | "Patient"
    name: str
    phone: str
    blood_group: str | None = None
    gender: str | None = None
    location: str | None = None
    age: int | None = None

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in ("Donor", "Patient"):
            raise ValueError("Role must be Donor or Patient")
        return v

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        digits = v.strip().replace(" ", "").replace("-", "")
        if not digits.startswith("+"):
            digits = f"+91{digits.lstrip('0')}"
        return digits


class UserMeResponse(BaseModel):
    id: int
    external_id: str
    cognito_sub: str | None
    role: str
    email: str | None
    name: str | None
    phone: str | None
    blood_group: str | None
    location: str | None
    eligibility_status: str | None
    user_donation_active_status: str | None
    donations_till_date: int | None
    last_donation_date: date | None
    next_eligible_date: date | None
    expected_next_transfusion_date: date | None

    class Config:
        from_attributes = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    """
    Authenticate user → return JWT tokens.
    DEMO_MODE: email=admin@demo.com / donor@demo.com / patient@demo.com, password as set.
    """
    settings = get_settings()
    try:
        result = await cognito_login(body.email, body.password, settings)
        return LoginResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    except Exception as exc:
        logger.error("Login error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Login failed")


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Self-register as Donor or Patient.
    Creates Cognito user + DB record simultaneously.
    """
    settings = get_settings()

    # Check email not already used
    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    # Create Cognito user and get sub
    try:
        cognito_sub = await cognito_register(
            email=body.email,
            password=body.password,
            role=body.role,  # type: ignore[arg-type]
            name=body.name,
            phone=body.phone,
            settings=settings,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        logger.error("Cognito register error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Registration failed")

    # Create DB record
    user = User(
        cognito_sub=cognito_sub,
        external_id=str(uuid.uuid4()),
        role=body.role,
        email=body.email,
        name=body.name,
        phone=body.phone,
        blood_group=body.blood_group,
        gender=body.gender,
        location=body.location,
        age=body.age,
        eligibility_status="eligible" if body.role == "Donor" else None,
        user_donation_active_status="Active" if body.role == "Donor" else None,
        status="active",
        registration_date=date.today(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    logger.info("Registered %s: %s (sub=%s)", body.role, body.email, cognito_sub)
    return {"message": "Registration successful", "user_id": user.id, "role": body.role}


@router.get("/me", response_model=UserMeResponse)
async def get_me(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Returns the authenticated user's DB profile."""
    user = (
        await db.execute(select(User).where(User.cognito_sub == current_user.sub))
    ).scalar_one_or_none()

    if user is None:
        # First login: create a lightweight DB record from Cognito claims
        user = User(
            cognito_sub=current_user.sub,
            external_id=str(uuid.uuid4()),
            role=current_user.role,
            email=current_user.email,
            status="active",
            registration_date=date.today(),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return UserMeResponse.model_validate(user)
