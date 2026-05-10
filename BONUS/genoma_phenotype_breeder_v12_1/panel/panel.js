'use strict';

const DEFAULT_KERNEL = `<poml version="2.0">
  <meta>
    <title>PRIME PROMPT — THE OPERATIONAL PRAGMATIST</title>
    <intent>Transform abstract inputs into active scripts of rigorous, tactile operations.</intent>
  </meta>
  <system>
    <role>You are an Operational Pragmatist. Reject the Occult Fallacy. Meaning is use.</role>
    <epistemology>
      1. The message is the literal payload carried by the medium.
      2. Map inner/outer and first-order/second-order distinctions.
    </epistemology>
    <directive>Reconstruct the input into active operations. Every sentence must function like a slip of paper.</directive>
  </system>
  <design_constraints>
    <constraint type="contrast">Start in light mode. Force absolute black and white. Remove mid-tones.</constraint>
    <constraint type="interaction">Text operates as a physical control surface.</constraint>
    <constraint type="output">REFINE THE PROMPT, NOT THE CODE. Output structural logic, UI topography, and operational states.</constraint>
  </design_constraints>
</poml>`;

const els = {};
let config = null;
let debugRows = [];
let siteGenome = null;
let promptGenome = [];
let operationGenome = [];
let fitnessBaseline = null;
let childPhenotype = null;
let childFitness = null;
let currentTab = 'prompt';
let boundKind = 'prompt';
let boundId = '';
let generation = 0;
let lineage = [];
let busyTimer = null;
let busyStarted = 0;
let lastRaw = null;

init();

async function init() {
  collectEls();
  bindEvents();
  await loadConfig();
  els.kernel.value = localStorage.getItem('genoma_v12_kernel') || DEFAULT_KERNEL;
  setStage('IDLE', 0, 5, 'Configure model, encode prompt genome, then express a child UI.', 'idle');
  renderAll();
  log('STATUS', 'Loaded. The prompt genome is the main artifact. Whole-page patching is not the center.');
}

function collectEls() {
  for (const id of [
    'statusBlock','stateText','stepText','modelText','elapsedText','progressFill','lastEvent','btnConfig','btnDebug','directive',
    'btnEncode','btnExpress','btnOriginal','btnChild','btnDiff','btnUndo','tabPrompt','tabOperation','tabFitness','tabMeta','genomeCards',
    'boundMeta','boundCard','codonChat','btnMutateCodon','btnSelectNext','childMeta','childSummary','btnReinstall','btnClearChild','btnCopyPrompt','btnExport',
    'configDialog','provider','endpoint','reasoningModel','fastModel','apiKey','kernel','btnSaveConfig','btnTestReasoning',
    'debugDialog','debugLog','btnClearDebug','btnCopyDebug','jsonDialog','jsonView'
  ]) els[id] = document.getElementById(id);
}

function bindEvents() {
  els.btnConfig.addEventListener('click', () => els.configDialog.showModal());
  els.btnDebug.addEventListener('click', () => { renderDebug(); els.debugDialog.showModal(); });
  els.provider.addEventListener('change', applyProviderDefaults);
  els.btnSaveConfig.addEventListener('click', saveConfig);
  els.btnTestReasoning.addEventListener('click', testReasoningModel);
  els.btnEncode.addEventListener('click', encodePromptGenome);
  els.btnExpress.addEventListener('click', expressChildUI);
  els.btnOriginal.addEventListener('click', () => setPageMode('original'));
  els.btnChild.addEventListener('click', () => setPageMode('child'));
  els.btnDiff.addEventListener('click', () => setPageMode('diff'));
  els.btnUndo.addEventListener('click', clearChild);
  els.tabPrompt.addEventListener('click', () => setTab('prompt'));
  els.tabOperation.addEventListener('click', () => setTab('operation'));
  els.tabFitness.addEventListener('click', () => setTab('fitness'));
  els.btnMutateCodon.addEventListener('click', mutateBoundCodon);
  els.btnSelectNext.addEventListener('click', selectNextGeneration);
  els.btnReinstall.addEventListener('click', reinstallChild);
  els.btnClearChild.addEventListener('click', clearChild);
  els.btnCopyPrompt.addEventListener('click', copyPromptGenome);
  els.btnExport.addEventListener('click', downloadState);
  els.btnClearDebug.addEventListener('click', () => { debugRows = []; renderDebug(); });
  els.btnCopyDebug.addEventListener('click', copyDebug);
}

