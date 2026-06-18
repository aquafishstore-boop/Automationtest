/**
 * BloodTrack Kiosk Operations Agent
 * Tests blood tracking kiosk workflows: move in, move out, bulk, RTS, emergency release
 */
import { AgenticBrain } from "../agentic-brain.js";

export async function runBloodTrackAgent(options) {
  const workflow = options.workflow || options.testCase || "move-in";
  const brain = new AgenticBrain({
    goal: `Execute BloodTrack ${workflow} workflow for patient ${options.patientNhs || ""}`,
    system: "BloodTrack",
    testName: `BloodTrack ${workflow}`,
    callbacks: options.callbacks
  });

  await brain.init();

  brain.plan = [
    { action: "navigate", description: "Navigate to BloodTrack kiosk URL", value: options.url || "" },
    { action: "type", description: "Enter BloodTrack login credentials", value: options.username || "" },
    { action: "type", description: "Enter BloodTrack password", value: options.password || "" },
    { action: "click", description: "Click login to access kiosk" },
    { action: "wait", description: "Wait for kiosk main screen", value: 5000 },
    { action: "screenshot", description: "BloodTrack kiosk main screen" },
  ];

  if (workflow === "move-in") {
    brain.plan.push(
      { action: "click", description: "Select Move In / Register" },
      { action: "type", description: `Scan patient wristband: ${options.patientNhs || ""}` },
      { action: "click", description: "Verify patient and proceed" },
      { action: "type", description: `Enter blood component barcode: ${options.componentBarcode || ""}` },
      { action: "click", description: "Confirm component match" },
      { action: "screenshot", description: "Move In completed" },
    );
  } else if (workflow === "move-out") {
    brain.plan.push(
      { action: "click", description: "Select Move Out / Issue" },
      { action: "type", description: `Scan patient wristband: ${options.patientNhs || ""}` },
      { action: "click", description: `Select component: ${options.componentBarcode || ""}` },
      { action: "type", description: "Enter issue notes if required" },
      { action: "click", description: "Confirm issue" },
      { action: "screenshot", description: "Move Out completed" },
    );
  } else if (workflow === "bulk") {
    brain.plan.push(
      { action: "click", description: "Select Bulk / Stock Management" },
      { action: "type", description: `Scan or enter component IDs` },
      { action: "click", description: "Confirm bulk stock entry" },
      { action: "screenshot", description: "Bulk stock processed" },
    );
  } else if (workflow === "rts") {
    brain.plan.push(
      { action: "click", description: "Select Return to Stock" },
      { action: "type", description: `Scan component barcode to return: ${options.componentBarcode || ""}` },
      { action: "click", description: "Confirm return condition check" },
      { action: "select", description: "Select condition: Fit for Reissue" },
      { action: "click", description: "Complete return" },
      { action: "screenshot", description: "RTS completed" },
    );
  } else if (workflow === "emergency-release") {
    brain.plan.push(
      { action: "click", description: "Select Emergency Release / O-Negative" },
      { action: "type", description: `Enter requesting clinician ID: ${options.clinicianId || ""}` },
      { action: "type", description: "Enter clinical reason for emergency release" },
      { action: "click", description: "Confirm emergency override" },
      { action: "screenshot", description: "Emergency release complete" },
    );
  }

  brain.plan.push(
    { action: "click", description: "Return to kiosk home" },
    { action: "screenshot", description: "BloodTrack kiosk end state" },
  );

  const result = await brain.execute();
  await brain.close();
  return { ...result, brain, screenshots: brain.screenshots };
}
