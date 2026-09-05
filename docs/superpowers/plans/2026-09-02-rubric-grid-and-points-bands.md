# Rubric Grid and Points Bands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the marking grid readable and restore inclusive points bands, so a criterion's cell says `16–22` rather than `22` and a descriptor shows all of its text.

**Architecture:** Bands already exist in storage, in validation, and in suggested grading; three frontend functions collapsed them to single values and made that machinery inert. Two of those functions are browser-only display code, but `spaceBandsEvenly` is a hand-maintained mirror of `src/writing-feedback/rubric-bands.ts`, so the band change lands in both copies and gains the parity test its docstring already claims to have. Everything else is presentation: the grid's stylesheet, auto-growing descriptors, sticky first and last columns, and a copy pass.

**Tech Stack:** TypeScript (no framework), vanilla DOM, Jest (`testEnvironment: 'node'`, `roots: ['src', 'public/scripts']`), CSS with the palette in `public/styles/style.css`. Node 24.1.0.

**Spec:** `docs/superpowers/specs/2026-09-02-rubric-grid-and-points-bands-design.md`

## Global Constraints

- **No new colour value.** Only tokens already declared in `public/styles/style.css` (`--color-chbe-green: #4d7a2f`, `--color-ubc-blue: #2F5F8F`, `--color-eng-red: #8B0000`) or on `.wf-page` (`--chat-bg: rgb(252,252,252)`, `--border-color: rgb(184,184,184)`, `--hover-bg: rgb(239,239,239)`, `--text-primary: rgb(51,51,51)`, `--text-secondary: rgb(108,117,125)`, `--gingham-color: rgba(92,138,58,0.1)`, `--background-2: rgb(236,229,221)`).
- **No rubric data-model change.** `WritingRubricCell` keeps `{ min, max, descriptor? }`. No migration. The one new stored field is `canvasRubricRefusal` on `WritingAssignment` (Task 6), which is optional and additive.
- **Copy rules carry over from the v3 spec.** The strings `SFL`, `lens`, `Tenor`, `Mode`, `Field` (linguistic sense), `register` and `task object` never appear in staff-facing copy. Every hint is a concrete example or a plain restatement.
- **Never renamed:** the default criterion labels `Organization`, `Content`, `Interpersonal Positioning` (D-030) — instructor-editable data, not chrome.
- **Minimum 44px touch targets** on every control at every width. Focus rings stay `2px solid var(--color-chbe-green)`.
- **Band arithmetic is mirrored.** `spaceBandsEvenly` exists in `src/writing-feedback/rubric-bands.ts` and again in `public/scripts/feature/writing-feedback-grid.ts`. Change one, change the other, or the rubric the server seeds and the rubric the browser derives will disagree.
- Commit after every task. Do not push. Do not commit the untracked `docs/superpowers/**` files.

---

## Background an implementer needs

Read this before Task 1.

**Bands were built and then switched off.** `WritingRubricCell` is `{ min: number; max: number; descriptor?: string }` and both ends persist. `rubric-schema.ts:57` calls the cell *"inclusive"* and rejects `min > max` with *"A points range cannot start above where it ends"*. `suggested-grading.ts` sums `totalMin` and `totalMax`. All of it still works — it just never sees a cell where `min !== max`, because all three writers produce equal pairs:

| Function | File | What it does today |
|---|---|---|
| `formatBand` | `writing-feedback-grid.ts:141` | Returns `String(cell.max)`. A stored `min` is discarded on display. |
| `parseBand` | `writing-feedback-grid.ts:155` | Returns `{ min: n, max: n }`. A typed range is rejected outright. |
| `spaceBandsEvenly` | `rubric-bands.ts:33` **and** `writing-feedback-grid.ts:76` | Writes `{ min: award, max: award }`. |

That was D-072 (2026-08-26): a Canvas rating is a single number, so the grid mirrored Canvas. That still governs imported cells, which arrive collapsed and stay collapsed until staff widen them by hand. It should not govern a rubric authored here.

**`formatBand` currently discards `min` deliberately** — its own comment says a rubric with `min !== max` *"shows its max … and saving the rubric normalises it"*. After Task 2 that normalisation stops. Nothing in the database currently holds a real range, so nothing is recovered and nothing is lost; what changes is that a range typed from now on survives.

**Who consumes `spaceBandsEvenly`, and therefore changes behaviour in Task 1 without changing code:**

- `default-rubric-profile.ts:24` — the built-in three-criterion rubric every new assignment starts from.
- `lab-report-profile.ts:16` — the APSC 182 technical rubric.
- `rubric-autofill.ts:18` — the bands auto-fill proposes from the assignment instructions.
- `suggested-grading.ts:16` (via `resolveBand`) — **staff-facing**. Its per-criterion `min`/`max` and its `totalMin`/`totalMax` stop being degenerate. This is the intended outcome; D-064 already says *"the total is the sum as a range"*. Do not treat a widened suggested-grading range as a regression.

**A test currently pins the behaviour being changed.** `src/writing-feedback/__tests__/rubric-bands.test.ts:34` is `it('always writes an equal pair, never a range')`. It is replaced in Task 1, not deleted silently.

**That test's docstring overstates its reach.** It claims to pin *"both mirrors"* but imports only `../rubric-bands`. The browser copy has never been tested. Task 1 closes that with a real parity test, using the idiom `writing-feedback-rubric-progress.test.ts` already established: a spec under `public/scripts/feature/__tests__/` may import from `src/`, because `tsconfig.jest.json` includes both trees and `public/tsconfig.json` excludes `__tests__` from the browser build.

