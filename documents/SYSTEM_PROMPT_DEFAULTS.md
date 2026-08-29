# Platform system prompt defaults

Shipped defaults for **Socratic** and **Explanatory** conversation modes. Courses with `usePlatformDefault: true` load these at runtime; customized courses store inline `body` strings in MongoDB instead.

`scenario-generation` was retired as a chat conversation mode (see `planner/improved-scenario-generation-deliverables.md`) and replaced by the standalone Practice Scenarios / Scenario Questions feature. `scenario-generation-default/` is kept on disk and repurposed for that feature's authoring prompts — it is no longer loaded by `system-prompt-defaults-loader.ts`.

## Layout

Under `src/chat/system-prompts/`:

| Directory | Contents |
|-----------|----------|
| [`shared-default/`](../src/chat/system-prompts/shared-default/) | Shared `.md` modules (guidance, course intro, course-material referencing, markdown/mermaid) |
| [`socratic-default/`](../src/chat/system-prompts/socratic-default/) | `socratic.json` + Socratic-only `.md` files (flat — no subfolders) |
| [`explanatory-default/`](../src/chat/system-prompts/explanatory-default/) | `explanatory.json` + Explanatory-only `.md` files (flat — no subfolders) |
| [`scenario-generation-default/`](../src/chat/system-prompts/scenario-generation-default/) | Repurposed for the Practice Scenarios feature's AI generation authoring prompt — not a chat mode; not loaded by `system-prompt-defaults-loader.ts` |

Each `*-default` directory contains **only** its manifest JSON and mode-specific Markdown files. Manifests use **`instructorModules` only** (v1.3.0+); `systemModules` is empty and there is no runtime suffix module.

## Socratic module set (v1.7.1+)

| Module id | Role |
|-----------|------|
| system prompt guidance | How to read the stacked prompt; **owns private vs public visibility** |
| course main intro | Course + learning objectives |
| course material referencing | **Owns citation mechanics**: cite chapter/section only if metadata exists, else fluent tutor talk |
| struggle topics | Bridge list semantics; exact vs adjacent via the **skill test**, unclear cases resolve to socratic |
| socratic context management | Numbered step outline + handoffs (holds no rules of its own) |
| socratic conversation | Default path: concise adaptive scaffold that preserves student reasoning |
| interpretive conversation | Exact struggle match → focused higher-support scaffold, not an automatic full walkthrough |
| practice questions | **Owns formal mastery checks** — offer, present, pass/fail |
| socratic analyser | Emit/omit `<questionUnstruggle Topic="…">` (AI-driven; no runtime reveal) |
| markdown synthax / mermaid synthax | Formatting |

### Adaptive Socratic scaffold (v1.7.1+)

Socratic tutoring is defined by **student ownership of the target reasoning**, not answer withholding or typography. The tutor may use LaTeX, lists, tables, diagrams, partial representations, and concise explanation when each makes the student's next meaningful contribution possible.

The compact support continuum is: `prompt → hint → partial representation → one modelled step → brief explanation → transfer`. Repeated “I don't know,” the same misconception, or no usable attempt means increase help rather than repeatedly rephrase a question. After accurate explanation, completion, or application, fade support and return the next step to the student.

The adaptive guidance is repeated in `struggle-topics-bridge.ts`, which lands last in the user turn. This is the one deliberate duplication in the stack: the system message is built once per chat, so the bridge is the only per-turn channel. Formatting-based `findSocraticShapeViolations` telemetry was removed because it could not distinguish a useful partial scaffold from a full solution.

Formal mastery is separate from support: an explanation, hint, or modelled step is not evidence of understanding and cannot emit `<questionUnstruggle>`. The student must accept and answer the Apply-level practice check correctly before the analyser can emit it.

### Conditional assembly (v1.7.0+)

With `memoryAgent` disabled, the injected struggle list is always empty, so `interpretive conversation`, `practice questions`, and `socratic analyser` are unreachable. `assembleCourseSystemPrompt({ memoryAgentEnabled: false })` prunes them (~9KB per turn) for platform-default Socratic courses. Courses with `usePlatformDefault: false` are never pruned — their module ids come from Mongo and may not mean the same thing.

### Private vs public context (v1.6.4+)

**Private** (routing/grounding only — never narrate to the student): `<struggle_topics>`, `<course_materials>`, exact/adjacent/off-list classification, whether documents were attached/retrieved/missing.

**Public:** pedagogy only. Academic citations (“In Chapter 12.1…”) only when materials include that metadata; otherwise fluent tutor talk with no materials-as-speaker phrasing. Machine exception: trailing `<questionUnstruggle Topic="…">` when analyser rules fire (do not explain the tag).

Runtime (`chat-app.ts`) injects `<struggle_topics>…</struggle_topics>` via a routing-only user bridge. The model decides conversation path and unstruggle tags from these modules.

## bodyFile paths

Registered in `{mode}.json`:

| Pattern | Example | Resolved from |
|---------|---------|----------------|
| `shared-default/<file>.md` | `shared-default/system_prompt_guidance.md` | `system-prompts/shared-default/` |
| `<file>.md` | `socratic_context_management.md` | That mode’s `*-default/` directory |

Paths are portable (no machine-specific roots). `build:backend` copies all four directories into `dist/chat/system-prompts/`.

