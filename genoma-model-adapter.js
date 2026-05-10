/*
 * GENOMA Model Adapter
 *
 * Shared provider-neutral call shape for future harness migration.
 *
 * Static HTML warning:
 * - Local OpenAI-compatible endpoints are the safest no-key path.
 * - Cloud providers from a normal web page may fail because of CORS and should
 *   not expose real API keys in public client code.
 * - Chrome extensions should route cloud calls through a background worker.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'genoma_model_config';

  const DEFAULTS = {
    openai: {
      provider: 'openai',
      endpoint: 'https://api.openai.com/v1/responses',
      model: 'gpt-5.1',
      apiKey: '',
      reasoningEffort: 'high'
    },
    gemini: {
      provider: 'gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      model: 'gemini-2.5-flash',
      apiKey: '',
      reasoningEffort: 'none'
    },
    anthropic: {
      provider: 'anthropic',
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-sonnet-4-20250514',
      apiKey: '',
      reasoningEffort: 'none'
    },
    local: {
      provider: 'local',
      endpoint: 'http://localhost:11434/v1/chat/completions',
      model: 'llama3.1',
      apiKey: '',
      reasoningEffort: 'none'
    }
  };

  function normalizeConfig(config) {
    const provider = DEFAULTS[config?.provider] ? config.provider : 'local';
    const base = DEFAULTS[provider];
    return {
      provider,
      endpoint: String(config?.endpoint || base.endpoint).trim(),
      model: String(config?.model || base.model).trim(),
      apiKey: String(config?.apiKey || config?.api_key || '').trim(),
      reasoningEffort: String(config?.reasoningEffort || config?.reasoning_effort || base.reasoningEffort).trim()
    };
  }

  function loadConfig() {
    try {
      return normalizeConfig(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch (_error) {
      return normalizeConfig({});
    }
  }

  function saveConfig(config) {
    const normalized = normalizeConfig(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  async function call(request) {
    const config = normalizeConfig({ ...loadConfig(), ...(request?.config || request || {}) });
    const system = String(request?.system || '');
    const prompt = String(request?.prompt || request?.input || '');
    const json = Boolean(request?.json);
    const images = Array.isArray(request?.images) ? request.images : [];

    if (config.provider !== 'local' && !config.apiKey) {
      throw new Error(`API key required for ${config.provider}. Use local for no-key testing.`);
    }

    if (config.provider === 'openai') return callOpenAI({ config, system, prompt, json, images });
    if (config.provider === 'gemini') return callGemini({ config, system, prompt, json, images });
    if (config.provider === 'anthropic') return callAnthropic({ config, system, prompt, json });
    return callOpenAICompatible({ config, system, prompt, json });
  }

  async function callOpenAI({ config, system, prompt, json, images }) {
    const input = [];
    if (system) input.push({ role: 'system', content: [{ type: 'input_text', text: system }] });
    const userContent = [{ type: 'input_text', text: prompt }];
    images.forEach((image) => {
      if (image?.dataUrl) userContent.push({ type: 'input_image', image_url: image.dataUrl });
      if (image?.url) userContent.push({ type: 'input_image', image_url: image.url });
    });
    input.push({ role: 'user', content: userContent });

    const body = {
      model: config.model,
      input,
      text: json ? { format: { type: 'json_object' } } : undefined
    };
    if (/^gpt-5/i.test(config.model)) body.reasoning = { effort: config.reasoningEffort || 'high' };

    const data = await postJson(config.endpoint, {
      Authorization: `Bearer ${config.apiKey}`
    }, body);

    const text = data.output_text
      || data.output?.flatMap((item) => item.content || []).map((part) => part.text || '').join('')
      || '';
    return normalizeResult(text, data, json);
  }

  async function callGemini({ config, system, prompt, json, images }) {
    const parts = [];
    if (system) parts.push({ text: system });
    parts.push({ text: prompt });
    images.forEach((image) => {
      if (image?.mimeType && image?.data) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    });

    const endpoint = `${config.endpoint.replace(/\/$/, '')}/${encodeURIComponent(config.model)}:generateContent`;
    const data = await postJson(endpoint, {
      'x-goog-api-key': config.apiKey
    }, {
      contents: [{ parts }],
      generationConfig: json ? { responseMimeType: 'application/json' } : undefined
    });

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    return normalizeResult(text, data, json);
  }

  async function callAnthropic({ config, system, prompt, json }) {
    const data = await postJson(config.endpoint, {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    }, {
      model: config.model,
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = data.content?.map((part) => part.text || '').join('') || '';
    return normalizeResult(text, data, json);
  }

  async function callOpenAICompatible({ config, system, prompt, json }) {
    const headers = {};
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    const data = await postJson(config.endpoint, headers, {
      model: config.model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt }
      ],
      response_format: json ? { type: 'json_object' } : undefined,
      temperature: 0.15
    });
    const text = data.choices?.[0]?.message?.content || '';
    return normalizeResult(text, data, json);
  }

  async function postJson(url, headers, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_error) {
      data = { text };
    }
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `${response.status} ${text.slice(0, 300)}`);
    }
    return data;
  }

  function normalizeResult(text, raw, json) {
    if (!json) return { text, raw };
    const parsed = parseJson(text);
    return { text, json: parsed, raw };
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (_error) {
      const match = String(text).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!match) throw new Error('Model did not return JSON.');
      return JSON.parse(match[0]);
    }
  }

  window.GenomaModel = {
    DEFAULTS,
    loadConfig,
    saveConfig,
    normalizeConfig,
    call
  };
})();
