const PT_TOKEN = process.env.PRACTITEST_TOKEN || "";
const PT_PROJECT_ID = process.env.PRACTITEST_PROJECT_ID || "";
const PT_BASE_URL = process.env.PRACTITEST_BASE_URL || "https://api.practitest.com";

export function isConfigured() {
  return !!(PT_TOKEN && PT_PROJECT_ID);
}

export async function uploadEvidence(runId, testCaseId, screenshots, runSummary) {
  if (!isConfigured()) {
    return { success: false, message: "Practitest not configured. Set PRACTITEST_TOKEN and PRACTITEST_PROJECT_ID." };
  }

  const results = [];
  for (const shot of screenshots) {
    try {
      const formData = new FormData();
      const blob = new Blob([shot.buffer], { type: "image/png" });
      formData.append("attachment[file]", blob, shot.filename);
      formData.append("attachment[attachable_type]", "StepExecution");
      formData.append("attachment[attachable_id]", testCaseId);

      const res = await fetch(`${PT_BASE_URL}/api/v2/projects/${PT_PROJECT_ID}/attachments.json`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${PT_TOKEN}` },
        body: formData
      });

      const data = await res.json();
      results.push({ filename: shot.filename, status: res.ok ? "uploaded" : "failed", response: data });
    } catch (err) {
      results.push({ filename: shot.filename, status: "error", error: err.message });
    }
  }

  return { success: results.every(r => r.status === "uploaded"), results };
}
