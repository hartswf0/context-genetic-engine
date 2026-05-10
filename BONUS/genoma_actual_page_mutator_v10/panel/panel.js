'use strict';

const DEFAULT_KERNEL = `<poml version="2.0">
  <meta>
    <title>PRIME PROMPT — THE OPERATIONAL PRAGMATIST</title>
    <intent>Transform abstract inputs into active scripts of rigorous, tactile operations.</intent>
  </meta>
  <system>
    <role>You are an Operational Pragmatist. You reject the Occult Fallacy. The meaning of a word is its USE.</role>
    <epistemology>
      1. The message is the literal payload carried by the medium or channel.
      2. Maintain strict inner/outer and first-order/second-order distinctions.
    </epistemology>
    <directive>Do not summarize. Reconstruct the input into active operations. Every sentence must function like a slip of paper.</directive>
  </system>
  <design_constraints>
    <constraint type="contrast">Absolute black and white. Remove mid-tones. Maximize stark contrast.</constraint>
    <constraint type="interaction">Clicking a line of code/logic binds that box in the viewport and vice versa. Text operates as a physical control surface.</constraint>
    <constraint type="output">Refine the prompt, not the code. Output structural logic, UI topography, and operational states.</constraint>
  </design_constraints>
</poml>`;

const els = {};
let siteGenome = null;
let codons = [];
let codonStates = {};
let boundId = '';
let lastPatch = null;
let modelConfig = null;

window.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEls();
  bindEvents();
  els.kernel.value = DEFAULT_KERNEL;
  await loadConfig();
  status('READY', 'idle');
  log('STATUS', 'Loaded. Default is LOCAL mode: capture/annotate/patch works without API key. LLM is optional in Settings.');
}

function bindEls() {
  for (const id of ['status','directive','btnCapture','btnWhole','btnAnnotate','btnUndo','btnPatchCodon','btnStep','btnClear','btnDownload','pageSummary','theorySummary','encodingDeck','filter','boundCodon','codonChat','btnChat','btnToggle','patchReport','console','btnClearConsole','useLLM','provider','model','endpoint','apiKey','kernel','btnSaveConfig','btnTestModel']) {
    els[id] = document.getElementById(id);
  }
}

function bindEvents() {
  els.btnCapture.addEventListener('click', capturePage);
  els.btnWhole.addEventListener('click', () => patchWholePage('whole'));
  els.btnAnnotate.addEventListener('click', annotatePage);
  els.btnUndo.addEventListener('click', undoPatch);
  els.btnPatchCodon.addEventListener('click', patchBoundCodon);
  els.btnStep.addEventListener('click', () => patchWholePage('stepping'));
  els.btnClear.addEventListener('click', clearAnnotations);
  els.btnDownload.addEventListener('click', downloadState);
  els.btnChat.addEventListener('click', chatCodon);
  els.btnToggle.addEventListener('click', toggleBoundState);
  els.btnClearConsole.addEventListener('click', () => { els.console.innerHTML = ''; });
  els.filter.addEventListener('input', renderDeck);
  els.btnSaveConfig.addEventListener('click', saveConfig);
  els.btnTestModel.addEventListener('click', testModel);
  els.provider.addEventListener('change', applyProviderDefaults);
  els.useLLM.addEventListener('change', updateModelBadge);
}

function send(type, payload = {}) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type, payload }, res => resolve(res || { error: chrome.runtime.lastError?.message || 'No response' })));
}

async function loadConfig() {
  const res = await send('GET_CONFIG');
  if (res.ok) {
    modelConfig = res.raw;
    els.useLLM.checked = !!modelConfig.useLLM;
    els.provider.value = modelConfig.provider || 'local';
    els.model.value = modelConfig.model || 'llama3.1';
    els.endpoint.value = modelConfig.endpoint || 'http://localhost:11434/v1/chat/completions';
    els.apiKey.value = modelConfig.apiKey || '';
  } else {
    els.provider.value = 'local';
    applyProviderDefaults();
  }
  updateModelBadge();
}

function formConfig() {
  return { useLLM: els.useLLM.checked, provider: els.provider.value, model: els.model.value.trim(), endpoint: els.endpoint.value.trim(), apiKey: els.apiKey.value.trim() };
}

