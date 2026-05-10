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
  model: '',
  codonPassCount: 1
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
    endpoint: 'https://api.openai.com/v1/responses',
    model: 'gpt-5.1'
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

    // ── EXPERIMENT: Apply a reversible genetic stylesheet to the active tab
    case 'APPLY_PAGE_CSS': {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs[0]) return sendResponse({ error: 'No active tab' });
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: applyPageGeneticsCss,
            args: [payload.css || '']
          });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ error: e.message });
        }
      });
      return true;
    }

    case 'APPLY_ARTIFACT_HTML': {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs[0]) return sendResponse({ error: 'No active tab' });
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: applyArtifactOverlay,
            args: [payload.html || '']
          });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ error: e.message });
        }
      });
      return true;
    }

    case 'SHOW_OPERATION_OVERLAY': {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs[0]) return sendResponse({ error: 'No active tab' });
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: showOperationOverlay,
            args: [payload]
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
        images: payload.images || [],
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
        images: payload.images || [],
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
    model: String(config.model || defaults.model).trim(),
    reasoningEffort: String(config.reasoningEffort || config.reasoning_effort || (provider === 'openai' ? 'high' : 'none')).trim(),
    codonPassCount: Math.max(1, Math.min(3, Number(config.codonPassCount || config.codon_pass_count || 1)))
  };
}

function scrubConfig(config) {
  return { ...config, apiKey: config.apiKey ? '[stored]' : '' };
}

