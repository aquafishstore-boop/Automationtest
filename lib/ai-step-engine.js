import { mapStepWithAI, extractTarget, detectIntent } from "./ai-mapper.js";
import { getCachedMapping, saveMapping } from "./step-memory.js";
import { getCentralMapping, recordSuccess, recordFailure } from "./central-memory.js";

/**
 * Execute a step using AI mapping with fallback chain:
 * 1. Local cache (stepMemory.json)
 * 2. Central memory (shared across nodes)
 * 3. Live AI call (LM Studio)
 * 
 * On failure, records the failure to improve future mappings.
 * On success, saves to both local and central memory.
 */
export async function executeStepAI(page, step) {
  const key = `${step.id || ""}_${step.description || ""}`;

  // 1. Check local cache first
  let ai = getCachedMapping(key);

  // 2. Fall back to central memory (multi-node learning)
  if (!ai) {
    ai = getCentralMapping(key);
    if (ai) {
      console.log(`Loaded from central memory (node: ${ai.nodeId}, confidence: ${ai.confidence})`);
    }
  }

  // 3. Live AI call
  if (!ai || ai.confidence < 0.5) {
    const dom = await page.content();
    ai = await mapStepWithAI(step, dom);

    if (ai && ai.confidence > 0.5) {
      // Save to both local cache and central memory
      saveMapping(key, ai);
      recordSuccess(key, ai);
      console.log(`AI mapped: "${step.description}" -> ${ai.action}(${ai.selector}) [${Math.round(ai.confidence * 100)}%]`);
    }
  }

  if (!ai || ai.confidence < 0.5) {
    console.log(`AI skipped "${step.description}" - no mapping found`);
    return null;
  }

  // Execute the AI-suggested action
  try {
    await executeAIAction(page, ai, step);
    
    // On success, record it for learning
    recordSuccess(key, ai);
    
    return ai;
  } catch (err) {
    // Failure feedback loop: record failure for learning
    console.log(`AI action failed: ${err.message}`);
    recordFailure(key);
    
    // Try one more time with fresh AI call (healing attempt)
    console.log("Attempting AI healing with fresh DOM...");
    const freshDom = await page.content();
    const healedAi = await mapStepWithAI(step, freshDom);
    
    if (healedAi && healedAi.confidence > 0.6 && healedAi.selector !== ai.selector) {
      console.log(`AI healed: new selector "${healedAi.selector}"`);
      try {
        await executeAIAction(page, healedAi, step);
        saveMapping(key, healedAi);
        recordSuccess(key, healedAi);
        return healedAi;
      } catch (healErr) {
        recordFailure(key);
        throw healErr;
      }
    }
    
    throw err;
  }
}

/**
 * Execute a single AI-suggested action on the page.
 */
async function executeAIAction(page, ai, step) {
  console.log(`AI executing: ${ai.action}${ai.selector ? ` on "${ai.selector}"` : ""}${ai.value ? ` with value "${ai.value}"` : ""}`);

  switch (ai.action) {
    case "click":
      if (ai.selector) {
        await page.waitForSelector(ai.selector, { timeout: 5000 }).catch(() => {});
        await page.click(ai.selector);
      }
      break;

    case "fill":
    case "type":
      if (ai.selector) {
        await page.waitForSelector(ai.selector, { timeout: 5000 }).catch(() => {});
        await page.fill(ai.selector, ai.value || "");
      }
      break;

    case "select":
      if (ai.selector) {
        await page.waitForSelector(ai.selector, { timeout: 5000 }).catch(() => {});
        await page.selectOption(ai.selector, ai.value || "");
      }
      break;

    case "navigate":
      if (ai.value) await page.goto(ai.value, { waitUntil: "networkidle" });
      break;

    case "assert":
      if (ai.selector && ai.assertion) {
        await page.waitForSelector(ai.selector, { timeout: 5000 }).catch(() => {});
        const text = await page.textContent(ai.selector).catch(() => "");
        if (!text.includes(ai.assertion)) {
          throw new Error(`Assertion failed: expected "${ai.assertion}" in element, got "${(text || "").slice(0, 100)}"`);
        }
      } else if (ai.assertion) {
        const body = await page.textContent("body").catch(() => "");
        if (!body.includes(ai.assertion)) {
          throw new Error(`Assertion failed: expected "${ai.assertion}" on page, not found`);
        }
      }
      break;

    case "wait":
      if (ai.selector) {
        await page.waitForSelector(ai.selector, { timeout: ai.timeout || 10000 }).catch(() => {});
      } else if (ai.value) {
        await page.waitForTimeout(parseInt(ai.value) || 2000);
      } else {
        await page.waitForTimeout(2000);
      }
      break;

    case "screenshot":
      await page.screenshot({ path: `screenshots/ai-${step.id || "step"}.png` });
      break;

    default:
      console.log(`Unknown AI action: ${ai.action}`);
  }
}
