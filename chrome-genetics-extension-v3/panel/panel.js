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
let currentGenome = null;       // <DOMGenome> just extracted, not yet saved
let lineage = {};               // All stored genomes from vault
let parentA = null;             // <DOMGenome> selected as Parent A
let parentB = null;             // <DOMGenome> selected as Parent B
let lastPhenotype = '';         // Last <Phenotype> HTML output
let lastFieldArtifact = '';     // Last direct genotype expression artifact
let phenotypeBlobUrl = '';
let fieldBlobUrl = '';
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
Extract operational prompt codons mapped only to these loci:
1. RSN: Reasoning Order
2. EVD: Evidence Policy
3. OUT: Output Form
4. FLR: Failure Handling
5. FIT: Fitness Pressure / Optimization target
6. CST: Custom explicit trait/constraint

DOM observations such as layout, color, typography, components, interaction, copy, and radius are evidence. Convert them into useful prompt controls.
Output JSON only: an array of objects with { "type": "RSN|EVD|OUT|FLR|FIT|CST", "payload": "specific instruction text", "state": "EXON", "weight": integer }.`;

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
}

function updateProviderDefaults() {
  const provider = document.getElementById('provider-select')?.value || 'gemini';
  const defaults = PROVIDER_DEFAULTS[provider];
  document.getElementById('model-input').value = defaults.model;
  document.getElementById('endpoint-input').value = defaults.endpoint;
  updateProviderPlaceholders();
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
  setStatus('EXTRACTING GENOME...', 'work');
  setBtn('btn-extract', true);
  document.getElementById('extract-empty').style.display = 'none';

  chrome.runtime.sendMessage({ type: 'EXTRACT_PAGE' }, (response) => {
    setBtn('btn-extract', false);

    if (!response || response.error) {
      setStatus('EXTRACTION FAILED — CSP BLOCK?', 'err');
      document.getElementById('extract-empty').style.display = 'block';
      document.getElementById('extract-empty').querySelector('.empty-desc').textContent =
        response?.error || 'Content Security Policy blocked extraction on this page.';
      return;
    }

    const rawGenome = normalizeGenome(response.genome);
    currentGenome = transcribeDomGenome(rawGenome);
    renderExtractedCodons(rawGenome);
    renderGenomeEditor();
    setBtn('btn-overlay', false);
    setBtn('btn-save', false);
    setBtn('btn-load-genome', false);
    setBtn('btn-ai-encode', false);
    setStatus(`EXTRACTED ${currentGenome.codons.length} CODONS`, 'ok');
    document.getElementById('count-extract').textContent = currentGenome.codons.length;
    updateGenomeCount();
    setTimeout(() => setStatus('READY'), 3000);
  });
}

function renderExtractedCodons(genome) {
  const section = document.getElementById('extracted-codons-section');
  const container = document.getElementById('extracted-codons-container');
  section.style.display = 'block';
  document.getElementById('codon-count-badge').textContent = `(${genome.codons.length} loci)`;

  container.innerHTML = '';
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
    codons: [
      { type: 'RSN', weight: 90, payload: `Construct a theory of the program before producing output. Treat "${sourceTitle}" as environmental evidence and distinguish observations from instructions.` },
      { type: 'EVD', weight: 88, payload: `Use extracted page evidence as source material. Evidence observed:\n${truncateText(observed, 1200)}` },
      { type: 'OUT', weight: 82, payload: 'Return a functional, inspectable artifact with explicit structure, states, controls, and source/render modes when useful.' },
      { type: 'FLR', weight: 76, payload: 'If evidence is incomplete or a page is restricted, state the missing condition and produce the closest safe compiled prompt or artifact.' },
      { type: 'FIT', weight: 84, payload: `Optimize for source fidelity, usable interface behavior, and clear mapping from page evidence into operational prompt controls. Components: ${byType.COMPONENT || 'not observed'}` },
      { type: 'CST', weight: 70, payload: `Preserve useful structural signals from the page without mistaking raw DOM traits for the final genotype. Style evidence: ${[byType.COLOR, byType.TYPOGRAPHY, byType.RADIUS].filter(Boolean).join(' ')}` }
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
    weight: Number(codon.weight || 50),
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
    setStatus('API KEY REQUIRED — USING LOCAL TRANSCRIPTION', 'err');
    setTimeout(() => setStatus('READY'), 3000);
    return;
  }

  const rawEvidence = currentGenome.rawCodons?.length ? currentGenome.rawCodons : currentGenome.codons;
  const prompt = [
    `SOURCE_TITLE: ${currentGenome.sourceTitle}`,
    `SOURCE_URL: ${currentGenome.sourceUrl}`,
    '',
    'ENVIRONMENTAL MEDIUM:',
    rawEvidence.map(c => `[${c.type}] ${c.payload}`).join('\n')
  ].join('\n');

  setStatus('AI ENCODING PROMPT GENOTYPE...', 'work');
  chrome.runtime.sendMessage({
    type: 'EXPRESS_PHENOTYPE',
    payload: { modelConfig: activeConfig, systemPrompt: GENOTYPE_TRANSCRIPTION_PROMPT, userTask: prompt }
  }, (resp) => {
    if (!resp || resp.error) {
      setStatus('AI ENCODE FAILED — KEPT LOCAL TRANSCRIPTION', 'err');
      setTimeout(() => setStatus('READY'), 4000);
      return;
    }

    const parsed = parseCodonArray(resp.result);
    if (!parsed.length) {
      setStatus('AI ENCODE RETURNED NO CODONS', 'err');
      setTimeout(() => setStatus('READY'), 4000);
      return;
    }

    currentGenome.codons = parsed.map(normalizeCodon);
    renderGenomeEditor();
    setStatus('PROMPT GENOTYPE ENCODED', 'ok');
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

// ─── OVERLAY ──────────────────────────────────────────────────────────────────
// Theory: [annotate] operation — toggles the shadow-DOM overlay on the live page
function toggleOverlay() {
  if (!currentGenome) return;
  overlayActive = !overlayActive;

  chrome.runtime.sendMessage({
    type: 'TOGGLE_OVERLAY',
    payload: { genome: currentGenome, show: overlayActive }
  }, () => {
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
      <img class="genome-favicon" src="https://www.google.com/s2/favicons?domain=${hostname}&sz=32" alt="">
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

  card.querySelector('.genome-favicon')?.addEventListener('error', (e) => {
    e.currentTarget.style.display = 'none';
  });

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
  const summary = [
    `Source: ${genome.sourceTitle || 'Unknown'}`,
    `URL: ${genome.sourceUrl || 'Unknown'}`,
    '',
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
  const systemPrompt = 'You are inspecting one prompt codon inside a larger active genotype. Answer concretely. If asked for a mutation, output the replacement payload clearly.';
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
    log.textContent = `[ ${codon.type} ]\n${resp.result || ''}`;
    setStatus('CODON RESPONSE READY', 'ok');
    setTimeout(() => setStatus('READY'), 2200);
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
  if (previousUrl) URL.revokeObjectURL(previousUrl);
  const doc = html.includes('<html') || html.includes('<!DOCTYPE')
    ? html
    : `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  const url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
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

function makeId() {
  return Math.random().toString(36).substring(2, 10);
}

function escHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
}
