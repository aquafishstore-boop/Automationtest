/**
 * UAT Tester Server — Hardened
 * 
 * Security features:
 * - Helmet (CSP, HSTS, X-Frame-Options, no-sniff, etc.)
 * - Rate limiting on all API routes
 * - Input validation and sanitization
 * - No verbose error messages in production
 * - Path traversal protection
 * - CORS restricted to same-origin
 * - Secure file serving
 */

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRun, executeRun, getRun, cancelRun, getAllRuns, deleteRun } from "./lib/runner.js";
import { getScreenshotPath, listScreenshots, getReportPath } from "./lib/screenshot-manager.js";
import { generateReport } from "./lib/report-generator.js";
import { isConfigured as ptConfigured, uploadEvidence } from "./lib/practitest-client.js";
import { convertAndSave, parsePractitestCSV } from "./lib/practitest-converter.js";
import { startRecording, stopRecording, recordStep, getRecorderStatus, getRecordings } from "./lib/recorder.js";
import { loadMemory, clearMemory } from "./lib/step-memory.js";
import { getMemoryStats, exportMemory, importMemory, registerNode, NODE_ID } from "./lib/central-memory.js";
import { runTestCaseWithAgent, runWinpathWorkflow, runSurreyICEWorkflow } from "./lib/pathology-workflow.js";
import {
  getAgentRegistry, runADTICETest, runWinpathAgent, runICEAgency, runCustomScriptAgent,
  runBloodTrackAgent, runCellavisionAgent, runImmulinkAgent, runWESAgent, runCyresAgent
} from "./lib/agents/index.js";
import { getTrusts, getTrust, setTrust, deleteTrust, getTrustsSummary, resolveTrust, getPatientsForTrust, clearTrustCache } from "./lib/trust-manager.js";
import { authenticate, createSession, getSession, destroySession, getSessions, getUsers, setUser, deleteUser, authMiddleware, roleMiddleware, getSAMLAuthURL, SAMLConfig } from "./lib/auth.js";
import { generatePatient, generateObservation, generateDiagnosticReport, generateSpecimen, generateServiceRequest, generateBundle, generateFullPatientBundle } from "./lib/fhir-generator.js";
import { audit, getAuditLog, getAuditSummary, createAuditMiddleware } from "./lib/audit-logger.js";
import { startScheduler, stopScheduler, getJobs, addJob, removeJob, updateJob, getJobHistory, getRunningJobs, triggerJob } from "./lib/scheduler.js";
import { collectTrainingData, saveTrainingBatch, getTrainingStats, getTrainingFiles, submitFineTuning, clearTrainingData } from "./lib/fine-tuner.js";
import { getPoolStatus, getPoolResults, runInPool, cancelQueuedJob, clearPoolResults } from "./lib/concurrent-runner.js";
import { generateScript, generateStep, explainScript, suggestTests } from "./lib/nl-author.js";
import { remediate, getRemediationLog, getRemediationStats } from "./lib/auto-remediation.js";
import { recordTimings, getBaseline, getRegressionReport, getPerfSummary, clearBaseline } from "./lib/perf-tracker.js";
import { postCommitStatus, postPRComment, getGitHubConfig } from "./lib/github-checks.js";
import { getProfiles as getMobileProfiles, getProfile, getProfileConfig } from "./lib/mobile-profiles.js";
import { createFHIRRouter } from "./lib/fhir-server.js";
import { generateK6Script, generateArtilleryScript, getLoadTestConfigs } from "./lib/load-test-gen.js";
import { getAgentEndpoints, formatAgentResponse } from "./lib/agent-api.js";
import { tokenEndpoint, introspectToken, m2mMiddleware, requireScopes, getM2MStatus, registerClient } from "./lib/oauth-m2m.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = process.env.SCRIPTS_DIR || path.join(__dirname, "scripts");
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = parseInt(process.env.PORT) || 3001;
const PATIENTS_FILE = path.join(SCRIPTS_DIR, "patients.json");
const IS_PROD = process.env.NODE_ENV === "production";

const app = express();

// --- Security Middleware ---

// Helmet: secure HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://api.practitest.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS: restrict to same-origin
app.use(cors({
  origin: false, // block all cross-origin
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
  maxAge: 86400
}));

// Rate limiting: max 60 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down" }
});

app.use("/api/run", rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: "Too many test runs, wait before starting another" } }));
app.use("/api/agentic", rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: "Too many agentic runs" } }));
app.use("/api", apiLimiter);

// Body parser with size limit
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));

// Disable x-powered-by
app.disable("x-powered-by");

// Trust resolution middleware
app.use((req, res, next) => {
  req.trust = resolveTrust(req);
  next();
});

// Audit logging middleware (API routes only)
app.use("/api", createAuditMiddleware());

// --- Input Validation Helpers ---

function isValidRunId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id) && id.length < 64;
}

function isValidFilename(name) {
  return typeof name === "string" && /^[a-zA-Z0-9._-]+$/.test(name) && !name.includes("..") && name.length < 256;
}

function sanitizePath(base, relative) {
  const full = path.resolve(base, relative);
  if (!full.startsWith(base)) throw new Error("Invalid path");
  return full;
}

// Error handler (no stack traces in production)
function handleError(err, res) {
  console.error(err);
  res.status(err.status || 500).json({
    error: IS_PROD ? "Internal server error" : err.message
  });
}

