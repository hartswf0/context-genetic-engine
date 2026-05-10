'use strict';

const DEFAULT_CONFIG = {
  provider: 'local',
  useLLM: false,
  apiKey: '',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3.1'
};

const PROVIDER_DEFAULTS = {
  local: { endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.1' },
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', model: 'gemini-2.5-flash' },
  anthropic: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514' }
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id && chrome.sidePanel?.open) chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const type = msg?.type;
  const payload = msg?.payload || {};

  switch (type) {
    case 'GET_CONFIG': {
      loadConfig().then(config => sendResponse({ ok: true, config: scrubConfig(config), raw: config })).catch(e => sendResponse({ error: e.message }));
      return true;
    }
    case 'SAVE_CONFIG': {
      const config = normalizeConfig(payload.config || {});
      chrome.storage.local.set({ genoma_model_config: config }, () => {
        const err = chrome.runtime.lastError?.message;
        sendResponse(err ? { error: err } : { ok: true, config: scrubConfig(config) });
      });
      return true;
    }
    case 'TEST_MODEL': {
      callModel({
        system: 'Return the exact words: GENOMA MODEL OK',
        prompt: 'Health check.',
        config: payload.config || {}
      }).then(text => sendResponse({ ok: true, text: String(text || '').slice(0, 500) })).catch(e => sendResponse({ error: e.message }));
      return true;
    }
    case 'CAPTURE_PAGE': {
      withActiveTab(sendResponse, async (tab) => {
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureActualPage, args: [tab.url, tab.title] });
        return { ok: true, genome: results?.[0]?.result || null };
      });
      return true;
    }
    case 'ANNOTATE_CODONS': {
      withActiveTab(sendResponse, async (tab) => {
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: annotateCodonsOnPage, args: [payload.codons || [], payload.states || {}, payload.boundId || ''] });
        return { ok: true, result: results?.[0]?.result || {} };
      });
      return true;
    }
    case 'CLEAR_ANNOTATIONS': {
      withActiveTab(sendResponse, async (tab) => {
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: clearCodonAnnotations });
        return { ok: true, result: results?.[0]?.result || {} };
      });
      return true;
    }
    case 'APPLY_PATCHES': {
      withActiveTab(sendResponse, async (tab) => {
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: applySafePatches, args: [payload.operations || []] });
        return { ok: true, result: results?.[0]?.result || {} };
      });
      return true;
    }
    case 'UNDO_PATCHES': {
      withActiveTab(sendResponse, async (tab) => {
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: undoSafePatches });
        return { ok: true, result: results?.[0]?.result || {} };
      });
      return true;
    }
    case 'PLAN_WITH_MODEL': {
      planWithModel(payload).then(out => sendResponse({ ok: true, ...out })).catch(e => sendResponse({ error: e.message }));
      return true;
    }
    case 'CHAT_CODON_WITH_MODEL': {
      chatCodonWithModel(payload).then(out => sendResponse({ ok: true, ...out })).catch(e => sendResponse({ error: e.message }));
      return true;
    }
    case 'SAVE_STATE': {
      const key = `genoma_state:${Date.now()}`;
      chrome.storage.local.set({ [key]: payload.state || {} }, () => sendResponse({ ok: true, key }));
      return true;
    }
    default:
      sendResponse({ error: `Unknown message type: ${type}` });
      return false;
  }
});

function withActiveTab(sendResponse, fn) {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    try {
      const tab = tabs?.[0];
      if (!tab?.id) throw new Error('No active tab');
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) throw new Error('Open a normal webpage first. Chrome pages cannot be patched.');
      const out = await fn(tab);
      sendResponse(out);
    } catch (e) {
      sendResponse({ error: e.message || String(e) });
    }
  });
}

async function loadConfig(incoming = {}) {
  const stored = await chrome.storage.local.get(['genoma_model_config']);
  return normalizeConfig({ ...(stored.genoma_model_config || {}), ...incoming });
}

function normalizeConfig(config = {}) {
  const provider = PROVIDER_DEFAULTS[config.provider] ? config.provider : DEFAULT_CONFIG.provider;
  const defaults = PROVIDER_DEFAULTS[provider];
  return {
    provider,
    useLLM: !!config.useLLM,
    apiKey: String(config.apiKey || '').trim(),
    endpoint: String(config.endpoint || defaults.endpoint).trim(),
    model: String(config.model || defaults.model).trim()
  };
}

