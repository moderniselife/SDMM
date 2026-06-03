# ============================================================================
# SchroDrive Media Manager — Dockerfile
# Multi-stage build: Frontend (Vite) → Backend (Bun) → Runtime (Bun + FFmpeg)
# ============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build Frontend
# ---------------------------------------------------------------------------
FROM oven/bun:latest AS frontend-build

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package.json frontend/bun.lock* ./

# Install frontend dependencies
RUN bun install --frozen-lockfile || bun install

# Copy frontend source
COPY frontend/ ./

# Build static assets
RUN bun run build

# ---------------------------------------------------------------------------
# Stage 2: Prepare Backend
# ---------------------------------------------------------------------------
FROM oven/bun:latest AS backend-build

WORKDIR /app/backend

# Copy backend package files
COPY backend/package.json backend/bun.lock* ./

# Install backend dependencies (production only)
RUN bun install --frozen-lockfile --production || bun install --production

# Copy backend source
COPY backend/ ./

# ---------------------------------------------------------------------------
# Stage 3: Runtime
# ---------------------------------------------------------------------------
FROM oven/bun:1-debian AS runtime

# Install FFmpeg, FFprobe, MKVToolNix, and utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    mkvtoolnix \
    mediainfo \
    curl \
    ca-certificates \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Create app user (--force handles pre-existing GID in base image)
ARG PUID=1000
ARG PGID=1000
RUN groupadd --force -g ${PGID} schrodrive && \
    (id -u schrodrive &>/dev/null || useradd -u ${PUID} -g schrodrive -m -s /bin/bash schrodrive)

# Create required directories
RUN mkdir -p /config /media/downloads/incomplete /media/downloads/complete \
    /media/staging /media/library /cloud/realdebrid /cloud/torbox /app/logs \
    && chown -R schrodrive:schrodrive /config /media /app /cloud

WORKDIR /app

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Copy backend with dependencies
COPY --from=backend-build /app/backend ./backend

# Copy root config
COPY config.example.json ./config.example.json

# Environment defaults
ENV PORT=8686 \
    PUID=1000 \
    PGID=1000 \
    TZ=Australia/Sydney \
    NODE_ENV=production \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=video,compute,utility

# Expose port
EXPOSE 8686

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:8686/api/health || exit 1

# Entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["bun", "run", "backend/src/index.ts"]
