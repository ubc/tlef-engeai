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
| **CM-001** | Chat `conversationMode` backfill | Lazy (restore) | `ChatApp.ensureLegacyChatModePersisted` in `src/chat/chat-app.ts` | missing/invalid → `socratic` or `undeclared` | Optional later; audit before removal |
| **OB-001** | Onboarding flags backfill | Startup | `migrateOnboardingFlags` in `src/helpers/migrate-onboarding-flags.ts` | GlobalUser flags from course/CourseUser data | Operational — keep unless product changes |

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
- Cursor rule: `.cursor/rules/migration-analyst.mdc`
