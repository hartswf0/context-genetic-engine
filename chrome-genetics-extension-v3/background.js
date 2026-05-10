/**
 * DOM GENETICS ENGINE — BACKGROUND SERVICE WORKER
 * Theory Role: The <Lineage> vault keeper and <API> gateway.
 * This worker holds no UI state — it is purely a message router and
 * persistent storage bridge between the panel and content scripts.
 */

const DEFAULT_MODEL_CONFIG = {
  provider: 'gemini',
  apiKey: '',
  endpoint: '',
  model: ''
};

const PROVIDER_DEFAULTS = {
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-20250514'
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.5-flash'
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini'
  },
  local: {
    endpoint: 'http://localhost:11434/v1/chat/completions',
    model: 'llama3.1'
  }
};

// ─── SIDE PANEL ACTIVATION ──────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id || !chrome.sidePanel?.open) return;
  chrome.sidePanel.open({ tabId: tab.id });
});

// ─── MESSAGE ROUTER ──────────────────────────────────────────────────────────
// Theory: [messages] are typed commands that cross the extension boundary.
// The panel cannot touch the DOM; content_script cannot call APIs.
// The background worker is the only entity that can do both via relay.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const { type, payload = {} } = msg || {};

  switch (type) {

    // ── EXTRACT: Panel asks background to inject extraction into active tab
    case 'EXTRACT_PAGE': {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs[0]) return sendResponse({ error: 'No active tab' });
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: extractDOMGenome,
            args: [tabs[0].url, tabs[0].title]
          });
          sendResponse({ ok: true, genome: results[0].result });
        } catch (e) {
          sendResponse({ error: e.message });
        }
      });
      return true; // async
    }

    // ── OVERLAY: Toggle genome annotation overlay on active tab
    case 'TOGGLE_OVERLAY': {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs[0]) return sendResponse({ error: 'No active tab' });
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: toggleDOMOverlay,
            args: [payload.genome, payload.show]
          });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ error: e.message });
        }
      });
      return true;
    }

    // ── STORAGE: Save a genome to the lineage vault
    case 'SAVE_GENOME': {
      const key = `genome:${Date.now()}`;
      chrome.storage.local.set({ [key]: payload.genome }, () => {
        sendResponse({ ok: true, key });
      });
      return true;
    }

    // ── STORAGE: Load all stored genomes from the vault
    case 'LOAD_LINEAGE': {
      chrome.storage.local.get(null, (items) => {
        const lineage = {};
        for (const [k, v] of Object.entries(items)) {
          if (k.startsWith('genome:') || k === 'api_key' || k === 'model_config') lineage[k] = v;
        }
        sendResponse({ ok: true, lineage });
      });
      return true;
    }

    // ── STORAGE: Delete a genome from the vault
    case 'DELETE_GENOME': {
      chrome.storage.local.remove(payload.key, () => {
        sendResponse({ ok: true });
      });
      return true;
    }

    // ── STORAGE: Persist legacy API key
    case 'SAVE_API_KEY': {
      chrome.storage.local.set({ api_key: payload.key }, () => {
        sendResponse({ ok: true });
      });
      return true;
    }

    // ── STORAGE: Persist provider/API configuration
    case 'SAVE_MODEL_CONFIG': {
      const config = normalizeModelConfig(payload.config);
      chrome.storage.local.set({
        model_config: config,
        api_key: config.apiKey
      }, () => {
        sendResponse({ ok: true, config: scrubConfig(config) });
      });
      return true;
    }

    // ── API: Express phenotype through selected provider
    case 'EXPRESS_PHENOTYPE': {
      callModel({
        system: payload.systemPrompt || 'You are a UI genetics engine.',
        prompt: payload.userTask || '',
        config: payload.modelConfig || payload
      })
        .then(result => sendResponse({ ok: true, result }))
        .catch(e => sendResponse({ error: e.message }));
      return true;
    }

    // ── API: Generate offspring via AI breeding
    case 'AI_BREED': {
      callModel({
        system: 'You are a UI Genetics Engine. Given DOM genome codons from one or two websites, generate a novel UI offspring as a self-contained HTML page. Output ONLY valid HTML inside triple backticks. The UI should be inspired by the genetic traits but be a new, working design.',
        prompt: payload.prompt || '',
        config: payload.modelConfig || payload
      })
        .then(result => sendResponse({ ok: true, result }))
        .catch(e => sendResponse({ error: e.message }));
      return true;
    }

    default:
      sendResponse({ error: `Unknown message type: ${type}` });
      return false;
  }
});

