# syntax=docker/dockerfile:1.4
# ── Stage 1: Base Runtime & Environment Setup ─────────────────────
FROM oven/bun:1.3-slim AS base

ENV WORKDIR=/opt/app
WORKDIR $WORKDIR

# ── Stage 2: Development & Hot-Reloading ──────────────────────────
FROM base AS development

# Install system dependencies needed for dev/debug
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for caching
COPY package.json bun.lock* tsconfig.json ./

# Install all dependencies
RUN bun install

EXPOSE 4000

ENV CHOKIDAR_USEPOLLING=true

# Execute development server with watch mode
CMD ["bun", "run", "dev"]

# ── Stage 3: Builder for Production ─────────────────────────────
FROM base AS builder

COPY package.json bun.lock* tsconfig.json ./

# Install all dependencies (including devDependencies) to build the app
RUN bun install

# Copy source code
COPY . .

# Build/Transpile code (TypeScript to JavaScript)
RUN bun run build

# Prune devDependencies to keep the production image small
RUN bun install --production

# ── Stage 4: Production Runtime ─────────────────────────────────
FROM base AS production

# Security Hardening: Create unprivileged user (UID/GID 1001)
RUN groupadd --gid 1001 media-app && \
    useradd --uid 1001 --gid media-app --shell /bin/false --create-home media-app

WORKDIR /opt/app

# Inject static FFmpeg/FFprobe binaries (saves ~700MB compared to apt-get)
COPY --from=mwader/static-ffmpeg:7.1 /ffmpeg /usr/local/bin/
COPY --from=mwader/static-ffmpeg:7.1 /ffprobe /usr/local/bin/

# Copy built artifacts and node_modules from builder
COPY --from=builder /opt/app/dist ./dist
COPY --from=builder /opt/app/node_modules ./node_modules
COPY --from=builder /opt/app/package.json ./

# Set up storage directories for raw media and temp HLS streaming segments
RUN mkdir -p /media /tmp/hls && \
    chown -R media-app:media-app /opt/app /media /tmp/hls

USER media-app

ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/local/bin/ffmpeg
ENV FFPROBE_PATH=/usr/local/bin/ffprobe

EXPOSE 4000

# Native Bun-based Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://localhost:4000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# JSON array execution to ensure SIGTERM signals propagate correctly (clean exit)
CMD ["bun", "dist/index.js"]
