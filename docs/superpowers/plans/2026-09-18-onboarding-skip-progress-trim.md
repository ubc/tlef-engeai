# Instructor Onboarding Skip, Tutorial-Mode Chrome, and Concision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff leave the instructor onboarding tutorial from any stage after Document Setup, make it obvious at a glance that they are in a tutorial and how far through it they are, and cut the tutorials' on-screen wordage by about 28% while refreshing the Writing Feedback tutorial to the shipped product.

**Architecture:** Stage-level knowledge (labels, the skippable set, the viewer's stage sequence and position) is added to the existing import-free `onboarding-stage-order.ts` and its backend mirror, so both routing and presentation read one source. Skip is one new own-record endpoint backed by one new Mongo delegate that sets all six per-user tutorial keys in a single `findOneAndUpdate`. The browser gains two small modules — a skip client and a tutorial-chrome renderer — that the shared feature-tutorial runtime and the four hand-written stage controllers each call in one place. Concision is a copy change inside the seven existing components, with second-order detail moved into the `#help-step-N` panels the Help button already opens, pinned against regrowth by word-count ceilings in the existing design guard.

**Tech Stack:** TypeScript (backend Express + vanilla browser TS), MongoDB via `EngEAI_MongoDB` delegates, Jest + ts-jest (Node environment, no DOM), Playwright for the layout guard and the browser pass, Node 24.1.0 through NVM.

**Spec:** `docs/superpowers/specs/2026-09-18-onboarding-skip-progress-trim-design.md`

## Global Constraints

- Branch is `feat/onboarding-skip-progress-trim`, already created from `origin/main` at `8667cfd`. Do not commit or push anything else that is in the worktree; the untracked `docs/superpowers/**` files from earlier sessions are unrelated and stay untracked.
- Node 24.1.0 through NVM for every command.
- Never edit `dist/` or `public/dist/`.
- HTTP handlers stay thin; all persistence goes in `src/db/mongo/` and is exposed through `EngEAI_MongoDB`.
- Shared API types are mirrored in both `src/types/shared.ts` and `public/scripts/types.ts`.
- Filenames lowercase kebab-case; values and functions camelCase; types and classes PascalCase.
- Behavior-first TSDoc on every exported API; step comments on non-trivial pipelines.
- `public/styles/instructor-components/onboarding.css` may contain no hex literal outside `#fff`, `#ffffff`, `#000`, `#e67e22` — everything else is `var(--…)` or an `rgba()` tint. No left-accent callout bars. No emoji in component markup. `src/helpers/__tests__/onboarding-design-guard.test.ts` enforces all three.
- Palette variables available: `--color-chbe-green`, `--border-color`, `--text-primary`, `--text-secondary`, `--gingham-color`.
- Jest runs in a Node environment with no DOM. Anything that touches `document` cannot be unit tested here; keep logic pure and assert markup as text.
- `public/scripts/utils/onboarding-stage-order.ts` must stay import-free and DOM-free — it is compiled by the backend Jest project.
- Never log PUIDs, student text, or tokens.
- Update `documents/ENDPOINT_ARCHITECTURE.md` and `documents/MONGO_DATA_LAYER.md` when contracts change.
- Exact copy strings, used verbatim wherever they appear:
  - Modal title: `Skip the onboarding tutorial?`
  - Modal body: `You can leave the tutorial now and go straight to your course. The remaining tutorials will be marked as taught, so EngE-AI will not show them to you again — on this course or any other.`
  - Modal buttons: `No, continue with the tutorial` (muted) and `Yes, skip it` (primary).
  - Footer button label: `Skip tutorial`
  - Banner text: `Tutorial — nothing you do here changes your live course.`
  - Progress label format: `Tutorial 3 of 7` then the stage label.
- Stage labels: `course-setup` → `Course Setup`, `document-setup` → `Course Content`, `scenario-generation-setup` → `Scenario Generation`, `writing-feedback-setup` → `Writing Feedback`, `guided-pathway-setup` → `Guided Pathway`, `flag-setup` → `Flags`, `monitor-setup` → `Monitor`.

---

### Task 1: Stage labels, skippable set, sequence and position

**Files:**
- Modify: `public/scripts/utils/onboarding-stage-order.ts` (append after `resolveNextOnboardingStage`)
- Modify: `src/helpers/instructor-onboarding-redirect.ts` (append the same four exports)
- Test: `src/helpers/__tests__/instructor-onboarding-redirect.test.ts` (extend)

**Interfaces:**
- Consumes: existing `InstructorOnboardingStage`, `OnboardingCourseProgress`, `FEATURE_ONBOARDING_STAGES`, `isFeatureEnabled` (browser copy) / `isCourseFeatureEnabled` (backend copy).
- Produces, from both modules with identical behavior:
  - `ONBOARDING_STAGE_LABELS: Record<InstructorOnboardingStage, string>`
  - `SKIPPABLE_ONBOARDING_STAGES: ReadonlyArray<InstructorOnboardingStage>`
  - `isSkippableOnboardingStage(stage: InstructorOnboardingStage): boolean`
  - `buildOnboardingStageSequence(course, canManageRoster?: boolean): InstructorOnboardingStage[]`
  - `resolveOnboardingStagePosition(stage, course, canManageRoster?: boolean): { index: number; total: number } | null`
  (browser copy takes `OnboardingCourseProgress`; backend copy takes `activeCourse`)

- [x] **Step 1: Write the failing tests**

Append to `src/helpers/__tests__/instructor-onboarding-redirect.test.ts`, and add the new names to the
existing import block from `../../../public/scripts/utils/onboarding-stage-order` and a parallel import
from `../instructor-onboarding-redirect`:

```typescript
import {
    ONBOARDING_STAGE_LABELS as BROWSER_LABELS,
    SKIPPABLE_ONBOARDING_STAGES as BROWSER_SKIPPABLE,
    isSkippableOnboardingStage as browserIsSkippable,
    buildOnboardingStageSequence as browserBuildSequence,
    resolveOnboardingStagePosition as browserResolvePosition
} from '../../../public/scripts/utils/onboarding-stage-order';
import {
    ONBOARDING_STAGE_LABELS,
    SKIPPABLE_ONBOARDING_STAGES,
    isSkippableOnboardingStage,
    buildOnboardingStageSequence,
    resolveOnboardingStagePosition
} from '../instructor-onboarding-redirect';

/** Course fixture helper: every capability on unless named in `disabled`. */
function courseWith(disabled: Array<'scenarioGeneration' | 'writingFeedback' | 'guidedPathway'> = []) {
    return {
        courseSetup: true,
        features: {
            scenarioGeneration: { enabled: !disabled.includes('scenarioGeneration') },
            writingFeedback: { enabled: !disabled.includes('writingFeedback') },
            guidedPathway: { enabled: !disabled.includes('guidedPathway') }
        }
    };
}

describe('onboarding stage sequence and position', () => {
    it('sequences all seven stages for a roster manager on a fully enabled course', () => {
        expect(buildOnboardingStageSequence(courseWith() as any, true)).toEqual([
            'course-setup',
            'document-setup',
            'scenario-generation-setup',
            'writing-feedback-setup',
            'guided-pathway-setup',
            'flag-setup',
            'monitor-setup'
        ]);
    });

    it('drops a disabled capability from the sequence', () => {
        expect(buildOnboardingStageSequence(courseWith(['writingFeedback']) as any, true)).not.toContain(
            'writing-feedback-setup'
        );
        expect(buildOnboardingStageSequence(courseWith(['writingFeedback']) as any, true)).toHaveLength(6);
    });

    it('omits course setup for a teaching assistant', () => {
        const sequence = buildOnboardingStageSequence(courseWith() as any, false);
        expect(sequence).not.toContain('course-setup');
        expect(sequence[0]).toBe('document-setup');
        expect(sequence).toHaveLength(6);
    });

    it('reports a one-based position out of the viewer-specific total', () => {
        expect(resolveOnboardingStagePosition('writing-feedback-setup', courseWith() as any, true)).toEqual({
            index: 4,
            total: 7
        });
        expect(
            resolveOnboardingStagePosition('flag-setup', courseWith(['scenarioGeneration']) as any, true)
        ).toEqual({ index: 5, total: 6 });
    });

    it('returns null for a stage the viewer is never routed through', () => {
        expect(resolveOnboardingStagePosition('course-setup', courseWith() as any, false)).toBeNull();
        expect(
            resolveOnboardingStagePosition('writing-feedback-setup', courseWith(['writingFeedback']) as any, true)
        ).toBeNull();
    });

    it('treats every stage after document setup as skippable', () => {
        expect(SKIPPABLE_ONBOARDING_STAGES).toEqual([
            'scenario-generation-setup',
            'writing-feedback-setup',
            'guided-pathway-setup',
            'flag-setup',
            'monitor-setup'
        ]);
        expect(isSkippableOnboardingStage('course-setup')).toBe(false);
        expect(isSkippableOnboardingStage('document-setup')).toBe(false);
        expect(isSkippableOnboardingStage('monitor-setup')).toBe(true);
    });

    it('labels every stage without an internal slug', () => {
        expect(ONBOARDING_STAGE_LABELS).toEqual({
            'course-setup': 'Course Setup',
            'document-setup': 'Course Content',
            'scenario-generation-setup': 'Scenario Generation',
            'writing-feedback-setup': 'Writing Feedback',
            'guided-pathway-setup': 'Guided Pathway',
            'flag-setup': 'Flags',
            'monitor-setup': 'Monitor'
        });
    });
});

describe('browser and backend stage helpers agree', () => {
    const courses = [courseWith(), courseWith(['scenarioGeneration']), courseWith(['writingFeedback', 'guidedPathway'])];
    const stages = [
        'course-setup',
        'document-setup',
        'scenario-generation-setup',
        'writing-feedback-setup',
        'guided-pathway-setup',
        'flag-setup',
        'monitor-setup'
    ] as const;

    it('produces identical labels and skippable sets', () => {
        expect(BROWSER_LABELS).toEqual(ONBOARDING_STAGE_LABELS);
        expect(BROWSER_SKIPPABLE).toEqual(SKIPPABLE_ONBOARDING_STAGES);
        stages.forEach(stage => expect(browserIsSkippable(stage)).toBe(isSkippableOnboardingStage(stage)));
    });

    it('produces identical sequences and positions for every input combination', () => {
        courses.forEach(course => {
            [true, false].forEach(canManageRoster => {
                expect(browserBuildSequence(course as any, canManageRoster)).toEqual(
                    buildOnboardingStageSequence(course as any, canManageRoster)
                );
                stages.forEach(stage => {
                    expect(browserResolvePosition(stage, course as any, canManageRoster)).toEqual(
                        resolveOnboardingStagePosition(stage, course as any, canManageRoster)
                    );
                });
            });
        });
    });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/helpers/__tests__/instructor-onboarding-redirect.test.ts`
Expected: FAIL — `ONBOARDING_STAGE_LABELS` and the other three names are not exported from either module.

- [x] **Step 3: Implement in the browser module**

Append to `public/scripts/utils/onboarding-stage-order.ts`:

```typescript
/**
 * Human-readable stage names for tutorial chrome.
 *
 * Copy only: no slug, no internal identifier, and no use of the word "lens" or
 * "setup" where the interface calls the area something else (D-066's rule for
 * rubric copy applied to onboarding).
 */
export const ONBOARDING_STAGE_LABELS: Record<InstructorOnboardingStage, string> = {
    'course-setup': 'Course Setup',
    'document-setup': 'Course Content',
    'scenario-generation-setup': 'Scenario Generation',
    'writing-feedback-setup': 'Writing Feedback',
    'guided-pathway-setup': 'Guided Pathway',
    'flag-setup': 'Flags',
    'monitor-setup': 'Monitor'
};

/**
 * Stages that offer Skip tutorial (D-130).
 *
 * Course Setup writes the course's own structure and Course Content files real
 * material under it, so neither is skippable; everything after them only teaches.
 */
export const SKIPPABLE_ONBOARDING_STAGES: ReadonlyArray<InstructorOnboardingStage> = [
    'scenario-generation-setup',
    'writing-feedback-setup',
    'guided-pathway-setup',
    'flag-setup',
    'monitor-setup'
];

/** True when this stage offers Skip tutorial. */
export function isSkippableOnboardingStage(stage: InstructorOnboardingStage): boolean {
    return SKIPPABLE_ONBOARDING_STAGES.includes(stage);
}

/**
 * Every stage this viewer can be routed through on this course, in presentation order.
 *
 * Completion is deliberately ignored: the sequence is the denominator of "Tutorial 3
 * of 7", which must not shrink as stages are finished. It mirrors
 * {@link resolveNextOnboardingStage}'s ordering and gating so the two can never
 * disagree about which stages exist for a viewer.
 *
 * @param course - course setup flag and capability map
 * @param canManageRoster - true for faculty instructors and platform admins; a
 *        teaching assistant is never routed through Course Setup, so it is omitted
 * @returns ordered stage slugs
 */
export function buildOnboardingStageSequence(
    course: OnboardingCourseProgress,
    canManageRoster = true
): InstructorOnboardingStage[] {
    const sequence: InstructorOnboardingStage[] = [];
    if (canManageRoster) {
        sequence.push('course-setup');
    }
    sequence.push('document-setup');
    for (const { stage, feature } of FEATURE_ONBOARDING_STAGES) {
        if (isFeatureEnabled(course, feature)) {
            sequence.push(stage);
        }
    }
    sequence.push('flag-setup', 'monitor-setup');
    return sequence;
}

/**
 * One-based position of a stage within {@link buildOnboardingStageSequence}.
 *
 * @returns `{ index, total }`, or null when this viewer is never routed through the
 *          stage — a disabled capability, or Course Setup for a teaching assistant
 */
export function resolveOnboardingStagePosition(
    stage: InstructorOnboardingStage,
    course: OnboardingCourseProgress,
    canManageRoster = true
): { index: number; total: number } | null {
    const sequence = buildOnboardingStageSequence(course, canManageRoster);
    const zeroBased = sequence.indexOf(stage);
    if (zeroBased === -1) {
        return null;
    }
    return { index: zeroBased + 1, total: sequence.length };
}
```

- [x] **Step 4: Implement the backend mirror**

Append the same four exports to `src/helpers/instructor-onboarding-redirect.ts`, using `activeCourse`
and `isCourseFeatureEnabled` in place of the structural type and local helper:

```typescript
/** Mirrors `public/scripts/utils/onboarding-stage-order.ts`; parity is pinned by test. */
export const ONBOARDING_STAGE_LABELS: Record<InstructorOnboardingStage, string> = {
    'course-setup': 'Course Setup',
    'document-setup': 'Course Content',
    'scenario-generation-setup': 'Scenario Generation',
    'writing-feedback-setup': 'Writing Feedback',
    'guided-pathway-setup': 'Guided Pathway',
    'flag-setup': 'Flags',
    'monitor-setup': 'Monitor'
};

/** Stages that offer Skip tutorial (D-130). */
export const SKIPPABLE_ONBOARDING_STAGES: ReadonlyArray<InstructorOnboardingStage> = [
    'scenario-generation-setup',
    'writing-feedback-setup',
    'guided-pathway-setup',
    'flag-setup',
    'monitor-setup'
];

/** True when this stage offers Skip tutorial. */
export function isSkippableOnboardingStage(stage: InstructorOnboardingStage): boolean {
    return SKIPPABLE_ONBOARDING_STAGES.includes(stage);
}

/**
 * Every stage this viewer can be routed through on this course, in presentation order.
 *
 * Completion is ignored so the total stays stable as stages are finished.
 */
export function buildOnboardingStageSequence(
    courseData: activeCourse,
    canManageRoster = true
): InstructorOnboardingStage[] {
    const sequence: InstructorOnboardingStage[] = [];
    if (canManageRoster) {
        sequence.push('course-setup');
    }
    sequence.push('document-setup');
    for (const { stage, feature } of FEATURE_ONBOARDING_STAGES) {
        if (isCourseFeatureEnabled(courseData, feature)) {
            sequence.push(stage);
        }
    }
    sequence.push('flag-setup', 'monitor-setup');
    return sequence;
}

/** One-based position of a stage within {@link buildOnboardingStageSequence}, or null. */
export function resolveOnboardingStagePosition(
    stage: InstructorOnboardingStage,
    courseData: activeCourse,
    canManageRoster = true
): { index: number; total: number } | null {
    const sequence = buildOnboardingStageSequence(courseData, canManageRoster);
    const zeroBased = sequence.indexOf(stage);
    return zeroBased === -1 ? null : { index: zeroBased + 1, total: sequence.length };
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/helpers/__tests__/instructor-onboarding-redirect.test.ts`
Expected: PASS, including the pre-existing parity cases.

- [x] **Step 6: Type-check both projects**

Run: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p public/tsconfig.json`
Expected: no output.

- [x] **Step 7: Commit**

```bash
git add public/scripts/utils/onboarding-stage-order.ts src/helpers/instructor-onboarding-redirect.ts src/helpers/__tests__/instructor-onboarding-redirect.test.ts
git commit -m "feat: add onboarding stage labels, skippable set and stage position"
```

---

### Task 2: Mongo delegate that marks every remaining tutorial taught

**Files:**
- Modify: `src/db/mongo/global-user-mongo.ts` (after `completeInstructorOnboardingStage`, line ~225)
- Modify: `src/db/enge-ai-mongodb.ts` (beside the existing delegate at line ~1368)
- Test: `src/db/mongo/__tests__/instructor-onboarding-stage-mongo.test.ts` (extend)

**Interfaces:**
- Consumes: `activeUsersMongoCollection`, `MongoDalContext`, `InstructorOnboardingProgress`, `GlobalUser`.
- Produces: `skipRemainingInstructorOnboardingStages(ctx: MongoDalContext, puid: string): Promise<GlobalUser | null>`, exposed as `EngEAI_MongoDB.skipRemainingInstructorOnboardingStages(puid)`. Also exports `INSTRUCTOR_ONBOARDING_TUTORIAL_STAGES: ReadonlyArray<keyof InstructorOnboardingProgress>` for the route to reuse.

- [x] **Step 1: Write the failing test**

Read the existing file first and follow its mocking style. Append:

```typescript
describe('skipRemainingInstructorOnboardingStages', () => {
    it('sets every tutorial stage true in one update and returns the post-image', async () => {
        const findOneAndUpdate = jest.fn().mockResolvedValue({
            puid: 'puid-1',
            instructorOnboarding: {
                contentSetup: true,
                flagSetup: true,
                monitorSetup: true,
                scenarioGeneration: true,
                writingFeedback: true,
                guidedPathway: true
            }
        });
        const ctx = { db: { collection: jest.fn().mockReturnValue({ findOneAndUpdate }) } } as any;

        const result = await skipRemainingInstructorOnboardingStages(ctx, 'puid-1');

        expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
        const [filter, update, options] = findOneAndUpdate.mock.calls[0];
        expect(filter).toEqual({ puid: 'puid-1' });
        expect(Object.keys(update.$set).sort()).toEqual(
            [
                'instructorOnboarding.contentSetup',
                'instructorOnboarding.flagSetup',
                'instructorOnboarding.guidedPathway',
                'instructorOnboarding.monitorSetup',
                'instructorOnboarding.scenarioGeneration',
                'instructorOnboarding.writingFeedback',
                'updatedAt'
            ].sort()
        );
        expect(update.$set['instructorOnboarding.writingFeedback']).toBe(true);
        expect(update.$set['instructorOnboarding.courseSetup']).toBeUndefined();
        expect(options).toEqual({ returnDocument: 'after' });
        expect(result?.instructorOnboarding?.monitorSetup).toBe(true);
    });

    it('returns null when no user matches the puid', async () => {
        const ctx = {
            db: { collection: jest.fn().mockReturnValue({ findOneAndUpdate: jest.fn().mockResolvedValue(null) }) }
        } as any;
        await expect(skipRemainingInstructorOnboardingStages(ctx, 'missing')).resolves.toBeNull();
    });
});
```

Add `skipRemainingInstructorOnboardingStages` to the file's existing import from `../global-user-mongo`.

- [x] **Step 2: Run the test to verify it fails**

Run: `npx jest src/db/mongo/__tests__/instructor-onboarding-stage-mongo.test.ts`
Expected: FAIL — `skipRemainingInstructorOnboardingStages is not a function`.

- [x] **Step 3: Implement the delegate**

In `src/db/mongo/global-user-mongo.ts`, after `completeInstructorOnboardingStage`:

```typescript
/**
 * Every per-user instructor tutorial key.
 *
 * `courseSetup` is absent on purpose: it is course state, not tutorial progress,
 * and lives on the course document (D-077).
 */
export const INSTRUCTOR_ONBOARDING_TUTORIAL_STAGES: ReadonlyArray<keyof InstructorOnboardingProgress> = [
    'contentSetup',
    'flagSetup',
    'monitorSetup',
    'scenarioGeneration',
    'writingFeedback',
    'guidedPathway'
];

/**
 * skipRemainingInstructorOnboardingStages
 *
 * Marks every instructor tutorial stage taught for the user located by `puid`, which
 * is what choosing Skip tutorial means (D-132): skipping is recorded exactly like
 * being taught, so it follows the person across courses and is not asked again.
 *
 * Writes the six dotted paths in one update for the same reason the single-stage
 * delegate does — a shallow `$set` of `instructorOnboarding` would replace the
 * subdocument. Only ever sets `true`; a stage is never un-completed.
 *
 * @param ctx - MongoDalContext
 * @param puid - Global identity key; never leaves this collection
 * @returns Post-image `GlobalUser`, or `null` when no user matches `puid`
 */
export async function skipRemainingInstructorOnboardingStages(
    ctx: MongoDalContext,
    puid: string
): Promise<GlobalUser | null> {
    const collection = activeUsersMongoCollection(ctx.db);
    const stageUpdates = Object.fromEntries(
        INSTRUCTOR_ONBOARDING_TUTORIAL_STAGES.map(stage => [`instructorOnboarding.${stage}`, true])
    );
    const result = await collection.findOneAndUpdate(
        { puid },
        { $set: { ...stageUpdates, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return (result as unknown as GlobalUser | null) ?? null;
}
```

- [x] **Step 4: Expose it on `EngEAI_MongoDB`**

In `src/db/enge-ai-mongodb.ts`, beside the existing delegate:

```typescript
    /** Marks every instructor tutorial stage taught for this user; see {@link GlobalUserMongo.skipRemainingInstructorOnboardingStages}. */
    public skipRemainingInstructorOnboardingStages = async (puid: string) =>
        GlobalUserMongo.skipRemainingInstructorOnboardingStages(this.ctx(), puid);
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx jest src/db/mongo/__tests__/instructor-onboarding-stage-mongo.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/db/mongo/global-user-mongo.ts src/db/enge-ai-mongodb.ts src/db/mongo/__tests__/instructor-onboarding-stage-mongo.test.ts
git commit -m "feat: add mongo delegate to mark every instructor tutorial taught"
```

---

### Task 3: `POST /api/user/onboarding/skip-remaining`

**Files:**
- Modify: `src/routes/route-user-management.ts` (immediately after the `PATCH /onboarding/instructor-stage` handler, ~line 245)
- Test: Create `src/routes/__tests__/instructor-onboarding-skip-route-contract.test.ts`
- Modify: `documents/ENDPOINT_ARCHITECTURE.md`, `documents/MONGO_DATA_LAYER.md`

**Interfaces:**
- Consumes: `EngEAI_MongoDB.skipRemainingInstructorOnboardingStages` (Task 2), `asyncHandlerWithAuth`, `appLogger`.
- Produces: `POST /api/user/onboarding/skip-remaining` → `200 { success: true, instructorOnboarding }`, `401`, `404`, `500`.

- [x] **Step 1: Write the failing contract test**

Model it on `src/routes/__tests__/instructor-onboarding-stage-route-contract.test.ts` — read that file
first and reuse its app/session/mongo mock harness verbatim, changing only the cases:

```typescript
/**
 * instructor-onboarding-skip-route-contract.test.ts
 *
 * Pins the contract of `POST /api/user/onboarding/skip-remaining`: own-record only,
 * no course scope, and one call into the bulk delegate.
 */

describe('POST /api/user/onboarding/skip-remaining', () => {
    it('marks every tutorial taught and returns the refreshed progress', async () => {
        const instructorOnboarding = {
            contentSetup: true,
            flagSetup: true,
            monitorSetup: true,
            scenarioGeneration: true,
            writingFeedback: true,
            guidedPathway: true
        };
        skipRemaining.mockResolvedValue({ puid: 'puid-1', instructorOnboarding });

        const response = await request(app).post('/api/user/onboarding/skip-remaining').send();

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, instructorOnboarding });
        expect(skipRemaining).toHaveBeenCalledWith('puid-1');
    });

    it('refreshes the session copy so a later read is not stale', async () => {
        const instructorOnboarding = { contentSetup: true, flagSetup: true, monitorSetup: true };
        skipRemaining.mockResolvedValue({ puid: 'puid-1', instructorOnboarding });

        await request(app).post('/api/user/onboarding/skip-remaining').send();

        expect(sessionRef.globalUser.instructorOnboarding).toEqual(instructorOnboarding);
    });

    it('rejects an unauthenticated caller', async () => {
        sessionRef.globalUser = undefined;
        const response = await request(app).post('/api/user/onboarding/skip-remaining').send();
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ success: false, error: 'User not authenticated' });
        expect(skipRemaining).not.toHaveBeenCalled();
    });

    it('reports a missing user as 404', async () => {
        skipRemaining.mockResolvedValue(null);
        const response = await request(app).post('/api/user/onboarding/skip-remaining').send();
        expect(response.status).toBe(404);
        expect(response.body).toEqual({ success: false, error: 'User not found' });
    });

    it('reports a delegate failure as 500 without leaking the cause', async () => {
        skipRemaining.mockRejectedValue(new Error('mongo down'));
        const response = await request(app).post('/api/user/onboarding/skip-remaining').send();
        expect(response.status).toBe(500);
        expect(response.body).toEqual({ success: false, error: 'Failed to skip instructor onboarding' });
    });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx jest src/routes/__tests__/instructor-onboarding-skip-route-contract.test.ts`
Expected: FAIL — 404 from Express, the route does not exist.

- [x] **Step 3: Implement the route**

```typescript
/**
 * POST /onboarding/skip-remaining
 *
 * Records that the caller has chosen to leave the instructor tutorial (D-132), by
 * marking every per-user tutorial stage taught on their own `GlobalUser` record.
 *
 * Writes only the caller's own record, so no course-scoped RBAC applies. `courseSetup`
 * is untouched: it is course configuration, and Skip tutorial is never offered before
 * it is complete.
 *
 * @route POST /api/user/onboarding/skip-remaining
 * @returns {object} { success: boolean, instructorOnboarding?: InstructorOnboardingProgress, error?: string }
 * @response 200 - Success
 * @response 401 - User not authenticated
 * @response 404 - GlobalUser not found
 * @response 500 - Failed to skip
 */
router.post('/onboarding/skip-remaining', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser?.puid) {
            return res.status(401).json({ success: false, error: 'User not authenticated' });
        }

        const mongoDB = await EngEAI_MongoDB.getInstance();
        const updated = await mongoDB.skipRemainingInstructorOnboardingStages(globalUser.puid);
        if (!updated) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Keep the session copy in step so a later read in the same session is not stale.
        (req.session as any).globalUser = {
            ...globalUser,
            instructorOnboarding: updated.instructorOnboarding
        };

        appLogger.log(`[INSTRUCTOR-ONBOARDING] Skipped remaining tutorials for user ${globalUser.userId}`);
        return res.json({ success: true, instructorOnboarding: updated.instructorOnboarding });
    } catch (error) {
        appLogger.error('[INSTRUCTOR-ONBOARDING] Skip error:', error);
        return res.status(500).json({ success: false, error: 'Failed to skip instructor onboarding' });
    }
}));
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx jest src/routes/__tests__/instructor-onboarding-skip-route-contract.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Document the contract**

