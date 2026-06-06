"""
PulseNet — Donor-to-Pod Matching Service
==========================================
Implements the PulseNet Matching Rules for auto-assigning a donor to the best-fit
Blood Bridge pod based on distance, blood group, and pod capacity.
"""

import logging
import math
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import Bridge, BridgeMember, User

logger = logging.getLogger(__name__)

# Basic Blood Compatibility Matrix (Donor -> can donate to -> Patient)
BLOOD_COMPATIBILITY = {
    "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
    "O+": ["O+", "A+", "B+", "AB+"],
    "A-": ["A-", "A+", "AB-", "AB+"],
    "A+": ["A+", "AB+"],
    "B-": ["B-", "B+", "AB-", "AB+"],
    "B+": ["B+", "AB+"],
    "AB-": ["AB-", "AB+"],
    "AB+": ["AB+"]
}

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points on Earth in kilometers."""
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return 9999.0
    R = 6371.0 # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) * math.sin(dlat / 2) +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) * math.sin(dlon / 2))
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

async def assign_donor_to_pod(donor_id: int, db: AsyncSession) -> dict:
    """
    Auto-assigns a donor to the best matching Blood Bridge pod.
    """
    donor = await db.get(User, donor_id)
    if not donor or donor.role != "Donor":
        return {"status": "error", "message": "Invalid donor"}

    # 1. Check if already assigned to a primary pod
    existing_assignment = (await db.execute(
        select(BridgeMember)
        .where(BridgeMember.donor_id == donor.id)
        .limit(1)
    )).scalar_one_or_none()

    if existing_assignment:
        return {"status": "already_assigned", "pod_id": existing_assignment.bridge_id}

    # 2. Fetch all candidate pods
    # We fetch all active bridges and their patient's location
    bridges_res = await db.execute(
        select(Bridge)
        .where(Bridge.bridge_status == True)
        .options(selectinload(Bridge.patient), selectinload(Bridge.members))
    )
    bridges = bridges_res.scalars().all()

    candidate_pods = []
    
    donor_bg = donor.blood_group
    donor_lat, donor_lon = donor.latitude, donor.longitude
    donor_travel_radius = donor.travel_radius or 15  # Default 15km
    donor_locality = donor.locality or donor.location

    for bridge in bridges:
        patient = bridge.patient
        if not patient:
            continue
            
        # Capacity check (max 10 donors per pod)
        current_size = len(bridge.members)
        if current_size >= 10:
            continue
            
        # Blood compatibility check
        patient_bg = patient.blood_group
        if not patient_bg or not donor_bg:
            continue
            
        compatible_groups = BLOOD_COMPATIBILITY.get(donor_bg, [donor_bg])
        if patient_bg not in compatible_groups:
            continue

        # Distance check
        dist = 9999.0
        if donor_lat is not None and donor_lon is not None and patient.latitude is not None and patient.longitude is not None:
            dist = haversine_distance(donor_lat, donor_lon, patient.latitude, patient.longitude)
            if dist > donor_travel_radius:
                continue
        else:
            # Fallback: locality matching if coordinates are missing
            patient_locality = patient.locality or patient.location
            if patient_locality and donor_locality:
                if patient_locality.lower() != donor_locality.lower():
                    # If they don't match exactly and we have no coords, we might skip or give a high distance.
                    # Let's be lenient if both are in Hyderabad (assumed by DB) but apply a penalty.
                    dist = donor_travel_radius - 1 # Just within radius, but low score
            else:
                dist = 0.0 # Blind match
                
        candidate_pods.append({
            "bridge": bridge,
            "patient": patient,
            "current_size": current_size,
            "distance": dist,
            "exact_blood_match": patient_bg == donor_bg
        })

    if not candidate_pods:
        donor.status = "unassigned_available"
        await db.commit()
        return {"status": "no_eligible_pod", "donor_status": "unassigned_available"}

    # 3. Score candidate pods
    scored_pods = []
    for pod in candidate_pods:
        # Blood match score: 1.0 for exact, 0.7 for compatible
        blood_score = 1.0 if pod["exact_blood_match"] else 0.7
        
        # Proximity score: Normalize distance 0 to travel_radius
        radius = donor_travel_radius if donor_travel_radius > 0 else 15
        prox_score = max(0.0, 1.0 - (pod["distance"] / radius))
        
        # Pod need score: Higher if pod size is small
        # Formula: 1.0 for empty pod, 0.0 for full pod (10)
        need_score = max(0.0, 1.0 - (pod["current_size"] / 10.0))
        
        # Total score (Equal weights for MVP)
        total_score = (blood_score * 0.3) + (prox_score * 0.3) + (need_score * 0.4)
        
        scored_pods.append((total_score, pod))

    # 4. Sort and select best pod
    scored_pods.sort(key=lambda x: (-x[0], x[1]["current_size"])) # Sort by score desc, then size asc
    best_match = scored_pods[0][1]
    best_bridge = best_match["bridge"]
    
    # 5. Assign Donor
    # Find the next available cycle position (1 to 10)
    occupied_positions = {m.cycle_position for m in best_bridge.members}
    next_pos = 1
    while next_pos in occupied_positions:
        next_pos += 1
        
    new_member = BridgeMember(
        bridge_id=best_bridge.id,
        donor_id=donor.id,
        cycle_position=next_pos,
        slot_status="Active"
    )
    db.add(new_member)
    
    # Mark donor as active
    donor.status = "active"
    await db.commit()
    
    logger.info(f"Donor {donor.id} assigned to Bridge {best_bridge.id} at position {next_pos}")
    
    return {
        "status": "assigned",
        "pod_id": best_bridge.id,
        "patient_name": best_match["patient"].name,
        "role": "primary",
        "mode": "auto"
    }
