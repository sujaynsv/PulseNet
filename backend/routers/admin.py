"""
PulseNet — Admin Router (Authenticated: Admin role only)
=========================================================
Command Center endpoints:

GET  /api/admin/command-stats            → City-level KPI summary
GET  /api/admin/pods                     → All patient pods with health score
POST /api/admin/pods/{patient_id}/ai-refill → Trigger AI donor refill for a pod
GET  /api/admin/cycles/upcoming          → Cycles due in next 7 days
GET  /api/admin/emergencies              → All open emergency cases
POST /api/admin/emergencies              → Create new emergency case
PATCH /api/admin/emergencies/{id}        → Update resolution checklist step
GET  /api/admin/center-stress            → Center stress derived from patient locations
GET  /api/admin/stats                    → Dashboard KPIs (legacy)
GET  /api/admin/patients                 → All patients (paginated)
GET  /api/admin/patients/{id}            → Single patient detail
GET  /api/admin/patients/{id}/cycles     → Patient cycles (admin view)
POST /api/admin/patients/{id}/generate-cycles → Admin generates cycles for patient
GET  /api/admin/bridge/mock              → Mock ML ranking demo
GET  /api/admin/bridge/{patient_id}      → 8-donor cycle panel for a patient
POST /api/admin/notify/{donor_id}        → Send SNS SMS reminder to donor
GET  /api/admin/donors                   → All donors (filterable)
GET  /api/admin/donors/inactive          → Re-engagement targets
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Optional
from typing import Any, Optional, List
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import AdminUser
from database import get_db
from config import get_settings
from models import Bridge, BridgeMember, Cycle, EmergencyCase, RequirementResponse, TransfusionLog, User
from services.notification import build_donor_reminder_message, send_sms_reminder
from services.ml import predict_active_status, predict_eligibility_status

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Response schemas ──────────────────────────────────────────────────────────

class CommandStats(BaseModel):
    city: str
    active_pods: int
    cycles_next_7_days: int
    at_risk_cycles: int
    open_emergencies: int
    stressed_centers: int
    total_donors: int
    eligible_donors: int
    as_of: str


class PodHealthRow(BaseModel):
    patient_id: int
    patient_label: str
    blood_group: Optional[str]
    next_cycle_date: Optional[date]
    confidence_score: int
    pod_health_score: int
    active_donors: int
    sleeping_donors: int
    cooldown_donors: int
    total_slots: int
    bridge_id: Optional[int]
    status: str  # healthy | at_risk | critical


class UpcomingCycleCard(BaseModel):
    cycle_id: int
    patient_id: int
    patient_name: Optional[str]
    blood_group: Optional[str]
    due_date: date
    days_until: int
    expected_units: int
    confidence_score: int
    state: str  # covered | at_risk | critical


class EmergencyCaseOut(BaseModel):
    id: int
    patient_label: Optional[str]
    blood_group: Optional[str]
    center_name: Optional[str]
    units_needed: int
    time_critical_by: Optional[datetime]
    hours_remaining: Optional[float]
    assigned_donor_name: Optional[str]
    donor_assigned: bool
    donor_confirmed: bool
    center_informed: bool
    units_arranged: bool
    case_closed: bool
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class CreateEmergencyRequest(BaseModel):
    patient_label: str
    blood_group: str
    center_name: str
    units_needed: int = 2
    hours_until_critical: Optional[int] = 24


class UpdateEmergencyRequest(BaseModel):
    donor_assigned: Optional[bool] = None
    donor_confirmed: Optional[bool] = None
    center_informed: Optional[bool] = None
    units_arranged: Optional[bool] = None
    case_closed: Optional[bool] = None
    assigned_donor_id: Optional[int] = None


class CenterStressRow(BaseModel):
    center_name: str
    patient_count: int
    cycles_next_7_days: int
    open_emergencies: int
    eligible_donors_nearby: int
    stress_score: int
    stress_level: str  # Low | Moderate | High | Critical


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
    name: Optional[str]
    blood_group: Optional[str]
    expected_next_transfusion_date: Optional[date]
    transfusion_frequency_days: Optional[int]
    bridge_id: Optional[int]
    bridge_slots_filled: int

    class Config:
        from_attributes = True


class DonorSlot(BaseModel):
    slot_id: int
    cycle_position: int
    donor_id: int
    donor_name: Optional[str]
    donor_phone: Optional[str]
    blood_group: Optional[str]
    eligibility_status: Optional[str]
    user_donation_active_status: Optional[str]
    last_donation_date: Optional[date]
    expected_next_donation_date: Optional[date]
    slot_status: str
    donated_earlier: bool
    is_backup: bool = False
    requirement_status: Optional[str] = None


class BridgePanelResponse(BaseModel):
    patient_id: int
    patient_name: Optional[str]
    patient_blood_group: Optional[str]
    next_transfusion_date: Optional[date]
    bridge_id: Optional[int]
    total_slots: int
    slots: list[DonorSlot]


class DonorSummary(BaseModel):
    id: int
    external_id: str
    name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    blood_group: Optional[str]
    eligibility_status: Optional[str]
    user_donation_active_status: Optional[str]
    donations_till_date: Optional[int]
    last_donation_date: Optional[date]
    next_eligible_date: Optional[date]

    class Config:
        from_attributes = True


# ── Helper functions ──────────────────────────────────────────────────────────

def _calc_pod_health(members: list) -> dict:
    """Derive pod health metrics from bridge members."""
    if not members:
        return dict(active=0, sleeping=0, cooldown=0, health=0, status="critical")

    active = sum(1 for m in members if m.slot_status == "Active")
    cooldown = sum(1 for m in members if m.slot_status in ("Due", "Overdue"))
    sleeping = sum(1 for m in members if m.slot_status == "Inactive")
    total = len(members)

    health = round((active / max(total, 1)) * 100)
    if health >= 75:
        pod_status = "healthy"
    elif health >= 40:
        pod_status = "at_risk"
    else:
        pod_status = "critical"

    return dict(active=active, sleeping=sleeping, cooldown=cooldown, health=health, status=pod_status)


def _calc_cycle_state(confidence_score: int) -> str:
    if confidence_score >= 70:
        return "covered"
    elif confidence_score >= 40:
        return "at_risk"
    return "critical"


# ── Command Centre Stats ──────────────────────────────────────────────────────

@router.get("/command-stats", response_model=CommandStats)
async def command_stats(
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """City-level operational summary."""
    today = date.today()
    week_ahead = today + timedelta(days=7)

    total_donors = (await db.execute(
        select(func.count(User.id)).where(User.role == "Donor")
    )).scalar_one()

    eligible_donors = (await db.execute(
        select(func.count(User.id)).where(
            User.role == "Donor", User.eligibility_status == "eligible"
        )
    )).scalar_one()

    total_bridges = (await db.execute(select(func.count(Bridge.id)))).scalar_one()
    active_bridges = (await db.execute(
        select(func.count(Bridge.id)).where(Bridge.bridge_status == True)
    )).scalar_one()

    cycles_7d = (await db.execute(
        select(func.count(Cycle.id)).where(
            Cycle.due_date >= today, Cycle.due_date <= week_ahead
        )
    )).scalar_one()

    at_risk = (await db.execute(
        select(func.count(Cycle.id)).where(
            Cycle.due_date >= today,
            Cycle.due_date <= week_ahead,
            Cycle.confidence_score < 70,
        )
    )).scalar_one()

    open_emergencies = (await db.execute(
        select(func.count(EmergencyCase.id)).where(EmergencyCase.case_closed == False)
    )).scalar_one()

    return CommandStats(
        city="Hyderabad",
        active_pods=active_bridges,
        cycles_next_7_days=cycles_7d,
        at_risk_cycles=at_risk,
        open_emergencies=open_emergencies,
        stressed_centers=0,  # Will be enriched dynamically on center-stress route
        total_donors=total_donors,
        eligible_donors=eligible_donors,
        as_of=today.isoformat(),
    )


# ── Pod Command Centre ────────────────────────────────────────────────────────

@router.get("/pods", response_model=list[PodHealthRow])
async def list_pods(
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """All patient pods sorted by health score (weakest first)."""
    result = await db.execute(
        select(User)
        .where(User.role == "Patient")
        .options(
            selectinload(User.patient_bridge).selectinload(Bridge.members)
        )
    )
    patients = result.scalars().all()

    # Fetch cycles for all patients in one query
    today = date.today()
    week_ahead = today + timedelta(days=7)
    cycles_result = await db.execute(
        select(Cycle).where(Cycle.due_date >= today).order_by(Cycle.due_date.asc())
    )
    all_cycles = cycles_result.scalars().all()
    cycles_by_patient = {}
    for c in all_cycles:
        if c.patient_id not in cycles_by_patient:
            cycles_by_patient[c.patient_id] = c

    rows: list[PodHealthRow] = []
    for p in patients:
        bridge = p.patient_bridge
        members = bridge.members if bridge else []
        pod = _calc_pod_health(members)
        next_cycle = cycles_by_patient.get(p.id)

        # Confidence: use bridge active ratio or fall back to 0
        if bridge and members:
            conf = round((pod["active"] / max(len(members), 1)) * 100)
        else:
            conf = 0

        rows.append(PodHealthRow(
            patient_id=p.id,
            patient_label=p.name or f"Patient #{p.id}",
            blood_group=p.blood_group,
            next_cycle_date=next_cycle.due_date if next_cycle else p.expected_next_transfusion_date,
            confidence_score=conf,
            pod_health_score=pod["health"],
            active_donors=pod["active"],
            sleeping_donors=pod["sleeping"],
            cooldown_donors=pod["cooldown"],
            total_slots=len(members) if members else 8,
            bridge_id=bridge.id if bridge else None,
            status=pod["status"],
        ))

    # Sort: critical first, then at_risk, then healthy
    order = {"critical": 0, "at_risk": 1, "healthy": 2}
    rows.sort(key=lambda r: (order.get(r.status, 3), r.pod_health_score))
    return rows


@router.post("/pods/{patient_id}/ai-refill")
async def trigger_ai_refill(
    patient_id: int,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Trigger AI donor refill for a patient pod using the ranked bridge panel."""
    patient = await db.get(User, patient_id)
    if not patient or patient.role != "Patient":
        raise HTTPException(404, "Patient not found")

    bridge_result = await db.execute(
        select(Bridge)
        .where(Bridge.patient_id == patient_id)
        .options(selectinload(Bridge.members).selectinload(BridgeMember.donor))
    )
    bridge = bridge_result.scalar_one_or_none()
    if not bridge:
        raise HTTPException(404, "No bridge found for this patient. Generate cycles first.")

    # Find eligible donors not already in the pod
    existing_donor_ids = {m.donor_id for m in bridge.members}
    candidates_result = await db.execute(
        select(User).where(
            User.role == "Donor",
            User.blood_group == patient.blood_group,
            User.eligibility_status == "eligible",
            ~User.id.in_(existing_donor_ids),
        ).limit(20)
    )
    candidates = candidates_result.scalars().all()

    # Fill empty slots (up to 8 total)
    current_positions = {m.cycle_position for m in bridge.members}
    available_positions = [p for p in range(1, 9) if p not in current_positions]
    added = 0
    for pos, donor in zip(available_positions, candidates):
        new_member = BridgeMember(
            bridge_id=bridge.id,
            donor_id=donor.id,
            cycle_position=pos,
            slot_status="Active",
        )
        db.add(new_member)
        added += 1

    await db.commit()
    return {
        "message": f"AI refill complete. {added} donor slot(s) filled.",
        "patient_id": patient_id,
        "added_slots": added,
        "total_slots": len(bridge.members) + added,
    }


