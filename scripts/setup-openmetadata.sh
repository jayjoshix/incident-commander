#!/bin/bash
# ────────────────────────────────────────────────────────────
# LineageLock — OpenMetadata Local Setup
#
# This script downloads and starts a local OpenMetadata instance
# using Docker Compose, then seeds it with sample data.
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - Node.js 20+ (for seed script)
#
# Usage:
#   chmod +x scripts/setup-openmetadata.sh
#   ./scripts/setup-openmetadata.sh
# ────────────────────────────────────────────────────────────

set -e

OM_VERSION="${OM_VERSION:-1.6.1}"
OM_PORT="${OM_PORT:-8585}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_DIR="$PROJECT_DIR/.openmetadata"

echo "🔒 LineageLock — OpenMetadata Setup"
echo "   Version: $OM_VERSION"
echo "   Port: $OM_PORT"
echo ""

# ─── Step 1: Check prerequisites ──────────────────────────────────────

echo "📋 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed."
    echo "   Install: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose V2 is not installed."
    echo "   Install: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "  ✅ Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"
echo "  ✅ Docker Compose $(docker compose version --short)"

# ─── Step 2: Download OpenMetadata Docker Compose ────────────────────

echo ""
echo "📥 Setting up OpenMetadata Docker Compose..."

mkdir -p "$COMPOSE_DIR"

if [ ! -f "$COMPOSE_DIR/docker-compose.yml" ]; then
    echo "   Downloading docker-compose.yml for OpenMetadata $OM_VERSION..."
    curl -sL "https://github.com/open-metadata/OpenMetadata/releases/download/${OM_VERSION}-release/docker-compose.yml" \
        -o "$COMPOSE_DIR/docker-compose.yml"
    echo "  ✅ Downloaded"
else
    echo "  ⏭️  docker-compose.yml already exists"
fi

# ─── Step 3: Start OpenMetadata ──────────────────────────────────────

echo ""
echo "🚀 Starting OpenMetadata..."

cd "$COMPOSE_DIR"
docker compose up -d

echo ""
echo "⏳ Waiting for OpenMetadata to be healthy (this may take 2-3 minutes)..."

MAX_RETRIES=60
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    if curl -s "http://localhost:$OM_PORT/api/v1/system/version" > /dev/null 2>&1; then
        VERSION=$(curl -s "http://localhost:$OM_PORT/api/v1/system/version" | grep -oP '"version":"[^"]+"' | head -1)
        echo "  ✅ OpenMetadata is running ($VERSION)"
        break
    fi
    RETRY=$((RETRY + 1))
    sleep 5
    echo "     Waiting... ($((RETRY * 5))s)"
done

if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "❌ OpenMetadata did not start within 5 minutes"
    echo "   Check logs: docker compose -f $COMPOSE_DIR/docker-compose.yml logs"
    exit 1
fi

# ─── Step 4: Get JWT Token ──────────────────────────────────────────

echo ""
echo "🔑 Getting JWT token..."
echo ""
echo "   To get the ingestion-bot JWT token:"
echo "   1. Open http://localhost:$OM_PORT in your browser"
echo "   2. Log in with admin/admin (default credentials)"
echo "   3. Go to Settings → Integrations → Bots → ingestion-bot"
echo "   4. Copy the JWT token"
echo "   5. Run:"
echo ""
echo "      export OPENMETADATA_URL=http://localhost:$OM_PORT"
echo "      export OPENMETADATA_TOKEN=<your-jwt-token>"
echo ""

# ─── Step 5: Seed data ──────────────────────────────────────────────

echo ""
echo "🌱 To seed sample data, run:"
echo "   npx ts-node scripts/seed-openmetadata.ts"
echo ""
echo "Then test LineageLock:"
echo "   npx ts-node src/cli.ts analyze --changed-file models/marts/fact_orders.sql"
echo ""
echo "Or run the integration test:"
echo "   npx ts-node scripts/integration-test.ts"
echo ""
echo "═══════════════════════════════════════════"
echo "🎉 OpenMetadata is ready!"
echo "   UI: http://localhost:$OM_PORT"
echo "   API: http://localhost:$OM_PORT/api/v1"
echo "═══════════════════════════════════════════"