In `documents/ENDPOINT_ARCHITECTURE.md`, add the endpoint beside the existing
`PATCH /api/user/onboarding/instructor-stage` entry, with the same columns that file uses: method, path,
auth (authenticated, own record), body (none), responses (200/401/404/500), and a one-line note that it
records Skip tutorial by marking every tutorial stage taught.

In `documents/MONGO_DATA_LAYER.md`, add `skipRemainingInstructorOnboardingStages` beside
`completeInstructorOnboardingStage` in the `global-user-mongo` section: keyed by `puid`, sets six dotted
`instructorOnboarding.*` paths plus `updatedAt` in one `findOneAndUpdate`, returns the post-image.

- [x] **Step 6: Commit**

```bash
git add src/routes/route-user-management.ts src/routes/__tests__/instructor-onboarding-skip-route-contract.test.ts documents/ENDPOINT_ARCHITECTURE.md documents/MONGO_DATA_LAYER.md
git commit -m "feat: add endpoint to skip remaining instructor onboarding"
```

---

### Task 4: Skip modal and client

**Files:**
- Modify: `public/scripts/ui/modal-overlay.ts` (add beside `showSkipOnboardingModal` at ~line 882, and to the re-export block at ~line 2078)
- Create: `public/scripts/onboarding/onboarding-skip.ts`
- Test: Create `public/scripts/onboarding/__tests__/onboarding-skip.test.ts`

