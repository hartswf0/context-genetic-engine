# Context Genetics Engine Index

## Project Theory

Context Genetics Engine is a prompt-engineering interface that models prompt construction as a genetic system.

- Prompt = genotype
- Completion = phenotype
- Context = field
- User = breeder
- Instruction unit = codon
- Active instruction = exon
- Disabled/silent instruction = intron
- Prompt variation = mutation, divergence, and breeding

The project is not a biological genetics simulator. The genetics language is the interface grammar for building, inspecting, mutating, and testing system prompts.

## Current Artifacts

### index.html

`index.html` is the core entry page for the project suite.

It contains:

- A stark white/black intro surface.
- A clean card grid for each real project page.
- Links to raw pages.
- Links to `g1` and `g2` harnesses.
- A desktop-only iframe preview.
- Mobile-safe raw links with the heavy preview hidden on small screens.

The `index.html` page is the public entry point for the standalone HTML suite.

### g1.html

`g1.html` is the earlier standalone prototype labeled `CONTEXT GENETICS ENGINE (POML V5.1)`.

It contains:

- A dark high-contrast interface.
- A 3-column workspace:
  - Palette
  - Genotype
  - Field / Phenotype
- A trace console with expandable/collapsible log history.
- Genome navigation pills.
- Manual codon injection for:
  - `RSN` reasoning
  - `EVD` evidence
  - `OUT` output
  - `FLR` failure
  - `FIT` fitness
  - `CST` custom
- Codon cards with editable payloads.
- EXON / INTRON toggling.
- Codon reordering.
- Codon deletion.
- Undo history.
- Synthesis directive input.
- Image attachment support for synthesis context.
- Image attachment support for task context.
- Codon-level image attachment support.
- Localized codon mutation.
- Genome synthesis, mutation, and divergent stepping-stone operations.
- A Mendelian/Punnett-style matrix flow.
- Field execution through `expressPhenotype()`.
- Import/export of genome/environment JSON snapshots.
- Local storage persistence under `context_genome_sequence` and `context_target_task`.

Important implementation detail:

- The file calls Gemini directly with `fetch("https://generativelanguage.googleapis.com/...")`.
- `const apiKey = "";` is empty.
- Therefore the prototype has the UI and operation wiring, but it is not safely or fully API-connected as-is.

### g2.html

`g2.html` is the later standalone prototype labeled `Context Genetics Engine` / `CGE v8.9`.

It contains:

- A lighter paper/ink visual system.
- A 4-column dockable workspace:
  - Palette
  - Genotype
  - Matrix
  - Field
- Collapsible "alley" columns.
- A global minimap/navigation bar.
- Single-line pinned trace output.
- Global system status with busy indicator.
- Per-column status dots.
- Codon animation bars for processing states.
- A lineage bank with multiple prompt genomes.
- Active genome switching.
- New blank lineage creation.
- Active genome cloning.
- Active lineage purge.
- Manual codon injection chips.
- Collapsible gene cards.
- Expand-all / collapse-all behavior.
- EXON / INTRON toggling.
- Genome compilation from active exons only.
- Matrix lock state until a sequence exists.
- Explicit 2x2 Punnett matrix rendering.
- AI-generated divergent Parent B for matrix breeding.
- Offspring selection that creates a new genome lineage.
- Field expression panel.
- "Recurse to Palette" flow that sends phenotype output back into the synthesis directive.
- Copy artifact flow.
- Import/export of lineage snapshots.
- Image attachment support for synthesis and task context.
- Local storage persistence under `cge_v8_3_latest` and `context_target_task`.
- Session id and audit log in memory.

Important implementation detail:

- Like `g1.html`, it calls Gemini directly from browser JavaScript.
- `const apiKey = "";` is empty.
- It is the stronger UI prototype, but it is not secure or repo-compliant until the API calls move server-side.

### pbre.html

`pbre.html` is the Prompt Breeder prototype labeled `PRIME PROMPT — THE OPERATIONAL PRAGMATIST`.

It contains:

