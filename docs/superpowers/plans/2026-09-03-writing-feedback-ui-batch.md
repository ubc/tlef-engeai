---
tags:
  - enge-ai
  - plan
date: 2026-09-03
branch: worktree-rubric-page-redesign
---

# Writing Feedback UI batch — grid borders, rubric names, grading modal, PDF preview, grade entry, earned level

Six user-reported changes to the Writing Feedback rubric page, review page, and student PDF.
Approved in chat on 2026-09-03. Branch `worktree-rubric-page-redesign`, worktree
`tlef-engeai/.claude/worktrees/rubric-page-redesign`, on top of `3a1c64e`.

## Task 1 — Frame the grids at their extremes

`.wf-grid th/td` carry a border, but `.wf-grid-corner` / `.wf-grid-row-head` (sticky left) and
`.wf-grid-points-head` / `.wf-grid-weight` (sticky right) paint only an inner edge through
`box-shadow`. Under `border-collapse: collapse` the table owns a sticky cell's outer border and
it does not paint, so both extremes read as open. The review page's suggested-grading table has
no frame either.

- Add a `1px solid var(--border-color)` frame and an `8px` radius to `.wf-grid-scroll` and
  `.wf-suggested-grading__scroll` in `public/styles/instructor-components/writing-feedback.css`.
- The frame sits on the scroll container, so it holds at every scroll offset and needs no
  change to the table markup or to the existing inner-seam shadows.

Verify: static grid harness at 1440 / 768 / 320px.

## Task 2 — Name the two rubrics

`writing-feedback-rubric.ts:1407,1421` heads the sections "How they wrote it" and "The
experiment itself". D-066 says the two rubrics are named **Writing rubric** and **Technical
rubric**, with a single-rubric assignment saying just **Rubric**; the v3 redesign drifted from
its own decision.

- Lab report: headings `Writing rubric` and `Technical rubric`; each existing plain-English
  heading moves into that section's `subtitle`, joined to the subtitle already there.
- Plain assignment: heading `Rubric`, subtitle unchanged.
- `errorLabel` follows: `the writing rubric` / `the technical rubric`.

No test pins the current strings.

## Task 3 — Suggested grading opens as a modal

`renderSuggestedGrading` (`writing-feedback-review.ts:161`) builds a hidden panel toggled in
place. It becomes a modal, matching how the download preview already behaves.

- Add `overlayClass?: string` to `ModalConfig` in `public/scripts/types.ts` and apply it to the
  overlay element in `modal-overlay.ts`. This is a frontend-only type, so it has no
  `src/types/shared.ts` mirror.
- Add `showGridModal(title, content)` beside `showViewerModal`: `maxWidth: min(1400px, 96vw)`,
  `customClass: 'modal--grading'`, `overlayClass: 'modal-overlay--grading'`,
  `closeOnOverlayClick: false`, one Close button.
- Scope `backdrop-filter: blur(6px)` to `.modal-overlay--grading`. The global blur on
  `.modal-overlay` was deliberately removed (`modal-overlay.css:32`) and stays removed.
- The button reads `Open rubric grading` and shows the same `panel` node. The node is
  reparented, not rebuilt, so typed values survive close and reopen and `readAssessment`
  is unchanged.

## Task 4 — Widen the PDF preview

`showViewerModal` caps at `min(1100px, 95vw)`, and `.modal--viewer` has been passed as a
`customClass` since it was written while having no CSS at all. `.modal-body`'s `max-height: 60vh`
also clips the frame's `min(75vh, 900px)`, so the document scrolls inside a scroll box.

- `maxWidth` to `min(1500px, 96vw)`.
- Add real `.modal--viewer` rules: `.modal-body` `max-height: none` and trimmed padding.
- `.wf-pdf-frame` height to `min(82vh, 1000px)`.

## Task 5 — Enter moves to the next grade

Each `wf-final-grade-input` gains a keydown handler: Enter focuses and selects the next
criterion's input, Shift+Enter the previous, and the last input blurs. `preventDefault` on
Enter; the inputs sit outside any form, so nothing is submitted.

## Task 6 — The earned level, in the PDF and live

`rubric-grid-renderer.ts:143` reads `criterion.cells?.[level.id]` directly and so bypasses
`resolveBand`, which already derives bands from `spaceBandsEvenly` when a criterion has no
authored cells. `cells` is sparse (D-060), so a criterion without authored bands is never
marked — the reported "only one criterion is green". Legacy `min === max` bands from the
superseded D-072, and a fractional grade admitted by `step="0.01"`, miss for the same reason.

- Add `earnedLevelFor(criterion, levels, points)` to **both** band mirrors:
  `src/writing-feedback/rubric-bands.ts` and `public/scripts/feature/writing-feedback-grid.ts`.
  It resolves through `resolveBand`; when no band contains the points it clamps to the
  highest-ranked level whose `min <= points`, and to the lowest-ranked level below that.
  No weight is invented — this is the derivation the rubric page already shows staff.
- `rubric-grid-renderer.ts` uses it.
- The review grid paints `.wf-suggested-grading__earned` on the containing cell as staff type,
  kept visually distinct from the model's existing `__choice` marker so both read when they
  land on the same cell.

## Testing

- `rubric-band-parity.test.ts` extended to run `earnedLevelFor` across both mirrors.
- New `earnedLevelFor` cases: sparse `cells`, degenerate `min === max`, fractional points,
  points above the top band, zero.
- `rubric-grid-smoke.test.ts` gains a case asserting a rubric with no authored `cells` marks
  every criterion. Its existing "no awarded points fall inside any band" case changes meaning:
  points outside every band now clamp rather than leaving the row unmarked, and its comment is
  corrected to say so.
- Frontend: grades typed in the modal survive close and reopen; Enter advances focus.
- `npx tsc --noEmit` on both projects, `npm run build`, full `npx jest`
  (baseline 1143 / 1147; `scenario-practice-limits` fails identically on clean HEAD).
- Browser pass at 1440 / 768 / 320px. The grid frame is checkable in the static harness; the
  modal, the preview width, and the PDF highlight need the app running.

## Records owed

- Two new decisions: the `earnedLevelFor` clamp rule, and suggested grading as a modal.
- Note that Task 2 restores D-066 rather than superseding it.
- `Current State.md` entry and a dated session log.
