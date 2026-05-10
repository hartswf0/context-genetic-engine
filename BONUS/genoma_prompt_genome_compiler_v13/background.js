'use strict';

const PROVIDER_DEFAULTS = {
  local: { endpoint: 'http://localhost:11434/v1/chat/completions', reasoningModel: 'llama3.1', fastModel: 'llama3.1' },
  openai: { endpoint: 'https://api.openai.com/v1/responses', reasoningModel: 'gpt-5.1', fastModel: 'gpt-5.1' },
  gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', reasoningModel: 'gemini-2.5-flash', fastModel: 'gemini-2.5-flash' },
  anthropic: { endpoint: 'https://api.anthropic.com/v1/messages', reasoningModel: 'claude-sonnet-4-20250514', fastModel: 'claude-sonnet-4-20250514' }
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.action.onClicked.addListener(tab => {
  if (tab?.id && chrome.sidePanel?.open) chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const type = msg?.type;
  const payload = msg?.payload || {};
  switch (type) {
    case 'GET_CONFIG': {
      loadConfig().then(config => sendResponse({ ok: true, raw: config, config: scrubConfig(config) })).catch(e => sendResponse({ error: e.message }));
      return true;
    }
    case 'SAVE_CONFIG': {
      const config = normalizeConfig(payload.config || {});
      chrome.storage.local.set({ genoma_v13_model_config: config }, () => {
        const err = chrome.runtime.lastError?.message;
        sendResponse(err ? { error: err } : { ok: true, config: scrubConfig(config) });
      });
      return true;
    }
    case 'TEST_MODEL': {
      callModel({ system: 'Return exactly: GENOMA REASONING MODEL OK', prompt: 'Health check.', config: payload.config || {}, tier: payload.tier || 'reasoning' })
        .then(text => sendResponse({ ok: true, text: String(text || '').slice(0, 600) }))
        .catch(e => sendResponse({ error: e.message }));
      return true;
    }
    case 'CAPTURE_PAGE': {
      withActiveTab(sendResponse, async tab => {
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureF0Page, args: [tab.url, tab.title] });
        return { ok: true, genome: results?.[0]?.result || null };
      });
      return true;
    }
    case 'ENCODE_PROMPT_GENOME_MODEL': {
      encodePromptGenomeModel(payload).then(out => sendResponse({ ok: true, ...out })).catch(e => sendResponse({ error: e.message }));
      return true;
    }
    case 'EXPRESS_CHILD_MODEL': {
      expressChildModel(payload).then(out => sendResponse({ ok: true, ...out })).catch(e => sendResponse({ error: e.message }));
      return true;
    }
    case 'MUTATE_CODON_MODEL': {
      mutateCodonModel(payload).then(out => sendResponse({ ok: true, ...out })).catch(e => sendResponse({ error: e.message }));
      return true;
    }
    case 'INSTALL_CHILD_PHENOTYPE': {
      withActiveTab(sendResponse, async tab => {
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: installChildPhenotype, args: [payload.child || {}, payload.mode || 'child'] });
        return { ok: true, result: results?.[0]?.result || {} };
      });
      return true;
    }
    case 'SET_CHILD_MODE': {
      withActiveTab(sendResponse, async tab => {
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: setChildMode, args: [payload.mode || 'original'] });
        return { ok: true, result: results?.[0]?.result || {} };
      });
      return true;
    }
    case 'CLEAR_CHILD_PHENOTYPE': {
      withActiveTab(sendResponse, async tab => {
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: clearChildPhenotype });
        return { ok: true, result: results?.[0]?.result || {} };
      });
      return true;
    }

    case 'OPEN_CHILD_ARTIFACT': {
      openChildArtifactPage(payload).then(out => sendResponse({ ok: true, ...out })).catch(e => sendResponse({ error: e.message }));
      return true;
    }
    case 'SHOW_PAGE_STATUS': {
      withActiveTab(sendResponse, async tab => {
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: showGenomaPageStatus, args: [payload || {}] });
        return { ok: true, result: results?.[0]?.result || {} };
      });
      return true;
    }
    default:
      sendResponse({ error: `Unknown message type: ${type}` });
      return false;
  }
});

