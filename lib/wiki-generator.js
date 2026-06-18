/**
 * Wiki Generator Agent
 * Creates and maintains GitHub wiki pages for the UAT Tester project.
 * 
 * Usage: node lib/wiki-generator.js [--push]
 *   --push   Actually push to GitHub wiki repo
 *   (omit)   Generate files locally only
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI_DIR = path.join(__dirname, "..", "wiki");
const REPO_URL = "https://github.com/aquafishstore-boop/Automationtest.wiki.git";

const PAGES = {
  "Home": `# 🧪 Pathology UAT Tester

Welcome to the **Pathology UAT Tester** — an AI-powered, self-healing automated testing platform for pathology laboratory information systems.

## Overview

This application provides a complete UAT testing framework for pathology systems including **Surrey ICE**, **Winpath Enterprise**, **HPV ICE**, **BloodTrack**, **Cellavision**, **Immulink**, **Cyres**, **WES**, and more.

### Key Features

- 🤖 **AI-Powered Agentic Engine** — LLM-driven browser automation that self-heals when UI changes
- 📸 **Automatic Screenshot Evidence** — Every step captures a labelled screenshot with system + test + step IDs
- 🧪 **PractiTest Integration** — Import test cases directly from PractiTest CSV exports
- 🔄 **CI/CD Safe** — Zero-downtime deployment that never loses data
- 🏥 **Pathology-Specific Workflows** — Order → Result → Authorise → Verify pipelines
- 🧠 **Multi-Node Learning** — AI mappings shared across test runners
- 🔒 **Hardened Security** — Helmet, rate limiting, CSP, no-root Docker

### Systems Supported

| System | Integration | Workflows |
|--------|------------|-----------|
| Surrey ICE | Web UI automation | Ordering, Results, Admin, MI Reports |
| Winpath Enterprise | Web UI automation | Request Entry, Results, Authorisation |
| HPV ICE | Web UI automation | Cytology, Histology, Andrology |
| BloodTrack | Web UI + Kiosk | Blood storage, Movement, Emergency release |
| Cellavision | Web UI | Differential results, Morphology |
| Immulink | Web UI | Group & Screen, Antibody ID, Panels |
| Cyres | Desktop app | Cytology screening stats, Import |
| WES (Wolfson EQA) | Web UI | EQA scheme management, Reporting |
| **EPIC/Cerner ADT** | Web UI | Patient demographic feeds into ICE |

### Quick Start

\`\`\`bash
# Clone and deploy
git clone https://github.com/aquafishstore-boop/Automationtest.git
cd Automationtest
./deploy-safe.sh

# Access the dashboard
open http://localhost:3001
\`\`\`

> **Public URL**: https://UATAPPv1.aetheriscloudgroup.uk
> **Version**: 2.0.0
`,

  "Architecture": `# Architecture

## System Architecture

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                     Docker Host (HP Z440)                        │
│                                                                  │
│  ┌─────────────────────────────┐   ┌──────────────────────────┐  │
│  │     uat-tester (container)  │   │ cloudflare-tunnel (cont) │  │
│  │  ┌───────────────────────┐  │   │                          │  │
│  │  │ Express Server (3001) │  │   │  ┌────────────────────┐  │  │
│  │  │   REST API + SSE      │  │   │  │  Cloudflared       │  │  │
│  │  └──────────┬────────────┘  │   │  │  → Cloudflare Edge │  │  │
│  │             │               │   │  └────────────────────┘  │  │
│  │  ┌──────────┴────────────┐  │   │   service: localhost:3002│  │
│  │  │   Playwright Engine   │  │   └──────────────────────────┘  │
│  │  │   (Chromium + Edge)   │  │                                 │
│  │  └───────────────────────┘  │                                 │
│  │                             │                                 │
│  │  ┌───────────────────────┐  │                                 │
│  │  │   AI Agentic Brain    │──┼──── LM Studio (9070 XT)         │
│  │  │   (LLM-powered DOM)   │  │        192.168.1.19:1234        │
│  │  └───────────────────────┘  │                                 │
│  │              │              │  ┌──────────────────────────┐  │
│  │  ┌───────────┴───────────┐  │  │  Ollama Fallback         │  │
│  │  │   Agent Registry      │  │  │  (4060 Ti, local)        │  │
│  │  │   - ADT ICE Agent     │  │  │  pathology-eqa:latest    │  │
│  │  │   - Winpath Agent     │  │  └──────────────────────────┘  │
│  │  │   - BloodTrack Agent  │  │                                 │
│  │  └───────────────────────┘  │                                 │
│  └─────────────────────────────┘                                 │
│                                                                  │
│  Persistent Volumes (never deleted):                             │
│  ┌──────────┬──────────┬────────┬──────────┐                    │
│  │screenshots│ reports  │  runs  │ scripts  │                    │
│  └──────────┴──────────┴────────┴──────────┘                    │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

## Data Flow

1. **User** selects a test script from the UI or API
2. **Runner** executes Playwright steps with browser automation
3. **AI Engine** maps step descriptions to DOM elements (if selectors fail)
4. **Evidence** — labelled screenshots captured at every step
5. **Results** saved to persistent Docker volumes
6. **Reports** generated as HTML with embedded screenshots
7. **PractiTest** — evidence can be uploaded back to PractiTest

## Key Modules

| Module | Location | Purpose |
|--------|----------|---------|
| Express Server | \`server.js\` | REST API, SSE, static files |
| Runner | \`lib/runner.js\` | Playwright step execution |
| AI Mapper | \`lib/ai-mapper.js\` | LLM-powered DOM → action mapping |
| Agentic Brain | \`lib/agentic-brain.js\` | Autonomous browser agent |
| Central Memory | \`lib/central-memory.js\` | Multi-node AI learning |
| Pathology Workflows | \`lib/pathology-workflow.js\` | Specialized LIS workflows |
| PractiTest Converter | \`lib/practitest-converter.js\` | CSV → JSON script import |
| Agent Registry | \`lib/agents/index.js\` | 6 specialized pathology agents |
`,

  "Deployment": `# Deployment Guide

## Prerequisites

- Docker 24+ with Compose V2
- 4+ CPU cores, 8GB+ RAM recommended
- Ports 3001-3002 available

## Quick Deploy

\`\`\`bash
# Clone the repo
git clone https://github.com/aquafishstore-boop/Automationtest.git
cd Automationtest

# Configure
cp .env.example .env
# Edit .env with your settings

# Deploy (safe — preserves all data)
./deploy-safe.sh
\`\`\`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| \`PORT\` | \`3001\` | Internal container port |
| \`BROWSER\` | \`msedge\` | Playwright browser (msedge/chromium) |
| \`HEADLESS\` | \`true\` | Run browser headless |
| \`LM_HOST\` | — | LM Studio API URL (AI engine) |
| \`LM_API_TOKEN\` | — | LM Studio auth token |
| \`AI_MODEL\` | — | LLM model name |
| \`LM_FALLBACK_HOST\` | \`http://192.168.1.8:11434\` | Ollama fallback |
| \`PRACTITEST_TOKEN\` | — | PractiTest API token |
| \`PRACTITEST_PROJECT_ID\` | — | PractiTest project ID |

## CI/CD Pipeline

\`\`\`yaml
# .github/workflows/deploy.yml — Safe deployment
name: Deploy UAT Tester
on:
  push:
    branches: [main]
jobs:
  safe-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy safely
        uses: appleboy/ssh-action@v1
        with:
          host: 192.168.1.8
          username: aetheris
          key: \${{ secrets.SSH_PRIVATE_KEY }}
          script: cd /opt/uat-tester && git pull && ./deploy-safe.sh
\`\`\`

## Safe vs Unsafe Commands

### ✅ Safe (data preserved)
| Command | Effect |
|---------|--------|
| \`./deploy-safe.sh\` | Rebuilds code, restarts container, preserves ALL data |
| \`docker compose up -d\` | Restarts services with existing data |
| \`docker compose build\` | Rebuilds image only |

### ❌ Unsafe (data lost)
| Command | Effect |
|---------|--------|
| \`docker compose down -v\` | **DELETES ALL VOLUMES** — all evidence lost |
| \`docker volume rm uat-tester_*\` | Deletes specific volume |

## Backup & Restore

\`\`\`bash
# Full backup with manifest
./backup-enhanced.sh

# Backup to S3
S3_BUCKET=s3://my-backup-bucket ./backup-enhanced.sh

# Restore a volume
docker run --rm -v /opt/uat-tester/backups:/backup -v uat-tester_uat-screenshots:/target \\
  alpine tar xzf /backup/screenshots_20260618.tar.gz -C /target
\`\`\`
`,

  "Agentic-Engine": `# 🤖 Agentic Test Engine

The **Agentic Brain** is an AI-powered autonomous browser agent that can navigate any web application, understand page content via LLM, and execute test steps without hardcoded selectors.

## Architecture

\`\`\`
User Goal ("Place FBC order in Winpath")
        │
        ▼
  ┌─────────────┐
  │  PLAN       │ ← LLM decomposes goal into atomic browser actions
  │  (Agentic   │
  │   Brain)    │
  └──────┬──────┘
         │
  ┌──────▼──────┐     ┌──────────────────┐
  │  OBSERVE    │────→│  Current DOM     │
  │  (Think)    │     │  (filtered)       │
  └──────┬──────┘     └──────────────────┘
         │
  ┌──────▼──────┐     ┌──────────────────┐
  │  ACT        │────→│  Playwright      │
  │  (Click/    │     │  click/type/wait │
  │   Type)     │     └──────────────────┘
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │  SCREENSHOT │ ← Labelled evidence
  │  (Evidence) │
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │  VERIFY     │ ← Assert or move to next step
  │  (Feedback) │
  └─────────────┘
\`\`\`

## How It Works

### 1. PLAN
The agent takes a high-level goal like \`"Place FBC order in Winpath, enter results, authorise"\` and uses the LLM to decompose it into 15-25 atomic browser steps.

### 2. OBSERVE (Think)
For each step, the agent captures the current page DOM, filters it to only interactive elements (buttons, inputs, links), and sends it to the LLM with the step description. The LLM returns structured JSON:

\`\`\`json
{
  "action": "click",
  "selector": "#submit-btn",
  "value": "",
  "assertion": "",
  "confidence": 0.95
}
\`\`\`

### 3. ACT
Playwright executes the action. If it fails, the agent observes the new DOM and retries with a healed selector.

### 4. SCREENSHOT
Every action captures a labelled screenshot: \`{System}_{Test}_Step{Num}_{Description}_{Timestamp}.png\`

### 5. VERIFY
Results feed back into the learning loop — successful mappings are cached, failures reduce confidence.

## Specialized Agents

| Agent | File | Workflow |
|-------|------|----------|
| **ADT ICE Patient Feed** | \`lib/agents/adt-ice-agent.js\` | EPR→ICE demographic testing |
| **Winpath Order→Result→Authorise** | \`lib/pathology-workflow.js\` | Full LIS workflow |
| **Surrey ICE GP Ordering** | \`lib/pathology-workflow.js\` | GP order entry → ICE |
| **BloodTrack Kiosk** | (planned) | Blood kiosk operations |
| **Cellavision Results** | (planned) | Differential verification |
| **Custom Script Runner** | \`lib/agentic-brain.js\` | Any PractiTest script |

## Multi-Node Learning

AI mappings are shared across test runner instances via \`central-memory.js\`:

\`\`\`bash
# Export memory from node 1
curl http://node1:3002/api/ai/memory/export > memory.json

# Import to node 2
curl -X POST http://node2:3002/api/ai/memory/import \\
  -H "Content-Type: application/json" \\
  -d @memory.json
\`\`\`
`,

  "API-Reference": `# API Reference

## Base URL
\`https://UATAPPv1.aetheriscloudgroup.uk\` or \`http://localhost:3002\`

---

## Scripts

### GET /api/scripts
List all available test scripts.

### GET /api/scripts/:filename
Get a specific script's full content.

### POST /api/scripts/upload-csv
Import PractiTest CSV export as test scripts.
\`\`\`json
{ "csv": "id,Name,Step name,...\\n1,Test,Step1,..." }
\`\`\`

### POST /api/scripts/upload-csv-test
Preview CSV import without saving.

---

## Runs

### POST /api/run
Execute a test script.
\`\`\`json
{
  "script": { "name": "...", "steps": [...] },
  "variables": { "PATIENT_NHS": "999 057 5924" }
}
\`\`\`
Returns: \`{ "runId": "abc123" }\`

### GET /api/runs/:runId
Get run status and step results.

### GET /api/runs/:runId/events
SSE stream of real-time step progress.

### GET /api/runs/:runId/screenshots
List all screenshots from a run.

### GET /api/runs/:runId/report
Download HTML report with embedded screenshots.

### DELETE /api/runs/:runId
Delete a run.

---

## AI Engine

### GET /api/ai/status
AI engine status, LM Studio connection, memory stats.

### GET /api/ai/memory/stats
Central memory statistics (total mappings, confidence distribution, nodes).

### GET /api/ai/memory/export
Export AI memory for sharing with other nodes.

### POST /api/ai/memory/import
Import memory from another node.
\`\`\`json
{ "memory": { "mappings": {...} } }
\`\`\`

### POST /api/ai/clear-cache
Clear local AI step cache.

---

## Patients

### GET /api/patients
List test patients. Filter: \`?system=Surrey ICE\`, \`?gender=Female\`, \`?tag=nhs-digital\`

### GET /api/patients/:id
Get full patient details by ID (e.g., \`TKFC\`).

### GET /api/patients/tags/list
List available patient tags and systems.

---

## Agentic Engine

### GET /api/agents
List all 6 specialized test agents with their capabilities.

### POST /api/agents/adt-ice/run
Run ADT ICE patient feed test.
\`\`\`json
{
  "trust": "FHFT",
  "patient": { "nhsNumber": "9990575924" },
  "eprType": "EPIC",
  "iceType": "Surrey ICE",
  "testMerge": true,
  "testDeceased": true
}
\`\`\`

### POST /api/agentic/run
Run any test script with AI-driven browser automation.
\`\`\`json
{
  "script": { "name": "...", "steps": [...] },
  "variables": {},
  "patientId": "TKFC"
}
\`\`\`

### GET /api/agentic/status
Agentic engine status and available workflows.

---

## Recorder

### POST /api/recorder/start
Start browser recording session.
\`\`\`json
{ "url": "https://target-system.com", "scriptName": "My Test" }
\`\`\`

### POST /api/recorder/stop
Stop recording and save script.

### GET /api/recorder/status
Recording session status.

---

## PractiTest

### POST /api/practitest/upload
Upload run evidence to PractiTest.
\`\`\`json
{ "runId": "abc123", "testCaseId": "uat-run" }
\`\`\`

### GET /api/practitest/status
PractiTest integration status.

---

## Observability

### GET /api/insights
Run statistics, pass rates, AI learning stats, recent runs.

### GET /api/config
Application configuration.

### GET /api/runs
Recent run history (paginated).
`,

  "Security": `# Security

## Hardening Measures

### HTTP Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| \`Content-Security-Policy\` | Restricted to self + fonts/api | Prevents XSS and data injection |
| \`Strict-Transport-Security\` | 1 year, includeSubDomains | Forces HTTPS |
| \`X-Content-Type-Options\` | nosniff | Prevents MIME type sniffing |
| \`X-Frame-Options\` | SAMEORIGIN | Prevents clickjacking |
| \`RateLimit-Limit\` | 60/min API, 5/min runs | Prevents abuse |

### Docker Security

- **Non-root user** (\`pwuser\`) — container does not run as root
- **All capabilities dropped** — only \`NET_BIND_SERVICE\` and \`NET_ADMIN\` added
- **No new privileges** — \`security_opt: no-new-privileges:true\`
- **Read-only mounts** — \`custom-scripts\` mounted \`:ro\`
- **Health check** — prevents orphan containers
- **Log rotation** — 10MB max per file, 3 files max

### Code Security

- **Input validation** — All API inputs sanitized, filenames regex-validated
- **Path traversal protection** — \`sanitizePath()\` prevents \`../\` attacks
- **No stack traces in production** — generic error messages only
- **Body size limits** — 5MB max on JSON requests
- **CORS** — blocked cross-origin requests
- **Helmet.js** — comprehensive HTTP headers
- **Rate limiting** — per-IP and per-endpoint

### Secrets Management

- No secrets in code — all via environment variables
- No secrets in Docker image — passed at runtime only
- \`.env\` in \`.gitignore\` — never committed
- Cloudflare Tunnel credentials mounted as read-only

## CVE Status

- **0 vulnerabilities** in production dependencies
- Regular \`npm audit\` runs in CI
- Base image (\`mcr.microsoft.com/playwright\`) updated to latest
- System packages upgraded in Dockerfile

## Reporting Vulnerabilities

Contact: \`security@aetheriscloudgroup.uk\`
Policy: https://UATAPPv1.aetheriscloudgroup.uk/.well-known/security.txt
`,

  "Test-Patients": `# Test Patients

The application includes 6 NHS Digital test patients with fake PHI data for use in UAT testing.

## Patient List

| ID | Name | NHS Number | Gender | Age | Systems |
|----|------|-----------|--------|-----|---------|
| TKFC | Donotuse XXTESTPATIENT-TKFC | 999 057 5924 | Male | 57 | Surrey ICE, HPV ICE, Winpath, UICE |
| TKFF | Donotuse XXTESTPATIENT-TKFF | 999 057 5959 | Female | 71 | Surrey ICE, UICE |
| TKFI | Donotuse XXTESTPATIENT-TKFI | 999 057 5983 | Female | 75 | Surrey ICE, UICE |
| TKFM | Donotuse XXTESTPATIENT-TKFM | 999 057 6025 | Male | 48 | Surrey ICE, UICE |
| TKFT | Donotuse XXTESTPATIENT-TKFT | 999 057 6106 | Female | 52 | Surrey ICE, UICE |
| TKFU | Donotuse XXTESTPATIENT-TKFU | 999 057 6114 | Female | 53 | Surrey ICE, UICE |

## Usage in Scripts

When a script is selected, the **Test Patient** dropdown appears in the UI. Selecting a patient auto-fills:

- \`PATIENT_NHS\` — NHS number
- \`PATIENT_NAME\` — Forename + Surname
- \`DOB\` — Date of birth
- \`GENDER\` — Male/Female

## Variable Naming Convention

Scripts should use these variable names to enable auto-fill:

| Variable | Auto-filled? |
|----------|:-----------:|
| \`PATIENT_NHS\` | ✅ Yes |
| \`PATIENT_NAME\` | ✅ Yes |
| \`DOB\` | ✅ Yes |
| \`GENDER\` | ✅ Yes |
| \`MRN\` | ❌ No (system-specific) |

## API

\`\`\`bash
# List all patients
curl https://UATAPPv1.aetheriscloudgroup.uk/api/patients

# Filter by system
curl "https://UATAPPv1.aetheriscloudgroup.uk/api/patients?system=Surrey%20ICE"

# Get specific patient
curl https://UATAPPv1.aetheriscloudgroup.uk/api/patients/TKFC

# List available tags
curl https://UATAPPv1.aetheriscloudgroup.uk/api/patients/tags/list
\`\`\`
`,

  "PractiTest-Import": `# PractiTest Import

The UAT Tester can import test cases directly from PractiTest CSV exports, converting them into runnable JSON scripts with automatic screenshot steps.

## Export from PractiTest

1. Navigate to **Test Sets** in PractiTest
2. Select the test set to export
3. Click **Export → CSV**
4. Save the CSV file

## Import via UI

1. Open the UAT Tester dashboard
2. Scroll to **"Import from PractiTest CSV"** in the setup panel
3. Select the CSV file
4. Click **Preview** to verify
5. Click **Import to Scripts**

## Import via API

\`\`\`bash
# Preview only (no save)
curl -X POST https://UATAPPv1.aetheriscloudgroup.uk/api/scripts/upload-csv-test \\
  -H "Content-Type: application/json" \\
  -d '{"csv": "id,Name,Step name,...\\n1,Test,Step1,..."}'

# Import (saves as scripts)
curl -X POST https://UATAPPv1.aetheriscloudgroup.uk/api/scripts/upload-csv \\
  -H "Content-Type: application/json" \\
  -d '{"csv": "id,Name,Step name,...\\n1,Test,Step1,..."}'
\`\`\`

## Script Format

Each imported test case becomes a JSON file at \`scripts/pt-{id}-{name}.json\`:

\`\`\`json
{
  "name": "Test Case Name",
  "practitestId": "1134",
  "system": "Trace Elements",
  "version": "1.0",
  "practitestExport": true,
  "variables": [
    { "name": "PATIENT_NHS", "label": "Patient NHS Number", "type": "text" },
    { "name": "PATIENT_NAME", "label": "Patient Name", "type": "text" }
  ],
  "steps": [
    { "id": "step-1", "description": "Place order in UICE", "action": "screenshot" },
    { "id": "step-2", "description": "Screenshot rule details", "action": "screenshot" }
  ]
}
\`\`\`

## Uploading Evidence Back

After running tests, screenshots can be uploaded back to PractiTest:

\`\`\`bash
curl -X POST https://UATAPPv1.aetheriscloudgroup.uk/api/practitest/upload \\
  -H "Content-Type: application/json" \\
  -d '{"runId": "abc123", "testCaseId": "1134"}'
\`\`\`

Requires \`PRACTITEST_TOKEN\` and \`PRACTITEST_PROJECT_ID\` to be configured.
`,

  "Troubleshooting": `# Troubleshooting

## Container Won't Start

\`\`\`bash
# Check logs
docker logs uat-tester --tail 50

# Check if port is in use
ss -tlnp | grep 3002

# Kill port conflict
sudo fuser -k 3002/tcp

# Rebuild from scratch
docker compose build --no-cache uat-tester
docker compose up -d
\`\`\`

## Browser Automation Fails

\`\`\`bash
# Check browser is installed
docker exec uat-tester which microsoft-edge-stable
docker exec uat-tester which chromium

# Test Playwright
docker exec uat-tester node -e "require('playwright').chromium.launch().then(b=>b.close()).catch(e=>console.log(e))"
\`\`\`

## AI Engine Not Working

\`\`\`bash
# Check AI status
curl http://localhost:3002/api/ai/status

# Test LM Studio connection from container
docker exec uat-tester curl -s http://192.168.1.19:1234/v1/models

# Test Ollama fallback
docker exec uat-tester curl -s http://192.168.1.8:11434/api/tags

# Check API token
docker exec uat-tester env | grep LM_
\`\`\`

## Cloudflare Tunnel Issues

\`\`\`bash
# Check tunnel status
docker logs uat-cloudflared --tail 20

# Restart tunnel
docker compose restart cloudflare-tunnel

# Test tunnel connectivity
curl -s http://localhost:3002/api/scripts
\`\`\`

## PractiTest CSV Import Fails

The most common cause is multi-line fields in the CSV. Ensure:
- Fields with line breaks are properly quoted with \`"\`
- The CSV uses UTF-8 encoding
- File size is under 5MB

Test locally first:
\`\`\`bash
# Preview without importing
curl -X POST http://localhost:3002/api/scripts/upload-csv-test \\
  -H "Content-Type: application/json" \\
  -d @your-export.csv
\`\`\`

## Data Recovery

If a volume is accidentally deleted:

\`\`\`bash
# List available backups
ls -la /opt/uat-tester/backups/

# Restore scripts volume
docker run --rm \\
  -v /opt/uat-tester/backups:/backup \\
  -v uat-tester_uat-scripts:/target \\
  alpine tar xzf /backup/scripts_20260618.tar.gz -C /target

# Restore screenshots
docker run --rm \\
  -v /opt/uat-tester/backups:/backup \\
  -v uat-tester_uat-screenshots:/target \\
  alpine tar xzf /backup/screenshots_20260618.tar.gz -C /target
\`\`\`
`,

  "_Sidebar": `## Wiki Navigation

- [Home](Home)
- [Architecture](Architecture)
- [Deployment](Deployment)
- [Agentic Engine](Agentic-Engine)
- [API Reference](API-Reference)
- [Security](Security)
- [Test Patients](Test-Patients)
- [PractiTest Import](PractiTest-Import)
- [Troubleshooting](Troubleshooting)

---

## Quick Links

- **App**: https://UATAPPv1.aetheriscloudgroup.uk
- **Repo**: https://github.com/aquafishstore-boop/Automationtest
- **Version**: 2.0.0
`,

  "_Footer": `© 2026 Aetheris Pathology Cloud | UAT Tester v2.0 | [Report Issue](https://github.com/aquafishstore-boop/Automationtest/issues)`
};

function generateWiki() {
  const wikiDir = WIKI_DIR;
  fs.mkdirSync(wikiDir, { recursive: true });

  let count = 0;
  for (const [page, content] of Object.entries(PAGES)) {
    const filePath = path.join(wikiDir, `${page}.md`);
    fs.writeFileSync(filePath, content.trim() + "\n", "utf-8");
    count++;
    console.log(`  ✓ ${page}.md`);
  }

  console.log(`\nGenerated ${count} wiki pages in ${wikiDir}`);
  return count;
}

function pushToGitHub() {
  console.log("\nPushing to GitHub wiki...");

  if (!fs.existsSync(path.join(WIKI_DIR, ".git"))) {
    console.log("  Cloning wiki repo...");
    execSync(`git clone ${REPO_URL} ${WIKI_DIR}`, { stdio: "pipe", cwd: path.join(WIKI_DIR, "..") });
    // Regenerate after clone to overwrite
    generateWiki();
  }

  execSync("git add -A", { cwd: WIKI_DIR, stdio: "inherit" });

  try {
    const status = execSync("git status --porcelain", { cwd: WIKI_DIR, encoding: "utf-8" });
    if (status.trim()) {
      execSync('git commit -m "Update wiki: autogenerated documentation"', { cwd: WIKI_DIR, stdio: "inherit" });
      execSync("git push", { cwd: WIKI_DIR, stdio: "inherit" });
      console.log("  ✓ Wiki pushed to GitHub!");
    } else {
      console.log("  No changes to push.");
    }
  } catch (err) {
    console.log("  Note: git operations require auth. See instructions below.");
    console.log(`    cd ${WIKI_DIR}`);
    console.log("    git add -A && git commit -m 'update wiki' && git push");
  }
}

// Main
const shouldPush = process.argv.includes("--push");
console.log("Wiki Generator — UAT Tester\n");

console.log("Generating wiki pages...");
generateWiki();

if (shouldPush) {
  pushToGitHub();
} else {
  console.log("\nTo push to GitHub Wiki, run: node lib/wiki-generator.js --push");
  console.log(`Or manually: cd ${WIKI_DIR} && git add -A && git commit -m 'update' && git push`);
}
