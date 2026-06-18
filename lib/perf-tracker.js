/**
 * Performance Regression Tracker
 * Stores per-step timing baselines and compares new runs against them.
 *
 * Flow: record timing → compare against baseline → flag regressions
 */

import fs from "fs";
import path from "path";

const PERF_FILE = process.env.PERF_DATA_FILE || path.resolve(process.cwd(), "data", "perf-baseline.json");

function loadBaseline() {
  if (!fs.existsSync(PERF_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(PERF_FILE, "utf-8")); }
  catch { return {}; }
}

function saveBaseline(baseline) {
  const dir = path.dirname(PERF_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PERF_FILE, JSON.stringify(baseline, null, 2));
}

export function recordTimings(runId, steps) {
  const baseline = loadBaseline();
  const regressions = [];

  for (const step of steps) {
    if (!step.description || !step.completedAt || !step.startedAt) continue;
    const duration = new Date(step.completedAt) - new Date(step.startedAt);
    const key = `${step.system || "general"}::${step.description}`;

    if (!baseline[key]) {
      baseline[key] = { runs: 0, totalDuration: 0, avgDuration: 0, maxDuration: 0, minDuration: duration };
    }

    const b = baseline[key];
    b.runs++;
    b.totalDuration += duration;
    b.avgDuration = Math.round(b.totalDuration / b.runs);
    b.maxDuration = Math.max(b.maxDuration, duration);
    b.minDuration = Math.min(b.minDuration, duration);
    b.lastRun = new Date().toISOString();

    // Flag regression: >2x baseline average
    if (b.avgDuration > 0 && duration > b.avgDuration * 2 && b.runs > 3) {
      regressions.push({
        step: step.description,
        key,
        duration,
        baseline: b.avgDuration,
        ratio: Math.round((duration / b.avgDuration) * 100) / 100,
        runId
      });
    }
  }

  saveBaseline(baseline);
  return { recorded: steps.length, regressions };
}

export function getBaseline(stepKey) {
  const baseline = loadBaseline();
  if (stepKey) return baseline[stepKey] || null;
  return baseline;
}

export function getRegressionReport(threshold = 2.0) {
  const baseline = loadBaseline();
  const regressions = [];
  for (const [key, data] of Object.entries(baseline)) {
    if (data.runs > 3 && data.maxDuration > data.avgDuration * threshold) {
      regressions.push({
        step: key,
        avgDuration: data.avgDuration,
        maxDuration: data.maxDuration,
        ratio: Math.round((data.maxDuration / data.avgDuration) * 100) / 100,
        runs: data.runs
      });
    }
  }
  return regressions;
}

export function getPerfSummary() {
  const baseline = loadBaseline();
  const entries = Object.entries(baseline);
  const totalRuns = entries.reduce((s, [, v]) => s + v.runs, 0);
  const avgTimings = entries.map(([k, v]) => ({ step: k, avg: v.avgDuration, max: v.maxDuration, runs: v.runs }));
  avgTimings.sort((a, b) => b.avg - a.avg);
  return {
    trackedSteps: entries.length,
    totalDataPoints: totalRuns,
    slowestSteps: avgTimings.slice(0, 10),
    regressions: getRegressionReport()
  };
}

export function clearBaseline() {
  saveBaseline({});
}
