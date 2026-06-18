/**
 * Natural Language Test Authoring
 * Converts plain English descriptions into structured UAT scripts
 * using the LLM planner.
 *
 * "Order a FBC for TKFC and verify in Winpath"
 *   → [{ action: "navigate", ... }, { action: "click", ... }, ...]
 */

import { loadMemory } from "./step-memory.js";
import { getCentralMapping } from "./central-memory.js";

const LM_HOST = process.env.LM_HOST || "";
const LM_API_TOKEN = process.env.LM_API_TOKEN || "";
const AI_MODEL = process.env.AI_MODEL || "";

export async function generateScript(naturalLanguage, options = {}) {
  const systems = options.systems || ["Winpath Enterprise", "Surrey ICE", "BloodTrack", "Cellavision", "Immulink", "WES", "Cyres"];

  const prompt = `You are a UAT test script generator for pathology systems.

Convert this testing requirement into a structured JSON array of steps.
Each step has: action (navigate|click|type|select|wait|verify|screenshot|assert), description, and optional value.

Systems available: ${systems.join(", ")}
NHS Digital test patients: TKFC (male, 57), TKFF (female, 71), TKFI (female, 75), TKFM (male, 47), TKFT (female, 25), TKFU (male, 3)

Requirement: ${naturalLanguage}

Return ONLY a valid JSON array. Example:
[
  {"action":"navigate","description":"Navigate to Winpath Enterprise login page","value":"https://winpath.example.com"},
  {"action":"type","description":"Enter username","value":"{{USERNAME}}"},
  {"action":"type","description":"Enter password","value":"{{PASSWORD}}"},
  {"action":"click","description":"Click login button"},
  {"action":"wait","description":"Wait for dashboard to load","value":5000},
  {"action":"screenshot","description":"Dashboard loaded"}
]`;

  return await queryLLM(prompt);
}

export async function generateStep(description, domContext = "") {
  const prompt = `You are a UAT test step generator.
Given a step description and current page context, return a single JSON action.

Description: ${description}
${domContext ? `Current page elements (truncated):\n${domContext.slice(0, 2000)}` : "No page context available"}

Return ONLY valid JSON: {"action":"...","selector":"...","value":"...","description":"..."}`;

  return await queryLLM(prompt);
}

export async function explainScript(script) {
  const steps = (script.steps || []).map(s => `  ${s.action}: ${s.description}`).join("\n");
  const prompt = `Explain this UAT test script in plain English for a non-technical stakeholder:

System: ${script.system || "Unknown"}
Test Name: ${script.name || "Unnamed"}
Steps:
${steps}

Provide a concise summary (2-3 sentences) of what this test does and what it validates.`;
  return await queryLLM(prompt);
}

export async function suggestTests(system) {
  const prompt = `You are a pathology UAT specialist. Suggest 5 specific test scenarios for ${system || "pathology LIS"} system testing.

For each scenario provide: name, description (1 sentence), and high-level steps (3-5 bullet points).

Focus on real-world pathology workflows: ordering, result entry, validation, reporting, interfaces.`;
  return await queryLLM(prompt);
}

async function queryLLM(prompt) {
  if (!LM_HOST) return { error: "AI backend not configured (LM_HOST required)" };
  try {
    const body = AI_MODEL
      ? { model: AI_MODEL, messages: [{ role: "system", content: "You are a UAT test automation AI." }, { role: "user", content: prompt }], max_tokens: 1000, temperature: 0.1 }
      : { prompt, max_tokens: 1000, temperature: 0.1 };

    const headers = { "Content-Type": "application/json" };
    if (LM_API_TOKEN) headers["Authorization"] = `Bearer ${LM_API_TOKEN}`;

    const resp = await fetch(`${LM_HOST}/v1/chat/completions`, {
      method: "POST", headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });

    if (!resp.ok) return { error: `AI backend returned ${resp.status}` };
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || data.response || "";

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { result: text };
  } catch (err) {
    return { error: err.message };
  }
}
