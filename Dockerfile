# ── Stage 1: Build ──────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY eslint.config.js ./
COPY postcss.config.js ./
COPY components.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy the rest of the frontend source code
COPY . .

# Build the production bundle
ARG VITE_MOCK_AUTH
ENV VITE_MOCK_AUTH=${VITE_MOCK_AUTH}
RUN npm run build

# ── Stage 2: Serve with nginx ──────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Create non-root user
RUN addgroup -g 1001 -S app && \
    adduser  -u 1001 -S app -G app

# Remove default nginx config and content
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Create required directories and set permissions for non-root
RUN mkdir -p /var/cache/nginx /var/log/nginx /run && \
    chown -R app:app /var/cache/nginx /var/log/nginx /run /usr/share/nginx/html

EXPOSE 8080

USER app

# nginx runs in foreground (required for Docker)
CMD ["nginx", "-g", "daemon off;"]
