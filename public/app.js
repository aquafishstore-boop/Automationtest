let currentRunId = null;
let currentScript = null;
let eventSource = null;
let stepsData = [];
let screenshotsData = [];
let lastRunResult = null;
let selectedAgent = null;
let stepStartTimes = {};

// Browser detection and compatibility
const BrowserCompat = {
  isEdge: /Edge\/|Edg\//.test(navigator.userAgent),
  isFirefox: /Firefox\//.test(navigator.userAgent),
  isSafari: /Safari\//.test(navigator.userAgent) && !/Chrome\//.test(navigator.userAgent),
  isChrome: /Chrome\//.test(navigator.userAgent) && !/Edge\/|Edg\//.test(navigator.userAgent),
  
  // Apply browser-specific fixes
  applyFixes: function() {
    if (this.isEdge) {
      this.applyEdgeFixes();
    } else if (this.isFirefox) {
      this.applyFirefoxFixes();
    } else if (this.isSafari) {
      this.applySafariFixes();
    }
  },
  
  // Edge-specific fixes
  applyEdgeFixes: function() {
    // Fix for Edge grid layout issues
    document.querySelectorAll('.grid').forEach(el => {
      el.style.display = 'grid';
    });
    
    // Fix for Edge flexbox gap issues
    document.querySelectorAll('.flex').forEach(el => {
      if (getComputedStyle(el).gap === 'normal') {
        el.style.gap = '0.5rem';
      }
    });
    
    // Fix for Edge scrollbar styling
    document.documentElement.classList.add('edge-browser');
    
    // Fix for Edge input placeholder issues
    document.querySelectorAll('input').forEach(input => {
      if (!input.placeholder) {
        input.placeholder = '';
      }
    });
    
    // Fix for Edge select dropdown issues
    document.querySelectorAll('select').forEach(select => {
      select.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%2364748b\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")';
      select.style.backgroundRepeat = 'no-repeat';
      select.style.backgroundPosition = 'right 0.75rem center';
      select.style.backgroundSize = '12px';
      select.style.paddingRight = '2.5rem';
    });
    
    // Fix for Edge button hover states
    document.querySelectorAll('button').forEach(button => {
      button.style.transition = 'all 0.15s ease';
    });
    
    // Fix for Edge animation performance
    document.querySelectorAll('.transition-all').forEach(el => {
      el.style.willChange = 'transform, opacity';
    });
    
    console.log('Edge browser fixes applied');
  },
  
  // Firefox-specific fixes
  applyFirefoxFixes: function() {
    document.documentElement.classList.add('firefox-browser');
    
    // Fix for Firefox scrollbar styling
    document.documentElement.style.scrollbarWidth = 'thin';
    document.documentElement.style.scrollbarColor = '#cbd5e1 #f1f5f9';
    
    // Fix for Firefox button rendering
    document.querySelectorAll('button').forEach(button => {
      button.style.fontFamily = 'inherit';
    });
    
    // Fix for Firefox select arrow
    document.querySelectorAll('select').forEach(select => {
      select.style.MozAppearance = 'none';
      select.style.appearance = 'none';
      select.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%2364748b\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")';
      select.style.backgroundRepeat = 'no-repeat';
      select.style.backgroundPosition = 'right 0.75rem center';
      select.style.backgroundSize = '12px';
      select.style.paddingRight = '2.5rem';
    });
    
    console.log('Firefox browser fixes applied');
  },
  
  // Safari-specific fixes
  applySafariFixes: function() {
    document.documentElement.classList.add('safari-browser');
    
    // Fix for Safari input height issues
    document.querySelectorAll('input[type="text"], input[type="number"], input[type="password"], input[type="email"], input[type="search"]').forEach(input => {
      input.style.webkitAppearance = 'none';
      input.style.appearance = 'none';
      input.style.lineHeight = 'normal';
    });
    
    // Fix for Safari select rendering
    document.querySelectorAll('select').forEach(select => {
      select.style.webkitAppearance = 'none';
      select.style.appearance = 'none';
      select.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%2364748b\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")';
      select.style.backgroundRepeat = 'no-repeat';
      select.style.backgroundPosition = 'right 0.75rem center';
      select.style.backgroundSize = '12px';
      select.style.paddingRight = '2.5rem';
    });
    
    // Fix for Safari flexbox gap issues
    document.querySelectorAll('.flex').forEach(el => {
      if (!CSS.supports('gap', '1rem')) {
        el.style.margin = '-0.5rem';
        Array.from(el.children).forEach(child => {
          child.style.margin = '0.5rem';
        });
      }
    });
    
    console.log('Safari browser fixes applied');
  },
  
  // Polyfills for older browsers
  applyPolyfills: function() {
    // Array.prototype.flat polyfill
    if (!Array.prototype.flat) {
      Array.prototype.flat = function(depth) {
        depth = depth || 1;
        return depth > 0 ? this.reduce((acc, val) => 
          acc.concat(Array.isArray(val) ? val.flat(depth - 1) : val), []) : this.slice();
      };
    }
    
    // Object.entries polyfill
    if (!Object.entries) {
      Object.entries = function(obj) {
        return Object.keys(obj).map(key => [key, obj[key]]);
      };
    }
    
    // Promise.finally polyfill
    if (!Promise.prototype.finally) {
      Promise.prototype.finally = function(callback) {
        return this.then(
          value => Promise.resolve(callback()).then(() => value),
          reason => Promise.resolve(callback()).then(() => Promise.reject(reason))
        );
      };
    }
    
    // String.prototype.replaceAll polyfill
    if (!String.prototype.replaceAll) {
      String.prototype.replaceAll = function(str, newStr) {
        if (Object.prototype.toString.call(str).toLowerCase() === '[object regexp]') {
          return this.replace(str, newStr);
        }
        return this.replace(new RegExp(str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), newStr);
      };
    }
  }
};