function send(type, payload = {}) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type, payload }, res => resolve(res || { error: chrome.runtime.lastError?.message || 'No response' })));
}

async function loadConfig() {
  const res = await send('GET_CONFIG');
  config = res.ok ? res.raw : formConfig();
  els.provider.value = config.provider || 'openai';
  els.endpoint.value = config.endpoint || 'https://api.openai.com/v1/responses';
  els.reasoningModel.value = config.reasoningModel || config.model || 'gpt-5.1';
  els.fastModel.value = config.fastModel || 'gpt-5.1';
  els.apiKey.value = config.apiKey || '';
  renderModelLine();
}

function formConfig() {
  return {
    provider: els.provider.value,
    endpoint: els.endpoint.value.trim(),
    reasoningModel: els.reasoningModel.value.trim(),
    fastModel: els.fastModel.value.trim(),
    apiKey: els.apiKey.value.trim()
  };
}

function renderModelLine(extra = '') {
  const cfg = formConfig();
  const missing = cfg.provider !== 'local' && !cfg.apiKey;
  const modelText = missing ? `${cfg.provider}: key needed` : `R:${cfg.reasoningModel || 'unset'} · F:${cfg.fastModel || 'unset'}`;
  els.modelText.textContent = modelText + (extra ? ` · ${extra}` : '');
  return !missing;
}

function applyProviderDefaults() {
  const d = {
    local: ['http://localhost:11434/v1/chat/completions','llama3.1','llama3.1'],
    openai: ['https://api.openai.com/v1/responses','gpt-5.1','gpt-5.1'],
    gemini: ['https://generativelanguage.googleapis.com/v1beta/models','gemini-2.5-flash','gemini-2.5-flash'],
    anthropic: ['https://api.anthropic.com/v1/messages','claude-sonnet-4-20250514','claude-sonnet-4-20250514']
  }[els.provider.value];
  els.endpoint.value = d[0];
  els.reasoningModel.value = d[1];
  els.fastModel.value = d[2];
  renderModelLine();
}

async function saveConfig() {
  config = formConfig();
  localStorage.setItem('genoma_v12_kernel', els.kernel.value);
  const res = await send('SAVE_CONFIG', { config });
  if (!res.ok) return fail(res.error || 'Config save failed');
  renderModelLine('saved');
  setStage('MODEL READY', 0, 5, `Saved ${config.provider}. Reasoning=${config.reasoningModel}; Fast=${config.fastModel}.`, 'done');
  log('STATUS', `Saved config: ${config.provider}; reasoning=${config.reasoningModel}; fast=${config.fastModel}`);
}

async function testReasoningModel() {
  try {
    config = formConfig();
    ensureModel(config);
    setStage('TESTING MODEL', 0, 5, 'Testing reasoning model call…', 'busy');
    log('SEND', `TEST_MODEL reasoning ${config.provider}/${config.reasoningModel}`);
    const res = await send('TEST_MODEL', { config, tier: 'reasoning' });
    if (!res.ok) throw new Error(res.error || 'Model test failed');
    setStage('MODEL READY', 0, 5, res.text || 'Model test succeeded.', 'done');
    log('RECV', res.text || 'Model OK');
  } catch(e) { fail(e.message || String(e)); }
}

async function encodePromptGenome() {
  try {
    config = formConfig();
    ensureModel(config);
    setStage('CAPTURING F0 PAGE', 1, 5, 'Reading actual page evidence and assigning stable anchors…', 'busy');
    log('SEND', 'CAPTURE_PAGE');
    const cap = await send('CAPTURE_PAGE');
    if (!cap.ok) throw new Error(cap.error || 'Capture failed');
    siteGenome = cap.genome;
    log('RECV', `Captured ${siteGenome?.stats?.anchors || 0} anchors from live page.`);

    setStage('ENCODING PROMPT GENOME', 2, 5, 'Reasoning model is converting the page into prompt infrastructure…', 'busy');
    log('SEND', 'ENCODE_PROMPT_GENOME_MODEL: evidence → prompt genome + operation genome');
    const res = await send('ENCODE_PROMPT_GENOME_MODEL', {
      directive: els.directive.value,
      kernel: els.kernel.value,
      genome: compactGenome(siteGenome),
      generation,
      config
    });
    if (!res.ok) throw new Error(res.error || 'Encoding failed');
    lastRaw = res.raw || res.encoded;
    const encoded = normalizeEncoded(res.encoded || {});
    promptGenome = encoded.promptGenome;
    operationGenome = encoded.operationGenome;
    fitnessBaseline = encoded.fitnessBaseline;
    boundKind = 'prompt';
    boundId = promptGenome[0]?.id || operationGenome[0]?.id || '';
    childPhenotype = null;
    childFitness = null;
    renderAll();
    setStage('PROMPT GENOME READY', 2, 5, `Encoded ${promptGenome.length} prompt codons and ${operationGenome.length} operation codons.`, 'done');
    log('RECV', `Prompt genome ${promptGenome.length}; operation genome ${operationGenome.length}.`);
  } catch(e) { fail(e.message || String(e)); }
}

