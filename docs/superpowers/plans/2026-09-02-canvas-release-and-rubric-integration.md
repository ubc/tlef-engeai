# Canvas Release and Rubric Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This environment is an exception: execute inline.** Subagent dispatch stops silently here — it was tried twice on 2026-09-02, both times losing the completion report while the work itself was intact. Use superpowers:executing-plans.

**Goal:** Merge the rubric-redesign and Canvas-release branches into one, and carry the Writing Feedback workflow end to end — Canvas import, per-lens rubrics, dual-lens annotation, per-criterion grading, one save, and a queued release that fills the grade into the Canvas rubric.

**Architecture:** Rubric provenance becomes per lens, so a lab report's Canvas rubric seeds the technical lens while its writing lens keeps the built-in metafunctions. Canvas criterion and rating ids — already carried on the transport contracts but discarded at mapping — are persisted as a side-map so a staff-final assessment can be written back into the Canvas rubric. Release moves onto the existing Mongo job queue, with the worker rebuilding the queuing staff member's Canvas client from the stored OAuth tokens.

**Tech Stack:** Node 24.1.0, TypeScript, Express, MongoDB, Jest (ts-jest), PDFKit, `@ubc/ubc-genai-toolkit-lms-integration`, vanilla TypeScript frontend.

**Spec:** `docs/superpowers/specs/2026-09-02-canvas-release-and-rubric-integration-design.md`

## Global Constraints

- Node 24.1.0 through NVM. Run everything from the repository root.
- **Never edit `dist/` or `public/dist/`.** They are generated.
- **Shared types mirror between `src/writing-feedback/contracts.ts` and `public/scripts/feature/writing-feedback-shared.ts`.** Not `src/types/shared.ts` / `public/scripts/types.ts` — those carry no writing-feedback types, and a previous plan sent an implementer to them by mistake.
- Keep HTTP handlers thin. Persistence goes in `src/db/mongo/writing-feedback-mongo.ts`, exposed through `EngEAI_MongoDB`.
- Course-scoped RBAC applies to every course API.
- Lowercase kebab-case filenames, camelCase values and functions, PascalCase types and classes.
- Behaviour-first TSDoc on every exported API; step comments on non-trivial pipelines.
- **Never log or persist** submission text, generated feedback, prompt bodies containing student text, Canvas tokens, or PUIDs. Sanitized error strings only.
- Model output is a draft; nothing reaches Canvas without staff approval.
- Student-facing output excludes confidence, internal flags, prompt/model metadata, and staff-only notes.
- Test commands: backend and frontend suites both run under `npx jest --config jest.config.cjs`. Type checks are `npx tsc --noEmit` and `npx tsc -p public/tsconfig.json --noEmit`.
- Commit after every task. Subject line only, no body. Attribution trailers follow whatever the session's attribution rule is — confirm with the user before the first commit, because the saved preference (no AI trailers, sole `@rdschrs` authorship) and the session instruction (add `Co-Authored-By` and `Claude-Session`) disagree.
- Do not push and do not open a pull request. That is a separate decision.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/writing-feedback/canvas-rubric-write.ts` | Builds the `rubric_assessment` payload from a staff-final assessment and the stored side-map; refuses when a criterion is unmapped |
| `src/writing-feedback/canvas-client-for-user.ts` | Rebuilds a staff member's Canvas `ApiClient` off-request from the Mongo token store |
| `src/report-generation/rubric-grid-renderer.ts` | Draws the rubric grid into a PDFKit document, with column measurement and row-boundary page breaks |
| `src/writing-feedback/__tests__/canvas-rubric-write.test.ts` | Payload construction and every refusal |
| `src/writing-feedback/__tests__/rubric-provenance.test.ts` | Per-lens grid source and the lab-report re-route |
| `src/writing-feedback/__tests__/release-lock.test.ts` | One success per submission; failures stay resumable |
| `src/report-generation/__tests__/rubric-grid-renderer.test.ts` | Grid geometry at 2 and 8 levels |

**Modified:**

| File | Change |
|---|---|
| `src/writing-feedback/canvas-rubric-mapping.ts` | `buildShape` returns Canvas ids alongside the grid |
| `src/writing-feedback/contracts.ts` | `canvasRubricImport`, `technicalRubricSource`, `AnchoredComment.lens`, `StaffFinalAssessment.lens`, two `WritingRelease` fields |
| `public/scripts/feature/writing-feedback-shared.ts` | Mirrors of the above |
| `src/writing-feedback/rubric-autofill.ts` | `gridSourceFor` per lens; `metafunctions_lab` renamed, `metafunctions_plain` removed |
| `src/db/mongo/writing-feedback-mongo.ts` | Stores `canvasRubricImport`; re-routes rubrics on the lab-report toggle |
| `src/db/enge-ai-mongodb.ts` | Delegates for the above |
| `src/routes/route-writing-feedback.ts` | Import stores the side-map; lab-report toggle re-routes; release enqueues; PDF disposition |
| `src/writing-feedback/staff-final-assessment.ts` | Lens-aware validation |
| `src/writing-feedback/anchored-comments.ts` | Lens tagging |
| `src/writing-feedback/live-canvas-release-service.ts` | Rubric assessment write, write order, refusals, both PDFs preflighted |
| `src/writing-feedback/worker.ts` | Registers the `release` handler |
| `src/writing-feedback/writing-feedback-service.ts` | Enqueue, lens-aware artifacts, release lock |
| `src/report-generation/writing-feedback-report.ts` | Grid replaces the scored list; lab-report ordering |
| `public/scripts/feature/writing-feedback-review.ts` | Editable technical tab, dual-lens save, PDF viewer, release polling |
| `public/scripts/feature/writing-feedback-anchors.ts` | Per-lens working sets |
| `public/styles/instructor-components/writing-feedback.css` | PDF viewer and technical annotation styles |

---

## Phase 0 — Integration

### Task 1: Make the Canvas work safe, then merge the branches

The Canvas release work is 26 modified and 4 untracked files with **zero commits**. Nothing else in this plan may start until it is committed.

**Files:**
- Modify: `documents/ENDPOINT_ARCHITECTURE.md` (conflict resolution)

**Interfaces:**
- Produces: a single branch `worktree-rubric-page-redesign` containing both lines of work.

- [ ] **Step 1: Confirm what is uncommitted**

```bash
cd /home/crodas/EngE-AI/writing-feedback-canvas-release
git status --short
```

Expected: 26 ` M` entries and 4 `??` entries, on branch `feature/writing-feedback-canvas-release` at `c336f22`.

- [ ] **Step 2: Verify the Canvas work builds and tests before committing it**

```bash
npx tsc --noEmit && npx tsc -p public/tsconfig.json --noEmit
npx jest --config jest.config.cjs src/writing-feedback
```

Expected: both type checks clean. Record the Jest pass/fail count — it is the baseline the merge must not regress.

- [ ] **Step 3: Commit the Canvas work on its own branch**

```bash
git add -A
git commit -m "feat: live Canvas release with staff-final assessment"
```

- [ ] **Step 4: Merge it into the redesign branch**

```bash
cd /home/crodas/EngE-AI/tlef-engeai/.claude/worktrees/rubric-page-redesign
git merge feature/writing-feedback-canvas-release
```

Expected: exactly one conflict, in `documents/ENDPOINT_ARCHITECTURE.md`. If any source file conflicts, stop and report — the dry run predicted none, so a source conflict means the branches moved.

- [ ] **Step 5: Resolve the docs conflict**

Both branches appended to the same section. Keep both additions, in this order: the redesign's `canvasRubricRefusal` line, then the Canvas branch's release endpoints. Delete the conflict markers.

- [ ] **Step 6: Verify the merge**

```bash
npx tsc --noEmit && npx tsc -p public/tsconfig.json --noEmit
npx jest --config jest.config.cjs
```

Expected: both type checks clean. Jest at or above the Step 2 baseline plus the redesign's 1012/1016. `scenario-practice-limits` fails on clean `HEAD` too — it is pre-existing and not yours.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "merge: canvas release onto rubric redesign"
```

---

## Phase 1 — Rubric provenance

### Task 2: Persist the Canvas criterion and rating ids

`CanvasRubricRow.canvasCriterionId` and `CanvasRubricRating.canvasRatingId` already exist on the transport contracts, marked "Transport only — never persisted locally". `buildShape` has both in hand and drops them. This task keeps them.

