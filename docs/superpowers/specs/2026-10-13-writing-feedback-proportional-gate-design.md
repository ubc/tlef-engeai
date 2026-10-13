# Writing Feedback proportional rewrite gate and reliable mode switch — design

Date: 2026-10-13
Branch: new branch from `48230ba` (worktree `wf-diagnosis-grounding`); proposed name `feature/writing-feedback-proportional-gate`
Amends: D-143 (gate rule), D-144 (what rewrite mode shows); supersedes the mode-switch redraft in `needsModeRedraft`

## Improved request

> **Goal:** make the whole-text diagnosis gate proportionate, and make the staff mode switch reliable.
>
> **Two modes:**
> 1. **Rewrite feedback** only when the text misses the point of the assignment: wrong genre (`genreFit = mismatch`), or **75% or more of the required sections are weak or missing**. The student gets the rewrite block and one rewrite goal; annotations stay held back unless staff release them.
> 2. **Standard feedback** in every other case, including a text missing one or two sections that is otherwise on track: What you did well, feedback by rubric criterion, Priority revision goals, annotations. The first revision goal names the weak or missing sections and what to add.
>
> **Staff switch, both directions:** "Switch to standard feedback" immediately shows the full standard feedback for that submission — strengths, every criterion, 1–3 revision goals, every annotation — with no redraft and no leftover rewrite goal. "Switch to rewrite feedback" works on any submission, including one the gate judged fine, when the instructor disagrees. Every run therefore stores both kinds of content.
>
> **Keep:** the gate is code, not prompt; staff override; human approval before release; exact evidence; diagnosis stays staff-only.

## Evidence (code at `48230ba`)

- `resolveGateDecision` (`src/writing-feedback/feedback-gate.ts:26`) returns `global_revision` when **any one** required stage is `missing`. One missing section of six forces rewrite feedback.
- The writer prompt branches on the gate (`feedback-engine.ts`, `buildWritingFeedbackSystemPrompt`). The `globalMethod` asks for **exactly one** revision goal (the rewrite goal) and strengths only from `transferableStrengths`.
- `guardStrengths` (`feedback-schema.ts:433`) then **overwrites the stored strengths** with transferable ones on a rewrite-gated run.
- So a rewrite-gated run never holds standard content. Switching to standard only flips `modeOverride`; the review page then patches the gap with a writer-only summary redraft on **Next** (`needsModeRedraft`, `writing-feedback-review-steps.ts:85`), which the user experiences as the switch "not working".
- The reverse direction is also incomplete: the PDF prints the rewrite goal only when `feedback.gateDecision === 'global_revision'` (`writing-feedback-report.ts:275`), so forcing rewrite mode on a standard-gated run shows no rewrite goal. A standard run does fill `globalRevision` (standard method step 8), so the block itself exists.
- Annotations are already projected correctly by mode: `studentFacingComments` / `splitHeldBack` show every comment in standard mode and hold back unreleased model seeds in rewrite mode. `seedCommentsFromRun` additionally bakes `heldBack: true` into seeds of rewrite-gated runs (`anchored-comments.ts:188`), which is redundant with the projection rule.

## Design

### 1. Gate rule

```
rewrite  ⇔  genreFit === 'mismatch'
         ∨  (requiredCount > 0 ∧ weakOrMissingRequired / requiredCount ≥ REWRITE_STAGE_SHARE)
REWRITE_STAGE_SHARE = 0.75
```

- Only stages with `required === true` count (unchanged from D-143: an absent flag can never push a student into rewrite feedback).
- A required stage counts when the diagnosis marks it `weak` or `missing`. Stage status comes from the existing whole-text diagnosis (Present / Weak / Missing); no new judgement is added.
- No required stages ⇒ only a genre mismatch triggers rewrite.
- `genreFit === 'partial'` alone no longer matters to the gate; it already steers the standard writer's first goal.
- Worked boundaries: 6 required — 4 weak/missing ⇒ standard (67%), 5 ⇒ rewrite (83%); 4 required — 3 ⇒ rewrite (75%); 2 required — 1 ⇒ standard, 2 ⇒ rewrite.
- The constant lives in `feedback-gate.ts` and is exported for tests and the eval.

### 2. One writer call produces both modes

- The writer always runs the standard method. The `globalMethod` prompt branch and `<worked_example_global>` gating are removed; the global worked example is kept for the rewrite block.
- Standard method changes:
  - Step 1 extended: when the diagnosis marks a stage weak or missing, the first revision goal addresses it, naming the section and what to add, with `skillTag` set to that stage id.
  - Step 8 becomes: always fill `globalRevision` — `diagnosisStatement`, `whatToKeep` (one to three from `transferableStrengths`), `rewriteDirection` (numbered stages), `guidedQuestion` (whole submission) — **and** a new `globalRevision.rewriteGoal`: one revision goal (`goal`, `action` naming the first stage to write, `guidedQuestion`, `questionScope: 'whole'`).
- Schema: `globalRevisionSchema` gains required `rewriteGoal` (the existing `revisionGoalSchema`). `GlobalRevision` in `contracts.ts` gains optional `rewriteGoal?: RevisionGoal` (optional so stored runs still parse), mirrored in the frontend copy at `public/scripts/feature/writing-feedback-shared.ts:214`.
- The Socratic question gate (D-153) also validates `rewriteGoal` on new runs.
- The prompt still never mentions the gate decision; the writer cannot tell which mode the student will see.
- `SFL_WRITER_PROMPT_VERSION` → `sfl-feedback-writer-v4.0.0`; the examples version bumps if the worked examples change.

