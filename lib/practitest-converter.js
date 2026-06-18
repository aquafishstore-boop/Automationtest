import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = process.env.SCRIPTS_DIR || path.join(__dirname, "..", "scripts");

/**
 * Parse CSV content handling multi-line quoted fields properly.
 * Splits on commas only when outside quotes, handles \n inside quotes.
 */
function parseCSV(csvContent) {
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const ch = csvContent[i];
    const next = csvContent[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++; // skip \r in \r\n
      if (currentField.trim() || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        currentField = "";
      }
      if (currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [];
      }
    } else {
      currentField += ch;
    }
  }

  // Last field/row
  if (currentField.trim() || currentRow.length > 0) {
    currentRow.push(currentField.trim());
  }
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Parse a PractiTest CSV export and return structured test cases.
 */
export function parsePractitestCSV(csvContent) {
  const rows = parseCSV(csvContent);
  if (rows.length < 2) return [];

  const headers = rows[0];
  const stepNameIdx = headers.indexOf("Step name");
  const stepDescIdx = headers.indexOf("Step description");
  const stepExpectedIdx = headers.indexOf("Step expected_results");
  const stepPosIdx = headers.indexOf("Step position");
  const idIdx = headers.indexOf("id");
  const nameIdx = headers.indexOf("Name");
  const descIdx = headers.indexOf("Description");
  const systemIdx = headers.indexOf("System");
  const appIdx = headers.indexOf("App");
  const deptIdx = headers.indexOf("Department");

  if (stepNameIdx === -1 || idIdx === -1) {
    throw new Error("CSV must have 'id', 'Step name', 'Step description' columns");
  }

  // Group rows by test case ID
  const testCases = new Map();

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const testId = cols[idIdx] || "";
    const stepName = cols[stepNameIdx] || "";
    const stepDesc = cols[stepDescIdx] || "";
    const stepExpected = cols[stepExpectedIdx] || "";

    if (!testId && !stepName) continue;

    if (!testCases.has(testId)) {
      testCases.set(testId, {
        id: testId,
        name: (cols[nameIdx] || `Test Case ${testId}`).replace(/\s+/g, " ").trim(),
        description: (cols[descIdx] || "").replace(/\s+/g, " ").trim().slice(0, 200),
        system: cols[systemIdx] || cols[appIdx] || "Unknown",
        department: cols[deptIdx] || "",
        steps: []
      });
    }

    const tc = testCases.get(testId);
    tc.steps.push({
      id: `step-${tc.steps.length + 1}`,
      description: stepName.replace(/\s+/g, " ").trim() || `Step ${tc.steps.length + 1}`,
      action: "screenshot",
      expected: stepExpected.replace(/\s+/g, " ").trim().slice(0, 200)
    });
  }

  return Array.from(testCases.values());
}

/**
 * Convert a parsed test case into our JSON script format.
 */
function testCaseToScript(tc, variables) {
  const steps = tc.steps.map((step, i) => ({
    id: step.id,
    description: step.description,
    action: "screenshot",
    expected: step.expected,
    takeScreenshot: true
  }));

  return {
    name: tc.name,
    practitestId: tc.id,
    description: tc.description,
    system: tc.system,
    department: tc.department,
    practitestExport: true,
    version: "1.0",
    variables: variables || [],
    steps
  };
}

/**
 * Convert all PractiTest test cases to JSON scripts and save them.
 */
export function convertAndSave(csvContent, options = {}) {
  const testCases = parsePractitestCSV(csvContent);
  const saved = [];

  for (const tc of testCases) {
    const script = testCaseToScript(tc, options.variables);
    
    // Safe filename: truncate and sanitize
    const safeName = tc.name
      .replace(/[^a-zA-Z0-9\s_-]/g, "")  // remove special chars
      .replace(/\s+/g, "_")               // spaces to underscores
      .replace(/_+/g, "_")                // collapse underscores
      .replace(/^_|_$/g, "")              // trim underscores
      .slice(0, 50);                      // max 50 chars

    // If name is empty after sanitizing, use a hash
    const finalName = safeName || `tc-${tc.id}`;
    const filename = `pt-${tc.id}-${finalName}.json`;
    const filePath = path.join(SCRIPTS_DIR, filename);

    fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(script, null, 2), "utf-8");
    saved.push({ filename, name: tc.name, id: tc.id, steps: tc.steps.length });
  }

  return saved;
}
