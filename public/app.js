let currentRunId = null;
let currentScript = null;
let eventSource = null;
let stepsData = [];
let screenshotsData = [];
let lastRunResult = null;

// ===== INIT =====
async function init() {
  await loadScripts();
  checkAIStatus();
  loadPatients();
  loadAgents();
  loadFHIRCodes();
  loadMobileProfiles();
  loadOAuthStatus();
  refreshMetrics();
  loadSchedule();
  populateLoadScripts();
  checkPractitestStatus();
}

// ===== TAB SWITCHING =====
function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-content").forEach(t => t.classList.toggle("active", t.id === `tab-${name}`));
  if (name === "infra") { refreshMetrics(); loadSchedule(); }
  if (name === "aitools") { loadRemediationStats(); loadFineTuneStats(); }
  window.scrollTo(0, 0);
}

// ===== TOAST =====
function toast(msg, type = "") {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove("show"), 3000);
}

// ===== SCRIPTS =====
async function loadScripts() {
  try {
    const res = await fetch("/api/scripts");
    const scripts = await res.json();
    const sel = document.getElementById("scriptSelect");
    sel.innerHTML = '<option value="">-- Select a test script --</option>';
    scripts.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.filename;
      opt.textContent = `${s.name} (${s.system})`;
      sel.appendChild(opt);
    });
  } catch (err) { addLog("error", `Failed to load scripts: ${err.message}`); }
}

function populateLoadScripts() {
  const scripts = document.getElementById("scriptSelect")?.options;
  const sel = document.getElementById("loadScriptSelect");
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select script --</option>';
  if (scripts) for (const opt of scripts) if (opt.value) sel.appendChild(opt.cloneNode(true));
}

// ===== PATIENTS =====
async function loadPatients() {
  try {
    const res = await fetch("/api/patients");
    const patients = await res.json();
    const sel = document.getElementById("patientSelect");
    if (!sel) return;
    sel.innerHTML = '<option value="">-- No patient selected --</option>';
    patients.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.id} - ${p.forename} ${p.surname} (${p.nhsNumber})`;
      sel.appendChild(opt);
    });
  } catch {}
}

async function onPatientSelect() {
  const sel = document.getElementById("patientSelect");
  const details = document.getElementById("patientDetails");
  const id = sel.value;
  if (!id) { details.classList.add("hidden"); return; }
  try {
    const res = await fetch(`/api/patients/${id}`);
    const p = await res.json();
    details.classList.remove("hidden");
    details.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.2rem;">
        <span style="color:var(--text-secondary)">NHS:</span><span><strong>${p.nhsNumber}</strong></span>
        <span style="color:var(--text-secondary)">Name:</span><span>${p.title} ${p.forename} ${p.surname}</span>
        <span style="color:var(--text-secondary)">DOB:</span><span>${p.dob} (${p.age})</span>
        <span style="color:var(--text-secondary)">Gender:</span><span>${p.gender}</span>
      </div>`;
    ["PATIENT_NHS","NHS_NUMBER"].forEach(n => { const i = document.getElementById(`var-${n}`); if (i) i.value = p.nhsNumber; });
    const ni = document.getElementById("var-PATIENT_NAME"); if (ni) ni.value = `${p.forename} ${p.surname}`;
    addLog("info", `Patient ${p.id} loaded: ${p.forename} ${p.surname}`);
  } catch {}
}

async function onScriptChange() {
  const sel = document.getElementById("scriptSelect");
  const filename = sel.value;
  const meta = document.getElementById("scriptMeta");
  const varsPanel = document.getElementById("variablesPanel");
  const runBtn = document.getElementById("runBtn");
  if (!filename) { meta.classList.add("hidden"); varsPanel.classList.add("hidden"); runBtn.disabled = true; return; }
  try {
    const res = await fetch(`/api/scripts/${filename}`);
    currentScript = await res.json();
    document.getElementById("metaSystem").textContent = currentScript.system || "N/A";
    document.getElementById("metaDescription").textContent = currentScript.description || "N/A";
    document.getElementById("metaSteps").textContent = currentScript.steps.length;
    meta.classList.remove("hidden");
    currentScript.filename = filename;
    buildVariablesForm(currentScript.variables || []);
    varsPanel.classList.remove("hidden");
    runBtn.disabled = false;
  } catch (err) { addLog("error", `Failed to load script: ${err.message}`); }
}

