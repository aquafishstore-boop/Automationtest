let currentRunId = null, currentScript = null, eventSource = null, stepsData = [], screenshotsData = [], lastRunResult = null, selectedAgent = null, stepStartTimes = {};

// ===== INIT =====
async function init() {
  restoreSession();
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
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) enableDarkMode();
  if (localStorage.getItem("uat-theme") === "dark") enableDarkMode();
  document.addEventListener("keydown", handleKeyboard);
}
document.addEventListener("DOMContentLoaded", init);

// ===== SESSION PERSISTENCE =====
function saveSession() { try { localStorage.setItem("uat-tab", document.querySelector(".sidebar-tab.active")?.dataset?.tab || "runner"); } catch {} }
function restoreSession() {
  try {
    const tab = localStorage.getItem("uat-tab");
    if (tab) switchTab(tab, true);
  } catch {}
}

// ===== THEME =====
function toggleTheme() {
  if (document.documentElement.classList.contains("dark")) disableDarkMode();
  else enableDarkMode();
}
function enableDarkMode() { document.documentElement.classList.add("dark"); localStorage.setItem("uat-theme", "dark"); }
function disableDarkMode() { document.documentElement.classList.remove("dark"); localStorage.setItem("uat-theme", "light"); }

// ===== SIDEBAR =====
function toggleSidebar() { document.getElementById("sidebar").classList.toggle("open"); }

// ===== TOAST =====
function toast(msg, type = "") {
  const container = document.getElementById("toastContainer");
  const t = document.createElement("div"); t.className = `toast show ${type}`;
  t.textContent = msg;
  t.onclick = () => { t.classList.remove("show"); setTimeout(() => t.remove(), 200); };
  container.appendChild(t);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 200); }, 3500);
}

// ===== KEYBOARD SHORTCUTS =====
function handleKeyboard(e) {
  if (e.key === "Escape") { closeModal(); document.getElementById("cancelBtn")?.click(); return; }
  if (e.key === "?" && !e.ctrlKey && !e.metaKey) { document.getElementById("kbdModal").classList.remove("hidden"); return; }
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === "Enter") { e.preventDefault(); document.getElementById("runBtn")?.click(); }
  if (ctrl && e.shiftKey && e.key === "D") { e.preventDefault(); toggleTheme(); }
  if (ctrl && e.shiftKey && e.key === "N") { e.preventDefault(); switchTab("aitools"); document.getElementById("nlInput")?.focus(); }
  if (ctrl && e.shiftKey && e.key === "A") { e.preventDefault(); switchTab("agents"); }
  if (ctrl && e.shiftKey && ["1","2","3","4","5"].includes(e.key)) {
    e.preventDefault();
    const tabs = ["runner","agents","aitools","fhir","infra"];
    switchTab(tabs[parseInt(e.key)-1]);
  }
}
function closeKbdModal() { document.getElementById("kbdModal").classList.add("hidden"); }

// ===== TAB SWITCHING =====
function switchTab(name, skipSave) {
  document.querySelectorAll(".sidebar-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-content").forEach(t => t.classList.toggle("active", t.id === `tab-${name}`));
  if (!skipSave) saveSession();
  if (window.innerWidth <= 900) document.getElementById("sidebar").classList.remove("open");
  if (name === "infra") { refreshMetrics(); loadSchedule(); }
  if (name === "aitools") { loadRemediationStats(); loadFineTuneStats(); }
  window.scrollTo(0, 0);
}

// ===== SCRIPTS =====
async function loadScripts() {
  try {
    const res = await fetch("/api/scripts");
    const scripts = await res.json();
    const sel = document.getElementById("scriptSelect");
    sel.innerHTML = '<option value="">-- Select a test script --</option>';
    scripts.forEach(s => { const opt = document.createElement("option"); opt.value = s.filename; opt.textContent = `${s.name} (${s.system})`; sel.appendChild(opt); });
  } catch (err) { addLog("error", `Scripts: ${err.message}`); }
}
function populateLoadScripts() {
  const sel = document.getElementById("loadScriptSelect");
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select script --</option>';
  const opts = document.getElementById("scriptSelect")?.options;
  if (opts) for (const o of opts) if (o.value) sel.appendChild(o.cloneNode(true));
}

