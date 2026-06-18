/**
 * Audit Logger — structured logging for security, SIEM, and compliance.
 *
 * Writes to:
 *   1. JSON lines file (logs/audit-YYYY-MM-DD.log)
 *   2. Syslog (if SYSLOG_HOST configured)
 *   3. Console (optional, controlled by AUDIT_CONSOLE)
 *
 * Log format:
 *   { timestamp, user, session, action, resource, detail, ip, trust, severity }
 */

import fs from "fs";
import path from "path";
import dgram from "dgram";

const LOG_DIR = process.env.AUDIT_LOG_DIR || path.resolve(process.cwd(), "logs");
const SYSLOG_HOST = process.env.SYSLOG_HOST || "";
const SYSLOG_PORT = parseInt(process.env.SYSLOG_PORT) || 514;
const AUDIT_CONSOLE = process.env.AUDIT_CONSOLE === "true";

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function getLogFile() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `audit-${date}.log`);
}

function formatEntry(entry) {
  return JSON.stringify({
    timestamp: entry.timestamp || new Date().toISOString(),
    user: entry.user || "anonymous",
    session: entry.session || "",
    action: entry.action || "unknown",
    resource: entry.resource || "",
    detail: entry.detail || "",
    ip: entry.ip || "",
    trust: entry.trust || "default",
    severity: entry.severity || "info",
    userAgent: entry.userAgent || ""
  });
}

function sendSyslog(entry) {
  if (!SYSLOG_HOST) return;
  const pri = entry.severity === "error" ? 13 : entry.severity === "warn" ? 14 : 15;
  const msg = `<${pri}>${entry.timestamp} uat-tester[1]: ${JSON.stringify(entry)}`;
  try {
    const sock = dgram.createSocket("udp4");
    sock.send(Buffer.from(msg), SYSLOG_PORT, SYSLOG_HOST, () => sock.close());
  } catch (err) {
    console.error("[Audit] Syslog send failed:", err.message);
  }
}

export function audit(entry) {
  const formatted = formatEntry(entry);
  try {
    fs.appendFileSync(getLogFile(), formatted + "\n", "utf-8");
  } catch (err) {
    console.error("[Audit] Write failed:", err.message);
  }
  sendSyslog(entry);
  if (AUDIT_CONSOLE) console.log("[AUDIT]", formatted);
}

export function getAuditLog(options = {}) {
  const { date, limit = 100, offset = 0, severity, action, user } = options;
  const dateStr = date || new Date().toISOString().slice(0, 10);
  const fp = path.join(LOG_DIR, `audit-${dateStr}.log`);
  if (!fs.existsSync(fp)) return [];

  try {
    const lines = fs.readFileSync(fp, "utf-8").split("\n").filter(Boolean);
    let entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

    if (severity) entries = entries.filter(e => e.severity === severity);
    if (action) entries = entries.filter(e => e.action === action);
    if (user) entries = entries.filter(e => e.user === user);

    return entries.slice(offset, offset + limit);
  } catch {
    return [];
  }
}

export function getAuditSummary(days = 7) {
  const summary = { total: 0, bySeverity: {}, byAction: {}, byUser: {}, byTrust: {}, dates: {} };
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const entries = getAuditLog({ date: dateStr, limit: 10000 });
    summary.dates[dateStr] = entries.length;
    for (const e of entries) {
      summary.total++;
      summary.bySeverity[e.severity] = (summary.bySeverity[e.severity] || 0) + 1;
      summary.byAction[e.action] = (summary.byAction[e.action] || 0) + 1;
      summary.byUser[e.user] = (summary.byUser[e.user] || 0) + 1;
      summary.byTrust[e.trust] = (summary.byTrust[e.trust] || 0) + 1;
    }
  }
  return summary;
}

export function createAuditMiddleware() {
  return (req, res, next) => {
    const originalEnd = res.end;
    res.end = function (...args) {
      if (req.path.startsWith("/api/")) {
        audit({
          action: `${req.method} ${req.path}`,
          resource: req.path,
          detail: `${res.statusCode}`,
          ip: req.ip || req.connection?.remoteAddress || "",
          user: req.user?.username || req.session?.user || "anonymous",
          session: req.session?.id || "",
          trust: req.trust?.id || "default",
          userAgent: req.headers["user-agent"] || "",
          severity: res.statusCode >= 400 ? "warn" : "info"
        });
      }
      return originalEnd.apply(this, args);
    };
    next();
  };
}
