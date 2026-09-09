# Course-document grounding, full-screen PDF viewer, rubric autosave, and Canvas rating ranges

- **Date:** 2026-09-05
- **Branch:** `worktree-rubric-page-redesign` (worktree `tlef-engeai/.claude/worktrees/rubric-page-redesign`), on top of `7e0e5bb`
- **Status:** approved design, not implemented

## Summary

Four changes to the Writing Feedback staff experience. They are independent of one
another and share only the branch, so any one can be dropped without disturbing the
rest.

- **A.** The feedback PDF preview opens as a near-full-screen viewer. It currently
  renders at roughly the intrinsic width of an empty `<iframe>` because the modal
  container has no `width`, only a `max-width`.
- **B.** Course-document reinforcement becomes real. Retrieved material already reaches
  staff as a label above the glossary; the model never sees a word of the document. The
  writer will now read excerpts, and retrieval will run per finding rather than once per
  submission.
- **C.** The rubric page autosaves its draft, so an instructor who is logged out
  mid-edit does not lose the work.
- **D.** A rubric imported from Canvas shows a points range per level instead of a single
  number.

## Constraints inherited from the platform

These are not proposals. They already hold and every part below is designed inside them.

- Student submissions never enter the course-material RAG/Qdrant pipeline.
- Generated feedback, prompt bodies containing student text, Canvas tokens, and PUIDs
  are never logged.
- Student-facing output carries no confidence, model metadata, internal flags, or staff
  notes.
- AI output is a draft; approval gates release.
- Shared API types are mirrored in `src/types/shared.ts` and `public/scripts/types.ts`;
  the rubric band helpers are mirrored in `src/writing-feedback/rubric-bands.ts` and
  `public/scripts/feature/writing-feedback-grid.ts` and pinned by a parity test.

## Out of scope

- The rubric data model, the rubric endpoints, and the approval gates.
- Clickable links from a material mention to the document.
- Autosave anywhere but the rubric page. The review page keeps explicit Save.
- Back-filling bands into rubrics that were imported from Canvas before this change.
- Any change to chat retrieval.

---

## Part A — Near-full-screen PDF viewer

### The defect

`showViewerModal` (`public/scripts/ui/modal-overlay.ts:714`) asks for
`maxWidth: 'min(1500px, 96vw)'`. The base rule sets no width at all:

```css
.modal-container {
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
}
```
`public/styles/modal-overlay.css:56`

A shrink-to-fit container sized by its content, holding an `<iframe>` whose CSS width is
`100%`, resolves that percentage against a width the iframe itself determines — its
intrinsic 300px. The 1500px cap is never reached because nothing asks for the width.
Separately, `max-height: 90vh` with `overflow: hidden` clips the `min(82vh, 1000px)`
frame once the header and footer are added, rather than letting it fit. Together these
are what reads as "too narrow, too tight".

The 2026-09-03 UI batch widened the *cap*, which is why the symptom survived that work.

### The change

`modal--viewer` becomes a real full-screen treatment rather than a wider modal.

- Container: `width: 96vw; height: 96dvh; max-width: none; max-height: none;`
  `display: flex; flex-direction: column;`
- Header keeps the title and close control but drops to a slimmer padding, because the
  document is the content and the chrome should not take a fifth of the height.
- Body: `flex: 1; min-height: 0; overflow: hidden; padding: 0.5rem;`. `min-height: 0` is
  required — a flex child will not shrink below its content otherwise, which would put
  the clipping straight back.
- `.wf-pdf-frame`: `height: 100%` instead of `min(82vh, 1000px)`, so the frame follows
  the container rather than competing with it.
- At `max-width: 768px`, `100vw` / `100dvh`. This needs an explicit override: the
  existing `@media (max-width: 768px)` block forces `max-width: calc(100vw - 2rem)` onto
  every `.modal-container` (`public/styles/modal-overlay.css:303`).