// ===== PATIENTS =====
async function loadPatients() {
  try {
    const res = await fetch("/api/patients");
    const patients = await res.json();
    const sel = document.getElementById("patientSelect");
    if (!sel) return;
    sel.innerHTML = '<option value="">-- No patient selected --</option>';
    patients.forEach(p => { const opt = document.createElement("option"); opt.value = p.id; opt.textContent = `${p.id} - ${p.forename} ${p.surname} (${p.nhsNumber})`; sel.appendChild(opt); });
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
    details.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.2rem;">
      <span style="color:var(--text-secondary)">NHS:</span><span><strong>${p.nhsNumber}</strong></span>
      <span style="color:var(--text-secondary)">Name:</span><span>${p.title} ${p.forename} ${p.surname}</span>
      <span style="color:var(--text-secondary)">DOB:</span><span>${p.dob} (${p.age})</span>
      <span style="color:var(--text-secondary)">Gender:</span><span>${p.gender}</span></div>`;
    ["PATIENT_NHS","NHS_NUMBER"].forEach(n => { const i = document.getElementById(`var-${n}`); if (i) i.value = p.nhsNumber; });
    const ni = document.getElementById("var-PATIENT_NAME"); if (ni) ni.value = `${p.forename} ${p.surname}`;
  } catch {}
}

async function onScriptChange() {
  const sel = document.getElementById("scriptSelect");
  const filename = sel.value, meta = document.getElementById("scriptMeta"), varsPanel = document.getElementById("variablesPanel"), runBtn = document.getElementById("runBtn");
  if (!filename) { meta.classList.add("hidden"); varsPanel.classList.add("hidden"); runBtn.disabled = true; return; }
  try {
    const res = await fetch(`/api/scripts/${filename}`);
    currentScript = await res.json();
    document.getElementById("metaSystem").textContent = currentScript.system || "N/A";
    document.getElementById("metaDescription").textContent = currentScript.description || "N/A";
    document.getElementById("metaSteps").textContent = currentScript.steps.length;
    meta.classList.remove("hidden"); currentScript.filename = filename;
    buildVariablesForm(currentScript.variables || []);
    varsPanel.classList.remove("hidden"); runBtn.disabled = false;
  } catch (err) { addLog("error", `Script load: ${err.message}`); }
}

function buildVariablesForm(variables) {
  const container = document.getElementById("variablesForm");
  container.innerHTML = "";
  if (!variables.length) { container.innerHTML = '<div class="empty-state" style="padding:0.5rem">No variables</div>'; return; }
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
  if (missing.length) { toast(`Fill in: ${missing.map(v => v.label || v.name).join(", ")}`, "error"); return; }
  resetRunUI();
  document.getElementById("runBtn").classList.add("hidden");
  document.getElementById("cancelBtn").classList.remove("hidden");
  stepsData = currentScript.steps.map((s, i) => ({ ...s, status: "pending", index: i }));
  renderStepList();
  try {
    const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script: currentScript, variables: vars }) });
    const data = await res.json();
    currentRunId = data.runId;
    document.getElementById("runIdLabel").textContent = currentRunId;
    document.getElementById("startedLabel").textContent = new Date().toLocaleTimeString();
    document.getElementById("runMeta").classList.remove("hidden");
    connectSSE(currentRunId);
  } catch (err) { addLog("error", `Run start: ${err.message}`); resetButtons(); }
}

function connectSSE(runId) {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/runs/${runId}/events`);
  eventSource.addEventListener("connected", () => {
    document.getElementById("connectionStatus").className = "status-dot connected";
    document.getElementById("connectionLabel").textContent = "Run active";
  });
  eventSource.addEventListener("step-start", e => {
    const d = JSON.parse(e.data);
    stepStartTimes[d.stepId] = performance.now();
    updateStepStatus(d.stepId, "running");
  });
  eventSource.addEventListener("step-complete", e => {
    const d = JSON.parse(e.data);
    const elapsed = stepStartTimes[d.stepId] ? ((performance.now() - stepStartTimes[d.stepId]) / 1000).toFixed(1) + "s" : "";
    updateStepStatus(d.stepId, d.status, d.error, elapsed);
    updateSummary();
  });
  eventSource.addEventListener("screenshot", e => addScreenshot(JSON.parse(e.data)));
  eventSource.addEventListener("log", e => { try { const d = JSON.parse(e.data); addLog(d.level || "info", d.message); } catch {} });
  eventSource.addEventListener("complete", e => {
    const d = JSON.parse(e.data); lastRunResult = d;
    addLog("info", `Complete: ${d.passed}/${d.totalSteps} passed, ${d.failed} failed`);
    onRunComplete(d);
  });
  eventSource.addEventListener("error", e => { try { addLog("error", JSON.parse(e.data).message || "Error"); } catch {} });
  eventSource.onerror = () => {
    document.getElementById("connectionStatus").className = "status-dot disconnected";
    document.getElementById("connectionLabel").textContent = "Disconnected";
  };
}

