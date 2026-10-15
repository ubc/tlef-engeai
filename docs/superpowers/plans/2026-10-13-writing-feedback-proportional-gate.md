# Writing Feedback Proportional Rewrite Gate Implementation Plan

> Code listings longer than three lines were removed after implementation; the code lives in the repository and its history.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite feedback only when a text misses the point (wrong genre, or ≥75% of required sections weak or missing), and make the staff mode switch show complete content in both directions, instantly.

**Architecture:** The gate stays a pure code rule in `feedback-gate.ts`. The writer stops branching on the gate: one call always returns the standard feedback **and** the rewrite block, which gains a `rewriteGoal`. The effective mode (gate decision or staff override) then only selects what is shown — the review page, the student PDF and the release read the same stored result through the existing `resolveStudentView` / `studentFacingComments` projection, plus one new resolver for the rewrite goal.

**Tech Stack:** Express + TypeScript (Node 24.1.0), zod structured outputs, PDFKit, vanilla TypeScript frontend, Jest (ts-jest).

**Spec:** `docs/superpowers/specs/2026-10-13-writing-feedback-proportional-gate-design.md`

## Global Constraints

- Work in worktree `/home/crodas/EngE-AI/tlef-engeai/.claude/worktrees/wf-diagnosis-grounding` on a new branch `feature/writing-feedback-proportional-gate` cut from `48230ba`.
- Node `24.1.0` through NVM for every command (`source ~/.nvm/nvm.sh && nvm use 24.1.0`).
- Jest always with `--maxWorkers=4`. Targeted single-file runs may run in the foreground; full jest, both `tsc --noEmit`, `npm run build` and `npm run wf:eval` run in the background (`run_in_background`) and are read when they finish.
- `REWRITE_STAGE_SHARE = 0.75`; only stages with `required === true` count; `weak` and `missing` both count; `genreFit === 'mismatch'` always means rewrite.
- The gate is code, never prompt. The writer prompt must not mention which mode the student will see.
- AI output stays a draft; approval before release is unchanged. Evidence stays exact quotes from verified text. The diagnosis stays staff-only.
- Never log submission text, prompts containing it, or generated feedback.
- Never edit `dist/` or `public/dist/`. Mirror shared types in the frontend copy `public/scripts/feature/writing-feedback-shared.ts`.
- Behaviour-first TSDoc on exported functions; bump the `@version` header of each source file you change (minor bump).
- Do **not** commit or push unless the user has authorized commits for this execution. Each task ends with a commit step that runs only under that authorization; commit messages are subject-only, no AI trailers.
- Preserve unrelated worktree changes.

## Review Focus

