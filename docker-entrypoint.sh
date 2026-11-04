#!/bin/sh
set -e

echo "🚀 [BunkerS Entrypoint] Synchronizing PostgreSQL database schema..."
if [ -n "$DATABASE_URL" ]; then
  bunx prisma db push --schema=server/prisma/schema.prisma --skip-generate || {
    echo "⚠️ Prisma db push encountered an issue, proceeding to application startup..."
  }
fi

echo "🚀 [BunkerS Entrypoint] Starting BunkerS Enterprise Server..."
exec "$@"
