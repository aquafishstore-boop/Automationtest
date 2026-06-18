// Primary LM backend (e.g., 9070 XT with large model)
const LM_HOST = process.env.LM_HOST || "";
const AI_MODEL = process.env.AI_MODEL || "";
const LM_API_TOKEN = process.env.LM_API_TOKEN || "";

// Fallback LM backend (e.g., 4060 Ti or local Ollama with small model)
const LM_FALLBACK_HOST = process.env.LM_FALLBACK_HOST || process.env.OLLAMA_HOST || "http://localhost:11434";
const AI_FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || "";

/**
 * Filter raw DOM HTML to only interactive elements relevant for AI decisions.
 */
export function filterDOM(html) {
  if (!html) return "";
  const interactive = [];
  const extract = (regex, wrap) => {
    let m;
    while ((m = regex.exec(html)) !== null) {
      const text = m[0].replace(/<[^>]*>/g, "").trim();
      const id = m[0].match(/id=["']([^"']+)["']/)?.[1] || "";
      const name = m[0].match(/name=["']([^"']+)["']/)?.[1] || "";
      if (text || id) interactive.push(`<${wrap} id="${id}" name="${name}">${text}</${wrap}>`);
    }
  };
  extract(/<button[^>]*>[\s\S]*?<\/button>/gi, "button");
  extract(/<a[^>]*>[\s\S]*?<\/a>/gi, "a");
  extract(/<input[^>]*\/?>/gi, "input");
  extract(/<select[^>]*>[\s\S]*?<\/select>/gi, "select");
  extract(/<textarea[^>]*>[\s\S]*?<\/textarea>/gi, "textarea");
  extract(/<label[^>]*>[\s\S]*?<\/label>/gi, "label");
  extract(/<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>/gi, "heading");
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) interactive.unshift(`<title>${titleMatch[1].trim()}</title>`);
  return interactive.join("\n");
}

/**
 * Send prompt to a specific AI backend.
 */
async function callBackend(host, model, token, prompt, label) {
  const useChat = !!model;
  const apiEndpoint = useChat ? "/v1/chat/completions" : "/v1/completions";
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const body = useChat
    ? { model, messages: [
        { role: "system", content: "You are a QA automation engineer. Return ONLY valid JSON with fields: action, selector, value, assertion, confidence." },
        { role: "user", content: prompt }
      ], max_tokens: 200, temperature: 0.1 }
    : { model: model || "llama3.1:8b", prompt, max_tokens: 200, temperature: 0.1, stream: false };

  const response = await fetch(`${host}${apiEndpoint}`, {
    method: "POST", headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.text
    || data.response
    || data.output_text
    || "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");

  let result = JSON.parse(jsonMatch[0]);
  if (Array.isArray(result)) result = result[0];

  if (!result.action || typeof result.confidence !== "number") {
    throw new Error("Invalid result format");
  }

  result._backend = label;
  return result;
}

/**
 * Map a step to an AI action, trying primary backend first, then fallback.
 */
export async function mapStepWithAI(step, rawDom) {
  const filteredDom = filterDOM(rawDom || "");
  const domSnippet = filteredDom.slice(0, 4000) || "No interactive elements found";

  const prompt = `Convert this test step to a Playwright action.
STEP: ${step.description || step.id || "unknown"}
EXPECTED: ${step.expected || ""}
PAGE ELEMENTS:
${domSnippet}

Return only JSON with: action, selector, value, assertion, confidence.`;

  // Build backend list: primary first, then fallback
  const backends = [];
  if (LM_HOST) backends.push({ host: LM_HOST, model: AI_MODEL, token: LM_API_TOKEN, label: "primary" });
  if (LM_FALLBACK_HOST && LM_FALLBACK_HOST !== LM_HOST) {
    backends.push({ host: LM_FALLBACK_HOST, model: AI_FALLBACK_MODEL, token: "", label: "fallback" });
  }

  let lastError = null;

  for (const backend of backends) {
    try {
      console.log(`AI trying backend "${backend.label}" at ${backend.host}...`);
      const result = await callBackend(backend.host, backend.model, backend.token, prompt, backend.label);
      console.log(`AI mapped via "${backend.label}" -> ${result.action}(${result.selector}) [${Math.round(result.confidence * 100)}%]`);
      return result;
    } catch (err) {
      console.error(`AI backend "${backend.label}" failed:`, err.message);
      lastError = err.message;
    }
  }

  console.error("All AI backends failed, last error:", lastError);
  return null;
}

export function extractTarget(text) {
  const lower = text.toLowerCase();
  const targets = {
    "custom mi reports": "customMIReports", "tools": "tools", "requesting": "requesting",
    "get report data": "getReportData", "view order": "viewOrder", "login": "login",
    "username": "username", "password": "password", "search": "search", "submit": "submit",
    "save": "save", "cancel": "cancel", "delete": "delete", "next": "next", "back": "back",
    "continue": "continue", "screenshot": "screenshot", "dashboard": "dashboard",
    "menu": "menu", "logout": "logout", "print": "print", "export": "export",
    "download": "download", "upload": "upload"
  };
  for (const [key, val] of Object.entries(targets)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

export function detectIntent(text) {
  const lower = text.toLowerCase();
  if (lower.includes("navigate") || lower.includes("go to ") || lower.includes("open ") || lower.includes("load ")) return "navigate";
  if (lower.includes("click") || lower.includes("press") || lower.includes("select") || lower.includes("tap") || lower.includes("choose")) return "click";
  if (lower.includes("type") || lower.includes("enter ") || lower.includes("fill") || lower.includes("input")) return "fill";
  if (lower.includes("download") || lower.includes("export") || lower.includes("save as")) return "download";
  if (lower.includes("screenshot") || lower.includes("capture") || lower.includes("snapshot") || lower.includes("screen shot")) return "screenshot";
  if (lower.includes("assert") || lower.includes("verify") || lower.includes("check") || lower.includes("validate") || lower.includes("expect") || lower.includes("confirm")) return "assert";
  if (lower.includes("wait") || lower.includes("delay") || lower.includes("pause") || lower.includes("sleep")) return "wait";
  if (lower.includes("select") || lower.includes("choose") || lower.includes("pick")) return "select";
  return null;
}
