import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_FILE = process.env.AI_MEMORY_FILE || path.join(__dirname, "..", "stepMemory.json");

export function saveMapping(stepText, aiResult) {
  try {
    const memory = loadMemory();
    memory[stepText] = { ...aiResult, cachedAt: Date.now() };
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), "utf-8");
  } catch {}
}

export function loadMemory() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return {};
    return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function getCachedMapping(stepText) {
  const memory = loadMemory();
  const entry = memory[stepText];
  if (!entry) return null;
  // Expire cache after 24 hours
  if (Date.now() - (entry.cachedAt || 0) > 86400000) {
    delete memory[stepText];
    try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), "utf-8"); } catch {}
    return null;
  }
  return entry;
}

export function clearMemory() {
  try {
    fs.writeFileSync(MEMORY_FILE, "{}", "utf-8");
  } catch {}
}