async function expressChildUI() {
  try {
    config = formConfig();
    ensureModel(config);
    if (!promptGenome.length) await encodePromptGenome();
    if (!promptGenome.length) throw new Error('Prompt genome missing.');
    setStage('EXPRESSING CHILD UI', 3, 5, 'Reasoning model is breeding a child phenotype on top of the F0 page…', 'busy');
    log('SEND', `EXPRESS_CHILD_MODEL: generation ${generation + 1}`);
    const res = await send('EXPRESS_CHILD_MODEL', {
      directive: els.directive.value,
      kernel: els.kernel.value,
      promptGenome,
      operationGenome,
      fitnessBaseline,
      evidence: compactGenome(siteGenome),
      generation: generation + 1,
      config
    });
    if (!res.ok) throw new Error(res.error || 'Child expression failed');
    lastRaw = res.raw || res.child;
    childPhenotype = normalizeChild(res.child || {});
    childFitness = childPhenotype.fitness || res.child?.fitness || null;
    renderAll();

    setStage('INSTALLING CHILD LAYER', 4, 5, 'Installing child UI as reversible sibling overlay on actual page…', 'busy');
    const install = await send('INSTALL_CHILD_PHENOTYPE', { child: childPhenotype, mode: 'child' });
    if (!install.ok) throw new Error(install.error || 'Could not install child UI.');
    const installProof = install.result || {};
    setStage('CHILD UI LIVE ON PAGE', 5, 5, `LOOK AT THE WEBPAGE: child overlay installed · ${installProof.htmlLength || childPhenotype.html.length} html chars · mode ${installProof.mode || 'child'}.`, 'done');
    log('RECV', `Child installed. ${childPhenotype.title || 'Untitled phenotype'} · visible=${installProof.visible ?? true} · chars=${installProof.htmlLength || childPhenotype.html.length}`);
  } catch(e) { fail(e.message || String(e)); }
}

async function mutateBoundCodon() {
  try {
    const codon = getBoundCodon();
    if (!codon) throw new Error('Bind a prompt codon or operation codon first.');
    const message = els.codonChat.value.trim() || els.directive.value.trim();
    if (!message) throw new Error('Write a codon mutation instruction first.');
    config = formConfig();
    ensureModel(config);
    setStage('MUTATING CODON', 3, 5, `Fast model is mutating ${codon.title || codon.label || codon.id} only…`, 'busy');
    log('SEND', `MUTATE_CODON_MODEL: ${boundKind}/${codon.id}`);
    const res = await send('MUTATE_CODON_MODEL', { codon, kind: boundKind, message, kernel: els.kernel.value, config });
    if (!res.ok) throw new Error(res.error || 'Codon mutation failed');
    const updated = boundKind === 'prompt' ? normalizePromptCodon(res.codon || codon, promptGenome.length) : normalizeOperationCodon(res.codon || codon, operationGenome.length);
    if (boundKind === 'prompt') promptGenome = promptGenome.map(c => c.id === codon.id ? { ...c, ...updated, history: [...(c.history || []), { at: Date.now(), message, before: c.payload, after: updated.payload }] } : c);
    else operationGenome = operationGenome.map(c => c.id === codon.id ? { ...c, ...updated, history: [...(c.history || []), { at: Date.now(), message, before: c.payload || c.controls, after: updated.payload || updated.controls }] } : c);
    lastRaw = res.raw || updated;
    renderAll();
    setStage('CODON MUTATED', 3, 5, 'The visible codon payload changed. Express a new child to see the phenotype.', 'done');
    log('RECV', `Updated ${boundKind} codon ${updated.title || updated.label || updated.id}.`);
  } catch(e) { fail(e.message || String(e)); }
}

