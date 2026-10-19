# Writing Feedback — File Map

One row per file: what it is responsible for, how big it is, which suite covers it, and
when a reviewer needs to open it. Companions: `WRITING_FEEDBACK_REVIEW_GUIDE.md`,
`WRITING_FEEDBACK_CANVAS_RELEASE_CONTRACT.md`.

Line counts are a rough guide to reading cost, not a target. Since 2026-10-19 no file in `src/writing-feedback/` exceeds about 1000 lines.

## `src/writing-feedback/`

Each area is a folder with its own `__tests__/`. Frontend source-guard suites, shared test helpers, and eval fixtures stay in `src/writing-feedback/__tests__/`.

### Contracts and types — `contracts/`

Shared records and service ports, split by area and re-exported from `contracts/index.ts`.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `index.ts` | 21 | Owns the staff-only Writing Feedback domain and port contracts. | — | any type crosses a boundary (import from `contracts/`, never from a part) |
| `assignment.ts` | 434 | Assignment, submission, genre profile, diagnosis, rubric, and batch records. | — | an assignment, submission, profile, or rubric record changes |
| `canvas.ts` | 150 | Imported Canvas rubric shapes, id maps, source material, and assignment details. | — | an imported Canvas rubric shape or source material record changes |
| `feedback.ts` | 318 | Feedback results, SFL findings, course-material mentions, glossary, runs, and anchored comments. | — | a feedback result, SFL finding, run, or annotation record changes |
| `review-release.ts` | 295 | Review revisions, staff assessment, release records, jobs, and adapter interfaces. | — | a review, assessment, release, job record, or service port changes |

### Orchestration — `service/`

The lifecycle service and the pure rules it shares with the release workflow.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `service-helpers.ts` | 366 | Pure helpers split out of writing-feedback-service.ts. | — | safe failure logging, the student view, or draft staleness checks change |
| `writing-feedback-service.ts` | 818 | Coordinates the staff-reviewed Writing Feedback lifecycle. | `writing-feedback-service.test.ts` | generation, transcript edits, review revisions, approval, or PDF rendering changes |

Also in `service/__tests__/`: `diagnosis-safe-log.test.ts`, `held-back-review.test.ts`, `overall-message.test.ts`.

### Generation — `generation/`

Model calls: diagnosis, the linguistic and technical engines, summary redraft, the rewrite gate, batch generation.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `batch-generation.ts` | 247 | Previews, starts, and stops batch feedback generation for one assignment. | `batch-generation.test.ts` | which submissions a batch includes, or stopping, changes |
| `feedback-engine.ts` | 638 | Generates staff-review drafts from assignment rubrics and verified text. | `feedback-engine.test.ts` | prompt or draft shape changes |
| `feedback-gate.ts` | 93 | Pure gate decision, whole-text flag, hold-back resolution, and student-facing comment filter. | `feedback-gate.test.ts` | — |
| `feedback-schema.ts` | 435 | Enforces rubric-driven output, exact evidence, and safe numeric mapping. | `feedback-schema.test.ts` | model output validation changes |
| `summary-redraft-engine.ts` | 197 | Structured summary redraft for the two-step review. | `summary-redraft-engine.test.ts` | the redraft prompt or output changes |
| `technical-feedback-engine.ts` | 260 | Generates staff-review technical drafts for lab reports. | `technical-feedback-engine.test.ts` | lab-report technical drafts change |
| `text-diagnosis.ts` | 160 | Diagnosis schema, prompt, and deterministic validation. | `text-diagnosis.test.ts` | — |

Also in `generation/__tests__/`: `feedback-engine-pipeline.test.ts`, `prompt-contract.test.ts`, `structured-output-schema.test.ts`, `writer-guards.test.ts`.

### Language and SFL — `language/`

SFL analysis and foundation, plain-language and Socratic-question rules, prompt examples.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `plain-language.ts` | 238 | Shared student-reader prompt contract and deterministic plain-language lint. | `plain-language.test.ts` | — |
| `prompt-examples.ts` | 45 | Versioned few-shot examples for the analyzer and writer prompts. | — | — |
| `sfl-analysis.ts` | 280 | Owns Writing Feedback V2 analyzer schemas and deterministic validation. | `sfl-analysis.test.ts` | analyzer schema or validation changes |
| `sfl-foundation.ts` | 156 | Owns the Writing Feedback V2 SFL rule/source allowlists. | — | the rule/source allowlist changes |
| `socratic-questions.ts` | 86 | Pure question validation plus a one-retry generation gate. | `socratic-questions.test.ts` | — |

### Course-material grounding — `materials/`