**Not in scope, but you will see it.** `requireCompleteRubricCells` (`rubric-schema.ts:204`) is a written, exported approval gate with **zero callers** — the grid-completeness check exists but was never wired up. Whether approval should gate on a complete grid is an open product question from the v3 spec. Do not wire it up in this plan.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/writing-feedback/rubric-bands.ts` | Authoritative band arithmetic. `spaceBandsEvenly` becomes contiguous. |
| `public/scripts/feature/writing-feedback-grid.ts` | The mirror of the above, plus `formatBand`/`parseBand`, the table markup, auto-growing descriptors, the toolbar, and every grid label. |
| `public/scripts/feature/__tests__/rubric-band-parity.test.ts` | **New.** Runs both mirrors on identical input and pins the display round-trip. |
| `src/writing-feedback/__tests__/rubric-bands.test.ts` | Existing. Its single-value assertions become contiguous-band assertions. |
| `public/styles/instructor-components/writing-feedback.css` | The `.wf-grid-*` block: borders, header band, sticky columns, band chip. |
| `src/writing-feedback/canvas-rubric-mapping.ts` | Gains a refusal reason beside its existing `null`. |
| `src/writing-feedback/contracts.ts`, `src/types/shared.ts`, `public/scripts/types.ts` | One optional `canvasRubricRefusal` field, mirrored. |
| `src/routes/route-writing-feedback.ts` | Stores the refusal on import. |
| `src/helpers/__tests__/rubric-page-design-guard.test.ts` | Existing. Gains grid assertions. |

---

### Task 1: Contiguous bands, in both mirrors

**Files:**
- Modify: `src/writing-feedback/rubric-bands.ts:33-53`
- Modify: `public/scripts/feature/writing-feedback-grid.ts:76-96`
- Modify: `src/writing-feedback/__tests__/rubric-bands.test.ts`
- Create: `public/scripts/feature/__tests__/rubric-band-parity.test.ts`

**Interfaces:**
- `spaceBandsEvenly(points: number, levels: ReadonlyArray<WritingRubricLevel>): Record<WritingLevelId, WritingRubricCell>` — signature unchanged in both copies; only the values change.
- Relied on by Tasks 2 and 4.

- [ ] **Step 1: Replace the assertions that pin single values**

In `src/writing-feedback/__tests__/rubric-bands.test.ts`, replace the `spaceBandsEvenly` describe block's first four cases. Delete `it('always writes an equal pair, never a range')` — it is the assertion this task exists to reverse — and replace the whole block's opening with:

```typescript
describe('spaceBandsEvenly', () => {
    it('gives each level a contiguous band of a 30-point criterion', () => {
        expect(spaceBandsEvenly(30, levels)).toEqual({
            weak: { min: 0, max: 7 },
            developing: { min: 8, max: 15 },
            proficient: { min: 16, max: 22 },
            exemplary: { min: 23, max: 30 }
        });
    });

    it('starts at zero and tops out at the full weight', () => {
        const bands = spaceBandsEvenly(30, levels);
        expect(bands.weak.min).toBe(0);
        expect(bands.exemplary.max).toBe(30);
    });

    it('leaves no gap between one band and the next', () => {
        const bands = spaceBandsEvenly(100, levels);
        const ordered = [bands.weak, bands.developing, bands.proficient, bands.exemplary];
        ordered.slice(1).forEach((band, index) => {
            expect(band.min).toBe(ordered[index].max + 1);
        });
    });

    it('never produces a band that starts above where it ends', () => {
        // The schema rejects min > max outright, so this must hold at every weight.
        for (let points = 0; points <= 60; points += 1) {
            Object.values(spaceBandsEvenly(points, levels)).forEach((band) => {
                expect(band.min).toBeLessThanOrEqual(band.max);
            });
        }
    });

    it('collapses adjacent bands when the weight cannot separate every level', () => {
        // D-065: whole points cannot be divided more finely than one apiece. Two
        // points across four levels must share, and sharing is not an error.
        expect(spaceBandsEvenly(2, levels)).toEqual({
            weak: { min: 0, max: 0 },
            developing: { min: 1, max: 1 },
            proficient: { min: 1, max: 1 },
            exemplary: { min: 2, max: 2 }
        });
    });
```

Leave the block's remaining cases (`orders by rank`, `returns an empty map when the criterion has no weight`) unchanged, and delete the old `repeats a value when the weight cannot separate every level` case, which the collapse case above replaces.

Also update the file's `@fileoverview`, which currently asserts the opposite:

```typescript
/**
 * @fileoverview Pins band derivation, and pins it identically for both mirrors. A cell
 * awards an inclusive range, so each level takes a contiguous slice of the criterion's
 * weight: the slices leave no gaps, the lowest starts at zero, and the highest ends on
 * the weight. A weight too small to separate every level makes adjacent levels share a
 * band rather than producing an invalid one.
 */
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest rubric-bands`
Expected: FAIL — the contiguous, gap and collapse cases all fail against the current single-value implementation.

- [ ] **Step 3: Make the backend copy contiguous**

In `src/writing-feedback/rubric-bands.ts`, replace the body of `spaceBandsEvenly` and its docstring:

```typescript
/**
 * spaceBandsEvenly - divides a criterion's weight into a contiguous band per level.
 *
 * Each level takes a slice of the weight, the slices touch so every whole point from
 * zero to the weight falls in exactly one band, and the top level's band ends on the
 * weight so rounding never loses a point. A weight smaller than the number of levels
 * cannot give each level its own slice — whole points cannot be divided more finely
 * than one apiece — so adjacent levels share a band. That is a real state, not an
 * error, but callers that render these should warn staff it has happened.
 *
 * @param points - Maximum points the criterion contributes
 * @param levels - Levels of the rubric, in any order; rank decides the sequence
 * @returns Bands per level id, or an empty map when the criterion carries no weight
 */
export function spaceBandsEvenly(
    points: number,
    levels: ReadonlyArray<WritingRubricLevel>
): Record<WritingLevelId, WritingRubricCell> {
    if (!points || points <= 0 || levels.length === 0) return {};

    const ordered = [...levels].sort((left, right) => left.rank - right.rank);
    const bands: Record<WritingLevelId, WritingRubricCell> = {};
    let previousTop = -1;

    ordered.forEach((level, index) => {
        // The top level ends on the weight exactly; the rest take their proportional
        // share rounded down, which is what makes the slices whole points.
        const top = index === ordered.length - 1
            ? points
            : Math.floor((points * (index + 1)) / ordered.length);
        // Where the weight is too small to advance, the band collapses onto its
        // neighbour's value rather than starting above where it ends -- which the
        // draft schema rejects outright.
        const min = Math.min(previousTop + 1, top);
        bands[level.id] = { min, max: top };
        previousTop = top;
    });

    return bands;
}
```

- [ ] **Step 4: Make the browser mirror identical**

Apply the same replacement to `public/scripts/feature/writing-feedback-grid.ts:76-96`. The types differ in name only — use `RubricLevel` and `RubricCell` and return `Record<string, RubricCell>`, matching that file's existing signature. The body and the comments are otherwise character-for-character the same.

- [ ] **Step 5: Write the parity test the docstring has been claiming**

Create `public/scripts/feature/__tests__/rubric-band-parity.test.ts`:

```typescript
/**
 * rubric-band-parity.test.ts
 *
 * `spaceBandsEvenly` exists twice: once in src/writing-feedback/rubric-bands.ts for
 * the seeded profiles and suggested grading, and again in the grid module because
 * the browser bundle cannot import from src/. The band the server seeds and the band
 * the browser derives must be the same band, and until now nothing checked that --
 * the backend suite's docstring claimed to pin both mirrors while importing only one.
 *
 * @author: @rdschrs
 */

import { spaceBandsEvenly as backendBands } from '../../../../src/writing-feedback/rubric-bands';
import { spaceBandsEvenly as browserBands, formatBand, parseBand } from '../writing-feedback-grid';
import type { RubricLevel } from '../writing-feedback-shared';

const FOUR: RubricLevel[] = [
    { id: 'weak', label: 'Weak', description: 'd', rank: 1 },
    { id: 'developing', label: 'Developing', description: 'd', rank: 2 },
    { id: 'proficient', label: 'Proficient', description: 'd', rank: 3 },
    { id: 'exemplary', label: 'Exemplary', description: 'd', rank: 4 }
];

function levelsOf(count: number): RubricLevel[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `l${index + 1}`,
        label: `Level ${index + 1}`,
        description: 'd',
        rank: index + 1
    }));
}

