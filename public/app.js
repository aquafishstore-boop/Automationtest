let currentRunId=null,currentScript=null,eventSource=null,stepsData=[],screenshotsData=[],lastRunResult=null,selectedAgent=null,stepStartTimes={};
const ONBOARDING_STEPS=[
  {target:"#tab-dashboard .page-header",title:"Welcome to UAT Tester",text:"This dashboard gives you a real-time overview of all testing activity across your pathology systems."},
  {target:".kpi-grid",title:"Key Metrics",text:"Total runs, pass rate, agent count, and screenshots captured — all at a glance."},
  {target:".sidebar-tab[data-tab=runner]",title:"Test Runner",text:"Select scripts, configure test patients, execute runs, and view step-by-step progress with screenshots."},
  {target:".sidebar-tab[data-tab=agents]",title:"AI Agents",text:"9 specialized pathology agents for Surrey ICE, Winpath, BloodTrack, Cellavision, and more."},
  {target:".sidebar-tab[data-tab=aitools]",title:"AI Tools",text:"Generate test scripts from plain English, view auto-remediation stats, and fine-tune the AI model."}
];
let onboardingStep=0;

document.addEventListener("DOMContentLoaded",()=>{restoreSession();init();document.addEventListener("keydown",handleKeyboard);initOnboarding();});

async function init(){
  await loadScripts();checkAIStatus();loadPatients();loadAgents();loadFHIRCodes();
  loadMobileProfiles();loadOAuthStatus();refreshMetrics();loadSchedule();populateLoadScripts();
  checkPractitestStatus();updateHealthList();
  if(window.matchMedia("(prefers-color-scheme:dark)").matches||localStorage.getItem("uat-theme")==="dark")enableDarkMode();
  const tab=localStorage.getItem("uat-tab")||"dashboard";switchTab(tab,true);
}

function toggleTheme(){document.documentElement.classList.contains("dark")?disableDarkMode():enableDarkMode();}
function enableDarkMode(){document.documentElement.classList.add("dark");localStorage.setItem("uat-theme","dark");}
function disableDarkMode(){document.documentElement.classList.remove("dark");localStorage.setItem("uat-theme","light");}
function toggleSidebar(){document.getElementById("sidebar").classList.toggle("open");}

const TAB_NAMES={dashboard:"Dashboard",runner:"Test Runner",agents:"AI Agents",aitools:"AI Tools",fhir:"FHIR Data",infra:"Infrastructure"};

function switchTab(name,silent){
  document.querySelectorAll(".sidebar-tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===name));
  document.querySelectorAll(".tab-content").forEach(t=>t.classList.toggle("active",t.id===`tab-${name}`));
  const bc=document.getElementById("breadcrumb");if(bc)bc.innerHTML=`<span class="breadcrumb-item active">${TAB_NAMES[name]||name}</span>`;
  if(!silent)localStorage.setItem("uat-tab",name);
  if(window.innerWidth<=900)document.getElementById("sidebar").classList.remove("open");
  if(name==="infra"){refreshMetrics();loadSchedule();}
  if(name==="aitools"){loadRemediationStats();loadFineTuneStats();}
  document.getElementById("mainContent")?.scrollTo(0,0)||window.scrollTo(0,0);
}

function toast(msg,type=""){
  const c=document.getElementById("toastContainer");
  const t=document.createElement("div");t.className=`toast show ${type}`;t.textContent=msg;
  t.onclick=()=>{t.classList.remove("show");setTimeout(()=>t.remove(),200);};
  c.appendChild(t);
  setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),200);},3500);
}

