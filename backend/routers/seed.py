"""
PulseNet — Dataset Seed Router
================================
POST /api/admin/seed → Imports Dataset.csv into the database

Creates:
  - Users (Patients, Bridge Donors, Emergency Donors, Guests, Volunteers)
  - Bridges (one per unique bridge_id hash)
  - BridgeMember records (donor ↔ bridge with cycle positions)
  - Cycles (6 upcoming per patient, with computed confidence scores)
  - Assigns Hyderabad location names based on lat/lon clusters
"""

from __future__ import annotations

import csv
import logging
import math
import os
import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AdminUser
from database import get_db
from models import Bridge, BridgeMember, Cycle, User

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Hyderabad location mapping based on lat/lon clusters ──────────────────────
# Each entry: (lat, lon, name) — we match to the nearest known cluster
HYDERABAD_LOCATIONS = [
    (17.3922, 78.4603, "Banjara Hills"),
    (17.3877, 78.4764, "Himayatnagar"),
    (17.4401, 78.3489, "Kukatpally"),
    (17.4500, 78.3800, "KPHB Colony"),
    (17.3600, 78.4700, "Mehdipatnam"),
    (17.3950, 78.5500, "Uppal"),
    (17.4375, 78.4983, "Secunderabad"),
    (17.3700, 78.5300, "LB Nagar"),
    (17.3650, 78.5100, "Dilsukhnagar"),
    (17.4100, 78.4400, "Ameerpet"),
    (17.3850, 78.4900, "Nampally"),
    (17.4260, 78.4500, "Begumpet"),
    (17.4480, 78.3900, "Miyapur"),
    (17.3500, 78.5500, "Hayathnagar"),
    (17.4950, 78.3990, "Kompally"),
]


def _assign_location(lat: Optional[float], lon: Optional[float]) -> str:
    """Find closest Hyderabad location name for a lat/lon pair."""
    if lat is None or lon is None:
        return "Banjara Hills"  # default

    # Check if the point is way outside Hyderabad (> 1 degree away)
    if abs(lat - 17.4) > 1.0 or abs(lon - 78.5) > 1.0:
        return "Out-of-City (Remote Donor)"  # not a Hyd location — tag as remote

    best_name = "Banjara Hills"
    best_dist = float("inf")
    for loc_lat, loc_lon, name in HYDERABAD_LOCATIONS:
        dist = math.sqrt((lat - loc_lat) ** 2 + (lon - loc_lon) ** 2)
        if dist < best_dist:
            best_dist = dist
            best_name = name
    return best_name


def _parse_date(val: str) -> Optional[date]:
    """Parse a date string from CSV, handling multiple formats."""
    if not val or not val.strip():
        return None
    val = val.strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    return None


def _parse_float(val: str) -> Optional[float]:
    if not val or not val.strip():
        return None
    try:
        return float(val.strip())
    except ValueError:
        return None


def _parse_int(val: str) -> Optional[int]:
    if not val or not val.strip():
        return None
    try:
        return int(float(val.strip()))
    except ValueError:
        return None


def _parse_bool(val: str) -> bool:
    return val.strip().lower() == "true" if val else False


def _normalize_blood_group(bg: str) -> Optional[str]:
    """Normalize 'O Positive' → 'O+', etc."""
    if not bg or not bg.strip():
        return None
    bg = bg.strip()
    mapping = {
        "O Positive": "O+", "O Negative": "O-",
        "A Positive": "A+", "A Negative": "A-",
        "B Positive": "B+", "B Negative": "B-",
        "AB Positive": "AB+", "AB Negative": "AB-",
        "Do not Know": "Unknown",
    }
    res = mapping.get(bg, bg)
    return res[:8] if res else None


def _map_role(csv_role: str) -> str:
    """Map CSV role to app role."""
    r = csv_role.strip()
    if r == "Patient":
        return "Patient"
    return "Donor"  # Bridge Donor, Emergency Donor, Guest, Volunteer → all "Donor"