- `dvh` rather than `vh` so a mobile browser's collapsing address bar does not leave the
  footer buttons under the chrome. Paired with a `vh` fallback declaration.
- Download and Close stay in the footer. The route continues to serve `inline`.

`showViewerModal` stops passing `maxWidth`, since the class now owns the geometry.

### Files

- `public/styles/modal-overlay.css`
- `public/styles/instructor-components/writing-feedback.css`
- `public/scripts/ui/modal-overlay.ts`

### Risk

`modal--viewer` is used only by the Writing Feedback PDF preview
(`writing-feedback-review.ts:927`), so the blast radius is that one surface.
`modal--grading` shares two rules with it today; those get split so the grading modal is
untouched.

---

## Part B — Course-document grounding

### What exists

The pipeline is built and wired end to end. What is missing is that the model never
reads the documents.

- `src/writing-feedback/course-material-mentions.ts` — builds one retrieval query per
  submission, retrieves at `limit: 5`, `scoreThreshold: 0.45`, and resolves chunks to
  `topicOrWeekTitle · itemTitle · materialName` labels.
- `RAGApp.retrieveForWritingFeedback` (`src/rag/rag-app.ts:239`) — scopes to the course
  and to published topic/week items.
- `validateWriterReferences` (`feedback-engine.ts:257`) — rejects any material id the
  writer invented. This guard is correct and stays.
- `public/scripts/feature/writing-feedback-anchors.ts:487` renders the mention directly
  above the glossary block at `:506`, which is where it belongs.

Two gaps:

1. **The writer receives labels only.**
   `feedback-engine.ts:378` sends
   `<allowlisted_course_material_mentions>${JSON.stringify(mentions)}</...>`, and a
   `CourseMaterialMention` is ids and titles. Feedback can therefore *point at* a
   lecture but is not *strengthened by* it.
2. **Retrieval runs once per submission.** The query comes from assignment metadata plus
   SFL rule summaries, so every annotation in a run draws from the same five candidates.
   `deterministicFeedback` attaches `mentions[0]` to every criterion, which is the same
   problem made literal.

### Where the corpus comes from

Confirmed during design: **Canvas never contributes course documents.** The Canvas
gateway (`canvas-live-import-gateway.ts:10`) covers courses, rosters, assignments,
rubrics, submissions, and grades, and has no files or modules resource. The single
ingestion path into Qdrant is `RAGApp.uploadDocument` (`src/rag/rag-app.ts:357`), called
from the document-setup routes. The corpus is exactly what instructors and TAs upload on
the Document Setup page.

### B1 — Retrieval per finding

`resolveCourseMaterialMentions` gains a per-finding mode returning both a
`Map<findingId, CourseMaterialMention[]>` and the deduplicated run-level list it already
returns.

**The query may not contain student text.** `SflFinding.evidence[].quote` is exact
student writing, and `observation` and `functionalInterpretation` are model prose
written about that writing. None of the three may reach Qdrant. A query is built only
from:

- `finding.primaryFunction` and `finding.languageLevel`
- rule summaries resolved from `finding.ruleIds` through `SFL_RULES_BY_ID`
- the stage label from the approved SFL profile, via `finding.stageId`
- assignment title, task, and genre label — the same fields the run-level query uses

This is the load-bearing rule of Part B and is pinned by a test, not only a comment.

**Query count is bounded.** Findings are clustered by
`(primaryFunction, languageLevel, sorted ruleIds)`; one retrieval per distinct cluster.
A typical run yields three to six. Hard cap of eight per run; clusters beyond it fall
back to the run-level query result rather than being dropped, so no finding is left
without candidates for an arbitrary reason.

**Published material.** `retrieveForWritingFeedback` filters to `published === true`
(`src/rag/rag-app.ts:262`). Topic/week instances are created unpublished
(`route-mongo.ts:1535`) and staff publish them progressively, so an instructor who
uploads a Week 5 lecture in advance would otherwise have it ignored. Decision:
**retrieve from all course material, cite only published material.** The writer is
grounded on the whole uploaded corpus; the student-facing `Review: <label>` line and the
student-facing source list name published material only. Staff see the full list,
labelled, in the review UI.

