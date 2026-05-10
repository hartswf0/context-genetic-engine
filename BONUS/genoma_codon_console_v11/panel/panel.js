'use strict';

const DEFAULT_KERNEL = `<poml version="2.0">
  <meta>
    <title>PRIME PROMPT — THE OPERATIONAL PRAGMATIST</title>
    <intent>Transform abstract inputs into active scripts of rigorous, tactile operations.</intent>
  </meta>
  <system>
    <role>You are an Operational Pragmatist. You reject the Occult Fallacy. The meaning of a word is its USE in the language.</role>
    <epistemology>
      1. The message is the literal payload carried by the medium or channel.
      2. Maintain strict inner/outer and first-order/second-order distinctions.
    </epistemology>
    <directive>Do not summarize. Reconstruct the input into active operations. Every sentence must function like a slip of paper.</directive>
  </system>
  <design_constraints>
    <constraint type="contrast">Absolute black and white. Remove mid-tones. Maximize stark contrast.</constraint>
    <constraint type="depth">Reject glass morphism. Preserve information density.</constraint>
    <constraint type="spatial">Remove PREV/NEXT clutter. Maximize vertical space for the operating surface.</constraint>
    <constraint type="interaction">Text operates as a physical control surface. Clicking a codon binds that operating unit.</constraint>
    <constraint type="output">Refine the prompt and operational state. Generate patches only as selector-bound operations.</constraint>
  </design_constraints>
</poml>`;

const els = {};
let config = null;
let siteGenome = null;
let operatingCodons = [];
let boundId = '';
let pendingPatch = null;
let lastRaw = null;
let debugRows = [];

window.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEls();
  bindEvents();
  els.kernel.value = DEFAULT_KERNEL;
  await loadConfig();
  renderModelGate();
  log('STATUS', 'Loaded. Model is required. Configure provider, then Transcribe Page.');
}

function bindEls() {
  for (const id of ['modelGate','modelLine','btnOpenConfig','btnConfig','btnDebug','directive','btnTranscribe','btnEvolve','btnAnnotate','btnUndo','btnDownload','codonCards','mapMeta','boundMeta','boundCard','codonChat','btnMutateCodon','btnPlanCodon','resultMeta','resultSummary','btnApplyPlan','btnRejectPlan','btnInspectJson','configDialog','provider','model','endpoint','apiKey','kernel','btnSaveConfig','btnTestModel','debugDialog','debugLog','btnClearDebug','btnCopyDebug','jsonDialog','jsonView']) {
    els[id] = document.getElementById(id);
  }
}

function bindEvents() {
  els.btnOpenConfig.addEventListener('click', () => els.configDialog.showModal());
  els.btnConfig.addEventListener('click', () => els.configDialog.showModal());
  els.btnDebug.addEventListener('click', () => { renderDebug(); els.debugDialog.showModal(); });
  els.provider.addEventListener('change', applyProviderDefaults);
  els.btnSaveConfig.addEventListener('click', saveConfig);
  els.btnTestModel.addEventListener('click', testModel);
  els.btnTranscribe.addEventListener('click', transcribePage);
  els.btnEvolve.addEventListener('click', planWholePage);
  els.btnAnnotate.addEventListener('click', annotatePage);
  els.btnUndo.addEventListener('click', undoPatch);
  els.btnDownload.addEventListener('click', downloadState);
  els.btnMutateCodon.addEventListener('click', mutateBoundCodon);
  els.btnPlanCodon.addEventListener('click', planBoundCodon);
  els.btnApplyPlan.addEventListener('click', applyPendingPatch);
  els.btnRejectPlan.addEventListener('click', rejectPlan);
  els.btnInspectJson.addEventListener('click', () => inspectJSON(lastRaw || pendingPatch || currentState()));
  els.btnClearDebug.addEventListener('click', () => { debugRows = []; renderDebug(); });
  els.btnCopyDebug.addEventListener('click', copyDebug);
}

function send(type, payload = {}) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type, payload }, res => resolve(res || { error: chrome.runtime.lastError?.message || 'No response' })));
}

