/**
 * Automated Cron Scheduler
 * Runs scheduled test jobs at configured intervals with history tracking.
 *
 * Job format:
 *   { id, cron: "0 2 * * *", agentId: "winpath", script: "FBC.json", enabled, trustId }
 *
 * Cron expression: minute hour dayOfMonth month dayOfWeek
 */

import fs from "fs";
import path from "path";

const SCHEDULE_FILE = process.env.SCHEDULE_FILE || path.resolve(process.cwd(), "config", "scheduled-jobs.json");
const HISTORY_FILE = process.env.SCHEDULE_HISTORY_FILE || path.resolve(process.cwd(), "config", "schedule-history.json");

let jobs = [];
let history = [];
let tickInterval = null;
let runningJobs = new Map();

function loadJobs() {
  if (!fs.existsSync(SCHEDULE_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf-8")); }
  catch { return []; }
}

function saveJobs() {
  const dir = path.dirname(SCHEDULE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(jobs, null, 2));
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8")); }
  catch { return []; }
}

function saveHistory() {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-1000), null, 2));
}

function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return { minute: parts[0], hour: parts[1], dayOfMonth: parts[2], month: parts[3], dayOfWeek: parts[4] };
}

function cronMatches(cronExpr, date) {
  const c = parseCron(cronExpr);
  if (!c) return false;
  const m = date.getMinutes(), h = date.getHours(), d = date.getDate(), mo = date.getMonth() + 1, dw = date.getDay();
  return matchField(c.minute, m) && matchField(c.hour, h) && matchField(c.dayOfMonth, d) && matchField(c.month, mo) && matchField(c.dayOfWeek, dw);
}

function matchField(pattern, value) {
  if (pattern === "*") return true;
  for (const part of pattern.split(",")) {
    if (part.includes("/")) {
      const [base, step] = part.split("/");
      const start = base === "*" ? 0 : parseInt(base);
      if ((value - start) % parseInt(step) === 0) return true;
    } else if (part.includes("-")) {
      const [lo, hi] = part.split("-").map(Number);
      if (value >= lo && value <= hi) return true;
    } else if (parseInt(part) === value) return true;
  }
  return false;
}

function getCallbacks(jobId) {
  return {
    onLog: (level, msg) => addHistory(jobId, "log", { level, msg }),
    onStep: (step) => addHistory(jobId, "step", step),
    onScreenshot: (shot) => addHistory(jobId, "screenshot", { file: shot }),
    onComplete: (result) => { runningJobs.delete(jobId); addHistory(jobId, "complete", result); }
  };
}

function addHistory(jobId, event, data) {
  history.push({ jobId, event, data, timestamp: new Date().toISOString() });
  if (history.length > 1000) history = history.slice(-1000);
  saveHistory();
}

export async function triggerJob(job, runFn) {
  if (runningJobs.has(job.id)) return { error: "Job already running", jobId: job.id };
  runningJobs.set(job.id, { startedAt: new Date().toISOString(), status: "running" });
  addHistory(job.id, "start", {});
  try {
    const result = await runFn({ agentId: job.agentId, script: job.script, trustId: job.trustId, callbacks: getCallbacks(job.id) });
    runningJobs.set(job.id, { ...runningJobs.get(job.id), status: "complete", result });
    addHistory(job.id, "complete", result);
    return result;
  } catch (err) {
    runningJobs.set(job.id, { ...runningJobs.get(job.id), status: "failed", error: err.message });
    addHistory(job.id, "error", { message: err.message });
    return { error: err.message };
  }
}

export function startScheduler(runFn) {
  jobs = loadJobs();
  history = loadHistory();

  tickInterval = setInterval(() => {
    const now = new Date();
    for (const job of jobs) {
      if (!job.enabled) continue;
      if (!job.lastRun || (now - new Date(job.lastRun)) > 60000) {
        if (cronMatches(job.cron, now)) {
          job.lastRun = now.toISOString();
          saveJobs();
          triggerJob(job, runFn);
        }
      }
    }
  }, 30000);

  return tickInterval;
}

export function stopScheduler() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

export function getJobs() { return jobs; }

export function addJob(config) {
  const job = {
    id: config.id || `job_${Date.now().toString(36)}`,
    cron: config.cron || "0 2 * * *",
    agentId: config.agentId || "custom-script",
    script: config.script || "",
    trustId: config.trustId || "default",
    enabled: config.enabled !== false,
    createdAt: new Date().toISOString(),
    lastRun: null,
    notify: config.notify || false
  };
  jobs.push(job);
  saveJobs();
  return job;
}

export function removeJob(jobId) {
  jobs = jobs.filter(j => j.id !== jobId);
  saveJobs();
}

export function updateJob(jobId, updates) {
  const job = jobs.find(j => j.id === jobId);
  if (!job) return null;
  Object.assign(job, updates);
  saveJobs();
  return job;
}

export function getJobHistory(jobId, limit = 50) {
  return history.filter(h => h.jobId === jobId).slice(-limit);
}

export function getRunningJobs() {
  return Array.from(runningJobs.entries()).map(([id, state]) => ({ id, ...state }));
}