**Interfaces:**
- Consumes: `showSkipTutorialModal` (added here), `fetch`, `sessionStorage`.
- Produces from `onboarding-skip.ts`:
  - `SKIP_PROMPT_SESSION_KEY = 'engeai.onboarding.skipPromptSeen'`
  - `hasSeenSkipPrompt(storage?: Pick<Storage, 'getItem' | 'setItem'>): boolean`
  - `markSkipPromptSeen(storage?: Pick<Storage, 'getItem' | 'setItem'>): void`
  - `skipRemainingOnboarding(): Promise<void>` — throws `Error` carrying the server message on failure
  - `offerSkipTutorial(): Promise<'skipped' | 'continued'>` — shows the modal, performs the write on confirm

- [x] **Step 1: Write the failing test**

`public/scripts/onboarding/__tests__/onboarding-skip.test.ts` (Node environment — the module must not
touch `document` at import time, and the storage functions take an injectable store so they are testable
without `sessionStorage`):

```typescript
/**
 * onboarding-skip.test.ts
 *
 * Pins the skip client's request shape, error surfacing, and session-scoped
 * prompt memory. Jest runs without a DOM here, so only the DOM-free exports are
 * covered; the modal itself is proven in the browser pass.
 */

import {
    SKIP_PROMPT_SESSION_KEY,
    hasSeenSkipPrompt,
    markSkipPromptSeen,
    skipRemainingOnboarding
} from '../onboarding-skip';

/** Minimal in-memory Storage stand-in. */
function memoryStorage(initial: Record<string, string> = {}) {
    const store = { ...initial };
    return {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        read: () => store
    };
}

describe('skip prompt memory', () => {
    it('is unseen by default and seen once marked', () => {
        const storage = memoryStorage();
        expect(hasSeenSkipPrompt(storage)).toBe(false);
        markSkipPromptSeen(storage);
        expect(hasSeenSkipPrompt(storage)).toBe(true);
        expect(storage.read()[SKIP_PROMPT_SESSION_KEY]).toBe('true');
    });

    it('survives a storage that throws', () => {
        const throwing = {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('blocked');
            }
        };
        expect(hasSeenSkipPrompt(throwing)).toBe(false);
        expect(() => markSkipPromptSeen(throwing)).not.toThrow();
    });
});

describe('skipRemainingOnboarding', () => {
    afterEach(() => {
        delete (global as any).fetch;
    });

    it('posts to the skip endpoint with same-origin credentials', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, instructorOnboarding: { contentSetup: true } })
        });
        (global as any).fetch = fetchMock;

        await skipRemainingOnboarding();

        expect(fetchMock).toHaveBeenCalledWith('/api/user/onboarding/skip-remaining', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin'
        });
    });

    it('throws the server message when the request fails', async () => {
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ error: 'Failed to skip instructor onboarding' })
        });
        await expect(skipRemainingOnboarding()).rejects.toThrow('Failed to skip instructor onboarding');
    });

    it('throws when the body reports failure despite a 200', async () => {
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: false, error: 'User not found' })
        });
        await expect(skipRemainingOnboarding()).rejects.toThrow('User not found');
    });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx jest public/scripts/onboarding/__tests__/onboarding-skip.test.ts`