async function saveConfig() {
  const res = await send('SAVE_CONFIG', { config: formConfig() });
  if (!res.ok) return log('ERROR', res.error || 'Could not save config');
  modelConfig = formConfig();
  status('CONFIG SAVED', 'ok');
  log('STATUS', `Config saved. ${modelConfig.useLLM ? 'LLM on' : 'LLM off/local deterministic'} · ${modelConfig.provider}/${modelConfig.model}`);
  updateModelBadge();
}

async function testModel() {
  try {
    status('TESTING', 'work');
    const cfg = formConfig();
    if (!cfg.useLLM) throw new Error('Use LLM is off. Enable it before testing a model.');
    const res = await send('TEST_MODEL', { config: cfg });
    if (!res.ok) throw new Error(res.error || 'Test failed');
    status('MODEL OK', 'ok');
    log('RECV', res.text || 'Model OK');
  } catch (e) {
    status('MODEL ERROR', 'err');
    log('ERROR', e.message || String(e));
  }
}

function applyProviderDefaults() {
  const defaults = {
    local: ['llama3.1', 'http://localhost:11434/v1/chat/completions'],
    openai: ['gpt-4o-mini', 'https://api.openai.com/v1/chat/completions'],
    gemini: ['gemini-2.5-flash', 'https://generativelanguage.googleapis.com/v1beta/models'],
    anthropic: ['claude-sonnet-4-20250514', 'https://api.anthropic.com/v1/messages']
  }[els.provider.value] || ['llama3.1', 'http://localhost:11434/v1/chat/completions'];
  els.model.value = defaults[0];
  els.endpoint.value = defaults[1];
  updateModelBadge();
}

function updateModelBadge() {
  const mode = els.useLLM.checked ? `LLM ${els.provider.value}/${els.model.value || 'model'}` : 'LOCAL MODE';
  document.title = `GENOMA · ${mode}`;
}

async function capturePage() {
  try {
    status('CAPTURING', 'work');
    log('SEND', 'CAPTURE_PAGE: reading actual DOM and binding stable data-genoma selectors.');
    const res = await send('CAPTURE_PAGE');
    if (!res.ok) throw new Error(res.error || 'Capture failed');
    siteGenome = res.genome;
    codons = buildLocalCodons(siteGenome);
    codonStates = {};
    codons.forEach(c => { codonStates[c.id] = c.state; });
    boundId = codons[0]?.id || '';
    renderAll();
    status('CAPTURED', 'ok');
    log('RECV', `Captured ${siteGenome.stats?.anchors || 0} anchors; built ${codons.length} local codons. No LLM required.`);
  } catch (e) {
    status('ERROR', 'err');
    log('ERROR', e.message || String(e));
  }
}

function buildLocalCodons(genome) {
  const anchors = genome?.anchors || [];
  const out = [];
  const keep = anchors.filter(a => shouldKeepAnchor(a));
  for (const a of keep) {
    out.push({
      id: `codon_${a.id}`,
      type: a.type || 'TXT',
      locus: a.locus || 'site',
      selector: a.selector,
      payload: payloadForAnchor(a),
      containedSource: {
        anchorId: a.id,
        tag: a.tag,
        role: a.role,
        text: a.text,
        value: a.value,
        href: a.href,
        src: a.src,
        alt: a.alt,
        aria: a.aria,
        locked: a.locked,
        childCount: a.childCount,
        interactiveDescendants: a.interactiveDescendants,
        rect: a.rect,
        style: a.style,
        htmlStart: a.htmlStart
      },
      chatContract: a.locked ? 'Style or annotate this element. Do not alter href, src, form data, type, name, value, or behavior.' : 'May change text only if this is a leaf text node. Prefer style and inserted affordances.',
      whyValuable: whyValuable(a),
      state: 'EXON',
      dominance: scoreAnchor(a),
      patchPolicy: a.locked ? 'preserve-function' : 'mutable-safe'
    });
  }

  out.unshift({
    id: 'codon_global_invariants', type: 'INV', locus: 'invariant', selector: 'body',
    payload: 'Preserve all original content, links, buttons, forms, images, and purchase/navigation paths. Mutation must be reversible.',
    containedSource: { text: genome?.visibleText?.slice(0, 2000) || '', role: 'whole page invariant', locked: true },
    chatContract: 'This codon controls safety. It should almost always remain EXON.', whyValuable: 'Prevents fake remakes and destructive page replacement.', state: 'EXON', dominance: 1, patchPolicy: 'danger_locked'
  });
  out.unshift({
    id: 'codon_global_style', type: 'STY', locus: 'style', selector: 'body',
    payload: 'Global visual atmosphere and page-level readability.',
    containedSource: { text: genome?.specimen?.title || '', role: 'global style field', locked: true },
    chatContract: 'Can influence broad styling, but should not delete or replace page structure.', whyValuable: 'Lets whole-page evolution happen through style instead of content destruction.', state: 'EXON', dominance: 0.85, patchPolicy: 'amplify'
  });

  return out.slice(0, 240);
}

