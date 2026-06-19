let currentRunId=null,currentScript=null,eventSource=null,stepsData=[],screenshotsData=[],lastRunResult=null,selectedAgent=null,stepStartTimes={};
const TAB_NAMES={dashboard:"Dashboard",runner:"Test Runner",agents:"AI Agents",aitools:"AI Tools",fhir:"FHIR Data",infra:"Infrastructure"};

document.addEventListener("DOMContentLoaded",()=>{restoreSession();init();document.addEventListener("keydown",handleKeyboard);});

async function init(){
  await loadScripts();checkAIStatus();loadPatients();loadAgents();loadFHIRCodes();loadMobileProfiles();loadOAuthStatus();
  refreshMetrics();loadSchedule();populateLoadScripts();checkPractitestStatus();updateHealthList();
  if(window.matchMedia("(prefers-color-scheme:dark)").matches||localStorage.getItem("uat-theme")==="dark")enableDarkMode();
  const tab=localStorage.getItem("uat-tab")||"dashboard";switchTab(tab,true);
}
function saveSession(){try{localStorage.setItem("uat-tab",document.querySelector(".tabc.active")?.id?.replace("tab-","")||"dashboard");}catch{}}
function restoreSession(){try{const t=localStorage.getItem("uat-tab");if(t)switchTab(t,true);}catch{}}
function toggleTheme(){document.documentElement.classList.contains("dark")?disableDarkMode():enableDarkMode();}
function enableDarkMode(){document.documentElement.classList.add("dark");localStorage.setItem("uat-theme","dark");document.getElementById("themeIcon").className="ph ph-sun text-xl";}
function disableDarkMode(){document.documentElement.classList.remove("dark");localStorage.setItem("uat-theme","light");document.getElementById("themeIcon").className="ph ph-moon text-xl";}

function switchTab(name,silent){
  document.querySelectorAll(".tabc").forEach(t=>t.classList.toggle("active",t.id===`tab-${name}`));
  if(!silent)saveSession();
  if(name==="infra"){refreshMetrics();loadSchedule();}
  if(name==="aitools"){loadRemediationStats();loadFineTuneStats();}
  // Update sidebar active state if on dashboard
}

function toast(msg,type=""){
  const c=document.getElementById("toastContainer");
  const t=document.createElement("div");t.className=`toast bg-white border border-slate-200 rounded-lg shadow-lg px-4 py-3 text-sm flex items-center gap-2 ${type==="success"?"border-green-300":type==="error"?"border-red-300":""}`;
  const icon=type==="success"?"ph-check-circle text-green-600":type==="error"?"ph-x-circle text-red-600":"ph-info text-blue-600";
  t.innerHTML=`<i class="ph-bold ${icon}"></i><span>${msg}</span>`;
  c.appendChild(t);requestAnimationFrame(()=>t.classList.add("show"));
  setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),300);},3500);
}

function handleKeyboard(e){
  if(e.key==="Escape"){closeModal();const cb=document.querySelector("#cancelBtn");if(!cb.classList.contains("hidden"))cb?.click();return;}
}

// SCRIPTS
async function loadScripts(){
  try{const r=await(await fetch("/api/scripts")).json();const s=document.getElementById("scriptSelect");s.innerHTML='<option value="">Select a test script...</option>';
  r.forEach(s2=>{const o=document.createElement("option");o.value=s2.filename;o.textContent=`${s2.name} (${s2.system})`;s.appendChild(o);});}catch(err){log("Scripts: "+err.message);}
}
function populateLoadScripts(){
  const s=document.getElementById("loadScriptSelect");if(!s)return;
  s.innerHTML='<option value="">-- Select --</option>';
  const o=document.getElementById("scriptSelect")?.options;if(o)for(const p of o)if(p.value)s.appendChild(p.cloneNode(true));
}

