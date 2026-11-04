# ==============================================================================
# Multi-stage Production Dockerfile for BunkerS
# Full-Stack NestJS Enterprise Backend + Vite React SPA
# ==============================================================================

# 1. Base stage with Bun runtime
FROM oven/bun:alpine AS base
WORKDIR /app

# 2. Dependencies stage
FROM base AS deps
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

# 3. Build stage
FROM deps AS builder
WORKDIR /app
COPY . .
# Generate Prisma Client
RUN bunx prisma generate --schema=server/prisma/schema.prisma
# Build Vite Frontend
RUN bun run build

# 4. Production Runner stage
FROM oven/bun:alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup -S bunkers && adduser -S bunkers -G bunkers

# Copy build artifacts, dependencies and entrypoint
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

# Set proper permissions
RUN chmod +x /app/docker-entrypoint.sh && chown -R bunkers:bunkers /app
USER bunkers

EXPOSE 3000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health/ping').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["bun", "server/src/main.ts"]
