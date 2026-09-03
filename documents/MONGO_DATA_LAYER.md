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
  - **Runtime assembly** — chat uses JSON defaults when `usePlatformDefault: true`; learning objectives are injected into the `course main intro` module at compose time via `{{course_learning_objectives}}` (not stored in instructor config). That module also carries LO-scope / off-scope redirect instructions (few-shot). Courses with customized mode bodies keep their Mongo copy until instructor Reset for that mode.
- **Guided Pathways** (`pathways-mongo.ts` on `{courseName}_pathways`):
  - **Pathway cards** — `GuidedPathway` docs (`id`, `order`, `title`, `enabled`, `triggerDescription`, `assistantResponse`, `ctas[]`, `updatedAt`). Platform seeds: `mental-health-crisis`, `inappropriate-content` (no `off-topic`; scope is teaching-prompt LO rules).
  - **Evaluation shell singleton** — reserved id `__evaluation_system_prompt` / `docType: evaluationSystemPrompt` with `usePlatformDefault`, `body`, `updatedAt`. Filtered out of list/reorder/evaluation ids. Runtime fills `{{pathway_trigger_sections}}`.
  - **GP-001** — lazy `deleteMany({ id: 'off-topic' })` on ensure/list/seed. Registry: [DATA_MIGRATIONS.md](DATA_MIGRATIONS.md#gp-001-remove-legacy-off-topic-pathway).
  - **Lazy provision** — `ensurePathwaysCollection` creates collection + indexes; new-course seed / Reset inserts platform cards + evaluation shell.
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
  - **`additionalMaterials[]`** — one parent record per uploaded file (not a chunk). Display title is `name`; OS filename is top-level `fileName`. `qdrantChunkIds[]` holds Qdrant point UUIDs; `chunksGenerated` equals that list length after `npm run migrate` C. Nested `file` blobs and singular `qdrantId` are stripped by migrate op A. Qdrant stores chunk vectors only; original file bytes are not in Mongo.
- **Course capabilities** (`activeCourse.features` on `active-course-list`):
  - Keys: `writingFeedback`, `memoryAgent`, `guidedPathway`, `scenarioGeneration` — each `{ enabled, enabledAt?, enabledBy? }`; missing = disabled at read time.
  - New-course defaults live in `src/dashboard-setting/course-feature-defaults.ts` (builders in `course-features.ts`). Create/setup persist a full map with all off unless opted in.
  - Staff-visible on course GET; student / non-staff course payloads omit `features` entirely (`course-student-view.ts`). Runtime chat/API gates still read Mongo server-side. Students may fetch `{ scenarioGeneration }` only via `GET .../student-capabilities`.
  - `scenarioGeneration` Extra Feature gates Practice Scenarios / Scenario Questions (pages + APIs) and unstruggle Yes scenario chips.
- **Course LLM settings** (`activeCourse.llmSettings` on `active-course-list`):
  - Per-feature map: `chat`, `scenarioGeneration`, `writingFeedback`, `guidedPathway`, `memoryAgent` — each `{ modelId, reasoningLevel }`, plus optional `updatedAt` / `updatedBy`.
  - Staff-visible on course GET; omitted from student / non-staff projections with `features`.
  - Catalog ids: `gpt-5.6-luna`, `qwen3.8-27b`, `qwen3.6-35b-a3b`, `gpt-4.1-mini-engeai-local`; missing/invalid → default `gpt-5.6-luna` + `none` per feature. Rows still naming the retired `gpt-5.4-mini` / `gpt-4o-mini` ids are unknown on read and clamp to the default.
  - TEMPORARY: `qwen3.8-27b`, `qwen3.6-35b-a3b`, and `gpt-4.1-mini-engeai-local` are withheld while the platform API key is provisioned for `gpt-5.6-luna` only (`TEMPORARILY_UNAVAILABLE_MODEL_IDS`). Stored rows naming a withheld model are treated as invalid on read and clamp to the default, so no runtime call targets a model the key cannot serve. The stored value itself is left untouched — nothing rewrites Mongo — so the original choice returns intact once the model is re-enabled.
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

`writing-feedback-mongo.ts` owns fixed, course-keyed collections: `canvas-connections`, `writing-assignments`, `writing-submissions`, `writing-feedback-runs`, `writing-releases`, `writing-jobs`, and `writing-glossary-entries`.

- A unique partial index protects `{ courseId, canvasAssignmentId }` only when `canvasAssignmentId` is a string. Startup reconciles the legacy compound `sparse` index, whose always-present `courseId` accidentally limited each course to one manual assignment. Submission attempts and release payload fingerprints retain their own unique indexes.
- Queue reads use course, assignment, status, and update time. Job state/lease indexes support the Mongo-leased worker; generation jobs are deduplicated by `{ courseId, type, payload.submissionId, state }` for active states before enqueue. `retentionAt` is the only TTL field and is set only when retention policy permits cleanup.
- Writing records never store PUIDs. Submission text stays outside Qdrant/RAG. A future `writing-source-files` GridFS bucket is limited to staff-uploaded scans needed for transcription review; Canvas originals remain externally referenced.
- `writing-assignments` stores the current linguistic rubric plus `sflContext` profile (an unapproved draft for a new assignment, then the active approved version), optional `rubricDraft`, immutable prior approved versions in `rubricHistory`, assignment `instructions`, template `profileVersion`, `rubricSource`, optional `canvasAssignmentId`, and optional `dueAt`. Listing has no write side effect: empty courses remain empty. Manual and Canvas creation use a neutral three-criterion/four-level draft and placeholder SFL profile requiring staff approval. Read-boundary normalization supplies missing level `rank` values from legacy array order across current, draft, and history values without rewriting stored documents. `countWritingSubmissionsByAssignment` aggregates landing-view counts.
- `writing-feedback-runs` stores the student-facing `result` plus optional lens. V2 linguistic runs additionally store schema/foundation/analyzer-prompt/writer-prompt/model versions, validated `sflAnalysis`, resolved `courseMaterialMentions`, `courseSourceVersion`, and glossary entry versions. Prompt bodies and student text are not stored in run provenance. Failed analyzer/writer attempts do not persist partial runs.
- `writing-glossary-entries` stores course-scoped reusable terms with `{ id, courseId, term, normalizedTerm, definition, version, createdAt, createdBy, updatedAt, updatedBy }`. A unique index on `{ courseId, normalizedTerm }` prevents duplicate normalized terms. Updates are version-checked and increment `version`; annotation snapshots keep historical PDFs stable after later definition changes.
- Staff review revisions (`writing-submissions.reviews[]`) optionally snapshot a server-computed `finalAssessment` and `comments`: anchored specific-feedback comments (`quote` + UTF-16 offsets into the verified text, comment body, optional how-to-improve/link/course-material mention/glossary snapshot, `origin: model_seed|staff`, optional staff-facing `functionTag`/`levelTag`/`priority` filter tags, server-stamped `authorName` for staff-authored comments (carried forward across revisions by comment id, never client-controlled), ≤50 per revision). Revisions remain append-only; editing or deleting a comment appends a new revision, and offsets are re-validated against the verified text before every write. `finalAssessment` is accepted only when it covers exactly the active rubric criteria/version; the server computes totals and release uses this staff-final grade, never the model suggestion. Document growth stays bounded by the 30k-character text limit and the 50-comment cap.
- Rubric draft saves write only `rubricDraft` with actor/time metadata. First approval promotes the initial draft without archiving it; later approvals archive the former active rubric and promote the validated higher version. `writing-feedback-runs.rubricVersion` and `writing-releases.rubricVersion` retain the approved version used by assessment/release.
- `WritingRubricCriterion.points` and `WritingRubricCriterion.cells` are optional. `points` is the criterion row weight; `cells` is a sparse map keyed by level id with `{ min, max, descriptor? }` for per-level point bands and descriptors. Both are additive fields with no migration: older ordinal rubrics remain valid. Criteria and levels may now be added or removed after approval because runs resolve against their stored `rubricVersion` through `rubricHistory`; only reuse of a retired id is refused, since anchored comments store a bare criterion id without a version.
- Optional level points remain rubric metadata. Release grading comes from the staff-final assessment saved with the latest review revision; incomplete, stale, duplicate, or out-of-range criterion scores are rejected before they can reach Canvas.
- `writing-assignments.canvasDetails` holds the assignment brief imported from Canvas (`descriptionHtml`, plain-text rendering, points, due date). The Canvas *rubric* is not stored: it seeds the assignment's first rubric draft at creation via `canvasRubricToSeedShape` + `seedRubricForLens`, so an assignment carries exactly one rubric. `saveCanvasAssignmentDetails` refreshes only the brief and never touches `rubric` or `rubricDraft`.
- `writing-assignments.canvasRubricImport` keeps what an imported Canvas rubric looked like — `{ shape, ids, importedAt }`. `ids` is what makes the rubric writable on release: EngE-AI criterion ids are derived from criterion names and cannot address Canvas's own `_1234`-style criterion and rating ids. Rubric provenance is per lens: `rubricSource` describes the writing lens only, and `technicalRubricSource` (`'canvas' | 'builtin'`) the technical one, so a Canvas-seeded technical grid does not make the writing lens report `canvas` and lose the metafunctions auto-fill a lab report's writing lens needs.
- Both lenses are recorded on the things they produce. `AnchoredComment.lens` says which rubric a comment's criterion belongs to, which is what lets the two lenses reuse criterion ids without collision; `StaffFinalAssessment.lens` says which rubric the grade was awarded against, since a lab report is graded on its technical rubric. Both are optional, and absent means `'linguistic'` — every record written before two-lens grading.
- `writing-assignments.canvasRubricRefusal` records why a Canvas rubric could not seed the grid — `no_rubric`, `too_few_ratings`, `too_many_criteria`, or `too_many_levels`. It is written only at Canvas import, only when the built-in profile seeded the draft instead, and never on re-import; the rubric page shows it until a rubric is approved.
- `canvas-connections` remains unused. Live Canvas OAuth tokens are persisted per user by the LMS package's own Mongo token store in `canvas_tokens` (keyed by `GlobalUser.userId`, never a PUID) and configured once in `src/lms/canvas-config.ts` — a second config would key a second collection and split each user's credential in two. Neither Writing Feedback nor the demo adapter writes a token record of its own, and no access token is returned through the API.
- Canvas import is idempotent at course/assignment/student/attempt in every mode. A repeated import reports skipped/reconciled records and does not append another submission; a submission whose download or parse failed is simply retried by importing again. Import never mutates Canvas and never writes to a RAG/Qdrant collection.
- `writing-submissions.studentId` is always a one-way SHA-256 digest, domain-separated per integration so a synthetic demo record and a live Canvas record can never collide and each row's provenance is readable from its prefix (`canvas-demo-…` vs `canvas-…`).
- `writing-submissions.canvasUserId` is present only on live Canvas imports. It holds Canvas's own numeric `user_id` — a provider-scoped identifier of the same class as `activeCourse.lmsLink.courseId` — and exists because `studentId` is irreversible while Canvas addresses a submission by user id on write-back. It appears in staff-facing responses only — Writing Feedback is gated to course staff for every route, and those payloads already carry the student's real name in `studentLabel`, a more direct identifier than a provider-scoped integer. It never reaches a student, never appears in the feedback PDF, and is never logged; the Canvas import preview strips it regardless, since that response also carries attachment download URLs. `integration_id` (the PUID), `sis_user_id` (the student number), and `login_id` (the CWL) are never requested from Canvas, never stored, and never logged; the submissions read passes `include[]=user` alone, so Canvas does not serialize them at all.
- `writing-submissions.studentLabel` holds the student's Canvas display name for live imports. It is staff-only and is never returned to students.
- Live-import intake state depends on how the text was obtained. Canvas text entries store `sourceType: canvas_text` with `verifiedText` set and `status: imported`. Downloaded attachments store `sourceType: digital_file` with no `verifiedText`, `requiresVerification: true`, and `status: verification_needed`, because text parsed from bytes must be staff-confirmed before it can reach feedback generation.
- `writing-releases` stores one fingerprinted release attempt per semantic payload, with `status` values spanning preview, feedback attachment, queued Canvas grade progress, released, failed, and reconciliation-required states. Live Canvas records may carry `integration`, `postManually`, `canvasFileIds`, `canvasProgressId`, `failureStage`, `rubricAssessmentWritten` (whether per-criterion points reached the instructor's Canvas rubric), and sanitized failure text. A `{ courseId, submissionId, updatedAt }` index surfaces the latest release/reconciliation state on review reload.
- `writing-releases.revision` and `.queuedByUserId` support re-release. A submission may be released up to five times, counted from the records themselves (`released` and `reconciled` only — a preview, a failure, or an unreconciled attempt never reached the student and costs nothing), so no counter can fall out of step with what happened. `revision` is assigned at preview from that count; `queuedByUserId` is the `GlobalUser.userId` whose stored Canvas credential the queued write acts with, never a PUID. `listWritingReleases(courseId, submissionId)` returns the history oldest-first and is the source of both.
- `writing-jobs` carries `type: 'release'` alongside `extract`/`generate`/`pdf`. A release job holds only `{ submissionId }`; the worker reloads the release record for the credential to act with. `findLatestWritingJob(courseId, submissionId, type)` returns the newest job of a type in any state, so a polling page can read a terminal failure's sanitized reason as well as active work.
- UI-only states such as loading, dirty form, and recoverable error are not persisted. Durable states are the saved rubric draft, approved rubric version, submission status, append-only staff revision, release preview/release/reconciliation, and sanitized job failure.
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
  `findGlobalUserByPUID` before any write, so token rows carry no PUID. The lookup is
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
- Sync is add-only: a student whose Canvas enrollment disappears keeps their EngE-AI
  enrollment and chat history. Nothing in this path deletes an enrollment row.

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
  `findGlobalUserByPUID` before any write, so token rows carry no PUID. The lookup is
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
- Sync is add-only: a student whose Canvas enrollment disappears keeps their EngE-AI
  enrollment and chat history. Nothing in this path deletes an enrollment row.

### Instructor onboarding state (`active-users.instructorOnboarding`)

Instructor onboarding is split across two documents, deliberately.

- **`activeCourse.courseSetup`** stays on the course (`active-course-list`). Completing it
  writes real configuration — `frameType`, `tilesNumber`, `topicOrWeekInstances`,
  `features` — so a second instructor must not be able to run it again and override the
  first one's choices.
- **`GlobalUser.instructorOnboarding`** (`active-users`) holds `{ contentSetup, flagSetup,
  monitorSetup, scenarioGeneration, writingFeedback, guidedPathway }`. Every one is a pure
  tutorial that writes nothing to the course, so progress belongs to the person. An
  instructor new to EngE-AI is taught even when a colleague already set the course up, and a
  returning instructor is never taught twice.
- The last three are the **feature tutorials**. Whether one is owed also depends on the
  course: `resolveNextOnboardingStage` gates each on `activeCourse.features.<key>.enabled`,
  so a course that never enabled Writing Feedback owes nobody that tutorial. Completion is
  sticky across a feature being disabled and re-enabled, and a feature never previously
  completed triggers its tutorial the first time any course enables it.

`activeCourse.contentSetup` / `flagSetup` / `monitorSetup` are **deprecated** and no longer
read or written. They are left on existing documents (not `$unset`) so the change reverts
cleanly; `PUT /api/courses/:id` strips them from request bodies so a stale client cannot
resurrect them.

- Written only by `completeInstructorOnboardingStage` (`global-user-mongo.ts`), which uses a
  dotted `$set` (`instructorOnboarding.<stage>`). The shallow `$set` in `updateGlobalUser`
  would replace the whole subdocument and wipe the sibling stages. Only ever sets `true`.
- Read by `resolveInstructorModeRedirect` (`src/helpers/instructor-onboarding-redirect.ts`),
  the single choke point for both course-entry routes.
- `sanitizeGlobalUserForFrontend` (`src/utils/user-utils.ts`) whitelists fields, so the
  object is coerced there explicitly — a field omitted from that function never reaches the
  browser.
- Backfilled by **OB-002** from the coarser `instructorOnboardingCompleted` flag, which seeds
  the three inherited stages only. The feature tutorials are deliberately left unseeded: they
  are new, so nobody has been taught them and everybody is owed them once their course
  enables the capability. See [DATA_MIGRATIONS.md](DATA_MIGRATIONS.md).

- **TBD**: One-way deps (example: flags + user enrichment).

## Tests and coverage

- Tests live under `src/db/mongo/__tests__/`.
- **TBD**: Mock strategy, optional integration gate, npm/jest snippets (`npm test`, `jest --coverage`).

## Operations and troubleshooting

- **TBD**: Required `MONGO_*` env vars, common failure signatures, logs to tail.

## Changelog / migration notes

- **Data migrations registry:** [DATA_MIGRATIONS.md](DATA_MIGRATIONS.md) — SP-001 (system prompts), CM-001 (chat mode), OB-001 / OB-002 / IPA-001 (`npm run migrate` op A), MIG-A/B/C/D (Mongo/Qdrant CLI), SQ-001, SQ-004.
- **Manual migrate CLI:** `src/migrate/cli.ts` — `npm run migrate`. Not run from `server.ts`.
- Façade delegates live under `src/db/mongo/` (split from monolithic `enge-ai-mongodb.ts`).

## References

- Cursor rule: `.cursor/rules/backend/03-mongodb-master.mdc`
- Shared document types: `src/types/shared` (imports differ by file path)
