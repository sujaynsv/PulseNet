import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import AsyncSessionLocal
from models import User, Bridge, BridgeMember
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from services.ml import predict_active_status, predict_eligibility_status

async def test_recommendations():
    async with AsyncSessionLocal() as db:
        # Assuming we want to test for bridge/pod ID 1
        pod_id = 1
        pod = await db.get(Bridge, pod_id, options=[selectinload(Bridge.patient)])
        if not pod:
            print("Pod 1 not found.")
            return

        print(f"Testing for Pod {pod_id}, Patient Blood Group: {pod.patient.blood_group}")

        q = select(User).where(User.role == "Donor", User.blood_group == pod.patient.blood_group)
        
        member_result = await db.execute(select(BridgeMember.donor_id).where(BridgeMember.bridge_id == pod_id))
        existing_member_ids = [row[0] for row in member_result.all()]
        if existing_member_ids:
            print(f"Excluding existing members: {existing_member_ids}")
            q = q.where(User.id.notin_(existing_member_ids))
            
        result = await db.execute(q)
        candidates = result.scalars().all()
        print(f"Found {len(candidates)} compatible donors matching blood group.")
        
        eligible_count = 0
        for donor in candidates:
            donor_dict = {
                "eligibility_status": donor.eligibility_status,
                "user_donation_active_status": donor.user_donation_active_status,
                "donations_till_date": donor.donations_till_date or 0,
                # Include all fields from User model to make dataframe parsing safer
                "calls_to_donations_ratio": 1.0,
                "donated_earlier": 0,
                "frequency_in_days": 0,
                "cycle_of_donations": 0,
            }
            
            try:
                eligibility_prob = predict_eligibility_status(donor_dict)
            except Exception as e:
                print(f"Error predicting eligibility: {e}")
                eligibility_prob = 0
                
            if eligibility_prob >= 0.5:
                eligible_count += 1
                
        print(f"Found {eligible_count} eligible donors (prob >= 0.5)")

if __name__ == "__main__":
    asyncio.run(test_recommendations())
