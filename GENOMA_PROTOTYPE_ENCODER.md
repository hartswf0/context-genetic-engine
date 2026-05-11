# GENOMA Prototype Encoder

This is the first local test of the claim that the suite can treat prototypes as genomes.

The encoder does not call an LLM. It reads the repo's prototype HTML files, plus companion `panel.js` and `background.js` files for extension panels, and emits a deterministic GENOMA Scope atlas:

- `data/genoma-scope-atlas.json`
- `genoma-scope-atlas.html`

Run it from the repo root:

```bash
python3 tools/encode_genoma_scope.py
```

## Program Theory

<prototype> [transforms into] <source metrics>

<source metrics> [transforms into] {<operational genome>, <prompt genome>}

<operational genome> [uses] `<TXT|STY|CDE|HPL|IMG|CMT|ROW_S|COL_S|END>`

<prompt genome> [uses] `<RSN|EVD|OUT|FIT|FLR|CST|MUT|SEL>`

<atlas> [renders] <comparable genome cards>

## What The Encoder Measures

The script scans:

- visible text and heading density
- links, buttons, inputs, textareas, forms
- image, iframe, canvas, and video surfaces
- CSS variables, colors, font families, media queries, animations, radius rules
- script blocks, functions, fetch calls, localStorage, `chrome.*` API use
- API host references
- prompt, system, intent, directive, codon, genome, mutation, selection, and theory language
- literal prompt constants, POML blocks, model directives, and source codon payloads
- companion side-panel/background scripts for extension prototypes
- CSP/API-key risk signals

## Output Shape

Each generated genome follows the Scope shape:

```json
{
  "genome_id": "G2::PROMPT",
  "sequence": [
    {
      "type": "RSN",
      "payload": "Read this page as a genome workbench...",
      "evidence": "Extracted source evidence...",
      "weight": 98,
      "is_intron": false
    }
  ]
}
```

The extra `evidence` and `weight` fields are intentionally retained. Existing Scope visualizers can ignore them; the atlas uses them for inspection.

## Why This Matters

This creates a real testing layer:

- It turns actual prompt material into prompt genomes, instead of only summarizing DOM traits.
- It shows which prototypes actually contain prompt-genetic machinery.
- It separates <operational genome> from <prompt genome>.
- It exposes weak pages instead of pretending all pages are equally encoded.
- It gives us a stable before/after artifact for future LLM encoding.

The next useful step is a second-pass model encoder that reads `data/genoma-scope-atlas.json`, critiques the heuristic genome, and proposes a refined genome with citations back to the deterministic evidence.
