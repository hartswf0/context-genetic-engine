'use strict';

const DEFAULT_KERNEL = `<poml version="2.0">
  <meta><title>PRIME PROMPT — THE OPERATIONAL PRAGMATIST</title><intent>Transform abstract inputs into active scripts of rigorous, tactile operations.</intent></meta>
  <system>
    <role>You are an Operational Pragmatist. Reject the Occult Fallacy. Meaning is use.</role>
    <directive>Reconstruct the input into active operations. Every sentence must function like a lever.</directive>
  </system>
  <design_constraints>
    <constraint type="contrast">Use absolute black/white as the base. Remove mid-tone dependence.</constraint>
    <constraint type="interaction">Text operates as a physical control surface.</constraint>
    <constraint type="output">REFINE THE PROMPT FIRST. Program text comes from the prompt genome.</constraint>
  </design_constraints>
</poml>`;

const els = {};
let config = {};
let debugRows = [];
let timer = null;
let startedAt = 0;
let activeTab = 'prompt';
let siteGenome = null;
let promptGenome = [];
let operationGenome = [];
let fitnessBaseline = {};
let boundKind = 'prompt';
let boundId = '';
let programArtifact = null;
let childFitness = null;
let lastRaw = null;
let generation = 0;

window.addEventListener('DOMContentLoaded', init);

async function init(){
  collectEls();
  bindEvents();
  els.kernel.value = localStorage.getItem('genoma_v14_kernel') || localStorage.getItem('genoma_v13_kernel') || DEFAULT_KERNEL;
  await loadConfig();
  setStage('READY', 0, 4, 'Encode the page into a prompt genome. Compile the genome into program text. Open the artifact.', 'idle');
  renderAll();
  log('STATUS','Loaded v14. More-with-less film mode: prompt genome first, program text second.');
}

function collectEls(){
  for (const id of [
    'statusBlock','stateText','stepText','modelText','elapsedText','progressFill','lastEvent',
    'btnConfig','btnDebug','directive','btnEncode','btnCompile','btnOpenArtifact','btnCopyPrompt','btnCopyCode','btnExport',
    'tabPrompt','tabProgram','tabSystems','promptPane','programPane','systemsPane','promptMeta','programMeta','systemsMeta',
    'promptCards','systemCards','programSummary','programPreviewWrap','programPreview','boundMeta','boundCard','codonChat','btnMutateCodon','btnSelectNext',
    'configDialog','provider','endpoint','reasoningModel','fastModel','apiKey','kernel','btnSaveConfig','btnTestReasoning',
    'debugDialog','debugLog','btnClearDebug','btnCopyDebug'
  ]) els[id] = document.getElementById(id);
}

function bindEvents(){
  els.btnConfig.addEventListener('click', () => els.configDialog.showModal());
  els.btnDebug.addEventListener('click', () => { renderDebug(); els.debugDialog.showModal(); });
  els.provider.addEventListener('change', applyProviderDefaults);
  els.btnSaveConfig.addEventListener('click', saveConfig);
  els.btnTestReasoning.addEventListener('click', testReasoningModel);
  els.btnEncode.addEventListener('click', encodePromptGenome);
  els.btnCompile.addEventListener('click', compileProgramText);
  els.btnOpenArtifact.addEventListener('click', openArtifact);
  els.btnCopyPrompt.addEventListener('click', copyPromptGenome);
  els.btnCopyCode.addEventListener('click', copyProgramHtml);
  els.btnExport.addEventListener('click', exportState);
  els.tabPrompt.addEventListener('click', () => setTab('prompt'));
  els.tabProgram.addEventListener('click', () => setTab('program'));
  els.tabSystems.addEventListener('click', () => setTab('systems'));
  els.btnMutateCodon.addEventListener('click', mutateBoundCodon);
  els.btnSelectNext.addEventListener('click', selectArtifactAsNextGen);
  els.btnClearDebug.addEventListener('click', () => { debugRows = []; renderDebug(); });
  els.btnCopyDebug.addEventListener('click', copyDebug);
}

function send(type, payload={}){
  return new Promise(resolve => chrome.runtime.sendMessage({type,payload}, res => resolve(res || { error: chrome.runtime.lastError?.message || 'No response' })));
}

