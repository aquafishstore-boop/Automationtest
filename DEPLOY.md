# UAT Tester — Deployment & Data Architecture

## Data Persistence Model

All test evidence and configuration are stored in **Docker named volumes** that survive container rebuilds, restarts, and updates. **Only the application code is rebuilt — all data persists.**

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Host (HP Z440)                  │
│                                                          │
│  ┌──────────────────────────────────────────────┐       │
│  │  uat-tester (container)                      │       │
│  │  ┌─────────────────────────────────────────┐ │       │
│  │  │ /app/            ← code (rebuilt)       │ │       │
│  │  │ /app/data/                                │ │       │
│  │  │   screenshots/   ← VOLUME (persists)     │ │       │
│  │  │   reports/       ← VOLUME (persists)     │ │       │
│  │  │   runs/          ← VOLUME (persists)     │ │       │
│  │  │   scripts/       ← VOLUME (persists)     │ │       │
│  │  └─────────────────────────────────────────┘ │       │
│  └──────────────────────────────────────────────┘       │
│                                                          │
│  Named Volumes (never deleted by deploy):                │
│  ┌──────────────┐  ┌──────────┐  ┌──────┐  ┌─────────┐ │
│  │ uat-screenshots│  │uat-reports│  │uat-runs│ │uat-scripts││
│  └──────────────┘  └──────────┘  └──────┘  └─────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Safe Deployment

### ✅ DO — Safe (data preserved)
```bash
# Update code only (recommended)
./deploy-safe.sh

# Or manually:
docker compose build uat-tester         # Rebuild image
docker compose up -d uat-tester         # Restart with new image
```

### ❌ DON'T — Destructive (data lost)
```bash
docker compose down -v    # DELETES ALL VOLUMES — ALL EVIDENCE LOST
docker volume rm uat-tester_uat-scripts  # DELETES ALL IMPORTED SCRIPTS
```

## Volume Contents

| Volume | Contents | Size | Backup |
|--------|----------|------|--------|
| `uat-screenshots` | PNG screenshots from every test step | Variable | ✅ backup-enhanced.sh |
| `uat-reports` | HTML test reports | Small | ✅ backup-enhanced.sh |
| `uat-runs` | Run history and results JSON | Small | ✅ backup-enhanced.sh |
| `uat-scripts` | Imported PractiTest scripts (PT-*.json) | Medium | ✅ backup-enhanced.sh |
| Host `ai-memory/` | AI learning cache (central memory) | Small | ✅ backup-enhanced.sh |

## Backup

```bash
# Full backup to local /opt/uat-tester/backups/
./backup-enhanced.sh

# Backup to S3 as well
S3_BUCKET=s3://my-backup-bucket ./backup-enhanced.sh

# Check backup manifest
ls -la /opt/uat-tester/backups/manifest_*.json

# Restore from backup
cd /opt/uat-tester/backups
docker run --rm -v $(pwd):/backup -v uat-tester_uat-screenshots:/target \
  alpine tar xzf /backup/screenshots_20260618_020000.tar.gz -C /target
```

## CI/CD Pipeline Integration

### GitHub Actions / GitLab CI — Safe Deploy
```yaml
# .github/workflows/deploy.yml
deploy:
  steps:
    - name: Deploy safely
      run: |
        ssh aetheris@192.168.1.8 "cd /opt/uat-tester && git pull && ./deploy-safe.sh"
```

### What Happens on Deploy:
1. Git pulls latest code
2. Docker image rebuilds (with cache — fast)
3. Container restarts with new image
4. **All volumes remain mounted** — no data loss
5. On first start with empty volume, seed scripts are copied from image

### What Does NOT Happen:
- ❌ Volumes are not deleted
- ❌ Screenshots are not lost
- ❌ PractiTest imports are not lost
- ❌ Run history is not lost
- ❌ AI learning cache is not lost

## Monitoring

- `GET /api/insights` — Run statistics, pass rates, AI learning stats
- `GET /api/runs` — Recent run history
- `GET /api/ai/memory/stats` — AI memory statistics
- Docker health check runs every 30s

## Troubleshooting

```bash
# Check container health
docker ps --filter name=uat

# View logs
docker logs uat-tester --tail 50

# Check volume contents
docker run --rm -v uat-tester_uat-scripts:/vol alpine ls /vol/

# Force rebuild with new seed scripts
docker compose build --no-cache uat-tester
docker compose up -d uat-tester
```

## CI/CD Verified
- SSH key configured ✅
- Workflow ready at .github/workflows/deploy.yml
- Last verified: 2026-06-18 16:45