Expected: FAIL — cannot find module `../onboarding-skip`.

- [x] **Step 3: Add the modal helper**

In `public/scripts/ui/modal-overlay.ts`, directly after `showSkipOnboardingModal`:

```typescript
/**
 * Staff tutorial exit confirmation (D-131).
 *
 * Deliberately separate from {@link showSkipOnboardingModal}, which is the student
 * per-course offer: this one states that the remaining tutorials are marked taught
 * everywhere, because for staff the write is final.
 *
 * Resolved `action` values are slugified button labels: `yes-skip-it` and
 * `no-continue-with-the-tutorial`.
 */
export async function showSkipTutorialModal(): Promise<ModalResult> {
    const modal = getModal();
    return modal.show({
        type: 'info',
        title: 'Skip the onboarding tutorial?',
        content:
            'You can leave the tutorial now and go straight to your course. The remaining tutorials ' +
            'will be marked as taught, so EngE-AI will not show them to you again — on this course or any other.',
        maxWidth: '480px',
        buttons: [
            { text: 'No, continue with the tutorial', type: 'muted', closeOnClick: true },
            { text: 'Yes, skip it', type: 'primary', closeOnClick: true }
        ]
    });
}
```

Add `showSkipTutorialModal` to the module's re-export block beside `showSkipOnboardingModal`.

- [x] **Step 4: Write the skip client**

Create `public/scripts/onboarding/onboarding-skip.ts`:

