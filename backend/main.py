"""
PulseNet — FastAPI Application Entry Point
==========================================
Initializes CORS middleware, registers all persona routers,
and exposes the /api/health endpoint for container health checks.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from database import create_db_tables
from routers import admin, donor, patient

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("pulsenet")


# ── Lifespan (startup / shutdown) ────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Run DB table creation on startup, clean up on shutdown."""
    logger.info("🚀 PulseNet backend starting up …")
    await create_db_tables()
    logger.info("✅ Database tables verified / created.")
    yield
    logger.info("👋 PulseNet backend shutting down.")


# ── Application factory ───────────────────────────────────────────────────────
app = FastAPI(
    title="PulseNet API",
    description=(
        "AI-enabled care coordination platform for Blood Warriors Foundation. "
        "Supports Donor, Patient, and Admin persona flows."
    ),
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)


# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(donor.router, prefix="/api/donor", tags=["Donor"])
app.include_router(patient.router, prefix="/api/patient", tags=["Patient"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])


# ── Health check (required by docker-compose & AWS ECS) ─────────────────────
@app.get("/api/health", summary="Health Check")
async def health() -> JSONResponse:
    """Lightweight endpoint for container orchestration health probes."""
    return JSONResponse(
        content={
            "status": "ok",
            "service": "pulsenet-backend",
            "version": "1.0.0",
        }
    )


# ── Root redirect ─────────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
async def root() -> JSONResponse:
    return JSONResponse({"message": "PulseNet API — visit /api/docs"})
