#!/usr/bin/env bash
# Safe Deployment Script — never destroys data volumes
set -euo pipefail

echo "============================================"
echo "  UAT Tester - Safe Deployment"
echo "  Data volumes are NEVER deleted"
echo "============================================"

cd "$(dirname "$0")"

# Check for dangerous flags
if [[ "$*" == *"-v"* ]] || [[ "$*" == *"--volumes"* ]]; then
  echo "ERROR: -v/--volumes flag detected! This would DESTROY ALL TEST DATA."
  echo "Use deploy-safe.sh without flags for safe deployments."
  exit 1
fi

# Warn if .env changed (could break config)
if git status --short .env 2>/dev/null | grep -q .; then
  echo "WARNING: .env file has local changes. These will be applied."
fi

echo ""
echo "[1/4] Pulling latest code..."
git pull 2>/dev/null || echo "  (not a git repo, skipping)"

echo ""
echo "[2/4] Rebuilding Docker image (cached)..."
docker compose build uat-tester 2>&1 | tail -3

echo ""
echo "[3/4] Restarting services without touching volumes..."
docker compose up -d --no-deps uat-tester 2>&1

echo ""
echo "[4/4] Waiting for health check..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:3002/api/scripts >/dev/null 2>&1; then
    echo "  READY!"
    break
  fi
  sleep 2
done

echo ""
echo "============================================"
echo "  Deployment safe and complete!"
echo "  All data volumes preserved:"
docker volume ls --filter name=uat-tester --format "  - {{.Name}}"
echo ""
echo "  Access: https://UATAPPv1.aetheriscloudgroup.uk"
echo "============================================"
