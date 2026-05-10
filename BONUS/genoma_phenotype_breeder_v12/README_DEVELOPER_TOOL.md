# GENOMA Phenotype Breeder v12

This build changes the center of gravity:

- The current page is **F0 baseline / fitness oracle**.
- The main artifact is the **Prompt Genome**.
- The generated result is a **Child Phenotype** rendered as a reversible overlay/sibling UI.
- Whole-page patching is no longer the primary action.
- You can toggle **Original / Child / Diff**.

## Flow

1. Configure a model.
2. Open a normal webpage.
3. Type one instruction.
4. Click **Encode Prompt Genome**.
5. Inspect or mutate RSN/EVD/STY/FLR/MUT/SEL prompt codons.
6. Click **Express Child UI**.
7. Toggle Original / Child / Diff on the live page.
8. Select the child as next generation or export the state JSON.

## Model router

The extension has two model fields:

- **Reasoning model**: page evidence → prompt genome, and prompt genome → child phenotype.
- **Fast model**: bound-codon mutation and small rewrites.

The extension does not pretend to understand the page without the LLM. The browser only captures evidence, displays codons, installs the child overlay, and stores lineage.

## Files

- `manifest.json` MV3 extension manifest.
- `background.js` service worker, model router, page capture, child phenotype installer.
- `panel/panel.html`, `panel/panel.css`, `panel/panel.js` side-panel UI.
- `content_script.js` lightweight ping-only content script.

## Safety model

Child UI HTML is sanitized before being installed:

- Removes scripts, iframes, objects, embeds, imports, inline handlers, `javascript:` URLs.
- Installs inside a Shadow DOM host with `data-genoma-ui="true"`.
- Original page remains underneath and can be restored by clearing the child layer.

