/**
 * Central Memory + Multi-Node Learning System
 * 
 * Shared memory that aggregates AI mappings across multiple UAT tester instances.
 * Uses a shared JSON store with conflict resolution (latest timestamp wins).
 * Supports exporting/importing memory between nodes for distributed learning.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = process.env.AI_MEMORY_DIR || path.join(__dirname, "..", "ai-memory");
const CENTRAL_FILE = path.join(MEMORY_DIR, "central-memory.json");
const NODE_ID = process.env.NODE_ID || process.env.HOSTNAME || "node-" + Date.now().toString(36);
const LEARNING_RATE = parseFloat(process.env.AI_LEARNING_RATE || "0.3");

// Ensure directory exists
try { fs.mkdirSync(MEMORY_DIR, { recursive: true }); } catch {}

/**
 * A mapping entry stored in central memory.
 * Each entry has a confidence score that aggregates across multiple nodes.
 */
export function createEntry(stepKey, aiResult, nodeId) {
  return {
    stepKey,
    action: aiResult.action,
    selector: aiResult.selector,
    value: aiResult.value,
    assertion: aiResult.assertion,
    confidence: aiResult.confidence || 0.5,
    nodeId: nodeId || NODE_ID,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    successCount: 1,
    failCount: 0,
    tags: []
  };
}

/**
 * Load central memory from disk.
 */
export function loadCentralMemory() {
  try {
    if (!fs.existsSync(CENTRAL_FILE)) return { mappings: {}, meta: { nodes: [], lastSync: null } };
    return JSON.parse(fs.readFileSync(CENTRAL_FILE, "utf-8"));
  } catch {
    return { mappings: {}, meta: { nodes: [], lastSync: null } };
  }
}

function saveCentralMemory(memory) {
  try {
    fs.mkdirSync(path.dirname(CENTRAL_FILE), { recursive: true });
    fs.writeFileSync(CENTRAL_FILE, JSON.stringify(memory, null, 2), "utf-8");
  } catch {}
}

/**
 * Register this node in the memory metadata.
 */
export function registerNode(nodeId) {
  const memory = loadCentralMemory();
  if (!memory.meta.nodes.includes(nodeId)) {
    memory.meta.nodes.push(nodeId);
    memory.meta.lastSync = Date.now();
    saveCentralMemory(memory);
  }
}

/**
 * Get a mapping from central memory by step key.
 * Returns the entry with the highest aggregate confidence.
 */
export function getCentralMapping(stepKey) {
  const memory = loadCentralMemory();
  const entry = memory.mappings[stepKey];
  if (!entry) return null;

  // Decay confidence slightly over time if not refreshed
  const daysSinceLastSeen = (Date.now() - entry.lastSeen) / 86400000;
  const decay = Math.max(0, 1 - daysSinceLastSeen * 0.05);
  const adjustedConfidence = entry.confidence * decay;

  return { ...entry, confidence: adjustedConfidence };
}

/**
 * Record a successful AI mapping in central memory.
 * Uses weighted averaging to merge confidence from multiple nodes.
 */
export function recordSuccess(stepKey, aiResult, nodeId) {
  const memory = loadCentralMemory();
  const existing = memory.mappings[stepKey];

  if (!existing) {
    memory.mappings[stepKey] = createEntry(stepKey, aiResult, nodeId || NODE_ID);
  } else {
    // Weighted average: new confidence = (old * (1-LR)) + (new * LR)
    const oldWeight = 1 - LEARNING_RATE;
    const newWeight = LEARNING_RATE;
    existing.confidence = (existing.confidence * oldWeight) + ((aiResult.confidence || 0.5) * newWeight);
    existing.selector = aiResult.selector || existing.selector;
    existing.value = aiResult.value || existing.value;
    existing.lastSeen = Date.now();
    existing.successCount = (existing.successCount || 0) + 1;
    existing.nodeId = nodeId || NODE_ID;

    // Boost confidence on repeated success
    if (existing.successCount > 3) {
      existing.confidence = Math.min(0.99, existing.confidence + 0.05);
    }
  }

  memory.meta.lastSync = Date.now();
  saveCentralMemory(memory);
  return memory.mappings[stepKey];
}

/**
 * Record a failed AI mapping.
 * Reduces confidence and increments fail counter.
 */
export function recordFailure(stepKey, nodeId) {
  const memory = loadCentralMemory();
  const existing = memory.mappings[stepKey];

  if (existing) {
    existing.confidence = Math.max(0.1, existing.confidence - 0.15);
    existing.failCount = (existing.failCount || 0) + 1;
    existing.lastSeen = Date.now();
    existing.lastError = Date.now();

    // If failed too many times, deprioritize
    if (existing.failCount > existing.successCount) {
      existing.confidence = Math.max(0.05, existing.confidence - 0.2);
    }

    memory.meta.lastSync = Date.now();
    saveCentralMemory(memory);
  }
}

/**
 * Export memory for sharing with another node.
 */
export function exportMemory() {
  const memory = loadCentralMemory();
  return {
    exportedAt: Date.now(),
    nodeId: NODE_ID,
    mappings: memory.mappings,
    meta: {
      totalMappings: Object.keys(memory.mappings).length,
      nodes: memory.meta.nodes
    }
  };
}

/**
 * Import memory from another node (merge with conflict resolution).
 * Latest timestamp wins for each mapping.
 */
export function importMemory(remoteExport) {
  if (!remoteExport || !remoteExport.mappings) return { imported: 0 };

  const memory = loadCentralMemory();
  let imported = 0;

  for (const [key, entry] of Object.entries(remoteExport.mappings)) {
    const local = memory.mappings[key];
    if (!local || entry.lastSeen > local.lastSeen) {
      // Remote has newer or we don't have it
      memory.mappings[key] = {
        ...entry,
        nodeId: entry.nodeId || remoteExport.nodeId,
        // Average the confidence with cross-node learning
        confidence: local
          ? ((local.confidence * 0.5) + (entry.confidence * 0.5))
          : entry.confidence
      };
      imported++;

      // Track the node
      if (remoteExport.nodeId && !memory.meta.nodes.includes(remoteExport.nodeId)) {
        memory.meta.nodes.push(remoteExport.nodeId);
      }
    }
  }

  memory.meta.lastSync = Date.now();
  saveCentralMemory(memory);
  return { imported, total: Object.keys(memory.mappings).length };
}

/**
 * Get summary statistics about the central memory.
 */
export function getMemoryStats() {
  const memory = loadCentralMemory();
  const mappings = Object.values(memory.mappings);
  const avgConfidence = mappings.length
    ? mappings.reduce((s, e) => s + e.confidence, 0) / mappings.length
    : 0;

  return {
    totalMappings: mappings.length,
    averageConfidence: Math.round(avgConfidence * 100) / 100,
    highConfidence: mappings.filter(e => e.confidence >= 0.8).length,
    mediumConfidence: mappings.filter(e => e.confidence >= 0.5 && e.confidence < 0.8).length,
    lowConfidence: mappings.filter(e => e.confidence < 0.5).length,
    totalSuccesses: mappings.reduce((s, e) => s + (e.successCount || 0), 0),
    totalFailures: mappings.reduce((s, e) => s + (e.failCount || 0), 0),
    nodes: memory.meta.nodes,
    lastSync: memory.meta.lastSync
  };
}

export { NODE_ID, MEMORY_DIR };
