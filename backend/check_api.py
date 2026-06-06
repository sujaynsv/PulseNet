import asyncio
import json
from database import AsyncSessionLocal
from models import User
from sqlalchemy import select
from routers.admin import get_bridge_panel

async def f():
    async with AsyncSessionLocal() as db:
        # Find the admin user
        admin = (await db.execute(select(User).limit(1))).scalar_one()
        # the screenshot had patient_id = 1 (P-..., or patient_id=2? We don't know, we'll loop over some patients)
        for pid in range(1, 5):
            try:
                res = await get_bridge_panel(pid, admin, db)
                print(f"PATIENT {pid}:")
                for slot in res.slots:
                    if slot.requirement_status is not None:
                        print(f"  Donor {slot.donor_id}: {slot.requirement_status}")
            except Exception as e:
                pass

asyncio.run(f())