Which published course material feedback may cite, and how relevance is checked.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `course-material-catalog.ts` | 55 | Resolves staff-pickable course-material titles for Writing Feedback. | `course-material-catalog.test.ts` | — |
| `course-material-mentions.ts` | 453 | Owns V2 Writing Feedback course-material retrieval and mention resolution. | — | retrieval or mention resolution changes |
| `material-relevance.ts` | 130 | Relevance pairs, the batched relevance call, and the supported-excerpt map. | `material-relevance.test.ts` | — |

Also in `materials/__tests__/`: `course-material-grounding.test.ts`, `course-material-needs.test.ts`.

### Rubric — `rubric/`

Rubric schema, bands, lenses, seeding, presets, autofill, and the default and lab-report profiles.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `assignment-type.ts` | 129 | Records the assignment type and applies lab-report rubric routing. | `assignment-type.test.ts` | the assignment type flow changes |
| `criterion-assessment.ts` | 119 | Partitions rubric criteria by who authors their feedback. | `criterion-assessment.test.ts` | — |
| `default-rubric-profile.ts` | 222 | Builds neutral assignment and rubric defaults without course-specific assumptions. | `default-rubric-profile.test.ts` | assignment or rubric defaults change |
| `lab-report-profile.ts` | 185 | Builds the editable lab-report technical rubric template. | `lab-report-profile.test.ts` | the technical rubric template changes |
| `rubric-autofill.ts` | 503 | Builds the auto-fill prompt and merges its proposal into a draft. | `rubric-autofill.test.ts` | the auto-fill prompt or merge changes |
| `rubric-bands.ts` | 133 | Derives, spaces, and resolves per-criterion point bands. | `rubric-bands.test.ts` | point bands change |
| `rubric-cell-proposals.ts` | 180 | Proposes rating descriptions for criteria whose source gave none. | `rubric-cell-proposals.test.ts` | the proposal prompt or marking changes |
| `rubric-lens.ts` | 163 | Resolves which rubric on an assignment a feedback lens uses. | `rubric-lens.test.ts` | which rubric a lens uses changes |
| `rubric-presets.ts` | 162 | Scale presets and the suggestion rule; optional assignment-specific criterion templates. | `rubric-scale-presets.test.ts` | a scale or the suggestion rule changes; the optional criteria list changes |
| `rubric-schema.ts` | 457 | Validates and promotes assignment-specific Writing Feedback rubrics. | `rubric-schema.test.ts` | rubric validation or approval changes |
| `rubric-seed.ts` | 112 | Resolves the starting rubric for a lens. | `rubric-seed.test.ts` | a lens gets a different starting rubric |
| `rubric-source-choice.ts` | 224 | Reports and switches the source of an assignment's graded rubric grid. | `rubric-source-choice.test.ts` | the grid-source choice or its confirmation rule changes |

Also in `rubric/__tests__/`: `rubric-provenance.test.ts`.

### Instructor sources — `sources/`

Instructor material extraction and rubric extraction for autofill. Never student text.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `autofill-sources.ts` | 149 | Lists, selects, and labels the material auto-fill reads for one assignment. | `autofill-sources.test.ts` | which sources auto-fill offers or reads changes |
| `document-extraction-service.ts` | 96 | Parses writing submissions locally and keeps scan intake staff-verified. | — | accepted upload types or extraction change |
| `source-material-extraction.ts` | 218 | Extracts instructor-supplied assignment material, keeping table structure. | `source-material-extraction.test.ts` | accepted material types, table handling, or material limits change |
| `source-rubric-extraction.ts` | 408 | Extracts rubrics from instructor material and converts them into grids. | `source-rubric-extraction.test.ts` | extraction prompt or conversion rules change |

### Submission intake — `intake/`

Replacement attempts and transcript acceptance/edit rules.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `submission-replacement.ts` | 87 | Replaces or keeps a student's active Writing Feedback submission. | `submission-replacement.test.ts` | — |
| `transcript.ts` | 129 | Extraction quality check and the transcript-edit boundary rules. | `transcript-edit.test.ts`, `transcript-quality.test.ts` | automatic transcript acceptance changes |

### Review — `review/`

Anchored comments, summary resolution and edits, staff final assessment, suggested grading.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `anchored-comments.ts` | 386 | Validates, seeds, and stale-checks exact UTF-16 comment anchors. | `anchored-comments.test.ts` | anchoring, seeding, or stale detection changes; what counts as an annotation change |
| `staff-final-assessment.ts` | 156 |  | `staff-final-assessment.test.ts` | grading maths change |
| `suggested-grading.ts` | 76 | Derives the staff-only suggested grading for one run. | `suggested-grading.test.ts` | staff-only suggestions change |
| `summary.ts` | 383 | Comment resolution, edit binding, evidence-from-annotations, redraft runs, summary-edit validation. | `summary-edits.test.ts`, `summary-sources.test.ts` | detail, PDF, or release summary resolution changes; editable summary fields change |

