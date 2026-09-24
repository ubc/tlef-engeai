# Flag domain

`src/flags` is the discoverable policy and orchestration boundary for both EngE-AI flag workflows. It does not combine their schemas, collections, or privacy rules.

| Concern | Manual flag | Guided Pathway flag |
| --- | --- | --- |
| Trigger | A user explicitly reports a chat response | A notification-enabled winning Guided Pathway is selected for an eligible chat actor |
| Registry key | `activeCourse.collections.flags` | `activeCourse.collections.guidedPathwayFlags` |
| Visibility | Student history and identity-enriched instructor view | Anonymous course view for student alerts; course-only test view for instructor tests; student alerts only in global admin views |
| Lifecycle | `unresolved` / `resolved` | Student: `pending` → `escalated` or `dismissed`; instructor test: `pending` → `dismissed` only |
| Retry behavior | Existing insert behavior | Unique opaque deduplication key includes actor origin |
| Persistence | `src/db/mongo/flag-mongo.ts` | `src/db/mongo/guided-pathway-flag-mongo.ts` |

## Module ownership

- `src/flags` owns persistence-neutral contracts, trigger-actor policy, manual-flag policy, and failure-isolated automatic-alert orchestration.
- `src/db/mongo` owns physical collection resolution, indexes, projections, CRUD, and GPF migration behavior.
- `src/routes` owns HTTP parsing, RBAC, and response mapping.
- `src/guided-pathways` owns pathway schemas, prompts, classification, and winner selection.

The legacy manual-flag endpoint family still lives in `src/routes/route-mongo.ts`. Extracting it into `src/routes/mongo/manual-flag-routes.ts` was deferred because moving that large route block safely needs dedicated route-contract coverage; this does not change the `src/flags` domain ownership above.

## Guided Pathway origin and identity

The server derives `origin` from database-backed course and user records; the browser cannot request test mode. Course staff (`isCourseStaff`: listed faculty instructors, TAs, and platform admins) produce an `instructor-test` alert; this check runs before enrollment so dual-role staff never get a production `student` alert. An enrolled non-staff user produces a `student` alert. Outsiders and requests without valid course/user context do not produce an alert.

Student records retain a restricted internal `studentUserId` for the audited administrator reveal workflow. At creation, instructor-test records store no student identity or raw trigger-actor identity; the staff user ID participates only in the opaque deduplication digest. A later course decision retains the ordinary authorized decision-actor audit fields, not an identity link to the original trigger. Test records are visible only in the owning course, can only be marked complete through dismissal, and are excluded from every global admin item, total, facet, reviewer filter, bell count, review, escalation, and identity-reveal path. A legacy row with no `origin` is read as `student`.

## Registered storage

Automatic alerts remain separate from manual flags. New courses default to the readable `${courseName}_guided-pathway-flags` collection, but the stored `activeCourse.collections.guidedPathwayFlags` value is the runtime authority after registration. Course renames therefore do not move or recompute the namespace, and GPF-001 hash names are migration inputs only.

Alert creation uses an explicit provisioning resolver. Course/admin lists, counts, backup, and aggregation use read-only resolution and do not create an empty collection for an untouched legacy course. GPF-002 normalizes global and hashed legacy sources under a Mongo-backed lease; see [`documents/DATA_MIGRATIONS.md`](../../documents/DATA_MIGRATIONS.md#gpf-002-guided-pathway-registered-collection-normalization).