function shouldKeepAnchor(a) {
  if (!a) return false;
  if (['a','button','input','textarea','select','form','img'].includes(a.tag)) return true;
  if (['main','nav','header','footer','section','article'].includes(a.tag)) return true;
  if ((a.text || '').length > 0 && a.rect && a.rect.w > 15 && a.rect.h > 8) {
    if (a.childCount > 8 && a.interactiveDescendants > 0) return false;
    return true;
  }
  return false;
}

function payloadForAnchor(a) {
  const text = a.text || a.aria || a.alt || a.href || a.src || a.role || a.tag;
  if (a.type === 'OPR') return `Operation control: ${text}`;
  if (a.type === 'HPL') return `Hyperlink/path: ${text}`;
  if (a.type === 'IMG') return `Visual representation: ${a.alt || a.src || 'image'}`;
  if (a.type === 'ENT') return `Structural entity: ${a.role || a.tag}`;
  if (a.type === 'REP') return `Information hierarchy: ${text}`;
  return `Text/content unit: ${text}`;
}

function whyValuable(a) {
  if (a.locked) return 'Contains functionality or a source path that must survive mutation.';
  if (a.type === 'ENT') return 'Provides page structure and spatial context.';
  if (a.type === 'IMG') return 'Carries visual identity and product/media representation.';
  return 'Contains visible page meaning that can be styled or clarified.';
}

function scoreAnchor(a) {
  let s = 0.2;
  if (a.locked) s += 0.4;
  if (['main','nav','header','footer'].includes(a.tag)) s += 0.2;
  if ((a.text || '').length > 20) s += 0.1;
  if (a.rect && a.rect.w * a.rect.h > 20000) s += 0.1;
  return Math.min(1, Number(s.toFixed(2)));
}

function renderAll() {
  renderSummary();
  renderTheory();
  renderDeck();
  renderBoundCodon();
}

function renderSummary() {
  if (!siteGenome) { els.pageSummary.textContent = 'No capture yet.'; return; }
  const s = siteGenome.specimen || {}, st = siteGenome.stats || {};
  els.pageSummary.textContent = [
    `TITLE: ${s.title || ''}`,
    `URL: ${s.url || ''}`,
    `ANCHORS: ${st.anchors || 0}`,
    `CODONS: ${codons.length}`,
    `LINKS: ${st.links || 0}`,
    `BUTTONS: ${st.buttons || 0}`,
    `FORMS: ${st.forms || 0}`,
    `IMAGES: ${st.images || 0}`
  ].join('\n');
}

function renderTheory() {
  if (!siteGenome) return;
  const t = siteGenome.programTheorySeed || {};
  els.theorySummary.textContent = [
    `PURPOSE: ${t.purpose || ''}`,
    '',
    'INVARIANTS:',
    ...(t.invariants || []).map(x => `- ${x}`),
    '',
    'OPERATIONS FOUND:',
    ...(t.operations || []).slice(0, 14).map(x => `- ${x}`)
  ].join('\n');
}