describe('the two spaceBandsEvenly copies agree', () => {
    it('produces identical bands across every level count and a wide range of weights', () => {
        for (let count = 2; count <= 8; count += 1) {
            const levels = levelsOf(count);
            [0, 1, 2, 3, 5, 7, 10, 30, 45, 100, 1000].forEach((points) => {
                expect(browserBands(points, levels)).toEqual(backendBands(points, levels as never));
            });
        }
    });
});

describe('band display round-trips', () => {
    it('shows a collapsed band as one number', () => {
        expect(formatBand({ min: 22, max: 22 })).toBe('22');
    });

    it('shows a real band as an inclusive range', () => {
        expect(formatBand({ min: 16, max: 22 })).toBe('16–22');
    });

    it('survives format then parse without flattening', () => {
        const band = { min: 16, max: 22 };
        expect(parseBand(formatBand(band))).toEqual(band);
    });

    it('round-trips every band the spread rule produces', () => {
        Object.values(browserBands(30, FOUR)).forEach((band) => {
            expect(parseBand(formatBand(band))).toEqual({ min: band.min, max: band.max });
        });
    });
});
```

This test also covers Task 2's `formatBand`/`parseBand`, so it will not fully pass until Task 2 is done. That is intentional — run it now for the parity block, which must pass immediately.

- [ ] **Step 6: Run both suites**

Run: `npx jest rubric-bands rubric-band-parity`
Expected: `rubric-bands` PASSES entirely. `rubric-band-parity` passes its parity block and fails its display block on `formatBand` returning `'22'` for `{16,22}`. Task 2 closes that.

- [ ] **Step 7: Confirm nothing downstream broke**

Run: `npx jest writing-feedback`
Expected: any failure here is a seeded profile or an autofill test asserting a single value. Update the assertion to the contiguous band — do not revert the spread rule. Note in the commit which suites moved.

- [ ] **Step 8: Type-check and commit**

Run: `npx tsc --noEmit && npx tsc -p public/tsconfig.json --noEmit`

```bash
git add src/writing-feedback/rubric-bands.ts public/scripts/feature/writing-feedback-grid.ts src/writing-feedback/__tests__/rubric-bands.test.ts public/scripts/feature/__tests__/rubric-band-parity.test.ts
git commit -m "feat(writing-feedback): give each rubric level a contiguous points band"
```

---

### Task 2: Show and accept a range

**Files:**
- Modify: `public/scripts/feature/writing-feedback-grid.ts:141-162`

**Interfaces:**
- Consumes: nothing new.
- Produces: `formatBand(cell: RubricCell): string` and `parseBand(text: string): RubricCell | undefined` — signatures unchanged; both now carry ranges. Relied on by Task 4's band chip.

- [ ] **Step 1: Verify the failing display cases from Task 1**

Run: `npx jest rubric-band-parity`
Expected: FAIL on `shows a real band as an inclusive range` and `survives format then parse without flattening`.

- [ ] **Step 2: Rewrite both functions**

Replace `writing-feedback-grid.ts:133-162` (the two docstrings and both bodies) with:

```typescript
/** Inclusive range typed by staff: a hyphen, an en or em dash, or the word "to". */
const BAND_RANGE = /^(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)$/i;

/**
 * withinBandLimits - whether a number is a points value the draft schema will accept
 *
 * @param value - Candidate points value
 * @returns True when finite and within 0..1000 inclusive
 */
function withinBandLimits(value: number): boolean {
    return Number.isFinite(value) && value >= 0 && value <= 1000;
}

/**
 * formatBand - the staff-facing text for the points one cell awards
 *
 * A band that collapsed onto a single value reads as that value; a real range reads
 * as both ends, which is the number a marker actually needs -- "16-22" says what
 * latitude the level allows in a way "22" cannot.
 *
 * @param cell - Cell to display
 * @returns One number, or an inclusive range joined by an en dash
 */
