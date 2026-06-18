let currentRunId = null;
let currentScript = null;
let eventSource = null;
let stepsData = [];
let screenshotsData = [];

async function init() {
  await loadScripts();
  checkPractitestStatus();
  checkAIStatus();
  loadPatients();
}

// --- Script Loading ---

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
  } catch (err) {
    addLog("error", `Failed to load scripts: ${err.message}`);
  }
}

// --- Test Patient Management ---

async function loadPatients() {
  try {
    const res = await fetch("/api/patients");
    const patients = await res.json();
    const sel = document.getElementById("patientSelect");
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">-- No patient selected --</option>';
    patients.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.id} - ${p.forename} ${p.surname} (${p.nhsNumber}, ${p.gender}, ${p.age})`;
      opt.dataset.nhs = p.nhsNumber;
      opt.dataset.name = `${p.forename} ${p.surname}`;
      opt.dataset.dob = p.dob;
      sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
  } catch {}
}

async function onPatientSelect() {
  const sel = document.getElementById("patientSelect");
  const details = document.getElementById("patientDetails");
  const id = sel.value;

  if (!id) {
    details.classList.add("hidden");
    return;
  }

  try {
    const res = await fetch(`/api/patients/${id}`);
    const p = await res.json();
    details.classList.remove("hidden");
    details.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.25rem;">
        <span style="color:var(--text-secondary)">NHS:</span><span><strong>${p.nhsNumber}</strong></span>
        <span style="color:var(--text-secondary)">Name:</span><span>${p.title} ${p.forename} ${p.surname}</span>
        <span style="color:var(--text-secondary)">DOB:</span><span>${p.dob} (${p.age})</span>
        <span style="color:var(--text-secondary)">Gender:</span><span>${p.gender}</span>
        <span style="color:var(--text-secondary)">Address:</span><span>${p.addressLine1}, ${p.postCode}</span>
      </div>
    `;

    // Auto-fill matching variable fields
    const nhsInput = document.getElementById("var-PATIENT_NHS");
    if (nhsInput) nhsInput.value = p.nhsNumber;
    const nameInput = document.getElementById("var-PATIENT_NAME");
    if (nameInput) nameInput.value = `${p.forename} ${p.surname}`;
    const nhs2Input = document.getElementById("var-NHS_NUMBER");
    if (nhs2Input) nhs2Input.value = p.nhsNumber;
    const mrnInput = document.getElementById("var-MRN");
    if (mrnInput) { /* MRN would come from the target system */ }
    const dobInput = document.getElementById("var-DOB");
    if (dobInput) dobInput.value = p.dob;
    const genderInput = document.getElementById("var-GENDER");
    if (genderInput) genderInput.value = p.gender;

    addLog("info", `Patient ${p.id} loaded: ${p.forename} ${p.surname} (${p.nhsNumber})`);
  } catch (err) {
    addLog("error", `Failed to load patient: ${err.message}`);
  }
}


async function onScriptChange() {
  const sel = document.getElementById("scriptSelect");
  const filename = sel.value;
  const meta = document.getElementById("scriptMeta");
  const varsPanel = document.getElementById("variablesPanel");
  const runBtn = document.getElementById("runBtn");

  if (!filename) {
    meta.classList.add("hidden");
    varsPanel.classList.add("hidden");
    runBtn.disabled = true;
    return;
  }

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
    loadPatients();
  } catch (err) {
    addLog("error", `Failed to load script: ${err.message}`);
  }
}

function buildVariablesForm(variables) {
  const container = document.getElementById("variablesForm");
  container.innerHTML = "";

  if (!variables.length) {
    container.innerHTML = '<div class="empty-state" style="padding:0.75rem">No variables required</div>';
    return;
  }

  variables.forEach(v => {
    const div = document.createElement("div");
    div.className = "variable-field";

    const label = document.createElement("label");
    label.textContent = v.label || v.name;
    label.htmlFor = `var-${v.name}`;

    const input = document.createElement(v.type === "password" ? "input" : "input");
    input.id = `var-${v.name}`;
    input.name = v.name;
    input.type = v.type === "password" ? "password" : "text";
    input.placeholder = v.default || v.label || v.name;
    input.value = v.default || "";

    if (v.required) input.required = true;

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = v.required ? "Required" : "Optional";

    div.appendChild(label);
    div.appendChild(input);
    div.appendChild(hint);
    container.appendChild(div);
  });
}

