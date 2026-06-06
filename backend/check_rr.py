import asyncio
from database import AsyncSessionLocal
from models import RequirementResponse, Bridge, BridgeMember, User
from sqlalchemy import select
from sqlalchemy.orm import selectinload

async def main():
    async with AsyncSessionLocal() as db:
        # Check all RequirementResponses
        resps = await db.execute(select(RequirementResponse))
        rr = resps.scalars().all()
        for r in rr:
            print(f"Resp ID: {r.id}, Donor: {r.donor_id}, Req: {r.requirement_id}, Status: {r.status}")

        # Check bridge members and what `get_bridge_panel` would see
        donor_ids = [r.donor_id for r in rr] if rr else []
        if donor_ids:
            print("Donor IDs:", donor_ids)
            latest = await db.execute(
                select(RequirementResponse.donor_id, RequirementResponse.status)
                .where(RequirementResponse.donor_id.in_(donor_ids))
                .order_by(RequirementResponse.created_at.desc())
            )
            for row in latest.all():
                print("LATEST:", row)

asyncio.run(main())
