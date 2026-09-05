# Course-document grounding, full-screen PDF viewer, rubric autosave, and Canvas rating ranges — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Writing Feedback staff workspace a full-screen PDF viewer, real course-document grounding for the feedback writer, an autosaving rubric page, and points ranges on rubrics imported from Canvas.

**Architecture:** Four independent changes on one branch. Part A is CSS plus one deleted inline style. Part D is a pure-function change inside the Canvas import mapper. Part C adds a DOM-free debounce/single-flight module plus a narrow save path in the rubric page. Part B extends course-material retrieval to run per finding cluster, carries chunk text (not just labels) into the writer prompt, and keeps citation restricted to published material by making the published set the writer's allowlist.

**Tech Stack:** TypeScript (Node backend, vanilla browser bundle), Express, MongoDB, Jest 30 + ts-jest (`node` environment, no jsdom), PDFKit, Qdrant via `ubc-genai-toolkit-rag`.

**Spec:** `docs/superpowers/specs/2026-09-05-grounding-viewer-autosave-canvas-bands-design.md`

## Global Constraints

- Never edit generated `dist/` or `public/dist/` files.
- Student submissions never enter the course-material RAG/Qdrant pipeline. No retrieval query may contain `SflFinding.evidence[].quote`, `observation`, or `functionalInterpretation`.
- Never log submission text, prompt bodies containing it, OAuth tokens, PUIDs, or generated feedback content.
- Student-facing output carries no confidence, model metadata, internal flags, retrieval scores, or staff notes.
- Model results are drafts; a human approves before release. Nothing in this plan writes to an approved rubric or releases anything.
- Shared API types are mirrored in `src/types/shared.ts` and `public/scripts/types.ts`; Writing Feedback browser types live in `public/scripts/feature/writing-feedback-shared.ts`. The band helpers are mirrored in `src/writing-feedback/rubric-bands.ts` and `public/scripts/feature/writing-feedback-grid.ts` and pinned by `public/scripts/feature/__tests__/rubric-band-parity.test.ts`.
- Filenames lowercase kebab-case; values/functions camelCase; types/classes PascalCase.
- Exported APIs carry behavior-first TSDoc; non-trivial pipelines carry step comments.
- Tests run with `npx jest --config jest.config.cjs`. Jest roots are `src` and `public/scripts`; tests live in `__tests__/*.test.ts` beside the code.
- Regression baseline at `7e0e5bb`: 1156 / 1160 passing, the four failures being the known unrelated `scenario-practice-limits` policy conflict. Any other failure is new.
- Do not commit or push outside the commit steps written in this plan. Preserve unrelated worktree changes.
- **Decision number correction:** the spec reserved `D-099`, but `D-099`, `D-100`, and `D-101` are already taken (new-course capability defaults and the onboarding navigation-clearance decisions). This work records **D-102**.

---

## File Structure

**Part A — viewer**
- `public/styles/modal-overlay.css` — splits the shared `.modal--viewer, .modal--grading` rules and gives the viewer full-screen geometry.
- `public/styles/instructor-components/writing-feedback.css` — `.wf-pdf-frame` follows its container.
- `public/scripts/ui/modal-overlay.ts` — `showViewerModal` stops setting an inline `max-width`.
- `src/writing-feedback/__tests__/viewer-modal-source.test.ts` (new) — source guard, the idiom `writing-feedback-review-source.test.ts` already uses for CSS/DOM code the Node test environment cannot render.

**Part B — grounding**
- `src/rag/rag-app.ts` — Writing-Feedback-only retrieval option that searches all course material and stamps each chunk as published or not. Chat retrieval untouched.
- `src/writing-feedback/course-material-mentions.ts` — per-finding clustering, the student-text-free query builder, excerpt budgeting, and one grounding result object.
- `src/writing-feedback/contracts.ts` — `CourseMaterialExcerpt`, plus two staff-only trace fields.
- `src/writing-feedback/sfl-foundation.ts` — prompt/resolver version bumps.
- `src/writing-feedback/feedback-engine.ts` — excerpt block in the writer prompt, per-finding mention attachment, published-only allowlist.
- `src/report-generation/writing-feedback-report.ts` — student-facing source list.
- `public/scripts/feature/writing-feedback-shared.ts` — browser mirror of the staff mention list on a run.
- `public/scripts/feature/writing-feedback-review.ts` — staff source list marks unpublished material.

**Part C — autosave**
- `public/scripts/feature/writing-feedback-autosave.ts` (new) — DOM-free debounce + single-flight state machine.
- `public/scripts/feature/__tests__/writing-feedback-autosave.test.ts` (new).
- `public/scripts/feature/writing-feedback-rubric.ts` — the narrow autosave write path and its status line.
- `public/styles/instructor-components/writing-feedback.css` — status line style.

**Part D — Canvas bands**
- `src/writing-feedback/canvas-rubric-mapping.ts` — `buildCells` derives bands from rating cut points.
- `src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts` — band derivation and edge cases.
- `public/scripts/feature/__tests__/rubric-band-parity.test.ts` — Canvas-derived bands render as ranges in the browser mirror.
- `../project-memory/01 Project Memory/Decisions.md` — D-102.

---

## Task 1: Full-screen PDF viewer (Part A)

**Files:**
- Modify: `public/styles/modal-overlay.css:1216-1230`, `public/styles/modal-overlay.css:303` (media block)
- Modify: `public/styles/instructor-components/writing-feedback.css:2799-2806`
- Modify: `public/scripts/ui/modal-overlay.ts:717-737`
- Test: `src/writing-feedback/__tests__/viewer-modal-source.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on. `showViewerModal(title: string, frame: HTMLElement, downloadUrl: string): Promise<ModalResult>` keeps its signature.

- [ ] **Step 1: Write the failing source guard**

Create `src/writing-feedback/__tests__/viewer-modal-source.test.ts`:

```ts
/**
 * @fileoverview Source guard for the full-screen PDF viewer. The Jest environment is
 * `node` with no jsdom and no CSS engine, so the geometry is pinned by reading the
 * stylesheet and the modal helper rather than by rendering them. The browser pass is
 * what proves it looks right; this is what stops it silently regressing.
 */

import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..', '..');
const modalCss = fs.readFileSync(path.join(repoRoot, 'public', 'styles', 'modal-overlay.css'), 'utf8');
const wfCss = fs.readFileSync(
    path.join(repoRoot, 'public', 'styles', 'instructor-components', 'writing-feedback.css'),
    'utf8'
);
const modalSource = fs.readFileSync(
    path.join(repoRoot, 'public', 'scripts', 'ui', 'modal-overlay.ts'),
    'utf8'
);

/** The declarations of one rule, found by its exact selector text. */
function rule(css: string, selector: string): string {
    const index = css.indexOf(selector);
    if (index < 0) return '';
    return css.slice(index, css.indexOf('}', index) + 1);
}

