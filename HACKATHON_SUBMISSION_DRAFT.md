# Context Genetics Engine Hackathon Submission Draft

This draft is intentionally grounded in the current repo artifacts:

- `index.html`
- `g1.html`
- `g2.html`
- `pbre.html`
- `phub.html`
- `f4.html`
- `scope.html`
- `suite-harness-g1.html`
- `suite-harness-g2.html`
- the Generative UI Global Hackathon starter kit architecture

It avoids claiming that the standalone prototypes are already fully connected to CopilotKit, LangGraph, MCP, or A2UI.

## Project Name

Context Genetics Engine

## Team Name

Wolf to Dog

## Project Description

Context Genetics Engine is a generative UI suite for building, mutating, breeding, and testing prompts as structured genomes. Instead of treating a prompt as a single block of text, the interface breaks prompt behavior into structured units: reasoning order, evidence policy, output form, failure handling, fitness pressure, custom constraints, entities, morphisms, environments, and traces. The user shapes the prompt structure, the task context becomes the field, and the model response becomes the output artifact.

The project now has a standalone `index.html` suite hub that links directly to the runnable artifacts. The main page is high contrast, link-first, minimal, and mobile-friendly. `g1.html` is the earlier dark V5.1 prototype, with a Palette, Genotype, and Field workflow. It includes manual instruction injection, active/silent toggling, reordering, undo history, trace logging, vision attachment rails, localized mutation, import/export, and an output panel. `g2.html` is the later CGE v8.9 prototype, with a stronger four-column workbench: Palette, Genotype, Matrix, and Field. It adds dockable columns, a minimap, pinned trace status, lineage banking, clone/new/purge lineage controls, an explicit 2x2 matrix, and a recurse-to-palette loop that sends output back into prompt evolution.

The suite also includes sibling operation engines. `pbre.html` is a Prompt Breeder surface that ingests a specimen, extracts GENOMA structure, recombines codons, assays phenotype, mutates, expresses, and recurses. `phub.html` is a Prompt Husbandry surface that transcribes genotype from environmental medium, performs Punnett meiosis, tests phenotype in field, mutates, manifests, and sweeps the lineage. `f4.html` is the F4 Genomic Operational Pragmatics surface, encoding source material into entities, morphisms, constraints, environments, fitness, and traces before expressing artifacts and recording lineage. `scope.html` is the GENOMA Scope visualization component for inspecting genomes as codon-band fields. `suite-harness-g1.html` and `suite-harness-g2.html` wrap the two main Context Genetics Engine prototypes with side-rail navigation across the full suite.

The interface moves beyond text-only chat because the model-facing work is represented as manipulable UI state. Agent or model output is meant to become editable cards, candidate structures, matrix variants, and artifacts rather than just prose in a chat transcript. A user can inspect generated prompt structure, silence individual instructions, mutate or diverge a lineage, compare alternatives, and then run the active structure against a real task.

The current prototype files call the Gemini and Imagen REST endpoints from browser JavaScript, but the API key is intentionally empty and the calls still need to be moved server-side for a secure public demo. The repo itself is based on the Generative UI Global Hackathon starter kit, which provides the intended production path: Next.js and React for the frontend, CopilotKit for agentic UI and shared state, a BFF for runtime routing, LangGraph/LangChain Deep Agents for orchestration, Gemini for generation, and MCP/Manufact patterns for future deployable tool surfaces.

The originality of the project is the interaction model: prompt engineering becomes selective breeding and operational pragmatics becomes a tactile UI. The technical work during the hackathon focused on developing the Context Genetics Engine UI theory and implementing the standalone suite that demonstrates the core operations: synthesize, mutate, diverge, breed, compile, express, evaluate, trace, recurse, import, and export. The next integration step is to convert the strongest pieces into a repo-native `/genoma` route and route Gemini operations through the LangGraph backend instead of the browser.

## Products & Tools Used

Select these if the form allows multiple choice:

- AI Tinkerers
- Google DeepMind
- CopilotKit
- LangChain
- Manufact
- Daytona

Other products/tools:

```text
Google Gemini API, Gemini REST generateContent endpoint, Imagen REST endpoint, Next.js, React, JavaScript, HTML/CSS, LangGraph Deep Agents starter architecture, MCP, AG-UI concepts, Docker, localStorage, sessionStorage
```

Use the sponsor/tool wording carefully:

- Google Gemini is directly referenced by the prototype code.
- CopilotKit, LangChain, Manufact, MCP, and Daytona are part of the starter kit architecture and planned integration path.
- Do not imply the standalone `g1.html` / `g2.html` files already run through CopilotKit unless that integration is completed before submission.

## Team Contributions

### Watson Hartsoe

Watson Hartsoe led the project concept, design theory, and prototype implementation for Context Genetics Engine. Watson created the central mapping of prompt engineering to an interactive structure workbench.

Watson built the standalone `g1.html` and `g2.html` interface prototypes. The `g1` prototype established the dark Palette/Genotype/Field workflow with instruction editing, active/silent toggles, trace logging, undo state, local persistence, vision attachment support, local mutation, output expression, and JSON import/export. The `g2` prototype expanded the concept into a four-column dockable workbench with Palette, Genotype, Matrix, and Field panels, a lineage bank, minimap navigation, column status indicators, explicit matrix variation, candidate selection, artifact recursion, and copy/export flows.

