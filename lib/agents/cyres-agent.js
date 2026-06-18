/**
 * Cyres Screening Stats Agent
 * Tests cervical screening statistics import, validation, and reporting
 */
import { AgenticBrain } from "../agentic-brain.js";

export async function runCyresAgent(options) {
  const workflow = options.workflow || options.testCase || "import-stats";
  const brain = new AgenticBrain({
    goal: `Execute Cyres screening statistics ${workflow}`,
    system: "Cyres",
    testName: `Cyres ${workflow}`,
    callbacks: options.callbacks
  });

  await brain.init();

  brain.plan = [
    { action: "navigate", description: "Navigate to Cyres URL", value: options.url || "" },
    { action: "type", description: "Enter Cyres username", value: options.username || "" },
    { action: "type", description: "Enter Cyres password", value: options.password || "" },
    { action: "click", description: "Click login" },
    { action: "wait", description: "Wait for Cyres dashboard", value: 5000 },
    { action: "screenshot", description: "Cyres main dashboard" },
  ];

  if (workflow === "import-stats") {
    brain.plan.push(
      { action: "click", description: "Open Import Screening Stats" },
      { action: "type", description: "Select import file path", value: options.importPath || "" },
      { action: "click", description: "Upload and parse import file" },
      { action: "wait", description: "Wait for file parsing", value: 5000 },
      { action: "screenshot", description: "Import validation report" },
      { action: "click", description: "Confirm import and process" },
      { action: "wait", description: "Wait for import to complete", value: 3000 },
      { action: "screenshot", description: "Import completed successfully" },
    );
  } else if (workflow === "validate-stats") {
    brain.plan.push(
      { action: "click", description: "Open Validation module" },
      { action: "click", description: "Select period/round to validate" },
      { action: "wait", description: "Wait for validation to load", value: 3000 },
      { action: "screenshot", description: "Screening stats validation view" },
      { action: "click", description: "Run validation checks" },
      { action: "wait", description: "Wait for validation results", value: 5000 },
      { action: "screenshot", description: "Validation check results" },
      { action: "click", description: "Export validation report" },
      { action: "screenshot", description: "Validation report exported" },
    );
  } else if (workflow === "kpi-dashboard") {
    brain.plan.push(
      { action: "click", description: "Open KPI Dashboard" },
      { action: "wait", description: "Wait for KPI data to render", value: 5000 },
      { action: "screenshot", description: "Cyres KPI overview" },
      { action: "click", description: "Open primary screener breakdown" },
      { action: "wait", description: "Wait for screener stats", value: 3000 },
      { action: "screenshot", description: "Primary screener statistics" },
      { action: "click", description: "Export KPI report" },
      { action: "screenshot", description: "KPI report exported" },
    );
  } else if (workflow === "report-generation") {
    brain.plan.push(
      { action: "click", description: "Open Report Generation" },
      { action: "select", description: "Select report type: KC53 / KC61 / custom" },
      { action: "type", description: "Set reporting period", value: options.period || "" },
      { action: "click", description: "Generate report" },
      { action: "wait", description: "Wait for report generation", value: 5000 },
      { action: "screenshot", description: "Generated screening report" },
      { action: "click", description: "Download report" },
      { action: "screenshot", description: "Report downloaded" },
    );
  }

  brain.plan.push(
    { action: "screenshot", description: `Cyres ${workflow} end state` },
  );

  const result = await brain.execute();
  await brain.close();
  return { ...result, brain, screenshots: brain.screenshots };
}
