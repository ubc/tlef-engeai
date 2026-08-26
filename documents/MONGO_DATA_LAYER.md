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
- **Chat threads** (`chat-mongo.ts` on `{courseName}_users.chats[]`) — conversation-level starring has been retired. New records and API responses omit `isPinned`; legacy embedded values are ignored on reads and may remain inert in MongoDB without a destructive migration. Optional `pinnedMessageId` continues to represent the separate message-level pin feature.
- **Guided Pathway alerts** (`guided-pathway-flag-mongo.ts` + `guided-pathway-flag-collection-mongo.ts`):
  - Each course owns a separate collection registered in `activeCourse.collections.guidedPathwayFlags`. New registrations default to the readable `{courseName}_guided-pathway-flags` name. The stored value, not a recomputed name, remains authoritative after a course rename. GPF-001 `guided-pathway-flags-course-<hash>` names are migration sources only. Automatic alerts stay separate from `activeCourse.collections.flags` manual-flag storage and are never queried by Student Flag History or `/flags/with-names`.
  - Manual `{courseName}_flags` documents use `FlagReport.status` of `unresolved`, `resolved`, or `escalated`. Escalation stores optional `escalatedAt` / `escalatedBy`; platform-admin review stores `adminReviewedAt` / `adminReviewedBy`. No migration required for existing `unresolved` / `resolved` rows.
  - A partial unique index on non-empty string `activeCourse.collections.guidedPathwayFlags` registrations enforces one catalog owner per physical namespace across processes. Provisioning also rejects protected names, collisions with any other registered course collection, and physical collections containing rows for another `courseId`. Generic course updates strip client-provided `collections`; only server-owned create/provision/migration paths can change registry entries.
  - **Startup/operation migration (GPF-002)** copies rows from both the former global `guided-pathway-flags` collection and GPF-001 hashed collections into the registered readable target. A durable `application-migrations` record with `_id: 'GPF-002'` provides a renewable cross-process lease and persisted completion state; a process-local promise only coalesces callers within one application instance. Operations await this gate until migration completion.
  - GPF-002 uses 200-row, `_id`-keyed, insert-only `$setOnInsert` upserts. Existing target documents are not replaced, so a newer decision, admin review, or reveal audit cannot be reverted by a stale legacy snapshot. The migration verifies target ownership and every copied `_id`, compare-and-set switches the catalog, rechecks catalog ownership, and only then deletes verified source rows. It drops only empty legacy namespaces and retains malformed/orphan data for manual recovery. See [DATA_MIGRATIONS.md](DATA_MIGRATIONS.md#gpf-002-guided-pathway-registered-collection-normalization).
  - Every new row has explicit `origin: 'student' | 'instructor-test'`; safe reads normalize a missing legacy origin to `student`. Student rows store the exact message, restricted `studentUserId`, opaque deduplication hash, decision/review actors and times, and append-only identity-reveal audit events. At creation, instructor-test rows omit `studentUserId` and any separate trigger-actor identity field; the trigger actor ID participates only in the opaque deduplication digest. A later dismissal may add the ordinary authorized decision-actor audit fields. PUID and raw client/chat identifiers are never stored.
  - Instructor/admin list delegates use inclusion projections and map to `GuidedPathwayFlagView`; student/tester identity, deduplication data, and reveal events cannot reach normal API responses. Admin reveal first atomically appends its audit event, then resolves and returns only the current course-roster display name, falling back to `active-users` when the sender is staff not on the roster. Audit failure returns no name.
  - A unique deduplication index makes transport retries an idempotent no-op. Additional per-course indexes cover status/date, pathway/status/date, and escalated/unreviewed admin queries. There is no TTL because completed decisions remain viewable.
  - Production student decisions are atomic `pending` to `escalated`/`dismissed` transitions. An instructor test is course-only and can transition from `pending` to `dismissed`; escalation, admin review, and identity reveal reject it before any mutation, audit write, or roster read. Global admin rows, totals, facets, reviewer facets, and awaiting-review counts apply a student-or-missing-origin filter, so tests never enter the global workflow. Admin review remains a soft completion marker; neither workflow hard-deletes alert rows.
  - Alert creation uses a provisioning resolver that may register, create, and index missing legacy-course storage. Course/admin list, count, backup, and aggregation paths use read-only resolution and do not create or index empty collections. Platform-admin listing and pending-count operations build a server-owned `$unionWith` pipeline over existing registered active-course collections; request input never supplies a physical namespace.
  - Course backup reads the anonymous projection, including safe `origin`, from that course's existing registered collection. Restarting onboarding or deleting a course drops only the registered owned alert collection after counting its rows; a missing namespace is an idempotent no-op and invalidates its process-local index memo.
- **Topic/week embedded content** (`topic-week-mongo.ts` on `active-course-list`):
  - **`learningObjectives[]`** per `items[]` — instructor CRUD; flattened via `getAllLearningObjectives` for system-prompt injection.
  - **`instructorStruggleTopics[]`** per `items[]` — instructor CRUD (`/struggle-topics` API); gated by `features.memoryAgent`; flattened via `getAllInstructorStruggleTopics` for memory-agent catalog only (not main chat system prompt).
- **Course capabilities** (`activeCourse.features` on `active-course-list`):
  - Keys: `writingFeedback`, `memoryAgent`, `guidedPathway`, `scenarioGeneration` — each `{ enabled, enabledAt?, enabledBy? }`; missing = disabled at read time.
  - New-course defaults live in `src/dashboard-setting/course-feature-defaults.ts` (builders in `course-features.ts`). Create/setup persist a full map with all off unless opted in.
  - Staff-visible on course GET; student / non-staff course payloads omit `features` entirely (`course-student-view.ts`). Runtime chat/API gates still read Mongo server-side. Students may fetch `{ scenarioGeneration }` only via `GET .../student-capabilities`.
  - `scenarioGeneration` Extra Feature gates Practice Scenarios / Scenario Questions (pages + APIs) and unstruggle Yes scenario chips.
- **Course LLM settings** (`activeCourse.llmSettings` on `active-course-list`):
  - Per-feature map: `chat`, `scenarioGeneration`, `writingFeedback`, `guidedPathway`, `memoryAgent` — each `{ modelId, reasoningLevel }`, plus optional `updatedAt` / `updatedBy`.
  - Staff-visible on course GET; omitted from student / non-staff projections with `features`.
  - Catalog ids: `gpt-5.6-luna`, `gpt-5.4-mini`, `gpt-4o-mini`; missing/invalid → default `gpt-5.6-luna` + `none` per feature.
  - Persisted `reasoningLevel` is `AppReasoningLevel` (`none` \| `low` \| `medium` \| `high`). Provider-only levels (`xhigh`, `max`) are catalog metadata only and are clamped on read / rejected on PATCH.
  - Legacy flat `{ modelId, reasoningLevel }` is expanded to all five features at read time by `ModelSelectionService` (no chat-level storage).
  - Runtime: process Map keyed by `courseId` (5-minute inactivity eviction) with cold-miss single-flight Mongo load; PATCH write-through via `setCachedSettings` after successful `$set`. Single-process freshness only. Dashboard UI shades Writing Feedback, Guided Pathway, Memory Agent, and Scenario Generation model rows when the matching Extra Feature is off.
  - Provider model strings match catalog `modelId` values (no per-model env override).
  - Memory Agent settings are shared by conversation struggle analysis, struggle-topic generator, and unstruggle follow-up.
- **Memory agent** (`memory-agent-mongo.ts` on `{courseName}_memory-agent`):
  - **`struggleTopics[]`** — canonical flat distinct labels per user (written by memory-agent analyze).
  - **Legacy `struggleTopicsByChapter[]`** — superseded; lazily removed on read/write (`$unset`) with labels merged into `struggleTopics[]`.
  - **Per-chapter view** — derived at read time via `struggle-chapter-normalize.ts` (`assignLabelsToChapters` + instructor catalog); not stored on the row.
  - **Catalog** — `getAllInstructorStruggleTopics` includes `topicOrWeekId` for chapter derivation in exports and report stats.
- **TBD**: Courses, registry / scheduled tasks, flags, users, chats, globals, instructor prompts — main operations per file and noteworthy cross-dependencies (`getFlagReportsWithUserNames`, etc.).
- **Scenario Questions (Practice Scenarios)** — `scenario-questions-mongo.ts` on a dedicated per-course `{courseName}_scenario_questions` collection (not embedded on `activeCourse`):
  - **`ScenarioQuestion`** — one doc per question; `status: 'draft' | 'published' | 'rejected'`, `topicOrWeekId` FK to chapter, `subQuestions[]` with server `subQuestionId`, `studentResponses[]` history, and structured `learningObjectives[]` snapshots.
  - **Lazy migration (SQ-001)** — `ensureScenarioQuestionsCollection` provisions the collection + `activeCourse.collections.scenarioQuestions` on first scenario-questions API call; indexes live in `scenario-indexes.ts`.
  - **SQ-002 / SQ-003** — backfill difficulty/time/type fields and `subQuestionId` + empty `studentResponses` on legacy docs (idempotent).
  - **Embedded responses** — atomic positional `$push` to `subQuestions.$.studentResponses` with server-owned `id`, `studentUserId`, `grade`, `feedback`, `mode`, `submittedAt`. Document-growth guard rejects writes near the 16 MiB BSON limit.
  - **Solution gate** — derived from embedded responses (`hasCompletedAllSubQuestions` for `practice` | `exam`); `CourseUser.scenarioProgress` is no longer used.
  - **Orchestration** — `src/scenario-generation/scenario-service.ts` owns generate, check-answer, and submit-exam; Zod contracts in `scenario-schemas.ts`.
- **Scenario Progress (student drafts)** — `scenario-progress-mongo.ts` on `{courseName}_scenario_progress` (not embedded on questions or `CourseUser`):
  - **`ScenarioStudentProgress`** — one doc per `(userId, questionId, mode)` with `answers[]` draft text per sub-question; never exposed to instructor APIs.
  - **Lazy migration (SQ-004)** — `ensureScenarioProgressCollection` provisions the collection + `activeCourse.collections.scenarioProgress` on first progress API call.
  - **Lifecycle** — explicit `PUT .../progress` on student save; `GET .../progress` on workspace reopen; deleted on successful exam submit.
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
- Staff review revisions (`writing-submissions.reviews[]`) optionally snapshot `comments`: anchored specific-feedback comments (`quote` + UTF-16 offsets into the verified text, comment body, optional how-to-improve/link/glossary, `origin: model_seed|staff`, optional staff-facing `functionTag`/`levelTag`/`priority` matrix taxonomy tags, server-stamped `authorName` for staff-authored comments (carried forward across revisions by comment id, never client-controlled), ≤50 per revision). Revisions remain append-only; editing or deleting a comment appends a new revision, and offsets are re-validated against the verified text before every write. Document growth stays bounded by the 30k-character text limit and the 50-comment cap.
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

- **Data migrations registry:** [DATA_MIGRATIONS.md](DATA_MIGRATIONS.md) — SP-001 (system prompts), CM-001 (chat mode), OB-001 (startup backfill), SQ-001 (scenario questions collection), SQ-004 (scenario progress collection).
- Façade delegates live under `src/db/mongo/` (split from monolithic `enge-ai-mongodb.ts`).

## References

- Cursor rule: `.cursor/rules/backend/03-mongodb-master.mdc`
- Shared document types: `src/types/shared` (imports differ by file path)
