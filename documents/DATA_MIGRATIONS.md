# Data migrations registry (EngE-AI)

Canonical list of schema and data migrations. Implementation details live in the cited source files; this document is the ops and sunset contract.

## Purpose

- **Lazy (request-time):** run when a course or chat is accessed (no startup batch scan).
- **CLI:** `npm run migrate` — manual Mongo/Qdrant sync (`src/migrate/cli.ts`). Default and `--check` are dry-run; `--apply` writes. Operator how-to: `src/migrate/README.md`.
- **Startup:** `src/server.ts` only seeds academic periods (`initAcademicPeriods`). IPA-001, OB-001, and OB-002 no longer run on boot.

## Sunset policy

Time-bounded schema migrations must have migration **code and legacy read paths removed by end of day 2026-06-30** in **America/Vancouver** (PDT, UTC−07:00).

Operational CLI migrations (OB-001, OB-002) are documented here but are **not** tied to that date unless a future audit says otherwise.

---

## Registry

| ID | Name | Type | Trigger | Source → target | Sunset / removal |
|----|------|------|---------|-----------------|----------------|
| **SP-001** | System prompt v1 → v2 | Lazy (request) | `ensureSystemPromptConfig` in `src/db/mongo/system-prompt-config-mongo.ts` | `collectionOfSystemPromptItems` → `systemPromptConfig`; then `$unset` legacy field | **Remove by 2026-06-30** — see [SP-001](#sp-001-system-prompt-v1--v2) |
| **SP-002** | System prompt mode backfill | Lazy (request) | `ensureAllModeStates` in `system-prompt-config-mongo.ts` | missing `systemPromptConfig.modes[mode]` → `seedModeState(mode)` for each `CONVERSATION_MODE_IDS` entry | Keep while new modes ship; audit when mode list stabilizes |
| **SP-003** | Retired conversation-mode state cleanup | Lazy (request) | `stripRetiredModeStates` in `system-prompt-config-mongo.ts` | `systemPromptConfig.modes['scenario-generation']` (and future `RETIRED_CONVERSATION_MODE_IDS`) → removed | Keep while any retired mode key may exist on old course documents |
| **CM-001** | Chat `conversationMode` backfill | Lazy (restore) | `ChatApp.ensureLegacyChatModePersisted` in `src/chat/chat-app.ts` | missing/invalid → `socratic` or `undeclared` | Optional later; audit before removal |
| **OB-001** | Student onboarding flag backfill | CLI op A | `migrateOnboardingFlags` in `src/helpers/migrate-onboarding-flags.ts` (called from `src/migrate/mongo-attribute-check.ts`) | `studentOnboardingCompleted` from CourseUser data | Operational — keep unless product changes. **Amended 2026-08-25**, see [OB-001](#ob-001-student-onboarding-flag-backfill) |
| **OB-002** | Per-user instructor tutorial progress | CLI op A | `migrateInstructorOnboardingStages` in `src/helpers/migrate-instructor-onboarding-stages.ts` (called from `src/migrate/mongo-attribute-check.ts` after OB-001) | `GlobalUser.instructorOnboardingCompleted` → `GlobalUser.instructorOnboarding` | Operational — keep while any user may predate the field; see [OB-002](#ob-002-per-user-instructor-tutorial-progress) |
| **AP-001** | Course `academicPeriodId` backfill | Lazy (request) | `lazyMigrateCourseAcademicPeriod` in `src/db/mongo/academic-period-mongo.ts` via `getActiveCourse` / `getAllActiveCourses` | missing `academicPeriodId` → default `2025W2` period; `$addToSet` on period `courseIds` | **Remove by 2026-06-30** — see [AP-001](#ap-001-academic-period-lazy-link) |
| **IPA-001** | Instructor allow-list period scope | CLI op A | `migrateInstructorAllowances` in `src/helpers/migrate-instructor-allowances.ts` | `instructor-allowed-courses` → `instructor-period-allowances` for `2025W2` | Operational after first successful run |
| **MIG-A** | Mongo attributeCheck | CLI | `runMongoAttributeCheck` in `src/migrate/mongo-attribute-check.ts` | allowlist walk all known collections; hoist `additionalMaterials.file`; seed `qdrantChunkIds` | Keep |
| **MIG-B** | Qdrant attributeCheck | CLI | `runQdrantAttributeCheck` in `src/migrate/qdrant-ops.ts` | strip extra payload keys including `learningObjectives` | Keep |
| **MIG-C** | Resolve Qdrant to Mongo | CLI | `runQdrantResolveToMongo` | register point UUIDs onto `qdrantChunkIds` | Keep |
| **MIG-D** | Validate Qdrant from Mongo | CLI | `runQdrantValidateFromMongo` | Mongo wins metadata; delete orphan points | Keep |
| **ADM-001** | Platform admin `isAdmin` backfill | Startup | `migratePlatformAdmins` in `src/helpers/migrate-platform-admins.ts` | GlobalUsers matching `CHARISMA_RUSDIYANTO_PUID` / `RICHARD_TAPE_PUID` → `isAdmin: true` | Operational — keep unless product changes |
| **GPF-001** | Guided Pathway alert course isolation | Superseded | Historical implementation in `guided-pathway-flag-collection-mongo.ts` | shared `guided-pathway-flags` rows → hashed per-course collections | Superseded by GPF-002; hash recognition remains migration-only |
| **GPF-002** | Guided Pathway registered collection normalization | Startup + operation gate | `migrateGuidedPathwayFlagsToCourseCollections` in `src/db/mongo/guided-pathway-flag-collection-mongo.ts` | shared and hashed rows → readable `activeCourse.collections.guidedPathwayFlags` targets; lease/result → `application-migrations` | Operational — retain until every environment passes the GPF-002 postchecks and retained legacy data is resolved |
| **SQ-001** | Scenario Questions collection backfill | Lazy (first API call) | `ensureScenarioQuestionsCollection` in `src/db/mongo/scenario-questions-mongo.ts` | missing `activeCourse.collections.scenarioQuestions` → creates `{courseName}_scenario_questions` + `$set` the field | Keep while any pre-feature course document may lack `collections.scenarioQuestions` |
| **SQ-004** | Scenario Progress collection backfill | Lazy (first progress API call) | `ensureScenarioProgressCollection` in `src/db/mongo/scenario-progress-mongo.ts` | missing `activeCourse.collections.scenarioProgress` → creates `{courseName}_scenario_progress` + `$set` the field | Keep while any course may lack `collections.scenarioProgress` |
| **GP-001** | Remove legacy off-topic pathway | Lazy (pathways ensure/list/seed) | `healRemoveOffTopicPathway` in `src/db/mongo/pathways-mongo.ts` | `{courseName}_pathways` docs with `id: 'off-topic'` → deleted | Keep while legacy courses may still hold the seed; audit then remove |

---

## GPF-001: Guided Pathway alert course isolation

**Status:** Superseded by GPF-002

GPF-001 moved the original global `guided-pathway-flags` rows into
`guided-pathway-flags-course-<hash>` namespaces. It also made the hash authoritative
instead of reading `activeCourse.collections.guidedPathwayFlags`. Some environments may
already contain those namespaces, so GPF-002 still recognizes them as migration sources.
GPF-001 must not run independently again.

---

## GPF-002: Guided Pathway registered collection normalization

**Status:** Active (startup migration with operation-level gate)

**Collections:** legacy `guided-pathway-flags`, legacy `guided-pathway-flags-course-<hash>`, `active-course-list`, durable migration state in `application-migrations`, and readable registered course targets such as `{courseName}_guided-pathway-flags`

### Behavior

1. Create/verify a partial unique index on the non-empty string `activeCourse.collections.guidedPathwayFlags` field. This is the cross-process catalog guard that prevents two active courses from owning the same automatic-alert namespace.
2. Treat a valid non-hash registered value as authoritative. When the field is missing or still points at a GPF-001 hash, choose `{courseName}_guided-pathway-flags` and persist it only after source rows are copied and verified. A later course rename does not recompute the stored name.
3. Preflight every target. Reject protected names, collisions with another registered course collection, duplicate Guided Pathway registrations, and a physical target containing any row whose `courseId` differs from the target course. The checks and logs use counts/identity metadata only and never emit alert content.
4. Copy matching rows from the course's GPF-001 hash namespace first, then the older shared collection, in 200-row `_id` batches. Each destination operation is an upsert with `$setOnInsert`, so the per-course source wins a duplicate legacy `_id` while an existing readable-target document remains authoritative. Verify every destination `_id` with its owning `courseId` before switching the catalog field.
5. Compare-and-set `collections.guidedPathwayFlags`, invalidate the course collection-name cache only after success, and then verify that the catalog still owns the target. Re-verify exact source `_id` batches before deleting them. Drop only namespaces that are empty; a missing namespace is an idempotent cleanup result.
6. Retain malformed global rows and non-empty hash namespaces without an active catalog owner for manual recovery. Never guess ownership or attach orphan data to a current course.
7. Do not register or create storage for an untouched existing course with no registration, no shared/hash source, and no pre-existing readable namespace. Alert creation uses the provisioning resolver when storage is first needed. Course/admin list, count, backup, and cross-course aggregation use read-only resolution and include only existing registered collections.

Startup invokes GPF-002 after academic-period initialization. Guided Pathway operations also await the migration gate. The exported method retains its historical name for façade compatibility.

### Cross-process coordination

GPF-002 stores one record at `application-migrations._id = 'GPF-002'`:

- The owner acquires `state: 'running'` with a random `ownerId` and a renewable five-minute `leaseUntil`.
- Other application instances poll the durable record. A failed record, an expired lease, or a running record with no lease can be claimed for retry.
- The owner renews the lease between bounded migration/copy/cleanup phases. Losing the lease fails the attempt before it can report completion.
- Success persists `state: 'complete'`, the count-only result, and `completedAt`, then removes owner/lease fields. Later processes and restarts return that persisted result without rerunning data movement.
- Failure marks the record `failed` and removes the lease so a later operation can retry. A process-local promise coalesces callers only within one application instance and is discarded on failure.

### Idempotency and failure safety

Destination writes are insert-only upserts by Mongo `_id`; retrying after a partial copy does not duplicate an alert and does not overwrite a newer target decision, admin review, or reveal-audit history with a stale legacy snapshot. A source row is never deleted before target verification, compare-and-set catalog registration, and a second ownership check. Per-course unique alert-id and deduplication indexes remain the runtime guards.

GPF-001 application instances ignore the registered field and can continue writing hashes. Because a completed GPF-002 record makes later runs a no-op, any old process writing after completion would strand new rows in a migration-only source. Run GPF-002 only after old instances stop accepting chat traffic; a rolling mixed-version migration is unsupported.

### Deployment preconditions

1. Take and validate a recoverable full database backup.
2. Stop every pre-GPF-002 application instance from accepting chat/write traffic before a new instance starts the migration.
3. Ensure the deployment identity can read/write `application-migrations`, create the catalog and per-course indexes, create target collections, update `active-course-list`, and delete/drop only verified legacy sources.
4. Do not manually mark the migration complete. If startup fails, inspect the count-only migration error/result and retry the same build after correcting the cause.

### Verification (Mongo shell)

```js
db.getCollection('guided-pathway-flags').countDocuments({
  courseId: { $type: 'string' }
})

db.getCollection('active-course-list').countDocuments({
  'collections.guidedPathwayFlags': /^guided-pathway-flags-course-[a-f0-9]{24}$/
})

db.getCollection('active-course-list').aggregate([
  { $match: { 'collections.guidedPathwayFlags': { $type: 'string' } } },
  { $group: { _id: '$collections.guidedPathwayFlags', owners: { $addToSet: '$id' }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
])

db.getCollection('application-migrations').findOne(
  { _id: 'GPF-002' },
  { _id: 1, state: 1, completedAt: 1, result: 1 }
)

db.getCollection('active-course-list').getIndexes().filter(
  ({ name }) => name === 'guided_pathway_flag_collection_unique'
)
```

The first two counts and the duplicate-registration aggregation should be empty/zero for migratable active-course data. The migration record must be `state: 'complete'`, and the named partial unique catalog index must exist. Review the count-only `result.retainedLegacyRows`, `result.retainedHashedCollections`, and `result.orphanCourseCollections` values. Non-empty global or hash sources require manual ownership review; do not delete them merely to satisfy the count.

For every active course with a non-empty registration, also verify operationally that the named collection exists and contains no row with a different `courseId`. Perform that check with counts/projections only; do not print messages, user identifiers, deduplication keys, or reveal events.

### Rollback

Rollback requires restoring the pre-deployment database backup together with the pre-GPF-002 application build. Redeploying the old build alone is unsafe because new writes use readable registered targets and verified legacy rows may already have been removed. If an attempt fails before completion, prefer correcting the cause and retrying the same GPF-002 build; do not edit the lease/result record or move rows manually without a separate recovery plan.

### Sunset criteria

Keep the operation gate, shared/hash source discovery, and durable migration record handling until every deployed environment has:

- a `complete` GPF-002 record from the current migration implementation;
- zero migratable active-course rows in the shared source and zero hash registrations;
- no duplicate/unsafe registered namespaces and the partial unique registry index present;
- reviewed and resolved every retained malformed/orphan source; and
- passed an agreed rollback-support window with no pre-GPF-002 application version eligible for redeployment.

After those conditions are documented, a separate change may remove global/hash discovery and the operation-level migration gate. Keep registry-authoritative resolution, the unique catalog index, and read-only versus provisioning resolution after migration code is retired.

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

## OB-001: Student onboarding flag backfill

**Status:** Active (CLI op A, promote-only)

**Collection:** `active-users`

Sets `studentOnboardingCompleted: true` for any user with a `CourseUser.userOnboarding === true`
across their enrolled courses. Idempotent. Trigger: `npm run migrate` op A (`--apply`), not server start.

See `migrateOnboardingFlags` in `src/helpers/migrate-onboarding-flags.ts`.

### Amendment — 2026-08-25 (with OB-002)

The **instructor branch was removed**. It derived `instructorOnboardingCompleted` from
`activeCourse.monitorSetup`, which is no longer maintained now that instructor tutorial
progress lives on the user record. Left in place, that derivation would evaluate `false`
for everyone and — because the original implementation wrote both flags explicitly on every
restart — would have wiped `instructorOnboardingCompleted` for every instructor on the next
server start, destroying the signal OB-002 seeds from.

The migration is now **promote-only**: it never writes `false` over an existing value, and
skips users already marked complete. `instructorOnboardingCompleted` is set forward only, by
`PATCH /api/user/onboarding/instructor-completed`.

---

## OB-002: Per-user instructor tutorial progress

**Status:** Active (CLI op A, idempotent)

**Collection:** `active-users`

### Why

Instructor onboarding progress used to live on the course document. When one instructor
finished, every other instructor on that course was routed straight to the dashboard — so an
instructor new to EngE-AI could never reach the tutorials. The three tutorial stages moved to
the user; `courseSetup` stayed on the course because it writes real configuration a second
instructor must not override.

### Behavior

For each `GlobalUser` with no `instructorOnboarding` field:

```
seed = (affiliation === 'faculty' || affiliation === 'staff')
       && instructorOnboardingCompleted === true
$set instructorOnboarding = { contentSetup: seed, flagSetup: seed, monitorSetup: seed }
```

Among instructor-side users, `instructorOnboardingCompleted` is the only per-user record of
whether someone has been through instructor onboarding, which makes it the right seed:
veterans keep skipping, and everyone else — including an instructor sitting on a course a
colleague set up — is taught.

**Students always seed incomplete**, whatever that flag says, and `createGlobalUser` starts
every new user with all three stages `false`. Two reasons:

1. The flag is not trustworthy on students. Earlier versions of OB-001 and of the roster role
   endpoint set it on students who had never seen an instructor tutorial.
2. More importantly, a student escalated to TA is new to the instructor side. `false` is the
   only correct starting point, or promotion would silently skip the tutorials they need.

For the seed to stay honest among instructors, the flag must mean what it says. Two writers
were removed:
OB-001's instructor branch (see above), and `PATCH /api/courses/:courseId/roster/:userId/role`,
which set it on TA promotion to suppress the old skip prompt. Promotion completes no tutorial,
and a newly promoted TA is precisely who the instructor tutorials are for — left in place, that
write would have made a TA's behaviour depend on whether the server had restarted since their
promotion. It is now set in one place only: completing monitor setup, via
`PATCH /api/user/onboarding/instructor-completed`.

### Pre / post conditions

| | Condition |
|---|-----------|
| **Pre** | `GlobalUser` may have no `instructorOnboarding` field |
| **Post** | Every `GlobalUser` has `instructorOnboarding` with all three stages set; every student has all three `false` |

### Idempotency and rollback

Only users missing the field are queried, and the update filter repeats the
`{ $exists: false }` guard, so a rerun cannot overwrite progress made since the first run.

Rollback is a code revert: the field is additive and ignored by the previous version, and
`activeCourse.contentSetup` / `flagSetup` / `monitorSetup` are left in place (deprecated, not
`$unset`) so the old behavior returns without data loss.

### Verification

```js
// Expect 0 once the migration has run.
db.getCollection('active-users').countDocuments({ instructorOnboarding: { $exists: false } })

// Expect 0 — no student may start with instructor tutorials marked complete.
db.getCollection('active-users').countDocuments({
  affiliation: 'student',
  'instructorOnboarding.monitorSetup': true
})

// Spot-check that instructor-side veterans were seeded complete.
db.getCollection('active-users').find(
  { affiliation: { $in: ['faculty', 'staff'] }, instructorOnboardingCompleted: true },
  { userId: 1, instructorOnboarding: 1, _id: 0 }
)
```

### Repairing an environment migrated before the student rule landed

An early run of OB-002 seeded students from `instructorOnboardingCompleted` and so marked some
of them complete. The `$exists` guard means a rerun will not correct them. Reset those rows once,
by hand:

```js
db.getCollection('active-users').updateMany(
  { affiliation: 'student' },
  { $set: {
      'instructorOnboarding.contentSetup': false,
      'instructorOnboarding.flagSetup': false,
      'instructorOnboarding.monitorSetup': false,
      updatedAt: new Date()
  } }
)
```

This is deliberately **not** folded into the migration: run on every apply it would also
reset a student TA who had since completed the tutorials, teaching them again forever.

### Post-sunset checklist (when every user is known migrated)

1. Remove `migrateInstructorOnboardingStages` and its `mongo-attribute-check.ts` call.
2. `$unset` the deprecated `contentSetup` / `flagSetup` / `monitorSetup` fields from
   `active-course-list`, and drop them from `activeCourse` in `src/types/shared.ts` and
   `public/scripts/types.ts`.
3. Drop the corresponding strip from `PUT /api/courses/:id`.

---

## GP-001: Remove legacy off-topic pathway

**Status:** Active (lazy heal)

**Collection:** `{courseName}_pathways`

### Behavior

On pathways ensure / list / seed, `healRemoveOffTopicPathway` runs `deleteMany({ id: 'off-topic' })`. Idempotent. Does not delete instructor-created pathways with other ids. Off-topic / LO scope is handled by the teaching system prompt (`course main intro`), not a pathway intercept.

Platform seeds no longer include `off-topic`. Library Reset re-seeds mental-health + inappropriate + evaluation-prompt singleton only.

**Removal:** After an audit shows no course pathways collections still contain `id: 'off-topic'`.

---

## MIG CLI (`npm run migrate`)

Operator how-to (persist shape, `--check` vs `--apply`, pipeline A → B → C → D): [`src/migrate/README.md`](../src/migrate/README.md).

---

## References

- Mongo layer: [MONGO_DATA_LAYER.md](MONGO_DATA_LAYER.md)
- System prompt API: [ENDPOINT_ARCHITECTURE.md](ENDPOINT_ARCHITECTURE.md)
- Platform defaults: [SYSTEM_PROMPT_DEFAULTS.md](SYSTEM_PROMPT_DEFAULTS.md)
- Cursor rule: `.cursor/rules/software-architect/01-migration-analyst.mdc`
