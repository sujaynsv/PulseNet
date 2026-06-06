"""
PulseNet — FastAPI Application Entry Point
==========================================
Registers all routers, sets up CORS, and creates DB tables on startup.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database import engine
from models import Base
from routers import admin, auth_router, donor, patient, seed, webhooks

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(name)s: %(message)s")
logger = logging.getLogger("pulsenet")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all DB tables on startup (idempotent)."""
    logger.info("Starting PulseNet backend...")
    settings = get_settings()
    logger.info("DEMO_MODE=%s | ENV=%s", settings.DEMO_MODE, settings.ENV)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ready.")
    yield
    logger.info("Shutting down PulseNet backend.")


settings = get_settings()
app = FastAPI(
    title="PulseNet API",
    description="AI-enabled care coordination for Blood Warriors Foundation",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router.router,    prefix="/api/auth",    tags=["Auth"])
app.include_router(admin.router,          prefix="/api/admin",   tags=["Admin"])
app.include_router(seed.router,           prefix="/api/admin",   tags=["Admin Seed"])
app.include_router(donor.router,          prefix="/api/donor",   tags=["Donor"])
app.include_router(patient.router,        prefix="/api/patient", tags=["Patient"])
app.include_router(webhooks.router,       prefix="/api/webhooks",tags=["Webhooks"])

# ── Health endpoints ──────────────────────────────────────────────────────────
@app.get("/api/health", tags=["Health"])
async def health():
    return {
        "status": "ok",
        "service": "pulsenet-backend",
        "version": "1.0.0",
        "demo_mode": settings.DEMO_MODE,
    }


@app.get("/api/ping", tags=["Health"])
async def ping():
    return {"pong": True}