This needs a Writing-Feedback-scoped retrieval option rather than a change to the shared
filter — chat retrieval must keep its published-only behaviour, because publishing is
what makes material visible to students.

### B2 — Excerpts reach the writer

A new internal type, deliberately separate from `CourseMaterialMention`:

```ts
/** Staff- and model-only course text. Never student-facing, never on a mention. */
interface CourseMaterialExcerpt {
    mentionId: string;
    text: string;
}
```

- Truncated to roughly 600 characters per chunk.
- Total budget roughly 4000 characters per writer call, filled highest-score first.
- Carried in the writer prompt as `<course_material_excerpts>`, alongside the existing
  mentions block.

The writer prompt gains rules: ground guidance in these excerpts where they apply; cite
only by `courseMaterialMention.id`; never present excerpt text to the student as if it
were their own writing; abstain rather than stretch a document to fit.

`validateWriterReferences` is unchanged and still rejects invented ids, so the excerpts
widen what the model knows without widening what it may claim.

Excerpts belong to the staff-only run trace, which already holds `sflAnalysis` and its
student quotations, so storing them there is consistent and useful for audit. They must
never reach an `AnchoredComment`, a `CourseMaterialMention`, or any student-facing
payload — pinned by a test that walks a generated student PDF and a released payload for
excerpt text.

Version bumps: `SFL_WRITER_PROMPT_VERSION` to `sfl-feedback-writer-v2.1.0`,
`COURSE_MATERIAL_RESOLVER_VERSION` to `course-material-mentions-v2.0.0`.
`SFL_ANALYZER_PROMPT_VERSION` is unchanged — the analyzer call is untouched, and
retrieval still happens strictly after analysis.

### B3 — Surfaces

- **Staff annotation card.** Keeps its position above the glossary. Now shows the
  material resolved for *that finding* rather than `mentions[0]`. Not a link.
- **Student PDF annotation popup.** Keeps `Review: <label>`
  (`writing-feedback-report.ts:440`), now naming the per-finding material.
- **New: assignment-level source list.** "Course materials this feedback draws on",
  rendered from the published subset of `result.courseMaterialMentions` — labels only,
  no excerpts, no retrieval scores, no ids. Appears in the student summary PDF as a new
  section alongside `renderGeneralSections`, and in the staff review panel.
- **Deterministic and mock path.** `deterministicFeedback` reads the per-finding map
  instead of `mentions[0]`. `resolveCourseMaterialMentions` keeps returning an empty list
  under `isMockResponse()` with no injected retriever, so mock runs are unchanged.

### Failure behaviour

Retrieval stays advisory. Any failure — RAG unavailable, Qdrant down, a query that
matches nothing — yields zero mentions and zero excerpts, and generation still succeeds
with feedback that cites no material. This is the existing behaviour and it is
deliberate; grounding must never become a new way for generation to fail.

### Production readiness

Part B cannot be called production-ready on unit tests. It needs one live run against
real uploaded course documents, confirming that retrieval returns material, that the
writer's guidance visibly reflects it, and that no unpublished material is named to the
student. That run is currently blocked — this WSL distro has no `docker` command. It is
the remaining gate, and will be reported as owed rather than assumed.

### Files

- `src/writing-feedback/course-material-mentions.ts`
- `src/writing-feedback/feedback-engine.ts`
- `src/writing-feedback/contracts.ts`
- `src/writing-feedback/sfl-foundation.ts`
- `src/rag/rag-app.ts`
- `src/report-generation/writing-feedback-report.ts`
- `public/scripts/feature/writing-feedback-anchors.ts`
- `public/scripts/feature/writing-feedback-review.ts`
- `public/scripts/feature/writing-feedback-shared.ts`

---

## Part C — Rubric page autosave

### Why it cannot reuse the existing Save

