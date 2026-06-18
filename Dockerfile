# UAT Tester — Hardened Docker Image
# Security: non-root user, read-only root FS, pinned deps, no build secrets

FROM mcr.microsoft.com/playwright:v1.61.0-noble

LABEL org.opencontainers.image.title="Pathology UAT Tester"
LABEL org.opencontainers.image.description="Hardened UAT test runner for pathology systems"
LABEL org.opencontainers.image.version="2.0.0"
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

# Copy dependency manifest and install (with lockfile for integrity)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev && \
    npm cache clean --force

# Install Playwright system deps and Chromium
RUN npx playwright install --with-deps chromium

# Create app directories with secure permissions
RUN mkdir -p /app/data/screenshots /app/data/reports /app/data/runs /app/data/scripts && \
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
ENV BROWSER=msedge
ENV SCREENSHOTS_DIR=/app/data/screenshots
ENV REPORTS_DIR=/app/data/reports
ENV RUNS_DIR=/app/data/runs
ENV SCRIPTS_DIR=/app/data/scripts

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
