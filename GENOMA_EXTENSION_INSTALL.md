# GENOMA Extension Install

Use desktop Chrome or Edge for the actual side-panel tools. Mobile browsers can open the linked pages as previews, but they cannot load this repo as an unpacked Chrome extension.

## Install From This Repo

1. Open `chrome://extensions/`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select one extension folder:
   - `chrome-genetics-extension-v3`
   - `chrome-genetics-extension-v4-experimental`
   - `BONUS/genoma_actual_page_mutator_v10`
   - `BONUS/genoma_codon_console_v11`
   - `BONUS/genoma_phenotype_breeder_v12`
   - `BONUS/genoma_phenotype_breeder_v12_1`
   - `BONUS/genoma_prompt_genome_compiler_v13`
   - `BONUS/genoma_prompt_genome_compiler_v14`
5. Open a normal website.
6. Click the extension icon.
7. Open the side panel.
8. Configure the model provider inside the panel if the build uses an LLM.

## Provider Setup

The extension builds should be treated as provider-routed tools:

- `OpenAI`: best for reasoning-heavy prompt genome encoding and artifact compilation.
- `Gemini`: supported where the panel exposes the provider router.
- `Anthropic`: supported in the provider-routed extension builds.
- `Local`: use an OpenAI-compatible local endpoint when you want no cloud key.

Use `local` for no-key testing. Use a cloud key only when you need model-assisted encoding, mutation, or artifact compilation.

## What Works Without An API Key

Most extension builds can still:

- open the panel
- read current tab metadata
- capture deterministic DOM/source evidence
- show local codons or placeholder genomes
- save/load local lineage
- preview generated artifacts that already exist in the repo

The model-backed operations need a provider key or a local model endpoint.

## Common Failure Modes

- `chrome.* is undefined`: the panel was opened as a normal web page. Load it as an unpacked extension for the real runtime.
- `API key required`: select `local`, or save a key for the chosen provider.
- `Cannot access page`: Chrome blocks extension scripts on internal pages like `chrome://`, the extension store, and some browser-owned screens.
- `CSP blocked inline script`: the page can be previewed, but extension-safe panels must keep scripts in separate `.js` files.
- `Panel works but mobile does not`: mobile browser preview is documentation/artifact mode only, not extension runtime.

## Recommended Demo Build

For the hackathon demo, use:

1. `chrome-genetics-extension-v3` as the stable side-panel tool.
2. `chrome-genetics-extension-v4-experimental` for the more speculative lineage/atlas branch.
3. `BONUS/genoma_prompt_genome_compiler_v14` when you need the cleanest recordable prompt-genome-to-artifact flow.