function renderDeck() {
  const q = els.filter.value.trim().toLowerCase();
  const list = codons.filter(c => !q || JSON.stringify(c).toLowerCase().includes(q));
  els.encodingDeck.innerHTML = '';
  els.encodingDeck.className = list.length ? '' : 'empty';
  if (!list.length) { els.encodingDeck.textContent = codons.length ? 'No codons match filter.' : 'Capture page to create selector-bound codons.'; return; }

  for (const c of list) {
    const state = codonStates[c.id] || c.state || 'EXON';
    const row = document.createElement('div');
    row.className = `codonRow ${state === 'INTRON' ? 'intron' : ''} ${c.id === boundId ? 'bound' : ''}`;
    row.addEventListener('click', () => { boundId = c.id; renderDeck(); renderBoundCodon(); });
    row.innerHTML = `
      <div class="tag ${esc(c.type)}">${esc(c.type || 'UNK')}</div>
      <div>
        <div class="payload">${esc(c.payload || '')}</div>
        <div class="meta">${esc(c.locus || '')} · ${esc(c.selector || '')}<br>${esc(c.whyValuable || '')}</div>
      </div>
      <div class="codonOps"><button data-bind>BIND</button><button data-state>${state}</button></div>`;
    row.querySelector('[data-bind]').addEventListener('click', ev => { ev.stopPropagation(); boundId = c.id; renderDeck(); renderBoundCodon(); });
    row.querySelector('[data-state]').addEventListener('click', ev => { ev.stopPropagation(); toggleCodonState(c.id); });
    els.encodingDeck.appendChild(row);
  }
}

function renderBoundCodon() {
  const c = getBoundCodon();
  if (!c) { els.boundCodon.textContent = 'Bind a codon.'; return; }
  els.boundCodon.textContent = JSON.stringify({ ...c, state: codonStates[c.id] || c.state }, null, 2);
}

function getBoundCodon() { return codons.find(c => c.id === boundId); }

function toggleCodonState(id) {
  codonStates[id] = codonStates[id] === 'INTRON' ? 'EXON' : 'INTRON';
  renderDeck(); renderBoundCodon();
}

function toggleBoundState() {
  const c = getBoundCodon();
  if (!c) return log('ERROR', 'Bind a codon first.');
  toggleCodonState(c.id);
}

async function annotatePage() {
  if (!siteGenome) return log('ERROR', 'Capture page first.');
  const res = await send('ANNOTATE_CODONS', { codons, states: codonStates, boundId });
  if (!res.ok) return log('ERROR', res.error || 'Annotation failed');
  log('RECV', `Annotated ${res.result?.annotated || 0} actual elements.`);
}

async function clearAnnotations() {
  const res = await send('CLEAR_ANNOTATIONS');
  if (!res.ok) return log('ERROR', res.error || 'Could not clear annotations');
  log('STATUS', `Cleared ${res.result?.cleared || 0} marks.`);
}

async function chatCodon() {
  const c = getBoundCodon();
  const message = els.codonChat.value.trim();
  if (!c) return log('ERROR', 'Bind a codon first.');
  if (!message) return log('ERROR', 'Type a codon instruction first.');

  try {
    status('CODON CHAT', 'work');
    if (formConfig().useLLM) {
      log('SEND', `LLM_CODON_CHAT: ${c.id}`);
      const res = await send('CHAT_CODON_WITH_MODEL', { codon: c, message, kernel: els.kernel.value, config: formConfig() });
      if (!res.ok) throw new Error(res.error || 'LLM codon chat failed');
      replaceCodon(res.codon);
      log('RECV', `Codon updated by LLM: ${truncate(JSON.stringify(res.codon, null, 2), 1200)}`);
    } else {
      localMutateCodon(c, message);
      log('RECV', `Local codon mutation recorded on ${c.id}. No API key used.`);
    }
    status('CODON UPDATED', 'ok');
    renderDeck(); renderBoundCodon();
  } catch (e) {
    status('ERROR', 'err'); log('ERROR', e.message || String(e));
  }
}

function replaceCodon(next) {
  const i = codons.findIndex(c => c.id === next.id);
  if (i < 0) return;
  codons[i] = { ...codons[i], ...next, id: codons[i].id, selector: codons[i].selector, containedSource: codons[i].containedSource };
}

function localMutateCodon(c, message) {
  c.payload = `${c.payload}\nMUTATION REQUEST: ${message}`;
  c.chatContract = `${c.chatContract || ''}\nLatest local instruction: ${message}`.trim();
  if (/game|play|level|quest|score|arcade/i.test(message)) c.patchPolicy = 'gamify-preserve-function';
  if (/simpl|clear|read/i.test(message)) c.patchPolicy = 'clarify-preserve-function';
  if (/weird|diverge|stone/i.test(message)) c.patchPolicy = 'stepping-stone';
}