**Files:**
- Modify: `src/writing-feedback/canvas-rubric-mapping.ts:118-200`
- Modify: `src/writing-feedback/contracts.ts`
- Modify: `public/scripts/feature/writing-feedback-shared.ts`
- Test: `src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CanvasRubricIdMap {
      [ourCriterionId: string]: {
          criterionId: string;                    // Canvas criterion id, e.g. "_1234"
          ratingIds: Record<string, string>;      // our level id -> Canvas rating id
      };
  }
  export interface CanvasRubricMapping {
      shape: ImportedRubricShape | null;
      ids?: CanvasRubricIdMap;                    // present exactly when shape is
      refusal?: CanvasRubricRefusal;
  }
  ```

- [ ] **Step 1: Write the failing test**

Add to `src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts`:

```ts
describe('canvas rubric id map', () => {
    it('maps our criterion and level ids back to Canvas ids', () => {
        const rubric: CanvasImportedRubric = {
            title: 'Lab rubric',
            importedAt: new Date(),
            rows: [{
                canvasCriterionId: '_1234',
                label: 'Analysis',
                description: 'Quality of analysis',
                points: 20,
                ratings: [
                    { canvasRatingId: 'r_hi', label: 'Exemplary', description: 'Full marks', points: 20 },
                    { canvasRatingId: 'r_lo', label: 'Weak', description: 'Little analysis', points: 5 }
                ]
            }]
        };

        const mapped = mapCanvasRubric(rubric);

        expect(mapped.shape).not.toBeNull();
        const criterionId = mapped.shape!.criteria[0].id;
        const levelIds = mapped.shape!.levels.map((level) => level.id);
        expect(mapped.ids![criterionId].criterionId).toBe('_1234');
        // Levels are ordered weakest-first, matching buildCells.
        expect(mapped.ids![criterionId].ratingIds[levelIds[0]]).toBe('r_lo');
        expect(mapped.ids![criterionId].ratingIds[levelIds[1]]).toBe('r_hi');
    });

    it('returns no id map when the rubric is refused', () => {
        expect(mapCanvasRubric(null).ids).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts -t "canvas rubric id map"
```

Expected: FAIL — `mapped.ids` is undefined.

- [ ] **Step 3: Return the ids from `buildShape`**

In `src/writing-feedback/canvas-rubric-mapping.ts`, add the type and change `buildShape` to build the map from the same aligned iteration `buildCells` already uses:

```ts
/** Canvas's own ids for one imported rubric, keyed by the ids this codebase derived. */
export interface CanvasRubricIdMap {
    [ourCriterionId: string]: {
        criterionId: string;
        ratingIds: Record<string, string>;
    };
}

function buildIdMap(
    rows: CanvasRubricRow[],
    criteria: WritingRubricCriterion[],
    levels: WritingRubricLevel[]
): CanvasRubricIdMap {
    const map: CanvasRubricIdMap = {};
    rows.forEach((row, rowIndex) => {
        const criterion = criteria[rowIndex];
        if (!criterion) return;
        const ratingIds: Record<string, string> = {};
        // Same weakest-first alignment buildCells uses, so a level id and a rating id
        // always describe the same column.
        weakestFirst(row.ratings).forEach((rating, index) => {
            const level = levels[index];
            if (level) ratingIds[level.id] = rating.canvasRatingId;
        });
        map[criterion.id] = { criterionId: row.canvasCriterionId, ratingIds };
    });
    return map;
}
```

Change `buildShape` to return `{ shape, ids }` and `mapCanvasRubric`'s success branch to spread it. `canvasRubricToSeedShape` keeps returning `mapCanvasRubric(rubric).shape`, so every existing caller is untouched.

- [ ] **Step 4: Mirror the type onto the frontend**

Add the same `CanvasRubricIdMap` interface to `public/scripts/feature/writing-feedback-shared.ts`. The frontend never builds one, but the assignment type carries it.

- [ ] **Step 5: Run the whole mapping suite**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts
```

Expected: PASS, including the six existing refusal cases.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: keep canvas rubric ids when mapping a rubric"
```

---

### Task 3: Store the imported rubric on the assignment

The map is useless unless it survives the import. It is stored whole, independently of which lens ends up using it, because at import time nothing knows whether the assignment is a lab report.

**Files:**
- Modify: `src/writing-feedback/contracts.ts`
- Modify: `public/scripts/feature/writing-feedback-shared.ts`
- Modify: `src/db/mongo/writing-feedback-mongo.ts:312-352`
- Modify: `src/routes/route-writing-feedback.ts:337-360`
- Test: `src/db/mongo/__tests__/writing-feedback-mongo.test.ts`

**Interfaces:**
- Consumes: `CanvasRubricIdMap`, `mapCanvasRubric` (Task 2).
- Produces:
  ```ts
  // on WritingAssignment
  canvasRubricImport?: {
      shape: ImportedRubricShape;
      ids: CanvasRubricIdMap;
      importedAt: Date;
  };
  technicalRubricSource?: 'canvas' | 'builtin';
  ```
  `createCanvasWritingAssignment` gains a trailing optional parameter `canvasRubricIds?: CanvasRubricIdMap`.

- [ ] **Step 1: Write the failing test**

Add to `src/db/mongo/__tests__/writing-feedback-mongo.test.ts`:

```ts
it('stores the imported canvas rubric and its ids on the assignment', async () => {
    const shape: ImportedRubricShape = {
        criteria: [{ id: 'analysis', label: 'Analysis', description: 'd', points: 20, cells: {} }],
        levels: [{ id: 'weak', label: 'Weak', description: 'd', rank: 1 }]
    };
    const ids: CanvasRubricIdMap = { analysis: { criterionId: '_1234', ratingIds: { weak: 'r_lo' } } };

    const created = await createCanvasWritingAssignment(
        ctx, 'course-1', 'canvas-9', 'Lab 3', 'Do the lab', undefined, shape, ids
    );

    expect(created.canvasRubricImport?.ids.analysis.criterionId).toBe('_1234');
    expect(created.canvasRubricImport?.shape.criteria[0].id).toBe('analysis');
    // The writing lens still seeds from it, exactly as before.
    expect(created.rubricSource).toBe('canvas');
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/db/mongo/__tests__/writing-feedback-mongo.test.ts -t "stores the imported canvas rubric"
```

Expected: FAIL — `createCanvasWritingAssignment` takes seven parameters, not eight.

- [ ] **Step 3: Add the contract fields**

In `src/writing-feedback/contracts.ts`, on `WritingAssignment`:

```ts
/**
 * The Canvas rubric exactly as imported, held independently of which lens uses it.
 *
 * Stored because the lens routing cannot happen at import time: `isLabReport` is set by a
 * later PATCH, so the import does not yet know whether this rubric belongs to the technical
 * lens. Written at creation only and never re-stamped — the same rule `canvasRubricRefusal`
 * follows (D-088), and for the same reason: re-stamping onto a grid staff have since edited
 * would be wrong.
 */
canvasRubricImport?: {
    shape: ImportedRubricShape;
    ids: CanvasRubricIdMap;
    importedAt: Date;
};

/**
 * Where the technical grid came from. `rubricSource` describes the writing lens only.
 * Split per lens so a Canvas-seeded technical rubric does not make the writing lens report
 * `canvas` and lose its metafunctions autofill.
 */
technicalRubricSource?: 'canvas' | 'builtin';
```

Mirror both onto `Assignment` in `public/scripts/feature/writing-feedback-shared.ts`.

- [ ] **Step 4: Store them at creation**

In `createCanvasWritingAssignment`, add the parameter and the field:

```ts
canvasRubric?: ImportedRubricShape,
canvasRubricIds?: CanvasRubricIdMap
```

```ts
...(canvasRubric
    ? {
          rubric: seedRubricForLens({ lens: 'linguistic', actorUserId: 'platform', canvasRubric, now }),
          rubricSource: 'canvas' as const,
          ...(canvasRubricIds
              ? { canvasRubricImport: { shape: canvasRubric, ids: canvasRubricIds, importedAt: now } }
              : {})
      }
    : {}),
```

Add the matching parameter to the `EngEAI_MongoDB` delegate in `src/db/enge-ai-mongodb.ts`.

- [ ] **Step 5: Pass the ids from the import route**

In `src/routes/route-writing-feedback.ts` around line 350, replace the `canvasRubricToSeedShape` call with the full mapping so the ids are available:

```ts
const mapped = mapCanvasRubric(context?.rubric);
const seedGrid = mapped.shape ?? undefined;
const seedIds = mapped.ids;
```

