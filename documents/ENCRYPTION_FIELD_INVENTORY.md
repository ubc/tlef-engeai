# Encryption field inventory — EngE-AI

Status: **phase 1 approved and implemented in code (2026-10-30); not yet deployed or migrated.**
Decisions are recorded at the end of this report. Document shapes were inferred from code only
(types, delegates, schemas); no application database was read.

Toolkit references used: `../encryption-toolkit` checkout, `@ubc/genai-toolkit-encryption@0.1.1`
(`README.md`, `docs/configuration.md`, `docs/supported-operations.md`, `docs/threat-model.md`).
The package is not yet installed in this repository. No disagreements found between the guide
and those files.

---

## Headline: the main blocker is collection naming, not query compatibility

Most student content lives in **per-course collections whose names are built at runtime**:

| Name pattern | Contents | Source |
| --- | --- | --- |
| `{courseName}_users` | course roster rows **with every chat transcript embedded** (`chats[].messages[]`) | `src/db/mongo/collection-registry-mongo.ts:84`, `course-mongo.ts:85` |
| `{courseName}_flags` | student-reported flags incl. `chatContent` | `collection-registry-mongo.ts:85` |
| `{courseName}_memory-agent` | per-student struggle-topic labels | `collection-registry-mongo.ts:86` |
| `{courseName}_scenario_questions` | scenario questions with embedded student answers + AI feedback | `collection-registry-mongo.ts:88` |
| `{courseName}_scenario_progress` | student draft answers | `collection-registry-mongo.ts:89` |
| guided-pathway flag collection per course | triggering student message text | `guidedPathwayFlagCollectionNameForCourse` |
| `{courseName}_scheduled_tasks`, `{courseName}_pathways` | operational / instructor content | — |

The toolkit's `collections` map takes **exact names, with no wildcard or prefix/suffix
matching** (`docs/configuration.md`, "Explicit map. No wildcards."). The config module is
loaded synchronously by `require` in the CLI, so it cannot discover course names from the
`active-course-list` collection. A course created at runtime would be **silently unprotected**
until someone edits the config and redeploys.

Options (decision needed — see the end of this report):

1. **Phase the rollout (recommended).** Protect the fixed-name collections first (Writing
   Feedback, LMS OAuth tokens, `active-users`), which also hold the most sensitive data. Defer
   the per-course collections.
2. **Ask for a toolkit feature**: collection-name patterns (for example a suffix rule matching
   `*_users`), with an explicit fail-closed rule for names that match no entry. The toolkit lives
   in `../encryption-toolkit`, so this is an upstream change, not something to work around here.
3. **Consolidate per-course collections** into shared collections keyed by `courseId`. This is a
   large data migration and touches most of `src/db/mongo/`.
4. **Generate the collection map at deploy time** from a committed course list. This is fragile:
   courses created between deploys are unprotected, and the guide forbids silent fallbacks.

Even if naming were solved, chat storage has hard query conflicts (positional and
`arrayFilters` updates on `chats[].messages[]`, `$unwind`/`$facet` pipelines). See conflicts
C1–C6.

---

## Fit check

| Check | Result | Evidence |
| --- | --- | --- |
| Official `mongodb` driver 6.x | **Pass** | `package.json:62` `^6.3.0`; lockfile resolves `6.21.0`; toolkit peer is `mongodb@^6.0.0` |
| Node.js ≥ 18 | **Pass (local only)** | No `engines`, `.nvmrc`, or Dockerfile in repo; local `node -v` = v24.1.0. **Confirm the staging/production Node version.** |
| No ODM owns writes | **Pass** | No `mongoose`, `@prisma/client`, `typeorm`, `typegoose` in `package.json` |
| Module system | CommonJS (`"type": "commonjs"`, `package.json:39`); a `.cjs` config fits directly | — |
| Package installation | **Needs your input** | Scoped `@ubc/…` package. If it comes from a private registry, the `.npmrc` scope entry and token are yours to set up; I won't read or edit `.npmrc`. A tarball or `file:../encryption-toolkit` dependency are alternatives. |

