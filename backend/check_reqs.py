import asyncio
from database import AsyncSessionLocal
from models import Requirement, RequirementResponse
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        reqs = await db.execute(select(Requirement))
        print("Reqs:", len(reqs.scalars().all()))
        resps = await db.execute(select(RequirementResponse))
        print("Resps:", len(resps.scalars().all()))

asyncio.run(main())
