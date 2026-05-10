# GENOMA Prompt Genetics Extension

This is the Chrome extension version of the Context Genetics suite.

## Program Loop

```text
web page -> Scan DOM evidence -> choose encoder grammar -> editable prompt genome -> codon ask/mutate/artifact -> field target task -> completion artifact or live page overlay
saved genomes -> lineage vault -> parent selection -> Punnett cross -> expressed offspring
```

## What Each Part Does

- `manifest.json` declares the MV3 extension, side panel, permissions, icons, and model/API host access.
- `background.js` routes privileged work: DOM extraction, overlay injection, storage, and model calls.
- `content_script.js` is intentionally small and only confirms the script is alive.
- `panel/panel.html` is the side-panel shell.
- `panel/panel.js` owns the application state and all event binding.

## Panels

- `Extract`: samples the active tab into raw DOM observations, shows a live operation veil on the page, lets you choose `g1`, `f4`, `phub`, or `hybrid`, then transcribes evidence into that genome grammar. The live page mutation path is trace-first: it maps inheritance without overwriting the site's original design.
- `Genome`: edits the active genotype, toggles EXON/INTRON state, nests raw DOM alleles under prompt codons as evidence, adds manual codons, attaches codon reference images, and lets you query, mutate, or express individual codons inline.
- `Field`: applies the active genotype to a target task, renders a completion artifact, and can apply that artifact as a reversible live-page overlay.
- `Lineage`: stores and reloads genomes.
- `Breed`: selects two parents, generates an F1 competition matrix, scores offspring, selects a winner back into the active genome, and expresses crossed phenotypes. Mutation is treated as variety, not improvement; selection pressure defines what survives.
- `Config`: chooses Gemini, OpenAI Reasoning, Anthropic, or local Llama, and sets codon candidate count for mutation passes.

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
5. Click `Edit Prompt`; expand Evidence alleles under a codon, attach a reference image, ask an individual codon, mutate a codon, express a codon artifact, or add a manual codon.
6. Save two genomes, set Parent A and Parent B, run the Punnett cross, then select or express an F1 offspring.
7. Go to `Field`, add a target task, click `Express Artifact`, then click `APPLY` to see the output on the live page.
8. Without a key, the panel should show the compiled prompt instead of crashing.
9. Save the genome to lineage, reload the lineage tab, and confirm the card remains available.

Restricted pages such as `chrome://`, the Chrome Web Store, and empty `about:blank` cannot be extracted.