async function selectNextGeneration() {
  if (!childPhenotype) return fail('Express a child UI first.');
  generation += 1;
  lineage.push({ generation, selectedAt: Date.now(), directive: els.directive.value, promptGenome, operationGenome, childPhenotype, childFitness });
  if (Array.isArray(childPhenotype.nextPromptGenome?.codons)) {
    promptGenome = childPhenotype.nextPromptGenome.codons.map(normalizePromptCodon);
  }
  setStage(`GENERATION ${generation} SELECTED`, 5, 5, 'Child phenotype selected as next parent. Mutate the prompt genome or express again.', 'done');
  renderAll();
  log('STATUS', `Selected child as generation ${generation}.`);
}

async function setPageMode(mode) {
  try {
    const res = await send('SET_CHILD_MODE', { mode });
    if (!res.ok) throw new Error(res.error || 'View toggle failed');
    setStage(`VIEW: ${mode.toUpperCase()}`, childPhenotype ? 5 : 2, 5, `Page view set to ${mode}.`, 'done');
    log('STATUS', `View mode ${mode}.`);
  } catch(e) { fail(e.message || String(e)); }
}

async function reinstallChild() {
  try {
    if (!childPhenotype) throw new Error('No child UI expressed yet.');
    const res = await send('INSTALL_CHILD_PHENOTYPE', { child: childPhenotype, mode: 'child' });
    if (!res.ok) throw new Error(res.error || 'Reinstall failed');
    setStage('CHILD UI ACTIVE', 5, 5, 'Child overlay/sibling layer is visible.', 'done');
  } catch(e) { fail(e.message || String(e)); }
}

async function clearChild() {
  try {
    const res = await send('CLEAR_CHILD_PHENOTYPE');
    if (!res.ok) throw new Error(res.error || 'Clear failed');
    setStage('ORIGINAL RESTORED', childPhenotype ? 5 : 0, 5, 'Child layer cleared. Original page visible.', 'done');
    log('RECV', 'Child layer cleared.');
  } catch(e) { fail(e.message || String(e)); }
}

function setTab(tab) {
  currentTab = tab;
  els.tabPrompt.classList.toggle('active', tab === 'prompt');
  els.tabOperation.classList.toggle('active', tab === 'operation');
  els.tabFitness.classList.toggle('active', tab === 'fitness');
  renderDeck();
}

function renderAll() {
  renderModelLine();
  renderDeck();
  renderBound();
  renderChild();
}

function renderDeck() {
  const cards = currentTab === 'prompt' ? promptGenome : currentTab === 'operation' ? operationGenome : [];
  els.tabMeta.textContent = currentTab === 'prompt'
    ? `${promptGenome.length || 0} prompt codons · reusable instruction infrastructure`
    : currentTab === 'operation'
      ? `${operationGenome.length || 0} operation codons · selectors/leverage points/invariants`
      : 'F0 baseline vs child phenotype fitness';
  if (currentTab === 'fitness') return renderFitness();
  if (!cards.length) {
    els.genomeCards.className = 'genomeCards empty';
    els.genomeCards.textContent = currentTab === 'prompt' ? 'Encode the page into RSN / EVD / STY / FLR / MUT / SEL prompt codons.' : 'Operation code genome will appear here after encoding.';
    return;
  }
  els.genomeCards.className = 'genomeCards';
  els.genomeCards.innerHTML = cards.map(c => renderCodonCard(c, currentTab)).join('');
  els.genomeCards.querySelectorAll('.codonCard').forEach(card => {
    card.addEventListener('click', () => {
      boundKind = card.dataset.kind;
      boundId = card.dataset.id;
      renderAll();
    });
  });
}

