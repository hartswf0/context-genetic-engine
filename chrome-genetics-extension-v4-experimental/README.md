# GENOMA Lineage Lab

This is the experimental v4 copy of the GENOMA Prompt Genetics extension. It exists so the project can try stronger lineage, screenshot, atlas, and cinematic workflows without destabilizing the current v3 build.

## Program Loop

```text
live page -> capture evidence -> encode operational genome -> encode prompt genome
prompt genome -> mutate/cross/select -> express artifact -> optional live overlay
saved lineage -> compare generations -> export/share atlas evidence
```

## Why This Exists

The stable v3 extension is the working side-panel tool. The v4 lab is for riskier ideas:

- atlas-backed lineage
- screenshot and recording support
- stronger status/progress choreography
- mobile/share bundle thinking
- provider-routed model experimentation
- better visual separation between encode, mutate, express, and select

## Install

1. Open `chrome://extensions/`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select `chrome-genetics-extension-v4-experimental`.
5. Open a normal website.
6. Click the extension icon and open the side panel.

Restricted pages such as `chrome://`, the Chrome Web Store, and empty `about:blank` cannot be extracted.

## Provider Setup

The lab uses the same provider stance as v3:

- `Gemini`: endpoint `https://generativelanguage.googleapis.com/v1beta/models`, model `gemini-2.5-flash`.
- `OpenAI Reasoning`: endpoint `https://api.openai.com/v1/responses`, model `gpt-5.1`, configurable reasoning effort.
- `Anthropic`: endpoint `https://api.anthropic.com/v1/messages`.
- `Local Llama`: endpoint `http://localhost:11434/v1/chat/completions`, model `llama3.1`, no key required.

Keys are stored in `chrome.storage.local`; do not commit real keys.

## Mobile And Links

The panel can be opened as a preview from `index.html`, but preview mode is not the same as extension runtime. Anything that needs `chrome.tabs`, `chrome.scripting`, or the active browser tab needs desktop Chrome or Edge.

For mobile sharing, use:

- `extension-share.html`
- `genoma-scope-atlas.html`
- generated artifact pages
- `video.html`

## Current Boundary

This folder is a forked workbench. Prefer fixing core runtime bugs in v3 first. Use v4 for experiments that change the operator experience, lineage model, or presentation layer.