# ── 7-Day Cycle Readiness ─────────────────────────────────────────────────────

@router.get("/cycles/upcoming", response_model=list[UpcomingCycleCard])
async def upcoming_cycles(
    _admin: AdminUser,
    days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
):
    """Cycles due in the next N days (default 7), enriched with patient info."""
    today = date.today()
    cutoff = today + timedelta(days=days)

    cycles_result = await db.execute(
        select(Cycle)
        .where(Cycle.due_date >= today, Cycle.due_date <= cutoff)
        .order_by(Cycle.confidence_score.asc())  # most at-risk first
    )
    cycles = cycles_result.scalars().all()

    # Batch-fetch patients
    patient_ids = list({c.patient_id for c in cycles})
    patients_result = await db.execute(
        select(User).where(User.id.in_(patient_ids))
    )
    patients_by_id = {p.id: p for p in patients_result.scalars().all()}

    cards: list[UpcomingCycleCard] = []
    for c in cycles:
        patient = patients_by_id.get(c.patient_id)
        days_until = (c.due_date - today).days
        cards.append(UpcomingCycleCard(
            cycle_id=c.id,
            patient_id=c.patient_id,
            patient_name=patient.name if patient else None,
            blood_group=patient.blood_group if patient else None,
            due_date=c.due_date,
            days_until=days_until,
            expected_units=c.expected_units,
            confidence_score=c.confidence_score,
            state=_calc_cycle_state(c.confidence_score),
        ))
    return cards