async function callModel({ system, prompt, images = [], config }) {
  const modelConfig = await loadModelConfig(config);
  if (modelConfig.provider !== 'local' && !modelConfig.apiKey) {
    throw new Error(`API key required for ${modelConfig.provider}. Use local Llama for no-key testing.`);
  }

  if (modelConfig.provider === 'anthropic') {
    return callAnthropic(system, prompt, modelConfig);
  }
  if (modelConfig.provider === 'gemini') {
    return callGemini(system, prompt, modelConfig, images);
  }
  if (modelConfig.provider === 'openai') {
    return callOpenAIResponses(system, prompt, modelConfig, images);
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

async function callGemini(system, prompt, config, images = []) {
  const endpoint = `${config.endpoint.replace(/\/$/, '')}/${encodeURIComponent(config.model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: prompt }, ...imagesToGeminiParts(images)] }]
    })
  });

  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || `Gemini HTTP ${response.status}`);
  return data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim() || '';
}

async function callOpenAIResponses(system, prompt, config, images = []) {
  const content = [{ type: 'input_text', text: prompt }];
  imagesToOpenAIContent(images).forEach(part => content.push(part));
  const body = {
    model: config.model,
    instructions: system,
    input: [{ role: 'user', content }]
  };
  if (config.reasoningEffort && config.reasoningEffort !== 'none') {
    body.reasoning = { effort: config.reasoningEffort };
  }

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || `OpenAI HTTP ${response.status}`);
  if (typeof data.output_text === 'string') return data.output_text;
  return (data.output || [])
    .flatMap(item => item.content || [])
    .map(part => part.text || '')
    .join('\n')
    .trim();
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

function imagesToOpenAIContent(images = []) {
  return images
    .filter(img => img?.dataUrl)
    .slice(0, 8)
    .map(img => ({
      type: 'input_image',
      image_url: img.dataUrl
    }));
}

function imagesToGeminiParts(images = []) {
  return images
    .filter(img => img?.dataUrl)
    .slice(0, 8)
    .map(img => {
      const match = String(img.dataUrl).match(/^data:([^;]+);base64,(.*)$/);
      if (!match) return null;
      return { inlineData: { mimeType: match[1], data: match[2] } };
    })
    .filter(Boolean);
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

  const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
  const cssPath = el => {
    if (!el || el === document.body) return 'body';
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      const cls = [...node.classList || []].filter(Boolean).slice(0, 2);
      if (cls.length) part += cls.map(c => `.${CSS.escape(c)}`).join('');
      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter(child => child.tagName === node.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ') || 'body';
  };

  const elementRecord = el => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      text: cleanText(el.innerText || el.getAttribute('aria-label') || el.getAttribute('alt') || '').slice(0, 180),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      },
      style: {
        display: style.display,
        position: style.position,
        color: style.color,
        background: style.backgroundColor,
        font: style.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
        size: style.fontSize,
        weight: style.fontWeight,
        radius: style.borderRadius
      }
    };
  };

  const visible = el => {
    if (!el || el === document.documentElement) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 8 && rect.height > 8 && style.visibility !== 'hidden' && style.display !== 'none';
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

  try {
    const landmarks = [...document.querySelectorAll('header, nav, main, section, article, aside, footer, form')]
      .filter(visible)
      .slice(0, 16)
      .map(elementRecord);
    const components = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [class*="card"], [class*="panel"], [class*="tile"]')]
      .filter(visible)
      .slice(0, 24)
      .map(elementRecord);
    const textBlocks = [...document.querySelectorAll('h1,h2,h3,p,li,button,a[href],label')]
      .filter(visible)
      .map(elementRecord)
      .filter(item => item.text)
      .slice(0, 18);
    const media = [...document.querySelectorAll('img, picture, video, svg, canvas')]
      .filter(visible)
      .slice(0, 12)
      .map(el => ({
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        alt: cleanText(el.getAttribute('alt') || el.getAttribute('aria-label') || ''),
        src: cleanText(el.currentSrc || el.src || '').slice(0, 220)
      }));

    genome.evidencePacket = {
      protocol: 'CGE-DOM-EVIDENCE/1.0',
      source: { url: sourceUrl, title: sourceTitle },
      viewport: { width: window.innerWidth, height: window.innerHeight, scrollHeight: document.documentElement.scrollHeight },
      stats: {
        elements: document.querySelectorAll('*').length,
        buttons: document.querySelectorAll('button, [role="button"]').length,
        links: document.querySelectorAll('a[href]').length,
        inputs: document.querySelectorAll('input,select,textarea').length,
        media: document.querySelectorAll('img,picture,video,svg,canvas').length,
        words: cleanText(document.body.innerText).split(/\s+/).filter(Boolean).length
      },
      landmarks,
      components,
      textBlocks,
      media,
      rankedSelectors: [...new Set([...landmarks, ...components, ...textBlocks].map(item => item.selector))].slice(0, 40)
    };
  } catch (e) {
    genome.evidencePacket = { protocol: 'CGE-DOM-EVIDENCE/1.0', error: e.message };
  }

  return genome;
}

// ─── OVERLAY FUNCTION (runs in page context via executeScript) ─────────────────
// Theory: The [annotate] operation. Injects a shadow DOM island that draws
// colored locus-labeled borders over matched selectors — non-destructive.
function toggleDOMOverlay(genome, show) {
  const OVERLAY_ID = '__dom_genetics_overlay__';
  const existing = document.getElementById(OVERLAY_ID);

  if (!show) {
    if (window.__domGeneticsOverlayCleanup) window.__domGeneticsOverlayCleanup();
    if (existing) existing.remove();
    return;
  }

  if (window.__domGeneticsOverlayCleanup) window.__domGeneticsOverlayCleanup();
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

  const css = `
    * { box-sizing: border-box; }
    .legend {
      position: fixed; right: 10px; top: 10px; display: flex; flex-wrap: wrap; gap: 4px;
      max-width: min(360px, calc(100vw - 20px)); padding: 6px; background: #000; border: 1px solid #fff;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; z-index: 3;
    }
    .legend span { font-size: 9px; font-weight: 900; letter-spacing: 0.08em; padding: 2px 5px; color: #000; }
    .locus-badge {
      position: absolute; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; font-weight: 900;
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

  const usedLoci = [...new Set((genome.codons || []).map(c => c.locus || c.type))]
    .filter(Boolean)
    .sort((a, b) => ['LAYOUT', 'COLOR', 'TYPOGRAPHY', 'SPACING', 'COMPONENT', 'INTERACTION', 'COPY', 'RADIUS'].indexOf(a) - ['LAYOUT', 'COLOR', 'TYPOGRAPHY', 'SPACING', 'COMPONENT', 'INTERACTION', 'COPY', 'RADIUS'].indexOf(b));

  const legend = document.createElement('div');
  legend.className = 'legend';
  usedLoci.forEach(locus => {
    const tag = document.createElement('span');
    tag.style.background = LOCUS_COLORS[locus] || '#fff';
    tag.textContent = locus;
    legend.appendChild(tag);
  });
  shadow.appendChild(legend);

  const visible = el => {
    if (!el || el === host) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 4 && rect.height > 4 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth;
  };

  const query = selector => {
    try { return [...document.querySelectorAll(selector)].filter(visible); }
    catch (e) { return []; }
  };

  const targetsFor = locus => {
    const map = {
      LAYOUT: () => [document.querySelector('main'), document.querySelector('[class*="container"]'), document.body].filter(visible).slice(0, 2),
      COLOR: () => query('header, nav, button, [role="button"], a[href]').slice(0, 5),
      TYPOGRAPHY: () => query('h1, h2, h3, p').filter(el => (el.innerText || '').trim()).slice(0, 4),
      SPACING: () => query('section, main > *, article > *, [class*="section"]').slice(0, 5),
      COMPONENT: () => query('nav, form, button, input, select, textarea, [role="button"], [class*="card"], [class*="panel"]').slice(0, 8),
      INTERACTION: () => query('[class*="anim"], [class*="fade"], [class*="slide"], [class*="transition"], button, a[href]').slice(0, 5),
      COPY: () => query('h1, h2, h3, button, a[href]').filter(el => (el.innerText || '').trim()).slice(0, 5),
      RADIUS: () => query('button, input, select, textarea, [class*="card"], img').slice(0, 5)
    };
    return map[locus] ? map[locus]() : [];
  };

  const render = () => {
    canvas.textContent = '';
    usedLoci.forEach(locus => {
      const color = LOCUS_COLORS[locus] || '#fff';
      const targets = targetsFor(locus);
      targets.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const outline = document.createElement('div');
        outline.className = 'locus-outline';
        outline.style.cssText = `
          left: ${Math.max(0, rect.left)}px;
          top: ${Math.max(0, rect.top)}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
          border-color: ${color};
        `;
        canvas.appendChild(outline);

        const badge = document.createElement('div');
        badge.className = 'locus-badge';
        badge.style.cssText = `
          left: ${Math.max(0, rect.left + 4)}px;
          top: ${Math.max(0, rect.top + 4)}px;
          background: ${color};
          color: #000;
        `;
        badge.textContent = locus;
        canvas.appendChild(badge);
      });
    });
  };

  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  };
  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule, true);
  window.__domGeneticsOverlayCleanup = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule, true);
    window.__domGeneticsOverlayCleanup = null;
  };
  render();
}

