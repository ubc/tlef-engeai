# Staff-authored rubric criteria — implementation plan

**Status:** implemented (§3.1-§3.7, §4)
**Date:** 2026-09-15
**Scope:** Writing Feedback linguistic and technical lenses

> **Implemented end to end.** A criterion is marked in the rubric editor, withheld from
> generation, written by staff on the review card, gated at approval, and merged into the
> released document with its level taken from the staff grade. No stored rubric carries the
> flag yet, so no existing course changes behaviour until staff set one.

---

## 1. Problem

Every submission receives near-identical prose on formatting-type criteria, e.g.:

> "The verified evidence does not establish the document's font, spacing, margins, filename, or file type, so those formatting features are not judged here."

and the criterion cannot rise above a middle band regardless of the submission's
actual quality.

### Root cause

Three facts in the current pipeline combine to force this output:

1. `LocalDocumentExtractionService.extract` (`src/writing-feedback/document-extraction-service.ts:47`)
   returns `{ text, fileName }`. Font, spacing, margins, and page geometry do not
   exist anywhere downstream, for any lens.
2. `buildFeedbackSchema` (`src/writing-feedback/feedback-schema.ts:107`) constrains
   the criteria array to `.length(criterionIds.length)` and its `superRefine`
   requires each approved criterion exactly once. `buildSummaryRedraftSchema`
   (`feedback-schema.ts:147`) does the same.
3. Both system prompts instruct "Assess every approved criterion exactly once"
   (`feedback-engine.ts:212`, `summary-redraft-engine.ts:72`).

The model therefore *must* emit a row for a criterion it has no evidence for, while
`validateExactEvidence` (`feedback-schema.ts:174`) correctly forbids inventing one.
The boilerplate sentence and the capped band are the only outputs the contract
permits. This is a contract problem, not a prompt-tuning problem.

### Why not special-case "Presentation & Formatting"

Rubrics are authored in Canvas and imported (`canvas-rubric-mapping.ts:210`), where
criterion ids are slugified from arbitrary instructor labels and row counts vary.
There is no stable id to key on. The fix must be a per-criterion property staff set.

---

## 2. Design

Add `assessedBy: 'model' | 'staff'` to `WritingRubricCriterion`, defaulting to
`'model'` when absent. A criterion marked `'staff'` is:

- **excluded** from both system prompts and from both structured-output schemas —
  the model is never asked about it and never narrates the gap;
- **rendered** in the review workspace as a criterion card with an editable
  explanation, seeded empty;
- **graded** through the existing `StaffFinalAssessment` path, unchanged;
- **released** to the student identically to a model-drafted criterion, so nothing
  in the student PDF distinguishes the two.

### Where the level comes from

A staff-authored criterion needs no new level control. `earnedLevelFor`
(`rubric-bands.ts:112`, mirrored at `writing-feedback-grid.ts`) already derives the
earned rating from entered points, and `staff-final-assessment.ts` already requires
points on every criterion of a gradable rubric before approval. The staff grade *is*
the level.

### Where the row lives

The run result stays honest: `WritingFeedbackRun.result.criteria` contains only what
the model actually produced. Staff rows are merged in at compose time, in
`applySummaryToResult` (`summary-sources.ts:139`), which gains the rubric as an input
and emits a complete, rubric-ordered criteria list.

Rejected alternative: inserting a placeholder `CriterionFeedback` into the run result
at generation time. It is less invasive downstream but writes a fabricated
`suggestedLevel` and empty `evidence` into an immutable, audited record, and forces
`CriterionFeedback.suggestedLevel` to become optional across every consumer.

---

## 3. Work items

### 3.1 Contracts and type mirror

| File | Change |
|---|---|
| `src/writing-feedback/contracts.ts:108` | Add `assessedBy?: 'model' \| 'staff'` to `WritingRubricCriterion` with a TSDoc note that absent means `'model'` |
| `public/scripts/feature/writing-feedback-shared.ts:93` | Mirror the same field on the frontend `RubricCriterion` (AGENTS.md requires both mirrors) |

Add one helper, used everywhere rather than inlining the comparison:

```ts
// src/writing-feedback/rubric-lens.ts (or a new criterion-assessment.ts)
export function modelAssessedCriteria(rubric: WritingRubricDefinition): WritingRubricCriterion[];
export function staffAssessedCriteria(rubric: WritingRubricDefinition): WritingRubricCriterion[];
```

No migration is needed: `assessedBy` is optional and absent means `'model'`, which is
current behaviour. Writing Feedback is not in production, so stored rubrics carry no
obligation either way.

### 3.2 Generation — stop asking the model

