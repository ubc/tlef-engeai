# Rubric grid redesign, points bands, and a Canvas import disclosure

**Date:** 2026-09-02
**Status:** Design approved (Direction A + restored bands), implementation not started
**Mockups:** https://claude.ai/code/artifact/f9312623-3500-4609-8b35-2424e66e5083
**Builds on:** `2026-08-31-rubric-page-redesign-v3-design.md`, which rebuilt the page *around* this grid into three guided steps. That spec's palette table, copy rules, and 44px rule apply here unchanged.

## Why

The v3 redesign stopped at the edge of the marking grid. Inside step 2 the grid is still the component that reads as generated, and one of its problems is a defect rather than a matter of taste.

1. **You cannot read your own rubric.** Every descriptor is a `textarea` fixed at two rows (`textAreaControl(..., 2)`, `writing-feedback-grid.ts:642`) holding up to 400 characters, so most descriptors stop mid-word with no affordance but dragging the resize handle. This is the first thing to fix and it is worth more than everything else here.
2. **Three borders deep.** A bordered field inside a bordered cell inside a bordered table, forty times over. Nothing is emphasised, so the grid reads as a form dump.
3. **Off-palette.** The header row is `color-mix(--color-chbe-green 12%, --chat-bg)`, a tint that appears nowhere else on the page. The step headers beside it use `--background-2`.
4. **The total is off-screen.** The weight column and the `Total` row sit past the right edge at normal width, so the "100 points" the progress strip promises is invisible without scrolling.
5. **Points bands were collapsed to single numbers**, which left staff without the one number a marker actually needs — the latitude a level allows.

## Scope

**In:** the grid's visual treatment, its text sizing, its toolbar grouping, its column pinning, its staff-facing copy; restoring inclusive points bands to display and entry; disclosing a Canvas rubric that could not be imported.

**Out, frozen:** the rubric data model, `WritingRubricCell`'s stored shape, the approval contract, both feedback engines, and the student-facing PDF. No migration, and no new field on the *rubric*.

**Two corrections to an earlier draft of this scope line**, both found while writing the implementation plan:

- **`src/` is not untouched.** `spaceBandsEvenly` is mirrored in `src/writing-feedback/rubric-bands.ts` and consumed by `default-rubric-profile.ts`, `lab-report-profile.ts`, `rubric-autofill.ts` and — through `resolveBand` — `suggested-grading.ts`. Restoring bands changes what all four produce. `suggested-grading.ts` is staff-facing, and its per-criterion and total ranges stop being degenerate. That is the intended outcome (D-064 already says *"the total is the sum as a range"*), but it is a behaviour change and is named here rather than discovered in review.
- **One new stored field is required.** `WritingAssignment.canvasRubricRefusal` is optional and additive. A transient notice was considered and rejected: an instructor who navigates away and returns a week later would have no way to learn their Canvas rubric had been dropped, which is the exact failure the disclosure exists to prevent.

No new colour value enters the stylesheet in any case.

## Direction: the quiet table

Chosen from three (mockups linked above). The table stays, the interaction stays, and the furniture goes.

Rejected: **read-first / edit-on-click**, which removes the form-like feel most completely but costs a display⇄edit swap on every cell with real keyboard and screen-reader risk; and **one card per criterion**, which kills the sideways scroll but loses the column-wise read, and a rubric is a grid — comparing one level across every criterion is how the levels get calibrated against each other.

### What changes

| Element | Today | New |
|---|---|---|
| Field | White fill, `1px solid --border-color`, `6px` radius, inside a bordered cell | No fill, no border, no radius; sits directly on the cell. `--hover-bg` on hover, the standard `2px solid --color-chbe-green` ring on focus |
| Header band | `color-mix(--color-chbe-green 12%, --chat-bg)` | `--background-2`, matching `.wf-step-header` and `.wf-assignment-header` |
| Descriptor height | `rows="2"`, fixed | Grows to fit its content, 2 rows minimum, no cap. `resize` goes to `none`: the control sizes itself, and a drag handle fighting that is worse than none |
| Points | Bare number in a bordered input | An inclusive band, shown as a tinted `--gingham-color` chip above the descriptor |
| Row head | Bordered label + bordered description | 14px/600 label, 12px `--text-secondary` description, no field borders |
| Delete | `--color-eng-red` trash icon, always | `--text-secondary` icon; `--color-eng-red` on hover and focus only |
| Toolbar | Five equal-weight controls in a row | `Add a criterion` / `Add a level` as one segmented pair; `Spread points evenly` and the library picker pushed right as quiet actions |
| Row head + weight columns | Scroll away with the table | `position: sticky` — row head left, weight right — so the criterion and its total stay visible while levels scroll |
| Empty cell | Grey fill plus a hint | Same grey, hint reworded (below) |