async function openChildArtifactPage(payload = {}) {
  const pack = { child: payload.child || {}, state: payload.state || {}, openedAt: Date.now() };
  await chrome.storage.local.set({ genoma_v13_program_artifact: pack });
  const url = chrome.runtime.getURL('artifact/artifact.html');
  const tab = await chrome.tabs.create({ url, active: true });
  return { url, tabId: tab?.id || null };
}

function withActiveTab(sendResponse, fn) {
  chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
    try {
      const tab = tabs?.[0];
      if (!tab?.id) throw new Error('No active tab.');
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) throw new Error('Open a normal webpage first.');
      sendResponse(await fn(tab));
    } catch (e) { sendResponse({ error: e.message || String(e) }); }
  });
}

async function loadConfig(incoming = {}) {
  const stored = await chrome.storage.local.get(['genoma_v13_model_config']);
  return normalizeConfig({ ...(stored.genoma_v13_model_config || {}), ...incoming });
}

function normalizeConfig(config = {}) {
  const provider = PROVIDER_DEFAULTS[config.provider] ? config.provider : 'openai';
  const d = PROVIDER_DEFAULTS[provider];
  return {
    provider,
    endpoint: String(config.endpoint || d.endpoint).trim(),
    reasoningModel: String(config.reasoningModel || config.model || d.reasoningModel).trim(),
    fastModel: String(config.fastModel || d.fastModel).trim(),
    apiKey: String(config.apiKey || '').trim()
  };
}

function scrubConfig(c) { return { ...c, apiKey: c.apiKey ? '[stored]' : '' }; }
function requireModel(c) { if (!c.endpoint || !c.reasoningModel) throw new Error('Configure model endpoint and reasoning model.'); if (c.provider !== 'local' && !c.apiKey) throw new Error(`${c.provider} API key required.`); }

async function encodePromptGenomeModel(payload) {
  const config = await loadConfig(payload.config || {});
  requireModel(config);
  const system = [
    'You are GENOMA Prompt Genome Compiler, an LLM-first prompt-genome encoder and program-text compiler.',
    'The live page is F0 baseline evidence, not the thing to destructively patch.',
    'Your job: convert page evidence into two genomes.',
    '1) Prompt Genome: reusable instruction infrastructure using RSN/EVD/STY/FLR/MUT/SEL codons.',
    '2) Operation Code Genome: page systems and leverage points using ENT/OPR/INV/HPL/IMG/TXT/STY/REP codons.',
    'Return JSON only. No markdown.',
    'Do not dump raw DOM. Compress into small meaningful codons.',
    'Prompt codons must be explicit enough to regenerate a steerable UI idea better than the page code.',
    'Operation codons must use only supplied selectors as anchors. Group related anchors into systems.',
    'The current page is the default fitness baseline: preserve content, routes, interactions, identity, and improve steerability.'
  ].join('\n');
  const prompt = JSON.stringify({
    directive: payload.directive || '', generation: payload.generation || 0,
    kernel: String(payload.kernel || '').slice(0, 9000), evidence: payload.genome || {},
    requiredShape: {
      promptGenome: { codons: [
        { id:'RSN_page_reasoning', type:'RSN', title:'Reasoning Order', locus:'reasoning', payload:'instruction text', controls:'what this codon controls', allowedChanges:['...'], forbiddenChanges:['...'], state:'EXON', dominance:0.9 },
        { id:'EVD_source_fidelity', type:'EVD', title:'Evidence Policy', locus:'evidence', payload:'instruction text', controls:'...', state:'EXON' },
        { id:'STY_visual_grammar', type:'STY', title:'Style System', locus:'style', payload:'instruction text', controls:'...', state:'EXON' },
        { id:'FLR_failure_policy', type:'FLR', title:'Failure Rule', locus:'failure', payload:'instruction text', controls:'...', state:'EXON' },
        { id:'MUT_mutation_policy', type:'MUT', title:'Mutation Policy', locus:'mutation', payload:'instruction text', controls:'...', state:'EXON' },
        { id:'SEL_selection_pressure', type:'SEL', title:'Selection Pressure', locus:'fitness', payload:'instruction text', controls:'...', state:'EXON' }
      ]},
      operationGenome: { codons: [
        { id:'navigation_system', type:'HPL', label:'Navigation System', locus:'wayfinding', controls:'what it controls', payload:'short instruction', anchors:['provided selectors only'], allowedMutations:['...'], forbiddenMutations:['...'], state:'EXON' }
      ]},
      fitnessBaseline: { summary:'F0 baseline as fitness oracle', contentInventory:['...'], routeInventory:['...'], interactionInventory:['...'], visualSignature:['...'], linkCount:0, imageCount:0 }
    }
  }, null, 2);
  const raw = await callModel({ system, prompt, config, tier: 'reasoning' });
  const encoded = parseJSONLike(raw);
  if (!encoded) throw new Error('Model did not return parseable genome JSON.');
  encoded.promptGenome = normalizePromptGenome(encoded.promptGenome);
  encoded.operationGenome = normalizeOperationGenome(encoded.operationGenome, payload.genome || {});
  encoded.fitnessBaseline = encoded.fitnessBaseline || {};
  return { raw, encoded };
}