const PAGE_INFO = {
  dashboard: { title: "Dashboard", subtitle: "Overview of all UAT testing activity" },
  runner: { title: "Test Runner", subtitle: "Execute UAT scripts with real-time progress" },
  agents: { title: "AI Agents", subtitle: "9 specialized pathology agents" },
  aitools: { title: "AI Tools", subtitle: "Natural language authoring and fine-tuning" },
  fhir: { title: "FHIR Data", subtitle: "Generate synthetic patient test data" },
  infra: { title: "Infrastructure", subtitle: "Metrics, scheduling, and monitoring" }
};

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  // Apply browser compatibility fixes
  BrowserCompat.applyPolyfills();
  BrowserCompat.applyFixes();
  ensureCrossBrowserCompatibility();
  
  restoreSession();
  init();
  document.addEventListener("keydown", handleKeyboard);
});

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
  updateHealthList();
  
  if (window.matchMedia("(prefers-color-scheme: dark)").matches || localStorage.getItem("uat-theme") === "dark") {
    enableDarkMode();
  }
  
  const tab = localStorage.getItem("uat-tab") || "dashboard";
  switchTab(tab, true);
}

function saveSession() {
  try {
    localStorage.setItem("uat-tab", document.querySelector(".tab-content.active")?.id?.replace("tab-", "") || "dashboard");
  } catch {}
}

function restoreSession() {
  try {
    const t = localStorage.getItem("uat-tab");
    if (t) switchTab(t, true);
  } catch {}
}

function toggleTheme() {
  document.documentElement.classList.contains("dark") ? disableDarkMode() : enableDarkMode();
}

function enableDarkMode() {
  document.documentElement.classList.add("dark");
  localStorage.setItem("uat-theme", "dark");
  document.getElementById("themeIcon").className = "ph ph-sun text-xl";
}

function disableDarkMode() {
  document.documentElement.classList.remove("dark");
  localStorage.setItem("uat-theme", "light");
  document.getElementById("themeIcon").className = "ph ph-moon text-xl";
}

function switchTab(name, silent) {
  // Update tab content
  document.querySelectorAll(".tab-content").forEach(t => t.classList.toggle("active", t.id === `tab-${name}`));
  
  // Update nav buttons
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });
  
  // Update page title and subtitle
  const info = PAGE_INFO[name];
  if (info) {
    document.getElementById("pageTitle").textContent = info.title;
    document.getElementById("pageSubtitle").textContent = info.subtitle;
  }
  
  if (!silent) saveSession();
  
  // Load data for specific tabs
  if (name === "infra") {
    refreshMetrics();
    loadSchedule();
  }
  if (name === "aitools") {
    loadRemediationStats();
    loadFineTuneStats();
  }
  
  window.scrollTo(0, 0);
}

function toast(msg, type = "") {
  const c = document.getElementById("toastContainer");
  const t = document.createElement("div");
  t.className = `toast bg-white border border-slate-200 rounded-lg shadow-lg px-4 py-3 text-sm flex items-center gap-2 ${type === "success" ? "border-green-300" : type === "error" ? "border-red-300" : ""}`;
  const icon = type === "success" ? "ph-check-circle text-green-600" : type === "error" ? "ph-x-circle text-red-600" : "ph-info text-blue-600";
  t.innerHTML = `<i class="ph-bold ${icon}"></i><span>${msg}</span>`;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

function handleKeyboard(e) {
  if (e.key === "Escape") {
    closeModal();
    const cb = document.querySelector("#cancelBtn");
    if (!cb.classList.contains("hidden")) cb?.click();
    return;
  }
}

// ===== SCRIPTS =====
async function loadScripts() {
  try {
    const r = await (await fetch("/api/scripts")).json();
    const s = document.getElementById("scriptSelect");
    s.innerHTML = '<option value="">Select a test script...</option>';
    r.forEach(s2 => {
      const o = document.createElement("option");
      o.value = s2.filename;
      o.textContent = `${s2.name} (${s2.system})`;
      s.appendChild(o);
    });
  } catch (err) {
    log("Scripts: " + err.message);
  }
}

function populateLoadScripts() {
  const s = document.getElementById("loadScriptSelect");
  if (!s) return;
  s.innerHTML = '<option value="">-- Select --</option>';
  const o = document.getElementById("scriptSelect")?.options;
  if (o) for (const p of o) if (p.value) s.appendChild(p.cloneNode(true));
}

// ===== PATIENTS =====
async function loadPatients() {
  try {
    const r = await (await fetch("/api/patients")).json();
    const s = document.getElementById("patientSelect");
    if (!s) return;
    s.innerHTML = '<option value="">Select patient...</option>';
    r.forEach(p => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = `${p.id} - ${p.forename} ${p.surname} (${p.nhsNumber})`;
      s.appendChild(o);
    });
  } catch {}
}

async function onPatientSelect() {
  const s = document.getElementById("patientSelect");
  const d = document.getElementById("patientDetails");
  const id = s.value;
  if (!id) {
    d.classList.add("hidden");
    return;
  }
  try {
    const p = await (await fetch(`/api/patients/${id}`)).json();
    d.classList.remove("hidden");
    d.innerHTML = `<div class="text-sm"><span class="text-slate-400">NHS:</span> <strong>${p.nhsNumber}</strong></div><div class="text-sm mt-1"><span class="text-slate-400">Name:</span> ${p.title} ${p.forename} ${p.surname}</div><div class="text-sm mt-1"><span class="text-slate-400">DOB:</span> ${p.dob} (${p.age})</div>`;
    ["PATIENT_NHS", "NHS_NUMBER"].forEach(n => {
      const i = document.getElementById(`var-${n}`);
      if (i) i.value = p.nhsNumber;
    });
    const ni = document.getElementById("var-PATIENT_NAME");
    if (ni) ni.value = `${p.forename} ${p.surname}`;
  } catch {}
}