```typescript
/**
 * onboarding-skip.ts
 *
 * Client for Skip tutorial: the confirmation modal, the own-record write, and the
 * session-scoped memory of having declined.
 *
 * Declining is remembered for the browser session only (D-131). The footer button
 * keeps the exit available, so nothing needs to persist a "no".
 *
 * @author: @rdschrs
 * @date: 2026-09-18
 */

import { showSkipTutorialModal, showErrorModal } from '../ui/modal-overlay.js';

/** Session key recording that the unprompted offer has already been shown. */
export const SKIP_PROMPT_SESSION_KEY = 'engeai.onboarding.skipPromptSeen';

/** Storage surface this module needs; injectable so it is testable without a DOM. */
type PromptStore = Pick<Storage, 'getItem' | 'setItem'>;

/** Session storage when available; a private window or blocked site data yields null. */
function defaultStore(): PromptStore | null {
    try {
        return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
        return null;
    }
}

/**
 * True when the unprompted offer has already been shown this session.
 *
 * A storage that throws reads as unseen: showing the offer once more is a smaller
 * failure than never offering the exit at all.
 */
export function hasSeenSkipPrompt(storage: PromptStore | null = defaultStore()): boolean {
    try {
        return storage?.getItem(SKIP_PROMPT_SESSION_KEY) === 'true';
    } catch {
        return false;
    }
}

/** Records that the unprompted offer has been shown. Never throws. */
export function markSkipPromptSeen(storage: PromptStore | null = defaultStore()): void {
    try {
        storage?.setItem(SKIP_PROMPT_SESSION_KEY, 'true');
    } catch {
        // A blocked store only costs one extra prompt; it must never break the tutorial.
    }
}

/**
 * Marks every remaining instructor tutorial taught on the signed-in user's record.
 *
 * @throws Error carrying the server's message, so callers can keep the instructor in
 *         place behind an error modal rather than navigating on an unrecorded skip
 */
export async function skipRemainingOnboarding(): Promise<void> {
    const response = await fetch('/api/user/onboarding/skip-remaining', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
    });

    const data = await response.json().catch(() => ({ error: 'Failed to skip instructor onboarding' }));
    if (!response.ok || !data?.success) {
        throw new Error(data?.error || `HTTP error! status: ${response.status}`);
    }
}

/**
 * Shows the confirmation and, on confirm, performs the write.
 *
 * @returns `skipped` once the write succeeded, `continued` when staff declined or the
 *          write failed and the error modal has been shown
 */
export async function offerSkipTutorial(): Promise<'skipped' | 'continued'> {
    const result = await showSkipTutorialModal();
    if (result.action !== 'yes-skip-it') {
        return 'continued';
    }

    try {
        await skipRemainingOnboarding();
        return 'skipped';
    } catch (error) {
        await showErrorModal(
            'Could not skip the tutorial',
            error instanceof Error && error.message
                ? error.message
                : 'Your choice could not be saved. Please check your connection and try again.'
        );
        return 'continued';
    }
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx jest public/scripts/onboarding/__tests__/onboarding-skip.test.ts`
Expected: PASS (5 tests).

- [x] **Step 6: Confirm the slug assumption before trusting it**

Run: `grep -n "slug\|toLowerCase\|replace(/" public/scripts/ui/modal-overlay.ts | head -20`
Expected: the button-label slugifier. Read it and confirm `Yes, skip it` becomes exactly `yes-skip-it`;
if it does not, fix the comparison in `offerSkipTutorial` and the TSDoc to the real value, and rerun the test.

- [x] **Step 7: Type-check the frontend and commit**

```bash
npx tsc --noEmit -p public/tsconfig.json
git add public/scripts/ui/modal-overlay.ts public/scripts/onboarding/onboarding-skip.ts public/scripts/onboarding/__tests__/onboarding-skip.test.ts
git commit -m "feat: add staff skip tutorial modal and client"
```

---

### Task 5: Tutorial chrome — banner and cross-stage progress

**Files:**
- Create: `public/scripts/onboarding/onboarding-tutorial-chrome.ts`
- Test: Create `public/scripts/onboarding/__tests__/onboarding-tutorial-chrome.test.ts`
- Modify: `public/styles/instructor-components/onboarding.css` (append a new section before the mobile block at ~line 2623)

**Interfaces:**
- Consumes: `ONBOARDING_STAGE_LABELS`, `resolveOnboardingStagePosition`, `InstructorOnboardingStage` (Task 1).
- Produces:
  - `buildTutorialChromeCopy(stage, course, canManageRoster): { banner: string; position: string; stageLabel: string; percent: number }` — pure, unit-tested
  - `renderTutorialChrome(stage, course, canManageRoster): void` — inserts or updates the chrome at the top of `.onboarding-content-area`

- [x] **Step 1: Write the failing test**

```typescript
/**
 * onboarding-tutorial-chrome.test.ts
 *
 * Pins the tutorial chrome's copy and fill maths. Rendering is DOM work that this
 * Node-environment project cannot execute; the browser pass covers it.
 */

import { buildTutorialChromeCopy } from '../onboarding-tutorial-chrome';

const FULL_COURSE = {
    courseSetup: true,
    features: {
        scenarioGeneration: { enabled: true },
        writingFeedback: { enabled: true },
        guidedPathway: { enabled: true }
    }
};

describe('buildTutorialChromeCopy', () => {
    it('names the mode and the stage position out of the viewer total', () => {
        const copy = buildTutorialChromeCopy('writing-feedback-setup', FULL_COURSE as any, true);
        expect(copy.banner).toBe('Tutorial — nothing you do here changes your live course.');
        expect(copy.position).toBe('Tutorial 4 of 7');
        expect(copy.stageLabel).toBe('Writing Feedback');
    });

    it('counts only the stages this viewer is routed through', () => {
        const noWritingFeedback = {
            courseSetup: true,
            features: {
                scenarioGeneration: { enabled: true },
                writingFeedback: { enabled: false },
                guidedPathway: { enabled: true }
            }
        };
        expect(buildTutorialChromeCopy('flag-setup', noWritingFeedback as any, true).position).toBe(
            'Tutorial 5 of 6'
        );
        expect(buildTutorialChromeCopy('document-setup', FULL_COURSE as any, false).position).toBe(
            'Tutorial 1 of 6'
        );
    });

    it('fills the track by completed stages, so the first stage is not already full', () => {
        expect(buildTutorialChromeCopy('course-setup', FULL_COURSE as any, true).percent).toBe(0);
        expect(buildTutorialChromeCopy('writing-feedback-setup', FULL_COURSE as any, true).percent).toBe(43);
        expect(buildTutorialChromeCopy('monitor-setup', FULL_COURSE as any, true).percent).toBe(86);
    });

    it('falls back to a bannered chrome with no position for a stage outside the sequence', () => {
        const noWritingFeedback = {
            courseSetup: true,
            features: {
                scenarioGeneration: { enabled: true },
                writingFeedback: { enabled: false },
                guidedPathway: { enabled: true }
            }
        };
        const copy = buildTutorialChromeCopy('writing-feedback-setup', noWritingFeedback as any, true);
        expect(copy.position).toBe('Tutorial');
        expect(copy.percent).toBe(0);
        expect(copy.stageLabel).toBe('Writing Feedback');
    });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx jest public/scripts/onboarding/__tests__/onboarding-tutorial-chrome.test.ts`
Expected: FAIL — cannot find module `../onboarding-tutorial-chrome`.

- [x] **Step 3: Implement the chrome module**

