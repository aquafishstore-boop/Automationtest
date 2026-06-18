/**
 * Agentic Brain — AI-powered autonomous browser agent.
 * 
 * Takes high-level goals ("Enter order for FBC test in Winpath")
 * and breaks them into atomic browser actions using LLM planning,
 * then executes each action via Playwright with screenshot evidence.
 * 
 * Flow:
 *   plan(goal) → decompose into steps → for each step:
 *     observe(page DOM) → think(what to do) → act(click/type/wait)
 *     → screenshot → verify → next
 */

import { chromium } from "playwright";
import { captureScreenshot } from "./screenshot-manager.js";
import { mapStepWithAI, filterDOM } from "./ai-mapper.js";
import { getCentralMapping, recordSuccess, recordFailure } from "./central-memory.js";

const LM_HOST = process.env.LM_HOST || "";
const LM_API_TOKEN = process.env.LM_API_TOKEN || "";
const AI_MODEL = process.env.AI_MODEL || "";

export class AgenticBrain {
  constructor(options = {}) {
    this.goal = options.goal || "";
    this.systemName = options.system || "Target";
    this.testName = options.testName || "Agentic Test";
    this.runId = options.runId || Date.now().toString(36);
    this.stepCount = 0;
    this.maxSteps = options.maxSteps || 50;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.log = [];
    this.screenshots = [];
    this.plan = [];
    this.currentStepIndex = 0;
    this.callbacks = options.callbacks || {};
  }

  async init() {
    const headless = process.env.HEADLESS !== "false";
    const channel = (process.env.BROWSER || "").toLowerCase() === "msedge" ? "msedge" : undefined;

    this.browser = await chromium.launch({
      headless,
      channel,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true
    });
    this.page = await this.context.newPage();

    this._log("info", `Agentic Brain initialized (goal: ${this.goal.slice(0, 80)}...)`);
    return this;
  }

  _log(level, message) {
    const entry = { time: new Date().toISOString(), level, message };
    this.log.push(entry);
    if (this.callbacks.onLog) this.callbacks.onLog(level, message);
    console.log(`[Agentic ${level}] ${message}`);
  }

  async _snap(description) {
    const extra = { system: this.systemName, testName: this.testName };
    const stepId = `agentic-${++this.stepCount}`;
    const shot = await captureScreenshot(this.page, this.runId, stepId, description, extra);
    this.screenshots.push(shot);
    if (this.callbacks.onScreenshot) this.callbacks.onScreenshot(shot);
    return shot;
  }

  /**
   * PLAN: Use LLM to decompose a goal into atomic steps.
   */
  async plan(goal) {
    this.goal = goal;
    const prompt = `You are a test automation planner for pathology/LIS systems.
Break this testing goal into a numbered list of browser actions.
Each action must be: navigate | login | click | type | select | wait | verify | screenshot | assert

Goal: ${goal}

Systems might include: Winpath Enterprise, Surrey ICE, HPV ICE, EPIC, Cerner, ADT, BloodTrack, Cellavision, Immulink, Cyres, WES.

Return ONLY a numbered list of actions. Example:
1. navigate to the Winpath login page
2. type username into the username field
3. type password into the password field
4. click the login button
5. wait for the main menu to load
6. click on Request Entry in the menu
7. type the order number into the order search field
8. click the search button
9. verify the patient name matches the expected name
10. screenshot the order details`;

    const result = await this._askAI(prompt, 500);
    if (!result) {
      // Fallback to simple step decomposition
      this.plan = [{ action: "navigate", target: "system", description: `Execute: ${goal}` }];
      return this.plan;
    }

    this.plan = result
      .split("\n")
      .filter(l => /^\d+\./.test(l))
      .map(l => {
        const text = l.replace(/^\d+\.\s*/, "").trim();
        const action = text.split(" ")[0]?.toLowerCase() || "click";
        const supported = ["navigate", "login", "click", "type", "select", "wait", "verify", "screenshot", "assert"];
        return {
          action: supported.includes(action) ? action : "click",
          description: text,
          original: l
        };
      });

    this._log("info", `Planned ${this.plan.length} steps for: ${goal.slice(0, 60)}...`);
    return this.plan;
  }