async function onScriptChange() {
  const f = document.getElementById("scriptSelect").value;
  const m = document.getElementById("scriptMeta");
  const v = document.getElementById("variablesPanel");
  const b = document.getElementById("runBtn");
  
  if (!f) {
    m.classList.add("hidden");
    v.classList.add("hidden");
    b.disabled = true;
    return;
  }
  
  try {
    const r = await (await fetch(`/api/scripts/${f}`)).json();
    currentScript = r;
    document.getElementById("metaSystem").textContent = r.system || "N/A";
    document.getElementById("metaSteps").textContent = r.steps.length;
    document.getElementById("metaDescription").textContent = (r.description || "").slice(0, 120);
    m.classList.remove("hidden");
    currentScript.filename = f;
    buildVariablesForm(r.variables || []);
    v.classList.remove("hidden");
    b.disabled = false;
  } catch (err) {
    log("Script: " + err.message);
  }
}

function buildVariablesForm(v) {
  const c = document.getElementById("variablesPanel");
  c.innerHTML = "";
  if (!v.length) {
    c.innerHTML = '<div class="text-sm text-slate-400 text-center py-4">No variables required</div>';
    return;
  }
  
  const form = document.createElement("div");
  form.className = "space-y-4";
  
  v.forEach(v2 => {
    const d = document.createElement("div");
    const l = document.createElement("label");
    l.className = "block text-sm font-medium text-slate-700 mb-2";
    l.textContent = v2.label || v2.name;
    
    const i = document.createElement("input");
    i.className = "w-full bg-slate-50 border border-slate-300 text-sm rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500";
    i.id = `var-${v2.name}`;
    i.name = v2.name;
    i.type = v2.type === "password" ? "password" : "text";
    i.placeholder = v2.default || v2.label || v2.name;
    i.value = v2.default || "";
    if (v2.required) i.required = true;
    
    d.appendChild(l);
    d.appendChild(i);
    form.appendChild(d);
  });
  
  c.appendChild(form);
}

function getVariables() {
  const v = {};
  document.querySelectorAll("#variablesPanel input").forEach(i => {
    v[i.name] = i.value;
  });
  return v;
}

// ===== RUN =====
async function startRun() {
  if (!currentScript) return;
  const vars = getVariables();
  const missing = (currentScript.variables || []).filter(v => v.required && !vars[v.name]);
  if (missing.length) {
    toast(`Fill in: ${missing.map(v => v.label || v.name).join(", ")}`, "error");
    return;
  }
  
  resetRunUI();
  document.getElementById("runBtn").classList.add("hidden");
  document.getElementById("cancelBtn").classList.remove("hidden");
  stepsData = currentScript.steps.map((s, i) => ({ ...s, status: "pending", index: i }));
  
  try {
    const d = await (await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: currentScript, variables: vars })
    })).json();
    currentRunId = d.runId;
    document.getElementById("currentScriptName").textContent = currentScript.name || "Test Run";
    document.getElementById("progressContainer").classList.remove("hidden");
    connectSSE(d.runId);
    log(`Run started: ${d.runId}`, "info");
  } catch (err) {
    log("Run: " + err.message, "error");
    resetButtons();
  }
}