async function cancelRun() {
  if (!currentRunId) return;
  try { await fetch(`/api/runs/${currentRunId}/cancel`, { method: "POST" }); } catch {}
}

function resetRunUI() {
  document.getElementById("progressBarContainer").classList.remove("hidden");
  document.getElementById("progressBar").style.width = "0%";
  document.getElementById("summaryCards").classList.remove("hidden");
  ["cardTotal","cardPassed","cardFailed"].forEach(id => document.getElementById(id).textContent = "0");
  document.getElementById("cardRate").textContent = "0%";
  document.getElementById("screenshotGrid").innerHTML = '<div class="empty-state">Screenshots appear here as each step completes.</div>';
  screenshotsData = []; stepStartTimes = {};
  document.getElementById("reportBtn").disabled = true;
  document.getElementById("practitestBtn").disabled = true;
}
function resetButtons() { document.getElementById("runBtn").classList.remove("hidden"); document.getElementById("cancelBtn").classList.add("hidden"); }

function renderStepList() {
  const container = document.getElementById("stepList");
  container.innerHTML = "";
  stepsData.forEach(step => {
    const div = document.createElement("div"); div.className = `step-item ${step.status}`; div.id = `step-${step.id}`;
    const desc = document.createElement("div"); desc.className = "step-desc"; desc.textContent = step.description || step.id;
    const meta = document.createElement("div"); meta.className = "step-meta";
    const num = document.createElement("span"); num.textContent = `Step ${step.index+1}`;
    meta.appendChild(num);
    if (step.status === "running") { const sp = document.createElement("span"); sp.className = "step-status"; sp.textContent = "Running..."; meta.appendChild(sp); }
    div.appendChild(desc); div.appendChild(meta);
    if (step.error) { const errEl = document.createElement("div"); errEl.className = "step-error"; errEl.textContent = step.error; div.appendChild(errEl); }
    container.appendChild(div);
  });
}

function updateStepStatus(stepId, status, error, elapsed) {
  stepsData = stepsData.map(s => s.id === stepId ? { ...s, status, error: error || s.error } : s);
  const el = document.getElementById(`step-${stepId}`);
  if (!el) return;
  el.className = `step-item ${status}`;
  let meta = el.querySelector(".step-meta");
  if (!meta) { meta = document.createElement("div"); meta.className = "step-meta"; el.appendChild(meta); }
  meta.innerHTML = `<span>Step ${stepsData.findIndex(s=>s.id===stepId)+1}</span>${status==="running"?'<span class="step-status">Running...</span>':status==="pass"?'<span class="step-status">Pass</span>':status==="fail"?'<span class="step-status">Failed</span>':''}${elapsed?`<span class="step-duration">${elapsed}</span>`:''}`;
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
  document.getElementById("cardRate").textContent = `${c > 0 ? Math.round((p/c)*100) : 0}%`;
  document.getElementById("progressBar").style.width = `${(c/t)*100}%`;
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
  grid.scrollTop = grid.scrollHeight;
}

