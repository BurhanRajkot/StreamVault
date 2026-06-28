# syntax=docker/dockerfile:1.4
# ── Stage 1: Base Node Environment ──────────────────────────────────
FROM node:24-slim AS base

ENV WORKDIR=/opt/app
WORKDIR $WORKDIR

# ── Stage 2: Development & Hot-Reloading ──────────────────────────
FROM base AS development

# Copy only package files to cache dependencies
COPY package*.json ./

# Install all dependencies
RUN npm install --legacy-peer-deps

EXPOSE 8080

ENV CHOKIDAR_USEPOLLING=true

# Start Vite development server bound to all interfaces
CMD ["npm", "run", "dev:frontend", "--", "--host", "0.0.0.0", "--port", "8080"]

# ── Stage 3: Builder for Production ─────────────────────────────
FROM base AS builder

# Copy package files first for layer caching
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY eslint.config.js ./
COPY postcss.config.js ./
COPY components.json ./

# Install dependencies for building
RUN npm install --legacy-peer-deps

# Copy the rest of the frontend source code
COPY . .

# Build the production bundle
ARG VITE_MOCK_AUTH
ENV VITE_MOCK_AUTH=${VITE_MOCK_AUTH}
RUN npm run build

# ── Stage 4: Serve with nginx (Production) ──────────────────────────
FROM nginx:1.30-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S app && \
    adduser  -u 1001 -S app -G app

# Remove default nginx config and content
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /opt/app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Create required directories and set permissions for non-root
RUN mkdir -p /var/cache/nginx /var/log/nginx /run && \
    chown -R app:app /var/cache/nginx /var/log/nginx /run /usr/share/nginx/html

EXPOSE 8080

USER app

# nginx runs in foreground (required for Docker)
CMD ["nginx", "-g", "daemon off;"]