export function formatBand(cell: RubricCell): string {
    return cell.min === cell.max ? String(cell.max) : `${cell.min}–${cell.max}`;
}

/**
 * parseBand - reads the points typed by staff into one cell
 *
 * Accepts one number, or a range written any of the ways staff actually write one.
 * A range given high-end-first is normalised rather than refused; anything else is
 * rejected rather than guessed at, so the cell reads as empty and its hint asks for
 * points.
 *
 * @param text - Raw control value
 * @returns The cell, or undefined when the text is blank or is not points
 */
export function parseBand(text: string): RubricCell | undefined {
    const normalized = text.trim();
    if (!normalized) return undefined;

    const range = BAND_RANGE.exec(normalized);
    if (range) {
        const first = Number(range[1]);
        const second = Number(range[2]);
        if (!withinBandLimits(first) || !withinBandLimits(second)) return undefined;
        // Written either way round; the schema requires min <= max.
        return first <= second ? { min: first, max: second } : { min: second, max: first };
    }

    const points = Number(normalized);
    if (!withinBandLimits(points)) return undefined;
    return { min: points, max: points };
}
```

- [ ] **Step 3: Run the parity suite**

Run: `npx jest rubric-band-parity`
Expected: PASS, all cases including the parity block.

- [ ] **Step 4: Confirm nothing else read the old single-value contract**

Run: `grep -n "formatBand\|parseBand" public/scripts/feature/*.ts`
Expected: only the definitions and the band control in `renderRubricGrid`. Any other caller must be checked for an assumption that the text is one number.

- [ ] **Step 5: Type-check, test and commit**

Run: `npx tsc -p public/tsconfig.json --noEmit && npx jest writing-feedback rubric`

```bash
git add public/scripts/feature/writing-feedback-grid.ts
git commit -m "feat(writing-feedback): show and accept an inclusive points band"
```

---

### Task 3: Let the grid's text be read

The defect. A descriptor holds up to 400 characters in a box fixed at two rows.

**Files:**
- Modify: `public/scripts/feature/writing-feedback-grid.ts` — the three `textAreaControl(..., 2)` sites at `:511`, `:614`, `:642`
- Modify: `public/styles/instructor-components/writing-feedback.css` — the `.wf-grid-text` rule

**Interfaces:**
- Produces: `autoGrow(control: HTMLTextAreaElement): void` — used by all three sites in this file only.

- [ ] **Step 1: Add the helper**

Add above `renderRubricGrid` in `writing-feedback-grid.ts`:

```typescript
/**
 * autoGrow - keeps a textarea tall enough to show everything in it
 *
 * A rubric descriptor may run to 400 characters inside a control that was two rows
 * tall, so most descriptors stopped mid-word with no affordance but the resize
 * handle. Staff could not read their own rubric.
 *
 * Height is cleared before it is measured, because scrollHeight of an element that
 * is already tall enough reports the height it was given, not the height it needs.
 * The first measurement is deferred: the control is not in the document when this
 * is called, and a detached element has no scrollHeight.
 *
 * @param control - Textarea to keep sized to its content
 */
function autoGrow(control: HTMLTextAreaElement): void {
    const fit = (): void => {
        control.style.height = 'auto';
        control.style.height = `${control.scrollHeight}px`;
    };
    control.addEventListener('input', fit);
    requestAnimationFrame(fit);
}
```

- [ ] **Step 2: Call it at all three sites**

At `:511` (level description), `:614` (criterion description) and `:642` (cell descriptor), add `autoGrow(<control>);` immediately after the existing `<control>.className = 'wf-grid-text';` line. The variables are `description`, `description` and `descriptor` respectively.

- [ ] **Step 3: Let the stylesheet allow it**

In `public/styles/instructor-components/writing-feedback.css`, replace the `.wf-grid-text` rule with:

```css
.wf-grid-text {
    display: block;
    width: 100%;
    /* Two rows is the floor, not the ceiling: autoGrow sets an explicit height from
       the content, and overflow must stay hidden or the box scrolls instead of grows. */
    min-height: 3.4em;
    padding: 4px 0;
    background: transparent;
    color: var(--text-primary);
    border: 0;
    border-radius: 4px;
    font: inherit;
    font-size: 13px;
    line-height: 1.45;
    overflow: hidden;
    resize: none;
}

.wf-grid-text:hover:not([readonly]) {
    background: var(--hover-bg);
}

.wf-grid-text:focus-visible {
    background: white;
    outline: 2px solid var(--color-chbe-green);
    outline-offset: 1px;
}
```

`resize` goes from `vertical` to `none` deliberately: the control now sizes itself, and a handle that fights it is worse than no handle.

- [ ] **Step 4: Verify in the browser**

Run the app (`SAML_AVAILABLE=false npm run dev`), open a rubric page, and confirm a long descriptor renders every word with no inner scrollbar, and that typing a fifth line grows the box rather than scrolling it.

- [ ] **Step 5: Type-check, build and commit**

Run: `npx tsc -p public/tsconfig.json --noEmit && npm run build`

```bash
git add public/scripts/feature/writing-feedback-grid.ts public/styles/instructor-components/writing-feedback.css
git commit -m "fix(writing-feedback): stop the rubric grid clipping its own descriptors"
```

---

### Task 4: The quiet table

**Files:**
- Modify: `public/styles/instructor-components/writing-feedback.css` — the `.wf-grid*` block, `:1371-1545`
- Modify: `public/scripts/feature/writing-feedback-grid.ts` — the band control's class at `:638`

- [ ] **Step 1: Restyle the table**

Replace the `.wf-grid`, `.wf-grid th/td`, `.wf-grid thead th`, `.wf-grid-band` and `.wf-grid-weight-input` rules with:

```css
.wf-grid {
    /* Auto layout, not fixed: the per-column min-widths are what push a wide rubric
       past the viewport and hand the overflow to .wf-grid-scroll. */
    width: 100%;
    border-collapse: collapse;
    color: var(--text-primary);
    font-size: 13px;
}