## Module template

Copy from [`_template.module.md`](../src/chat/system-prompts/_template.module.md) when adding a module.

## MD format

Each `.md` file is the **exact** LLM-facing string. Prefer these sections:

- `# Identity` — what the module is and when it applies
- `# Instruction` — rules owned by this module
- `# Examples` — good / bad (or emit vs omit) few-shots
- `# Checklists` — pre-send checks using markdown task lists (`- [ ]`)

Do **not** use `*Module Purpose*` / `*Module Content*` wrappers.

No YAML frontmatter; the loader reads the file as-is (`trim()` only).

## Adding or changing a module

1. **Shared:** add or edit `.md` in `shared-default/`; reference as `shared-default/your_module.md` in mode JSON files as needed.
2. **Mode-only:** add `.md` next to `{mode}.json` in the mode’s `*-default/` folder; reference as `your_module.md`.
3. Register `bodyFile` in the mode manifest `instructorModules` array.
4. Avoid reserved module ids (`system-prompt-xml.ts` / `isReservedModuleId` — `_system_*`, `_runtime_*`).
5. Bump `version` in the affected JSON when shipping a defaults change.
6. Run **`npm run prompts:validate`** before merge.

## CLI tooling

Single entry point: [`scripts/prompt-tools.ts`](../scripts/prompt-tools.ts) — uses production loader and assembler (no duplicated manifest logic).

| Command | Purpose |
|---------|---------|
| `npm run prompts:validate` | Load all mode manifests, resolve every `bodyFile`, assemble XML, enforce invariants |
| `npm run prompts:size` | Per-module bytes, tokens, and share; models the learning-objective block |
| `npm run prompts:export-samples` | Write assembled XML to `EngE-AI-RAG-Document-examples/sample_md/` |

### Validate invariants

`prompts:validate` fails on three conditions, each guarding a way the stack rots quietly:

- **Dangling cross-reference** — modules point at each other in bold (`**mermaid synthax**`). A bold span within two edits of a known module id, but not an exact match, is treated as a rename or typo.
- **Duplicated rule** — the same bullet in two modules costs tokens twice and gives the model two places to disagree. Single ownership is the convention `system prompt guidance` declares.
- **Size budget** — assembled XML per mode, currently 33,000 bytes for Socratic and 19,000 for Explanatory. Raising a budget should be a deliberate act with a reason.

### Prompt size (measured 2026-08-11)

Socratic assembles to **26,788 bytes (~6.7k tokens)**, re-sent as the system message every turn. The concise adaptive rewrite reduced the prior 30,791-byte prompt by **4,003 bytes (13%)**. `socratic conversation` is 10.2% of module text; the struggle-dependent modules are 33.1%. The default policy no longer carries a long format contract or repeated full dialogue exemplar.

**Learning objectives cost ~121 bytes each**, injected uncapped by `formatRuntimeLearningObjectives`: 50 objectives add ~6KB, 150 add ~18KB. Scoping them to the current topic or week was measured and **deliberately not implemented** — at present the block stays below the module text, and scoping needs an answer for students who ask about earlier topics. Revisit when a real course pushes the block past roughly 10KB; `npm run prompts:size` with `ENGEAI_PROMPT_SIZE_LO_COUNT` set to that course's objective count is the check.

### Known gap: struggle-list growth

The memory agent runs on nearly every Socratic turn over the last three messages, which are usually dominated by the assistant's own reply, and labels are only removed through the unstruggle widget. The list therefore grows, and the default Socratic path — which requires a non-matching list — is reached less often over a chat's life. A structured relevance router with sticky per-chat routing, and memory-agent cadence and student-only excerpt changes, were scoped and deferred; the adaptive prompt policy does not slow that drift.

Override export directory: `ENGEAI_SYSTEM_PROMPT_SAMPLE_DIR=/path/to/dir npm run prompts:export-samples`

Legacy alias `npm run export:system-prompt-samples` forwards to `prompts:export-samples`.

## Variables

- **`{{course_learning_objectives}}`** in `course main intro` is replaced at assembly time with the tagged LO list from Mongo (`assemble-course-system-prompt.ts`). Instructors edit the surrounding prose; the list itself is runtime data. Platform default `course main intro` includes LO-scope rules and few-shot off-scope redirects (courses with `usePlatformDefault: false` keep their Mongo body until Reset).

## Reload

Admin `POST /api/courses/admin/system-prompt-defaults/reload` or process restart re-reads JSON and `.md` from disk (`reloadPlatformDefaultsCache`).

## Build

`build:backend` copies `shared-default/`, `socratic-default/`, `explanatory-default/`, and `scenario-generation-default/` into `dist/chat/system-prompts/`.

## Initial assistant message (welcome)

The opening assistant message for a new chat is **not** part of the system prompt. It comes from the course’s selected initial assistant prompt (or the platform default in `src/chat/initial-assistant-prompt-default.ts`).

At chat init, `ChatApp.addDefaultAssistantMessage` always appends the Office of the University Counsel short disclaimer via `appendLegalAiDisclaimer` in `src/chat/legal-ai-disclaimer.ts`. Instructors cannot remove it by editing custom welcome prompts. The short text links to the static long-form page at `/pages/ai-disclaimer.html` (terms + FIPPA notice).
