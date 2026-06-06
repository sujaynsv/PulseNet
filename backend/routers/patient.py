"""
PulseNet — Patient Router
==========================
Handles all patient-persona endpoints.

Endpoints:
  POST /api/patient/register         → Register a new patient
  GET  /api/patient/{external_id}    → Get patient profile + upcoming transfusions
  POST /api/patient/{external_id}/transfusion → Log a completed transfusion
  GET  /api/patient/{external_id}/schedule    → Return upcoming transfusion dates
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Bridge, TransfusionLog, User
from schemas import (
    TransfusionLogCreate,
    TransfusionLogRead,
    UserCreate,
    UserRead,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── POST: patient registration ────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new thalassemia patient",
)
async def register_patient(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    # Ensure no duplicate external_id
    existing = await db.execute(
        select(User).where(User.external_id == payload.external_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Patient with this external_id already exists.",
        )

    patient = User(**payload.model_dump(), role="Patient", status="active")
    db.add(patient)
    await db.flush()
    logger.info("New patient registered: %s", payload.external_id)
    return UserRead.model_validate(patient)


# ── GET: patient profile ──────────────────────────────────────────────────────

@router.get(
    "/{external_id}",
    response_model=UserRead,
    summary="Get patient profile",
)
async def get_patient(
    external_id: str,
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    result = await db.execute(
        select(User).where(User.external_id == external_id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")
    return UserRead.model_validate(patient)


# ── POST: log a completed transfusion ────────────────────────────────────────

@router.post(
    "/{external_id}/transfusion",
    response_model=TransfusionLogRead,
    status_code=status.HTTP_201_CREATED,
    summary="Log a completed transfusion event",
)
async def log_transfusion(
    external_id: str,
    payload: TransfusionLogCreate,
    db: AsyncSession = Depends(get_db),
) -> TransfusionLogRead:
    result = await db.execute(
        select(User).where(User.external_id == external_id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    log = TransfusionLog(
        patient_id=patient.id,
        transfusion_date=payload.transfusion_date,
        units=payload.units,
        notes=payload.notes,
    )
    db.add(log)
    await db.flush()
    logger.info("Transfusion logged for patient %s on %s", external_id, payload.transfusion_date)
    return TransfusionLogRead.model_validate(log)


# ── GET: transfusion schedule ─────────────────────────────────────────────────

@router.get(
    "/{external_id}/schedule",
    summary="Return upcoming transfusion schedule for a patient",
)
async def get_transfusion_schedule(
    external_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns the patient's active bridges and their expected next
    transfusion dates — used to drive the calendar view in the frontend.
    """
    result = await db.execute(
        select(User).where(User.external_id == external_id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    bridges_result = await db.execute(
        select(Bridge).where(Bridge.patient_id == patient.id, Bridge.bridge_status == True)
    )
    bridges = bridges_result.scalars().all()

    schedule: List[Dict[str, Any]] = []
    for bridge in bridges:
        schedule.append(
            {
                "bridge_id": bridge.external_bridge_id,
                "blood_group": bridge.bridge_blood_group,
                "quantity_required": bridge.quantity_required,
                "last_transfusion_date": str(bridge.last_transfusion_date or ""),
                "expected_next_transfusion_date": str(
                    bridge.expected_next_transfusion_date or ""
                ),
                "days_until_next": (
                    (bridge.expected_next_transfusion_date - date.today()).days
                    if bridge.expected_next_transfusion_date
                    else None
                ),
            }
        )

    return {
        "patient_id": external_id,
        "name": patient.name,
        "blood_group": patient.blood_group,
        "upcoming_transfusions": schedule,
    }
