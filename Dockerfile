# TLAT License Server
# Node.js + better-sqlite3 (requires native build)

FROM node:22-alpine AS builder

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source
COPY . .

# Production image
FROM node:22-alpine

# better-sqlite3 needs these at runtime
RUN apk add --no-cache libstdc++

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts

# Create data directory for SQLite
RUN mkdir -p /app/data && chown -R node:node /app

# Switch to non-root user
USER node

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3100
ENV DB_PATH=/app/data/licenses.db

EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3100/health || exit 1

# Initialize DB and start
CMD ["sh", "-c", "node scripts/init-db.js && node src/index.js"]