.wf-grid th,
.wf-grid td {
    padding: 12px 14px;
    text-align: left;
    vertical-align: top;
    border: 1px solid var(--border-color);
}

/* The band the step headers and the assignment cards use. The old green tint
   appeared nowhere else on the page. */
.wf-grid thead th {
    background: var(--background-2);
}

/* Points read as a band, not as a field: the chip carries the range above the
   descriptor it belongs to. */
.wf-grid-band {
    width: 100%;
    margin-bottom: 8px;
    padding: 2px 8px;
    background: var(--gingham-color);
    color: var(--color-chbe-green);
    border: 1px solid transparent;
    border-radius: 4px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.wf-grid-band:hover:not([readonly]),
.wf-grid-band:focus-visible {
    border-color: var(--color-chbe-green);
}

.wf-grid-band:focus-visible {
    background: white;
    outline: 2px solid var(--color-chbe-green);
    outline-offset: 1px;
}

.wf-grid-weight-input {
    width: 100%;
    padding: 4px 6px;
    background: transparent;
    color: var(--text-primary);
    border: 0;
    border-radius: 4px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.wf-grid-weight-input:hover:not([readonly]) {
    background: var(--hover-bg);
}

.wf-grid-weight-input:focus-visible {
    background: white;
    outline: 2px solid var(--color-chbe-green);
    outline-offset: 1px;
}
```

Apply the same treatment to `.wf-grid-label-input` — `background: transparent; border: 0;` with the hover and focus rules above — so the level and criterion names stop being boxes too.

- [ ] **Step 2: Pin the first and last columns**

Append:

```css
/* The criterion and its weight stay put while the levels scroll, so the row you are
   reading and the total it contributes to are never both off-screen. */
.wf-grid-corner,
.wf-grid-row-head {
    position: sticky;
    left: 0;
    z-index: 2;
    background: var(--chat-bg);
}

.wf-grid-corner {
    background: var(--background-2);
}

.wf-grid-points-head,
.wf-grid-weight {
    position: sticky;
    right: 0;
    z-index: 2;
    background: var(--chat-bg);
}

.wf-grid-points-head {
    background: var(--background-2);
}

/* A sticky cell paints over its neighbour, so the focus ring inside one has to
   outrank the cell beside it. */
.wf-grid-row-head:focus-within,
.wf-grid-weight:focus-within {
    z-index: 3;
}
```

- [ ] **Step 3: Quieten the delete controls**

Find the icon-button rule used by the grid's remove controls and replace its colour with:

```css
.wf-grid .wf-icon-button {
    color: var(--text-secondary);
}

.wf-grid .wf-icon-button:hover,
.wf-grid .wf-icon-button:focus-visible {
    color: var(--color-eng-red);
}
```

If the grid's remove buttons do not carry `.wf-icon-button`, run `grep -n "trash-2\|Remove" public/scripts/feature/writing-feedback-grid.ts` to find the class they do carry and use that instead. Do not add a new class name for this.

- [ ] **Step 4: Group the toolbar**

In `writing-feedback-grid.ts`, wrap the two add buttons in one element and push the rest right:

```typescript
    const addGroup = document.createElement('div');
    addGroup.className = 'wf-grid-tools__add';
    addGroup.append(addCriterion, addLevel);

    const spacer = document.createElement('span');
    spacer.className = 'wf-grid-tools__spacer';

    tools.append(addGroup, spacer, spaceEvenly, libraryPicker, addFromLibrary);
```

using whatever the existing local variable names are for those five controls — read the toolbar block at `:332-412` and keep them. Then:

```css
.wf-grid-tools__add {
    display: inline-flex;
}

.wf-grid-tools__add .wf-button {
    border-radius: 0;
    margin-left: -1px;
}

.wf-grid-tools__add .wf-button:first-child {
    border-radius: 6px 0 0 6px;
    margin-left: 0;
}

.wf-grid-tools__add .wf-button:last-child {
    border-radius: 0 6px 6px 0;
}

.wf-grid-tools__spacer {
    flex: 1 1 auto;
}
```

- [ ] **Step 5: Check the braces balance**

Run: `node -e "const s=require('fs').readFileSync('public/styles/instructor-components/writing-feedback.css','utf8');const o=(s.match(/{/g)||[]).length,c=(s.match(/}/g)||[]).length;console.log(o,c);if(o!==c)process.exit(1)"`
Expected: two equal numbers.

- [ ] **Step 6: Build and commit**

Run: `npx tsc -p public/tsconfig.json --noEmit && npm run build`

```bash
git add public/styles/instructor-components/writing-feedback.css public/scripts/feature/writing-feedback-grid.ts
git commit -m "feat(writing-feedback): restyle the marking grid on the page's own card language"
```

---

### Task 5: The grid's copy

**Files:**
- Modify: `public/scripts/feature/writing-feedback-grid.ts` — toolbar `:332-412`, column head `:441`, cell hints `:655-670`, total `:750`

- [ ] **Step 1: Apply the wording table**

| Line | Today | New |
|---|---|---|
| `:333` | `'Add a row'` | `'Add a criterion'` |
| `:351` | `'Add a column'` | `'Add a level'` |
| `:369` | `'Spread points evenly'` | `'Spread points evenly'` *(unchanged)* |
| `:408` | `'Add a suggested row'` | `'Add from the library'` |
| `:441` | `'What you mark'` | `'Criterion'` |
| `:662` | `'Add points'` | `'Points for this level'` |
| `:664` | `'Say what this looks like'` | `'What does this level look like?'` |
| `:750` | `'Total'` | `'Total across every criterion'` |

Also change the weight column head from `'Points'` to `'Weight'` at `:525`, and the library `<select>`'s placeholder option to `'Pick one…'`.

`What you mark` was written to avoid the word *criterion*, but the column holds the criterion's name and description, and the grid's own warnings, the library picker and the rest of the product all say *criterion*. Two names for one thing is worse than the technical one.

- [ ] **Step 2: Add the band format hint**

The band control now accepts two shapes, so it must say so — once per grid, not once per cell. After the toolbar is appended, add:

```typescript
    const bandHint = createText(
        'p',
        'Points can be one number, or a range like 16–22.',
        'wf-grid-band-hint'
    );
    bandHint.id = `${gridId}-band-hint`;
    container.append(bandHint);
```

and give every band control `bandInput.setAttribute('aria-describedby', `${gridId}-band-hint`);` at `:639`. Then:

```css
.wf-grid-band-hint {
    margin: 0 0 10px;
    color: var(--text-secondary);
    font-size: 12px;
}
```

- [ ] **Step 3: Sweep for anything missed**

Run: `grep -n "Add a row\|Add a column\|Add a suggested row\|What you mark\|'Say what this looks like'\|'Add points'" public/scripts/feature/writing-feedback-grid.ts`
Expected: no results.

- [ ] **Step 4: Type-check, test and commit**

Run: `npx tsc -p public/tsconfig.json --noEmit && npx jest writing-feedback`
Expected: PASS. `writing-feedback-rubric-source.test.ts` pins rubric-page labels, not grid labels, so it should not move; if it does, the assertion is pinning a string this table changed — update it to the new wording.

```bash
git add public/scripts/feature/writing-feedback-grid.ts public/styles/instructor-components/writing-feedback.css
git commit -m "feat(writing-feedback): call a criterion a criterion in the marking grid"
```

---

### Task 6: Say when a Canvas rubric could not be imported

Import already honours the real Canvas shape — `canvas-rubric-shape-fidelity.test.ts` pins two rows to two criteria, two ratings to two levels, and 10×8 intact. What it does not do is say anything when the rubric falls outside the grid contract: `canvasRubricToSeedShape` returns `null`, the built-in profile seeds instead, and the instructor is shown a rubric that is not theirs.

**Files:**
- Modify: `src/writing-feedback/canvas-rubric-mapping.ts`
- Modify: `src/writing-feedback/contracts.ts:157-181`, `src/types/shared.ts`, `public/scripts/types.ts`
- Modify: `src/routes/route-writing-feedback.ts:340`
- Modify: `public/scripts/feature/writing-feedback-rubric.ts` — step 2 body
- Test: `src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts`

**Interfaces:**
- Produces: `mapCanvasRubric(rubric): { shape: ImportedRubricShape | null; refusal?: CanvasRubricRefusal }` and `type CanvasRubricRefusal = 'no_rubric' | 'too_few_ratings' | 'too_many_criteria' | 'too_many_levels'`. `canvasRubricToSeedShape` keeps its existing signature and its callers.
- Produces: optional `WritingAssignment.canvasRubricRefusal?: CanvasRubricRefusal`.

- [ ] **Step 1: Write the failing test**

Append to `src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts`:

```typescript
describe('mapCanvasRubric reports why it refused', () => {
    it('names a rubric whose criteria offer only one rating', () => {
        const result = mapCanvasRubric(rubricWith(2, 1));
        expect(result.shape).toBeNull();
        expect(result.refusal).toBe('too_few_ratings');
    });

    it('names a rubric with more criteria than the grid allows', () => {
        const result = mapCanvasRubric(rubricWith(11, 4));
        expect(result.shape).toBeNull();
        expect(result.refusal).toBe('too_many_criteria');
    });

    it('names a rubric with more ratings than the grid allows', () => {
        const result = mapCanvasRubric(rubricWith(2, 9));
        expect(result.shape).toBeNull();
        expect(result.refusal).toBe('too_many_levels');
    });

    it('names an absent rubric', () => {
        expect(mapCanvasRubric(undefined).refusal).toBe('no_rubric');
    });

    it('reports no refusal when the rubric maps', () => {
        const result = mapCanvasRubric(rubricWith(3, 4));
        expect(result.shape).not.toBeNull();
        expect(result.refusal).toBeUndefined();
    });

    it('leaves canvasRubricToSeedShape behaving exactly as before', () => {
        expect(canvasRubricToSeedShape(rubricWith(2, 1))).toBeNull();
        expect(canvasRubricToSeedShape(rubricWith(3, 4))).not.toBeNull();
    });
});
```

Add a `rubricWith(rows, cols)` builder to that file if it has none, copying the one in `canvas-rubric-shape-fidelity.test.ts` — it already builds a valid `CanvasImportedRubric` with `canvasRubricId`, `importedAt`, `canvasCriterionId` and `canvasRatingId`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest canvas-rubric-mapping`
Expected: FAIL — `mapCanvasRubric is not a function`.

- [ ] **Step 3: Split the mapper**

In `canvas-rubric-mapping.ts`, add the type and the reporting function, and reduce the existing export to a wrapper:

```typescript
/** Why a Canvas rubric could not become a grid. Staff-facing text lives in the page. */
export type CanvasRubricRefusal =
    | 'no_rubric'
    | 'too_few_ratings'
    | 'too_many_criteria'
    | 'too_many_levels';

/** A mapped grid, or the reason there is not one. */
export interface CanvasRubricMapping {
    shape: ImportedRubricShape | null;
    refusal?: CanvasRubricRefusal;
}

/**
 * mapCanvasRubric — the Canvas rubric as a draft grid, or the reason it cannot be one.
 *
 * The refusal exists because falling back to the built-in profile silently shows an
 * instructor a rubric that is not theirs, with nothing saying so.
 *
 * @param rubric - Rubric read from Canvas, unmodified
 * @returns The seedable grid, or a refusal naming what put it out of contract
 */
export function mapCanvasRubric(rubric: CanvasImportedRubric | null | undefined): CanvasRubricMapping {
    const rows = (rubric?.rows ?? []).filter((row) => row.ratings.length > 0);
    if (rows.length === 0) return { shape: null, refusal: 'no_rubric' };
    if (rows.length > MAX_CRITERIA) return { shape: null, refusal: 'too_many_criteria' };

    const widest = rows.reduce((best, row) => (row.ratings.length > best.ratings.length ? row : best), rows[0]);
    const columnCount = widest.ratings.length;
    if (columnCount < MIN_LEVELS) return { shape: null, refusal: 'too_few_ratings' };
    if (columnCount > MAX_LEVELS) return { shape: null, refusal: 'too_many_levels' };

    return { shape: buildShape(rows, widest) };
}

/**
 * canvasRubricToSeedShape — the Canvas rubric as a draft grid, or `null`.
 *
 * Kept for callers that only need the grid. {@link mapCanvasRubric} also says why.
 *
 * @param rubric - Rubric read from Canvas, unmodified
 * @returns Criteria and levels ready to seed a draft, or `null` when out of contract
 */
export function canvasRubricToSeedShape(rubric: CanvasImportedRubric | null | undefined): ImportedRubricShape | null {
    return mapCanvasRubric(rubric).shape;
}
```

Move the existing level-and-criterion construction from the current `canvasRubricToSeedShape` body into a private `buildShape(rows: CanvasRubricRow[], widest: CanvasRubricRow): ImportedRubricShape`, unchanged.

- [ ] **Step 4: Run the mapper tests**

Run: `npx jest canvas-rubric-mapping canvas-rubric-shape-fidelity`
Expected: PASS, both suites. The fidelity suite must not move — it exercises the wrapper.

- [ ] **Step 5: Carry the refusal onto the assignment**

Add to `WritingAssignment` in `src/writing-feedback/contracts.ts`, after `canvasAssignmentId`:

```typescript
    /**
     * Set when this assignment was imported from Canvas but its Canvas rubric could
     * not be represented as a grid, so the built-in profile seeded the draft instead.
     * Cleared once a rubric is approved: from then on the rubric is staff's own.
     */
    canvasRubricRefusal?: CanvasRubricRefusal;
```

Mirror the field and the `CanvasRubricRefusal` union into `src/types/shared.ts` and `public/scripts/types.ts` — AGENTS.md requires shared API types in both. Mirror it onto the frontend `Assignment` interface in `public/scripts/feature/writing-feedback-shared.ts` too, since that is what the rubric page reads.

In `route-writing-feedback.ts:340`, replace the single call with the mapping and persist the refusal on creation:

```typescript
        const mapping = mapCanvasRubric(context?.rubric);
        const seedGrid = mapping.shape ?? undefined;
```

and pass `mapping.refusal` through `createCanvasWritingAssignment` alongside `seedGrid`, extending that delegate's signature. Leave the existing-assignment branch alone: a re-import does not re-seed the grid, so it must not re-stamp the refusal either.

- [ ] **Step 6: Show it on the rubric page**

In `writing-feedback-rubric.ts`, at the top of `step2Body` and before the first `renderRubricSection` call:

```typescript
    // An imported assignment whose Canvas rubric was out of contract was seeded from
    // the built-in profile instead. Staff met that silently until now.
    if (assignment.canvasRubricRefusal && !linguisticData.approved) {
        const dropped = document.createElement('div');
        dropped.className = 'wf-owed';
        dropped.append(
            createText('p', "This assignment's Canvas rubric could not be imported", 'wf-owed__title'),
            createText('p', `${canvasRefusalReason(assignment.canvasRubricRefusal)} The starting grid below is EngE-AI's default — replace it with your own before approving.`)
        );
        step2Body.append(dropped);
    }
