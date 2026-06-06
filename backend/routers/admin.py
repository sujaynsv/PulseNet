"""
PulseNet — Admin Router (Authenticated: Admin role only)
=========================================================
GET  /api/admin/stats                   → Dashboard KPIs
GET  /api/admin/patients                → All patients (paginated)
GET  /api/admin/bridge/{patient_id}     → 8-donor cycle panel for a patient
POST /api/admin/notify/{donor_id}       → Send SNS SMS reminder to donor
GET  /api/admin/donors                  → All donors (filterable)
GET  /api/admin/donors/inactive         → Re-engagement targets
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import AdminUser
from database import get_db
from models import Bridge, BridgeMember, TransfusionLog, User
from services.notification import build_donor_reminder_message, send_sms_reminder

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Response schemas ──────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_users: int
    total_donors: int
    total_patients: int
    total_bridges: int
    active_bridges: int
    eligible_donors: int
    active_donors: int
    inactive_donors: int
    donor_fatigue_risk: int
    as_of: str


class PatientSummary(BaseModel):
    id: int
    external_id: str
    name: str | None
    blood_group: str | None
    expected_next_transfusion_date: date | None
    transfusion_frequency_days: int | None
    bridge_id: int | None
    bridge_slots_filled: int

    class Config:
        from_attributes = True


class DonorSlot(BaseModel):
    slot_id: int
    cycle_position: int
    donor_id: int
    donor_name: str | None
    donor_phone: str | None
    blood_group: str | None
    eligibility_status: str | None
    user_donation_active_status: str | None
    last_donation_date: date | None
    expected_next_donation_date: date | None
    slot_status: str
    donated_earlier: bool


class BridgePanelResponse(BaseModel):
    patient_id: int
    patient_name: str | None
    patient_blood_group: str | None
    next_transfusion_date: date | None
    bridge_id: int | None
    total_slots: int
    slots: list[DonorSlot]


class DonorSummary(BaseModel):
    id: int
    external_id: str
    name: str | None
    email: str | None
    phone: str | None
    blood_group: str | None
    eligibility_status: str | None
    user_donation_active_status: str | None
    donations_till_date: int | None
    last_donation_date: date | None
    next_eligible_date: date | None

    class Config:
        from_attributes = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=DashboardStats)
async def dashboard_stats(
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    total_donors = (await db.execute(
        select(func.count(User.id)).where(User.role == "Donor")
    )).scalar_one()
    total_patients = (await db.execute(
        select(func.count(User.id)).where(User.role == "Patient")
    )).scalar_one()
    active_bridges = (await db.execute(
        select(func.count(Bridge.id)).where(Bridge.bridge_status == True)
    )).scalar_one()
    eligible_donors = (await db.execute(
        select(func.count(User.id)).where(
            User.role == "Donor", User.eligibility_status == "eligible"
        )
    )).scalar_one()
    active_donors = (await db.execute(
        select(func.count(User.id)).where(
            User.role == "Donor", User.user_donation_active_status == "Active"
        )
    )).scalar_one()
    inactive_donors = (await db.execute(
        select(func.count(User.id)).where(
            User.role == "Donor", User.user_donation_active_status == "Inactive"
        )
    )).scalar_one()

    total_bridges = (await db.execute(
        select(func.count(Bridge.id))
    )).scalar_one()

    return DashboardStats(
        total_users=total_donors + total_patients,
        total_donors=total_donors,
        total_patients=total_patients,
        total_bridges=total_bridges,
        active_bridges=active_bridges,
        eligible_donors=eligible_donors,
        active_donors=active_donors,
        inactive_donors=inactive_donors,
        donor_fatigue_risk=inactive_donors, # placeholder logic
        as_of=date.today().isoformat(),
    )


@router.get("/patients", response_model=list[PatientSummary])
async def list_patients(
    _admin: AdminUser,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """All patients with their bridge slot count."""
    result = await db.execute(
        select(User)
        .where(User.role == "Patient")
        .options(selectinload(User.patient_bridge).selectinload(Bridge.members))
        .offset(offset)
        .limit(limit)
    )
    patients = result.scalars().all()

    summaries = []
    for p in patients:
        bridge = p.patient_bridge
        summaries.append(PatientSummary(
            id=p.id,
            external_id=p.external_id,
            name=p.name,
            blood_group=p.blood_group,
            expected_next_transfusion_date=p.expected_next_transfusion_date,
            transfusion_frequency_days=p.transfusion_frequency_days,
            bridge_id=bridge.id if bridge else None,
            bridge_slots_filled=len(bridge.members) if bridge else 0,
        ))
    return summaries


@router.get("/bridge/mock")
async def get_mock_bridge_panel(_admin: AdminUser):
    """Mock ML ranked bridge for the demo dashboard."""
    donors = []
    for i in range(1, 9):
        donors.append({
            "external_id": f"mock-{i}",
            "name": f"Mock Donor {i}",
            "blood_group": "O+",
            "distance_km": round(1.5 * i, 1),
            "donations_till_date": 5 - i if i < 5 else 0,
            "eligibility_status": "eligible" if i < 6 else "inactive",
            "ml_rank_score": max(0.99 - (i * 0.05), 0.1)
        })
    return {
        "patient": {
            "name": "Sarah (ML Demo)",
            "blood_group": "O+",
            "next_transfusion_date": (date.today() + timedelta(days=5)).isoformat()
        },
        "model_used": "xgboost-v2",
        "generated_at": date.today().isoformat(),
        "ranked_donors": donors
    }

@router.get("/bridge/{patient_id}", response_model=BridgePanelResponse)
async def get_bridge_panel(
    patient_id: int,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """
    The core admin view — 8-donor cycle wheel for a specific patient.
    Shows each slot with donation history, next due date, and contact info.
    """
    patient = await db.get(User, patient_id)
    if patient is None or patient.role != "Patient":
        raise HTTPException(status_code=404, detail="Patient not found")

    bridge_result = await db.execute(
        select(Bridge)
        .where(Bridge.patient_id == patient_id)
        .options(
            selectinload(Bridge.members).selectinload(BridgeMember.donor)
        )
    )
    bridge = bridge_result.scalar_one_or_none()

    slots: list[DonorSlot] = []
    if bridge:
        for member in bridge.members:
            donor = member.donor
            # Auto-compute slot status
            slot_status = member.slot_status
            if member.expected_next_donation_date:
                days_until = (member.expected_next_donation_date - date.today()).days
                if days_until < 0:
                    slot_status = "Overdue"
                elif days_until <= 7:
                    slot_status = "Due"
                elif donor and donor.user_donation_active_status == "Inactive":
                    slot_status = "Inactive"
                else:
                    slot_status = "Active"

            slots.append(DonorSlot(
                slot_id=member.id,
                cycle_position=member.cycle_position,
                donor_id=donor.id if donor else 0,
                donor_name=donor.name if donor else "—",
                donor_phone=donor.phone if donor else None,
                blood_group=donor.blood_group if donor else None,
                eligibility_status=donor.eligibility_status if donor else None,
                user_donation_active_status=donor.user_donation_active_status if donor else None,
                last_donation_date=member.last_donation_date,
                expected_next_donation_date=member.expected_next_donation_date,
                slot_status=slot_status,
                donated_earlier=member.donated_earlier,
            ))

    return BridgePanelResponse(
        patient_id=patient.id,
        patient_name=patient.name,
        patient_blood_group=patient.blood_group,
        next_transfusion_date=patient.expected_next_transfusion_date,
        bridge_id=bridge.id if bridge else None,
        total_slots=len(slots),
        slots=sorted(slots, key=lambda s: s.cycle_position),
    )


@router.post("/notify/{donor_id}", status_code=status.HTTP_200_OK)
async def send_donor_reminder(
    donor_id: int,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Admin clicks 'Send Reminder' → fires SNS SMS to donor's phone.
    """
    donor = await db.get(User, donor_id)
    if donor is None or donor.role != "Donor":
        raise HTTPException(status_code=404, detail="Donor not found")
    if not donor.phone:
        raise HTTPException(status_code=422, detail="Donor has no phone number on file")

    # Find which patient this donor serves
    member_result = await db.execute(
        select(BridgeMember)
        .where(BridgeMember.donor_id == donor_id)
        .options(selectinload(BridgeMember.bridge).selectinload(Bridge.patient))
        .limit(1)
    )
    member = member_result.scalar_one_or_none()
    patient_name = member.bridge.patient.name if member and member.bridge and member.bridge.patient else "your patient"
    due_date = (
        member.expected_next_donation_date.strftime("%d %b %Y")
        if member and member.expected_next_donation_date
        else "soon"
    )

    message = build_donor_reminder_message(
        donor_name=donor.name or "Donor",
        patient_name=patient_name,
        due_date=due_date,
    )

    try:
        result = await send_sms_reminder(donor.phone, message)
    except Exception as exc:
        logger.error("SNS failed for donor %s: %s", donor_id, exc)
        raise HTTPException(status_code=503, detail=f"SMS delivery failed: {exc}")

    return {
        "message": "SMS reminder sent",
        "donor": donor.name,
        "phone": donor.phone,
        "sms_message_id": result.get("MessageId"),
        "demo": result.get("demo", False),
    }


@router.get("/donors", response_model=list[DonorSummary])
async def list_donors(
    _admin: AdminUser,
    blood_group: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    q = select(User).where(User.role == "Donor")
    if blood_group:
        q = q.where(User.blood_group == blood_group)
    if status_filter:
        q = q.where(User.user_donation_active_status == status_filter)
    result = await db.execute(q.offset(offset).limit(limit))
    return [DonorSummary.model_validate(d) for d in result.scalars().all()]


@router.get("/donors/inactive", response_model=list[DonorSummary])
async def list_inactive_donors(
    _admin: AdminUser,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .where(User.role == "Donor", User.user_donation_active_status == "Inactive")
        .limit(limit)
    )
    return [DonorSummary.model_validate(d) for d in result.scalars().all()]