// Body validation middleware
function validateScript(req, res, next) {
  if (req.method === "POST" && req.body) {
    // Sanitize all string inputs
    for (const [k, v] of Object.entries(req.body)) {
      if (typeof v === "string") {
        req.body[k] = v.replace(/[<>]/g, ""); // strip raw HTML/script tags
      }
    }
  }
  next();
}

app.use(validateScript);

// --- Static Files ---

app.use(express.static(PUBLIC_DIR, {
  maxAge: IS_PROD ? "1h" : 0,
  etag: true,
  lastModified: true,
  setHeaders: (res, p) => {
    if (p.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache");
    }
  }
}));

// --- SSE Client Manager ---

const SSE_CLIENTS = new Map();

function sseSend(runId, event, data) {
  const clients = SSE_CLIENTS.get(runId);
  if (!clients) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(msg);
  }
}

// --- API Routes ---

// Config
app.get("/api/config", (req, res) => {
  res.json({
    browser: process.env.BROWSER || "chromium",
    headless: process.env.HEADLESS !== "false",
    port: PORT,
    practitestConfigured: ptConfigured(),
    scriptsDir: SCRIPTS_DIR,
    screenshotDir: process.env.SCREENSHOTS_DIR || path.join(__dirname, "screenshots"),
    reportsDir: process.env.REPORTS_DIR || path.join(__dirname, "reports"),
    ai: {
      lmHost: process.env.LM_HOST || null,
      aiModel: process.env.AI_MODEL || null,
      enabled: !!(process.env.LM_HOST)
    }
  });
});

// --- Authentication ---

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const result = authenticate(username, password);
  if (result.error) return res.status(401).json({ error: result.error });
  const sid = createSession(result);
  audit({ action: "login", resource: "/api/auth/login", user: result.username, ip: req.ip, trust: req.trust?.id, severity: "info", detail: `User ${result.username} logged in via ${result.source}` });
  res.json({ session: sid, user: { username: result.username, displayName: result.displayName, role: result.role, trusts: result.trusts } });
});

app.post("/api/auth/logout", (req, res) => {
  const sid = req.headers["authorization"]?.replace("Bearer ", "") || req.body?.session;
  if (sid) {
    const session = getSession(sid);
    if (session) audit({ action: "logout", resource: "/api/auth/logout", user: session.user?.username, ip: req.ip, trust: req.trust?.id, severity: "info" });
    destroySession(sid);
  }
  res.json({ status: "logged out" });
});

app.get("/api/auth/session", (req, res) => {
  const sid = req.headers["authorization"]?.replace("Bearer ", "") || req.query?.session;
  const session = sid ? getSession(sid) : null;
  if (!session) return res.json({ authenticated: false });
  res.json({ authenticated: true, user: session.user, createdAt: session.createdAt, expiresAt: session.expiresAt });
});

app.get("/api/auth/sessions", authMiddleware, roleMiddleware("admin"), (req, res) => res.json(getSessions()));

app.get("/api/auth/users", authMiddleware, roleMiddleware("admin"), (req, res) => res.json(getUsers()));

app.post("/api/auth/users", authMiddleware, roleMiddleware("admin"), (req, res) => {
  const { username, password, role, displayName, trusts } = req.body;
  if (!username) return res.status(400).json({ error: "Username required" });
  setUser(username, { password: password || "changeme", role: role || "tester", displayName, trusts });
  res.json({ status: "created", username });
});

app.delete("/api/auth/users/:username", authMiddleware, roleMiddleware("admin"), (req, res) => {
  deleteUser(req.params.username);
  res.json({ status: "deleted" });
});

app.get("/api/auth/saml", (req, res) => {
  const url = getSAMLAuthURL();
  if (!url) return res.json({ enabled: false, message: "SAML not configured" });
  res.json({ enabled: true, url });
});

app.get("/api/auth/config", (req, res) => res.json({ saml: SAMLConfig(), ldap: !!process.env.LDAP_URL, local: true }));

// --- Trust Manager ---

app.get("/api/trusts", (req, res) => res.json(getTrustsSummary()));

app.get("/api/trusts/:id", (req, res) => {
  const trust = getTrust(req.params.id);
  if (!trust) return res.status(404).json({ error: "Trust not found" });
  res.json(trust);
});

app.put("/api/trusts/:id", (req, res) => {
  try {
    const trust = setTrust(req.params.id, req.body);
    clearTrustCache();
    res.json(trust);
  } catch (err) { handleError(err, res); }
});

app.delete("/api/trusts/:id", (req, res) => {
  try {
    deleteTrust(req.params.id);
    res.json({ status: "deleted" });
  } catch (err) { handleError(err, res); }
});

app.post("/api/trusts/:id/resolve", (req, res) => {
  const trust = getTrust(req.params.id);
  if (!trust) return res.status(404).json({ error: "Trust not found" });
  const patients = getPatientsForTrust(req.params.id, (() => { try { return JSON.parse(fs.readFileSync(PATIENTS_FILE, "utf-8")); } catch { return []; } })());
  res.json({ trust, patients: patients.length });
});

