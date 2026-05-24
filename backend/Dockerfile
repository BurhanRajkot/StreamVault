# ── Stage 1: Build ──────────────────────────────────────────
FROM oven/bun:latest AS builder

WORKDIR /app

# Copy package files for layer caching
COPY package*.json bun.lock tsconfig.json ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the backend source code
COPY . .

# Build the TypeScript to JavaScript
RUN bun run build

# ── Stage 2: Production Runtime ─────────────────────────────
FROM oven/bun:latest AS runtime

WORKDIR /app

# Create non-root user
RUN groupadd --gid 1001 app && \
    useradd  --uid 1001 --gid app --shell /bin/false app

# Copy only the built output and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Expose Backend port
EXPOSE 4000

# Switch to non-root user
USER app

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://localhost:4000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start production server
CMD ["bun", "dist/index.js"]
