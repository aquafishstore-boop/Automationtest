# UAT Tester - Windows Local Setup Script
# Run this on your Windows PC to build and test locally

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  UAT Tester - Windows Local Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Check Node.js
$nodeVer = node --version 2>$null
if (-not $nodeVer) {
    Write-Host "ERROR: Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "Node.js: $nodeVer" -ForegroundColor Green

# Install dependencies
Write-Host "`n[1/4] Installing npm dependencies..." -ForegroundColor Yellow
npm install

# Install Playwright browsers
Write-Host "`n[2/4] Installing Playwright browsers..." -ForegroundColor Yellow
npx playwright install chromium
npx playwright install msedge 2>$null

# Create data directories
Write-Host "`n[3/4] Creating data directories..." -ForegroundColor Yellow
mkdir -p screenshots, reports, runs -Force

# Copy default scripts if empty
if ((Get-ChildItem scripts -Filter *.json).Count -eq 0) {
    Write-Host "  No scripts found. Use CSV Import in the UI to load PractiTest tests."
}

# Start the server
Write-Host "`n[4/4] Starting UAT Tester..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Open: http://localhost:3001" -ForegroundColor Green
Write-Host "  Stop: Ctrl+C" -ForegroundColor Gray
Write-Host ""

node server.js