// PATIENTS
async function loadPatients(){
  try{const r=await(await fetch("/api/patients")).json();const s=document.getElementById("patientSelect");if(!s)return;
  s.innerHTML='<option value="">Select patient...</option>';
  r.forEach(p=>{const o=document.createElement("option");o.value=p.id;o.textContent=`${p.id} - ${p.forename} ${p.surname} (${p.nhsNumber})`;s.appendChild(o);});}catch{}
}
async function onPatientSelect(){
  const s=document.getElementById("patientSelect"),d=document.getElementById("patientDetails"),id=s.value;
  if(!id){d.classList.add("hidden");return;}
  try{const p=await(await fetch(`/api/patients/${id}`)).json();d.classList.remove("hidden");
  d.innerHTML=`<div><span class="text-slate-400">NHS:</span> <strong>${p.nhsNumber}</strong></div><div><span class="text-slate-400">Name:</span> ${p.title} ${p.forename} ${p.surname}</div><div><span class="text-slate-400">DOB:</span> ${p.dob} (${p.age})</div>`;
  ["PATIENT_NHS","NHS_NUMBER"].forEach(n=>{const i=document.getElementById(`var-${n}`);if(i)i.value=p.nhsNumber;});
  const ni=document.getElementById("var-PATIENT_NAME");if(ni)ni.value=`${p.forename} ${p.surname}`;
  }catch{}
}
async function onScriptChange(){
  const f=document.getElementById("scriptSelect").value,m=document.getElementById("scriptMeta"),v=document.getElementById("variablesPanel"),b=document.getElementById("runBtn");
  if(!f){m.classList.add("hidden");v.classList.add("hidden");b.disabled=true;return;}
  try{const r=await(await fetch(`/api/scripts/${f}`)).json();currentScript=r;
  document.getElementById("metaSystem").textContent=r.system||"N/A";document.getElementById("metaSteps").textContent=r.steps.length;document.getElementById("metaDescription").textContent=(r.description||"").slice(0,120);
  m.classList.remove("hidden");currentScript.filename=f;buildVariablesForm(r.variables||[]);v.classList.remove("hidden");b.disabled=false;
  }catch(err){log("Script: "+err.message);}
}
function buildVariablesForm(v){
  const c=document.getElementById("variablesForm");c.innerHTML="";
  if(!v.length){c.innerHTML='<div class="text-xs text-slate-400 text-center py-2">No variables required</div>';return;}
  v.forEach(v2=>{
    const d=document.createElement("div");
    const l=document.createElement("label");l.className="block text-xs text-slate-500 mb-1";l.textContent=v2.label||v2.name;
    const i=document.createElement("input");i.className="w-full bg-white border border-slate-300 text-sm rounded-lg px-3 py-2 outline-none focus:ring-blue-500 focus:border-blue-500";
    i.id=`var-${v2.name}`;i.name=v2.name;i.type=v2.type==="password"?"password":"text";i.placeholder=v2.default||v2.label||v2.name;i.value=v2.default||"";
    if(v2.required)i.required=true;
    d.appendChild(l);d.appendChild(i);c.appendChild(d);
  });
}
function getVariables(){const v={};document.querySelectorAll("#variablesForm input").forEach(i=>{v[i.name]=i.value;});return v;}

