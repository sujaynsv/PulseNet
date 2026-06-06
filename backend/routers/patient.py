"""
PulseNet — Patient Router (Authenticated: Patient role)
=========================================================
GET  /api/patient/me            → My profile
GET  /api/patient/me/bridge     → My 8-donor Blood Bridge with cycle status
GET  /api/patient/me/schedule   → Upcoming transfusion dates + countdown
GET  /api/patient/me/history    → Past transfusion log
GET  /api/patient/me/cycles     → Transfusion calendar
GET  /api/patient/me/active-requirement → Active requirement and confidence score
POST /api/patient/me/log-transfusion    → Log transfusion and check Hb trend
POST /api/patient/me/request-transfusion→ Patient requested manual requirement
POST /api/patient/system/trigger-scheduled → (Admin/System) Auto-trigger cycles
POST /api/patient/requirements/{id}/auto-repair → Trigger auto-repair engine
POST /api/patient/requirements/{id}/escalate    → Trigger emergency escalation
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import PatientUser
from database import get_db
from models import Bridge, BridgeMember, TransfusionLog, User, Cycle, Requirement, RequirementResponse

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
    clinical_alert: str | None
    hb_decline_flag: bool

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

class UpdateProfileRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    blood_group: str | None = None
    location: str | None = None
    transfusion_frequency_days: int | None = None
    expected_next_transfusion_date: date | None = None

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

class LogTransfusionRequest(BaseModel):
    transfusion_date: date
    blood_units: float
    pretransfusion_hb: float | None = None
    hospital: str | None = None
    notes: str | None = None
    donor_id: int | None = None

# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_patient_by_sub(sub: str, db: AsyncSession) -> User:
    user = (await db.execute(select(User).where(User.cognito_sub == sub))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    if user.role != "Patient":
        raise HTTPException(status_code=403, detail="This endpoint is for Patients only")
    return user

# --- ALGORITHM: Confidence Score ---
async def calculate_confidence_score(requirement_id: int, db: AsyncSession) -> dict:
    req = (await db.execute(select(Requirement).where(Requirement.id == requirement_id))).scalar_one_or_none()
    if not req or not req.cycle_id: return {"score": 0, "status": "matching", "days_remaining": 0, "cycle_id": None}
    cycle = (await db.execute(select(Cycle).where(Cycle.id == req.cycle_id))).scalar_one_or_none()
    if not cycle: return {"score": 0, "status": "matching", "days_remaining": 0, "cycle_id": None}

    expected_units = cycle.expected_units or 1
    
    # 1. Confirmed Donors
    confirmed_count = (await db.execute(
        select(func.count(RequirementResponse.id))
        .where(RequirementResponse.requirement_id == req.id)
        .where(RequirementResponse.status == "confirmed")
    )).scalar() or 0

    base_coverage = (confirmed_count / expected_units) * 100
    if base_coverage >= 100:
        return {"score": 100, "status": "covered", "days_remaining": (cycle.due_date - date.today()).days, "cycle_id": cycle.id}

    # 2. Potential Buffer
    patient = (await db.execute(select(User).where(User.id == req.patient_id))).scalar_one()
    bridge = (await db.execute(
        select(Bridge).where(Bridge.patient_id == patient.id).options(selectinload(Bridge.members))
    )).scalar_one_or_none()
    
    eligible_donors = 0
    if bridge:
        confirmed_donor_ids = (await db.execute(
            select(RequirementResponse.donor_id)
            .where(RequirementResponse.requirement_id == req.id)
            .where(RequirementResponse.status == "confirmed")
        )).scalars().all()
        for m in bridge.members:
            if m.slot_status == "Active" and m.donor_id not in confirmed_donor_ids:
                eligible_donors += 1

    potential_buffer = eligible_donors * 15

    # 3. Time Penalty
    days_remaining = (cycle.due_date - date.today()).days
    time_penalty = 0
    missing_units = max(0, expected_units - confirmed_count)
    if days_remaining < 3:
        time_penalty = max(0, 3 - days_remaining) * 15 * missing_units

    raw_score = base_coverage + potential_buffer - time_penalty
    pod_health_multiplier = 1.0 # Standardize to 1.0 for now
    final_score = max(0, min(100, int(raw_score * pod_health_multiplier)))
    
    new_status = req.status
    if final_score < 40 or (days_remaining < 2 and final_score < 100):
        new_status = "emergency"
    elif final_score < 70:
        new_status = "at_risk"
    elif final_score == 100:
        new_status = "covered"
    else:
        new_status = "matching"

    return {
        "score": final_score,
        "status": new_status,
        "days_remaining": days_remaining,
        "cycle_id": cycle.id
    }

# --- ALGORITHM: Hb Trend Checker ---
async def check_hb_trend(patient_id: int, db: AsyncSession):
    logs = (await db.execute(
        select(TransfusionLog)
        .where(TransfusionLog.patient_id == patient_id)
        .where(TransfusionLog.pretransfusion_hb.isnot(None))
        .order_by(desc(TransfusionLog.transfusion_date))
        .limit(3)
    )).scalars().all()

    if len(logs) == 3:
        # logs[0] is latest, logs[2] is oldest
        if logs[0].pretransfusion_hb < logs[1].pretransfusion_hb < logs[2].pretransfusion_hb:
            user = (await db.execute(select(User).where(User.id == patient_id))).scalar_one()
            user.hb_decline_flag = True
            user.clinical_alert = "Hb levels have declined across the last 3 consecutive transfusions."
            await db.commit()

# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/me", response_model=PatientProfile)
async def get_my_profile(current_patient: PatientUser, db: AsyncSession = Depends(get_db)):
    patient = await _get_patient_by_sub(current_patient.sub, db)
    return PatientProfile.model_validate(patient)

@router.patch("/me", response_model=PatientProfile)
async def update_my_profile(body: UpdateProfileRequest, current_patient: PatientUser, db: AsyncSession = Depends(get_db)):
    patient = await _get_patient_by_sub(current_patient.sub, db)
    if body.name is not None: patient.name = body.name
    if body.phone is not None: patient.phone = body.phone
    if body.blood_group is not None: patient.blood_group = body.blood_group
    if body.location is not None: patient.location = body.location
    if body.transfusion_frequency_days is not None: patient.transfusion_frequency_days = body.transfusion_frequency_days
    if body.expected_next_transfusion_date is not None: patient.expected_next_transfusion_date = body.expected_next_transfusion_date
    await db.commit()
    return PatientProfile.model_validate(patient)

@router.get("/me/bridge", response_model=MyBridgeResponse)
async def get_my_bridge(current_patient: PatientUser, db: AsyncSession = Depends(get_db)):
    patient = await _get_patient_by_sub(current_patient.sub, db)
    bridge_result = await db.execute(
        select(Bridge)
        .where(Bridge.patient_id == patient.id)
        .options(selectinload(Bridge.members).selectinload(BridgeMember.donor))
    )
    bridge = bridge_result.scalar_one_or_none()

    if bridge is None:
        return MyBridgeResponse(bridge_id=None, total_donors=0, donors=[])

    cards: list[BridgeDonorCard] = []
    for member in sorted(bridge.members, key=lambda m: m.cycle_position):
        donor = member.donor
        slot_status = member.slot_status
        if member.expected_next_donation_date:
            days_until = (member.expected_next_donation_date - date.today()).days
            if days_until < 0: slot_status = "Overdue"
            elif days_until <= 7: slot_status = "Due"

        cards.append(BridgeDonorCard(
            cycle_position=member.cycle_position,
            donor_name=donor.name if donor else "—",
            blood_group=donor.blood_group if donor else None,
            donated_earlier=member.donated_earlier,
            last_donation_date=member.last_donation_date,
            expected_next_donation_date=member.expected_next_donation_date,
            slot_status=slot_status,
        ))

    return MyBridgeResponse(bridge_id=bridge.id, total_donors=len(cards), donors=cards)

@router.get("/me/schedule", response_model=ScheduleResponse)
async def get_my_schedule(current_patient: PatientUser, db: AsyncSession = Depends(get_db)):
    patient = await _get_patient_by_sub(current_patient.sub, db)
    freq = patient.transfusion_frequency_days or 18
    next_date = patient.expected_next_transfusion_date or (date.today() + timedelta(days=freq))
    today = date.today()
    days_until_next = (next_date - today).days

    upcoming: list[ScheduleEntry] = []
    for i in range(6):
        scheduled = next_date + timedelta(days=freq * i)
        upcoming.append(ScheduleEntry(
            transfusion_number=i + 1,
            scheduled_date=scheduled,
            days_until=(scheduled - today).days,
            is_next=(i == 0),
        ))

    return ScheduleResponse(
        next_transfusion_date=next_date,
        days_until_next=days_until_next,
        frequency_days=freq,
        upcoming=upcoming,
    )

@router.get("/me/cycles")
async def get_my_cycles(current_patient: PatientUser, db: AsyncSession = Depends(get_db)):
    patient = await _get_patient_by_sub(current_patient.sub, db)
    cycles = (await db.execute(
        select(Cycle).where(Cycle.patient_id == patient.id).order_by(Cycle.due_date.asc())
    )).scalars().all()
    return cycles

@router.get("/me/active-requirement")
async def get_active_requirement(current_patient: PatientUser, db: AsyncSession = Depends(get_db)):
    patient = await _get_patient_by_sub(current_patient.sub, db)
    req = (await db.execute(
        select(Requirement)
        .where(Requirement.patient_id == patient.id)
        .where(Requirement.status.in_(["pending_verification", "matching", "covered", "at_risk", "emergency"]))
        .order_by(Requirement.created_at.desc())
    )).scalar_one_or_none()
    
    if req:
        score_data = await calculate_confidence_score(req.id, db)
        if req.status != score_data["status"]:
            req.status = score_data["status"]
            req.severity = score_data["status"]
            if req.cycle_id:
                cycle = (await db.execute(select(Cycle).where(Cycle.id == req.cycle_id))).scalar_one()
                cycle.confidence_score = score_data["score"]
                cycle.status = score_data["status"]
            await db.commit()
        return {
            "requirement_id": req.id,
            "cycle_id": req.cycle_id,
            "status": req.status,
            "confidence_score": score_data["score"],
            "days_remaining": score_data["days_remaining"]
        }
    return None

@router.post("/me/log-transfusion")
async def log_transfusion(body: LogTransfusionRequest, current_patient: PatientUser, db: AsyncSession = Depends(get_db)):
    patient = await _get_patient_by_sub(current_patient.sub, db)
    
    log = TransfusionLog(
        patient_id=patient.id,
        transfusion_date=body.transfusion_date,
        blood_units=body.blood_units,
        pretransfusion_hb=body.pretransfusion_hb,
        hospital=body.hospital,
        notes=body.notes,
        donor_id=body.donor_id
    )
    db.add(log)
    await db.commit()
    
    if body.pretransfusion_hb is not None:
        await check_hb_trend(patient.id, db)
        
    active_req = (await db.execute(
        select(Requirement)
        .where(Requirement.patient_id == patient.id)
        .where(Requirement.status.notin_(["fulfilled", "unresolved"]))
    )).scalar_one_or_none()
    
    if active_req:
        active_req.status = "fulfilled"
        if active_req.cycle_id:
            cycle = (await db.execute(select(Cycle).where(Cycle.id == active_req.cycle_id))).scalar_one()
            cycle.status = "fulfilled"
        await db.commit()

    return {"message": "Transfusion logged successfully"}

@router.post("/me/request-transfusion")
async def request_transfusion(current_patient: PatientUser, db: AsyncSession = Depends(get_db)):
    patient = await _get_patient_by_sub(current_patient.sub, db)
    req = Requirement(
        external_requirement_id=str(uuid.uuid4()),
        patient_id=patient.id,
        trigger_type="patient_request",
        severity="routine",
        source="patient",
        status="pending_verification"
    )
    db.add(req)
    await db.commit()
    return {"message": "Request submitted for verification."}

@router.get("/me/history")
async def get_transfusion_history(current_patient: PatientUser, db: AsyncSession = Depends(get_db)):
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
            "pretransfusion_hb": log.pretransfusion_hb,
        }
        for log in logs
    ]

# ── Admin/System Triggers ─────────────────────────────────────────────────────

@router.post("/system/trigger-scheduled")
async def trigger_scheduled_requirements(db: AsyncSession = Depends(get_db)):
    """System endpoint to create requirements for cycles <= 10 days away"""
    threshold_date = date.today() + timedelta(days=10)
    cycles = (await db.execute(
        select(Cycle)
        .where(Cycle.status == "routine")
        .where(Cycle.due_date <= threshold_date)
    )).scalars().all()
    
    created = 0
    for c in cycles:
        req = Requirement(
            external_requirement_id=str(uuid.uuid4()),
            patient_id=c.patient_id,
            cycle_id=c.id,
            trigger_type="scheduled",
            severity="routine",
            source="system",
            status="matching"
        )
        db.add(req)
        c.status = "matching"
        created += 1
        
    await db.commit()
    return {"message": f"Triggered {created} scheduled requirements."}

@router.post("/requirements/{id}/auto-repair")
async def auto_repair_requirement(id: int, db: AsyncSession = Depends(get_db)):
    req = (await db.execute(select(Requirement).where(Requirement.id == id))).scalar_one_or_none()
    if not req: raise HTTPException(404)
    
    patient = (await db.execute(select(User).where(User.id == req.patient_id))).scalar_one()
    bridge = (await db.execute(
        select(Bridge).where(Bridge.patient_id == patient.id).options(selectinload(Bridge.members))
    )).scalar_one_or_none()
    
    notified = 0
    if bridge:
        for m in bridge.members:
            if m.slot_status in ["Active", "Due", "Overdue"]:
                existing = (await db.execute(
                    select(RequirementResponse)
                    .where(RequirementResponse.requirement_id == req.id)
                    .where(RequirementResponse.donor_id == m.donor_id)
                )).scalar_one_or_none()
                if not existing:
                    rr = RequirementResponse(requirement_id=req.id, donor_id=m.donor_id, status="pending")
                    db.add(rr)
                    notified += 1
                    
    req.status = "at_risk"
    req.severity = "at_risk"
    await db.commit()
    return {"message": f"Auto-repair triggered. Notified {notified} pod members."}

@router.post("/requirements/{id}/escalate")
async def escalate_requirement(id: int, db: AsyncSession = Depends(get_db)):
    req = (await db.execute(select(Requirement).where(Requirement.id == id))).scalar_one_or_none()
    if not req: raise HTTPException(404)
    
    req.status = "emergency"
    req.severity = "emergency"
    await db.commit()
    return {"message": "Requirement escalated to emergency. Broadcasting to backup pools."}
