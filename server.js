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
import { getAgentRegistry, runADTICETest, runWinpathAgent, runICEAgency, runCustomScriptAgent } from "./lib/agents/index.js";

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
  console.log(`UAT Tester v2.0 running on port ${PORT}`);
  console.log(`Security: Helmet+RateLimit+CORS enabled | Production mode: ${IS_PROD}`);
  console.log(`Browser: ${process.env.BROWSER || "chromium"} | Headless: ${process.env.HEADLESS !== "false"}`);
  console.log(`AI: ${process.env.LM_HOST ? "enabled" : "disabled"}`);
  console.log(`Node: ${NODE_ID} | Memory: ${getMemoryStats().totalMappings} mappings`);
  console.log(`Practitest: ${ptConfigured() ? "configured" : "not configured"}`);
});
