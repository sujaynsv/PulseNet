import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import AsyncSessionLocal
from models import User, BridgeMember, Bridge

async def main():
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(BridgeMember)
            .join(User, BridgeMember.donor_id == User.id)
            .where(User.phone == "+917386545459")
            .options(selectinload(BridgeMember.bridge).selectinload(Bridge.patient))
        )
        members = result.scalars().all()
        patients = list(set([m.bridge.patient.name for m in members if m.bridge and m.bridge.patient]))
        print(f"Patients: {patients}")

asyncio.run(main())
