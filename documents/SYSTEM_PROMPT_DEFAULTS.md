# Platform system prompt defaults

Shipped defaults for **Socratic**, **Explanatory**, and **Scenario Generation** conversation modes. Courses with `usePlatformDefault: true` load these at runtime; customized courses store inline `body` strings in MongoDB instead.

## Layout

Under `src/chat/system-prompts/`:

| Directory | Contents |
|-----------|----------|
| [`shared-default/`](../src/chat/system-prompts/shared-default/) | Shared `.md` modules (guidance, formatting, correctness, course main intro) |
| [`socratic-default/`](../src/chat/system-prompts/socratic-default/) | `socratic.json` + Socratic-only `.md` files (flat — no subfolders) |
| [`explanatory-default/`](../src/chat/system-prompts/explanatory-default/) | `explanatory.json` + Explanatory-only `.md` files (flat — no subfolders) |
| [`scenario-generation-default/`](../src/chat/system-prompts/scenario-generation-default/) | `scenario-generation.json` + scenario-only `.md` files (flat — no subfolders) |

Each `*-default` directory contains **only** its manifest JSON and mode-specific Markdown files. Manifests use **`instructorModules` only** (v1.3.0+); `systemModules` is empty and there is no runtime suffix module.

## bodyFile paths

Registered in `{mode}.json`:

| Pattern | Example | Resolved from |
|---------|---------|----------------|
| `shared-default/<file>.md` | `shared-default/system_prompt_guidance.md` | `system-prompts/shared-default/` |
| `<file>.md` | `teaching_methodology.md` | That mode’s `*-default/` directory |

Paths are portable (no machine-specific roots). `build:backend` copies all four directories into `dist/chat/system-prompts/`.

## Module template

Copy from [`_template.module.md`](../src/chat/system-prompts/_template.module.md) when adding a module.

## MD format

Each `.md` file is the **exact** LLM-facing string:

- `*Module Purpose*` — one-line summary
- `*Module Content*` — instructions, examples, checklists

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
| `npm run prompts:validate` | Load all mode manifests, resolve every `bodyFile`, assemble XML |
| `npm run prompts:export-samples` | Write assembled XML to `EngE-AI-RAG-Document-examples/sample_md/` |

Override export directory: `ENGEAI_SYSTEM_PROMPT_SAMPLE_DIR=/path/to/dir npm run prompts:export-samples`

Legacy alias `npm run export:system-prompt-samples` forwards to `prompts:export-samples`.

## Variables

- **`{{course_learning_objectives}}`** in `course main intro` is replaced at assembly time with the tagged LO list from Mongo (`assemble-course-system-prompt.ts`). Instructors edit the surrounding prose; the list itself is runtime data.

## Reload

Admin `POST /api/courses/admin/system-prompt-defaults/reload` or process restart re-reads JSON and `.md` from disk (`reloadPlatformDefaultsCache`).

## Build

`build:backend` copies `shared-default/`, `socratic-default/`, `explanatory-default/`, and `scenario-generation-default/` into `dist/chat/system-prompts/`.
