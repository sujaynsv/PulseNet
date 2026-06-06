"""
PulseNet — Application Configuration
Pydantic Settings v2: reads from environment variables and .env file.
"""
from __future__ import annotations

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv("../.env", override=True)



class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ────────────────────────────────────────────────────────────────
    ENV: str = "development"
    SECRET_KEY: str = "change-me-in-production"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000,http://[::1]:5173,http://[::1]:3000"

    # DEMO_MODE = True → bypass Cognito, use simple JWT for local testing
    DEMO_MODE: bool = True

    # ── Database (AWS RDS PostgreSQL) ───────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://pulsenet:pulsenet@localhost:5432/pulsenet"

    # ── AWS ────────────────────────────────────────────────────────────────
    AWS_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_SESSION_TOKEN: str = ""

    # ── AWS Cognito ────────────────────────────────────────────────────────
    COGNITO_USER_POOL_ID: str = ""
    COGNITO_CLIENT_ID: str = ""
    COGNITO_CLIENT_SECRET: str = ""   # Leave blank if app client has no secret
    COGNITO_REGION: str = "us-east-1"

    @property
    def cognito_jwks_url(self) -> str:
        return (
            f"https://cognito-idp.{self.COGNITO_REGION}.amazonaws.com"
            f"/{self.COGNITO_USER_POOL_ID}/.well-known/jwks.json"
        )

    @property
    def cognito_issuer(self) -> str:
        return (
            f"https://cognito-idp.{self.COGNITO_REGION}.amazonaws.com"
            f"/{self.COGNITO_USER_POOL_ID}"
        )

    # ── AWS SNS (SMS notifications) ────────────────────────────────────────
    SNS_TOPIC_ARN: str = ""

    # ── Twilio ─────────────────────────────────────────────────────────────
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = "whatsapp:+14155238886"


    # ── AWS SageMaker ──────────────────────────────────────────────────────
    SAGEMAKER_ENDPOINT_NAME: str = "pulsenet-xgboost-endpoint"

    # ── AWS Bedrock ────────────────────────────────────────────────────────
    BEDROCK_MODEL_ID: str = "anthropic.claude-3-haiku-20240307-v1:0"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