## Wrap point

- **File / function:** `src/db/enge-ai-mongodb.ts:142`, `EngEAI_MongoDB.getInstance()` —
  `instance.db = instance.client.db(process.env.MONGO_DB_NAME)`.
- `db` is a **public field** typed `Db` (`enge-ai-mongodb.ts:107`). It reaches domain
  modules through `ctx()` → `MongoDalContext.db` (`src/db/mongo/mongo-context.ts:38`, typed
  `readonly db: Db`), so every `src/db/mongo/*-mongo.ts` delegate receives it.
- `testConnection` calls `this.db.admin().ping()` (`enge-ai-mongodb.ts:173`). `admin()` is not
  on the protected `Db`, but `command({ ping: 1 })` is allowed.
- **Type impact:** `MongoDalContext.db: Db` and all `mongo-collections.ts` helpers return
  `Collection`. These need to become the protected `Db` type and
  `ProtectedCollection<T> | Collection<T>` (or `protectedCollection(name)` for configured ones).

## Other paths to MongoDB

All go through the singleton's client, but several bypass the `ctx()` façade by reading
`.db` directly. Each must receive the protected handle, or stay raw **only** for collections
that will never be configured.

| file:line | What it does | Proposed handling |
| --- | --- | --- |
| `src/lms/canvas-config.ts:133` | `mongoDbProvider` hands the raw `.db` to the LMS toolkit's `createMongoTokenStore` (Canvas **and** Moodle, `route-lms.ts:77`) | Pass the protected `Db` if the token collections are configured. The store only calls `collection`, `createIndex({userKey:1})`, `findOne`, `updateOne($set tokens, upsert)`, `deleteOne`, which are all supported. |
| `src/routes/route-mongo.ts:432, 448, 514, 527, 4188, 4194, 4287` | Route handlers read `mongoDB.db.collection(...)` directly (incl. `{course}_users`, `active-users`) | Move into `src/db/mongo/` delegates (also an AGENTS.md rule), or route through the protected `Db` |
| `src/routes/route-user-management.ts:108` | ``mongoDB.db.collection(`${courseName}_users`)`` in a route | Same |
| `src/routes/route-health.ts:20` | `instance['db'].admin().ping()` | `command({ ping: 1 })` on the protected `Db` |
| `src/routes/route-mongo.ts:1275–1288, 1380`; `course-mongo.ts:364–366` | `dropCollection` on course deletion | Keep a narrow raw `Db` for admin-only drops (never reads documents) |
| `course-mongo.ts:112`, `scenario-questions-mongo.ts:133`, `scenario-progress-mongo.ts:69`, `pathways-mongo.ts:337`, `guided-pathway-flag-collection-mongo.ts:215` | `createCollection` lazy provisioning | Same narrow raw `Db` |
| `src/migrate/mongo-attribute-check.ts:64, 280`; `guided-pathway-flag-collection-mongo.ts:192` | `listCollections` | Supported on the protected `Db` |
| `src/migrate/cli.ts:81` | Migration CLI receives `mongo.db` | Must use the protected `Db` for any configured collection |
| `src/helpers/migrate-onboarding-flags.ts:34`, `migrate-instructor-onboarding-stages.ts:45`, `migrate-instructor-allowances.ts:21` | Startup/lazy migrations on `active-users` via raw `.db` | Route through the protected `Db` if `active-users` is configured |

No second `MongoClient`, GridFS, or change streams (`.watch(`) were found in `src/` or
`scripts/`.

## Side doors (not fixed by this integration)