async function patchBoundCodon() {
  const c = getBoundCodon();
  if (!c) return log('ERROR', 'Bind a codon first.');
  let patch;
  try {
    status('PATCHING CODON', 'work');
    if (formConfig().useLLM) {
      log('SEND', `LLM_PLAN_BOUND_CODON: ${c.id}`);
      const res = await send('PLAN_WITH_MODEL', { mode: 'bound_codon', directive: els.directive.value, kernel: els.kernel.value, codon: c, codons: [c], config: formConfig() });
      if (!res.ok) throw new Error(res.error || 'Patch planning failed');
      patch = res.patch;
    } else {
      patch = localPlanForCodon(c, els.directive.value, els.codonChat.value);
      log('SEND', `LOCAL_PLAN_BOUND_CODON: ${c.id}`);
    }
    await applyPatch(patch);
  } catch (e) { status('ERROR', 'err'); log('ERROR', e.message || String(e)); }
}

async function patchWholePage(mode) {
  if (!siteGenome) await capturePage();
  if (!siteGenome) return;
  let patch;
  try {
    status(mode === 'stepping' ? 'STEPPING' : 'EVOLVING', 'work');
    const active = codons.filter(c => codonStates[c.id] !== 'INTRON');
    if (formConfig().useLLM) {
      log('SEND', `LLM_PLAN_${mode.toUpperCase()}: safe actual page patch.`);
      const res = await send('PLAN_WITH_MODEL', { mode, directive: els.directive.value, kernel: els.kernel.value, codons: active, config: formConfig() });
      if (!res.ok) throw new Error(res.error || 'Patch planning failed');
      patch = res.patch;
    } else {
      patch = mode === 'stepping' ? localSteppingStonePatch(active) : localWholePagePatch(active);
      log('SEND', `LOCAL_PLAN_${mode.toUpperCase()}: no API key used.`);
    }
    await applyPatch(patch);
  } catch (e) { status('ERROR', 'err'); log('ERROR', e.message || String(e)); }
}

async function applyPatch(patch) {
  lastPatch = patch || { report: 'No patch.', operations: [] };
  els.patchReport.textContent = JSON.stringify(lastPatch, null, 2);
  log('RECV', `Patch plan: ${truncate(JSON.stringify(lastPatch, null, 2), 2200)}`);
  if (!lastPatch.operations?.length) throw new Error('No safe operations to apply.');
  const res = await send('APPLY_PATCHES', { operations: lastPatch.operations });
  if (!res.ok) throw new Error(res.error || 'Apply failed');
  status('PATCHED', 'ok');
  log('RECV', `Applied ${res.result?.applied || 0}; skipped ${res.result?.skipped || 0}. Undo is available.`);
}

function localPlanForCodon(c, directive, chat) {
  const src = c.containedSource || {};
  const game = /game|play|level|quest|score|arcade|power/i.test(`${directive} ${chat} ${c.patchPolicy}`);
  const ops = [];
  const commonStyle = game ? {
    outline: '4px solid #000', boxShadow: '4px 4px 0 #000', borderRadius: '0px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.04em'
  } : { outline: '3px solid #000', boxShadow: '3px 3px 0 #000', fontWeight: '800' };
  ops.push({ op: 'setStyle', selector: c.selector, styles: commonStyle, reason: 'Make the bound codon visibly operational without destroying its function.' });
  if (!src.locked && !src.interactiveDescendants && (src.childCount || 0) === 0 && c.type === 'TXT' && /rename|say|text/i.test(chat || '')) {
    ops.push({ op: 'setText', selector: c.selector, text: chat.slice(0, 180), reason: 'Leaf text codon can safely receive text mutation.' });
  }
  if (game) {
    ops.push({ op: 'insertHTML', selector: c.selector, position: src.locked ? 'afterend' : 'afterbegin', html: `<div style="border:2px solid #000;background:#fff;color:#000;padding:4px 6px;font:900 11px ui-monospace,monospace;display:inline-block;margin:4px 0;box-shadow:2px 2px 0 #000">GENOMA LEVEL NODE</div>`, reason: 'Add game-like affordance as a reversible inserted layer, not by replacing content.' });
  }
  return { report: `Local bound-codon patch for ${c.id}. Functionality preserved.`, operations: ops };
}

