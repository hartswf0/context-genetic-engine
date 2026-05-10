/**
 * DOM GENETICS ENGINE — PANEL CONTROLLER
 *
 * Theory-Code Mapping:
 * - <DOMGenome>        → genome object { id, sourceUrl, sourceTitle, timestamp, codons[] }
 * - <Codon>            → { locus, payload, weight, selector, state }
 * - <Lineage>          → chrome.storage.local (key: "genome:${timestamp}")
 * - <BreedingChamber>  → parentA, parentB state + PunnettEngine
 * - <Phenotype>        → lastPhenotype string (HTML)
 * - [extract]          → extractCurrentPage()
 * - [store]            → saveCurrentGenome()
 * - [cross]            → runPunnettCross()
 * - [express]          → runAIBreed()
 * - [annotate]         → toggleOverlay()
 */

'use strict';

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentGenome = null;       // <PromptGenome> currently edited and expressed
let rawPageGenome = null;       // <DOMGenome> extracted evidence used for page annotation
let lineage = {};               // All stored genomes from vault
let parentA = null;             // <DOMGenome> selected as Parent A
let parentB = null;             // <DOMGenome> selected as Parent B
let lastPhenotype = '';         // Last <Phenotype> HTML output
let lastFieldArtifact = '';     // Last direct genotype expression artifact
let phenotypeBlobUrl = '';
let fieldBlobUrl = '';
let imageEvidence = [];         // User supplied image files as field evidence
let overlayActive = false;      // Whether the DOM annotation overlay is on
let apiKey = '';                // Backwards-compatible shortcut for modelConfig.apiKey
let modelConfig = {
  provider: 'gemini',
  apiKey: '',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  model: 'gemini-2.5-flash'
};

// ─── LOCUS CONFIG ─────────────────────────────────────────────────────────────
const LOCUS_COLORS = {
  LAYOUT: '#60a5fa', COLOR: '#f472b6', TYPOGRAPHY: '#a78bfa',
  SPACING: '#4ade80', COMPONENT: '#fbbf24', INTERACTION: '#f87171',
  COPY: '#1cb0c6', RADIUS: '#fb923c',
  RSN: '#60a5fa', EVD: '#4ade80', OUT: '#f0f0f0',
  STY: '#a78bfa', FLR: '#f87171', FIT: '#c084fc',
  MUT: '#f472b6', SEL: '#fbbf24', CST: '#e5e7eb', CMT: '#888'
};

const PROMPT_LOCI = ['RSN', 'EVD', 'OUT', 'FLR', 'FIT', 'CST', 'CMT'];

const GENOTYPE_TRANSCRIPTION_PROMPT = `TRANSCRIBE GENOTYPE.
Read the Environmental Medium as source material, not as the final genotype.
Extract compact, token-dense operational prompt codons mapped only to these loci:
1. RSN: Reasoning Order
2. EVD: Evidence Policy
3. OUT: Output Form
4. FLR: Failure Handling
5. FIT: Fitness Pressure / Optimization target
6. CST: Custom explicit trait/constraint

DOM observations such as layout, color, typography, components, interaction, copy, and radius are evidence. Convert them into useful prompt controls.
Input is a CGE-EVIDENCE-PACKET JSON object. Treat it as a compressed essence format for a large page/codebase: landmarks and rankedSelectors are structural targets; components are manipulable UI primitives; textBlocks are copy intent; domAlleles are trait summaries.
Rules:
- Payloads must be dense imperative instructions, not summaries.
- Preserve concrete evidence values when useful: colors, fonts, spacing, component counts, copy signals.
- Attach a practical selector to each codon when a selector exists in rankedSelectors or components.
- Avoid vague words such as beautiful, nice, improve, modern unless tied to an observable constraint.
- Weight must be 0-100.
Output JSON only: an array of objects with { "type": "RSN|EVD|OUT|FLR|FIT|CST", "payload": "specific instruction text", "selector": "CSS selector or empty string", "state": "EXON", "weight": integer }.`;

const PROVIDER_DEFAULTS = {
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.5-flash',
    keyPlaceholder: 'Gemini API key'
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    keyPlaceholder: 'OpenAI API key'
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-20250514',
    keyPlaceholder: 'Anthropic API key'
  },
  local: {
    endpoint: 'http://localhost:11434/v1/chat/completions',
    model: 'llama3.1',
    keyPlaceholder: 'Blank for local'
  }
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  bindUI();
  await loadLineage();
  await loadModelConfig();
  await refreshCurrentTabInfo();
});

function bindUI() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('btn-extract')?.addEventListener('click', extractCurrentPage);
  document.getElementById('btn-overlay')?.addEventListener('click', toggleOverlay);
  document.getElementById('btn-save')?.addEventListener('click', saveCurrentGenome);
  document.getElementById('btn-load-genome')?.addEventListener('click', () => {
    renderGenomeEditor();
    switchTab('genome');
  });
  document.getElementById('btn-ai-encode')?.addEventListener('click', aiEncodeCurrentContext);
  document.getElementById('btn-adopt-panel')?.addEventListener('click', adoptPageGeneticsIntoPanel);
  document.getElementById('btn-apply-page-genetics')?.addEventListener('click', applyPageGeneticsToActiveTab);
  document.getElementById('btn-refresh-lineage')?.addEventListener('click', loadLineage);
  document.getElementById('btn-goto-breed')?.addEventListener('click', () => switchTab('breed'));
  document.getElementById('slot-a')?.addEventListener('click', () => switchTab('lineage'));
  document.getElementById('slot-b')?.addEventListener('click', () => switchTab('lineage'));
  document.getElementById('btn-punnett')?.addEventListener('click', runPunnettCross);
  document.getElementById('btn-ai-breed')?.addEventListener('click', runAIBreed);
  document.getElementById('btn-save-phenotype')?.addEventListener('click', savePhenotypeAsGenome);
  document.getElementById('btn-pheno-source')?.addEventListener('click', showPhenoSource);
  document.getElementById('btn-pheno-render')?.addEventListener('click', showPhenoRender);
  document.getElementById('btn-pheno-copy')?.addEventListener('click', copyPhenotype);
  document.getElementById('btn-pheno-dl')?.addEventListener('click', downloadPhenotype);
  document.getElementById('btn-save-key')?.addEventListener('click', saveModelConfig);
  document.getElementById('btn-api-reveal')?.addEventListener('click', toggleApiReveal);
  document.getElementById('btn-export-lineage')?.addEventListener('click', exportAllLineage);
  document.getElementById('btn-clear-lineage')?.addEventListener('click', clearAllLineage);
  document.getElementById('provider-select')?.addEventListener('change', updateProviderDefaults);
  document.getElementById('btn-genome-chat')?.addEventListener('click', askActiveGenome);
  document.getElementById('btn-use-current-page')?.addEventListener('click', useCurrentPageAsField);
  document.getElementById('btn-express-field')?.addEventListener('click', expressFieldArtifact);
  document.getElementById('btn-artifact-source')?.addEventListener('click', showArtifactSource);
  document.getElementById('btn-artifact-render')?.addEventListener('click', showArtifactRender);
  document.getElementById('btn-artifact-copy')?.addEventListener('click', copyFieldArtifact);
  document.getElementById('btn-artifact-dl')?.addEventListener('click', downloadFieldArtifact);
  document.getElementById('image-evidence-input')?.addEventListener('change', handleImageEvidenceUpload);
  document.querySelectorAll('.btn-add-codon').forEach(btn => {
    btn.addEventListener('click', () => addCodon(btn.dataset.type, btn.dataset.payload || ''));
  });

  document.getElementById('lineage-container')?.addEventListener('click', handleLineageClick);
  document.getElementById('offspring-container')?.addEventListener('click', handleOffspringClick);
  document.getElementById('genotype-container')?.addEventListener('click', handleGenotypeClick);
  document.getElementById('genotype-container')?.addEventListener('input', handleGenotypeInput);
}

// ─── STATUS HELPERS ───────────────────────────────────────────────────────────
function setStatus(text, state = 'idle') {
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('status-text');
  dot.className = 'status-dot ' + { idle: '', ok: 'ok', err: 'err', work: 'work' }[state];
  label.className = 'status-text ' + { idle: '', ok: 'ok', err: 'err', work: 'work' }[state];
  label.textContent = text;
  if (text && text !== 'READY') appendRunLog(text, state);
}

function appendRunLog(text, state = 'idle') {
  const log = document.getElementById('run-log');
  if (!log) return;
  const row = document.createElement('div');
  row.className = `diag-entry ${state || 'idle'}`;
  const time = document.createElement('span');
  time.className = 'diag-time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msg = document.createElement('span');
  msg.textContent = text;
  row.append(time, msg);
  log.prepend(row);
  while (log.children.length > 12) log.lastElementChild?.remove();
}

function setPipelineStep(id, state, label) {
  const step = document.getElementById(id);
  const stateEl = document.getElementById(`${id}-state`);
  if (!step || !stateEl) return;
  step.classList.remove('ready', 'work');
  if (state === 'ready' || state === 'work') step.classList.add(state);
  stateEl.textContent = label || state || 'waiting';
}

function updateEncodingChip(key, label, state = '') {
  const chip = document.getElementById(`enc-${key}`);
  if (!chip) return;
  chip.classList.remove('ready', 'work', 'err', 'on');
  if (state) chip.classList.add(state);
  chip.textContent = label;
}

