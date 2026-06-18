/**
 * Winpath Order -> Result -> Authorise Agent
 * Uses pathology-workflow.js core with Winpath-specific UI knowledge.
 */
import { AgenticBrain } from "../agentic-brain.js";

export async function runWinpathAgent(options) {
  const brain = new AgenticBrain({
    goal: options.description || "Place order, enter results, authorise in Winpath",
    system: "Winpath Enterprise",
    testName: options.testName || "Winpath Workflow",
    callbacks: options.callbacks
  });

  await brain.init();

  brain.plan = [
    { action: "navigate", description: "Navigate to Winpath Enterprise URL", value: options.url || "" },
    { action: "type", description: "Enter Winpath username", value: options.username || "" },
    { action: "type", description: "Enter Winpath password", value: options.password || "" },
    { action: "click", description: "Click the login button" },
    { action: "wait", description: "Wait for Winpath main menu to load", value: 5000 },
    { action: "screenshot", description: "Winpath login confirmed" },
    { action: "click", description: `Open Request Entry module` },
    { action: "type", description: `Search for order or patient: ${options.patientNhs || ""}` },
    { action: "click", description: "Execute the search" },
    { action: "wait", description: "Wait for results to load", value: 3000 },
    { action: "screenshot", description: "Order found in Winpath" },
    { action: "type", description: `Enter result value: ${options.resultValue || "7.5"}`, value: options.resultValue || "7.5" },
    { action: "select", description: "Select result status: Final/Completed" },
    { action: "click", description: "Save the result" },
    { action: "wait", description: "Wait for save confirmation", value: 2000 },
    { action: "screenshot", description: "Result saved in Winpath" },
    { action: "click", description: "Open Authorisation queue" },
    { action: "click", description: "Select the order and authorise" },
    { action: "wait", description: "Wait for authorisation", value: 3000 },
    { action: "screenshot", description: "Result authorised in Winpath" },
    { action: "click", description: "Open ICE or results viewer" },
    { action: "wait", description: "Wait for results to load in ICE", value: 5000 },
    { action: "screenshot", description: "Result verified in ICE" },
  ];

  const result = await brain.execute();
  await brain.close();
  return { ...result, brain, screenshots: brain.screenshots };
}