```typescript
/**
 * onboarding-tutorial-chrome.ts
 *
 * Renders the shared "you are in a tutorial" chrome above every staff onboarding
 * stage: a banner naming the mode, and a cross-stage progress line (D-133).
 *
 * This is about stages, not steps. The per-stage rail and the mobile step strip
 * already answer "where am I in this stage"; an instructor at a workshop reported
 * that nothing answered "am I still in a tutorial, and how many stages are left".
 *
 * @author: @rdschrs
 * @date: 2026-09-18
 */

import {
    ONBOARDING_STAGE_LABELS,
    resolveOnboardingStagePosition,
    type InstructorOnboardingStage,
    type OnboardingCourseProgress
} from '../utils/onboarding-stage-order.js';

/** Fixed banner copy; the same sentence at every breakpoint and on every stage. */
const BANNER_TEXT = 'Tutorial — nothing you do here changes your live course.';

export interface TutorialChromeCopy {
    banner: string;
    /** `Tutorial 4 of 7`, or plain `Tutorial` when the stage is outside this viewer's sequence. */
    position: string;
    stageLabel: string;
    /** Track fill, 0-100, counting completed stages so the first stage reads empty. */
    percent: number;
}

/**
 * Derives the chrome's copy and fill for one stage.
 *
 * Fill counts *completed* stages (`index - 1`), so entering the first stage shows an
 * empty track and entering the last shows one stage still to go — which is what an
 * instructor mid-tutorial actually has left.
 */
export function buildTutorialChromeCopy(
    stage: InstructorOnboardingStage,
    course: OnboardingCourseProgress,
    canManageRoster = true
): TutorialChromeCopy {
    const stageLabel = ONBOARDING_STAGE_LABELS[stage];
    const position = resolveOnboardingStagePosition(stage, course, canManageRoster);
    if (!position) {
        return { banner: BANNER_TEXT, position: 'Tutorial', stageLabel, percent: 0 };
    }
    return {
        banner: BANNER_TEXT,
        position: `Tutorial ${position.index} of ${position.total}`,
        stageLabel,
        percent: Math.round(((position.index - 1) / position.total) * 100)
    };
}

/**
 * Inserts or updates the chrome at the top of the stage's content area.
 *
 * Idempotent: a controller may call it on every step change. The progress track is
 * `aria-hidden` because the same information is in the adjacent text, which carries
 * `role="status"` so a stage change is announced once rather than twice.
 *
 * @param stage - stage being rendered
 * @param course - course supplying the capability map
 * @param canManageRoster - false for teaching assistants, who never see Course Setup
 */
export function renderTutorialChrome(
    stage: InstructorOnboardingStage,
    course: OnboardingCourseProgress,
    canManageRoster = true
): void {
    const contentArea = document.querySelector<HTMLElement>(
        '.onboarding.staff-onboarding .onboarding-content-area'
    );
    if (!contentArea) return;

    const copy = buildTutorialChromeCopy(stage, course, canManageRoster);

    let chrome = contentArea.querySelector<HTMLElement>('.tutorial-chrome');
    if (!chrome) {
        chrome = document.createElement('div');
        chrome.className = 'tutorial-chrome';
        chrome.innerHTML = `
            <div class="tutorial-chrome__banner" role="note">
                <i data-feather="book-open"></i>
                <span class="tutorial-chrome__banner-text"></span>
            </div>
            <div class="tutorial-chrome__progress" role="status" aria-live="polite" aria-atomic="true">
                <span class="tutorial-chrome__position"></span>
                <span class="tutorial-chrome__stage"></span>
            </div>
            <div class="tutorial-chrome__track" aria-hidden="true">
                <span class="tutorial-chrome__fill"></span>
            </div>
        `;
        contentArea.insertBefore(chrome, contentArea.firstChild);
    }

    chrome.querySelector<HTMLElement>('.tutorial-chrome__banner-text')!.textContent = copy.banner;
    chrome.querySelector<HTMLElement>('.tutorial-chrome__position')!.textContent = copy.position;
    chrome.querySelector<HTMLElement>('.tutorial-chrome__stage')!.textContent = copy.stageLabel;
    chrome.querySelector<HTMLElement>('.tutorial-chrome__fill')!.style.width = `${copy.percent}%`;

    if (typeof (window as any).feather !== 'undefined') {
        (window as any).feather.replace();
    }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx jest public/scripts/onboarding/__tests__/onboarding-tutorial-chrome.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Style the chrome**

Append to `public/styles/instructor-components/onboarding.css`, before the
`SHARED STAFF ONBOARDING STATUS AND MOBILE SHELL` section. Palette variables only — the design guard
rejects any other hex literal:

```css
/* ===========================================
   TUTORIAL CHROME (MODE BANNER + STAGE PROGRESS)
   =========================================== */

.tutorial-chrome {
    display: flex;
    position: relative;
    z-index: 11;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 2rem 0.85rem;
    border-bottom: 1px solid var(--border-color);
    background: #fff;
}

.tutorial-chrome__banner {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    background: var(--gingham-color);
    color: var(--text-primary);
    font-size: 0.88rem;
    font-weight: 600;
}

.tutorial-chrome__banner svg {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    stroke: var(--color-chbe-green);
    stroke-width: 2;
    fill: none;
}

.tutorial-chrome__progress {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.82rem;
}

.tutorial-chrome__position {
    color: var(--text-primary);
    font-weight: 700;
    letter-spacing: 0.01em;
}