function buildVariablesForm(variables) {
  const container = document.getElementById("variablesForm");
  container.innerHTML = "";
  if (!variables.length) { container.innerHTML = '<div class="empty-state" style="padding:0.5rem">No variables required</div>'; return; }
  variables.forEach(v => {
    const div = document.createElement("div"); div.className = "variable-field";
    const label = document.createElement("label"); label.textContent = v.label || v.name; label.htmlFor = `var-${v.name}`;
    const input = document.createElement("input");
    input.id = `var-${v.name}`; input.name = v.name; input.type = v.type === "password" ? "password" : "text";
    input.placeholder = v.default || v.label || v.name; input.value = v.default || "";
    if (v.required) input.required = true;
    const hint = document.createElement("div"); hint.className = "hint"; hint.textContent = v.required ? "Required" : "Optional";
    div.appendChild(label); div.appendChild(input); div.appendChild(hint);
    container.appendChild(div);
  });
}

function getVariables() {
  const vars = {};
  document.querySelectorAll("#variablesForm input").forEach(i => { vars[i.name] = i.value; });
  return vars;
}

// ===== TEST EXECUTION =====
async function startRun() {
  if (!currentScript) return;
  const vars = getVariables();
  const missing = (currentScript.variables || []).filter(v => v.required && !vars[v.name]);
  if (missing.length) { toast(`Fill in required: ${missing.map(v => v.label || v.name).join(", ")}`, "error"); return; }
  resetRunUI();
  document.getElementById("runBtn").classList.add("hidden");
  document.getElementById("cancelBtn").classList.remove("hidden");
  stepsData = currentScript.steps.map((s, i) => ({ ...s, status: "pending", index: i }));
  renderStepList();
  try {
    const res = await fetch("/api/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: currentScript, variables: vars })
    });
    const data = await res.json();
    currentRunId = data.runId;
    document.getElementById("runIdLabel").textContent = currentRunId;
    document.getElementById("startedLabel").textContent = new Date().toLocaleTimeString();
    document.getElementById("runMeta").classList.remove("hidden");
    connectSSE(currentRunId);
  } catch (err) { addLog("error", `Failed to start run: ${err.message}`); resetButtons(); }
}