function localWholePagePatch(active) {
  const ops = [];
  const structure = active.find(c => c.id === 'codon_global_style') || active.find(c => c.selector === 'body');
  if (structure) {
    ops.push({ op: 'setStyle', selector: structure.selector, styles: { color: '#000', backgroundColor: '#fff', fontWeight: '500' }, reason: 'Clarify global readability without replacing structure.' });
    ops.push({ op: 'insertHTML', selector: structure.selector, position: 'afterbegin', html: `<div style="position:sticky;top:0;z-index:2147480000;border:3px solid #000;background:#fff;color:#000;padding:8px 10px;font:900 12px ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;box-shadow:4px 4px 0 #000">GENOMA EVOLVED · SOURCE FUNCTION PRESERVED</div>`, reason: 'Surface system state as reversible UI layer.' });
  }
  const controls = active.filter(c => ['OPR','HPL'].includes(c.type)).slice(0, 90);
  for (const c of controls) {
    ops.push({ op: 'setStyle', selector: c.selector, styles: { outline: '2px solid #000', boxShadow: '2px 2px 0 #000', borderRadius: '0px', fontWeight: '900', textDecoration: 'none' }, reason: 'Make existing controls more visible while preserving behavior.' });
  }
  const reps = active.filter(c => ['IMG','REP'].includes(c.type)).slice(0, 30);
  for (const c of reps) ops.push({ op: 'setStyle', selector: c.selector, styles: { outline: '3px solid #000', boxShadow: '3px 3px 0 #000' }, reason: 'Make representations legible as visible cards.' });
  return { report: 'Local whole-page evolution: styles and reversible HUD only. No content/functionality erased.', operations: ops };
}

function localSteppingStonePatch(active) {
  const ops = localWholePagePatch(active).operations;
  const body = active.find(c => c.selector === 'body') || active[0];
  if (body) {
    ops.unshift({ op: 'insertHTML', selector: body.selector, position: 'afterbegin', html: `<div style="position:fixed;right:10px;bottom:10px;z-index:2147480000;border:4px solid #000;background:#fff;color:#000;padding:10px;font:900 12px ui-monospace,monospace;box-shadow:5px 5px 0 #000;max-width:260px">STEPPING STONE MODE<br><span style="font-weight:400">Controls became play objects. Content stayed alive.</span></div>`, reason: 'Create a divergent reversible layer instead of breeding/remaking.' });
  }
  const buttons = active.filter(c => c.type === 'OPR').slice(0, 80);
  buttons.forEach((c, i) => ops.push({ op: 'insertHTML', selector: c.selector, position: 'beforebegin', html: `<span style="display:inline-block;border:2px solid #000;background:#ffff80;color:#000;font:900 10px ui-monospace,monospace;padding:2px 4px;margin:2px">LV.${String(i+1).padStart(2,'0')}</span>`, reason: 'Add level markers as non-destructive affordances.' }));
  return { report: 'Local stepping stone: game overlay and level markers. No destructive operations.', operations: ops };
}

async function undoPatch() {
  const res = await send('UNDO_PATCHES');
  if (!res.ok) return log('ERROR', res.error || 'Undo failed');
  status('UNDONE', 'ok');
  log('RECV', `Restored ${res.result?.restored || 0} changes.`);
}

function downloadState() {
  const state = { version: 'v10', capturedAt: Date.now(), siteGenome, codons, codonStates, boundId, lastPatch };
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `genoma-page-state-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
}

function status(text, state = 'idle') {
  els.status.textContent = text;
  els.status.className = `status ${state}`;
}

function log(kind, text) {
  const div = document.createElement('div');
  div.className = `log ${kind}`;
  div.innerHTML = `<b>${esc(kind)}</b> ${new Date().toLocaleTimeString()} · ${esc(text)}`;
  els.console.prepend(div);
}

function truncate(s, n = 1000) { return String(s || '').length > n ? String(s).slice(0, n) + '\n...[truncated]' : String(s || ''); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[ch])); }