### 3. The mode filters what is shown, never what is stored

- `guardStrengths` keeps only the contradicting-feature filter; its `mode` parameter and the transferable-strengths replacement are removed. No projection replaces it: rewrite-mode output never prints `strengths` (the PDF's rewrite section prints `whatToKeep`), so stored strengths are simply the standard ones.
- Annotation seeding is unchanged. `seedCommentsFromRun` still flags seeds of rewrite-gated runs `heldBack: true`; `isHeldBack` already holds back unflagged model seeds in rewrite mode, and standard mode shows every comment. Both directions of the switch therefore already project annotations correctly.
- Rewrite-mode consumers read the rewrite goal through one resolver, `resolveRewriteGoal(feedback, globalRevision)` in `feedback-gate.ts`: `globalRevision.rewriteGoal` when present, else, for runs stored before this change, `revisionGoals[0]` of a rewrite-gated run, else none. It replaces the `gateDecision === 'global_revision'` check at `writing-feedback-report.ts:275`.
- The review page's rewrite section shows the rewrite goal read-only beneath the rewrite block, so staff approve exactly what the student receives. Staff editing of the rewrite goal is out of scope.
- Standard-mode consumers render the stored result unchanged: strengths, criteria, revision goals, annotations.
- Staff summary edits (`summaryEdits`, D-126) apply per field as today; switching mode never discards them. `resolveStudentView` spreads the stored block under staff edits, so `rewriteGoal` survives an edit of the other fields; a summary redraft carries `globalRevision` forward (`summary-sources.ts:309`).

### 4. Switch, both directions

- **Rewrite → standard:** the review page shows the stored standard content immediately: strengths, criteria, goals, every annotation. No Next-time redraft.
- **Standard → rewrite:** shows the rewrite block, `rewriteGoal`, rewrite strengths, and holds back unreleased seeds. Available on any run with a `globalRevision`.
- The toggle labels stay ("Switch to standard feedback" / "Switch to rewrite feedback only"). The override still saves as `modeOverride` on the review revision (D-145) and is still bound to its generation (`latestModeOverride`). Approval is still required before release.
- `needsModeRedraft` returns true only for **legacy** runs — rewrite-gated runs with no `globalRevision.rewriteGoal` — which lack standard content; they keep today's redraft fallback. A new run never triggers it.
- The redraft path itself (D-125, annotations changed) is untouched.

### 5. Eval

- The eval profile has three required stages, so 75% means all three weak or missing. `dr-missing-classification` (classification and description missing, definition present: 2/3) changes its expectation to `standard` with `firstGoalAddressesStage: classify`.
- A new fixture `dr-mostly-missing` (a descriptive-report title and loose sentences with no definition, types or description) expects `global_revision`.
- The wrong-genre fixtures still expect `global_revision`.
- A new check `bothModes`: every run has non-empty standard goals and a `globalRevision` with a valid `rewriteGoal`.
- Existing checks (`plainLanguage`, `socraticQuestions`, citations) run unchanged on both blocks.

### 6. Out of scope

- Changing what the diagnosis call judges, or its prompt.
- A staff-editable threshold (the constant is enough until instructors ask).
- The technical lens (it has no rewrite mode).
- Backfilling stored runs.

## Error handling

- Writer output missing `rewriteGoal` on a new run fails schema validation, then the existing Socratic question gate's one corrective retry; a second failure fails the job with the existing sanitized message, as for missing revision goals.
- A legacy run without `globalRevision` cannot be switched to rewrite mode; the toggle is hidden for it (current behaviour when `textDiagnosis` is absent).

## Testing

- Unit, `feedback-gate`: the boundaries in section 1, including weak/missing mix, no required stages, `partial` fit without weak stages.
- Unit, projection: `resolveRewriteGoal` for new, legacy and standard runs; `guardStrengths` no longer rewrites strengths.
- Unit, engine: system prompt no longer branches on mode and always requests `rewriteGoal`; mock engine output carries both blocks.
- Unit, review steps: `needsModeRedraft` true only for legacy rewrite-gated runs.
- Report: PDF in rewrite mode on a standard-gated run prints the rewrite goal; in standard mode on a rewrite-gated run prints strengths, criteria, goals.
- Live `wf:eval` (linguistic set) passes, including the new fixture.
- Full `npx jest --maxWorkers=4` (only the two inherited suites may fail), backend and frontend `tsc --noEmit`, `npm run build`, `git diff --check`.
- Browser pass on the local mock course at 1440/768/390 px: a submission missing some sections gates standard; switch to rewrite and back shows complete content each way, annotations included; PDF preview matches the mode.

## Records

- Decisions: amend D-143 (75% weak-or-missing rule) and D-144 (rewrite goal from `globalRevision.rewriteGoal`, strengths projected); new decision that every run stores both modes and the mode only projects.
- Update `documents/ENDPOINT_ARCHITECTURE.md` / `documents/MONGO_DATA_LAYER.md` only where the stored `globalRevision` shape is described.
- Current State and a dated session log after implementation.
