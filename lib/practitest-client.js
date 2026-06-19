/**
 * Native PractiTest API Integration v2
 * Dynamic ingestion, real-time execution sync, direct evidence attachment.
 *
 * Deprecates CSV import/export. Provides bi-directional sync.
 *
 * Endpoints:
 *   GET  /api/v2/projects/{id}/instances.json — Pull test suites
 *   POST /api/v2/projects/{id}/runs.json — Create/update runs
 *   POST /api/v2/projects/{id}/attachments.json — Attach evidence
 *   GET  /api/v2/projects/{id}/test.json — List tests
 */

const PT_TOKEN = process.env.PRACTITEST_TOKEN || "";
const PT_PROJECT_ID = process.env.PRACTITEST_PROJECT_ID || "";
const PT_BASE_URL = process.env.PRACTITEST_BASE_URL || "https://api.practitest.com";

function headers() {
  return {
    "Authorization": `Bearer ${PT_TOKEN}`,
    "Content-Type": "application/json"
  };
}

export function isConfigured() {
  return !!(PT_TOKEN && PT_PROJECT_ID);
}

/**
 * Fetch test instances (suites) assigned to the current testing cycle.
 * Maps to internal JSON script format.
 */
export async function getTestInstances(options = {}) {
  if (!isConfigured()) throw new Error("PractiTest not configured");
  const { filters, limit = 100, offset = 0 } = options;
  let url = `${PT_BASE_URL}/api/v2/projects/${PT_PROJECT_ID}/instances.json?limit=${limit}&offset=${offset}`;
  if (filters?.set) url += `&filter[set]=${filters.set}`;
  if (filters?.priority) url += `&filter[priority]=${filters.priority}`;
  if (filters?.status) url += `&filter[status]=${filters.status}`;

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`PractiTest instances fetch failed: ${res.status}`);
  const data = await res.json();

  // Convert to internal script format
  return (data.data || []).map(inst => {
    const attrs = inst.attributes || {};
    return {
      practitestId: inst.id,
      instanceId: inst.id,
      name: attrs.name || `Test ${inst.id}`,
      description: attrs.description || "",
      system: detectSystem(attrs.name || attrs.description || ""),
      steps: parseSteps(attrs.steps || attrs.description || ""),
      priority: attrs.priority,
      status: attrs.status,
      created_at: attrs["created-at"],
      set: attrs["set-version"] || attrs.set
    };
  });
}

/**
 * Fetch full test list from library
 */
export async function getTests(options = {}) {
  if (!isConfigured()) throw new Error("PractiTest not configured");
  const { limit = 100, offset = 0 } = options;
  const res = await fetch(
    `${PT_BASE_URL}/api/v2/projects/${PT_PROJECT_ID}/tests.json?limit=${limit}&offset=${offset}`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(`PractiTest tests fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map(t => ({
    id: t.id,
    name: t.attributes?.name,
    description: t.attributes?.description,
    steps: parseSteps(t.attributes?.steps || t.attributes?.description || ""),
    system: detectSystem(t.attributes?.name || "")
  }));
}

/**
 * Create a run in PractiTest and stream step results live
 */
export async function createRun(instanceId, options = {}) {
  if (!isConfigured()) throw new Error("PractiTest not configured");
  const body = {
    data: {
      type: "instances",
      attributes: {
        "instance-id": instanceId,
        "exit-code": options.exitCode || 0,
        "automated-execution-output": options.output || "",
        "run-duration": options.duration || 0,
        ...(options.testedBy ? { "tested-by": options.testedBy } : {})
      }
    }
  };
  const res = await fetch(
    `${PT_BASE_URL}/api/v2/projects/${PT_PROJECT_ID}/runs.json`,
    { method: "POST", headers: headers(), body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`PractiTest run create failed: ${res.status}`);
  return res.json();
}

/**
 * Update step status in a running PractiTest execution
 */
export async function updateStepStatus(runId, stepIndex, status, error) {
  if (!isConfigured()) return;
  try {
    const body = {
      data: {
        type: "steps",
        attributes: {
          "step-id": stepIndex,
          status: status === "pass" ? "passed" : status === "fail" ? "failed" : "pending",
          ...(error ? { notes: error.slice(0, 500) } : {})
        }
      }
    };
    await fetch(
      `${PT_BASE_URL}/api/v2/projects/${PT_PROJECT_ID}/runs/${runId}/steps.json`,
      { method: "POST", headers: headers(), body: JSON.stringify(body) }
    );
  } catch (err) {
    console.error(`[PractiTest] Step update failed: ${err.message}`);
  }
}

/**
 * Attach screenshot evidence directly to a step execution
 */
export async function attachEvidence(runId, stepId, screenshotBuffer, filename) {
  if (!isConfigured()) return null;
  try {
    const formData = new FormData();
    formData.append("attachment[file]", new Blob([screenshotBuffer], { type: "image/png" }), filename);
    formData.append("attachment[attachable_type]", "StepExecution");
    formData.append("attachment[attachable_id]", `${runId}-${stepId}`);
    const res = await fetch(
      `${PT_BASE_URL}/api/v2/projects/${PT_PROJECT_ID}/attachments.json`,
      { method: "POST", headers: { "Authorization": `Bearer ${PT_TOKEN}` }, body: formData }
    );
    return res.ok ? { attached: true, filename } : { attached: false, status: res.status };
  } catch (err) {
    return { attached: false, error: err.message };
  }
}

/**
 * Upload all evidence at end of run
 */
export async function uploadEvidence(runId, testCaseId, screenshots, runSummary) {
  if (!isConfigured()) return { success: false, message: "PractiTest not configured" };
  const results = [];
  for (const shot of screenshots) {
    const result = await attachEvidence(runId, shot.stepId || testCaseId, shot.buffer, shot.filename);
    results.push(result || { filename: shot.filename, status: "error" });
  }
  return { success: results.every(r => r.attached), results };
}

function parseSteps(text) {
  if (!text) return [];
  const lines = text.split("\n").filter(l => l.trim());
  return lines.map((line, i) => ({
    id: `step-${i + 1}`,
    description: line.replace(/^\d+[\.\)]\s*/, "").trim(),
    action: detectAction(line),
    expected: ""
  }));
}

function detectAction(line) {
  const l = line.toLowerCase();
  if (l.includes("navigate") || l.includes("go to") || l.includes("open")) return "navigate";
  if (l.includes("click") || l.includes("press") || l.includes("select")) return "click";
  if (l.includes("type") || l.includes("enter") || l.includes("fill")) return "type";
  if (l.includes("verify") || l.includes("assert") || l.includes("check")) return "assert";
  if (l.includes("wait") || l.includes("pause")) return "wait";
  if (l.includes("screenshot") || l.includes("capture")) return "screenshot";
  return "click";
}

function detectSystem(text) {
  const l = text.toLowerCase();
  if (l.includes("ice") || l.includes("adt")) return "Surrey ICE";
  if (l.includes("winpath")) return "Winpath Enterprise";
  if (l.includes("bloodtrack") || l.includes("kiosk")) return "BloodTrack";
  if (l.includes("cellavision")) return "Cellavision";
  if (l.includes("immulink")) return "Immulink";
  if (l.includes("wes")) return "WES";
  if (l.includes("cyres")) return "Cyres";
  return "General";
}