function handleKeyboard(e){
  if(e.key==="Escape"){closeModal();closeKbdModal();const cb=document.getElementById("cancelBtn");if(cb.style.display!=="none")cb?.click();return;}
  if(e.key==="?"&&!e.ctrlKey&&!e.metaKey){toggleKbdModal();return;}
  const c=e.ctrlKey||e.metaKey;
  if(c&&e.key==="Enter"){e.preventDefault();document.getElementById("runBtn")?.click();}
  if(c&&e.shiftKey&&e.key==="D"){e.preventDefault();toggleTheme();}
  if(c&&e.shiftKey&&e.key==="N"){e.preventDefault();switchTab("aitools");setTimeout(()=>document.getElementById("nlInput")?.focus(),100);}
  if(c&&e.shiftKey&&e.key==="A"){e.preventDefault();switchTab("agents");}
  if(c&&e.shiftKey&&["1","2","3","4","5"].includes(e.key)){e.preventDefault();switchTab(["dashboard","runner","agents","aitools","fhir"][parseInt(e.key)-1]);}
}
function toggleKbdModal(){document.getElementById("kbdModal").classList.toggle("hidden");}
function closeKbdModal(){document.getElementById("kbdModal").classList.add("hidden");}
function initOnboarding(){if(!localStorage.getItem("uat-onboarded"))setTimeout(()=>startOnboarding(),600);}
function startOnboarding(){localStorage.setItem("uat-onboarded","1");onboardingStep=0;showOnboardingStep();}
function showOnboardingStep(){
  document.getElementById("onboardingOverlay").classList.remove("hidden");
  const t=document.getElementById("onboardingTooltip");t.classList.remove("hidden");
  const step=ONBOARDING_STEPS[onboardingStep];
  document.getElementById("tooltipStep").textContent=`${onboardingStep+1}/${ONBOARDING_STEPS.length}`;
  document.getElementById("tooltipTitle").textContent=step.title;
  document.getElementById("tooltipText").textContent=step.text;
  document.getElementById("tooltipNext").textContent=onboardingStep<ONBOARDING_STEPS.length-1?"Next":"Done";
  const el=document.querySelector(step.target);if(!el)return;
  const rect=el.getBoundingClientRect();t.style.left=`${Math.min(rect.left,window.innerWidth-320)}px`;t.style.top=`${rect.bottom+12}px`;
  if(step.target.startsWith(".sidebar")){t.style.left="210px";t.style.top="220px";switchTab(step.target.match(/data-tab=(\w+)/)?.[1]||"dashboard");}
}
function nextOnboarding(){onboardingStep++;if(onboardingStep>=ONBOARDING_STEPS.length){skipOnboarding();return;}showOnboardingStep();}
function skipOnboarding(){document.getElementById("onboardingOverlay").classList.add("hidden");document.getElementById("onboardingTooltip").classList.add("hidden");}

async function loadScripts(){
  try{const r=await(await fetch("/api/scripts")).json();const s=document.getElementById("scriptSelect");s.innerHTML='<option value="">-- Select a test script --</option>';
  r.forEach(s2=>{const o=document.createElement("option");o.value=s2.filename;o.textContent=`${s2.name} (${s2.system})`;s.appendChild(o);});
  }catch(err){addLog("error","Scripts: "+err.message);}
}
function populateLoadScripts(){
  const s=document.getElementById("loadScriptSelect");if(!s)return;
  s.innerHTML='<option value="">-- Select --</option>';
  const o=document.getElementById("scriptSelect")?.options;if(o)for(const p of o)if(p.value)s.appendChild(p.cloneNode(true));
}
async function loadPatients(){
  try{const r=await(await fetch("/api/patients")).json();const s=document.getElementById("patientSelect");if(!s)return;
  s.innerHTML='<option value="">-- No patient selected --</option>';
  r.forEach(p=>{const o=document.createElement("option");o.value=p.id;o.textContent=`${p.id} - ${p.forename} ${p.surname} (${p.nhsNumber})`;s.appendChild(o);});
  }catch{}
}
async function onPatientSelect(){
  const s=document.getElementById("patientSelect"),d=document.getElementById("patientDetails"),id=s.value;
  if(!id){d.classList.add("hidden");return;}
  try{const p=await(await fetch(`/api/patients/${id}`)).json();d.classList.remove("hidden");
  d.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;font-size:12px;"><span style="color:var(--text-secondary)">NHS:</span><span><strong>${p.nhsNumber}</strong></span><span style="color:var(--text-secondary)">Name:</span><span>${p.title} ${p.forename} ${p.surname}</span><span style="color:var(--text-secondary)">DOB:</span><span>${p.dob} (${p.age})</span><span style="color:var(--text-secondary)">Gender:</span><span>${p.gender}</span></div>`;
  ["PATIENT_NHS","NHS_NUMBER"].forEach(n=>{const i=document.getElementById(`var-${n}`);if(i)i.value=p.nhsNumber;});
  const ni=document.getElementById("var-PATIENT_NAME");if(ni)ni.value=`${p.forename} ${p.surname}`;
  }catch{}
}
async function onScriptChange(){
  const f=document.getElementById("scriptSelect").value,m=document.getElementById("scriptMeta"),v=document.getElementById("variablesPanel"),b=document.getElementById("runBtn");
  if(!f){m.classList.add("hidden");v.classList.add("hidden");b.disabled=true;return;}
  try{const r=await(await fetch(`/api/scripts/${f}`)).json();currentScript=r;
  document.getElementById("metaSystem").textContent=r.system||"N/A";document.getElementById("metaSteps").textContent=r.steps.length;document.getElementById("metaDescription").textContent=(r.description||"N/A").slice(0,120);
  m.classList.remove("hidden");currentScript.filename=f;buildVariablesForm(r.variables||[]);v.classList.remove("hidden");b.disabled=false;
  }catch(err){addLog("error","Script: "+err.message);}
}
function buildVariablesForm(v){
  const c=document.getElementById("variablesForm");c.innerHTML="";
  if(!v.length){c.innerHTML='<div class="empty-state" style="padding:6px">No variables needed</div>';return;}
  v.forEach(v2=>{
    const d=document.createElement("div");d.className="variable-field";
    const l=document.createElement("label");l.textContent=v2.label||v2.name;l.htmlFor=`var-${v2.name}`;
    const i=document.createElement("input");i.id=`var-${v2.name}`;i.name=v2.name;i.type=v2.type==="password"?"password":"text";i.placeholder=v2.default||v2.label||v2.name;i.value=v2.default||"";
    if(v2.required)i.required=true;
    const h=document.createElement("div");h.className="hint";h.textContent=v2.required?"Required":"Optional";
    d.appendChild(l);d.appendChild(i);d.appendChild(h);c.appendChild(d);
  });
}
function getVariables(){const v={};document.querySelectorAll("#variablesForm input").forEach(i=>{v[i.name]=i.value;});return v;}