### Canvas import (read-only) and rubric write — `canvas/`

Canvas import, attachment download, rubric mapping, and rubric write.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `canvas-attachment-download.ts` | 238 | Fetches Canvas submission attachment bytes without presenting an OAuth token. | `canvas-attachment-download.test.ts` | — |
| `canvas-client-for-user.ts` | 97 | Rebuilds one staff member's authenticated Canvas client outside a request. | `canvas-client-for-user.test.ts` | credential handling changes |
| `canvas-import-contracts.ts` | 232 | Defines read-only Canvas import and local storage interfaces. | — | the import port changes |
| `canvas-import-resolver.ts` | 184 | Chooses live or local Canvas import adapters for the current staff request. | — | live/mock adapter selection changes |
| `canvas-import-service.ts` | 561 | Previews and imports Canvas submissions into local records, never writing back. | `canvas-import-service.test.ts` | import behaviour or skip/failure accounting changes |
| `canvas-live-import-gateway.ts` | 646 | Reads real Canvas assignments and submissions for staff-initiated import. | `canvas-live-import-gateway.test.ts` | what is read from Canvas changes |
| `canvas-rubric-mapping.ts` | 326 | Maps a Canvas rubric onto the EngE-AI rubric grid, or refuses. | `canvas-rubric-mapping.test.ts` | Canvas rubric import changes |
| `canvas-rubric-write.ts` | 114 | Builds the Canvas rubric_assessment payload, or names why it cannot. | `canvas-rubric-write.test.ts` | the rubric_assessment payload changes |

Also in `canvas/__tests__/`: `canvas-rubric-shape-fidelity.test.ts`.

### Canvas release (the only external writes) — `release/`

Preview, single release, queueing, refusals, and the live/mock release services.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `canvas-release-service.ts` | 167 | Previews, deduplicates, and finalizes approved Canvas feedback releases. | `canvas-release-service.test.ts` | the fingerprint or the mock release changes |
| `live-canvas-release-service.ts` | 487 |  | `live-canvas-release-service.test.ts` | ANY release behaviour changes — read the release contract first |
| `queued-release-service.ts` | 83 | Rebuilds the Canvas release coordinator for a job with no request behind it. | — | how a queued release rebuilds its adapter changes |
| `release-refusals.ts` | 167 | Allow-list and translation of release failures into staff-readable job errors. | `release-cap.test.ts`, `release-refusals.test.ts` | the five-release cap or revision numbering changes |
| `release-workflow.ts` | 450 | Canvas release preview, single-release queueing, the queued run, and the release itself. | — | preview, the single-release cap, queueing, the lock, or the queued worker path changes |

Also in `release/__tests__/`: `release-lock.test.ts`.

### Jobs — `jobs/`

Leased job runner and the worker wiring.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `job-runner.ts` | 77 | Executes one leased Writing Feedback job with sanitized retry state. | `job-runner.test.ts` | retry or sanitized job failure changes |
| `worker.ts` | 81 | Wires asynchronous Writing Feedback generation jobs at server startup. | `worker.test.ts` | job wiring or retry marking changes |

### Evaluation — `eval/`

Checks used by `npm run wf:eval`.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `eval-checks.ts` | 165 | Pure scoring of one eval fixture's engine output. | `eval-checks.test.ts` | — |

Also in `eval/__tests__/`: `lab-eval-fixtures.test.ts`.

### Shared utilities — `shared/`

Small helpers used across areas.

| File | Lines | Responsibility | Tests | Open it when |
| --- | ---: | --- | --- | --- |
| `strip-nulls.ts` | 52 | Recursively omits null-valued object keys from a structured-output result. | `strip-nulls.test.ts` | structured-output normalisation changes |

## Outside `src/writing-feedback/`

