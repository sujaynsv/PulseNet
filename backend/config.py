"""
PulseNet — Application Configuration
=====================================
Reads environment variables via Pydantic Settings v2.
"""

from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = (
        "postgresql+asyncpg://pulsenet:pulsenet_dev_secret@localhost:5432/pulsenet"
    )

    # Security
    secret_key: str = "dev_secret_change_me"

    # CORS — comma-separated in .env
    allowed_origins: str = "http://localhost:3000,http://frontend:3000"

    # App
    env: str = "development"
    debug: bool = False

    # AWS (optional; populated when deploying to cloud)
    aws_region: str = "us-east-1"
    sagemaker_endpoint_name: str = "pulsenet-xgboost-endpoint"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Module-level singleton — import `settings` throughout the app
settings = get_settings()
