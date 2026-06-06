"""
PulseNet — Patient Router (Authenticated: Patient role)
=========================================================
GET  /api/patient/me            → My profile
GET  /api/patient/me/bridge     → My 8-donor Blood Bridge with cycle status
GET  /api/patient/me/schedule   → Upcoming transfusion dates + countdown
GET  /api/patient/me/history    → Past transfusion log
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import PatientUser
from database import get_db
from models import Bridge, BridgeMember, TransfusionLog, User

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class PatientProfile(BaseModel):
    id: int
    external_id: str
    name: str | None
    email: str | None
    blood_group: str | None
    phone: str | None
    location: str | None
    expected_next_transfusion_date: date | None
    transfusion_frequency_days: int | None

    class Config:
        from_attributes = True


class BridgeDonorCard(BaseModel):
    cycle_position: int      # 1–8
    donor_name: str | None   # No phone exposed to patient — privacy
    blood_group: str | None
    donated_earlier: bool
    last_donation_date: date | None
    expected_next_donation_date: date | None
    slot_status: str         # Active | Due | Overdue | Inactive


class MyBridgeResponse(BaseModel):
    bridge_id: int | None
    total_donors: int
    donors: list[BridgeDonorCard]


class ScheduleEntry(BaseModel):
    transfusion_number: int
    scheduled_date: date
    days_until: int
    is_next: bool


class ScheduleResponse(BaseModel):
    next_transfusion_date: date | None
    days_until_next: int | None
    frequency_days: int
    upcoming: list[ScheduleEntry]


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_patient_by_sub(sub: str, db: AsyncSession) -> User:
    user = (await db.execute(select(User).where(User.cognito_sub == sub))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    if user.role != "Patient":
        raise HTTPException(status_code=403, detail="This endpoint is for Patients only")
    return user


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/me", response_model=PatientProfile)
async def get_my_profile(
    current_patient: PatientUser,
    db: AsyncSession = Depends(get_db),
):
    patient = await _get_patient_by_sub(current_patient.sub, db)
    return PatientProfile.model_validate(patient)


@router.get("/me/bridge", response_model=MyBridgeResponse)
async def get_my_bridge(
    current_patient: PatientUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Patient's view of their 8-donor Blood Bridge.
    Shows cycle position, last donation, next due date, and slot status.
    Does NOT expose donor phone numbers (privacy).
    """
    patient = await _get_patient_by_sub(current_patient.sub, db)

    bridge_result = await db.execute(
        select(Bridge)
        .where(Bridge.patient_id == patient.id)
        .options(
            selectinload(Bridge.members).selectinload(BridgeMember.donor)
        )
    )
    bridge = bridge_result.scalar_one_or_none()

    if bridge is None:
        return MyBridgeResponse(bridge_id=None, total_donors=0, donors=[])

    cards: list[BridgeDonorCard] = []
    for member in sorted(bridge.members, key=lambda m: m.cycle_position):
        donor = member.donor

        # Compute display status
        slot_status = member.slot_status
        if member.expected_next_donation_date:
            days_until = (member.expected_next_donation_date - date.today()).days
            if days_until < 0:
                slot_status = "Overdue"
            elif days_until <= 7:
                slot_status = "Due"

        cards.append(BridgeDonorCard(
            cycle_position=member.cycle_position,
            donor_name=donor.name if donor else "—",
            blood_group=donor.blood_group if donor else None,
            donated_earlier=member.donated_earlier,
            last_donation_date=member.last_donation_date,
            expected_next_donation_date=member.expected_next_donation_date,
            slot_status=slot_status,
        ))

    return MyBridgeResponse(
        bridge_id=bridge.id,
        total_donors=len(cards),
        donors=cards,
    )


@router.get("/me/schedule", response_model=ScheduleResponse)
async def get_my_schedule(
    current_patient: PatientUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Generates upcoming transfusion dates based on frequency.
    Returns next 6 scheduled dates with countdown.
    """
    patient = await _get_patient_by_sub(current_patient.sub, db)

    freq = patient.transfusion_frequency_days or 18
    next_date = patient.expected_next_transfusion_date or (date.today() + timedelta(days=freq))

    today = date.today()
    days_until_next = (next_date - today).days

    upcoming: list[ScheduleEntry] = []
    for i in range(6):
        scheduled = next_date + timedelta(days=freq * i)
        days_until = (scheduled - today).days
        upcoming.append(ScheduleEntry(
            transfusion_number=i + 1,
            scheduled_date=scheduled,
            days_until=days_until,
            is_next=(i == 0),
        ))

    return ScheduleResponse(
        next_transfusion_date=next_date,
        days_until_next=days_until_next,
        frequency_days=freq,
        upcoming=upcoming,
    )


@router.get("/me/history")
async def get_transfusion_history(
    current_patient: PatientUser,
    db: AsyncSession = Depends(get_db),
):
    patient = await _get_patient_by_sub(current_patient.sub, db)
    result = await db.execute(
        select(TransfusionLog)
        .where(TransfusionLog.patient_id == patient.id)
        .options(selectinload(TransfusionLog.donor))
        .order_by(TransfusionLog.transfusion_date.desc())
        .limit(30)
    )
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "transfusion_date": log.transfusion_date.isoformat(),
            "donor_name": log.donor.name if log.donor else "Unknown",
            "hospital": log.hospital,
            "notes": log.notes,
            "status": log.status,
        }
        for log in logs
    ]