function onRunComplete(data) {
  resetButtons();
  document.getElementById("connectionStatus").className = "status-dot connected";
  document.getElementById("connectionLabel").textContent = "Completed";
  document.getElementById("reportBtn").disabled = false;
  document.getElementById("practitestBtn").disabled = !(data.failed > 0 || data.passed > 0);
  if (eventSource) { eventSource.close(); eventSource = null; }
}

// ===== ACTIONS =====
function openScreenshot(data) {
  document.getElementById("modalImage").src = `/api/runs/${currentRunId}/screenshots/${data.filename}`;
  document.getElementById("modalCaption").textContent = `${data.stepId}: ${data.description || ""}`;
  document.getElementById("screenshotModal").classList.remove("hidden");
}
function closeModal() { document.getElementById("screenshotModal").classList.add("hidden"); }
async function openReport() { if (currentRunId) window.open(`/api/runs/${currentRunId}/report`, "_blank"); }

async function uploadToPractitest() {
  if (!currentRunId) return;
  try {
    document.getElementById("practitestBtn").disabled = true;
    const res = await fetch("/api/practitest/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: currentRunId }) });
    const data = await res.json();
    toast(data.success ? `Uploaded ${data.results?.filter(r=>r.status==="uploaded").length||0} screenshots` : `Upload: ${data.message||"Check config"}`, data.success ? "success" : "error");
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
    if (data.error) { toast(`CSV: ${data.error}`, "error"); return; }
    document.getElementById("csvPreview").classList.remove("hidden");
    document.getElementById("csvPreview").innerHTML = `<div style="background:var(--surface-2);border-radius:var(--radius);padding:0.7rem;font-size:0.78rem;"><strong>${data.total} test cases</strong><ul style="margin-top:0.4rem;padding-left:1.2rem;">${data.preview.map(t=>`<li><strong>${t.id}</strong>: ${t.name} (${t.steps} steps)</li>`).join("")}${data.total>5?`<li>... and ${data.total-5} more</li>`:""}</ul></div>`;
    toast(`${data.total} cases previewed`, "success");
  } catch (err) { toast(`Preview: ${err.message}`, "error"); }
}
async function importCSV() {
  const csv = await readCSVFile(); if (!csv) return;
  try {
    const res = await fetch("/api/scripts/upload-csv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }) });
    const data = await res.json();
    if (data.error) { toast(`Import: ${data.error}`, "error"); return; }
    toast(`Imported ${data.imported} scripts`, "success");
    document.getElementById("csvPreview").innerHTML = `<div style="background:var(--success-bg);border-radius:var(--radius);padding:0.7rem;color:var(--success-text);">✓ ${data.imported} imported</div>`;
    await loadScripts(); populateLoadScripts();
  } catch (err) { toast(`Import: ${err.message}`, "error"); }
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
function clearLog() { document.getElementById("logContainer").innerHTML = '<div class="empty-state">Log cleared.</div>'; }

// ===== AI STATUS =====
async function checkAIStatus() {
  try {
    const res = await fetch("/api/ai/status");
    const data = await res.json();
    const header = document.getElementById("headerStatus");
    if (!header) return;
    const badges = document.createElement("div");
    badges.style.cssText = "display:flex;gap:0.25rem;align-items:center;";
    const ai = document.createElement("span");
    ai.style.cssText = `padding:0.1rem 0.4rem;border-radius:4px;font-size:0.68rem;font-weight:600;${data.enabled?"background:#8b5cf6;color:white;":"background:#e2e8f0;color:#94a3b8;"}`;
    ai.textContent = data.enabled ? "AI" : "AI off";
    badges.appendChild(ai);
    header.appendChild(badges);
  } catch {}
}

// ===== AGENTS =====
async function loadAgents() {
  try {
    const res = await fetch("/api/agents");
    const agents = await res.json();
    const grid = document.getElementById("agentGrid");
    if (!grid) return;
    grid.innerHTML = "";
    agents.forEach(a => {
      const card = document.createElement("div"); card.className = "agent-card"; card.onclick = () => selectAgent(a);
      card.innerHTML = `<div class="agent-name">${a.name}</div><div class="agent-desc">${a.description}</div><div class="agent-meta"><span class="agent-badge ${a.implemented?"implemented":"not-implemented"}">${a.implemented?"✓ Active":"○ Stub"}</span><span>${a.systems.join(", ")}</span></div>`;
      grid.appendChild(card);
    });
  } catch (err) { toast(`Agents: ${err.message}`, "error"); }
}

function selectAgent(agent) {
  selectedAgent = agent;
  document.querySelectorAll(".agent-card").forEach(c => c.classList.remove("selected"));
  event?.target?.closest(".agent-card")?.classList.add("selected");
  document.getElementById("agentRunPanel").classList.remove("hidden");
  document.getElementById("agentRunTitle").textContent = `Run: ${agent.name}`;
  document.getElementById("agentRunForm").innerHTML = `
    <div class="agent-run-field"><label>Workflow</label><select id="agentWorkflow">${agent.testCases.map(t=>`<option>${t}</option>`).join("")}</select></div>
    <div class="agent-run-field"><label>Patient NHS</label><input id="agentNhs" placeholder="e.g. 999 057 5924"></div>
    <div class="agent-run-field"><label>URL (optional)</label><input id="agentUrl" placeholder="System URL"></div>
    <div class="agent-run-field"><label>Username</label><input id="agentUser" placeholder="Login"></div>
    <div class="agent-run-field"><label>Password</label><input id="agentPass" type="password" placeholder="Password"></div>`;
}

function closeAgentRun() { document.getElementById("agentRunPanel").classList.add("hidden"); document.querySelectorAll(".agent-card").forEach(c=>c.classList.remove("selected")); }

async function executeAgent() {
  if (!selectedAgent) return;
  const body = { workflow: document.getElementById("agentWorkflow")?.value, patientNhs: document.getElementById("agentNhs")?.value, url: document.getElementById("agentUrl")?.value, username: document.getElementById("agentUser")?.value, password: document.getElementById("agentPass")?.value, testCode: document.getElementById("agentWorkflow")?.value, callbacks: {} };
  const btn = document.getElementById("agentRunBtn");
  btn.disabled = true; btn.textContent = "Running...";
  try {
    const ep = selectedAgent.id === "custom-script" ? "custom" : selectedAgent.id;
    const res = await fetch(`/api/agents/${ep}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    const rd = document.getElementById("agentResult");
    rd.classList.remove("hidden");
    rd.innerHTML = `<div style="font-size:0.82rem;"><strong>Status:</strong> ${data.status} | <strong>Passed:</strong> ${data.passed||0}/${data.total||0} | <strong>Failed:</strong> ${data.failed||0} | <strong>Screenshots:</strong> ${data.screenshots||0}</div>`;
    toast(`Agent: ${data.status} (${data.passed||0}/${data.total||0})`, data.status==="passed"?"success":"error");
  } catch (err) { toast(`Agent run: ${err.message}`, "error"); }
  finally { btn.disabled = false; btn.textContent = "Run Agent"; }
}

// ===== NL AUTHORING =====
async function generateScriptNL() {
  const text = document.getElementById("nlInput")?.value;
  if (!text) { toast("Enter a test description", "error"); return; }
  const systems = (document.getElementById("nlSystems")?.value || "").split(",").map(s=>s.trim()).filter(Boolean);
  try {
    const res = await fetch("/api/nl/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, systems }) });
    const data = await res.json();
    const el = document.getElementById("nlResult");
    el.classList.remove("hidden");
    if (data.error) { el.innerHTML = `<div style="color:var(--danger-text)">${data.error}</div>`; return; }
    el.innerHTML = `<pre>${JSON.stringify(Array.isArray(data)?data:data.steps||data, null, 2)}</pre>`;
    toast(`Generated ${Array.isArray(data)?data.length:0} steps`, "success");
  } catch (err) { toast(`NL: ${err.message}`, "error"); }
}
async function suggestTests() {
  const system = document.getElementById("nlSystems")?.value || "";
  try {
    const res = await fetch("/api/nl/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system }) });
    const data = await res.json();
    const el = document.getElementById("nlResult"); el.classList.remove("hidden");
    el.innerHTML = `<pre>${data.result||JSON.stringify(data,null,2)}</pre>`;
  } catch (err) { toast(`Suggest: ${err.message}`, "error"); }
}
function clearNL() { document.getElementById("nlInput").value = ""; document.getElementById("nlResult").classList.add("hidden"); }

// ===== REMEDIATION =====
async function loadRemediationStats() {
  try {
    const d = await (await fetch("/api/remediate/stats")).json();
    document.getElementById("remTotal").textContent = d.totalRemediations ?? "-";
    document.getElementById("remSuccess").textContent = d.successful ?? "-";
    document.getElementById("remRate").textContent = d.successRate ?? "-";
  } catch {}
  try {
    const log = await (await fetch("/api/remediate/log?limit=10")).json();
    const el = document.getElementById("remediationLog");
    if (!log.length) return;
    el.innerHTML = log.map(l => `<div class="log-entry"><span class="log-time">${new Date(l.timestamp).toLocaleTimeString()}</span><span class="log-msg ${l.success?"success":"error"}">${l.diagnosis||l.step||l.event} ${l.success?"✓":"✗"}</span></div>`).join("");
  } catch {}
}

// ===== FINE TUNING =====
async function loadFineTuneStats() {
  try { const d = await (await fetch("/api/fine-tune/stats")).json(); document.getElementById("ftFiles").textContent = d.files ?? "-"; document.getElementById("ftExamples").textContent = d.totalExamples ?? "-"; } catch {}
  try {
    const files = await (await fetch("/api/fine-tune/files")).json();
    const el = document.getElementById("ftFileList");
    if (!files.length) { el.innerHTML = '<div style="color:var(--text-secondary);padding:0.5rem;">No data yet.</div>'; return; }
    el.innerHTML = files.map(f => `<div><span>${f.filename}</span><span style="color:var(--text-secondary)">${f.examples} ex</span></div>`).join("");
  } catch {}
}
async function collectTraining() {
  if (!lastRunResult) { toast("No completed run", "error"); return; }
  try { const d = await (await fetch("/api/fine-tune/collect", { method: "POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({steps:lastRunResult.steps||[],system:lastRunResult.system||"general"})})).json(); toast(`Collected ${d.count||0} examples`, "success"); loadFineTuneStats(); }
  catch (err) { toast(`Collect: ${err.message}`, "error"); }
}
async function submitFineTune() {
  try { const d = await (await fetch("/api/fine-tune/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).json(); toast(d.submitted?`Submitted (${d.totalExamples} ex)`:`Error: ${d.error||"Unknown"}`,d.submitted?"success":"error"); }
  catch (err) { toast(`Submit: ${err.message}`, "error"); }
}

// ===== FHIR =====
async function loadFHIRCodes() {
  try {
    const d = await (await fetch("/api/fhir/codes")).json();
    const el = document.getElementById("fhirCodes"); if (!el) return;
    el.innerHTML = (d.observations||[]).map(o => `<div style="padding:0.2rem 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;font-size:0.78rem;"><span><strong>${o.code}</strong>: ${o.display}</span><span style="color:var(--text-secondary)">${o.unit}</span></div>`).join("");
  } catch {}
}
async function generateFHIR() {
  const count = parseInt(document.getElementById("fhirCount")?.value)||1;
  const gender = document.getElementById("fhirGender")?.value||"";
  try {
    const d = await (await fetch(`/api/fhir/patients?count=${count}${gender?"&gender="+gender:""}`)).json();
    const el = document.getElementById("fhirResult"); el.classList.remove("hidden");
    el.innerHTML = `<pre>${JSON.stringify(d,null,2)}</pre>`;
    toast(`Generated ${d.generated||0} patients`, "success");
  } catch (err) { toast(`FHIR: ${err.message}`, "error"); }
}
async function testFHIRServer() {
  try {
    const d = await (await fetch("/api/fhir/r4/metadata")).json();
    const el = document.getElementById("fhirServerResult"); el.classList.remove("hidden");
    el.innerHTML = `<pre>${JSON.stringify({status:200,fhirVersion:d.fhirVersion,resources:d.rest?.[0]?.resource?.map(r=>r.type).join(", ")},null,2)}</pre>`;
  } catch (err) { toast(`FHIR server: ${err.message}`, "error"); }
}

// ===== METRICS =====
async function refreshMetrics() {
  try {
    const d = await (await fetch("/api/metrics")).json();
    const el = document.getElementById("metricsDisplay"); if (!el) return;
    el.innerHTML = `<div class="mini-stat"><span class="mini-value">${d.runsStarted||0}</span><span class="mini-label">Runs</span></div>
      <div class="mini-stat"><span class="mini-value">${d.passRate||0}%</span><span class="mini-label">Pass Rate</span></div>
      <div class="mini-stat"><span class="mini-value">${d.agentCount||0}</span><span class="mini-label">Agents</span></div>
      <div class="mini-stat"><span class="mini-value">${Math.floor((d.uptimeSeconds||0)/86400)}d</span><span class="mini-label">Uptime</span></div>
      <div class="mini-stat"><span class="mini-value">${d.screenshotsCaptured||0}</span><span class="mini-label">Screenshots</span></div>
      <div class="mini-stat"><span class="mini-value">v${d.version||"?"}</span><span class="mini-label">Version</span></div>`;
    document.getElementById("connectionStatus").className = "status-dot connected";
    document.getElementById("connectionLabel").textContent = "Connected";
  } catch {}
  try {
    const d = await (await fetch("/api/insights")).json();
    const el = document.getElementById("insightsDisplay"); if (!el) return;
    let html = `<h3 style="font-size:0.82rem;font-weight:600;margin:0.75rem 0 0.4rem;">Run History</h3><table>${(d.recentRuns||[]).map(r=>`<tr><td>${new Date(r.date).toLocaleTimeString()}</td><td>${r.script||r.id?.slice(0,12)}</td><td>${r.status}</td><td>${r.passed||0}/${(r.passed||0)+(r.failed||0)}</td></tr>`).join("")}</table>`;
    if (d.bySystem) html += `<h3 style="font-size:0.82rem;font-weight:600;margin:0.75rem 0 0.4rem;">By System</h3><table>${Object.entries(d.bySystem).map(([sys,v])=>`<tr><td>${sys}</td><td>${v.runs} runs</td><td style="color:var(--success-text)">${v.passed||0}p</td><td style="color:var(--danger-text)">${v.failed||0}f</td></tr>`).join("")}</table>`;
    el.innerHTML = html;
  } catch {}
}

// ===== SCHEDULE =====
async function loadSchedule() {
  try {
    const jobs = await (await fetch("/api/schedule")).json();
    const el = document.getElementById("scheduleList"); if (!el) return;
    if (!jobs.length) { el.innerHTML = '<div class="empty-state">No scheduled jobs.</div>'; return; }
    el.innerHTML = jobs.map(j => `<div style="padding:0.4rem 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:0.78rem;">
      <div><strong>${j.cron}</strong> — ${j.script||j.agentId||"?"} ${j.enabled?"🟢":"🔴"}</div>
      <div style="display:flex;gap:0.3rem;">
        <button class="btn btn-text btn-sm" onclick="toggleSchedule('${j.id}')">${j.enabled?"Disable":"Enable"}</button>
        <button class="btn btn-text btn-sm" onclick="deleteSchedule('${j.id}')" style="color:var(--danger)">Delete</button>
      </div></div>`).join("");
  } catch {}
}
function showAddSchedule() { document.getElementById("scheduleForm").classList.remove("hidden"); }
function hideScheduleForm() { document.getElementById("scheduleForm").classList.add("hidden"); }
async function addSchedule() {
  const cron = document.getElementById("schedCron")?.value, script = document.getElementById("schedScript")?.value;
  if (!cron||!script) { toast("Cron and script required", "error"); return; }
  try { await (await fetch("/api/schedule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cron,script,agentId:script})})).json(); toast("Job scheduled", "success"); hideScheduleForm(); loadSchedule(); }
  catch (err) { toast(`Schedule: ${err.message}`, "error"); }
}
async function toggleSchedule(id) { try { await fetch(`/api/schedule/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:false})}); loadSchedule(); } catch {} }
async function deleteSchedule(id) { try { await fetch(`/api/schedule/${id}`,{method:"DELETE"}); toast("Job deleted","success"); loadSchedule(); } catch {} }