| Where | What flows there |
| --- | --- |
| **LLM provider** (`LLM_PROVIDER/ENDPOINT`) | Every chat message, Writing Feedback verified text, scenario answers. Inherent to the product. |
| **Session store** | `express-session` with the default **in-memory** store (`src/middleware/session.ts`). Nothing persisted to Mongo. |
| **Qdrant** | Course materials only. Payload allowlist in `src/migrate/schemas.ts` (`QDRANT_PAYLOAD_ALLOWLIST`). No chat or Writing Feedback writers found in `src/chat`, `src/writing-feedback`, `src/memory-agent` (consistent with the AGENTS.md invariant). |
| **Exports** | Conversation ZIP export (`conversation-export-mongo.ts`, `$unwind` over `{course}_users`), course backup (`course-backup-mongo.ts`), report PDFs (`src/report-generation/`). These produce plaintext files by design. |
| **Logs** | `appLogger` writes to stdout. Request bodies logged at `route-rag.ts:298, 372` (instructor document upload) and `route-mongo.ts:1750` (learning-objective create). These are instructor content, not student content. `route-chat-app.ts:338` logs the first 100 chars of the *assistant welcome* message. No student-message logging found, but this was a pattern search, not exhaustive. |
| **Logs: PUIDs** | PUIDs are logged in plaintext, against the AGENTS.md rule, for example `route-chat-app.ts:131, 165, 208, 245, 299, 366`, `middleware/require-course-role.ts:99, 160, 228, 290, 348`, `route-course-entry.ts:80, 269`, `course-user-mongo.ts:217–225`. Encryption at rest does not cover log files. Not changed here. |
| **LMS token store** | Canvas/Moodle OAuth tokens stored **in plaintext** by `@ubc/ubc-genai-toolkit-lms-integration` (`dist/adapters/mongo-token-store.js` has no encryption). This is a side door that this toolkit *can* close; see `canvas_tokens` below. |

---

## Collections

Fixed-name collections are fully inventoried. Per-course collections are inventoried for
shape and recommendation. Their conflict audit covers the main delegates, but it should be
re-run once the naming decision is made.

### `writing-submissions` (fixed name; Writing Feedback — in production)

Source of shape: `src/writing-feedback/contracts/assignment.ts:339`,
`review-release.ts:46` (`StaffReviewRevision`), `writing-feedback-mongo.ts:56`
(`reviews?: StaffReviewRevision[]` embedded on the submission).

| Path | BSON type | Category | Recommendation | Blind index | Reason |
| --- | --- | --- | --- | --- | --- |
| `originalText` | string | Extracted/uploaded document text | **Encrypt** | no | Student's submitted writing; may be large, so benchmark it |
| `verifiedText` | string | Extracted/uploaded document text | **Encrypt** | no | Same text after staff verification; never filtered on |
| `studentLabel` | string | Direct identifier | **Encrypt** | no | Student's real name (staff label); no equality lookups found |
| `reviews.$[].studentFeedback` | string | AI/staff output about student work | **Encrypt** | no | Generated/approved feedback |
| `reviews.$[].internalNote` | string | Sensitive attribute | **Encrypt** | no | Staff-only comments about the student's work |
| `reviews.$[].comments` | array (subtree) | AI/staff output | **Encrypt** (whole array) | no | Anchored comments quote student text; never queried |
| `reviews.$[].summaryEdits` | array (subtree) | AI/staff output | **Encrypt** | no | Edited feedback narrative |
| `reviews.$[].finalAssessment`, `reviews.$[].assessmentDraft` | subdoc | Scores/grades | **Encrypt** (decided 2026-11-05) | no | Never queried, sorted, ranged, or indexed in Mongo; `totalPoints` also flows to `writing-releases.grade`, encrypted with it |
| `canvasUserId` | string | Provider-scoped id | Do not encrypt | — | Join key for Canvas write-back; documented as non-institutional |
| `id`, `courseId`, `assignmentId`, `studentId`, `attempt`, `status`, `slot`, dates, `approvedBy` | — | Keys / enums / metadata | Do not encrypt | — | Used in filters, unique index, sorts |
| `approvedByName` | string | Staff identifier | Do not encrypt (low priority) | — | Staff name, not student data |

### `writing-feedback-runs` (fixed name)

Source of shape: `src/writing-feedback/contracts/feedback.ts:204`.

