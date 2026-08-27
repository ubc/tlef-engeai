# EngE-AI repository instructions

EngE-AI is an Express/TypeScript/MongoDB application with a vanilla TypeScript frontend. Work from repository evidence and keep changes inside the requested feature.

## Core rules

- Never edit generated `dist/` or `public/dist/` files.
- Keep HTTP handlers thin. Put persistence in `src/db/mongo/` delegates exposed through `EngEAI_MongoDB`.
- Apply course-scoped RBAC to every course API. Never expose or persist student PUIDs outside `active-users`.
- Mirror shared API types in both `src/types/shared.ts` and `public/scripts/types.ts`.
- Use lowercase kebab-case filenames, camelCase values/functions, and PascalCase types/classes.
- Add behavior-first TSDoc to exported APIs and step comments to non-trivial pipelines.
- Update `documents/ENDPOINT_ARCHITECTURE.md` and `documents/MONGO_DATA_LAYER.md` when contracts change.
- Run risk-proportional tests and both TypeScript builds for merge-worthy behavior changes.
- Do not commit or push unless explicitly requested. Preserve unrelated worktree changes.

An approved implementation request authorizes its in-scope edits. Check back only for scope expansion, destructive actions, external writes, or a material product decision not covered by the request.

## Rule routing

Read the relevant detailed rule before editing its area:

- Backend/API/Mongo/RBAC: `.cursor/rules/backend/`
- Frontend/CSS/accessibility: `.cursor/rules/frontend/`
- Prompt and structured LLM behavior: `.cursor/rules/prompt-engineer/`
- Writing Feedback: `.cursor/rules/writing-feedback/`
- Tests and documentation: `.cursor/rules/tester/` and `.cursor/rules/main-rules/05-code-docs.mdc`

## Shared project memory

At the start of a substantive session, read these files from the workspace parent:

1. `../project-memory/01 Project Memory/00 Start Here.md`
2. `../project-memory/01 Project Memory/Current State.md`
3. `../project-memory/01 Project Memory/Decisions.md`
4. `../project-memory/01 Project Memory/Open Questions.md`

Repository evidence and current official course material override historical summaries. When work materially changes implementation status or architecture, update the relevant memory note and add a dated handoff under `../project-memory/02 Session Log`. Never store secrets, tokens, PUIDs, identifiable student work, grades, or generated feedback in project memory.

## Writing Feedback invariants

- Writing Feedback is opt-in per course. Disabled courses must not expose UI or operational APIs.
- Instructors/admins enable or disable the capability for a course. Once enabled, instructors, admins, and TAs all have full workspace parity — assignments, rubrics, review, approval, and release (D-049).
- Model results are drafts. A human must approve before any release.
- Rubric judgments require exact evidence from verified submission text; never invent weights.
- OCR text must be staff-verified before feedback generation.
- Student submissions must never enter the course-material RAG/Qdrant pipeline.
- Never log submission text, prompts containing it, OAuth tokens, or generated feedback content.
- Student-facing output must exclude confidence, internal flags, prompt/model metadata, and staff-only notes.