Watson also built and organized the broader HTML suite: `pbre.html` for Prompt Breeder operations, `phub.html` for Prompt Husbandry, `f4.html` for F4 operations, `scope.html` for GENOMA Scope visualization, `video.html` for the demo video, and `index.html` as the core hub that links the suite. Watson added side-rail harnesses for `g1` and `g2` so the main engines can be viewed with the rest of the artifact suite attached.

Watson also analyzed how the prototype should be integrated into the Generative UI Global Hackathon starter kit: converting `g2.html` into a Next.js route, moving Gemini calls server-side, defining typed Genoma state, adding CopilotKit frontend tools, and routing synthesis/mutation/expression through LangGraph backend tools.

## Prior Work

This project builds on the official Generative UI Global Hackathon starter kit, which provides the base Next.js, CopilotKit, BFF, LangGraph, Gemini, MCP, and deployment architecture.

The Context Genetics Engine concept, the structure-based prompt-engineering workflow, the Palette/Genotype/Matrix/Field interface, and the standalone HTML suite were created as the project work. The current prototype files are standalone HTML/CSS/JavaScript artifacts and still need full starter-kit integration for a secure public deployment.

## Additional Links

Use actual links only. Do not submit placeholders.

- GitHub repository:
- Live demo:
- Video:
- Writeup:

## Social Media Post Draft

```text
Submitting Context Genetics Engine for #genUIHackathon.

It is a generative UI suite for shaping prompts as editable structures: instructions, constraints, task context, variants, and output artifacts.

Built as a standalone HTML suite: index, g1, g2, Prompt Breeder, Prompt Husbandry, F4 Pragmatics, and GENOMA Scope.

Next step: moving the strongest g2 prototype into the CopilotKit/LangGraph starter architecture with server-side Gemini calls.

@aitinkerers @googledevs @CopilotKit
```

## 2-Minute Video Plan

### Goal

The video should show the real artifact honestly:

- `index.html`, `g1.html`, `g2.html`, `pbre.html`, `phub.html`, `f4.html`, and `scope.html` exist.
- `index.html` is the suite entry point.
- `g2.html` is the stronger submission-facing prototype.
- The current blocker is secure API integration, because the prototypes have `apiKey = ""`.
- The project direction is clear: integrate the workbench into the starter kit architecture.

### Structure

#### 0:00-0:10 — Title

Screen: `index.html` open in browser.

Voiceover:

```text
This is Context Genetics Engine, a generative UI suite for evolving prompts as structured genomes.
```

#### 0:10-0:30 — Core Theory

Screen: `index.html` card grid and fast links.

- Prompt = Genotype
- Completion = Phenotype
- Context = Field
- User = Breeder

Voiceover:

```text
The core idea is simple: a prompt is not one blob of text. It is an editable structure with instructions, constraints, context, variants, and outputs. The index makes each page directly openable.
```

#### 0:30-0:55 — Palette and Genotype

Screen: open `g2.html` from the index, then show Palette directive, manual injection chips, Genotype panel.

Voiceover:

```text
The Palette is where a user describes the target behavior or manually adds reasoning, evidence, output form, failure handling, and fitness pressure. The Genotype panel turns those units into editable cards. The user can expand, edit, reorder, silence, clone, or purge prompt lineages.
```

#### 0:55-1:15 — Matrix

Screen: Matrix panel and matrix lock / Punnett grid if available.

Voiceover:

```text
The Matrix panel explores variation. It crosses the active genome with a divergent parent and renders four offspring candidates in a 2x2 Punnett-style grid. Selecting an offspring creates a new prompt lineage.
```

#### 1:15-1:35 — Field

Screen: Field panel, target context textarea, phenotype output.

Voiceover:

```text
The Field is the execution environment. It compiles active instructions into a system prompt, combines that with task context, and renders the output artifact. There is also a recurse flow that sends output back into the Palette for another mutation cycle.
```

#### 1:35-1:50 — g1 Mention

Screen: Briefly switch through `g1.html`, `pbre.html`, `phub.html`, and `f4.html` from the index card grid.

Voiceover:

```text
The suite includes sibling engines. g1 is a darker trace-heavy version with undo and local controls. Prompt Breeder and Prompt Husbandry explore ingestion, recombination, matrix testing, and recursive mutation. F4 handles entities, morphisms, constraints, environments, fitness, and traces.
```

#### 1:50-2:00 — Honest Technical Close

Screen: Repo file tree or starter kit README.

Voiceover:

```text
The current prototypes are standalone HTML and JavaScript. The next engineering step is to move Gemini calls server-side and integrate this as a Next.js CopilotKit and LangGraph-powered generative UI inside the hackathon starter kit.
```

## Demo Checklist Before Recording

1. Open `index.html` locally.
2. Show the artifact cards and direct links.
3. Open `g2.html` from the index.
4. Show Palette.
5. Show Genotype with at least the founder lineage.
6. Show Matrix panel.
7. Show Field panel.
8. Briefly show `g1.html`, `pbre.html`, `phub.html`, `f4.html`, and `scope.html` from the index.
9. Show one harness page if time allows.
10. Do not claim the Gemini API is working unless a real key is wired and tested.
11. Do not show private API keys on screen.

## Honest Submission Note

If the final demo still only uses `g1.html` and `g2.html`, describe it as:

```text
a standalone generative UI prototype built inside the hackathon starter repo
```

If `/genoma` is implemented before submission, describe it as:

```text
a repo-native CopilotKit/LangGraph generative UI workbench
```

Those are different claims. Use the one that is true at submission time.
