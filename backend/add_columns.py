import asyncio
from sqlalchemy import text
from database import engine

async def add_columns():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN clinical_alert VARCHAR(512);"))
            print("Added clinical_alert to users")
        except Exception as e:
            print("Failed to add clinical_alert:", e)
            
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN hb_decline_flag BOOLEAN DEFAULT FALSE;"))
            print("Added hb_decline_flag to users")
        except Exception as e:
            print("Failed to add hb_decline_flag:", e)
            
        try:
            await conn.execute(text("ALTER TABLE transfusion_logs ADD COLUMN pretransfusion_hb FLOAT;"))
            print("Added pretransfusion_hb to transfusion_logs")
        except Exception as e:
            print("Failed to add pretransfusion_hb:", e)

if __name__ == "__main__":
    asyncio.run(add_columns())