// ===== AUDIT =====
async function loadAudit() {
  const date = document.getElementById("auditDate")?.value || new Date().toISOString().slice(0,10);
  try {
    const entries = await (await fetch(`/api/audit?date=${date}&limit=100`)).json();
    const el = document.getElementById("auditLog");
    if (!entries.length) { el.innerHTML = '<div class="empty-state">No entries for this date.</div>'; return; }
    el.innerHTML = entries.map(e => `<div class="log-entry"><span class="log-time">${new Date(e.timestamp).toLocaleTimeString()}</span><span class="log-msg ${e.severity==="warn"?"warn":e.severity==="error"?"error":""}">${e.action} — ${e.user||"anon"} [${e.trust}]</span></div>`).join("");
    toast(`${entries.length} entries loaded`, "success");
  } catch (err) { toast(`Audit: ${err.message}`, "error"); }
}

// ===== LOAD TEST =====
async function generateK6() {
  const filename = document.getElementById("loadScriptSelect")?.value;
  if (!filename) { toast("Select a script", "error"); return; }
  try {
    const script = await (await fetch(`/api/scripts/${filename}`)).json();
    const code = await (await fetch("/api/load-test/generate-k6",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({script,vus:10})})).text();
    document.getElementById("loadResult").classList.remove("hidden"); document.getElementById("loadResult").textContent = code;
  } catch (err) { toast(`k6: ${err.message}`, "error"); }
}
async function generateArtillery() {
  const filename = document.getElementById("loadScriptSelect")?.value;
  if (!filename) { toast("Select a script", "error"); return; }
  try {
    const script = await (await fetch(`/api/scripts/${filename}`)).json();
    const data = await (await fetch("/api/load-test/generate-artillery",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({script,vus:10})})).json();
    document.getElementById("loadResult").classList.remove("hidden"); document.getElementById("loadResult").textContent = JSON.stringify(data,null,2);
  } catch (err) { toast(`Artillery: ${err.message}`, "error"); }
}