and pass `seedIds` as the new trailing argument to `createCanvasWritingAssignment`. The `rubricImport` response field keeps its existing four values.

- [ ] **Step 6: Run the tests**

```bash
npx jest --config jest.config.cjs src/db/mongo/__tests__/writing-feedback-mongo.test.ts
npx tsc --noEmit
```

Expected: PASS, type check clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: store the imported canvas rubric and its ids"
```

---

### Task 4: Make rubric provenance per lens

**Files:**
- Modify: `src/writing-feedback/rubric-autofill.ts:30-100`
- Modify: `src/writing-feedback/rubric-seed.ts:42-50` (docstring)
- Create: `src/writing-feedback/__tests__/rubric-provenance.test.ts`
- Modify: `src/writing-feedback/__tests__/rubric-autofill.test.ts` (rename references)

**Interfaces:**
- Produces: `RubricGridSource = 'canvas' | 'apsc182' | 'metafunctions'`. `metafunctions_lab` is renamed `metafunctions`; `metafunctions_plain` is removed.

- [ ] **Step 1: Write the failing test**

Create `src/writing-feedback/__tests__/rubric-provenance.test.ts`:

```ts
import { gridSourceFor, autofillMergeRules } from '../rubric-autofill';
import type { WritingAssignment } from '../contracts';

const assignment = (over: Partial<WritingAssignment>): WritingAssignment =>
    ({ isLabReport: false, ...over } as WritingAssignment);

describe('gridSourceFor', () => {
    it('reports canvas for a Canvas-seeded technical rubric', () => {
        const a = assignment({ isLabReport: true, technicalRubricSource: 'canvas' });
        expect(gridSourceFor(a, 'technical')).toBe('canvas');
    });

    it('reports apsc182 for a built-in technical rubric', () => {
        const a = assignment({ isLabReport: true, technicalRubricSource: 'builtin' });
        expect(gridSourceFor(a, 'technical')).toBe('apsc182');
    });

    it('keeps a lab report writing lens on the metafunctions even when Canvas seeded the technical rubric', () => {
        const a = assignment({ isLabReport: true, technicalRubricSource: 'canvas' });
        expect(gridSourceFor(a, 'linguistic')).toBe('metafunctions');
    });

    it('reports metafunctions for a manual writing assignment', () => {
        expect(gridSourceFor(assignment({}), 'linguistic')).toBe('metafunctions');
    });

    it('reports canvas for a plain assignment carrying a Canvas rubric', () => {
        expect(gridSourceFor(assignment({ rubricSource: 'canvas' }), 'linguistic')).toBe('canvas');
    });
});

