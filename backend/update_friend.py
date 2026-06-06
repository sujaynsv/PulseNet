import asyncio
from database import AsyncSessionLocal
from models import User, BridgeMember, Bridge
from sqlalchemy import select

async def update_friends():
    async with AsyncSessionLocal() as db:
        # Find 3 donors assigned to Patient 1's bridge (or first available bridge)
        result = await db.execute(
            select(User, Bridge.patient_id)
            .join(BridgeMember, BridgeMember.donor_id == User.id)
            .join(Bridge, Bridge.id == BridgeMember.bridge_id)
            .limit(3)
        )
        rows = result.all()
        
        print("I have updated the following donors:")
        print("-----------------------------------")
        for user, patient_id in rows:
            user.phone = "+917989665270"
            print(f"Donor Name: {user.name}")
            print(f"Look for them under Patient ID: {patient_id}")
            print("-----------------------------------")
        
        await db.commit()

asyncio.run(update_friends())
