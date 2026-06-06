# ────────────────────────────────────────────────
# PulseNet Frontend — Dockerfile (React + Vite)
# Multi-stage: builder → Nginx runtime
# ────────────────────────────────────────────────

# ── Stage 1: Build the Vite app ───────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

COPY . .

ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: Serve with Nginx ─────────────────
FROM nginx:1.25-alpine AS runner

LABEL maintainer="PulseNet Team"
LABEL description="PulseNet React+Vite frontend via Nginx"

# Non-root user for Nginx
RUN addgroup -g 1001 -S pulsenet && \
    adduser -S -u 1001 -G pulsenet pulsenet

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx config (handles SPA routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Nginx needs these dirs to be writable by non-root
RUN chown -R pulsenet:pulsenet /var/cache/nginx /var/run /var/log/nginx /usr/share/nginx/html

USER pulsenet

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/api/ping 2>/dev/null || wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
