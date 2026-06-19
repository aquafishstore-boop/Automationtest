/**
 * Accessibility Object Model (AOM) Parser
 * Extracts Playwright's Accessibility Snapshot for AI consumption.
 * Falls back to filtered DOM if AOM returns sparse data (<50% actionable).
 *
 * AOM gives a clean hierarchical JSON of semantic elements:
 *   { role: "button", name: "Authorise" }, { role: "textbox", name: "Patient NHS" }
 *
 * This reduces token usage ~80% vs raw HTML and forces LLM to use
 * screen-reader-compatible selectors.
 */

export function formatAOM(node, depth = 0) {
  if (!node) return [];
  const results = [];
  const indent = "  ".repeat(depth);

  // Only include actionable / informational nodes
  const actionable = ["button", "link", "textbox", "combobox", "listbox", "checkbox",
    "radio", "slider", "switch", "tab", "menuitem", "treeitem", "searchbox",
    "spinbutton", "progressbar", "scrollbar", "gridcell", "heading", "text",
    "table", "cell", "row", "columnheader", "rowheader"];

  if (actionable.includes(node.role)) {
    const name = (node.name || "").trim();
    const value = (node.valueString || node.value || "").trim();
    const description = (node.description || "").trim();
    const focused = node.focused ? " [FOCUSED]" : "";

    let line = `${indent}<${node.role}`;
    if (name) line += ` name="${name}"`;
    if (value && value !== name) line += ` value="${value}"`;
    if (description) line += ` desc="${description}"`;
    if (focused) line += focused;
    line += ">";

    // Include child text for headings and cells
    if (["heading", "text", "cell", "rowheader", "columnheader"].includes(node.role) && name) {
      line += ` ${name}`;
    }

    results.push(line);
  }

  if (node.children) {
    for (const child of node.children) {
      results.push(...formatAOM(child, depth + 1));
    }
  }

  return results;
}

export async function getAccessibilityTree(page) {
  try {
    const snapshot = await page.accessibility.snapshot();
    if (!snapshot) return { aom: [], score: 0 };
    const lines = formatAOM(snapshot);
    const actionableCount = lines.length;
    // Score: ratio of actionable nodes vs total deep nodes
    const totalNodes = countNodes(snapshot);
    const score = totalNodes > 0 ? actionableCount / totalNodes : 0;
    return { aom: lines, score, totalNodes, actionableCount };
  } catch (err) {
    return { aom: [], score: 0, error: err.message };
  }
}

function countNodes(node) {
  if (!node) return 0;
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

export function getBestSnapshot(page, domHtml) {
  return getAccessibilityTree(page).then(({ aom, score, actionableCount }) => {
    // If AOM has good coverage (>50% actionable), use it
    if (score >= 0.5 && actionableCount >= 3) {
      return {
        source: "aom",
        content: aom.join("\n"),
        tokenEstimate: aom.length * 15,
        actionableCount
      };
    }
    // Fall back to filtered DOM
    const filtered = filterDOMSimple(domHtml || "");
    return {
      source: "dom",
      content: filtered.slice(0, 3000),
      tokenEstimate: filtered.length / 4,
      actionableCount: filtered.split("\n").length
    };
  }).catch(() => ({
    source: "dom",
    content: filterDOMSimple(domHtml || "").slice(0, 3000),
    tokenEstimate: 0,
    actionableCount: 0
  }));
}

function filterDOMSimple(html) {
  if (!html) return "";
  const interactive = [];
  const extract = (regex, wrap) => {
    let m;
    while ((m = regex.exec(html)) !== null) {
      const text = m[0].replace(/<[^>]*>/g, "").trim();
      const id = m[0].match(/id=["']([^"']+)["']/)?.[1] || "";
      if (text || id) interactive.push(`<${wrap} id="${id}">${text}</${wrap}>`);
    }
  };
  extract(/<button[^>]*>[\s\S]*?<\/button>/gi, "button");
  extract(/<a[^>]*>[\s\S]*?<\/a>/gi, "a");
  extract(/<input[^>]*\/?>/gi, "input");
  extract(/<select[^>]*>[\s\S]*?<\/select>/gi, "select");
  extract(/<textarea[^>]*>[\s\S]*?<\/textarea>/gi, "textarea");
  extract(/<label[^>]*>[\s\S]*?<\/label>/gi, "label");
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) interactive.unshift(`<title>${titleMatch[1].trim()}</title>`);
  return interactive.join("\n");
}