async function loadConfig() {
  const res = await send('GET_CONFIG');
  if (res.ok) {
    config = res.raw;
    els.provider.value = config.provider || 'openai';
    els.model.value = config.model || 'gpt-4o-mini';
    els.endpoint.value = config.endpoint || 'https://api.openai.com/v1/chat/completions';
    els.apiKey.value = config.apiKey || '';
  } else {
    config = formConfig();
  }
}

function formConfig() {
  return { provider: els.provider.value, model: els.model.value.trim(), endpoint: els.endpoint.value.trim(), apiKey: els.apiKey.value.trim() };
}

function renderModelGate(extra = '') {
  const cfg = formConfig();
  const missingKey = cfg.provider !== 'local' && !cfg.apiKey;
  els.modelGate.className = 'modelGate ' + (missingKey ? 'error' : 'ready');
  els.modelLine.textContent = missingKey ? `${cfg.provider}/${cfg.model || 'model'} needs API key` : `${cfg.provider}/${cfg.model || 'model'} ready${extra ? ' · ' + extra : ''}`;
}

function applyProviderDefaults() {
  const defaults = {
    local: ['llama3.1', 'http://localhost:11434/v1/chat/completions'],
    openai: ['gpt-4o-mini', 'https://api.openai.com/v1/chat/completions'],
    gemini: ['gemini-2.5-flash', 'https://generativelanguage.googleapis.com/v1beta/models'],
    anthropic: ['claude-sonnet-4-20250514', 'https://api.anthropic.com/v1/messages']
  }[els.provider.value] || ['gpt-4o-mini', 'https://api.openai.com/v1/chat/completions'];
  els.model.value = defaults[0];
  els.endpoint.value = defaults[1];
  renderModelGate();
}

async function saveConfig() {
  config = formConfig();
  const res = await send('SAVE_CONFIG', { config });
  if (!res.ok) return fail(res.error || 'Could not save config');
  renderModelGate('saved');
  log('STATUS', `Saved model config: ${config.provider}/${config.model}`);
}

async function testModel() {
  try {
    config = formConfig();
    renderModelGate('testing');
    log('SEND', `TEST_MODEL ${config.provider}/${config.model}`);
    const res = await send('TEST_MODEL', { config });
    if (!res.ok) throw new Error(res.error || 'Model test failed');
    renderModelGate('test ok');
    log('RECV', res.text || 'Model OK');
  } catch (e) { fail(e.message || String(e)); }
}

async function transcribePage() {
  try {
    config = formConfig();
    ensureModelConfig(config);
    setBusy('Capturing page evidence…');
    log('SEND', 'CAPTURE_PAGE');
    const cap = await send('CAPTURE_PAGE');
    if (!cap.ok) throw new Error(cap.error || 'Capture failed');
    siteGenome = cap.genome;
    log('RECV', `Captured ${siteGenome?.stats?.anchors || 0} anchors from live page.`);

    setBusy('LLM transcribing operating codons…');
    log('SEND', 'TRANSCRIBE_PAGE_MODEL: evidence packet → operating map');
    const res = await send('TRANSCRIBE_PAGE_MODEL', { genome: compactGenome(siteGenome), directive: els.directive.value, kernel: els.kernel.value, config });
    if (!res.ok) throw new Error(res.error || 'Transcription failed');
    lastRaw = res.raw || res.transcription;
    operatingCodons = normalizeOperatingCodons(res.transcription?.operatingCodons || res.transcription?.codons || [], siteGenome);
    boundId = operatingCodons[0]?.id || '';
    pendingPatch = null;
    renderAll();
    renderResult(null, 'Transcribed page into operating map.');
    renderModelGate('transcribed');
    log('RECV', `Operating map: ${operatingCodons.length} codons.`);
  } catch (e) { fail(e.message || String(e)); }
}

async function planWholePage() {
  try {
    config = formConfig();
    ensureModelConfig(config);
    if (!operatingCodons.length) await transcribePage();
    if (!operatingCodons.length) throw new Error('No codons produced.');
    setBusy('Planning whole-page patch…');
    const active = operatingCodons.filter(c => c.state !== 'INTRON');
    log('SEND', `PLAN_PATCH_MODEL: whole page with ${active.length} EXON codons`);
    const res = await send('PLAN_PATCH_MODEL', { mode: 'whole_page', directive: els.directive.value, codons: active, genome: compactGenome(siteGenome), kernel: els.kernel.value, config });
    if (!res.ok) throw new Error(res.error || 'Patch planning failed');
    pendingPatch = res.patch || { report: 'No patch returned.', operations: [] };
    lastRaw = res.raw || pendingPatch;
    renderResult(pendingPatch, 'Whole-page patch ready.');
    log('RECV', `Patch plan ready: ${(pendingPatch.operations || []).length} operations.`);
  } catch (e) { fail(e.message || String(e)); }
}