// ===== MOBILE =====
async function loadMobileProfiles() {
  try {
    const profiles = await (await fetch("/api/mobile/profiles")).json();
    const el = document.getElementById("mobileProfiles"); if (!el) return;
    el.innerHTML = profiles.map(p => `<div style="padding:0.35rem 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;font-size:0.78rem;"><span><strong>${p.name}</strong></span><span style="color:var(--text-secondary)">${p.viewport} ${p.touch?"📱":"🖥"}</span></div>`).join("");
  } catch {}
}

// ===== OAUTH =====
async function loadOAuthStatus() {
  try {
    const d = await (await fetch("/api/oauth/status")).json();
    const el = document.getElementById("oauthStatus"); if (!el) return;
    el.innerHTML = `<div class="mini-stats" style="grid-template-columns:repeat(3,1fr);"><div class="mini-stat"><span class="mini-value">${d.enabled?"🟢":"🔴"}</span><span class="mini-label">Enabled</span></div><div class="mini-stat"><span class="mini-value">${d.clientCount||0}</span><span class="mini-label">Clients</span></div><div class="mini-stat"><span class="mini-value">${d.activeTokens||0}</span><span class="mini-label">Tokens</span></div></div>`;
  } catch {}
}

// ===== PRACTITEST =====
async function checkPractitestStatus() {
  try { const data = await (await fetch("/api/practitest/status")).json(); if (!data.configured) addLog("warn", "PractiTest not configured"); } catch {}
}

// ===== SIDEBAR RESIZE HANDLER =====
window.addEventListener("resize", () => {
  if (window.innerWidth > 900) document.getElementById("sidebar").classList.remove("open");
});
