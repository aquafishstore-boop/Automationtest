import fs from "fs";
import path from "path";
import { getReportPath, listScreenshots } from "./screenshot-manager.js";

export function generateReport(run) {
  const shots = listScreenshots(run.id);
  const passed = run.steps.filter(s => s.status === "pass").length;
  const failed = run.steps.filter(s => s.status === "fail").length;
  const total = run.steps.length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  const stepRows = run.steps.map((step, i) => {
    const shot = step.screenshot
      ? `<div class="screenshot"><img src="/api/runs/${run.id}/screenshots/${step.screenshot}" alt="Step ${i + 1}" onclick="window.open(this.src,'_blank')"/></div>`
      : "";
    const statusClass = step.status === "pass" ? "pass" : step.status === "fail" ? "fail" : "pending";
    const errorHtml = step.error ? `<div class="error">${escapeHtml(step.error)}</div>` : "";
    return `<tr class="${statusClass}">
      <td>${i + 1}</td>
      <td>${escapeHtml(step.id)}</td>
      <td>${escapeHtml(step.description)}</td>
      <td><span class="badge ${statusClass}">${step.status}</span></td>
      <td>${shot}</td>
      <td>${errorHtml}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UAT Test Report - ${escapeHtml(run.script.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; color: #1e293b; padding: 2rem; }
  .container { max-width: 1200px; margin: 0 auto; }
  .header { background: #fff; border-radius: 12px; padding: 2rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .header h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .header .meta { color: #64748b; font-size: 0.875rem; }
  .header .meta span { margin-right: 1.5rem; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
  .stat-card { background: #fff; border-radius: 8px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .stat-card .value { font-size: 2rem; font-weight: 700; }
  .stat-card .label { color: #64748b; font-size: 0.8rem; margin-top: 0.25rem; }
  .stat-card.pass .value { color: #22c55e; }
  .stat-card.fail .value { color: #ef4444; }
  .stat-card.rate .value { color: #3b82f6; }
  .stat-card.total .value { color: #64748b; }
  table { width: 100%; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-collapse: collapse; }
  th { background: #f8fafc; text-align: left; padding: 0.75rem 1rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
  td { padding: 0.75rem 1rem; border-top: 1px solid #f1f5f9; font-size: 0.875rem; }
  tr.pass td { background: #f0fdf4; }
  tr.fail td { background: #fef2f2; }
  .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
  .badge.pass { background: #dcfce7; color: #166534; }
  .badge.fail { background: #fecaca; color: #991b1b; }
  .badge.pending { background: #f1f5f9; color: #64748b; }
  .screenshot img { max-width: 200px; max-height: 120px; border-radius: 4px; border: 1px solid #e2e8f0; cursor: pointer; transition: transform 0.2s; }
  .screenshot img:hover { transform: scale(1.5); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  .error { color: #ef4444; font-size: 0.8rem; margin-top: 0.25rem; }
  .footer { text-align: center; color: #94a3b8; font-size: 0.8rem; margin-top: 2rem; }
  @media print { body { padding: 0; } .screenshot img { max-width: 100px; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${escapeHtml(run.script.name)}</h1>
    <p>${escapeHtml(run.script.description || "")}</p>
    <div class="meta">
      <span>Run ID: ${run.id}</span>
      <span>Started: ${run.startedAt ? new Date(run.startedAt).toLocaleString() : "N/A"}</span>
      <span>Completed: ${run.completedAt ? new Date(run.completedAt).toLocaleString() : "N/A"}</span>
      <span>System: ${escapeHtml(run.script.system || "N/A")}</span>
    </div>
  </div>

  <div class="summary">
    <div class="stat-card total"><div class="value">${total}</div><div class="label">Total Steps</div></div>
    <div class="stat-card pass"><div class="value">${passed}</div><div class="label">Passed</div></div>
    <div class="stat-card fail"><div class="value">${failed}</div><div class="label">Failed</div></div>
    <div class="stat-card rate"><div class="value">${passRate}%</div><div class="label">Pass Rate</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Step ID</th>
        <th>Description</th>
        <th>Status</th>
        <th>Screenshot</th>
        <th>Error</th>
      </tr>
    </thead>
    <tbody>
      ${stepRows}
    </tbody>
  </table>

  <div class="footer">
    Generated by Aetheris Pathology UAT Tester &mdash; ${new Date().toLocaleString()}
  </div>
</div>
</body>
</html>`;

  const reportPath = getReportPath(run.id);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, html, "utf-8");
  return reportPath;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