- A stark black/white operational interface.
- A specimen ingestion layer.
- Image attachment support.
- A lineage router:
  - Specimen
  - Genoma Scope
  - Recombination Lab
  - Phenotype / Mutate
  - Artifact / Recurse
- Embedded Operational Pragmatist POML.
- Prime forge / Naurian / strict breeder / stepping-stone prompt constants.
- GENOMA scope-style codon rendering.
- Recombination and phenotype expression flows.
- Code and image phenotype expression paths.
- Research log / lineage audit behavior.

Important implementation detail:

- It calls Gemini and Imagen endpoints directly from browser JavaScript.
- `const apiKey = "";` is empty.
- It demonstrates the intended operation flow but still needs server-side API routing.

### phub.html

`phub.html` is the Prompt Husbandry prototype labeled `PRIME PROMPT — CONTEXT GENETICS ENGINE`.

It contains:

- A stark black/white prompt husbandry interface.
- An environmental medium/specimen input.
- Image attachment support.
- A hereditary router:
  - Environment
  - Genotype Loci
  - Punnett Meiosis
  - Artificial Selection
  - Phenotype Sweep
- Context Genetics POML.
- Genotype transcription prompt.
- Strict meiosis prompt.
- Context mutation prompt.
- Naurian program-theory prompt.
- Locus grouping and codon rendering.
- Punnett meiosis / cross behavior.
- Phenotype field testing.
- Code and vision phenotype manifestation.
- Selective sweep / recursion behavior.

Important implementation detail:

- It calls Gemini and Imagen endpoints directly from browser JavaScript.
- `const apiKey = "";` is empty.
- It is a strong "prompt husbandry" sibling to the main Context Genetics Engine prototypes, but it is not securely API-connected yet.

### f4.html

`f4.html` is the F4 Genomic Operational Pragmatics prototype.

It contains:

- A stark black/white operational interface.
- A deep vocabulary state model:
  - entities
  - morphisms
  - constraints
  - environments
  - fitness
  - traces
- A router:
  - Extract source
  - Encode genome strand
  - Express into population
  - Evaluate / mutate
  - Express artifact / trace
- A strand editor with codon rows.
- Population matrix rendering.
- Audit trace modal.
- Trace download and copy controls.
- Mutation modes for divergence and repair.
- Code and image artifact expression paths.

Important implementation detail:

- It calls Gemini and Imagen endpoints directly from browser JavaScript.
- `const apiKey = "";` is empty.
- It encodes the most explicit Naurian / operational-pragmatics vocabulary in the suite.

### scope.html

`scope.html` is the GENOMA Scope component prototype.

It contains:

- A genome-field visualization.
- Codon-band columns.
- Focus, gaze, and inspection states.
- Import behavior.
- Session storage integration for selected genome data.
- A visual vocabulary for inspecting genome structures outside the main editors.

This is best treated as a reusable visualization codon for the larger suite.

### suite-harness-g1.html

`suite-harness-g1.html` wraps `g1.html` in a side-rail harness.

It contains:

- A left codon rail linking to `g1`, `g2`, `pbre`, `phub`, `f4`, and `scope`.
- A full-height iframe viewport.
- Links back to `index.html` and the raw `g1.html`.
- No changes to `g1.html` itself.

### suite-harness-g2.html

`suite-harness-g2.html` wraps `g2.html` in a side-rail harness.

It contains:

- A left codon rail linking to `g2`, `g1`, `pbre`, `phub`, `f4`, and `scope`.
- A full-height iframe viewport.
- Links back to `index.html` and the raw `g2.html`.
- No changes to `g2.html` itself.

## g1 vs g2

| Area | g1.html | g2.html |
| --- | --- | --- |
| Version identity | POML v5.1 | CGE v8.9 |
| Visual mode | Dark high-contrast HUD | Paper/ink dockable workbench |
| Main layout | 3 columns | 4 columns |
| Columns | Palette, Genotype, Field | Palette, Genotype, Matrix, Field |
| Navigation | Horizontal scroll + genome pills | Minimap + dockable columns |
| Logging | Expandable trace console | Single pinned trace line |
| Genome state | Single genome with undo history | Lineage bank with active genome |
| Matrix | Modal-style candidate selection | Explicit 2x2 Punnett panel |
| Codon UI | Editable codon cards with local tools | Collapsible chromatic gene cards |
| Image support | Synthesis, task, and codon-level images | Synthesis and task images |
| Persistence | LocalStorage genome snapshot | LocalStorage lineage bank |
| Strongest use | Rich codon-level editing and trace | Stronger end-to-end workbench structure |