async function loadModelConfig(incoming = {}) {
  const stored = await chrome.storage.local.get(['model_config', 'api_key']);
  return normalizeModelConfig({
    ...(stored.model_config || {}),
    apiKey: stored.model_config?.apiKey || stored.api_key || '',
    ...incoming
  });
}

function normalizeModelConfig(config = {}) {
  const provider = ['anthropic', 'gemini', 'openai', 'local'].includes(config.provider)
    ? config.provider
    : DEFAULT_MODEL_CONFIG.provider;
  const defaults = PROVIDER_DEFAULTS[provider];

  return {
    provider,
    apiKey: String(config.apiKey || config.api_key || '').trim(),
    endpoint: String(config.endpoint || defaults.endpoint).trim(),
    model: String(config.model || defaults.model).trim()
  };
}

function scrubConfig(config) {
  return { ...config, apiKey: config.apiKey ? '[stored]' : '' };
}

async function callModel({ system, prompt, config }) {
  const modelConfig = await loadModelConfig(config);
  if (modelConfig.provider !== 'local' && !modelConfig.apiKey) {
    throw new Error(`API key required for ${modelConfig.provider}. Use local Llama for no-key testing.`);
  }

  if (modelConfig.provider === 'anthropic') {
    return callAnthropic(system, prompt, modelConfig);
  }
  if (modelConfig.provider === 'gemini') {
    return callGemini(system, prompt, modelConfig);
  }
  return callOpenAICompatible(system, prompt, modelConfig);
}

async function callAnthropic(system, prompt, config) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || `Anthropic HTTP ${response.status}`);
  return data.content?.map(part => part.text || '').join('\n').trim();
}