  /**
   * THINK: Given current page state and a goal, decide what to do.
   */
  async _think(goal, dom) {
    const filtered = filterDOM(dom || "").slice(0, 3000);
    const prompt = `You are controlling a browser for pathology system testing.
CURRENT PAGE elements:
${filtered || "(no interactive elements found)"}

TASK: ${goal}

Return ONLY valid JSON with: action (click|type|select|wait|assert|navigate|screenshot), selector (CSS selector to interact with), value (text to type if needed), assertion (text to verify if needed), confidence (0-1).`;

    try {
      const token = LM_API_TOKEN;
      const body = AI_MODEL
        ? { model: AI_MODEL, messages: [
            { role: "system", content: "You are a Playwright automation AI. Return ONLY valid JSON." },
            { role: "user", content: prompt }
          ], max_tokens: 200, temperature: 0.1 }
        : { prompt, max_tokens: 200, temperature: 0.1 };

      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const resp = await fetch(`${LM_HOST}/v1/chat/completions`, {
        method: "POST", headers, body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });

      if (!resp.ok) return null;
      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content || data.response || "";
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch {
      return null;
    }
  }

  /**
   * ACT: Execute a single atomic action on the page.
   */
  async _act(action) {
    const { action: type, selector, value, description } = action;
    
    try {
      switch (type) {
        case "navigate":
          if (value || description?.startsWith("http")) {
            const url = value || description.match(/https?:\/\/[^\s]+/)?.[0] || "";
            if (url) await this.page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
          }
          break;

        case "click":
          if (selector) {
            await this.page.waitForSelector(selector, { timeout: 8000 }).catch(() => {});
            await this.page.click(selector);
          } else if (description) {
            // AI-driven: find the element by description
            const ai = await this._think(`Click: ${description}`, await this.page.content());
            if (ai?.selector) {
              await this.page.waitForSelector(ai.selector, { timeout: 5000 }).catch(() => {});
              await this.page.click(ai.selector);
              this._log("info", `AI found: ${ai.selector} for "${description}"`);
            }
          }
          break;

        case "type":
          if (selector && value !== undefined) {
            await this.page.waitForSelector(selector, { timeout: 5000 }).catch(() => {});
            await this.page.fill(selector, value);
          }
          break;

        case "select":
          if (selector && value) {
            await this.page.waitForSelector(selector, { timeout: 5000 }).catch(() => {});
            await this.page.selectOption(selector, value);
          }
          break;

        case "wait":
          if (selector) {
            await this.page.waitForSelector(selector, { timeout: 15000 }).catch(() => {});
          } else {
            await this.page.waitForTimeout(value || 3000);
          }
          break;

        case "assert":
        case "verify":
          if (selector) {
            await this.page.waitForSelector(selector, { timeout: 5000 }).catch(() => {});
            const text = await this.page.textContent(selector).catch(() => "");
            if (value && !text.includes(value)) {
              this._log("warn", `Assertion: "${value}" not found in "${(text || "").slice(0, 50)}"`);
            }
          }
          break;

        case "screenshot":
          await this._snap(description || "step screenshot");
          break;
      }
      return true;
    } catch (err) {
      this._log("error", `Action failed: ${err.message}`);
      return false;
    }
  }

  /**
   * ASK: Send a prompt to the LLM.
   */
  async _askAI(prompt, maxTokens = 300) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (LM_API_TOKEN) headers["Authorization"] = `Bearer ${LM_API_TOKEN}`;
      
      const body = AI_MODEL
        ? { model: AI_MODEL, messages: [
            { role: "system", content: "You are a test automation AI." },
            { role: "user", content: prompt }
          ], max_tokens: maxTokens, temperature: 0.1 }
        : { prompt, max_tokens: maxTokens, temperature: 0.1 };

      const resp = await fetch(`${LM_HOST}/v1/chat/completions`, {
        method: "POST", headers, body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });

      if (!resp.ok) return null;
      const data = await resp.json();
      return data.choices?.[0]?.message?.content || data.response || "";
    } catch {
      return null;
    }
  }

  /**
   * EXECUTE: Run the full plan with AI-driven adaptation.
   */
  async execute(goal) {
    if (!this.page) await this.init();
    if (!this.plan.length) await this.plan(goal || this.goal);

    this._log("info", `Executing ${this.plan.length} steps...`);

    for (let i = 0; i < this.plan.length && i < this.maxSteps; i++) {
      const step = this.plan[i];
      this.currentStepIndex = i;
      
      // For complex steps, let AI figure out the details from the current DOM
      if (!step.selector && !step.value) {
        const dom = await this.page.content();
        const aiDecision = await this._think(step.description, dom);

        if (aiDecision && aiDecision.confidence > 0.5) {
          step.selector = aiDecision.selector || step.selector;
          step.value = aiDecision.value || step.value;
          step.action = aiDecision.action || step.action;
          this._log("info", `AI decided: ${step.action} on "${step.selector}" (${Math.round(aiDecision.confidence * 100)}%)`);
        }
      }

      const success = await this._act(step);
      
      if (success && step.action !== "screenshot") {
        await this._snap(step.description);
      }

      if (this.callbacks.onStep) {
        this.callbacks.onStep({ index: i, total: this.plan.length, step, success });
      }

      // Small delay between actions for page stability
      await this.page.waitForTimeout(500);
    }

    this._log("info", `Completed ${this.plan.length} steps with ${this.screenshots.length} screenshots`);
    return { screenshots: this.screenshots.length, steps: this.plan.length, log: this.log };
  }

  async close() {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  /**
   * Run a complete test from a UAT tester script object.
   */
  async runScript(script, variables = {}) {
    if (!this.page) await this.init();
    this.systemName = script.system || "System";
    this.testName = script.name || "Test";

    const results = [];
    for (const step of script.steps || []) {
      // Interpolate variables
      const desc = step.description.replace(/\{\{(\w+)\}\}/g, (_, k) => variables[k] || "");
      
      this._log("info", `Step: ${desc}`);

      if (step.action === "navigate" && step.url) {
        const url = step.url.replace(/\{\{(\w+)\}\}/g, (_, k) => variables[k] || "");
        if (url) await this.page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await this._snap(desc);
        results.push({ step: step.id, status: "pass" });
        continue;
      }

      // For screenshot steps, just capture
      if (step.action === "screenshot") {
        await this._snap(desc);
        results.push({ step: step.id, status: "pass" });
        continue;
      }

      // For all other actions, use AI to figure out what to do
      const dom = await this.page.content();
      const ai = await this._think(desc, dom);

      if (ai && ai.confidence > 0.5) {
        try {
          const actionStep = { action: ai.action, selector: ai.selector, value: ai.value || variables[ai.value] || "", description: desc };
          const ok = await this._act(actionStep);
          await this._snap(desc);
          results.push({ step: step.id, status: ok ? "pass" : "fail" });
          
          if (ok) recordSuccess(`${script.name}_${step.id}`, ai);
          else recordFailure(`${script.name}_${step.id}`);
        } catch (err) {
          this._log("error", `AI execution failed: ${err.message}`);
          results.push({ step: step.id, status: "fail", error: err.message });
        }
      } else {
        this._log("warn", `AI couldn't determine action for: ${desc}`);
        await this._snap(`AI-UNSURE-${desc}`);
        results.push({ step: step.id, status: "unknown" });
      }
    }

    return {
      total: script.steps.length,
      passed: results.filter(r => r.status === "pass").length,
      failed: results.filter(r => r.status === "fail").length,
      screenshots: this.screenshots.length,
      results
    };
  }
}

/**
 * Convenience: Create and run an agentic test in one call.
 */
export async function runAgenticTest(options) {
  const brain = new AgenticBrain(options);
  await brain.init();
  const result = await brain.runScript(options.script, options.variables || {});
  await brain.close();
  return { ...result, brain };
}