.tutorial-chrome__stage {
    min-width: 0;
    overflow: hidden;
    color: var(--text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tutorial-chrome__track {
    width: 100%;
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--border-color);
}

.tutorial-chrome__fill {
    display: block;
    width: 0;
    height: 100%;
    border-radius: 999px;
    background: var(--color-chbe-green);
    transition: width 0.25s ease;
}

@media (max-width: 768px) {
    .tutorial-chrome {
        padding: calc(0.75rem + env(safe-area-inset-top)) max(1rem, env(safe-area-inset-left)) 0.75rem;
    }

    .tutorial-chrome__banner {
        font-size: 0.82rem;
    }
}
```

The mobile block sets `padding: calc(0.75rem + env(safe-area-inset-top)) 7rem …` on
`.staff-onboarding-progress` to clear the floating Help button. The chrome now sits above it, so check in
the browser pass (Task 9) that Help still clears both; if it overlaps, move the top inset onto
`.tutorial-chrome` and drop it from `.staff-onboarding-progress`.

- [x] **Step 6: Commit**

```bash
git add public/scripts/onboarding/onboarding-tutorial-chrome.ts public/scripts/onboarding/__tests__/onboarding-tutorial-chrome.test.ts public/styles/instructor-components/onboarding.css
git commit -m "feat: add tutorial mode banner and cross-stage progress chrome"
```

---

### Task 6: Wire chrome, footer Skip and the one-time offer into all seven stages

**Files:**
- Modify: `public/components/onboarding/scenario-generation-setup.html:218`, `writing-feedback-setup.html:403`, `guided-pathway-setup.html:295`, `flag-setup.html:390`, `monitor-setup.html:247` (the `.onboarding-navigation` block in each)
- Modify: `public/scripts/onboarding/feature-tutorial-runtime.ts`
- Modify: `public/scripts/onboarding/flag-setup.ts`, `public/scripts/onboarding/monitor-setup.ts`, `public/scripts/onboarding/course-setup.ts`, `public/scripts/onboarding/document-setup.ts`
- Modify: `public/scripts/entry/instructor-mode.ts`
- Modify: `public/styles/instructor-components/onboarding.css` (one rule for the skip button)

**Interfaces:**
- Consumes: `renderTutorialChrome` (Task 5), `offerSkipTutorial`, `hasSeenSkipPrompt`, `markSkipPromptSeen` (Task 4), `isSkippableOnboardingStage` (Task 1).
- Produces: a window event `instructorOnboardingSkipped` dispatched after a successful skip, which `instructor-mode.ts` handles by clearing `onboarding-active` and navigating to `/course/:courseId/instructor/dashboard`.

- [x] **Step 1: Add the footer button to the five skippable components**

In each of the five files, inside `.onboarding-navigation`, **before** `#backBtn`:

```html
            <button class="nav-btn btn-skip-tutorial" id="skipTutorialBtn" type="button">
                <span class="nav-btn-text">Skip tutorial</span>
                <i data-feather="fast-forward"></i>
            </button>
```

Leave `course-setup.html` and `document-setup.html` untouched — they are not skippable (D-130).

- [x] **Step 2: Style it as the muted sibling of Back**

Append to `public/styles/instructor-components/onboarding.css`:

```css
.btn-skip-tutorial {
    border: 1px solid var(--border-color);
    background: #fff;
    color: var(--text-secondary);
    font-weight: 600;
}

.btn-skip-tutorial:hover {
    border-color: var(--color-chbe-green);
    color: var(--color-chbe-green);
    transform: translateY(-1px);
}
```

- [x] **Step 3: Write the failing design-guard cases**

Add to `src/helpers/__tests__/onboarding-design-guard.test.ts`:

```typescript
const SKIPPABLE_COMPONENTS = [
    'scenario-generation-setup.html',
    'writing-feedback-setup.html',
    'guided-pathway-setup.html',
    'flag-setup.html',
    'monitor-setup.html'
] as const;
const NON_SKIPPABLE_COMPONENTS = ['course-setup.html', 'document-setup.html'] as const;

describe('skip tutorial affordance', () => {
    it.each(SKIPPABLE_COMPONENTS)('%s offers Skip tutorial in its navigation', file => {
        const markup = readFileSync(join(COMPONENT_DIR, file), 'utf8');
        expect(markup).toContain('id="skipTutorialBtn"');
        expect(markup).toContain('Skip tutorial');
    });

    it.each(NON_SKIPPABLE_COMPONENTS)('%s does not offer Skip tutorial', file => {
        const markup = readFileSync(join(COMPONENT_DIR, file), 'utf8');
        expect(markup).not.toContain('skipTutorialBtn');
    });

    it('styles the skip button and the tutorial chrome from the palette', () => {
        expect(css).toContain('.btn-skip-tutorial');
        expect(css).toContain('.tutorial-chrome__fill');
    });
});
```

- [x] **Step 4: Run it to verify the guard passes for markup and fails for nothing else**

Run: `npx jest src/helpers/__tests__/onboarding-design-guard.test.ts`
Expected: PASS once Steps 1-2 are in place. If the hex-literal case fails, a non-palette colour slipped
into the CSS from Step 5 of Task 5 — fix the colour, not the test.

- [x] **Step 5: Wire the shared feature runtime**

In `public/scripts/onboarding/feature-tutorial-runtime.ts`:

Add imports:

```typescript
import { renderTutorialChrome } from "./onboarding-tutorial-chrome.js";
import { offerSkipTutorial } from "./onboarding-skip.js";
```

Inside `showStep`, immediately after `updateStaffOnboardingProgress(state.currentStep, state.totalSteps);`:

```typescript
            renderTutorialChrome(definition.component, instructorCourse as any, true);
```

And beside the existing `backBtn`/`nextBtn`/`helpBtn` listeners:

```typescript
        // Skip tutorial: the same confirmation as the unprompted offer, available from
        // every skippable stage (D-131). A refused or failed skip leaves the instructor
        // exactly where they were.
        document.getElementById('skipTutorialBtn')?.addEventListener('click', () => {
            void (async () => {
                if (await offerSkipTutorial() === 'skipped') {
                    window.dispatchEvent(new CustomEvent('instructorOnboardingSkipped'));
                }
            })();
        });
```

- [x] **Step 6: Wire the four hand-written controllers**

`flag-setup.ts` and `monitor-setup.ts` get exactly the same two additions as Step 5, with their own stage
slug (`'flag-setup'`, `'monitor-setup'`) and their own course variable, placed beside their existing
`updateStaffOnboardingProgress` call and their existing `#backBtn` listener registration
(`flag-setup.ts:167`, `monitor-setup.ts:241`).

`course-setup.ts` and `document-setup.ts` get the `renderTutorialChrome` call only — they have no skip
button, so add no listener:

```typescript
    renderTutorialChrome('course-setup', state.course as any, true);
```

Use each controller's own course reference; if a controller has no course in scope at that point, pass
`window.currentClass as any`, which `instructor-mode.ts:505` sets before any stage renders.

- [x] **Step 7: Handle the skip in `instructor-mode.ts`**

Add the import beside the existing onboarding imports:

```typescript
import { hasSeenSkipPrompt, markSkipPromptSeen, offerSkipTutorial } from '../onboarding/onboarding-skip.js';
```

and `isSkippableOnboardingStage` to the existing import from `'../utils/onboarding-stage-order.js'`.

Beside the other completion listeners (after the `monitorSetupComplete` listener, ~line 573):

```typescript
    /**
     * Leaves onboarding after a successful skip.
     *
     * The write already marked every tutorial taught, so the resolver will not route
     * this user back in; the local mirror is updated so the redirect below is decided
     * on the same facts the server now holds.
     */
    window.addEventListener('instructorOnboardingSkipped', () => {
        instructorOnboarding = {
            ...instructorOnboarding,
            contentSetup: true,
            flagSetup: true,
            monitorSetup: true,
            scenarioGeneration: true,
            writingFeedback: true,
            guidedPathway: true
        };
        document.body.classList.remove('onboarding-active');

        const courseId = getCourseIdFromURL();
        window.location.href = courseId
            ? `/course/${courseId}/instructor/dashboard`
            : '/';
    });
```

In `renderOnboardingStage` (~line 1029), after the stage's renderer has been invoked, add the unprompted
one-time offer:

```typescript
        // First skippable stage of the session: offer the exit once, unprompted (D-131).
        // Course Setup and Course Content are excluded, so this fires immediately after
        // Course Content is finished, whichever stage the resolver picks next.
        if (isSkippableOnboardingStage(stage) && !hasSeenSkipPrompt()) {
            markSkipPromptSeen();
            void (async () => {
                if (await offerSkipTutorial() === 'skipped') {
                    window.dispatchEvent(new CustomEvent('instructorOnboardingSkipped'));
                }
            })();
        }
```

Read the surrounding code before inserting: the offer must run after `await` of the stage renderer, so
the modal is not covered by the component swap.

- [x] **Step 8: Verify the whole suite and both builds**

Run: `npx jest src/helpers src/routes public/scripts/onboarding && npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p public/tsconfig.json && npm run build`
Expected: all green; `npm run build` completes without a TypeScript error.

- [x] **Step 9: Commit**

```bash
git add public/components/onboarding public/scripts/onboarding public/scripts/entry/instructor-mode.ts public/styles/instructor-components/onboarding.css src/helpers/__tests__/onboarding-design-guard.test.ts
git commit -m "feat: offer skip tutorial and show tutorial chrome on every stage"
```

---

### Task 7: Word-count ceilings that keep the tutorials short

**Files:**
- Modify: `src/helpers/__tests__/onboarding-design-guard.test.ts`

**Interfaces:**
- Consumes: `COMPONENT_DIR` and `readFileSync` already in the file.
- Produces: `WORD_CEILINGS` and a case per component. Task 8 must make these pass; this task lands the
  failing guard first so the trim has a target.

- [x] **Step 1: Write the failing ceilings**

```typescript
/**
 * On-screen word ceilings per tutorial (D-134).
 *
 * An instructor at a workshop reported the tutorials were too long. The fix was to
 * move second-order detail into the per-step Help panels, not to drop features, so
 * these ceilings count every word a step renders on screen and deliberately exclude
 * the `#help-step-N` panels, which open only on request.
 */
const WORD_CEILINGS: Record<string, number> = {
    'course-setup.html': 470,
    'document-setup.html': 430,
    'scenario-generation-setup.html': 520,
    'writing-feedback-setup.html': 1250,
    'guided-pathway-setup.html': 620,
    'flag-setup.html': 620,
    'monitor-setup.html': 500
};

/** Strips tags, then the help panels, and counts what remains. */
function onScreenWordCount(markup: string): number {
    const withoutHelp = markup.replace(/<div id="help-step-[\s\S]*$/, '');
    return withoutHelp
        .replace(/<[^>]*>/g, ' ')
        .replace(/&[a-z]+;/g, ' ')
        .split(/\s+/)
        .filter(Boolean).length;
}

describe('tutorial concision', () => {
    it.each(Object.entries(WORD_CEILINGS))('%s stays within %i on-screen words', (file, ceiling) => {
        const words = onScreenWordCount(readFileSync(join(COMPONENT_DIR, file), 'utf8'));
        expect(words).toBeLessThanOrEqual(ceiling);
    });
});
```

- [x] **Step 2: Run it and record the starting gap**

Run: `npx jest src/helpers/__tests__/onboarding-design-guard.test.ts -t 'tutorial concision'`
Expected: FAIL for at least `writing-feedback-setup.html` (about 2300 words against a 1250 ceiling) and
likely `guided-pathway-setup.html` and `flag-setup.html`. Write the reported numbers down — Task 8 works
against them.

- [x] **Step 3: Commit the guard as the trim's definition of done**

```bash
git add src/helpers/__tests__/onboarding-design-guard.test.ts
git commit -m "test: pin on-screen word ceilings for staff tutorials"
```

---

### Task 8: Trim the tutorials and refresh Writing Feedback

**Files:**
- Modify: all seven `public/components/onboarding/*-setup.html` files
- Test: `src/helpers/__tests__/onboarding-design-guard.test.ts` (must go green; do not raise a ceiling)

**Interfaces:**
- Consumes: the ceilings from Task 7 and the per-step Help panels already present in every component
  (`#help-step-1` … `#help-step-N`).
- Produces: no code interface. Step ids, step counts, `data-requires-completion` attributes, rail
  `data-step` values and `#help-step-N` numbering are unchanged — the controllers key off them.

- [x] **Step 1: Fix the two stale Writing Feedback sentences first (D-128, D-135)**

`public/components/onboarding/writing-feedback-setup.html:326` currently ends
"…approve the feedback, preview the release, and release it." Replace with:

```html
                        <p><strong>Suggested grading never leaves this page.</strong> It is a staff-only reading aid. A numeric grade reaches the student or Canvas only when course staff save a final assessment, approve the feedback, and release it.</p>
```

`:357` currently says the release card shows "…with a preview before anything is sent." Replace with:

```html
                        <p>The feedback is now marked approved. In your real course the release card appears next with a single <strong>Release to Canvas</strong> action, and it states exactly what the student will receive before you use it. Release sends the student-facing PDF comment and, when you saved a staff-final numeric assessment, the grade. Feedback is released once per submission; a correction means a new attempt.</p>
```

- [x] **Step 2: Describe the two-step review (D-124–D-127) inside the existing review step**

In the step 4 body, replace the opening paragraph ("Generation is queued rather than instant — …") with:

```html
                        <p>Generation is queued rather than instant; the page refreshes when the draft is ready. Review then runs in two steps. <strong>Annotations</strong> comes first: each comment names the criterion it addresses and quotes the passage it is about, so you can check the judgement rather than take it on trust. <strong>Next</strong> moves to <strong>Summary</strong>, and if you changed the annotations it redrafts the summary and suggested levels from what you left behind. A lab report keeps its Technical and Writing tabs on both steps. The annotations you end with are the ones printed in the student's PDF.</p>
```

Move the detail this displaces — how the redraft is stored, what happens if you edited the summary
yourself — into `#help-step-4`.

- [x] **Step 3: Trim `writing-feedback-setup.html` to the ceiling**

Work step by step, and for each one move rather than delete. The mechanical rules:

1. Where a step has two or more consecutive `.completion-note` blocks, keep the single most decision-relevant one on screen and move the rest into that step's `#help-step-N` panel, each as its own `<p>`.
2. Collapse any pair of sentences that state a rule and then restate it as a consequence into one sentence.
3. Keep every heading, every `.wf-setup-rubric-demo` block, the worked example comments, and every step id.
4. Delete nothing that names a feature, a guarantee, or a limit; those either stay on screen or move to Help.

Specifically for this component: step 2 carries four stacked `.completion-note` blocks (rubric provenance,
the auto-fill button, save-versus-approve, post-approval versioning) — keep save-versus-approve on screen,
move the other three into `#help-step-2`. Step 4's "What else the review page gives you" list has five
items with two sentences each; reduce each to its first sentence and move the second into `#help-step-4`.
Step 5's four trailing `.completion-note` blocks reduce to the one about students never seeing internal
fields; the release blocks move to `#help-step-5`.

- [x] **Step 4: Run the ceiling for this file alone**

Run: `npx jest src/helpers/__tests__/onboarding-design-guard.test.ts -t 'writing-feedback-setup.html'`
Expected: PASS at or under 1250 words. If it is still over, continue moving `.completion-note` bodies into
Help — never raise the ceiling, and never drop a feature.

- [x] **Step 5: Trim the remaining six components by the same rules**

Apply rules 1-4 to `guided-pathway-setup.html` (860 → ≤620), `flag-setup.html` (831 → ≤620),
`scenario-generation-setup.html` (630 → ≤520), `monitor-setup.html` (591 → ≤500),
`course-setup.html` (572 → ≤470), `document-setup.html` (478 → ≤430). In each, the surplus is
`.completion-note` stacks and restated consequences, so the same two moves carry the whole cut.

- [x] **Step 6: Verify the guard, the builds and the layout**

Run: `npx jest src/helpers/__tests__/onboarding-design-guard.test.ts && npm run build && npm run check:onboarding-layout`
Expected: every ceiling passes; the design guard's hex/emoji/callout cases still pass; the layout guard
reports no control covered by the floating navigation. The navigation now has three buttons, so the
layout guard is the check that matters most here — if it fails, the Skip button widened the footer onto a
gating control, and the fix is to let `.onboarding-navigation` wrap on narrow viewports, not to move the
gating control.

- [x] **Step 7: Commit**

```bash
git add public/components/onboarding
git commit -m "docs: trim staff tutorials and refresh writing feedback copy"
```

---

### Task 9: Verification pass, memory, and handoff

**Files:**
- Modify: `../project-memory/01 Project Memory/Current State.md`, `../project-memory/01 Project Memory/Decisions.md`, `../project-memory/01 Project Memory/Open Questions.md`
- Create: `../project-memory/02 Session Log/2026-09-18 - Onboarding Skip Progress And Concision.md`

- [ ] **Step 1: Run the focused suites**

Run: `npx jest src/helpers src/routes src/db/mongo public/scripts/onboarding`
Expected: PASS. Record the suite/test counts for the memory note.

- [ ] **Step 2: Run the full suite and compare against the recorded baseline**

Run: `npx jest 2>&1 | tail -30`
Expected: the three known inherited failures and possibly the `route-lms` load flake, and nothing new. If
`route-lms` fails, rerun it alone (`npx jest src/routes/__tests__/route-lms`) and record that it passes
in isolation.

- [ ] **Step 3: Run both type checks, the build, and the whitespace check**

Run: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p public/tsconfig.json && npm run build && git diff --check`
Expected: no output from any of them.

- [ ] **Step 4: Browser pass at 1440, 768 and 390 px**

Start the app (`npm run dev`) against a synthetic staff course with all three capabilities enabled, and an
instructor account owing every stage. Use the Playwright recipe already proven in this workspace (cached
Chromium plus the NSS libraries from cached Firefox under `~/.cache/ms-playwright`). Check, at each width:

1. Course Setup and Course Content show the chrome (banner, `Tutorial 1 of 7` / `Tutorial 2 of 7`, empty then 1/7-filled track) and **no** Skip button.
2. Finishing Course Content lands on the next stage and the skip modal opens unprompted, with both button labels exactly as specified.
3. **No, continue with the tutorial** closes it, leaves the instructor on the stage, and it does not reopen after a reload of that stage.
4. The footer **Skip tutorial** button is present on all five skippable stages and reopens the same modal.
5. **Yes, skip it** lands on the instructor dashboard, the sidebar is visible, `onboarding-active` is gone, and re-entering the course goes straight to the dashboard.
6. `Tutorial N of M` increments across stages and the track grows; with Writing Feedback disabled on the course, the total reads 6 and the Writing Feedback stage never appears.
7. The Help button still opens the right panel on every step of every stage, including the steps whose text moved into Help.
8. No horizontal overflow, no console error, no 5xx, and the floating navigation covers no gating control.

Record which checks passed at which widths. Any defect found here is fixed and the affected checks rerun
before Step 5.

- [ ] **Step 5: Write the memory note and update the shared memory**

Create `../project-memory/02 Session Log/2026-09-18 - Onboarding Skip Progress And Concision.md` following
the shape of the existing logs: context (branch `feat/onboarding-skip-progress-trim` from `origin/main`
`8667cfd`), completed work per task, verification with the real numbers, what was not run, and next steps.

Add D-130 … D-135 to `Decisions.md` with status `Implemented 2026-09-18` and the rationale from the spec.
Add a `Current State.md` section dated 2026-09-18 at the top. Add to `Open Questions.md`: whether a
completed or skipped tutorial should ever be replayable from the interface rather than by URL, and whether
the word ceilings should also cover the Help panels.

No PUIDs, no student text, no credentials in any of it.

- [ ] **Step 6: Commit**

```bash
git add "../project-memory/01 Project Memory" "../project-memory/02 Session Log"
git commit -m "docs: record onboarding skip and concision session"
```

- [ ] **Step 7: Report and stop**

Report to the user: the branch name, the commits, the verification numbers, the browser-pass result, and
the fact that nothing has been pushed and no pull request opened — both need an explicit request. Ask
whether to open one.

---

## Self-review

**Spec coverage.** D-130 → Task 1 (`SKIPPABLE_ONBOARDING_STAGES`) and Task 6 Step 1. D-131 → Task 4
(modal, session memory) and Task 6 Steps 5-7 (footer button on five stages, one-time offer in
`renderOnboardingStage`). D-132 → Tasks 2 and 3. D-133 → Tasks 1 and 5, wired in Task 6 Steps 5-6.
D-134 → Tasks 7 and 8. D-135 → Task 8 Steps 1-2. New endpoint, delegate and browser helpers all have a
task; `documents/ENDPOINT_ARCHITECTURE.md` and `documents/MONGO_DATA_LAYER.md` are updated in Task 3;
memory in Task 9.

**Placeholders.** None: every code step carries the code, every test step the assertions, and the trim
task names the specific blocks to move rather than saying "shorten the copy".

**Type consistency.** `buildOnboardingStageSequence` / `resolveOnboardingStagePosition` /
`isSkippableOnboardingStage` / `ONBOARDING_STAGE_LABELS` keep the same names and signatures in Tasks 1,
5 and 6. `skipRemainingInstructorOnboardingStages` is the delegate name in Tasks 2 and 3.
`offerSkipTutorial` returns `'skipped' | 'continued'` in Task 4 and is consumed that way in Task 6.
The event name `instructorOnboardingSkipped` is dispatched in Task 6 Steps 5-6 and handled in Step 7.
`INSTRUCTOR_ONBOARDING_TUTORIAL_STAGES` is exported in Task 2 and the six keys it holds are the six the
Task 3 test asserts.

**Known unverifiable-by-Jest surface.** The banner, the track, the modal and the trimmed layout are
visual; Task 9 Step 4 is what proves them, and Tasks 6-7 pin as much as text can.