function applyPageGeneticsCss(css) {
  const STYLE_ID = '__dom_genetics_mutation_style__';
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.documentElement.appendChild(style);
  }
  style.textContent = String(css || '');
}

function showOperationOverlay(payload = {}) {
  const HOST_ID = '__cge_operation_overlay__';
  const show = payload.show !== false;
  const existing = document.getElementById(HOST_ID);

  if (!show) {
    if (existing) existing.remove();
    return;
  }

  const label = String(payload.label || 'GENOMA OPERATION').slice(0, 96);
  const mode = String(payload.mode || 'runtime').toUpperCase().slice(0, 24);
  const selectors = Array.isArray(payload.selectors) ? payload.selectors.slice(0, 10) : [];

  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483645;pointer-events:none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .veil {
      position: fixed; inset: 0; overflow: hidden; pointer-events: none;
      background:
        linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.02) 28%, rgba(0,0,0,.16)),
        repeating-linear-gradient(0deg, rgba(28,176,198,.16) 0 1px, transparent 1px 12px);
      animation: scan 3.8s linear infinite;
      mix-blend-mode: normal;
    }
    .beam {
      position: absolute; left: 0; right: 0; height: 96px; top: -110px;
      background: linear-gradient(180deg, transparent, rgba(28,176,198,.22), rgba(248,140,34,.18), transparent);
      animation: beam 4.6s ease-in-out infinite;
    }
    .plate {
      position: fixed; left: 12px; top: 12px; min-width: 230px; max-width: min(430px, calc(100vw - 24px));
      background: #000; color: #fff; border: 2px solid #fff; box-shadow: 6px 6px 0 #1cb0c6;
      padding: 10px 12px; font: 900 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: .08em; text-transform: uppercase;
    }
    .mark { display: inline-grid; place-items: center; width: 22px; height: 22px; margin-right: 8px; vertical-align: middle; }
    .label { color: #f88c22; margin-top: 5px; font-size: 10px; letter-spacing: .04em; text-transform: none; }
    .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 8px; }
    .step { border: 1px solid #fff; color: #fff; padding: 3px 4px; text-align: center; font-size: 8px; }
    .step.on { background: #fff; color: #000; }
    .target {
      position: fixed; border: 2px solid #f88c22; box-shadow: 0 0 0 2px #000, 0 0 22px rgba(248,140,34,.44);
      animation: pulse 2.4s ease-in-out infinite;
    }
    @keyframes scan { from { background-position: 0 0, 0 0; } to { background-position: 0 0, 0 48px; } }
    @keyframes beam { 0%, 100% { transform: translateY(-120px); opacity: .2; } 50% { transform: translateY(calc(100vh + 120px)); opacity: .72; } }
    @keyframes pulse { 0%,100% { opacity:.34; transform: scale(1); } 50% { opacity:.9; transform: scale(1.01); } }
    @media (prefers-reduced-motion: reduce) {
      .veil,.beam,.target { animation: none; }
    }
  `;
  shadow.appendChild(style);

  const veil = document.createElement('div');
  veil.className = 'veil';
  const beam = document.createElement('div');
  beam.className = 'beam';
  const plate = document.createElement('div');
  plate.className = 'plate';
  plate.innerHTML = `
    <span class="mark">
      <svg viewBox="0 0 100 100" fill="none" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
        <path d="M15,45 C15,20 35,10 65,10 L65,28 C45,28 35,32 35,45 Z" fill="#1cb0c6"/>
        <rect x="15" y="52" width="40" height="18" rx="4" fill="#1cb0c6"/>
        <path d="M58,35 L80,35 L80,65 C80,85 60,92 35,92 L35,74 C50,74 58,70 58,65 Z" fill="#f88c22"/>
      </svg>
    </span>${escapeText(mode)}
    <div class="label">${escapeText(label)}</div>
    <div class="steps">
      <div class="step on">CAPTURE</div>
      <div class="step ${/ENCOD|MUTAT|EXPRESS|BREED/i.test(label) ? 'on' : ''}">ENCODE</div>
      <div class="step ${/MUTAT|BREED|PUNNETT|CROSS/i.test(label) ? 'on' : ''}">CROSS</div>
      <div class="step ${/EXPRESS|ARTIFACT|PHENOTYPE|SELECT/i.test(label) ? 'on' : ''}">SELECT</div>
    </div>
  `;
  shadow.append(veil, beam, plate);

  selectors
    .map(selector => {
      try { return document.querySelector(selector); } catch (e) { return null; }
    })
    .filter(Boolean)
    .slice(0, 8)
    .forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const box = document.createElement('div');
      box.className = 'target';
      box.style.cssText = `left:${Math.max(0, rect.left)}px;top:${Math.max(0, rect.top)}px;width:${rect.width}px;height:${rect.height}px;`;
      shadow.appendChild(box);
    });

  function escapeText(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }
}

function applyArtifactOverlay(html) {
  const HOST_ID = '__cge_live_artifact__';
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#000;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .bar {
      position:absolute; left:0; right:0; top:0; height:34px; display:flex; align-items:center; justify-content:space-between;
      background:#000; color:#fff; border-bottom:2px solid #fff; font:900 11px ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing:0.08em; padding:0 10px; z-index:2;
    }
    button { background:#fff; color:#000; border:0; padding:5px 8px; font:900 10px ui-monospace, SFMono-Regular, Menlo, monospace; cursor:pointer; }
    iframe { position:absolute; left:0; right:0; top:34px; bottom:0; width:100%; height:calc(100% - 34px); border:0; background:#fff; }
  `;
  shadow.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'bar';
  const label = document.createElement('span');
  label.textContent = 'CONTEXT GENETICS LIVE ARTIFACT';
  const close = document.createElement('button');
  close.textContent = 'CLOSE';
  close.addEventListener('click', () => host.remove());
  bar.append(label, close);
  shadow.appendChild(bar);

  const frame = document.createElement('iframe');
  frame.sandbox = 'allow-scripts allow-forms allow-modals';
  frame.src = `data:text/html;charset=utf-8,${encodeURIComponent(String(html || '<!doctype html><html><body>No artifact.</body></html>'))}`;
  shadow.appendChild(frame);
}