@router.post("/seed")
async def seed_dataset(
    _admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Import Dataset.csv into the database.
    Idempotent — checks if data already exists before inserting.
    """
    # Check if already seeded
    existing_count = (await db.execute(select(func.count(User.id)))).scalar_one()
    if existing_count > 100:
        return {
            "message": f"Database already has {existing_count} users. Skipping seed.",
            "seeded": False,
        }

    # Find Dataset.csv
    csv_path = os.path.join(os.path.dirname(__file__), "..", "..", "Dataset.csv")
    csv_path = os.path.abspath(csv_path)
    if not os.path.exists(csv_path):
        raise HTTPException(404, f"Dataset.csv not found at {csv_path}")

    logger.info("Starting dataset seed from %s", csv_path)

    # ── Phase 1: Parse CSV ────────────────────────────────────────────────
    rows = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    logger.info("Parsed %d rows from CSV", len(rows))

    # ── Phase 2: Deduplicate users and collect bridge info ─────────────────
    users_by_hash: dict[str, dict] = {}  # user_id_hash → user data
    bridge_rows: list[dict] = []  # rows that have a bridge_id

    for row in rows:
        user_hash = row.get("user_id", "").strip()
        if not user_hash:
            continue

        csv_role = row.get("role", "").strip()
        app_role = _map_role(csv_role)

        lat = _parse_float(row.get("latitude", ""))
        lon = _parse_float(row.get("longitude", ""))
        location = _assign_location(lat, lon)

        # Only store the first occurrence for each user (dedup)
        if user_hash not in users_by_hash:
            users_by_hash[user_hash] = {
                "user_hash": user_hash,
                "role": app_role,
                "csv_role": csv_role,
                "blood_group": _normalize_blood_group(row.get("blood_group", "")),
                "gender": (row.get("gender", "").strip() or None)[:16] if row.get("gender", "").strip() else None,
                "latitude": lat,
                "longitude": lon,
                "location": location,
                "registration_date": _parse_date(row.get("registration_date", "")),
                "eligibility_status": row.get("eligibility_status", "").strip() or None,
                "user_donation_active_status": row.get("user_donation_active_status", "").strip() or None,
                "donations_till_date": _parse_int(row.get("donations_till_date", "")),
                "last_donation_date": _parse_date(row.get("last_donation_date", "")),
                "next_eligible_date": _parse_date(row.get("next_eligible_date", "")),
                "frequency_in_days": _parse_int(row.get("frequency_in_days", "")),
                "calls_to_donations_ratio": _parse_float(row.get("calls_to_donations_ratio", "")),
                "inactive_trigger_comment": row.get("inactive_trigger_comment", "").strip() or None,
                "expected_next_transfusion_date": _parse_date(row.get("expected_next_transfusion_date", "")),
                "last_transfusion_date": _parse_date(row.get("last_transfusion_date", "")),
                "status": row.get("status", "active").strip(),
            }
        else:
            # For patients that also appear as bridge donors, keep Patient role
            if app_role == "Patient":
                users_by_hash[user_hash]["role"] = "Patient"
                users_by_hash[user_hash]["expected_next_transfusion_date"] = _parse_date(row.get("expected_next_transfusion_date", ""))
                users_by_hash[user_hash]["frequency_in_days"] = _parse_int(row.get("frequency_in_days", ""))

        # Collect bridge membership info
        bridge_hash = row.get("bridge_id", "").strip()
        if bridge_hash and csv_role in ("Bridge Donor", "Volunteer"):
            bridge_rows.append({
                "donor_hash": user_hash,
                "bridge_hash": bridge_hash,
                "donated_earlier": _parse_bool(row.get("donated_earlier", "")),
                "last_bridge_donation_date": _parse_date(row.get("last_bridge_donation_date", "")),
                "bridge_blood_group": _normalize_blood_group(row.get("bridge_blood_group", "")),
                "bridge_status": _parse_bool(row.get("bridge_status", "")),
            })

    # ── Phase 3: Create User records ──────────────────────────────────────
    user_hash_to_id: dict[str, int] = {}
    patient_count = 0
    donor_count = 0

    for user_data in users_by_hash.values():
        user = User(
            external_id=str(uuid.uuid4()),
            role=user_data["role"],
            name=f"{'P' if user_data['role'] == 'Patient' else 'D'}-{user_data['user_hash'][:8]}",
            blood_group=user_data["blood_group"],
            gender=user_data["gender"],
            latitude=user_data["latitude"],
            longitude=user_data["longitude"],
            location=user_data["location"],
            registration_date=user_data["registration_date"],
            eligibility_status=user_data["eligibility_status"],
            user_donation_active_status=user_data["user_donation_active_status"],
            donations_till_date=user_data["donations_till_date"],
            last_donation_date=user_data["last_donation_date"],
            next_eligible_date=user_data["next_eligible_date"],
            frequency_in_days=user_data["frequency_in_days"],
            calls_to_donations_ratio=user_data["calls_to_donations_ratio"],
            inactive_trigger_comment=user_data["inactive_trigger_comment"],
            expected_next_transfusion_date=user_data["expected_next_transfusion_date"],
            transfusion_frequency_days=user_data["frequency_in_days"] if user_data["role"] == "Patient" else None,
            status=user_data["status"],
        )
        db.add(user)
        await db.flush()  # get the ID
        user_hash_to_id[user_data["user_hash"]] = user.id

        if user_data["role"] == "Patient":
            patient_count += 1
        else:
            donor_count += 1

    logger.info("Created %d patients and %d donors", patient_count, donor_count)

    # ── Phase 4: Find patient → bridge_hash mapping ───────────────────────
    # Patients in the CSV have a bridge_id that identifies their bridge
    patient_bridge_hashes: dict[str, str] = {}  # bridge_hash → patient_user_hash
    for row in rows:
        if row.get("role", "").strip() == "Patient":
            bridge_hash = row.get("bridge_id", "").strip()
            user_hash = row.get("user_id", "").strip()
            if bridge_hash and user_hash:
                patient_bridge_hashes[bridge_hash] = user_hash

    # ── Phase 5: Create Bridge records ────────────────────────────────────
    bridge_hash_to_id: dict[str, int] = {}
    bridges_created = 0

    for bridge_hash, patient_hash in patient_bridge_hashes.items():
        patient_id = user_hash_to_id.get(patient_hash)
        if not patient_id:
            continue

        patient_data = users_by_hash.get(patient_hash, {})
        bridge = Bridge(
            external_bridge_id=str(uuid.uuid4()),
            patient_id=patient_id,
            blood_group_required=patient_data.get("blood_group"),
            bridge_status=True,
        )
        db.add(bridge)
        await db.flush()
        bridge_hash_to_id[bridge_hash] = bridge.id
        bridges_created += 1

    logger.info("Created %d bridges", bridges_created)

    # ── Phase 6: Create BridgeMember records ──────────────────────────────
    members_created = 0
    bridge_position_counter: dict[int, int] = {}  # bridge_id → next position

    for br in bridge_rows:
        bridge_id = bridge_hash_to_id.get(br["bridge_hash"])
        donor_id = user_hash_to_id.get(br["donor_hash"])
        if not bridge_id or not donor_id:
            continue

        pos = bridge_position_counter.get(bridge_id, 0) + 1
        bridge_position_counter[bridge_id] = pos

        member = BridgeMember(
            bridge_id=bridge_id,
            donor_id=donor_id,
            cycle_position=pos,
            donated_earlier=br["donated_earlier"],
            last_donation_date=br["last_bridge_donation_date"],
            slot_status="Active" if pos <= 8 else "Inactive",
        )
        db.add(member)
        members_created += 1

    logger.info("Created %d bridge members", members_created)

    # ── Phase 7: Generate cycles for each patient ─────────────────────────
    cycles_created = 0
    today = date.today()

    for patient_hash, patient_data in users_by_hash.items():
        if patient_data["role"] != "Patient":
            continue

        patient_id = user_hash_to_id.get(patient_hash)
        if not patient_id:
            continue

        freq = patient_data.get("frequency_in_days") or 18
        next_date = patient_data.get("expected_next_transfusion_date")

        # If next_date is in the past, shift forward to near today
        if next_date and next_date < today:
            days_behind = (today - next_date).days
            cycles_behind = (days_behind // freq) + 1
            next_date = next_date + timedelta(days=freq * cycles_behind)
        elif not next_date:
            next_date = today + timedelta(days=freq)

        # Compute confidence from bridge member count
        bridge_hash = None
        for bh, ph in patient_bridge_hashes.items():
            if ph == patient_hash:
                bridge_hash = bh
                break

        active_members = 0
        total_members = 0
        if bridge_hash and bridge_hash in bridge_hash_to_id:
            bid = bridge_hash_to_id[bridge_hash]
            total_members = bridge_position_counter.get(bid, 0)
            # Rough estimate: members with donated_earlier or eligible
            for br in bridge_rows:
                if br["bridge_hash"] == bridge_hash:
                    donor_data = users_by_hash.get(br["donor_hash"], {})
                    if donor_data.get("eligibility_status") == "eligible":
                        active_members += 1

        base_confidence = round((active_members / max(total_members, 1)) * 100) if total_members > 0 else 0

        for i in range(6):
            cycle_date = next_date + timedelta(days=freq * i)
            # Confidence degrades for further-out cycles
            conf = max(base_confidence - (i * 5), 0)

            cycle = Cycle(
                external_cycle_id=str(uuid.uuid4()),
                patient_id=patient_id,
                due_date=cycle_date,
                expected_units=2,
                status="routine" if conf >= 70 else ("at_risk" if conf >= 40 else "emergency"),
                confidence_score=conf,
            )
            db.add(cycle)
            cycles_created += 1

    logger.info("Created %d cycles", cycles_created)

    # ── Commit all ────────────────────────────────────────────────────────
    await db.commit()

    summary = {
        "message": "Dataset seeded successfully!",
        "seeded": True,
        "patients": patient_count,
        "donors": donor_count,
        "bridges": bridges_created,
        "bridge_members": members_created,
        "cycles": cycles_created,
        "total_csv_rows": len(rows),
    }
    logger.info("Seed complete: %s", summary)
    return summary