async function startRun(){
  if(!currentScript)return;const vars=getVariables(),missing=(currentScript.variables||[]).filter(v=>v.required&&!vars[v.name]);
  if(missing.length){toast(`Fill in: ${missing.map(v=>v.label||v.name).join(", ")}`,"error");return;}
  resetRunUI();document.getElementById("runBtn").style.display="none";document.getElementById("cancelBtn").style.display="";
  stepsData=currentScript.steps.map((s,i)=>({...s,status:"pending",index:i}));renderStepList();
  try{
    const d=await(await fetch("/api/run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({script:currentScript,variables:vars})})).json();
    currentRunId=d.runId;document.getElementById("runIdLabel").textContent=d.runId.slice(0,12);
    document.getElementById("startedLabel").textContent=new Date().toLocaleTimeString();
    document.getElementById("runMeta").classList.remove("hidden");connectSSE(d.runId);
  }catch(err){addLog("error","Run: "+err.message);resetButtons();}
}
function connectSSE(id){
  if(eventSource)eventSource.close();
  eventSource=new EventSource(`/api/runs/${id}/events`);
  eventSource.addEventListener("step-start",e=>{const d=JSON.parse(e.data);stepStartTimes[d.stepId]=performance.now();updateStepStatus(d.stepId,"running");});
  eventSource.addEventListener("step-complete",e=>{const d=JSON.parse(e.data);const el=stepStartTimes[d.stepId]?((performance.now()-stepStartTimes[d.stepId])/1000).toFixed(1)+"s":"";updateStepStatus(d.stepId,d.status,d.error,el);updateSummary();});
  eventSource.addEventListener("screenshot",e=>addScreenshot(JSON.parse(e.data)));
  eventSource.addEventListener("log",e=>{try{const d=JSON.parse(e.data);addLog(d.level||"info",d.message);}catch{}});
  eventSource.addEventListener("complete",e=>{const d=JSON.parse(e.data);lastRunResult=d;addLog("info",`Complete: ${d.passed}/${d.totalSteps} passed`);onRunComplete(d);});
  eventSource.addEventListener("error",e=>{try{addLog("error",JSON.parse(e.data).message||"Error");}catch{}});
  eventSource.onerror=()=>{};
}
async function cancelRun(){if(!currentRunId)return;try{await fetch(`/api/runs/${currentRunId}/cancel`,{method:"POST"});}catch{}}
function resetRunUI(){
  document.getElementById("progressBarContainer").classList.remove("hidden");document.getElementById("progressBar").style.width="0%";
  document.getElementById("summaryCards").classList.remove("hidden");
  ["cardTotal","cardPassed","cardFailed"].forEach(id=>document.getElementById(id).textContent="0");
  document.getElementById("cardRate").textContent="0%";
  document.getElementById("screenshotGrid").innerHTML='<div class="empty-state">Screenshots appear here as each step runs.</div>';
  screenshotsData=[];stepStartTimes={};document.getElementById("reportBtn").disabled=true;document.getElementById("practitestBtn").disabled=true;
}
function resetButtons(){document.getElementById("runBtn").style.display="";document.getElementById("cancelBtn").style.display="none";}
function renderStepList(){
  const c=document.getElementById("stepList");c.innerHTML="";
  stepsData.forEach(s=>{
    const d=document.createElement("div");d.className="timeline-item";d.id=`step-${s.id}`;
    const desc=document.createElement("div");desc.className="step-desc";desc.textContent=s.description||s.id;
    const m=document.createElement("div");m.className="step-meta";m.innerHTML=`<span>Step ${s.index+1}</span>`;
    d.appendChild(desc);d.appendChild(m);
    if(s.error){const e=document.createElement("div");e.className="step-error";e.textContent=s.error;d.appendChild(e);}
    c.appendChild(d);
  });
}
function updateStepStatus(id,status,error,elapsed){
  stepsData=stepsData.map(s=>s.id===id?{...s,status,error:error||s.error}:s);
  const el=document.getElementById(`step-${id}`);if(!el)return;
  el.className=`timeline-item ${status}`;
  let m=el.querySelector(".step-meta");if(!m){m=document.createElement("div");m.className="step-meta";el.appendChild(m);}
  m.innerHTML=`<span>Step ${stepsData.findIndex(s=>s.id===id)+1}</span>${status==="running"?'<span>Running...</span>':status==="pass"?'<span style="color:var(--success-text)">Pass</span>':status==="fail"?'<span style="color:var(--danger-text)">Failed</span>':''}${elapsed?`<span>${elapsed}</span>`:''}`;
  if(error){let e=el.querySelector(".step-error");if(!e){e=document.createElement("div");e.className="step-error";el.appendChild(e);}e.textContent=error;}
}
function updateSummary(){
  const t=stepsData.length,p=stepsData.filter(s=>s.status==="pass").length,f=stepsData.filter(s=>s.status==="fail").length,c=p+f;
  document.getElementById("cardTotal").textContent=t;document.getElementById("cardPassed").textContent=p;document.getElementById("cardFailed").textContent=f;
  document.getElementById("cardRate").textContent=`${c>0?Math.round(p/c*100):0}%`;document.getElementById("progressBar").style.width=`${c/t*100}%`;
}
function addScreenshot(data){
  screenshotsData.push(data);const g=document.getElementById("screenshotGrid"),e=g.querySelector(".empty-state");if(e)e.remove();
  const c=document.createElement("div");c.className="screenshot-card";c.onclick=()=>openScreenshot(data);
  const i=document.createElement("img");i.src=`/api/runs/${currentRunId}/screenshots/${data.filename}`;i.alt=data.description||data.stepId;i.loading="lazy";
  const cap=document.createElement("div");cap.className="caption";
  const b=document.createElement("span");b.className="badge-step";b.textContent=data.stepId;
  const d=document.createElement("span");d.textContent=data.description||data.filename;
  cap.appendChild(b);cap.appendChild(d);c.appendChild(i);c.appendChild(cap);g.appendChild(c);
}
function onRunComplete(data){
  resetButtons();document.getElementById("reportBtn").disabled=false;document.getElementById("practitestBtn").disabled=!(data.failed>0||data.passed>0);
  if(eventSource){eventSource.close();eventSource=null;}
}

function openScreenshot(d){document.getElementById("modalImage").src=`/api/runs/${currentRunId}/screenshots/${d.filename}`;document.getElementById("modalCaption").textContent=`${d.stepId}: ${d.description||""}`;document.getElementById("screenshotModal").classList.remove("hidden");}
function closeModal(){document.getElementById("screenshotModal").classList.add("hidden");}
async function openReport(){if(currentRunId)window.open(`/api/runs/${currentRunId}/report`,"_blank");}
async function uploadToPractitest(){
  if(!currentRunId)return;
  try{document.getElementById("practitestBtn").disabled=true;
  const d=await(await fetch("/api/practitest/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runId:currentRunId})})).json();
  toast(d.success?`Uploaded ${d.results?.filter?.(r=>r.status==="uploaded").length||0} screenshots`:`Upload: ${d.message||"Check config"}`,d.success?"success":"error");
  }catch(err){toast(`Upload: ${err.message}`,"error");}finally{document.getElementById("practitestBtn").disabled=false;}
}

document.addEventListener("change",e=>{if(e.target.id==="csvFileInput"||e.target.id==="dashCsvInput"){document.getElementById("previewCsvBtn").disabled=!e.target.files[0];document.getElementById("importCsvBtn").disabled=!e.target.files[0];}});
async function readCSVFile(id){const i=document.getElementById(id||"csvFileInput");if(!i.files?.[0])return null;return new Promise((r,j)=>{const f=new FileReader();f.onload=e=>r(e.target.result);f.onerror=e=>j(e.target.error);f.readAsText(i.files[0]);});}
async function dashPreviewCSV(){const c=await readCSVFile("dashCsvInput");if(!c)return;_previewCSV(c);}
async function previewCSV(){const c=await readCSVFile("csvFileInput");if(!c)return;_previewCSV(c);}
async function _previewCSV(csv){
  try{const d=await(await fetch("/api/scripts/upload-csv-test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({csv})})).json();
  if(d.error){toast("CSV: "+d.error,"error");return;}
  const el=document.getElementById("csvPreview")||document.getElementById("dashCsvResult");
  if(el){el.classList.remove("hidden");el.innerHTML=`<div style="background:var(--surface-2);border-radius:var(--radius);padding:8px;font-size:12px;"><strong>${d.total} test cases</strong> found</div>`;}
  toast(`${d.total} cases previewed`,"success");
  }catch(err){toast("Preview: "+err.message,"error");}
}
async function dashImportCSV(){const c=await readCSVFile("dashCsvInput");if(!c)return;_importCSV(c);}
async function importCSV(){const c=await readCSVFile("csvFileInput");if(!c)return;_importCSV(c);}
async function _importCSV(csv){
  try{const d=await(await fetch("/api/scripts/upload-csv",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({csv})})).json();
  if(d.error){toast("Import: "+d.error,"error");return;}
  toast(`Imported ${d.imported} scripts`,"success");await loadScripts();populateLoadScripts();
  }catch(err){toast("Import: "+err.message,"error");}
}

function addLog(l,m){const c=document.getElementById("logContainer"),e=c.querySelector(".empty-state");if(e)e.remove();const d=document.createElement("div");d.className="log-entry";const t=document.createElement("span");t.className="log-time";t.textContent=new Date().toLocaleTimeString();const msg=document.createElement("span");msg.className=`log-msg ${l}`;msg.textContent=m;d.appendChild(t);d.appendChild(msg);c.appendChild(d);c.scrollTop=c.scrollHeight;}
function clearLog(){document.getElementById("logContainer").innerHTML='<div class="empty-state">Log cleared.</div>';}

async function checkAIStatus(){
  try{const d=await(await fetch("/api/ai/status")).json();const sd=document.getElementById("sidebarStatus");if(sd)sd.className=`sidebar-dot ${d.enabled?"connected":"disconnected"}`;}catch{}
}
async function loadAgents(){
  try{const r=await(await fetch("/api/agents")).json();const g=document.getElementById("agentGrid");if(!g)return;g.innerHTML="";
  const badge=document.getElementById("agentCountBadge");if(badge)badge.textContent=r.length;
  r.forEach(a=>{const c=document.createElement("div");c.className="agent-card";c.onclick=()=>selectAgent(a);
  c.innerHTML=`<div class="agent-name">${a.name}</div><div class="agent-desc">${a.description}</div><div class="agent-meta"><span class="agent-badge ${a.implemented?"implemented":"not-implemented"}">${a.implemented?"✓ Active":"○ Stub"}</span><span>${a.systems.join(", ")}</span></div>`;g.appendChild(c);});
  }catch(err){toast("Agents: "+err.message,"error");}
}
function selectAgent(agent){
  selectedAgent=agent;document.querySelectorAll(".agent-card").forEach(c=>c.classList.remove("selected"));
  event?.target?.closest(".agent-card")?.classList.add("selected");
  document.getElementById("agentRunPanel").classList.remove("hidden");
  document.getElementById("agentRunTitle").textContent=`${agent.name}`;
  document.getElementById("agentRunForm").innerHTML=`<div class="field"><label>Workflow</label><select id="agentWorkflow">${agent.testCases.map(t=>`<option>${t}</option>`).join("")}</select></div>
  <div class="field"><label>Patient NHS</label><input id="agentNhs" placeholder="e.g. 999 057 5924"></div>
  <div class="field"><label>URL (optional)</label><input id="agentUrl" placeholder="System URL"></div>
  <div class="field"><label>Username</label><input id="agentUser" placeholder="Login"></div>
  <div class="field"><label>Password</label><input id="agentPass" type="password" placeholder="Password"></div>`;
}
function closeAgentRun(){document.getElementById("agentRunPanel").classList.add("hidden");document.querySelectorAll(".agent-card").forEach(c=>c.classList.remove("selected"));}
async function executeAgent(){
  if(!selectedAgent)return;const body={workflow:document.getElementById("agentWorkflow")?.value,patientNhs:document.getElementById("agentNhs")?.value,url:document.getElementById("agentUrl")?.value,username:document.getElementById("agentUser")?.value,password:document.getElementById("agentPass")?.value,testCode:document.getElementById("agentWorkflow")?.value,callbacks:{}};
  const btn=document.getElementById("agentRunBtn");btn.disabled=true;btn.textContent="Running...";
  try{const ep=selectedAgent.id==="custom-script"?"custom":selectedAgent.id;
  const d=await(await fetch(`/api/agents/${ep}/run`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).json();
  const rd=document.getElementById("agentResult");rd.classList.remove("hidden");rd.innerHTML=`<div style="font-size:13px;"><strong>Status:</strong> ${d.status} | <strong>Passed:</strong> ${d.passed||0}/${d.total||0} | <strong>Screenshots:</strong> ${d.screenshots||0}</div>`;
  toast(`Agent: ${d.status} (${d.passed||0}/${d.total||0})`,d.status==="passed"?"success":"error");
  }catch(err){toast("Agent: "+err.message,"error");}finally{btn.disabled=false;btn.textContent="Run Agent";}
}
async function generateScriptNL(){
  const text=document.getElementById("nlInput")?.value;if(!text){toast("Enter a test description","error");return;}
  const systems=(document.getElementById("nlSystems")?.value||"").split(",").map(s=>s.trim()).filter(Boolean);
  try{const d=await(await fetch("/api/nl/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,systems})})).json();
  const el=document.getElementById("nlResult");el.classList.remove("hidden");
  if(d.error){el.innerHTML=`<div style="color:var(--danger-text)">${d.error}</div>`;return;}
  el.innerHTML=`<pre>${JSON.stringify(Array.isArray(d)?d:d.steps||d,null,2)}</pre>`;
  toast(`Generated ${Array.isArray(d)?d.length:0} steps`,"success");
  }catch(err){toast("NL: "+err.message,"error");}
}
async function suggestTests(){const s=document.getElementById("nlSystems")?.value||"";try{const d=await(await fetch("/api/nl/suggest",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:s})})).json();const el=document.getElementById("nlResult");el.classList.remove("hidden");el.innerHTML=`<pre>${d.result||JSON.stringify(d,null,2)}</pre>`;}catch(err){toast("Suggest: "+err.message,"error");}}
function clearNL(){document.getElementById("nlInput").value="";document.getElementById("nlResult").classList.add("hidden");}
async function loadRemediationStats(){
  try{const d=await(await fetch("/api/remediate/stats")).json();document.getElementById("remTotal").textContent=d.totalRemediations??"-";document.getElementById("remSuccess").textContent=d.successful??"-";document.getElementById("remRate").textContent=d.successRate??"-";}catch{}
  try{const l=await(await fetch("/api/remediate/log?limit=10")).json();const el=document.getElementById("remediationLog");if(!l.length)return;el.innerHTML=l.map(l2=>`<div class="log-entry"><span class="log-time">${new Date(l2.timestamp).toLocaleTimeString()}</span><span class="log-msg ${l2.success?"success":"error"}">${l2.diagnosis||l2.step||l2.event} ${l2.success?"✓":"✗"}</span></div>`).join("");}catch{}
}
async function loadFineTuneStats(){try{const d=await(await fetch("/api/fine-tune/stats")).json();document.getElementById("ftFiles").textContent=d.files??"-";document.getElementById("ftExamples").textContent=d.totalExamples??"-";}catch{}try{const f=await(await fetch("/api/fine-tune/files")).json();const el=document.getElementById("ftFileList");if(!f.length){el.innerHTML='<div style="color:var(--text-secondary);padding:6px;">No data yet.</div>';return;}el.innerHTML=f.map(f2=>`<div><span>${f2.filename}</span><span style="color:var(--text-secondary)">${f2.examples} ex</span></div>`).join("");}catch{}}
async function collectTraining(){if(!lastRunResult){toast("No completed run","error");return;}try{const d=await(await fetch("/api/fine-tune/collect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({steps:lastRunResult.steps||[],system:lastRunResult.system||"general"})})).json();toast(`Collected ${d.count||0} examples`,"success");loadFineTuneStats();}catch(err){toast("Collect: "+err.message,"error");}}
async function submitFineTune(){try{const d=await(await fetch("/api/fine-tune/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).json();toast(d.submitted?`Submitted (${d.totalExamples} ex)`:`Error: ${d.error||"Unknown"}`,d.submitted?"success":"error");}catch(err){toast("Submit: "+err.message,"error");}}
async function loadFHIRCodes(){try{const d=await(await fetch("/api/fhir/codes")).json();const el=document.getElementById("fhirCodes");if(!el)return;el.innerHTML=(d.observations||[]).map(o=>`<div><span><strong>${o.code}</strong>: ${o.display}</span><span style="color:var(--text-secondary)">${o.unit}</span></div>`).join("");}catch{}}
async function generateFHIR(){const c=parseInt(document.getElementById("fhirCount")?.value)||1,g=document.getElementById("fhirGender")?.value||"";try{const d=await(await fetch(`/api/fhir/patients?count=${c}${g?"&gender="+g:""}`)).json();const el=document.getElementById("fhirResult");el.classList.remove("hidden");el.innerHTML=`<pre>${JSON.stringify(d,null,2)}</pre>`;toast(`Generated ${d.generated||0} patients`,"success");}catch(err){toast("FHIR: "+err.message,"error");}}
async function testFHIRServer(){try{const d=await(await fetch("/api/fhir/r4/metadata")).json();const el=document.getElementById("fhirServerResult");el.classList.remove("hidden");el.innerHTML=`<pre>${JSON.stringify({status:200,fhirVersion:d.fhirVersion,resources:d.rest?.[0]?.resource?.map(r=>r.type).join(", ")},null,2)}</pre>`;}catch(err){toast("FHIR server: "+err.message,"error");}}
async function refreshMetrics(){
  try{const d=await(await fetch("/api/metrics")).json();
  document.getElementById("statRuns").textContent=d.runsStarted||0;document.getElementById("statPassRate").textContent=(d.passRate||0)+"%";
  document.getElementById("statAgents").textContent=d.agentCount||0;document.getElementById("statScreenshots").textContent=d.screenshotsCaptured||0;
  const badge=document.getElementById("runCountBadge");if(badge&&d.runsStarted>0){badge.style.display="";badge.textContent=d.runsStarted;}
  const el=document.getElementById("metricsDisplay");if(!el)return;
  el.innerHTML=`<div class="mini-kpi"><span class="mini-kpi-value">${d.runsStarted||0}</span><span class="mini-kpi-label">Runs</span></div><div class="mini-kpi"><span class="mini-kpi-value">${d.passRate||0}%</span><span class="mini-kpi-label">Rate</span></div><div class="mini-kpi"><span class="mini-kpi-value">${d.agentCount||0}</span><span class="mini-kpi-label">Agents</span></div><div class="mini-kpi"><span class="mini-kpi-value">${Math.floor((d.uptimeSeconds||0)/86400)}d</span><span class="mini-kpi-label">Uptime</span></div><div class="mini-kpi"><span class="mini-kpi-value">${d.screenshotsCaptured||0}</span><span class="mini-kpi-label">Shots</span></div><div class="mini-kpi"><span class="mini-kpi-value">v${d.version||"?"}</span><span class="mini-kpi-label">Version</span></div>`;
  }catch{}
  try{const d=await(await fetch("/api/insights")).json();const el=document.getElementById("insightsDisplay");if(!el)return;
  let html=`<h3>Run History</h3><table>${(d.recentRuns||[]).slice(0,5).map(r=>`<tr><td>${new Date(r.date).toLocaleTimeString()}</td><td>${r.script||r.id?.slice(0,12)}</td><td>${r.status}</td><td style="text-align:right">${r.passed||0}/${(r.passed||0)+(r.failed||0)}</td></tr>`).join("")}</table>`;
  el.innerHTML=html;
  const rr=document.getElementById("recentRuns");if(!rr)return;
  if(!d.recentRuns?.length){rr.innerHTML='<div class="empty-state">No runs yet. <button class="btn btn-link" onclick="switchTab(\'runner\')">Run your first test →</button></div>';return;}
  rr.innerHTML=d.recentRuns.map(r=>`<div class="log-entry"><span class="log-time" style="color:${r.status==="pass"?"var(--success-text)":r.status==="fail"?"var(--danger-text)":"var(--text-secondary)"}">●</span><span class="log-msg"><strong>${r.script||r.id?.slice(0,16)}</strong> <span style="color:var(--text-secondary)">${r.system||""}</span></span><span style="font-size:11px;color:var(--text-secondary);flex-shrink:0">${r.passed||0}/${(r.passed||0)+(r.failed||0)}</span></div>`).join("");
  }catch{}
}
function updateHealthList(){
  const el=document.getElementById("healthList");if(!el)return;
  el.innerHTML=`<div class="log-entry"><span class="log-time" style="color:var(--success-text)">●</span><span class="log-msg" style="font-size:12px"><strong>API Server</strong> <span style="color:var(--text-secondary)">Online</span></span></div>
  <div class="log-entry"><span class="log-time" style="color:var(--success-text)">●</span><span class="log-msg" style="font-size:12px"><strong>Cloudflare Tunnel</strong> <span style="color:var(--text-secondary)">Connected</span></span></div>
  <div class="log-entry"><span class="log-time" id="healthAiDot" style="color:var(--text-secondary)">●</span><span class="log-msg" style="font-size:12px"><strong>AI Backend</strong> <span id="healthAi" style="color:var(--text-secondary)">Checking...</span></span></div>
  <div class="log-entry"><span class="log-time" id="healthPtDot" style="color:var(--text-secondary)">●</span><span class="log-msg" style="font-size:12px"><strong>PractiTest</strong> <span id="healthPt" style="color:var(--text-secondary)">Checking...</span></span></div>`;
  fetch("/api/ai/status").then(r=>r.json()).then(d=>{const v=d.enabled?"Connected":"Offline";document.getElementById("healthAi").textContent=v;document.getElementById("healthAiDot").style.color=d.enabled?"var(--success-text)":"var(--text-secondary)";}).catch(()=>{});
  fetch("/api/practitest/status").then(r=>r.json()).then(d=>{const v=d.configured?"Configured":"Not configured";document.getElementById("healthPt").textContent=v;document.getElementById("healthPtDot").style.color=d.configured?"var(--success-text)":"var(--text-secondary)";}).catch(()=>{});
}
async function loadSchedule(){
  try{const j=await(await fetch("/api/schedule")).json();const el=document.getElementById("scheduleList");if(!el)return;
  if(!j.length){el.innerHTML='<div class="empty-state">No scheduled jobs. <button class="btn btn-link" onclick="showAddSchedule()">Add one →</button></div>';return;}
  el.innerHTML=j.map(j2=>`<div class="log-entry"><span class="log-time">${j2.enabled?"🟢":"🔴"}</span><span class="log-msg" style="font-size:12px"><strong>${j2.cron}</strong> — ${j2.script||j2.agentId||"?"}</span><span><button class="btn btn-text btn-sm" onclick="deleteSchedule('${j2.id}')" style="color:var(--danger)">✕</button></span></div>`).join("");
  }catch{}
}
function showAddSchedule(){document.getElementById("scheduleForm").classList.remove("hidden");}
function hideScheduleForm(){document.getElementById("scheduleForm").classList.add("hidden");}
async function addSchedule(){const c=document.getElementById("schedCron")?.value,s=document.getElementById("schedScript")?.value;if(!c||!s){toast("Cron and script required","error");return;}try{await(await fetch("/api/schedule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cron:c,script:s,agentId:s})})).json();toast("Job scheduled","success");hideScheduleForm();loadSchedule();}catch(err){toast("Schedule: "+err.message,"error");}}
async function deleteSchedule(id){try{await fetch(`/api/schedule/${id}`,{method:"DELETE"});toast("Job deleted","success");loadSchedule();}catch{}}
async function loadAudit(){const d=document.getElementById("auditDate")?.value||new Date().toISOString().slice(0,10);try{const e=await(await fetch(`/api/audit?date=${d}&limit=100`)).json();const el=document.getElementById("auditLog");if(!e.length){el.innerHTML='<div class="empty-state">No entries for this date.</div>';return;}el.innerHTML=e.map(e2=>`<div class="log-entry"><span class="log-time">${new Date(e2.timestamp).toLocaleTimeString()}</span><span class="log-msg">${e2.action}</span></div>`).join("");toast(`${e.length} entries loaded`,"success");}catch(err){toast("Audit: "+err.message,"error");}}
async function generateK6(){const f=document.getElementById("loadScriptSelect")?.value;if(!f){toast("Select a script","error");return;}try{const s=await(await fetch(`/api/scripts/${f}`)).json();const c=await(await fetch("/api/load-test/generate-k6",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({script:s,vus:10})})).text();document.getElementById("loadResult").classList.remove("hidden");document.getElementById("loadResult").textContent=c;}catch(err){toast("k6: "+err.message,"error");}}
async function generateArtillery(){const f=document.getElementById("loadScriptSelect")?.value;if(!f){toast("Select a script","error");return;}try{const s=await(await fetch(`/api/scripts/${f}`)).json();const d=await(await fetch("/api/load-test/generate-artillery",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({script:s,vus:10})})).json();document.getElementById("loadResult").classList.remove("hidden");document.getElementById("loadResult").textContent=JSON.stringify(d,null,2);}catch(err){toast("Artillery: "+err.message,"error");}}
async function loadMobileProfiles(){try{const p=await(await fetch("/api/mobile/profiles")).json();const el=document.getElementById("mobileProfiles");if(!el)return;el.innerHTML=p.map(p2=>`<div class="log-entry" style="font-size:12px"><span class="log-time">${p2.touch?"📱":"🖥"}</span><span class="log-msg"><strong>${p2.name}</strong> <span style="color:var(--text-secondary)">${p2.viewport}</span></span></div>`).join("");}catch{}}
async function loadOAuthStatus(){try{const d=await(await fetch("/api/oauth/status")).json();const el=document.getElementById("oauthStatus");if(!el)return;el.innerHTML=`<div class="mini-kpis" style="grid-template-columns:repeat(3,1fr)"><div class="mini-kpi"><span class="mini-kpi-value">${d.enabled?"🟢":"🔴"}</span><span class="mini-kpi-label">Enabled</span></div><div class="mini-kpi"><span class="mini-kpi-value">${d.clientCount||0}</span><span class="mini-kpi-label">Clients</span></div><div class="mini-kpi"><span class="mini-kpi-value">${d.activeTokens||0}</span><span class="mini-kpi-label">Tokens</span></div></div>`;}catch{}}
async function checkPractitestStatus(){try{const d=await(await fetch("/api/practitest/status")).json();if(!d.configured)addLog("warn","PractiTest not configured");}catch{}}
window.addEventListener("resize",()=>{if(window.innerWidth>900)document.getElementById("sidebar").classList.remove("open");});
