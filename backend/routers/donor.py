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
from models import Bridge, BridgeMember, TransfusionLog, User, Cycle, Requirement, RequirementResponse
from routers.patient import calculate_confidence_score

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
    
    # New fields
    locality: str | None
    preferred_center: str | None
    contact_preference: str | None
    general_availability: str | None
    bridge_preference: bool | None
    travel_radius: int | None
    languages: str | None
    medical_notes: str | None

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    blood_group: str | None = None
    gender: str | None = None
    age: int | None = None
    location: str | None = None
    locality: str | None = None
    preferred_center: str | None = None
    contact_preference: str | None = None
    general_availability: str | None = None
    bridge_preference: bool | None = None
    travel_radius: int | None = None
    languages: str | None = None
    medical_notes: str | None = None


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


class DonorRequirementResponse(BaseModel):
    requirement_id: int
    external_requirement_id: str
    patient_name: str | None
    blood_group: str | None
    severity: str
    trigger_type: str
    units_needed: int
    date_needed: date
    center_name: str | None
    my_response_status: str


class RespondRequirementRequest(BaseModel):
    status: str  # "confirmed" | "declined"


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
    
    # Trigger pod assignment if donor is willing to donate via Blood Bridge
    if donor.bridge_preference:
        from services.matching import assign_donor_to_pod
        await assign_donor_to_pod(donor.id, db)
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


class EditDonationRequest(BaseModel):
    donation_date: date | None = None
    hospital: str | None = None
    notes: str | None = None

@router.patch("/me/history/{log_id}")
async def edit_my_donation(
    log_id: int,
    body: EditDonationRequest,
    current_donor: DonorUser,
    db: AsyncSession = Depends(get_db),
):
    """Edit a past donation log."""
    from fastapi import HTTPException
    donor = await _get_donor_by_sub(current_donor.sub, db)
    
    # Verify the log belongs to this donor
    log = await db.get(TransfusionLog, log_id)
    if not log or log.donor_id != donor.id:
        raise HTTPException(status_code=404, detail="Donation log not found")
        
    if body.donation_date:
        log.transfusion_date = body.donation_date
    if body.hospital is not None:
        log.hospital = body.hospital
    if body.notes is not None:
        log.notes = body.notes
        
    await db.commit()
    return {"message": "Donation log updated successfully"}

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


@router.get("/me/requirements", response_model=list[DonorRequirementResponse])
async def get_my_requirements(
    current_donor: DonorUser,
    db: AsyncSession = Depends(get_db),
):
    donor = await _get_donor_by_sub(current_donor.sub, db)

    # 1. Find if donor is member of any bridge
    member_res = await db.execute(
        select(BridgeMember).where(BridgeMember.donor_id == donor.id).limit(1)
    )
    member = member_res.scalar_one_or_none()
    if not member:
        return []

    # 2. Get bridge patient details
    bridge_res = await db.execute(
        select(Bridge).where(Bridge.id == member.bridge_id).options(selectinload(Bridge.patient))
    )
    bridge = bridge_res.scalar_one_or_none()
    if not bridge or not bridge.patient:
        return []

    patient = bridge.patient

    # 3. Fetch active requirements for this patient
    reqs_res = await db.execute(
        select(Requirement)
        .where(Requirement.patient_id == patient.id)
        .where(Requirement.status.notin_(["fulfilled", "unresolved"]))
        .order_by(Requirement.created_at.desc())
    )
    requirements = reqs_res.scalars().all()

    out = []
    for req in requirements:
        # Resolve due date, units needed, and center
        due_date = patient.expected_next_transfusion_date or (date.today() + timedelta(days=2))
        units_needed = 2
        
        if req.cycle_id:
            cycle = await db.get(Cycle, req.cycle_id)
            if cycle:
                due_date = cycle.due_date
                units_needed = cycle.expected_units

        center_name = patient.location or "Care Center"

        # Resolve donor's response status
        resp_res = await db.execute(
            select(RequirementResponse)
            .where(RequirementResponse.requirement_id == req.id)
            .where(RequirementResponse.donor_id == donor.id)
            .limit(1)
        )
        resp = resp_res.scalar_one_or_none()
        
        # If no response object exists yet, default to pending (and create it so state is tracked)
        if not resp:
            resp = RequirementResponse(
                requirement_id=req.id,
                donor_id=donor.id,
                status="pending"
            )
            db.add(resp)
            await db.flush()
            my_status = "pending"
        else:
            my_status = resp.status

        out.append(DonorRequirementResponse(
            requirement_id=req.id,
            external_requirement_id=req.external_requirement_id,
            patient_name=patient.name,
            blood_group=patient.blood_group,
            severity=req.severity,
            trigger_type=req.trigger_type,
            units_needed=units_needed,
            date_needed=due_date,
            center_name=center_name,
            my_response_status=my_status
        ))

    await db.commit()
    return out