function connectSSE(runId) {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/runs/${runId}/events`);
  eventSource.addEventListener("connected", () => {
    document.getElementById("connectionStatus").className = "status-dot connected";
    document.getElementById("connectionLabel").textContent = "Run active";
    addLog("info", `Connected to run ${runId}`);
  });
  eventSource.addEventListener("step-start", e => { const d = JSON.parse(e.data); updateStepStatus(d.stepId, "running"); addLog("info", `▶ ${d.description || d.stepId}`); });
  eventSource.addEventListener("step-complete", e => {
    const d = JSON.parse(e.data); updateStepStatus(d.stepId, d.status, d.error); updateSummary();
    addLog(d.status === "fail" ? "error" : "success", `${d.status === "pass" ? "✓" : "✗"} ${d.stepId}${d.error ? ": "+d.error : ""}`);
  });
  eventSource.addEventListener("screenshot", e => addScreenshot(JSON.parse(e.data)));
  eventSource.addEventListener("log", e => { const d = JSON.parse(e.data); addLog(d.level || "info", d.message); });
  eventSource.addEventListener("complete", e => {
    const d = JSON.parse(e.data); lastRunResult = d;
    addLog("info", `Run complete: ${d.passed}/${d.totalSteps} passed, ${d.failed} failed`);
    onRunComplete(d);
  });
  eventSource.addEventListener("error", e => { try { const d = JSON.parse(e.data); addLog("error", d.message || "Connection error"); } catch {} });
  eventSource.onerror = () => {
    addLog("warn", "SSE connection lost.");
    document.getElementById("connectionStatus").className = "status-dot disconnected";
    document.getElementById("connectionLabel").textContent = "Disconnected";
  };
}

async function cancelRun() {
  if (!currentRunId) return;
  try { await fetch(`/api/runs/${currentRunId}/cancel`, { method: "POST" }); addLog("warn", "Run cancellation requested"); }
  catch (err) { addLog("error", `Cancel failed: ${err.message}`); }
}

function resetRunUI() {
  document.getElementById("progressBarContainer").classList.remove("hidden");
  document.getElementById("progressBar").style.width = "0%";
  document.getElementById("summaryCards").classList.remove("hidden");
  ["cardTotal","cardPassed","cardFailed"].forEach(id => document.getElementById(id).textContent = "0");
  document.getElementById("cardRate").textContent = "0%";
  document.getElementById("screenshotGrid").innerHTML = '<div class="empty-state">Screenshots will appear here as each step completes.</div>';
  screenshotsData = [];
  document.getElementById("reportBtn").disabled = true;
  document.getElementById("practitestBtn").disabled = true;
}

function resetButtons() {
  document.getElementById("runBtn").classList.remove("hidden");
  document.getElementById("cancelBtn").classList.add("hidden");
}

function renderStepList() {
  const container = document.getElementById("stepList");
  container.innerHTML = "";
  stepsData.forEach(step => {
    const div = document.createElement("div"); div.className = `step-item ${step.status}`; div.id = `step-${step.id}`;
    const icon = document.createElement("div"); icon.className = "step-icon";
    icon.innerHTML = step.status === "running" ? '<div class="running-spinner"></div>' : step.status === "pass" ? "✓" : step.status === "fail" ? "✗" : String(step.index + 1);
    const desc = document.createElement("div"); desc.className = "step-desc"; desc.textContent = step.description || step.id;
    const statusEl = document.createElement("div"); statusEl.className = "step-status";
    statusEl.textContent = step.status === "running" ? "Running..." : step.status === "pass" ? "Pass" : step.status === "fail" ? "Failed" : "Pending";
    div.appendChild(icon); div.appendChild(desc); div.appendChild(statusEl);
    if (step.error) { const errEl = document.createElement("div"); errEl.className = "step-error"; errEl.textContent = step.error; div.appendChild(errEl); }
    container.appendChild(div);
  });
}

function updateStepStatus(stepId, status, error) {
  stepsData = stepsData.map(s => s.id === stepId ? { ...s, status, error: error || s.error } : s);
  const el = document.getElementById(`step-${stepId}`);
  if (!el) return;
  el.className = `step-item ${status}`;
  const icon = el.querySelector(".step-icon"); icon.innerHTML = status === "running" ? '<div class="running-spinner"></div>' : status === "pass" ? "✓" : status === "fail" ? "✗" : status === "cancelled" ? "—" : "?";
  const statusEl = el.querySelector(".step-status");
  statusEl.textContent = status === "running" ? "Running..." : status === "pass" ? "Pass" : status === "fail" ? "Failed" : status === "cancelled" ? "Cancelled" : status;
  if (error) {
    let errEl = el.querySelector(".step-error");
    if (!errEl) { errEl = document.createElement("div"); errEl.className = "step-error"; el.appendChild(errEl); }
    errEl.textContent = error;
  }
}

function updateSummary() {
  const t = stepsData.length, p = stepsData.filter(s => s.status === "pass").length, f = stepsData.filter(s => s.status === "fail").length, c = p + f;
  document.getElementById("cardTotal").textContent = t;
  document.getElementById("cardPassed").textContent = p;
  document.getElementById("cardFailed").textContent = f;
  document.getElementById("cardRate").textContent = `${c > 0 ? Math.round((p / c) * 100) : 0}%`;
  document.getElementById("progressBar").style.width = `${(c / t) * 100}%`;
}

function addScreenshot(data) {
  screenshotsData.push(data);
  const grid = document.getElementById("screenshotGrid");
  const empty = grid.querySelector(".empty-state");
  if (empty) empty.remove();
  const card = document.createElement("div"); card.className = "screenshot-card"; card.onclick = () => openScreenshot(data);
  const img = document.createElement("img"); img.src = `/api/runs/${currentRunId}/screenshots/${data.filename}`; img.alt = data.description || data.stepId; img.loading = "lazy";
  const caption = document.createElement("div"); caption.className = "caption";
  const badge = document.createElement("div"); badge.className = "badge-step"; badge.textContent = data.stepId;
  const desc = document.createElement("div"); desc.textContent = data.description || data.filename;
  caption.appendChild(badge); caption.appendChild(desc);
  card.appendChild(img); card.appendChild(caption);
  grid.appendChild(card);
}

function onRunComplete(data) {
  resetButtons();
  document.getElementById("connectionStatus").className = "status-dot connected";
  document.getElementById("connectionLabel").textContent = "Completed";
  document.getElementById("reportBtn").disabled = false;
  document.getElementById("practitestBtn").disabled = data.failed > 0 || data.passed > 0 ? false : true;
  if (eventSource) { eventSource.close(); eventSource = null; }
}

// ===== ACTIONS =====
function openScreenshot(data) {
  const modal = document.getElementById("screenshotModal");
  document.getElementById("modalImage").src = `/api/runs/${currentRunId}/screenshots/${data.filename}`;
  document.getElementById("modalCaption").textContent = `${data.stepId}: ${data.description || ""}`;
  modal.classList.remove("hidden");
}

function closeModal() { document.getElementById("screenshotModal").classList.add("hidden"); }
async function openReport() { if (currentRunId) window.open(`/api/runs/${currentRunId}/report`, "_blank"); }

async function uploadToPractitest() {
  if (!currentRunId) return;
  try {
    document.getElementById("practitestBtn").disabled = true;
    const res = await fetch("/api/practitest/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: currentRunId }) });
    const data = await res.json();
    toast(data.success ? `Uploaded ${data.results?.filter(r => r.status === "uploaded").length || 0} screenshots` : `Upload: ${data.message || "Check config"}`, data.success ? "success" : "error");
  } catch (err) { toast(`Upload failed: ${err.message}`, "error"); }
  finally { document.getElementById("practitestBtn").disabled = false; }
}

// ===== CSV IMPORT =====
document.addEventListener("change", e => {
  if (e.target.id === "csvFileInput") {
    document.getElementById("previewCsvBtn").disabled = !e.target.files[0];
    document.getElementById("importCsvBtn").disabled = !e.target.files[0];
  }
});

async function readCSVFile() {
  const input = document.getElementById("csvFileInput");
  if (!input.files?.[0]) return null;
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = e => resolve(e.target.result); r.onerror = e => reject(e.target.error); r.readAsText(input.files[0]); });
}

async function previewCSV() {
  const csv = await readCSVFile(); if (!csv) return;
  try {
    const res = await fetch("/api/scripts/upload-csv-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }) });
    const data = await res.json();
    if (data.error) { toast(`CSV error: ${data.error}`, "error"); return; }
    document.getElementById("csvPreview").classList.remove("hidden");
    document.getElementById("csvPreview").innerHTML = `<div style="background:var(--surface-2);border-radius:var(--radius);padding:0.7rem;font-size:0.78rem;"><strong>${data.total} test cases</strong> found<ul style="margin-top:0.4rem;padding-left:1.2rem;">${data.preview.map(t => `<li><strong>${t.id}</strong>: ${t.name} (${t.steps} steps)</li>`).join("")}${data.total > 5 ? `<li>... and ${data.total - 5} more</li>` : ""}</ul></div>`;
    toast(`${data.total} test cases previewed`, "success");
  } catch (err) { toast(`Preview failed: ${err.message}`, "error"); }
}

async function importCSV() {
  const csv = await readCSVFile(); if (!csv) return;
  try {
    const res = await fetch("/api/scripts/upload-csv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }) });
    const data = await res.json();
    if (data.error) { toast(`Import failed: ${data.error}`, "error"); return; }
    toast(`Imported ${data.imported} scripts`, "success");
    document.getElementById("csvPreview").innerHTML = `<div style="background:var(--success-bg);border-radius:var(--radius);padding:0.7rem;color:var(--success-text);font-size:0.8rem;">✓ ${data.imported} scripts imported</div>`;
    await loadScripts(); populateLoadScripts();
  } catch (err) { toast(`Import failed: ${err.message}`, "error"); }
}

// ===== LOGGING =====
function addLog(level, message) {
  const container = document.getElementById("logContainer");
  const empty = container.querySelector(".empty-state");
  if (empty) empty.remove();
  const entry = document.createElement("div"); entry.className = "log-entry";
  const time = document.createElement("span"); time.className = "log-time"; time.textContent = new Date().toLocaleTimeString();
  const msg = document.createElement("span"); msg.className = `log-msg ${level}`; msg.textContent = message;
  entry.appendChild(time); entry.appendChild(msg);
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

function clearLog() {
  const container = document.getElementById("logContainer");
  container.innerHTML = '<div class="empty-state">Log cleared.</div>';
}

// ===== AI STATUS =====
async function checkAIStatus() {
  try {
    const res = await fetch("/api/ai/status");
    const data = await res.json();
    const header = document.getElementById("headerStatus");
    if (!header) return;
    const e = data.enabled;
    const badges = document.createElement("div");
    badges.style.cssText = "display:flex;gap:0.25rem;align-items:center;";
    const aiBadge = document.createElement("span");
    aiBadge.style.cssText = `padding:0.1rem 0.4rem;border-radius:4px;font-size:0.68rem;font-weight:600;${e ? "background:#8b5cf6;color:white;" : "background:#e2e8f0;color:#94a3b8;"}`;
    aiBadge.textContent = e ? "AI" : "AI off";
    badges.appendChild(aiBadge);
    const verBadge = document.createElement("span");
    verBadge.style.cssText = "background:#f1f5f9;color:#475569;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.68rem;";
    verBadge.textContent = "v3.2.0";
    badges.appendChild(verBadge);
    header.appendChild(badges);
  } catch {}
}

// ===== AGENTS =====
let selectedAgent = null;

async function loadAgents() {
  try {
    const res = await fetch("/api/agents");
    const agents = await res.json();
    const grid = document.getElementById("agentGrid");
    if (!grid) return;
    grid.innerHTML = "";
    agents.forEach(a => {
      const card = document.createElement("div"); card.className = "agent-card"; card.onclick = () => selectAgent(a);
      card.innerHTML = `
        <div class="agent-name">${a.name}</div>
        <div class="agent-desc">${a.description}</div>
        <div class="agent-meta">
          <span class="agent-badge ${a.implemented ? "implemented" : "not-implemented"}">${a.implemented ? "✓ Active" : "○ Stub"}</span>
          <span>${a.systems.join(", ")}</span>
        </div>`;
      grid.appendChild(card);
    });
  } catch (err) { toast(`Failed to load agents: ${err.message}`, "error"); }
}

function selectAgent(agent) {
  selectedAgent = agent;
  document.querySelectorAll(".agent-card").forEach(c => c.classList.remove("selected"));
  event?.target?.closest(".agent-card")?.classList.add("selected");
  const panel = document.getElementById("agentRunPanel");
  panel.classList.remove("hidden");
  document.getElementById("agentRunTitle").textContent = `Run: ${agent.name}`;
  const form = document.getElementById("agentRunForm");
  form.innerHTML = `
    <div class="agent-run-field"><label>Workflow / Test Case</label><select id="agentWorkflow">${agent.testCases.map(t => `<option>${t}</option>`).join("")}</select></div>
    <div class="agent-run-field"><label>Patient NHS Number</label><input id="agentNhs" placeholder="e.g. 999 057 5924"></div>
    <div class="agent-run-field"><label>URL (optional)</label><input id="agentUrl" placeholder="System URL if different from default"></div>
    <div class="agent-run-field"><label>Username (optional)</label><input id="agentUser" placeholder="Login username"></div>
    <div class="agent-run-field"><label>Password (optional)</label><input id="agentPass" type="password" placeholder="Login password"></div>`;
}

function closeAgentRun() {
  document.getElementById("agentRunPanel").classList.add("hidden");
  document.querySelectorAll(".agent-card").forEach(c => c.classList.remove("selected"));
}

async function executeAgent() {
  if (!selectedAgent) return;
  const body = {
    workflow: document.getElementById("agentWorkflow")?.value,
    patientNhs: document.getElementById("agentNhs")?.value,
    url: document.getElementById("agentUrl")?.value,
    username: document.getElementById("agentUser")?.value,
    password: document.getElementById("agentPass")?.value,
    testCode: document.getElementById("agentWorkflow")?.value,
    callbacks: {}
  };
  const btn = document.getElementById("agentRunBtn");
  btn.disabled = true; btn.textContent = "Running...";
  try {
    const endpoint = selectedAgent.id === "custom-script" ? "custom" : selectedAgent.id;
    const res = await fetch(`/api/agents/${endpoint}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    const resultDiv = document.getElementById("agentResult");
    resultDiv.classList.remove("hidden");
    resultDiv.innerHTML = `<div style="font-size:0.82rem;"><strong>Status:</strong> ${data.status} | <strong>Passed:</strong> ${data.passed || 0}/${data.total || 0} | <strong>Failed:</strong> ${data.failed || 0} | <strong>Screenshots:</strong> ${data.screenshots || 0}</div>`;
    toast(`Agent ${data.status}: ${data.passed||0}/${data.total||0} passed`, data.status === "passed" ? "success" : "error");
  } catch (err) { toast(`Agent run failed: ${err.message}`, "error"); }
  finally { btn.disabled = false; btn.textContent = "Run Agent"; }
}