// Scripts
app.get("/api/scripts", (req, res) => {
  try {
    const dir = SCRIPTS_DIR;
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && isValidFilename(f));
    const scripts = files.map(f => {
      try {
        const fp = path.join(dir, f);
        const content = JSON.parse(fs.readFileSync(fp, "utf-8"));
        return {
          filename: f,
          name: String(content.name || "").replace(/[<>]/g, "").slice(0, 200),
          description: String(content.description || "").replace(/[<>]/g, "").slice(0, 300),
          system: String(content.system || "").replace(/[<>]/g, ""),
          practitestId: content.practitestId || null,
          variables: Array.isArray(content.variables) ? content.variables.map(v => ({
            name: String(v.name || "").replace(/[<>]/g, ""),
            label: String(v.label || "").replace(/[<>]/g, ""),
            type: v.type === "password" ? "password" : "text",
            default: "",
            required: !!v.required
          })) : []
        };
      } catch { return null; }
    }).filter(Boolean);
    res.json(scripts);
  } catch { res.json([]); }
});

app.get("/api/scripts/:filename", (req, res) => {
  const { filename } = req.params;
  if (!isValidFilename(filename)) return res.status(400).json({ error: "Invalid filename" });
  try {
    const fp = path.join(SCRIPTS_DIR, filename);
    if (!fp.startsWith(SCRIPTS_DIR)) return res.status(400).json({ error: "Invalid path" });
    if (!fs.existsSync(fp)) return res.status(404).json({ error: "Script not found" });
    const content = JSON.parse(fs.readFileSync(fp, "utf-8"));
    // Sanitize output
    if (content.description) content.description = String(content.description).replace(/[<>]/g, "").slice(0, 500);
    if (content.name) content.name = String(content.name).replace(/[<>]/g, "").slice(0, 200);
    res.json(content);
  } catch { res.status(400).json({ error: "Invalid script file" }); }
});

// Run
app.post("/api/run", async (req, res) => {
  const { script, variables } = req.body;
  if (!script || !Array.isArray(script.steps) || script.steps.length > 200) {
    return res.status(400).json({ error: "Invalid script" });
  }
  try {
    const safeVars = {};
    if (variables && typeof variables === "object") {
      for (const [k, v] of Object.entries(variables)) {
        safeVars[String(k).replace(/[^a-zA-Z0-9_]/g, "")] = String(v || "");
      }
    }
    const run = createRun(script, safeVars);
    res.json({ runId: run.id });
    executeRun(run.id, (event, data) => sseSend(run.id, event, data)).catch(err => {
      console.error("Run error:", err);
      sseSend(run.id, "error", { message: "Execution failed" });
    });
  } catch (err) {
    handleError(err, res);
  }
});

// Runs
app.get("/api/runs", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    res.json(getAllRuns(limit));
  } catch { res.json([]); }
});

app.get("/api/runs/:runId", (req, res) => {
  if (!isValidRunId(req.params.runId)) return res.status(400).json({ error: "Invalid run ID" });
  const run = getRun(req.params.runId);
  if (!run) return res.status(404).json({ error: "Run not found" });
  res.json({
    id: run.id,
    status: run.status,
    script: { name: run.script?.name, description: run.script?.description, system: run.script?.system },
    variables: run.variables,
    steps: run.steps?.map(s => ({
      id: s.id, description: s.description, action: s.action,
      status: s.status, error: s.error, screenshot: s.screenshot,
      aiRecovered: s.aiRecovered, startedAt: s.startedAt, completedAt: s.completedAt
    })),
    startedAt: run.startedAt,
    completedAt: run.completedAt
  });
});

app.get("/api/runs/:runId/events", (req, res) => {
  if (!isValidRunId(req.params.runId)) return res.status(400).end();
  const runId = req.params.runId;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(`event: connected\ndata: {}\n\n`);
  if (!SSE_CLIENTS.has(runId)) SSE_CLIENTS.set(runId, new Set());
  SSE_CLIENTS.get(runId).add(res);
  req.on("close", () => {
    const clients = SSE_CLIENTS.get(runId);
    if (clients) { clients.delete(res); if (clients.size === 0) SSE_CLIENTS.delete(runId); }
  });
});

app.get("/api/runs/:runId/screenshots/:filename", (req, res) => {
  if (!isValidRunId(req.params.runId) || !isValidFilename(req.params.filename)) {
    return res.status(400).json({ error: "Invalid request" });
  }
  try {
    const fp = getScreenshotPath(req.params.runId, req.params.filename);
    if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: "Not found" });
    res.sendFile(fp);
  } catch { res.status(404).json({ error: "Not found" }); }
});

app.get("/api/runs/:runId/screenshots", (req, res) => {
  if (!isValidRunId(req.params.runId)) return res.status(400).json({ error: "Invalid run ID" });
  try { res.json(listScreenshots(req.params.runId)); }
  catch { res.json([]); }
});

app.post("/api/runs/:runId/cancel", (req, res) => {
  if (!isValidRunId(req.params.runId)) return res.status(400).json({ error: "Invalid run ID" });
  cancelRun(req.params.runId);
  res.json({ status: "cancelled" });
});

app.delete("/api/runs/:runId", (req, res) => {
  if (!isValidRunId(req.params.runId)) return res.status(400).json({ error: "Invalid run ID" });
  deleteRun(req.params.runId);
  res.json({ status: "deleted" });
});

