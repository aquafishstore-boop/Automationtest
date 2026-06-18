/**
 * ADT ICE Patient Feed Agent
 * 
 * Specialized for testing ADT (Admit-Discharge-Transfer) demographic feeds
 * from EPIC/Cerner EPR systems into Surrey ICE / HPV ICE.
 * 
 * Workflow:
 *   1. Create/update patient in EPR → 2. Verify in ICE → 3. Screenshot match
 *   4. Update demographics in EPR → 5. Verify update in ICE → 6. Screenshot
 *   7. (Optional) Test merge/unmerge → 8. (Optional) Test deceased/reverse
 */
import { AgenticBrain } from "../agentic-brain.js";

export async function runADTICETest(options) {
  const { trust, patient, eprType, iceType } = options;
  const trustLabel = trust || "UNKNOWN";
  const brain = new AgenticBrain({
    goal: `ADT ${eprType || "EPR"} → ${iceType || "ICE"} patient feed test for ${trustLabel}`,
    system: `ADT-${trustLabel}`,
    testName: options.testName || `ADT Feed - ${trustLabel}`,
    callbacks: options.callbacks
  });

  await brain.init();

  brain.plan = [
    { action: "navigate", description: `Launch ${eprType || "EPR"} system and log in` },
    { action: "click", description: "Register a new patient with surname starting ZZZTEST" },
    { action: "type", value: patient?.nhsNumber || "9990575924", description: "Enter patient NHS number" },
    { action: "type", value: "ZZZTEST", description: "Enter patient surname as ZZZTEST" },
    { action: "type", value: patient?.forename || "ADTTest", description: "Enter patient first name" },
    { action: "type", value: patient?.dob || "1980-01-01", description: "Enter patient date of birth" },
    { action: "select", value: patient?.gender || "Male", description: "Select patient gender" },
    { action: "type", value: "123 Test Street, Guildford", description: "Enter patient address" },
    { action: "click", description: "Save the new patient record" },
    { action: "screenshot", description: `New patient created in ${eprType}` },
    { action: "navigate", description: `Launch ${iceType || "ICE"} system for verification` },
    { action: "type", value: patient?.nhsNumber || "9990575924", description: "Search for patient by NHS number" },
    { action: "click", description: "Execute the patient search" },
    { action: "wait", value: 3000, description: "Wait for search results" },
    { action: "click", description: "Select the matching patient record" },
    { action: "screenshot", description: `Patient verified in ${iceType} with matching demographics` },
    { action: "navigate", description: `Return to ${eprType} to update patient` },
    { action: "click", description: "Edit the patient's address and postcode" },
    { action: "type", value: "456 Updated Road, Woking", description: "Change patient address" },
    { action: "click", description: "Save the updated demographics" },
    { action: "screenshot", description: `Patient updated in ${eprType}` },
    { action: "navigate", description: `Return to ${iceType} to verify update` },
    { action: "click", description: "Search for the same patient again" },
    { action: "screenshot", description: `Updated demographics confirmed in ${iceType}` },
    { action: "screenshot", description: "Final evidence with timestamp" },
  ];

  if (options.testMerge) {
    brain.plan.push(...[
      { action: "navigate", description: `Return to ${eprType} to create duplicate patient` },
      { action: "click", description: "Register second patient with same demographics" },
      { action: "type", value: "ZZZTEST-DUP", description: "Create duplicate patient" },
      { action: "click", description: "Save duplicate patient" },
      { action: "navigate", description: `Merge duplicate into original in ${eprType}` },
      { action: "wait", value: 3000, description: "Wait for merge to complete" },
      { action: "navigate", description: `Verify merged patient in ${iceType}` },
      { action: "screenshot", description: "Merged patient showing both identifiers" },
    ]);
  }

  if (options.testDeceased) {
    brain.plan.push(...[
      { action: "navigate", description: `Set patient as deceased in ${eprType}` },
      { action: "click", description: "Mark patient as deceased with date of death" },
      { action: "screenshot", description: "Patient marked deceased in EPR" },
      { action: "navigate", description: `Verify deceased status in ${iceType}` },
      { action: "screenshot", description: "Deceased indicator visible in ICE" },
      { action: "navigate", description: `Reverse deceased status in ${eprType}` },
      { action: "click", description: "Remove deceased marker from patient" },
      { action: "screenshot", description: "Deceased status removed in EPR" },
      { action: "navigate", description: `Verify reversal in ${iceType}` },
      { action: "screenshot", description: "Deceased indicator removed in ICE" },
    ]);
  }

  const result = await brain.execute();
  await brain.close();
  return { ...result, brain, screenshots: brain.screenshots };
}