# ── Emergency Command Board ───────────────────────────────────────────────────

@router.get("/emergencies", response_model=list[EmergencyCaseOut])
async def list_emergencies(
    _admin: AdminUser,
    include_closed: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """List emergency cases."""
    q = select(EmergencyCase).options(
        selectinload(EmergencyCase.patient),
        selectinload(EmergencyCase.assigned_donor),
    ).order_by(EmergencyCase.created_at.desc())

    if not include_closed:
        q = q.where(EmergencyCase.case_closed == False)

    result = await db.execute(q)
    cases = result.scalars().all()

    out = []
    for ec in cases:
        hours_remaining = None
        if ec.time_critical_by:
            delta = ec.time_critical_by - datetime.utcnow()
            hours_remaining = max(delta.total_seconds() / 3600, 0)

        out.append(EmergencyCaseOut(
            id=ec.id,
            patient_label=ec.patient_label or (ec.patient.name if ec.patient else None),
            blood_group=ec.blood_group,
            center_name=ec.center_name,
            units_needed=ec.units_needed,
            time_critical_by=ec.time_critical_by,
            hours_remaining=round(hours_remaining, 1) if hours_remaining is not None else None,
            assigned_donor_name=ec.assigned_donor.name if ec.assigned_donor else None,
            donor_assigned=ec.donor_assigned,
            donor_confirmed=ec.donor_confirmed,
            center_informed=ec.center_informed,
            units_arranged=ec.units_arranged,
            case_closed=ec.case_closed,
            status=ec.status,
            created_at=ec.created_at,
        ))
    return out


@router.post("/emergencies", response_model=EmergencyCaseOut, status_code=201)
async def create_emergency(
    body: CreateEmergencyRequest,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a new emergency case."""
    time_critical = (
        datetime.utcnow() + timedelta(hours=body.hours_until_critical)
        if body.hours_until_critical
        else None
    )
    ec = EmergencyCase(
        patient_label=body.patient_label,
        blood_group=body.blood_group,
        center_name=body.center_name,
        units_needed=body.units_needed,
        time_critical_by=time_critical,
        status="open",
    )
    db.add(ec)
    await db.commit()
    await db.refresh(ec)

    return EmergencyCaseOut(
        id=ec.id,
        patient_label=ec.patient_label,
        blood_group=ec.blood_group,
        center_name=ec.center_name,
        units_needed=ec.units_needed,
        time_critical_by=ec.time_critical_by,
        hours_remaining=body.hours_until_critical,
        assigned_donor_name=None,
        donor_assigned=False,
        donor_confirmed=False,
        center_informed=False,
        units_arranged=False,
        case_closed=False,
        status="open",
        created_at=ec.created_at,
    )


@router.patch("/emergencies/{case_id}", response_model=EmergencyCaseOut)
async def update_emergency(
    case_id: int,
    body: UpdateEmergencyRequest,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Update resolution checklist for an emergency case. Auto-closes when all 5 steps done."""
    ec = await db.get(EmergencyCase, case_id)
    if not ec:
        raise HTTPException(404, "Emergency case not found")

    if body.donor_assigned is not None:
        ec.donor_assigned = body.donor_assigned
    if body.donor_confirmed is not None:
        ec.donor_confirmed = body.donor_confirmed
    if body.center_informed is not None:
        ec.center_informed = body.center_informed
    if body.units_arranged is not None:
        ec.units_arranged = body.units_arranged
    if body.case_closed is not None:
        ec.case_closed = body.case_closed
    if body.assigned_donor_id is not None:
        ec.assigned_donor_id = body.assigned_donor_id

    # Auto-derive status
    steps_done = sum([ec.donor_assigned, ec.donor_confirmed, ec.center_informed, ec.units_arranged])
    if ec.case_closed or steps_done == 4:
        ec.case_closed = True
        ec.status = "closed"
    elif steps_done > 0:
        ec.status = "partially_covered"
    else:
        ec.status = "open"

    await db.commit()
    await db.refresh(ec)

    hours_remaining = None
    if ec.time_critical_by:
        delta = ec.time_critical_by - datetime.utcnow()
        hours_remaining = max(delta.total_seconds() / 3600, 0)

    donor_name = None
    if ec.assigned_donor_id:
        donor = await db.get(User, ec.assigned_donor_id)
        donor_name = donor.name if donor else None

    return EmergencyCaseOut(
        id=ec.id,
        patient_label=ec.patient_label,
        blood_group=ec.blood_group,
        center_name=ec.center_name,
        units_needed=ec.units_needed,
        time_critical_by=ec.time_critical_by,
        hours_remaining=round(hours_remaining, 1) if hours_remaining is not None else None,
        assigned_donor_name=donor_name,
        donor_assigned=ec.donor_assigned,
        donor_confirmed=ec.donor_confirmed,
        center_informed=ec.center_informed,
        units_arranged=ec.units_arranged,
        case_closed=ec.case_closed,
        status=ec.status,
        created_at=ec.created_at,
    )


# ── Center Stress ─────────────────────────────────────────────────────────────

@router.get("/center-stress", response_model=list[CenterStressRow])
async def center_stress(
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Derive center stress by grouping patients and donors by location string."""
    today = date.today()
    week_ahead = today + timedelta(days=7)

    # All patients with a location
    patients_result = await db.execute(
        select(User).where(User.role == "Patient", User.location != None)
    )
    patients = patients_result.scalars().all()

    # All eligible donors by location
    donors_result = await db.execute(
        select(User).where(
            User.role == "Donor",
            User.eligibility_status == "eligible",
            User.location != None,
        )
    )
    donors = donors_result.scalars().all()

    # All upcoming cycles
    cycles_result = await db.execute(
        select(Cycle).where(Cycle.due_date >= today, Cycle.due_date <= week_ahead)
    )
    cycles = cycles_result.scalars().all()
    cycles_by_patient = {}
    for c in cycles:
        cycles_by_patient.setdefault(c.patient_id, []).append(c)

    # All open emergencies
    em_result = await db.execute(
        select(EmergencyCase).where(EmergencyCase.case_closed == False)
    )
    open_em = em_result.scalars().all()
    em_by_center = {}
    for em in open_em:
        key = (em.center_name or "Unknown").lower().strip()
        em_by_center[key] = em_by_center.get(key, 0) + 1

    # Group by location (normalise to first word for rough matching)
    location_map: dict[str, dict] = {}
    for p in patients:
        loc = (p.location or "Unknown").strip()
        if loc not in location_map:
            location_map[loc] = {"patients": [], "cycles_count": 0}
        location_map[loc]["patients"].append(p.id)
        location_map[loc]["cycles_count"] += len(cycles_by_patient.get(p.id, []))

    rows = []
    for loc, data in location_map.items():
        donor_depth = sum(1 for d in donors if d.location and loc.lower() in d.location.lower())
        em_count = em_by_center.get(loc.lower().strip(), 0)
        cycles_count = data["cycles_count"]
        patient_count = len(data["patients"])

        # Stress formula: more cycles + emergencies, fewer donors = more stress
        stress_score = cycles_count * 2 + em_count * 5 - min(donor_depth, 10)

        if stress_score <= 2:
            stress_level = "Low"
        elif stress_score <= 8:
            stress_level = "Moderate"
        elif stress_score <= 15:
            stress_level = "High"
        else:
            stress_level = "Critical"

        rows.append(CenterStressRow(
            center_name=loc,
            patient_count=patient_count,
            cycles_next_7_days=cycles_count,
            open_emergencies=em_count,
            eligible_donors_nearby=donor_depth,
            stress_score=max(stress_score, 0),
            stress_level=stress_level,
        ))

    # Sort: most stressed first
    rows.sort(key=lambda r: r.stress_score, reverse=True)
    return rows


# ── Geo-enriched Center Stress (for map) ──────────────────────────────────────

# Lat/lon coordinates for known Hyderabad locations (mirror of seed.py)
LOCATION_COORDS: dict[str, tuple[float, float]] = {
    "Banjara Hills":  (17.4103, 78.4373),
    "Himayatnagar":   (17.3877, 78.4764),
    "Kukatpally":     (17.4940, 78.3489),
    "KPHB Colony":    (17.4845, 78.3878),
    "Mehdipatnam":    (17.3600, 78.4700),
    "Uppal":          (17.3950, 78.5500),
    "Secunderabad":   (17.4375, 78.4983),
    "LB Nagar":       (17.3504, 78.5498),
    "Dilsukhnagar":   (17.3650, 78.5100),
    "Ameerpet":       (17.4367, 78.4482),
    "Nampally":       (17.3850, 78.4900),
    "Begumpet":       (17.4431, 78.4670),
    "Miyapur":        (17.4969, 78.3576),
    "Hayathnagar":    (17.3348, 78.5856),
    "Kompally":       (17.5486, 78.4854),
    "Out-of-City (Remote Donor)": (17.40, 78.50),  # default center for remote
}


class CenterStressGeoRow(BaseModel):
    center_name: str
    latitude: float
    longitude: float
    patient_count: int
    cycles_next_7_days: int
    open_emergencies: int
    eligible_donors_nearby: int
    stress_score: int
    stress_level: str


@router.get("/center-stress/geo", response_model=list[CenterStressGeoRow])
async def center_stress_geo(
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Same as center-stress but enriched with lat/lon for map rendering."""
    # Reuse the regular center-stress data
    rows = await center_stress(_admin=_admin, db=db)

    geo_rows = []
    for r in rows:
        coords = LOCATION_COORDS.get(r.center_name, (17.40, 78.50))
        geo_rows.append(CenterStressGeoRow(
            center_name=r.center_name,
            latitude=coords[0],
            longitude=coords[1],
            patient_count=r.patient_count,
            cycles_next_7_days=r.cycles_next_7_days,
            open_emergencies=r.open_emergencies,
            eligible_donors_nearby=r.eligible_donors_nearby,
            stress_score=r.stress_score,
            stress_level=r.stress_level,
        ))
    return geo_rows


# ── AI Insights (Bedrock) ────────────────────────────────────────────────────

@router.post("/ai-insights")
async def generate_ai_insights(
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Gather operational data and call Bedrock for actionable admin insights.
    Returns structured AI analysis with suggested actions and risk alerts.
    """
    from services.bedrock import invoke_bedrock

    settings = get_settings()

    # Gather current operational data
    stress_rows = await center_stress(_admin=_admin, db=db)

    today = date.today()
    week_ahead = today + timedelta(days=7)

    # Count key metrics
    total_patients = (await db.execute(
        select(func.count(User.id)).where(User.role == "Patient")
    )).scalar_one()

    total_donors = (await db.execute(
        select(func.count(User.id)).where(User.role == "Donor")
    )).scalar_one()

    eligible_donors = (await db.execute(
        select(func.count(User.id)).where(
            User.role == "Donor", User.eligibility_status == "eligible"
        )
    )).scalar_one()

    cycles_7d = (await db.execute(
        select(func.count(Cycle.id)).where(
            Cycle.due_date >= today, Cycle.due_date <= week_ahead
        )
    )).scalar_one()

    at_risk_cycles = (await db.execute(
        select(func.count(Cycle.id)).where(
            Cycle.due_date >= today, Cycle.due_date <= week_ahead,
            Cycle.confidence_score < 70,
        )
    )).scalar_one()

    critical_cycles = (await db.execute(
        select(func.count(Cycle.id)).where(
            Cycle.due_date >= today, Cycle.due_date <= week_ahead,
            Cycle.confidence_score < 40,
        )
    )).scalar_one()

    open_emergencies = (await db.execute(
        select(func.count(EmergencyCase.id)).where(EmergencyCase.case_closed == False)
    )).scalar_one()

    inactive_donors = (await db.execute(
        select(func.count(User.id)).where(
            User.role == "Donor", User.user_donation_active_status == "Inactive"
        )
    )).scalar_one()

    # Build center stress summary for the prompt
    center_summary = "\n".join([
        f"  - {r.center_name}: {r.patient_count} patients, {r.cycles_next_7_days} cycles in 7d, "
        f"{r.eligible_donors_nearby} eligible donors, stress={r.stress_level} (score {r.stress_score})"
        for r in stress_rows[:10]
    ])

    prompt = f"""You are PulseNet AI — an intelligent operations assistant for a thalassemia care coordination platform in Hyderabad, India.

Analyze the following real-time operational data and provide actionable insights for the admin command center.

## Current Operational Snapshot (as of {today.isoformat()})

**Population:**
- Total patients (thalassemia): {total_patients}
- Total donors in network: {total_donors}
- Eligible donors (can donate today): {eligible_donors}
- Inactive donors (need re-engagement): {inactive_donors}

**Upcoming Transfusion Cycles (next 7 days):**
- Total cycles due: {cycles_7d}
- At-risk cycles (confidence < 70%): {at_risk_cycles}
- Critical cycles (confidence < 40%): {critical_cycles}

**Emergencies:**
- Open emergency cases: {open_emergencies}

**Center Stress by Location:**
{center_summary}

## Instructions

Based on this data, provide exactly 5-7 actionable insights in this JSON format:
[
  {{
    "type": "action" | "warning" | "info",
    "priority": "high" | "medium" | "low",
    "title": "Short action title",
    "description": "Detailed 1-2 sentence description of what the admin should do and why",
    "metric": "Relevant number or stat"
  }}
]

Focus on:
1. Donor gap analysis — which centers need more donors activated?
2. Cycle risk mitigation — which patients need immediate bridge attention?
3. Re-engagement opportunities — how many inactive donors could be reactivated?
4. Emergency preparedness — are there enough donors near emergency-prone centers?
5. Predictive warnings — any centers trending toward critical?

Respond ONLY with the JSON array, no other text."""

    raw_response = await invoke_bedrock(prompt, settings)

    if raw_response is None:
        # Fallback: generate deterministic insights from data
        insights = _generate_fallback_insights(
            stress_rows, total_patients, total_donors, eligible_donors,
            inactive_donors, cycles_7d, at_risk_cycles, critical_cycles,
            open_emergencies,
        )
        return {"source": "local", "insights": insights}

    # Try to parse JSON from Bedrock response
    try:
        # Strip any markdown code fences
        cleaned = raw_response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()

        import json as json_mod
        insights = json_mod.loads(cleaned)
        return {"source": "bedrock", "insights": insights}
    except Exception:
        logger.warning("Could not parse Bedrock response as JSON, returning raw")
        return {"source": "bedrock", "raw": raw_response, "insights": []}


def _generate_fallback_insights(
    stress_rows, total_patients, total_donors, eligible_donors,
    inactive_donors, cycles_7d, at_risk_cycles, critical_cycles,
    open_emergencies,
) -> list[dict]:
    """Generate deterministic insights when Bedrock is unavailable."""
    insights = []

    # Find critical centers
    critical_centers = [r for r in stress_rows if r.stress_level == "Critical"]
    high_centers = [r for r in stress_rows if r.stress_level == "High"]

    if critical_centers:
        names = ", ".join(c.center_name for c in critical_centers[:3])
        insights.append({
            "type": "warning",
            "priority": "high",
            "title": f"{len(critical_centers)} Critical Center(s) Detected",
            "description": f"{names} {'are' if len(critical_centers) > 1 else 'is'} under severe stress. "
                           f"Immediate donor activation needed to cover upcoming transfusion cycles.",
            "metric": f"{len(critical_centers)} critical",
        })

    if at_risk_cycles > 0:
        insights.append({
            "type": "warning",
            "priority": "high",
            "title": f"{at_risk_cycles} At-Risk Cycles This Week",
            "description": f"Out of {cycles_7d} cycles due in 7 days, {at_risk_cycles} have confidence below 70%. "
                           f"Consider activating backup donors or triggering AI refill for affected pods.",
            "metric": f"{at_risk_cycles}/{cycles_7d}",
        })

    if inactive_donors > 50:
        reactivation_pct = round((inactive_donors / max(total_donors, 1)) * 100)
        insights.append({
            "type": "action",
            "priority": "medium",
            "title": f"Re-engage {inactive_donors} Inactive Donors",
            "description": f"{reactivation_pct}% of your donor pool is inactive. "
                           f"An SMS re-engagement campaign could recover significant capacity.",
            "metric": f"{reactivation_pct}% inactive",
        })

    if open_emergencies > 0:
        insights.append({
            "type": "warning",
            "priority": "high",
            "title": f"{open_emergencies} Open Emergency Case(s)",
            "description": "Active emergencies require immediate attention. "
                           "Verify donor assignment and center readiness for each case.",
            "metric": str(open_emergencies),
        })

    # Donor-to-patient ratio insight
    ratio = round(eligible_donors / max(total_patients, 1), 1)
    if ratio < 10:
        insights.append({
            "type": "info",
            "priority": "medium",
            "title": f"Donor-to-Patient Ratio: {ratio}:1",
            "description": f"With {eligible_donors} eligible donors for {total_patients} patients, "
                           f"the network is {'thin' if ratio < 5 else 'moderate'}. "
                           f"Target ratio is 15:1 for full coverage.",
            "metric": f"{ratio}:1",
        })

    if high_centers:
        for c in high_centers[:2]:
            donor_gap = max(10 - c.eligible_donors_nearby, 0)
            if donor_gap > 0:
                insights.append({
                    "type": "action",
                    "priority": "medium",
                    "title": f"Activate {donor_gap} More Donors in {c.center_name}",
                    "description": f"{c.center_name} has {c.cycles_next_7_days} cycles in 7 days but only "
                                   f"{c.eligible_donors_nearby} nearby eligible donors. Activate more to reduce stress.",
                    "metric": f"+{donor_gap} needed",
                })

    # If we still have no insights, add a general status
    if not insights:
        insights.append({
            "type": "info",
            "priority": "low",
            "title": "System Operating Normally",
            "description": f"All {len(stress_rows)} centers are within acceptable stress levels. "
                           f"Next review recommended in 24 hours.",
            "metric": "✓ OK",
        })

    return insights[:7]


# ── Legacy & Existing Endpoints ───────────────────────────────────────────────

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
        donor_fatigue_risk=inactive_donors,
        as_of=date.today().isoformat(),
    )


@router.get("/patients", response_model=list[PatientSummary])
async def list_patients(
    _admin: AdminUser,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
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


@router.get("/patients/{patient_id}", response_model=PatientSummary)
async def get_patient_detail(
    patient_id: int,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db)
):
    p = await db.get(User, patient_id)
    if not p or p.role != "Patient":
        raise HTTPException(404, "Patient not found")

    bridge = (await db.execute(select(Bridge).where(Bridge.patient_id == p.id).options(selectinload(Bridge.members)))).scalar_one_or_none()

    return PatientSummary(
        id=p.id,
        external_id=p.external_id,
        name=p.name,
        blood_group=p.blood_group,
        expected_next_transfusion_date=p.expected_next_transfusion_date,
        transfusion_frequency_days=p.transfusion_frequency_days,
        bridge_id=bridge.id if bridge else None,
        bridge_slots_filled=len(bridge.members) if bridge else 0,
    )


@router.get("/patients/{patient_id}/cycles")
async def get_patient_cycles(
    patient_id: int,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db)
):
    patient = await db.get(User, patient_id)
    if not patient or patient.role != "Patient": raise HTTPException(404, "Patient not found")

    cycles = (await db.execute(
        select(Cycle).where(Cycle.patient_id == patient.id).order_by(Cycle.due_date.asc())
    )).scalars().all()
    return cycles


@router.post("/patients/{patient_id}/generate-cycles")
async def generate_patient_cycles(
    patient_id: int,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db)
):
    patient = await db.get(User, patient_id)
    if not patient or patient.role != "Patient": raise HTTPException(404, "Patient not found")

    freq = patient.transfusion_frequency_days or 18
    next_date = patient.expected_next_transfusion_date or (date.today() + timedelta(days=freq))

    for i in range(6):
        c = Cycle(
            external_cycle_id=str(uuid.uuid4()),
            patient_id=patient.id,
            due_date=next_date + timedelta(days=freq * i),
            expected_units=2,
            status="routine",
            confidence_score=0
        )
        db.add(c)

    await db.commit()

    cycles = (await db.execute(
        select(Cycle).where(Cycle.patient_id == patient.id).order_by(Cycle.due_date.asc())
    )).scalars().all()
    return cycles


@router.get("/bridge/mock")
async def get_mock_bridge_panel(_admin: AdminUser):
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
    patient = await db.get(User, patient_id)
    if patient is None or patient.role != "Patient":
        raise HTTPException(status_code=404, detail="Patient not found")

    bridge_result = await db.execute(
        select(Bridge)
        .where(Bridge.patient_id == patient_id)
        .options(selectinload(Bridge.members).selectinload(BridgeMember.donor))
    )
    bridge = bridge_result.scalar_one_or_none()

    latest_responses = {}
    if bridge:
        donor_ids = [m.donor_id for m in bridge.members if m.donor_id]
        if donor_ids:
            responses_result = await db.execute(
                select(RequirementResponse.donor_id, RequirementResponse.status)
                .where(RequirementResponse.donor_id.in_(donor_ids))
                .order_by(RequirementResponse.created_at.desc())
            )
            for row in responses_result.all():
                if row.donor_id not in latest_responses:
                    latest_responses[row.donor_id] = row.status

    slots: list[DonorSlot] = []
    if bridge:
        for member in bridge.members:
            donor = member.donor
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
                is_backup=member.is_backup,
                requirement_status=latest_responses.get(donor.id) if donor else None
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
    donor = await db.get(User, donor_id)
    if donor is None or donor.role != "Donor":
        raise HTTPException(status_code=404, detail="Donor not found")
    if not donor.phone:
        raise HTTPException(status_code=422, detail="Donor has no phone number on file")

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
        "demo": result.get("demo", False),
    }

@router.post("/notify/{donor_id}/whatsapp", status_code=status.HTTP_200_OK)
async def send_donor_whatsapp_reminder(
    donor_id: int,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Triggers a WhatsApp reminder flow using Twilio (or mock).
    Schedules the 3-day retry and optional Voice AI fallback.
    """
    donor = await db.get(User, donor_id)
    if donor is None or donor.role != "Donor":
        raise HTTPException(status_code=404, detail="Donor not found")
    if not donor.phone:
        raise HTTPException(status_code=422, detail="Donor has no phone number on file")

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

    message_body = f"Hi {donor.name}, you're requested to donate blood for {patient_name} on {due_date}. Please reply '1' to confirm YES, or '2' for NO."

    # --- Create RequirementResponse so UI tracks the pending status ---
    if member and member.bridge:
        from models import Requirement, RequirementResponse
        import uuid
        
        req_result = await db.execute(
            select(Requirement)
            .where(Requirement.patient_id == member.bridge.patient_id)
            .order_by(Requirement.created_at.desc())
            .limit(1)
        )
        req = req_result.scalar_one_or_none()

        if not req:
            req = Requirement(
                external_requirement_id=f"REQ-{uuid.uuid4().hex[:8]}",
                patient_id=member.bridge.patient_id,
                trigger_type="system",
                status="matching"
            )
            db.add(req)
            await db.flush()

        existing_rr = await db.execute(
            select(RequirementResponse)
            .where(RequirementResponse.requirement_id == req.id)
            .where(RequirementResponse.donor_id == donor.id)
        )
        rr = existing_rr.scalar_one_or_none()
        if not rr:
            rr = RequirementResponse(
                requirement_id=req.id,
                donor_id=donor.id,
                status="pending"
            )
            db.add(rr)
        else:
            rr.status = "pending"
        
        await db.commit()
    # ----------------------------------------------------------------

    from config import settings
    from twilio.rest import Client

    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        logger.warning("Twilio credentials not configured. Simulating WhatsApp notification.")
        return {
            "message": "WhatsApp reminder simulated (No Twilio keys)",
            "donor": donor.name,
            "phone": donor.phone,
            "platform": "whatsapp",
            "demo": True,
        }

    try:
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        to_number = donor.phone
        if not to_number.startswith("+"):
            # Assume it needs a plus if it's purely digits (usually US numbers)
            to_number = f"+{to_number}"

        import json
        content_vars = json.dumps({
            "1": donor.name,
            "2": patient_name,
            "3": due_date
        })

        tw_msg = client.messages.create(
            from_=settings.TWILIO_WHATSAPP_FROM,
            content_sid="HX7416ef53111eedb4b2a3def8414ab476",
            content_variables=content_vars,
            to=f"whatsapp:{to_number}"
        )
        logger.info("WhatsApp Reminder sent to %s. SID: %s", to_number, tw_msg.sid)
    except Exception as e:
        logger.error("Twilio WhatsApp failed for %s: %s", donor.phone, e)
        raise HTTPException(status_code=500, detail=f"WhatsApp delivery failed: {str(e)}")

    return {
        "message": "WhatsApp reminder dispatched",
        "donor": donor.name,
        "phone": donor.phone,
        "platform": "whatsapp",
        "demo": False,
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


@router.get("/donors/eligible", response_model=list[DonorSummary])
async def list_eligible_donors(
    _admin: AdminUser,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .where(User.role == "Donor", User.eligibility_status == "eligible")
        .limit(limit)
    )
    return [DonorSummary.model_validate(d) for d in result.scalars().all()]


# ── AI Models and Recommendations ─────────────────────────────────────────────

class MLStatusResponse(BaseModel):
    donor_id: int
    probability: float
    status: str
    model_version: str

@router.get("/donors/{donor_id}/active-status", response_model=MLStatusResponse)
async def get_active_status(
    donor_id: int,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    donor = await db.get(User, donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
    
    donor_dict = {
        "user_donation_active_status": donor.user_donation_active_status,
        "donations_till_date": donor.donations_till_date or 0,
        "eligibility_status": donor.eligibility_status,
    }
    
    prob = predict_active_status(donor_dict)
    return MLStatusResponse(
        donor_id=donor_id,
        probability=prob,
        status="Active" if prob >= 0.5 else "Inactive",
        model_version="active_status_model_v1"
    )

@router.get("/donors/{donor_id}/eligibility-status", response_model=MLStatusResponse)
async def get_eligibility_status(
    donor_id: int,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    donor = await db.get(User, donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
    
    donor_dict = {
        "eligibility_status": donor.eligibility_status,
        "user_donation_active_status": donor.user_donation_active_status,
    }
    
    prob = predict_eligibility_status(donor_dict)
    return MLStatusResponse(
        donor_id=donor_id,
        probability=prob,
        status="Eligible" if prob >= 0.5 else "Not Eligible",
        model_version="eligibility_status_model_v1"
    )

class BackupRecommendation(BaseModel):
    donor_id: int
    donor_name: Optional[str] = None
    donor_phone: Optional[str] = None
    blood_group: Optional[str] = None
    last_donation_date: Optional[date] = None
    match_score: float
    reason: str

class RecommendedBackupsResponse(BaseModel):
    pod_id: int
    recommended_backups: List[BackupRecommendation]
    generated_at: datetime
    model_versions: Dict[str, str]

@router.get("/pods/{pod_id}/recommended-backups", response_model=RecommendedBackupsResponse)
async def get_recommended_backups(
    pod_id: int,
    _admin: AdminUser,
    limit: int = Query(5, ge=1, le=50),
    only_eligible: bool = Query(True),
    exclude_existing_pod_members: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    pod = await db.get(Bridge, pod_id, options=[selectinload(Bridge.patient)])
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")
        
    q = select(User).where(User.role == "Donor", User.blood_group == pod.patient.blood_group)
    
    if exclude_existing_pod_members:
        member_result = await db.execute(select(BridgeMember.donor_id).where(BridgeMember.bridge_id == pod_id))
        existing_member_ids = [row[0] for row in member_result.all()]
        if existing_member_ids:
            q = q.where(User.id.notin_(existing_member_ids))
            
    result = await db.execute(q)
    candidates = result.scalars().all()
    
    recommendations = []
    
    for donor in candidates:
        donor_dict = {
            "eligibility_status": donor.eligibility_status,
            "user_donation_active_status": donor.user_donation_active_status,
            "donations_till_date": donor.donations_till_date or 0,
        }
        
        eligibility_prob = predict_eligibility_status(donor_dict)
        if only_eligible and eligibility_prob < 0.5:
            continue
            
        active_prob = predict_active_status(donor_dict)
        
        base_match_score = 0.5
        if donor.location and pod.patient.location and donor.location == pod.patient.location:
            base_match_score += 0.2
            
        match_score = (0.4 * base_match_score) + (0.3 * active_prob) + (0.3 * eligibility_prob)
        match_score = round(min(match_score, 1.0), 4)
        
        if active_prob > 0.8:
            reason = "High reliability score and optimal distance"
        elif eligibility_prob > 0.8:
            reason = "Eligible and highly compatible blood profile"
        else:
            reason = "Standard backup candidate"
            
        recommendations.append(BackupRecommendation(
            donor_id=donor.id,
            donor_name=donor.name,
            donor_phone=donor.phone,
            blood_group=donor.blood_group,
            last_donation_date=donor.last_donation_date,
            match_score=match_score,
            reason=reason
        ))
        
    recommendations.sort(key=lambda x: x.match_score, reverse=True)
    top_recommendations = recommendations[:limit]
    
    return RecommendedBackupsResponse(
        pod_id=pod_id,
        recommended_backups=top_recommendations,
        generated_at=datetime.utcnow(),
        model_versions={
            "active_status": "xgb-1.0",
            "eligibility": "xgb-1.0"
        }
    )

class AddBackupRequest(BaseModel):
    donor_id: int

@router.post("/pods/{pod_id}/add-backup")
async def add_backup_donor(
    pod_id: int,
    request: AddBackupRequest,
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    pod = await db.get(Bridge, pod_id)
    if not pod:
        raise HTTPException(status_code=404, detail="Pod not found")
        
    donor = await db.get(User, request.donor_id)
    if not donor or donor.role != "Donor":
        raise HTTPException(status_code=404, detail="Donor not found")
        
    # Check if already in pod
    existing = await db.execute(
        select(BridgeMember).where(
            BridgeMember.bridge_id == pod_id, 
            BridgeMember.donor_id == request.donor_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Donor already in pod")
        
    new_member = BridgeMember(bridge_id=pod_id, donor_id=request.donor_id, is_backup=True)
    db.add(new_member)
    await db.commit()
    
    return {"status": "success", "message": "Donor added to pod successfully"}
