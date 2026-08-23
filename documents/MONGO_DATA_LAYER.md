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

- A unique partial index protects `{ courseId, canvasAssignmentId }` only when `canvasAssignmentId` is a string. Startup reconciles the legacy compound `sparse` index, whose always-present `courseId` accidentally limited each course to one manual assignment. Submission attempts and release payload fingerprints retain their own unique indexes.
- Queue reads use course, assignment, status, and update time. Job state/lease indexes support the planned Mongo-leased worker; `retentionAt` is the only TTL field and is set only when retention policy permits cleanup.
- Writing records never store PUIDs. Submission text stays outside Qdrant/RAG. A future `writing-source-files` GridFS bucket is limited to staff-uploaded scans needed for transcription review; Canvas originals remain externally referenced.
- `writing-assignments` stores the current rubric (an unapproved draft for a new assignment, then the active approved version), optional `rubricDraft`, immutable prior approved versions in `rubricHistory`, assignment `instructions`, template `profileVersion`, `rubricSource`, optional `canvasAssignmentId`, and optional `dueAt`. Listing has no write side effect: empty courses remain empty. Manual and Canvas creation use a neutral three-criterion/four-level draft requiring instructor approval. Read-boundary normalization supplies missing level `rank` values from legacy array order across current, draft, and history values without rewriting stored documents. `countWritingSubmissionsByAssignment` aggregates landing-view counts.
- Staff review revisions (`writing-submissions.reviews[]`) optionally snapshot `comments`: anchored specific-feedback comments (`quote` + UTF-16 offsets into the verified text, comment body, optional how-to-improve/link/glossary, `origin: model_seed|staff`, optional staff-facing `functionTag`/`levelTag`/`priority` matrix taxonomy tags, server-stamped `authorName` for staff-authored comments (carried forward across revisions by comment id, never client-controlled), ≤50 per revision). Revisions remain append-only; editing or deleting a comment appends a new revision, and offsets are re-validated against the verified text before every write. Document growth stays bounded by the 30k-character text limit and the 50-comment cap.
- Rubric draft saves write only `rubricDraft` with actor/time metadata. First approval promotes the initial draft without archiving it; later approvals archive the former active rubric and promote the validated higher version. `writing-feedback-runs.rubricVersion` and `writing-releases.rubricVersion` retain the approved version used by assessment/release.
- `WritingRubricCriterion.points` and `WritingRubricCriterion.cells` are optional. `points` is the criterion row weight; `cells` is a sparse map keyed by level id with `{ min, max, descriptor? }` for per-level point bands and descriptors. Both are additive fields with no migration: older ordinal rubrics remain valid. Criteria and levels may now be added or removed after approval because runs resolve against their stored `rubricVersion` through `rubricHistory`; only reuse of a retired id is refused, since anchored comments store a bare criterion id without a version.
- Optional level points derive `gradeMapping` only when every supported level has a value. The approval path is its only writer and replaces the mapping wholesale, or unsets it wholesale for an ordinal rubric, so removed/stale keys cannot survive.
- Local demo Canvas import creates no `canvas-connections` token record. A future live connection may persist only institutionally approved connection metadata plus an encrypted refresh token; access tokens remain memory-only and are never returned through the API.
- Canvas import is idempotent at course/assignment/student/attempt. A repeated import reports skipped/reconciled records and does not append another submission. Import never mutates Canvas and never writes to a RAG/Qdrant collection.
- UI-only states such as loading, dirty form, and recoverable error are not persisted. Durable states are the saved rubric draft, approved rubric version, submission status, append-only staff revision, release preview/release, and sanitized job failure.
- `deleteWritingAssignment(ctx, courseId, assignmentId)` refuses to delete (returns `{ deleted: false, submissionCount }`) while any `writing-submissions` row references the assignment; staff must delete those first. `deleteWritingSubmission(ctx, courseId, submissionId)` deletes a submission at any status and cascades a delete of its `writing-feedback-runs`, `writing-releases`, and queued `writing-jobs` rows (matched on `payload.submissionId`); reviews live embedded in the submission document, so no separate cleanup is needed for those.
- **Lab report technical lens (two rubrics per assignment).** `writing-assignments` gained optional fields `isLabReport`, `technicalRubric` (approved), `technicalRubricDraft`, and `technicalRubricHistory` — the same draft/approved/history shape as the linguistic `rubric`/`rubricDraft`/`rubricHistory`, but scoped to the technical lens. All four are optional with no backfill: an absent `isLabReport` behaves as `false`, and an assignment never marked as a lab report simply has no technical rubric fields. `rubric-lens.ts` (`rubricFieldPaths`, `selectRubric`) is the single place that maps a `WritingFeedbackLens` (`'linguistic' | 'technical'`) to its three field names, so no caller hardcodes them. `WritingRubricDefinition` also gained an optional `labContext` (trimmed, max 12,000 characters) carrying the instructor-approved lab handout text used as generation context.
- **Lens-scoped rubric delegates.** `saveWritingRubricDraft`, `discardWritingRubricDraft`, `approveWritingRubricDraft`, and `getLatestWritingFeedbackRun` each take an optional trailing `lens: WritingFeedbackLens` parameter defaulting to `'linguistic'`, so every pre-existing call site is source-compatible. `approveWritingRubricDraft`'s optional `gradeMapping` write is linguistic-only regardless of lens; a never-approved lens (a freshly toggled lab report's technical rubric) has no prior-approved-version predicate to guard until its first approval exists.
- **`writing-feedback-runs.lens`** (optional `WritingFeedbackLens`) records which lens produced a run. Absent means `'linguistic'` — `getLatestWritingFeedbackRun` treats `{ lens: 'linguistic' }` and `{ lens: { $exists: false } }` as the same query for the linguistic lens, so pre-existing runs written before the technical lens shipped keep surfacing as the latest linguistic run with no migration required.
- **New delegates:** `setWritingAssignmentLabReport(ctx, courseId, assignmentId, isLabReport)` performs the scoped `isLabReport` write only; seeding a technical draft on marking and refusing to unmark an approved/run-backed technical rubric are service/route-level decisions, not this delegate's. `countWritingFeedbackRunsByLens(ctx, courseId, assignmentId, lens)` counts stored runs across every submission under an assignment for one lens — an assignment-scoped answer `getLatestWritingFeedbackRun` (per-submission) cannot give — and backs the unmark-refusal check.