async function loadConfig(){
  const res = await send('GET_CONFIG');
  config = res.ok ? res.raw : formConfig();
  els.provider.value = config.provider || 'openai';
  els.endpoint.value = config.endpoint || 'https://api.openai.com/v1/responses';
  els.reasoningModel.value = config.reasoningModel || config.model || 'gpt-5.1';
  els.fastModel.value = config.fastModel || 'gpt-5.1';
  els.apiKey.value = config.apiKey || '';
  renderModelLine();
}
function formConfig(){ return { provider:els.provider.value, endpoint:els.endpoint.value.trim(), reasoningModel:els.reasoningModel.value.trim(), fastModel:els.fastModel.value.trim(), apiKey:els.apiKey.value.trim() }; }
function renderModelLine(extra=''){
  const c = formConfig();
  const missing = c.provider !== 'local' && !c.apiKey;
  const hasReasoning = !!(c.reasoningModel || '').trim();
  els.modelText.textContent = missing ? 'KEY NEEDED' : hasReasoning ? `REASONING ${extra ? '· ' + String(extra).toUpperCase() : 'ON'}` : 'FAST ONLY';
  return !missing;
}
function applyProviderDefaults(){
  const d = {
    local:['http://localhost:11434/v1/chat/completions','llama3.1','llama3.1'],
    openai:['https://api.openai.com/v1/responses','gpt-5.1','gpt-5.1'],
    gemini:['https://generativelanguage.googleapis.com/v1beta/models','gemini-2.5-flash','gemini-2.5-flash'],
    anthropic:['https://api.anthropic.com/v1/messages','claude-sonnet-4-20250514','claude-sonnet-4-20250514']
  }[els.provider.value];
  els.endpoint.value=d[0]; els.reasoningModel.value=d[1]; els.fastModel.value=d[2]; renderModelLine();
}
async function saveConfig(){
  config = formConfig();
  localStorage.setItem('genoma_v14_kernel', els.kernel.value);
  const res = await send('SAVE_CONFIG', {config});
  if(!res.ok) return fail(res.error || 'Config save failed');
  renderModelLine('saved');
  setStage('ENGINE READY',0,4,'Reasoning route saved. Model names are hidden during normal use.','done');
  log('STATUS',`Saved config: ${config.provider}; reasoning=${config.reasoningModel}; fast=${config.fastModel}`);
}
async function testReasoningModel(){
  try{
    config=formConfig(); ensureModel(config);
    setStage('TESTING MODEL',0,4,'Testing reasoning model…','busy');
    log('SEND',`TEST_MODEL reasoning ${config.provider}/${config.reasoningModel}`);
    const res=await send('TEST_MODEL',{config,tier:'reasoning'});
    if(!res.ok) throw new Error(res.error||'Model test failed');
    setStage('ENGINE READY',0,4,'Reasoning route responded. Ready to encode.','done');
    log('RECV',res.text||'Model OK');
  }catch(e){ fail(e.message||String(e)); }
}

async function encodePromptGenome(){
  try{
    config=formConfig(); ensureModel(config);
    setStage('CAPTURING F0',1,4,'Domestication scan: collecting visible evidence, controls, routes, media, and text.','busy');
    await pageHUD('CAPTURING F0','Collecting live page evidence.');
    log('SEND','CAPTURE_PAGE');
    const cap=await send('CAPTURE_PAGE');
    if(!cap.ok) throw new Error(cap.error||'Capture failed');
    siteGenome=cap.genome;
    log('RECV',`Captured ${siteGenome?.stats?.anchors||0} anchors from live page.`);

    setStage('BREEDING PROMPT GENOME',2,4,'Reasoning engine is compressing F0 into controllable codons.','busy');
    await pageHUD('BREEDING PROMPT GENOME','F0 evidence is becoming prompt DNA.');
    log('SEND','ENCODE_PROMPT_GENOME_MODEL');
    const res=await send('ENCODE_PROMPT_GENOME_MODEL',{directive:els.directive.value,kernel:els.kernel.value,genome:compactGenome(siteGenome),generation,config});
    if(!res.ok) throw new Error(res.error||'Encoding failed');
    lastRaw=res.raw||res.encoded;
    const encoded=normalizeEncoded(res.encoded||{});
    promptGenome=encoded.promptGenome;
    operationGenome=encoded.operationGenome;
    fitnessBaseline=encoded.fitnessBaseline||{};
    boundKind='prompt'; boundId=promptGenome[0]?.id||'';
    programArtifact=null; childFitness=null;
    renderAll(); setTab('prompt');
    setStage('GENOME READY',2,4,`Prompt genome ready: ${promptGenome.length} codons. Next: compile artifact.`,'done');
    await pageHUD('GENOME READY',`${promptGenome.length} codons encoded. Compile the artifact.`);
    log('RECV',`Prompt genome ${promptGenome.length}; operation genome ${operationGenome.length}.`);
  }catch(e){ fail(e.message||String(e)); }
}