async function expressChildModel(payload) {
  const config = await loadConfig(payload.config || {});
  requireModel(config);
  const system = [
    'You are GENOMA Program Text Compiler.',
    'The prompt genome is the main infrastructure. Your job is to compile it into runnable program text: a standalone HTML/CSS interface artifact.',
    'Do NOT patch the live DOM. Do NOT create a tiny banner. Generate a complete visible UI artifact that opens in its own extension artifact page.',
    'Use the current page as F0 fitness baseline. Preserve content, routes, links, form intent, media references, product/page identity, and task meaning.',
    'Return JSON only with {childUI,diff,fitness,nextPromptGenome}.',
    'childUI.html must be static safe HTML. No scripts, no inline event handlers, no external JS, no iframe.',
    'childUI.html must be substantial: header, primary operation area, preserved content stations/cards, navigation/link systems, media/reference zones, and clear calls to action using original URLs when available.',
    'childUI.css must be static CSS scoped to the artifact. Avoid imports.',
    'The artifact must visibly embody the directive and prompt genome. It should feel like a designed program, not a generic summary.',
    'The output is the code/program-text phenotype. The original live page remains only the F0 baseline.'
  ].join('\n');
  const prompt = JSON.stringify({
    directive: payload.directive || '', generation: payload.generation || 1,
    kernel: String(payload.kernel || '').slice(0, 9000),
    promptGenome: payload.promptGenome || [], operationGenome: payload.operationGenome || [], fitnessBaseline: payload.fitnessBaseline || {}, evidence: payload.evidence || {},
    requiredShape: {
      childUI: { title:'Program artifact title', summary:'what the compiled interface does', html:'<main>substantial static standalone UI program with sections/cards/controls/content preserved</main>', css:'static CSS for artifact' },
      diff: { summary:'original vs child', visual:['...'], content:['...'], operation:['...'] },
      fitness: { contentPreservation: 0, operationPreservation: 0, visualImprovement: 0, conceptualStrength: 0, steerability: 0, notes:'...' },
      nextPromptGenome: { codons: 'optional mutated prompt genome codons if selection should carry forward' }
    }
  }, null, 2);
  const raw = await callModel({ system, prompt, config, tier: 'reasoning' });
  const child = parseJSONLike(raw);
  if (!child?.childUI && !child?.html) throw new Error('Model did not return childUI JSON.');
  return { raw, child };
}

async function mutateCodonModel(payload) {
  const config = await loadConfig(payload.config || {});
  requireModel(config);
  const system = [
    'You are GENOMA Single-Codon Mutator.',
    'Operate only on the bound codon. The codon is infrastructure, not a note.',
    'Return JSON only: the full updated codon object.',
    'Update payload/controls/allowedChanges/forbiddenChanges so the visible genome changes.',
    'Preserve id and type unless the type is empty. Preserve anchors if present.'
  ].join('\n');
  const prompt = JSON.stringify({ kind: payload.kind || 'prompt', instruction: payload.message || '', kernel: String(payload.kernel || '').slice(0, 9000), codon: payload.codon || {} }, null, 2);
  const raw = await callModel({ system, prompt, config, tier: 'fast' });
  const codon = parseJSONLike(raw);
  if (!codon) throw new Error('Model did not return a JSON codon.');
  codon.id = payload.codon?.id || codon.id;
  if (payload.codon?.anchors) codon.anchors = payload.codon.anchors;
  return { raw, codon: { ...payload.codon, ...codon } };
}