function connectSSE(id) {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/runs/${id}/events`);
  
  eventSource.addEventListener("step-start", e => {
    const d = JSON.parse(e.data);
    stepStartTimes[d.stepId] = performance.now();
    renderTimelineStep(d.stepId, d.description || d.stepId, "running");
    log(`▶ ${d.description || d.stepId}`, "info");
  });
  
  eventSource.addEventListener("step-complete", e => {
    const d = JSON.parse(e.data);
    const el = stepStartTimes[d.stepId] ? ((performance.now() - stepStartTimes[d.stepId]) / 1000).toFixed(1) + "s" : "";
    updateTimelineStep(d.stepId, d.status, d.error, el);
    updateStats();
    log(d.status === "pass" ? `✓ ${d.stepId}` : `✗ ${d.stepId}${d.error ? " - " + d.error : ""}`, d.status === "pass" ? "success" : "error");
  });
  
  eventSource.addEventListener("screenshot", e => {
    const d = JSON.parse(e.data);
    addEvidence(d);
  });
  
  eventSource.addEventListener("log", e => {
    try {
      const d = JSON.parse(e.data);
      log(d.message, d.level || "info");
    } catch {}
  });
  
  eventSource.addEventListener("complete", e => {
    const d = JSON.parse(e.data);
    lastRunResult = d;
    log(`Complete: ${d.passed}/${d.totalSteps} passed`, "success");
    onRunComplete(d);
  });
  
  eventSource.addEventListener("error", e => {
    try {
      log(JSON.parse(e.data).message || "Error", "error");
    } catch {}
  });
  
  eventSource.onerror = () => {};
}

async function cancelRun() {
  if (!currentRunId) return;
  try {
    await fetch(`/api/runs/${currentRunId}/cancel`, { method: "POST" });
    toast("Cancelled", "warn");
  } catch {}
}

function resetRunUI() {
  document.getElementById("progressContainer").classList.add("hidden");
  document.getElementById("progressBar").style.width = "0%";
  document.getElementById("progressText").textContent = "0%";
  document.getElementById("cardTotal").textContent = "0";
  document.getElementById("cardPassed").textContent = "0";
  document.getElementById("cardFailed").textContent = "0";
  document.getElementById("cardRate").textContent = "0%";
  document.getElementById("evidenceContainer").classList.add("hidden");
  document.getElementById("evidenceGrid").innerHTML = "";
  screenshotsData = [];
  stepStartTimes = {};
  document.getElementById("reportBtn").disabled = true;
  document.getElementById("timelineContainer").innerHTML = '<div class="h-full flex flex-col items-center justify-center text-slate-400"><i class="ph ph-clock text-5xl opacity-30 mb-3"></i><p class="text-sm">Awaiting execution...</p></div>';
  document.getElementById("terminalContainer").innerHTML = '<div class="text-slate-500">Aetheris UAT Runtime v3.2.0 ready.</div>';
}

function resetButtons() {
  document.getElementById("runBtn").classList.remove("hidden");
  document.getElementById("cancelBtn").classList.add("hidden");
}

function renderTimelineStep(stepId, desc, status, error) {
  const empty = document.getElementById("timelineContainer").querySelector(".h-full");
  if (empty) empty.style.display = "none";
  const c = document.getElementById("timelineContainer");
  const existing = document.getElementById(`tl-${stepId}`);
  if (existing) existing.remove();
  
  const d = document.createElement("div");
  d.className = "timeline-item flex gap-3 mb-4";
  d.id = `tl-${stepId}`;
  
  let icon = '<div class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center border-2 border-slate-200 z-10 relative flex-shrink-0"><i class="ph ph-circle text-xs"></i></div>';
  if (status === "running") icon = '<div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center border-2 border-blue-200 z-10 relative flex-shrink-0 pulse-dot"><i class="ph ph-circle-notch text-sm"></i></div>';
  if (status === "pass") icon = '<div class="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center border-2 border-green-200 z-10 relative flex-shrink-0"><i class="ph-bold ph-check text-sm"></i></div>';
  if (status === "fail") icon = '<div class="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center border-2 border-red-200 z-10 relative flex-shrink-0"><i class="ph-bold ph-x text-sm"></i></div>';
  
  d.innerHTML = `${icon}<div class="flex-1 min-w-0"><div class="text-sm font-medium text-slate-800">${desc}</div>${error ? `<div class="text-xs text-red-600 mt-1">${error}</div>` : ""}</div>`;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function updateTimelineStep(stepId, status, error, elapsed) {
  const el = document.getElementById(`tl-${stepId}`);
  if (!el) return;
  
  let icon = '<div class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center border-2 border-slate-200 z-10 relative flex-shrink-0"><i class="ph ph-circle text-xs"></i></div>';
  if (status === "pass") icon = '<div class="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center border-2 border-green-200 z-10 relative flex-shrink-0"><i class="ph-bold ph-check text-sm"></i></div>';
  if (status === "fail") icon = '<div class="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center border-2 border-red-200 z-10 relative flex-shrink-0"><i class="ph-bold ph-x text-sm"></i></div>';
  
  el.innerHTML = `${icon}<div class="flex-1 min-w-0"><div class="text-sm font-medium text-slate-800">${el.querySelector(".text-sm")?.textContent || stepId}</div>${error ? `<div class="text-xs text-red-600 mt-1">${error}</div>` : ""}${elapsed ? `<div class="text-xs text-slate-400 mt-1">${elapsed}</div>` : ""}</div>`;
}

function updateStats() {
  if (!stepsData.length) {
    const s = document.querySelectorAll(".timeline-item");
    stepsData = Array.from(s).map((el, i) => ({
      id: el.id.replace("tl-", ""),
      status: el.querySelector(".text-green-600") ? "pass" : el.querySelector(".text-red-600") ? "fail" : "pending",
      index: i
    }));
  }
  
  const t = stepsData.length;
  const p = stepsData.filter(s => s.status === "pass").length;
  const f = stepsData.filter(s => s.status === "fail").length;
  
  document.getElementById("cardTotal").textContent = t;
  document.getElementById("cardPassed").textContent = p;
  document.getElementById("cardFailed").textContent = f;
  document.getElementById("cardRate").textContent = t > 0 ? Math.round((p / (p + f)) * 100) + "%" : "0%";
  document.getElementById("progressBar").style.width = `${t > 0 ? ((p + f) / t * 100) : 0}%`;
  document.getElementById("progressText").textContent = `${t > 0 ? Math.round((p + f) / t * 100) : 0}%`;
}

function addEvidence(data) {
  screenshotsData.push(data);
  document.getElementById("evidenceContainer").classList.remove("hidden");
  const g = document.getElementById("evidenceGrid");
  const d = document.createElement("div");
  d.className = "group relative rounded-lg overflow-hidden border border-slate-200 shadow-sm cursor-pointer";
  d.onclick = () => openScreenshot(data);
  d.innerHTML = `<img src="/api/runs/${currentRunId}/screenshots/${data.filename}" alt="Evidence" class="w-full h-32 object-cover evidence-img" loading="lazy"><div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/90 to-transparent p-3 pt-8"><p class="text-xs text-white font-medium truncate">${data.description || data.filename}</p></div>`;
  g.appendChild(d);
}

