# Writing Feedback — Review Guide

An entry point for someone reviewing this feature for the first time. It says what the feature
does, what must always be true, and the order in which to read the code.

Companions: `WRITING_FEEDBACK_CANVAS_RELEASE_CONTRACT.md` (the Canvas state machine),
`WRITING_FEEDBACK_FILE_MAP.md` (one row per file), `WRITING_FEEDBACK_ARCHITECTURE.md` (the full
architecture note this guide summarizes).

## What the feature does

Course staff import student writing (pasted, uploaded, or read from a Canvas assignment), a model
drafts rubric-anchored feedback against a staff-approved rubric, staff review and edit every part
of it, staff grade it, and only then may staff release the approved feedback and grade back to
Canvas.

It is a staff tool. Students never interact with it; they receive a PDF and a grade in Canvas.

## The invariants

These hold everywhere. A change that breaks one is wrong regardless of how convenient it is.

1. **Opt-in per course.** A course without the capability exposes no Writing Feedback UI and no
   operational API.
2. **A human approves before anything reaches a student.** Model output is a draft. Release
   requires an explicitly approved submission and a complete staff-final assessment.
3. **Evidence is exact.** Rubric judgments quote verified submission text verbatim. Weights are
   never invented; they come from the approved rubric.
4. **OCR and extracted text are unverified until staff say otherwise.** Generation is blocked on
   `verification_needed`.
5. **Student submissions never enter the course-material RAG/Qdrant pipeline.**
6. **Nothing sensitive is logged.** Not submission text, not prompts containing it, not generated
   feedback, not OAuth tokens, not provider messages that may quote a Canvas payload.
7. **Student-facing output excludes internals.** No confidence scores, internal flags, model
   suggestions, prompt/model metadata, or staff-only notes.
8. **Import is read-only.** Reading Canvas never creates a Canvas comment, rubric, or grade.
9. **Course-scoped RBAC on every endpoint.** Once the capability is enabled, instructors, admins,
   and TAs have workspace parity (D-049).

## Status glossary

**Submission** (`imported → generating → draft_ready → approved → released`):

| Status | Meaning |
| --- | --- |
| `imported` | Text is present and usable |
| `verification_needed` | Extracted or scanned text awaits staff confirmation; generation blocked |
| `generating` | A model run is in flight |
| `draft_ready` | A draft exists for staff review; saving a review revision returns here |
| `approved` | Staff approved this exact revision; the only state release accepts |
| `released` | Feedback reached the student in Canvas |
| `failed` | A run failed; staff attention needed |

**Release** (the external-write lifecycle, one record per payload fingerprint):

| Status | Meaning |
| --- | --- |
| `previewed` | Preflight passed; nothing has been written to Canvas |
| `feedback_attached` | The comment and PDF are on the Canvas submission |
| `grade_queued` | Canvas accepted the grade job; its Progress is not yet confirmed |
| `released` | Comment and grade both confirmed |
| `reconciliation_required` | A write's outcome is genuinely unknown; a human must look in Canvas |
| `failed` | A write definitely did not happen; may be released again |
| `reconciled` | A human resolved an uncertain release |

`releaseLockedAt` is separate from status: it says a queued job is carrying this release right
now. See the release contract.

## Reading order

1. `src/writing-feedback/contracts.ts` — every type the feature moves around.
2. `documents/WRITING_FEEDBACK_CANVAS_RELEASE_CONTRACT.md` — the release state machine.
3. `src/writing-feedback/writing-feedback-service.ts` — the orchestration: generation, review,
   approval, preview, queueing, and the worker entry point.
4. `src/writing-feedback/live-canvas-release-service.ts` — the only code that writes to a real
   Canvas course.
5. `src/writing-feedback/canvas-import-service.ts` and `canvas-live-import-gateway.ts` — the
   read-only import path.
6. `src/db/mongo/writing-feedback-mongo.ts` — persistence, indexes, and the compare-and-set
   transitions.
7. `src/routes/route-writing-feedback.ts` — the HTTP surface and its RBAC.
8. `public/scripts/feature/writing-feedback-review.ts` — the review and release page staff use.

## Where the risk is

- **Release.** Everything else is internal state; release is the only code path that changes
  something outside this system and notifies a student.
- **Anchored comments.** Offsets are UTF-16 with the quote as checksum; a drifted anchor must be
  flagged, never silently re-anchored.
- **Canvas rubric write-back.** Scores are written per criterion by Canvas id. A rubric rebuilt in
  Canvas after import must refuse, not guess.
- **Import provenance.** An attachment is resolved through the course/assignment/student-scoped
  Canvas endpoint, so Canvas decides which bytes come back rather than a URL from a payload.

## Testing expectations

Run `npx jest src/writing-feedback` plus both TypeScript builds for any behaviour change here.
Release changes additionally need coverage for: concurrent queueing, an edit between queue and
worker, an adapter that changed between preview and release, and a Canvas 5xx after each
side-effecting write.
