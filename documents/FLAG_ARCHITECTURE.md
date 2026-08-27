# Flag architecture

EngE-AI has two course-scoped flag workflows. They share a discoverable domain folder but intentionally retain separate storage schemas, privacy boundaries, and lifecycles.

## Boundaries

| Layer | Responsibility |
| --- | --- |
| `src/flags` | Persistence-neutral contracts, trigger and transition policy, and failure-isolated orchestration |
| `src/db/mongo` | Registered collection resolution, indexes, CRUD, safe projections, and migration behavior |
| `src/routes` | HTTP validation, course RBAC, session-owned actors, and response mapping |
| `src/guided-pathways` | Pathway configuration, prompt/classifier behavior, and winning-trigger selection |

Routes call the `EngEAI_MongoDB` facade. Domain services depend on small writer contracts rather than importing Mongo implementation types.

## Workflow comparison

| Concern | Manual flag | Guided Pathway flag |
| --- | --- | --- |
| Creation | Explicit report action | Automatic persistence after a notification-enabled winning pathway |
| Course registry | `collections.flags` | `collections.guidedPathwayFlags` |
| State | `unresolved` / `resolved` | Student: `pending` / `escalated` / `dismissed`; instructor test: `pending` / `dismissed` |
| Identity | Reporter identity supports student history and instructor enrichment | Student identity is restricted to audited reveal; instructor tests store no raw trigger identity |
| Cross-course admin workflow | None | Student alerts only; instructor tests are excluded |

## Manual flags

Manual flags are submitted explicitly from chat and stored in the course collection registered as `activeCourse.collections.flags`. They carry the reporting user's course-local identifier, appear in student history, may be enriched with roster names for authorized instructors, and transition between `unresolved` and `resolved`.

The accepted categories and lifecycle transition policy live in `src/flags/manual-flag-policy.ts`; persistence remains in `src/db/mongo/flag-mongo.ts`. The legacy HTTP handlers remain in `src/routes/route-mongo.ts`. Moving that large endpoint family into `src/routes/mongo/manual-flag-routes.ts` is deferred until it has dedicated route-contract coverage.

## Guided Pathway flags

Guided Pathway flags are automatic records created only after the real evaluator selects a winning pathway whose `notifyInstructorOnTrigger` value is true. The persistence attempt is failure-isolated: a Mongo failure must not replace or suppress the pathway's predefined response. Manually created and seeded pathways use the same evaluator and persistence path.

### Server-derived origin

The chat route resolves the actor from the current `activeCourse` and `GlobalUser`; request fields never select an origin.

- An enrolled non-staff user becomes `origin: 'student'`.
- Any course staff member (`isCourseStaff`: listed faculty instructor, TA, or platform admin) becomes `origin: 'instructor-test'`. This check runs before enrollment, so dual-role staff remain test actors.
- An outsider or a request without valid course/user context does not create an automatic alert.
- A legacy document with no `origin` is normalized to `student` at the safe-view boundary.

Student rows retain internal `studentUserId` for the existing audited reveal workflow. At creation, instructor-test rows omit `studentUserId` and do not persist a separate trigger-actor identity field. The trigger actor ID may contribute to the opaque deduplication digest, which also includes origin so equivalent student and test triggers cannot collide, but it is never returned as trigger identity. A later dismissal retains the ordinary authorized decision-actor audit fields; those describe the decision, not the original trigger.

### Visibility and lifecycle

Course queue reads use inclusion-only anonymous projections. They expose the origin, pathway/course snapshots, exact message, status, and relevant decision timestamps/names, but exclude user IDs, raw chat/request identifiers, deduplication material, and reveal audit events. Exact user-authored text can still be self-identifying.

Student alerts retain the production `pending` → `escalated` or `dismissed` lifecycle. Instructor tests appear only in the owning course queue, are labelled as tests, and can be marked complete only through the dismiss transition. Server-side guards reject test escalation, administrator review, and identity reveal before an audit or roster read. Every global admin list, total, facet, reviewer filter, and bell-count query includes only `origin: 'student'` or a legacy missing origin.

### Collection authority and isolation

Automatic alerts do not share the manual-flag collection. Each course owns a collection registered in `activeCourse.collections.guidedPathwayFlags`. New registrations default to `${courseName}_guided-pathway-flags`; once stored, the registry value is authoritative and survives course renames. A partial unique catalog index prevents two active courses from registering the same non-empty automatic-alert namespace. Resolution also rejects protected names, collisions with other registered course collections, and physical targets containing another course's rows.

Alert creation uses a provisioning resolver that can register, create, and index storage. Course/admin list, count, backup, and cross-course aggregation paths use existing registered namespaces only, so reading an untouched legacy course does not create an empty collection. Queries retain a `courseId` predicate inside the selected collection as defense in depth. Generic course updates strip browser-provided `collections` values; registry changes belong to server provisioning and migration code.

GPF-002 moves data from the former shared collection and GPF-001 hash collections into the registered target. A Mongo-backed lease serializes application instances, insert-only `_id` upserts preserve any newer target lifecycle state, source rows are deleted only after target and catalog verification, and malformed/orphan data is retained for recovery. See [DATA_MIGRATIONS.md](DATA_MIGRATIONS.md#gpf-002-guided-pathway-registered-collection-normalization).
