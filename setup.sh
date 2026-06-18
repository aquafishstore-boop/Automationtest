#!/usr/bin/env bash
#
# UAT Tester - HP Z440 Deployment Script
# Target: Debian/Ubuntu on HP Z440 with Docker
# URL:    https://UATAPPv1.aetheriscloudgroup.uk
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================"
echo "  UAT Tester - HP Z440 Deployment"
echo "============================================"

# --- Prerequisites ---
echo ""
echo "[1/6] Checking prerequisites..."

# Check Docker
if ! command -v docker &>/dev/null; then
    echo "ERROR: Docker not found. Install Docker first:"
    echo "  curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# Check Docker Compose
if ! docker compose version &>/dev/null; then
    echo "ERROR: Docker Compose not found."
    exit 1
fi

echo "  Docker: $(docker --version)"
echo "  Compose: $(docker compose version --short 2>/dev/null || true)"

# --- Create directories ---
echo ""
echo "[2/6] Creating data directories..."

mkdir -p custom-scripts
mkdir -p cloudflared
mkdir -p data-backup

# --- Setup .env ---
echo ""
echo "[3/6] Setting up environment..."

if [ ! -f .env ]; then
    cp .env.example .env
    echo "  Created .env from .env.example"
    echo "  EDIT .env WITH YOUR SETTINGS!"
else
    echo "  .env already exists"
fi

echo ""
echo "  Configure these in .env:"
echo "    UAT_BROWSER=msedge    # Edge browser for Playwright"
echo "    UAT_HEADLESS=true     # true=headless, false=visible"
echo "    PRACTITEST_TOKEN=...  # For PractiTest integration"
echo ""

# --- Cloudflare Tunnel Setup ---
echo "[4/6] Cloudflare Tunnel setup..."

if [ ! -f cloudflared/credentials.json ]; then
    echo ""
    echo "  >>> Cloudflare Tunnel needs to be authenticated <<<"
    echo "  Run these commands:"
    echo ""
    echo "  docker compose run --rm cloudflare-tunnel tunnel login"
    echo "  docker compose run --rm cloudflare-tunnel tunnel create uat-tester"
    echo "  docker compose run --rm cloudflare-tunnel route dns uat-tester UATAPPv1.aetheriscloudgroup.uk"
    echo "  cp ~/.cloudflared/*.json cloudflared/credentials.json"
    echo ""
    echo "  Then update cloudflared/config.yml with your tunnel ID"
    echo ""
    read -rp "  Press Enter after completing Cloudflare setup (or Ctrl+C to skip)... "
else
    echo "  Tunnel credentials found"
fi

# --- Build and Start ---
echo ""
echo "[5/6] Building and starting containers..."

docker compose build --pull uat-tester
docker compose up -d

echo ""
echo "  Waiting for UAT Tester to start..."
for i in $(seq 1 15); do
    if curl -s http://localhost:3001/api/scripts >/dev/null 2>&1; then
        echo "  UAT Tester is ready!"
        break
    fi
    sleep 2
done

# --- Verify ---
echo ""
echo "[6/6] Verification..."

echo "  Local:   http://localhost:3001"
echo "  Public:  https://UATAPPv1.aetheriscloudgroup.uk"
echo ""

if curl -s http://localhost:3001/api/scripts >/dev/null 2>&1; then
    SCRIPTS=$(curl -s http://localhost:3001/api/scripts | python3 -c "import sys,json; data=json.load(sys.stdin); print(len(data))" 2>/dev/null || echo "?")
    echo "  ✓ UAT Tester is running with $SCRIPTS scripts loaded"
else
    echo "  ✗ UAT Tester is NOT responding. Check: docker compose logs uat-tester"
fi

echo ""
echo "============================================"
echo "  Deployment complete!"
echo ""
echo "  Access: https://UATAPPv1.aetheriscloudgroup.uk"
echo "  Logs:   docker compose logs -f uat-tester"
echo "  Stop:   docker compose down"
echo "  Update: docker compose pull && docker compose up -d"
echo "============================================"