### LMS integration token collections

`canvas_tokens` and `moodle_tokens` hold per-user LMS credentials. They are owned by
`@ubc/ubc-genai-toolkit-lms-integration`'s `createMongoTokenStore`, **not** by a
`src/db/mongo/` delegate, and are wired in `src/routes/route-lms.ts`. Collection
names are overridable via `CANVAS_TOKEN_COLLECTION_NAME` / `MOODLE_TOKEN_COLLECTION_NAME`.

- **Separate collection per provider, always.** The store keys documents solely by
  `userKey`, with no provider discriminator — a shared collection would have each
  provider silently overwrite the other's tokens.
- **`userKey` is `GlobalUser.userId`, never a PUID.** `resolveUserKey` in
  `route-lms.ts` resolves the signed-in user's PUID to their internal `userId` via
  `findGlobalUserByPUID` before any write, preserving the invariant that
  `active-users` is the only collection storing a PUID at rest. The lookup is
  asynchronous; the package accepts `getUserKey: (req) => string | Promise<string>`.
- Document shape is `{ _id, userKey, tokens }`. A unique index on `userKey` is
  created lazily on first use and memoized, so it is safe under multi-worker
  startup. Canvas stores an access/refresh pair with `expiresAt` and `canvasUserId`;
  Moodle stores the `wstoken` and `moodleUserId` (no expiry, no refresh).
- Token values are never logged, never returned through the API, and never placed
  in error messages. `GET /api/lms/status` reports configuration presence only.
- These collections are **not** course-scoped and carry no course association.
  Disconnecting deletes the local row; for Moodle it does not revoke the token
  in Moodle itself.
- Distinct from `canvas-connections` (see writing feedback above), which is a
  reserved, currently unused collection for a future course-level Canvas
  connection and is unrelated to these per-user token stores.

### LMS course links (`active-course-list.lmsLink`)

`course-lms-link-mongo.ts` owns the pointer from an EngE-AI course to the LMS course it
was imported from. It is a field on the existing `active-course-list` catalog document,
not a collection of its own.

- Shape is `{ provider, courseId, name, code, linkedAt, linkedBy }`. `provider` is stored
  explicitly because the LMS package dropped `provider` from `LmsCourse` in 1.0.0 — its
  ids are provider-scoped, so a bare `courseId` is ambiguous once a second LMS exists.
  `linkedBy` is a `GlobalUser.userId`, never a PUID.
- Present only on **Canvas-imported** courses. Admin-created courses have no `lmsLink`
  and are joined with `courseCode`; both kinds coexist permanently.
- `lms_link_provider_course_unique` is a **unique partial** index on
  `(lmsLink.provider, lmsLink.courseId)`, filtered on `lmsLink.courseId: { $exists: true }`.
  Partial because most courses carry no link and a plain unique index would treat every
  missing value as a duplicate. Unique because two EngE-AI courses claiming one Canvas
  course would make student matching ambiguous — whichever row was read first would win.
- The index name and its `partialFilterExpression` are a matched pair: MongoDB rejects an
  index whose filter changed under an existing name. Changing this definition requires an
  explicit reviewed migration, not an in-place edit. Created best-effort at startup in
  `server.ts`; `setCourseLmsLink` checks for a conflicting claim before writing, so the
  index is a safety net rather than the primary guard.
- **Enrollment is resolved per user, not by roster matching.** Each person authorizes
  Canvas as themselves, so the link plus the caller's own Canvas enrollments is enough to
  place them — no Canvas-user-to-EngE-AI-account matching table exists.
- **One roster read does happen, and it stores nothing.** Instructor import verifies the
  Canvas `integration_id` against the CWL PUID, which Canvas only exposes to a teacher in
  a course context. That read is the teacher roster of the course being imported
  (`enrollmentTypes: ['teacher']`), performed once, compared in memory, and discarded.
  No `integration_id` — the importer's or any co-instructor's — is written to any
  collection or log. The student join path performs no roster read at all.
  `active-users` remains the only collection storing a PUID at rest.
- Sync is add-only: a student whose Canvas enrollment disappears keeps their EngE-AI
  enrollment and chat history. Nothing in this path deletes an enrollment row.

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
