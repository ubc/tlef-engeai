# Writing Feedback — File Map

One row per file: what it is responsible for, how big it is, which suite covers it, and
when a reviewer needs to open it. Companions: `WRITING_FEEDBACK_REVIEW_GUIDE.md`,
`WRITING_FEEDBACK_CANVAS_RELEASE_CONTRACT.md`.

Line counts are a rough guide to reading cost, not a target.

## `src/writing-feedback/`

### Contracts and types

| File | Lines | Responsibility | Test | Open it when |
| --- | ---: | --- | --- | --- |
| `contracts.ts` | 796 | Owns the staff-only Writing Feedback domain and port contracts. | — | any type crosses a boundary |
| `canvas-import-contracts.ts` | 218 | Defines read-only Canvas import and local storage interfaces. | — | the import port changes |

### Orchestration

| File | Lines | Responsibility | Test | Open it when |
| --- | ---: | --- | --- | --- |
| `writing-feedback-service.ts` | 927 | Coordinates the staff-reviewed Writing Feedback lifecycle. | `writing-feedback-service.test.ts` | lifecycle, approval, preview, queueing, or the worker path changes |
| `worker.ts` | 66 | Wires asynchronous Writing Feedback generation jobs at server startup. | — | job wiring changes |
| `job-runner.ts` | 77 | Executes one leased Writing Feedback job with sanitized retry state. | `job-runner.test.ts` | retry or sanitized job failure changes |

### Generation

| File | Lines | Responsibility | Test | Open it when |
| --- | ---: | --- | --- | --- |
| `feedback-engine.ts` | 407 | Generates staff-review drafts from assignment rubrics and verified text. | `feedback-engine.test.ts` | prompt or draft shape changes |
| `technical-feedback-engine.ts` | 222 | Generates staff-review technical drafts for lab reports. | `technical-feedback-engine.test.ts` | lab-report technical drafts change |
| `feedback-schema.ts` | 277 | Enforces rubric-driven output, exact evidence, and safe numeric mapping. | `feedback-schema.test.ts` | model output validation changes |
| `sfl-analysis.ts` | 284 | Owns Writing Feedback V2 analyzer schemas and deterministic validation. | `sfl-analysis.test.ts` | analyzer schema or validation changes |
| `sfl-foundation.ts` | 139 | Owns the Writing Feedback V2 SFL rule/source allowlists. | — | the rule/source allowlist changes |
| `course-material-mentions.ts` | 150 | Owns V2 Writing Feedback course-material retrieval and mention resolution. | — | retrieval or mention resolution changes |
| `strip-nulls.ts` | 52 | Recursively omits null-valued object keys from a structured-output result. | `strip-nulls.test.ts` | structured-output normalisation changes |
| `suggested-grading.ts` | 73 | Derives the staff-only suggested grading for one run. | `suggested-grading.test.ts` | staff-only suggestions change |

### Rubric

| File | Lines | Responsibility | Test | Open it when |
| --- | ---: | --- | --- | --- |
| `rubric-schema.ts` | 284 | Validates and promotes assignment-specific Writing Feedback rubrics. | `rubric-schema.test.ts` | rubric validation or approval changes |
| `rubric-seed.ts` | 112 | Resolves the starting rubric for a lens. | `rubric-seed.test.ts` | a lens gets a different starting rubric |
| `rubric-lens.ts` | 101 | Resolves which rubric on an assignment a feedback lens uses. | `rubric-lens.test.ts` | which rubric a lens uses changes |
| `rubric-bands.ts` | 91 | Derives, spaces, and resolves per-criterion point bands. | `rubric-bands.test.ts` | point bands change |
| `rubric-autofill.ts` | 461 | Builds the auto-fill prompt and merges its proposal into a draft. | `rubric-autofill.test.ts` | the auto-fill prompt or merge changes |
| `criterion-library.ts` | 45 | Optional rubric criteria available to the staff editor. | — | the optional criteria list changes |
| `default-rubric-profile.ts` | 216 | Builds neutral assignment and rubric defaults without course-specific assumptions. | `default-rubric-profile.test.ts` | assignment or rubric defaults change |
| `lab-report-profile.ts` | 177 | Builds the editable lab-report technical rubric template. | `lab-report-profile.test.ts` | the technical rubric template changes |
| `staff-final-assessment.ts` | 106 | Builds and validates the staff-final rubric assessment and its total. | `staff-final-assessment.test.ts` | grading maths change |

### Review

| File | Lines | Responsibility | Test | Open it when |
| --- | ---: | --- | --- | --- |
| `anchored-comments.ts` | 216 | Validates, seeds, and stale-checks exact UTF-16 comment anchors. | `anchored-comments.test.ts` | anchoring, seeding, or stale detection changes |
| `document-extraction-service.ts` | 91 | Parses writing submissions locally and keeps scan intake staff-verified. | — | accepted upload types or extraction change |

### Canvas import (read-only)