function getVariables() {
  const vars = {};
  document.querySelectorAll("#variablesForm input").forEach(input => {
    vars[input.name] = input.value;
  });
  return vars;
}

// --- Test Execution ---

async function startRun() {
  if (!currentScript) return;
  const vars = getVariables();

  // validate required
  const missing = (currentScript.variables || []).filter(v => v.required && !vars[v.name]);
  if (missing.length) {
    alert(`Please fill in required fields: ${missing.map(v => v.label || v.name).join(", ")}`);
    return;
  }

  resetRunUI();
  document.getElementById("runBtn").classList.add("hidden");
  document.getElementById("cancelBtn").classList.remove("hidden");

  stepsData = currentScript.steps.map((s, i) => ({
    ...s,
    status: "pending",
    index: i
  }));
  renderStepList();

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: currentScript, variables: vars })
    });
    const data = await res.json();
    currentRunId = data.runId;
    document.getElementById("runIdLabel").textContent = currentRunId;
    document.getElementById("startedLabel").textContent = new Date().toLocaleTimeString();
    document.getElementById("runMeta").classList.remove("hidden");

    connectSSE(currentRunId);
  } catch (err) {
    addLog("error", `Failed to start run: ${err.message}`);
    resetButtons();
  }
}

function connectSSE(runId) {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/runs/${runId}/events`);

  eventSource.addEventListener("connected", () => {
    document.getElementById("connectionStatus").className = "status-dot connected";
    document.getElementById("connectionLabel").textContent = "Run active";
    addLog("info", `Connected to run ${runId}`);
  });

  eventSource.addEventListener("step-start", e => {
    const data = JSON.parse(e.data);
    updateStepStatus(data.stepId, "running");
    addLog("info", `▶ ${data.description || data.stepId}`);
  });

  eventSource.addEventListener("step-complete", e => {
    const data = JSON.parse(e.data);
    updateStepStatus(data.stepId, data.status, data.error);
    updateSummary();
    if (data.status === "fail") {
      addLog("error", `✗ ${data.stepId}: ${data.error || "Failed"}`);
    } else {
      addLog("success", `✓ ${data.stepId}: Passed`);
    }
  });

  eventSource.addEventListener("screenshot", e => {
    const data = JSON.parse(e.data);
    addScreenshot(data);
  });

  eventSource.addEventListener("log", e => {
    const data = JSON.parse(e.data);
    addLog(data.level || "info", data.message);
  });

  eventSource.addEventListener("complete", e => {
    const data = JSON.parse(e.data);
    addLog("info", `Run complete: ${data.passed}/${data.totalSteps} passed, ${data.failed} failed`);
    onRunComplete(data);
  });

  eventSource.addEventListener("error", e => {
    const data = JSON.parse(e.data);
    addLog("error", data.message || "Connection error");
  });

  eventSource.onerror = () => {
    addLog("warn", "SSE connection lost. Reload to reconnect.");
    document.getElementById("connectionStatus").className = "status-dot disconnected";
    document.getElementById("connectionLabel").textContent = "Disconnected";
  };
}

async function cancelRun() {
  if (!currentRunId) return;
  try {
    await fetch(`/api/runs/${currentRunId}/cancel`, { method: "POST" });
    addLog("warn", "Run cancellation requested");
  } catch (err) {
    addLog("error", `Cancel failed: ${err.message}`);
  }
}

// --- UI Updates ---

function resetRunUI() {
  document.getElementById("progressBarContainer").classList.remove("hidden");
  document.getElementById("progressBar").style.width = "0%";
  document.getElementById("summaryCards").classList.remove("hidden");
  document.getElementById("cardTotal").textContent = "0";
  document.getElementById("cardPassed").textContent = "0";
  document.getElementById("cardFailed").textContent = "0";
  document.getElementById("cardRate").textContent = "0%";
  document.getElementById("screenshotGrid").innerHTML = "";
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
    const div = document.createElement("div");
    div.className = `step-item ${step.status}`;
    div.id = `step-${step.id}`;

    const icon = document.createElement("div");
    icon.className = "step-icon";
    icon.innerHTML = step.status === "running" ? '<div class="running-spinner"></div>'
      : step.status === "pass" ? "✓"
      : step.status === "fail" ? "✗"
      : String(step.index + 1);

    const desc = document.createElement("div");
    desc.className = "step-desc";
    desc.textContent = step.description || step.id;

    const statusEl = document.createElement("div");
    statusEl.className = "step-status";
    statusEl.textContent = step.status === "running" ? "Running..."
      : step.status === "pass" ? "Pass"
      : step.status === "fail" ? "Failed"
      : "Pending";

    div.appendChild(icon);
    div.appendChild(desc);
    div.appendChild(statusEl);

    if (step.error) {
      const errEl = document.createElement("div");
      errEl.className = "step-error";
      errEl.textContent = step.error;
      div.appendChild(errEl);
    }

    container.appendChild(div);
  });
}

function updateStepStatus(stepId, status, error) {
  stepsData = stepsData.map(s => s.id === stepId ? { ...s, status, error: error || s.error } : s);
  const el = document.getElementById(`step-${stepId}`);
  if (!el) return;
  el.className = `step-item ${status}`;

  const icon = el.querySelector(".step-icon");
  icon.innerHTML = status === "running" ? '<div class="running-spinner"></div>'
    : status === "pass" ? "✓"
    : status === "fail" ? "✗"
    : status === "cancelled" ? "—"
    : "?";

  const statusEl = el.querySelector(".step-status");
  statusEl.textContent = status === "running" ? "Running..."
    : status === "pass" ? "Pass"
    : status === "fail" ? "Failed"
    : status === "cancelled" ? "Cancelled"
    : status;

  let errEl = el.querySelector(".step-error");
  if (error) {
    if (!errEl) {
      errEl = document.createElement("div");
      errEl.className = "step-error";
      el.appendChild(errEl);
    }
    errEl.textContent = error;
  }
}

function updateSummary() {
  const total = stepsData.length;
  const passed = stepsData.filter(s => s.status === "pass").length;
  const failed = stepsData.filter(s => s.status === "fail").length;
  const completed = passed + failed;
  const rate = completed > 0 ? Math.round((passed / completed) * 100) : 0;

  document.getElementById("cardTotal").textContent = total;
  document.getElementById("cardPassed").textContent = passed;
  document.getElementById("cardFailed").textContent = failed;
  document.getElementById("cardRate").textContent = `${rate}%`;
  document.getElementById("progressBar").style.width = `${(completed / total) * 100}%`;
}

function addScreenshot(data) {
  screenshotsData.push(data);
  const grid = document.getElementById("screenshotGrid");
  const empty = grid.querySelector(".empty-state");
  if (empty) empty.remove();

  const card = document.createElement("div");
  card.className = "screenshot-card";
  card.onclick = () => openScreenshot(data);

  const img = document.createElement("img");
  img.src = `/api/runs/${currentRunId}/screenshots/${data.filename}`;
  img.alt = data.description || data.stepId;
  img.loading = "lazy";

  const caption = document.createElement("div");
  caption.className = "caption";

  const badge = document.createElement("div");
  badge.className = "badge-step";
  badge.textContent = data.stepId;

  const desc = document.createElement("div");
  desc.textContent = data.description || data.filename;

  caption.appendChild(badge);
  caption.appendChild(desc);

  card.appendChild(img);
  card.appendChild(caption);
  grid.appendChild(card);
}

function onRunComplete(data) {
  resetButtons();
  document.getElementById("connectionStatus").className = "status-dot connected";
  document.getElementById("connectionLabel").textContent = "Completed";
  document.getElementById("reportBtn").disabled = false;
  if (data.failed > 0 || data.passed > 0) {
    document.getElementById("practitestBtn").disabled = false;
  }
  if (eventSource) { eventSource.close(); eventSource = null; }
}

// --- Actions ---

function openScreenshot(data) {
  const modal = document.getElementById("screenshotModal");
  const img = document.getElementById("modalImage");
  const caption = document.getElementById("modalCaption");
  img.src = `/api/runs/${currentRunId}/screenshots/${data.filename}`;
  caption.textContent = `${data.stepId}: ${data.description || ""}`;
  modal.classList.remove("hidden");
}

function closeModal() {
  document.getElementById("screenshotModal").classList.add("hidden");
}

async function openReport() {
  if (!currentRunId) return;
  window.open(`/api/runs/${currentRunId}/report`, "_blank");
}

async function uploadToPractitest() {
  if (!currentRunId) return;
  try {
    document.getElementById("practitestBtn").disabled = true;
    const res = await fetch("/api/practitest/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: currentRunId })
    });
    const data = await res.json();
    if (data.success) {
      addLog("success", `Uploaded ${data.results.filter(r => r.status === "uploaded").length} screenshots to Practitest`);
    } else {
      addLog("warn", `Practitest upload: ${data.message || "Check configuration"}`);
    }
  } catch (err) {
    addLog("error", `Practitest upload failed: ${err.message}`);
  } finally {
    document.getElementById("practitestBtn").disabled = false;
  }
}

async function checkPractitestStatus() {
  try {
    const res = await fetch("/api/practitest/status");
    const data = await res.json();
    if (!data.configured) {
      addLog("warn", "Practitest not configured - set PRACTITEST_TOKEN and PRACTITEST_PROJECT_ID env vars to enable uploading");
    }
  } catch {}
}

// --- Logging ---

function addLog(level, message) {
  const container = document.getElementById("logContainer");
  const empty = container.querySelector(".empty-state");
  if (empty) empty.remove();

  const entry = document.createElement("div");
  entry.className = "log-entry";

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = new Date().toLocaleTimeString();

  const msg = document.createElement("span");
  msg.className = `log-msg ${level}`;
  msg.textContent = message;

  entry.appendChild(time);
  entry.appendChild(msg);
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

function clearLog() {
  const container = document.getElementById("logContainer");
  container.innerHTML = '<div class="empty-state">Log cleared.</div>';
}

// --- PractiTest CSV Import ---

let importFileInput = null;

function createImportUI() {
  const setupPanel = document.querySelector(".setup-panel .panel-header");
  if (!setupPanel) return;

  const importSection = document.createElement("div");
  importSection.className = "import-section";
  importSection.innerHTML = `
    <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--border);">
    <h3 class="variables-title">Import from PractiTest CSV</h3>
    <div class="form-group">
      <label for="csvFileInput">Select PractiTest CSV export file</label>
      <input type="file" id="csvFileInput" accept=".csv" style="font-size:0.8rem; padding:0.4rem;">
    </div>
    <div id="csvPreview" class="hidden"></div>
    <div class="button-row">
      <button class="btn btn-secondary btn-sm" id="previewCsvBtn" onclick="previewCSV()" disabled>
        Preview
      </button>
      <button class="btn btn-primary btn-sm" id="importCsvBtn" onclick="importCSV()" disabled>
        Import to Scripts
      </button>
    </div>
  `;

  const panelBody = setupPanel.parentElement;
  panelBody.appendChild(importSection);

  document.getElementById("csvFileInput").addEventListener("change", function(e) {
    const file = e.target.files[0];
    document.getElementById("previewCsvBtn").disabled = !file;
    document.getElementById("importCsvBtn").disabled = !file;
    if (file) addLog("info", `Selected CSV: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  });
}

