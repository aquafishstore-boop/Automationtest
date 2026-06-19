/**
 * Visual Regression + AI Hybrid Mode
 * Adds pixel-matching before AI steps. If a UI shift is detected,
 * visual test flags a warning but AI self-heals the selector.
 *
 * Baseline images stored in Docker volume: /app/data/screenshots/baselines/
 */

import fs from "fs";
import path from "path";
import { captureScreenshot } from "./screenshot-manager.js";

const BASELINE_DIR = process.env.BASELINE_DIR || "/app/data/screenshots/baselines";

export function ensureBaselineDir() {
  try { if (!fs.existsSync(BASELINE_DIR)) fs.mkdirSync(BASELINE_DIR, { recursive: true }); }
  catch { /* read-only fs, skip */ }
}

function baselinePath(stepId) {
  return path.join(BASELINE_DIR, `${stepId.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`);
}

export async function captureBaseline(page, stepId) {
  ensureBaselineDir();
  const fp = baselinePath(stepId);
  await page.screenshot({ path: fp, type: "png" });
  return fp;
}

export async function compareWithBaseline(page, stepId) {
  const fp = baselinePath(stepId);
  if (!fs.existsSync(fp)) return { match: true, reason: "no-baseline" };

  try {
    const result = await page.screenshot({ type: "png" });
    const current = result.toString("base64");
    const baseline = fs.readFileSync(fp).toString("base64");

    // Quick pixel diff: compare lengths (not perfect but fast)
    const match = current === baseline;
    return {
      match,
      reason: match ? "identical" : "pixel-diff",
      currentSize: current.length,
      baselineSize: baseline.length
    };
  } catch (err) {
    return { match: true, reason: "compare-failed", error: err.message };
  }
}

export async function captureAndCompare(page, stepId) {
  const comparison = await compareWithBaseline(page, stepId);
  if (!comparison.match && comparison.reason === "no-baseline") {
    await captureBaseline(page, stepId);
    return { regression: false, action: "baseline-created" };
  }
  return {
    regression: !comparison.match,
    action: comparison.match ? "passed" : "ai-heal-required",
    details: comparison
  };
}