app.get("/api/runs/:runId/report", async (req, res) => {
  if (!isValidRunId(req.params.runId)) return res.status(400).json({ error: "Invalid run ID" });
  try {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: "Run not found" });
    const reportPath = generateReport(run);
    res.sendFile(reportPath);
  } catch { res.status(500).json({ error: "Report generation failed" }); }
});

// PractiTest
app.post("/api/practitest/upload", async (req, res) => {
  const { runId, testCaseId } = req.body;
  if (!isValidRunId(runId)) return res.status(400).json({ error: "Invalid run ID" });
  const run = getRun(runId);
  if (!run) return res.status(404).json({ error: "Run not found" });
  try {
    const screenshots = (run.steps || [])
      .filter(s => s.screenshot)
      .map(s => ({ filename: s.screenshot, buffer: fs.readFileSync(getScreenshotPath(runId, s.screenshot)), stepId: s.id }));
    const result = await uploadEvidence(runId, testCaseId || "uat-run", screenshots, {
      status: run.status,
      passed: (run.steps || []).filter(s => s.status === "pass").length,
      failed: (run.steps || []).filter(s => s.status === "fail").length
    });
    res.json(result);
  } catch { res.status(500).json({ error: "Upload failed" }); }
});

app.get("/api/practitest/status", (req, res) => res.json({ configured: ptConfigured() }));

// CSV Import
app.post("/api/scripts/upload-csv", (req, res) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== "string" || csv.length > 5000000) return res.status(400).json({ error: "Invalid CSV" });
  try {
    const commonVars = [
      { name: "PATIENT_NHS", label: "Patient NHS Number", type: "text", default: "", required: false },
      { name: "PATIENT_NAME", label: "Patient Name", type: "text", default: "", required: false },
      { name: "USERNAME", label: "Username", type: "text", default: "", required: false },
      { name: "PASSWORD", label: "Password", type: "password", default: "", required: false },
      { name: "HEADLESS", label: "Run headless", type: "text", default: "true", required: false }
    ];
    const saved = convertAndSave(csv, { variables: commonVars });
    res.json({ imported: saved.length, scripts: saved.map(s => ({ filename: s.filename, steps: s.steps })) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/scripts/upload-csv-test", (req, res) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== "string" || csv.length > 5000000) return res.status(400).json({ error: "Invalid CSV" });
  try {
    const testCases = parsePractitestCSV(csv);
    const preview = testCases.slice(0, 5).map(tc => ({ id: tc.id, name: tc.name.slice(0, 100), system: tc.system, steps: tc.steps.length }));
    res.json({ total: testCases.length, preview });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Patients
app.get("/api/patients", (req, res) => {
  try {
    if (!fs.existsSync(PATIENTS_FILE)) return res.json([]);
    const data = JSON.parse(fs.readFileSync(PATIENTS_FILE, "utf-8"));
    const { system, gender, tag } = req.query;
    let filtered = Array.isArray(data) ? data : [];
    if (system) filtered = filtered.filter(p => p.systems?.some(s => s.toLowerCase().includes(system.toLowerCase())));
    if (gender) filtered = filtered.filter(p => p.gender?.toLowerCase() === gender.toLowerCase());
    if (tag) filtered = filtered.filter(p => p.tags?.includes(tag.toLowerCase()));
    res.json(filtered.map(p => ({
      id: p.id, nhsNumber: p.nhsNumber, surname: p.surname, forename: p.forename,
      title: p.title, dob: p.dob, gender: p.gender, age: p.age,
      postCode: p.postCode, tags: p.tags, systems: p.systems
    })));
  } catch { res.json([]); }
});

app.get("/api/patients/:id", (req, res) => {
  const { id } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).json({ error: "Invalid patient ID" });
  try {
    const data = JSON.parse(fs.readFileSync(PATIENTS_FILE, "utf-8"));
    const patient = Array.isArray(data) ? data.find(p => p.id?.toLowerCase() === id.toLowerCase()) : null;
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    res.json(patient);
  } catch { res.status(500).json({ error: "Failed to load patients" }); }
});

app.get("/api/patients/tags/list", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(PATIENTS_FILE, "utf-8"));
    const items = Array.isArray(data) ? data : [];
    const tags = [...new Set(items.flatMap(p => p.tags || []))].sort();
    const systems = [...new Set(items.flatMap(p => p.systems || []))].sort();
    res.json({ tags, systems });
  } catch { res.json({ tags: [], systems: [] }); }
});

// AI
app.get("/api/ai/status", (req, res) => {
  const enabled = !!(process.env.LM_HOST);
  const stats = getMemoryStats();
  res.json({
    enabled, lmHost: process.env.LM_HOST || "not configured",
    aiModel: process.env.AI_MODEL || "default", nodeId: NODE_ID,
    localCacheSteps: Object.keys(loadMemory()).length,
    centralMemory: stats
  });
});

app.post("/api/ai/clear-cache", (req, res) => {
  clearMemory();
  res.json({ status: "cache cleared" });
});

app.get("/api/ai/cache", (req, res) => {
  res.json({ local: loadMemory(), central: getMemoryStats() });
});

app.get("/api/ai/memory/export", (req, res) => res.json(exportMemory()));

app.post("/api/ai/memory/import", (req, res) => {
  const { memory } = req.body;
  if (!memory || typeof memory !== "object") return res.status(400).json({ error: "Invalid memory" });
  res.json(importMemory(memory));
});