// ===== NL AUTHORING =====
async function generateScriptNL() {
  const text = document.getElementById("nlInput")?.value;
  if (!text) { toast("Enter a test description", "error"); return; }
  const systems = document.getElementById("nlSystems")?.value || "";
  try {
    const res = await fetch("/api/nl/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, systems: systems.split(",").map(s => s.trim()).filter(Boolean) }) });
    const data = await res.json();
    const el = document.getElementById("nlResult");
    el.classList.remove("hidden");
    if (data.error) { el.innerHTML = `<div class="error">${data.error}</div>`; return; }
    el.innerHTML = `<pre>${JSON.stringify(Array.isArray(data) ? data : data.steps || data, null, 2)}</pre>`;
    toast(`Generated ${Array.isArray(data) ? data.length : 0} steps`, "success");
  } catch (err) { toast(`Generation failed: ${err.message}`, "error"); }
}

async function suggestTests() {
  const system = document.getElementById("nlSystems")?.value || "";
  try {
    const res = await fetch("/api/nl/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system }) });
    const data = await res.json();
    const el = document.getElementById("nlResult");
    el.classList.remove("hidden");
    el.innerHTML = `<pre>${data.result || JSON.stringify(data, null, 2)}</pre>`;
  } catch (err) { toast(`Suggestion failed: ${err.message}`, "error"); }
}

function clearNL() {
  document.getElementById("nlInput").value = "";
  document.getElementById("nlResult").classList.add("hidden");
}

// ===== REMEDIATION =====
async function loadRemediationStats() {
  try {
    const res = await fetch("/api/remediate/stats");
    const d = await res.json();
    document.getElementById("remTotal").textContent = d.totalRemediations ?? "-";
    document.getElementById("remSuccess").textContent = d.successful ?? "-";
    document.getElementById("remRate").textContent = d.successRate ?? "-";
  } catch {}
  try {
    const res = await fetch("/api/remediate/log?limit=10");
    const log = await res.json();
    const el = document.getElementById("remediationLog");
    if (!log.length) return;
    el.innerHTML = log.map(l => `<div class="log-entry"><span class="log-time">${new Date(l.timestamp).toLocaleTimeString()}</span><span class="log-msg ${l.success ? "success" : "error"}">${l.diagnosis || l.step || l.event} ${l.success ? "✓" : "✗"}</span></div>`).join("");
  } catch {}
}

// ===== FINE TUNING =====
async function loadFineTuneStats() {
  try {
    const res = await fetch("/api/fine-tune/stats");
    const d = await res.json();
    document.getElementById("ftFiles").textContent = d.files ?? "-";
    document.getElementById("ftExamples").textContent = d.totalExamples ?? "-";
  } catch {}
  try {
    const res = await fetch("/api/fine-tune/files");
    const files = await res.json();
    const el = document.getElementById("ftFileList");
    if (!files.length) { el.innerHTML = '<div style="color:var(--text-secondary);padding:0.5rem;">No training data yet.</div>'; return; }
    el.innerHTML = files.map(f => `<div style="padding:0.2rem 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;"><span>${f.filename}</span><span style="color:var(--text-secondary)">${f.examples} ex (${f.successes} pass)</span></div>`).join("");
  } catch {}
}

async function collectTraining() {
  if (!lastRunResult) { toast("No completed run to collect from", "error"); return; }
  try {
    const res = await fetch("/api/fine-tune/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps: lastRunResult.steps || [], system: lastRunResult.system || "general" }) });
    const d = await res.json();
    toast(`Collected ${d.count || 0} training examples`, "success");
    loadFineTuneStats();
  } catch (err) { toast(`Collection failed: ${err.message}`, "error"); }
}

async function submitFineTune() {
  try {
    const res = await fetch("/api/fine-tune/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const d = await res.json();
    toast(d.submitted ? `Fine-tuning submitted (${d.totalExamples} examples)` : `Error: ${d.error || "Unknown"}`, d.submitted ? "success" : "error");
  } catch (err) { toast(`Submit failed: ${err.message}`, "error"); }
}

// ===== FHIR =====
async function loadFHIRCodes() {
  try {
    const res = await fetch("/api/fhir/codes");
    const d = await res.json();
    const el = document.getElementById("fhirCodes");
    if (!el) return;
    el.innerHTML = (d.observations || []).map(o => `<div style="padding:0.2rem 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;font-size:0.78rem;"><span><strong>${o.code}</strong>: ${o.display}</span><span style="color:var(--text-secondary)">${o.unit}</span></div>`).join("");
  } catch {}
}

async function generateFHIR() {
  const count = parseInt(document.getElementById("fhirCount")?.value) || 1;
  const gender = document.getElementById("fhirGender")?.value || "";
  try {
    const res = await fetch("/api/fhir/patients?count=" + count + (gender ? "&gender=" + gender : ""));
    const d = await res.json();
    const el = document.getElementById("fhirResult");
    el.classList.remove("hidden");
    el.innerHTML = `<pre>${JSON.stringify(d, null, 2)}</pre>`;
    toast(`Generated ${d.generated || 0} patients`, "success");
  } catch (err) { toast(`FHIR generation failed: ${err.message}`, "error"); }
}

async function testFHIRServer() {
  try {
    const res = await fetch("/api/fhir/r4/metadata");
    const d = await res.json();
    document.getElementById("fhirServerResult").classList.remove("hidden");
    document.getElementById("fhirServerResult").innerHTML = `<pre>${JSON.stringify({ status: res.status, fhirVersion: d.fhirVersion, resources: d.rest?.[0]?.resource?.map(r => r.type).join(", ") }, null, 2)}</pre>`;
  } catch (err) { toast(`FHIR server test failed: ${err.message}`, "error"); }
}

// ===== METRICS =====
async function refreshMetrics() {
  try {
    const res = await fetch("/api/metrics");
    const d = await res.json();
    const el = document.getElementById("metricsDisplay");
    if (!el) return;
    el.innerHTML = `
      <div class="mini-stat"><span class="mini-value">${d.runsStarted || 0}</span><span class="mini-label">Total Runs</span></div>
      <div class="mini-stat"><span class="mini-value">${d.passRate || 0}%</span><span class="mini-label">Pass Rate</span></div>
      <div class="mini-stat"><span class="mini-value">${d.agentCount || 0}</span><span class="mini-label">Agents</span></div>
      <div class="mini-stat"><span class="mini-value">${Math.floor((d.uptimeSeconds || 0) / 86400)}d</span><span class="mini-label">Uptime</span></div>
      <div class="mini-stat"><span class="mini-value">${d.screenshotsCaptured || 0}</span><span class="mini-label">Screenshots</span></div>
      <div class="mini-stat"><span class="mini-value">v${d.version || "?"}</span><span class="mini-label">Version</span></div>`;
    document.getElementById("connectionStatus").className = "status-dot connected";
    document.getElementById("connectionLabel").textContent = "Connected";
  } catch {}
  try {
    const res = await fetch("/api/insights");
    const d = await res.json();
    const el = document.getElementById("insightsDisplay");
    if (!el) return;
    el.innerHTML = `<h3 style="font-size:0.82rem;font-weight:600;margin:0.75rem 0 0.4rem;">Run History</h3>
      <table>${(d.recentRuns || []).map(r => `<tr><td>${new Date(r.date).toLocaleTimeString()}</td><td>${r.script || r.id?.slice(0,12)}</td><td>${r.status}</td><td>${r.passed||0}/${(r.passed||0)+(r.failed||0)}</td></tr>`).join("")}</table>`;
    if (d.bySystem) {
      el.innerHTML += `<h3 style="font-size:0.82rem;font-weight:600;margin:0.75rem 0 0.4rem;">By System</h3>
        <table>${Object.entries(d.bySystem).map(([sys, v]) => `<tr><td>${sys}</td><td>${v.runs} runs</td><td style="color:var(--success-text)">${v.passed||0}p</td><td style="color:var(--danger-text)">${v.failed||0}f</td></tr>`).join("")}</table>`;
    }
  } catch {}
}

// ===== SCHEDULE =====
async function loadSchedule() {
  try {
    const res = await fetch("/api/schedule");
    const jobs = await res.json();
    const el = document.getElementById("scheduleList");
    if (!el) return;
    if (!jobs.length) { el.innerHTML = '<div class="empty-state">No scheduled jobs.</div>'; return; }
    el.innerHTML = jobs.map(j => `<div style="padding:0.4rem 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:0.78rem;">
      <div><strong>${j.cron}</strong> — ${j.script || j.agentId || "?"} ${j.enabled ? "🟢" : "🔴"}</div>
      <div style="display:flex;gap:0.3rem;">
        <button class="btn btn-text btn-sm" onclick="toggleSchedule('${j.id}')">${j.enabled ? "Disable" : "Enable"}</button>
        <button class="btn btn-text btn-sm" onclick="deleteSchedule('${j.id}')" style="color:var(--danger)">Delete</button>
      </div>
    </div>`).join("");
  } catch {}
}

function showAddSchedule() { document.getElementById("scheduleForm").classList.remove("hidden"); }
function hideScheduleForm() { document.getElementById("scheduleForm").classList.add("hidden"); }

async function addSchedule() {
  const cron = document.getElementById("schedCron")?.value;
  const script = document.getElementById("schedScript")?.value;
  if (!cron || !script) { toast("Cron and script required", "error"); return; }
  try {
    const res = await fetch("/api/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cron, script, agentId: script }) });
    await res.json();
    toast("Job scheduled", "success");
    hideScheduleForm(); loadSchedule();
  } catch (err) { toast(`Failed: ${err.message}`, "error"); }
}

async function toggleSchedule(id) {
  try { await fetch(`/api/schedule/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false }) }); loadSchedule(); }
  catch {}
}
async function deleteSchedule(id) {
  try { await fetch(`/api/schedule/${id}`, { method: "DELETE" }); toast("Job deleted", "success"); loadSchedule(); }
  catch {}
}

// ===== AUDIT =====
async function loadAudit() {
  const date = document.getElementById("auditDate")?.value || new Date().toISOString().slice(0, 10);
  try {
    const res = await fetch(`/api/audit?date=${date}&limit=100`);
    const entries = await res.json();
    const el = document.getElementById("auditLog");
    if (!entries.length) { el.innerHTML = '<div class="empty-state">No entries for this date.</div>'; return; }
    el.innerHTML = entries.map(e => `<div class="log-entry"><span class="log-time">${new Date(e.timestamp).toLocaleTimeString()}</span><span class="log-msg ${e.severity === "warn" ? "warn" : e.severity === "error" ? "error" : ""}">${e.action} — ${e.user || "anon"} [${e.trust}] ${e.detail ? "("+e.detail+")" : ""}</span></div>`).join("");
    toast(`${entries.length} entries loaded`, "success");
  } catch (err) { toast(`Audit load failed: ${err.message}`, "error"); }
}

// ===== LOAD TEST =====
async function generateK6() {
  const sel = document.getElementById("loadScriptSelect");
  const filename = sel?.value;
  if (!filename) { toast("Select a script first", "error"); return; }
  try {
    const scriptRes = await fetch(`/api/scripts/${filename}`);
    const script = await scriptRes.json();
    const res = await fetch("/api/load-test/generate-k6", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script, vus: 10 }) });
    const code = await res.text();
    document.getElementById("loadResult").classList.remove("hidden");
    document.getElementById("loadResult").textContent = code;
  } catch (err) { toast(`Generation failed: ${err.message}`, "error"); }
}

async function generateArtillery() {
  const sel = document.getElementById("loadScriptSelect");
  const filename = sel?.value;
  if (!filename) { toast("Select a script first", "error"); return; }
  try {
    const scriptRes = await fetch(`/api/scripts/${filename}`);
    const script = await scriptRes.json();
    const res = await fetch("/api/load-test/generate-artillery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script, vus: 10 }) });
    const data = await res.json();
    document.getElementById("loadResult").classList.remove("hidden");
    document.getElementById("loadResult").textContent = JSON.stringify(data, null, 2);
  } catch (err) { toast(`Generation failed: ${err.message}`, "error"); }
}

// ===== MOBILE PROFILES =====
async function loadMobileProfiles() {
  try {
    const res = await fetch("/api/mobile/profiles");
    const profiles = await res.json();
    const el = document.getElementById("mobileProfiles");
    if (!el) return;
    el.innerHTML = profiles.map(p => `<div style="padding:0.35rem 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;font-size:0.78rem;"><span><strong>${p.name}</strong> (${p.id})</span><span style="color:var(--text-secondary)">${p.viewport} ${p.touch ? "📱" : "🖥"}</span></div>`).join("");
  } catch {}
}

// ===== OAUTH =====
async function loadOAuthStatus() {
  try {
    const res = await fetch("/api/oauth/status");
    const d = await res.json();
    const el = document.getElementById("oauthStatus");
    if (!el) return;
    el.innerHTML = `
      <div class="mini-stats" style="grid-template-columns:repeat(3,1fr);">
        <div class="mini-stat"><span class="mini-value">${d.enabled ? "🟢" : "🔴"}</span><span class="mini-label">Enabled</span></div>
        <div class="mini-stat"><span class="mini-value">${d.clientCount || 0}</span><span class="mini-label">Clients</span></div>
        <div class="mini-stat"><span class="mini-value">${d.activeTokens || 0}</span><span class="mini-label">Active Tokens</span></div>
      </div>
      <p class="help-text">Token endpoint: <code>POST /api/oauth/token</code> | Introspect: <code>POST /api/oauth/introspect</code></p>`;
  } catch {}
}

// ===== PRACTITEST =====
async function checkPractitestStatus() {
  try {
    const res = await fetch("/api/practitest/status");
    const data = await res.json();
    if (!data.configured) addLog("warn", "PractiTest not configured - set PRACTITEST_TOKEN to enable uploading");
  } catch {}
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => { init(); });