describe('the PDF viewer modal owns its own geometry', () => {
    it('gives the viewer container a real width and height, not only a cap', () => {
        const viewer = rule(modalCss, '.modal--viewer.modal-container {');
        expect(viewer).toContain('width: 96vw;');
        expect(viewer).toContain('height: 96dvh;');
        expect(viewer).toContain('max-width: none;');
        expect(viewer).toContain('max-height: none;');
        expect(viewer).toContain('flex-direction: column;');
    });

    it('lets the viewer body shrink below its content so the frame is not clipped', () => {
        const body = rule(modalCss, '.modal--viewer .modal-body {');
        expect(body).toContain('min-height: 0;');
        expect(body).toContain('flex: 1;');
    });

    it('escapes the responsive cap that applies to every other modal', () => {
        const narrow = rule(modalCss, '@media (max-width: 768px)');
        expect(narrow).toContain('max-width: calc(100vw - 2rem);');
        expect(modalCss).toContain('.modal--viewer.modal-container {\n        width: 100vw;');
    });

    it('keeps the grading modal off the viewer rules', () => {
        expect(modalCss).not.toContain('.modal--viewer .modal-body,\n.modal--grading .modal-body {');
        expect(rule(modalCss, '.modal--grading .modal-body {')).toContain('max-height: none;');
    });

    it('makes the frame follow its container instead of competing with it', () => {
        expect(rule(wfCss, '.wf-pdf-frame {')).toContain('height: 100%;');
        expect(wfCss).not.toContain('height: min(82vh, 1000px);');
    });

    it('stops showViewerModal setting an inline max-width over the class', () => {
        const viewerFn = modalSource.match(/export async function showViewerModal[\s\S]*?\n}/)?.[0] ?? '';
        expect(viewerFn).toContain("customClass: 'modal--viewer'");
        expect(viewerFn).not.toContain('maxWidth');
    });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/viewer-modal-source.test.ts`
Expected: FAIL — every assertion about `.modal--viewer.modal-container` fails, because the rule does not exist yet.

- [ ] **Step 3: Split the shared viewer/grading rules and give the viewer its geometry**

In `public/styles/modal-overlay.css`, replace the block that currently reads:

```css
.modal--viewer .modal-body,
.modal--grading .modal-body {
    max-height: none;
    padding: 1rem 1.25rem;
}

.modal--viewer .modal-content,
.modal--grading .modal-content {
    line-height: 1.4;
}
```

with:

```css
/*
 * The viewer is the document, not a dialog about the document, so it takes the screen.
 * `.modal-container` sets a max-width and no width: a shrink-to-fit box holding an iframe
 * resolved that iframe's `width: 100%` against the iframe's own intrinsic 300px, so the
 * 1500px cap was never reached. A real width, a flex column, and `min-height: 0` on the
 * body are what make the frame fill the modal instead of being clipped by `max-height: 90vh`.
 * `dvh` keeps the footer clear of a mobile browser's collapsing address bar; the `vh`
 * declaration above it is the fallback for engines without `dvh`.
 */
.modal--viewer.modal-container {
    width: 96vw;
    height: 96vh;
    height: 96dvh;
    max-width: none;
    max-height: none;
    display: flex;
    flex-direction: column;
}

.modal--viewer .modal-header {
    padding: 0.75rem 1.25rem 0.75rem 1.5rem;
}

.modal--viewer .modal-body {
    flex: 1;
    /* A flex child will not shrink below its content without this, which puts the clipping back. */
    min-height: 0;
    max-height: none;
    overflow: hidden;
    padding: 0.5rem;
}

.modal--viewer .modal-content,
.modal--grading .modal-content {
    line-height: 1.4;
}

.modal--grading .modal-body {
    max-height: none;
    padding: 1rem 1.25rem;
}
```

- [ ] **Step 4: Override the responsive cap**

In the same file, inside the existing `@media (max-width: 768px)` block, after the `.modal-container { ... }` rule, add:

```css
    /*
     * The rule above caps every modal at `calc(100vw - 2rem)`. The viewer is the one
     * surface that must reach the edges: on a phone a PDF page at 90% width is unreadable.
     */
    .modal--viewer.modal-container {
        width: 100vw;
        height: 100vh;
        height: 100dvh;
        max-width: none;
        max-height: none;
        margin: 0;
        border-radius: 0;
    }
```

- [ ] **Step 5: Make the frame follow its container**

In `public/styles/instructor-components/writing-feedback.css`, in `.wf-pdf-frame`, replace `height: min(82vh, 1000px);` with `height: 100%;`.

- [ ] **Step 6: Drop the inline max-width**

In `public/scripts/ui/modal-overlay.ts`, in `showViewerModal`, delete the line `maxWidth: 'min(1500px, 96vw)',`, and add to its TSDoc, above `@param title`:

```
 * Geometry lives in `.modal--viewer` rather than an inline `maxWidth`: an inline style
 * outranks the class, so the two cannot both own the width.
```

- [ ] **Step 7: Run the guard and the build**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/viewer-modal-source.test.ts`
Expected: PASS (6 tests)

Run: `npx tsc --noEmit -p public/tsconfig.json`
Expected: no output

- [ ] **Step 8: Commit**

```bash
git add public/styles/modal-overlay.css public/styles/instructor-components/writing-feedback.css public/scripts/ui/modal-overlay.ts src/writing-feedback/__tests__/viewer-modal-source.test.ts
git commit -m "fix: open the feedback PDF viewer at full screen"
```

---

## Task 2: Points ranges from an imported Canvas rubric (Part D)

**Files:**
- Modify: `src/writing-feedback/canvas-rubric-mapping.ts:225-249`
- Test: `src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts`
- Test: `public/scripts/feature/__tests__/rubric-band-parity.test.ts`
- Modify: `/home/crodas/EngE-AI/project-memory/01 Project Memory/Decisions.md`

**Interfaces:**
- Consumes: `spaceBandsEvenly(points: number, levels: ReadonlyArray<WritingRubricLevel>): Record<WritingLevelId, WritingRubricCell>` from `./rubric-bands`; `weakestFirst`, `pointsOrUndefined`, `MAX_DESCRIPTOR` already in `canvas-rubric-mapping.ts`.
- Produces: `buildCells` stays private. Its output shape is unchanged — `Record<string, WritingRubricCell>` with `{ min, max, descriptor? }` — only the values change.

- [ ] **Step 1: Write the failing tests**

Append to `src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts` (the file already defines the `rubric` and `row` helpers used here):

```ts
describe('a Canvas rating is read as the top of a band', () => {
    it('derives contiguous non-overlapping bands from the rating cut points', () => {
        const mapped = mapCanvasRubric(rubric([
            row('Clarity', [['Exemplary', 15], ['Proficient', 12], ['Developing', 8], ['Weak', 5]], 15)
        ]));
        const [criterion] = mapped.criteria;
        const bands = mapped.levels.map((level) => criterion!.cells![level.id]);
        expect(bands).toEqual([
            { min: 0, max: 5, descriptor: 'Weak descriptor' },
            { min: 6, max: 8, descriptor: 'Developing descriptor' },
            { min: 9, max: 12, descriptor: 'Proficient descriptor' },
            { min: 13, max: 15, descriptor: 'Exemplary descriptor' }
        ]);
    });

    it('reaches the criterion weight when the strongest rating sits below it', () => {
        const mapped = mapCanvasRubric(rubric([
            row('Clarity', [['Strong', 8], ['Weak', 4]], 10)
        ]));
        const cells = mapped.criteria[0]!.cells!;
        const tops = mapped.levels.slice(0, 2).map((level) => cells[level.id]!.max);
        expect(tops).toEqual([4, 10]);
    });

    it('collapses duplicate rating points instead of inverting a band', () => {
        const mapped = mapCanvasRubric(rubric([
            row('Clarity', [['Best', 3], ['Same', 3], ['Also', 3]], 3)
        ]));
        const cells = mapped.criteria[0]!.cells!;
        mapped.levels.slice(0, 3).forEach((level) => {
            const cell = cells[level.id]!;
            expect(cell.min).toBeLessThanOrEqual(cell.max);
        });
    });

    it('falls back to even spacing when no rating carries points', () => {
        const withoutPoints = rubric([row('Clarity', [['Strong', 0], ['Weak', 0]], 10)]);
        withoutPoints.rows[0]!.ratings.forEach((rating) => { delete (rating as { points?: number }).points; });
        const mapped = mapCanvasRubric(withoutPoints);
        const cells = mapped.criteria[0]!.cells!;
        const bands = mapped.levels.slice(0, 2).map((level) => cells[level.id]);
        expect(bands).toEqual([{ min: 0, max: 5 }, { min: 6, max: 10 }]);
    });

    it('bands only the columns a short row actually has, leaving aligned gaps as gaps', () => {
        const mapped = mapCanvasRubric(rubric([
            row('Full', [['Exemplary', 15], ['Proficient', 12], ['Developing', 8], ['Weak', 5]], 15),
            row('Short', [['Ok', 6], ['No', 2]], 6)
        ]));
        const short = mapped.criteria[1]!.cells!;
        expect(Object.keys(short)).toHaveLength(2);
        expect(short[mapped.levels[0]!.id]).toEqual({ min: 0, max: 2, descriptor: 'No descriptor' });
        expect(short[mapped.levels[1]!.id]).toEqual({ min: 3, max: 6, descriptor: 'Ok descriptor' });
    });

    it('produces a draft the rubric schema still accepts', () => {
        const mapped = mapCanvasRubric(rubric([
            row('Clarity', [['Exemplary', 15], ['Proficient', 12], ['Developing', 8], ['Weak', 5]], 15)
        ]));
        const parsed = writingRubricDraftInputSchema.safeParse({
            title: 'Essay',
            task: 'Write an essay about a process you observed.',
            audience: 'First-year peers',
            purpose: 'Explain a process',
            gradingIntent: 'Grade on clarity',
            constraints: ['800 words'],
            learningOutcomes: ['Explain a process clearly'],
            criteria: mapped.criteria,
            levels: mapped.levels
        });
        expect(parsed.success).toBe(true);
    });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts -t 'top of a band'`
Expected: FAIL — received bands are `{ min: 5, max: 5 }`, `{ min: 8, max: 8 }`, and so on.

- [ ] **Step 3: Derive the bands in `buildCells`**

In `src/writing-feedback/canvas-rubric-mapping.ts`, add to the imports at the top of the file:

```ts
import { spaceBandsEvenly } from './rubric-bands';
```

Then replace the whole `buildCells` function and the doc comment above it with:

```ts
/**
 * Aligns one row's ratings to the shared columns, weakest to weakest, and derives a
 * points band per level.
 *
 * A Canvas rating is a cut point rather than a single awarded value (D-102), so each
 * level's band runs from one point above the previous rating up to its own rating. The
 * bands do not overlap, which is what lets `earnedLevelFor` name exactly one level for a
 * staff-final score. This happens at import rather than at display time: the stored draft
 * is what the student PDF, suggested grading, and the Canvas write-back all read.
 *
 * A row with fewer ratings than the rubric has columns leaves its strongest columns absent,
 * which the grid renders as empty cells. Canvas gives no way to know *which* distinction a
 * shorter row is missing, so this does not guess at the middle — the instructor fills the gaps
 * while the draft is still unapproved.
 */
function buildCells(row: CanvasRubricRow, levels: WritingRubricLevel[]): Record<string, WritingRubricCell> {
    const cells: Record<string, WritingRubricCell> = {};
    const ordered = weakestFirst(row.ratings);
    const rowPoints = pointsOrUndefined(row.points);

    // Step 1: a row whose ratings carry no points at all has no cut points to read, so its
    // weight is spread evenly across the columns it does fill, exactly as a hand-authored
    // criterion is. With no weight either, there is nothing to band and the cells stay ordinal.
    const unrated = ordered.every((rating) => pointsOrUndefined(rating.points) === undefined);
    const evenly = unrated && rowPoints !== undefined
        ? spaceBandsEvenly(rowPoints, levels.slice(0, ordered.length))
        : undefined;

    // Step 2: walk weakest to strongest, each band starting one point above the last.
    let previousTop = -1;
    ordered.forEach((rating, index) => {
        const level = levels[index];
        if (!level) return;
        // Only a descriptor Canvas actually supplied. `descriptor` is optional, and the grid
        // already prompts "Enter a description" on a cell that has none — which is the honest
        // state here. Falling back to the rating name would just repeat the column header.
        const descriptor = (rating.description ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_DESCRIPTOR);
        const spread = descriptor ? { descriptor } : {};

        if (evenly) {
            const band = evenly[level.id];
            if (band) cells[level.id] = { ...band, ...spread };
            return;
        }

        const rated = pointsOrUndefined(rating.points) ?? 0;
        // The strongest rating can sit below the criterion's own weight; the top band reaches
        // the weight so the row's full points stay awardable.
        const top = index === ordered.length - 1 && rowPoints !== undefined
            ? Math.max(rated, rowPoints)
            : rated;
        // Duplicate or descending rating points would otherwise produce a floor above the
        // ceiling, which the draft schema rejects outright. Same guard `spaceBandsEvenly` uses.
        const min = Math.min(previousTop + 1, top);
        cells[level.id] = { min, max: top, ...spread };
        previousTop = top;
    });

    return cells;
}
```

- [ ] **Step 4: Run the mapping suite**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts src/writing-feedback/__tests__/canvas-rubric-shape-fidelity.test.ts src/writing-feedback/__tests__/canvas-import-service.test.ts`
Expected: PASS. If an older assertion in these files expects `{ min: n, max: n }` from an imported rating, update that assertion to the derived band — that expectation is what this task changes.

- [ ] **Step 5: Extend the band mirror parity test**

Append to `public/scripts/feature/__tests__/rubric-band-parity.test.ts`:

```ts
describe('Canvas-derived bands render as ranges in the browser mirror', () => {
    it('shows the derived band, not a single number', () => {
        // The bands the backend derives at import (canvas-rubric-mapping buildCells) are the
        // bands the browser grid renders; a single number here means the import regressed.
        expect(formatBand({ min: 0, max: 5 })).toBe('0–5');
        expect(formatBand({ min: 6, max: 8 })).toBe('6–8');
        expect(parseBand('13–15')).toEqual({ min: 13, max: 15 });
    });
});
```

- [ ] **Step 6: Run the parity test**

Run: `npx jest --config jest.config.cjs public/scripts/feature/__tests__/rubric-band-parity.test.ts`
Expected: PASS

- [ ] **Step 7: Record D-102**

Append one row to the decision table in `/home/crodas/EngE-AI/project-memory/01 Project Memory/Decisions.md`, matching the existing `| D-0NN | Confirmed | ... | ... |` column format:

```
| D-102 | Confirmed | A rating on an imported Canvas rubric is read as the top of a points band rather than as a single awarded value. `buildCells` derives contiguous non-overlapping bands from the ratings sorted weakest-first, at import rather than at display time. Rubrics imported before this keep `min === max` and are not migrated. | Canvas rubrics arrived showing one number per level while hand-authored rubrics showed ranges, so the same grid meant two different things. The ratings are already cut points, so the range is recoverable without inventing anything. Deriving at display time would leave the stored draft degenerate for the student PDF, `earnedLevelFor`, and the Canvas write-back, and would put the browser band mirror out of step with the backend. Supersedes the single-value rule stated in `canvas-rubric-mapping.ts`. Legacy imports stay readable through the D-096 clamp. |
```

- [ ] **Step 8: Commit**

```bash
git add src/writing-feedback/canvas-rubric-mapping.ts src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts public/scripts/feature/__tests__/rubric-band-parity.test.ts "/home/crodas/EngE-AI/project-memory/01 Project Memory/Decisions.md"
git commit -m "feat: derive points bands from Canvas rating cut points"
```

---

## Task 3: Autosave state machine (Part C, module)

**Files:**
- Create: `public/scripts/feature/writing-feedback-autosave.ts`
- Test: `public/scripts/feature/__tests__/writing-feedback-autosave.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces, used by Task 4:
  - `type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'stopped'`
  - `interface AutosaveOptions { write: () => Promise<void>; onStatus: (state: AutosaveState) => void; debounceMs?: number; maxWaitMs?: number; now?: () => number; }`
  - `interface AutosaveState { status: AutosaveStatus; savedAt?: number; message?: string; }`
  - `interface Autosave { markDirty(): void; flush(): Promise<void>; stop(message: string): void; state(): AutosaveState; }`
  - `function createAutosave(options: AutosaveOptions): Autosave`
  - `class AutosaveSignedOutError extends Error` — thrown by the caller's `write` to stop the loop.

- [ ] **Step 1: Write the failing tests**

Create `public/scripts/feature/__tests__/writing-feedback-autosave.test.ts`:

```ts
/**
 * Autosave state machine tests.
 *
 * The module is deliberately DOM-free (the Jest project is Node with no jsdom), so all of
 * the timing, single-flight, and stop-on-signed-out behaviour is testable here. Only the
 * reading of the form and the drawing of the status line live in the page.
 */

import { AutosaveSignedOutError, createAutosave } from '../writing-feedback-autosave';
import type { AutosaveState } from '../writing-feedback-autosave';

jest.useFakeTimers();

function harness(write: () => Promise<void>, options: { maxWaitMs?: number } = {}) {
    const seen: AutosaveState[] = [];
    const autosave = createAutosave({
        write,
        onStatus: (state) => seen.push(state),
        debounceMs: 2000,
        maxWaitMs: options.maxWaitMs ?? 30000,
        now: () => Date.now()
    });
    return { autosave, seen, statuses: () => seen.map((state) => state.status) };
}

describe('autosave cadence', () => {
    it('writes two seconds after typing stops, not on every keystroke', async () => {
        const write = jest.fn(async () => {});
        const { autosave } = harness(write);

        autosave.markDirty();
        jest.advanceTimersByTime(1500);
        autosave.markDirty();
        jest.advanceTimersByTime(1500);
        expect(write).not.toHaveBeenCalled();

        jest.advanceTimersByTime(500);
        await Promise.resolve();
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('forces a write after the max wait even while typing continues', async () => {
        const write = jest.fn(async () => {});
        const { autosave } = harness(write);

        autosave.markDirty();
        for (let elapsed = 0; elapsed < 30000; elapsed += 1000) {
            jest.advanceTimersByTime(1000);
            autosave.markDirty();
        }
        await Promise.resolve();
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('reports saving then saved', async () => {
        const { autosave, statuses } = harness(async () => {});
        autosave.markDirty();
        jest.advanceTimersByTime(2000);
        await jest.runAllTimersAsync();
        expect(statuses()).toEqual(['pending', 'saving', 'saved']);
    });
});

describe('single flight', () => {
    it('does not start a second write while one is in progress', async () => {
        let release = (): void => {};
        const write = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));
        const { autosave } = harness(write);

        autosave.markDirty();
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
        expect(write).toHaveBeenCalledTimes(1);

        autosave.markDirty();
        jest.advanceTimersByTime(10000);
        expect(write).toHaveBeenCalledTimes(1);

        release();
        await jest.runAllTimersAsync();
        expect(write).toHaveBeenCalledTimes(2);
    });
});

describe('failure handling', () => {
    it('reports an error and keeps trying on an ordinary failure', async () => {
        const write = jest.fn()
            .mockRejectedValueOnce(new Error('Network down'))
            .mockResolvedValueOnce(undefined);
        const { autosave, seen } = harness(write as () => Promise<void>);

        autosave.markDirty();
        await jest.runAllTimersAsync();
        expect(seen.some((state) => state.status === 'error' && state.message === 'Network down')).toBe(true);

        autosave.markDirty();
        await jest.runAllTimersAsync();
        expect(write).toHaveBeenCalledTimes(2);
    });

    it('stops the loop when the session has expired', async () => {
        const write = jest.fn(async () => { throw new AutosaveSignedOutError(); });
        const { autosave } = harness(write);

        autosave.markDirty();
        await jest.runAllTimersAsync();
        expect(autosave.state().status).toBe('stopped');

        autosave.markDirty();
        await jest.runAllTimersAsync();
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('stays stopped once stopped by the page', async () => {
        const write = jest.fn(async () => {});
        const { autosave } = harness(write);
        autosave.stop('Signed out');
        autosave.markDirty();
        await jest.runAllTimersAsync();
        expect(write).not.toHaveBeenCalled();
        expect(autosave.state().message).toBe('Signed out');
    });
});

describe('flush', () => {
    it('writes immediately when dirty', async () => {
        const write = jest.fn(async () => {});
        const { autosave } = harness(write);
        autosave.markDirty();
        await autosave.flush();
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('does nothing when clean', async () => {
        const write = jest.fn(async () => {});
        const { autosave } = harness(write);
        await autosave.flush();
        expect(write).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx jest --config jest.config.cjs public/scripts/feature/__tests__/writing-feedback-autosave.test.ts`
Expected: FAIL — `Cannot find module '../writing-feedback-autosave'`.

- [ ] **Step 3: Write the module**

Create `public/scripts/feature/writing-feedback-autosave.ts`:

```ts
/**
 * writing-feedback-autosave.ts
 *
 * The rubric page's background save, with no DOM in sight.
 *
 * An instructor filling in a rubric can be signed out mid-edit and lose the lot. This
 * keeps a stored draft close behind what is on screen without changing what explicit
 * Save means: Save still validates, still reports, and is still what an instructor
 * presses before approving.
 *
 * DOM-free on purpose, in the same idiom as writing-feedback-rubric-progress.ts: the
 * Jest project runs in Node with no jsdom, so timing and single-flight logic that lives
 * here can be tested and logic that lives in the renderer cannot.
 *
 * @author: @rdschrs
 * @date: 2026-09-05
 * @version: 1.0.0
 */

/** Where the loop is, in the words the status line uses. */
export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'stopped';

/** One observable step of the loop. `savedAt` is set only once a write has succeeded. */
export interface AutosaveState {
    status: AutosaveStatus;
    savedAt?: number;
    message?: string;
}

/** Thrown by a caller's `write` when the session has expired; stops the loop for good. */
export class AutosaveSignedOutError extends Error {
    constructor(message = 'Signed out') {
        super(message);
        this.name = 'AutosaveSignedOutError';
    }
}

export interface AutosaveOptions {
    /** Performs one write. Resolving means stored; throwing means not stored. */
    write: () => Promise<void>;
    /** Called on every state change, for the status line. */
    onStatus: (state: AutosaveState) => void;
    /** Quiet period after the last edit. Default two seconds. */
    debounceMs?: number;
    /** Longest a dirty draft may go unwritten while edits keep arriving. Default thirty seconds. */
    maxWaitMs?: number;
    /** Injectable clock, so tests can assert the saved-at stamp. */
    now?: () => number;
}

export interface Autosave {
    /** Records an edit and arms the timer. */
    markDirty(): void;
    /** Writes now if dirty. Used on visibility change and page hide. */
    flush(): Promise<void>;
    /** Stops the loop permanently and shows `message`. */
    stop(message: string): void;
    /** Current state, for callers that need it outside a status callback. */
    state(): AutosaveState;
}

/**
 * createAutosave - debounced, single-flight background save.
 *
 * Edits arriving during a write do not queue another write; they re-arm the timer once
 * the in-flight one settles, so a fast typist produces one write per quiet period rather
 * than a backlog of them.
 *
 * @param options - Write function, status sink, and cadence overrides
 * @returns Handle the page drives from its input and lifecycle events
 */
export function createAutosave(options: AutosaveOptions): Autosave {
    const debounceMs = options.debounceMs ?? 2000;
    const maxWaitMs = options.maxWaitMs ?? 30000;
    const now = options.now ?? (() => Date.now());

    let current: AutosaveState = { status: 'idle' };
    let dirty = false;
    let inFlight = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirtySince = 0;

    const publish = (next: AutosaveState): void => {
        current = next;
        options.onStatus(current);
    };

    const clear = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
    };

    const run = async (): Promise<void> => {
        clear();
        if (stopped || inFlight || !dirty) return;
        inFlight = true;
        dirty = false;
        publish({ status: 'saving', ...(current.savedAt !== undefined ? { savedAt: current.savedAt } : {}) });
        try {
            await options.write();
            publish({ status: 'saved', savedAt: now() });
        } catch (error) {
            if (error instanceof AutosaveSignedOutError) {
                stopped = true;
                publish({
                    status: 'stopped',
                    ...(current.savedAt !== undefined ? { savedAt: current.savedAt } : {}),
                    message: error.message
                });
                return;
            }
            // An ordinary failure leaves the draft dirty: the next edit, or the next forced
            // flush, tries again rather than the page silently giving up.
            dirty = true;
            publish({
                status: 'error',
                ...(current.savedAt !== undefined ? { savedAt: current.savedAt } : {}),
                message: error instanceof Error ? error.message : 'Could not save'
            });
        } finally {
            inFlight = false;
            // Step: re-arm once, for edits that arrived while this write was in the air.
            if (dirty && !stopped) arm();
        }
    };

    const arm = (): void => {
        clear();
        // The forced flush is what keeps a continuous typist from going unsaved: the quiet
        // period never arrives, so the deadline decides instead.
        const deadline = dirtySince + maxWaitMs;
        const delay = Math.max(0, Math.min(debounceMs, deadline - now()));
        timer = setTimeout(() => { void run(); }, delay);
    };

    return {
        markDirty(): void {
            if (stopped) return;
            if (!dirty) dirtySince = now();
            dirty = true;
            if (current.status !== 'saving') {
                publish({ status: 'pending', ...(current.savedAt !== undefined ? { savedAt: current.savedAt } : {}) });
            }
            if (!inFlight) arm();
        },
        async flush(): Promise<void> {
            if (stopped || !dirty) return;
            await run();
        },
        stop(message: string): void {
            stopped = true;
            dirty = false;
            clear();
            publish({ status: 'stopped', ...(current.savedAt !== undefined ? { savedAt: current.savedAt } : {}), message });
        },
        state(): AutosaveState {
            return current;
        }
    };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest --config jest.config.cjs public/scripts/feature/__tests__/writing-feedback-autosave.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Type-check the browser bundle**

Run: `npx tsc --noEmit -p public/tsconfig.json`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add public/scripts/feature/writing-feedback-autosave.ts public/scripts/feature/__tests__/writing-feedback-autosave.test.ts
git commit -m "feat: add a debounced single-flight autosave state machine"
```

---

## Task 4: Wire autosave into the rubric page (Part C, page)

**Files:**
- Modify: `public/scripts/feature/writing-feedback-rubric.ts` (imports; new `autosaveAssignmentRubrics`; status line in step 3 near `public/scripts/feature/writing-feedback-rubric.ts:1476`; input hooks near `:2023`)
- Modify: `public/styles/instructor-components/writing-feedback.css`
- Test: `src/writing-feedback/__tests__/rubric-autosave-source.test.ts` (create)

**Interfaces:**
- Consumes from Task 3: `createAutosave`, `AutosaveSignedOutError`, types `Autosave`, `AutosaveState`.
- Consumes, already in the page: `readAssignmentDetails(form): AssignmentDetailsInput`, `readSflContext(...)`, `collectAssignmentDetails(form)`, `collectSflContext(...)`, `collectRubricStructure(form, working, errorLabel): RubricStructureInput`, `jsonRequest<T>(path, method, body)`, `RubricPageContext`, `state.panelDirty`.
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Write the failing source guard**

Create `src/writing-feedback/__tests__/rubric-autosave-source.test.ts`:

```ts
/**
 * @fileoverview Source guard for the rubric page's autosave wiring. The page needs a DOM
 * to run, and the Jest project has none, so the invariants that matter — no technical
 * rubric seeded in the background, no throwing collector on the autosave path, a stop on
 * 401 — are pinned by reading the source. The state machine itself is unit-tested in
 * public/scripts/feature/__tests__/writing-feedback-autosave.test.ts.
 */

import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-rubric.ts'),
    'utf8'
);

const autosavePath = source.match(/async function autosaveAssignmentRubrics[\s\S]*?\n}\n/)?.[0] ?? '';

describe('rubric page autosave wiring', () => {
    it('has its own narrow write path', () => {
        expect(autosavePath).not.toBe('');
    });

    it('never seeds a technical rubric in the background', () => {
        expect(autosavePath).not.toContain('/lab-report');
        expect(autosavePath).not.toContain('technicalMissing');
    });

    it('never approves in the background', () => {
        expect(autosavePath).not.toContain('rubric-draft/approve');
    });

    it('reads without throwing on a half-filled form', () => {
        expect(autosavePath).toContain('readAssignmentDetails(');
        expect(autosavePath).not.toContain('collectAssignmentDetails(');
    });

    it('writes through the draft route only', () => {
        expect(autosavePath).toContain("/rubric-draft");
        expect(autosavePath).toContain("'PUT'");
    });

    it('stops the loop and says so when the session has expired', () => {
        expect(source).toContain('AutosaveSignedOutError');
        expect(source).toContain("You've been signed out");
    });

    it('clears the page dirty flag once a background write succeeds', () => {
        expect(source).toMatch(/status === 'saved'[\s\S]{0,200}state\.panelDirty = false/);
    });

    it('flushes on page hide and on visibility change', () => {
        expect(source).toContain("'visibilitychange'");
        expect(source).toContain("'pagehide'");
    });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/rubric-autosave-source.test.ts`
Expected: FAIL on the first assertion — `autosaveAssignmentRubrics` does not exist.

- [ ] **Step 3: Add the narrow write path**

In `public/scripts/feature/writing-feedback-rubric.ts`, add to the imports:

```ts
import { AutosaveSignedOutError, createAutosave } from './writing-feedback-autosave.js';
import type { Autosave, AutosaveState } from './writing-feedback-autosave.js';
```

Add, directly below `saveAssignmentRubrics`:

```ts
/**
 * autosaveAssignmentRubrics - the background write, deliberately narrower than Save
 *
 * Save cannot be reused for this. `collectAssignmentDetails` throws on an incomplete
 * form, which is correct for a button and wrong for something that fires while an
 * instructor is still typing; and `saveAssignmentRubrics` seeds a technical rubric when
 * a lab report is missing one, which a background write must never do. So this reads
 * through the non-throwing readers, validates by attempting the same collectors inside a
 * try, and simply skips the cycle when the form is not yet writable — leaving the last
 * good stored draft where it is.
 *
 * It writes only through the per-rubric draft route, which never touches the approved
 * rubric and reuses an existing draft's version, so repeating it does not walk the
 * version number forward.
 *
 * @param context - Page context holding the details form and registered editors
 * @throws AutosaveSignedOutError when the session has expired; any other transport error
 *         as thrown, for the status line to report
 */
async function autosaveAssignmentRubrics(context: RubricPageContext): Promise<void> {
    const details = readAssignmentDetails(context.detailsForm);
    const storedGenreId = context.sections
        .find((section) => section.lens === 'linguistic')?.working.sflContext?.genreId;

    // Step 1: refuse the cycle silently on anything the real save would reject. A
    // background write that stored a half-typed rubric would be worse than not writing.
    let pending: Array<{ section: RubricSectionHandle; structure: RubricStructureInput }>;
    let sflContext: SflContextProfile;
    try {
        collectAssignmentDetails(context.detailsForm);
        sflContext = collectSflContext(context.detailsForm, details, storedGenreId ?? undefined);
        pending = context.sections
            .filter((section) => section.canEdit)
            .map((section) => ({
                section,
                structure: collectRubricStructure(section.form, section.working, section.errorLabel)
            }));
    } catch {
        return;
    }

    const labContext = rubricTextValue(context.detailsForm, 'labContext').slice(0, MAX_LAB_CONTEXT) || undefined;

    // Step 2: write each editable rubric. Nothing is seeded and nothing is approved here.
    for (const { section, structure } of pending) {
        const input: RubricDraftInput = {
            ...details,
            ...structure,
            ...(section.lens === 'linguistic' ? { sflContext } : {}),
            ...(section.lens === 'technical' ? { labContext } : {})
        };
        try {
            await jsonRequest<Assignment>(
                `/assignments/${encodeURIComponent(context.assignment.id)}/rubric-draft${section.lens === 'technical' ? '?lens=technical' : ''}`,
                'PUT',
                input
            );
        } catch (error) {
            // The shared envelope reports an expired session as a plain failed request, so
            // the message is what identifies it. Retrying that blind would spin against a
            // login wall; the loop stops and the page says which draft is stored.
            const message = error instanceof Error ? error.message : '';
            if (/unauthor|not signed in|session/i.test(message)) throw new AutosaveSignedOutError(message);
            throw error;
        }
    }
}
```

If `SflContextProfile`, `RubricStructureInput`, `RubricSectionHandle`, or `RubricDraftInput` is not already imported or declared in this file, take the name the file already uses for it rather than adding an import — all four are used by `saveAssignmentRubrics` immediately above.

- [ ] **Step 4: Render the status line and drive the loop**

In the block that builds step 3 (`const actions = document.createElement('div'); actions.className = 'wf-button-row';`), add the status line and the autosave handle immediately before `approveRow.append(actions);`:

```ts
        // A quiet marker beside Save, not a toast: this reports something that happens on
        // its own, and it must not compete with the explicit Save's success message.
        const autosaveStatus = document.createElement('p');
        autosaveStatus.className = 'wf-autosave-status';
        autosaveStatus.setAttribute('role', 'status');
        autosaveStatus.setAttribute('aria-live', 'polite');
        actions.append(autosaveStatus);

        const savedClock = (at?: number): string =>
            at === undefined ? '' : new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const renderAutosave = (autosaveState: AutosaveState): void => {
            if (autosaveState.status === 'saved') state.panelDirty = false;
            const stamp = savedClock(autosaveState.savedAt);
            autosaveStatus.textContent =
                autosaveState.status === 'saving' ? 'Saving…'
                : autosaveState.status === 'saved' ? `Saved ${stamp}`
                : autosaveState.status === 'stopped'
                    ? `You've been signed out — your last saved draft is from ${stamp || 'before this session'}. Sign in again to keep editing.`
                : autosaveState.status === 'error' ? `Not saved — ${autosaveState.message ?? 'try Save for now'}`
                : '';
            autosaveStatus.classList.toggle('wf-autosave-status--alert',
                autosaveState.status === 'error' || autosaveState.status === 'stopped');
        };

        rubricAutosave = createAutosave({
            write: () => autosaveAssignmentRubrics(pageContext),
            onStatus: renderAutosave
        });

        // The page is rebuilt on every open, so these listeners are registered against the
        // handle current at that moment rather than a captured one.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') void rubricAutosave?.flush();
        });
        window.addEventListener('pagehide', () => { void rubricAutosave?.flush(); });
