# ─────────────────────────────────────────────
# FastAPI Backend — Dockerfile (Production)
# Multi-stage build; non-root user; small image
# ─────────────────────────────────────────────

# ── Stage 1: dependency resolution ───────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip wheel --no-cache-dir --no-deps --wheel-dir /build/wheels -r requirements.txt

# ── Stage 2: production runtime ──────────────
FROM python:3.11-slim AS runtime

LABEL maintainer="PulseNet Team <team@pulsenet.ai>"
LABEL description="Blood Warriors PulseNet FastAPI backend"

# Runtime system deps only (libpq for psycopg2, curl for health check)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN groupadd -g 1001 pulsenet && \
    useradd -r -u 1001 -g pulsenet pulsenet

WORKDIR /app

# Copy pre-built wheels and install
COPY --from=builder /build/wheels /wheels
RUN pip install --no-cache-dir /wheels/* && rm -rf /wheels

# Copy application source
COPY --chown=pulsenet:pulsenet . .

USER pulsenet

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
