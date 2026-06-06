import asyncio
from sqlalchemy import update, select
from database import AsyncSessionLocal
from models import User

async def main():
    async with AsyncSessionLocal() as session:
        # Update ALL donors
        await session.execute(
            update(User)
            .where(User.role == "Donor")
            .values(phone="+917386545459")
        )
        await session.commit()
        print("Updated ALL donors' phone numbers.")

asyncio.run(main())
