"""
PulseNet — Admin Router
========================
Endpoints for the care coordinator / admin persona.

Endpoints:
  GET /api/admin/stats             → Global dashboard statistics
  GET /api/admin/bridge/mock       → Mock bridge ranking (proves E2E connectivity)
  GET /api/admin/bridges           → List all active bridges
  GET /api/admin/donors/inactive   → Donors flagged as inactive (re-engagement candidates)
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Bridge, BridgeMember, User
from schemas import BridgeRead, UserRead
from services.ml import rank_donors

logger = logging.getLogger(__name__)

router = APIRouter()


# ── GET: global dashboard stats ───────────────────────────────────────────────

@router.get(
    "/stats",
    summary="Dashboard — aggregated platform statistics",
)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns key metrics for the admin overview dashboard:
      - Total donors / patients
      - Active bridges count
      - Eligible vs ineligible donors
      - Donor active status breakdown
    """
    total_users: int = (await db.execute(func.count(User.id))).scalar_one()
    total_bridges: int = (await db.execute(func.count(Bridge.id))).scalar_one()
    active_bridges: int = (
        await db.execute(
            select(func.count(Bridge.id)).where(Bridge.bridge_status == True)
        )
    ).scalar_one()
    eligible_donors: int = (
        await db.execute(
            select(func.count(User.id)).where(User.eligibility_status == "eligible")
        )
    ).scalar_one()
    active_donors: int = (
        await db.execute(
            select(func.count(User.id)).where(
                User.user_donation_active_status == "Active"
            )
        )
    ).scalar_one()

    return {
        "total_users": total_users,
        "total_bridges": total_bridges,
        "active_bridges": active_bridges,
        "eligible_donors": eligible_donors,
        "active_donors": active_donors,
        "donor_fatigue_risk": max(0, total_users - active_donors),
        "as_of": date.today().isoformat(),
    }


# ── GET: mock bridge endpoint (proves full-stack connectivity) ────────────────

@router.get(
    "/bridge/mock",
    summary="Mock — Patient + ranked donor list (end-to-end test)",
    description=(
        "Returns a simulated patient record paired with a ranked list of "
        "replacement donors produced by the ML ranking service. "
        "Directly consumed by the frontend dashboard to prove E2E connectivity."
    ),
)
async def mock_bridge_ranking() -> Dict[str, Any]:
    """
    Hard-coded mock. Replace with real DB query + ML inference in feature/admin-ai.
    Demonstrates the expected response contract for the frontend.
    """
    mock_patient = {
        "external_id": "patient_001",
        "name": "Riya Sharma",
        "blood_group": "O Positive",
        "next_transfusion_date": "2025-09-08",
        "bridge_id": "bridge_abc123",
    }

    # Candidate donors — fields mirror Dataset.csv columns
    candidate_donors: List[Dict[str, Any]] = [
        {
            "external_id": "donor_A",
            "name": "Arjun Mehta",
            "blood_group": "O Positive",
            "eligibility_status": "eligible",
            "user_donation_active_status": "Active",
            "calls_to_donations_ratio": 1.0,
            "donations_till_date": 8,
            "frequency_in_days": 90,
            "donated_earlier": True,
            "distance_km": 3.2,
        },
        {
            "external_id": "donor_B",
            "name": "Priya Nair",
            "blood_group": "O Positive",
            "eligibility_status": "eligible",
            "user_donation_active_status": "Active",
            "calls_to_donations_ratio": 0.43,
            "donations_till_date": 7,
            "frequency_in_days": 90,
            "donated_earlier": False,
            "distance_km": 7.5,
        },
        {
            "external_id": "donor_C",
            "name": "Sai Reddy",
            "blood_group": "O Positive",
            "eligibility_status": "not eligible",
            "user_donation_active_status": "Inactive",
            "calls_to_donations_ratio": 9.0,
            "donations_till_date": 1,
            "frequency_in_days": 90,
            "donated_earlier": False,
            "distance_km": 12.0,
        },
        {
            "external_id": "donor_D",
            "name": "Kavitha Iyer",
            "blood_group": "O Positive",
            "eligibility_status": "eligible",
            "user_donation_active_status": "Active",
            "calls_to_donations_ratio": 0.14,
            "donations_till_date": 5,
            "frequency_in_days": 26,
            "donated_earlier": True,
            "distance_km": 1.8,
        },
    ]

    ranked = rank_donors(candidate_donors)

    return {
        "patient": mock_patient,
        "ranked_donors": ranked,
        "model_used": "heuristic_fallback",  # changes to "xgboost" when real model loads
        "generated_at": date.today().isoformat(),
    }


# ── GET: active bridges ───────────────────────────────────────────────────────

@router.get(
    "/bridges",
    response_model=List[BridgeRead],
    summary="List all active Blood Bridges",
)
async def list_active_bridges(
    db: AsyncSession = Depends(get_db),
) -> List[BridgeRead]:
    result = await db.execute(
        select(Bridge).where(Bridge.bridge_status == True).limit(100)
    )
    bridges = result.scalars().all()
    return [BridgeRead.model_validate(b) for b in bridges]


# ── GET: inactive donors ──────────────────────────────────────────────────────

@router.get(
    "/donors/inactive",
    response_model=List[UserRead],
    summary="List donors at risk of dropout (re-engagement targets)",
)
async def list_inactive_donors(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> List[UserRead]:
    """
    Returns donors marked Inactive — primary targets for the automated
    re-engagement communication loop (SMS/WhatsApp).
    """
    result = await db.execute(
        select(User)
        .where(User.user_donation_active_status == "Inactive")
        .limit(limit)
    )
    donors = result.scalars().all()
    return [UserRead.model_validate(d) for d in donors]
