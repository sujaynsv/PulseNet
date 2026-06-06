import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import AsyncSessionLocal
from routers.admin import get_recommended_backups
from auth import AdminUser

async def test():
    async with AsyncSessionLocal() as db:
        # Mock admin user
        admin = AdminUser(id=1, username="admin", email="admin@test.com", role="Admin", city="Hyderabad")
        
        try:
            # Test pod 1
            print("Calling get_recommended_backups for pod 1...")
            response = await get_recommended_backups(
                pod_id=1,
                _admin=admin,
                limit=5,
                only_eligible=True,
                exclude_existing_pod_members=True,
                db=db
            )
            
            print(f"Response Pod ID: {response.pod_id}")
            print(f"Recommendations found: {len(response.recommended_backups)}")
            for rec in response.recommended_backups:
                print(f" Donor {rec.donor_id}: match={rec.match_score}, reason={rec.reason}")
        except Exception as e:
            print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(test())
