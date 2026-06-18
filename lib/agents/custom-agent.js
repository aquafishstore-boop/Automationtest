/**
 * Custom Script Runner Agent
 * Runs any PractiTest-imported script with full AI-driven execution.
 */
import { runTestCaseWithAgent } from "../pathology-workflow.js";

export async function runCustomScriptAgent(options) {
  const { script, variables, patient } = options;
  const result = await runTestCaseWithAgent({ script, variables, patient, callbacks: options.callbacks || {} });
  return result;
}