function normalizePromptGenome(g) {
  const codons = Array.isArray(g?.codons) ? g.codons : Array.isArray(g) ? g : [];
  const want = ['RSN','EVD','STY','FLR','MUT','SEL'];
  const out = codons.map((c, i) => ({
    id: safeId(c.id || `${c.type || 'PROMPT'}_${i}`), type: String(c.type || want[i] || 'CST').toUpperCase().slice(0,6),
    title: String(c.title || c.label || c.type || `Prompt Codon ${i+1}`).slice(0,90), locus: String(c.locus || '').slice(0,80),
    payload: String(c.payload || c.instruction || c.controls || '').slice(0,1800), controls: String(c.controls || c.purpose || '').slice(0,700),
    allowedChanges: list(c.allowedChanges || c.allowedMutations || ['mutate payload']).slice(0,8), forbiddenChanges: list(c.forbiddenChanges || c.forbiddenMutations || ['break source fidelity']).slice(0,8),
    state: c.state === 'INTRON' ? 'INTRON' : 'EXON', dominance: Number(c.dominance ?? 0.5)
  })).slice(0,12);
  // Ensure there is at least a minimal prompt genome if the model under-returns.
  for (const type of want) if (!out.some(c => c.type === type)) out.push({ id: `${type}_missing`, type, title: `${type} Codon`, locus: type, payload: `Define ${type} behavior from F0 evidence.`, controls: `${type} infrastructure`, allowedChanges:['rewrite payload'], forbiddenChanges:['erase source constraints'], state:'EXON', dominance:0.5 });
  return { codons: out.slice(0,12) };
}

function normalizeOperationGenome(g, evidence) {
  const allowed = new Set(['body', ...((evidence.anchors || []).map(a => a.selector).filter(Boolean))]);
  const codons = Array.isArray(g?.codons) ? g.codons : Array.isArray(g) ? g : [];
  return { codons: codons.map((c, i) => {
    let anchors = Array.isArray(c.anchors) ? c.anchors.filter(s => allowed.has(s)) : [];
    if (!anchors.length) anchors = (evidence.anchors || []).slice(i*6, i*6+6).map(a => a.selector).filter(Boolean);
    return { id: safeId(c.id || `operation_${i}`), type: String(c.type || 'OPR').toUpperCase().slice(0,6), label: String(c.label || c.title || `Operation ${i+1}`).slice(0,90), locus: String(c.locus || 'operation').slice(0,80), controls: String(c.controls || c.payload || '').slice(0,800), payload: String(c.payload || c.controls || '').slice(0,1200), anchors: anchors.slice(0,80), allowedMutations: list(c.allowedMutations || ['overlay','style','labels']).slice(0,8), forbiddenMutations: list(c.forbiddenMutations || ['delete','replace','break hrefs/forms']).slice(0,8), state: c.state === 'INTRON' ? 'INTRON' : 'EXON', dominance: Number(c.dominance ?? 0.5) };
  }).slice(0,12) };
}