Two things in the current save path make it wrong for a background write:

- `collectAssignmentDetails` (`writing-feedback-rubric.ts:810`) **throws** on an
  incomplete form. An autosave firing on every keystroke would throw constantly.
  `readAssignmentDetails` at `:791` is the non-throwing reader that already exists for
  the progress strip.
- `saveAssignmentRubrics` (`:1834`) will **seed a technical rubric** when
  `context.technicalMissing && labContext`, issuing `PATCH .../lab-report`. A background
  write must never create a rubric nobody asked for.

So autosave gets its own narrow path rather than a flag on the existing one.

### Design

A DOM-free module, `public/scripts/feature/writing-feedback-autosave.ts`, holding the
debounce and a single-flight state machine over
`idle | pending | saving | saved | error`. Keeping it free of the DOM is what makes it
unit-testable without a browser, matching how
`writing-feedback-rubric-progress.ts` was separated in the v3 redesign.

`autosaveAssignmentRubrics` in the rubric page:

- reads through `readAssignmentDetails` and `readSflContext`;
- runs the same validation `collectAssignmentDetails` and `collectRubricStructure` apply,
  and **skips the cycle silently** when it would fail, leaving the last good stored draft
  in place;
- never seeds a technical rubric, and never approves;
- `PUT`s each editable rubric through the existing
  `/assignments/:id/rubric-draft[?lens=technical]` route.

That route is a safe target for repeated writes: it never touches the approved rubric
(`route-writing-feedback.ts:488`), and it reuses `selected.draft.version` when a draft
already exists, so autosaving does not walk the version number forward.

**Cadence.** Two seconds after typing stops; a forced flush every thirty seconds while
still dirty, so a slow continuous typist is not left unsaved; and a flush on
`visibilitychange: hidden` and on `pagehide`.

**Concurrency.** Single-flight. Edits arriving during a write re-arm the timer once when
it completes, rather than queueing writes.

**Status.** A quiet line beside Save in step 3: `Saving…`, `Saved 14:32`, or
`Not saved — <reason>`. Explicit Save stays exactly as it is; it is what clears
validation errors and shows the success toast.

**Session expiry.** A `401` stops the loop rather than retrying blind, and says: "You've
been signed out — your last saved draft is from 14:32. Sign in again to keep editing."
This is the case the request was really about, so it must be stated rather than shown as
a generic failure.

**Dirty state.** A successful autosave clears `state.panelDirty`, so anything gated on it
agrees with what is actually stored.

### Files

- `public/scripts/feature/writing-feedback-autosave.ts` (new)
- `public/scripts/feature/writing-feedback-rubric.ts`
- `public/styles/instructor-components/writing-feedback.css`

---

## Part D — Points ranges from an imported Canvas rubric

### The defect

`buildCells` (`src/writing-feedback/canvas-rubric-mapping.ts:233`) writes a degenerate
band:

```ts
// A Canvas rating is a single value, not a band, so the band has no width to spread.
const points = pointsOrUndefined(rating.points) ?? 0;
cells[level.id] = { min: points, max: points, ... };
```

`formatBand` renders `min === max` as a single number, which is the reported symptom.
Hand-authored rubrics do not have this problem because `spaceBandsEvenly` gives every
level a contiguous slice.

### The change

A Canvas rating is a **cut point**, so the range is recoverable without inventing
anything. Ratings sorted weakest-first give each level a band whose top is its own rating
points and whose floor is one above the previous rating's:

| Canvas rating | Points | Derived band |
| --- | --- | --- |
| Weak | 5 | 0–5 |
| Developing | 8 | 6–8 |
| Proficient | 12 | 9–12 |
| Exemplary | 15 | 13–15 |

Bands are **non-overlapping**, matching `spaceBandsEvenly`'s `min = previousTop + 1`
rule. Overlapping bands would put a single score in two levels and leave `earnedLevelFor`
without an answer.

