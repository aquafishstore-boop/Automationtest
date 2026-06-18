# UAT Tester Deployment Guide

## Overview
Deploy the UAT Test Runner to your HP Z440 server behind Cloudflare.

**URL**: `https://UATAPPv1.aetheriscloudgroup.uk`

## Quick Start (HP Z440)

### Step 1: Copy files to the server
From your Windows PC:
```powershell
# Copy the uat-tester folder to the HP Z440
scp -r C:\Users\nolan\Downloads\Aetheris-Pathology-main (1)\uat-tester aetheris@hpz440.aetheriscloudgroup.uk:/tmp/
```

### Step 2: SSH into the server
```powershell
ssh aetheris@hpz440.aetheriscloudgroup.uk
```

### Step 3: Install
```bash
sudo mv /tmp/uat-tester /opt/
cd /opt/uat-tester
chmod +x setup.sh
sudo ./setup.sh
```

### Step 4: Cloudflare Tunnel (for public URL)
```bash
# Authenticate
docker compose run --rm cloudflare-tunnel tunnel login

# Create tunnel
docker compose run --rm cloudflare-tunnel tunnel create uat-tester

# Route DNS
docker compose run --rm cloudflare-tunnel route dns uat-tester UATAPPv1.aetheriscloudgroup.uk

# Copy credentials
cp ~/.cloudflared/*.json cloudflared/credentials.json

# Update config.yml with tunnel ID, then start tunnel
docker compose up -d
```

## File Structure

```
/opt/uat-tester/
├── Dockerfile              # Playwright + Edge + Chromium
├── docker-compose.yml      # Production stack (app + cloudflare tunnel)
├── .env                    # Environment configuration
├── server.js               # Express API
├── lib/
│   ├── runner.js           # Playwright test engine with Edge support
│   ├── practitest-converter.js  # CSV to JSON script converter
│   ├── report-generator.js # HTML report builder
│   └── screenshot-manager.js    # Labelled screenshot capture
├── public/                 # Web UI (HTML/CSS/JS)
├── scripts/                # Test scripts (JSON)
├── cloudflared/            # Cloudflare tunnel config
├── deploy/                 # Deployment configs
└── setup.sh                # Deployment script
```

## Managing the App

```bash
# View logs
docker compose logs -f uat-tester

# Restart
docker compose restart uat-tester

# Stop
docker compose down

# Update
docker compose build --pull uat-tester
docker compose up -d

# Backup
./backup.sh
```

## Importing PractiTest Tests

1. Open `http://localhost:3001` (or your public URL)
2. In PractiTest: Navigate to **Test Sets** → **Export** → **CSV**
3. In the UAT Tester UI: scroll to **Import from PractiTest CSV** section
4. Select the CSV file → Click **Preview** → Click **Import to Scripts**
5. Each test case becomes a runnable script with screenshot steps

## Browser Configuration

The UAT Tester uses **Microsoft Edge** by default (`BROWSER=msedge` in `.env`). 
To change: edit `.env` and set `UAT_BROWSER=chromium` (or `firefox`, `webkit`), then restart.
