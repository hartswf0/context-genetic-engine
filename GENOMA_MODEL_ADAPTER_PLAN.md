# GENOMA Model Adapter Plan

Several older harness pages still call Gemini directly. That is the wrong long-term shape. The extension builds already point toward the better architecture: one provider router, many model backends.

## Program Theory

<prompt operation> [compiles into] <provider-neutral request>

<provider-neutral request> [routes through] <model adapter>

<model adapter> [returns] <normalized text or JSON>

<harness> [uses] <same operation names> regardless of provider

## Required Adapter Shape

Every harness should call one function:

```js
GenomaModel.call({
  provider: "openai",
  endpoint: "https://api.openai.com/v1/responses",
  model: "gpt-5.1",
  apiKey: "...",
  system: "You are the Context Genetics Engine...",
  prompt: "Encode this prototype...",
  json: true,
  images: []
});
```

The first shared implementation is now in `genoma-model-adapter.js`.

## Browser Security Constraint

Static HTML can call local OpenAI-compatible endpoints, but cloud providers usually need one of these:

- Chrome extension background worker with host permissions
- local development proxy
- serverless proxy
- backend route

Do not put real cloud API keys into public static HTML. The adapter is the common call shape; the secure transport still depends on where the harness runs.

The adapter should normalize:

- OpenAI Responses API
- Gemini `generateContent`
- Anthropic Messages API
- local OpenAI-compatible chat completions

## Pages That Need Migration

- `g1.html`
- `g2.html`
- `pbre.html`
- `phub.html`
- `f4.html`

These currently contain direct `generativelanguage.googleapis.com` calls and blank `apiKey` constants. The right fix is not to paste keys into those files. The right fix is to give each page a model config drawer and shared adapter.

## Migration Order

1. `g2.html`: primary workbench and most important demo surface.
2. `g1.html`: trace-heavy prototype with codon-level image evidence.
3. `f4.html`: vocabulary/operation engine.
4. `phub.html` and `pbre.html`: migrate text generation first, then image generation separately.

## Image Generation

Text model routing and image model routing should stay separate.

<text model> [encodes] <genomes and prompt artifacts>

<image model> [renders] <visual references>

Do not block prompt-genome work on image generation. If an image endpoint is unavailable, keep the genotype and mark the visual evidence as missing.

## No-Key Mode

Every migrated harness should support:

- deterministic local encoding
- imported JSON genomes
- saved lineage in `localStorage`
- artifact preview from existing HTML

Provider calls should be optional, not required for the page to open or demonstrate the theory.