// ─── TAB ROUTING ─────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name)?.classList.add('active');
  document.getElementById('panel-' + name)?.classList.add('active');
  if (name === 'lineage') loadLineage();
  if (name === 'genome') renderGenomeEditor();
  if (name === 'field') renderCompiledPrompt();
  if (name === 'extract') refreshCurrentTabInfo();
}

// ─── CURRENT TAB INFO ─────────────────────────────────────────────────────────
async function refreshCurrentTabInfo() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) return;
    const tab = tabs[0];
    let host = tab.url || '';
    try { host = new URL(tab.url).hostname || tab.url; } catch (e) {}
    document.getElementById('current-tab-url').textContent = host;

    const info = document.getElementById('current-page-info');
    info.textContent = '';
    const title = document.createElement('b');
    title.textContent = tab.title || 'Untitled';
    const url = document.createElement('div');
    url.className = 'tab-url-line';
    url.textContent = tab.url || 'No URL';
    info.append(title, document.createElement('br'), url);
  } catch (e) {
    setStatus('TAB INFO UNAVAILABLE', 'err');
  }
}

// ─── MODEL CONFIG ─────────────────────────────────────────────────────────────
async function loadModelConfig() {
  const result = await chrome.storage.local.get(['model_config', 'api_key']);
  modelConfig = normalizeModelConfig({
    ...(result.model_config || {}),
    apiKey: result.model_config?.apiKey || result.api_key || ''
  });
  apiKey = modelConfig.apiKey;
  renderModelConfig();
}

function saveModelConfig() {
  modelConfig = getModelConfigFromForm();
  apiKey = modelConfig.apiKey;

  chrome.runtime.sendMessage({ type: 'SAVE_MODEL_CONFIG', payload: { config: modelConfig } }, () => {
    updateEncodingChip('provider', modelConfig.provider.toUpperCase(), modelConfig.provider === 'local' || modelConfig.apiKey ? 'ready' : 'err');
    setStatus('MODEL CONFIG SAVED', 'ok');
    setTimeout(() => setStatus('READY'), 2000);
  });
}

function normalizeModelConfig(config = {}) {
  const provider = PROVIDER_DEFAULTS[config.provider] ? config.provider : 'gemini';
  const defaults = PROVIDER_DEFAULTS[provider];

  return {
    provider,
    apiKey: String(config.apiKey || config.api_key || '').trim(),
    endpoint: String(config.endpoint || defaults.endpoint).trim(),
    model: String(config.model || defaults.model).trim()
  };
}

function getModelConfigFromForm() {
  const provider = document.getElementById('provider-select')?.value || 'gemini';
  const defaults = PROVIDER_DEFAULTS[provider];
  return normalizeModelConfig({
    provider,
    apiKey: document.getElementById('api-key-input')?.value || '',
    endpoint: document.getElementById('endpoint-input')?.value || defaults.endpoint,
    model: document.getElementById('model-input')?.value || defaults.model
  });
}

function renderModelConfig() {
  document.getElementById('provider-select').value = modelConfig.provider;
  document.getElementById('model-input').value = modelConfig.model;
  document.getElementById('endpoint-input').value = modelConfig.endpoint;
  document.getElementById('api-key-input').value = modelConfig.apiKey;
  updateProviderPlaceholders();
  updateEncodingChip('provider', modelConfig.provider.toUpperCase(), modelConfig.provider === 'local' || modelConfig.apiKey ? 'ready' : 'err');
}

function updateProviderDefaults() {
  const provider = document.getElementById('provider-select')?.value || 'gemini';
  const defaults = PROVIDER_DEFAULTS[provider];
  document.getElementById('model-input').value = defaults.model;
  document.getElementById('endpoint-input').value = defaults.endpoint;
  updateProviderPlaceholders();
  updateEncodingChip('provider', provider.toUpperCase(), provider === 'local' ? 'ready' : 'err');
}

function updateProviderPlaceholders() {
  const provider = document.getElementById('provider-select')?.value || 'gemini';
  const defaults = PROVIDER_DEFAULTS[provider];
  document.getElementById('api-key-input').placeholder = defaults.keyPlaceholder;
  document.getElementById('endpoint-input').placeholder = defaults.endpoint;
  document.getElementById('model-input').placeholder = defaults.model;
}

function toggleApiReveal() {
  const input = document.getElementById('api-key-input');
  const btn = document.querySelector('.api-reveal');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'HIDE';
  } else {
    input.type = 'password';
    btn.textContent = 'SHOW';
  }
}

// ─── EXTRACT ──────────────────────────────────────────────────────────────────
// Theory: [extract] operation — calls background to run extractDOMGenome in tab context
async function extractCurrentPage() {
  setStatus('SCANNING DOM ALLELES...', 'work');
  updateEncodingChip('dom', 'DOM SCAN', 'work');
  updateEncodingChip('local', 'LOCAL WAIT', '');
  updateEncodingChip('llm', 'LLM OFF', '');
  setPipelineStep('pipe-dom', 'work', 'scanning');
  setPipelineStep('pipe-local', '', 'waiting');
  setPipelineStep('pipe-ai', '', 'optional');
  setBtn('btn-extract', true);
  document.getElementById('extract-empty').style.display = 'none';

  chrome.runtime.sendMessage({ type: 'EXTRACT_PAGE' }, (response) => {
    setBtn('btn-extract', false);

    if (!response || response.error) {
      setStatus(`DOM SCAN FAILED: ${response?.error || 'CSP OR TAB BLOCKED'}`, 'err');
      updateEncodingChip('dom', 'DOM FAIL', 'err');
      setPipelineStep('pipe-dom', '', 'failed');
      document.getElementById('extract-empty').style.display = 'block';
      document.getElementById('extract-empty').querySelector('.empty-desc').textContent =
        response?.error || 'Content Security Policy blocked extraction on this page.';
      return;
    }

    const rawGenome = normalizeGenome(response.genome);
    rawPageGenome = rawGenome;
    currentGenome = transcribeDomGenome(rawGenome);
    renderExtractedCodons(rawGenome);
    renderGenomeEditor();
    setBtn('btn-overlay', false);
    setBtn('btn-save', false);
    setBtn('btn-load-genome', false);
    setBtn('btn-ai-encode', false);
    setBtn('btn-adopt-panel', false);
    setBtn('btn-apply-page-genetics', false);
    setPipelineStep('pipe-dom', 'ready', `${rawGenome.codons.length} alleles`);
    setPipelineStep('pipe-local', 'ready', `${currentGenome.codons.length} codons`);
    updateEncodingChip('dom', `DOM ${rawGenome.codons.length}`, 'ready');
    updateEncodingChip('local', `LOCAL ${currentGenome.codons.length}`, 'ready');
    setStatus(`SCANNED ${rawGenome.codons.length} DOM ALLELES; LOCAL PROMPT GENOME READY`, 'ok');
    document.getElementById('count-extract').textContent = rawGenome.codons.length;
    updateGenomeCount();
    refreshOverlayIfActive();
    setTimeout(() => setStatus('READY'), 3000);
  });
}

function renderExtractedCodons(genome) {
  const section = document.getElementById('extracted-codons-section');
  const container = document.getElementById('extracted-codons-container');
  section.style.display = 'block';
  document.getElementById('codon-count-badge').textContent = `(${genome.codons.length} loci)`;

  container.innerHTML = '';
  if (genome.evidencePacket?.stats) {
    const stats = genome.evidencePacket.stats;
    const packet = document.createElement('div');
    packet.className = 'codon-row';
    packet.innerHTML = `
      <div class="codon-header">
        <span class="codon-locus" style="color:var(--exon)">EVIDENCE PACKET</span>
        <span class="codon-weight">${genome.evidencePacket.protocol || 'CGE'}</span>
      </div>
      <div class="codon-payload">elements:${stats.elements} buttons:${stats.buttons} links:${stats.links} inputs:${stats.inputs} media:${stats.media} words:${stats.words} selectors:${genome.evidencePacket.rankedSelectors?.length || 0}</div>
    `;
    container.appendChild(packet);
  }
  genome.codons.forEach(codon => {
    const color = LOCUS_COLORS[codon.locus] || '#fff';
    const div = document.createElement('div');
    div.className = 'codon-row';
    div.innerHTML = `
      <div class="codon-header">
        <span class="codon-locus" style="color:${color}">${codon.locus}</span>
        <span class="codon-weight">W:${codon.weight}</span>
      </div>
      <div class="codon-payload">${escHtml(codon.payload)}</div>
    `;
    container.appendChild(div);
  });
}

// ─── ACTIVE GENOTYPE ──────────────────────────────────────────────────────────
function normalizeGenome(genome = {}) {
  const codons = Array.isArray(genome.codons) ? genome.codons : [];
  return {
    id: genome.id || makeId(),
    sourceUrl: genome.sourceUrl || 'manual://genotype',
    sourceTitle: genome.sourceTitle || 'Manual Genotype',
    timestamp: genome.timestamp || Date.now(),
    synthetic: Boolean(genome.synthetic),
    evidencePacket: genome.evidencePacket || null,
    rawCodons: Array.isArray(genome.rawCodons) ? genome.rawCodons.map(normalizeCodon) : [],
    codons: codons.map(normalizeCodon)
  };
}

