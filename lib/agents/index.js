/**
 * Pathology Test Agents — Registry
 * Each agent is specialized for a specific pathology system workflow.
 * All agents follow the same pattern: init → plan → execute → screenshots
 */

export { runADTICETest } from "./adt-ice-agent.js";

/**
 * List all available agents with descriptions.
 */
export function getAgentRegistry() {
  return [
    {
      id: "adt-ice",
      name: "ADT ICE Patient Feed",
      description: "Tests ADT demographic feeds from EPIC/Cerner EPR into ICE",
      systems: ["Surrey ICE", "HPV ICE"],
      eprTypes: ["EPIC", "Cerner", "ADT"],
      testCases: ["A28 New Patient", "A31 Update Address", "A31 Update Name/GP", "A40 Merge", "Deceased/Reverse"],
      workflow: "adt"
    },
    {
      id: "winpath-order-result",
      name: "Winpath Order → Result → Authorise",
      description: "Places an order in Winpath, enters results, authorises, and verifies in ICE",
      systems: ["Winpath Enterprise", "Surrey ICE"],
      testCases: ["Single Test Order", "Multiple Tests", "Result Entry", "Authorisation", "Amended Report"],
      workflow: "winpath"
    },
    {
      id: "surrey-ice-ordering",
      name: "Surrey ICE GP Ordering",
      description: "Orders pathology tests from a GP/Clinic context through to Winpath",
      systems: ["Surrey ICE", "HPV ICE", "UICE"],
      testCases: ["Single Request", "Multiple Tests", "Copy To", "Postponed Order", "Cancellation"],
      workflow: "ice"
    },
    {
      id: "bloodtrack-kiosk",
      name: "BloodTrack Kiosk Operations",
      description: "Tests BloodTrack kiosk workflows: move in, move out, bulk, RTS, emergency release",
      systems: ["BloodTrack"],
      testCases: ["Move In", "Move Out", "Bulk Move", "Return to Stock", "Emergency Release", "Wrong Patient"],
      workflow: "bloodtrack"
    },
    {
      id: "cellavision-results",
      name: "Cellavision Result Verification",
      description: "Verifies Cellavision differential results match Winpath Enterprise",
      systems: ["Cellavision", "Winpath Enterprise"],
      testCases: ["FBC+FILM", "9pt Differential", "NRBCs", "RBC Morphology"],
      workflow: "cellavision"
    },
    {
      id: "custom-script",
      name: "Custom UAT Script Runner",
      description: "Runs any PractiTest-exported script with AI-driven browser automation",
      systems: ["Any"],
      testCases: ["Any"],
      workflow: "custom"
    }
  ];
}