```

with, beside the other helpers in that file:

```typescript
/**
 * canvasRefusalReason - why a Canvas rubric could not become a grid, in staff language
 *
 * @param refusal - Reason recorded at import
 * @returns One sentence naming what put the rubric out of contract
 */
function canvasRefusalReason(refusal: CanvasRubricRefusal): string {
    switch (refusal) {
        case 'too_few_ratings':
            return 'Its criteria offer one rating each, and a marking grid needs at least two to compare against.';
        case 'too_many_criteria':
            return `It has more than ${MAX_CRITERIA} criteria, which is more than a grid here can hold.`;
        case 'too_many_levels':
            return `It has more than ${MAX_LEVELS} ratings on a criterion, which is more levels than a grid here can hold.`;
        case 'no_rubric':
        default:
            return 'The Canvas assignment carried no rubric.';
    }
}
```

`.wf-owed` already exists from the v3 work and needs no new CSS.

- [ ] **Step 7: Type-check both projects, test, commit**

Run: `npx tsc --noEmit && npx tsc -p public/tsconfig.json --noEmit && npx jest writing-feedback canvas`

```bash
git add src/writing-feedback/canvas-rubric-mapping.ts src/writing-feedback/contracts.ts src/types/shared.ts public/scripts/types.ts public/scripts/feature/writing-feedback-shared.ts src/routes/route-writing-feedback.ts src/writing-feedback/__tests__/canvas-rubric-mapping.test.ts public/scripts/feature/writing-feedback-rubric.ts src/db/mongo
git commit -m "feat(writing-feedback): say when a Canvas rubric could not be imported"
```

- [ ] **Step 8: Update the contract docs**

`documents/ENDPOINT_ARCHITECTURE.md` and `documents/MONGO_DATA_LAYER.md` must record the new assignment field, per AGENTS.md. Add one line to each naming `canvasRubricRefusal`, its four values, and that it is set only at Canvas import and never on re-import.

```bash
git add documents/ENDPOINT_ARCHITECTURE.md documents/MONGO_DATA_LAYER.md
git commit -m "docs: record the Canvas rubric refusal field"
```

---

### Task 7: Guard, verify, and record

**Files:**
- Modify: `src/helpers/__tests__/rubric-page-design-guard.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Extend the design guard**