function renderCodonCard(c, kind) {
  const isBound = boundKind === kind && boundId === c.id;
  const type = (c.type || 'COD').toUpperCase();
  const title = escapeHTML(c.title || c.label || c.id);
  const payload = escapeHTML(c.payload || c.controls || '');
  const meta = kind === 'prompt' ? escapeHTML(c.locus || 'prompt') : `${(c.anchors || []).length} anchors · ${escapeHTML(c.locus || 'operation')}`;
  return `<article class="codonCard ${isBound ? 'bound' : ''} ${c.history?.length ? 'mutated' : ''}" data-id="${escapeHTML(c.id)}" data-kind="${kind}">
    <div class="codonType ${type}">${escapeHTML(type)}</div>
    <div><div class="codonTitle">${title}</div><div class="codonPayload">${payload}</div><div class="codonMeta">${meta}</div></div>
    <div class="statePill ${c.state === 'INTRON' ? 'off' : ''}">${c.state || 'EXON'}</div>
  </article>`;
}

function renderBound() {
  const c = getBoundCodon();
  if (!c) {
    els.boundMeta.textContent = 'none';
    els.boundCard.className = 'boundCard empty';
    els.boundCard.textContent = 'Bind a codon from the deck.';
    return;
  }
  els.boundMeta.textContent = `${boundKind} · ${c.type || 'CODON'} · ${c.state || 'EXON'}`;
  els.boundCard.className = 'boundCard';
  if (boundKind === 'prompt') {
    els.boundCard.innerHTML = `<div class="boundTitle">${escapeHTML(c.title || c.id)}</div>
      <div class="boundLine"><b>Payload</b> ${escapeHTML(c.payload || '')}</div>
      <div class="boundLine"><b>Controls</b> ${escapeHTML(c.controls || c.locus || '')}</div>
      <div class="boundLine"><b>Cannot</b> ${escapeHTML(listText(c.forbiddenChanges || c.forbiddenMutations || []))}</div>`;
  } else {
    els.boundCard.innerHTML = `<div class="boundTitle">${escapeHTML(c.label || c.id)}</div>
      <div class="boundLine"><b>Controls</b> ${escapeHTML(c.controls || '')}</div>
      <div class="boundLine"><b>Anchors</b> ${(c.anchors || []).length}</div>
      <div class="boundLine"><b>Cannot</b> ${escapeHTML(listText(c.forbiddenMutations || []))}</div>`;
  }
}

function renderChild() {
  if (!childPhenotype) {
    els.childMeta.textContent = 'no child expressed';
    els.childSummary.className = 'childSummary';
    els.childSummary.textContent = 'Express a child UI. It will render as a reversible overlay/sibling layer on the actual page.';
    return;
  }
  els.childMeta.textContent = childPhenotype.title || 'child phenotype';
  const fit = childPhenotype.fitness || childFitness || {};
  els.childSummary.className = 'childSummary live';
  els.childSummary.innerHTML = `<div class="resultGood">${escapeHTML(childPhenotype.title || 'Child UI')}</div>
    <div>${escapeHTML(childPhenotype.summary || '')}</div>
    <span class="proofLine">PAGE PROOF: click CHILD or DIFF. The child is installed on the active webpage, not inside this panel.</span>
    <div class="pageProof">If you do not see it, press SHOW CHILD.</div>
    <div style="margin-top:5px">${['contentPreservation','operationPreservation','visualImprovement','steerability'].map(k => `<span class="childBadge">${k}: ${escapeHTML(String(fit[k] ?? '—'))}</span>`).join('')}</div>`;
}

function renderFitness() {
  els.genomeCards.className = 'genomeCards';
  const base = fitnessBaseline || {};
  const fit = childPhenotype?.fitness || {};
  if (!fitnessBaseline && !childPhenotype) {
    els.genomeCards.className = 'genomeCards empty';
    els.genomeCards.textContent = 'Fitness appears after encoding and child expression.';
    return;
  }
  els.genomeCards.innerHTML = `<div class="fitnessGrid">
    ${fitnessCell('F0 links', base.linkCount ?? siteGenome?.stats?.links ?? '—')}
    ${fitnessCell('F0 images', base.imageCount ?? siteGenome?.stats?.images ?? '—')}
    ${fitnessCell('Content preserve', fit.contentPreservation ?? '—')}
    ${fitnessCell('Operation preserve', fit.operationPreservation ?? '—')}
    ${fitnessCell('Visual improvement', fit.visualImprovement ?? '—')}
    ${fitnessCell('Steerability', fit.steerability ?? '—')}
  </div>
  <div class="childSummary"><b>Baseline:</b> ${escapeHTML(base.summary || 'F0 page is the default fitness target.')}<br><b>Diff:</b> ${escapeHTML(childPhenotype?.diffSummary || childPhenotype?.diff?.summary || 'No child diff yet.')}</div>`;
}

