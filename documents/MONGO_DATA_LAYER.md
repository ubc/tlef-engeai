# Mongo data layer (EngE-AI)

<!--
  Skeleton only — elaborate after major refactors or new domains.
  Canonical API remains `EngEAI_MongoDB` in `src/db/enge-ai-mongodb.ts` (façade); delegates live under `src/db/mongo/`.
-->

## Purpose and scope

- **TBD**: What belongs in `src/db/` versus other persistence (Qdrant, session store, …).

## Public API (façade)

- **`EngEAI_MongoDB`** — singleton Mongo access; callers use `getInstance()`, then existing method names unchanged.
- **TBD**: Import path stability contract (`./db/enge-ai-mongodb`).

## Architecture overview

- **TBD**: Façade → `MongoDalContext` → domain modules (`*-mongo.ts`) diagram or short narrative.

## File map (`src/db/mongo/`)

- **TBD**: Table of sibling files (`mongo-context`, `course-mongo`, `flag-mongo`, …) mapped to domains.

## `MongoDalContext`, constants, collection helpers

- **TBD**: Fields on context (`db`, `idGenerator`, caches). Link to `mongo-constants.ts` / `mongo-collections.ts`.

## Domain modules (by area)

- **Academic periods** — `academic-period-mongo.ts` on `academic-periods`:
  - **`AcademicPeriodDocument`** — `id`, `title` (unique, e.g. `2025W2`), `startDate`, `endDate`, `courseIds[]` (denormalized).
  - **Startup seed** — `init-academic-periods.ts` ensures `2025W2` (`2026-01-06` – `2026-04-30`).
  - **Lazy migration (AP-001)** — `lazyMigrateCourseAcademicPeriod` sets `activeCourse.academicPeriodId` on first read; dual-write via `linkCourseToPeriod`. Registry: [DATA_MIGRATIONS.md](DATA_MIGRATIONS.md#ap-001-academic-period-lazy-link).
- **Instructor period allowances** — `instructor-period-allowance-mongo.ts` on `instructor-period-allowances` (replaces env-seeded `instructor-allowed-courses`).
- **Enrollment helpers** — `course-enrollment-mongo.ts` (`enrollUserInCourse`, `ensureAdminCourseEnrollment`).
- **System prompt config (v2)** — `system-prompt-config-mongo.ts` on `active-course-list`:
  - **`systemPromptConfig`** — `{ schemaVersion: 1, defaultConversationMode, modes: { socratic, explanatory } }` where each mode has `usePlatformDefault`, `modules[]`, `updatedAt`, optional `platformDefaultVersion`.
  - **Lazy migration (SP-001)** — `ensureSystemPromptConfig` maps legacy `collectionOfSystemPromptItems` → `systemPromptConfig`, then `$unset` the legacy field on access; no startup batch scan. Registry and sunset: [DATA_MIGRATIONS.md](DATA_MIGRATIONS.md#sp-001-system-prompt-v1--v2) (remove SP-001 code by **2026-06-30**).
  - **Runtime assembly** — chat uses JSON defaults when `usePlatformDefault: true`; learning objectives are injected into the `course main intro` module at compose time via `{{course_learning_objectives}}` (not stored in instructor config).
- **Topic/week embedded content** (`topic-week-mongo.ts` on `active-course-list`):
  - **`learningObjectives[]`** per `items[]` — instructor CRUD; flattened via `getAllLearningObjectives` for system-prompt injection.
  - **`instructorStruggleTopics[]`** per `items[]` — instructor CRUD (`/struggle-topics` API); flattened via `getAllInstructorStruggleTopics` for memory-agent catalog only (not main chat system prompt).
- **Memory agent** (`memory-agent-mongo.ts` on `{courseName}_memory-agent`):
  - **`struggleTopics[]`** — canonical flat distinct labels per user (written by memory-agent analyze).
  - **Legacy `struggleTopicsByChapter[]`** — superseded; lazily removed on read/write (`$unset`) with labels merged into `struggleTopics[]`.
  - **Per-chapter view** — derived at read time via `struggle-chapter-normalize.ts` (`assignLabelsToChapters` + instructor catalog); not stored on the row.
  - **Catalog** — `getAllInstructorStruggleTopics` includes `topicOrWeekId` for chapter derivation in exports and report stats.
- **TBD**: Courses, registry / scheduled tasks, flags, users, chats, globals, instructor prompts — main operations per file and noteworthy cross-dependencies (`getFlagReportsWithUserNames`, etc.).
- **Course summary (instructor modal)** — live metrics for the instructor course-summary UI:
  - **Catalog** (`active-course-list` / `course-mongo.ts`): `activeCourse.date` → summary **start date**; **end date** is not persisted yet (API placeholder until a catalog field exists).
  - **Roster** (`{courseName}_users` / `course-user-mongo.ts`): **`countCourseStudentsAndActiveChats`** — student row count (`affiliation: 'student'`) and count of **non-deleted** embedded chat threads, aligned with conversation ZIP export filters (`conversation-export-mongo.ts`).
  - **HTTP**: `GET /api/courses/:courseId/course-summary/status` in `src/routes/route-mongo.ts` (instructor RBAC) composes the JSON envelope; façade exposes **`countCourseStudentsAndActiveChats`**.

## Cross-cutting orchestration

<!-- @rdschrs: Implemented Writing Feedback persistence and lifecycle records. -->
### Writing feedback collections

`writing-feedback-mongo.ts` owns fixed, course-keyed collections: `canvas-connections`, `writing-assignments`, `writing-submissions`, `writing-feedback-runs`, `writing-releases`, and `writing-jobs`.

- Unique indexes protect Canvas course/assignment mappings, course/assignment/student/attempt submissions, and release payload fingerprints.
- Queue reads use course, assignment, status, and update time. Job state/lease indexes support the planned Mongo-leased worker; `retentionAt` is the only TTL field and is set only when retention policy permits cleanup.
- Writing records never store PUIDs. Submission text stays outside Qdrant/RAG. A future `writing-source-files` GridFS bucket is limited to staff-uploaded scans needed for transcription review; Canvas originals remain externally referenced.
- `writing-assignments` stores the current approved `rubric`, an optional `rubricDraft`, immutable prior versions in `rubricHistory`, `profileVersion`, `rubricSource`, optional `canvasAssignmentId`, and optional `dueAt` (Canvas due date or manual deadline). The A2 ensure path lazily adds approved version 1 to pre-rubric local records. `createManualWritingAssignment` seeds a manual assignment from the A2 profile; `countWritingSubmissionsByAssignment` aggregates per-assignment submission counts for the landing view.
- Staff review revisions (`writing-submissions.reviews[]`) optionally snapshot `comments`: anchored specific-feedback comments (`quote` + UTF-16 offsets into the verified text, comment body, optional how-to-improve/link/glossary, `origin: model_seed|staff`, optional staff-facing `functionTag`/`levelTag`/`priority` matrix taxonomy tags, ≤50 per revision). Revisions remain append-only; editing or deleting a comment appends a new revision, and offsets are re-validated against the verified text before every write. Document growth stays bounded by the 30k-character text limit and the 50-comment cap.
- Rubric draft saves write only `rubricDraft` with a higher version and actor/time metadata. Explicit instructor/admin approval moves the former active rubric to `rubricHistory` and promotes the validated draft. `writing-feedback-runs.rubricVersion` and `writing-releases.rubricVersion` retain the approved version used by assessment/release.
- Optional level points derive `gradeMapping` only when every supported level has a value. Partial points are retained in the draft for editing but cannot create a partial numeric release mapping.
- Local demo Canvas import creates no `canvas-connections` token record. A future live connection may persist only institutionally approved connection metadata plus an encrypted refresh token; access tokens remain memory-only and are never returned through the API.
- Canvas import is idempotent at course/assignment/student/attempt. A repeated import reports skipped/reconciled records and does not append another submission. Import never mutates Canvas and never writes to a RAG/Qdrant collection.
- UI-only states such as loading, dirty form, and recoverable error are not persisted. Durable states are the saved rubric draft, approved rubric version, submission status, append-only staff revision, release preview/release, and sanitized job failure.
- `deleteWritingAssignment(ctx, courseId, assignmentId)` refuses to delete (returns `{ deleted: false, submissionCount }`) while any `writing-submissions` row references the assignment; staff must delete those first. `deleteWritingSubmission(ctx, courseId, submissionId)` deletes a submission at any status and cascades a delete of its `writing-feedback-runs`, `writing-releases`, and queued `writing-jobs` rows (matched on `payload.submissionId`); reviews live embedded in the submission document, so no separate cleanup is needed for those.

- **TBD**: One-way deps (example: flags + user enrichment).

## Tests and coverage

- Tests live under `src/db/mongo/__tests__/`.
- **TBD**: Mock strategy, optional integration gate, npm/jest snippets (`npm test`, `jest --coverage`).

## Operations and troubleshooting

- **TBD**: Required `MONGO_*` env vars, common failure signatures, logs to tail.

## Changelog / migration notes

- **Data migrations registry:** [DATA_MIGRATIONS.md](DATA_MIGRATIONS.md) — SP-001 (system prompts), CM-001 (chat mode), OB-001 (startup backfill).
- Façade delegates live under `src/db/mongo/` (split from monolithic `enge-ai-mongodb.ts`).

## References

- Cursor rule: `.cursor/rules/backend/03-mongodb-master.mdc`
- Shared document types: `src/types/shared` (imports differ by file path)
