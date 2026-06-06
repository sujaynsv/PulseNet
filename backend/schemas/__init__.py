"""
PulseNet — Pydantic v2 Schemas (Shared)
========================================
Base schemas reused across donor, patient, and admin flows.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ── Shared config ─────────────────────────────────────────────────────────────
class OrmBase(BaseModel):
    """Base model with ORM mode enabled — used for DB → response serialization."""
    model_config = ConfigDict(from_attributes=True)


# ── User schemas ──────────────────────────────────────────────────────────────

class UserBase(OrmBase):
    external_id: str
    blood_group: Optional[str] = None
    gender: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    role: Optional[str] = None
    donor_type: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    name: Optional[str] = None


class UserCreate(UserBase):
    """Used when a donor or patient self-registers."""
    pass


class UserUpdate(OrmBase):
    """Partial update; all fields optional."""
    blood_group: Optional[str] = None
    gender: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    donor_type: Optional[str] = None
    eligibility_status: Optional[str] = None
    user_donation_active_status: Optional[str] = None


class UserRead(UserBase):
    id: int
    eligibility_status: Optional[str] = None
    donations_till_date: Optional[int] = None
    last_donation_date: Optional[date] = None
    next_eligible_date: Optional[date] = None
    calls_to_donations_ratio: Optional[float] = None
    user_donation_active_status: Optional[str] = None
    status: str = "active"
    registration_date: Optional[datetime] = None
    created_at: datetime


# ── Bridge schemas ────────────────────────────────────────────────────────────

class BridgeBase(OrmBase):
    external_bridge_id: str
    bridge_blood_group: Optional[str] = None
    bridge_gender: Optional[str] = None
    quantity_required: int = 1
    last_transfusion_date: Optional[date] = None
    expected_next_transfusion_date: Optional[date] = None


class BridgeRead(BridgeBase):
    id: int
    patient_id: int
    bridge_status: bool
    created_at: datetime


# ── Donor availability webhook payload ────────────────────────────────────────

class DonorAvailabilityWebhook(BaseModel):
    """
    Inbound webhook payload from external notification system.
    E.g., a WhatsApp bot confirming a donor is available.
    """
    external_user_id: str = Field(..., description="Donor's external_id from dataset")
    available: bool = Field(..., description="True if donor is available to donate")
    confirmed_date: Optional[date] = Field(
        None, description="Date donor confirmed they can donate"
    )
    notes: Optional[str] = None


# ── Transfusion log schemas ───────────────────────────────────────────────────

class TransfusionLogCreate(BaseModel):
    transfusion_date: date
    units: int = Field(1, ge=1)
    notes: Optional[str] = None


class TransfusionLogRead(OrmBase):
    id: int
    patient_id: int
    transfusion_date: date
    units: int
    notes: Optional[str] = None
    created_at: datetime
