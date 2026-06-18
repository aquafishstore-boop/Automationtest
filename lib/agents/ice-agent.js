/**
 * Surrey ICE / HPV ICE GP Ordering Agent
 */
import { AgenticBrain } from "../agentic-brain.js";

export async function runICEAgency(options) {
  const brain = new AgenticBrain({
    goal: `Place ${options.testCode || "pathology"} order in ${options.iceType || "ICE"} for patient ${options.patientNhs || ""}`,
    system: options.iceType || "Surrey ICE",
    testName: options.testName || "ICE Ordering",
    callbacks: options.callbacks
  });

  await brain.init();

  brain.plan = [
    { action: "navigate", description: `Navigate to ${options.iceType || "ICE"} URL`, value: options.url || "" },
    { action: "type", description: "Enter ICE username", value: options.username || "" },
    { action: "type", description: "Enter ICE password", value: options.password || "" },
    { action: "click", description: "Click Sign In to log into ICE" },
    { action: "wait", description: "Wait for ICE dashboard to load", value: 5000 },
    { action: "screenshot", description: "ICE login confirmed" },
    { action: "click", description: "Open patient search" },
    { action: "type", description: `Search by NHS number: ${options.patientNhs || ""}`, value: options.patientNhs || "" },
    { action: "click", description: "Execute patient search" },
    { action: "wait", description: "Wait for search results", value: 3000 },
    { action: "click", description: "Select the matching patient" },
    { action: "screenshot", description: "Patient demographics confirmed" },
    { action: "click", description: "Click New Request to place an order" },
    { action: "click", description: `Select test: ${options.testCode || "FBC"} from catalogue` },
    { action: "wait", description: "Wait for test to be added", value: 2000 },
    { action: "click", description: "Complete and accept the order" },
    { action: "wait", description: "Wait for order confirmation", value: 3000 },
    { action: "screenshot", description: `Order placed for ${options.testCode || "test"}` },
    { action: "click", description: "Print or capture the order form" },
    { action: "screenshot", description: "Order form with details" },
  ];

  const result = await brain.execute();
  await brain.close();
  return { ...result, brain, screenshots: brain.screenshots };
}
