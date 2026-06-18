import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { captureScreenshot } from "./screenshot-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = process.env.SCRIPTS_DIR || path.join(__dirname, "..", "scripts");

/**
 * Test Recorder Agent
 * 
 * Opens a browser window and records user interactions as a test script.
 * Usage:
 *   POST /api/recorder/start  - Start recording (opens browser)
 *   POST /api/recorder/stop   - Stop and generate script
 *   GET  /api/recorder/status  - Check recording status
 */

let activeRecorder = null;

export class TestRecorder {
  constructor(options = {}) {
    this.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.status = "idle";
    this.url = options.url || "about:blank";
    this.scriptName = options.scriptName || `Recording_${new Date().toISOString().slice(0, 10)}`;
    this.system = options.system || "Recorded";
    this.headless = options.headless || false;
    this.steps = [];
    this.browser = null;
    this.context = null;
    this.page = null;
    this.listenersAttached = false;
    this.stepCounter = 0;
    this.recordDir = path.join(
      process.env.SCREENSHOTS_DIR || path.join(__dirname, "..", "screenshots"),
      `recording_${this.id}`
    );
    this.listeners = {};
  }

  async start() {
    if (this.status === "recording") {
      throw new Error("Already recording. Stop first.");
    }

    this.status = "starting";
    this.steps = [];
    this.stepCounter = 0;
    fs.mkdirSync(this.recordDir, { recursive: true });

    const browserType = process.env.BROWSER || "chromium";
    const channel = browserType === "msedge" ? "msedge" : undefined;

    this.browser = await chromium.launch({
      headless: false,
      channel,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"]
    });

    this.context = await this.browser.newContext({
      viewport: null, // Full screen
      ignoreHTTPSErrors: true
    });

    this.page = await this.context.newPage();

    if (this.url && this.url !== "about:blank") {
      await this.page.goto(this.url, { waitUntil: "networkidle" });
    }

    this._attachListeners();
    this.status = "recording";

    return {
      id: this.id,
      status: this.status,
      message: "Recording started. Browser window opened. Perform your test steps.",
      url: this.url
    };
  }

  _attachListeners() {
    if (this.listenersAttached || !this.page) return;

    // Track navigation
    this.page.on("framenavigated", async frame => {
      if (frame === this.page.mainFrame()) {
        const url = frame.url();
        const stepId = `step_${++this.stepCounter}`;
        const desc = `Navigate to ${url}`;
        await this._recordStep(stepId, "navigate", { url }, desc);
      }
    });

    // Track clicks - we use a page script to intercept all clicks
    this.page.evaluate(() => {
      window.__recorderSteps = window.__recorderSteps || [];
      document.addEventListener("click", e => {
        const el = e.target;
        const tag = el.tagName || "UNKNOWN";
        const id = el.id ? `#${el.id}` : "";
        const cls = el.className && typeof el.className === "string" ? `.${el.className.slice(0, 30)}` : "";
        const text = el.textContent ? el.textContent.trim().slice(0, 40) : "";
        const selector = id || (tag + cls) || tag;
        const info = { tag, selector, text: text.slice(0, 40), time: Date.now() };
        window.__recorderSteps.push({ type: "click", ...info });
      }, true);

      // Track input changes
      document.addEventListener("input", e => {
        const el = e.target;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
          const id = el.id ? `#${el.id}` : "";
          const name = el.name ? `[name="${el.name}"]` : "";
          const selector = id || name || el.tagName.toLowerCase();
          const value = el.type === "password" ? "{{PASSWORD}}" : el.value;
          window.__recorderSteps.push({
            type: "input",
            selector,
            value,
            tag: el.tagName,
            time: Date.now()
          });
        }
      }, true);
    });

