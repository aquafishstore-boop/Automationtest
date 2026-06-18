/**
 * API-First Agent Mode
 * REST wrappers for all 9 pathology agents, returning structured results.
 * Each agent can be triggered via POST with JSON body and returns:
 *   { status, steps, screenshots, duration, aiDecisions }
 */

import { getAgentRegistry } from "./agents/index.js";

export function getAgentEndpoints() {
  return getAgentRegistry().map(a => ({
    agent: a.id,
    name: a.name,
    method: "POST",
    path: `/api/agents/${a.id}/run`,
    systems: a.systems,
    testCases: a.testCases,
    implemented: a.implemented,
    requestBody: {
      url: "string (optional)",
      username: "string (optional)",
      password: "string (optional)",
      patientNhs: "string (optional)",
      testCode: "string (optional)",
      workflow: "string (optional, agent-specific)",
      script: "object (custom-script only)",
      async: "boolean (if true, returns jobId immediately)"
    },
    response: {
      status: "passed | failed | completed",
      total: "number",
      passed: "number",
      failed: "number",
      screenshots: "number",
      duration: "number (ms)",
      jobId: "string (if async=true)"
    }
  }));
}

export function formatAgentResponse(result, startTime) {
  const duration = Date.now() - startTime;
  return {
    status: result.passed === result.total ? "passed" : result.failed > 0 ? "failed" : "completed",
    total: result.total || 0,
    passed: result.passed || 0,
    failed: result.failed || 0,
    screenshots: result.screenshots || 0,
    duration,
    timestamp: new Date().toISOString()
  };
}
