import asyncio
from sqlalchemy import text
from database import engine

async def migrate_columns():
    async with engine.begin() as conn:
        columns = [
            ("locality", "VARCHAR(255)"),
            ("preferred_center", "VARCHAR(255)"),
            ("contact_preference", "VARCHAR(32)"),
            ("general_availability", "VARCHAR(128)"),
            ("bridge_preference", "BOOLEAN DEFAULT TRUE"),
            ("travel_radius", "INTEGER"),
            ("languages", "VARCHAR(128)"),
            ("medical_notes", "VARCHAR(512)"),
        ]
        for name, col_type in columns:
            try:
                # First check if column exists
                await conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {col_type};"))
                print(f"[MIGRATION] Added column {name} successfully.")
            except Exception as e:
                print(f"[MIGRATION] Column {name} might already exist or failed: {str(e)[:100]}")

if __name__ == "__main__":
    asyncio.run(migrate_columns())
