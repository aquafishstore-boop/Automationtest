# Pathology UAT Tester — Concept, Design & Build Document

**Version**: 2.0.0  
**Date**: 2026-06-18  
**Status**: Production  
**URL**: https://UATAPPv1.aetheriscloudgroup.uk  
**Repository**: https://github.com/aquafishstore-boop/Automationtest  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Concept & Requirements](#2-concept--requirements)
3. [System Architecture](#3-system-architecture)
4. [Component Design](#4-component-design)
5. [AI Engine Design](#5-ai-engine-design)
6. [Data Model](#6-data-model)
7. [Security Architecture](#7-security-architecture)
8. [Build & Deployment](#8-build--deployment)
9. [CI/CD Pipeline](#9-cicd-pipeline)
10. [Testing Strategy](#10-testing-strategy)
11. [Operations Guide](#11-operations-guide)
12. [Future Roadmap](#12-future-roadmap)

---

## 1. Executive Summary

### 1.1 Purpose

The Pathology UAT Tester is an AI-powered, self-healing automated testing platform designed specifically for pathology Laboratory Information Systems (LIS). It enables UAT teams to execute test scripts against systems like **Surrey ICE**, **Winpath Enterprise**, **HPV ICE**, **BloodTrack**, **Cellavision**, **Immulink**, and **EPIC/Cerner ADT** feeds — with automatic screenshot evidence capture, AI-driven element detection, and PractiTest integration.

### 1.2 Key Capabilities

| Capability | Description |
|------------|-------------|
| **AI-Powered Automation** | LLM-driven browser agent that understands test steps in natural language and finds elements by reading the DOM |
| **Self-Healing Selectors** | When a UI changes, the AI automatically discovers new selectors from the page content |
| **Multi-System Support** | Surrey ICE, Winpath, HPV ICE, BloodTrack, Cellavision, Immulink, EPIC/Cerner ADT, Cyres, WES |
| **Screenshot Evidence** | Every step captures a labelled screenshot: `{System}_{Test}_{Step}_{Description}_{Timestamp}.png` |
| **PractiTest Integration** | CSV import of test cases, evidence upload back to PractiTest |
| **Multi-Node Learning** | AI mappings shared across test runners for distributed learning |
| **CI/CD Safe** | Zero-downtime deployment that never loses evidence data |
| **Hardened Security** | Helmet CSP, rate limiting, no-root Docker, all inputs sanitised |

### 1.3 Systems Under Test

| System | Role | Integration Method | Workflows |
|--------|------|-------------------|-----------|
| Surrey ICE | Clinical results/reporting | Web UI | Ordering, Results, Admin, MI Reports |
| Winpath Enterprise | Laboratory Information System | Web UI | Request Entry, Results, Authorisation |
| HPV ICE | Cervical Screening | Web UI | Cytology, Histology, Andrology |
| BloodTrack | Blood transfusion kiosk | Web UI + Kiosk | Storage, Movement, Emergency release |
| Cellavision | Digital morphology | Web UI | Differential results, RBC Morphology |
| Immulink | Blood transfusion middleware | Web UI | Group & Screen, Antibody ID, Panels |
| Cyres | Cervical cytology screening | Desktop app | Stats, Import, Data management |
| WES | Wolfson EQA software | Web UI | EQA scheme management, Reporting |
| EPIC/Cerner | Electronic Patient Record | ADT feed | Patient demographics into ICE |

---

## 2. Concept & Requirements

### 2.1 Problem Statement

Pathology UAT testing faces several challenges:

1. **Manual processes** — Testers manually execute steps, take screenshots, and paste into PractiTest
2. **Fragile selectors** — UI changes break automation scripts requiring constant maintenance
3. **Multi-system complexity** — Tests span ICE → Winpath → ICE, each with different UI paradigms
4. **Evidence management** — Screenshots must be labelled, organised, and uploaded as evidence
5. **Distributed teams** — Multiple testers across different trusts need shared AI learning

### 2.2 Core Requirements

| # | Requirement | Priority |
|---|-------------|----------|
| R1 | Execute UAT test scripts via browser automation | Critical |
| R2 | Capture labelled screenshots at every step as evidence | Critical |
| R3 | Self-heal when UI selectors change using AI | High |
| R4 | Import test cases from PractiTest CSV exports | High |
| R5 | Upload evidence screenshots back to PractiTest | High |
| R6 | Run on-premise behind Cloudflare for NHS compliance | Critical |
| R7 | Share AI learning across multiple test runner instances | Medium |
| R8 | Zero data loss during updates | Critical |
| R9 | Hardened security for NHS compliance | Critical |

### 2.3 Design Principles

1. **Data first** — Evidence is the primary output; everything else serves it
2. **AI-native** — AI is not an add-on; it's the core execution engine
3. **Self-healing** — Tests should adapt to UI changes, not break
4. **Offline-capable** — All AI runs locally (LM Studio / Ollama), no cloud dependencies
5. **Append-only** — Never delete evidence; always preserve run history

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Docker Host (HP Z440)                           │
│                                                                         │
│  ┌─────────────────────────────────┐   ┌────────────────────────────┐  │
│  │     uat-tester (container)       │   │ cloudflare-tunnel (cont)   │  │
│  │  ┌───────────────────────────┐  │   │                            │  │
│  │  │ Express API Server (3001) │  │   │  Cloudflared               │  │
│  │  │   REST + SSE + Static     │  │   │  → Cloudflare Edge         │  │
│  │  └──────────┬────────────────┘  │   │  → UATAPPv1.aetheris...    │  │
│  │             │                   │   └────────────────────────────┘  │
│  │  ┌──────────┴────────────────┐  │                                    │
│  │  │    Playwright Engine       │  │   ┌────────────────────────┐    │
│  │  │    Chromium + Edge         │  │   │  LM Studio (9070 XT)    │    │
│  │  └───────────────────────────┘  │   │  192.168.1.19:1234      │    │
│  │                                 │   │  openai/gpt-oss-20b     │    │
│  │  ┌───────────────────────────┐  │   └────────────────────────┘    │
│  │  │  AI Agentic Brain         │──┼───                               │
│  │  │  LLM-powered DOM mapping  │  │   ┌────────────────────────┐    │
│  │  └───────────────────────────┘  │   │  Ollama (4060 Ti/Z440)  │    │
│  │                                 │   │  localhost:11434        │    │
│  │  ┌───────────────────────────┐  │   │  pathology-eqa:latest   │    │
│  │  │  6 Pathology Agents       │  │   └────────────────────────┘    │
│  │  │  ADT · Winpath · ICE      │  │                                    │
│  │  │  BloodTrack · Cellavision │  │                                    │
│  │  └───────────────────────────┘  │                                    │
│  └─────────────────────────────────┘                                    │
│                                                                         │
│  Persistent Docker Volumes (never deleted):                             │
│  ┌──────────────┬────────────┬────────┬──────────────┐                │
│  │ uat-screenshots │uat-reports│uat-runs│ uat-scripts  │                │
│  └──────────────┴────────────┴────────┴──────────────┘                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Runtime** | Node.js | 22+ | Application server |
| **Web Framework** | Express | 5.2.1 | REST API + SSE + static files |
| **Browser Automation** | Playwright | 1.61.0 | Chromium + Edge browser control |
| **AI Backend (Primary)** | LM Studio | Latest | GPU-accelerated LLM inference |
| **AI Backend (Fallback)** | Ollama | Latest | CPU/local GPU inference |
| **LLM Model** | GPT-OSS-20B | 20B | Primary AI mapping model |
| **LLM Fallback** | Pathology-EQA | 4.3B | Pathology-specific model |
| **Container Host** | Docker | 29+ | Container runtime |
| **Reverse Proxy** | Cloudflare Tunnel | Latest | Public URL + security |
| **CI/CD** | GitHub Actions | — | Self-hosted runner deployment |
| **Security** | Helmet | 8.1.0 | HTTP security headers |
| **Rate Limiting** | express-rate-limit | 7.5.0 | API abuse prevention |
| **Monitoring** | Docker Healthcheck | — | Container health monitoring |

### 3.3 Container Architecture

```
┌─────────────────────────────────────────────────────┐
│                   docker-compose.yml                 │
│                                                      │
│  uat-tester:                                         │
│    build: .                                          │
│    ports: "127.0.0.1:3002:3001"                      │
│    volumes:                                          │
│      - uat-screenshots:/app/data/screenshots         │
│      - uat-reports:/app/data/reports                 │
│      - uat-runs:/app/data/runs                       │
│      - uat-scripts:/app/data/scripts                 │
│    security_opt: no-new-privileges:true               │
│    cap_drop: ALL                                      │
│    cap_add: NET_BIND_SERVICE                          │
│    user: pwuser                                       │
│                                                      │
│  cloudflare-tunnel:                                   │
│    image: cloudflare/cloudflared:latest               │
│    command: tunnel --config /etc/cloudflared/config   │
│    volumes: cloudflared:/etc/cloudflared:ro           │
└─────────────────────────────────────────────────────┘
```

---

## 4. Component Design

### 4.1 Module Map

```
uat-tester/
├── server.js                          # Express API — all routes, middleware, security
├── package.json                       # Dependencies (pinned exact versions)
├── Dockerfile                         # Hardened container build
├── docker-entrypoint.sh               # Container startup (permissions, seed data)
├── docker-compose.yml                 # Service orchestration
├── deploy-safe.sh                     # CI/CD-safe deployment (blocks -v flag)
├── backup-enhanced.sh                 # Full backup with manifest + S3
├── DEPLOY.md                          # Deployment architecture documentation
├── lib/
│   ├── runner.js                      # Playwright step execution engine
│   ├── screenshot-manager.js          # Labelled screenshot capture
│   ├── report-generator.js            # HTML report builder
│   ├── ai-mapper.js                   # LLM-powered step→action mapping
│   ├── ai-step-engine.js              # AI action execution with caching
│   ├── step-memory.js                 # Local AI mapping cache
│   ├── central-memory.js              # Multi-node shared AI memory
│   ├── agentic-brain.js               # Autonomous browser agent
│   ├── pathology-workflow.js          # Specialized LIS workflows
│   ├── practitest-converter.js        # CSV→JSON script converter
│   ├── practitest-client.js           # PractiTest API upload client
│   ├── recorder.js                    # Live browser session recorder
│   ├── wiki-generator.js              # GitHub wiki page generator
│   └── agents/
│       ├── index.js                   # Agent registry
│       └── adt-ice-agent.js           # ADT ICE patient feed agent
├── public/
│   ├── index.html                     # UI dashboard
│   ├── app.js                         # Frontend JavaScript
│   ├── style.css                      # Dashboard styling
│   └── .well-known/security.txt       # Security contact
├── scripts/                           # Test scripts (JSON)
│   ├── patients.json                  # NHS Digital test patients
│   ├── surrey-ice-order-verify.json   # Sample: Surrey ICE order
│   ├── winpath-results-verify.json    # Sample: Winpath results
│   ├── api-order-feed.json            # Sample: API order feed
│   ├── auto-detect-demo.json          # AI auto-detect demo
│   ├── adt-ice-agent.json             # ADT ICE workflow
│   └── pt-*.json                      # PractiTest-imported scripts
├── cloudflared/
│   ├── config.yml                     # Tunnel ingress rules
│   └── README.md                      # Tunnel setup guide
├── .github/workflows/
│   └── deploy.yml                     # CI/CD pipeline
└── .gitignore                         # Security-aware gitignore
```

### 4.2 API Design

The API follows REST conventions with SSE for real-time streaming.

#### Core Endpoints

| Method | Path | Purpose | Rate Limit |
|--------|------|---------|------------|
| `GET` | `/api/scripts` | List available test scripts | 60/min |
| `GET` | `/api/scripts/:filename` | Get script details | 60/min |
| `POST` | `/api/run` | Execute a test script | 5/min |
| `GET` | `/api/runs/:runId` | Get run status/results | 60/min |
| `GET` | `/api/runs/:runId/events` | SSE stream of step progress | — |
| `GET` | `/api/runs/:runId/screenshots` | List run screenshots | 60/min |
| `GET` | `/api/runs/:runId/report` | Download HTML report | 60/min |
| `DELETE` | `/api/runs/:runId` | Delete a run | 60/min |

#### AI Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/ai/status` | AI engine status and stats |
| `GET` | `/api/ai/memory/stats` | Central memory statistics |
| `GET` | `/api/ai/memory/export` | Export AI mappings for sharing |
| `POST` | `/api/ai/memory/import` | Import mappings from another node |
| `POST` | `/api/ai/clear-cache` | Clear local AI step cache |

#### Agentic Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/agents` | List all 6 specialized agents |
| `POST` | `/api/agentic/run` | Run any script with AI automation |
| `POST` | `/api/agents/adt-ice/run` | Run ADT ICE patient feed test |
| `GET` | `/api/agentic/status` | Agentic engine status |

#### Patient Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/patients` | List test patients (filterable) |
| `GET` | `/api/patients/:id` | Get patient details |
| `GET` | `/api/patients/tags/list` | List available tags/systems |

#### PractiTest Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/scripts/upload-csv` | Import CSV as test scripts |
| `POST` | `/api/scripts/upload-csv-test` | Preview CSV import |
| `POST` | `/api/practitest/upload` | Upload evidence to PractiTest |

#### Observability

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/insights` | Run statistics, pass rates, trends |
| `GET` | `/api/config` | Application configuration |
| `GET` | `/api/runs` | Recent run history |

### 4.3 UI Dashboard

The web UI is a single-page application with four panels:

```
┌─────────────────────────────────────────────────────────┐
│  🧪 UAT Test Runner                    ● Connected  AI  │
├──────────────┬──────────────────────────────────────────┤
│  Setup       │  Execution Progress                      │
│  ┌─────────┐ │  ┌────┬────┬────┬────┐                  │
│  │ Script  │ │  │Total│Pass│Fail│Rate│                  │
│  │ dropdown│ │  └────┴────┴────┴────┘                  │
│  └─────────┘ │  ████████████████░░░░ 80%                │
│  ┌─────────┐ │  ┌ Step 1 ✓ Navigate ─────────────────┐ │
│  │ Patient │ │  │ Step 2 🤖 AI: Click login ─────────│ │
│  │ selector│ │  │ Step 3 ✓ Enter credentials ────────│ │
│  └─────────┘ │  │ Step 4 ✗ Click submit ─────────────│ │
│  ┌─────────┐ │  └────────────────────────────────────┘ │
│  │Variables│ ├──────────────────────────────────────────┤
│  └─────────┘ │  Screenshots & Evidence                  │
│  [Run] [CSV] │  ┌────┐ ┌────┐ ┌────┐ ┌────┐           │
│              │  │    │ │    │ │    │ │    │           │
├──────────────┤  └────┘ └────┘ └────┘ └────┘           │
│  Event Log   ├──────────────────────────────────────────┤
│  14:32 Login │  Log                                     │
│  14:33 Click │  14:32 ✓ Login successful                │
└──────────────┴──────────────────────────────────────────┘
```

### 4.4 Screenshot Evidence Format

Every step captures a labelled screenshot with a structured filename:

```
{System}_{TestName}_Step{Number}_{Description}_{Timestamp}.png
```

**Examples:**
```
ADT_FHFT_A31_Deceased_Step1_EPR_Set_Patient_20260618_113045.png
Surrey_ICE_Order_Verification_Step3_Search_Patient_20260618_113050.png
HPV_ICE_Negative_Result_Step7_Authorise_20260618_113055.png
Winpath_FBC_Order_Step12_Result_Entry_20260618_113100.png
```

This enables:
- **Traceability** — every screenshot maps to a specific system, test, and step
- **Sorting** — chronological ordering by timestamp in the filename
- **Reporting** — HTML reports embed screenshots automatically

---

## 5. AI Engine Design

### 5.1 Architecture

The AI engine follows a **PLAN → OBSERVE → THINK → ACT → VERIFY** loop:

```
User Goal ("Place FBC order in Winpath")
        │
        ▼
  ┌─────────────┐
  │  PLAN       │ ← LLM breaks goal into atomic browser actions
  │  (Agentic   │   "click login", "type username", etc.
  │   Brain)    │
  └──────┬──────┘
         │
  ┌──────▼──────┐     ┌──────────────────┐
  │  OBSERVE    │────→│ Current DOM      │
  │  (Think)    │     │ (filtered)        │
  └──────┬──────┘     └──────────────────┘
         │
  ┌──────▼──────┐     ┌──────────────────┐
  │  THINK      │────→│ LLM returns:     │
  │  (AI Map)   │     │ {action, selector│
  └──────┬──────┘     │  value, confidence│
         │            └──────────────────┘
  ┌──────▼──────┐
  │  ACT        │ ← Playwright click/type/wait
  │  (Execute)  │
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │  CAPTURE    │ ← Labelled screenshot
  │  (Evidence) │
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │  VERIFY     │ ← Assert or feedback loop
  │  (Learn)    │   Success → cache mapping
  └─────────────┘   Failure → record, try fallback
```

### 5.2 DOM Filtering

Before sending the DOM to the LLM, it is filtered to only interactive elements:

```
Raw DOM (~50KB HTML)           Filtered DOM (~1-2KB)
┌────────────────────┐         ┌───────────────────────┐
│ <html>             │         │ <title>Winpath Login  │
│   <head>...</head> │   →    │ <button id="login-btn"│
│   <body>           │         │   class="primary">    │
│     <div>...</div> │         │   Login</button>      │
│     <button ...>   │         │ <input type="text"    │
│       Login        │         │   id="username" />    │
│     </button>      │         │ <input type="password"│
│     <input ...>    │         │   id="password" />    │
│     <script>...</> │         └───────────────────────┘
└────────────────────┘
```

This reduces token usage by ~95% and improves LLM response accuracy.

### 5.3 Fallback Chain

```
Step Execution
    │
    ├── Rule-based (hardcoded selector in script)
    │   ├── Success → continue
    │   └── Failure → AI fallback
    │
    ├── AI Fallback (Local Cache)
    │   ├── Found + confidence > 0.7 → execute, continue
    │   └── Not found → Central Memory
    │
    ├── AI Fallback (Central Memory)
    │   ├── Found + confidence > 0.5 → execute, continue
    │   └── Not found → Live AI call
    │
    ├── AI Fallback (Live LM Studio)
    │   ├── Primary: LM Studio at 192.168.1.19:1234 (gpt-oss-20b)
    │   │   ├── Success + confidence > 0.7 → cache, execute, continue
    │   │   └── Failure → Secondary fallback
    │   │
    │   └── Secondary: Ollama at localhost:11434 (pathology-eqa:latest)
    │       ├── Success → cache, execute, continue
    │       └── Failure → step marked as failed
    │
    └── All backends failed → step marked as failed with error details
```

### 5.4 Multi-Node Learning

AI mappings are shared across test runner instances:

```
Node A (FPH)                     Central Memory                 Node B (RSH)
    │                                │                              │
    ├── Maps "Click Login"           │                              │
    │   → button#login-btn           │                              │
    │   → confidence: 0.95           │                              │
    │                                │                              │
    ├── recordSuccess() ────────────►│  ┌──────────────────┐        │
    │                                │  │ central-memory   │        │
    │                                │  │ .json            │        │
    │                                │  │                  │        │
    │                                │  │ "Click Login":   │        │
    │                                │  │   action: click  │        │
    │                                │  │   selector:      │        │
    │                                │  │   button#login   │        │
    │                                │  │   confidence:    │        │
    │                                │  │   0.95           │        │
    │                                │  │   nodeId: NodeA  │        │
    │                                │  └──────────────────┘        │
    │                                │                              │
    │                                ├── getCentralMapping() ──────►│
    │                                │   → returns cached mapping   │
    │                                │                              │
    │                                │   Node B doesn't call LLM!   │
    │                                │   Uses Node A's mapping      │
```

### 5.5 Confidence Scoring

| Confidence | Meaning | Action |
|------------|---------|--------|
| 0.0 – 0.3 | Very low | Skip, mark step as unknown |
| 0.3 – 0.5 | Low | Use only as fallback |
| 0.5 – 0.7 | Medium | Execute but don't cache |
| 0.7 – 0.9 | High | Execute, cache locally and centrally |
| 0.9 – 1.0 | Very high | Execute, cache, boost on repeat |

Confidence decays by 5% per day if not refreshed. Repeated successes boost confidence by +0.05 per occurrence (max 0.99). Failures reduce confidence by -0.15.

---

## 6. Data Model

### 6.1 Script Format

```json
{
  "name": "Surrey ICE - Order Verification",
  "practitestId": "1134",
  "description": "Verify an order in Surrey ICE...",
  "system": "Surrey ICE",
  "version": "1.0",
  "practitestExport": true,
  "agentic": false,
  "variables": [
    { "name": "PATIENT_NHS", "label": "Patient NHS Number", "type": "text", "default": "", "required": false },
    { "name": "PATIENT_NAME", "label": "Patient Name", "type": "text", "default": "", "required": false },
    { "name": "HEADLESS", "label": "Run headless", "type": "text", "default": "true", "required": false }
  ],
  "steps": [
    { "id": "step-1", "description": "Navigate to Surrey ICE", "action": "navigate", "url": "{{BASE_URL}}", "takeScreenshot": true },
    { "id": "step-2", "description": "Click the login button", "action": "click", "selector": "#login-btn", "takeScreenshot": true },
    { "id": "step-3", "description": "Take a screenshot for evidence", "action": "screenshot", "takeScreenshot": true }
  ]
}
```

### 6.2 Run Format

```json
{
  "id": "mqjg7jrnK960",
  "script": { "name": "AI Self-Test", "system": "UAT Tester" },
  "status": "completed",
  "startedAt": "2026-06-18T10:00:00Z",
  "completedAt": "2026-06-18T10:02:30Z",
  "steps": [
    {
      "id": "navigate",
      "description": "Navigate to UAT dashboard",
      "status": "pass",
      "screenshot": "UAT_Tester_AI_Self_Test_navigate_done_20260618_100000.png",
      "aiRecovered": false,
      "startedAt": "2026-06-18T10:00:00Z",
      "completedAt": "2026-06-18T10:00:05Z"
    },
    {
      "id": "bad-step",
      "description": "Click the Run Test button",
      "status": "pass",
      "screenshot": "UAT_Tester_AI_Self_Test_bad_step_done_20260618_100010.png",
      "aiRecovered": true,
      "startedAt": "2026-06-18T10:00:05Z",
      "completedAt": "2026-06-18T10:00:35Z"
    }
  ]
}
```

### 6.3 Storage Architecture

```
Docker Volumes                    Host Filesystem
─────────────────                ───────────────
uat-screenshots/                  /opt/uat-tester/
  {runId}/                          .env
    {System}_{Test}_Step*.png       cloudflared/
                                    config.yml
uat-reports/                        credentials.json
  {runId}/                        backups/
    report.html                     manifest_*.json
                                    screenshots_*.tar.gz
uat-runs/                           ai-memory/
  _runs.json                        central-memory.json
                                    stepMemory.json
uat-scripts/
  pt-*.json                       custom-scripts/ (read-only)
  patients.json
```

---

## 7. Security Architecture

### 7.1 Defence in Depth

```
Layer 1: Cloudflare                    → DDoS, WAF, SSL termination
Layer 2: Cloudflare Tunnel             → No open ports, authenticate-origin
Layer 3: Docker Security               → No-root, dropped capabilities
Layer 4: Express Helmet                → CSP, HSTS, X-Frame-Options
Layer 5: Rate Limiting                 → 60 req/min API, 5 req/min runs
Layer 6: Input Validation              → Regex, size limits, sanitisation
Layer 7: Error Handling                → No stack traces in production
```

### 7.2 Security Headers

| Header | Value |
|--------|-------|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; connect-src 'self' https://api.practitest.com; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'self'` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `SAMEORIGIN` |
| RateLimit-Policy | `60;w=60` |

### 7.3 Docker Hardening

```yaml
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
cap_add:
  - NET_BIND_SERVICE
user: pwuser
```

### 7.4 CVE Management

- All dependencies pinned to exact versions in `package.json`
- `npm audit` runs as part of CI/CD
- Base image (`mcr.microsoft.com/playwright`) updated quarterly
- System packages upgraded in Dockerfile (`apt-get upgrade -y`)
- No secrets in Docker image — all via runtime environment variables

---

## 8. Build & Deployment

### 8.1 Build Process

```bash
# Development
npm install                    # Install dependencies
npx playwright install         # Install browsers
node server.js                 # Start server on :3001

# Production Docker
docker compose build uat-tester         # Build image
docker compose up -d uat-tester         # Start container
```

### 8.2 Dockerfile

```dockerfile
FROM mcr.microsoft.com/playwright:v1.61.0-noble

# Install Edge (for Playwright browser automation)
RUN curl -sSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor && \
    apt-get install -y microsoft-edge-stable

# Copy and install deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev
RUN npx playwright install --with-deps chromium

# Copy app
COPY . .
RUN mkdir -p /app/data/screenshots /app/data/reports /app/data/runs /app/data/scripts
RUN chown -R pwuser:pwuser /app/data
USER pwuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api/scripts').then(r=>process.exit(r.ok?0:1))"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
```

### 8.3 Safe Deployment

```bash
./deploy-safe.sh
```

This script:
1. Blocks the `-v`/`--volumes` flag (would destroy data)
2. Pulls latest code via `git pull`
3. Rebuilds Docker image with cache
4. Restarts container — **volumes preserved**

### 8.4 Backup

```bash
# Full backup with manifest
./backup-enhanced.sh

# Backup to S3
S3_BUCKET=s3://my-backup-bucket ./backup-enhanced.sh

# Retention: 90 days
# Includes: screenshots, reports, runs, scripts, AI memory, config
```

---

## 9. CI/CD Pipeline

### 9.1 Self-Hosted Runner

The CI/CD pipeline runs on a **self-hosted GitHub Actions runner** installed on the HP Z440:

```yaml
# .github/workflows/deploy.yml
name: Deploy UAT Tester
on:
  push:
    branches: [master]

jobs:
  safe-deploy:
    runs-on: uat          # Self-hosted runner label
    steps:
      - uses: actions/checkout@v4
      - run: |
          cd /opt/uat-tester
          git pull
          ./deploy-safe.sh
      - run: |
          curl -sf http://localhost:3002/api/scripts > /dev/null
          echo "Deployment verified"
```

### 9.2 Pipeline Flow

```
Developer pushes to master
        │
        ▼
GitHub Actions triggers workflow
        │
        ▼
Self-hosted runner (HP Z440) picks up job
        │
        ▼
git pull latest code
        │
        ▼
deploy-safe.sh:
  ├── docker compose build uat-tester
  ├── docker compose up -d uat-tester
  └── health check
        │
        ▼
Verify: curl http://localhost:3002/api/scripts
        │
        ▼
All data volumes preserved ✓
```

### 9.3 Runner Installation

```bash
# On HP Z440:
cd ~/actions-runner
./config.sh --url https://github.com/aquafishstore-boop/Automationtest \
  --token <registration-token> --name hpz440-runner --labels uat
sudo ./svc.sh install aetheris
sudo ./svc.sh start
```

---

## 10. Testing Strategy

### 10.1 Test Types

| Type | Tool | Scope |
|------|------|-------|
| Unit | Node.js assertion | Individual module functions |
| Integration | API calls | Endpoints, data flow, error handling |
| E2E | Playwright | Browser automation, screenshot capture |
| AI | LM Studio/Ollama | Step mapping accuracy, confidence scoring |
| Security | npm audit, Helmet | CVE scanning, header verification |

### 10.2 Self-Test Script

The application includes a self-test script that validates all features:

```bash
# Run via API
curl -X POST http://localhost:3002/api/run \
  -H "Content-Type: application/json" \
  -d '{"script": {"name": "Self-Test", "steps": [
    {"id": "navigate", "description": "Load dashboard", "action": "navigate", "url": "http://localhost:3002/"},
    {"id": "bad-selector", "description": "Click Run Test button", "action": "click", "selector": "#nonexistent"},
    {"id": "verify", "description": "Verify recovery", "action": "screenshot"}
  ]}}'
```

This tests:
- ✅ Basic navigation
- ✅ AI fallback (intentionally wrong selector)
- ✅ Screenshot capture
- ✅ Step result reporting

---

## 11. Operations Guide

### 11.1 Daily Operations

```bash
# Check status
docker ps --filter name=uat
curl https://UATAPPv1.aetheriscloudgroup.uk/api/insights

# View logs
docker logs uat-tester --tail 50

# Quick health check
curl -s http://localhost:3002/api/scripts | python3 -c 'import sys,json;d=json.load(sys.stdin);print(f"{len(d)} scripts")'
```

### 11.2 Backup & Restore

```bash
# Backup
./backup-enhanced.sh

# List backups
ls -la /opt/uat-tester/backups/

# Restore screenshots from backup
docker run --rm \
  -v /opt/uat-tester/backups:/backup \
  -v uat-tester_uat-screenshots:/target \
  alpine tar xzf /backup/screenshots_20260618.tar.gz -C /target
```

### 11.3 Troubleshooting

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| Container won't start | Port conflict | `sudo fuser -k 3002/tcp` |
| AI not working | LM_HOST not set | Check `.env`, `docker compose restart` |
| Browser automation fails | Browser not installed | `docker exec uat-tester npx playwright install chromium` |
| PractiTest import fails | Multi-line CSV fields | Ensure quotes are correct in CSV |
| Tunnel down | Network issue | `docker compose restart cloudflare-tunnel` |

### 11.4 Monitoring

- **Docker Healthcheck**: Every 30s, checks API responds
- **Log Rotation**: 10MB per file, 3 files max
- **Backup Health**: 90-day retention, manifest JSON generated
- **CI/CD Alerts**: GitHub notifications on pipeline failure

---

## 12. Future Roadmap

### Phase 3 (Complete — v2.1.0) — Agentic Automation
- ✅ **Agentic Brain** — Autonomous PLAN → THINK → ACT → CAPTURE → VERIFY loop (`lib/agentic-brain.js`, 341 lines)
- ✅ **6 Specialized Pathology Agents** — ADT ICE, Winpath, Surrey ICE, BloodTrack (stub), Cellavision (stub), Custom Script
- ✅ **Multi-Node Central Memory** — Shared AI mapping store with confidence scoring + decay (`lib/central-memory.js`, 195 lines)
- ✅ **Self-Healing Selectors** — AI DOM filtering → LLM mapping → fallback chain → failure feedback loop
- ✅ **Screenshot Evidence** — Labelled format: `{System}_{Test}_{Step}_{Desc}_{Timestamp}.png`
- ✅ **11 API Endpoints** — All responding HTTP 200
- ✅ **CI/CD Pipeline** — Self-hosted runner on HP Z440, `deploy-safe.sh` preserves data
- ✅ **2 AI Backends** — Primary: LM Studio (gpt-oss-20b, 9070 XT), Fallback: Ollama (pathology-eqa:latest, 4060 Ti)
- ✅ **25 Test Scripts** — 6 sample + 19 PractiTest-imported ADT/ICE scripts

### Phase 4 (Complete — v2.2.0) — Advanced Agents & Observability

**Priority 1 — Missing Agent Implementations (Complete):**
- ✅ **BloodTrack Kiosk Agent** — Barcode scanning simulation, move-in/out workflows, emergency release (`lib/agents/bloodtrack-agent.js`, 84 lines)
- ✅ **Cellavision Result Verification Agent** — Differential result capture, RBC morphology match (`lib/agents/cellavision-agent.js`, 56 lines)
- ✅ **Immulink Crossmatch Agent** — Group & Screen, Antibody ID, Panel imports (`lib/agents/immulink-agent.js`, 95 lines)
- ✅ **WES EQA Agent** — Scheme creation → processing → reporting pipeline (`lib/agents/wes-agent.js`, 107 lines)
- ✅ **Cyres Screening Stats Agent** — Primary screener stats, import validation (`lib/agents/cyres-agent.js`, 108 lines)
- ✅ **9-Agent Registry** — All agents exported, all `implemented: true`

**Priority 2 — Observability & Reporting (Complete):**
- ✅ **Prometheus Metrics Endpoint** — `GET /api/metrics` with runs, pass rate, uptime, memory, agent count
- ✅ **Test Scheduling API** — `POST/GET/DELETE /api/schedule` for managing cron job configs
- ✅ **Slack/Teams Notifications** — `POST /api/notify/test` with webhook support, `GET /api/notify/status`

**Priority 3 — Enterprise (Planned — v3.0.0):**
- 🔲 **Multi-Trust Support** — Separate configurations for different NHS trusts
- 🔲 **LDAP/SAML Authentication** — Single sign-on for NHS users
- 🔲 **Audit Logging** — External SIEM integration (Syslog)
- 🔲 **FHIR Test Data Generation** — Synthetic patient data via FHIR APIs
- 🔲 **Load Testing** — Concurrent test execution at scale
- 🔲 **Grafana Dashboard** — Pre-built dashboards for metrics endpoint
- 🔲 **Automated Cron Runner** — Real cron execution of scheduled jobs (requires node-schedule)

### Phase 5 — Scale & Observability
- 🔲 Grafana dashboard for run metrics
- 🔲 Prometheus metrics endpoint
- 🔲 Automated test scheduling (cron-based test runs)
- 🔲 Slack/Teams notification on test completion
- 🔲 AI model fine-tuning on pathology-specific data

### Phase 6 — Enterprise
- 🔲 Multi-tenant support (separate trusts)
- 🔲 LDAP/SAML authentication
- 🔲 Audit logging to external SIEM
- 🔲 FHIR integration for test data generation
- 🔲 Load testing capabilities

---

## Appendix A: Quick Reference

### A.1 Common Commands

```bash
# Deploy
./deploy-safe.sh                              # Safe deploy (preserves data)
docker compose build --no-cache uat-tester     # Full rebuild

# Backup
./backup-enhanced.sh                           # Full backup

# Monitor
docker logs uat-tester --tail 20              # View logs
docker ps --filter name=uat                   # Container status

# Test
curl http://localhost:3002/api/scripts        # List scripts

# AI
curl http://localhost:3002/api/ai/status      # AI engine status
curl http://localhost:3002/api/insights       # Run statistics
```

### A.2 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Internal container port |
| `BROWSER` | No | `msedge` | Playwright browser |
| `HEADLESS` | No | `true` | Headless mode |
| `LM_HOST` | No | — | LM Studio API URL |
| `LM_API_TOKEN` | No | — | LM Studio API token |
| `AI_MODEL` | No | — | LLM model name |
| `NODE_ENV` | No | `production` | Error verbosity |

### A.3 File Locations

| Resource | Path (Host) | Path (Container) |
|----------|-------------|------------------|
| Scripts | `/opt/uat-tester/scripts/` | `/app/data/scripts/` |
| Screenshots | Docker volume `uat-screenshots` | `/app/data/screenshots/` |
| Reports | Docker volume `uat-reports` | `/app/data/reports/` |
| Run History | Docker volume `uat-runs` | `/app/data/runs/` |
| AI Memory | `/opt/uat-tester/ai-memory/` | — |
| Backups | `/opt/uat-tester/backups/` | — |
| Config | `/opt/uat-tester/.env` | — |
| Tunnel Config | `/opt/uat-tester/cloudflared/` | `/etc/cloudflared/` |

---

*Document generated 2026-06-18 | UAT Tester v2.0.0 | © Aetheris Pathology Cloud*