function transcribeDomGenome(rawGenome) {
  const byType = {};
  rawGenome.codons.forEach(c => { byType[c.type] = c.payload; });
  const sourceTitle = rawGenome.sourceTitle || 'extracted page';
  const observed = rawGenome.codons.map(c => `[${c.type}] ${c.payload}`).join('\n');

  return normalizeGenome({
    id: rawGenome.id,
    sourceUrl: rawGenome.sourceUrl,
    sourceTitle,
    timestamp: Date.now(),
    rawCodons: rawGenome.codons,
    evidencePacket: rawGenome.evidencePacket || null,
    codons: [
      { type: 'RSN', selector: 'main, body', weight: 92, payload: `Reason from "${sourceTitle}" in order: layout skeleton -> component affordances -> interaction behavior -> copy intent -> visual constraints; keep observed DOM facts separate from transformation choices.` },
      { type: 'EVD', selector: 'body', weight: 90, payload: `Use the scanned DOM alleles as the evidence pack; cite concrete values before changing them. Evidence:\n${truncateText(observed, 1800)}` },
      { type: 'OUT', selector: 'main, section, article', weight: 86, payload: 'Return an inspectable artifact with source/render modes, explicit controls, empty/error states, and enough structure that a user can test the transformation immediately.' },
      { type: 'FLR', selector: 'form, input, button, [role="button"]', weight: 78, payload: 'When extraction, provider, CSP, or rendering fails, name the blocked layer, preserve the last valid genome, and output the closest usable prompt/artifact instead of silently failing.' },
      { type: 'FIT', selector: 'button, a[href], [role="button"], form, [class*="card"]', weight: 88, payload: `Optimize for faithful transduction from page evidence into usable UI controls; preserve dominant components and interaction signals. Component evidence: ${byType.COMPONENT || 'not observed'}. Interaction evidence: ${byType.INTERACTION || 'not observed'}.` },
      { type: 'CST', selector: 'h1,h2,h3,button,input,[class*="card"]', weight: 74, payload: `Style constraints are evidence, not destiny: map color/type/radius into deliberate choices. Style evidence: ${[byType.COLOR, byType.TYPOGRAPHY, byType.RADIUS].filter(Boolean).join(' ')}` }
    ].map(c => ({ ...c, state: 'EXON' }))
  });
}

function normalizeCodon(codon = {}) {
  const type = codon.type || codon.locus || 'CST';
  const state = codon.state || (codon.active === false ? 'INTRON' : 'EXON');
  return {
    id: codon.id || makeId(),
    type,
    locus: codon.locus || type,
    payload: codon.payload || '',
    weight: normalizeWeight(codon.weight),
    selector: codon.selector || '',
    state,
    active: state !== 'INTRON'
  };
}

function ensureActiveGenome() {
  if (!currentGenome) {
    currentGenome = normalizeGenome({
      sourceTitle: 'Manual Genotype',
      sourceUrl: 'manual://genotype',
      codons: []
    });
  }
  currentGenome = normalizeGenome(currentGenome);
  return currentGenome;
}