async function mutateBoundCodon() {
  try {
    const codon = getBoundCodon();
    if (!codon) throw new Error('Bind a codon first.');
    config = formConfig();
    ensureModelConfig(config);
    const message = els.codonChat.value.trim() || els.directive.value.trim();
    if (!message) throw new Error('Write a codon instruction first.');
    setBusy('Mutating bound codon…');
    log('SEND', `CHAT_CODON_MODEL: ${codon.id}`);
    const res = await send('CHAT_CODON_MODEL', { message, codon, kernel: els.kernel.value, config });
    if (!res.ok) throw new Error(res.error || 'Codon mutation failed');
    const updated = normalizeOneCodon(res.codon || codon, siteGenome, codon);
    operatingCodons = operatingCodons.map(c => c.id === codon.id ? updated : c);
    lastRaw = res.raw || updated;
    renderAll();
    renderResult(null, `Mutated codon: ${updated.label || updated.id}`);
    log('RECV', `Codon updated: ${updated.label || updated.id}`);
  } catch (e) { fail(e.message || String(e)); }
}

async function planBoundCodon() {
  try {
    const codon = getBoundCodon();
    if (!codon) throw new Error('Bind a codon first.');
    config = formConfig();
    ensureModelConfig(config);
    const directive = els.codonChat.value.trim() || els.directive.value.trim();
    setBusy('Planning bound-codon patch…');
    log('SEND', `PLAN_PATCH_MODEL: bound codon ${codon.id}`);
    const res = await send('PLAN_PATCH_MODEL', { mode: 'bound_codon', directive, codon, codons: [codon], genome: compactGenome(siteGenome), kernel: els.kernel.value, config });
    if (!res.ok) throw new Error(res.error || 'Patch planning failed');
    pendingPatch = res.patch || { report: 'No patch returned.', operations: [] };
    lastRaw = res.raw || pendingPatch;
    renderResult(pendingPatch, 'Bound-codon patch ready.');
    log('RECV', `Bound patch ready: ${(pendingPatch.operations || []).length} operations.`);
  } catch (e) { fail(e.message || String(e)); }
}

async function applyPendingPatch() {
  try {
    if (!pendingPatch?.operations?.length) throw new Error('No patch plan to apply.');
    setBusy('Applying patch to actual page…');
    log('SEND', `APPLY_PATCHES: ${pendingPatch.operations.length} operations`);
    const res = await send('APPLY_PATCHES', { operations: pendingPatch.operations });
    if (!res.ok) throw new Error(res.error || 'Apply failed');
    renderResult(pendingPatch, `Applied ${res.result?.applied || 0}; skipped ${res.result?.skipped || 0}. Undo available.`);
    log('RECV', `Applied ${res.result?.applied || 0}; skipped ${res.result?.skipped || 0}.`);
  } catch (e) { fail(e.message || String(e)); }
}

function rejectPlan() {
  pendingPatch = null;
  renderResult(null, 'Patch plan rejected.');
  log('STATUS', 'Rejected current patch plan.');
}

async function annotatePage() {
  try {
    if (!operatingCodons.length) throw new Error('Transcribe page first.');
    log('SEND', 'ANNOTATE_CODONS');
    const res = await send('ANNOTATE_CODONS', { codons: operatingCodons, boundId });
    if (!res.ok) throw new Error(res.error || 'Annotate failed');
    log('RECV', `Annotated ${res.result?.annotated || 0} actual elements.`);
  } catch (e) { fail(e.message || String(e)); }
}

async function undoPatch() {
  try {
    log('SEND', 'UNDO_PATCHES');
    const res = await send('UNDO_PATCHES');
    if (!res.ok) throw new Error(res.error || 'Undo failed');
    renderResult(null, `Restored ${res.result?.restored || 0} changed nodes.`);
    log('RECV', `Undo restored ${res.result?.restored || 0}.`);
  } catch (e) { fail(e.message || String(e)); }
}

