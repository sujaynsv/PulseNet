import asyncio
from sqlalchemy import update, select
from database import AsyncSessionLocal
from models import User

async def main():
    async with AsyncSessionLocal() as session:
        # Get all users with role "Donor"
        result = await session.execute(select(User).where(User.role == "Donor").limit(20))
        donors = result.scalars().all()
        for donor in donors:
            donor.phone = "+917386545459"
        await session.commit()
        print(f"Updated {len(donors)} donors' phone numbers.")

asyncio.run(main())
