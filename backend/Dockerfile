FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lock ./
COPY tsconfig.json ./

# Install dependencies using bun
RUN bun install

# Copy the rest of the backend source code
COPY . .

# Expose Backend development port
EXPOSE 4000

# Start backend using bun watch
CMD ["bun", "run", "dev"]