| Path | BSON type | Category | Recommendation | Blind index | Reason |
| --- | --- | --- | --- | --- | --- |
| `result` | subdoc | AI output from student content | **Encrypt** | no | Model draft feedback with evidence quotes from the submission |
| `sflAnalysis` | subdoc | AI output | **Encrypt** | no | Evidence spans quote student text |
| `textDiagnosis` | subdoc | AI output | **Encrypt** | no | Staff-only diagnosis of the student's text |
| `sourceComments` | array | AI/staff output | **Encrypt** | no | Documented as "student-derived text: staff-only" |
| `courseMaterialExcerpts`, `contrastExcerpts`, `courseMaterialMentions`, `staffCourseMaterialMentions` | arrays | Course material | Do not encrypt | — | Instructor content, not student data |
| `id`, `submissionId`, `courseId`, `assignmentId`, `lens`, `rubricVersion`, `createdAt`, versions, `flags` | — | Keys / metadata | Do not encrypt | — | Used by `$group`/sort |

### `canvas_tokens` and `moodle_tokens` (fixed names, env-overridable)

Source of shape: `node_modules/@ubc/ubc-genai-toolkit-lms-integration/dist/adapters/mongo-token-store.js:43–52`.
Names come from `CANVAS_TOKEN_COLLECTION_NAME` / `MOODLE_TOKEN_COLLECTION_NAME` (`canvas-config.ts:145`, `route-lms.ts:78`). **The config must use whatever value is deployed.**

| Path | BSON type | Category | Recommendation | Blind index | Reason |
| --- | --- | --- | --- | --- | --- |
| `tokens.accessToken`, `tokens.refreshToken` (Canvas); `tokens.token` (Moodle) | string | Secret the app does **not** already encrypt | **Encrypt** | no | OAuth tokens act on Canvas/Moodle with the instructor's authority. Leaf paths rather than the whole `tokens` object, because optional siblings such as `canvasUserId` can be `undefined`, which the toolkit rejects inside an encrypted value. |
| `tokens.expiresAt`, `tokens.canvasUserId`, `tokens.moodleUserId` | — | Metadata / provider id | Do not encrypt | — | Not secrets |
| `userKey` | string | Internal user id | Do not encrypt | — | Lookup key with unique index |

### `active-users` (fixed name)

Source of shape: `src/types/shared.ts:1002` (`GlobalUser`).

| Path | BSON type | Category | Recommendation | Blind index | Reason |
| --- | --- | --- | --- | --- | --- |
| `puid` | string | Direct institutional identifier | **Encrypt** | **yes**, `normalize: 'exact'`, `unique: true` | Looked up by equality on every login (`global-user-mongo.ts:26, 112, 138, 160`); one CWL account per PUID. No unique index exists today, so the operator's `ensure-indexes` step will fail if duplicates exist. |
| `name` | string | Direct identifier | **Not encrypted (decided)** | no | Faculty-name search uses `$regex` (conflict C9) |
| `userId`, `coursesEnrolled`, `affiliation`, `status`, flags, dates, `canvasVerifiedUserId` | — | Keys / enums | Do not encrypt (never blind-index the enums) | — | Filters and `updateMany $pull` |

### `instructor-period-allowances` (fixed name; found during implementation)

Source of shape: `src/db/mongo/instructor-period-allowance-mongo.ts`. One row per instructor per
academic period, keyed by `{ puid, academicPeriodId }`.

| Path | BSON type | Category | Recommendation | Blind index | Reason |
| --- | --- | --- | --- | --- | --- |
| `puid` | string | Direct institutional identifier | **Encrypt** (same decision as `active-users.puid`) | **yes**, `exact`, **not** unique (repeats per period) | Only equality lookups and an upsert keyed on it |

The legacy migration source `instructor-allowed-courses` (`src/helpers/migrate-instructor-allowances.ts`)
also holds PUIDs in plaintext. It is read-only, so it is not configured: PUIDs left there stay
readable after the migration. Before migrating an environment, confirm IPA-001 has copied every row
into `instructor-period-allowances`, then drop it (operator checklist step 2).