This is done at import, in `buildCells`, not at display time. A display-only fix would
leave the stored draft degenerate, so the student PDF, `earnedLevelFor`, and the Canvas
write-back would all still see one number — and the browser band mirror in
`writing-feedback-grid.ts` would disagree with the backend, which the repository rules
forbid.

Edge cases:

- The top band extends to the row's own `points` when the strongest rating sits below it,
  so the criterion's full weight is reachable.
- Duplicate or descending rating points collapse through the same
  `Math.min(previousTop + 1, top)` guard `spaceBandsEvenly` uses, rather than producing a
  band whose floor is above its ceiling — which the draft schema rejects outright.
- A row whose ratings carry no points at all falls back to
  `spaceBandsEvenly(row.points, levels)`.
- A row with fewer ratings than the grid has columns derives bands across its own ratings
  only. The aligned gaps stay gaps; nothing is invented to fill them.

Rubrics imported before this change keep `min === max` and continue to work through the
clamp `earnedLevelFor` already applies (D-096). No migration.

### Decision record

This reverses a documented choice, so it needs **D-099**: a Canvas rating is read as the
top of a band rather than as a single awarded value, and imported rubrics carry ranges.
It supersedes the single-value rule stated in `canvas-rubric-mapping.ts:237`.

### Files

- `src/writing-feedback/canvas-rubric-mapping.ts`
- `../project-memory/01 Project Memory/Decisions.md`

---

## Testing

**Unit (Jest).**

- Autosave state machine: debounce timing, single-flight, re-arm after a write, silent
  skip on invalid input, hard flush at thirty seconds, stop on `401`.
- Per-finding query builder: over a synthetic analysis carrying distinctive quote text,
  assert no generated query contains any evidence quote, `observation`, or
  `functionalInterpretation`. This is the privacy guard and must fail without the rule.
- Excerpt budgeting: per-chunk truncation, total budget, highest-score-first ordering.
- Excerpt containment: no excerpt text in an `AnchoredComment`, a `CourseMaterialMention`,
  a generated student PDF, or a release payload.
- Cite-only-published: an unpublished mention grounds the writer but is absent from the
  student PDF and the student-facing source list, and present in the staff list.
- Mention clustering and dedupe, and the eight-query cap with its fallback.
- Canvas band derivation: the table above, plus each edge case, plus a case asserting
  the derived bands are non-overlapping and cover zero to the row weight.
- Band mirror parity: the existing `rubric-band-parity` test extends to the Canvas path.
- Report source-list rendering.

**Type and build.** `npx tsc --noEmit -p tsconfig.json`,
`npx tsc --noEmit -p public/tsconfig.json`, `npm run build`, `git diff --check`.

**Regression baseline.** Full `npx jest` is 1156 / 1160 at `7e0e5bb`, the four failures
being the known unrelated `scenario-practice-limits` policy conflict. Any other failure
is new and belongs to this work.

**Browser.** Chromium at 1440, 768, and 320px, using the Playwright recipe recorded on
2026-09-01 (Ubuntu 26.04 plus four NSS libraries via `dpkg -x` and `LD_LIBRARY_PATH`, no
root):

- the viewer filling the screen with the document legible, at all three widths, with no
  page overflow and no console errors;
- the autosave marker moving through `Saving…` and `Saved HH:MM`, an edit surviving a
  reload, and the signed-out message on a forced `401`;
- the per-finding material sitting above the glossary in the annotation card;
- the source list in the review panel;
- an imported Canvas rubric showing ranges in the grid.

**Live, owed.** One end-to-end run against real uploaded course documents, gating Part B
only.

---

## Open questions

- Should the eight-query retrieval cap be configurable per course, or is a constant
  enough for the pilot?
- Should the staff review panel distinguish published from unpublished material in its
  source list, or only show that the list differs from the student's?
- Does the onboarding Writing Feedback tutorial need another copy pass after Part C adds
  autosave? Its copy pass was already owed after the v3 rubric redesign.