    this.listenersAttached = true;
  }

  async _recordStep(stepId, action, params, description) {
    const timestamp = new Date().toISOString();
    
    // Take screenshot
    const shot = await captureScreenshot(
      this.page,
      `recording_${this.id}`,
      stepId,
      description
    );

    const step = {
      id: stepId,
      description,
      action,
      ...params,
      takeScreenshot: true,
      timestamp,
      screenshot: shot.filename
    };

    this.steps.push(step);
    return step;
  }

  async recordManualStep(description) {
    if (this.status !== "recording") {
      throw new Error("Not recording. Start recording first.");
    }
    const stepId = `step_${++this.stepCounter}`;
    return await this._recordStep(stepId, "screenshot", {}, description);
  }

  async stop() {
    if (!this.browser) {
      return { status: "idle", steps: this.steps.length };
    }

    this.status = "stopping";

    // Collect recorded interactions from the page
    if (this.page && !this.page.isClosed()) {
      try {
        const recordedSteps = await this.page.evaluate(() => {
          const steps = window.__recorderSteps || [];
          window.__recorderSteps = [];
          return steps;
        });

        // Process recorded interactions and add as script steps
        let lastType = null;
        for (const rs of recordedSteps) {
          if (rs.type === "click" && lastType !== "click") {
            // Group consecutive inputs
            const stepId = `step_${++this.stepCounter}`;
            const desc = rs.text ? `Click "${rs.text}"` : `Click ${rs.selector}`;
            await this._recordStep(stepId, "click", { selector: rs.selector }, desc);
          } else if (rs.type === "input") {
            const stepId = `step_${++this.stepCounter}`;
            const desc = `Enter "${rs.value.slice(0, 20)}" into ${rs.selector}`;
            await this._recordStep(stepId, "type", { selector: rs.selector, value: rs.value }, desc);
          }
          lastType = rs.type;
        }
      } catch (e) {
        // Page might be closed already
      }
    }

    // Close browser
    try {
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
    } catch (e) {
      // Ignore close errors
    }

    this.status = "stopped";

    // Generate the script
    const script = this._generateScript();
    
    // Save script to file
    const safeName = this.scriptName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    const filename = `rec-${safeName}.json`;
    const filePath = path.join(SCRIPTS_DIR, filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(script, null, 2), "utf-8");

    return {
      id: this.id,
      status: this.status,
      steps: this.steps.length,
      recorded: this.steps.filter(s => s.action !== "screenshot" || s.description.startsWith("Click") || s.description.startsWith("Enter")).length,
      scriptFile: filename,
      script
    };
  }

  _generateScript() {
    // Extract variables from steps
    const vars = new Set();
    const steps = this.steps.map(s => {
      const step = {
        id: s.id,
        description: s.description,
        action: s.action,
        takeScreenshot: true
      };
      if (s.url) {
        // Try to extract base URL as variable
        const urlObj = new URL(s.url);
        step.url = s.url;
        vars.add("BASE_URL");
      }
      if (s.selector) step.selector = s.selector;
      if (s.value !== undefined) step.value = s.value;
      return step;
    });

    const variables = [];
    if (vars.has("BASE_URL")) {
      variables.push({
        name: "BASE_URL",
        label: "System URL",
        type: "text",
        required: true,
        default: this.url
      });
    }
    variables.push(
      { name: "USERNAME", label: "Username", type: "text", required: true },
      { name: "PASSWORD", label: "Password", type: "password", required: true },
      { name: "HEADLESS", label: "Run headless", type: "text", default: "true", required: false }
    );

    return {
      name: this.scriptName,
      description: `Recorded test: ${this.scriptName}. Captured from live browser session.`,
      system: this.system,
      version: "1.0",
      recorded: true,
      recordedAt: new Date().toISOString(),
      variables,
      steps
    };
  }

  getStatus() {
    return {
      id: this.id,
      status: this.status,
      steps: this.steps.length,
      url: this.url,
      browserOpen: this.browser !== null && this.status === "recording"
    };
  }
}

/**
 * Start a new recording session
 */
export function startRecording(options) {
  if (activeRecorder && activeRecorder.status === "recording") {
    throw new Error("Already recording. Stop the current session first.");
  }
  activeRecorder = new TestRecorder(options);
  return activeRecorder.start();
}

/**
 * Stop the current recording
 */
export function stopRecording() {
  if (!activeRecorder) {
    throw new Error("No active recording session.");
  }
  return activeRecorder.stop().finally(() => {
    activeRecorder = null;
  });
}

/**
 * Add a manual step to current recording
 */
export async function recordStep(description) {
  if (!activeRecorder) {
    throw new Error("No active recording session.");
  }
  return await activeRecorder.recordManualStep(description);
}

/**
 * Get current recorder status
 */
export function getRecorderStatus() {
  if (!activeRecorder) {
    return { status: "idle", steps: 0 };
  }
  return activeRecorder.getStatus();
}

/**
 * Get all saved recordings as scripts
 */
export function getRecordings() {
  const files = fs.readdirSync(SCRIPTS_DIR).filter(f => f.startsWith("rec-") && f.endsWith(".json"));
  return files.map(f => {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(SCRIPTS_DIR, f), "utf-8"));
      return {
        filename: f,
        name: content.name,
        description: content.description,
        system: content.system,
        recorded: content.recorded,
        recordedAt: content.recordedAt,
        steps: content.steps.length,
        variables: content.variables || []
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}