function onRunComplete(data) {
  resetButtons();
  document.getElementById("reportBtn").disabled = false;
  document.getElementById("currentStepDesc").textContent = "Execution completed.";
  document.getElementById("progressBar").classList.add("bg-green-500");
  document.getElementById("progressBar").classList.remove("bg-blue-600");
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function openScreenshot(d) {
  document.getElementById("modalImage").src = `/api/runs/${currentRunId}/screenshots/${d.filename}`;
  document.getElementById("modalCaption").textContent = `${d.stepId}: ${d.description || ""}`;
  document.getElementById("screenshotModal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("screenshotModal").classList.add("hidden");
}

async function openReport() {
  if (currentRunId) window.open(`/api/runs/${currentRunId}/report`, "_blank");
}

function log(msg, level = "info") {
  const c = document.getElementById("terminalContainer");
  const d = document.createElement("div");
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const colors = { info: "text-slate-300", success: "text-green-400", error: "text-red-400", warn: "text-yellow-400", ai: "text-purple-400" };
  d.className = `mb-1 ${colors[level] || colors.info}`;
  d.innerHTML = `<span class="text-slate-500 mr-2">[${time}]</span>${msg}`;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

// ===== AGENTS =====
async function loadAgents() {
  try {
    const r = await (await fetch("/api/agents")).json();
    const g = document.getElementById("agentGrid");
    if (!g) return;
    g.innerHTML = "";
    
    r.forEach(a => {
      const c = document.createElement("div");
      c.className = "agent-card bg-white rounded-xl border border-slate-200 shadow-sm p-5 cursor-pointer";
      c.onclick = () => selectAgent(a);
      c.innerHTML = `<div class="flex items-center gap-3 mb-3"><div class="w-10 h-10 rounded-lg ${a.implemented ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"} flex items-center justify-center"><i class="ph ${a.implemented ? "ph-check-circle" : "ph-circle"} text-xl"></i></div><div><div class="font-semibold text-slate-800">${a.name}</div><div class="text-xs text-slate-400">${a.workflow || ""}</div></div></div><div class="text-sm text-slate-500 mb-3">${a.description}</div><div class="flex flex-wrap gap-2"><span class="text-xs font-medium ${a.implemented ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"} px-2 py-1 rounded-full">${a.implemented ? "Active" : "Stub"}</span><span class="text-xs text-slate-400">${a.systems.slice(0, 2).join(", ")}${a.systems.length > 2 ? "..." : ""}</span></div>`;
      g.appendChild(c);
    });
  } catch (err) {
    toast("Agents: " + err.message, "error");
  }
}

function selectAgent(agent) {
  selectedAgent = agent;
  document.querySelectorAll(".agent-card").forEach(c => c.classList.remove("selected"));
  event?.target?.closest(".agent-card")?.classList.add("selected");
  document.getElementById("agentRunPanel").classList.remove("hidden");
  document.getElementById("agentRunTitle").textContent = agent.name;
  document.getElementById("agentRunForm").innerHTML = `
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-2">Workflow</label>
      <select id="agentWorkflow" class="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500">
        ${agent.testCases.map(t => `<option>${t}</option>`).join("")}
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-2">Patient NHS</label>
      <input id="agentNhs" class="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" placeholder="999 057 5924">
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-2">URL (optional)</label>
      <input id="agentUrl" class="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500">
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-2">Username</label>
      <input id="agentUser" class="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500">
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-2">Password</label>
      <input id="agentPass" type="password" class="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500">
    </div>
  `;
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
  btn.disabled = true;
  btn.innerHTML = '<i class="ph-bold ph-spinner animate-spin"></i> Running...';
  
  try {
    const ep = selectedAgent.id === "custom-script" ? "custom" : selectedAgent.id;
    const d = await (await fetch(`/api/agents/${ep}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })).json();
    
    document.getElementById("agentResult").classList.remove("hidden");
    document.getElementById("agentResult").innerHTML = `<div class="text-sm space-y-2"><div class="flex justify-between"><span class="text-slate-500">Status</span><span class="font-medium">${d.status}</span></div><div class="flex justify-between"><span class="text-slate-500">Passed</span><span class="font-medium text-green-600">${d.passed || 0}/${d.total || 0}</span></div><div class="flex justify-between"><span class="text-slate-500">Screenshots</span><span class="font-medium">${d.screenshots || 0}</span></div></div>`;
    toast(`Agent: ${d.status} (${d.passed || 0}/${d.total || 0})`, d.status === "passed" ? "success" : "error");
  } catch (err) {
    toast("Agent: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Run Agent";
  }
}

// ===== NL =====
async function generateScriptNL() {
  const text = document.getElementById("nlInput")?.value;
  if (!text) {
    toast("Enter a description", "error");
    return;
  }
  const systems = (document.getElementById("nlSystems")?.value || "").split(",").map(s => s.trim()).filter(Boolean);
  
  try {
    const d = await (await fetch("/api/nl/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, systems })
    })).json();
    
    document.getElementById("nlResult").classList.remove("hidden");
    if (d.error) {
      document.getElementById("nlResult").innerHTML = `<div class="text-red-600 text-sm">${d.error}</div>`;
      return;
    }
    document.getElementById("nlResult").innerHTML = `<pre class="bg-slate-900 text-slate-300 rounded-lg p-4 text-xs overflow-x-auto">${JSON.stringify(Array.isArray(d) ? d : d.steps || d, null, 2)}</pre>`;
    toast(`Generated ${Array.isArray(d) ? d.length : 0} steps`, "success");
  } catch (err) {
    toast("NL: " + err.message, "error");
  }
}

async function suggestTests() {
  const s = document.getElementById("nlSystems")?.value || "";
  try {
    const d = await (await fetch("/api/nl/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: s })
    })).json();
    document.getElementById("nlResult").classList.remove("hidden");
    document.getElementById("nlResult").innerHTML = `<pre class="bg-slate-900 text-slate-300 rounded-lg p-4 text-xs">${d.result || JSON.stringify(d, null, 2)}</pre>`;
  } catch (err) {
    toast("Suggest: " + err.message, "error");
  }
}

// ===== REMEDIATION =====
async function loadRemediationStats() {
  try {
    const d = await (await fetch("/api/remediate/stats")).json();
    document.getElementById("remTotal").textContent = d.totalRemediations ?? "-";
    document.getElementById("remSuccess").textContent = d.successful ?? "-";
    document.getElementById("remRate").textContent = d.successRate ?? "-";
  } catch {}
  
  try {
    const l = await (await fetch("/api/remediate/log?limit=10")).json();
    const el = document.getElementById("remediationLog");
    if (!l.length) return;
    el.innerHTML = l.map(l2 => `<div><span class="text-slate-500">[${new Date(l2.timestamp).toLocaleTimeString()}]</span> ${l2.diagnosis || l2.step || l2.event}</div>`).join("");
  } catch {}
}

async function loadFineTuneStats() {
  try {
    const d = await (await fetch("/api/fine-tune/stats")).json();
    document.getElementById("ftFiles").textContent = d.files ?? "-";
    document.getElementById("ftExamples").textContent = d.totalExamples ?? "-";
  } catch {}
  
  try {
    const f = await (await fetch("/api/fine-tune/files")).json();
    const el = document.getElementById("ftFileList");
    if (!f.length) {
      el.innerHTML = '<div class="text-slate-400 text-sm text-center py-3">No data.</div>';
      return;
    }
    el.innerHTML = f.map(f2 => `<div class="flex justify-between text-sm"><span>${f2.filename}</span><span class="text-slate-400">${f2.examples} ex</span></div>`).join("");
  } catch {}
}

async function collectTraining() {
  if (!lastRunResult) {
    toast("No completed run", "error");
    return;
  }
  try {
    const d = await (await fetch("/api/fine-tune/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: lastRunResult.steps || [], system: lastRunResult.system || "general" })
    })).json();
    toast(`Collected ${d.count || 0} examples`, "success");
    loadFineTuneStats();
  } catch (err) {
    toast("Collect: " + err.message, "error");
  }
}

async function submitFineTune() {
  try {
    const d = await (await fetch("/api/fine-tune/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    })).json();
    toast(d.submitted ? `Submitted (${d.totalExamples} ex)` : `Error: ${d.error || "Unknown"}`, d.submitted ? "success" : "error");
  } catch (err) {
    toast("Submit: " + err.message, "error");
  }
}

// ===== FHIR =====
async function loadFHIRCodes() {
  try {
    const d = await (await fetch("/api/fhir/codes")).json();
    const el = document.getElementById("fhirCodes");
    if (!el) return;
    el.innerHTML = (d.observations || []).map(o => `<div class="flex justify-between py-2 border-b border-slate-100"><span><strong>${o.code}</strong>: ${o.display}</span><span class="text-slate-400">${o.unit}</span></div>`).join("");
  } catch {}
}

async function generateFHIR() {
  const c = parseInt(document.getElementById("fhirCount")?.value) || 1;
  const g = document.getElementById("fhirGender")?.value || "";
  try {
    const d = await (await fetch(`/api/fhir/patients?count=${c}${g ? "&gender=" + g : ""}`)).json();
    document.getElementById("fhirResult").classList.remove("hidden");
    document.getElementById("fhirResult").innerHTML = `<pre class="bg-slate-900 text-slate-300 rounded-lg p-4 text-xs overflow-x-auto max-h-[300px]">${JSON.stringify(d, null, 2)}</pre>`;
    toast(`Generated ${d.generated || 0} patients`, "success");
  } catch (err) {
    toast("FHIR: " + err.message, "error");
  }
}

async function testFHIRServer() {
  try {
    const d = await (await fetch("/api/fhir/r4/metadata")).json();
    document.getElementById("fhirServerResult").classList.remove("hidden");
    document.getElementById("fhirServerResult").innerHTML = `<pre class="bg-slate-900 text-slate-300 rounded-lg p-4 text-xs">${JSON.stringify({ fhirVersion: d.fhirVersion }, null, 2)}</pre>`;
  } catch (err) {
    toast("FHIR: " + err.message, "error");
  }
}

// ===== METRICS =====
async function refreshMetrics() {
  try {
    const d = await (await fetch("/api/metrics")).json();
    document.getElementById("statRuns").textContent = d.runsStarted || 0;
    document.getElementById("statPassRate").textContent = (d.passRate || 0) + "%";
    document.getElementById("statFailed").textContent = d.runsFailed || 0;
    document.getElementById("statScreenshots").textContent = d.screenshotsCaptured || 0;
    
    const el = document.getElementById("metricsDisplay");
    if (!el) return;
    el.innerHTML = `<div class="bg-slate-50 rounded-lg p-4 text-center"><div class="text-xl font-bold text-blue-600">${d.runsStarted || 0}</div><div class="text-xs text-slate-500 uppercase">Runs</div></div><div class="bg-slate-50 rounded-lg p-4 text-center"><div class="text-xl font-bold text-green-600">${d.passRate || 0}%</div><div class="text-xs text-slate-500 uppercase">Rate</div></div><div class="bg-slate-50 rounded-lg p-4 text-center"><div class="text-xl font-bold text-purple-600">v${d.version || "?"}</div><div class="text-xs text-slate-500 uppercase">Version</div></div>`;
  } catch {}
  
  try {
    const d = await (await fetch("/api/insights")).json();
    const rr = document.getElementById("recentRuns");
    if (!rr) return;
    if (!d.recentRuns?.length) {
      rr.innerHTML = '<div class="text-sm text-slate-400 text-center py-8">No runs yet.</div>';
      return;
    }
    rr.innerHTML = d.recentRuns.map(r => `<div class="flex items-center justify-between py-3 border-b border-slate-100"><div class="flex items-center gap-3"><span class="w-2.5 h-2.5 rounded-full ${r.status === "pass" ? "bg-green-500" : r.status === "fail" ? "bg-red-500" : "bg-slate-300"}"></span><span class="font-medium">${r.script || r.id?.slice(0, 16)}</span></div><span class="text-slate-400 text-sm">${r.passed || 0}/${(r.passed || 0) + (r.failed || 0)}</span></div>`).join("");
  } catch {}
}

function updateHealthList() {
  const el = document.getElementById("healthList");
  if (!el) return;
  el.innerHTML = `<div class="flex items-center justify-between py-2"><div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-green-500"></span><span class="font-medium text-sm">API Server</span></div><span class="text-green-600 text-xs font-medium">Online</span></div><div class="flex items-center justify-between py-2"><div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-green-500"></span><span class="font-medium text-sm">Cloudflare Tunnel</span></div><span class="text-green-600 text-xs font-medium">Connected</span></div><div class="flex items-center justify-between py-2"><div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" id="healthAiDot"></span><span class="font-medium text-sm">AI Backend</span></div><span class="text-xs font-medium" id="healthAi">Checking...</span></div><div class="flex items-center justify-between py-2"><div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" id="healthPtDot"></span><span class="font-medium text-sm">PractiTest</span></div><span class="text-xs font-medium" id="healthPt">Checking...</span></div>`;
  
  fetch("/api/ai/status").then(r => r.json()).then(d => {
    document.getElementById("healthAi").textContent = d.enabled ? "Connected" : "Offline";
  }).catch(() => {});
  
  fetch("/api/practitest/status").then(r => r.json()).then(d => {
    document.getElementById("healthPt").textContent = d.configured ? "Configured" : "Not configured";
  }).catch(() => {});
}

// ===== SCHEDULE =====
async function loadSchedule() {
  try {
    const j = await (await fetch("/api/schedule")).json();
    const el = document.getElementById("scheduleList");
    if (!el) return;
    if (!j.length) {
      el.innerHTML = '<div class="text-slate-400 text-center py-6">No jobs. <button class="text-blue-600 hover:underline" onclick="showAddSchedule()">Add one</button></div>';
      return;
    }
    el.innerHTML = j.map(j2 => `<div class="flex items-center justify-between py-2 border-b border-slate-100"><span><span class="font-medium">${j2.cron}</span> <span class="text-slate-400">${j2.script || j2.agentId || "?"}</span></span><button class="text-red-500 hover:text-red-700 text-sm" onclick="deleteSchedule('${j2.id}')"><i class="ph-bold ph-trash"></i></button></div>`).join("");
  } catch {}
}

function showAddSchedule() {
  document.getElementById("scheduleForm").classList.remove("hidden");
}

function hideScheduleForm() {
  document.getElementById("scheduleForm").classList.add("hidden");
}

async function addSchedule() {
  const c = document.getElementById("schedCron")?.value;
  const s = document.getElementById("schedScript")?.value;
  if (!c || !s) {
    toast("Cron+script required", "error");
    return;
  }
  try {
    await (await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cron: c, script: s, agentId: s })
    })).json();
    toast("Job scheduled", "success");
    hideScheduleForm();
    loadSchedule();
  } catch (err) {
    toast("Schedule: " + err.message, "error");
  }
}

async function deleteSchedule(id) {
  try {
    await fetch(`/api/schedule/${id}`, { method: "DELETE" });
    toast("Deleted", "success");
    loadSchedule();
  } catch {}
}

// ===== AUDIT =====
async function loadAudit() {
  const d = document.getElementById("auditDate")?.value || new Date().toISOString().slice(0, 10);
  try {
    const e = await (await fetch(`/api/audit?date=${d}&limit=100`)).json();
    const el = document.getElementById("auditLog");
    if (!e.length) {
      el.innerHTML = '<div class="text-slate-500">No entries.</div>';
      return;
    }
    el.innerHTML = e.map(e2 => `<div><span class="text-slate-500">[${new Date(e2.timestamp).toLocaleTimeString()}]</span> ${e2.action}</div>`).join("");
    toast(`${e.length} entries`, "success");
  } catch (err) {
    toast("Audit: " + err.message, "error");
  }
}

// ===== LOAD TEST =====
async function generateK6() {
  const f = document.getElementById("loadScriptSelect")?.value;
  if (!f) {
    toast("Select a script", "error");
    return;
  }
  try {
    const s = await (await fetch(`/api/scripts/${f}`)).json();
    const c = await (await fetch("/api/load-test/generate-k6", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: s, vus: 10 })
    })).text();
    document.getElementById("loadResult").classList.remove("hidden");
    document.getElementById("loadResult").textContent = c;
  } catch (err) {
    toast("k6: " + err.message, "error");
  }
}

async function generateArtillery() {
  const f = document.getElementById("loadScriptSelect")?.value;
  if (!f) {
    toast("Select a script", "error");
    return;
  }
  try {
    const s = await (await fetch(`/api/scripts/${f}`)).json();
    const d = await (await fetch("/api/load-test/generate-artillery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: s, vus: 10 })
    })).json();
    document.getElementById("loadResult").classList.remove("hidden");
    document.getElementById("loadResult").textContent = JSON.stringify(d, null, 2);
  } catch (err) {
    toast("Artillery: " + err.message, "error");
  }
}

// ===== MISC =====
async function checkAIStatus() {
  try {
    const d = await (await fetch("/api/ai/status")).json();
    // Update sidebar status indicators if needed
  } catch {}
}

async function loadMobileProfiles() {
  try {
    const p = await (await fetch("/api/mobile/profiles")).json();
    const el = document.getElementById("mobileProfiles");
    if (!el) return;
    el.innerHTML = p.map(p2 => `<div class="flex justify-between py-2 border-b border-slate-100"><span><strong>${p2.name}</strong></span><span class="text-slate-400">${p2.viewport}</span></div>`).join("");
  } catch {}
}

async function loadOAuthStatus() {
  try {
    const d = await (await fetch("/api/oauth/status")).json();
    const el = document.getElementById("oauthStatus");
    if (!el) return;
    el.innerHTML = `<div class="grid grid-cols-3 gap-3"><div class="bg-slate-50 rounded-lg p-4 text-center"><div class="text-xl">${d.enabled ? "🟢" : "🔴"}</div><div class="text-xs text-slate-500 mt-1">Enabled</div></div><div class="bg-slate-50 rounded-lg p-4 text-center"><div class="text-xl font-bold text-blue-600">${d.clientCount || 0}</div><div class="text-xs text-slate-500 mt-1">Clients</div></div><div class="bg-slate-50 rounded-lg p-4 text-center"><div class="text-xl font-bold text-purple-600">${d.activeTokens || 0}</div><div class="text-xs text-slate-500 mt-1">Tokens</div></div></div>`;
  } catch {}
}

async function checkPractitestStatus() {
  try {
    (await fetch("/api/practitest/status")).json();
  } catch {}
}

// ===== EDGE BROWSER SPECIFIC FIXES =====

// Fix for Edge animation performance issues
function optimizeEdgeAnimations() {
  if (!BrowserCompat.isEdge) return;
  
  // Use requestAnimationFrame for smoother animations
  const animateElements = document.querySelectorAll('.transition-all, .animate-pulse, .animate-spin');
  animateElements.forEach(el => {
    el.style.willChange = 'transform, opacity';
  });
  
  // Optimize scroll performance
  const scrollContainers = document.querySelectorAll('.overflow-y-auto, .overflow-x-auto');
  scrollContainers.forEach(container => {
    container.style.webkitOverflowScrolling = 'touch';
    container.style.overscrollBehavior = 'contain';
  });
}

// Fix for Edge grid layout issues
function fixEdgeGridLayout() {
  if (!BrowserCompat.isEdge) return;
  
  const grids = document.querySelectorAll('.grid');
  grids.forEach(grid => {
    // Force grid display
    grid.style.display = 'grid';
    
    // Ensure proper gap handling
    const computedGap = getComputedStyle(grid).gap;
    if (computedGap === 'normal' || computedGap === '') {
      grid.style.gap = '1rem';
    }
  });
}

// Fix for Edge flexbox issues
function fixEdgeFlexboxLayout() {
  if (!BrowserCompat.isEdge) return;
  
  const flexContainers = document.querySelectorAll('.flex');
  flexContainers.forEach(flex => {
    // Ensure proper gap handling
    const computedGap = getComputedStyle(flex).gap;
    if (computedGap === 'normal' || computedGap === '') {
      // Fallback to margin-based spacing
      const children = Array.from(flex.children);
      children.forEach((child, index) => {
        if (index > 0) {
          child.style.marginLeft = '0.5rem';
        }
      });
    }
  });
}

// Fix for Edge form element rendering
function fixEdgeFormElements() {
  if (!BrowserCompat.isEdge) return;
  
  // Fix select dropdown arrows
  const selects = document.querySelectorAll('select');
  selects.forEach(select => {
    select.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%2364748b\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")';
    select.style.backgroundRepeat = 'no-repeat';
    select.style.backgroundPosition = 'right 0.75rem center';
    select.style.backgroundSize = '12px';
    select.style.paddingRight = '2.5rem';
  });
  
  // Fix input placeholder styling
  const inputs = document.querySelectorAll('input');
  inputs.forEach(input => {
    if (!input.placeholder) {
      input.placeholder = '';
    }
  });
  
  // Fix textarea rendering
  const textareas = document.querySelectorAll('textarea');
  textareas.forEach(textarea => {
    textarea.style.resize = 'vertical';
    textarea.style.minHeight = '80px';
  });
}

// Fix for Edge button hover states
function fixEdgeButtonStates() {
  if (!BrowserCompat.isEdge) return;
  
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => {
    // Ensure smooth transitions
    button.style.transition = 'all 0.15s ease';
    
    // Fix focus states
    button.addEventListener('focus', () => {
      button.style.outline = '2px solid #3b82f6';
      button.style.outlineOffset = '2px';
    });
    
    button.addEventListener('blur', () => {
      button.style.outline = 'none';
    });
  });
}

// Fix for Edge scrollbar styling
function fixEdgeScrollbars() {
  if (!BrowserCompat.isEdge) return;
  
  // Add custom scrollbar styles
  const style = document.createElement('style');
  style.textContent = `
    .edge-browser ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .edge-browser ::-webkit-scrollbar-track {
      background: #f1f5f9;
    }
    .edge-browser ::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 4px;
    }
    .edge-browser ::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }
  `;
  document.head.appendChild(style);
}

// Fix for Edge modal backdrop
function fixEdgeModalBackdrop() {
  if (!BrowserCompat.isEdge) return;
  
  const modals = document.querySelectorAll('[id$="Modal"]');
  modals.forEach(modal => {
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.backdropFilter = 'blur(4px)';
    modal.style.webkitBackdropFilter = 'blur(4px)';
  });
}

// Fix for Edge toast notifications
function fixEdgeToastNotifications() {
  if (!BrowserCompat.isEdge) return;
  
  const toastContainer = document.getElementById('toastContainer');
  if (toastContainer) {
    toastContainer.style.zIndex = '9999';
    toastContainer.style.position = 'fixed';
    toastContainer.style.bottom = '1.5rem';
    toastContainer.style.right = '1.5rem';
  }
}

// Fix for Edge timeline rendering
function fixEdgeTimeline() {
  if (!BrowserCompat.isEdge) return;
  
  const timelineItems = document.querySelectorAll('.timeline-item');
  timelineItems.forEach(item => {
    // Ensure proper positioning
    item.style.position = 'relative';
    
    // Fix connector line
    const connector = item.querySelector('::before');
    if (connector) {
      connector.style.boxShadow = '0 0 0 2px #fff';
    }
  });
}

// Fix for Edge card hover effects
function fixEdgeCardHoverEffects() {
  if (!BrowserCompat.isEdge) return;
  
  const cards = document.querySelectorAll('.agent-card, .kpi-card');
  cards.forEach(card => {
    card.style.transition = 'all 0.15s ease';
    
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.1)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '';
    });
  });
}

// Initialize all Edge fixes
function initializeEdgeFixes() {
  if (!BrowserCompat.isEdge) return;
  
  // Apply all fixes
  optimizeEdgeAnimations();
  fixEdgeGridLayout();
  fixEdgeFlexboxLayout();
  fixEdgeFormElements();
  fixEdgeButtonStates();
  fixEdgeScrollbars();
  fixEdgeModalBackdrop();
  fixEdgeToastNotifications();
  fixEdgeTimeline();
  fixEdgeCardHoverEffects();
  
  console.log('Edge browser fixes initialized');
}

// Run Edge fixes after DOM is fully loaded
if (BrowserCompat.isEdge) {
  window.addEventListener('load', () => {
    setTimeout(initializeEdgeFixes, 100);
  });
}

// ===== CROSS-BROWSER COMPATIBILITY =====

// Ensure consistent behavior across all browsers
function ensureCrossBrowserCompatibility() {
  // Fix for browsers that don't support CSS gap in flexbox
  if (!CSS.supports('gap', '1rem')) {
    document.querySelectorAll('.flex').forEach(flex => {
      const children = Array.from(flex.children);
      children.forEach((child, index) => {
        if (index > 0) {
          child.style.marginLeft = '0.5rem';
        }
      });
    });
  }
  
  // Fix for browsers that don't support :focus-visible
  if (!CSS.supports('selector(:focus-visible)')) {
    document.querySelectorAll('button, input, select, textarea').forEach(el => {
      el.addEventListener('focus', () => {
        el.style.outline = '2px solid #3b82f6';
        el.style.outlineOffset = '2px';
      });
      el.addEventListener('blur', () => {
        el.style.outline = '';
        el.style.outlineOffset = '';
      });
    });
  }
  
  // Fix for browsers that don't support smooth scrolling
  if (!CSS.supports('scroll-behavior', 'smooth')) {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }
}

// Handle window resize for responsive fixes
window.addEventListener('resize', () => {
  if (BrowserCompat.isEdge) {
    // Re-apply Edge fixes on resize
    fixEdgeGridLayout();
    fixEdgeFlexboxLayout();
  }
});

// Handle visibility change for performance
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Pause animations when tab is not visible
    document.querySelectorAll('.animate-pulse, .animate-spin').forEach(el => {
      el.style.animationPlayState = 'paused';
    });
  } else {
    // Resume animations when tab is visible
    document.querySelectorAll('.animate-pulse, .animate-spin').forEach(el => {
      el.style.animationPlayState = 'running';
    });
  }
});

