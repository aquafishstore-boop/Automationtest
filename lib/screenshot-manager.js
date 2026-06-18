import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || path.join(__dirname, "..", "screenshots");
const REPORTS_DIR = process.env.REPORTS_DIR || path.join(__dirname, "..", "reports");

export function initRunDirs(runId) {
  const shotDir = path.join(SCREENSHOTS_DIR, runId);
  const reportDir = path.join(REPORTS_DIR, runId);
  fs.mkdirSync(shotDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
  return { shotDir, reportDir };
}

/**
 * Capture a screenshot with a labelled filename.
 * Format: {system}_{testName}_Step{number}_{description}_{timestamp}.png
 * Example: "ADT_EPIC_to_RSCH_ICE_Step1_Ice_login_20260101_120530.png"
 */
export async function captureScreenshot(page, runId, stepId, description, extra) {
  const dir = path.join(SCREENSHOTS_DIR, runId);
  fs.mkdirSync(dir, { recursive: true });

  const system = (extra?.system || "UAT").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
  const testName = (extra?.testName || "test").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
  const stepLabel = stepId?.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20) || "step";
  const cleanDesc = (description || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const parts = [system, testName, stepLabel, cleanDesc, timestamp].filter(Boolean);
  const safeName = `${parts.join("_")}.png`;
  const filePath = path.join(dir, safeName);

  await page.screenshot({ path: filePath, fullPage: false });

  return { filename: safeName, filePath, description, stepId };
}

export function getScreenshotPath(runId, filename) {
  return path.join(SCREENSHOTS_DIR, runId, filename);
}

export function listScreenshots(runId) {
  const dir = path.join(SCREENSHOTS_DIR, runId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".png"))
    .map(f => ({
      filename: f,
      path: path.join(dir, f)
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

export function getReportPath(runId) {
  return path.join(REPORTS_DIR, runId, "report.html");
}
