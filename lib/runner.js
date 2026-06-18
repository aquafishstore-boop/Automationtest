import { chromium, firefox, webkit } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initRunDirs, captureScreenshot, listScreenshots } from "./screenshot-manager.js";
import { executeStepAI } from "./ai-step-engine.js";
import { recordSuccess, recordFailure } from "./central-memory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = process.env.RUNS_DIR || path.join(__dirname, "..", "runs");

const RUNS = new Map(); // in-memory cache

// --- Persistent run storage ---

function runsDbPath() {
  return path.join(RUNS_DIR, "_runs.json");
}

function loadPersistedRuns() {
  try {
    const p = runsDbPath();
    if (!fs.existsSync(p)) return;
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    for (const [k, v] of Object.entries(data)) {
      RUNS.set(k, v);
    }
  } catch {}
}

function persistRun(run) {
  try {
    const p = runsDbPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const all = {};
    for (const [k, v] of RUNS) {
      all[k] = v;
    }
    fs.writeFileSync(p, JSON.stringify(all, null, 2), "utf-8");
  } catch {}
}

loadPersistedRuns();

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function getRun(runId) {
  return RUNS.get(runId) || null;
}

export function getAllRuns(limit = 20) {
  return Array.from(RUNS.values())
    .sort((a, b) => (b.startedAt || b.id).localeCompare(a.startedAt || a.id))
    .slice(0, limit)
    .map(r => ({
      id: r.id,
      status: r.status,
      scriptName: r.script?.name || "Unknown",
      system: r.script?.system || "",
      steps: r.steps?.length || 0,
      passed: r.steps?.filter(s => s.status === "pass").length || 0,
      failed: r.steps?.filter(s => s.status === "fail").length || 0,
      startedAt: r.startedAt,
      completedAt: r.completedAt
    }));
}

export function deleteRun(runId) {
  RUNS.delete(runId);
  persistRun(null);
}

let _currentSystem = "";
let _currentTestName = "";

export function createRun(script, variables) {
  const runId = generateId();
  const { shotDir, reportDir } = initRunDirs(runId);
  _currentSystem = script.system || "UAT";
  _currentTestName = script.name || "Test";
  const run = {
    id: runId,
    script,
    variables,
    status: "pending",
    steps: script.steps.map(s => ({
      ...s,
      status: "pending",
      screenshot: null,
      error: null,
      startedAt: null,
      completedAt: null
    })),
    startedAt: null,
    completedAt: null,
    shotDir,
    reportDir
  };
  RUNS.set(runId, run);
  persistRun(run);
  return run;
}

// --- Variable interpolation ---

function interpolate(text, variables) {
  if (!text || typeof text !== "string") return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
  });
}

function resolve(obj, variables) {
  if (typeof obj === "string") return interpolate(obj, variables);
  if (Array.isArray(obj)) return obj.map(item => resolve(item, variables));
  if (obj && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolve(v, variables);
    }
    return result;
  }
  return obj;
}

// --- Step execution ---