async function callModel({ system, prompt, config, tier = 'reasoning' }) {
  const cfg = normalizeConfig(config);
  const model = tier === 'fast' ? (cfg.fastModel || cfg.reasoningModel) : (cfg.reasoningModel || cfg.fastModel);
  if (cfg.provider !== 'local' && !cfg.apiKey) throw new Error(`API key required for ${cfg.provider}.`);

  if (cfg.provider === 'gemini') {
    const base = cfg.endpoint.replace(/\/$/, '');
    const url = `${base}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ systemInstruction:{ parts:[{text:system}] }, contents:[{ parts:[{ text: prompt }] }], generationConfig:{ temperature:0.15 } }) });
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 400)}`);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
  }

  if (cfg.provider === 'anthropic') {
    const res = await fetch(cfg.endpoint, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':cfg.apiKey,'anthropic-version':'2023-06-01'}, body: JSON.stringify({ model, max_tokens: 8192, temperature:0.15, system, messages:[{ role:'user', content: prompt }] }) });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${(await res.text()).slice(0,400)}`);
    const data = await res.json();
    return (data.content || []).map(x => x.text || '').join('\n');
  }

  const headers = { 'Content-Type':'application/json' };
  if (cfg.provider === 'openai' && cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  if (cfg.provider === 'openai') {
    const base = cfg.endpoint.includes('/chat/completions')
      ? cfg.endpoint.replace('/chat/completions', '/responses')
      : cfg.endpoint.includes('/responses')
        ? cfg.endpoint
        : 'https://api.openai.com/v1/responses';
    const body = {
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      max_output_tokens: tier === 'fast' ? 4096 : 12000
    };
    if (/^gpt-5/i.test(model)) body.reasoning = { effort: tier === 'fast' ? 'low' : 'medium' };
    const res = await fetch(base, { method:'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${(await res.text()).slice(0,400)}`);
    const data = await res.json();
    if (data.output_text) return data.output_text;
    const parts = [];
    for (const item of data.output || []) {
      for (const c of item.content || []) {
        if (c.type === 'output_text' || c.type === 'text') parts.push(c.text || '');
      }
    }
    return parts.join('\n');
  }

  // Local OpenAI-compatible chat completion.
  const res = await fetch(cfg.endpoint, { method:'POST', headers, body: JSON.stringify({ model, temperature:0.15, messages:[{ role:'system', content: system }, { role:'user', content: prompt }] }) });
  if (!res.ok) throw new Error(`${cfg.provider} error ${res.status}: ${(await res.text()).slice(0,400)}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

function parseJSONLike(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch (_) {}
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch (_) {} }
  const obj = s.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch (_) {} }
  return null;
}
function list(x){ return Array.isArray(x) ? x.map(v => String(v).slice(0,200)) : [String(x || '').slice(0,200)].filter(Boolean); }
function safeId(s){ return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,80) || `id_${Math.random().toString(36).slice(2,8)}`; }

// Runs in the actual page: capture F0 evidence and bind stable anchors.
function captureF0Page(url, title) {
  document.querySelectorAll('[data-genoma-anchor-id]').forEach(el => { if (!el.closest('[data-genoma-ui="true"]')) el.removeAttribute('data-genoma-anchor-id'); });
  const selectors = ['a','button','input','textarea','select','form','img','video','main','nav','header','footer','section','article','h1','h2','h3','h4','[role]','[aria-label]','li','p','span','div'].join(',');
  const els = Array.from(document.querySelectorAll(selectors));
  const seen = new Set();
  const anchors = [];
  for (const el of els) {
    if (anchors.length >= 420) break;
    if (!(el instanceof HTMLElement) || el.closest('[data-genoma-ui="true"]')) continue;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const visible = rect.width > 2 && rect.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0.01;
    if (!visible) continue;
    const tag = el.tagName.toLowerCase();
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.alt || '').replace(/\s+/g,' ').trim();
    const href = el instanceof HTMLAnchorElement ? el.href : '';
    const src = (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) ? el.currentSrc || el.src : '';
    const meaningful = text || href || src || ['input','textarea','select','form','main','nav','header','footer','section','article'].includes(tag) || el.getAttribute('role') || el.getAttribute('aria-label');
    if (!meaningful) continue;
    const key = `${tag}:${text.slice(0,70)}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = `genoma_${anchors.length}`;
    el.setAttribute('data-genoma-anchor-id', id);
    const interactiveDescendants = el.querySelectorAll('a,button,input,textarea,select,form').length;
    const role = inferRole(el, tag, text, interactiveDescendants);
    const type = inferType(tag, href, src, role);
    const locus = inferLocus(tag, href, src, role);
    anchors.push({ id, selector:`[data-genoma-anchor-id="${id}"]`, tag, type, locus, role, text:text.slice(0,1000), href, src, alt:el.getAttribute('alt') || '', aria:el.getAttribute('aria-label') || '', name:el.getAttribute('name') || '', action:tag === 'form' ? el.getAttribute('action') || '' : '', method:tag === 'form' ? el.getAttribute('method') || '' : '', locked: ['a','button','input','textarea','select','form'].includes(tag) || !!href || !!src || interactiveDescendants > 0, rect:{x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height)}, style:{display:cs.display,position:cs.position,backgroundColor:cs.backgroundColor,color:cs.color,fontFamily:cs.fontFamily,fontSize:cs.fontSize,fontWeight:cs.fontWeight,borderRadius:cs.borderRadius,padding:cs.padding,margin:cs.margin}, htmlStart:el.outerHTML.replace(/\s+/g,' ').slice(0,650) });
  }
  const visibleText = document.body ? (document.body.innerText || '').replace(/\s+/g,' ').trim().slice(0,7000) : '';
  return { schemaVersion:'genoma.compiler.v13', specimen:{url,title,capturedAt:Date.now(),viewport:{w:innerWidth,h:innerHeight},userAgent:navigator.userAgent}, stats:{anchors:anchors.length,links:anchors.filter(a=>a.tag==='a').length,buttons:anchors.filter(a=>a.tag==='button').length,forms:anchors.filter(a=>a.tag==='form').length,inputs:anchors.filter(a=>['input','textarea','select'].includes(a.tag)).length,images:anchors.filter(a=>a.tag==='img').length}, programTheorySeed:{purpose:`F0 page organism: ${title || location.hostname}`, invariants:['Use F0 as fitness baseline.','Preserve content, links, forms, navigation, images, and identity.','Program text/artifact is generated as a standalone phenotype, not a destructive patch.','Prompt genome is the main infrastructure; program text is compiled from it.']}, visibleText, anchors };
  function inferRole(el, tag, text, interactiveDescendants){ const explicit = el.getAttribute('role') || el.getAttribute('aria-label') || ''; if (explicit) return explicit.slice(0,90); if(tag==='a') return 'navigation/link'; if(tag==='button') return 'button/action'; if(tag==='form') return 'form/submission path'; if(['input','textarea','select'].includes(tag)) return 'input/user data capture'; if(tag==='img') return 'image/visual representation'; if(['main','section','article'].includes(tag)) return interactiveDescendants ? 'structural container with controls' : 'content region'; if(['nav','header','footer'].includes(tag)) return `${tag}/site wayfinding`; if(/^h[1-4]$/.test(tag)) return 'heading/information hierarchy'; return text ? 'text/content' : 'page structure'; }
  function inferType(tag, href, src, role){ if(tag==='a') return 'HPL'; if(['button','input','textarea','select','form'].includes(tag)) return 'OPR'; if(tag==='img'||src) return 'IMG'; if(['main','nav','header','footer','section','article'].includes(tag)) return 'ENT'; if(/heading|hierarchy/.test(role)) return 'REP'; return 'TXT'; }
  function inferLocus(tag, href, src, role){ if(href || tag==='a') return 'link'; if(['button','input','textarea','select','form'].includes(tag)) return 'operation'; if(src || tag==='img') return 'representation'; if(['main','nav','header','footer','section','article'].includes(tag)) return 'structure'; if(/heading|hierarchy/.test(role)) return 'information_architecture'; return 'content'; }
}


function showGenomaPageStatus(payload = {}) {
  const state = String(payload.state || 'GENOMA').slice(0, 80);
  const event = String(payload.event || '').slice(0, 180);
  const mode = String(payload.mode || 'idle');
  let hud = document.getElementById('__genoma_status_hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = '__genoma_status_hud';
    hud.setAttribute('data-genoma-ui', 'true');
    Object.assign(hud.style, {
      position:'fixed', left:'10px', top:'10px', zIndex:'2147483647',
      border:'4px solid #000', background:'#fff', color:'#000', padding:'8px 10px',
      font:'900 12px ui-monospace,monospace', letterSpacing:'.06em', textTransform:'uppercase',
      boxShadow:'5px 5px 0 #000', maxWidth:'360px', lineHeight:'1.25', pointerEvents:'none'
    });
    document.documentElement.appendChild(hud);
  }
  hud.style.background = mode === 'busy' ? '#d7f1ff' : mode === 'error' ? '#ffd8d8' : mode === 'done' ? '#d9ffe7' : '#fff';
  hud.innerHTML = `<div>GENOMA · ${escapeHTML(state)}</div><div style="font-weight:700;margin-top:4px">${escapeHTML(event)}</div>`;
  clearTimeout(window.__genomaStatusTimer);
  if (mode !== 'busy' && !/CHILD|VIEW|ERROR/i.test(state)) window.__genomaStatusTimer = setTimeout(() => hud.remove(), 4500);
  return { shown:true, state, mode };
  function escapeHTML(s){return String(s ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
}

function installChildPhenotype(child, mode) {
  clearChildPhenotype();
  const host = document.createElement('div');
  host.id = '__genoma_child_host';
  host.setAttribute('data-genoma-ui', 'true');
  Object.assign(host.style, { position:'fixed', inset:'0', zIndex:'2147483646', display:'none', pointerEvents:'auto', background:'rgba(255,255,255,.985)' });
  const shadow = host.attachShadow({ mode:'open' });
  const safe = sanitizeChild(child || {});
  shadow.innerHTML = `<style>
    :host{all:initial;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#000}
    .frame{min-height:100vh;background:#fff;color:#000;overflow:auto;border:6px solid #000;box-sizing:border-box;box-shadow:inset 0 0 0 6px #fff}
    .genoma-bar{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:8px;border-bottom:5px solid #000;background:#ffec99;color:#000;padding:10px 12px;font:900 13px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;box-shadow:0 4px 0 #000}
    .diff-panel{display:none;position:sticky;top:38px;border-bottom:3px solid #000;background:#fff4cf;padding:8px 10px;font:700 11px ui-monospace,monospace;line-height:1.35}
    .child{padding:18px;box-sizing:border-box}.proof{display:block;border:4px solid #000;background:#fff;color:#000;padding:8px 10px;margin:10px 0;font:900 12px ui-monospace,monospace;box-shadow:4px 4px 0 #000;text-transform:uppercase}
    a{color:#000;text-decoration:underline;text-decoration-thickness:2px}button,a{cursor:pointer}
    ${safe.css}
  </style><div class="frame"><div class="genoma-bar"><span>GENOMA PROGRAM ARTIFACT · LIVE</span><span>${escapeHTML(safe.title)}</span></div><div class="diff-panel"><b>DIFF MODE:</b> F0 remains underneath/alongside. This artifact is a generated program-text phenotype. ${escapeHTML(safe.diffSummary)}</div><div class="child"><span class="proof">PROGRAM ARTIFACT VIEW · ORIGINAL F0 WAS ONLY THE FITNESS BASELINE</span>${safe.html}</div></div>`;
  document.documentElement.appendChild(host);
  window.__genomaChildMode = mode || 'child';
  setChildMode(window.__genomaChildMode);
  const rect = host.getBoundingClientRect();
  return { installed:true, mode: window.__genomaChildMode, visible: host.style.display !== 'none', htmlLength: safe.html.length, title: safe.title, rect:{w:Math.round(rect.width),h:Math.round(rect.height)} }; 

  function sanitizeChild(c){
    const t = document.createElement('template');
    t.innerHTML = String(c.html || '<section><h1>Child phenotype</h1></section>').slice(0, 50000);
    t.content.querySelectorAll('script,iframe,object,embed,link,meta').forEach(n => n.remove());
    t.content.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attr => {
        const name = attr.name.toLowerCase(); const val = attr.value || '';
        if (name.startsWith('on') || /javascript:/i.test(val)) node.removeAttribute(attr.name);
        if (['srcset','style'].includes(name)) node.removeAttribute(attr.name);
        if (['href','src'].includes(name) && !/^(https?:|mailto:|#|\/)/i.test(val)) node.removeAttribute(attr.name);
      });
    });
    return { title:String(c.title || 'Program Artifact').slice(0,120), summary:String(c.summary || '').slice(0,1000), diffSummary:String(c.diffSummary || c.diff?.summary || '').slice(0,1000), html:t.innerHTML, css:String(c.css || '').replace(/@import[^;]+;/g,'').replace(/url\([^)]*\)/g,'none').slice(0,20000) };
  }
  function escapeHTML(s){return String(s ?? '').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
}

function setChildMode(mode) {
  const host = document.getElementById('__genoma_child_host');
  if (!host) return { mode, visible:false };
  window.__genomaChildMode = mode;
  host.style.display = mode === 'original' ? 'none' : 'block';
  if (mode === 'child') { Object.assign(host.style, { left:'0', right:'0', top:'0', bottom:'0', width:'100vw', height:'100vh', pointerEvents:'auto' }); }
  if (mode === 'diff') { Object.assign(host.style, { left:'0', right:'auto', top:'0', bottom:'0', width:'min(760px, 52vw)', height:'auto', pointerEvents:'auto' }); }
  if (host.shadowRoot) {
    const frame = host.shadowRoot.querySelector('.frame'); const diff = host.shadowRoot.querySelector('.diff-panel');
    if (frame) frame.style.borderLeft = mode === 'diff' ? '5px solid #000' : '0 solid #000';
    if (diff) diff.style.display = mode === 'diff' ? 'block' : 'none';
  }
  const rect = host.getBoundingClientRect();
  return { mode, visible: mode !== 'original', rect:{w:Math.round(rect.width),h:Math.round(rect.height)} }; 
}

function clearChildPhenotype() {
  const old = document.getElementById('__genoma_child_host');
  if (old) old.remove();
  return { cleared:true };
}
