/**
 * WES EQA Agent
 * Tests External Quality Assessment scheme creation, processing, and reporting
 */
import { AgenticBrain } from "../agentic-brain.js";

export async function runWESAgent(options) {
  const workflow = options.workflow || options.testCase || "scheme-creation";
  const brain = new AgenticBrain({
    goal: `Execute WES EQA ${workflow} for scheme ${options.schemeId || "default"}`,
    system: "WES",
    testName: `WES EQA ${workflow}`,
    callbacks: options.callbacks
  });

  await brain.init();

  brain.plan = [
    { action: "navigate", description: "Navigate to WES EQA URL", value: options.url || "" },
    { action: "type", description: "Enter WES username", value: options.username || "" },
    { action: "type", description: "Enter WES password", value: options.password || "" },
    { action: "click", description: "Click login" },
    { action: "wait", description: "Wait for WES dashboard", value: 5000 },
    { action: "screenshot", description: "WES EQA main dashboard" },
  ];

  if (workflow === "scheme-creation") {
    brain.plan.push(
      { action: "click", description: "Open Create New Scheme" },
      { action: "type", description: `Enter scheme name: ${options.schemeName || "EQA Scheme"}` },
      { action: "select", description: "Select scheme type / discipline" },
      { action: "type", description: "Set scheme start date", value: options.startDate || "" },
      { action: "type", description: "Set scheme end date", value: options.endDate || "" },
      { action: "click", description: "Add participating laboratories" },
      { action: "click", description: `Select lab from list: ${options.labId || ""}` },
      { action: "click", description: "Confirm scheme participants" },
      { action: "click", description: "Save and activate scheme" },
      { action: "screenshot", description: "Scheme created and activated" },
    );
  } else if (workflow === "sample-distribution") {
    brain.plan.push(
      { action: "click", description: "Open Sample Distribution" },
      { action: "click", description: `Select scheme: ${options.schemeId || options.schemeName || ""}` },
      { action: "type", description: `Enter EQA sample IDs: ${options.sampleIds || ""}` },
      { action: "click", description: "Assign samples to labs" },
      { action: "wait", description: "Wait for distribution report", value: 3000 },
      { action: "screenshot", description: "Sample distribution completed" },
    );
  } else if (workflow === "result-processing") {
    brain.plan.push(
      { action: "click", description: "Open Results Processing" },
      { action: "click", description: `Select active scheme for processing` },
      { action: "wait", description: "Wait for results to load", value: 3000 },
      { action: "screenshot", description: "Submitted results overview" },
      { action: "click", description: "Run consensus calculation" },
      { action: "wait", description: "Wait for consensus", value: 5000 },
      { action: "screenshot", description: "Consensus calculation complete" },
      { action: "click", description: "Generate performance report" },
      { action: "wait", description: "Wait for report generation", value: 3000 },
      { action: "screenshot", description: "EQA performance report" },
    );
  } else if (workflow === "reporting") {
    brain.plan.push(
      { action: "click", description: "Open Reporting module" },
      { action: "click", description: `Select completed scheme for reporting` },
      { action: "wait", description: "Wait for report options", value: 3000 },
      { action: "screenshot", description: "Reporting options" },
      { action: "click", description: "Generate final scheme report" },
      { action: "wait", description: "Wait for final report generation", value: 5000 },
      { action: "screenshot", description: "Final EQA report generated" },
    );
  }

  brain.plan.push(
    { action: "screenshot", description: `WES ${workflow} end state` },
  );

  const result = await brain.execute();
  await brain.close();
  return { ...result, brain, screenshots: brain.screenshots };
}