async function runStep(page, step, variables, runId, emit) {
  const s = resolve(step, variables);
  const timeout = s.timeout || 10000;

  emit("step-start", { stepId: step.id, description: s.description });

  const doScreenshot = s.takeScreenshot !== false;

  const extra = { system: _currentSystem, testName: _currentTestName };

  async function snap(label) {
    if (!doScreenshot) return null;
    const description = label === "error"
      ? `ERROR: ${s.description}`
      : s.description;
    const shot = await captureScreenshot(page, runId, `${step.id}`, description, extra);
    emit("screenshot", { ...shot, stepId: step.id });
    return shot;
  }

  try {
    // Auto-detect elements when no selector given — use AI
    if (!s.selector && ["click", "type", "select"].includes(s.action) && s.description) {
      emit("log", { message: `No selector for "${s.description}" — trying AI auto-detection...`, level: "info" });
      const aiResult = await executeStepAI(page, step);
      if (aiResult && aiResult.confidence > 0.5 && aiResult.selector) {
        s.selector = aiResult.selector;
        if (aiResult.value) s.value = aiResult.value;
        emit("log", { message: `AI found: "${aiResult.selector}" (${Math.round(aiResult.confidence*100)}%)`, level: "info" });
        recordSuccess(`${step.id}_${step.description}`, aiResult);
      }
    }

    switch (s.action) {
      case "navigate":
        if (s.url) {
          await page.goto(s.url, { waitUntil: "networkidle", timeout: s.timeout || 30000 });
          emit("log", { message: `Navigated to ${s.url}`, level: "info" });
        } else {
          emit("log", { message: "No URL provided for navigate — skipping", level: "warn" });
        }
        break;

      case "click":
        if (s.selector) {
          await page.waitForSelector(s.selector, { timeout }).catch(() => {});
          await page.click(s.selector);
        } else {
          emit("log", { message: `Click skipped — no target found`, level: "warn" });
        }
        break;

      case "type":
        if (s.selector) {
          await page.waitForSelector(s.selector, { timeout }).catch(() => {});
          await page.fill(s.selector, "");
          if (s.value) await page.type(s.selector, String(s.value), { delay: 20 });
        } else {
          emit("log", { message: `Type skipped — no target found`, level: "warn" });
        }
        break;

      case "select":
        if (s.selector) {
          await page.waitForSelector(s.selector, { timeout }).catch(() => {});
          await page.selectOption(s.selector, s.value);
        }
        break;

      case "wait":
        if (s.selector) {
          await page.waitForSelector(s.selector, { timeout: s.timeout || 15000 }).catch(() => {});
        } else if (s.timeout) {
          await page.waitForTimeout(s.timeout);
        } else {
          await page.waitForTimeout(2000);
        }
        break;

      case "delay":
        await page.waitForTimeout(s.timeout || 1000);
        break;

      case "assertText":
        await page.waitForSelector(s.selector, { timeout });
        const text = await page.textContent(s.selector);
        if (s.assertText && (!text || !text.includes(s.assertText))) {
          throw new Error(`Expected "${s.assertText}" but got "${(text || "").trim()}"`);
        }
        break;

      case "assertVisible":
        const visible = await page.isVisible(s.selector);
        if (!visible) throw new Error(`Element "${s.selector}" is not visible`);
        break;

      case "screenshot":
        const ss = await captureScreenshot(page, runId, `${step.id}`, s.description);
        emit("screenshot", { ...ss, stepId: step.id });
        return { status: "pass", screenshot: ss.filename };

      case "executeScript":
        if (s.code) await page.evaluate(s.code);
        break;

      default:
        emit("log", { message: `Unknown action: "${s.action}"`, level: "warn" });
    }

    const shot = await snap("done");
    return { status: "pass", screenshot: shot?.filename || null };
  } catch (err) {
    emit("log", { message: `Step ${step.id} failed: ${err.message}. Trying AI fallback...`, level: "warn" });
    
    // AI fallback: try to map the step using LLM
    emit("log", { message: `Triggering AI fallback for step "${step.description}"...`, level: "info" });
    try {
      const aiResult = await executeStepAI(page, step);
      if (aiResult && aiResult.confidence > 0.5) {
        emit("log", { message: `AI recovered step "${step.description}" -> ${aiResult.action} on "${aiResult.selector}" (${Math.round(aiResult.confidence*100)}%)`, level: "info" });
        recordSuccess(`${step.id}_${step.description}`, aiResult);
        const shot = await snap("done");
        return { status: "pass", screenshot: shot?.filename || null, aiRecovered: true };
      } else {
        emit("log", { message: `AI could not map step "${step.description}" ${aiResult ? "(low confidence: "+aiResult.confidence+")" : "(no result)"}`, level: "warn" });
      }
    } catch (aiErr) {
      emit("log", { message: `AI fallback error: ${aiErr.message}`, level: "error" });
      console.error("AI fallback error:", aiErr);
      recordFailure(`${step.id}_${step.description}`);
    }
    
    const shot = await snap("error");
    emit("log", { message: `Step ${step.id} failed: ${err.message}`, level: "error" });
    return { status: "fail", error: err.message, screenshot: shot?.filename || null };
  }
}

// --- Browser factory ---

function browserType(name) {
  switch ((name || "chromium").toLowerCase()) {
    case "edge":
    case "msedge":
      return chromium; // Playwright uses chromium channel for Edge
    case "firefox":
      return firefox;
    case "webkit":
      return webkit;
    default:
      return chromium;
  }
}

function browserChannel(name) {
  switch ((name || "chromium").toLowerCase()) {
    case "edge":
    case "msedge":
      return "msedge";
    default:
      return undefined;
  }
}

// --- Main execution ---

export async function executeRun(runId, emit) {
  const run = RUNS.get(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  run.status = "running";
  run.startedAt = new Date().toISOString();

  const { script, variables } = run;
  const headless = variables.HEADLESS !== "false";
  const selectedBrowser = variables.BROWSER || process.env.BROWSER || "chromium";
  const channel = browserChannel(selectedBrowser);

  const launchOptions = {
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
  };
  if (channel) launchOptions.channel = channel;

  const browser = await browserType(selectedBrowser).launch(launchOptions);

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();

    for (const step of run.steps) {
      if (run.status === "cancelled") {
        step.status = "cancelled";
        emit("step-complete", { stepId: step.id, status: "cancelled" });
        continue;
      }

      step.status = "running";
      step.startedAt = new Date().toISOString();

      const result = await runStep(page, step, variables, runId, emit);

      step.status = result.status;
      step.error = result.error || null;
      step.screenshot = result.screenshot;
      step.completedAt = new Date().toISOString();

      if (result.screenshot) {
        emit("log", { message: `📸 Screenshot saved: ${result.screenshot}`, level: "info" });
      }

      emit("step-complete", {
        stepId: step.id,
        status: result.status,
        error: result.error || null,
        screenshot: result.screenshot
      });
    }

    await context.close();
  } catch (err) {
    emit("error", { message: err.message });
    emit("log", { message: `Fatal error: ${err.message}`, level: "error" });
  } finally {
    await browser.close();
    run.status = run.status === "cancelled" ? "cancelled" : "completed";
    run.completedAt = new Date().toISOString();
    persistRun(run);

    const passed = run.steps.filter(s => s.status === "pass").length;
    const failed = run.steps.filter(s => s.status === "fail").length;

    emit("complete", {
      status: run.status,
      totalSteps: run.steps.length,
      passed,
      failed,
      screenshots: run.steps.filter(s => s.screenshot).length
    });
  }

  return run;
}

export function cancelRun(runId) {
  const run = RUNS.get(runId);
  if (run && run.status === "running") {
    run.status = "cancelled";
  }
}
