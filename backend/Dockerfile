# syntax=docker/dockerfile:1.4
# ── Stage 1: Base Runtime & Environment Setup ─────────────────────
# Pinned by digest (Scorecard); Dependabot's docker updates move tag and digest together
FROM oven/bun:1.4-slim@sha256:b780593f3e10918cbdaec3d5a08d52224b9198069a65eb47812085c2ec007643 AS base

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

# Install all dependencies, exactly as locked
RUN bun install --frozen-lockfile

EXPOSE 4000

ENV CHOKIDAR_USEPOLLING=true

# Execute development server with watch mode
CMD ["bun", "run", "dev"]

# ── Stage 3: Builder for Production ─────────────────────────────
FROM base AS builder

COPY package.json bun.lock* tsconfig.json ./

# Install all dependencies (including devDependencies) to build the app
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build/Transpile code (TypeScript to JavaScript)
RUN bun run build

# Only the runtime dependencies go into the image. `bun install --production`
# over the existing node_modules doesn't remove what's already there, so the
# image used to ship eslint, typescript-eslint, nodemon and the rest — and
# every CVE in them showed up in the image scan. A fresh install does it.
RUN rm -rf node_modules && bun install --frozen-lockfile --production

# ── Stage 4: Production Runtime ─────────────────────────────────
FROM base AS production

# Security Hardening: patch OS packages inherited from the base image.
# The oven/bun:*-slim base ships Debian packages (perl, sqlite, pcre2, gzip,
# libperl/Storable/IO-Compress, …) whose security fixes Debian has released
# but oven hasn't re-baked into the tag yet. Trivy scans this image with
# `ignore-unfixed: true`, so anything it flags HAS an available fix — pulling
# it here at build time is what clears those CVEs from the Security tab. Runs
# as root, before we drop to the unprivileged user below.
RUN apt-get update && \
    apt-get upgrade -y --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Security Hardening: Create unprivileged user (UID/GID 1001)
RUN groupadd --gid 1001 media-app && \
    useradd --uid 1001 --gid media-app --shell /bin/false --create-home media-app

WORKDIR /opt/app

# Copy built artifacts and node_modules from builder
COPY --from=builder /opt/app/dist ./dist
COPY --from=builder /opt/app/node_modules ./node_modules
COPY --from=builder /opt/app/package.json ./

# Set up storage directory for raw media
RUN mkdir -p /media && \
    chown -R media-app:media-app /opt/app /media

USER media-app

ENV NODE_ENV=production

EXPOSE 4000

# Native Bun-based Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://localhost:4000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# JSON array execution to ensure SIGTERM signals propagate correctly (clean exit)
CMD ["bun", "dist/index.js"]
