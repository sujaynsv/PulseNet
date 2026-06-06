import asyncio
from config import get_settings
from services.cognito import cognito_login

async def main():
    try:
        settings = get_settings()
        res = await cognito_login("donor@demo.com", "Donor123!", settings)
        print(res)
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(main())
