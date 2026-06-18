#!/usr/bin/env bash
set -euo pipefail

echo "============================================"
echo "  UAT Tester v1 - HP Z440 Deployment"
echo "  URL: https://UATAPPv1.aetheriscloudgroup.uk"
echo "============================================"

# --- Configuration ---
INSTALL_DIR="/opt/uat-tester"
DOMAIN="UATAPPv1.aetheriscloudgroup.uk"
BROWSER="msedge"

# --- Prerequisites ---
echo ""
echo "[1/5] Checking prerequisites..."

if ! command -v docker &>/dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "Docker installed. Log out and back in, then re-run this script."
    exit 0
fi

if ! docker compose version &>/dev/null; then
    echo "Installing Docker Compose..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

echo "  Docker: $(docker --version)"
echo "  Compose: $(docker compose version)"

# --- Create install directory ---
echo ""
echo "[2/5] Creating install directory..."
sudo mkdir -p "$INSTALL_DIR"
sudo chown -R $USER:$USER "$INSTALL_DIR"

# --- Clone / Copy files ---
echo ""
echo "[3/5] Setting up application files..."

# If running from the same machine, files should already be at $INSTALL_DIR
# If running from a downloaded package, extract it first
if [ ! -f "$INSTALL_DIR/docker-compose.yml" ]; then
    echo "ERROR: docker-compose.yml not found at $INSTALL_DIR"
    echo ""
    echo "=== Manual Setup Instructions ==="
    echo ""
    echo "1. Copy the uat-tester folder to the HP Z440:"
    echo "   scp -r uat-tester aetheris@hpz440.aetheriscloudgroup.uk:/tmp/"
    echo "   ssh aetheris@hpz440.aetheriscloudgroup.uk"
    echo "   sudo mv /tmp/uat-tester /opt/"
    echo ""
    echo "2. Or, download from your repo:"
    echo "   cd $INSTALL_DIR"
    echo "   git clone <your-repo-url> ."
    echo ""
    echo "3. Then re-run this script"
    exit 1
fi

cd "$INSTALL_DIR"

# --- Build and Start ---
echo ""
echo "[4/5] Building Docker image and starting..."

docker compose build --pull uat-tester
docker compose up -d

echo ""
echo "Waiting for UAT Tester to start..."
for i in $(seq 1 20); do
    if curl -s http://localhost:3001/api/scripts >/dev/null 2>&1; then
        echo "  ✓ UAT Tester is ready!"
        break
    fi
    if [ $i -eq 20 ]; then
        echo "  ✗ Timed out waiting. Check: docker compose logs uat-tester"
        exit 1
    fi
    sleep 2
done

# --- Cloudflare Tunnel Setup ---
echo ""
echo "[5/5] Cloudflare Tunnel setup..."
echo ""

if [ ! -f cloudflared/credentials.json ]; then
    echo "  To expose via Cloudflare Tunnel, run:"
    echo ""
    echo "  docker compose run --rm cloudflare-tunnel tunnel login"
    echo "  docker compose run --rm cloudflare-tunnel tunnel create uat-tester"
    echo "  docker compose run --rm cloudflare-tunnel route dns uat-tester $DOMAIN"
    echo "  cp ~/.cloudflared/*.json cloudflared/credentials.json"
    echo ""
    echo "  Then edit cloudflared/config.yml and set tunnel ID"
    echo "  Then: docker compose up -d cloudflare-tunnel"
    echo ""
    echo "  OR use Nginx (see deploy/nginx.conf)"
    echo "  OR access locally only: http://localhost:3001"
else
    echo "  Tunnel credentials found, starting tunnel..."
    docker compose up -d cloudflare-tunnel
fi

# --- Summary ---
echo ""
echo "============================================"
echo "  Deployment Complete!"
echo "============================================"
echo ""
echo "  Local access: http://localhost:3001"
echo "  Public URL:   https://$DOMAIN (after tunnel setup)"
echo ""
echo "  Logs:     docker compose logs -f uat-tester"
echo "  Stop:     docker compose down"
echo "  Restart:  docker compose restart"
echo "  Backup:   ./backup.sh"
echo ""
echo "  To import PractiTest tests:"
echo "    1. Open http://localhost:3001"
echo "    2. Export tests from PractiTest as CSV"
echo "    3. In the UI: Import from PractiTest CSV section"
echo "    4. Select CSV file → Preview → Import"
echo ""
echo "============================================"
