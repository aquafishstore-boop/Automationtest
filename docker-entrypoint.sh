#!/bin/bash
set -e

# Ensure data directories exist and are writable
chmod 750 /app/data 2>/dev/null || true
mkdir -p /app/data/screenshots /app/data/reports /app/data/runs /app/data/scripts 2>/dev/null || true
chown -R pwuser:pwuser /app/data 2>/dev/null || true

# Seed default scripts if scripts volume is empty
if [ -d "/app/scripts-seed" ] && [ -d "/app/data/scripts" ] && [ -z "$(ls -A /app/data/scripts 2>/dev/null)" ]; then
    echo "Seeding default scripts..."
    cp /app/scripts-seed/*.json /app/data/scripts/ 2>/dev/null || true
    chown -R pwuser:pwuser /app/data/scripts 2>/dev/null || true
fi

echo "UAT Tester v2.0 starting..."
echo "  Port: ${PORT:-3001} | Browser: ${BROWSER:-chromium} | Headless: ${HEADLESS:-true}"
if [ -n "${LM_HOST}" ]; then echo "  AI: enabled (${LM_HOST})"; else echo "  AI: disabled"; fi

exec "$@"
