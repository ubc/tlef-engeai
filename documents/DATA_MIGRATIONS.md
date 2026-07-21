# Data migrations registry (EngE-AI)

Canonical list of schema and data migrations. Implementation details live in the cited source files; this document is the ops and sunset contract.

## Purpose

- **Lazy (request-time):** run when a course or chat is accessed (no startup batch scan).
- **Startup:** run on each server start from `src/server.ts` (operational backfills).

## Sunset policy

Time-bounded schema migrations must have migration **code and legacy read paths removed by end of day 2026-06-30** in **America/Vancouver** (PDT, UTC−07:00).

Operational startup migrations (OB-001) are documented here but are **not** tied to that date unless a future audit says otherwise.

---

## Registry

| ID | Name | Type | Trigger | Source → target | Sunset / removal |
|----|------|------|---------|-----------------|----------------|
| **SP-001** | System prompt v1 → v2 | Lazy (request) | `ensureSystemPromptConfig` in `src/db/mongo/system-prompt-config-mongo.ts` | `collectionOfSystemPromptItems` → `systemPromptConfig`; then `$unset` legacy field | **Remove by 2026-06-30** — see [SP-001](#sp-001-system-prompt-v1--v2) |
| **SP-002** | System prompt mode backfill | Lazy (request) | `ensureAllModeStates` in `system-prompt-config-mongo.ts` | missing `systemPromptConfig.modes[mode]` → `seedModeState(mode)` for each `CONVERSATION_MODE_IDS` entry | Keep while new modes ship; audit when mode list stabilizes |
| **SP-003** | Retired conversation-mode state cleanup | Lazy (request) | `stripRetiredModeStates` in `system-prompt-config-mongo.ts` | `systemPromptConfig.modes['scenario-generation']` (and future `RETIRED_CONVERSATION_MODE_IDS`) → removed | Keep while any retired mode key may exist on old course documents |
| **CM-001** | Chat `conversationMode` backfill | Lazy (restore) | `ChatApp.ensureLegacyChatModePersisted` in `src/chat/chat-app.ts` | missing/invalid → `socratic` or `undeclared` | Optional later; audit before removal |
| **OB-001** | Onboarding flags backfill | Startup | `migrateOnboardingFlags` in `src/helpers/migrate-onboarding-flags.ts` | GlobalUser flags from course/CourseUser data | Operational — keep unless product changes |
| **AP-001** | Course `academicPeriodId` backfill | Lazy (request) | `lazyMigrateCourseAcademicPeriod` in `src/db/mongo/academic-period-mongo.ts` via `getActiveCourse` / `getAllActiveCourses` | missing `academicPeriodId` → default `2025W2` period; `$addToSet` on period `courseIds` | **Remove by 2026-06-30** — see [AP-001](#ap-001-academic-period-lazy-link) |
| **IPA-001** | Instructor allow-list period scope | Startup (once) | `migrateInstructorAllowances` in `src/helpers/migrate-instructor-allowances.ts` | `instructor-allowed-courses` → `instructor-period-allowances` for `2025W2` | Operational after first successful run |
| **ADM-001** | Platform admin `isAdmin` backfill | Startup | `migratePlatformAdmins` in `src/helpers/migrate-platform-admins.ts` | GlobalUsers matching `CHARISMA_RUSDIYANTO_PUID` / `RICHARD_TAPE_PUID` → `isAdmin: true` | Operational — keep unless product changes |
| **SQ-001** | Scenario Questions collection backfill | Lazy (first API call) | `ensureScenarioQuestionsCollection` in `src/db/mongo/scenario-questions-mongo.ts` | missing `activeCourse.collections.scenarioQuestions` → creates `{courseName}_scenario_questions` + `$set` the field | Keep while any pre-feature course document may lack `collections.scenarioQuestions` |
| **SQ-004** | Scenario Progress collection backfill | Lazy (first progress API call) | `ensureScenarioProgressCollection` in `src/db/mongo/scenario-progress-mongo.ts` | missing `activeCourse.collections.scenarioProgress` → creates `{courseName}_scenario_progress` + `$set` the field | Keep while any course may lack `collections.scenarioProgress` |

---

## SP-001: System prompt v1 → v2

**Status:** Active (lazy migrate + lazy unset)

**Collection:** `active-course-list` (per `activeCourse` document)

### Behavior

1. If `systemPromptConfig.schemaVersion === 1` and `collectionOfSystemPromptItems` **exists** (including empty array): **`$unset` only** (`cleanup-only`).
2. If config missing or invalid: map legacy items via `migrateFromLegacyItems` or `seedFreshConfig`, then **`$set` `systemPromptConfig` and `$unset` `collectionOfSystemPromptItems`** in one `updateOne` (`migrate-and-set`).

### Triggers (no dedicated migration endpoint)

- `GET /api/courses/:courseId/system-prompts/config`
- `getSystemPromptConfig` / `getDefaultConversationModeForCourse` (chat init and instructor flows)
- `ensureDefaultSystemPromptComponents` (delegates to `ensureSystemPromptConfig`)

Legacy v1 HTTP routes are removed; v1 CRUD in `instructor-prompt-mongo.ts` is unused (sunset with SP-001).

### Pre / post conditions

| | Condition |
|---|-----------|
| **Pre** | Course may have `collectionOfSystemPromptItems` and/or missing `systemPromptConfig` |
| **Post** | `systemPromptConfig.schemaVersion === 1`; `collectionOfSystemPromptItems` must not exist on the document |

### Idempotency

Safe to call repeatedly: already-migrated courses with no legacy field perform no write; courses with config + legacy field only run `$unset` once.

### Rollback

Restore the course document from Mongo backup or re-import. Re-adding `collectionOfSystemPromptItems` without removing v2 config is unsupported in application code after sunset.

### Verification (Mongo shell)

```js
db.getCollection('active-course-list').countDocuments({
  collectionOfSystemPromptItems: { $exists: true }
})
```

Target before **2026-06-30:** `0` in each environment (or documented exceptions).

### Pre-sunset ops checklist

1. Deploy build with SP-001 lazy `$unset`.
2. Run the count query weekly in staging/production.
3. Ensure active courses are touched at least once via instructor system-prompt config UI and/or chat traffic (both call `ensureSystemPromptConfig`).

### Post-sunset engineering checklist (after 2026-06-30)

- [ ] Remove `migrateFromLegacyItems` and legacy reads in `system-prompt-config-mongo.ts`

---

## SP-002: System prompt mode backfill

**Status:** Active (lazy migrate)

**Collection:** `active-course-list` (`systemPromptConfig.modes`)

### Behavior

When `systemPromptConfig.schemaVersion === 1` but a key from `CONVERSATION_MODE_IDS` is missing under `modes`, `ensureAllModeStates` adds `seedModeState(mode)` for each missing slug and persists with `$set: { systemPromptConfig }`.

Originally introduced for **scenario-generation** (third conversation mode, since retired — see SP-003).

### Triggers

Same as SP-001 (`ensureSystemPromptConfig`).

### Idempotency

Once all catalog modes exist on the document, no further writes.

### Rollback

Remove the added mode key from Mongo manually if needed; chat runtime falls back to platform defaults when `usePlatformDefault: true`.

---

## SP-003: Retired conversation-mode state cleanup

**Status:** Active (lazy migrate)

**Collection:** `active-course-list` (`systemPromptConfig.modes`)

### Behavior

`scenario-generation` was removed from `CONVERSATION_MODE_IDS` and replaced by the standalone Practice Scenarios / Scenario Questions feature (`planner/improved-scenario-generation-deliverables.md`). `stripRetiredModeStates` in `system-prompt-config-mongo.ts` removes any `RETIRED_CONVERSATION_MODE_IDS` key (currently `scenario-generation`) still present under `systemPromptConfig.modes` and persists with `$set: { systemPromptConfig }` alongside SP-002 in the same write.

### Triggers

Same as SP-001/SP-002 (`ensureSystemPromptConfig`).

### Idempotency

Once no retired keys remain on the document, no further writes for this migration.

### Rollback

Not applicable — retired mode prompt bodies are not needed at runtime; legacy chat history and `Chat.conversationMode === 'scenario-generation'` on `{courseName}_users` documents are untouched by this migration.

---

## SQ-001: Scenario Questions collection backfill

**Status:** Active (lazy migrate on first API call)

**Collection:** `active-course-list` (`collections.scenarioQuestions`) + new per-course `{courseName}_scenario_questions`

### Behavior

Practice Scenarios / Scenario Questions (`planner/improved-scenario-generation-deliverables.md`) persists one document per question in a dedicated per-course collection, not embedded on `activeCourse`. Courses created after this feature shipped get the collection **eagerly** in `postActiveCourse` (`src/db/mongo/course-mongo.ts`). Courses created before it ship the collection **lazily**: `ensureScenarioQuestionsCollection` runs on the first hit to any `/api/courses/:courseId/scenario-questions*` route (not on course entry — a locked product decision), creates `{courseName}_scenario_questions` if it does not already exist, `$set`s `activeCourse.collections.scenarioQuestions`, invalidates the cached collection-name lookup, and best-effort creates supporting indexes (`id` unique, `topicOrWeekId`+`status`+`sortOrder`, `status`).

### Triggers

Every scenario-questions route in `src/routes/mongo/scenario-questions-routes.ts` calls `ensureScenarioQuestionsCollection` before touching the collection.

### Idempotency

No-op once `activeCourse.collections.scenarioQuestions` is set — subsequent calls return the cached `courseName` immediately.

### Rollback

Not applicable — the collection is additive (new feature, no legacy field it replaces). Dropping `{courseName}_scenario_questions` and unsetting `collections.scenarioQuestions` would simply remove the practice bank for that course.

---

## SQ-004: Scenario Progress collection backfill

**Status:** Active (lazy migrate on first progress API call)

**Collection:** `active-course-list` (`collections.scenarioProgress`) + new per-course `{courseName}_scenario_progress`

### Behavior

Student draft answers (in-progress work before check-answer or exam submit) are stored separately from embedded `studentResponses[]` so instructors never see them. `ensureScenarioProgressCollection` runs on the first `GET` or `PUT` to `.../scenario-questions/:questionId/progress`, creates `{courseName}_scenario_progress` if missing, `$set`s `activeCourse.collections.scenarioProgress`, invalidates the collection-name cache, and creates a unique index on `(userId, questionId, mode)`.

### Triggers

`GET` and `PUT` progress routes in `src/routes/mongo/scenario-questions-routes.ts`.

### Idempotency

No-op once `activeCourse.collections.scenarioProgress` is set.

### Rollback

Dropping `{courseName}_scenario_progress` and unsetting `collections.scenarioProgress` removes saved drafts only; submitted `studentResponses[]` history is unaffected.

---

## AP-001: Academic period lazy link

**Status:** Active (lazy migrate on course read)

**Collections:** `active-course-list`, `academic-periods`

### Behavior

When `activeCourse.academicPeriodId` is missing on `getActiveCourse` / `getAllActiveCourses`:

1. Resolve default period document by title `2025W2` (seeded at startup via `initAcademicPeriods`).
2. `$set` `academicPeriodId` on the course.
3. `$addToSet` course id on the period's `courseIds` via `linkCourseToPeriod` (single dual-write owner).

### Triggers

- `getActiveCourse`, `getAllActiveCourses` in `course-mongo.ts`
- Admin BFF `GET /api/admin/course-selection` (via `getAllActiveCourses`)

### Idempotency

Safe to re-run; courses with `academicPeriodId` set are unchanged.

### Rollback

Remove `academicPeriodId` from course documents and pull ids from period `courseIds` manually or from backup.
- [ ] Remove `collectionOfSystemPromptItems` from `src/types/shared.ts` and `public/scripts/types.ts`
- [ ] Remove dead v1 CRUD in `src/db/mongo/instructor-prompt-mongo.ts` and façade methods in `src/db/enge-ai-mongodb.ts`
- [ ] Mark SP-001 **Retired** in this file
- [ ] Bump `package.json` per project versioning rules

---

## CM-001: Chat conversationMode backfill

**Status:** Active

On chat **restore**, missing or invalid `conversationMode` is persisted:

- Chats with user messages → `socratic` (historical default)
- Welcome-only chats → `undeclared` (student picks mode on first send)

See `documentation/ENDPOINT_ARCHITECTURE.md` (lazy restore migration note).

**Removal:** Only after an audit shows no embedded chats lack a valid persisted mode.

---

## OB-001: Onboarding flags backfill

**Status:** Active (startup)

Sets `instructorOnboardingCompleted` and `studentOnboardingCompleted` on `active-users` from existing course and roster data. Idempotent; runs every server restart.

---

## References

- Mongo layer: [MONGO_DATA_LAYER.md](MONGO_DATA_LAYER.md)
- System prompt API: [ENDPOINT_ARCHITECTURE.md](ENDPOINT_ARCHITECTURE.md)
- Platform defaults: [SYSTEM_PROMPT_DEFAULTS.md](SYSTEM_PROMPT_DEFAULTS.md)
- Cursor rule: `.cursor/rules/software-architect/01-migration-analyst.mdc`