async function compileProgramText(){
  try{
    config=formConfig(); ensureModel(config);
    if(!promptGenome.length) await encodePromptGenome();
    if(!promptGenome.length) throw new Error('Prompt genome missing.');
    setStage('COMPILING ARTIFACT',3,4,'Prompt genome is producing program text: a filmable standalone UI.','busy');
    await pageHUD('COMPILING ARTIFACT','Prompt genome is becoming program text.');
    log('SEND',`EXPRESS_CHILD_MODEL → PROGRAM_TEXT generation ${generation+1}`);
    const res=await send('EXPRESS_CHILD_MODEL',{directive:els.directive.value,kernel:els.kernel.value,promptGenome,operationGenome,fitnessBaseline,evidence:compactGenome(siteGenome),generation:generation+1,config});
    if(!res.ok) throw new Error(res.error||'Compile failed');
    lastRaw=res.raw||res.child;
    programArtifact=normalizeChild(res.child||{});
    childFitness=programArtifact.fitness||res.child?.fitness||null;
    renderAll(); setTab('program');
    setStage('ARTIFACT READY',4,4,`Artifact compiled. Press OPEN ARTIFACT to see the phenotype full-size.`,'done');
    await pageHUD('ARTIFACT READY','Open the artifact page. The source page stayed untouched.');
    log('RECV',`Program artifact ready. ${programArtifact.title} · html=${programArtifact.html.length} chars`);
  }catch(e){ fail(e.message||String(e)); }
}

async function mutateBoundCodon(){
  try{
    const codon=getBoundCodon();
    if(!codon) throw new Error('Bind a prompt codon first.');
    const message=els.codonChat.value.trim()||els.directive.value.trim();
    if(!message) throw new Error('Write a codon mutation instruction first.');
    config=formConfig(); ensureModel(config);
    setStage('MUTATING CODON',2,4,`Fast model is mutating ${codon.title||codon.label||codon.id} only…`,'busy');
    log('SEND',`MUTATE_CODON_MODEL ${boundKind}/${codon.id}`);
    const res=await send('MUTATE_CODON_MODEL',{codon,kind:boundKind,message,kernel:els.kernel.value,config});
    if(!res.ok) throw new Error(res.error||'Codon mutation failed');
    const updated=res.codon;
    if(boundKind==='prompt') promptGenome=promptGenome.map(c=>c.id===codon.id?normalizePromptCodon(updated):c);
    else operationGenome=operationGenome.map(c=>c.id===codon.id?normalizeOperationCodon(updated):c);
    els.codonChat.value='';
    programArtifact=null; childFitness=null;
    renderAll();
    setStage('CODON MUTATED',2,4,'Codon updated. Recompile program text to see the phenotype change.','done');
    log('RECV',`Codon updated: ${updated.title||updated.label||updated.id}`);
  }catch(e){ fail(e.message||String(e)); }
}

async function openArtifact(){
  if(!programArtifact) return fail('Compile program text first.');
  const res=await send('OPEN_CHILD_ARTIFACT',{child:programArtifact,state:exportPayload()});
  if(!res.ok) return fail(res.error||'Could not open artifact page.');
  setStage('ARTIFACT OPENED',4,4,'Standalone phenotype opened in a new tab. Film the artifact there.','done');
  log('RECV',`Opened artifact page: ${res.url||''}`);
}