Every value above already exists in `style.css` or on `.wf-page`. The design guard's hex assertion must stay green.

## Points bands

This is the substantive change, and the machinery for it already exists.

### What is already true

- `WritingRubricCell` is `{ min: number; max: number; descriptor?: string }`, both ends persisted. Its comment in `contracts.ts:100` reads *"lowest points awardable in this band, inclusive"*.
- `rubric-schema.ts:57` documents the cell as *"Ranges are inclusive and may collapse to a single value"*, validates each end 0–1000, and rejects `min > max` with *"A points range cannot start above where it ends"*.
- `suggested-grading.ts` already reports per-criterion `min`/`max` and sums `totalMin`/`totalMax`. D-064 states *"the total is the sum as a range"*.
- The existing D-065 warning already says a criterion *"needs at least N−1 points to give every level its own range"* — wording that has been describing something the UI stopped doing.

So the bands themselves need **no schema change and no migration.** Three functions collapsed the range and made all of the above inert:

```ts
formatBand(cell) → String(cell.max)         // grid.ts:141 — min is discarded on display
parseBand(text)  → { min: n, max: n }       // grid.ts:155 — a typed range is rejected
spaceBandsEvenly → { min: award, max: award } // grid.ts:76  — spread writes equal pairs
```

That was D-072 (2026-08-26), for a sound reason at the time: a Canvas rubric rating is a single number, and the grid was made to mirror Canvas so an import maps without invention. That reasoning still governs **imported** cells, which arrive collapsed and stay collapsed until staff widen them. It should not govern a rubric authored here.

### What changes

- **`formatBand`** returns `min === max ? String(max) : `${min}–${max}``. An en dash, not a hyphen.
- **`parseBand`** accepts a single number *or* a range written with a hyphen, en dash, or `to`, in either order of writing, tolerating spaces: `16-22`, `16 – 22`, `16 to 22`. It normalises to `{ min, max }` with `min ≤ max`, and still rejects anything else rather than guessing. A single number continues to yield `{ n, n }`, so nothing about existing entry changes.
- **`spaceBandsEvenly`** writes **contiguous bands covering `0..points` with no gaps**: level *i* of *n* spans from the previous band's top plus one, up to `floor(points × (i+1) / n)`, with the top level's `max` pinned to `points` exactly so rounding never loses the weight. The lowest band starts at `0`.

  A 30-point criterion across four levels becomes `0–7`, `8–15`, `16–22`, `23–30`. Every integer from 0 to 30 falls in exactly one band, which is the property that makes a band useful to a marker.

  **The pigeonhole clamp is required, not optional.** When a criterion's weight is smaller than its level count, the naive rule produces a band whose start is above its end — a 2-point criterion across four levels yields `(2, 1)` at the third level, which the schema rejects outright with *"A points range cannot start above where it ends"*. So when the computed start exceeds the computed top, the band collapses to `{ top, top }` and shares that value with its neighbour. This is exactly the collapse D-065 accepted as deliberate; the existing warning — *"needs at least N−1 points to give every level its own range"* — already tells staff it has happened. Verified across weights 0, 1, 2, 3, 5, 30, 100 and 1000 against level counts 2–8: every band satisfies `min ≤ max`, the lowest starts at `0`, and the highest ends at the weight.
- **`resolveBand`** is unchanged; it already returns whatever the cell holds.
- **The `Total` row is unchanged** — the sum of the criterion weights, `100 points`. It answers "what is this rubric out of", which is one number. `suggested-grading.ts`'s range answers a different question, about one submission, and stays where it is.

### Limits worth stating

- **Canvas cannot express a band.** A Canvas rating is one number, so `canvas-rubric-mapping.ts` continues to write `{ points, points }`. A band widened in EngE-AI exists only here.
- **Release is unaffected.** A band is a staff-facing marking aid. It never reaches the student PDF, a release payload, or a Canvas grade — D-064 already forbids that, and nothing here touches it.
- **The flattening path is being reversed, not fixed.** `formatBand`'s current comment states plainly that a rubric carrying `min !== max` *"shows its max … and saving the rubric normalises it"*. That normalisation was deliberate. After this change it stops happening, and a genuine band survives a save. No rubric in the database currently holds `min !== max`, because all three writers produce equal pairs, so nothing is recovered and nothing is lost.

## Canvas import

