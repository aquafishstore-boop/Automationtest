/**
 * Pathology Workflow Engine
 * 
 * Specialized workflows for pathology LIS testing:
 * - Order entry → Booking → Result entry → Authorisation → ICE verification
 * - Each step uses AI-driven browser automation with screenshot evidence
 * - Knows about Winpath, Surrey ICE, HPV ICE, EPIC/Cerner ADT, BloodTrack
 */

import { AgenticBrain } from "./agentic-brain.js";

/**
 * ADT (Admit-Discharge-Transfer) Workflow
 * Tests patient demographic feeds from EPR (EPIC/Cerner) into ICE
 */
export async function runADTWorkflow(options) {
  const { trust, patient, testCase } = options;
  const brain = new AgenticBrain({
    goal: testCase.description,
    system: `ADT-${trust}`,
    testName: testCase.name,
    callbacks: options.callbacks
  });

  await brain.init();
  await brain.plan(testCase.description);
  const result = await brain.execute();
  await brain.close();
  return { ...result, brain };
}

/**
 * Winpath Order → Result → Authorise Workflow
 * The core pathology testing loop
 */
export async function runWinpathWorkflow(options) {
  const { orderData, patient, testCase } = options;
  const brain = new AgenticBrain({
    goal: `Place order for ${orderData.testCode || "test"} in Winpath, enter results, authorise`,
    system: "Winpath",
    testName: testCase.name,
    callbacks: options.callbacks
  });

  await brain.init();
  
  // Build the plan for the full order→result workflow
  const plan = [
    { action: "navigate", description: "Navigate to Winpath login page", value: options.url || "" },
    { action: "type", description: "Enter Winpath username", selector: "", value: options.username || "" },
    { action: "type", description: "Enter Winpath password", selector: "", value: options.password || "" },
    { action: "click", description: "Click the login button to access Winpath", selector: "" },
    { action: "wait", description: "Wait for Winpath main screen to load", value: 5000 },
    { action: "click", description: "Open the Request Entry module", selector: "" },
    { action: "type", description: `Enter order number or patient ID: ${patient?.nhsNumber || ""}`, selector: "", value: patient?.nhsNumber || "" },
    { action: "click", description: "Click search to find the order", selector: "" },
    { action: "wait", description: "Wait for order details to appear", value: 3000 },
    { action: "screenshot", description: `Capture order details for ${orderData.testCode}` },
    { action: "type", description: `Enter result value: ${orderData.result || "7.5"} into the result field`, selector: "", value: orderData.result || "7.5" },
    { action: "select", description: "Select result status: Completed or Final", selector: "", value: "Completed" },
    { action: "click", description: "Click save to store the result", selector: "" },
    { action: "wait", description: "Wait for result to be saved", value: 2000 },
    { action: "screenshot", description: "Capture result entry screen" },
    { action: "click", description: "Open the Authorisation queue", selector: "" },
    { action: "click", description: "Select the order and authorise it", selector: "" },
    { action: "wait", description: "Wait for authorisation to complete", value: 3000 },
    { action: "screenshot", description: "Capture authorised result screen" },
    { action: "click", description: "Open ICE or results viewer to verify the result", selector: "" },
    { action: "wait", description: "Wait for results to load", value: 3000 },
    { action: "screenshot", description: "Capture final verified result in ICE" },
  ];

  brain.plan = plan;
  const result = await brain.execute();
  await brain.close();
  return { ...result, brain };
}

/**
 * Surrey ICE Order Workflow
 * Tests ordering from a GP/Clinic context through to Winpath
 */
export async function runSurreyICEWorkflow(options) {
  const { testCode, patient, testCase, variables } = options;
  const brain = new AgenticBrain({
    goal: `Place ${testCode} order in Surrey ICE for patient ${patient?.nhsNumber || "test"}`,
    system: "Surrey ICE",
    testName: testCase.name,
    callbacks: options.callbacks
  });

  await brain.init();

  const plan = [
    { action: "navigate", description: "Navigate to Surrey ICE or HPV ICE URL", value: variables?.BASE_URL || "" },
    { action: "type", description: "Enter ICE username", selector: "", value: variables?.USERNAME || "" },
    { action: "type", description: "Enter ICE password", selector: "", value: variables?.PASSWORD || "" },
    { action: "click", description: "Click Sign In button to log into ICE", selector: "" },
    { action: "wait", description: "Wait for ICE dashboard to load completely", value: 5000 },
    { action: "screenshot", description: "ICE login confirmed" },
    { action: "click", description: "Open patient search and search for patient", selector: "" },
    { action: "type", description: `Enter patient NHS number: ${patient?.nhsNumber || ""}`, selector: "", value: patient?.nhsNumber || "" },
    { action: "click", description: "Click search to find the patient record", selector: "" },
    { action: "wait", description: "Wait for patient selection to load", value: 3000 },
    { action: "click", description: "Select the matching patient from results", selector: "" },
    { action: "screenshot", description: "Patient demographics confirmed" },
    { action: "click", description: "Click New Request or Order to place a test", selector: "" },
    { action: "click", description: `Select test: ${testCode} from the test catalogue`, selector: "" },
    { action: "wait", description: "Wait for test to be added to order", value: 2000 },
    { action: "click", description: "Complete the order and accept/save", selector: "" },
    { action: "wait", description: "Wait for order confirmation", value: 3000 },
    { action: "screenshot", description: `Order placed for ${testCode}` },
    { action: "click", description: "Print the request form or capture order ID", selector: "" },
    { action: "screenshot", description: "Request form with order barcode" },
  ];

  brain.plan = plan;
  const result = await brain.execute();
  await brain.close();
  return { ...result, brain };
}

/**
 * Run any test case from the UAT tester's scripts using agentic browser automation.
 */
export async function runTestCaseWithAgent(options) {
  const { script, variables, patient } = options;
  const brain = new AgenticBrain({
    goal: script.description || script.name,
    system: script.system || "System",
    testName: script.name || "Test",
    runId: options.runId,
    callbacks: options.callbacks
  });

  await brain.init();
  
  // Merge patient data into variables
  const mergedVars = { ...variables };
  if (patient) {
    mergedVars.PATIENT_NHS = patient.nhsNumber || mergedVars.PATIENT_NHS;
    mergedVars.PATIENT_NAME = `${patient.forename || ""} ${patient.surname || ""}`.trim() || mergedVars.PATIENT_NAME;
  }

  const result = await brain.runScript(script, mergedVars);
  await brain.close();
  return { ...result, brain, screenshots: brain.screenshots };
}
