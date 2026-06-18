# Security Posture — Pathology UAT Tester

## CVE Mitigation Status (June 2026)

| CVE | Severity | Component | Fixed In | Status |
|-----|----------|-----------|----------|--------|
| CVE-2026-48933 | HIGH | Node.js WebCrypto | Node 24.17.1 | ✅ Force-upgraded |
| CVE-2026-48618 | HIGH | TLS hostname bypass | Node 24.17.1 | ✅ Force-upgraded |
| CVE-2026-48615 | MEDIUM | Proxy credential leak | Node 24.17.1 | ✅ Force-upgraded |
| CVE-2026-48619 | MEDIUM | HTTP/2 OOM | Node 24.17.1 | ✅ Force-upgraded |
| CVE-2026-48937 | MEDIUM | HTTP/2 GOAWAY leak | Node 24.17.1 | ✅ Force-upgraded |
| CVE-2026-48928 | MEDIUM | mTLS auth bypass | Node 24.17.1 | ✅ Force-upgraded |
| CVE-2026-48930 | MEDIUM | TLS host rebinding | Node 24.17.1 | ✅ Force-upgraded |
| CVE-2026-48934 | MEDIUM | TLS session reuse | Node 24.17.1 | ✅ Force-upgraded |
| CVE-2026-48617 | LOW | Permission Model bypass | Node 24.17.1 | ✅ Force-upgraded |
| CVE-2026-48935 | LOW | Permission Model (FileHandle) | Node 24.17.1 | ✅ Force-upgraded |
| CVE-2026-48931 | LOW | HTTP Response Queue Poisoning | Node 24.17.1 | ✅ Force-upgraded |
| CVE-2026-48936 | LOW | Unix socket bypass | Node 26.x only | ✅ N/A (Node 24) |

**Critical:** All 12 CVEs disclosed 2026-06-18 are mitigated by forcing Node.js v24.17.1

## Dependency CVEs (npm audit)

**Result:** 0 vulnerabilities across 76 packages.

All dependencies pinned to patched versions:
- `express` 5.2.1 — latest 5.x
- `helmet` 8.2.0 — latest
- `playwright` 1.61.0 — latest channel
- `express-rate-limit` 8.5.2 — latest
- `cors` 2.8.6 — latest
- `uuid` 14.0.0 — latest

## Docker Container Hardening

| Control | Status | Details |
|---------|--------|---------|
| Read-only root filesystem | 🟢 Enabled | `read_only: true` in compose |
| Capability drop | 🟢 ALL dropped | `cap_drop: [ALL]` |
| Capability add (minimal) | 🟢 NET_BIND_SERVICE only | Binds to port 3001 |
| Non-root user | 🟢 `pwuser` | Defined in Dockerfile |
| No new privileges | 🟢 Enabled | `no-new-privileges:true` |
| Seccomp profile | 🟢 Custom profile | `seccomp-profile.json` |
| Health check | 🟢 Configured | HTTP check every 30s |
| Read-only bind mounts | 🟢 `:ro` on config files | cloudflared + custom-scripts |
| Named volumes | 🟢 All 6 persistent volumes | screenshots, reports, runs, scripts, logs, config |
| Container restart | 🟢 `unless-stopped` | Survives host reboot |

## VM Security (HP Z440 — 192.168.1.8)

| Finding | Severity | Status | Fix |
|---------|----------|--------|-----|
| Ollama on 0.0.0.0:11434 | 🔴 CRITICAL | Detected | Must bind to 127.0.0.1 only |
| Prometheus on 0.0.0.0:9090 | 🟡 MEDIUM | Detected | Bind to 127.0.0.1 or add auth |
| Port 8081/8082 on 0.0.0.0 | 🟡 MEDIUM | Detected | Investigate and restrict |
| Port 4369 (Erlang) on 0.0.0.0 | 🟡 MEDIUM | Detected | Investigate and restrict |
| Port 22 (SSH) on 0.0.0.0 | 🟢 WAI | Allowed | Key-only auth verified |
| Docker socket access | 🟢 Restricted | Root only | Verified |

### Ollama CVE Note
Ollama versions prior to 0.5.0 have known CVEs (CVE-2025-28645 path traversal, etc.).
The running instance should be:
- Bound to 127.0.0.1 only (currently on 0.0.0.0)
- Behind authentication if remote access required
- Regularly updated

## HTTP Security Headers

| Header | Value | Status |
|--------|-------|--------|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ...` | 🟢 Enabled |
| Strict-Transport-Security | (Helmet default) | 🟢 Enabled |
| X-Content-Type-Options | `nosniff` | 🟢 Enabled |
| X-Frame-Options | (Helmet default) | 🟢 Enabled |
| Rate Limiting | 60/min general, 5/min runs | 🟢 Enabled |

## API Security

- All `/api/*` routes rate-limited
- Input validation and sanitization (XSS stripping)
- No verbose errors in production mode
- Path traversal protection
- CORS restricted to same-origin
- Authentication: LDAP / SAML / local with session RBAC
- OAuth 2.0 M2M available for CI/CD integration
- Audit logging on every API call with Syslog forward capability

## Recommended Immediate Actions

1. **Fix Ollama binding** — `sudo systemctl edit ollama` → add `Environment="OLLAMA_HOST=127.0.0.1"`
2. **Rebase to Node 24.17.1** — ✅ Already done in Dockerfile
3. **Review Prometheus port** — Add nginx auth or bind to 127.0.0.1
4. **Regular npm audit** — Run `npm audit --production` in CI/CD
5. **Rotate LM_API_TOKEN** — If compromised, regenerate in LM Studio

---

*Last updated: 2026-06-18 | UAT Tester v3.1.0*
