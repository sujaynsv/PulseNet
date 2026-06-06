"""
PulseNet — Donor Router
========================
Handles all donor-persona endpoints.

Endpoints:
  GET  /api/donor/{external_id}      → Fetch donor profile
  PUT  /api/donor/{external_id}      → Update donor profile / availability
  POST /api/donor/webhook/availability → Receive inbound availability confirmation
  GET  /api/donor/eligible            → List all currently eligible donors
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from schemas import DonorAvailabilityWebhook, UserRead, UserUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


# ── GET: donor profile ────────────────────────────────────────────────────────

@router.get(
    "/{external_id}",
    response_model=UserRead,
    summary="Get donor profile by external ID",
)
async def get_donor(
    external_id: str,
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    result = await db.execute(
        select(User).where(User.external_id == external_id)
    )
    donor = result.scalar_one_or_none()
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Donor '{external_id}' not found.",
        )
    return UserRead.model_validate(donor)


# ── PUT: update donor profile ─────────────────────────────────────────────────

@router.put(
    "/{external_id}",
    response_model=UserRead,
    summary="Update donor profile fields",
)
async def update_donor(
    external_id: str,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    result = await db.execute(
        select(User).where(User.external_id == external_id)
    )
    donor = result.scalar_one_or_none()
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(donor, field, value)

    db.add(donor)
    await db.flush()
    logger.info("Donor %s profile updated: %s", external_id, update_data)
    return UserRead.model_validate(donor)


# ── POST: availability webhook ────────────────────────────────────────────────

@router.post(
    "/webhook/availability",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Receive donor availability confirmation (webhook)",
    description=(
        "Inbound webhook endpoint for automated communication loops "
        "(WhatsApp bot, SMS, email reply parser). "
        "Updates the donor's availability flag and optional next-donation date."
    ),
)
async def donor_availability_webhook(
    payload: DonorAvailabilityWebhook,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    result = await db.execute(
        select(User).where(User.external_id == payload.external_user_id)
    )
    donor = result.scalar_one_or_none()
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found.")

    # Reflect availability in the DB
    donor.user_donation_active_status = "Active" if payload.available else "Inactive"
    if payload.confirmed_date:
        donor.last_donation_date = payload.confirmed_date

    db.add(donor)
    logger.info(
        "Webhook: Donor %s availability set to %s",
        payload.external_user_id,
        payload.available,
    )
    return {
        "accepted": True,
        "donor_id": payload.external_user_id,
        "available": payload.available,
    }


# ── GET: eligible donors list ─────────────────────────────────────────────────

@router.get(
    "/",
    response_model=List[UserRead],
    summary="List eligible donors",
)
async def list_eligible_donors(
    blood_group: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> List[UserRead]:
    query = select(User).where(User.eligibility_status == "eligible")
    if blood_group:
        query = query.where(User.blood_group == blood_group)
    query = query.limit(limit)
    result = await db.execute(query)
    donors = result.scalars().all()
    return [UserRead.model_validate(d) for d in donors]