function renderGenomeEditor() {
  const container = document.getElementById('genotype-container');
  if (!container) return;

  const genome = ensureActiveGenome();
  updateGenomeCount();
  renderCompiledPrompt();

  if (!genome.codons.length) {
    container.innerHTML = `
      <div class="empty-state">
        <img class="empty-icon-img" src="../icons/icon48.png" alt="">
        <div class="empty-title">No Active Codons</div>
        <div class="empty-desc">Extract a page or add manual codons to build the active genotype.</div>
      </div>`;
    return;
  }

  container.innerHTML = '';
  genome.codons.forEach((codon, index) => {
    const color = LOCUS_COLORS[codon.type] || LOCUS_COLORS[codon.locus] || '#f0f0f0';
    const row = document.createElement('div');
    row.className = `codon-row ${codon.state === 'INTRON' ? 'intron' : ''}`;
    row.innerHTML = `
      <div class="codon-header">
        <span class="codon-locus" style="color:${color}">${escHtml(codon.type)}</span>
        <div class="codon-tools">
          <input class="weight-input js-codon-weight" data-index="${index}" type="number" min="0" max="100" value="${codon.weight}">
          <button class="pheno-btn js-codon-up" data-index="${index}">UP</button>
          <button class="pheno-btn js-codon-down" data-index="${index}">DN</button>
          <button class="pheno-btn js-codon-toggle" data-index="${index}">${codon.state}</button>
          <button class="pheno-btn js-codon-delete" data-index="${index}">DEL</button>
        </div>
      </div>
      <textarea class="codon-edit js-codon-payload" data-index="${index}" placeholder="Codon payload...">${escHtml(codon.payload)}</textarea>
      <div class="codon-chat-row">
        <input class="codon-chat-input js-codon-chat-input" data-index="${index}" placeholder="Ask or mutate this codon...">
        <button class="pheno-btn js-codon-chat" data-index="${index}">ASK</button>
        <button class="pheno-btn js-codon-mutate" data-index="${index}">MUTATE</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function handleGenotypeClick(event) {
  const btn = event.target.closest('button');
  if (!btn || !currentGenome) return;
  const index = parseInt(btn.dataset.index, 10);
  if (!Number.isInteger(index)) return;

  if (btn.classList.contains('js-codon-toggle')) {
    const codon = currentGenome.codons[index];
    codon.state = codon.state === 'INTRON' ? 'EXON' : 'INTRON';
    codon.active = codon.state !== 'INTRON';
  }
  if (btn.classList.contains('js-codon-delete')) {
    currentGenome.codons.splice(index, 1);
  }
  if (btn.classList.contains('js-codon-up') && index > 0) {
    [currentGenome.codons[index - 1], currentGenome.codons[index]] = [currentGenome.codons[index], currentGenome.codons[index - 1]];
  }
  if (btn.classList.contains('js-codon-down') && index < currentGenome.codons.length - 1) {
    [currentGenome.codons[index + 1], currentGenome.codons[index]] = [currentGenome.codons[index], currentGenome.codons[index + 1]];
  }
  if (btn.classList.contains('js-codon-chat')) {
    askCodon(index);
    return;
  }
  if (btn.classList.contains('js-codon-mutate')) {
    mutateCodon(index);
    return;
  }

  renderGenomeEditor();
}

function handleGenotypeInput(event) {
  if (!currentGenome) return;
  const index = parseInt(event.target.dataset.index, 10);
  if (!Number.isInteger(index) || !currentGenome.codons[index]) return;

  if (event.target.classList.contains('js-codon-payload')) {
    currentGenome.codons[index].payload = event.target.value;
  }
  if (event.target.classList.contains('js-codon-weight')) {
    currentGenome.codons[index].weight = Math.max(0, Math.min(100, Number(event.target.value || 0)));
  }
  renderCompiledPrompt();
}

function addCodon(type, payload) {
  const genome = ensureActiveGenome();
  genome.codons.push(normalizeCodon({ type, locus: type, payload, weight: 70, state: 'EXON' }));
  renderGenomeEditor();
  switchTab('genome');
}

function activeCodons() {
  return (currentGenome?.codons || []).filter(c => c.state !== 'INTRON' && c.active !== false);
}

function compileActiveGenome() {
  const genome = ensureActiveGenome();
  const exons = activeCodons();
  if (!exons.length) return 'You are a helpful assistant. No active EXON codons are loaded.';

  return [
    'You are the Context Genetics Engine.',
    'Apply the active genotype as strict operational instructions.',
    `SOURCE_TITLE: ${genome.sourceTitle || 'Unknown'}`,
    `SOURCE_URL: ${genome.sourceUrl || 'Unknown'}`,
    '',
    'ACTIVE EXON CODONS:',
    ...exons.map((c, index) => `${String(index + 1).padStart(2, '0')}. [${c.type}] W:${c.weight} ${c.payload}`),
    ...(imageEvidence.length ? [
      '',
      'IMAGE EVIDENCE:',
      ...imageEvidence.map((img, index) => `${String(index + 1).padStart(2, '0')}. ${img.name} (${img.type || 'image'}, ${img.sizeLabel})`)
    ] : []),
    '',
    'INVARIANTS:',
    '- Preserve source fidelity unless the field task explicitly asks for transformation.',
    '- Treat codons as controls, not decorative labels.',
    '- Produce a usable completion artifact, not a loose explanation.'
  ].join('\n');
}

function renderCompiledPrompt() {
  const el = document.getElementById('compiled-prompt');
  if (el) el.textContent = compileActiveGenome();
}

function updateGenomeCount() {
  const el = document.getElementById('count-genome');
  if (el) el.textContent = String(currentGenome?.codons?.length || 0);
}

async function aiEncodeCurrentContext() {
  if (!currentGenome) return;
  const activeConfig = getModelConfigFromForm();
  if (activeConfig.provider !== 'local' && !activeConfig.apiKey) {
    setPipelineStep('pipe-ai', '', 'needs key');
    updateEncodingChip('llm', 'LLM KEY?', 'err');
    setStatus('LLM ENCODE BLOCKED: API KEY REQUIRED; LOCAL TRANSCRIPT STILL ACTIVE', 'err');
    setTimeout(() => setStatus('READY'), 3000);
    return;
  }

  const encodingPacket = buildEncodingPacket();
  const prompt = [
    `SOURCE_TITLE: ${currentGenome.sourceTitle}`,
    `SOURCE_URL: ${currentGenome.sourceUrl}`,
    '',
    'RELIABLE_ENCODING_PACKET_JSON:',
    JSON.stringify(encodingPacket, null, 2)
  ].join('\n');

  setPipelineStep('pipe-ai', 'work', 'encoding');
  updateEncodingChip('llm', 'LLM RUN', 'work');
  setStatus('LLM ENCODING PROMPT GENOME...', 'work');
  chrome.runtime.sendMessage({
    type: 'EXPRESS_PHENOTYPE',
    payload: { modelConfig: activeConfig, systemPrompt: GENOTYPE_TRANSCRIPTION_PROMPT, userTask: prompt }
  }, (resp) => {
    if (!resp || resp.error) {
      setPipelineStep('pipe-ai', '', 'failed');
      updateEncodingChip('llm', 'LLM FAIL', 'err');
      setStatus(`LLM ENCODE FAILED: ${resp?.error || 'UNKNOWN'}; LOCAL TRANSCRIPT KEPT`, 'err');
      setTimeout(() => setStatus('READY'), 4000);
      return;
    }

    const parsed = parseCodonArray(resp.result);
    if (!parsed.length) {
      setPipelineStep('pipe-ai', '', 'empty');
      updateEncodingChip('llm', 'LLM EMPTY', 'err');
      setStatus('LLM ENCODE RETURNED NO CODONS; LOCAL TRANSCRIPT KEPT', 'err');
      setTimeout(() => setStatus('READY'), 4000);
      return;
    }

    currentGenome.codons = parsed.map(normalizeCodon);
    renderGenomeEditor();
    setPipelineStep('pipe-ai', 'ready', `${currentGenome.codons.length} codons`);
    updateEncodingChip('llm', `LLM ${currentGenome.codons.length}`, 'ready');
    setStatus('LLM PROMPT GENOME ENCODED', 'ok');
    setTimeout(() => setStatus('READY'), 2500);
  });
}

function parseCodonArray(text) {
  try {
    const cleaned = extractJSON(text);
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : (Array.isArray(parsed.codons) ? parsed.codons : []);
  } catch (e) {
    return [];
  }
}

function extractJSON(text) {
  const match = String(text || '').match(/```(?:json)?\n([\s\S]*?)```/i);
  if (match) return match[1];
  const arrStart = String(text || '').indexOf('[');
  const arrEnd = String(text || '').lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) return String(text).slice(arrStart, arrEnd + 1);
  return String(text || '');
}

function buildEncodingPacket() {
  const genome = ensureActiveGenome();
  const rawCodons = rawPageGenome?.codons?.length ? rawPageGenome.codons : (genome.rawCodons || []);
  return {
    protocol: 'CGE-EVIDENCE-PACKET/1.0',
    budget: {
      purpose: 'compress large pages/codebases into ranked essence before LLM transcription',
      maxDomAlleles: 12,
      maxLandmarks: 16,
      maxTextBlocks: 18,
      maxComponents: 24
    },
    source: {
      title: rawPageGenome?.sourceTitle || genome.sourceTitle,
      url: rawPageGenome?.sourceUrl || genome.sourceUrl,
      timestamp: rawPageGenome?.timestamp || genome.timestamp
    },
    evidencePacket: rawPageGenome?.evidencePacket || null,
    domAlleles: rawCodons.slice(0, 12).map(c => ({
      locus: c.type || c.locus,
      weight: c.weight,
      selector: c.selector || '',
      payload: truncateText(c.payload, 900)
    })),
    currentPromptGenome: (genome.codons || []).map(c => ({
      type: c.type,
      weight: c.weight,
      selector: c.selector || '',
      state: c.state,
      payload: truncateText(c.payload, 700)
    }))
  };
}

// ─── OVERLAY ──────────────────────────────────────────────────────────────────
// Theory: [annotate] operation — toggles the shadow-DOM overlay on the live page
function toggleOverlay() {
  const overlayGenome = rawPageGenome || currentGenome;
  if (!overlayGenome) return;
  overlayActive = !overlayActive;
  updateEncodingChip('overlay', overlayActive ? 'OVERLAY ON' : 'OVERLAY OFF', overlayActive ? 'on' : '');

  chrome.runtime.sendMessage({
    type: 'TOGGLE_OVERLAY',
    payload: { genome: overlayGenome, show: overlayActive }
  }, (resp) => {
    if (resp?.error) {
      updateEncodingChip('overlay', 'OVERLAY FAIL', 'err');
      setStatus(`ANNOTATION FAILED: ${resp.error}`, 'err');
      return;
    }
    const btn = document.getElementById('btn-overlay');
    const badge = document.getElementById('overlay-status');
    if (overlayActive) {
      btn.textContent = '◈ Hide Annotation';
      btn.style.borderColor = 'var(--exon)';
      btn.style.color = 'var(--exon)';
      badge.innerHTML = '<span class="overlay-active-badge">OVERLAY ON</span>';
    } else {
      btn.textContent = '◈ Annotate DOM';
      btn.style.borderColor = '';
      btn.style.color = '';
      badge.innerHTML = '';
    }
  });
}

function refreshOverlayIfActive() {
  const overlayGenome = rawPageGenome || currentGenome;
  if (!overlayActive || !overlayGenome) return;
  chrome.runtime.sendMessage({
    type: 'TOGGLE_OVERLAY',
    payload: { genome: overlayGenome, show: true }
  }, (resp) => {
    if (resp?.error) setStatus(`ANNOTATION REFRESH FAILED: ${resp.error}`, 'err');
  });
}

// ─── PAGE / PANEL EXPERIMENTS ────────────────────────────────────────────────
function adoptPageGeneticsIntoPanel() {
  const colors = extractRgbColors(getRawCodonPayload('COLOR'));
  const font = extractFontName(getRawCodonPayload('TYPOGRAPHY'));
  const radius = radiusFromPayload(getRawCodonPayload('RADIUS'));
  const root = document.documentElement;

  if (colors[0]) root.style.setProperty('--primary', colors[0]);
  if (colors[1]) root.style.setProperty('--teal', colors[1]);
  if (colors[2]) root.style.setProperty('--purple', colors[2]);
  if (colors[3]) root.style.setProperty('--yellow', colors[3]);
  if (font) root.style.setProperty('--sans', `${JSON.stringify(font)}, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`);
  root.style.setProperty('--cge-adopted-radius', radius);

  document.querySelectorAll('.btn,.input,.textarea,.codon-row,.genome-card,.pheno-wrap,.breed-slot').forEach(el => {
    el.style.borderRadius = radius;
  });

  setStatus('PANEL ADOPTED PAGE GENETICS', 'ok');
  setTimeout(() => setStatus('READY'), 2200);
}

function applyPageGeneticsToActiveTab(reason = 'manual') {
  if (!rawPageGenome && !currentGenome) return;
  const css = buildPageGeneticCss();
  updateEncodingChip('mutate', 'MUTATE RUN', 'work');
  setStatus('MUTATING LIVE PAGE...', 'work');
  chrome.runtime.sendMessage({
    type: 'APPLY_PAGE_CSS',
    payload: { css }
  }, (resp) => {
    if (!resp || resp.error) {
      updateEncodingChip('mutate', 'MUTATE FAIL', 'err');
      setStatus(`PAGE MUTATION FAILED: ${resp?.error || 'UNKNOWN'}`, 'err');
      setTimeout(() => setStatus('READY'), 4000);
      return;
    }
    updateEncodingChip('mutate', 'MUTATE ON', 'on');
    setStatus(`LIVE PAGE GENETICS APPLIED (${reason})`, 'ok');
    refreshOverlayIfActive();
    setTimeout(() => setStatus('READY'), 2600);
  });
}

function buildPageGeneticCss() {
  const colors = extractRgbColors(getRawCodonPayload('COLOR'));
  const primary = colors[0] || '#60a5fa';
  const secondary = colors[1] || '#f472b6';
  const accent = colors[2] || '#fbbf24';
  const font = extractFontName(getRawCodonPayload('TYPOGRAPHY'));
  const radius = radiusFromPayload(getRawCodonPayload('RADIUS'));
  const active = activeCodons();
  const activeLabels = active.map(c => c.type).join(' ');
  const sourceTitle = rawPageGenome?.sourceTitle || currentGenome?.sourceTitle || 'page';
  const badgeText = cssContent(`CGE ${activeLabels || 'NO EXONS'} · ${sourceTitle}`);
  const targetSelectors = selectorList(active.map(c => c.selector).filter(Boolean));
  const evidenceSelectors = selectorList((rawPageGenome?.evidencePacket?.rankedSelectors || []).slice(0, 12));
  const headlineSelectors = selectorList(['h1', 'h2', 'h3']);
  const actionSelectors = selectorList(['button', '[role="button"]', 'a[href]', 'input', 'select', 'textarea']);
  const structureSelectors = selectorList(['main', 'section', 'article', 'form', '[class*="card"]', '[class*="panel"]']);

  return `
    html::before {
      content: "${badgeText}";
      position: fixed;
      left: 10px;
      bottom: 10px;
      z-index: 2147483646;
      background: #000;
      color: #fff;
      border: 2px solid ${primary};
      border-radius: 4px;
      padding: 5px 8px;
      font: 900 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0.08em;
      pointer-events: none;
      box-shadow: 0 0 0 2px ${secondary};
    }
    ${font ? `body, button, input, textarea, select { font-family: ${JSON.stringify(font)}, system-ui, sans-serif !important; }` : ''}
    ${actionSelectors} {
      border-radius: ${radius} !important;
      border: 2px solid ${primary} !important;
      background-image: linear-gradient(135deg, ${primary}22, ${secondary}18) !important;
      box-shadow: 0 0 0 3px ${primary}22 !important;
    }
    ${headlineSelectors} {
      text-shadow: 2px 2px 0 #000 !important;
      outline: 3px solid ${accent} !important;
      outline-offset: 4px !important;
      padding-inline: 0.08em !important;
    }
    ${structureSelectors} {
      box-shadow: inset 0 0 0 2px ${secondary}55 !important;
      border-radius: ${radius} !important;
    }
    ${evidenceSelectors} {
      outline: 2px dashed ${accent}cc !important;
      outline-offset: 2px !important;
    }
    ${targetSelectors} {
      outline: 4px solid ${primary} !important;
      outline-offset: 4px !important;
      filter: saturate(1.18) contrast(1.08) !important;
    }
  `;
}

function selectorList(selectors) {
  const clean = [...new Set(selectors.map(safeSelector).filter(Boolean))].slice(0, 30);
  return clean.length ? clean.join(',\n') : ':root';
}

function safeSelector(selector) {
  const value = String(selector || '').trim();
  if (!value || value.length > 220) return '';
  if (!/^[\w\s.#:[\]="'>*^$|~,+()-]+$/.test(value)) return '';
  try {
    document.querySelector(value);
    return value;
  } catch (e) {
    return '';
  }
}

function getRawCodonPayload(type) {
  const raw = rawPageGenome?.codons?.length ? rawPageGenome.codons : (currentGenome?.rawCodons || []);
  const codon = raw.find(c => (c.type || c.locus) === type);
  return codon?.payload || '';
}

function extractRgbColors(text) {
  return [...String(text || '').matchAll(/rgba?\([^)]+\)/g)].map(match => match[0]).slice(0, 8);
}

function extractFontName(text) {
  const match = String(text || '').match(/Fonts:\s*([^.,]+)/);
  if (!match) return '';
  const font = match[1].replace(/['"]/g, '').trim();
  return /^[\w -]{2,48}$/.test(font) ? font : '';
}

function radiusFromPayload(text) {
  const payload = String(text || '');
  if (/PILL|9999px|50%/i.test(payload)) return '999px';
  if (/SOFT/i.test(payload)) return '16px';
  if (/SLIGHTLY_ROUNDED/i.test(payload)) return '6px';
  return '2px';
}

function cssContent(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

// ─── SAVE TO LINEAGE ──────────────────────────────────────────────────────────
// Theory: [store] operation — persists a <DOMGenome> into the vault
function saveCurrentGenome() {
  if (!currentGenome) return;
  currentGenome = normalizeGenome(currentGenome);
  chrome.runtime.sendMessage({ type: 'SAVE_GENOME', payload: { genome: currentGenome } }, (resp) => {
    if (resp?.ok) {
      setStatus('GENOME SAVED TO VAULT', 'ok');
      lineage[resp.key] = currentGenome;
      updateLineageCounts();
      renderLineage();
      setTimeout(() => setStatus('READY'), 2000);
    }
  });
}

// ─── LINEAGE ──────────────────────────────────────────────────────────────────
// Theory: Reads from <Lineage> vault and renders genome cards
async function loadLineage() {
  setLineageLoading(true);

  chrome.runtime.sendMessage({ type: 'LOAD_LINEAGE' }, (resp) => {
    setLineageLoading(false);

    if (!resp?.ok) return;
    lineage = {};
    for (const [k, v] of Object.entries(resp.lineage)) {
      if (k.startsWith('genome:')) lineage[k] = normalizeGenome(v);
    }
    if (resp.lineage.api_key) {
      apiKey = resp.lineage.api_key;
    }
    if (resp.lineage.model_config) {
      modelConfig = normalizeModelConfig(resp.lineage.model_config);
      apiKey = modelConfig.apiKey;
      renderModelConfig();
    }

    renderLineage();
    updateLineageCounts();
  });
}

function setLineageLoading(show) {
  const loader = document.getElementById('lineage-loader');
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

function renderLineage() {
  const container = document.getElementById('lineage-container');
  const keys = Object.keys(lineage).sort((a, b) => b.localeCompare(a));

  if (keys.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <img class="empty-icon-img" src="../icons/icon48.png" alt="">
        <div class="empty-title">Vault Empty</div>
        <div class="empty-desc">Extract a genome and save it to build your lineage.</div>
      </div>`;
    return;
  }

  container.innerHTML = '';
  keys.forEach(key => {
    const genome = lineage[key];
    const card = createGenomeCard(genome, key);
    container.appendChild(card);
  });
}

function createGenomeCard(genome, key) {
  const card = document.createElement('div');
  card.className = 'genome-card';
  card.id = `gcard-${key}`;

  // Selection state classes
  if (parentA && parentA._key === key) card.classList.add('selected-a');
  if (parentB && parentB._key === key) card.classList.add('selected-b');

  const ts = new Date(genome.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  let hostname = '';
  try { hostname = new URL(genome.sourceUrl).hostname; } catch (e) {}

  const codonTags = genome.codons.map(c => {
    const color = LOCUS_COLORS[c.locus] || '#fff';
    return `<span class="codon-tag" style="color:${color};border-color:${color}40;">${c.locus}</span>`;
  }).join('');

  card.innerHTML = `
    <div class="genome-card-header">
      <img class="genome-favicon" src="../icons/icon48.png" alt="">
      <div style="flex:1; min-width:0;">
        <div class="genome-title">${escHtml(genome.sourceTitle || hostname)}</div>
        <div class="genome-url">${escHtml(genome.sourceUrl)}</div>
      </div>
      <div class="genome-ts">${ts}</div>
    </div>
    <div class="genome-codons">${codonTags}</div>
    <div class="genome-actions">
      <button class="btn accent js-load-genome" data-key="${escHtml(key)}" style="flex:1; font-size:9px; padding:4px;">
        LOAD
      </button>
      <button class="btn js-parent-a" data-key="${escHtml(key)}" style="flex:1; font-size:9px; padding:4px; border-color:var(--teal); color:var(--teal);">
        A
      </button>
      <button class="btn js-parent-b" data-key="${escHtml(key)}" style="flex:1; font-size:9px; padding:4px; border-color:var(--orange); color:var(--orange);">
        B
      </button>
      <button class="btn danger js-delete-genome" data-key="${escHtml(key)}" style="font-size:9px; padding:4px 8px;">✕</button>
    </div>
  `;

  return card;
}

function handleLineageClick(event) {
  const loadButton = event.target.closest('.js-load-genome');
  if (loadButton) {
    loadGenomeFromLineage(loadButton.dataset.key);
    return;
  }

  const parentAButton = event.target.closest('.js-parent-a');
  if (parentAButton) {
    selectAsParent(parentAButton.dataset.key, 'A');
    return;
  }

  const parentBButton = event.target.closest('.js-parent-b');
  if (parentBButton) {
    selectAsParent(parentBButton.dataset.key, 'B');
    return;
  }

  const deleteButton = event.target.closest('.js-delete-genome');
  if (deleteButton) {
    deleteGenome(deleteButton.dataset.key);
  }
}

function loadGenomeFromLineage(key) {
  const genome = lineage[key];
  if (!genome) return;
  currentGenome = normalizeGenome({ ...genome, codons: genome.codons.map(c => ({ ...c })) });
  rawPageGenome = currentGenome.rawCodons?.length
    ? normalizeGenome({ ...currentGenome, codons: currentGenome.rawCodons.map(c => ({ ...c })) })
    : null;
  renderGenomeEditor();
  switchTab('genome');
  setStatus('GENOME LOADED FOR EDITING', 'ok');
  setTimeout(() => setStatus('READY'), 2000);
}

function updateLineageCounts() {
  const n = Object.keys(lineage).length;
  document.getElementById('count-lineage').textContent = n;
}

// ─── PARENT SELECTION ─────────────────────────────────────────────────────────
// Theory: <Breeder> [selects] which <DOMGenome> occupies each parent slot
function selectAsParent(key, slot) {
  const genome = lineage[key];
  if (!genome) return;

  genome._key = key; // tag with vault key for reference

  // Clear previous selection highlight
  if (slot === 'A' && parentA) {
    document.getElementById(`gcard-${parentA._key}`)?.classList.remove('selected-a');
  }
  if (slot === 'B' && parentB) {
    document.getElementById(`gcard-${parentB._key}`)?.classList.remove('selected-b');
  }

  if (slot === 'A') {
    parentA = genome;
    document.getElementById('slot-a').classList.add('filled-a');
    document.getElementById('slot-a-label').textContent = genome.sourceTitle || genome.sourceUrl;
  } else {
    parentB = genome;
    document.getElementById('slot-b').classList.add('filled-b');
    document.getElementById('slot-b-label').textContent = genome.sourceTitle || genome.sourceUrl;
  }

  document.getElementById(`gcard-${key}`)?.classList.add(`selected-${slot.toLowerCase()}`);

  // Enable breed buttons when both parents are loaded
  const bothReady = parentA && parentB;
  setBtn('btn-punnett', !bothReady);
  setBtn('btn-ai-breed', !bothReady);

  setStatus(`PARENT ${slot} SET: ${genome.sourceTitle || genome.sourceUrl}`, 'ok');
  setTimeout(() => setStatus('READY'), 2000);

  // Auto-switch to breed tab
  switchTab('breed');
}

// ─── DELETE GENOME ────────────────────────────────────────────────────────────
function deleteGenome(key) {
  if (!confirm('Remove this genome from the vault?')) return;
  chrome.runtime.sendMessage({ type: 'DELETE_GENOME', payload: { key } }, () => {
    delete lineage[key];
    if (parentA?._key === key) { parentA = null; resetSlot('A'); }
    if (parentB?._key === key) { parentB = null; resetSlot('B'); }
    renderLineage();
    updateLineageCounts();
    setStatus('GENOME DELETED', 'ok');
    setTimeout(() => setStatus('READY'), 2000);
  });
}

function resetSlot(slot) {
  const id = `slot-${slot.toLowerCase()}`;
  const labelId = `slot-${slot.toLowerCase()}-label`;
  const colorClass = `filled-${slot.toLowerCase()}`;
  document.getElementById(id)?.classList.remove(colorClass);
  document.getElementById(labelId).textContent = 'SELECT FROM LINEAGE';
  setBtn('btn-punnett', true);
  setBtn('btn-ai-breed', true);
}

// ─── PUNNETT CROSS ────────────────────────────────────────────────────────────
// Theory: [cross] operation — deterministic Mendelian dominance resolution.
// Per locus, the codon with higher weight is "dominant" and selected for offspring.
// Equal weights = blended payload.
class PunnettEngine {
  resolveDominance(alleleA, alleleB) {
    if (!alleleA) return alleleB;
    if (!alleleB) return alleleA;
    const wA = alleleA.weight || 50;
    const wB = alleleB.weight || 50;
    if (wA > wB) return { ...alleleA };
    if (wB > wA) return { ...alleleB };
    // Co-dominance: blend payloads
    return { ...alleleA, payload: `${alleleA.payload} · ${alleleB.payload}` };
  }

  cross(genomeA, genomeB) {
    const dictA = {};
    genomeA.codons.forEach(c => dictA[c.locus] = c);
    const dictB = {};
    genomeB.codons.forEach(c => dictB[c.locus] = c);

    const allLoci = [...new Set([...Object.keys(dictA), ...Object.keys(dictB)])];

    // 4 offspring with different dominant allele combinations
    const offspring = [];
    const combos = [
      [dictA, dictA], // pure A
      [dictA, dictB], // hybrid A-dominant
      [dictB, dictA], // hybrid B-dominant
      [dictB, dictB], // pure B
    ];

    combos.forEach(([src1, src2], i) => {
      const codons = allLoci.map(locus => {
        return this.resolveDominance(src1[locus], src2[locus]);
      }).filter(Boolean);

      offspring.push({
        name: ['PUREBRED A', 'HYBRID (A×B)', 'HYBRID (B×A)', 'PUREBRED B'][i],
        codons
      });
    });

    return offspring;
  }
}

function runPunnettCross() {
  if (!parentA || !parentB) return;

  const engine = new PunnettEngine();
  const offspring = engine.cross(parentA, parentB);

  const section = document.getElementById('offspring-section');
  const container = document.getElementById('offspring-container');
  section.style.display = 'block';
  container.innerHTML = '';

  offspring.forEach((child, i) => {
    const card = document.createElement('div');
    card.style.cssText = 'border:1px solid var(--border); border-radius:6px; overflow:hidden; background:var(--surface);';

    const codonTags = child.codons.map(c => {
      const color = LOCUS_COLORS[c.locus] || '#fff';
      return `<span class="codon-tag" style="color:${color};border-color:${color}40;">${c.locus}</span>`;
    }).join('');

    card.innerHTML = `
      <div style="padding:8px 10px; background:var(--bg); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:900; font-size:10px; color:var(--yellow); letter-spacing:0.1em;">${child.name}</span>
        <span style="font-size:9px; color:var(--dim);">${child.codons.length} loci</span>
      </div>
      <div style="padding:8px 10px; display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px;">${codonTags}</div>
      <div style="padding:0 10px 10px;">
        <button class="btn accent js-express-offspring" data-index="${i}" style="width:100%; font-size:10px; padding:6px;">
          ✦ Express This Phenotype
        </button>
      </div>
    `;

    // Store offspring data on the card for reference
    card.dataset.offspringIndex = i;
    container.appendChild(card);
  });

  // Store offspring globally for expression
  window._lastOffspring = offspring;
  setStatus('PUNNETT CROSS COMPLETE — 4 OFFSPRING GENERATED', 'ok');
  setTimeout(() => setStatus('READY'), 3000);
}

function handleOffspringClick(event) {
  const button = event.target.closest('.js-express-offspring');
  if (!button) return;
  expressOffspring(parseInt(button.dataset.index, 10));
}

async function expressOffspring(index) {
  const activeConfig = getModelConfigFromForm();
  modelConfig = activeConfig;
  apiKey = activeConfig.apiKey;
  if (activeConfig.provider !== 'local' && !activeConfig.apiKey) {
    setStatus('API KEY REQUIRED — go to Config tab or choose Local Llama', 'err');
    setTimeout(() => setStatus('READY'), 3000);
    return;
  }

  const offspring = window._lastOffspring?.[index];
  if (!offspring) return;

  setStatus('EXPRESSING PHENOTYPE VIA AI...', 'work');
  setBtn('btn-ai-breed', true);
  setBtn('btn-punnett', true);

  const genomeDescription = offspring.codons.map(c =>
    `[${c.locus}] ${c.payload}`
  ).join('\n');

  const directive = document.getElementById('breed-directive').value.trim();

  const userTask = `
Generate a complete, self-contained HTML page that expresses this UI genome. The page should visually embody these genetic traits:

${genomeDescription}

${directive ? `Breeding directive: ${directive}` : ''}

Parent sites for inspiration: "${parentA?.sourceTitle || parentA?.sourceUrl}" × "${parentB?.sourceTitle || parentB?.sourceUrl}"

Requirements:
- Complete HTML with inline CSS and JS
- No external dependencies except Google Fonts if needed
- Dark mode UI preferred unless the genome specifies otherwise
- Use the EXACT colors, fonts, spacing, and components described in the genome
- Make it beautiful and functional — this is a living phenotype

Wrap the entire HTML in triple backticks.
  `.trim();

  chrome.runtime.sendMessage({
    type: 'AI_BREED',
    payload: { modelConfig: activeConfig, prompt: userTask }
  }, (resp) => {
    setBtn('btn-ai-breed', false);
    setBtn('btn-punnett', false);

    if (!resp || resp.error) {
      setStatus('EXPRESSION FAILED: ' + (resp?.error || 'Unknown error'), 'err');
      setTimeout(() => setStatus('READY'), 4000);
      return;
    }

    lastPhenotype = resp.result;
    renderPhenotype(resp.result);
    setBtn('btn-save-phenotype', false);
    setStatus('PHENOTYPE EXPRESSED', 'ok');
    setTimeout(() => setStatus('READY'), 2000);
  });
}

// ─── AI BREED ─────────────────────────────────────────────────────────────────
// Theory: The [express] operation — sends crossed genome to AI for HTML generation
async function runAIBreed() {
  if (!parentA || !parentB) return;
  const activeConfig = getModelConfigFromForm();
  modelConfig = activeConfig;
  apiKey = activeConfig.apiKey;
  if (activeConfig.provider !== 'local' && !activeConfig.apiKey) {
    setStatus('API KEY REQUIRED — go to Config tab or choose Local Llama', 'err');
    setTimeout(() => setStatus('READY'), 3000);
    return;
  }

  setStatus('AI BREEDING IN PROGRESS...', 'work');
  setBtn('btn-ai-breed', true);
  setBtn('btn-punnett', true);

  // Build combined genome description
  const engine = new PunnettEngine();
  const hybrid = engine.cross(parentA, parentB)[1]; // Use hybrid A×B offspring

  const genomeDescription = hybrid.codons.map(c => `[${c.locus}] ${c.payload}`).join('\n');
  const directive = document.getElementById('breed-directive').value.trim();

  const prompt = `
You are crossing two websites into a novel UI:

PARENT A: "${parentA.sourceTitle}" (${parentA.sourceUrl})
PARENT B: "${parentB.sourceTitle}" (${parentB.sourceUrl})

CROSSED GENOME (dominant traits selected per locus):
${genomeDescription}

${directive ? `BREEDING DIRECTIVE: ${directive}` : 'Express the most interesting phenotypic combination of both parents.'}

Generate a beautiful, self-contained HTML page that is a novel UI inspired by these two sites. Include inline CSS, no external deps, real interactivity where appropriate. Wrap all HTML in triple backticks.
  `.trim();

  chrome.runtime.sendMessage({
    type: 'AI_BREED',
    payload: { modelConfig: activeConfig, prompt }
  }, (resp) => {
    setBtn('btn-ai-breed', false);
    setBtn('btn-punnett', false);

    if (!resp || resp.error) {
      setStatus('AI EXPRESSION FAILED: ' + (resp?.error || 'Unknown'), 'err');
      setTimeout(() => setStatus('READY'), 4000);
      return;
    }

    lastPhenotype = resp.result;
    renderPhenotype(resp.result);
    setBtn('btn-save-phenotype', false);
    setStatus('AI PHENOTYPE EXPRESSED', 'ok');
    setTimeout(() => setStatus('READY'), 2000);
  });
}

// ─── FIELD EXPRESSION ─────────────────────────────────────────────────────────
function useCurrentPageAsField() {
  const field = document.getElementById('field-task');
  if (!field) return;

  const genome = ensureActiveGenome();
  const rawGenome = rawPageGenome || { codons: genome.rawCodons || [] };
  const rawCodons = rawGenome.codons?.length ? rawGenome.codons : genome.codons;
  const summary = [
    `Source: ${genome.sourceTitle || 'Unknown'}`,
    `URL: ${genome.sourceUrl || 'Unknown'}`,
    '',
    'RAW PAGE ALLELES:',
    ...rawCodons.map(c => `[${c.type || c.locus}] ${c.payload}`),
    '',
    'ACTIVE PROMPT GENOTYPE:',
    ...genome.codons.map(c => `[${c.type}] ${c.payload}`)
  ].join('\n');

  field.value = field.value.trim()
    ? `${field.value.trim()}\n\n--- Extracted page genome ---\n${summary}`
    : summary;
}

async function expressFieldArtifact() {
  const activeConfig = getModelConfigFromForm();
  modelConfig = activeConfig;
  apiKey = activeConfig.apiKey;

  const systemPrompt = compileActiveGenome();
  const userTask = document.getElementById('field-task')?.value.trim() || 'Express the active genotype as a useful, self-contained artifact.';
  renderCompiledPrompt();

  if (activeConfig.provider !== 'local' && !activeConfig.apiKey) {
    lastFieldArtifact = `${systemPrompt}\n\n[ FIELD TASK ]\n${userTask}\n\n[ MODEL DISABLED ] Configure an API key or select Local Llama.`;
    renderFieldArtifact(lastFieldArtifact);
    setStatus('API KEY REQUIRED — COMPILED PROMPT SHOWN', 'err');
    setTimeout(() => setStatus('READY'), 3500);
    return;
  }

  setStatus('EXPRESSING FIELD ARTIFACT...', 'work');
  setBtn('btn-express-field', true);
  chrome.runtime.sendMessage({
    type: 'EXPRESS_PHENOTYPE',
    payload: { modelConfig: activeConfig, systemPrompt, userTask }
  }, (resp) => {
    setBtn('btn-express-field', false);
    if (!resp || resp.error) {
      lastFieldArtifact = `${systemPrompt}\n\n[ FIELD TASK ]\n${userTask}\n\n[ ERROR ] ${resp?.error || 'Unknown provider failure'}`;
      renderFieldArtifact(lastFieldArtifact);
      setStatus('FIELD EXPRESSION FAILED', 'err');
      setTimeout(() => setStatus('READY'), 4000);
      return;
    }

    lastFieldArtifact = resp.result || '';
    renderFieldArtifact(lastFieldArtifact);
    setStatus('FIELD ARTIFACT EXPRESSED', 'ok');
    setTimeout(() => setStatus('READY'), 2500);
  });
}

function renderFieldArtifact(text) {
  const out = document.getElementById('artifact-text');
  const frame = document.getElementById('artifact-frame');
  if (!out || !frame) return;

  out.textContent = text || 'No artifact.';
  out.style.display = 'block';
  frame.style.display = 'none';
  document.getElementById('btn-artifact-source')?.classList.add('active');
  document.getElementById('btn-artifact-render')?.classList.remove('active');
}

function showArtifactSource() {
  if (!lastFieldArtifact) return;
  document.getElementById('artifact-frame').style.display = 'none';
  document.getElementById('artifact-text').style.display = 'block';
  document.getElementById('btn-artifact-source').classList.add('active');
  document.getElementById('btn-artifact-render').classList.remove('active');
}

function showArtifactRender() {
  if (!lastFieldArtifact) return;
  const frame = document.getElementById('artifact-frame');
  fieldBlobUrl = renderHtmlInFrame(frame, extractHTML(lastFieldArtifact), fieldBlobUrl);
  document.getElementById('artifact-text').style.display = 'none';
  frame.style.display = 'block';
  document.getElementById('btn-artifact-render').classList.add('active');
  document.getElementById('btn-artifact-source').classList.remove('active');
}

function copyFieldArtifact() {
  if (!lastFieldArtifact) return;
  navigator.clipboard.writeText(extractHTML(lastFieldArtifact)).then(() => {
    setStatus('FIELD ARTIFACT COPIED', 'ok');
    setTimeout(() => setStatus('READY'), 2000);
  });
}

function downloadFieldArtifact() {
  if (!lastFieldArtifact) return;
  const html = extractHTML(lastFieldArtifact);
  const blob = new Blob([html], { type: html.includes('<') ? 'text/html' : 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `field_artifact_${Date.now()}.${html.includes('<') ? 'html' : 'txt'}`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('FIELD ARTIFACT DOWNLOADED', 'ok');
  setTimeout(() => setStatus('READY'), 2000);
}

async function askActiveGenome() {
  const input = document.getElementById('genome-chat-input');
  const log = document.getElementById('genome-chat-log');
  if (!input || !log) return;

  const question = input.value.trim();
  if (!question) return;
  const systemPrompt = 'You are helping inspect and evolve an active prompt genotype. Be concrete. Reference exact codons when useful.';
  const userTask = `${compileActiveGenome()}\n\n[ USER QUESTION ]\n${question}`;
  const activeConfig = getModelConfigFromForm();

  if (activeConfig.provider !== 'local' && !activeConfig.apiKey) {
    log.textContent = `${userTask}\n\n[ MODEL DISABLED ] Configure an API key or select Local Llama.`;
    setStatus('API KEY REQUIRED — GENOTYPE PROMPT SHOWN', 'err');
    setTimeout(() => setStatus('READY'), 3500);
    return;
  }

  setStatus('QUERYING GENOTYPE...', 'work');
  chrome.runtime.sendMessage({
    type: 'EXPRESS_PHENOTYPE',
    payload: { modelConfig: activeConfig, systemPrompt, userTask }
  }, (resp) => {
    if (!resp || resp.error) {
      log.textContent = `[ ERROR ] ${resp?.error || 'Unknown provider failure'}`;
      setStatus('GENOTYPE QUERY FAILED', 'err');
      setTimeout(() => setStatus('READY'), 4000);
      return;
    }
    log.textContent = resp.result || '';
    setStatus('GENOTYPE RESPONSE READY', 'ok');
    setTimeout(() => setStatus('READY'), 2200);
  });
}

async function askCodon(index) {
  const codon = currentGenome?.codons?.[index];
  const input = document.querySelector(`.js-codon-chat-input[data-index="${index}"]`);
  const log = document.getElementById('genome-chat-log');
  if (!codon || !input || !log) return;
  const question = input.value.trim() || 'Explain what this codon controls and suggest one precise mutation.';
  const wantsMutation = shouldApplyMutation(question);
  const systemPrompt = wantsMutation
    ? 'You are mutating one prompt codon. Output JSON only: {"payload":"replacement codon payload","weight":0-100}. The payload must be dense, imperative, and directly replace the old payload.'
    : 'You are inspecting one prompt codon inside a larger active genotype. Answer concretely. Reference exact codons when useful.';
  const userTask = [
    'ACTIVE CODON:',
    `[${codon.type}] state=${codon.state} weight=${codon.weight}`,
    codon.payload,
    '',
    'WHOLE GENOTYPE:',
    compileActiveGenome(),
    '',
    'QUESTION:',
    question
  ].join('\n');
  const activeConfig = getModelConfigFromForm();

  if (activeConfig.provider !== 'local' && !activeConfig.apiKey) {
    if (wantsMutation) {
      const replacement = localCodonMutation(codon, question);
      applyCodonMutation(index, replacement.payload, replacement.weight);
      log.textContent = `[ ${codon.type} LOCAL MUTATION ]\n${replacement.payload}`;
      setStatus('LOCAL CODON MUTATION APPLIED; NO API KEY USED', 'ok');
      setTimeout(() => setStatus('READY'), 2500);
      return;
    }
    log.textContent = `${userTask}\n\n[ MODEL DISABLED ] Configure an API key or select Local Llama.`;
    setStatus('API KEY REQUIRED — CODON PROMPT SHOWN', 'err');
    setTimeout(() => setStatus('READY'), 3500);
    return;
  }

  setStatus(`QUERYING CODON ${codon.type}...`, 'work');
  chrome.runtime.sendMessage({
    type: 'EXPRESS_PHENOTYPE',
    payload: { modelConfig: activeConfig, systemPrompt, userTask }
  }, (resp) => {
    if (!resp || resp.error) {
      log.textContent = `[ ${codon.type} ERROR ] ${resp?.error || 'Unknown provider failure'}`;
      setStatus('CODON QUERY FAILED', 'err');
      setTimeout(() => setStatus('READY'), 4000);
      return;
    }
    const result = resp.result || '';
    const mutation = extractMutationPayload(result, codon.type);
    if (wantsMutation && mutation?.payload) {
      applyCodonMutation(index, mutation.payload, mutation.weight);
      log.textContent = `[ ${codon.type} MUTATED ]\n${mutation.payload}`;
      setStatus('CODON MUTATION APPLIED TO ACTIVE GENOME', 'ok');
    } else {
      log.textContent = `[ ${codon.type} ]\n${result}`;
      setStatus('CODON RESPONSE READY', 'ok');
    }
    setTimeout(() => setStatus('READY'), 2200);
  });
}

async function mutateCodon(index) {
  const codon = currentGenome?.codons?.[index];
  const input = document.querySelector(`.js-codon-chat-input[data-index="${index}"]`);
  if (!codon || !input) return;
  if (!input.value.trim()) input.value = 'Make this codon more token dense, operational, and testable.';
  askCodon(index);
}

function shouldApplyMutation(text) {
  return /\b(mutate|rewrite|replace|update|change|make|densify|dense|crisp|sharpen|bauhaus|minimal|stronger)\b/i.test(String(text || ''));
}

function extractMutationPayload(text, type) {
  const raw = String(text || '').trim();
  try {
    const parsed = JSON.parse(extractJSON(raw));
    if (parsed?.payload) return { payload: String(parsed.payload).trim(), weight: parsed.weight };
  } catch (e) {}

  const marker = raw.match(/(?:MUTATION|REPLACEMENT)\s+PAYLOAD\s*:?\s*(?:\[[A-Z]+\]\s*)?([\s\S]+)/i);
  if (marker?.[1]) return { payload: cleanupMutationPayload(marker[1], type) };

  const bracket = raw.match(new RegExp(`\\[${type}\\]\\s*([\\s\\S]+)`, 'i'));
  if (bracket?.[1]) return { payload: cleanupMutationPayload(bracket[1], type) };
  return null;
}

function cleanupMutationPayload(text, type) {
  return String(text || '')
    .replace(new RegExp(`^\\[${type}\\]\\s*`, 'i'), '')
    .replace(/^state=.*$/gim, '')
    .trim();
}

function applyCodonMutation(index, payload, weight) {
  if (!currentGenome?.codons?.[index] || !payload) return;
  currentGenome.codons[index].payload = payload;
  if (weight !== undefined) currentGenome.codons[index].weight = normalizeWeight(weight);
  renderGenomeEditor();
  renderCompiledPrompt();
  applyPageGeneticsToActiveTab(`codon ${currentGenome.codons[index]?.type || index}`);
}

function localCodonMutation(codon, directive) {
  const payload = String(codon.payload || '').trim();
  const request = String(directive || '').toLowerCase();
  const prefixes = {
    RSN: 'Order reasoning as explicit operations; separate evidence, inference, decision, and output.',
    EVD: 'Use concrete evidence only; preserve measured values, source labels, and uncertainty.',
    OUT: 'Return a directly inspectable artifact with named sections, controls, and render/source states.',
    FIT: 'Optimize for high signal density, fast inspection, low ambiguity, and testable interaction outcomes.',
    FLR: 'Expose blocked layer, exact error, preserved fallback state, and next recoverable action.',
    CST: 'Apply the custom trait as an operational constraint with visible, testable UI consequences.'
  };
  const styleClause = request.includes('bauhaus')
    ? ' Favor Bauhaus discipline: grid geometry, sharp planes, primary accents, asymmetry, minimal ornament.'
    : '';
  const densityClause = /\bdense|densify|token\b/.test(request)
    ? ' Remove filler; compress into imperative clauses; keep concrete values.'
    : '';
  const crispClause = /\bcrisp|sharp|sharpen|minimal\b/.test(request)
    ? ' Prefer crisp hierarchy, hard edges, clear contrast, and unambiguous affordances.'
    : '';

  return {
    payload: `${prefixes[codon.type] || 'Apply this codon as a specific operational constraint.'} ${payload}${densityClause}${crispClause}${styleClause}`.replace(/\s+/g, ' ').trim(),
    weight: Math.max(normalizeWeight(codon.weight), 82)
  };
}

// ─── IMAGE EVIDENCE ──────────────────────────────────────────────────────────
function handleImageEvidenceUpload(event) {
  const files = [...(event.target.files || [])]
    .filter(file => file.type.startsWith('image/'))
    .slice(0, 8);
  if (!files.length) return;

  Promise.all(files.map(readImageEvidenceFile)).then(items => {
    const loaded = items.filter(Boolean);
    imageEvidence = [...imageEvidence, ...loaded].slice(-8);
    renderImageEvidencePreview();
    renderCompiledPrompt();
    setStatus(`IMAGE EVIDENCE LOADED: ${loaded.length}`, 'ok');
    setTimeout(() => setStatus('READY'), 2200);
  });
}

function readImageEvidenceFile(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type,
      size: file.size,
      sizeLabel: humanBytes(file.size),
      dataUrl: reader.result
    });
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function renderImageEvidencePreview() {
  const rail = document.getElementById('image-evidence-preview');
  if (!rail) return;
  rail.textContent = '';
  if (!imageEvidence.length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No image evidence attached.';
    rail.appendChild(empty);
    return;
  }

  imageEvidence.forEach(item => {
    const thumb = document.createElement('div');
    thumb.className = 'image-thumb';

    const img = document.createElement('img');
    img.src = item.dataUrl;
    img.alt = '';

    const label = document.createElement('span');
    label.textContent = item.name;

    thumb.append(img, label);
    rail.appendChild(thumb);
  });
}

// ─── PHENOTYPE RENDERING ──────────────────────────────────────────────────────
function extractHTML(text) {
  const match = text.match(/```(?:html|HTML)?\n([\s\S]*?)```/i);
  if (match) return match[1];
  if (text.includes('<html') || text.includes('<!DOCTYPE')) return text;
  return text;
}

function renderHtmlInFrame(frame, html, previousUrl) {
  if (!frame) return previousUrl;
  if (previousUrl && String(previousUrl).startsWith('blob:')) URL.revokeObjectURL(previousUrl);
  const doc = html.includes('<html') || html.includes('<!DOCTYPE')
    ? html
    : `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(doc)}`;
  frame.removeAttribute('srcdoc');
  frame.src = url;
  return url;
}

function renderPhenotype(text) {
  document.getElementById('pheno-text').style.display = 'block';
  document.getElementById('pheno-frame').style.display = 'none';
  document.getElementById('btn-pheno-source').classList.add('active');
  document.getElementById('btn-pheno-render').classList.remove('active');

  const pre = document.createElement('pre');
  pre.style.cssText = 'padding:12px; font-family:var(--mono); font-size:10px; color:var(--primary); line-height:1.5; white-space:pre-wrap; overflow-x:hidden;';
  pre.textContent = text;
  document.getElementById('pheno-text').innerHTML = '';
  document.getElementById('pheno-text').appendChild(pre);
}

function showPhenoSource() {
  if (!lastPhenotype) return;
  document.getElementById('pheno-frame').style.display = 'none';
  document.getElementById('pheno-text').style.display = 'block';
  document.getElementById('btn-pheno-source').classList.add('active');
  document.getElementById('btn-pheno-render').classList.remove('active');
}

function showPhenoRender() {
  if (!lastPhenotype) return;
  const html = extractHTML(lastPhenotype);
  phenotypeBlobUrl = renderHtmlInFrame(document.getElementById('pheno-frame'), html, phenotypeBlobUrl);
  document.getElementById('pheno-text').style.display = 'none';
  document.getElementById('pheno-frame').style.display = 'block';
  document.getElementById('btn-pheno-render').classList.add('active');
  document.getElementById('btn-pheno-source').classList.remove('active');
}

function copyPhenotype() {
  if (!lastPhenotype) return;
  const html = extractHTML(lastPhenotype);
  navigator.clipboard.writeText(html).then(() => {
    setStatus('PHENOTYPE COPIED TO CLIPBOARD', 'ok');
    setTimeout(() => setStatus('READY'), 2000);
  });
}

function downloadPhenotype() {
  if (!lastPhenotype) return;
  const html = extractHTML(lastPhenotype);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `phenotype_${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('PHENOTYPE DOWNLOADED', 'ok');
  setTimeout(() => setStatus('READY'), 2000);
}

// ─── SAVE PHENOTYPE AS NEW GENOME ─────────────────────────────────────────────
// Theory: The offspring becomes a new <DOMGenome> — a "synthetic organism"
// that can itself be stored in the lineage and bred further.
function savePhenotypeAsGenome() {
  if (!lastPhenotype || !parentA || !parentB) return;

  const syntheticGenome = normalizeGenome({
    id: Math.random().toString(36).substring(2, 10),
    sourceUrl: `synthetic://bred/${Date.now()}`,
    sourceTitle: `${parentA.sourceTitle || 'A'} × ${parentB.sourceTitle || 'B'}`,
    timestamp: Date.now(),
    synthetic: true,
    parentA: parentA.sourceUrl,
    parentB: parentB.sourceUrl,
    codons: [
      ...(parentA.codons || []).map(c => ({ ...c })),
      ...(parentB.codons || []).map(c => ({ ...c }))
    ].filter((c, i, arr) => arr.findIndex(x => x.locus === c.locus) === i) // dedupe by locus
  });

  chrome.runtime.sendMessage({ type: 'SAVE_GENOME', payload: { genome: syntheticGenome } }, (resp) => {
    if (resp?.ok) {
      lineage[resp.key] = syntheticGenome;
      updateLineageCounts();
      renderLineage();
      setStatus('SYNTHETIC GENOME STORED IN VAULT', 'ok');
      setTimeout(() => setStatus('READY'), 2500);
    }
  });
}

// ─── VAULT MANAGEMENT ─────────────────────────────────────────────────────────
function exportAllLineage() {
  const data = JSON.stringify({ lineage, exportedAt: Date.now() }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dom_genetics_lineage_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('LINEAGE EXPORTED', 'ok');
  setTimeout(() => setStatus('READY'), 2000);
}

function clearAllLineage() {
  if (!confirm('Purge the entire genome vault? This cannot be undone.')) return;
  chrome.storage.local.get(null, (items) => {
    const keysToRemove = Object.keys(items).filter(k => k.startsWith('genome:'));
    chrome.storage.local.remove(keysToRemove, () => {
      lineage = {};
      parentA = null;
      parentB = null;
      renderLineage();
      updateLineageCounts();
      resetSlot('A');
      resetSlot('B');
      setStatus('VAULT PURGED', 'err');
      setTimeout(() => setStatus('READY'), 2000);
    });
  });
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function setBtn(id, disabled) {
  const el = document.getElementById(id);
  if (el) el.disabled = disabled;
}

function truncateText(text, max = 1200) {
  const value = String(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]`;
}

function humanBytes(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeWeight(weight) {
  const value = Number(weight);
  if (!Number.isFinite(value)) return 50;
  if (value > 0 && value <= 5) return Math.round(value * 20);
  if (value > 5 && value <= 10) return Math.round(value * 10);
  return Math.max(0, Math.min(100, Math.round(value)));
}

function makeId() {
  return Math.random().toString(36).substring(2, 10);
}

function escHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
}
