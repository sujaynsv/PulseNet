import asyncio
from database import AsyncSessionLocal
from models import User
from services.cognito import cognito_register
from config import get_settings
import uuid
from datetime import date

async def create_admin():
    settings = get_settings()
    email = "admin@test.com"
    
    # AWS Cognito strictly requires: 8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    password = "TestUser123!" 
    
    print(f"🚀 Creating Admin in AWS Cognito: {email}")
    try:
        # This will securely create the user in AWS and add them to the "Admin" group
        sub = await cognito_register(
            email=email, 
            password=password, 
            role="Admin", 
            name="PulseNet Admin", 
            phone="+919999999999", 
            settings=settings
        )
        print(f"✅ Successfully created in AWS! (Sub: {sub})")
    except ValueError as e:
        print(f"⚠️ {e} - Skipping AWS creation, attempting DB only.")
        sub = "manual-admin-sub"
    except Exception as e:
        print(f"❌ Failed to create in AWS Cognito: {e}")
        return

    print("🚀 Saving Admin to PostgreSQL Database...")
    async with AsyncSessionLocal() as db:
        user = User(
            cognito_sub=sub,
            external_id=str(uuid.uuid4()),
            role="Admin",
            email=email,
            name="PulseNet Admin",
            phone="+919999999999",
            status="active",
            registration_date=date.today(),
        )
        db.add(user)
        try:
            await db.commit()
            print("✅ Successfully saved Admin to Database!")
            print(f"\n🎉 ALL DONE! You can now log in at /login with:\nEmail: {email}\nPassword: {password}")
        except Exception as e:
            print(f"❌ Failed to save to Database: {e}")

if __name__ == "__main__":
    asyncio.run(create_admin())
