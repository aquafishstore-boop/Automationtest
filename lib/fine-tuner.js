/**
 * AI Fine-Tuning Pipeline
 * Collects successful/failed test runs, prepares training data,
 * and submits to LM Studio / OpenAI fine-tuning API.
 *
 * Flow: collect runs → extract (DOM, action, result) pairs →
 * format as training examples → submit for fine-tuning → track versions
 */

import fs from "fs";
import path from "path";

const TRAINING_DIR = process.env.TRAINING_DATA_DIR || path.resolve(process.cwd(), "data", "training");
const LM_HOST = process.env.LM_HOST || "";
const LM_API_TOKEN = process.env.LM_API_TOKEN || "";

if (!fs.existsSync(TRAINING_DIR)) fs.mkdirSync(TRAINING_DIR, { recursive: true });

export function collectTrainingData(steps) {
  const examples = [];
  for (const s of steps) {
    if (!s.domSnippet && !s.description) continue;
    examples.push({
      instruction: s.description || "Perform action on page",
      input: (s.domSnippet || "").slice(0, 1500),
      output: JSON.stringify({ action: s.action, selector: s.selector, value: s.value }),
      success: s.status === "pass",
      system: s.system || "unknown",
      timestamp: new Date().toISOString()
    });
  }
  return examples;
}

export function saveTrainingBatch(examples, system) {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `training-${system || "general"}-${date}`;
  const fp = path.join(TRAINING_DIR, `${filename}.jsonl`);
  const lines = examples.map(e => JSON.stringify(e)).join("\n");
  fs.appendFileSync(fp, lines + "\n", "utf-8");
  return { file: filename, count: examples.length };
}

export function getTrainingStats() {
  const files = fs.readdirSync(TRAINING_DIR).filter(f => f.endsWith(".jsonl"));
  let totalExamples = 0;
  const bySystem = {};
  for (const f of files) {
    const content = fs.readFileSync(path.join(TRAINING_DIR, f), "utf-8");
    const lines = content.split("\n").filter(Boolean);
    totalExamples += lines.length;
    for (const line of lines) {
      try {
        const ex = JSON.parse(line);
        const sys = ex.system || "unknown";
        bySystem[sys] = (bySystem[sys] || 0) + 1;
      } catch {}
    }
  }
  return { files: files.length, totalExamples, bySystem, directory: TRAINING_DIR };
}

export function getTrainingFiles() {
  return fs.readdirSync(TRAINING_DIR)
    .filter(f => f.endsWith(".jsonl"))
    .map(f => {
      const fp = path.join(TRAINING_DIR, f);
      const stat = fs.statSync(fp);
      const content = fs.readFileSync(fp, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      const successes = lines.filter(l => { try { return JSON.parse(l).success; } catch { return false; } }).length;
      return { filename: f, size: stat.size, examples: lines.length, successes, date: f.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "unknown" };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function submitFineTuning(options = {}) {
  const { model, system, epochs = 3, learningRateMultiplier = 0.1 } = options;
  const files = getTrainingFiles().filter(f => !system || f.filename.includes(system));
  if (!files.length) return { error: "No training data available" };

  const latestFile = path.join(TRAINING_DIR, files[0].filename);
  const trainingData = fs.readFileSync(latestFile, "utf-8");

  if (!LM_HOST) return { error: "LM_HOST not configured for fine-tuning submission" };

  try {
    const resp = await fetch(`${LM_HOST}/v1/fine-tunes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(LM_API_TOKEN ? { Authorization: `Bearer ${LM_API_TOKEN}` } : {})
      },
      body: JSON.stringify({
        training_file: trainingData,
        model: model || "gpt-oss-20b",
        suffix: `uat-${system || "general"}-${Date.now().toString(36)}`,
        hyperparameters: { n_epochs: epochs, learning_rate_multiplier: learningRateMultiplier }
      }),
      signal: AbortSignal.timeout(60000)
    });
    const result = await resp.json();
    return { submitted: true, result, totalExamples: files[0].examples };
  } catch (err) {
    return { error: err.message, hint: "Fine-tuning requires LM Studio v0.3+ with fine-tuning API enabled" };
  }
}

export function clearTrainingData(system) {
  const files = fs.readdirSync(TRAINING_DIR).filter(f => f.endsWith(".jsonl") && (!system || f.includes(system)));
  for (const f of files) fs.unlinkSync(path.join(TRAINING_DIR, f));
  return { deleted: files.length };
}