| File | Change |
|---|---|
| `feedback-schema.ts:87` `buildFeedbackSchema` | Derive `criterionIds` from `modelAssessedCriteria(rubric)`; the `.length()` and `superRefine` coverage check follow |
| `feedback-schema.ts:126` `buildSummaryRedraftSchema` | Same |
| `feedback-engine.ts:212` | Criterion id list in the prompt uses model-assessed only |
| `feedback-engine.ts:~296` (analyzer prompt) | `criteria:` in `<approved_assignment_profile>` uses model-assessed only |
| `feedback-engine.ts:~245` (writer prompt) | `criteria:` in `<approved_rubric>` uses model-assessed only |
| `summary-redraft-engine.ts:72` | Criterion id list uses model-assessed only |
| `feedback-engine.ts` `deterministicFeedback` | Map over model-assessed criteria so `DEVELOPING_MODE` output matches the real schema |
| `summary-redraft-engine.ts:~131` deterministic path | Same |

**Guard:** a rubric where *every* criterion is staff-assessed has nothing to generate.
Blocked at rubric approval in `requireCompleteRubricCells` (pulled forward from §3.5,
since §3.2 is what creates the hazard), with `NO_MODEL_CRITERIA_MESSAGE` as the
schema-level backstop. Both are distinct from "An approved rubric requires criteria and
performance levels", which would have named the wrong cause.

### 3.3 Staff edits — accept explanations for staff criteria

| File | Change |
|---|---|
| `summary-edits.ts:47` | The binding check rejects any `criterionExplanations` entry not in `run.result.criteria`. It must also accept ids of staff-assessed criteria on the rubric the run was generated against (`rubricForRun`, `summary-sources.ts:158`). Signature gains the rubric |
| `summary-edits.ts:21` | `criterionExplanations` is capped `.max(10)`, matching `MAX_CRITERIA`. No change needed |

### 3.4 Composition — merge staff rows into the released result

`applySummaryToResult` (`summary-sources.ts:139`) currently maps over
`result.criteria`. Change to:

- take `rubric` and the bound `finalAssessment` (or the derived per-criterion level)
  as additional inputs;
- iterate `rubric.criteria` in rubric order;
- for a model criterion, behave exactly as today;
- for a staff criterion, synthesize a `CriterionFeedback` with the staff explanation,
  `suggestedLevel` from `earnedLevelFor(criterion, rubric.levels, points)`,
  `evidence` from `evidenceFromComments` (staff may still anchor annotations to it),
  and `confidence` omitted or zero — it is never student-facing
  (`report-generation/writing-feedback-report.ts` already excludes it);
- preserve any run criterion whose id is no longer on the rubric, so feedback
  generated against an older rubric version still renders (today's behaviour via
  `orderedCriterionIds`).

Update every caller in `writing-feedback-service.ts` and the release services
(`canvas-release-service.ts`, `live-canvas-release-service.ts`,
`queued-release-service.ts`) to pass the rubric.

`report-generation/writing-feedback-report.ts:288` needs no change — it already
resolves labels from the rubric and renders whatever criteria it is handed.

### 3.5 Rubric editor — the toggle and its gates

| File | Change |
|---|---|
| `public/scripts/feature/writing-feedback-rubric.ts` | Per-row control on the criterion editor: "Who assesses this criterion? AI draft / Teaching team". Default AI draft |
| `public/scripts/feature/writing-feedback-grid.ts` | Render the row's mode as a visible marker, so the grid shows at a glance which rows the model will skip |
| `src/writing-feedback/rubric-schema.ts:89` | Accept `assessedBy: z.enum(['model','staff']).optional()` in the criterion schema |
| `rubric-schema.ts:238` `requireCompleteRubricCells` | Add: refuse approval when no criterion is model-assessed, naming the reason |
| `public/scripts/feature/writing-feedback-rubric-progress.ts:207` | `describeGrid` readiness copy should mention staff-assessed rows so the chip does not read as incomplete |

Canvas import (`canvas-rubric-mapping.ts:210`) sets nothing — imported rows default
to model-assessed, and staff flip the formatting row in the editor before approving.
This is the intended workflow: import, then mark.

### 3.6 Review workspace — the editable card

`writing-feedback-review.ts:1307` already iterates `orderedCriterionIds`, which is
rubric-first, and at line 1327 renders a card with the grade control and the muted
note "No stored feedback was found for this rubric criterion" when the run has no
matching row. That is exactly the hook.