### `writing-releases`, `writing-jobs`, `writing-assignments`, `writing-glossary-entries`, `writing-source-materials`, `canvas-connections`

No student-authored content found (`review-release.ts:102, 155`; `canvas.ts:121`;
`feedback.ts:158`; `migrate/schemas.ts:535`). Assignments, glossary, and source materials are
instructor/course content. `writing-releases.grade` mirrors the staff grade and is **encrypted**
with it; `payloadFingerprint` (the unique idempotency key) is a separate hash and stays plaintext.
The other collections here are not configured.

### Per-course collections (blocked on the naming decision)

| Collection | Path | Category | Recommendation | Reason |
| --- | --- | --- | --- | --- |
| `{course}_users` | `chats.$[].messages.$[].text` | User-authored free text + AI output | **Encrypt** | Student prompts and model responses (`shared.ts:126`) |
| `{course}_users` | `chats.$[].itemTitle` | AI output (conversation title) | **Encrypt** | Auto-titled from the first exchange |
| `{course}_users` | `name` | Direct identifier | Encrypt (no blind index) | Student's name; check monitor/roster code for queries |
| `{course}_flags` | `chatContent` | User-authored text | **Encrypt** | Flagged chat excerpt |
| `{course}_flags` | `reportType`, `response` | Free text | Encrypt `response`; `reportType` is a category label, so no | Instructor reply to a student report |
| GP flags (per course) | `messageText` | User-authored text | **Encrypt** | Exact triggering student message |
| `{course}_memory-agent` | `struggleTopics` | Sensitive attribute (inferred difficulty) | **Human decision** | Labels come from an instructor catalog, but per-student they reveal inferred struggles |
| `{course}_memory-agent` | `name` | Direct identifier | Encrypt | Name mirror |
| `{course}_scenario_questions` | `subQuestions.$[].studentResponses.$[].studentAnswer`, `.feedback` | User text + AI output | **Encrypt** | Exact student answers and AI feedback |
| `{course}_scenario_questions` | `subQuestions.$[].studentResponses.$[].grade` | Score | **Human decision** | AI exam grade |
| `{course}_scenario_progress` | `answers.$[].studentAnswer` | User-authored text | **Encrypt** | Draft answers |

---

## Query conflicts

C1–C10 are confirmed against current code. Conflicts on per-course collections apply only if
those collections are configured.

