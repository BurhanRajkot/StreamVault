FROM node:22-alpine

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

# Expose Vite development port
EXPOSE 8080

# Start Vite (host "::" is set in vite.config.ts — binds to all interfaces)
CMD ["npm", "run", "dev:frontend"]
