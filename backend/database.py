"""
PulseNet — Async Database Engine & Session Factory
===================================================
SQLAlchemy 2.0 declarative base + async session dependency for FastAPI.
Uses context-managed generator sessions via `Depends`.
"""

from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from config import settings

# ── Engine ────────────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.ENV == "development",  # SQL logging in dev only
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # recycle stale connections automatically
)

# ── Session factory ───────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── Declarative base (all models inherit from this) ──────────────────────────
class Base(DeclarativeBase):
    pass


# ── Dependency injection ──────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a database session per request.
    Commits on success, rolls back on any exception, and always closes.
    Usage:
        @router.get("/example")
        async def handler(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── DDL creation helper (called on startup) ──────────────────────────────────
async def create_db_tables() -> None:
    """Create all tables defined in models.py if they do not exist."""
    # Import models so their metadata is registered with Base before DDL runs.
    import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