describe('autofillMergeRules', () => {
    it('locks the three metafunctions but lets autofill write their meaning', () => {
        expect(autofillMergeRules('metafunctions'))
            .toEqual({ mayAddRows: false, mayWriteRow: true, mayWriteCells: true });
    });

    it('never revises an instructor rubric', () => {
        expect(autofillMergeRules('canvas'))
            .toEqual({ mayAddRows: false, mayWriteRow: false, mayWriteCells: false });
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/rubric-provenance.test.ts
```

Expected: FAIL — `'metafunctions'` is not a `RubricGridSource`.

- [ ] **Step 3: Rewrite `gridSourceFor` and the merge table**

```ts
/** Where a draft's grid came from, which decides how much auto-fill may rewrite. */
export type RubricGridSource = 'canvas' | 'apsc182' | 'metafunctions';

/**
 * gridSourceFor - the merge-table row an assignment's grid falls under for a lens.
 *
 * Provenance is per lens. A lab report's technical grid may now come from Canvas — the
 * instructor's Canvas rubric for a lab report *is* the technical marking scheme — so the
 * technical branch consults `technicalRubricSource` rather than assuming the department form.
 * The writing lens consults `rubricSource`, and a lab report's writing lens ignores it
 * entirely: a lab handout describes an experiment, not linguistic expectations, so the
 * metafunctions always govern it.
 */
export function gridSourceFor(assignment: WritingAssignment, lens: WritingFeedbackLens): RubricGridSource {
    if (lens === 'technical') {
        return assignment.technicalRubricSource === 'canvas' ? 'canvas' : 'apsc182';
    }
    if (assignment.isLabReport) return 'metafunctions';
    return assignment.rubricSource === 'canvas' ? 'canvas' : 'metafunctions';
}

export function autofillMergeRules(source: RubricGridSource): AutofillMergeRules {
    switch (source) {
        // An instructor's real rubric is never revised by a model.
        case 'canvas':
            return { mayAddRows: false, mayWriteRow: false, mayWriteCells: false };
        // The evaluation form's sections and weights belong to the department.
        case 'apsc182':
            return { mayAddRows: false, mayWriteRow: false, mayWriteCells: true };
        // The three metafunctions are fixed; auto-fill writes only what they mean here.
        // This covers a lab report's writing lens and a manually created assignment alike,
        // so feedback stays comparable across an instructor's assignments.
        case 'metafunctions':
            return { mayAddRows: false, mayWriteRow: true, mayWriteCells: true };
    }
}
```

- [ ] **Step 4: Fix the two lying docstrings**

In `rubric-autofill.ts`, the `gridSourceFor` docstring claims the technical grid "is always the department's APSC 182 form ... never Canvas-seeded". Replaced above. In `rubric-seed.ts:44`, the claim that "nothing here branches on whether the assignment is a lab report" stays true of `seedRubricForLens` itself — the branching moved to the lab-report toggle — so extend it to say where the branching lives instead of deleting it.

- [ ] **Step 5: Update existing references**

```bash
grep -rn "metafunctions_lab\|metafunctions_plain" src/ public/scripts/
```

Update every hit, including `src/writing-feedback/__tests__/rubric-autofill.test.ts`.

- [ ] **Step 6: Run the suites**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/rubric-provenance.test.ts src/writing-feedback/__tests__/rubric-autofill.test.ts
npx tsc --noEmit
```

Expected: PASS. Note that a manual assignment can no longer gain rows from autofill — if an existing test asserted it could, that assertion is now wrong and changes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: make rubric provenance per lens"
```

---

### Task 5: Route the Canvas rubric to the technical lens on the lab-report toggle

**Files:**
- Modify: `src/db/mongo/writing-feedback-mongo.ts:488-520`
- Modify: `src/routes/route-writing-feedback.ts:619-665`
- Test: `src/writing-feedback/__tests__/rubric-provenance.test.ts`

**Interfaces:**
- Consumes: `canvasRubricImport` (Task 3), `seedRubricForLens`, `buildDefaultWritingRubric(actorUserId, now)`, `buildLabReportRubric(actorUserId, now)`, `saveWritingRubricDraft(ctx, courseId, assignmentId, draft, lens)`.

- [ ] **Step 1: Write the failing test**

Append to `src/writing-feedback/__tests__/rubric-provenance.test.ts`:

```ts
import { routeRubricsForLabReport } from '../rubric-seed';

describe('routeRubricsForLabReport', () => {
    const imported = {
        shape: {
            criteria: [{ id: 'analysis', label: 'Analysis', description: 'd', points: 20, cells: {} }],
            levels: [{ id: 'weak', label: 'Weak', description: 'd', rank: 1 }]
        },
        ids: { analysis: { criterionId: '_1234', ratingIds: { weak: 'r_lo' } } },
        importedAt: new Date()
    };

    it('seeds the technical lens from the imported Canvas grid', () => {
        const routed = routeRubricsForLabReport({ canvasRubricImport: imported, actorUserId: 'u1' });
        expect(routed.technicalRubricSource).toBe('canvas');
        expect(routed.technicalDraft.criteria[0].id).toBe('analysis');
    });

    it('restores the metafunctions on the writing lens', () => {
        const routed = routeRubricsForLabReport({ canvasRubricImport: imported, actorUserId: 'u1' });
        expect(routed.writingRubricSource).toBeUndefined();
        expect(routed.writingDraft.criteria.map((c) => c.id))
            .toEqual(buildDefaultWritingRubric('u1').criteria.map((c) => c.id));
    });

    it('falls back to the department form when nothing was imported', () => {
        const routed = routeRubricsForLabReport({ actorUserId: 'u1' });
        expect(routed.technicalRubricSource).toBe('builtin');
        expect(routed.technicalDraft.criteria.map((c) => c.id))
            .toEqual(buildLabReportRubric('u1').criteria.map((c) => c.id));
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/rubric-provenance.test.ts -t routeRubricsForLabReport
```

Expected: FAIL — `routeRubricsForLabReport` is not exported.

- [ ] **Step 3: Implement the router**

Add to `src/writing-feedback/rubric-seed.ts`:

```ts
/** What marking an assignment as a lab report does to both of its rubrics. */
export interface LabReportRouting {
    technicalDraft: WritingRubricDefinition;
    technicalRubricSource: 'canvas' | 'builtin';
    writingDraft: WritingRubricDefinition;
    writingRubricSource: undefined;
}

/**
 * routeRubricsForLabReport - moves an imported Canvas grid onto the lens that owns it.
 *
 * At import time nothing knows whether an assignment is a lab report — `isLabReport` is set
 * by a later PATCH — so the Canvas grid seeds the writing lens and is also kept whole in
 * `canvasRubricImport`. When the assignment is marked a lab report, that grid is the
 * technical marking scheme and belongs to the technical lens, while the writing lens returns
 * to the metafunctions it should have had all along.
 *
 * @param input - The stored import, if any, and the staff member performing the change
 * @returns Both lenses' new drafts and their provenance
 */
export function routeRubricsForLabReport(input: {
    canvasRubricImport?: { shape: ImportedRubricShape };
    actorUserId: string;
    now?: Date;
}): LabReportRouting {
    const now = input.now ?? new Date();
    const canvasRubric = input.canvasRubricImport?.shape;
    return {
        technicalDraft: seedRubricForLens({
            lens: 'technical', actorUserId: input.actorUserId, canvasRubric, now
        }),
        technicalRubricSource: canvasRubric ? 'canvas' : 'builtin',
        writingDraft: buildDefaultWritingRubric(input.actorUserId, now),
        writingRubricSource: undefined
    };
}
```

- [ ] **Step 4: Wire it into the toggle route**

In `src/routes/route-writing-feedback.ts`, the `isLabReport === true` branch currently seeds `buildLabReportRubric` only when no technical rubric exists. Replace it with the routing, guarded the same way the `false` branch already guards itself:

```ts
if (isLabReport) {
    // Re-routing discards an unapproved writing draft, so it is refused once the writing
    // rubric is approved or writing feedback exists — the same protection the un-marking
    // branch applies to the technical lens.
    if (assignment.rubric.status === 'approved') {
        return res.status(409).json({
            success: false,
            error: 'Mark this assignment as a lab report before approving its writing rubric'
        });
    }
    const writingRunCount = await mongo.countWritingFeedbackRunsByLens(courseId(req), assignmentId, 'linguistic');
    if (writingRunCount > 0) {
        return res.status(409).json({
            success: false,
            error: 'Writing feedback already exists for this assignment'
        });
    }
}
```

Then, after `setWritingAssignmentLabReport` succeeds and when `isLabReport` is true, apply `routeRubricsForLabReport` through a new `mongo.applyLabReportRubricRouting(courseId, assignmentId, routing)` that writes both drafts and both source fields in one update.

- [ ] **Step 5: Run the tests**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/rubric-provenance.test.ts
npx tsc --noEmit
```

Expected: PASS, type check clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: route an imported canvas rubric to the technical lens"
```

---

## Phase 2 — Annotations and grading

### Task 6: Give anchored comments a lens

**Files:**
- Modify: `src/writing-feedback/contracts.ts:459-481`
- Modify: `public/scripts/feature/writing-feedback-shared.ts`
- Modify: `src/writing-feedback/anchored-comments.ts`
- Test: `src/writing-feedback/__tests__/anchored-comments.test.ts`

**Interfaces:**
- Produces: `AnchoredComment.lens: WritingFeedbackLens`, optional on the wire and defaulted to `'linguistic'` when absent.

- [ ] **Step 1: Write the failing test**

Add to `src/writing-feedback/__tests__/anchored-comments.test.ts`:

```ts
it('reads a stored comment with no lens as linguistic', () => {
    const stored = { ...validComment, lens: undefined };
    expect(normalizeAnchoredComment(stored).lens).toBe('linguistic');
});

it('keeps an explicit technical lens', () => {
    expect(normalizeAnchoredComment({ ...validComment, lens: 'technical' }).lens).toBe('technical');
});

it('rejects a lens that is neither', () => {
    expect(() => normalizeAnchoredComment({ ...validComment, lens: 'rhetorical' }))
        .toThrow();
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/anchored-comments.test.ts -t lens
```

Expected: FAIL — `lens` is not on the type.

- [ ] **Step 3: Add the field and the default**

Replace the "Carries no lens marker today" comment in `contracts.ts` with the field it predicted:

```ts
/**
 * Which rubric this comment is about. Absent on comments stored before lab-report
 * annotation existed, which are all linguistic; the validator supplies that default so
 * no migration runs.
 */
lens: WritingFeedbackLens;
```

Extend the Zod schema in `anchored-comments.ts` with `lens: z.enum(['linguistic', 'technical']).default('linguistic')`, and mirror the field onto the frontend type.

- [ ] **Step 4: Run the suite**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/anchored-comments.test.ts
npx tsc --noEmit && npx tsc -p public/tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: tag anchored comments with their lens"
```

---

### Task 7: Make the technical tab annotatable, technical first for lab reports

**Files:**
- Modify: `public/scripts/feature/writing-feedback-anchors.ts:83-120, 270-300`
- Modify: `public/scripts/feature/writing-feedback-review.ts:700-760`
- Modify: `public/styles/instructor-components/writing-feedback.css`

**Interfaces:**
- Consumes: `AnchoredComment.lens` (Task 6).
- Produces: `renderAnnotations(options & { lens: WritingFeedbackLens })`; `getWorkingComments(): AnchoredComment[]` returns both lenses' sets, each tagged.

- [ ] **Step 1: Write the failing test**

Create `public/scripts/feature/__tests__/annotation-lenses.test.ts`:

```ts
import { getWorkingComments, resetWorkingComments, addWorkingComment } from '../writing-feedback-anchors';

describe('working comments across lenses', () => {
    beforeEach(() => resetWorkingComments());

    it('keeps each lens in its own set and returns both tagged', () => {
        addWorkingComment('linguistic', { quote: 'a', startOffset: 0, endOffset: 1, comment: 'w' });
        addWorkingComment('technical', { quote: 'b', startOffset: 2, endOffset: 3, comment: 't' });

        const saved = getWorkingComments();

        expect(saved).toHaveLength(2);
        expect(saved.filter((c) => c.lens === 'technical')).toHaveLength(1);
        expect(saved.filter((c) => c.lens === 'linguistic')).toHaveLength(1);
    });

    it('orders technical comments first', () => {
        addWorkingComment('linguistic', { quote: 'a', startOffset: 0, endOffset: 1, comment: 'w' });
        addWorkingComment('technical', { quote: 'b', startOffset: 2, endOffset: 3, comment: 't' });

        expect(getWorkingComments()[0].lens).toBe('technical');
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs public/scripts/feature/__tests__/annotation-lenses.test.ts
```

Expected: FAIL — the module keeps one working set and takes no lens.

- [ ] **Step 3: Key the working set by lens**

In `writing-feedback-anchors.ts`, change the module's single working array to `Map<WritingFeedbackLens, AnchoredComment[]>`. `renderAnnotations` takes `lens` and reads and writes only that lens's array. `getWorkingComments` concatenates technical first, then linguistic, stamping `lens` on each.

- [ ] **Step 4: Render the technical tab as an annotation surface**

In `writing-feedback-review.ts`, the technical tab currently calls `renderTechnicalTab(detail.technicalFeedbackRun, assignment)` and renders a read-only draft. Give it the same `renderAnnotations` call the writing tab makes, with `lens: 'technical'` and the technical run's evidence as its model seeds, keeping the read-only draft summary above it. When `assignment.isLabReport`, build the `tabs` array with the technical tab first.

- [ ] **Step 5: Style the technical annotation surface**

The technical pane reuses `.wf-annotation-*` rules unchanged. Add only a lens badge so a staff member can tell which set a comment belongs to when both are open:

```css
.wf-annotation-lens {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    background: var(--background-2);
    color: var(--text-2);
}
```

- [ ] **Step 6: Run the tests and both type checks**

```bash
npx jest --config jest.config.cjs public/scripts/feature/__tests__/annotation-lenses.test.ts
npx tsc -p public/tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: annotate the technical lens, technical first for lab reports"
```

---

### Task 8: Confirm one save carries both lenses

The single-save requirement is already met for one lens — `Save staff revision` posts summary fields, comments and `finalAssessment` in one POST. This task pins that behaviour with a test and extends it to both lenses.

**Files:**
- Modify: `src/routes/route-writing-feedback.ts:802-845`
- Test: `src/writing-feedback/__tests__/writing-feedback-service.test.ts`

**Interfaces:**
- Consumes: `getWorkingComments()` (Task 7), lens-tagged comments (Task 6).

- [ ] **Step 1: Write the failing test**

```ts
it('persists both lenses comments in one revision', async () => {
    await service.saveReview('course-1', 'sub-1', {
        feedbackRunId: 'run-1',
        studentFeedback: 'Summary',
        internalNote: '',
        comments: [
            { ...comment('a'), lens: 'technical' },
            { ...comment('b'), lens: 'linguistic' }
        ],
        finalAssessment: { rubricVersion: 1, criteria: [{ criterionId: 'analysis', points: 18 }] }
    });

    const saved = await mongo.getWritingSubmission('course-1', 'sub-1');
    const revision = saved!.reviews!.at(-1)!;
    expect(revision.comments.filter((c) => c.lens === 'technical')).toHaveLength(1);
    expect(revision.comments.filter((c) => c.lens === 'linguistic')).toHaveLength(1);
    expect(revision.finalAssessment!.criteria[0].points).toBe(18);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/writing-feedback-service.test.ts -t "both lenses"
```

Expected: FAIL — comments lose their lens or the review schema rejects them.

- [ ] **Step 3: Accept both lenses in the review schema**

The review route validates `comments` through the anchored-comment schema, which after Task 6 carries the lens. Confirm nothing filters by lens on the way in, and remove any implicit single-lens assumption in `saveReview`.

- [ ] **Step 4: Run the suite**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/writing-feedback-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: pin one save across both lenses"
```

---

### Task 9: Grade the lens that owns the assignment

**Files:**
- Modify: `src/writing-feedback/staff-final-assessment.ts:20-85`
- Modify: `src/writing-feedback/contracts.ts` (`StaffFinalAssessment.lens`)
- Modify: `public/scripts/feature/writing-feedback-shared.ts`
- Modify: `public/scripts/feature/writing-feedback-review.ts` (grade column on the gradeable lens)
- Test: `src/writing-feedback/__tests__/staff-final-assessment.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function gradedLensFor(assignment: WritingAssignment): WritingFeedbackLens;
  export function buildStaffFinalAssessment(
      input: StaffFinalAssessmentInput,
      rubric: WritingRubricDefinition,
      lens: WritingFeedbackLens
  ): StaffFinalAssessment;
  ```

- [ ] **Step 1: Write the failing test**

```ts
describe('gradedLensFor', () => {
    it('grades a lab report on its technical rubric', () => {
        expect(gradedLensFor({ isLabReport: true } as WritingAssignment)).toBe('technical');
    });

    it('grades everything else on its writing rubric', () => {
        expect(gradedLensFor({ isLabReport: false } as WritingAssignment)).toBe('linguistic');
    });
});

it('stamps the graded lens onto the assessment', () => {
    const built = buildStaffFinalAssessment(
        { rubricVersion: 1, criteria: [{ criterionId: 'analysis', points: 18 }] },
        technicalRubric,
        'technical'
    );
    expect(built.lens).toBe('technical');
    expect(built.totalPoints).toBe(18);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/staff-final-assessment.test.ts -t lens
```

Expected: FAIL — `gradedLensFor` is not exported.

- [ ] **Step 3: Implement**

```ts
/**
 * gradedLensFor - which of an assignment's rubrics carries its grade.
 *
 * A lab report is graded on the technical rubric: the department's evaluation form, or the
 * instructor's own Canvas rubric, is what the marks come from. Its writing feedback is still
 * generated, annotated and printed — it simply carries no grade.
 */
export function gradedLensFor(assignment: WritingAssignment): WritingFeedbackLens {
    return assignment.isLabReport ? 'technical' : 'linguistic';
}
```

Add `lens` to the returned `StaffFinalAssessment` and to the contract, mirrored onto the frontend.

- [ ] **Step 4: Point the review page's grade column at that lens**

`renderSummaryTab`'s `readFinalAssessment` reads `assignment.rubric`. It now reads the rubric for `gradedLensFor(assignment)`, and the column is labelled with that rubric's name.

- [ ] **Step 5: Run the suites and both type checks**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/staff-final-assessment.test.ts
npx tsc --noEmit && npx tsc -p public/tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: grade a lab report on its technical rubric"
```

---

## Phase 3 — PDF

### Task 10: Render the rubric as a grid

**Files:**
- Create: `src/report-generation/rubric-grid-renderer.ts`
- Create: `src/report-generation/__tests__/rubric-grid-renderer.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface GridGeometry {
      landscape: boolean;
      columnWidth: number;
      criterionColumnWidth: number;
      rowHeights: number[];
      pageBreakAfter: number[];  // row indexes after which a page break falls
  }
  export function measureRubricGrid(
      rubric: WritingRubricDefinition,
      options: { pageWidth: number; pageHeight: number; topOffset: number }
  ): GridGeometry;
  export function renderRubricGrid(
      doc: PDFKit.PDFDocument,
      rubric: WritingRubricDefinition,
      assessment: StaffFinalAssessment
  ): void;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { measureRubricGrid } from '../rubric-grid-renderer';
import type { WritingRubricDefinition } from '../../writing-feedback/contracts';

/** US Letter portrait, minus the report's existing margins, below the section heading. */
const page = { pageWidth: 612 - 108, pageHeight: 792 - 108, topOffset: 120 };

const rubricWith = (levelCount: number): WritingRubricDefinition => ({
    version: 1,
    status: 'approved',
    title: 'Grid',
    task: 't', audience: 'a', purpose: 'p',
    constraints: [], learningOutcomes: [], gradingIntent: 'g',
    updatedAt: new Date(), updatedBy: 'u1',
    levels: Array.from({ length: levelCount }, (_, index) => ({
        id: `level_${index + 1}`,
        label: `Level ${index + 1}`,
        description: 'Level description',
        rank: index + 1
    })),
    criteria: ['organization', 'content', 'ip'].map((id, row) => ({
        id,
        label: id,
        description: 'Criterion description',
        points: 20,
        cells: Object.fromEntries(Array.from({ length: levelCount }, (_, index) => [
            `level_${index + 1}`,
            { min: index * 4, max: index * 4 + 3, descriptor: 'D'.repeat(400) }
        ]))
    }))
});

describe('measureRubricGrid', () => {
    it('stays portrait at four levels or fewer', () => {
        expect(measureRubricGrid(rubricWith(4), page).landscape).toBe(false);
    });

    it('goes landscape at five levels or more', () => {
        expect(measureRubricGrid(rubricWith(5), page).landscape).toBe(true);
    });

    it('never returns a column narrower than the readable minimum', () => {
        const geometry = measureRubricGrid(rubricWith(8), page);
        expect(geometry.columnWidth).toBeGreaterThanOrEqual(64);
    });

    it('breaks pages at row boundaries, never inside a criterion', () => {
        const geometry = measureRubricGrid(rubricWith(8), { ...page, pageHeight: 200 });
        geometry.pageBreakAfter.forEach((index) => {
            expect(Number.isInteger(index)).toBe(true);
            expect(index).toBeLessThan(geometry.rowHeights.length);
        });
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/report-generation/__tests__/rubric-grid-renderer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement measurement**

Pure arithmetic, which is why it is the part under test:

```ts
/** Below this a descriptor cannot wrap into anything readable, so the page turns instead. */
const MIN_COLUMN_WIDTH = 64;
const CRITERION_COLUMN_WIDTH = 120;
const LANDSCAPE_FROM_LEVELS = 5;

export function measureRubricGrid(
    rubric: WritingRubricDefinition,
    options: { pageWidth: number; pageHeight: number; topOffset: number }
): GridGeometry {
    const landscape = rubric.levels.length >= LANDSCAPE_FROM_LEVELS;
    // A landscape page swaps the box; the renderer adds the page in that orientation.
    const usableWidth = (landscape ? options.pageHeight : options.pageWidth) - CRITERION_COLUMN_WIDTH;
    const columnWidth = Math.max(MIN_COLUMN_WIDTH, usableWidth / rubric.levels.length);

    const rowHeights = rubric.criteria.map((criterion) =>
        estimateRowHeight(criterion, rubric.levels, columnWidth));

    // Break between criteria only: a row split across a page break separates a descriptor
    // from the level it describes, which is the one thing the grid exists to show.
    const pageHeight = landscape ? options.pageWidth : options.pageHeight;
    const pageBreakAfter: number[] = [];
    let used = options.topOffset;
    rowHeights.forEach((height, index) => {
        if (used + height > pageHeight && index > 0) {
            pageBreakAfter.push(index - 1);
            used = options.topOffset;
        }
        used += height;
    });

    return { landscape, columnWidth, criterionColumnWidth: CRITERION_COLUMN_WIDTH, rowHeights, pageBreakAfter };
}
```

- [ ] **Step 4: Implement rendering**

`renderRubricGrid` consumes that geometry and draws: a header row of level labels, one row per criterion carrying its label and `awarded / possible`, descriptors wrapped inside their cells, and the earned cell marked with **both** a filled background and a bold border, so the mark survives greyscale printing. A total row closes the grid. Page breaks come from `pageBreakAfter`, and a landscape geometry adds its pages with `doc.addPage({ layout: 'landscape' })`.

- [ ] **Step 5: Run the tests**

```bash
npx jest --config jest.config.cjs src/report-generation/__tests__/rubric-grid-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: render the rubric as a grid in the feedback pdf"
```

---

### Task 11: Put the grid in the report, technical first for lab reports

**Files:**
- Modify: `src/report-generation/writing-feedback-report.ts:187-225`
- Test: `src/report-generation/__tests__/writing-feedback-report.test.ts`

**Interfaces:**
- Consumes: `renderRubricGrid` (Task 10), `StaffFinalAssessment.lens` (Task 9).

- [ ] **Step 1: Write the failing test**

```ts
it('renders the technical grid and annotations before the writing feedback for a lab report', async () => {
    const pdf = await render({ assignment: labReport, submission, feedback, technicalFeedback, finalAssessment });
    const text = await extractText(pdf);
    expect(text.indexOf('Technical feedback')).toBeLessThan(text.indexOf('Writing feedback'));
});

it('prints the grade breakdown against the graded lens rubric', async () => {
    const pdf = await render({ assignment: labReport, submission, feedback, technicalFeedback, finalAssessment });
    const text = await extractText(pdf);
    expect(text).toContain('18 / 20');
});

it('omits model suggestions from the student PDF', async () => {
    const pdf = await render({ assignment: labReport, submission, feedback, technicalFeedback, finalAssessment });
    const text = await extractText(pdf);
    expect(text).not.toContain('Suggested');
    expect(text).not.toContain('confidence');
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/report-generation/__tests__/writing-feedback-report.test.ts -t "lab report"
```

Expected: FAIL — ordering is writing-first and the assessment renders as a list.

- [ ] **Step 3: Replace `renderFinalAssessment` and order the document**

`renderFinalAssessment` calls `renderRubricGrid` against the rubric for `finalAssessment.lens` instead of drawing a list against `assignment.rubric`. For a lab report the document emits the technical grid, the technical annotations, then the writing feedback and its annotations. Model suggestions stay absent, unchanged.

- [ ] **Step 4: Run the suite**

```bash
npx jest --config jest.config.cjs src/report-generation/__tests__/writing-feedback-report.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: order lab report feedback technical first"
```

---

### Task 12: Let staff open the PDF instead of downloading it

**Files:**
- Modify: `src/routes/route-writing-feedback.ts:862-887`
- Modify: `public/scripts/feature/writing-feedback-review.ts:790-820`
- Modify: `public/styles/instructor-components/writing-feedback.css`

**Interfaces:**
- Produces: `GET .../feedback.pdf` responds `Content-Disposition: inline` and `?download=1` responds `attachment`.

- [ ] **Step 1: Write the failing test**

```ts
it('serves the pdf inline by default', async () => {
    const response = await request(app).get(pdfUrl);
    expect(response.headers['content-disposition']).toMatch(/^inline/);
});

it('serves it as an attachment when asked', async () => {
    const response = await request(app).get(`${pdfUrl}?download=1`);
    expect(response.headers['content-disposition']).toMatch(/^attachment/);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/routes/__tests__ -t "inline"
```

Expected: FAIL — always `attachment`.

- [ ] **Step 3: Switch the disposition**

```ts
const disposition = req.query.download === '1' ? 'attachment' : 'inline';
res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
```

- [ ] **Step 4: Open it in the page**

Replace the four `<a>` download links with a viewer: a modal holding an `<iframe>` pointed at the PDF URL, a mode selector for summary / annotated / complete / technical, and a Download control appending `?download=1`. On a non-OK response the modal renders the sanitized error instead of an empty frame — today a failed render navigates the staff member to a raw JSON body.

- [ ] **Step 5: Run the tests and the frontend type check**

```bash
npx jest --config jest.config.cjs src/routes/__tests__
npx tsc -p public/tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: open feedback pdfs in the review page"
```

---

## Phase 4 — Release

### Task 13: Rebuild a staff member's Canvas client off-request

**Files:**
- Create: `src/writing-feedback/canvas-client-for-user.ts`
- Create: `src/writing-feedback/__tests__/canvas-client-for-user.test.ts`

**Interfaces:**
- Produces: `export async function resolveCanvasClientForUser(userKey: string): Promise<ApiClient | null>` — `null` when the user has no stored tokens or the refresh fails.

- [ ] **Step 1: Write the failing test**

```ts
it('returns null when the user has no stored canvas tokens', async () => {
    tokenStore.get.mockResolvedValue(null);
    expect(await resolveCanvasClientForUser('user-1')).toBeNull();
});

it('refreshes and persists a token that is about to expire', async () => {
    tokenStore.get.mockResolvedValue({ accessToken: 'old', refreshToken: 'r', expiresAt: Date.now() + 1000 });
    refreshTokens.mockResolvedValue({ accessToken: 'new', expiresAt: Date.now() + 3_600_000 });

    expect(await resolveCanvasClientForUser('user-1')).not.toBeNull();
    expect(tokenStore.set).toHaveBeenCalledWith('user-1', expect.objectContaining({ accessToken: 'new' }));
});

it('drops a credential whose refresh was rejected', async () => {
    tokenStore.get.mockResolvedValue({ accessToken: 'old', refreshToken: 'r', expiresAt: 0 });
    refreshTokens.mockRejectedValue(new Error('revoked'));

    expect(await resolveCanvasClientForUser('user-1')).toBeNull();
    expect(tokenStore.delete).toHaveBeenCalledWith('user-1');
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/canvas-client-for-user.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Reproduce what `canvas.requireAuth` does inline, without the Express middleware: read tokens from the shared config's store, refresh within a 60-second expiry buffer, persist the refreshed pair, delete the entry when a refresh is rejected, and build the client with the same `onUnauthorized` refresh hook. Reuse the config from `src/lms/canvas-config.ts` — building a second config would key a second collection and split each user's credential in two, which that module's own header warns about.

Never log the token, the refresh token, or the user key.

- [ ] **Step 4: Run the tests**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/canvas-client-for-user.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rebuild a canvas client outside a request"
```

---

### Task 14: Build the Canvas rubric assessment payload

**Files:**
- Create: `src/writing-feedback/canvas-rubric-write.ts`
- Create: `src/writing-feedback/__tests__/canvas-rubric-write.test.ts`

**Interfaces:**
- Consumes: `CanvasRubricIdMap` (Task 2), `StaffFinalAssessment` (Task 9).
- Produces:
  ```ts
  export type RubricWriteRefusal = 'unmapped_criterion' | 'stale_canvas_rubric' | 'no_id_map';
  export interface RubricWritePlan {
      payload?: Record<string, { points: number; rating_id?: string }>;
      refusal?: RubricWriteRefusal;
  }
  export function planRubricWrite(input: {
      assessment: StaffFinalAssessment;
      rubric: WritingRubricDefinition;
      ids?: CanvasRubricIdMap;
      liveCanvasCriterionIds: string[];
  }): RubricWritePlan;
  ```

- [ ] **Step 1: Write the failing test**

```ts
it('addresses each criterion by its canvas id', () => {
    const plan = planRubricWrite({ assessment, rubric, ids, liveCanvasCriterionIds: ['_1234'] });
    expect(plan.payload).toEqual({ _1234: { points: 18, rating_id: 'r_hi' } });
});

it('refuses when a graded criterion has no canvas id', () => {
    const plan = planRubricWrite({
        assessment: { ...assessment, criteria: [...assessment.criteria, { criterionId: 'extra', points: 2 }] },
        rubric: rubricWithExtraCriterion, ids, liveCanvasCriterionIds: ['_1234']
    });
    expect(plan.refusal).toBe('unmapped_criterion');
    expect(plan.payload).toBeUndefined();
});

it('refuses when the live canvas rubric no longer holds a mapped criterion', () => {
    const plan = planRubricWrite({ assessment, rubric, ids, liveCanvasCriterionIds: ['_9999'] });
    expect(plan.refusal).toBe('stale_canvas_rubric');
});

it('omits rating_id when the award falls in no single canvas rating', () => {
    // spaceBandsEvenly produces contiguous bands; a Canvas rating is one value.
    const plan = planRubricWrite({ assessment: awardBetweenRatings, rubric, ids, liveCanvasCriterionIds: ['_1234'] });
    expect(plan.payload!._1234.rating_id).toBeUndefined();
    expect(plan.payload!._1234.points).toBe(12);
});

it('refuses outright when the assignment carries no id map', () => {
    expect(planRubricWrite({ assessment, rubric, liveCanvasCriterionIds: [] }).refusal).toBe('no_id_map');
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/canvas-rubric-write.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Every graded criterion must resolve through the map and still exist in the live rubric, or the whole plan is refused — a partial rubric assessment is worse than none, because it looks complete to a student. `rating_id` is included only when the awarded points fall inside exactly one level's band; where the bands do not partition cleanly the points are written alone, so a criterion scores without a wrongly highlighted cell.

- [ ] **Step 4: Run the tests**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/canvas-rubric-write.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: plan the canvas rubric assessment write"
```

---

### Task 15: Write the rubric assessment during release

**Files:**
- Modify: `src/writing-feedback/live-canvas-release-service.ts:120-190, 275-305`
- Modify: `src/writing-feedback/contracts.ts` (`WritingRelease.rubricAssessmentWritten`)
- Test: `src/writing-feedback/__tests__/live-canvas-release-service.test.ts`

**Interfaces:**
- Consumes: `planRubricWrite` (Task 14), `gradedLensFor` (Task 9).
- Produces: `CanvasReleaseInput` gains `gradedRubric: WritingRubricDefinition` — the rubric for `gradedLensFor(assignment)`, resolved by `WritingFeedbackService` where the lens is already known, so the release service never re-derives it. `PreparedRelease` gains `rubricPlan: RubricWritePlan` and `useRubricForGrading: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
it('writes the rubric assessment before the total grade', async () => {
    await service.release(input);
    const paths = client.put.mock.calls.map(([path]) => path);
    expect(paths[0]).toContain('/submissions/');
    expect(client.put.mock.calls[0][1]).toHaveProperty('rubric_assessment');
    expect(postGrades).toHaveBeenCalled();
});

it('does not post a total when the canvas rubric grades the assignment', async () => {
    // The toolkit exposes no rubric API at all, so this flag is read straight off the
    // Canvas assignment during preview — it is not on GradeExportPreflight.
    client.get.mockImplementation(async (path: string) =>
        path.endsWith(`/assignments/${canvasAssignmentId}`)
            ? { id: canvasAssignmentId, use_rubric_for_grading: true }
            : liveSubmission);

    await service.release(input);

    expect(postGrades).not.toHaveBeenCalled();
    expect(client.put.mock.calls[0][1]).toHaveProperty('rubric_assessment');
});

it('writes nothing at all when the rubric write is refused', async () => {
    ids = undefined;
    const release = await service.release(input);
    expect(client.uploadFile).not.toHaveBeenCalled();
    expect(client.put).not.toHaveBeenCalled();
    expect(release.status).toBe('failed');
});

it('preflights every artifact rather than only the first', async () => {
    // A lab report now ships one combined PDF, so this is a guard against the batch and the
    // upload drifting apart again rather than a two-file assertion.
    await service.preview(labReportInput);
    expect(preflightSubmissionFeedbackExport.mock.calls[0][1].batch.writes)
        .toHaveLength(labReportInput.artifacts.length);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/live-canvas-release-service.test.ts
```

Expected: FAIL — no rubric write exists; `feedbackBatch` carries one write.

- [ ] **Step 3: Plan the rubric write during preview**

The refusal must land before any Canvas write, so `preview` reads the live assignment and its rubric, calls `planRubricWrite`, and throws the refusal as a message naming what to fix. Both the plan and the grading flag are held in `PreparedRelease` beside the grade batch:

```ts
// The LMS toolkit exposes no rubric API, so both of these come from the raw client.
const liveAssignment = await this.client.get<{
    rubric?: Array<{ id: string }>;
    use_rubric_for_grading?: boolean;
}>(`/courses/${this.canvasCourseId}/assignments/${assignmentId}`);

const plan = planRubricWrite({
    assessment,
    rubric: input.gradedRubric,
    ids: input.assignment.canvasRubricImport?.ids,
    liveCanvasCriterionIds: (liveAssignment.rubric ?? []).map((row) => row.id)
});
if (plan.refusal) throw new Error(rubricRefusalMessage(plan.refusal));
```

`rubricRefusalMessage` maps each refusal to a sentence naming what to fix: an unmapped criterion says the rubric gained a criterion Canvas does not have, a stale map says the Canvas rubric changed since import and the assignment must be re-imported, and a missing map says the rubric was not imported from Canvas so only a total can be sent.

- [ ] **Step 4: Perform the writes in order**

In `release`, after `attachFeedback` succeeds:

```ts
await this.client.put(submissionPath(prepared.courseId, prepared.assignmentId, prepared.userId), {
    rubric_assessment: prepared.rubricPlan.payload
});
await this.updateRelease(fingerprint, { rubricAssessmentWritten: true });

// When Canvas grades from the rubric, the write above already set the grade. Posting a
// total as well would overwrite it with a value Canvas did not derive.
if (prepared.useRubricForGrading) return this.finishRubricOnlyRelease(fingerprint);
return this.writeGrade(fingerprint, prepared);
```

- [ ] **Step 5: Preflight both PDFs**

Build `feedbackBatch.writes` from every artifact rather than only `primary`, so the technical PDF is validated before it is uploaded. Rename the release artifact to `writing-feedback-complete.pdf`, which is what `include: 'both'` has always produced.

- [ ] **Step 6: Run the suite**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/live-canvas-release-service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: fill the canvas rubric during release"
```

---

### Task 16: Cap a submission at five releases, and show which revision it is on

**Files:**
- Modify: `src/writing-feedback/writing-feedback-service.ts:470-580`
- Modify: `src/db/mongo/writing-feedback-mongo.ts`
- Create: `src/writing-feedback/__tests__/release-lock.test.ts`

**Interfaces:**
- Produces: `countWritingReleases(courseId, submissionId): Promise<number>` — releases already `released` or `reconciled`; `MAX_SUBMISSION_RELEASES = 5`; `WritingRelease.revision?: number`; submission detail carries `releaseCount` and `maxReleases`.

- [ ] **Step 1: Write the failing test**

```ts
it('allows a revised release after one has succeeded', async () => {
    await mongo.createWritingRelease({ ...release, submissionId: 'sub-1', status: 'released' });
    await expect(service.previewRelease('course-1', 'sub-1', canvasService)).resolves.toBeDefined();
});

it('numbers each release so the submission can say which revision it is on', async () => {
    await mongo.createWritingRelease({ ...release, submissionId: 'sub-1', status: 'released' });
    const next = await service.previewRelease('course-1', 'sub-1', canvasService);
    expect(next.revision).toBe(2);
});

it('refuses a sixth release', async () => {
    for (let n = 0; n < 5; n += 1) {
        await mongo.createWritingRelease({ ...release, id: `r${n}`, submissionId: 'sub-1', status: 'released' });
    }
    await expect(service.previewRelease('course-1', 'sub-1', canvasService))
        .rejects.toThrow('five times');
});

it('lets any staff member resume a release that failed part-way', async () => {
    await mongo.createWritingRelease({ ...release, submissionId: 'sub-1', status: 'failed', failureStage: 'grade' });
    await expect(service.release('course-1', 'sub-1', canvasService)).resolves.toBeDefined();
});

it('refuses a submission that did not come from canvas', async () => {
    await expect(service.previewRelease('course-1', 'manual-sub', canvasService))
        .rejects.toThrow('not imported from Canvas');
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/release-lock.test.ts
```

Expected: FAIL — deduplication is by payload fingerprint, so changed feedback permits a second push.

- [ ] **Step 3: Implement the lock**

In `WritingFeedbackService.release`, before resolving the service, look up any release for the submission and refuse when one is `released` or `reconciled`. Fingerprint deduplication stays for retry reconciliation; this is a separate, submission-scoped rule.

`previewRelease` refuses a submission with no `canvasUserId`, naming the reason: it was not imported from Canvas, so nothing identifies the student.

- [ ] **Step 5: Run the tests**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/release-lock.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: cap canvas releases at five per submission"
```

---

### Task 17: Move release onto the job queue

**Files:**
- Modify: `src/writing-feedback/worker.ts:30-45`
- Modify: `src/routes/route-writing-feedback.ts:951-965`
- Modify: `src/writing-feedback/writing-feedback-service.ts`
- Modify: `public/scripts/feature/writing-feedback-review.ts`
- Test: `src/writing-feedback/__tests__/job-runner.test.ts`

**Interfaces:**
- Consumes: `resolveCanvasClientForUser` (Task 13), the release lock (Task 16).
- Produces: `POST .../submissions/:submissionId/release` enqueues and responds `202` with the job id; `GET .../submissions/:submissionId/release-status` returns the release record.

- [ ] **Step 1: Write the failing test**

```ts
it('runs a queued release as the staff member who queued it', async () => {
    await mongo.enqueueWritingJob({ courseId: 'course-1', type: 'release', payload: { submissionId: 'sub-1' } });
    await runner.runNext();
    expect(resolveCanvasClientForUser).toHaveBeenCalledWith('user-1');
});

it('fails the job with a reconnect message when the credential is gone', async () => {
    resolveCanvasClientForUser.mockResolvedValue(null);
    await runner.runNext();
    const job = await mongo.getWritingJob(jobId);
    expect(job!.state).toBe('failed');
    expect(job!.sanitizedError).toContain('reconnect Canvas');
});

it('does not retry a release parked for reconciliation', async () => {
    release.status = 'reconciliation_required';
    await runner.runNext();
    const job = await mongo.getWritingJob(jobId);
    expect(job!.state).toBe('completed');
    expect(job!.attempts).toBe(1);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/job-runner.test.ts -t release
```

Expected: FAIL — no `release` handler is registered.

- [ ] **Step 3: Register the handler**

In `startWritingFeedbackWorker`, beside `generate`:

```ts
release: async (job) => {
    // The job carries only a submission id; everything sensitive is reloaded inside the
    // Writing Feedback boundary, as the generation handler does.
    await service.runQueuedRelease(job.courseId, job.payload.submissionId);
}
```

`runQueuedRelease` reads the release record for `queuedByUserId`, resolves that person's Canvas client, and refuses without retrying when the record is in `reconciliation_required` — the queue's generic retry must not override that refusal.

- [ ] **Step 4: Enqueue from the route**

`POST .../release` stores `queuedByUserId` on the release record, enqueues the job, and responds `202` with the job id. A companion `GET .../release-status` returns the release record so the review page can poll.

- [ ] **Step 5: Poll from the review page**

The release control enqueues, disables itself, and polls `release-status` on the same interval and with the same backoff generation polling uses. Each status renders a plain sentence: attaching feedback, writing the grade, released, needs reconciliation, failed.

- [ ] **Step 6: Run the tests**

```bash
npx jest --config jest.config.cjs src/writing-feedback/__tests__/job-runner.test.ts
npx tsc --noEmit && npx tsc -p public/tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: release to canvas through the job queue"
```

---

## Phase 5 — Documentation and verification

### Task 18: Update the contract documents

**Files:**
- Modify: `documents/ENDPOINT_ARCHITECTURE.md`
- Modify: `documents/MONGO_DATA_LAYER.md`
- Modify: `documents/WRITING_FEEDBACK_ARCHITECTURE.md`

- [ ] **Step 1: Record the endpoint changes**

`POST .../release` now responds `202` with a job id; `GET .../release-status` is new; `GET .../feedback.pdf` serves inline and takes `?download=1`.

- [ ] **Step 2: Record the data-layer changes**

`WritingAssignment.canvasRubricImport` and `.technicalRubricSource`; `AnchoredComment.lens`; `StaffFinalAssessment.lens`; `WritingRelease.queuedByUserId` and `.rubricAssessmentWritten`.

- [ ] **Step 3: Record the architecture rules**

Per-lens rubric provenance and its table; the release write order and its refusals; the fact that a queued release acts with the queuing staff member's stored credential.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: record the release and rubric provenance contracts"
```

---

### Task 19: Full verification and the browser acceptance pass

**Blocked until Docker Desktop is running with WSL integration enabled.** `docker` is currently unreachable from this distro, so there is no Mongo and no local Canvas.

- [ ] **Step 1: Both type checks and the full suite**

```bash
npx tsc --noEmit && npx tsc -p public/tsconfig.json --noEmit
npx jest --config jest.config.cjs
npm run build
git diff --check
```

Expected: type checks clean, build reports the bumped version, `git diff --check` clean. The only acceptable failure is `scenario-practice-limits` (4 assertions), which fails identically on clean `HEAD`.

- [ ] **Step 2: Bump the package version**

`1.13.0` → `1.14.0`. This is a feature release.

- [ ] **Step 3: Start the app**

```bash
SAML_AVAILABLE=false npm run dev
```

Sign in as the `instructor` fake user. In a fresh worktree, confirm `cert/`, `node_modules` and `.env` are all present — `SAML_CERT_PATH` is relative and `cert/` is gitignored, and its absence breaks login outright.

- [ ] **Step 4: Drive the lab-report workflow**

Use the Playwright recipe from the 2026-09-01 session log: the bundled `chromium-1232`, four NSS libraries via `apt-get download` and `dpkg -x` into a temp prefix, launched with `LD_LIBRARY_PATH` and `executablePath`. **Do not run `npx playwright install`.**

1. Import a Canvas lab-report assignment carrying a rubric.
2. Mark it a lab report. Confirm the technical lens took the Canvas grid and the writing lens holds Organization / Content / Interpersonal Positioning.
3. Autofill and approve both rubrics.
4. Open a long synthetic lab report — long enough to page the PDF and exercise anchor offsets across a document staff would really receive.
5. Generate. Annotate on both lenses. Confirm the technical tab comes first.
6. Enter per-criterion technical grades.
7. Save once. Reload and confirm both lenses' annotations, the summary, and the grades all persisted from that single action.
8. Approve.
9. Open the Complete PDF in the page. Check the grid, the marked cells, the totals, and technical-first ordering.
10. Preview, then release. Watch the queued status progress.
11. In Canvas: the combined PDF on the right student's submission attempt, the rubric showing per-criterion points with the right cells highlighted, a total that matches.
12. Attempt a second push. Confirm it is refused.

- [ ] **Step 5: Drive the plain writing workflow**

Canvas rubric on the writing lens, graded on the writing lens, one PDF, released once.

- [ ] **Step 6: Check the widths**

1440, 768 and 320px. No horizontal page scroll, no console errors, 44px touch targets on the new controls.

- [ ] **Step 7: Record the session**

Add a dated note under `../project-memory/02 Session Log`, update `Current State.md`, and record the new decisions in `Decisions.md` — starting at **D-090**, and noting that `Decisions.md` already carries duplicate ids D-060 through D-072. No PUIDs, tokens, student text, or generated feedback in any of it.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: verify canvas release and rubric integration"
```

---

## Notes for the executor

**Synthetic data only.** Every Canvas pass in this project has used a throwaway course, assignment, student and submission. Keep it that way — no real submission, PUID, token value, Canvas record id, or generated feedback goes into a commit, a log, or project memory.

**The `scenario-practice-limits` suite fails on clean `HEAD`.** Four assertions, a pre-existing `PRACTICE_DAILY_MAX_ATTEMPTS` policy conflict. It is not yours; do not fix it inside this plan.

**Watch each new test fail before implementing it.** The 2026-09-02 session found a backend suite whose docstring claimed to pin both band mirrors while importing only one — the browser copy had never been tested at all. A test that has never been seen red proves nothing.

**Do not wire `requireCompleteRubricCells`.** It is exported with zero callers, and whether approval should gate on a complete grid is the open product question behind D-085. Leaving it unwired is deliberate.
