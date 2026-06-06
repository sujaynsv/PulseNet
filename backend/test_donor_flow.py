import asyncio
import uuid
from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import AsyncSessionLocal
from models import User, Bridge, BridgeMember, Cycle, Requirement, RequirementResponse, TransfusionLog
from routers.donor import get_my_requirements, respond_to_requirement, log_my_donation, LogDonationRequest, RespondRequirementRequest
from auth import DonorUser

async def run_test():
    print("[TEST] Starting E2E Donor Flow Integration Test...")
    async with AsyncSessionLocal() as db:
        # 1. Create unique test emails
        uid = str(uuid.uuid4())[:8]
        patient_email = f"test-patient-{uid}@test.com"
        donor_email = f"test-donor-{uid}@test.com"
        donor_sub = f"sub-donor-{uid}"

        # 2. Create Patient and Donor in DB
        print("[TEST] Creating test patient and donor...")
        patient = User(
            external_id=f"ext-p-{uid}",
            role="Patient",
            email=patient_email,
            name="Test Patient",
            blood_group="B+",
            location="Kukatpally",
            expected_next_transfusion_date=date.today() + timedelta(days=5),
            status="active"
        )
        donor = User(
            cognito_sub=donor_sub,
            external_id=f"ext-d-{uid}",
            role="Donor",
            email=donor_email,
            name="Test Donor",
            blood_group="B+",
            locality="Kukatpally",
            contact_preference="whatsapp",
            eligibility_status="eligible",
            user_donation_active_status="Active",
            status="active",
            donations_till_date=0
        )
        db.add(patient)
        db.add(donor)
        await db.flush()

        # 3. Create Bridge and map Donor
        print("[TEST] Creating Bridge and mapping Donor...")
        bridge = Bridge(
            external_bridge_id=f"bridge-{uid}",
            patient_id=patient.id,
            blood_group_required="B+",
            bridge_status=True
        )
        db.add(bridge)
        await db.flush()

        member = BridgeMember(
            bridge_id=bridge.id,
            donor_id=donor.id,
            cycle_position=1,
            slot_status="Active"
        )
        db.add(member)

        # 4. Create Cycle and Requirement
        print("[TEST] Creating Transfusion Cycle and Requirement event...")
        cycle = Cycle(
            external_cycle_id=f"cycle-{uid}",
            patient_id=patient.id,
            due_date=date.today() + timedelta(days=5),
            expected_units=1,
            status="routine"
        )
        db.add(cycle)
        await db.flush()

        requirement = Requirement(
            external_requirement_id=f"req-{uid}",
            patient_id=patient.id,
            cycle_id=cycle.id,
            trigger_type="scheduled",
            severity="routine",
            status="matching"
        )
        db.add(requirement)
        await db.commit()

        # Re-fetch ids
        patient_id = patient.id
        donor_id = donor.id
        req_id = requirement.id

    # 5. Verify get_my_requirements
    print("[TEST] Testing GET requirements endpoint...")
    async with AsyncSessionLocal() as db:
        current_donor = DonorUser(sub=donor_sub, role="Donor", email=donor_email)
        reqs = await get_my_requirements(current_donor, db)
        assert len(reqs) > 0, "No requirements found for donor!"
        assert reqs[0].requirement_id == req_id
        assert reqs[0].my_response_status == "pending"
        print("[TEST] Requirements successfully queried. Status is pending.")

    # 6. Verify respond_to_requirement
    print("[TEST] Testing POST respond endpoint (Confirm)...")
    async with AsyncSessionLocal() as db:
        current_donor = DonorUser(sub=donor_sub, role="Donor", email=donor_email)
        body = RespondRequirementRequest(status="confirmed")
        response = await respond_to_requirement(req_id, body, current_donor, db)
        print("[TEST] Response object:", response)
        assert response["status"] == "confirmed"
        assert response["requirement_status"] == "covered"
        print("[TEST] Response saved. Requirement coverage upgraded to covered.")

    # 7. Verify log_my_donation
    print("[TEST] Testing POST log donation endpoint...")
    async with AsyncSessionLocal() as db:
        current_donor = DonorUser(sub=donor_sub, role="Donor", email=donor_email)
        body = LogDonationRequest(
            donation_date=date.today(),
            hospital="NIMS Hospital Blood Bank",
            notes="Felt good, Hb 12.5"
        )
        res = await log_my_donation(body, current_donor, db)
        print("[TEST] Donation logged response:", res)
        assert res["total_donations"] == 1
        
        # Verify donor status in DB
        db_donor = await db.get(User, donor_id)
        assert db_donor.eligibility_status == "not eligible"
        assert db_donor.last_donation_date == date.today()
        assert db_donor.next_eligible_date == date.today() + timedelta(days=90)
        
        # Verify TransfusionLog is created
        logs_res = await db.execute(
            select(TransfusionLog).where(TransfusionLog.donor_id == donor_id)
        )
        logs = logs_res.scalars().all()
        assert len(logs) == 1
        assert logs[0].hospital == "NIMS Hospital Blood Bank"
        print("[TEST] Donation logged successfully. Cooldown set and log saved.")

    print("[TEST] ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(run_test())
