"""
PulseNet — Donor Router (Authenticated: Donor role)
=====================================================
GET  /api/donor/me            → My profile
PUT  /api/donor/me            → Edit profile (blood group, phone, location)
GET  /api/donor/me/bridge     → Which patient/bridge I'm assigned to
POST /api/donor/me/donation   → Log a donation I just completed
GET  /api/donor/me/history    → My donation history
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import DonorUser
from database import get_db
from models import Bridge, BridgeMember, TransfusionLog, User

logger = logging.getLogger(__name__)
router = APIRouter()

DONATION_COOLDOWN_DAYS = 90  # Donors can't donate again for 90 days


# ── Schemas ───────────────────────────────────────────────────────────────────

class DonorProfile(BaseModel):
    id: int
    external_id: str
    name: str | None
    email: str | None
    phone: str | None
    blood_group: str | None
    gender: str | None
    age: int | None
    location: str | None
    eligibility_status: str | None
    user_donation_active_status: str | None
    donations_till_date: int | None
    last_donation_date: date | None
    next_eligible_date: date | None

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    blood_group: str | None = None
    gender: str | None = None
    age: int | None = None
    location: str | None = None


class MyBridgeResponse(BaseModel):
    assigned: bool
    bridge_id: int | None = None
    patient_name: str | None = None
    patient_blood_group: str | None = None
    next_transfusion_date: date | None = None
    cycle_position: int | None = None
    my_last_donation_date: date | None = None
    my_next_due_date: date | None = None
    slot_status: str | None = None


class LogDonationRequest(BaseModel):
    donation_date: date
    hospital: str | None = None
    notes: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_donor_by_sub(sub: str, db: AsyncSession) -> User:
    user = (await db.execute(select(User).where(User.cognito_sub == sub))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Donor profile not found. Please complete registration.")
    if user.role != "Donor":
        raise HTTPException(status_code=403, detail="This endpoint is for Donors only")
    return user


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/me", response_model=DonorProfile)
async def get_my_profile(
    current_donor: DonorUser,
    db: AsyncSession = Depends(get_db),
):
    donor = await _get_donor_by_sub(current_donor.sub, db)
    return DonorProfile.model_validate(donor)


@router.put("/me", response_model=DonorProfile)
async def update_my_profile(
    body: UpdateProfileRequest,
    current_donor: DonorUser,
    db: AsyncSession = Depends(get_db),
):
    donor = await _get_donor_by_sub(current_donor.sub, db)
    updates = body.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(donor, field, value)
    await db.commit()
    await db.refresh(donor)
    return DonorProfile.model_validate(donor)


@router.get("/me/bridge", response_model=MyBridgeResponse)
async def get_my_bridge(
    current_donor: DonorUser,
    db: AsyncSession = Depends(get_db),
):
    """Returns which patient bridge this donor is assigned to."""
    donor = await _get_donor_by_sub(current_donor.sub, db)

    member_result = await db.execute(
        select(BridgeMember)
        .where(BridgeMember.donor_id == donor.id)
        .options(
            selectinload(BridgeMember.bridge).selectinload(Bridge.patient)
        )
        .limit(1)
    )
    member = member_result.scalar_one_or_none()

    if member is None:
        return MyBridgeResponse(assigned=False)

    patient = member.bridge.patient if member.bridge else None
    return MyBridgeResponse(
        assigned=True,
        bridge_id=member.bridge_id,
        patient_name=patient.name if patient else None,
        patient_blood_group=patient.blood_group if patient else None,
        next_transfusion_date=patient.expected_next_transfusion_date if patient else None,
        cycle_position=member.cycle_position,
        my_last_donation_date=member.last_donation_date,
        my_next_due_date=member.expected_next_donation_date,
        slot_status=member.slot_status,
    )


@router.post("/me/donation", status_code=status.HTTP_201_CREATED)
async def log_my_donation(
    body: LogDonationRequest,
    current_donor: DonorUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Donor logs that they've completed a donation.
    Updates: last_donation_date, next_eligible_date, BridgeMember slot, TransfusionLog.
    """
    donor = await _get_donor_by_sub(current_donor.sub, db)

    next_eligible = body.donation_date + timedelta(days=DONATION_COOLDOWN_DAYS)

    # Update donor record
    donor.last_donation_date = body.donation_date
    donor.next_eligible_date = next_eligible
    donor.eligibility_status = "not eligible"
    donor.donations_till_date = (donor.donations_till_date or 0) + 1

    # Update BridgeMember slot
    member_result = await db.execute(
        select(BridgeMember).where(BridgeMember.donor_id == donor.id).limit(1)
    )
    member = member_result.scalar_one_or_none()
    if member:
        member.donated_earlier = True
        member.last_donation_date = body.donation_date
        member.expected_next_donation_date = next_eligible
        member.slot_status = "Active"

        # Create TransfusionLog
        bridge = await db.get(Bridge, member.bridge_id)
        log = TransfusionLog(
            patient_id=bridge.patient_id if bridge else 0,
            donor_id=donor.id,
            bridge_id=member.bridge_id,
            transfusion_date=body.donation_date,
            hospital=body.hospital,
            notes=body.notes,
            status="completed",
        )
        db.add(log)

    await db.commit()
    return {
        "message": "Donation logged successfully",
        "next_eligible_date": next_eligible.isoformat(),
        "total_donations": donor.donations_till_date,
    }


@router.get("/me/history")
async def get_donation_history(
    current_donor: DonorUser,
    db: AsyncSession = Depends(get_db),
):
    donor = await _get_donor_by_sub(current_donor.sub, db)
    result = await db.execute(
        select(TransfusionLog)
        .where(TransfusionLog.donor_id == donor.id)
        .order_by(TransfusionLog.transfusion_date.desc())
        .limit(20)
    )
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "transfusion_date": log.transfusion_date.isoformat(),
            "hospital": log.hospital,
            "notes": log.notes,
            "status": log.status,
        }
        for log in logs
    ]