Recommended base:

- Use `g2.html` as the primary product direction.
- Pull selected `g1.html` features into it, especially:
  - undo history
  - codon-level mutation controls
  - codon-level image association
  - richer export review

## Actual Current State

The current project contains:

- A working hackathon starter repo with Next.js, CopilotKit, BFF, LangGraph, Gemini runtime configuration, MCP app support, and Notion lead-demo code.
- A standalone HTML suite:
  - `index.html`
  - `g1.html`
  - `g2.html`
  - `pbre.html`
  - `phub.html`
  - `f4.html`
  - `scope.html`
  - `suite-harness-g1.html`
  - `suite-harness-g2.html`

The current project does not yet contain:

- A repo-native `/genoma` Next.js route.
- Typed `GenomaState`.
- CopilotKit frontend tools for genome/codon state.
- LangGraph backend tools for synthesis, mutation, matrix breeding, or phenotype expression.
- Secure server-side Gemini execution for the Context Genetics Engine.

## Required Integration Path

To make Context Genetics Engine work for anyone:

1. Add a repo-native route, likely `apps/frontend/src/app/genoma/page.tsx`.
2. Convert `g2.html` layout into React components.
3. Add typed state:
   - `Codon`
   - `Genome`
   - `Lineage`
   - `MatrixCandidate`
   - `PhenotypeArtifact`
   - `GenomaState`
4. Move Gemini calls out of browser JavaScript.
5. Add Python/LangGraph backend tools:
   - `synthesize_genome`
   - `mutate_genome`
   - `mutate_codon`
   - `breed_matrix`
   - `express_phenotype`
6. Register CopilotKit frontend tools:
   - `setGenomeBank`
   - `setActiveGenome`
   - `addCodon`
   - `updateCodon`
   - `setMatrix`
   - `setPhenotype`
   - `setGenomaStatus`
7. Teach the agent the Context Genetics Engine contract in `apps/agent/src/prompts.py`.
8. Keep import/export compatible with the existing standalone JSON snapshots.
9. Add README/demo instructions.
10. Record a short demo showing the actual prototype and clearly stating what is implemented versus what is being integrated.

## Critical Claims To Keep Honest

Safe to claim:

- The project introduces a genetics-based prompt engineering interface.
- `g1.html`, `g2.html`, `pbre.html`, `phub.html`, `f4.html`, and `scope.html` implement functional standalone UI prototypes/components.
- `index.html` now acts as the suite entry point and links each page clearly.
- `suite-harness-g1.html` and `suite-harness-g2.html` wrap the main engines with side-rail navigation.
- The prototypes include codon editing, exon/intron toggles, prompt compilation, lineage/matrix concepts, import/export, local persistence, and Gemini request wiring.
- The repo provides the correct hackathon architecture for turning the prototype into an agentic CopilotKit/LangGraph application.

Do not claim yet unless implemented:

- That the Context Genetics Engine is already fully connected to CopilotKit frontend tools.
- That the Context Genetics Engine is already powered through the repo BFF.
- That the Context Genetics Engine already has LangGraph backend tools.
- That MCP/Manufact currently powers the Context Genetics Engine UI.
- That A2UI is currently rendering the Context Genetics Engine.

## Short Project Summary

Context Genetics Engine is a generative UI prototype for evolving prompts as structured genomes. It gives users a Palette for synthesis directives, a Genotype panel for codon editing, a Matrix for breeding alternate prompt candidates, and a Field for expressing the compiled prompt against task context. The current `g1.html` and `g2.html` files prove the interaction model; the next engineering step is to move Gemini calls server-side and integrate the workbench into the CopilotKit/LangGraph starter architecture.
