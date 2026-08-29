# Pre-push checklist

Run this before pushing a branch or opening a pull request. It exists because
review found changes that were individually correct but inconsistent with the
inherited code around them. Most items below are consistency checks, not
correctness checks — a change can pass every test and still fail this list.

Check the boxes against evidence, not memory. If an item does not apply, write
why rather than deleting it.

## 1. Consistency with inherited code

- [ ] Every new per-course collection is registered in `activeCourse.collections`
      and resolved through `getCollectionNames` in
      `src/db/mongo/collection-registry-mongo.ts`. No new runtime namespace is
      derived from a hash, a recomputed name, or a request field.
- [ ] New course-owned storage is created in the same place as its siblings
      (`src/db/mongo/course-mongo.ts` for new courses; an `ensure*Collection`
      lazy provisioner for existing ones), and the registered name — not a
      computed fallback — stays authoritative after a course rename.
- [ ] The new feature's lifecycle matches its siblings on course create,
      restart-onboarding, delete, and backup. If it deliberately differs, the
      difference is recorded in `documents/` and in the PR description.
- [ ] Naming, file placement, and layering follow the existing area: persistence
      in `src/db/mongo/`, HTTP and RBAC in `src/routes/`, domain policy in its
      own `src/<domain>/` folder.

## 2. Provisioning discipline

- [ ] No read path creates a collection. List, count, search, backup, export,
      and dashboard endpoints use a read-only resolver that returns empty or
      `null` when storage does not physically exist.
- [ ] Only an explicit write path provisions storage.
- [ ] Migrations skip courses with no data instead of provisioning every course
      in the catalog.
- [ ] Verified against a real database, not only unit tests: list the
      collections before and after exercising the feature and confirm no empty
      namespace appeared for an untouched course.

## 3. Course-scoped access control

- [ ] Every course API applies a course-scoped guard from
      `src/middleware/require-course-role.ts`. `asyncHandlerWithAuth` alone only
      proves the caller is logged in — it does not scope them to the course.
- [ ] Any endpoint whose path carries a target user, chat, or record id
      authorizes that target, not just the course. A caller-supplied id in the
      path is untrusted input.
- [ ] Literal routes are declared before parameterized captures that would match
      the same URL. Express matches in declaration order, so `/flags/statistics`
      declared after `/flags/:flagId` is unreachable.
- [ ] Student PUIDs are not exposed or persisted outside `active-users`.
- [ ] Instructor-facing and admin-facing payloads use inclusion-only projections;
      no identity field rides along by accident.

## 4. Contracts and documentation

- [ ] Shared API types are mirrored in **both** `src/types/shared.ts` and
      `public/scripts/types.ts`.
- [ ] `documents/ENDPOINT_ARCHITECTURE.md` and `documents/MONGO_DATA_LAYER.md`
      reflect any changed contract.
- [ ] A new migration has an entry in `documents/DATA_MIGRATIONS.md` covering its
      key, sources, ordering, verification, and rollback position.
- [ ] Exported APIs carry behavior-first TSDoc; non-obvious pipelines carry step
      comments explaining why, not what.

## 5. Tests

- [ ] New behavior was written test-first, and the test was observed failing for
      the intended reason before the implementation existed.
- [ ] Route changes are pinned by contract tests covering RBAC, route order,
      payload shape, and status codes.
- [ ] A migration is exercised against a disposable real MongoDB instance, with
      two independent application contexts when concurrency matters.

## 6. Verification ladder

Run on Node 24.1.0. Record actual output; do not report a step you did not run.

- [ ] `npx tsc --noEmit`
- [ ] `npx tsc -p public/tsconfig.json --noEmit`
- [ ] `npm run build`
- [ ] `npx jest --forceExit` — full repository, not a focused slice
- [ ] Known-failing baseline confirmed unchanged, and every failure is in a file
      this branch did not touch
- [ ] `git diff --check`

## 7. Delivery

- [ ] No generated `dist/` or `public/dist/` file is staged.
- [ ] Unrelated working-tree changes are preserved and excluded from the commit.
- [ ] The package version is bumped once for the change set.
- [ ] Commit or push only when it has actually been requested.