function renderAll() {
  renderMap();
  renderBound();
}

function renderMap() {
  els.mapMeta.textContent = operatingCodons.length ? `${operatingCodons.length} operating codons` : 'No transcription yet.';
  if (!operatingCodons.length) {
    els.codonCards.className = 'codonCards empty';
    els.codonCards.textContent = 'Transcribe the live page. The LLM will compress the page into 8–12 controllable codons.';
    return;
  }
  els.codonCards.className = 'codonCards';
  els.codonCards.innerHTML = '';
  operatingCodons.forEach(c => {
    const card = document.createElement('article');
    card.className = `codonCard ${c.id === boundId ? 'bound' : ''}`;
    const anchors = (c.anchors || []).length;
    card.innerHTML = `<div class="codonType ${esc(c.type || 'TXT')}">${esc(c.type || 'COD')}</div><div><div class="codonTitle">${esc(c.label || c.id)}</div><div class="codonControls">${esc(c.controls || c.payload || '')}</div><div class="codonMeta">${esc(c.locus || 'site')} · ${anchors} anchors · ${esc((c.allowedMutations || []).slice(0,2).join(', '))}</div></div><div class="statePill ${c.state === 'INTRON' ? 'off' : ''}">${c.state || 'EXON'}</div>`;
    card.addEventListener('click', () => { boundId = c.id; renderAll(); annotatePage().catch(() => {}); });
    card.addEventListener('dblclick', () => { c.state = c.state === 'INTRON' ? 'EXON' : 'INTRON'; renderAll(); });
    els.codonCards.appendChild(card);
  });
}

function renderBound() {
  const c = getBoundCodon();
  if (!c) {
    els.boundMeta.textContent = 'none';
    els.boundCard.className = 'boundCard empty';
    els.boundCard.textContent = 'Bind a codon from the operating map.';
    return;
  }
  els.boundMeta.textContent = `${c.type || 'COD'} · ${c.locus || 'site'} · ${c.state || 'EXON'}`;
  els.boundCard.className = 'boundCard';
  els.boundCard.innerHTML = `<div class="boundTitle">${esc(c.label || c.id)}</div><div class="boundLine"><b>Controls</b> ${esc(c.controls || c.payload || '')}</div><div class="boundLine"><b>Can change</b> ${esc((c.allowedMutations || []).join(', ') || 'style, labels, affordance')}</div><div class="boundLine"><b>Cannot</b> ${esc((c.forbiddenMutations || []).join(', ') || 'break links/forms/buttons/content')}</div>`;
}

function renderResult(patch, message) {
  els.resultMeta.textContent = message || (patch ? 'patch ready' : 'no patch plan');
  if (!patch) {
    els.resultSummary.textContent = message || 'No plan yet.';
    els.btnApplyPlan.disabled = true;
    return;
  }
  const ops = patch.operations || [];
  const counts = ops.reduce((acc, op) => { acc[op.op] = (acc[op.op] || 0) + 1; return acc; }, {});
  els.resultSummary.innerHTML = `<div class="resultGood">${esc(message || 'Patch plan ready.')}</div><div>${esc(patch.report || '')}</div><div>${ops.length} operations · ${Object.entries(counts).map(([k,v]) => `${k}:${v}`).join(' · ')}</div>`;
  els.btnApplyPlan.disabled = !ops.length;
}

function getBoundCodon() { return operatingCodons.find(c => c.id === boundId) || null; }

function normalizeOperatingCodons(list, genome) {
  const allowed = new Set(['body', ...((genome?.anchors || []).map(a => a.selector).filter(Boolean))]);
  const fallbackAnchors = (genome?.anchors || []).slice(0, 12).map(a => a.selector);
  const clean = (Array.isArray(list) ? list : []).slice(0, 14).map((c, i) => normalizeOneCodon(c, genome, null, i, allowed, fallbackAnchors));
  if (clean.length) return clean;
  throw new Error('Model returned no operating codons. Try a stronger model or simpler directive.');
}

