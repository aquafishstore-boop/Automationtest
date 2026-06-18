#!/usr/bin/env bash
# Backup script for UAT Tester data
# Run via cron: 0 3 * * * /opt/uat-tester/backup.sh

set -euo pipefail

BACKUP_DIR="/opt/uat-tester/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting UAT Tester backup..."

# Backup Docker volumes
docker run --rm \
  -v uat-tester_uat-screenshots:/source \
  -v "$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/screenshots_$TIMESTAMP.tar.gz" -C /source .

docker run --rm \
  -v uat-tester_uat-reports:/source \
  -v "$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/reports_$TIMESTAMP.tar.gz" -C /source .

docker run --rm \
  -v uat-tester_uat-runs:/source \
  -v "$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/runs_$TIMESTAMP.tar.gz" -C /source .

# Backup config
cp /opt/uat-tester/.env "$BACKUP_DIR/env_$TIMESTAMP.txt"
cp /opt/uat-tester/cloudflared/config.yml "$BACKUP_DIR/cloudflared_config_$TIMESTAMP.yml"

# Clean old backups
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.txt" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.yml" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup complete. Backups stored in: $BACKUP_DIR"
echo "[$(date)] Retention: $RETENTION_DAYS days"