function scrubConfig(config) {
  return { ...config, apiKey: config.apiKey ? '[stored]' : '' };
}

async function planWithModel(payload) {
  const config = await loadConfig(payload.config || {});
  if (!config.useLLM) throw new Error('LLM is off. Use local patching, or open Settings and enable Use LLM.');
  if (config.provider !== 'local' && !config.apiKey) throw new Error(`API key required for ${config.provider}. Open Settings or switch to local.`);

  const system = [
    'You are GENOMA Actual Page Patch Planner.',
    'You patch a living webpage. You do NOT generate a new webpage.',
    'Your output must be JSON only: {"report":"...","operations":[...]}',
    'Allowed operations: setStyle, setAttribute, insertHTML, setText.',
    'Never use scripts, inline event handlers, javascript: URLs, external resources, replaceHTML, remove, hide, or destructive operations.',
    'Do not setText on body, main, nav, header, footer, section, article, form, or any container with interactive descendants.',
    'Preserve links, buttons, forms, inputs, checkout/purchase paths, href, src, action, method, type, name, and value.',
    'Prefer style changes and small inserted labels/HUDs. If a selector is locked, style it only.'
  ].join('\n');

  const prompt = JSON.stringify({
    task: payload.mode || 'patch',
    directive: payload.directive || '',
    kernel: String(payload.kernel || '').slice(0, 8000),
    boundCodon: payload.codon || null,
    activeCodons: (payload.codons || []).slice(0, 80),
    invariants: [
      'Do not break existing functionality.',
      'Do not erase page content.',
      'Do not replace the page with a fake artifact.',
      'Use only provided selectors.'
    ],
    requiredOutput: {
      report: 'brief reasoned patch report',
      operations: [
        { op: 'setStyle', selector: 'provided selector', styles: { outline: '3px solid #000' }, reason: 'why' },
        { op: 'insertHTML', selector: 'provided selector', position: 'afterbegin|beforeend|beforebegin|afterend', html: '<div>static safe html</div>', reason: 'why' }
      ]
    }
  }, null, 2);

  const raw = await callModel({ system, prompt, config });
  const patch = parseJSONLike(raw) || { report: 'Model did not return parseable JSON.', operations: [] };
  patch.operations = sanitizeOperationList(patch.operations || [], payload.codons || [], payload.codon || null);
  return { raw, patch };
}

async function chatCodonWithModel(payload) {
  const config = await loadConfig(payload.config || {});
  if (!config.useLLM) throw new Error('LLM is off. Use local codon chat, or open Settings and enable Use LLM.');
  if (config.provider !== 'local' && !config.apiKey) throw new Error(`API key required for ${config.provider}. Open Settings or switch to local.`);

  const system = [
    'You are GENOMA Codon Workbench.',
    'Operate only on the bound codon. Do not change selector or id.',
    'Return JSON only: the updated codon object.',
    'Preserve containedSource exactly unless the user explicitly asks to add notes.',
    'The codon must remain selector-bound and reversible.'
  ].join('\n');
  const prompt = JSON.stringify({ instruction: payload.message || '', kernel: String(payload.kernel || '').slice(0, 8000), codon: payload.codon || {} }, null, 2);
  const raw = await callModel({ system, prompt, config });
  const codon = parseJSONLike(raw) || payload.codon || {};
  codon.id = payload.codon?.id;
  codon.selector = payload.codon?.selector;
  codon.containedSource = payload.codon?.containedSource;
  return { raw, codon };
}

function sanitizeOperationList(ops, codons, focusCodon) {
  const allowedSelectors = new Set((codons || []).map(c => c.selector).filter(Boolean));
  if (focusCodon?.selector) allowedSelectors.add(focusCodon.selector);
  return (Array.isArray(ops) ? ops : []).filter(op => {
    if (!op || typeof op !== 'object') return false;
    if (!['setStyle', 'setAttribute', 'insertHTML', 'setText'].includes(op.op)) return false;
    if (!allowedSelectors.has(op.selector)) return false;
    if (op.op === 'setAttribute') {
      const name = String(op.name || '').toLowerCase();
      if (!/^aria-|^data-|^title$|^role$/.test(name)) return false;
    }
    return true;
  }).slice(0, 120);
}

