# Mobile And Share Surface

The extension panels can be linked, but a linked panel is only a preview. A real Chrome extension side panel needs the `chrome.*` extension runtime, which mobile browsers and normal iframes do not provide.

## What A Link Can Do

<link> [opens] <documentation>

<link> [opens] <panel preview>

<link> [opens] <artifact preview>

<link> [opens] <scope atlas>

The public hub should point people to pages that make sense on mobile:

- `index.html`
- `extension-share.html`
- `video.html`
- `demo.html`
- `genoma-scope-atlas.html`
- `BONUS/genoma_prompt_genome_compiler_v14/artifact/artifact.html`

## What An Iframe Can Do

<iframe> [can show] <static page>

<iframe> [can show] <artifact>

<iframe> [cannot provide] <extension runtime>

Good iframe targets:

- generated artifacts
- read-only panel previews
- the atlas page
- the video page

Bad iframe targets:

- anything that needs `chrome.tabs`
- anything that needs `chrome.scripting`
- anything that expects access to the active browser tab

## Mobile Demo Rule

Use mobile to show:

- the hub
- the video
- the atlas
- generated artifacts
- documentation

Use desktop Chrome or Edge to show:

- live page capture
- side-panel mutation
- active tab extraction
- extension lineage vault
- real provider calls

## Future Share Runtime

The durable share format should be:

```json
{
  "sourceUrl": "https://example.com",
  "screenshot": "data-or-file-reference",
  "operationalGenome": [],
  "promptGenome": [],
  "selectedPhenotype": {},
  "artifactHtml": "<!doctype html>..."
}
```

That would let the extension export a replayable share bundle. The bundle can then render on mobile without needing the original extension runtime.
