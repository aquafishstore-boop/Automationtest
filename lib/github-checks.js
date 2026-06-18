/**
 * GitHub Status Checks
 * Posts test results as GitHub commit statuses.
 * Requires GITHUB_TOKEN and GITHUB_REPO env vars.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";

function getApiBase() {
  if (!GITHUB_REPO.includes("/")) return null;
  return `https://api.github.com/repos/${GITHUB_REPO}`;
}

export async function postCommitStatus(sha, result) {
  const apiBase = getApiBase();
  if (!apiBase || !GITHUB_TOKEN) return { error: "GITHUB_TOKEN and GITHUB_REPO required (format: owner/repo)" };
  if (!/^[a-f0-9]{40}$/.test(sha) && sha.length !== 40) return { error: "Invalid commit SHA" };

  const passed = result.passed || 0;
  const failed = result.failed || 0;
  const total = result.total || passed + failed;
  const state = failed > 0 ? "failure" : total > 0 ? "success" : "pending";

  try {
    const resp = await fetch(`${apiBase}/statuses/${sha}`, {
      method: "POST",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json"
      },
      body: JSON.stringify({
        state,
        target_url: result.runUrl || "https://UATAPPv1.aetheriscloudgroup.uk",
        description: `UAT: ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ""}`,
        context: `UAT Tester / ${result.agentType || "pathology"}`
      }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await resp.json();
    return { posted: resp.ok, status: state, sha, response: data.id ? "ok" : data.message };
  } catch (err) {
    return { posted: false, error: err.message };
  }
}

export async function postPRComment(prNumber, result) {
  const apiBase = getApiBase();
  if (!apiBase || !GITHUB_TOKEN) return { error: "GitHub not configured" };

  const total = result.total || 0;
  const passed = result.passed || 0;
  const failed = result.failed || 0;
  const screenshots = result.screenshots || 0;
  const system = result.system || "Unknown";

  const body = `## UAT Test Results\n\n**System:** ${system}\n**Status:** ${failed > 0 ? "❌" : "✅"} ${passed}/${total} passed\n\n| Metric | Value |\n|--------|-------|\n| Passed | ${passed} |\n| Failed | ${failed} |\n| Screenshots | ${screenshots} |\n| Duration | ${result.duration || "N/A"} |\n\n[View Full Report](https://UATAPPv1.aetheriscloudgroup.uk)`;

  try {
    const resp = await fetch(`${apiBase}/issues/${prNumber}/comments`, {
      method: "POST",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json"
      },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(10000)
    });
    return { posted: resp.ok, pr: prNumber };
  } catch (err) {
    return { posted: false, error: err.message };
  }
}

export function getGitHubConfig() {
  return {
    configured: !!(GITHUB_TOKEN && GITHUB_REPO),
    repo: GITHUB_REPO || "not configured",
    tokenPresent: !!GITHUB_TOKEN
  };
}