async function readCSVFile() {
  const input = document.getElementById("csvFileInput");
  if (!input.files || !input.files[0]) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = e => reject(e.target.error);
    reader.readAsText(input.files[0]);
  });
}

async function previewCSV() {
  const csv = await readCSVFile();
  if (!csv) return;
  try {
    const res = await fetch("/api/scripts/upload-csv-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv })
    });
    const data = await res.json();
    if (data.error) {
      addLog("error", `CSV parse failed: ${data.error}`);
      return;
    }
    const preview = document.getElementById("csvPreview");
    preview.classList.remove("hidden");
    preview.innerHTML = `
      <div style="background:var(--surface-2);border-radius:var(--radius);padding:0.75rem;font-size:0.8rem;">
        <strong>${data.total} test cases</strong> found in CSV
        <ul style="margin-top:0.5rem;padding-left:1.2rem;">
          ${data.preview.map(t => `<li><strong>${t.id}</strong>: ${t.name} (${t.system}, ${t.steps} steps)</li>`).join("")}
          ${data.total > 5 ? `<li>... and ${data.total - 5} more</li>` : ""}
        </ul>
      </div>
    `;
    addLog("success", `Preview: ${data.total} test cases loaded from CSV`);
  } catch (err) {
    addLog("error", `Preview failed: ${err.message}`);
  }
}

