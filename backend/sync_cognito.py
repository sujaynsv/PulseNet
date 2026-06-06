import asyncio
import boto3
import argparse
from database import AsyncSessionLocal
from models import User
from sqlalchemy import select
from config import settings

async def sync_users_to_cognito(limit: int = 50, role_filter: str = None, target_name: str = None):
    print(f"Starting migration to Cognito...")
    
    client = boto3.client(
        "cognito-idp",
        region_name=settings.COGNITO_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )
    
    async with AsyncSessionLocal() as session:
        # Fetch users without cognito_sub
        query = select(User).where(User.cognito_sub == None)
        if target_name:
            query = query.where(User.name == target_name)
        elif role_filter:
            query = query.where(User.role == role_filter)
            
        query = query.limit(limit)
        
        result = await session.execute(query)
        users = result.scalars().all()
        
        if not users:
            print("No users found that need syncing.")
            return

        print(f"Found {len(users)} users to migrate.")
        
        success_count = 0
        for user in users:
            # Generate email if they don't have one
            email = user.email
            if not email:
                if user.name and r"\x" in user.name:
                    extracted = user.name.split(r"\x")[-1]
                    email = f"{extracted}@pulsenet.ai"
                else:
                    email = f"user_{user.id}@pulsenet.ai"
                    
            password = "Demo123!"
            
            try:
                print(f"Migrating {user.role} ID {user.id} -> {email}...")
                
                # Create user in Cognito (ONLY using email, phone is skipped)
                response = client.admin_create_user(
                    UserPoolId=settings.COGNITO_USER_POOL_ID,
                    Username=email,
                    UserAttributes=[
                        {"Name": "email", "Value": email},
                        {"Name": "email_verified", "Value": "true"}
                    ],
                    MessageAction="SUPPRESS" 
                )
                
                cognito_sub = next(attr["Value"] for attr in response["User"]["Attributes"] if attr["Name"] == "sub")
                
                # Set permanent password
                client.admin_set_user_password(
                    UserPoolId=settings.COGNITO_USER_POOL_ID,
                    Username=email,
                    Password=password,
                    Permanent=True
                )
                
                # Add to Role Group
                client.admin_add_user_to_group(
                    UserPoolId=settings.COGNITO_USER_POOL_ID,
                    Username=email,
                    GroupName=user.role
                )
                
                # Update RDS
                user.cognito_sub = cognito_sub
                user.email = email
                await session.commit()
                
                success_count += 1
                
            except client.exceptions.UsernameExistsException:
                print(f"  -> Error: Email {email} already exists in Cognito.")
            except Exception as e:
                print(f"  -> AWS Error for {email}: {str(e)}")
                
        print(f"\nMigration Complete! Successfully synced {success_count} users.")
        print(f"Password for all synced accounts is: Demo123!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk sync RDS users to Cognito")
    parser.add_argument("--limit", type=int, default=10, help="Number of users to migrate")
    parser.add_argument("--role", type=str, default=None, help="Filter by role (Donor/Patient)")
    parser.add_argument("--name", type=str, default=None, help="Filter by exact name (e.g., D-\\x965f27)")
    args = parser.parse_args()
    
    asyncio.run(sync_users_to_cognito(limit=args.limit, role_filter=args.role, target_name=args.name))