```

Declare the handle beside the other page-scoped mutable bindings at the top of the same render function (next to `refreshProgress`):

```ts
    // Held at page scope so the input hooks and the lifecycle listeners drive the same loop.
    let rubricAutosave: Autosave | undefined;
```

- [ ] **Step 5: Mark dirty where the page already does**

Both places that set `state.panelDirty = true` on staff input (`public/scripts/feature/writing-feedback-rubric.ts:1328` and `:2023`) gain the autosave nudge on the line below:

```ts
            rubricAutosave?.markDirty();
```

At `:1353`, where the flag is set conditionally, add the same call inside the `canEdit` branch. Do not add it to any line that sets `panelDirty = false`.

- [ ] **Step 6: Style the status line**

Append to `public/styles/instructor-components/writing-feedback.css`:

```css
/*
 * Autosave reports itself beside Save rather than through a toast: it happens without
 * being asked, so it should be readable and easy to ignore. The alert variant is the one
 * state a person must act on — an expired session — so it is the only one that takes colour.
 */
.wf-autosave-status {
    margin: 0;
    align-self: center;
    font-size: 0.85rem;
    color: var(--text-2, #5b6b5b);
    min-height: 1.2em;
}

.wf-autosave-status--alert {
    color: var(--danger-1, #a3352c);
}
```

- [ ] **Step 7: Run the guard and both type-checks**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/rubric-autosave-source.test.ts public/scripts/feature/__tests__/writing-feedback-autosave.test.ts`
Expected: PASS

Run: `npx tsc --noEmit -p public/tsconfig.json`
Expected: no output

- [ ] **Step 8: Commit**

```bash
git add public/scripts/feature/writing-feedback-rubric.ts public/styles/instructor-components/writing-feedback.css src/writing-feedback/__tests__/rubric-autosave-source.test.ts
git commit -m "feat: autosave the rubric draft while staff edit it"
```

---

## Task 5: Publish-aware Writing Feedback retrieval (Part B, retrieval seam)

**Files:**
- Modify: `src/rag/rag-app.ts:28-33` (options), `:239-292` (`retrieveForWritingFeedback`)
- Test: `src/writing-feedback/__tests__/course-material-grounding.test.ts` (create — also used by Tasks 6 and 7)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `interface WritingFeedbackRetrieveOptions extends RetrieveForChatOptions { includeUnpublished?: boolean; }`
  - `interface PublishedTaggedChunk extends RetrievedChunk { published: boolean; }`
  - `retrieveForWritingFeedback(query: string, courseId: string, options?: WritingFeedbackRetrieveOptions): Promise<PublishedTaggedChunk[]>`

- [ ] **Step 1: Write the failing test**

Create `src/writing-feedback/__tests__/course-material-grounding.test.ts` with this first block (Tasks 6 and 7 append to the same file):

```ts
/**
 * Course-material grounding tests — what the writer may read, and what it may cite.
 *
 * The load-bearing rule here is that no retrieval query may contain student writing:
 * evidence quotes are exact student text, and `observation` and `functionalInterpretation`
 * are model prose written about that text. Student submissions never enter the
 * course-material pipeline, so the query is built only from curated fields.
 *
 * @author: @rdschrs
 */

import { RAGApp } from '../../rag/rag-app';

describe('Writing Feedback retrieval scope', () => {
    it('offers an include-unpublished option that chat retrieval does not use', () => {
        // The published filter is what makes material visible to students, so chat keeps it.
        // Writing Feedback grounds the writer on the whole uploaded corpus and restricts
        // *citation* instead — see the allowlist in feedback-engine.
        const method = RAGApp.prototype.retrieveForWritingFeedback.toString();
        expect(method).toContain('includeUnpublished');
        expect(RAGApp.prototype.retrieveForChat.toString()).not.toContain('includeUnpublished');
    });

    it('tags every returned chunk with whether its item is published', () => {
        expect(RAGApp.prototype.retrieveForWritingFeedback.toString()).toContain('published:');
    });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/course-material-grounding.test.ts`
Expected: FAIL — `includeUnpublished` is not in the method source.

- [ ] **Step 3: Extend the retrieval options and the method**

In `src/rag/rag-app.ts`, below `RetrieveForChatOptions`, add:

```ts
/**
 * Writing-Feedback-only retrieval scope.
 *
 * Chat retrieval must stay published-only: publishing a topic/week item is what makes
 * its material visible to students. Writing Feedback grounds the feedback writer on
 * everything staff have uploaded — an instructor who loads a Week 5 lecture in advance
 * should not have it ignored — and restricts citation instead, which the caller does by
 * building its allowlist from the published subset alone.
 */
export interface WritingFeedbackRetrieveOptions extends RetrieveForChatOptions {
    /** Search unpublished topic/week items as well, marking their chunks accordingly. */
    includeUnpublished?: boolean;
}

/** A retrieved chunk plus whether the item it came from is visible to students. */
export interface PublishedTaggedChunk extends RetrievedChunk {
    published: boolean;
}
```

Then, in `retrieveForWritingFeedback`, change the signature to:

```ts
    public async retrieveForWritingFeedback(
        query: string,
        courseId: string,
        options: WritingFeedbackRetrieveOptions = {}
    ): Promise<PublishedTaggedChunk[]> {
```

and replace the body between `const course = await mongoDB.getActiveCourse(courseId);` and the `return await this.rag.retrieveContext(...)` line with:

```ts
            if (!course) return [];

            // Step 1: collect the searchable items, remembering which are published. The
            // published set is what the caller may cite; the whole set is what it may read.
            const publishedTitles = new Set<string>();
            const searchTitles = new Set<string>();
            (course.topicOrWeekInstances ?? [])
                .filter((instanceTopicOrWeek: TopicOrWeekInstance) => !options.topicOrWeekId || instanceTopicOrWeek.id === options.topicOrWeekId)
                .forEach((instanceTopicOrWeek: TopicOrWeekInstance) => {
                    const published = instanceTopicOrWeek.published === true;
                    if (!published && !options.includeUnpublished) return;
                    (instanceTopicOrWeek.items ?? []).forEach((item: TopicOrWeekItem) => {
                        const itemTitle = item.itemTitle || (item as { title?: string }).title || '';
                        if (!itemTitle) return;
                        searchTitles.add(itemTitle);
                        if (published) publishedTitles.add(itemTitle);
                    });
                });

            if (searchTitles.size === 0) return [];

            const filter: Record<string, unknown> = {
                must: [
                    { key: 'courseName', match: { value: course.courseName } },
                    { key: 'itemTitle', match: { any: [...searchTitles] } },
                ],
            };

            // Step 2: tag each chunk so the caller can ground on all of it and cite only the
            // published part. Chunk content is deliberately never logged here.
            const chunks = await this.rag.retrieveContext(` ${query}`, { limit, scoreThreshold, filter });
            return chunks.map((chunk: RetrievedChunk): PublishedTaggedChunk => {
                const metadata = typeof chunk.metadata === 'string'
                    ? (() => { try { return JSON.parse(chunk.metadata) as Record<string, unknown>; } catch { return {}; } })()
                    : (chunk.metadata ?? {});
                const itemTitle = typeof metadata.itemTitle === 'string' ? metadata.itemTitle : '';
                return { ...chunk, published: publishedTitles.has(itemTitle) };
            });
```

Update the method's TSDoc `@returns` line to: `@returns Retrieved chunks tagged with publication state, or an empty list when retrieval is unavailable`.

- [ ] **Step 4: Run the test and the backend type-check**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/course-material-grounding.test.ts`
Expected: PASS (2 tests)

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/rag/rag-app.ts src/writing-feedback/__tests__/course-material-grounding.test.ts
git commit -m "feat: let Writing Feedback retrieval read unpublished course material"
```

---

## Task 6: Per-finding retrieval (Part B1)

**Files:**
- Modify: `src/writing-feedback/course-material-mentions.ts`
- Test: `src/writing-feedback/__tests__/course-material-grounding.test.ts`

**Interfaces:**
- Consumes from Task 5: `PublishedTaggedChunk`, `WritingFeedbackRetrieveOptions`.
- Produces, used by Tasks 7 and 8:
  - `interface CourseMaterialGrounding { mentions: CourseMaterialMention[]; staffMentions: CourseMaterialMention[]; byFinding: Map<string, CourseMaterialMention[]>; excerpts: CourseMaterialExcerpt[]; }` (`excerpts` stays empty until Task 7)
  - `function buildFindingRetrievalQuery(assignment: WritingAssignment, finding: SflFinding): string`
  - `function findingClusterKey(finding: SflFinding): string`
  - `async function resolveCourseMaterialGrounding(assignment, analysis, retriever?): Promise<CourseMaterialGrounding>`
  - `resolveCourseMaterialMentions` stays exported with its current signature, delegating to the above and returning `.mentions`.
  - `WritingFeedbackMaterialRetriever.retrieve` now returns `Promise<PublishedTaggedChunk[]>`.
  - `const MAX_RETRIEVAL_QUERIES = 8`

- [ ] **Step 1: Write the failing tests**

Append to `src/writing-feedback/__tests__/course-material-grounding.test.ts`:

```ts
import {
    MAX_RETRIEVAL_QUERIES,
    buildFindingRetrievalQuery,
    findingClusterKey,
    resolveCourseMaterialGrounding
} from '../course-material-mentions';
import type { WritingFeedbackMaterialRetriever } from '../course-material-mentions';
import type { SflAnalysis, SflFinding, WritingAssignment } from '../contracts';

const QUOTE = 'ZZQUOTEZZ the reaction proceeded rapidly';
const OBSERVATION = 'ZZOBSERVATIONZZ nominalisation carries the process';
const INTERPRETATION = 'ZZINTERPRETATIONZZ the writer compresses the method';

function finding(overrides: Partial<SflFinding> = {}): SflFinding {
    return {
        id: 'f1',
        evidence: [{ quote: QUOTE }],
        observation: OBSERVATION,
        functionalInterpretation: INTERPRETATION,
        primaryFunction: 'Content',
        crossFunctions: [],
        languageLevel: 'clause',
        ruleIds: [],
        sourceIds: [],
        confidence: 0.6,
        alternatives: [],
        ...overrides
    } as SflFinding;
}

function assignment(): WritingAssignment {
    return {
        id: 'a1',
        courseId: 'c1',
        title: 'Process description',
        rubric: {
            status: 'approved',
            task: 'Describe a process you observed in the lab.',
            criteria: [],
            levels: [],
            sflContext: {
                genreLabel: 'Process description',
                field: 'Chemical engineering',
                mode: 'Written report',
                genreState: 'founded',
                stages: [{ id: 's1', label: 'Method', purpose: 'Say what was done' }]
            }
        }
    } as unknown as WritingAssignment;
}

function analysisOf(findings: SflFinding[]): SflAnalysis {
    return {
        schemaVersion: 'writing-feedback-v2',
        foundationVersion: 'v1',
        profileGenreState: 'founded',
        findings,
        abstentions: []
    } as SflAnalysis;
}

/** Records every query it is asked, and answers with one chunk per call. */
function recordingRetriever(published = true): WritingFeedbackMaterialRetriever & { queries: string[] } {
    const queries: string[] = [];
    return {
        queries,
        async retrieve(input) {
            queries.push(input.query);
            return [{
                content: `Course text for ${input.query.slice(0, 12)}`,
                score: 0.9,
                published,
                metadata: {
                    id: `m${queries.length}`,
                    topicOrWeekTitle: 'Week 4',
                    itemTitle: `Lecture ${queries.length}`,
                    name: 'Information flow'
                }
            }];
        }
    };
}

describe('the per-finding query never contains student text', () => {
    it('omits the evidence quote, the observation, and the interpretation', () => {
        const query = buildFindingRetrievalQuery(assignment(), finding());
        expect(query).not.toContain('ZZQUOTEZZ');
        expect(query).not.toContain('ZZOBSERVATIONZZ');
        expect(query).not.toContain('ZZINTERPRETATIONZZ');
    });

    it('carries the curated fields that make the query useful', () => {
        const query = buildFindingRetrievalQuery(assignment(), finding({ stageId: 's1' }));
        expect(query).toContain('Content');
        expect(query).toContain('clause');
        expect(query).toContain('Process description');
        expect(query).toContain('Method');
    });

    it('sends no query containing student text through a whole run', async () => {
        const retriever = recordingRetriever();
        await resolveCourseMaterialGrounding(
            assignment(),
            analysisOf([finding(), finding({ id: 'f2', primaryFunction: 'Organizational' })]),
            retriever
        );
        retriever.queries.forEach((query) => {
            expect(query).not.toMatch(/ZZQUOTEZZ|ZZOBSERVATIONZZ|ZZINTERPRETATIONZZ/);
        });
    });
});

describe('finding clustering', () => {
    it('gives identical findings one query, not one each', async () => {
        const retriever = recordingRetriever();
        await resolveCourseMaterialGrounding(
            assignment(),
            analysisOf([finding(), finding({ id: 'f2' }), finding({ id: 'f3' })]),
            retriever
        );
        // One clustered query plus the run-level query.
        expect(retriever.queries).toHaveLength(2);
    });

    it('is insensitive to rule id order', () => {
        expect(findingClusterKey(finding({ ruleIds: ['b', 'a'] })))
            .toBe(findingClusterKey(finding({ id: 'other', ruleIds: ['a', 'b'] })));
    });

    it('caps the queries and falls back rather than dropping a finding', async () => {
        const retriever = recordingRetriever();
        const many = Array.from({ length: 12 }, (_, index) => finding({
            id: `f${index}`,
            ruleIds: [`rule-${index}`]
        }));
        const grounding = await resolveCourseMaterialGrounding(assignment(), analysisOf(many), retriever);
        expect(retriever.queries.length).toBeLessThanOrEqual(MAX_RETRIEVAL_QUERIES + 1);
        many.forEach((item) => {
            expect(grounding.byFinding.get(item.id)?.length ?? 0).toBeGreaterThan(0);
        });
    });
});

describe('citation is restricted to published material', () => {
    it('keeps unpublished material out of the citable list and in the staff list', async () => {
        const retriever = recordingRetriever(false);
        const grounding = await resolveCourseMaterialGrounding(assignment(), analysisOf([finding()]), retriever);
        expect(grounding.mentions).toEqual([]);
        expect(grounding.staffMentions.length).toBeGreaterThan(0);
        expect(grounding.byFinding.get('f1') ?? []).toEqual([]);
    });
});

describe('retrieval stays advisory', () => {
    it('produces nothing rather than failing the run', async () => {
        const grounding = await resolveCourseMaterialGrounding(
            assignment(),
            analysisOf([finding()]),
            { async retrieve() { throw new Error('Qdrant unavailable'); } }
        );
        expect(grounding.mentions).toEqual([]);
        expect(grounding.staffMentions).toEqual([]);
        expect(grounding.excerpts).toEqual([]);
        expect(grounding.byFinding.size).toBe(0);
    });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/course-material-grounding.test.ts`
Expected: FAIL — `resolveCourseMaterialGrounding` is not exported.

- [ ] **Step 3: Rewrite the resolver around findings**

In `src/writing-feedback/course-material-mentions.ts`:

Change the retriever seam and the RAG-backed implementation to carry the publication tag:

```ts
import type { PublishedTaggedChunk } from '../rag/rag-app';

/** Dependency seam used by tests to avoid constructing Qdrant/RAG. */
export interface WritingFeedbackMaterialRetriever {
    retrieve(input: { courseId: string; query: string; limit: number; scoreThreshold: number }): Promise<PublishedTaggedChunk[]>;
}

class RagWritingFeedbackMaterialRetriever implements WritingFeedbackMaterialRetriever {
    async retrieve(input: { courseId: string; query: string; limit: number; scoreThreshold: number }): Promise<PublishedTaggedChunk[]> {
        const rag = await RAGApp.getInstance();
        // Ground on the whole uploaded corpus; the published subset is what may be cited,
        // which the caller enforces by building its allowlist from published chunks alone.
        return rag.retrieveForWritingFeedback(input.query, input.courseId, {
            limit: input.limit,
            scoreThreshold: input.scoreThreshold,
            includeUnpublished: true
        });
    }
}
```

Change `mentionFromChunk` and `uniqueMentions` to work over tagged chunks — `uniqueMentions(chunks: PublishedTaggedChunk[])` keeps its body — and add above them:

```ts
/** Retrieval budget per run: enough for a typical three-to-six cluster analysis, bounded. */
export const MAX_RETRIEVAL_QUERIES = 8;
const RETRIEVAL_LIMIT = 5;
const RETRIEVAL_SCORE_THRESHOLD = 0.45;

/**
 * findingClusterKey - the retrieval identity of one finding.
 *
 * Findings that differ only in which sentence they point at want the same course
 * material, so they share a query. The key uses only curated fields, which is also what
 * keeps student text out of the clustering.
 *
 * @param finding - Validated analyzer finding
 * @returns Stable key shared by findings that should retrieve together
 */
export function findingClusterKey(finding: SflFinding): string {
    return [
        finding.primaryFunction,
        finding.languageLevel,
        [...finding.ruleIds].sort().join(',')
    ].join('|');
}

/**
 * buildFindingRetrievalQuery - a course-material query for one finding, without student text.
 *
 * `evidence[].quote` is exact student writing, and `observation` and
 * `functionalInterpretation` are model prose about that writing. None of the three may
 * reach the course-material pipeline, so the query is assembled only from curated rule
 * summaries, the finding's function and level labels, the approved profile's stage, and
 * the assignment description staff wrote. This rule is pinned by test, not only by comment.
 *
 * @param assignment - Assignment supplying approved title, task, and profile
 * @param finding - Validated analyzer finding; only its curated labels are read
 * @returns Query string safe to send to the course-material RAG pipeline
 */
export function buildFindingRetrievalQuery(assignment: WritingAssignment, finding: SflFinding): string {
    const profile = assignment.rubric.sflContext;
    const rules = finding.ruleIds
        .map((ruleId) => SFL_RULES_BY_ID.get(ruleId))
        .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule))
        .map((rule) => `${rule.primaryFunction} ${rule.languageLevel} ${rule.summary}`);
    const stage = profile?.stages.find((candidate) => candidate.id === finding.stageId);
    return [
        assignment.title,
        assignment.rubric.task,
        profile?.genreLabel,
        finding.primaryFunction,
        finding.languageLevel,
        stage ? `${stage.label} ${stage.purpose}` : undefined,
        rules.join(' ')
    ].filter(Boolean).join('\n');
}

/** What one run's retrieval produced, split by who may see each part. */
export interface CourseMaterialGrounding {
    /** Published, deduplicated, citable. This is the writer's allowlist and the student's list. */
    mentions: CourseMaterialMention[];
    /** Everything retrieved, published or not. Staff-only. */
    staffMentions: CourseMaterialMention[];
    /** Citable mentions per finding id. Absent or empty means this finding cites nothing. */
    byFinding: Map<string, CourseMaterialMention[]>;
    /** Course text for the writer to read. Staff- and model-only; never student-facing. */
    excerpts: CourseMaterialExcerpt[];
}
```

Then add the resolver, and reduce the old export to a wrapper:

```ts
/**
 * resolveCourseMaterialGrounding - retrieves course material per finding cluster.
 *
 * Retrieval is advisory: any failure yields empty lists and generation continues with
 * feedback that cites no material. Grounding must never become a new way for a run to fail.
 *
 * @param assignment - Assignment supplying course id and approved context
 * @param analysis - Validated SFL analysis; only curated fields are read
 * @param retriever - Optional test seam; defaults to the shared RAGApp
 * @returns Citable mentions, the staff-only full list, per-finding mentions, and excerpts
 */
export async function resolveCourseMaterialGrounding(
    assignment: WritingAssignment,
    analysis: SflAnalysis,
    retriever?: WritingFeedbackMaterialRetriever
): Promise<CourseMaterialGrounding> {
    const empty: CourseMaterialGrounding = { mentions: [], staffMentions: [], byFinding: new Map(), excerpts: [] };
    if (isMockResponse() && !retriever) return empty;

    const runQuery = buildWritingFeedbackRetrievalQuery(assignment, analysis);
    if (!runQuery.trim()) return empty;

    try {
        const activeRetriever = retriever ?? new RagWritingFeedbackMaterialRetriever();
        const ask = (query: string): Promise<PublishedTaggedChunk[]> => activeRetriever.retrieve({
            courseId: assignment.courseId,
            query,
            limit: RETRIEVAL_LIMIT,
            scoreThreshold: RETRIEVAL_SCORE_THRESHOLD
        });

        // Step 1: the run-level query still runs. It is the assignment-level source list and
        // the fallback for any cluster past the budget.
        const runChunks = await ask(runQuery);

        // Step 2: one query per distinct cluster, bounded. Clusters past the cap reuse the
        // run-level result rather than being dropped, so no finding is left bare arbitrarily.
        const clusters = new Map<string, SflFinding>();
        analysis.findings.forEach((finding) => {
            if (!clusters.has(findingClusterKey(finding))) clusters.set(findingClusterKey(finding), finding);
        });
        const budgeted = [...clusters.entries()].slice(0, MAX_RETRIEVAL_QUERIES);
        const clusterChunks = new Map<string, PublishedTaggedChunk[]>();
        for (const [key, representative] of budgeted) {
            const query = buildFindingRetrievalQuery(assignment, representative);
            clusterChunks.set(key, query.trim() ? await ask(query) : runChunks);
        }

        // Step 3: split by publication. Only published material is citable, so only published
        // material reaches the allowlist, the per-finding map, and anything student-facing.
        const allChunks = [...runChunks, ...[...clusterChunks.values()].flat()];
        const mentions = uniqueMentions(allChunks.filter((chunk) => chunk.published));
        const staffMentions = uniqueMentions(allChunks);
        const citable = new Set(mentions.map((mention) => mention.id));

        const byFinding = new Map<string, CourseMaterialMention[]>();
        analysis.findings.forEach((finding) => {
            const chunks = clusterChunks.get(findingClusterKey(finding)) ?? runChunks;
            byFinding.set(
                finding.id,
                uniqueMentions(chunks.filter((chunk) => chunk.published))
                    .filter((mention) => citable.has(mention.id))
            );
        });

        return { mentions, staffMentions, byFinding, excerpts: [] };
    } catch {
        return empty;
    }
}

/**
 * resolveCourseMaterialMentions - the deduplicated citable label list for one run.
 *
 * @param assignment - Assignment supplying course id and approved context
 * @param analysis - Validated SFL analysis, never raw student text
 * @param retriever - Optional test seam; defaults to the shared RAGApp
 * @returns Deduplicated published mentions, or an empty list on retrieval failure
 */
export async function resolveCourseMaterialMentions(
    assignment: WritingAssignment,
    analysis: SflAnalysis,
    retriever?: WritingFeedbackMaterialRetriever
): Promise<CourseMaterialMention[]> {
    return (await resolveCourseMaterialGrounding(assignment, analysis, retriever)).mentions;
}
```

Add `SflFinding` and `CourseMaterialExcerpt` to the type import from `./contracts` (`CourseMaterialExcerpt` is created in Task 7; until then, declare `excerpts: []` against a local `type CourseMaterialExcerpt = { mentionId?: string; text: string }` placed above `CourseMaterialGrounding` and delete that local in Task 7).

- [ ] **Step 4: Run the tests**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/course-material-grounding.test.ts`
Expected: PASS

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/feedback-engine.test.ts`
Expected: PASS — the wrapper keeps the old signature. If an existing fake retriever in that file returns chunks without `published`, add `published: true` to them.

- [ ] **Step 5: Commit**

```bash
git add src/writing-feedback/course-material-mentions.ts src/writing-feedback/__tests__/course-material-grounding.test.ts src/writing-feedback/__tests__/feedback-engine.test.ts
git commit -m "feat: retrieve course material per SFL finding cluster"
```

---

## Task 7: Excerpts reach the writer (Part B2)

**Files:**
- Modify: `src/writing-feedback/contracts.ts` (add `CourseMaterialExcerpt`; extend `WritingFeedbackRunTrace`)
- Modify: `src/writing-feedback/course-material-mentions.ts` (excerpt budgeting)
- Modify: `src/writing-feedback/sfl-foundation.ts:27,30` (version bumps)
- Modify: `src/writing-feedback/feedback-engine.ts:360-405` (prompt block, trace)
- Test: `src/writing-feedback/__tests__/course-material-grounding.test.ts`

**Interfaces:**
- Consumes from Task 6: `CourseMaterialGrounding`, `resolveCourseMaterialGrounding`.
- Produces, used by Task 8:
  - `interface CourseMaterialExcerpt { mentionId?: string; text: string; }` in `contracts.ts`
  - `WritingFeedbackRunTrace` gains `courseMaterialExcerpts?: CourseMaterialExcerpt[]` and `staffCourseMaterialMentions?: CourseMaterialMention[]`
  - `const MAX_EXCERPT_CHARS = 600`, `const EXCERPT_BUDGET_CHARS = 4000` exported from `course-material-mentions.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/writing-feedback/__tests__/course-material-grounding.test.ts`:

```ts
import { EXCERPT_BUDGET_CHARS, MAX_EXCERPT_CHARS } from '../course-material-mentions';
import { SFL_WRITER_PROMPT_VERSION, COURSE_MATERIAL_RESOLVER_VERSION } from '../sfl-foundation';

/** A retriever answering with chunks of a chosen length, score, and publication state. */
function chunkyRetriever(chunks: Array<{ content: string; score: number; published: boolean; id: string }>) {
    return {
        async retrieve() {
            return chunks.map((chunk) => ({
                content: chunk.content,
                score: chunk.score,
                published: chunk.published,
                metadata: { id: chunk.id, topicOrWeekTitle: 'Week 4', itemTitle: `Item ${chunk.id}`, name: chunk.id }
            }));
        }
    };
}

describe('excerpt budgeting', () => {
    it('truncates each chunk and stops at the total budget, highest score first', async () => {
        const grounding = await resolveCourseMaterialGrounding(
            assignment(),
            analysisOf([finding()]),
            chunkyRetriever([
                { id: 'low', content: 'l'.repeat(2000), score: 0.5, published: true },
                { id: 'high', content: 'h'.repeat(2000), score: 0.99, published: true },
                { id: 'mid', content: 'm'.repeat(2000), score: 0.8, published: true }
            ])
        );
        expect(grounding.excerpts[0]!.text.startsWith('h')).toBe(true);
        grounding.excerpts.forEach((excerpt) => {
            expect(excerpt.text.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS);
        });
        const total = grounding.excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0);
        expect(total).toBeLessThanOrEqual(EXCERPT_BUDGET_CHARS);
    });

    it('carries a citable id only for published material', async () => {
        const grounding = await resolveCourseMaterialGrounding(
            assignment(),
            analysisOf([finding()]),
            chunkyRetriever([
                { id: 'open', content: 'published text', score: 0.9, published: true },
                { id: 'draft', content: 'unpublished text', score: 0.8, published: false }
            ])
        );
        const open = grounding.excerpts.find((excerpt) => excerpt.text === 'published text');
        const draft = grounding.excerpts.find((excerpt) => excerpt.text === 'unpublished text');
        expect(open?.mentionId).toBe('open');
        expect(draft?.mentionId).toBeUndefined();
    });
});

describe('prompt contract versions move with the contract', () => {
    it('names the grounded writer and resolver versions', () => {
        expect(SFL_WRITER_PROMPT_VERSION).toBe('sfl-feedback-writer-v2.1.0');
        expect(COURSE_MATERIAL_RESOLVER_VERSION).toBe('course-material-mentions-v2.0.0');
    });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/course-material-grounding.test.ts -t 'excerpt'`
Expected: FAIL — `grounding.excerpts` is empty.

- [ ] **Step 3: Add the contract type and trace fields**

In `src/writing-feedback/contracts.ts`, directly after the `CourseMaterialMention` interface:

```ts
/**
 * Staff- and model-only course text.
 *
 * Deliberately separate from {@link CourseMaterialMention}: a mention is a student-facing
 * label, and this is the document text behind it. It must never reach an AnchoredComment,
 * a mention, a generated student PDF, or a release payload.
 */
export interface CourseMaterialExcerpt {
    /** Present only for published material, which is the only material the writer may cite. */
    mentionId?: string;
    /** Truncated course-document text. Never student writing. */
    text: string;
}
```

In `WritingFeedbackRunTrace`, add:

```ts
    courseMaterialExcerpts?: CourseMaterialExcerpt[]; // course text shown to the writer, staff-only
    staffCourseMaterialMentions?: CourseMaterialMention[]; // retrieved material including unpublished, staff-only
```

- [ ] **Step 4: Budget the excerpts**

In `src/writing-feedback/course-material-mentions.ts`, delete the local `CourseMaterialExcerpt` placeholder from Task 6 and import the real type from `./contracts`. Add beside the other constants:

```ts
/** Per-chunk truncation: enough to carry an idea, short enough that several fit. */
export const MAX_EXCERPT_CHARS = 600;
/** Total course text one writer call may read. */
export const EXCERPT_BUDGET_CHARS = 4000;
```

Add this helper above `resolveCourseMaterialGrounding`:

```ts
/**
 * buildExcerpts - fills the writer's reading budget, best match first.
 *
 * An excerpt carries a `mentionId` only when its material is published: that id is the
 * only thing the writer may cite, so unpublished text can inform the guidance without
 * being nameable to the student.
 *
 * @param chunks - Retrieved chunks across every query in the run
 * @returns Truncated excerpts within the per-chunk and total budgets
 */
function buildExcerpts(chunks: PublishedTaggedChunk[]): CourseMaterialExcerpt[] {
    const excerpts: CourseMaterialExcerpt[] = [];
    const seen = new Set<string>();
    let used = 0;
    [...chunks]
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
        .forEach((chunk, index) => {
            const text = (chunk.content ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_EXCERPT_CHARS);
            if (!text || seen.has(text) || used + text.length > EXCERPT_BUDGET_CHARS) return;
            seen.add(text);
            used += text.length;
            const mention = chunk.published ? mentionFromChunk(chunk, index) : null;
            excerpts.push({ ...(mention ? { mentionId: mention.id } : {}), text });
        });
    return excerpts;
}
```

In `resolveCourseMaterialGrounding`, replace `excerpts: []` with `excerpts: buildExcerpts(allChunks)`.

- [ ] **Step 5: Bump the versions**

In `src/writing-feedback/sfl-foundation.ts`:

```ts
export const SFL_WRITER_PROMPT_VERSION = 'sfl-feedback-writer-v2.1.0';
```
```ts
export const COURSE_MATERIAL_RESOLVER_VERSION = 'course-material-mentions-v2.0.0';
```

`SFL_ANALYZER_PROMPT_VERSION` is deliberately unchanged: the analyzer call is untouched and retrieval still runs strictly after analysis.

- [ ] **Step 6: Put the excerpts in the writer prompt**

In `src/writing-feedback/feedback-engine.ts`, change the import from `./course-material-mentions` to bring in `resolveCourseMaterialGrounding` alongside what it already imports.

In `buildWritingFeedbackSystemPrompt`, add these lines to the instruction array, immediately after the line beginning `'Use only the validated SFL analysis,'`:

```ts
        'Course-material excerpts are provided so your guidance reflects what this course actually taught. Ground your explanations in them where they apply.',
        'Cite a course material only by a courseMaterialMention.id from the allowlist. An excerpt without a mentionId may inform your guidance but must never be named to the student.',
        'Never present excerpt text to the student as if it were their own writing, and never quote an excerpt as evidence.',
        'If no excerpt genuinely applies to a finding, abstain from citing rather than stretching a document to fit.',
```

Replace the two `const mentions = await resolveCourseMaterialMentions(...)` call sites with:

```ts
        const grounding = await resolveCourseMaterialGrounding(input.assignment, analysis, this.materialRetriever);
        const mentions = grounding.mentions;
```

In the writer user message, add the excerpt block after the mentions block:

```ts
                content: [
                    `<validated_sfl_analysis>${JSON.stringify(analysis)}</validated_sfl_analysis>`,
                    `<allowlisted_course_material_mentions>${JSON.stringify(mentions)}</allowlisted_course_material_mentions>`,
                    `<course_material_excerpts>${JSON.stringify(grounding.excerpts)}</course_material_excerpts>`
                ].join('\n')
```

In both `result.runTrace = { ... }` assignments, add:

```ts
            courseMaterialExcerpts: grounding.excerpts,
            staffCourseMaterialMentions: grounding.staffMentions,
```

`validateWriterReferences` is unchanged: the allowlist it checks is the published `mentions` list, which is exactly what makes cite-only-published enforceable rather than merely instructed.

- [ ] **Step 7: Run the suites and the backend type-check**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/course-material-grounding.test.ts src/writing-feedback/__tests__/feedback-engine.test.ts`
Expected: PASS

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output

- [ ] **Step 8: Commit**

```bash
git add src/writing-feedback/contracts.ts src/writing-feedback/course-material-mentions.ts src/writing-feedback/sfl-foundation.ts src/writing-feedback/feedback-engine.ts src/writing-feedback/__tests__/course-material-grounding.test.ts
git commit -m "feat: ground the feedback writer in course-document excerpts"
```

---

## Task 8: Per-finding material on the surfaces (Part B3)

**Files:**
- Modify: `src/writing-feedback/feedback-engine.ts` (`deterministicFeedback`, new `attachPerFindingMentions`)
- Modify: `src/report-generation/writing-feedback-report.ts:190-215` (student source list)
- Modify: `public/scripts/feature/writing-feedback-shared.ts:180-200` (browser mirror)
- Modify: `public/scripts/feature/writing-feedback-review.ts:1144-1154` (staff source list)
- Test: `src/writing-feedback/__tests__/course-material-grounding.test.ts`

**Interfaces:**
- Consumes from Tasks 6 and 7: `CourseMaterialGrounding.byFinding`, `.mentions`, `.staffMentions`, `.excerpts`.
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Write the failing tests**

Append to `src/writing-feedback/__tests__/course-material-grounding.test.ts`:

```ts
import fs from 'fs';
import path from 'path';

describe('excerpt containment', () => {
    it('keeps course text off every student-facing carrier', async () => {
        const grounding = await resolveCourseMaterialGrounding(
            assignment(),
            analysisOf([finding()]),
            chunkyRetriever([{ id: 'open', content: 'ZZEXCERPTZZ course text', score: 0.9, published: true }])
        );
        const serialisedMentions = JSON.stringify([...grounding.mentions, ...grounding.staffMentions]);
        expect(serialisedMentions).not.toContain('ZZEXCERPTZZ');
        expect(JSON.stringify([...grounding.byFinding.values()])).not.toContain('ZZEXCERPTZZ');
        expect(grounding.excerpts.some((excerpt) => excerpt.text.includes('ZZEXCERPTZZ'))).toBe(true);
    });

    it('never renders an excerpt in the student report', () => {
        const report = fs.readFileSync(
            path.join(__dirname, '..', '..', 'report-generation', 'writing-feedback-report.ts'),
            'utf8'
        );
        expect(report).not.toContain('courseMaterialExcerpts');
        expect(report).not.toContain('CourseMaterialExcerpt');
    });

    it('never sends an excerpt or the staff list to the browser as student-facing data', () => {
        const shared = fs.readFileSync(
            path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-shared.ts'),
            'utf8'
        );
        expect(shared).not.toContain('CourseMaterialExcerpt');
    });
});

describe('student-facing source list', () => {
    it('renders published labels only, with no scores or ids', () => {
        const report = fs.readFileSync(
            path.join(__dirname, '..', '..', 'report-generation', 'writing-feedback-report.ts'),
            'utf8'
        );
        const section = report.match(/function renderCourseMaterialSources[\s\S]*?\n}/)?.[0] ?? '';
        expect(section).toContain('Course materials this feedback draws on');
        expect(section).toContain('mention.label');
        expect(section).not.toContain('mention.id');
        expect(section).not.toContain('score');
    });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/course-material-grounding.test.ts -t 'source list'`
Expected: FAIL — `renderCourseMaterialSources` does not exist.

- [ ] **Step 3: Attach per-finding mentions in the engine**

In `src/writing-feedback/feedback-engine.ts`, add `CourseMaterialGrounding` to the type import from `./course-material-mentions`, then add above `validateWriterReferences`:

```ts
/**
 * attachPerFindingMentions - gives each piece of evidence the material retrieved for its finding.
 *
 * The writer may choose its own citation; this only fills the gaps, and only from the
 * published allowlist, so it cannot introduce a reference `validateWriterReferences` would
 * then reject. It replaces the previous behaviour of hanging the same first mention on
 * every criterion, which said the same thing about findings that had nothing in common.
 *
 * @param result - Writer output, mutated in place
 * @param byFinding - Citable mentions per finding id
 */
function attachPerFindingMentions(
    result: WritingFeedbackResult,
    byFinding: Map<string, CourseMaterialMention[]>
): void {
    for (const criterion of result.criteria) {
        for (const evidence of criterion.evidence) {
            if (evidence.courseMaterialMention) continue;
            const findingId = (evidence.sflFindingIds ?? [])[0];
            const mention = findingId ? byFinding.get(findingId)?.[0] : undefined;
            if (mention) evidence.courseMaterialMention = mention;
        }
    }
}
```

Call it immediately before `validateWriterReferences(result, analysis, mentions);`:

```ts
        attachPerFindingMentions(result, grounding.byFinding);
```

In `deterministicFeedback`, change the signature's `mentions: CourseMaterialMention[]` parameter to `grounding: CourseMaterialGrounding`, and inside it:

- replace `...(mentions[0] ? { courseMaterialMention: mentions[0] } : {})` with:

```ts
                ...((): { courseMaterialMention?: CourseMaterialMention } => {
                    // The material retrieved for *this* finding, not the run's first mention.
                    const found = findingForCriterion(criterion, analysis.findings);
                    const mention = found ? grounding.byFinding.get(found.id)?.[0] : undefined;
                    return mention ? { courseMaterialMention: mention } : {};
                })()
```

- replace `...(mentions.length ? { courseMaterialMentions: mentions } : {})` with `...(grounding.mentions.length ? { courseMaterialMentions: grounding.mentions } : {})`
- update the call site to `deterministicFeedback(input.assignment, input.verifiedText, analysis, grounding)`.

- [ ] **Step 4: Add the student-facing source list to the PDF**

In `src/report-generation/writing-feedback-report.ts`, add after `renderGeneralSections`:

```ts
/**
 * Course materials the feedback drew on, by label.
 *
 * Labels only: no excerpt text, no retrieval score, no material id. The list the student
 * reads is the published subset the writer was allowed to cite, which is what
 * `result.courseMaterialMentions` holds.
 */
function renderCourseMaterialSources(doc: PDFKit.PDFDocument, feedback: WritingFeedbackResult): void {
    const mentions = feedback.courseMaterialMentions ?? [];
    if (!mentions.length) return;
    sectionHeading(doc, 'Course materials this feedback draws on');
    mentions.forEach((mention) => bullet(doc, mention.label));
}
```

Call it in `renderGeneralSections`, between the staff-feedback block and the `'Carry forward'` heading:

```ts
    renderCourseMaterialSources(doc, feedback);
```

- [ ] **Step 5: Mirror the staff list to the browser and render it**

In `public/scripts/feature/writing-feedback-shared.ts`, on the run interface that already declares `courseMaterialMentions`, add:

```ts
    /** Everything retrieval found, published or not. Staff-only; never rendered to a student. */
    staffCourseMaterialMentions?: CourseMaterialMention[];
```

In `public/scripts/feature/writing-feedback-review.ts`, replace the `const mentions = feedbackRun.result.courseMaterialMentions ?? [];` block with:

```ts
    // Staff see everything retrieval read, marked where a document is not published — an
    // unpublished document can ground the writing without being nameable to the student,
    // and a reviewer needs to know which is which. Students see the published list only.
    const publishedMentions = feedbackRun.result.courseMaterialMentions ?? [];
    const publishedIds = new Set(publishedMentions.map((mention) => mention.id));
    const mentions = feedbackRun.staffCourseMaterialMentions?.length
        ? feedbackRun.staffCourseMaterialMentions
        : publishedMentions;
    if (mentions.length) {
        const materialsSection = document.createElement('section');
        materialsSection.className = 'wf-feedback-section';
        materialsSection.append(createText('h3', 'Course materials this feedback draws on'));
        const materialList = document.createElement('ul');
        materialList.className = 'wf-strength-list';
        mentions.forEach((mention) => {
            const item = createText('li', mention.label);
            if (!publishedIds.has(mention.id)) {
                item.append(createText('span', ' Not published to students', 'wf-muted-note'));
            }
            materialList.append(item);
        });
        materialsSection.append(materialList);
        children.push(materialsSection);
    }
```

- [ ] **Step 6: Run the tests and both type-checks**

Run: `npx jest --config jest.config.cjs src/writing-feedback/__tests__/course-material-grounding.test.ts src/writing-feedback/__tests__/feedback-engine.test.ts src/writing-feedback/__tests__/anchored-comments.test.ts`
Expected: PASS

Run: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p public/tsconfig.json`
Expected: no output

- [ ] **Step 7: Commit**

```bash
git add src/writing-feedback/feedback-engine.ts src/report-generation/writing-feedback-report.ts public/scripts/feature/writing-feedback-shared.ts public/scripts/feature/writing-feedback-review.ts src/writing-feedback/__tests__/course-material-grounding.test.ts
git commit -m "feat: show per-finding course material and an assignment source list"
```

---

## Task 9: Documentation, memory, and full verification

**Files:**
- Modify: `documents/ENDPOINT_ARCHITECTURE.md`
- Modify: `documents/MONGO_DATA_LAYER.md`
- Modify: `/home/crodas/EngE-AI/project-memory/01 Project Memory/Current State.md`
- Create: `/home/crodas/EngE-AI/project-memory/02 Session Log/2026-09-05 grounding viewer autosave canvas bands.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Update the endpoint contract note**

In `documents/ENDPOINT_ARCHITECTURE.md`, in the Writing Feedback section covering `PUT /assignments/:id/rubric-draft`, add one line:

```
The rubric page also writes this route in the background (autosave, 2s debounce, 30s forced flush, single-flight). The route never touches the approved rubric and reuses an existing draft's version, so repeated background writes do not advance the version number. Autosave never seeds a technical rubric and never approves.
```

- [ ] **Step 2: Update the data-layer note**

In `documents/MONGO_DATA_LAYER.md`, in the Writing Feedback run record section, add:

```
Run records gain two staff-only provenance fields from the V2 run trace: `courseMaterialExcerpts` (truncated course-document text the writer read, never student-facing) and `staffCourseMaterialMentions` (everything retrieval found, including unpublished material). `courseMaterialMentions` stays the published, citable, student-facing list.
```

- [ ] **Step 3: Run the full suite**

Run: `npx jest --config jest.config.cjs 2>&1 | tail -30`
Expected: the four known `scenario-practice-limits` failures and nothing else. Any other failure belongs to this work and must be fixed before continuing.

- [ ] **Step 4: Run both builds and the whitespace check**

Run: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p public/tsconfig.json && npm run build && git diff --check`
Expected: builds succeed, `git diff --check` prints nothing.

- [ ] **Step 5: Browser pass**

Using the Playwright recipe recorded 2026-09-01 (Ubuntu 26.04 plus four NSS libraries via `dpkg -x` and `LD_LIBRARY_PATH`, no root, no `playwright install`), at 1440, 768, and 320px:

- the PDF viewer fills the screen, the document is legible, no page overflow, no console errors;
- the autosave marker moves through `Saving…` and `Saved HH:MM`, an edit survives a reload, and a forced `401` produces the signed-out sentence;
- the per-finding material sits above the glossary in the annotation card;
- the source list appears in the staff review panel, with unpublished material marked;
- an imported Canvas rubric shows ranges in the grid.

Record what was observed. A failure here is a defect in this work, not a note for later.

- [ ] **Step 6: Update Current State and write the session log**

In `Current State.md`, update the Writing Feedback status to record: full-screen PDF viewer; rubric autosave; Canvas imports carrying points bands (D-102); course-document grounding implemented and unit-tested but **owed one live end-to-end run against real uploaded documents**, blocked because this WSL distro has no `docker` command.

Create the dated session-log note with what changed, what was verified, and what is owed. No secrets, tokens, PUIDs, student text, grades, or generated feedback in either file.

- [ ] **Step 7: Commit**

```bash
git add documents/ENDPOINT_ARCHITECTURE.md documents/MONGO_DATA_LAYER.md "/home/crodas/EngE-AI/project-memory/01 Project Memory/Current State.md" "/home/crodas/EngE-AI/project-memory/02 Session Log/2026-09-05 grounding viewer autosave canvas bands.md"
git commit -m "docs: record grounding, autosave, viewer, and Canvas band changes"
```

---

## Open questions resolved in this plan

- **Retrieval cap configurability.** A constant (`MAX_RETRIEVAL_QUERIES = 8`) for the pilot. Per-course configuration is a setting nobody has yet asked to change; the constant is one edit away from becoming an option if a live run shows it binding.
- **Staff source list.** It shows the full retrieved list and marks unpublished material "Not published to students". A reviewer approving a draft needs to know that a named document is one the student cannot open.
- **Tutorial copy pass.** Still owed, now for both the v3 rubric redesign and autosave. Out of scope here; it belongs with the onboarding tutorial work on `feature/instructor-feature-onboarding`.
