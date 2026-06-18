#!/usr/bin/env bash
# Enhanced Backup — all data + manifest + optional S3 sync
# Runs via cron: 0 2 * * * /opt/uat-tester/backup-enhanced.sh
# Or for S3:  S3_BUCKET=s3://my-backup-bucket /opt/uat-tester/backup-enhanced.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/uat-tester/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=90
S3_BUCKET="${S3_BUCKET:-}"
PROJECT="uat-tester"
COMPOSE_PROJECT=$(docker compose ls --filter name=uat-tester --format json 2>/dev/null | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d[0].get("Name","uat-tester"))' 2>/dev/null || echo "uat-tester")

mkdir -p "$BACKUP_DIR"

echo "[$(date)] === UAT Tester Enhanced Backup ==="

# --- 1. Docker Volume Backups ---
backup_volume() {
  local vol=$1
  local name=$2
  echo "  Backing up volume: $vol -> ${name}_${TIMESTAMP}.tar.gz"
  docker run --rm \
    -v "${COMPOSE_PROJECT}_${vol}:/source:ro" \
    -v "$BACKUP_DIR:/backup" \
    alpine tar czf "/backup/${name}_${TIMESTAMP}.tar.gz" \
    -C /source . 2>/dev/null || echo "  WARNING: Volume $vol not found, skipping"
}

backup_volume "uat-screenshots" "screenshots"
backup_volume "uat-reports" "reports"
backup_volume "uat-runs" "runs"
backup_volume "uat-scripts" "scripts"

# --- 2. AI Memory Backup ---
echo "  Backing up AI memory..."
AI_MEMORY_DIR="/opt/uat-tester/ai-memory"
if [ -d "$AI_MEMORY_DIR" ]; then
  tar czf "$BACKUP_DIR/ai-memory_${TIMESTAMP}.tar.gz" -C "$AI_MEMORY_DIR" . 2>/dev/null || true
fi

# --- 3. Step Memory ---
if [ -f "/opt/uat-tester/stepMemory.json" ]; then
  cp "/opt/uat-tester/stepMemory.json" "$BACKUP_DIR/stepMemory_${TIMESTAMP}.json"
fi

# --- 4. Configuration Backup ---
echo "  Backing up configuration..."
[ -f "/opt/uat-tester/.env" ] && cp "/opt/uat-tester/.env" "$BACKUP_DIR/env_${TIMESTAMP}.txt"
[ -f "/opt/uat-tester/cloudflared/config.yml" ] && cp "/opt/uat-tester/cloudflared/config.yml" "$BACKUP_DIR/cloudflared_${TIMESTAMP}.yml"
[ -f "/opt/uat-tester/cloudflared/credentials.json" ] && cp "/opt/uat-tester/cloudflared/credentials.json" "$BACKUP_DIR/tunnel-creds_${TIMESTAMP}.json"

# --- 5. Backup Manifest ---
MANIFEST="$BACKUP_DIR/manifest_${TIMESTAMP}.json"
echo "  Writing manifest..."
cat > "$MANIFEST" <<MANIFESTEOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "project": "$PROJECT",
  "version": "2.0.0",
  "files": {
    "screenshots": "screenshots_${TIMESTAMP}.tar.gz",
    "reports": "reports_${TIMESTAMP}.tar.gz",
    "runs": "runs_${TIMESTAMP}.tar.gz",
    "scripts": "scripts_${TIMESTAMP}.tar.gz",
    "aiMemory": "ai-memory_${TIMESTAMP}.tar.gz",
    "stepMemory": "stepMemory_${TIMESTAMP}.json",
    "env": "env_${TIMESTAMP}.txt",
    "cloudflared": "cloudflared_${TIMESTAMP}.yml",
    "tunnelCreds": "tunnel-creds_${TIMESTAMP}.json"
  },
  "retentionDays": $RETENTION_DAYS
}
MANIFESTEOF

# --- 6. Sync to S3 (optional) ---
if [ -n "$S3_BUCKET" ]; then
  echo "  Syncing to S3: $S3_BUCKET"
  if command -v aws &>/dev/null; then
    aws s3 sync "$BACKUP_DIR" "$S3_BUCKET" --exclude "*" --include "*.tar.gz" --include "*.json" --include "*.txt" --include "*.yml" 2>/dev/null || echo "  WARNING: S3 sync failed"
  else
    echo "  WARNING: AWS CLI not found, skipping S3 sync"
  fi
fi

# --- 7. Retention Cleanup ---
echo "  Cleaning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.json" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "*.txt" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.yml" -mtime +$RETENTION_DAYS -delete

# --- 8. Summary ---
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo ""
echo "[$(date)] === Backup Complete ==="
echo "  Location: $BACKUP_DIR ($BACKUP_SIZE total)"
echo "  Retention: $RETENTION_DAYS days"
echo "  Manifest:  $MANIFEST"
echo "================================"