async function importCSV() {
  const csv = await readCSVFile();
  if (!csv) return;
  try {
    const res = await fetch("/api/scripts/upload-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv })
    });
    const data = await res.json();
    if (data.error) {
      addLog("error", `Import failed: ${data.error}`);
      return;
    }
    addLog("success", `Imported ${data.imported} test cases from PractiTest CSV`);
    document.getElementById("csvPreview").innerHTML = `
      <div style="background:var(--success-bg);border-radius:var(--radius);padding:0.75rem;font-size:0.8rem;color:var(--success-text);">
        ✓ ${data.imported} scripts imported. Refresh the script list to see them.
      </div>
    `;
    await loadScripts();
  } catch (err) {
    addLog("error", `Import failed: ${err.message}`);
  }
}

// --- AI Status ---

async function checkAIStatus() {
  try {
    const res = await fetch("/api/ai/status");
    const data = await res.json();
    const header = document.querySelector(".header-status");
    if (header) {
      const enabled = data.enabled;
      const cm = data.centralMemory || {};
      const totalMaps = cm.totalMappings || data.localCacheSteps || 0;
      
      const badges = document.createElement("div");
      badges.style.cssText = "display:flex;gap:0.3rem;align-items:center;";
      
      const aiBadge = document.createElement("span");
      aiBadge.style.cssText = `padding:0.15rem 0.45rem;border-radius:4px;font-size:0.7rem;font-weight:600;${enabled ? "background:#8b5cf6;color:white;" : "background:#e2e8f0;color:#94a3b8;"}`;
      aiBadge.textContent = enabled ? "AI" : "AI off";
      aiBadge.title = enabled ? `LM: ${data.lmHost}\nModel: ${data.aiModel}` : "Set LM_HOST env var to enable";
      
      const memBadge = document.createElement("span");
      memBadge.style.cssText = "background:#f1f5f9;color:#475569;padding:0.15rem 0.45rem;border-radius:4px;font-size:0.7rem;";
      memBadge.textContent = `${totalMaps} maps`;
      memBadge.title = `Central memory: ${totalMaps} mappings\nHigh: ${cm.highConfidence || 0} | Med: ${cm.mediumConfidence || 0} | Low: ${cm.lowConfidence || 0}\nNodes: ${(cm.nodes || []).length}\nNode ID: ${data.nodeId}`;
      
      if (cm.nodes && cm.nodes.length > 1) {
        const multiBadge = document.createElement("span");
        multiBadge.style.cssText = "background:#dbeafe;color:#1e40af;padding:0.15rem 0.45rem;border-radius:4px;font-size:0.7rem;";
        multiBadge.textContent = `${cm.nodes.length} nodes`;
        badges.appendChild(multiBadge);
      }
      
      badges.appendChild(aiBadge);
      badges.appendChild(memBadge);
      header.appendChild(badges);
    }
  } catch {}
}

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  init();
  setTimeout(createImportUI, 100);
});
