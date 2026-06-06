import asyncio
from database import AsyncSessionLocal
from routers.admin import generate_ai_insights

async def main():
    async with AsyncSessionLocal() as db:
        try:
            res = await generate_ai_insights(_admin=None, db=db)
            print("SUCCESS:", res)
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(main())
