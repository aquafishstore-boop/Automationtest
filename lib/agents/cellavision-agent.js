/**
 * Cellavision Result Verification Agent
 * Captures differential results from Cellavision and verifies they match Winpath
 */
import { AgenticBrain } from "../agentic-brain.js";

export async function runCellavisionAgent(options) {
  const brain = new AgenticBrain({
    goal: `Verify Cellavision differential results for patient ${options.patientNhs || ""} against Winpath`,
    system: "Cellavision",
    testName: "Cellavision Result Verification",
    callbacks: options.callbacks
  });

  await brain.init();

  brain.plan = [
    { action: "navigate", description: "Navigate to Cellavision URL", value: options.cellavisionUrl || options.url || "" },
    { action: "type", description: "Enter Cellavision username", value: options.username || "" },
    { action: "type", description: "Enter Cellavision password", value: options.password || "" },
    { action: "click", description: "Click login" },
    { action: "wait", description: "Wait for Cellavision dashboard", value: 5000 },
    { action: "screenshot", description: "Cellavision dashboard" },
    { action: "click", description: `Open patient worklist` },
    { action: "type", description: `Search by patient ID or sample: ${options.patientNhs || options.sampleId || ""}` },
    { action: "click", description: "Execute patient search" },
    { action: "wait", description: "Wait for search results", value: 3000 },
    { action: "screenshot", description: "Patient results in Cellavision" },
    { action: "click", description: `Open differential result for sample` },
    { action: "wait", description: "Wait for differential view to load", value: 3000 },
    { action: "screenshot", description: "Cellavision pre-classification results" },
    { action: "click", description: "Open Cellavision image gallery" },
    { action: "screenshot", description: "Cellavision cell images" },
    { action: "click", description: `Navigate to Winpath to cross-verify` },
    { action: "type", description: "Enter Winpath password if prompted", value: options.password || "" },
    { action: "wait", description: "Wait for Winpath verification screen", value: 5000 },
    { action: "screenshot", description: "Winpath result cross-reference" },
  ];

  const result = await brain.execute();
  await brain.close();
  return { ...result, brain, screenshots: brain.screenshots };
}