app.get("/api/ai/memory/stats", (req, res) => res.json(getMemoryStats()));

// Recorder
app.post("/api/recorder/start", async (req, res) => {
  try { res.json(await startRecording(req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.post("/api/recorder/stop", async (req, res) => {
  try { res.json(await stopRecording()); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.post("/api/recorder/step", async (req, res) => {
  try { res.json(await recordStep(req.body?.description || "Manual step")); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.get("/api/recorder/status", (req, res) => res.json(getRecorderStatus()));
app.get("/api/recorder/recordings", (req, res) => res.json(getRecordings()));

// Agentic Engine
app.post("/api/agentic/run", async (req, res) => {
  try {
    const { script, variables, patientId } = req.body;
    if (!script || !script.steps) return res.status(400).json({ error: "script with steps required" });
    let patient = null;
    if (patientId && /^[a-zA-Z0-9_-]+$/.test(patientId)) {
      try {
        const data = JSON.parse(fs.readFileSync(PATIENTS_FILE, "utf-8"));
        patient = (Array.isArray(data) ? data : []).find(p => p.id?.toLowerCase() === patientId.toLowerCase()) || null;
      } catch {}
    }
    const result = await runTestCaseWithAgent({ script, variables, patient, callbacks: {} });
    res.json({ status: result.passed === result.total ? "passed" : "completed", total: result.total, passed: result.passed, failed: result.failed, screenshots: result.screenshots });
  } catch (err) { handleError(err, res); }
});

app.post("/api/agentic/winpath", async (req, res) => {
  try { res.json(await runWinpathWorkflow(req.body)); }
  catch (err) { handleError(err, res); }
});

app.post("/api/agentic/ice", async (req, res) => {
  try { res.json(await runSurreyICEWorkflow(req.body)); }
  catch (err) { handleError(err, res); }
});

app.get("/api/agentic/status", (req, res) => {
  res.json({
    enabled: !!(process.env.LM_HOST),
    backend: process.env.LM_HOST || "none",
    model: process.env.AI_MODEL || "default",
    agents: getAgentRegistry()
  });
});

// Agent registry
app.get("/api/agents", (req, res) => res.json(getAgentRegistry()));

app.post("/api/agents/adt-ice/run", async (req, res) => {
  try {
    const result = await runADTICETest(req.body);
    res.json({ status: result.passed === result.total ? "passed" : "completed", total: result.total, passed: result.passed, failed: result.failed, screenshots: result.screenshots });
  } catch (err) { handleError(err, res); }
});

app.post("/api/agents/winpath/run", async (req, res) => {
  try {
    const result = await runWinpathAgent(req.body);
    res.json({ status: result.passed === result.total ? "passed" : "completed", total: result.total, passed: result.passed, failed: result.failed, screenshots: result.screenshots });
  } catch (err) { handleError(err, res); }
});

app.post("/api/agents/ice/run", async (req, res) => {
  try {
    const result = await runICEAgency(req.body);
    res.json({ status: result.passed === result.total ? "passed" : "completed", total: result.total, passed: result.passed, failed: result.failed, screenshots: result.screenshots });
  } catch (err) { handleError(err, res); }
});

app.post("/api/agents/custom/run", async (req, res) => {
  try {
    const result = await runCustomScriptAgent(req.body);
    res.json({ status: result.passed === result.total ? "passed" : "completed", total: result.total, passed: result.passed, failed: result.failed, screenshots: result.screenshots });
  } catch (err) { handleError(err, res); }
});

app.post("/api/agents/bloodtrack/run", async (req, res) => {
  try {
    const result = await runBloodTrackAgent(req.body);
    res.json({ status: result.passed === result.total ? "passed" : "completed", total: result.total, passed: result.passed, failed: result.failed, screenshots: result.screenshots });
  } catch (err) { handleError(err, res); }
});

app.post("/api/agents/cellavision/run", async (req, res) => {
  try {
    const result = await runCellavisionAgent(req.body);
    res.json({ status: result.passed === result.total ? "passed" : "completed", total: result.total, passed: result.passed, failed: result.failed, screenshots: result.screenshots });
  } catch (err) { handleError(err, res); }
});

app.post("/api/agents/immulink/run", async (req, res) => {
  try {
    const result = await runImmulinkAgent(req.body);
    res.json({ status: result.passed === result.total ? "passed" : "completed", total: result.total, passed: result.passed, failed: result.failed, screenshots: result.screenshots });
  } catch (err) { handleError(err, res); }
});

app.post("/api/agents/wes/run", async (req, res) => {
  try {
    const result = await runWESAgent(req.body);
    res.json({ status: result.passed === result.total ? "passed" : "completed", total: result.total, passed: result.passed, failed: result.failed, screenshots: result.screenshots });
  } catch (err) { handleError(err, res); }
});

app.post("/api/agents/cyres/run", async (req, res) => {
  try {
    const result = await runCyresAgent(req.body);
    res.json({ status: result.passed === result.total ? "passed" : "completed", total: result.total, passed: result.passed, failed: result.failed, screenshots: result.screenshots });
  } catch (err) { handleError(err, res); }
});

// --- FHIR Test Data Generator ---

app.post("/api/fhir/patient", (req, res) => res.json(generatePatient(req.body)));

app.post("/api/fhir/observation", (req, res) => {
  const { patientId, ...overrides } = req.body;
  if (!patientId) return res.status(400).json({ error: "patientId required" });
  res.json(generateObservation(patientId, overrides));
});

app.post("/api/fhir/bundle", (req, res) => {
  const { count, ...overrides } = req.body;
  const n = Math.min(count || 1, 50);
  const bundles = Array.from({ length: n }, () => generateFullPatientBundle(overrides));
  res.json({ generated: n, bundles, bundle: n === 1 ? bundles[0] : undefined });
});

app.get("/api/fhir/patients", (req, res) => {
  const n = Math.min(parseInt(req.query.count) || 10, 100);
  const patients = Array.from({ length: n }, () => generatePatient(req.query));
  res.json({ generated: n, patients });
});

app.get("/api/fhir/codes", (req, res) => {
  res.json({
    observations: [
      { code: "718-7", display: "Haemoglobin", unit: "g/L" },
      { code: "787-2", display: "MCV", unit: "fL" },
      { code: "6690-2", display: "White blood cell count", unit: "x10^9/L" },
      { code: "777-3", display: "Platelet count", unit: "x10^9/L" },
      { code: "6299-2", display: "Urea", unit: "mmol/L" },
      { code: "38483-4", display: "Creatinine", unit: "umol/L" },
      { code: "33762-6", display: "Sodium", unit: "mmol/L" },
      { code: "6298-4", display: "Potassium", unit: "mmol/L" },
      { code: "1963-8", display: "Bilirubin", unit: "umol/L" },
      { code: "1742-6", display: "ALT", unit: "U/L" }
    ]
  });
});

// --- Audit Log ---

app.get("/api/audit", (req, res) => {
  const { date, limit, offset, severity, action, user } = req.query;
  res.json(getAuditLog({ date, limit: parseInt(limit) || 100, offset: parseInt(offset) || 0, severity, action, user }));
});

app.get("/api/audit/summary", (req, res) => {
  const days = parseInt(req.query.days) || 7;
  res.json(getAuditSummary(days));
});

// --- Grafana Dashboard ---

app.get("/api/grafana/dashboard", (req, res) => {
  const fp = path.join(PUBLIC_DIR, "grafana-dashboard.json");
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "Dashboard definition not found" });
  res.sendFile(fp);
});

// --- Observability & Analytics ---

app.get("/api/insights", (req, res) => {
  const runs = getAllRuns(1000);
  const totalRuns = runs.length;
  const totalPassed = runs.reduce((s, r) => s + (r.passed || 0), 0);
  const totalFailed = runs.reduce((s, r) => s + (r.failed || 0), 0);
  const totalSteps = totalPassed + totalFailed;
  const passRate = totalSteps > 0 ? Math.round((totalPassed / totalSteps) * 100) : 0;

  // Group by system
  const bySystem = {};
  for (const r of runs) {
    const sys = r.system || "Unknown";
    if (!bySystem[sys]) bySystem[sys] = { runs: 0, passed: 0, failed: 0, screenshots: 0 };
    bySystem[sys].runs++;
    bySystem[sys].passed += r.passed || 0;
    bySystem[sys].failed += r.failed || 0;
  }

  res.json({
    summary: {
      totalRuns, totalPassed, totalFailed, totalSteps, passRate: `${passRate}%`
    },
    bySystem,
    ai: getMemoryStats(),
    recentRuns: runs.slice(0, 5).map(r => ({
      id: r.id, script: r.scriptName, system: r.system,
      status: r.status, passed: r.passed, failed: r.failed,
      date: r.startedAt
    }))
  });
});

// --- Prometheus Metrics ---

const METRICS = { runsStarted: 0, runsCompleted: 0, runsFailed: 0, stepsPassed: 0, stepsFailed: 0, agentsRun: 0, screenshotsCaptured: 0, aiMappingsUsed: 0, upSince: Date.now() };

app.get("/api/metrics", (req, res) => {
  const runs = getAllRuns(10000);
  METRICS.runsStarted = runs.length;
  METRICS.runsCompleted = runs.filter(r => r.status === "complete" || r.status === "passed").length;
  METRICS.runsFailed = runs.filter(r => r.status === "failed" || r.status === "error").length;
  METRICS.stepsPassed = runs.reduce((s, r) => s + (r.passed || 0), 0);
  METRICS.stepsFailed = runs.reduce((s, r) => s + (r.failed || 0), 0);
  METRICS.screenshotsCaptured = METRICS.stepsPassed + METRICS.stepsFailed;

  res.json({
    version: "3.1.0",
    upSince: new Date(METRICS.upSince).toISOString(),
    uptimeSeconds: Math.round((Date.now() - METRICS.upSince) / 1000),
    ...METRICS,
    passRate: METRICS.stepsPassed + METRICS.stepsFailed > 0
      ? Math.round((METRICS.stepsPassed / (METRICS.stepsPassed + METRICS.stepsFailed)) * 100)
      : 100,
    memory: process.memoryUsage(),
    agentCount: getAgentRegistry().length,
    nodeId: NODE_ID
  });
});

// --- Automated Scheduler ---

app.get("/api/schedule", (req, res) => res.json(getJobs()));

app.post("/api/schedule", (req, res) => {
  const { cron, script, agentId, trustId, enabled, notify } = req.body;
  if (!cron && !script) return res.status(400).json({ error: "cron expression and script required" });
  try {
    const job = addJob({ cron, script, agentId, trustId, enabled, notify });
    res.json({ status: "scheduled", job });
  } catch (err) { handleError(err, res); }
});

app.put("/api/schedule/:jobId", (req, res) => {
  const job = updateJob(req.params.jobId, req.body);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

app.delete("/api/schedule/:jobId", (req, res) => {
  removeJob(req.params.jobId);
  res.json({ status: "deleted" });
});

app.post("/api/schedule/:jobId/trigger", async (req, res) => {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const result = await triggerJob(job, async ({ agentId, script, trustId, callbacks }) => {
    const agents = { "adt-ice": runADTICETest, "winpath": runWinpathAgent, "ice": runICEAgency, "bloodtrack": runBloodTrackAgent, "cellavision": runCellavisionAgent, "immulink": runImmulinkAgent, "wes": runWESAgent, "cyres": runCyresAgent, "custom-script": runCustomScriptAgent };
    const runner = agents[agentId || "custom-script"];
    if (!runner) throw new Error(`Unknown agent: ${agentId}`);
    return await runner({ script, trustId, callbacks });
  });
  res.json({ triggered: true, result });
});

app.get("/api/schedule/running", (req, res) => res.json(getRunningJobs()));

app.get("/api/schedule/:jobId/history", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(getJobHistory(req.params.jobId, limit));
});

// --- Notifications ---

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL || "";
const TEAMS_WEBHOOK = process.env.TEAMS_WEBHOOK_URL || "";

app.post("/api/notify/test", async (req, res) => {
  const { channel, message, runId, status, passed, failed } = req.body;
  const payload = { text: message || `UAT Run ${runId || ""}: ${status || "unknown"} (Passed: ${passed || 0}, Failed: ${failed || 0})` };
  const urls = [];
  if (SLACK_WEBHOOK && (!channel || channel === "slack")) urls.push(SLACK_WEBHOOK);
  if (TEAMS_WEBHOOK && (!channel || channel === "teams")) urls.push(TEAMS_WEBHOOK);
  if (!urls.length) return res.json({ sent: false, reason: "no webhooks configured" });
  const results = await Promise.allSettled(urls.map(url => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })));
  res.json({ sent: results.filter(r => r.status === "fulfilled").length, total: urls.length });
});

app.get("/api/notify/status", (req, res) => res.json({ slack: !!SLACK_WEBHOOK, teams: !!TEAMS_WEBHOOK, configuredSlack: SLACK_WEBHOOK ? SLACK_WEBHOOK.slice(0, 30) + "..." : "none", configuredTeams: !!TEAMS_WEBHOOK }));

// --- Fine-Tuning Pipeline ---

app.get("/api/fine-tune/stats", (req, res) => res.json(getTrainingStats()));
app.get("/api/fine-tune/files", (req, res) => res.json(getTrainingFiles()));
app.post("/api/fine-tune/collect", (req, res) => {
  const { steps } = req.body;
  if (!steps?.length) return res.status(400).json({ error: "steps array required" });
  const examples = collectTrainingData(steps);
  const result = saveTrainingBatch(examples, req.body.system || "general");
  res.json(result);
});
app.post("/api/fine-tune/submit", async (req, res) => {
  try { res.json(await submitFineTuning(req.body)); }
  catch (err) { handleError(err, res); }
});
app.delete("/api/fine-tune/clear", (req, res) => res.json(clearTrainingData(req.query.system)));

// --- Concurrent Execution Pool ---

app.get("/api/pool/status", (req, res) => res.json(getPoolStatus()));
app.get("/api/pool/results", (req, res) => res.json(getPoolResults(req.query.jobId, parseInt(req.query.limit) || 100)));
app.post("/api/pool/run", async (req, res) => {
  const { agentId, ...options } = req.body;
  const agents = { "adt-ice": runADTICETest, "winpath": runWinpathAgent, "ice": runICEAgency, "bloodtrack": runBloodTrackAgent, "cellavision": runCellavisionAgent, "immulink": runImmulinkAgent, "wes": runWESAgent, "cyres": runCyresAgent, "custom-script": runCustomScriptAgent };
  const runner = agents[agentId || "custom-script"];
  if (!runner) return res.status(400).json({ error: `Unknown agent: ${agentId}` });
  try {
    const startTime = Date.now();
    const result = await runInPool(runner, options);
    res.json(formatAgentResponse(result, startTime));
  } catch (err) { handleError(err, res); }
});
app.delete("/api/pool/cancel/:jobId", (req, res) => res.json({ cancelled: cancelQueuedJob(req.params.jobId) }));
app.delete("/api/pool/clear", (req, res) => { clearPoolResults(); res.json({ status: "cleared" }); });

// --- Natural Language Authoring ---

app.post("/api/nl/generate", async (req, res) => {
  const { text, systems } = req.body;
  if (!text) return res.status(400).json({ error: "text (natural language) required" });
  try { res.json(await generateScript(text, { systems })); }
  catch (err) { handleError(err, res); }
});
app.post("/api/nl/step", async (req, res) => {
  const { description, dom } = req.body;
  if (!description) return res.status(400).json({ error: "description required" });
  try { res.json(await generateStep(description, dom)); }
  catch (err) { handleError(err, res); }
});
app.post("/api/nl/explain", async (req, res) => {
  const { script } = req.body;
  if (!script) return res.status(400).json({ error: "script object required" });
  try { res.json(await explainScript(script)); }
  catch (err) { handleError(err, res); }
});
app.post("/api/nl/suggest", async (req, res) => {
  const { system } = req.body;
  try { res.json(await suggestTests(system)); }
  catch (err) { handleError(err, res); }
});

// --- Auto-Remediation ---

app.get("/api/remediate/log", (req, res) => res.json(getRemediationLog(parseInt(req.query.limit) || 50)));
app.get("/api/remediate/stats", (req, res) => res.json(getRemediationStats()));

// --- Performance Tracking ---

app.get("/api/perf/baseline", (req, res) => res.json(getBaseline(req.query.step)));
app.get("/api/perf/regressions", (req, res) => res.json(getRegressionReport(parseFloat(req.query.threshold) || 2.0)));
app.get("/api/perf/summary", (req, res) => res.json(getPerfSummary()));
app.post("/api/perf/record", (req, res) => {
  const { runId, steps } = req.body;
  if (!runId || !steps?.length) return res.status(400).json({ error: "runId and steps required" });
  res.json(recordTimings(runId, steps));
});
app.delete("/api/perf/clear", (req, res) => { clearBaseline(); res.json({ status: "cleared" }); });

// --- GitHub Checks ---

app.get("/api/github/config", (req, res) => res.json(getGitHubConfig()));
app.post("/api/github/status", async (req, res) => {
  const { sha, ...result } = req.body;
  if (!sha) return res.status(400).json({ error: "sha required" });
  try { res.json(await postCommitStatus(sha, result)); }
  catch (err) { handleError(err, res); }
});
app.post("/api/github/pr-comment", async (req, res) => {
  const { prNumber, ...result } = req.body;
  if (!prNumber) return res.status(400).json({ error: "prNumber required" });
  try { res.json(await postPRComment(prNumber, result)); }
  catch (err) { handleError(err, res); }
});

// --- Mobile Profiles ---

app.get("/api/mobile/profiles", (req, res) => res.json(getMobileProfiles()));
app.get("/api/mobile/profiles/:id", (req, res) => {
  const profile = getProfileConfig(req.params.id);
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  res.json(profile);
});

// --- FHIR Server ---

app.use("/api/fhir/r4", createFHIRRouter());

// --- Load Testing ---

app.get("/api/load-test/config", (req, res) => res.json(getLoadTestConfigs()));
app.post("/api/load-test/generate-k6", (req, res) => {
  const { script, ...options } = req.body;
  if (!script) return res.status(400).json({ error: "script required" });
  res.type("text/javascript").send(generateK6Script(script, options));
});
app.post("/api/load-test/generate-artillery", (req, res) => {
  const { script, ...options } = req.body;
  if (!script) return res.status(400).json({ error: "script required" });
  res.json(JSON.parse(generateArtilleryScript(script, options)));
});

// --- API-First Agent Mode ---

app.get("/api/agent-api/endpoints", (req, res) => res.json(getAgentEndpoints()));

// --- OAuth M2M ---

app.post("/api/oauth/token", tokenEndpoint);
app.post("/api/oauth/introspect", introspectToken);
app.get("/api/oauth/status", (req, res) => res.json(getM2MStatus()));

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Not found" });
  } else {
    res.status(404).sendFile(path.join(PUBLIC_DIR, "index.html"));
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: IS_PROD ? "Internal server error" : err.message
  });
});

app.listen(PORT, () => {
  registerNode(NODE_ID);
  registerNode(NODE_ID);

  // Start the cron scheduler
  const schedInterval = startScheduler(async ({ agentId, script, trustId, callbacks }) => {
    const agents = { "adt-ice": runADTICETest, "winpath": runWinpathAgent, "ice": runICEAgency, "bloodtrack": runBloodTrackAgent, "cellavision": runCellavisionAgent, "immulink": runImmulinkAgent, "wes": runWESAgent, "cyres": runCyresAgent, "custom-script": runCustomScriptAgent };
    const runner = agents[agentId || "custom-script"];
    if (!runner) throw new Error(`Unknown agent: ${agentId}`);
    return await runner({ script, trustId, callbacks });
  });

  console.log(`UAT Tester v3.1.0 running on port ${PORT}`);
  console.log(`Security: Helmet+RateLimit+CORS enabled | Production mode: ${IS_PROD}`);
  console.log(`Browser: ${process.env.BROWSER || "chromium"} | Headless: ${process.env.HEADLESS !== "false"}`);
  console.log(`AI: ${process.env.LM_HOST ? "enabled" : "disabled"}`);
  console.log(`Auth: ${process.env.LDAP_URL ? "LDAP" : "local"}${process.env.SAML_ENTRYPOINT ? "+SAML" : ""} | Trusts: ${Object.keys(getTrusts()).length}`);
  console.log(`Node: ${NODE_ID} | Memory: ${getMemoryStats().totalMappings} mappings`);
  console.log(`Scheduler: ${schedInterval ? "running" : "off"} | Audit: ${process.env.AUDIT_CONSOLE ? "console" : "file"}${process.env.SYSLOG_HOST ? "+syslog" : ""}`);
  console.log(`Practitest: ${ptConfigured() ? "configured" : "not configured"}`);
});