// RUN
async function startRun(){
  if(!currentScript)return;const vars=getVariables(),missing=(currentScript.variables||[]).filter(v=>v.required&&!vars[v.name]);
  if(missing.length){toast(`Fill in: ${missing.map(v=>v.label||v.name).join(", ")}`,"error");return;}
  resetRunUI();document.getElementById("runBtn").classList.add("hidden");document.getElementById("cancelBtn").classList.remove("hidden");
  stepsData=currentScript.steps.map((s,i)=>({...s,status:"pending",index:i}));
  try{
    const d=await(await fetch("/api/run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({script:currentScript,variables:vars})})).json();
    currentRunId=d.runId;document.getElementById("currentScriptName").textContent=currentScript.name||"Test Run";
    document.getElementById("progressContainer").classList.remove("hidden");
    connectSSE(d.runId);
    log(`Run started: ${d.runId}`,"info");
  }catch(err){log("Run: "+err.message,"error");resetButtons();}
}
function connectSSE(id){
  if(eventSource)eventSource.close();
  eventSource=new EventSource(`/api/runs/${id}/events`);
  eventSource.addEventListener("step-start",e=>{const d=JSON.parse(e.data);stepStartTimes[d.stepId]=performance.now();renderTimelineStep(d.stepId,d.description||d.stepId,"running");log(`▶ ${d.description||d.stepId}`,"info");});
  eventSource.addEventListener("step-complete",e=>{const d=JSON.parse(e.data);const el=stepStartTimes[d.stepId]?((performance.now()-stepStartTimes[d.stepId])/1000).toFixed(1)+"s":"";updateTimelineStep(d.stepId,d.status,d.error,el);updateStats();log(d.status==="pass"?`✓ ${d.stepId}`:`✗ ${d.stepId}${d.error?" - "+d.error:""}`,d.status==="pass"?"success":"error");});
  eventSource.addEventListener("screenshot",e=>{const d=JSON.parse(e.data);addEvidence(d);});
  eventSource.addEventListener("log",e=>{try{const d=JSON.parse(e.data);log(d.message,d.level||"info");}catch{}});
  eventSource.addEventListener("complete",e=>{const d=JSON.parse(e.data);lastRunResult=d;log(`Complete: ${d.passed}/${d.totalSteps} passed`,"success");onRunComplete(d);});
  eventSource.addEventListener("error",e=>{try{log(JSON.parse(e.data).message||"Error","error");}catch{}});
  eventSource.onerror=()=>{};
}
async function cancelRun(){if(!currentRunId)return;try{await fetch(`/api/runs/${currentRunId}/cancel`,{method:"POST"});toast("Cancelled","warn");}catch{}}
function resetRunUI(){
  document.getElementById("progressContainer").classList.add("hidden");document.getElementById("progressBar").style.width="0%";
  document.getElementById("progressText").textContent="0%";
  document.getElementById("cardTotal").textContent="0";document.getElementById("cardPassed").textContent="0";document.getElementById("cardFailed").textContent="0";document.getElementById("cardRate").textContent="0%";
  document.getElementById("evidenceContainer").classList.add("hidden");document.getElementById("evidenceGrid").innerHTML="";
  screenshotsData=[];stepStartTimes={};document.getElementById("reportBtn").disabled=true;
  document.getElementById("timelineContainer").innerHTML='<div class="h-full flex flex-col items-center justify-center text-slate-400 space-y-3"><i class="ph ph-clock text-4xl opacity-50"></i><p class="text-sm">Awaiting script execution...</p></div>';
  document.getElementById("terminalContainer").innerHTML='<div class="text-slate-500 mb-2">Aetheris UAT Runtime v3.2.0 ready.</div>';
}
function resetButtons(){document.getElementById("runBtn").classList.remove("hidden");document.getElementById("cancelBtn").classList.add("hidden");}

function renderTimelineStep(stepId,desc,status,error){
  const empty=document.getElementById("timelineContainer").querySelector(".h-full");
  if(empty)empty.style.display="none";
  const c=document.getElementById("timelineContainer");
  // Remove existing step with same id
  const existing=document.getElementById(`tl-${stepId}`);if(existing)existing.remove();
  const d=document.createElement("div");d.className="timeline-item flex gap-3 mb-3";d.id=`tl-${stepId}`;
  let icon='<div class="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center border border-slate-200 z-10 relative flex-shrink-0 mt-0.5"><i class="ph ph-circle text-[8px]"></i></div>';
  if(status==="running")icon='<div class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center border border-blue-200 z-10 relative flex-shrink-0 mt-0.5 pulse-dot"><i class="ph ph-circle-notch text-[10px]"></i></div>';
  if(status==="pass")icon='<div class="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center border border-green-200 z-10 relative flex-shrink-0 mt-0.5"><i class="ph-bold ph-check text-xs"></i></div>';
  if(status==="fail")icon='<div class="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center border border-red-200 z-10 relative flex-shrink-0 mt-0.5"><i class="ph-bold ph-x text-xs"></i></div>';
  d.innerHTML=`${icon}<div class="flex-1 min-w-0"><div class="text-sm font-medium text-slate-800">${desc}</div>${error?`<div class="text-xs text-red-600 mt-1">${error}</div>`:''}</div>`;
  c.appendChild(d);c.scrollTop=c.scrollHeight;
}
function updateTimelineStep(stepId,status,error,elapsed){
  const el=document.getElementById(`tl-${stepId}`);if(!el)return;
  let icon='<div class="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center border border-slate-200 z-10 relative flex-shrink-0 mt-0.5"><i class="ph ph-circle text-[8px]"></i></div>';
  if(status==="pass")icon='<div class="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center border border-green-200 z-10 relative flex-shrink-0 mt-0.5"><i class="ph-bold ph-check text-xs"></i></div>';
  if(status==="fail")icon='<div class="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center border border-red-200 z-10 relative flex-shrink-0 mt-0.5"><i class="ph-bold ph-x text-xs"></i></div>';
  el.innerHTML=`${icon}<div class="flex-1 min-w-0"><div class="text-sm font-medium text-slate-800">${el.querySelector('.text-sm')?.textContent||stepId}</div>${error?`<div class="text-xs text-red-600 mt-1">${error}</div>`:''}${elapsed?`<div class="text-[10px] text-slate-400 mt-0.5">${elapsed}</div>`:''}</div>`;
}
function updateStats(){
  if(!stepsData.length){const s=document.querySelectorAll(".timeline-item");stepsData=Array.from(s).map((el,i)=>({id:el.id.replace("tl-",""),status:el.querySelector(".text-green-600")?"pass":el.querySelector(".text-red-600")?"fail":"pending",index:i}));}
  const t=stepsData.length,p=stepsData.filter(s=>s.status==="pass").length,f=stepsData.filter(s=>s.status==="fail").length;
  document.getElementById("cardTotal").textContent=t;document.getElementById("cardPassed").textContent=p;document.getElementById("cardFailed").textContent=f;
  document.getElementById("cardRate").textContent=t>0?Math.round((p/(p+f))*100)+"%":"0%";
  document.getElementById("progressBar").style.width=`${t>0?((p+f)/t*100):0}%`;
  document.getElementById("progressText").textContent=`${t>0?Math.round((p+f)/t*100):0}%`;
}

function addEvidence(data){
  screenshotsData.push(data);
  document.getElementById("evidenceContainer").classList.remove("hidden");
  const g=document.getElementById("evidenceGrid");
  const d=document.createElement("div");d.className="group relative rounded-lg overflow-hidden border border-slate-200 shadow-sm cursor-pointer";
  d.onclick=()=>openScreenshot(data);
  d.innerHTML=`<img src="/api/runs/${currentRunId}/screenshots/${data.filename}" alt="Evidence" class="w-full h-32 object-cover evidence-img" loading="lazy"><div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/90 to-transparent p-3 pt-8"><p class="text-[10px] text-white font-medium truncate">${data.description||data.filename}</p></div>`;
  g.appendChild(d);
}
function onRunComplete(data){
  resetButtons();document.getElementById("reportBtn").disabled=false;
  document.getElementById("currentStepDesc").textContent="Execution completed.";
  document.getElementById("progressBar").classList.add("bg-green-500");document.getElementById("progressBar").classList.remove("bg-blue-600");
  if(eventSource){eventSource.close();eventSource=null;}
}
function openScreenshot(d){
  document.getElementById("modalImage").src=`/api/runs/${currentRunId}/screenshots/${d.filename}`;
  document.getElementById("modalCaption").textContent=`${d.stepId}: ${d.description||""}`;
  document.getElementById("screenshotModal").classList.remove("hidden");
}
function closeModal(){document.getElementById("screenshotModal").classList.add("hidden");}
async function openReport(){if(currentRunId)window.open(`/api/runs/${currentRunId}/report`,"_blank");}

function log(msg,level="info"){
  const c=document.getElementById("terminalContainer");
  const d=document.createElement("div");
  const time=new Date().toLocaleTimeString("en-GB",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const colors={info:"text-slate-300",success:"text-green-400",error:"text-red-400",warn:"text-yellow-400",ai:"text-purple-400"};
  d.className=`mb-1 ${colors[level]||colors.info}`;
  d.innerHTML=`<span class="text-slate-500 mr-2">[${time}]</span>${msg}`;
  c.appendChild(d);c.scrollTop=c.scrollHeight;
}

// AGENTS
async function loadAgents(){
  try{const r=await(await fetch("/api/agents")).json();const g=document.getElementById("agentGrid");if(!g)return;g.innerHTML="";
  r.forEach(a=>{const c=document.createElement("div");c.className="agent-card bg-white rounded-xl border border-slate-200 shadow-sm p-5 cursor-pointer";c.onclick=()=>selectAgent(a);
  c.innerHTML=`<div class="flex items-center gap-3 mb-3"><div class="w-8 h-8 rounded-lg ${a.implemented?"bg-green-100 text-green-700":"bg-slate-100 text-slate-400"} flex items-center justify-center"><i class="ph ${a.implemented?"ph-check-circle":"ph-circle"} text-lg"></i></div><div><div class="font-semibold text-sm text-slate-800">${a.name}</div><div class="text-xs text-slate-400">${a.workflow||""}</div></div></div><div class="text-xs text-slate-500 mb-2">${a.description}</div><div class="flex flex-wrap gap-1"><span class="text-[10px] font-medium ${a.implemented?"bg-green-100 text-green-700":"bg-slate-100 text-slate-400"} px-2 py-0.5 rounded-full">${a.implemented?"Active":"Stub"}</span><span class="text-[10px] text-slate-400">${a.systems.slice(0,2).join(", ")}${a.systems.length>2?"...":""}</span></div>`;g.appendChild(c);});}catch(err){toast("Agents: "+err.message,"error");}
}
function selectAgent(agent){
  selectedAgent=agent;document.querySelectorAll(".agent-card").forEach(c=>c.classList.remove("selected"));
  event?.target?.closest(".agent-card")?.classList.add("selected");
  document.getElementById("agentRunPanel").classList.remove("hidden");
  document.getElementById("agentRunTitle").textContent=agent.name;
  document.getElementById("agentRunForm").innerHTML=`
  <div><label class="text-xs font-medium text-slate-600 block mb-1">Workflow</label><select id="agentWorkflow" class="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg px-3 py-2 outline-none">${agent.testCases.map(t=>`<option>${t}</option>`).join("")}</select></div>
  <div><label class="text-xs font-medium text-slate-600 block mb-1">Patient NHS</label><input id="agentNhs" class="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg px-3 py-2 outline-none" placeholder="999 057 5924"></div>
  <div><label class="text-xs font-medium text-slate-600 block mb-1">URL (optional)</label><input id="agentUrl" class="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg px-3 py-2 outline-none"></div>
  <div><label class="text-xs font-medium text-slate-600 block mb-1">Username</label><input id="agentUser" class="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg px-3 py-2 outline-none"></div>
  <div><label class="text-xs font-medium text-slate-600 block mb-1">Password</label><input id="agentPass" type="password" class="w-full bg-slate-50 border border-slate-300 text-sm rounded-lg px-3 py-2 outline-none"></div>`;
}
function closeAgentRun(){document.getElementById("agentRunPanel").classList.add("hidden");document.querySelectorAll(".agent-card").forEach(c=>c.classList.remove("selected"));}
async function executeAgent(){
  if(!selectedAgent)return;const body={workflow:document.getElementById("agentWorkflow")?.value,patientNhs:document.getElementById("agentNhs")?.value,url:document.getElementById("agentUrl")?.value,username:document.getElementById("agentUser")?.value,password:document.getElementById("agentPass")?.value,testCode:document.getElementById("agentWorkflow")?.value,callbacks:{}};
  const btn=document.getElementById("agentRunBtn");btn.disabled=true;btn.innerHTML='<i class="ph-bold ph-spinner animate-spin"></i> Running...';
  try{const ep=selectedAgent.id==="custom-script"?"custom":selectedAgent.id;
  const d=await(await fetch(`/api/agents/${ep}/run`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).json();
  document.getElementById("agentResult").classList.remove("hidden");
  document.getElementById("agentResult").innerHTML=`<div class="bg-slate-50 rounded-lg p-4 text-sm"><div class="flex justify-between"><span class="text-slate-500">Status</span><span class="font-medium">${d.status}</span></div><div class="flex justify-between"><span class="text-slate-500">Passed</span><span class="font-medium text-green-600">${d.passed||0}/${d.total||0}</span></div><div class="flex justify-between"><span class="text-slate-500">Screenshots</span><span class="font-medium">${d.screenshots||0}</span></div></div>`;
  toast(`Agent: ${d.status} (${d.passed||0}/${d.total||0})`,d.status==="passed"?"success":"error");
  }catch(err){toast("Agent: "+err.message,"error");}finally{btn.disabled=false;btn.innerHTML="Run Agent";}
}

// NL
async function generateScriptNL(){
  const text=document.getElementById("nlInput")?.value;if(!text){toast("Enter a description","error");return;}
  const systems=(document.getElementById("nlSystems")?.value||"").split(",").map(s=>s.trim()).filter(Boolean);
  try{const d=await(await fetch("/api/nl/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,systems})})).json();
  document.getElementById("nlResult").classList.remove("hidden");
  if(d.error){document.getElementById("nlResult").innerHTML=`<div class="text-red-600 text-sm">${d.error}</div>`;return;}
  document.getElementById("nlResult").innerHTML=`<pre class="bg-[#0f172a] text-slate-300 rounded-lg p-3 text-[11px] overflow-x-auto">${JSON.stringify(Array.isArray(d)?d:d.steps||d,null,2)}</pre>`;
  toast(`Generated ${Array.isArray(d)?d.length:0} steps`,"success");
  }catch(err){toast("NL: "+err.message,"error");}
}
async function suggestTests(){const s=document.getElementById("nlSystems")?.value||"";try{const d=await(await fetch("/api/nl/suggest",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:s})})).json();document.getElementById("nlResult").classList.remove("hidden");document.getElementById("nlResult").innerHTML=`<pre class="bg-[#0f172a] text-slate-300 rounded-lg p-3 text-[11px]">${d.result||JSON.stringify(d,null,2)}</pre>`;}catch(err){toast("Suggest: "+err.message,"error");}}

// REMEDIATION
async function loadRemediationStats(){
  try{const d=await(await fetch("/api/remediate/stats")).json();document.getElementById("remTotal").textContent=d.totalRemediations??"-";document.getElementById("remSuccess").textContent=d.successful??"-";document.getElementById("remRate").textContent=d.successRate??"-";}catch{}
  try{const l=await(await fetch("/api/remediate/log?limit=10")).json();const el=document.getElementById("remediationLog");if(!l.length)return;el.innerHTML=l.map(l2=>`<div><span class="text-slate-500">[${new Date(l2.timestamp).toLocaleTimeString()}]</span> ${l2.diagnosis||l2.step||l2.event}</div>`).join("");}catch{}
}
async function loadFineTuneStats(){try{const d=await(await fetch("/api/fine-tune/stats")).json();document.getElementById("ftFiles").textContent=d.files??"-";document.getElementById("ftExamples").textContent=d.totalExamples??"-";}catch{}try{const f=await(await fetch("/api/fine-tune/files")).json();const el=document.getElementById("ftFileList");if(!f.length){el.innerHTML='<div class="text-slate-400 text-xs text-center py-2">No data.</div>';return;}el.innerHTML=f.map(f2=>`<div class="flex justify-between text-xs"><span>${f2.filename}</span><span class="text-slate-400">${f2.examples} ex</span></div>`).join("");}catch{}}
async function collectTraining(){if(!lastRunResult){toast("No completed run","error");return;}try{const d=await(await fetch("/api/fine-tune/collect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({steps:lastRunResult.steps||[],system:lastRunResult.system||"general"})})).json();toast(`Collected ${d.count||0} examples`,"success");loadFineTuneStats();}catch(err){toast("Collect: "+err.message,"error");}}
async function submitFineTune(){try{const d=await(await fetch("/api/fine-tune/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).json();toast(d.submitted?`Submitted (${d.totalExamples} ex)`:`Error: ${d.error||"Unknown"}`,d.submitted?"success":"error");}catch(err){toast("Submit: "+err.message,"error");}}

// FHIR
async function loadFHIRCodes(){try{const d=await(await fetch("/api/fhir/codes")).json();const el=document.getElementById("fhirCodes");if(!el)return;el.innerHTML=(d.observations||[]).map(o=>`<div class="flex justify-between py-1 border-b border-slate-100"><span><strong>${o.code}</strong>: ${o.display}</span><span class="text-slate-400">${o.unit}</span></div>`).join("");}catch{}}
async function generateFHIR(){const c=parseInt(document.getElementById("fhirCount")?.value)||1,g=document.getElementById("fhirGender")?.value||"";try{const d=await(await fetch(`/api/fhir/patients?count=${c}${g?"&gender="+g:""}`)).json();document.getElementById("fhirResult").classList.remove("hidden");document.getElementById("fhirResult").innerHTML=`<pre class="bg-[#0f172a] text-slate-300 rounded-lg p-3 text-[11px] overflow-x-auto max-h-[200px]">${JSON.stringify(d,null,2)}</pre>`;toast(`Generated ${d.generated||0} patients`,"success");}catch(err){toast("FHIR: "+err.message,"error");}}
async function testFHIRServer(){try{const d=await(await fetch("/api/fhir/r4/metadata")).json();document.getElementById("fhirServerResult").classList.remove("hidden");document.getElementById("fhirServerResult").innerHTML=`<pre class="bg-[#0f172a] text-slate-300 rounded-lg p-3 text-[11px]">${JSON.stringify({fhirVersion:d.fhirVersion},null,2)}</pre>`;}catch(err){toast("FHIR: "+err.message,"error");}}

// METRICS
async function refreshMetrics(){
  try{const d=await(await fetch("/api/metrics")).json();
  document.getElementById("statRuns").textContent=d.runsStarted||0;document.getElementById("statPassRate").textContent=(d.passRate||0)+"%";
  document.getElementById("statFailed").textContent=d.runsFailed||0;document.getElementById("statScreenshots").textContent=d.screenshotsCaptured||0;
  const el=document.getElementById("metricsDisplay");if(!el)return;
  el.innerHTML=`<div class="bg-slate-50 rounded-lg p-3 text-center"><div class="text-lg font-bold text-blue-600">${d.runsStarted||0}</div><div class="text-[10px] text-slate-500 uppercase">Runs</div></div><div class="bg-slate-50 rounded-lg p-3 text-center"><div class="text-lg font-bold text-green-600">${d.passRate||0}%</div><div class="text-[10px] text-slate-500 uppercase">Rate</div></div><div class="bg-slate-50 rounded-lg p-3 text-center"><div class="text-lg font-bold text-purple-600">v${d.version||"?"}</div><div class="text-[10px] text-slate-500 uppercase">Version</div></div>`;
  }catch{}
  try{const d=await(await fetch("/api/insights")).json();const rr=document.getElementById("recentRuns");if(!rr)return;
  if(!d.recentRuns?.length){rr.innerHTML='<div class="text-sm text-slate-400 text-center py-8">No runs yet.</div>';return;}
  rr.innerHTML=d.recentRuns.map(r=>`<div class="flex items-center justify-between py-2 border-b border-slate-100 text-sm"><div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full ${r.status==="pass"?"bg-green-500":r.status==="fail"?"bg-red-500":"bg-slate-300"}"></span><span class="font-medium">${r.script||r.id?.slice(0,16)}</span></div><span class="text-slate-400 text-xs">${r.passed||0}/${(r.passed||0)+(r.failed||0)}</span></div>`).join("");}catch{}
}
function updateHealthList(){
  const el=document.getElementById("healthList");if(!el)return;el.innerHTML=`<div class="flex items-center justify-between py-2 border-b border-slate-100 text-sm"><div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-green-500"></span><span class="font-medium">API Server</span></div><span class="text-green-600 text-xs">Online</span></div><div class="flex items-center justify-between py-2 border-b border-slate-100 text-sm"><div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-green-500"></span><span class="font-medium">Cloudflare Tunnel</span></div><span class="text-green-600 text-xs">Connected</span></div><div class="flex items-center justify-between py-2 border-b border-slate-100 text-sm"><div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full" id="healthAiDot"></span><span class="font-medium">AI Backend</span></div><span class="text-xs" id="healthAi">Checking...</span></div><div class="flex items-center justify-between py-2 border-b border-slate-100 text-sm"><div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full" id="healthPtDot"></span><span class="font-medium">PractiTest</span></div><span class="text-xs" id="healthPt">Checking...</span></div>`;
  fetch("/api/ai/status").then(r=>r.json()).then(d=>{document.getElementById("healthAi").textContent=d.enabled?"Connected":"Offline";}).catch(()=>{});
  fetch("/api/practitest/status").then(r=>r.json()).then(d=>{document.getElementById("healthPt").textContent=d.configured?"Configured":"Not configured";}).catch(()=>{});
}

// SCHEDULE
async function loadSchedule(){
  try{const j=await(await fetch("/api/schedule")).json();const el=document.getElementById("scheduleList");if(!el)return;
  if(!j.length){el.innerHTML='<div class="text-slate-400 text-center py-4">No jobs. <button class="text-blue-600 hover:underline" onclick="showAddSchedule()">Add one</button></div>';return;}
  el.innerHTML=j.map(j2=>`<div class="flex items-center justify-between py-1 border-b border-slate-100"><span><span class="font-medium">${j2.cron}</span> <span class="text-slate-400">${j2.script||j2.agentId||"?"}</span></span><button class="text-red-500 hover:text-red-700 text-sm" onclick="deleteSchedule('${j2.id}')"><i class="ph-bold ph-trash"></i></button></div>`).join("");}catch{}
}
function showAddSchedule(){document.getElementById("scheduleForm").classList.remove("hidden");}
function hideScheduleForm(){document.getElementById("scheduleForm").classList.add("hidden");}
async function addSchedule(){const c=document.getElementById("schedCron")?.value,s=document.getElementById("schedScript")?.value;if(!c||!s){toast("Cron+script required","error");return;}try{await(await fetch("/api/schedule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cron:c,script:s,agentId:s})})).json();toast("Job scheduled","success");hideScheduleForm();loadSchedule();}catch(err){toast("Schedule: "+err.message,"error");}}
async function deleteSchedule(id){try{await fetch(`/api/schedule/${id}`,{method:"DELETE"});toast("Deleted","success");loadSchedule();}catch{}}

// AUDIT
async function loadAudit(){const d=document.getElementById("auditDate")?.value||new Date().toISOString().slice(0,10);try{const e=await(await fetch(`/api/audit?date=${d}&limit=100`)).json();const el=document.getElementById("auditLog");if(!e.length){el.innerHTML='<div class="text-slate-500">No entries.</div>';return;}el.innerHTML=e.map(e2=>`<div><span class="text-slate-500">[${new Date(e2.timestamp).toLocaleTimeString()}]</span> ${e2.action}</div>`).join("");toast(`${e.length} entries`,"success");}catch(err){toast("Audit: "+err.message,"error");}}

// LOAD TEST
async function generateK6(){const f=document.getElementById("loadScriptSelect")?.value;if(!f){toast("Select a script","error");return;}try{const s=await(await fetch(`/api/scripts/${f}`)).json();const c=await(await fetch("/api/load-test/generate-k6",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({script:s,vus:10})})).text();document.getElementById("loadResult").classList.remove("hidden");document.getElementById("loadResult").textContent=c;}catch(err){toast("k6: "+err.message,"error");}}
async function generateArtillery(){const f=document.getElementById("loadScriptSelect")?.value;if(!f){toast("Select a script","error");return;}try{const s=await(await fetch(`/api/scripts/${f}`)).json();const d=await(await fetch("/api/load-test/generate-artillery",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({script:s,vus:10})})).json();document.getElementById("loadResult").classList.remove("hidden");document.getElementById("loadResult").textContent=JSON.stringify(d,null,2);}catch(err){toast("Artillery: "+err.message,"error");}}

// MISC
async function checkAIStatus(){try{const d=await(await fetch("/api/ai/status")).json();document.getElementById("aiLabel").textContent=d.enabled?"Agentic AI Active":"AI Offline";const dot=document.getElementById("aiDot");if(dot)dot.className=`w-2.5 h-2.5 rounded-full ${d.enabled?"bg-purple-500 pulse-dot":"bg-slate-300"}`;}catch{}}
async function loadMobileProfiles(){try{const p=await(await fetch("/api/mobile/profiles")).json();const el=document.getElementById("mobileProfiles");if(!el)return;el.innerHTML=p.map(p2=>`<div class="flex justify-between py-1 border-b border-slate-100 text-sm"><span><strong>${p2.name}</strong></span><span class="text-slate-400">${p2.viewport}</span></div>`).join("");}catch{}}
async function loadOAuthStatus(){try{const d=await(await fetch("/api/oauth/status")).json();const el=document.getElementById("oauthStatus");if(!el)return;el.innerHTML=`<div class="grid grid-cols-3 gap-3"><div class="bg-slate-50 rounded-lg p-3 text-center"><div class="text-lg">${d.enabled?"🟢":"🔴"}</div><div class="text-[10px] text-slate-500">Enabled</div></div><div class="bg-slate-50 rounded-lg p-3 text-center"><div class="text-lg font-bold text-blue-600">${d.clientCount||0}</div><div class="text-[10px] text-slate-500">Clients</div></div><div class="bg-slate-50 rounded-lg p-3 text-center"><div class="text-lg font-bold text-purple-600">${d.activeTokens||0}</div><div class="text-[10px] text-slate-500">Tokens</div></div></div>`;}catch{}}
async function checkPractitestStatus(){try{(await fetch("/api/practitest/status")).json();}catch{}}

/* CSV Import on dashboard */
document.addEventListener("change",e=>{if(e.target.id==="dashCsvInput"){}});