| # | file:line | Collection.path | Operation | Why it breaks | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| C1 | `src/db/mongo/writing-feedback-mongo.ts:319` | `writing-submissions` | `aggregate([$match, $group])` count per assignment | `$group` rejected on any configured collection | Rewrite: `find({courseId, …}, {projection:{assignmentId:1}})` and count in JS (bounded by course) |
| C2 | `writing-feedback-mongo.ts:1205` | `writing-feedback-runs` | `aggregate` with `$group`, `$lookup` → `writing-submissions`, `$unwind`, `$count` | Unsupported stages; `$lookup` into a configured collection would also return envelopes | Rewrite: find runs (projection: `submissionId, rubricVersion, createdAt`), reduce in JS, then `find` submissions by `id: {$in}` with status projection |
| C3 | `writing-feedback-mongo.ts:1670` | `writing-feedback-runs` | `aggregate` with `$group` | Unsupported stage | Same as C2 (projected `find` sorted by `createdAt`, reduce in JS) |
| C4 | `src/db/mongo/chat-mongo.ts:346–351` | `{course}_users`.`chats.$[].messages.$[].text` | `updateOne` with `arrayFilters` (edit message) | `arrayFilters` rejected on configured collection | Read-modify-write of the chat element with a concurrency guard (for example a per-chat version field) |
| C5 | `chat-mongo.ts:218` | same | `$push: {'chats.$.messages': message}` | Positional path reaching an encrypted path | Read-modify-write, **or** restructure chats into their own collection (one doc per chat; `$push` on `messages` becomes non-positional and supported) |
| C6 | `chat-mongo.ts:178` | same | `$set: {'chats.$': chat}` | Positional path reaching an encrypted path | Same as C5. (`chats.$.isDeleted` / `conversationMode` at `:259, :387` do not reach encrypted paths. `chats.$.itemTitle` at `:301` would if `itemTitle` is encrypted.) |
| C7 | `src/db/mongo/course-user-mongo.ts:77` (pipeline at `:24–45`) | `{course}_users` | `$facet` / `$unwind` / `$expr` engagement summary | Unsupported stages and `$expr` | Projected `find` + count in JS, or keep a counter field |
| C8 | `src/db/mongo/conversation-export-mongo.ts:116` (pipeline `:53–60`) | `{course}_users` | `$unwind`, `$addFields`, `$expr` export | Unsupported | `find` students, flatten chats in JS (export is staff-gated and already batch) |
| C9 | `src/db/mongo/global-user-mongo.ts:330` | `active-users.name` | `$regex` case-insensitive faculty search | `$regex` on an encrypted field | Do not encrypt `name` in `active-users`, **or** filter `affiliation:'faculty'` and match in memory (faculty set is small), **or** accept losing search |
| C10 | `src/db/mongo/report-fixture-seed-mongo.ts:147–149` | `active-users.puid` | `$regex` prefix on `puid` + `updateMany` | `$regex` on an encrypted field | **Fixed:** the seeder selects the course's enrolled students, matches the prefix after decryption, and deletes by `userId` |
| C11 | `src/db/mongo/scenario-questions-mongo.ts:738` | `{course}_scenario_questions`.`…studentResponses.$[].studentAnswer` | `$push: {'subQuestions.$.studentResponses': …}` | Positional path reaching an encrypted path | Read-modify-write, or move responses to their own collection |
| C12 | `scenario-questions-mongo.ts:708` | `{course}_scenario_questions` | `aggregate` with `$project: {$bsonSize}` | Non-plain `$project` | Measure size in JS after `findOne` (ciphertext size differs anyway) |
| C13 | `src/db/mongo/guided-pathway-flag-mongo.ts:484, 726` (pipelines `:292–353`) | GP flag collections | `$unionWith` across per-course collections + `$facet`/`$group`/`$count` | Unsupported stages. If the first collection were unconfigured, unioned docs would return **raw envelopes** | Query each course collection with `find` and merge/paginate in JS, or consolidate GP flags into one collection |
| C14 | `src/db/mongo/topic-week-mongo.ts` (arrayFilters at `:79, :141, …`) | `active-course-list` | `arrayFilters` | Only a conflict if `active-course-list` is configured, which is **not recommended** | None needed |

Not caught by the toolkit and worth knowing: the C2 `$lookup` and C13 `$unionWith` are exactly
the "join into a configured collection" pattern the guide warns can leak envelopes silently.
Both should be rewritten whichever way the naming decision goes.

**Startup indexes:** no existing `createIndex` targets a recommended encrypted path
(`writing-feedback-mongo.ts:196–221`, `flag-mongo.ts:420–435`, scenario index files). The
token store's `createIndex({userKey:1})` is on a plaintext field.

---

## Phase 1 as implemented

- **Configured collections (7):** `writing-submissions`, `writing-feedback-runs`, `writing-releases`,
  `active-users`, `instructor-period-allowances`, `canvas_tokens`, `moodle_tokens` (token names
  follow `CANVAS_TOKEN_COLLECTION_NAME` / `MOODLE_TOKEN_COLLECTION_NAME`).
- **Encrypted fields (19):** 9 on submissions (including the two review grade subtrees), 4 on runs,
  1 release grade, 2 PUIDs, 3 OAuth token leaves.
- **Blind indexes (2):** `active-users.puid__bidx` (unique), `instructor-period-allowances.puid__bidx`.
  The admin directory's `$or` of name substring, PUID, and `userId` is supported with `puid` encrypted
  (integration test).