| File | Lines | Responsibility | Test | Open it when |
| --- | ---: | --- | --- | --- |
| `canvas-import-service.ts` | 462 | Previews and imports Canvas submissions into local records, never writing back. | `canvas-import-service.test.ts` | import behaviour or skip/failure accounting changes |
| `canvas-live-import-gateway.ts` | 515 | Reads real Canvas assignments and submissions for staff-initiated import. | `canvas-live-import-gateway.test.ts` | what is read from Canvas changes |
| `canvas-import-resolver.ts` | 179 | Chooses live or local Canvas import adapters for the current staff request. | — | live/mock adapter selection changes |
| `canvas-client-for-user.ts` | 97 | Rebuilds one staff member's authenticated Canvas client outside a request. | `canvas-client-for-user.test.ts` | credential handling changes |

### Canvas release (the only external writes)

| File | Lines | Responsibility | Test | Open it when |
| --- | ---: | --- | --- | --- |
| `live-canvas-release-service.ts` | 470 | Writes to a real Canvas course: preflight, comment, rubric assessment, grade. | `live-canvas-release-service.test.ts` | ANY release behaviour changes — read the release contract first |
| `canvas-release-service.ts` | 161 | Previews, deduplicates, and finalizes approved Canvas feedback releases. | `canvas-release-service.test.ts` | the fingerprint or the mock release changes |
| `queued-release-service.ts` | 83 | Rebuilds the Canvas release coordinator for a job with no request behind it. | — | how a queued release rebuilds its adapter changes |
| `canvas-rubric-mapping.ts` | 250 | Maps a Canvas rubric onto the EngE-AI rubric grid, or refuses. | `canvas-rubric-mapping.test.ts` | Canvas rubric import changes |
| `canvas-rubric-write.ts` | 114 | Builds the Canvas rubric_assessment payload, or names why it cannot. | `canvas-rubric-write.test.ts` | the rubric_assessment payload changes |
| `release-cap.ts` | 59 | Counts a submission's completed releases and assigns the next revision number. | `release-cap.test.ts` | the five-release cap or revision numbering changes |

## Outside `src/writing-feedback/`

| File | Lines | Responsibility | Open it when |
| --- | ---: | --- | --- |
| `src/routes/route-writing-feedback.ts` | 1043 | Every Writing Feedback HTTP endpoint and its course-scoped RBAC. | an endpoint, its authorization, or its response shape changes |
| `src/db/mongo/writing-feedback-mongo.ts` | 1312 | Persistence: assignments, submissions, runs, reviews, releases, jobs, glossary, and the indexes. | a query, an index, or a compare-and-set transition changes |
| `src/db/enge-ai-mongodb.ts` | 1481 | The façade every handler goes through to reach the delegates above. | a new delegate is exposed |
| `src/report-generation/writing-feedback-report.ts` | 525 | Renders the student-safe PDF, including annotations and the lab-report technical section. | anything a student sees in the PDF changes |
| `public/scripts/feature/writing-feedback.ts` | 852 | The workspace shell: assignment list, intake, and navigation. | the workspace layout or intake changes |
| `public/scripts/feature/writing-feedback-review.ts` | 1387 | The review page: draft, comments, staff-final grade, release card. | review or release UI changes |
| `public/scripts/feature/writing-feedback-rubric.ts` | 2104 | The rubric editor and its approval flow. | rubric editing changes |
| `public/scripts/feature/writing-feedback-grid.ts` | 913 | The marking grid rendering and interaction. | the grid changes |
| `public/scripts/feature/writing-feedback-anchors.ts` | 714 | Selection, highlighting, and anchored-comment interaction in the browser. | anchoring UX changes |
| `public/scripts/feature/writing-feedback-shared.ts` | 1144 | Frontend mirror of the shared API types, plus request helpers. | ANY API contract changes — it must mirror `src/types/shared.ts` |
| `public/scripts/feature/writing-feedback-rubric-progress.ts` | 228 | Rubric completion progress indicator. | progress display changes |
| `public/scripts/feature/writing-feedback-demo-mode.ts` | 57 | Demo-mode switch for synthetic courses. | demo behaviour changes |
| `public/styles/instructor-components/writing-feedback.css` | 2774 | Every Writing Feedback style. | the workspace, rubric, review, or release card is restyled |

## Tests

`src/writing-feedback/__tests__/` holds 31 suites. The ones a release change must keep green:

- `release-lock.test.ts` — the cap, revision numbering, queueing, the lock, and the worker path.
- `live-canvas-release-service.test.ts` — preflight, write order, uncertain outcomes, rubric assessment.
- `canvas-release-service.test.ts` — fingerprint and mock release.
- `writing-feedback-service.test.ts` — lifecycle, review revisions, and edits blocked during a release.
- `canvas-live-import-gateway.test.ts` — read-only import and scoped attachment download.

## Known size problems

The files a first-time reviewer will struggle with, largest first:

- `public/styles/instructor-components/writing-feedback.css` (2774 lines)
- `public/scripts/feature/writing-feedback-rubric.ts` (2104 lines)
- `public/scripts/feature/writing-feedback-review.ts` (1387 lines)
- `src/db/mongo/writing-feedback-mongo.ts` (1312 lines)
- `public/scripts/feature/writing-feedback-shared.ts` (1144 lines)
- `src/routes/route-writing-feedback.ts` (1043 lines)
- `src/writing-feedback/writing-feedback-service.ts` (927 lines)
- `src/writing-feedback/contracts.ts` (796 lines)

Splitting them is worthwhile but is not a prerequisite for review: this map plus the
release contract is meant to make them navigable as they stand.