async function callModel({ system, prompt, config }) {
  const cfg = normalizeConfig(config);
  if (cfg.provider !== 'local' && !cfg.apiKey) throw new Error(`API key required for ${cfg.provider}.`);

  if (cfg.provider === 'gemini') {
    const base = cfg.endpoint.replace(/\/$/, '');
    const url = `${base}/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
  }

  if (cfg.provider === 'anthropic') {
    const res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: cfg.model, max_tokens: 4096, temperature: 0.2, system, messages: [{ role: 'user', content: prompt }] }) });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return (data.content || []).map(x => x.text || '').join('\n');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (cfg.provider === 'openai' && cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const res = await fetch(cfg.endpoint, { method: 'POST', headers, body: JSON.stringify({ model: cfg.model, temperature: 0.2, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }) });
  if (!res.ok) throw new Error(`${cfg.provider} error ${res.status}: ${(await res.text()).slice(0, 300)}`);
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

// Runs in the actual page.
function captureActualPage(url, title) {
  const old = document.querySelectorAll('[data-genoma-anchor-id]');
  old.forEach(el => { if (!el.closest('[data-genoma-ui="true"]')) el.removeAttribute('data-genoma-anchor-id'); });

  const selector = [
    'a', 'button', 'input', 'textarea', 'select', 'form', 'img', 'video', 'main', 'nav', 'header', 'footer', 'section', 'article',
    'h1', 'h2', 'h3', 'h4', '[role]', '[aria-label]', '[onclick]', 'li', 'p', 'span', 'div'
  ].join(',');

  const seen = new Set();
  const anchors = [];
  const elements = Array.from(document.querySelectorAll(selector));

  for (const el of elements) {
    if (anchors.length >= 500) break;
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest('[data-genoma-ui="true"]')) continue;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const visible = rect.width > 2 && rect.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0.01;
    if (!visible) continue;
    const tag = el.tagName.toLowerCase();
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.alt || '').replace(/\s+/g, ' ').trim();
    const hasMeaning = text || tag === 'img' || tag === 'input' || tag === 'form' || el.href || el.onclick || el.getAttribute('role') || el.getAttribute('aria-label');
    if (!hasMeaning && !['main', 'nav', 'header', 'footer', 'section', 'article'].includes(tag)) continue;

    // Avoid huge duplicate text containers unless they are structural.
    const textKey = `${tag}:${text.slice(0, 80)}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
    if (seen.has(textKey)) continue;
    seen.add(textKey);

    const id = `genoma_${anchors.length}`;
    el.setAttribute('data-genoma-anchor-id', id);
    const interactiveDescendants = el.querySelectorAll('a,button,input,textarea,select,form').length;
    const href = el instanceof HTMLAnchorElement ? el.href : '';
    const src = el instanceof HTMLImageElement || el instanceof HTMLVideoElement ? el.currentSrc || el.src : '';
    const role = inferRole(el, tag, text, interactiveDescendants);
    const type = inferCodonType(el, tag, href, src, role);
    const locus = inferLocus(el, tag, href, src, role);
    const locked = ['a', 'button', 'input', 'textarea', 'select', 'form'].includes(tag) || interactiveDescendants > 0 || !!href || !!src;

    anchors.push({
      id,
      selector: `[data-genoma-anchor-id="${id}"]`,
      tag,
      type,
      locus,
      role,
      text: text.slice(0, 900),
      value: String(el.value || '').slice(0, 400),
      href,
      src,
      alt: el.getAttribute('alt') || '',
      aria: el.getAttribute('aria-label') || '',
      name: el.getAttribute('name') || '',
      action: tag === 'form' ? el.getAttribute('action') || '' : '',
      method: tag === 'form' ? el.getAttribute('method') || '' : '',
      locked,
      childCount: el.children.length,
      interactiveDescendants,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      style: {
        display: cs.display,
        position: cs.position,
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        borderRadius: cs.borderRadius,
        border: cs.border,
        padding: cs.padding,
        margin: cs.margin
      },
      htmlStart: el.outerHTML.replace(/\s+/g, ' ').slice(0, 700)
    });
  }

  const visibleText = document.body ? (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 6000) : '';
  return {
    schemaVersion: 'genoma.actual.v10',
    specimen: { url, title, capturedAt: Date.now(), viewport: { w: innerWidth, h: innerHeight }, userAgent: navigator.userAgent },
    stats: {
      anchors: anchors.length,
      links: anchors.filter(a => a.tag === 'a').length,
      buttons: anchors.filter(a => a.tag === 'button').length,
      images: anchors.filter(a => a.tag === 'img').length,
      forms: anchors.filter(a => a.tag === 'form').length,
      inputs: anchors.filter(a => ['input','textarea','select'].includes(a.tag)).length
    },
    programTheorySeed: {
      purpose: `Actual page organism: ${title || location.hostname}`,
      operations: anchors.filter(a => ['OPR','HPL'].includes(a.type)).slice(0, 80).map(a => `${a.role}: ${a.text || a.href || a.aria}`),
      invariants: [
        'Patch the actual page, not an iframe artifact.',
        'Never erase or replace containers that hold links, buttons, forms, or product flows.',
        'Every mutation must be reversible.',
        'Use selector-bound codons.'
      ]
    },
    visibleText,
    anchors
  };

  function inferRole(el, tag, text, interactiveDescendants) {
    const explicit = el.getAttribute('role') || el.getAttribute('aria-label') || '';
    if (explicit) return explicit.slice(0, 80);
    if (tag === 'a') return 'navigation/link';
    if (tag === 'button') return 'button/action';
    if (tag === 'form') return 'form/submission path';
    if (['input','textarea','select'].includes(tag)) return 'input/user data capture';
    if (tag === 'img') return 'image/visual representation';
    if (['main','section','article'].includes(tag)) return interactiveDescendants ? 'structural container with controls' : 'content region';
    if (['nav','header','footer'].includes(tag)) return `${tag}/site wayfinding`;
    if (/^h[1-4]$/.test(tag)) return 'heading/information hierarchy';
    return text ? 'text/content' : 'page structure';
  }

  function inferCodonType(el, tag, href, src, role) {
    if (tag === 'a') return 'HPL';
    if (['button','input','textarea','select','form'].includes(tag)) return 'OPR';
    if (tag === 'img' || src) return 'IMG';
    if (['main','nav','header','footer','section','article'].includes(tag)) return 'ENT';
    if (/heading|hierarchy/.test(role)) return 'REP';
    return 'TXT';
  }

  function inferLocus(el, tag, href, src, role) {
    if (href || tag === 'a') return 'link';
    if (['button','input','textarea','select','form'].includes(tag)) return 'operation';
    if (src || tag === 'img') return 'representation';
    if (['main','nav','header','footer','section','article'].includes(tag)) return 'structure';
    if (/heading|hierarchy/.test(role)) return 'information_architecture';
    return 'content';
  }
}