Add to the `rubric page styles` describe block:

```typescript
    it('drops the green header tint the rest of the page never uses', () => {
        const gridRules = css.slice(css.indexOf('.wf-grid {'), css.indexOf('.wf-grid-warnings'));
        expect(gridRules).not.toContain('color-mix(in srgb, var(--color-chbe-green) 12%');
    });

    it('lets a grid descriptor grow instead of clipping', () => {
        expect(css).not.toMatch(/\.wf-grid-text\s*{[^}]*resize:\s*vertical/);
        expect(css).toMatch(/\.wf-grid-text\s*{[^}]*overflow:\s*hidden/);
    });
```

and to the `rubric page copy` block:

```typescript
    it('calls a criterion a criterion', () => {
        expect(read(GRID_TS)).not.toContain('What you mark');
        expect(read(GRID_TS)).not.toContain('Add a suggested row');
    });
```

- [ ] **Step 2: Watch each new assertion fail before trusting it**

For each of the three: reintroduce the pattern it forbids, run `npx jest rubric-page-design-guard`, confirm that case fails, then revert and confirm green. A guard nobody has watched fail is a guard nobody should trust.

- [ ] **Step 3: Bump the version**

`package.json` is at `1.12.0`. This is a feature: set `"version": "1.13.0"`.

