# Context Genetics Engine Chrome Extension

This folder is the Manifest V3 extension build of the Context Genetics Engine.

## Files

- `manifest.json` declares the side panel, permissions, background worker, and CSP.
- `GENOMA_CONTEXT.html` is the side-panel UI shell. It has no inline event handlers.
- `app.js` owns all UI state and event listeners.
- `background.js` handles Gemini calls, URL ingestion, active-tab routing, and content-script injection.
- `content.js` extracts readable page context and can apply generated CSS to the active tab.

## Load It

1. Open `chrome://extensions/`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this `DEV` folder.
5. Open a normal web page.
6. Click the extension icon to open the side panel.

## API Key

The panel can be opened and used for manual genome editing, import/export, URL ingest, and active-tab context extraction without a Gemini key.

Gemini model execution requires a key:

1. Create a Gemini API key in Google AI Studio.
2. Paste it into the `Gemini API key` field in the panel.
3. Click `Save`.

The key is stored in `chrome.storage.local` for this unpacked extension. Do not commit a real key into this repo.

## Smoke Test

1. Load the extension.
2. Click `Help`; the modal should open.
3. Add a manual codon.
4. Leave `Target Task` blank and click `Express Phenotype`; the extension should try to read the active tab.
5. Without an API key, the output should fall back to the compiled prompt instead of crashing.
6. With an API key saved, `Synthesize Genome` and `Express Phenotype` should call Gemini.

For `file://` pages, Chrome requires enabling `Allow access to file URLs` on the extension details page.