1. **Run stored before this change, gated to rewrite, switched to standard** — it has no standard content, so the review page must still redraft on Next (today's fallback). Pinned in Task 5.
2. **Staff edit the rewrite block, then the student view is built** — the staff edit merge must not drop the model's `rewriteGoal`. Pinned in Task 4.
3. **Standard-gated run forced to rewrite by staff** — the PDF prints the stored `rewriteGoal`, never the first standard goal. Pinned in Task 4.
4. **Profile with no required stages and every stage missing** — stays standard (only a mismatch can rewrite). Pinned in Task 1.
5. **Model returns a `rewriteGoal` scoped `part` or with a yes/no question** — the question gate's corrective retry catches it. Pinned in Task 2.

---

### Task 0: Branch

- [ ] **Step 1: Cut the branch**

```bash
cd /home/crodas/EngE-AI/tlef-engeai/.claude/worktrees/wf-diagnosis-grounding
git status --short   # expect only the untracked spec/plan docs
git switch -c feature/writing-feedback-proportional-gate 48230ba
```

- [ ] **Step 2: Baseline the touched suites**

Run: `npx jest src/writing-feedback src/report-generation public/scripts/feature/__tests__ --maxWorkers=4` (background)
Expected: all pass. Record the count in the session log.

---

### Task 1: Proportional gate rule

**Files:**
- Modify: `src/writing-feedback/feedback-gate.ts:1-34`
- Test: `src/writing-feedback/__tests__/feedback-gate.test.ts`

**Interfaces:**
- Produces: `export const REWRITE_STAGE_SHARE = 0.75`; `resolveGateDecision(diagnosis: TextDiagnosis, profile: WritingSflContextProfile): FeedbackMode` (signature unchanged).

- [ ] **Step 1: Replace the single-missing-stage test and add boundary tests**

In `feedback-gate.test.ts`, change the file comment to "only a mismatch, or 75% or more of the `required === true` stages weak or missing, sends a submission to rewrite feedback", import `REWRITE_STAGE_SHARE`, and replace the test `'is global when a required stage is missing'` with:

Then add a new `describe` after the existing `resolveGateDecision` block:

- [ ] **Step 2: Run to see the new tests fail**

Run: `npx jest src/writing-feedback/__tests__/feedback-gate.test.ts --maxWorkers=4`
Expected: FAIL — `REWRITE_STAGE_SHARE` is undefined; "stays standard when one of two required stages is missing" gets `global_revision`.

- [ ] **Step 3: Implement the rule**

Replace the header description and `resolveGateDecision` in `feedback-gate.ts` (bump `@version` to `1.1.0`, header paragraph: "A text that is the wrong genre, or leaves most required stages weak or missing, needs a rewrite. A text missing one or two sections still gets standard feedback, whose first goal names them."):

- [ ] **Step 4: Run the gate tests and the pipeline test**

Run: `npx jest src/writing-feedback/__tests__/feedback-gate.test.ts src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts --maxWorkers=4`
Expected: gate tests PASS. If a pipeline test asserted rewrite on a single missing stage, change its diagnosis so all required stages are weak/missing (or a mismatch) and keep the assertion; do not weaken any other assertion.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/writing-feedback/feedback-gate.ts src/writing-feedback/__tests__/feedback-gate.test.ts src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts
git commit -m "feat: rewrite feedback only when most required stages fail"
```

---

### Task 2: Rewrite goal contract, schema, question gate; strengths no longer rewritten

**Files:**
- Modify: `src/writing-feedback/contracts.ts:148-156` (`GlobalRevision`)
- Modify: `src/writing-feedback/feedback-schema.ts:88-94` (`globalRevisionSchema`), `:426-444` (`guardStrengths`)
- Modify: `src/writing-feedback/socratic-questions.ts` (new `validateRewriteGoal`)
- Test: `src/writing-feedback/__tests__/writer-guards.test.ts`, `src/writing-feedback/__tests__/socratic-questions.test.ts`

**Interfaces:**
- Produces: `GlobalRevision.rewriteGoal?: RevisionGoal`; `validateRewriteGoal(goal?: { action?: string | null; guidedQuestion?: string | null; questionScope?: string | null } | null): string[]`; `guardStrengths(result: WritingFeedbackResult, diagnosis: TextDiagnosis): string[]` (the `mode` parameter is removed).

- [ ] **Step 1: Write failing schema and guard tests**

In `writer-guards.test.ts`, inside `describe('buildFeedbackSchema')`, add `rewriteGoal` to `base.globalRevision`:

and add:

Replace the test `'in global mode keeps only transferable strengths, falling back to the diagnosis'` with:

and change `guardStrengths(draft, diagnosis, 'standard')` in the first guard test to `guardStrengths(draft, diagnosis)`.

In `socratic-questions.test.ts` add (import `validateRewriteGoal`):

- [ ] **Step 2: Run to see them fail**

Run: `npx jest src/writing-feedback/__tests__/writer-guards.test.ts src/writing-feedback/__tests__/socratic-questions.test.ts --maxWorkers=4`
Expected: FAIL — schema accepts a block without `rewriteGoal`; `guardStrengths` still rewrites in its 3-argument form (type error on the 2-argument call); `validateRewriteGoal` not exported.

- [ ] **Step 3: Implement**

`contracts.ts`, in `GlobalRevision` after `guidedQuestion`:

```ts
    /** The one goal the student gets in rewrite mode. Required on new runs; absent on runs stored before 2026-10-13. */
    rewriteGoal?: RevisionGoal;
```

`feedback-schema.ts`, in `globalRevisionSchema` after `supportingExcerptIds`:

```ts
    // Required: every run carries the rewrite goal, so staff can switch to rewrite feedback
    // on any submission without a new model call.
    rewriteGoal: revisionGoalSchema
```

`feedback-schema.ts`, `guardStrengths` becomes (update its TSDoc: "@returns Staff flags to append to internal flags"; drop the `@param mode` line; drop `FeedbackMode` from the imports if now unused):

`socratic-questions.ts`, after `validateSocraticQuestions`:

Update the `feedback-engine.ts` call site so the build compiles: `result.internalFlags.push(...guardStrengths(result, diagnosis));` (Task 3 reworks the rest of the engine).

- [ ] **Step 4: Run tests and the backend type check**

Run: `npx jest src/writing-feedback/__tests__/writer-guards.test.ts src/writing-feedback/__tests__/socratic-questions.test.ts src/writing-feedback/__tests__/structured-output-schema.test.ts --maxWorkers=4`
Expected: PASS.
Run (background): `npx tsc --noEmit -p tsconfig.json`
Expected: errors only where test fixtures build a `globalRevision` for the writer schema without `rewriteGoal` — note them; Task 3 fixes the engine mock, and fixtures typed as `GlobalRevision` stay valid because the field is optional.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/writing-feedback/contracts.ts src/writing-feedback/feedback-schema.ts src/writing-feedback/socratic-questions.ts src/writing-feedback/feedback-engine.ts src/writing-feedback/__tests__/writer-guards.test.ts src/writing-feedback/__tests__/socratic-questions.test.ts
git commit -m "feat: add rewrite goal to the rewrite block"
```

---

### Task 3: One writer method for both modes

**Files:**
- Modify: `src/writing-feedback/feedback-engine.ts` (`deterministicFeedback` global block ~232-237; `buildWritingFeedbackSystemPrompt` ~244-280; writer call ~521-533)
- Modify: `src/writing-feedback/prompt-examples.ts:13,42-45`
- Modify: `src/writing-feedback/sfl-foundation.ts:27`
- Test: `src/writing-feedback/__tests__/prompt-contract.test.ts`, `src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts`

**Interfaces:**
- Consumes: `validateRewriteGoal` (Task 2), `resolveGateDecision` (Task 1).
- Produces: `buildWritingFeedbackSystemPrompt(assignment: WritingAssignment): string` (the `mode` parameter is removed); every generated linguistic result has `globalRevision.rewriteGoal`.

- [ ] **Step 1: Rewrite the prompt-contract tests**

In `prompt-contract.test.ts` drop the `'standard'` second argument from every `buildWritingFeedbackSystemPrompt(...)` call. Replace `'switches method in global mode'` with:

Keep `'names the weakest stage first on a partial fit'` (its regex `/first revision goal.*weakest stage/i` must still match one line). In the D-153 describe, replace the `global` lines with:

```ts
        expect(prompt).toContain('globalRevision.guidedQuestion');
        expect(prompt).toContain('globalRevision.rewriteGoal');
```

In `feedback-engine-pipeline.test.ts`, inside `'mock mode emits a whole-submission question and a rewrite question'`, add:

```ts
        expect(generated.globalRevision?.rewriteGoal?.questionScope).toBe('whole');
        expect(generated.globalRevision?.rewriteGoal?.action).toBeTruthy();
```

and in `'runs diagnosis first and gates a mismatch to global revision'` add, after the gate assertions:

```ts
        // The gate no longer shapes the writer: standard goals are stored on a rewrite-gated run.
        expect(generated.revisionGoals.length).toBeGreaterThanOrEqual(1);
        expect(generated.globalRevision?.rewriteGoal).toBeDefined();
```

In the file's `writer(...)` helper (around line 48), add to `globalRevision`: `rewriteGoal: { skillTag: 'descriptive_report', goal: 'Rewrite as a report.', action: 'Start with what sound is.', guidedQuestion: 'Which kinds of sound will your reader need to tell apart?', questionScope: 'whole' }`.

Add a test proving the writer prompt is mode-blind, using the file's `fakeLlm(fit, excerptPicker)` stub:

- [ ] **Step 2: Run to see them fail**

Run: `npx jest src/writing-feedback/__tests__/prompt-contract.test.ts src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts --maxWorkers=4`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement the single method**

In `buildWritingFeedbackSystemPrompt`, remove the `mode` parameter (and its `@param`), delete `globalMethod`, and replace `standardMethod` with:

and in the returned array replace `...(mode === 'global_revision' ? globalMethod : standardMethod),` with `...method,` and `...(mode === 'global_revision' ? [`<worked_example_global>…`] : []),` with the unconditional `` `<worked_example_global>\n${WRITER_GLOBAL_EXAMPLE}\n</worked_example_global>`, ``.

In `generate` step 7, change the comment to "the writer produces standard and rewrite content in one call, whatever the gate decides; the question gate (D-153) gives it one corrective retry when a goal or the rewrite goal lacks a valid question", call `buildWritingFeedbackSystemPrompt(input.assignment)`, and make the inspector:

(import `validateRewriteGoal` beside `validateSocraticQuestions`). Step 3's comment becomes "Step 3: the gate is code, so staff can predict it. It selects what is shown, not what is written."

In `deterministicFeedback`, add to `globalRevision`:

with `const profileGenreId = assignment.rubric.sflContext?.genreId ?? 'genre';` declared at the top of `deterministicFeedback(assignment, text, analysis, allowedByFinding, excerpts)`.

`prompt-examples.ts`: bump `PROMPT_EXAMPLES_VERSION` to `'prompt-examples-v1.3.0'` and extend the JSON line of `WRITER_GLOBAL_EXAMPLE` so the example shows every field the writer must fill — insert before the closing ` }`:

```
, "guidedQuestion": "What should a reader know about precipitation after reading your report?", "rewriteGoal": { "skillTag": "descriptive_report", "goal": "Rewrite the paragraph as a descriptive report about precipitation.", "action": "Write one sentence that says what precipitation is.", "guidedQuestion": "Which types of precipitation will your reader need to tell apart?", "questionScope": "whole" }
```

`sfl-foundation.ts:27`: `SFL_WRITER_PROMPT_VERSION = 'sfl-feedback-writer-v4.0.0'`. Bump `@version` headers of the changed files.

- [ ] **Step 4: Run tests**

Run: `npx jest src/writing-feedback/__tests__/prompt-contract.test.ts src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts src/writing-feedback/__tests__/feedback-engine.test.ts src/writing-feedback/__tests__/plain-language.test.ts src/writing-feedback/__tests__/socratic-questions.test.ts --maxWorkers=4`
Expected: PASS. `plain-language.test.ts` lints the worked examples; if the new example sentences fail its limits, shorten them rather than loosening the lint.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/writing-feedback/feedback-engine.ts src/writing-feedback/prompt-examples.ts src/writing-feedback/sfl-foundation.ts src/writing-feedback/__tests__/prompt-contract.test.ts src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts
git commit -m "feat: write standard and rewrite feedback in every run"
```

---

### Task 4: Rewrite goal resolver in the student view and PDF

**Files:**
- Modify: `src/writing-feedback/feedback-gate.ts` (new `resolveRewriteGoal`)
- Modify: `src/report-generation/writing-feedback-report.ts:270-277`
- Test: `src/writing-feedback/__tests__/feedback-gate.test.ts`, `src/report-generation/__tests__/writing-feedback-report-global.test.ts`, `src/writing-feedback/__tests__/rewrite-question-clear.test.ts`, `src/writing-feedback/__tests__/summary-sources.test.ts`

**Interfaces:**
- Consumes: `GlobalRevision.rewriteGoal` (Task 2).
- Produces: `resolveRewriteGoal(feedback: Pick<WritingFeedbackResult, 'gateDecision' | 'revisionGoals'>, globalRevision?: Pick<GlobalRevision, 'rewriteGoal'>): RevisionGoal | undefined`.

- [ ] **Step 1: Failing tests**

`feedback-gate.test.ts` (import `resolveRewriteGoal`):

`writing-feedback-report-global.test.ts`, new describe:

`rewrite-question-clear.test.ts` (it already builds runs and calls `resolveStudentView`): add a case where the stored `result.globalRevision` has `rewriteGoal` and the latest review's `summaryEdits[0].globalRevision` edits `diagnosisStatement`; assert `resolveStudentView(run, submission, []).globalRevision?.rewriteGoal?.goal` equals the stored goal and `diagnosisStatement` equals the staff edit.

`summary-sources.test.ts`: add a case that a redraft of a run whose `result.globalRevision.rewriteGoal` is set keeps it on the redraft result (use the file's existing redraft builder; assert `redraft.result.globalRevision?.rewriteGoal` deep-equals the original).

- [ ] **Step 2: Run to see them fail**

Run: `npx jest src/writing-feedback/__tests__/feedback-gate.test.ts src/report-generation/__tests__/writing-feedback-report-global.test.ts src/writing-feedback/__tests__/rewrite-question-clear.test.ts src/writing-feedback/__tests__/summary-sources.test.ts --maxWorkers=4`
Expected: `resolveRewriteGoal` not exported; the forced-rewrite PDF lacks `REWRITEGOALMARKER`. The merge and redraft cases may already pass — they pin behaviour the change relies on; keep them.

- [ ] **Step 3: Implement**

`feedback-gate.ts` (import `GlobalRevision`, `RevisionGoal`, `WritingFeedbackResult` types from `./contracts`):

`writing-feedback-report.ts`, replace lines 272-277 (the comment and the `if (feedback.gateDecision === 'global_revision')` block) with:

(import `resolveRewriteGoal` from `../writing-feedback/feedback-gate`). `resolveStudentView` needs no change: it spreads the stored block under staff edits, and `StaffSummaryEdit.globalRevision` cannot carry `rewriteGoal`.

- [ ] **Step 4: Run tests**

Run the Step 2 command. Expected: PASS, including the existing `'does not present a standard revision goal as the rewrite goal'`.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/writing-feedback/feedback-gate.ts src/report-generation/writing-feedback-report.ts src/writing-feedback/__tests__/feedback-gate.test.ts src/report-generation/__tests__/writing-feedback-report-global.test.ts src/writing-feedback/__tests__/rewrite-question-clear.test.ts src/writing-feedback/__tests__/summary-sources.test.ts
git commit -m "feat: print the stored rewrite goal in rewrite mode"
```

---

### Task 5: Review page — instant switch, rewrite goal shown to staff

**Files:**
- Modify: `public/scripts/feature/writing-feedback-shared.ts:214-220` (`GlobalRevision`)
- Modify: `public/scripts/feature/writing-feedback-review-steps.ts:75-90` (`needsModeRedraft`)
- Modify: `public/scripts/feature/writing-feedback-diagnosis-model.ts` (new `rewriteGoalFor`)
- Modify: `public/scripts/feature/writing-feedback-diagnosis.ts` (new `renderRewriteGoal`)
- Modify: `public/scripts/feature/writing-feedback-review.ts:1622-1636` (rewrite section)
- Test: `public/scripts/feature/__tests__/writing-feedback-review-steps.test.ts`, `public/scripts/feature/__tests__/writing-feedback-diagnosis-model.test.ts`, `src/writing-feedback/__tests__/writing-feedback-review-source.test.ts`

**Interfaces:**
- Consumes: stored `result.globalRevision.rewriteGoal` (Tasks 2–3).
- Produces: `needsModeRedraft(run: { gateDecision?: FeedbackMode; redraftOfRunId?: string; result?: { globalRevision?: { rewriteGoal?: unknown } } }, mode: FeedbackMode): boolean`; `rewriteGoalFor(run: FeedbackRun): FeedbackRun['result']['revisionGoals'][number] | undefined`; `renderRewriteGoal(goal: { goal: string; action?: string; guidedQuestion?: string }): HTMLElement`.

- [ ] **Step 1: Failing tests**

`writing-feedback-review-steps.test.ts`, extend the `needsModeRedraft` describe:

`writing-feedback-diagnosis-model.test.ts` (import `rewriteGoalFor`; reuse the file's run builder, adding `result` fields as needed):

`writing-feedback-review-source.test.ts` (source-level guard, same style as its existing cases): assert the review source calls `renderRewriteGoal(` inside the rewrite section and that the global section still toggles with `goalsSection.hidden = next === 'global_revision'`.

- [ ] **Step 2: Run to see them fail**

Run: `npx jest public/scripts/feature/__tests__/writing-feedback-review-steps.test.ts public/scripts/feature/__tests__/writing-feedback-diagnosis-model.test.ts src/writing-feedback/__tests__/writing-feedback-review-source.test.ts --maxWorkers=4`
Expected: FAIL.

- [ ] **Step 3: Implement**

`writing-feedback-shared.ts`, in `GlobalRevision` after `guidedQuestion`:

```ts
    rewriteGoal?: { skillTag: string; goal: string; action?: string; guidedQuestion?: string; questionScope?: 'whole' | 'part' }; // required on new runs; absent before 2026-10-13
```

`writing-feedback-review-steps.ts`, replace `needsModeRedraft` and its TSDoc:

`writing-feedback-diagnosis-model.ts`, after `resolvedMode`:

(If `FeedbackRun['result']` has no `globalRevision` field in the frontend type, add `globalRevision?: GlobalRevision;` beside `revisionGoals` in `writing-feedback-shared.ts`.)

`writing-feedback-diagnosis.ts`, after `renderGlobalRevisionEditor`:

`writing-feedback-review.ts`, in the rewrite section (after `globalSection.append(renderGlobalRevisionEditor(...))`):

```ts
        const rewriteGoal = rewriteGoalFor(run);
        if (rewriteGoal) globalSection.append(renderRewriteGoal(rewriteGoal));
```

and add `renderRewriteGoal` / `rewriteGoalFor` to the existing imports from `./writing-feedback-diagnosis.js` / `./writing-feedback-diagnosis-model.js`. The toggle handler at `:936-942` already re-renders annotations and calls `summaryModeSetters`; no change there.

- [ ] **Step 4: Run tests and the frontend type check**

Run the Step 2 command. Expected: PASS.
Run (background): `npx tsc --noEmit -p public/tsconfig.json`. Expected: clean.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add public/scripts/feature/writing-feedback-shared.ts public/scripts/feature/writing-feedback-review-steps.ts public/scripts/feature/writing-feedback-diagnosis-model.ts public/scripts/feature/writing-feedback-diagnosis.ts public/scripts/feature/writing-feedback-review.ts public/scripts/feature/__tests__ src/writing-feedback/__tests__/writing-feedback-review-source.test.ts
git commit -m "feat: switch writing feedback modes without a redraft"
```

---

### Task 6: Eval checks and fixtures

**Files:**
- Modify: `src/writing-feedback/eval-checks.ts:19-31,67-90,97-152`
- Modify: `src/writing-feedback/__tests__/fixtures/eval/eval-fixtures.ts:98-102` and append one fixture
- Test: `src/writing-feedback/__tests__/eval-checks.test.ts`

**Interfaces:**
- Consumes: `validateRewriteGoal` (Task 2).
- Produces: eval check `bothModes`; fixture `dr-mostly-missing`.

- [ ] **Step 1: Failing tests**

In `eval-checks.test.ts`, using its existing output/fixture builders:

Existing tests in this file that build a `globalRevision` and assert `socraticQuestions` on a **standard** run may now see the block checked too; give such fixtures a valid `guidedQuestion` rather than relaxing the check.

- [ ] **Step 2: Run to see them fail**

Run: `npx jest src/writing-feedback/__tests__/eval-checks.test.ts --maxWorkers=4`
Expected: FAIL — no `bothModes` check.

- [ ] **Step 3: Implement**

`eval-checks.ts`:
- In `EvalRunOutput.result.globalRevision` add `rewriteGoal?: { skillTag?: string; goal?: string; action?: string; guidedQuestion?: string; questionScope?: string }`.
- Both blocks are stored and either may reach the student, so lint and question-check them on every run. Replace the `plainLanguage` input's conditional spread with an unconditional one and lint the rewrite goal with the goals:

- Add the check after `socraticQuestions`:

`eval-fixtures.ts`: change `dr-missing-classification`'s expectation to the new behaviour (definition present, classification missing — two of three required stages fail, under 75%):

```ts
        expect: { mode: 'standard', stageStatuses: { identify: 'present', classify: 'missing' }, firstGoalAddressesStage: 'classify' }
```

and append:

Bump the file's `@version`. Then run `grep -rn "EVAL_FIXTURES.length\|dr-missing-classification" src scripts` and update any count or expectation that pins the old fixture set.

- [ ] **Step 4: Run tests**

Run: `npx jest src/writing-feedback/__tests__/eval-checks.test.ts src/writing-feedback/__tests__/lab-eval-fixtures.test.ts --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/writing-feedback/eval-checks.ts src/writing-feedback/__tests__/eval-checks.test.ts src/writing-feedback/__tests__/fixtures/eval/eval-fixtures.ts
git commit -m "test: eval both feedback modes and the proportional gate"
```

---

### Task 7: Documentation, full verification, live eval, browser pass, records

**Files:**
- Modify: `documents/MONGO_DATA_LAYER.md:111`, `documents/ENDPOINT_ARCHITECTURE.md:251`
- Modify: `package.json` version `1.14.0` → `1.15.0` (and `package-lock.json` root version)
- Memory (workspace parent): `project-memory/01 Project Memory/Decisions.md`, `Current State.md`, `Open Questions.md`, new `project-memory/02 Session Log/2026-10-13 - Writing Feedback Proportional Gate.md`

- [ ] **Step 1: Data-layer and endpoint docs**

In `MONGO_DATA_LAYER.md:111`, after "`result.globalRevision` is the student-facing rewrite block and, on new runs, carries a whole-submission `guidedQuestion`." insert: "Runs from 2026-10-13 store `result.globalRevision` on every linguistic run, with a required `rewriteGoal` (a revision goal scoped `whole`); `gateDecision` is set when 75% or more of the required stages are weak or missing, or on a genre mismatch, and selects what is shown, not what is stored."
In `ENDPOINT_ARCHITECTURE.md:251`, after the `modeOverride` sentence, add: "Every new run stores both standard feedback and the rewrite block, so an override changes what is shown and printed without a new model call."

- [ ] **Step 2: Full verification (background, Node 24.1.0)**

Expected: both tsc clean; jest fails only the inherited `scenario-practice-limits` and `instructor-onboarding-ta-progression` suites; build and diff check clean.

- [ ] **Step 3: Live eval**

Run (background): `npm run wf:eval` then `npm run wf:eval -- --lens technical`.
Expected linguistic: `mode` passes on all seven fixtures (`dr-missing-classification` → standard, `dr-mostly-missing` → global_revision); `bothModes`, `socraticQuestions`, `plainLanguage` pass. Technical: unchanged 3/3. Record report ids. A `plainLanguage` failure in the rewrite goal is a prompt-wording fix in Task 3's method line, not a lint change.

- [ ] **Step 4: Browser pass (recipe: memory `browser-pass-recipe`)**

On the local mock course, generate feedback for: a submission with one or two sections missing (expect standard, first goal names the section, annotations visible), and a wrong-genre submission (expect rewrite). On each, toggle the banner switch both ways and check at 1440/768/390 px: standard shows What you did well, criterion feedback, Priority revision goals and every annotation with no redraft on Next; rewrite shows the rewrite block plus the read-only Rewrite goal and holds back unreleased annotations. Open the PDF preview in each mode and confirm it matches. Save screenshots to the scratchpad, not the repo.

- [ ] **Step 5: Records**

- `Decisions.md`: amend D-143 ("rewrite on mismatch or when ≥75% of required stages are weak or missing; `REWRITE_STAGE_SHARE`"), amend D-144 ("rewrite goal comes from `globalRevision.rewriteGoal`; strengths are no longer replaced"), add D-156 ("every linguistic run stores standard feedback and the rewrite block; the effective mode only selects what is shown; legacy rewrite-gated runs keep the redraft fallback"). Bump `updated:`.
- `Current State.md`: new top section with branch, commits (if any), evidence from Steps 2–4, and what is not done.
- `Open Questions.md`: whether staff should edit the rewrite goal; whether 0.75 holds on real LLED 200 drafts.
- Session log note dated 2026-10-13.
- No student text, feedback content or identifiers in memory.

- [ ] **Step 6: Commit (only if authorized)**

```bash
git add documents/MONGO_DATA_LAYER.md documents/ENDPOINT_ARCHITECTURE.md package.json package-lock.json docs/superpowers/specs/2026-10-13-writing-feedback-proportional-gate-design.md docs/superpowers/plans/2026-10-13-writing-feedback-proportional-gate.md
git commit -m "docs: record the proportional rewrite gate"
```