function selectArtifactAsNextGen(){
  if(!programArtifact) return fail('Compile an artifact first.');
  generation += 1;
  const next = programArtifact.nextPromptGenome?.codons || null;
  if(Array.isArray(next) && next.length) promptGenome = next.map(normalizePromptCodon).slice(0,12);
  boundKind='prompt'; boundId=promptGenome[0]?.id||'';
  programArtifact=null; childFitness=null;
  renderAll(); setTab('prompt');
  setStage('NEXT GEN SELECTED',2,4,`Generation ${generation}. Prompt genome carried forward. Compile the next artifact.`, 'done');
  log('STATUS',`Selected artifact as next generation ${generation}.`);
}

function setTab(tab){
  activeTab=tab;
  for(const [name,btn,pane] of [['prompt',els.tabPrompt,els.promptPane],['program',els.tabProgram,els.programPane],['systems',els.tabSystems,els.systemsPane]]){
    btn.classList.toggle('active',name===tab); pane.classList.toggle('active',name===tab);
  }
}

function renderAll(){
  renderModelLine();
  els.promptMeta.textContent = promptGenome.length ? `${promptGenome.length} codons · generation ${generation}` : 'not encoded';
  els.systemsMeta.textContent = operationGenome.length ? `${operationGenome.length} systems` : 'hidden until encoded';
  els.programMeta.textContent = programArtifact ? `${programArtifact.title}` : 'not compiled';
  renderCards();
  renderBound();
  renderProgram();
}

function renderCards(){
  if(!promptGenome.length) els.promptCards.className='cards empty', els.promptCards.textContent='Press ENCODE PROMPT GENOME.';
  else { els.promptCards.className='cards'; els.promptCards.innerHTML=promptGenome.map(c=>cardHTML(c,'prompt')).join(''); }
  if(!operationGenome.length) els.systemCards.className='cards empty', els.systemCards.textContent='Operation systems appear after encoding. They stay secondary.';
  else { els.systemCards.className='cards'; els.systemCards.innerHTML=operationGenome.map(c=>cardHTML(c,'operation')).join(''); }
  els.promptCards.querySelectorAll('.codonCard').forEach(el=>el.addEventListener('click',()=>{boundKind=el.dataset.kind; boundId=el.dataset.id; renderAll();}));
  els.systemCards.querySelectorAll('.codonCard').forEach(el=>el.addEventListener('click',()=>{boundKind=el.dataset.kind; boundId=el.dataset.id; renderAll();}));
}

function cardHTML(c, kind){
  const title=escapeHTML(c.title||c.label||c.id);
  const payload=escapeHTML(c.payload||c.controls||'');
  const bound = boundKind===kind && boundId===c.id ? ' bound' : '';
  const state = c.state === 'INTRON' ? 'INTRON' : 'EXON';
  return `<article class="codonCard${bound}" data-kind="${kind}" data-id="${escapeHTML(c.id)}"><div class="codonType ${escapeHTML(c.type)}">${escapeHTML(c.type)}</div><div class="codonMain"><div class="codonTitle">${title}</div><div class="codonPayload">${payload}</div></div><div class="stateTag ${state==='INTRON'?'intron':''}">${state}</div></article>`;
}

function renderBound(){
  const c=getBoundCodon();
  if(!c){ els.boundMeta.textContent='none'; els.boundCard.className='boundCard empty'; els.boundCard.textContent='Click a prompt codon. Mutations update the prompt genome, then recompile the program text.'; return; }
  els.boundMeta.textContent=`${boundKind} · ${c.type} · ${c.state||'EXON'}`;
  const controls=escapeHTML(c.controls||c.payload||'');
  const can=escapeHTML(list(c.allowedChanges||c.allowedMutations).join('; ')||'rewrite prompt payload');
  const cannot=escapeHTML(list(c.forbiddenChanges||c.forbiddenMutations).join('; ')||'break source fidelity');
  els.boundCard.className='boundCard';
  els.boundCard.innerHTML=`<strong>${escapeHTML(c.title||c.label||c.id)}</strong><br><b>Controls</b> ${controls}<br><b>Can</b> ${can}<br><b>Cannot</b> ${cannot}`;
}

