/**
 * Concurrent Test Execution Pool
 * Runs multiple agents in parallel with resource-aware scheduling.
 *
 * Config:
 *   MAX_CONCURRENT — max parallel browsers (default: 2)
 *   POOL_TIMEOUT — max time a job can run (default: 300000)
 */

import { chromium } from "playwright";

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT) || 2;
const POOL_TIMEOUT = parseInt(process.env.POOL_TIMEOUT) || 300000;

let activeJobs = 0;
const queue = [];
const results = [];

function getCallbacks(jobId) {
  return {
    onLog: (level, msg) => addResult(jobId, "log", { level, msg }),
    onStep: (step) => addResult(jobId, "step", step),
    onScreenshot: (shot) => addResult(jobId, "screenshot", { file: shot })
  };
}

function addResult(jobId, event, data) {
  results.push({ jobId, event, data, timestamp: new Date().toISOString() });
  if (results.length > 10000) results.splice(0, results.length - 10000);
}

export function getPoolStatus() {
  return {
    maxConcurrent: MAX_CONCURRENT,
    activeJobs,
    queuedJobs: queue.length,
    totalCompleted: results.filter(r => r.event === "complete").length,
    poolTimeout: POOL_TIMEOUT
  };
}

export function getPoolResults(jobId, limit = 100) {
  if (jobId) return results.filter(r => r.jobId === jobId).slice(-limit);
  return results.slice(-limit);
}

export async function runInPool(runnerFn, options = {}) {
  const jobId = options.jobId || `pool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  addResult(jobId, "queued", { priority: options.priority || 0 });

  if (activeJobs >= MAX_CONCURRENT) {
    return new Promise((resolve, reject) => {
      queue.push({ jobId, runnerFn, options, resolve, reject, queuedAt: Date.now() });
    });
  }

  return executeJob(jobId, runnerFn, options);
}

async function executeJob(jobId, runnerFn, options) {
  activeJobs++;
  addResult(jobId, "start", { activeJobs });

  try {
    const timeout = options.timeout || POOL_TIMEOUT;
    const result = await Promise.race([
      runnerFn({ ...options, callbacks: getCallbacks(jobId) }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Pool timeout")), timeout))
    ]);
    addResult(jobId, "complete", result);
    return result;
  } catch (err) {
    addResult(jobId, "error", { message: err.message });
    throw err;
  } finally {
    activeJobs--;
    processQueue();
  }
}

function processQueue() {
  if (queue.length === 0 || activeJobs >= MAX_CONCURRENT) return;
  const next = queue.shift();
  if (next) {
    executeJob(next.jobId, next.runnerFn, next.options)
      .then(next.resolve)
      .catch(next.reject);
  }
}

export function cancelQueuedJob(jobId) {
  const idx = queue.findIndex(j => j.jobId === jobId);
  if (idx === -1) return false;
  queue.splice(idx, 1);
  addResult(jobId, "cancelled", {});
  return true;
}

export function clearPoolResults() {
  results.length = 0;
}