async function callGemini(system, prompt, config) {
  const endpoint = `${config.endpoint.replace(/\/$/, '')}/${encodeURIComponent(config.model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || `Gemini HTTP ${response.status}`);
  return data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim() || '';
}

async function callOpenAICompatible(system, prompt, config) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.provider !== 'local' && config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    })
  });

  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || `${config.provider} HTTP ${response.status}`);
  return data.choices?.[0]?.message?.content || data.output_text || '';
}

// ─── DOM EXTRACTION FUNCTION (runs in page context via executeScript) ─────────
// Theory: This is the [extract] operation. It runs inside the page's JS context
// and returns a structured <DOMGenome> — a snapshot of the page's genetic material.
function extractDOMGenome(sourceUrl, sourceTitle) {
  const genome = {
    id: Math.random().toString(36).substring(2, 10),
    sourceUrl,
    sourceTitle,
    timestamp: Date.now(),
    codons: []
  };

  const push = (locus, payload, weight, selector = '') => {
    genome.codons.push({
      id: Math.random().toString(36).substring(2, 10),
      type: locus,
      locus,
      payload,
      weight,
      selector,
      state: 'EXON',
      active: true
    });
  };

  // ── LOCUS: LAYOUT ── dominant structural grammar
  try {
    const body = document.body;
    const bodyStyle = window.getComputedStyle(body);
    const maxWidths = new Set();
    document.querySelectorAll('main, [class*="container"], [class*="wrapper"], [class*="layout"]').forEach(el => {
      const mw = window.getComputedStyle(el).maxWidth;
      if (mw && mw !== 'none') maxWidths.add(mw);
    });
    push('LAYOUT', `Body uses display:${bodyStyle.display}. Max content widths observed: ${[...maxWidths].slice(0, 4).join(', ') || 'none detected'}. Primary direction: ${bodyStyle.flexDirection || 'block'}.`, 90, 'body');
  } catch (e) {}

  // ── LOCUS: COLOR ── extract dominant palette
  try {
    const colorMap = {};
    const sample = [...document.querySelectorAll('button, a, h1, h2, nav, header, [class*="btn"], [class*="card"]')].slice(0, 30);
    sample.forEach(el => {
      const s = window.getComputedStyle(el);
      [s.color, s.backgroundColor, s.borderColor].forEach(c => {
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') colorMap[c] = (colorMap[c] || 0) + 1;
      });
    });
    const topColors = Object.entries(colorMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
    push('COLOR', `Dominant palette (by frequency): ${topColors.join(' | ')}`, 80, 'computed');
  } catch (e) {}

  // ── LOCUS: TYPOGRAPHY ── font families, scale, weight
  try {
    const fonts = new Set();
    const sizes = new Set();
    const weights = new Set();
    [...document.querySelectorAll('h1,h2,h3,p,li,a,button,label')].slice(0, 40).forEach(el => {
      const s = window.getComputedStyle(el);
      fonts.add(s.fontFamily.split(',')[0].replace(/['"]/g, '').trim());
      sizes.add(s.fontSize);
      weights.add(s.fontWeight);
    });
    push('TYPOGRAPHY', `Fonts: ${[...fonts].slice(0, 4).join(', ')}. Sizes: ${[...sizes].slice(0, 6).join(', ')}. Weights: ${[...weights].join(', ')}.`, 75, 'typography');
  } catch (e) {}

  // ── LOCUS: SPACING ── whitespace density
  try {
    const spacings = new Set();
    [...document.querySelectorAll('[class*="section"], [class*="row"], [class*="block"], main > *, article > *')].slice(0, 20).forEach(el => {
      const s = window.getComputedStyle(el);
      if (s.padding !== '0px') spacings.add(`padding:${s.padding}`);
      if (s.margin !== '0px') spacings.add(`margin:${s.margin}`);
      if (s.gap) spacings.add(`gap:${s.gap}`);
    });
    const density = spacings.size > 12 ? 'GENEROUS (high whitespace)' : spacings.size > 5 ? 'MODERATE' : 'DENSE (tight spacing)';
    push('SPACING', `Spacing density: ${density}. Sample values: ${[...spacings].slice(0, 6).join('; ')}.`, 70, 'sections');
  } catch (e) {}

  // ── LOCUS: COMPONENTS ── identify UI primitives
  try {
    const components = [];
    if (document.querySelectorAll('nav').length) components.push('NAVIGATION_BAR');
    if (document.querySelectorAll('button, [class*="btn"]').length > 2) components.push(`BUTTONS(${Math.min(document.querySelectorAll('button').length, 99)})`);
    if (document.querySelectorAll('input, select, textarea').length) components.push(`FORM_INPUTS(${document.querySelectorAll('input,select,textarea').length})`);
    if (document.querySelectorAll('[class*="card"], [class*="item"], [class*="tile"]').length > 2) components.push('CARD_GRID');
    if (document.querySelectorAll('img, picture, video').length > 1) components.push(`MEDIA(${document.querySelectorAll('img,picture,video').length})`);
    if (document.querySelectorAll('table').length) components.push('DATA_TABLE');
    if (document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="overlay"]').length) components.push('MODAL');
    if (document.querySelectorAll('[class*="sidebar"], [class*="drawer"]').length) components.push('SIDEBAR');
    if (document.querySelectorAll('[class*="hero"], [class*="banner"]').length) components.push('HERO_BANNER');
    if (document.querySelectorAll('footer').length) components.push('FOOTER');
    push('COMPONENT', `Identified primitives: ${components.join(', ') || 'minimal page'}.`, 85, 'components');
  } catch (e) {}

  // ── LOCUS: INTERACTION ── motion and behavior patterns
  try {
    const hasAnimations = document.querySelector('[class*="anim"], [class*="transition"], [class*="fade"], [class*="slide"]') !== null;
    const hasHover = document.querySelector(':hover') !== null;
    const hasFixed = [...document.querySelectorAll('*')].some(el => window.getComputedStyle(el).position === 'fixed');
    const hasStickyNav = [...document.querySelectorAll('nav, header')].some(el => ['sticky', 'fixed'].includes(window.getComputedStyle(el).position));
    push('INTERACTION', `Animation classes detected: ${hasAnimations}. Fixed elements present: ${hasFixed}. Sticky navigation: ${hasStickyNav}.`, 65, 'interaction');
  } catch (e) {}

  // ── LOCUS: COPY ── tone and text character
  try {
    const h1s = [...document.querySelectorAll('h1')].map(h => h.innerText?.trim()).filter(Boolean).slice(0, 3);
    const ctas = [...document.querySelectorAll('button, a[class*="btn"]')].map(b => b.innerText?.trim()).filter(Boolean).slice(0, 5);
    const wordCount = document.body.innerText.split(/\s+/).length;
    const density = wordCount > 2000 ? 'VERBOSE' : wordCount > 500 ? 'MODERATE' : 'MINIMAL';
    push('COPY', `H1s: "${h1s.join('" | "')}". CTAs: "${ctas.join('" | "')}". Text density: ${density} (${wordCount} words).`, 60, 'h1,button');
  } catch (e) {}

  // ── LOCUS: RADIUS ── border-radius design grammar
  try {
    const radii = new Set();
    [...document.querySelectorAll('button, input, [class*="card"], img')].slice(0, 20).forEach(el => {
      const r = window.getComputedStyle(el).borderRadius;
      if (r && r !== '0px') radii.add(r);
    });
    const feel = radii.has('9999px') || radii.has('50%') ? 'PILL/ROUNDED' : [...radii].some(r => parseInt(r) > 12) ? 'SOFT' : [...radii].some(r => parseInt(r) > 0) ? 'SLIGHTLY_ROUNDED' : 'SHARP';
    push('RADIUS', `Border-radius feel: ${feel}. Values: ${[...radii].slice(0, 5).join(', ')}.`, 55, 'buttons');
  } catch (e) {}

  return genome;
}

// ─── OVERLAY FUNCTION (runs in page context via executeScript) ─────────────────
// Theory: The [annotate] operation. Injects a shadow DOM island that draws
// colored locus-labeled borders over matched selectors — non-destructive.
function toggleDOMOverlay(genome, show) {
  const OVERLAY_ID = '__dom_genetics_overlay__';
  const existing = document.getElementById(OVERLAY_ID);

  if (!show) {
    if (existing) existing.remove();
    return;
  }

  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = OVERLAY_ID;
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const LOCUS_COLORS = {
    LAYOUT: '#60a5fa', COLOR: '#f472b6', TYPOGRAPHY: '#a78bfa',
    SPACING: '#34d399', COMPONENT: '#fbbf24', INTERACTION: '#f87171',
    COPY: '#22d3ee', RADIUS: '#fb923c'
  };

  const selectorMap = {
    LAYOUT: 'body, main, [class*="container"], [class*="wrapper"]',
    COMPONENT: 'nav, button, [class*="card"], [class*="btn"], input, header, footer',
    COPY: 'h1, h2, h3',
    TYPOGRAPHY: 'p, li, a',
    INTERACTION: '[class*="anim"], [class*="fade"]',
    RADIUS: 'button, [class*="card"]',
    SPACING: 'section, main > *, article',
    COLOR: 'header, footer, nav'
  };

  let css = `
    * { box-sizing: border-box; }
    .locus-badge {
      position: absolute; font-family: monospace; font-size: 10px; font-weight: 900;
      padding: 2px 6px; border-radius: 3px; pointer-events: none; z-index: 1;
      letter-spacing: 0.1em; opacity: 0.9; line-height: 1;
    }
    .locus-outline {
      position: absolute; pointer-events: none; border: 2px solid;
      border-radius: 2px; z-index: 0; opacity: 0.4;
    }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);

  const canvas = document.createElement('div');
  canvas.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
  shadow.appendChild(canvas);

  const usedLoci = new Set(genome.codons.map(c => c.locus));

  usedLoci.forEach(locus => {
    const color = LOCUS_COLORS[locus] || '#fff';
    const selector = selectorMap[locus];
    if (!selector) return;
    try {
      const targets = [...document.querySelectorAll(selector)].slice(0, 8);
      targets.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const outline = document.createElement('div');
        outline.className = 'locus-outline';
        outline.style.cssText = `
          left: ${rect.left + window.scrollX}px;
          top: ${rect.top + window.scrollY}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
          border-color: ${color};
        `;
        canvas.appendChild(outline);

        const badge = document.createElement('div');
        badge.className = 'locus-badge';
        badge.style.cssText = `
          left: ${rect.left + window.scrollX + 4}px;
          top: ${rect.top + window.scrollY + 4}px;
          background: ${color};
          color: #000;
        `;
        badge.textContent = locus;
        canvas.appendChild(badge);
      });
    } catch (e) {}
  });
}