function renderProgram(){
  if(!programArtifact){
    els.programSummary.textContent='The prompt genome will compile into a standalone child UI artifact. It opens in its own page.';
    els.programPreviewWrap.classList.add('hidden');
    els.btnOpenArtifact.disabled=true; els.btnCopyCode.disabled=true;
    return;
  }
  els.btnOpenArtifact.disabled=false; els.btnCopyCode.disabled=false;
  els.programSummary.innerHTML = `<b>${escapeHTML(programArtifact.title)}</b><br>${escapeHTML(programArtifact.summary||'Standalone UI artifact compiled from prompt genome.')}`;
  els.programPreviewWrap.classList.remove('hidden');
  const full = buildFullHtml(programArtifact);
  els.programPreview.srcdoc=full;
}

function getBoundCodon(){ return boundKind==='operation' ? operationGenome.find(c=>c.id===boundId) : promptGenome.find(c=>c.id===boundId); }
function normalizeEncoded(e){ return { promptGenome: normalizePromptGenome(e.promptGenome).codons, operationGenome: normalizeOperationGenome(e.operationGenome).codons, fitnessBaseline:e.fitnessBaseline||{} }; }
function normalizePromptGenome(g){ const arr=Array.isArray(g?.codons)?g.codons:Array.isArray(g)?g:[]; return {codons:arr.map(normalizePromptCodon).slice(0,12)}; }
function normalizePromptCodon(c,i=0){ return { id:String(c.id||`${c.type||'P'}_${i}`).replace(/[^a-zA-Z0-9_-]/g,'_'), type:String(c.type||'CST').toUpperCase().slice(0,6), title:String(c.title||c.label||c.type||'Prompt Codon').slice(0,80), locus:String(c.locus||'prompt').slice(0,80), payload:String(c.payload||c.instruction||c.controls||'').slice(0,2200), controls:String(c.controls||c.purpose||c.payload||'').slice(0,900), allowedChanges:list(c.allowedChanges||c.allowedMutations||['rewrite payload']).slice(0,8), forbiddenChanges:list(c.forbiddenChanges||c.forbiddenMutations||['break source fidelity']).slice(0,8), state:c.state==='INTRON'?'INTRON':'EXON', dominance:Number(c.dominance??0.5) }; }
function normalizeOperationGenome(g){ const arr=Array.isArray(g?.codons)?g.codons:Array.isArray(g)?g:[]; return {codons:arr.map(normalizeOperationCodon).slice(0,12)}; }
function normalizeOperationCodon(c,i=0){ return { id:String(c.id||`${c.type||'O'}_${i}`).replace(/[^a-zA-Z0-9_-]/g,'_'), type:String(c.type||'OPR').toUpperCase().slice(0,6), label:String(c.label||c.title||'Operation System').slice(0,80), locus:String(c.locus||'operation').slice(0,80), controls:String(c.controls||c.payload||'').slice(0,900), payload:String(c.payload||c.controls||'').slice(0,1400), anchors:Array.isArray(c.anchors)?c.anchors.slice(0,80):[], allowedMutations:list(c.allowedMutations||['style','labels','overlay']).slice(0,8), forbiddenMutations:list(c.forbiddenMutations||['delete','replace','break links']).slice(0,8), state:c.state==='INTRON'?'INTRON':'EXON', dominance:Number(c.dominance??0.5) }; }
function normalizeChild(raw){
  const ui = raw.childUI || raw.program || raw;
  return { title:String(ui.title||raw.title||'GENOMA Program Artifact'), summary:String(ui.summary||raw.summary||'Compiled from prompt genome.'), html:String(ui.html||'<main><h1>Empty artifact</h1></main>'), css:String(ui.css||''), diff:raw.diff||{}, fitness:raw.fitness||{}, nextPromptGenome:raw.nextPromptGenome||null };
}