function clearCodonAnnotations() {
  const overlays = document.querySelectorAll('[data-genoma-ui="true"]');
  overlays.forEach(el => el.remove());
  document.querySelectorAll('[data-genoma-bound-outline]').forEach(el => {
    el.style.outline = el.getAttribute('data-genoma-old-outline') || '';
    el.removeAttribute('data-genoma-bound-outline');
    el.removeAttribute('data-genoma-old-outline');
  });
  return { cleared: overlays.length };
}

function annotateCodonsOnPage(codons, states, boundId) {
  clearCodonAnnotations();
  const active = (Array.isArray(codons) ? codons : []).filter(c => states?.[c.id] !== 'INTRON').slice(0, 120);
  let annotated = 0;
  for (const c of active) {
    const el = document.querySelector(c.selector);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    el.setAttribute('data-genoma-old-outline', el.style.outline || '');
    el.setAttribute('data-genoma-bound-outline', '1');
    el.style.outline = c.id === boundId ? '4px solid #ff8c00' : '3px solid #000';
    const label = document.createElement('div');
    label.setAttribute('data-genoma-ui', 'true');
    label.textContent = `${c.type || 'CODON'} · ${c.locus || ''}`;
    Object.assign(label.style, {
      position: 'fixed', left: Math.max(0, rect.left) + 'px', top: Math.max(0, rect.top - 22) + 'px',
      zIndex: '2147483647', background: c.id === boundId ? '#ff8c00' : '#fff', color: '#000', border: '2px solid #000',
      font: '900 11px ui-monospace, Menlo, monospace', padding: '2px 5px', pointerEvents: 'none', boxShadow: '2px 2px 0 #000'
    });
    document.documentElement.appendChild(label);
    annotated++;
  }
  return { annotated };
}