function normalizeOneCodon(c, genome, previous = null, index = 0, allowedSet = null, fallbackAnchors = null) {
  const allowed = allowedSet || new Set(['body', ...((genome?.anchors || []).map(a => a.selector).filter(Boolean))]);
  let anchors = Array.isArray(c.anchors) ? c.anchors : (c.selector ? [c.selector] : []);
  anchors = anchors.filter(s => allowed.has(s)).slice(0, 40);
  if (!anchors.length && previous?.anchors?.length) anchors = previous.anchors;
  if (!anchors.length) anchors = fallbackAnchors || (genome?.anchors || []).slice(0, 8).map(a => a.selector);
  return {
    id: String(previous?.id || c.id || `op_${index}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80),
    type: String(c.type || previous?.type || 'TXT').toUpperCase().slice(0, 8),
    label: String(c.label || c.name || previous?.label || `Codon ${index + 1}`).slice(0, 90),
    locus: String(c.locus || previous?.locus || 'site').slice(0, 80),
    controls: String(c.controls || c.payload || previous?.controls || '').slice(0, 600),
    payload: String(c.payload || c.controls || previous?.payload || '').slice(0, 1200),
    anchors,
    sourceEvidence: c.sourceEvidence || previous?.sourceEvidence || {},
    allowedMutations: arr(c.allowedMutations || previous?.allowedMutations || ['style', 'labels', 'affordance']),
    forbiddenMutations: arr(c.forbiddenMutations || previous?.forbiddenMutations || ['delete content', 'break links', 'replace containers']),
    state: c.state === 'INTRON' ? 'INTRON' : (previous?.state || 'EXON'),
    dominance: Number(c.dominance ?? previous?.dominance ?? 0.5),
    patchPolicy: String(c.patchPolicy || previous?.patchPolicy || 'safe selector-bound patch').slice(0, 200)
  };
}

function arr(x) { return Array.isArray(x) ? x.map(v => String(v).slice(0,120)).slice(0,8) : [String(x).slice(0,120)]; }

function compactGenome(genome) {
  if (!genome) return null;
  const anchors = (genome.anchors || []).slice(0, 180).map(a => ({ id:a.id, selector:a.selector, tag:a.tag, type:a.type, locus:a.locus, role:a.role, text:a.text, href:a.href, src:a.src, aria:a.aria, alt:a.alt, locked:a.locked, rect:a.rect, style:a.style, interactiveDescendants:a.interactiveDescendants, childCount:a.childCount }));
  return { schemaVersion: genome.schemaVersion, specimen: genome.specimen, stats: genome.stats, visibleText: String(genome.visibleText || '').slice(0, 8000), anchors };
}

function currentState() { return { config: { ...formConfig(), apiKey: formConfig().apiKey ? '[set]' : '' }, siteGenome: compactGenome(siteGenome), operatingCodons, boundId, pendingPatch }; }

function inspectJSON(obj) {
  els.jsonView.textContent = JSON.stringify(obj || {}, null, 2);
  els.jsonDialog.showModal();
}

function downloadState() {
  const blob = new Blob([JSON.stringify(currentState(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `genoma-codon-console-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function ensureModelConfig(cfg) {
  if (!cfg.model || !cfg.endpoint) throw new Error('Configure provider/model/endpoint first.');
  if (cfg.provider !== 'local' && !cfg.apiKey) throw new Error(`${cfg.provider} API key required. Open MODEL and paste a key.`);
}

function setBusy(text) { renderModelGate(text); }
function fail(text) { els.modelGate.className = 'modelGate error'; els.modelLine.textContent = text; log('ERROR', text); }
function log(kind, text) { const row = { kind, time: new Date().toLocaleTimeString(), text: String(text || '') }; debugRows.unshift(row); debugRows = debugRows.slice(0, 160); }
function renderDebug() { els.debugLog.innerHTML = debugRows.map(r => `<div class="logRow"><span class="logKind ${esc(r.kind)}">${esc(r.kind)}</span><span>${esc(r.time)} · ${esc(r.text)}</span></div>`).join('') || 'No events.'; }
function copyDebug() { navigator.clipboard?.writeText(debugRows.map(r => `${r.kind} ${r.time} · ${r.text}`).join('\n')).catch(() => {}); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