| File | Change |
|---|---|
| `writing-feedback-review.ts:1327` | Branch on `definition?.assessedBy === 'staff'` before the missing-feedback branch. Render the criterion card with the grade control plus `summaryEditor.explanationField(...)` seeded from the saved edit, and a short help line ("The AI does not draft this criterion. Write the student's feedback here.") |
| `writing-feedback-review.ts` | Keep the existing muted note for the genuinely-missing case — a criterion the model should have covered but did not is still an error worth surfacing |
| `writing-feedback-summary-editor.ts:134` | `explanationField` works as-is; no change expected |
| `writing-feedback-review-steps.ts` | Step readiness: the Summary step is not complete while a staff-assessed criterion has an empty explanation |

### 3.7 Approval gate

`writing-feedback-service.ts:615` `approve` already refuses on an incomplete grade
via `APPROVAL_REQUIRES_GRADE_MESSAGE`. Add a parallel refusal:

```
Write feedback for every criterion the teaching team assesses before approval
```

checked against the bound `StaffReviewRevision.summaryEdits` for each lens whose
rubric carries staff-assessed criteria. Without this, a staff criterion can reach a
student as an empty section.

---

## 4. Independent fix — scope narration in student-facing prose

Separate defect, same symptom family. The Interpersonal Positioning output commonly
reads:

> "The References section is present and includes seven sources, although APA
> conformance is not evaluated here."

This is the model telling the student what it did *not* assess. It is not a
missing-evidence problem and will keep appearing on other criteria after §3 ships.
Abstentions already have a home in `WritingFeedbackResult.internalFlags`, which is
staff-only.

The prompts already ban one instance of this pattern — "Never state a confidence
level, certainty, or how sure you are anywhere in prose" (`feedback-engine.ts:231`,
`summary-redraft-engine.ts:54`). Add the parallel rule in both places:

> Never tell the student what you did not, could not, or were not asked to assess.
> Scope limits and things you could not judge go in internalFlags, never in
> explanation, strengths, or revision goals.

This is a two-line change with no schema or contract impact and can ship ahead of the
rest. Bump `SFL_WRITER_PROMPT_VERSION` and the redraft prompt version so runs are
attributable.

---

## 5. Explicitly out of scope

Extracting real formatting signals (fonts, margins, line spacing, page count, and the
already-captured `fileName`/extension) so a formatting criterion could be
model-drafted after all. It is feasible — docx and pdf carry all of it structurally —
but it needs a new metadata channel through extraction, staff verification, and the
evidence invariant, which is built around exact text spans and has no representation
for a document property.

The `assessedBy` flag does not foreclose it. A later formatting analyzer can set a
staff row back to `'model'` once it has evidence to stand on.

---

## 6. Sequencing

1. **§4 prompt fix** — independent, two lines, immediate improvement.
2. **§3.1 contracts + helpers** — no behaviour change.
3. **§3.2 generation** — the model stops producing the boilerplate.
4. **§3.3 + §3.4 edits and composition** — staff text reaches the student document.
5. **§3.5 editor** — staff can set the flag themselves (until then, set in fixtures).
6. **§3.6 + §3.7 review UI and approval gate** — closes the empty-section hole.

Steps 3 and 4 must ship together: after step 3 a staff criterion has no model row,
and without step 4 it would silently vanish from the released document.

---

## 7. Tests

| Area | Test |
|---|---|
| `__tests__/feedback-schema.test.ts` | A rubric with one staff criterion yields a schema accepting `n-1` rows and rejecting a row for the staff criterion |
| `__tests__/writing-feedback-service.test.ts` | Neither system prompt contains the staff criterion's id or label |
| `__tests__/summary-sources.test.ts` | `applySummaryToResult` emits the staff criterion in rubric order, with the staff explanation and the level derived from entered points |
| `__tests__/summary-sources.test.ts` | A criterion absent from the current rubric but present in an older run still renders |
| `__tests__/summary-edits.test.ts` | An explanation for a staff criterion binds; one for an unknown id is still refused |
| `__tests__/default-rubric-profile.test.ts` | A criterion with no `assessedBy` behaves as `'model'` |
| `__tests__/rubric-schema.test.ts` | Approval refused when every criterion is staff-assessed |
| `__tests__/writing-feedback-service.test.ts` | Approval refused while a staff criterion's explanation is empty |
| `__tests__/writing-feedback-report.test.ts` | Student PDF renders a staff criterion identically to a model one, with no confidence or flags |

Run both TypeScript builds (`npm run build`) per AGENTS.md before merge.

---

## 8. Documentation to update

- `documents/WRITING_FEEDBACK_ARCHITECTURE.md` — the two-source criteria model
- `documents/WRITING_FEEDBACK_ASSESSMENT_LOGIC.md` — which criteria the model judges
- `documents/WRITING_FEEDBACK_REVIEW_GUIDE.md` — the staff-authored card workflow
- `documents/MONGO_DATA_LAYER.md` — `assessedBy` on the stored criterion shape
- A dated decision entry, in sequence after D-127
