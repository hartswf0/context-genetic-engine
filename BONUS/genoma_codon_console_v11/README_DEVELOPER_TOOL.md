# GENOMA Codon Console v11

LLM-first Chrome side-panel extension.

## Purpose

This version removes the debug-landfill interface and makes the LLM the center of the tool.

The extension only provides the body:

- capture live page evidence
- assign stable `data-genoma-anchor-id` selectors
- display a small operating map
- bind one codon
- apply safe reversible patches
- undo changes

The model provides meaning:

- transcribes page evidence into semantic operating codons
- mutates bound codons
- plans selector-bound patches

## Workflow

1. Open a normal webpage.
2. Open side panel.
3. Click **MODEL** and configure provider/model/key.
4. Write one instruction.
5. Click **TRANSCRIBE PAGE**.
6. Bind one codon from the Operating Map.
7. Chat with that codon, or click **PATCH THIS CODON**.
8. Inspect summary, then **Apply Plan**.
9. Undo if needed.

## UI Philosophy

Default view hides raw JSON and logs.

- Operating Map: 8–12 semantic codons, not a raw DOM dump.
- Bound Codon: what it controls, what can change, what cannot change.
- Result: operation count and safe summary.
- Debug and JSON are modal drawers.

## Provider Support

- OpenAI / OpenAI-compatible chat completions
- Anthropic Messages API
- Gemini generateContent API
- Local OpenAI-compatible endpoints such as Ollama or LM Studio

## Safety Rules

Patch compiler rejects destructive behavior:

- no scripts
- no inline event handlers
- no external resources
- no `javascript:` URLs
- no remove/hide/replaceHTML
- no casual text replacement of structural/interactive containers
- preserve links, forms, buttons, inputs, href/src/action/method/type/name/value

## Install

Unzip, go to `chrome://extensions`, enable Developer Mode, click **Load unpacked**, select this folder.

Remove older GENOMA builds before installing to avoid opening stale side panels.