- **Conflicts resolved:** C1 (`countWritingSubmissionsByAssignment`), C2 (`countFeedbackStaleOnApproval`),
  C3 (`listLatestWritingRunVersions`) as projected `find` + in-code reduction. C10 (fixture seeder)
  selects enrolled students and matches the PUID prefix after decryption. C9 avoided by not
  encrypting `active-users.name`.
- **Found during implementation:** the toolkit rejects `undefined` anywhere inside an encrypted
  value, and submission inserts passed `studentLabel: undefined` / `verifiedText: undefined`.
  `writing-feedback-mongo.ts` now strips `undefined` from encrypted fields before submission and
  run inserts and review pushes. Other fields keep their stored shape.
- **Code:** `encryption.config.cjs`, `src/db/encrypted-db.ts`, wrap in `src/db/enge-ai-mongodb.ts`,
  `.env.example`. Tests: `src/db/__tests__/encrypted-db.integration.test.ts` (opt-in, real MongoDB,
  throwaway keys and database) plus updated unit tests.
- **Deferred:** all per-course collections (C4–C8, C11–C13), including scenario grades and struggle topics; `active-users.name`.

## Decisions (recorded 2026-10-30)

| Decision | Outcome |
| --- | --- |
| Scope | Phase 1: Writing Feedback text/reviews/model output, OAuth tokens. Per-course collections later; the likely route is moving chats (and scenario answers) into shared, `courseId`-keyed collections. |
| Grades, struggle topics, `active-users.name` | Not encrypted for now (2026-10-30). Revised 2026-11-05: Writing Feedback grades (`finalAssessment`, `assessmentDraft`, `writing-releases.grade`) are encrypted in this release. Scenario grades and struggle topics wait for per-course consolidation. Names wait too: every per-course copy would stay plaintext, and partial-name search needs a design. |
| PUID uniqueness | Unique (one CWL account per PUID) |
| PUID encryption (revised 2026-11-02, 2026-11-04) | Deferred on 2026-11-02 until staff had another way to look PUIDs up. The admin user directory shipped (PR #672), so PUIDs are encrypted in the same release as the rest of phase 1. |
| Staff PUID lookup | Mongo Express stops showing PUIDs once they are migrated; the admin user directory (`/admin/users`) replaces it, searching by exact PUID. |
| Namespace | `ubc.engeai`, identical in every environment |
| Key variables | `ENGEAI_DATA_ENCRYPTION_KEY`, `ENGEAI_BLIND_INDEX_KEY`; a distinct pair per environment, generated and stored by the team, never by an agent |
| CLI connection | `database.connect` factory reusing the app's `MONGO_*` variables; no new URI variable |
| Package source | `@ubc/genai-toolkit-encryption@^0.1.1` from the existing registry configuration |

**Still open:** the production Node version (no `engines` field in the repo; the toolkit needs
Node 18 or newer), and a tested Writing Feedback backup before any migration.

## Operator checklist (step 9 — a human runs this, not the agent)

Recorded here for completeness. Config path: `./encryption.config.cjs` (repository root). Keys must be present in the environment
where the CLI runs.

1. Generate two independent 32-byte keys; store them in the deployment secret store.
2. Take and test a backup that does not contain the keys. Check `instructor-allowed-courses`: if it still has rows, confirm each exists in `instructor-period-allowances`, then drop it (it holds plaintext PUIDs and is not configured).
3. Deploy with `readPolicy: 'mixed'`, `queryPolicy: 'mixed'`, `writePolicy: 'encrypted'`; confirm new writes are encrypted.
4. `npx ubc-genai-encryption plan --config <path> --all-configured`
5. `ensure-indexes … --dry-run`, then rerun with `--backup-confirmed`. The unique `active-users.puid__bidx` index is blocked if two users share a PUID; resolve duplicates first.
6. Per collection, smallest/highest-sensitivity first: `migrate --collection <name> --dry-run`, then `--backup-confirmed --verify`.
7. `verify --all-configured`; switch to `readPolicy: 'strict'`, `queryPolicy: 'encrypted'`; redeploy.
8. Decide the rollback path (stay `mixed`, guarded `decrypt`, or restore backup) **before** migrating.