**Verified working, and now pinned.** `canvas-rubric-shape-fidelity.test.ts` (committed `23b5974`) drives the real mapper and seed resolver: two Canvas rows become two criteria, two ratings become two levels, Canvas row weights carry across, and 10×8 survives intact. Rows with unequal rating counts align weakest-to-weakest, leaving a short row's strongest columns empty rather than guessing at the middle.

**Re-import deliberately does not re-seed the grid.** Explicit product decision, 2026-09-02: the rubric EngE-AI marks against is the one imported when the assignment was first brought over, and a later edit in Canvas does not reach back into it. `route-writing-feedback.ts:353` already behaves this way. No change — the behaviour is now recorded rather than incidental.

### The one fix: a dropped rubric must say so

The grid contract allows 1–10 criteria and 2–8 levels. Outside that — most realistically a Canvas rubric whose richest row carries a single rating — `canvasRubricToSeedShape` returns `null` and the built-in profile seeds the draft instead. The instructor is shown a rubric that is not theirs, with nothing saying so.

- `canvasRubricToSeedShape` gains a sibling, `mapCanvasRubric`, that returns a **reason** rather than only `null`: too few ratings, too many criteria, too many levels, or no rubric at all. The existing function becomes a wrapper, keeping its signature and its callers.
- The reason is stored as `WritingAssignment.canvasRubricRefusal`, optional and additive, set only when the assignment is first created from Canvas and never re-stamped on re-import.
- The rubric page renders it in step 2, in the amber `.wf-owed` treatment step 3 already uses:

  > **This assignment's Canvas rubric could not be imported**
  > Its criteria offer one rating each, and a marking grid needs at least two to compare against. The starting rubric below is EngE-AI's default — replace it with your own before approving.

- It is a disclosure, not a gate. Nothing is blocked, and it disappears once staff have approved a rubric.

This is the one place the plan touches `src/`.

## Copy

Applying the v3 rules — a concrete restatement, never a definition of the framework, and nothing that reads machine-written.

| Today | New |
|---|---|
| What you mark | **Criterion** |
| Add a row | **Add a criterion** |
| Add a column | **Add a level** |
| Add a suggested row | **Add from the library** |
| Choose a library criterion | **Pick one…** |
| Say what this looks like | **What does this level look like?** |
| Add points | **Points for this level** |
| Total | **Total across every criterion** |
| Points *(weight column head)* | **Weight** |

`What you mark` was written to avoid the word *criterion*, but the column holds the criterion's name and description and the rest of the product calls it a criterion — including the grid's own warnings and the library picker. Two names for one thing is worse than the technical one.

## Accessibility

- The band chip is not a separate control; it stays the same labelled input, restyled. Its accessible name is unchanged.
- A band input announces its format: `aria-describedby` pointing at a hint reading *"One number, or a range like 16–22."* rendered once per grid, not per cell.
- Sticky columns must not trap focus or hide the focus ring; the ring is `2px solid var(--color-chbe-green)` and needs `z-index` above the sticky cell's background.
- Auto-growing a textarea must not move focus or scroll the page.
- 44px minimum on every control at every width, per D-053 and the v3 spec.

## Testing

- **Unit:** `parseBand` and `formatBand` round-trip every accepted form, reject every malformed one, and preserve `min !== max` through a parse→format→parse cycle — the pin against re-flattening. `spaceBandsEvenly` produces contiguous, gapless, non-overlapping bands whose top equals the weight, across every level count 2–8 and a range of weights including ones too small to give each level its own band (D-065).
- **Backend:** the mapper's new reason is exhaustive over the refusal cases the existing `returns null` tests already cover.
- **Design guard:** extend `rubric-page-design-guard.test.ts` — the green header tint is gone, `wf-grid-text` carries no fixed `rows`, and no new hex enters the grid rules. Watch each new assertion fail before trusting it.
- **Browser:** re-run the existing pass, which already drives this grid on a plain assignment and a lab report at 1440/768/320px. Add checks for a descriptor rendering its full text, a band showing as a range, the row head and weight column staying put while levels scroll, and the toolbar not wrapping into five equal buttons.

## Delivery

Continues on `worktree-rubric-page-redesign`, which already carries the v3 work at 1.12.0 and is not yet pushed. This is a minor bump to **1.13.0**.

## Open questions

1. Should the band format be offered to students anywhere? Currently no, and D-064 forbids it for suggested grading. Stated here only so the answer is on the record.
2. `bandsDisagreeAt` warns when a criterion's bands top out below its weight. With contiguous bands that warning becomes reachable in a new way — a staff member who edits one band by hand can leave a gap. Should a *gap* between adjacent bands warn too, or only a shortfall at the top?
3. The library picker (`Add from the library`) is a `<select>` styled unlike every other control on the page. Out of scope here; worth its own pass.