function compactGenome(g){ if(!g) return {}; return { url:g.url,title:g.title,stats:g.stats,sections:(g.sections||[]).slice(0,24),links:(g.links||[]).slice(0,80),buttons:(g.buttons||[]).slice(0,80),forms:(g.forms||[]).slice(0,20),images:(g.images||[]).slice(0,50),anchors:(g.anchors||[]).slice(0,220) }; }
function buildPromptText(){
  return `GENOMA PROMPT GENOME\nDIRECTIVE: ${els.directive.value}\n\nPROMPT CODONS\n` + promptGenome.map(c=>`[${c.type}] ${c.title}\n${c.payload}\nControls: ${c.controls}\n`).join('\n') + `\nOPERATION CODE GENOME\n` + operationGenome.map(c=>`[${c.type}] ${c.label}\nControls: ${c.controls}\nAnchors: ${(c.anchors||[]).join(', ')}\n`).join('\n');
}
function buildFullHtml(child){ return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(child.title)}</title><style>${child.css||''}</style></head><body>${child.html||''}</body></html>`; }
async function copyPromptGenome(){ if(!promptGenome.length) return fail('Encode prompt genome first.'); await navigator.clipboard.writeText(buildPromptText()); setStage('PROMPT COPIED',2,4,'Prompt genome copied to clipboard.','done'); log('STATUS','Prompt genome copied.'); }
async function copyProgramHtml(){ if(!programArtifact) return fail('Compile program text first.'); await navigator.clipboard.writeText(buildFullHtml(programArtifact)); setStage('HTML COPIED',4,4,'Program artifact HTML copied.','done'); log('STATUS','Program HTML copied.'); }
function exportState(){ const blob=new Blob([JSON.stringify(exportPayload(),null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`genoma-compiler-v13-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function exportPayload(){ return {version:'v14',directive:els.directive.value,generation,site:siteGenome,promptGenome,operationGenome,fitnessBaseline,programArtifact,childFitness,lastRaw}; }

function setStage(state, step, total, event, mode='idle'){
  if(timer) clearInterval(timer);
  startedAt=Date.now();
  els.stateText.textContent=state; els.stepText.textContent=`${step} / ${total}`; els.lastEvent.textContent=event;
  els.progressFill.style.width=`${Math.max(0,Math.min(100,(step/total)*100))}%`;
  els.statusBlock.className=`statusBlock ${mode}`;
  document.body.classList.toggle('isBusy', mode === 'busy');
  els.btnOpenArtifact.classList.toggle('ready', !!programArtifact && mode !== 'busy');
  if(mode==='busy') timer=setInterval(()=>{
    const s=Math.floor((Date.now()-startedAt)/1000);
    els.elapsedText.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    if(s > 18 && s % 8 === 0) els.lastEvent.textContent = event + ' Still working…';
  },250);
  else els.elapsedText.textContent='00:00';
  renderModelLine(mode === 'busy' ? 'running' : mode === 'done' ? 'ready' : '');
}
async function pageHUD(title,message){ const mode = /READY|OPENED|COPIED/i.test(title) ? 'done' : /ERROR/i.test(title) ? 'error' : 'busy'; await send('SHOW_PAGE_STATUS',{title,message,mode}).catch(()=>{}); }
function fail(message){ setStage('ERROR',0,4,message,'error'); log('ERROR',message); send('SHOW_PAGE_STATUS',{title:'GENOMA ERROR',message,tone:'error'}).catch(()=>{}); }
function ensureModel(c){ if(!c.endpoint||!c.reasoningModel) throw new Error('Configure endpoint and reasoning model.'); if(c.provider!=='local'&&!c.apiKey) throw new Error(`${c.provider} API key required.`); }
function log(type,msg){ const row={type,msg:String(msg),time:new Date().toLocaleTimeString()}; debugRows.unshift(row); if(debugRows.length>160) debugRows.pop(); renderDebug(); }
function renderDebug(){ if(!els.debugLog) return; els.debugLog.innerHTML=debugRows.map(r=>`<div class="debugRow"><b class="${r.type}">${escapeHTML(r.type)}</b> ${escapeHTML(r.time)} · ${escapeHTML(r.msg)}</div>`).join('')||'<div class="debugRow">No debug rows.</div>'; }
async function copyDebug(){ await navigator.clipboard.writeText(debugRows.map(r=>`${r.type} ${r.time} · ${r.msg}`).join('\n')); }
function list(v){ if(Array.isArray(v)) return v.map(x=>String(x)); if(!v) return []; return [String(v)]; }
function escapeHTML(s){ return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