| File | Lines | Responsibility | Open it when |
| --- | ---: | --- | --- |
| `src/routes/route-writing-feedback.ts` | 1043 | Every Writing Feedback HTTP endpoint and its course-scoped RBAC. | an endpoint, its authorization, or its response shape changes |
| `src/db/mongo/writing-feedback-mongo.ts` | 1312 | Persistence: assignments, submissions, runs, reviews, releases, jobs, glossary, and the indexes. | a query, an index, or a compare-and-set transition changes |
| `src/db/enge-ai-mongodb.ts` | 1481 | The façade every handler goes through to reach the delegates above. | a new delegate is exposed |
| `src/report-generation/writing-feedback-report.ts` | 525 | Renders the student-safe PDF, including annotations and the lab-report technical section. | anything a student sees in the PDF changes |
| `public/scripts/feature/writing-feedback.ts` | 852 | The workspace shell: assignment list, intake, and navigation. | the workspace layout or intake changes |
| `public/scripts/feature/writing-feedback-batch.ts` | 299 | The "Generate feedback for all submissions" bar, confirmation modal, progress, and Stop. | batch generation UI changes |
| `public/scripts/feature/writing-feedback-review.ts` | 1562 | The three-step review page: annotations, feedback with a grade per criterion, then review, approve and release. | review or release UI changes |
| `public/scripts/feature/writing-feedback-grade-entry.ts` | 377 | Final grade controls on each criterion card (level buttons, points box, status chip) and the read-only rubric grid. | how staff enter or see grades changes |
| `public/scripts/feature/writing-feedback-grade-progress.ts` | 104 | DOM-free grading progress and the sentence explaining why Approve is blocked. | what counts as graded, or the approval blocker wording |
| `public/scripts/feature/writing-feedback-rubric.ts` | 2104 | The rubric editor and its approval flow. | rubric editing changes |
| `public/scripts/feature/writing-feedback-grid.ts` | 913 | The marking grid rendering and interaction. | the grid changes |
| `public/scripts/feature/writing-feedback-anchors.ts` | 714 | Selection, highlighting, and anchored-comment interaction in the browser. | anchoring UX changes |
| `public/scripts/feature/writing-feedback-shared.ts` | 1144 | Frontend mirror of the shared API types, plus request helpers. | ANY API contract changes — it must mirror `src/types/shared.ts` |
| `public/scripts/feature/writing-feedback-rubric-progress.ts` | 228 | Rubric completion progress indicator. | progress display changes |
| `public/scripts/feature/writing-feedback-demo-mode.ts` | 57 | Demo-mode switch for synthetic courses. | demo behaviour changes |
| `public/scripts/feature/writing-feedback-review-steps.ts` | 72 | DOM-free step bar state and Next decision for the three-step review. | the review steps change |
| `public/scripts/feature/writing-feedback-summary-editor.ts` | 193 | Editable summary sections and edit detection per lens. | editable summary UI changes |
| `public/scripts/feature/writing-feedback-annotation-fingerprint.ts` | 56 | Browser mirror of the annotation fingerprint. | what counts as an annotation change |
| `public/scripts/feature/writing-feedback-sources.ts` | 283 | The "Assignment material" list in step 1: ticks, upload, paste with table HTML, remove, and the character total. | the source list or how material is added changes |
| `public/scripts/feature/writing-feedback-assignment-type.ts` | 93 | The "What kind of assignment is this?" modal and save flow. | the assignment type modal changes |
| `public/scripts/feature/writing-feedback-assignment-type-state.ts` | 45 | DOM-free labels and pending-assignment selection for that modal. | the modal labels change |
| `public/styles/instructor-components/writing-feedback.css` | 3567 | Every Writing Feedback style. | the workspace, rubric, review, or release step is restyled |

## Tests

Each area folder holds its own `__tests__/`. The suites a release change must keep green:

- `release/__tests__/release-lock.test.ts` — the cap, revision numbering, queueing, the lock, and the worker path.
- `release/__tests__/live-canvas-release-service.test.ts` — preflight, write order, uncertain outcomes, rubric assessment.
- `release/__tests__/canvas-release-service.test.ts` — fingerprint and mock release.
- `service/__tests__/writing-feedback-service.test.ts` — lifecycle, review revisions, and edits blocked during a release.
- `canvas/__tests__/canvas-live-import-gateway.test.ts` — read-only import and scoped attachment download.

## Known size problems

The files a first-time reviewer will struggle with, largest first:

- `public/styles/instructor-components/writing-feedback.css` (3567 lines)
- `public/scripts/feature/writing-feedback-rubric.ts` (2104 lines)
- `public/scripts/feature/writing-feedback-review.ts` (1562 lines)
- `src/db/mongo/writing-feedback-mongo.ts` (1312 lines)
- `public/scripts/feature/writing-feedback-shared.ts` (1144 lines)
- `src/routes/route-writing-feedback.ts` (1043 lines)

Splitting them is worthwhile but is not a prerequisite for review: this map plus the
release contract is meant to make them navigable as they stand.