- [ ] **Step 4: Run the full ladder**

```bash
npx tsc --noEmit
npx tsc -p public/tsconfig.json --noEmit
npm run build
npx jest
git diff --check
```

Expected: both type-checks clean, `npm run build` reports `1.13.0`, `git diff --check` clean. The branch baseline is **989 / 993**, the only failing suite being `scenario-practice-limits` (4 assertions, pre-existing `PRACTICE_DAILY_MAX_ATTEMPTS` policy conflict). Anything else that fails is this change's problem.

- [ ] **Step 5: The browser pass**

The v3 pass already drives this exact grid on a plain assignment and a lab report at 1440, 768 and 320px. Playwright works here — the recipe is in `../project-memory/02 Session Log/2026-09-01 - Rubric Page Redesign v3 Implementation.md`: the bundled `chromium-1232` build plus four NSS libraries extracted with `apt-get download libnss3 libnspr4` and `dpkg -x` into a temp prefix, launched with `LD_LIBRARY_PATH` and `executablePath`. Do not run `npx playwright install` — it refuses on Ubuntu 26.04 and deletes the build it cannot verify.

Re-run it, and add these checks:

- [ ] A long descriptor shows every word, with no inner scrollbar.
- [ ] A cell whose band is a range renders `16–22`; typing `16-22`, `16 – 22` and `16 to 22` all produce the same stored band.
- [ ] The criterion column and the weight column stay put while the level columns scroll.
- [ ] The grid still scrolls inside `.wf-grid-scroll` and the page never scrolls sideways, at all three widths.
- [ ] The toolbar shows one segmented add-pair, not five equal buttons.
- [ ] Every control is still at least 44px tall at 320px.
- [ ] No console errors beyond the app-wide `/favicon.ico` 404.

- [ ] **Step 6: Commit**

```bash
git add src/helpers/__tests__/rubric-page-design-guard.test.ts package.json
git commit -m "chore: bump to 1.13.0 for the rubric grid redesign"
```

- [ ] **Step 7: Update project memory**

Add a dated handoff under `../project-memory/02 Session Log/`, update `Current State.md`, and record in `Decisions.md`:

- Rubric cells hold inclusive contiguous bands again; `spaceBandsEvenly` covers `0..weight` with no gaps, collapsing adjacent bands when the weight cannot separate every level. **This supersedes the second D-072** ("A rubric cell holds one award per level, not a points range"), whose Canvas-mirroring rationale still governs imported cells only.
- Canvas import is one-shot by design: the rubric is the one imported when the assignment was first brought over, and a later Canvas edit never reaches back into it.
- A Canvas rubric outside the grid contract is disclosed on the rubric page rather than silently replaced.

Also note two findings for whoever owns them, without acting on either: `requireCompleteRubricCells` is an exported approval gate with zero callers, and `Decisions.md` carries **duplicate ids D-060 through D-072** in two separate blocks.

Never record submission text, PUIDs, or generated feedback.

---

## Self-review

**Spec coverage.** Direction A's visual table → Tasks 3 and 4. Points bands → Tasks 1 and 2. Copy → Task 5. Canvas disclosure → Task 6. Re-import staying one-shot → no code, recorded in Task 7. Accessibility → Task 3 (focus), Task 4 (sticky z-index), Task 5 (`aria-describedby`), verified in Task 7. Testing → Tasks 1, 2, 6, 7.

**Two gaps found and closed while writing.** First, the spec said `src/` was untouched apart from the Canvas fix; that was wrong, because `spaceBandsEvenly` is mirrored in `rubric-bands.ts` and consumed by the two seeded profiles, auto-fill, and **suggested grading** — Task 1 now owns both copies and names the downstream behaviour change rather than letting it surprise a reviewer. Second, the spec proposed storing the Canvas refusal while also declaring "no new stored field"; Task 6 stores it and the constraint above now says so explicitly, because a notice that vanishes on navigation does not solve the problem it exists for.

**One correctness bug caught before it shipped.** The contiguous rule as first written produces `min > max` on a criterion weighted below its level count — a 2-point criterion across four levels computes `(2, 1)`, which the draft schema rejects outright. Task 1's clamp and its `never produces a band that starts above where it ends` case, which sweeps every weight 0–60, exist because of it.

**Names checked across tasks:** `spaceBandsEvenly`, `resolveBand`, `formatBand`, `parseBand`, `withinBandLimits`, `BAND_RANGE`, `autoGrow`, `mapCanvasRubric`, `canvasRubricToSeedShape`, `buildShape`, `CanvasRubricRefusal`, `CanvasRubricMapping`, `canvasRubricRefusal`, `canvasRefusalReason`, `.wf-grid-band`, `.wf-grid-band-hint`, `.wf-grid-text`, `.wf-grid-tools__add`, `.wf-grid-tools__spacer`, `.wf-owed` — each defined once and used consistently.
