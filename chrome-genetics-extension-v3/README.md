# DOM Genetics Engine Extension

This is the Chrome extension version of the Context Genetics suite.

## Program Loop

```text
web page -> Scan DOM -> choose encoder grammar -> editable prompt genome -> field target task -> completion artifact or live page overlay
saved genomes -> lineage vault -> parent selection -> Punnett cross -> expressed offspring
```

## What Each Part Does

- `manifest.json` declares the MV3 extension, side panel, permissions, icons, and model/API host access.
- `background.js` routes privileged work: DOM extraction, overlay injection, storage, and model calls.
- `content_script.js` is intentionally small and only confirms the script is alive.
- `panel/panel.html` is the side-panel shell.
- `panel/panel.js` owns the application state and all event binding.

## Panels

- `Extract`: samples the active tab into raw DOM observations, lets you choose `g1`, `f4`, `phub`, or `hybrid`, then transcribes evidence into that genome grammar.
- `Genome`: edits the active genotype, toggles EXON/INTRON state, adds manual codons, attaches codon reference images, and lets you query or mutate individual codons inline.
- `Field`: applies the active genotype to a target task, renders a completion artifact, and can apply that artifact as a reversible live-page overlay.
- `Lineage`: stores and reloads genomes.
- `Breed`: selects two parents and expresses crossed offspring.
- `Config`: chooses Gemini, OpenAI Reasoning, Anthropic, or local Llama.

## Provider Setup

- `Gemini`: endpoint `https://generativelanguage.googleapis.com/v1beta/models`, model `gemini-2.5-flash`.
- `OpenAI Reasoning`: endpoint `https://api.openai.com/v1/responses`, model `gpt-5.1`, configurable reasoning effort.
- `Anthropic`: endpoint `https://api.anthropic.com/v1/messages`, model `claude-sonnet-4-20250514`.
- `Local Llama`: endpoint `http://localhost:11434/v1/chat/completions`, model `llama3.1`, no key required.

Keys are stored in `chrome.storage.local`; do not commit real keys.

## Smoke Test

1. Load this folder with `chrome://extensions` -> `Load unpacked`.
2. Open a normal `https://` page.
3. Click the extension icon.
4. Choose an encoder grammar and scan the page. `g1` produces prompt loci; `f4` produces operational loci; `phub` produces lineage/breeding loci.
5. Click `Edit Prompt`; toggle a codon, attach a reference image, ask an individual codon, mutate a codon, or add a manual codon.
6. Go to `Field`, add a target task, click `Express Artifact`, then click `APPLY` to see the output on the live page.
7. Without a key, the panel should show the compiled prompt instead of crashing.
8. Save the genome to lineage, reload the lineage tab, and confirm the card remains available.

Restricted pages such as `chrome://`, the Chrome Web Store, and empty `about:blank` cannot be extracted.
