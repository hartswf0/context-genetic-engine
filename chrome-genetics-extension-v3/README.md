# DOM Genetics Engine Extension

This is the Chrome extension version of the Context Genetics suite.

## Program Loop

```text
web page -> Extract -> editable genotype -> field target task -> completion artifact
saved genomes -> lineage vault -> parent selection -> Punnett cross -> expressed offspring
```

## What Each Part Does

- `manifest.json` declares the MV3 extension, side panel, permissions, icons, and model/API host access.
- `background.js` routes privileged work: DOM extraction, overlay injection, storage, and model calls.
- `content_script.js` is intentionally small and only confirms the script is alive.
- `panel/panel.html` is the side-panel shell.
- `panel/panel.js` owns the application state and all event binding.

## Panels

- `Extract`: samples the active tab into codons and can annotate the live page.
- `Genome`: edits the active genotype, toggles EXON/INTRON state, adds manual codons, and lets you query the genotype.
- `Field`: applies the active genotype to a target task and renders a completion artifact.
- `Lineage`: stores and reloads genomes.
- `Breed`: selects two parents and expresses crossed offspring.
- `Config`: chooses Gemini, OpenAI-compatible, Anthropic, or local Llama.

## Provider Setup

- `Gemini`: endpoint `https://generativelanguage.googleapis.com/v1beta/models`, model `gemini-2.5-flash`.
- `OpenAI-compatible`: endpoint `https://api.openai.com/v1/chat/completions`, model `gpt-4o-mini`.
- `Anthropic`: endpoint `https://api.anthropic.com/v1/messages`, model `claude-sonnet-4-20250514`.
- `Local Llama`: endpoint `http://localhost:11434/v1/chat/completions`, model `llama3.1`, no key required.

Keys are stored in `chrome.storage.local`; do not commit real keys.

## Smoke Test

1. Load this folder with `chrome://extensions` -> `Load unpacked`.
2. Open a normal `https://` page.
3. Click the extension icon.
4. Extract the page.
5. Click `Edit Genotype`; toggle a codon or add a manual codon.
6. Go to `Field`, add a target task, and click `Express Artifact`.
7. Without a key, the panel should show the compiled prompt instead of crashing.
8. Save the genome to lineage, reload the lineage tab, and confirm the card remains available.

Restricted pages such as `chrome://`, the Chrome Web Store, and empty `about:blank` cannot be extracted.
