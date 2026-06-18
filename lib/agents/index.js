/**
 * Pathology Test Agents — Registry
 * All agents follow the same pattern: init -> plan -> execute -> screenshots
 */

export { runADTICETest } from "./adt-ice-agent.js";
export { runWinpathAgent } from "./winpath-agent.js";
export { runICEAgency } from "./ice-agent.js";
export { runCustomScriptAgent } from "./custom-agent.js";
export { runBloodTrackAgent } from "./bloodtrack-agent.js";
export { runCellavisionAgent } from "./cellavision-agent.js";
export { runImmulinkAgent } from "./immulink-agent.js";
export { runWESAgent } from "./wes-agent.js";
export { runCyresAgent } from "./cyres-agent.js";

export function getAgentRegistry() {
  return [
    {
      id: "adt-ice",
      name: "ADT ICE Patient Feed",
      description: "Tests ADT demographic feeds from EPIC/Cerner EPR into ICE",
      systems: ["Surrey ICE", "HPV ICE"],
      eprTypes: ["EPIC", "Cerner", "ADT"],
      testCases: ["A28 New Patient", "A31 Update Address", "A31 Update Name/GP", "A40 Merge", "Deceased/Reverse"],
      workflow: "adt",
      implemented: true
    },
    {
      id: "winpath-order-result",
      name: "Winpath Order -> Result -> Authorise",
      description: "Places an order in Winpath, enters results, authorises, and verifies in ICE",
      systems: ["Winpath Enterprise", "Surrey ICE"],
      testCases: ["Single Test Order", "Multiple Tests", "Result Entry", "Authorisation", "Amended Report"],
      workflow: "winpath",
      implemented: true
    },
    {
      id: "surrey-ice-ordering",
      name: "Surrey ICE GP Ordering",
      description: "Orders pathology tests from a GP/Clinic context through to Winpath",
      systems: ["Surrey ICE", "HPV ICE", "UICE"],
      testCases: ["Single Request", "Multiple Tests", "Copy To", "Postponed Order", "Cancellation"],
      workflow: "ice",
      implemented: true
    },
    {
      id: "bloodtrack-kiosk",
      name: "BloodTrack Kiosk Operations",
      description: "Tests BloodTrack kiosk workflows: move in, move out, bulk, RTS, emergency release",
      systems: ["BloodTrack"],
      testCases: ["Move In", "Move Out", "Bulk Move", "Return to Stock", "Emergency Release", "Wrong Patient"],
      workflow: "bloodtrack",
      implemented: true
    },
    {
      id: "cellavision-results",
      name: "Cellavision Result Verification",
      description: "Verifies Cellavision differential results match Winpath Enterprise",
      systems: ["Cellavision", "Winpath Enterprise"],
      testCases: ["FBC+FILM", "9pt Differential", "NRBCs", "RBC Morphology"],
      workflow: "cellavision",
      implemented: true
    },
    {
      id: "immulink-crossmatch",
      name: "Immulink Crossmatch",
      description: "Tests blood transfusion crossmatching: G&S, antibody ID, crossmatch",
      systems: ["Immulink"],
      testCases: ["Group & Screen", "Antibody ID", "Crossmatch", "Panel Import"],
      workflow: "immulink",
      implemented: true
    },
    {
      id: "wes-eqa",
      name: "WES EQA Scheme Manager",
      description: "Tests External Quality Assessment scheme creation, processing, and reporting",
      systems: ["WES"],
      testCases: ["Scheme Creation", "Sample Distribution", "Result Processing", "Reporting"],
      workflow: "wes",
      implemented: true
    },
    {
      id: "cyres-screening-stats",
      name: "Cyres Screening Statistics",
      description: "Tests cervical screening stats import, validation, KPI dashboards, and reporting",
      systems: ["Cyres"],
      testCases: ["Import Stats", "Validate Stats", "KPI Dashboard", "Report Generation (KC53/KC61)"],
      workflow: "cyres",
      implemented: true
    },
    {
      id: "custom-script",
      name: "Custom UAT Script Runner",
      description: "Runs any PractiTest-exported script with AI-driven browser automation",
      systems: ["Any"],
      testCases: ["Any"],
      workflow: "custom",
      implemented: true
    }
  ];
}
