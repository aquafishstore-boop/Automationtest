/**
 * Auto-Remediation Engine
 * When a test step fails, the engine diagnoses the issue,
 * proposes an alternative approach, and retries.
 *
 * Flow: step fail → capture (error, DOM, screenshot) →
 * diagnose with AI → generate fix → retry → log outcome
 */

const LM_HOST = process.env.LM_HOST || "";
const LM_API_TOKEN = process.env.LM_API_TOKEN || "";
const AI_MODEL = process.env.AI_MODEL || "";
const MAX_RETRIES = parseInt(process.env.REMEDIATION_MAX_RETRIES) || 3;

const remediationLog = [];

function logRemediation(entry) {
  remediationLog.push({ ...entry, timestamp: new Date().toISOString() });
  if (remediationLog.length > 1000) remediationLog.splice(0, remediationLog.length - 1000);
}

export async function diagnose(error, domSnippet, stepDescription) {
  const prompt = `A UAT browser automation step failed. Diagnose the issue and propose a fix.

Step description: ${stepDescription}
Error: ${error}
Page elements (truncated): ${(domSnippet || "").slice(0, 2000)}

Return ONLY valid JSON:
{"diagnosis":"brief explanation of what went wrong","fix":{"action":"click|type|select|wait|navigate","selector":"corrected CSS selector","value":"value if needed","description":"what the fix does"},"confidence":0.0-1.0}`;

  if (!LM_HOST) return null;
  try {
    const body = AI_MODEL
      ? { model: AI_MODEL, messages: [{ role: "system", content: "You are a Playwright automation debugger." }, { role: "user", content: prompt }], max_tokens: 300, temperature: 0.1 }
      : { prompt, max_tokens: 300, temperature: 0.1 };

    const resp = await fetch(`${LM_HOST}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(LM_API_TOKEN ? { Authorization: `Bearer ${LM_API_TOKEN}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || data.response || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    logRemediation({ step: stepDescription, error, diagnosis: parsed.diagnosis, fix: parsed.fix, confidence: parsed.confidence, success: false });
    return parsed;
  } catch {
    return null;
  }
}

export async function remediate(page, step, error) {
  const attempts = [{ attempt: 0, action: step }];
  for (let i = 1; i <= MAX_RETRIES; i++) {
    const domSnippet = await page.content().catch(() => "");
    const diagnosis = await diagnose(error, domSnippet, step.description);
    if (!diagnosis || !diagnosis.fix || diagnosis.confidence < 0.3) break;

    try {
      const fix = diagnosis.fix;
      switch (fix.action) {
        case "navigate":
          if (fix.selector) await page.goto(fix.selector, { waitUntil: "networkidle", timeout: 15000 });
          break;
        case "click":
          await page.waitForSelector(fix.selector, { timeout: 5000 }).catch(() => {});
          await page.click(fix.selector);
          break;
        case "type":
          await page.waitForSelector(fix.selector, { timeout: 5000 }).catch(() => {});
          await page.fill(fix.selector, fix.value || "");
          break;
        case "select":
          await page.waitForSelector(fix.selector, { timeout: 5000 }).catch(() => {});
          await page.selectOption(fix.selector, fix.value || "");
          break;
        case "wait":
          await page.waitForTimeout(parseInt(fix.value) || 3000);
          break;
      }
      attempts.push({ attempt: i, action: fix, success: true });
      logRemediation({ ...diagnosis, step: step.description, error, attempt: i, success: true });
      return { remediated: true, attempts, diagnosis };
    } catch (retryError) {
      error = retryError.message;
      attempts.push({ attempt: i, action: diagnosis.fix, success: false, error: retryError.message });
    }
  }
  return { remediated: false, attempts };
}

export function getRemediationLog(limit = 50) {
  return remediationLog.slice(-limit);
}

export function getRemediationStats() {
  const total = remediationLog.length;
  const successes = remediationLog.filter(r => r.success).length;
  return {
    totalRemediations: total,
    successful: successes,
    failed: total - successes,
    successRate: total > 0 ? Math.round((successes / total) * 100) + "%" : "0%"
  };
}