@router.post("/me/requirements/{requirement_id}/respond")
async def respond_to_requirement(
    requirement_id: int,
    body: RespondRequirementRequest,
    current_donor: DonorUser,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func
    donor = await _get_donor_by_sub(current_donor.sub, db)

    # 1. Fetch requirement
    requirement = await db.get(Requirement, requirement_id)
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found")

    # 2. Get/Create response record for this donor
    resp_res = await db.execute(
        select(RequirementResponse)
        .where(RequirementResponse.requirement_id == requirement_id)
        .where(RequirementResponse.donor_id == donor.id)
        .limit(1)
    )
    resp = resp_res.scalar_one_or_none()
    if not resp:
        resp = RequirementResponse(
            requirement_id=requirement_id,
            donor_id=donor.id,
            status="pending"
        )
        db.add(resp)

    # 3. Determine if confirmation is a regular confirmation or standby
    final_status = body.status
    if body.status == "confirmed":
        # Check expected units
        expected_units = 2
        if requirement.cycle_id:
            cycle = await db.get(Cycle, requirement.cycle_id)
            if cycle:
                expected_units = cycle.expected_units or 2

        # Count other confirmed responses
        confirmed_count = (await db.execute(
            select(func.count(RequirementResponse.id))
            .where(RequirementResponse.requirement_id == requirement_id)
            .where(RequirementResponse.status == "confirmed")
            .where(RequirementResponse.donor_id != donor.id)
        )).scalar() or 0

        if confirmed_count >= expected_units:
            final_status = "standby"
        else:
            final_status = "confirmed"

    # Update response status
    resp.status = final_status

    # 4. If confirmed/standby or declined, recalculate the confidence score
    await db.flush()
    score_data = await calculate_confidence_score(requirement_id, db)
    
    # Update requirement status & severity
    requirement.status = score_data["status"]
    requirement.severity = score_data["status"]

    # Update cycle status and confidence score if applicable
    if requirement.cycle_id:
        cycle = await db.get(Cycle, requirement.cycle_id)
        if cycle:
            cycle.confidence_score = score_data["score"]
            cycle.status = score_data["status"]

    # Increase reliability score if donor showed up after confirming
    if final_status in ["confirmed", "standby"]:
        donor.calls_to_donations_ratio = min(1.0, (donor.calls_to_donations_ratio or 0.8) + 0.02)

    await db.commit()

    return {
        "message": f"Successfully responded to requirement as {final_status}",
        "status": final_status,
        "requirement_status": requirement.status,
        "confidence_score": score_data["score"]
    }


class UpdateStatusRequest(BaseModel):
    status: str  # "active" | "inactive" | "not eligible"

@router.patch("/me/status")
async def update_my_status(
    body: UpdateStatusRequest,
    current_donor: DonorUser,
    db: AsyncSession = Depends(get_db),
):
    donor = await _get_donor_by_sub(current_donor.sub, db)
    # Allows setting "inactive" (pausing participation) or back to "active". 
    # "not eligible" is usually system-managed via cooldown.
    donor.user_donation_active_status = body.status
    donor.status = body.status
    await db.commit()
    await db.refresh(donor)
    return {"message": "Status updated successfully", "status": donor.status}


class RescheduleSuggestionRequest(BaseModel):
    suggested_date: date
    suggested_time: str | None = None

@router.post("/me/requirements/{requirement_id}/reschedule-suggestion")
async def suggest_reschedule(
    requirement_id: int,
    body: RescheduleSuggestionRequest,
    current_donor: DonorUser,
    db: AsyncSession = Depends(get_db),
):
    donor = await _get_donor_by_sub(current_donor.sub, db)
    # Ideally, we would save this to a new RescheduleSuggestion table or update the RequirementResponse
    # For now, we update the RequirementResponse with a special 'reschedule_requested' status
    resp_res = await db.execute(
        select(RequirementResponse)
        .where(RequirementResponse.requirement_id == requirement_id)
        .where(RequirementResponse.donor_id == donor.id)
        .limit(1)
    )
    resp = resp_res.scalar_one_or_none()
    if not resp:
        resp = RequirementResponse(
            requirement_id=requirement_id,
            donor_id=donor.id,
            status="reschedule_requested"
        )
        db.add(resp)
    else:
        resp.status = "reschedule_requested"
        
    # We could log the suggested_date in notes or a specific column if needed.
    await db.commit()
    return {"message": "Reschedule suggestion submitted successfully", "status": "reschedule_requested"}


@router.get("/me/impact")
async def get_my_impact(
    current_donor: DonorUser,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func
    donor = await _get_donor_by_sub(current_donor.sub, db)
    
    # Total donations (from TransfusionLog)
    total_donations = (await db.execute(
        select(func.count(TransfusionLog.id))
        .where(TransfusionLog.donor_id == donor.id)
        .where(TransfusionLog.status == "completed")
    )).scalar() or 0

    # Cycles supported (from RequirementResponse where confirmed/standby)
    cycles_supported = (await db.execute(
        select(func.count(RequirementResponse.id))
        .where(RequirementResponse.donor_id == donor.id)
        .where(RequirementResponse.status.in_(["confirmed", "standby"]))
    )).scalar() or 0

    return {
        "total_donations": donor.donations_till_date or total_donations,
        "cycles_supported": cycles_supported,
        "emergencies_responded": 0  # To be implemented when Emergency feature is built
    }