function fitnessCell(label, value) { return `<div class="fitnessCell"><span>${escapeHTML(label)}</span><b>${escapeHTML(String(value))}</b></div>`; }
function getBoundCodon() { return boundKind === 'prompt' ? promptGenome.find(c => c.id === boundId) : operationGenome.find(c => c.id === boundId); }

function setStage(state, step, total, event, mode = 'idle') {
  els.statusBlock.className = `statusBlock ${mode}`;
  els.stateText.textContent = state;
  els.stepText.textContent = `${step} / ${total}`;
  els.progressFill.style.width = `${Math.max(0, Math.min(100, (step / total) * 100))}%`;
  els.lastEvent.textContent = event;
  renderModelLine();
  send('SHOW_PAGE_STATUS', { state, step, total, event, mode }).catch?.(() => {});
  if (mode === 'busy') startElapsed(); else stopElapsed();
}
function startElapsed() { busyStarted = Date.now(); clearInterval(busyTimer); updateElapsed(); busyTimer = setInterval(updateElapsed, 500); }
function stopElapsed() { clearInterval(busyTimer); busyTimer = null; if (!busyStarted) els.elapsedText.textContent = '00:00'; }
function updateElapsed() { const n = Math.floor((Date.now() - busyStarted) / 1000); els.elapsedText.textContent = `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }

function normalizeEncoded(obj) {
  const pg = Array.isArray(obj.promptGenome?.codons) ? obj.promptGenome.codons : Array.isArray(obj.promptGenome) ? obj.promptGenome : Array.isArray(obj.promptCodons) ? obj.promptCodons : [];
  const og = Array.isArray(obj.operationGenome?.codons) ? obj.operationGenome.codons : Array.isArray(obj.operationGenome) ? obj.operationGenome : Array.isArray(obj.operatingCodons) ? obj.operatingCodons : [];
  return { promptGenome: pg.map(normalizePromptCodon).slice(0, 12), operationGenome: og.map(normalizeOperationCodon).slice(0, 12), fitnessBaseline: obj.fitnessBaseline || obj.baseline || {} };
}

function normalizePromptCodon(c, i = 0) {
  return {
    id: safeId(c.id || `${c.type || 'COD'}_${i}`),
    type: String(c.type || c.locus || 'CST').toUpperCase().slice(0, 6),
    title: String(c.title || c.label || `${c.type || 'Prompt'} Codon`).slice(0, 80),
    locus: String(c.locus || '').slice(0, 80),
    payload: String(c.payload || c.instruction || c.controls || '').slice(0, 1400),
    controls: String(c.controls || c.purpose || '').slice(0, 500),
    allowedChanges: list(c.allowedChanges || c.allowedMutations || ['payload mutation']).slice(0, 8),
    forbiddenChanges: list(c.forbiddenChanges || c.forbiddenMutations || ['break source fidelity']).slice(0, 8),
    state: c.state === 'INTRON' ? 'INTRON' : 'EXON',
    dominance: Number(c.dominance ?? 0.5),
    history: c.history || []
  };
}

function normalizeOperationCodon(c, i = 0) {
  return {
    id: safeId(c.id || `operation_${i}`),
    type: String(c.type || 'OPR').toUpperCase().slice(0, 6),
    label: String(c.label || c.title || `Operation Codon ${i + 1}`).slice(0, 80),
    locus: String(c.locus || 'operation').slice(0, 80),
    controls: String(c.controls || c.payload || '').slice(0, 700),
    payload: String(c.payload || c.controls || '').slice(0, 1000),
    anchors: Array.isArray(c.anchors) ? c.anchors.slice(0, 60) : [],
    allowedMutations: list(c.allowedMutations || ['overlay', 'style', 'labels']).slice(0, 8),
    forbiddenMutations: list(c.forbiddenMutations || ['delete', 'replace', 'break links/forms']).slice(0, 8),
    state: c.state === 'INTRON' ? 'INTRON' : 'EXON',
    dominance: Number(c.dominance ?? 0.5),
    history: c.history || []
  };
}

function normalizeChild(obj) {
  const child = obj.childUI ? obj : { childUI: obj };
  return {
    title: String(child.childUI?.title || child.title || 'Child Phenotype').slice(0, 120),
    summary: String(child.childUI?.summary || child.summary || '').slice(0, 1200),
    html: String(child.childUI?.html || child.html || '<section><h1>Child phenotype</h1></section>').slice(0, 30000),
    css: String(child.childUI?.css || child.css || '').slice(0, 20000),
    diff: child.diff || {},
    diffSummary: String(child.diff?.summary || child.diffSummary || '').slice(0, 1200),
    fitness: child.fitness || {},
    nextPromptGenome: child.nextPromptGenome || null,
    raw: obj
  };
}

function compactGenome(g) {
  if (!g) return null;
  return { specimen: g.specimen, stats: g.stats, programTheorySeed: g.programTheorySeed, visibleText: String(g.visibleText || '').slice(0, 5000), anchors: (g.anchors || []).slice(0, 160).map(a => ({ id:a.id, selector:a.selector, tag:a.tag, type:a.type, locus:a.locus, role:a.role, text:a.text, href:a.href, src:a.src, alt:a.alt, aria:a.aria, locked:a.locked, rect:a.rect, style:a.style })) };
}
function ensureModel(cfg) { if (!cfg.endpoint || !cfg.reasoningModel) throw new Error('Configure model endpoint and reasoning model first.'); if (cfg.provider !== 'local' && !cfg.apiKey) throw new Error(`${cfg.provider} API key required. Open MODEL.`); }
function safeId(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || `id_${Math.random().toString(36).slice(2,8)}`; }
function list(x) { return Array.isArray(x) ? x.map(v => String(v).slice(0, 160)) : [String(x || '').slice(0,160)].filter(Boolean); }
function listText(x) { return list(x).join('; '); }
function escapeHTML(s) { return String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }

function log(kind, text) { debugRows.unshift({ t: new Date().toLocaleTimeString(), kind, text: String(text || '') }); debugRows = debugRows.slice(0, 200); renderDebug(false); }
function renderDebug(open = true) { els.debugLog.innerHTML = debugRows.map(r => `<div class="logRow"><span class="logKind">${escapeHTML(r.kind)}</span>${escapeHTML(r.t)} · ${escapeHTML(r.text)}</div>`).join('') || 'No debug events.'; if (open && els.debugDialog.open) els.debugDialog.showModal(); }
function copyDebug() { navigator.clipboard?.writeText(debugRows.map(r => `${r.kind} ${r.t} · ${r.text}`).join('\n')); }
function fail(msg) { setStage('ERROR', 0, 5, msg, 'error'); log('ERROR', msg); }

function compiledPromptGenomeText() {
  const lines = [];
  lines.push('GENOMA PROMPT GENOME');
  lines.push('DIRECTIVE: ' + (els.directive.value || ''));
  lines.push('');
  lines.push('PROMPT CODONS');
  for (const c of promptGenome) {
    if ((c.state || 'EXON') === 'INTRON') continue;
    lines.push(`[${c.type}] ${c.title || c.id}`);
    lines.push(String(c.payload || '').trim());
    if (c.controls) lines.push('Controls: ' + c.controls);
    lines.push('');
  }
  lines.push('OPERATION CODE GENOME');
  for (const c of operationGenome) {
    if ((c.state || 'EXON') === 'INTRON') continue;
    lines.push(`[${c.type}] ${c.label || c.id}`);
    lines.push('Controls: ' + (c.controls || c.payload || ''));
    if (c.anchors?.length) lines.push('Anchors: ' + c.anchors.slice(0,12).join(', '));
    lines.push('');
  }
  return lines.join('\n');
}
function copyPromptGenome() {
  const text = compiledPromptGenomeText();
  navigator.clipboard?.writeText(text);
  setStage('PROMPT GENOME COPIED', promptGenome.length ? 2 : 0, 5, `${promptGenome.length} prompt codons copied as reusable prompt infrastructure.`, 'done');
  log('STATUS', 'Prompt genome copied to clipboard.');
}

function downloadState() { const state = { version: '12.1.0', generation, directive: els.directive.value, siteGenome: compactGenome(siteGenome), promptGenome, operationGenome, fitnessBaseline, childPhenotype, lineage }; const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `genoma-phenotype-breeder-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
