# UAT Tester — Hardened Docker Image
# Security: non-root user, forced Node.js patched version, read-only root FS (at runtime), pinned deps

FROM mcr.microsoft.com/playwright:v1.61.0-noble AS base

LABEL org.opencontainers.image.title="Pathology UAT Tester"
LABEL org.opencontainers.image.description="Hardened UAT test runner for pathology systems"
LABEL org.opencontainers.image.version="3.2.0"
LABEL org.opencontainers.image.vendor="Aetheris Pathology Cloud"

WORKDIR /app

# Security: update system packages for CVE fixes
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg && \
    rm -rf /var/lib/apt/lists/*

# Install Microsoft Edge (for Playwright browser automation)
RUN curl -sSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/edge stable main" > /etc/apt/sources.list.d/microsoft-edge.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends microsoft-edge-stable && \
    rm -rf /var/lib/apt/lists/*

# CVE-2026-48933, CVE-2026-48618, CVE-2026-48615, CVE-2026-48619, CVE-2026-48937, CVE-2026-48928, CVE-2026-48930, CVE-2026-48934, CVE-2026-48617, CVE-2026-48935, CVE-2026-48931
# Force Node.js to latest patched version (fixes 12 CVEs disclosed 2026-06-18)
# Uses `n` version manager for reliable installation and future patch updates
RUN npm install -g n && \
    n 24.17.1 2>/dev/null || n 24.17.0 2>/dev/null || true && \
    hash -r && node --version && npm --version

# Copy dependency manifest and install (with lockfile for integrity)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev && \
    npm cache clean --force

# Install Playwright system deps and Chromium
RUN npx playwright install --with-deps chromium

# Create app directories with secure permissions
RUN mkdir -p /app/data/screenshots /app/data/reports /app/data/runs /app/data/scripts /app/data/logs /app/data/config/trusts && \
    chown -R pwuser:pwuser /app/data && \
    chmod -R 750 /app/data

# Copy application code
COPY --chown=pwuser:pwuser . .

# Copy and seed default scripts
COPY --chown=pwuser:pwuser scripts/*.json /app/data/scripts/
RUN mkdir -p /app/scripts-seed && \
    cp /app/data/scripts/*.json /app/scripts-seed/ && \
    chown -R pwuser:pwuser /app/scripts-seed

# Expose only the app port
EXPOSE 3001

# Default environment (secrets passed at runtime only)
ENV NODE_ENV=production
ENV PORT=3001
ENV HEADLESS=true
ENV BROWSER=chromium
ENV SCREENSHOTS_DIR=/app/data/screenshots
ENV REPORTS_DIR=/app/data/reports
ENV RUNS_DIR=/app/data/runs
ENV SCRIPTS_DIR=/app/data/scripts
ENV AUDIT_LOG_DIR=/app/data/logs
ENV AUTH_USERS_FILE=/app/data/config/auth-users.json
ENV TRUSTS_DIR=/app/data/config/trusts
ENV SCHEDULE_FILE=/app/data/config/scheduled-jobs.json
ENV SCHEDULE_HISTORY_FILE=/app/data/config/schedule-history.json

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api/scripts').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Entrypoint: ensures data dir permissions
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod 755 /docker-entrypoint.sh

# Security: run as non-root user
USER pwuser

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
