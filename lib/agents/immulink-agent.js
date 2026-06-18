/**
 * Immulink Crossmatch Agent
 * Tests blood transfusion crossmatching workflows: G&S, antibody ID, panel imports
 */
import { AgenticBrain } from "../agentic-brain.js";

export async function runImmulinkAgent(options) {
  const workflow = options.workflow || options.testCase || "group-and-screen";
  const brain = new AgenticBrain({
    goal: `Execute Immulink ${workflow} for patient ${options.patientNhs || ""}`,
    system: "Immulink",
    testName: `Immulink ${workflow}`,
    callbacks: options.callbacks
  });

  await brain.init();

  brain.plan = [
    { action: "navigate", description: "Navigate to Immulink URL", value: options.url || "" },
    { action: "type", description: "Enter Immulink username", value: options.username || "" },
    { action: "type", description: "Enter Immulink password", value: options.password || "" },
    { action: "click", description: "Click login" },
    { action: "wait", description: "Wait for Immulink dashboard", value: 5000 },
    { action: "screenshot", description: "Immulink main screen" },
  ];

  if (workflow === "group-and-screen") {
    brain.plan.push(
      { action: "click", description: "Open Group & Screen module" },
      { action: "type", description: `Search for patient: ${options.patientNhs || ""}` },
      { action: "click", description: "Select patient from results" },
      { action: "wait", description: "Wait for G&S screen to load", value: 3000 },
      { action: "screenshot", description: "ABO/Rh grouping results" },
      { action: "click", description: "Check antibody screen result" },
      { action: "screenshot", description: "Antibody screen results" },
      { action: "click", description: "Verify historical G&S records" },
      { action: "screenshot", description: "Historical G&S comparison" },
    );
  } else if (workflow === "antibody-id") {
    brain.plan.push(
      { action: "click", description: "Open Antibody Identification module" },
      { action: "type", description: `Search for patient: ${options.patientNhs || ""}` },
      { action: "click", description: "Select the positive antibody screen" },
      { action: "wait", description: "Wait for panel results", value: 3000 },
      { action: "screenshot", description: "Antibody panel results" },
      { action: "click", description: "Run auto-identification" },
      { action: "wait", description: "Wait for identification result", value: 3000 },
      { action: "screenshot", description: "Antibody identification outcome" },
    );
  } else if (workflow === "crossmatch") {
    brain.plan.push(
      { action: "click", description: "Open Crossmatch module" },
      { action: "type", description: `Search for patient: ${options.patientNhs || ""}` },
      { action: "click", description: "Select patient for crossmatch" },
      { action: "type", description: `Enter unit barcode: ${options.componentBarcode || ""}` },
      { action: "click", description: "Run AHG crossmatch" },
      { action: "wait", description: "Wait for crossmatch result", value: 5000 },
      { action: "screenshot", description: "Crossmatch result" },
      { action: "click", description: "Complete crossmatch record" },
      { action: "screenshot", description: "Crossmatch issued" },
    );
  }

  brain.plan.push(
    { action: "screenshot", description: `Immulink ${workflow} end state` },
  );

  const result = await brain.execute();
  await brain.close();
  return { ...result, brain, screenshots: brain.screenshots };
}