function applySafePatches(operations) {
  window.__genomaUndoStack = window.__genomaUndoStack || [];
  const batch = [];
  let applied = 0;
  let skipped = 0;
  const ops = Array.isArray(operations) ? operations.slice(0, 160) : [];

  for (const op of ops) {
    try {
      if (!op || typeof op !== 'object') { skipped++; continue; }
      const el = document.querySelector(op.selector);
      if (!(el instanceof HTMLElement)) { skipped++; continue; }
      if (el.closest('[data-genoma-ui="true"]')) { skipped++; continue; }
      const dangerous = isDangerousTarget(el);

      if (op.op === 'setStyle') {
        const styles = filterStyles(op.styles || {});
        if (!Object.keys(styles).length) { skipped++; continue; }
        batch.push({ kind: 'style', selector: op.selector, old: el.getAttribute('style') || '' });
        Object.assign(el.style, styles);
        applied++;
      } else if (op.op === 'setAttribute') {
        const name = String(op.name || '').toLowerCase();
        if (!/^aria-|^data-|^title$|^role$/.test(name)) { skipped++; continue; }
        batch.push({ kind: 'attr', selector: op.selector, name, old: el.getAttribute(name) });
        el.setAttribute(name, String(op.value || '').slice(0, 500));
        applied++;
      } else if (op.op === 'setText') {
        if (dangerous || el.children.length > 0 || el.querySelector('a,button,input,textarea,select,form')) { skipped++; continue; }
        batch.push({ kind: 'text', selector: op.selector, old: el.textContent });
        el.textContent = String(op.text || '').slice(0, 1200);
        applied++;
      } else if (op.op === 'insertHTML') {
        const html = sanitizeHTML(String(op.html || '').slice(0, 4000));
        if (!html) { skipped++; continue; }
        const id = `genoma_insert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-genoma-insert-id', id);
        wrapper.innerHTML = html;
        const pos = ['beforebegin','afterbegin','beforeend','afterend'].includes(op.position) ? op.position : 'afterbegin';
        el.insertAdjacentElement(pos, wrapper);
        batch.push({ kind: 'insert', insertId: id });
        applied++;
      } else {
        skipped++;
      }
    } catch (_e) { skipped++; }
  }
  if (batch.length) window.__genomaUndoStack.push(batch);
  return { applied, skipped, undoBatches: window.__genomaUndoStack.length };

  function isDangerousTarget(el) {
    const tag = el.tagName.toLowerCase();
    if (['html','body','main','nav','header','footer','section','article','form'].includes(tag)) return true;
    if (['a','button','input','textarea','select'].includes(tag)) return true;
    if (el.querySelectorAll('a,button,input,textarea,select,form').length > 0) return true;
    if (el.children.length > 3) return true;
    return false;
  }

  function filterStyles(styles) {
    const allowed = new Set(['background','backgroundColor','color','fontFamily','fontSize','fontWeight','letterSpacing','lineHeight','border','borderColor','borderWidth','borderStyle','borderRadius','outline','boxShadow','padding','margin','display','gap','alignItems','justifyContent','textTransform','textDecoration','transform','filter','opacity','minHeight','maxWidth']);
    const out = {};
    for (const [k, v] of Object.entries(styles || {})) {
      if (!allowed.has(k)) continue;
      const val = String(v);
      if (/url\(|expression\(|javascript:/i.test(val)) continue;
      out[k] = val.slice(0, 160);
    }
    return out;
  }

  function sanitizeHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('script,iframe,object,embed,link,meta').forEach(n => n.remove());
    template.content.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attr => {
        const n = attr.name.toLowerCase();
        const val = attr.value || '';
        if (n.startsWith('on') || /javascript:/i.test(val)) node.removeAttribute(attr.name);
        if (['href','src','action'].includes(n)) node.removeAttribute(attr.name);
      });
    });
    return template.innerHTML;
  }
}

function undoSafePatches() {
  window.__genomaUndoStack = window.__genomaUndoStack || [];
  const batch = window.__genomaUndoStack.pop() || [];
  let restored = 0;
  for (let i = batch.length - 1; i >= 0; i--) {
    const entry = batch[i];
    if (entry.kind === 'insert') {
      document.querySelector(`[data-genoma-insert-id="${entry.insertId}"]`)?.remove();
      restored++;
      continue;
    }
    const el = document.querySelector(entry.selector);
    if (!el) continue;
    if (entry.kind === 'style') el.setAttribute('style', entry.old || '');
    if (entry.kind === 'text') el.textContent = entry.old || '';
    if (entry.kind === 'attr') {
      if (entry.old === null || entry.old === undefined) el.removeAttribute(entry.name);
      else el.setAttribute(entry.name, entry.old);
    }
    restored++;
  }
  return { restored, undoBatches: window.__genomaUndoStack.length };
}
