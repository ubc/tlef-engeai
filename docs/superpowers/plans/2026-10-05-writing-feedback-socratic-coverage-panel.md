# Writing Feedback Socratic Questions, Coverage Cleanup and Review-Panel Polish Implementation Plan

> Code listings longer than three lines were removed after implementation; the code lives in the repository and its history.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every revision goal (and the rewrite block) carries a scope-tagged Socratic question, the course-material coverage list shows only teachable, assignment-relevant topics, the whole-text diagnosis panel matches the annotation cards, and the readability callout is gone.

**Architecture:** A new pure module `socratic-questions.ts` validates questions and wraps each engine's structured call with one corrective retry. Output schemas make the question and its scope required. Coverage needs gain a requirement filter and a per-genre language-function table, with a needs version in the coverage cache key. The diagnosis banner is rebuilt from the existing `wf-annotation-card`, `wf-chip` and `wf-filter-label` styles. The plain-language lint leaves the engines and stays only in the eval harness.

**Tech Stack:** TypeScript (Node 24.1.0), Express, Zod structured output via `ubc-genai-toolkit-llm`, Jest (node environment, no DOM), PDFKit, vanilla TS frontend, Playwright for the browser pass.

**Spec:** `docs/superpowers/specs/2026-10-05-writing-feedback-socratic-coverage-panel-design.md`

## Global Constraints

- Work in `/home/crodas/EngE-AI/tlef-engeai/.claude/worktrees/wf-diagnosis-grounding` on `feature/writing-feedback-plain-language`. Do not commit or push (project rule; the "Commit" steps below are replaced by "Stage nothing; leave changes in the worktree").
- Node 24.1.0: `source ~/.nvm/nvm.sh && nvm use 24.1.0` before any command.
- Jest: always `--maxWorkers=4`. Full-suite jest, `tsc` and `npm run build` run in the background, never in the foreground.
- Never edit `dist/` or `public/dist/`.
- Mirror shared types in `src/writing-feedback/contracts.ts` and `public/scripts/feature/writing-feedback-shared.ts`.
- Never log submission text, prompts containing it, or generated feedback. Error messages to staff are fixed strings.
- Student-facing output excludes `questionScope`, confidence, internal flags and model metadata.
- Question rules (verbatim from spec): one question per goal; ≥1 `whole` per run; no yes/no opener (`Is|Are|Do|Does|Did|Can|Could|Should|Would|Will|Have|Has`); must end in `?`; rewrite block has one whole-text question.
- Fixed failure message: `Feedback questions were incomplete; regenerate.`
- Prompt version bumps: writer `sfl-feedback-writer-v3.2.0`, technical `lab-report-technical-v1.5.0`, redraft `summary-redraft-v1.3.0`, examples `prompt-examples-v1.2.0`.
- Decisions: D-153 (required questions, reverses D-148's optional question), D-154 (coverage), D-155 (banner restyle; readability callout and flag removed, amends D-151/D-152).
- Inherited failing suites allowed: `instructor-onboarding-ta-progression`, `scenario-practice-limits`. Nothing else may fail.

## Review Focus

1. A stored legacy run (goals without `guidedQuestion`/`questionScope`) must still render, release and redraft without throwing. Pinned in Task 1 (validator ignores nothing on new output but `summary-sources`/PDF paths are untouched) and Task 6 (PDF with a legacy goal).
2. A model reply that is still invalid after the corrective retry must fail with the fixed message and must not include model prose in the error. Pinned in Task 3.
3. A question that ends with `?` inside quotes or trailing whitespace (`"…first? "`) must pass; a question that starts lowercase `is …` must still be caught. Pinned in Task 1.
4. Task requirements in other wording (`Length: 1–2 pages`, `Submit as a .docx file`, `Due Friday`) must be dropped, while a real skill requirement (`Use at least two sources to support each type`) must stay. Pinned in Task 8.
5. A custom-genre assignment (genreId not one of the three founded genres) must get the `default` language-function list, and coverage cached before this change must report `current: false` once. Pinned in Task 8.

---

### Task 1: Socratic question validator and retry gate

**Files:**
- Create: `src/writing-feedback/socratic-questions.ts`
- Test: `src/writing-feedback/__tests__/socratic-questions.test.ts`

**Interfaces:**
- Produces:
  - `export type QuestionScope = 'whole' | 'part';` (re-exported from contracts in Task 2; define it here first and import it in contracts)
  - `export const SOCRATIC_QUESTIONS_FAILED_MESSAGE = 'Feedback questions were incomplete; regenerate.';`
  - `export function validateSocraticQuestions(goals: Array<{ guidedQuestion?: string | null; questionScope?: string | null }>, globalRevision?: { guidedQuestion?: string | null } | null): string[]`
  - `export async function withQuestionGate<T>(attempt: (correction?: string) => Promise<T>, inspect: (value: T) => string[]): Promise<T>`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/writing-feedback/__tests__/socratic-questions.test.ts --maxWorkers=4`
Expected: FAIL with "Cannot find module '../socratic-questions'"

- [ ] **Step 3: Write minimal implementation**

Check `SanitizedJobError`'s constructor signature in `src/writing-feedback/job-runner.ts:26` and pass arguments to match (it takes the public message as its first argument).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/writing-feedback/__tests__/socratic-questions.test.ts --maxWorkers=4`
Expected: PASS (all tests)

- [ ] **Step 5: Leave changes unstaged** (no commit per project rule)

---

### Task 2: Contracts and output schemas require the question and its scope

**Files:**
- Modify: `src/writing-feedback/contracts.ts` (`RevisionGoal` ~line 565, `GlobalRevision` ~line 146, `StaffSummaryEdit.globalRevision` ~line 830)
- Modify: `public/scripts/feature/writing-feedback-shared.ts` (lines ~217, ~248, ~278)
- Modify: `src/writing-feedback/feedback-schema.ts:77-90`
- Modify: `src/writing-feedback/summary-edits.ts:33-37`
- Test: `src/writing-feedback/__tests__/feedback-schema.test.ts`, `src/writing-feedback/__tests__/summary-edits.test.ts`

**Interfaces:**
- Consumes: `QuestionScope` from `socratic-questions.ts`
- Produces:
  - `RevisionGoal.questionScope?: QuestionScope` (optional in the type for legacy runs; required in the schema)
  - `GlobalRevision.guidedQuestion?: string`
  - `StaffSummaryEdit.globalRevision` picks `'diagnosisStatement' | 'whatToKeep' | 'rewriteDirection' | 'guidedQuestion'`

- [ ] **Step 1: Write the failing tests**

Append to `feedback-schema.test.ts` (inside the existing top-level `describe` for `buildFeedbackSchema`, or a new `describe`):

Then update the existing `feedbackFor` helper at the top of the file so its goal carries `questionScope: 'whole'` and its `globalRevision` carries `guidedQuestion: 'What does a reader need to know first?'`, so the earlier tests keep passing.

Append to `summary-edits.test.ts`:

Use the file's existing builder for a valid edit payload (search the file for the helper that builds a linguistic edit with `globalRevision`; name it `parseSummaryEditsFixture` only if none exists, implemented as a call to the exported parse function with that payload plus the extra field).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/writing-feedback/__tests__/feedback-schema.test.ts src/writing-feedback/__tests__/summary-edits.test.ts --maxWorkers=4`
Expected: FAIL — the "rejects … without …" cases pass validation today.

- [ ] **Step 3: Implement**

`feedback-schema.ts`:

`contracts.ts`:

and `StaffSummaryEdit.globalRevision?: Pick<GlobalRevision, 'diagnosisStatement' | 'whatToKeep' | 'rewriteDirection' | 'guidedQuestion'>;`

If importing from `socratic-questions.ts` into `contracts.ts` creates a cycle (`socratic-questions` → `job-runner` → `contracts`), instead declare `export type QuestionScope = 'whole' | 'part';` in `contracts.ts` and have `socratic-questions.ts` import it from there.

`summary-edits.ts`:

`writing-feedback-shared.ts` mirrors: line ~217 rewrite type adds `guidedQuestion?: string;`; line ~248 goal type becomes `{ skillTag: string; goal: string; action?: string; guidedQuestion?: string; questionScope?: 'whole' | 'part' }`; line ~278 `globalRevision?: { diagnosisStatement: string; whatToKeep: string[]; rewriteDirection: string; guidedQuestion?: string }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/writing-feedback/__tests__/feedback-schema.test.ts src/writing-feedback/__tests__/summary-edits.test.ts src/writing-feedback/__tests__/structured-output-schema.test.ts --maxWorkers=4`
Expected: PASS. If `structured-output-schema.test.ts` snapshots the JSON schema, update the expected required-field lists to include `guidedQuestion` and `questionScope`.

- [ ] **Step 5: Leave changes unstaged**

---

### Task 3: Linguistic writer — prompt, examples, gate, mock

**Files:**
- Modify: `src/writing-feedback/feedback-engine.ts` (deterministic output ~lines 221-232, method lines ~253-263, writer call ~lines 510-526)
- Modify: `src/writing-feedback/prompt-examples.ts`
- Modify: `src/writing-feedback/sfl-foundation.ts:27` (`SFL_WRITER_PROMPT_VERSION = 'sfl-feedback-writer-v3.2.0'`)
- Test: `src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts`, `src/writing-feedback/__tests__/prompt-contract.test.ts`

**Interfaces:**
- Consumes: `withQuestionGate`, `validateSocraticQuestions` (Task 1); schema (Task 2)
- Produces: `SOCRATIC_QUESTION_RULES: string` exported from `prompt-examples.ts`, reused by Tasks 4 and 5:

- [ ] **Step 1: Write the failing tests**

In `feedback-engine-pipeline.test.ts`, change the `writer(...)` helper's goal to a valid default and add a parameter for overriding goals:

Add to the `describe('RubricWritingFeedbackEngine pipeline')` block:

In `prompt-contract.test.ts` add:

(Import `buildWritingFeedbackSystemPrompt` and `buildEvalAssignment` if the file does not already.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts src/writing-feedback/__tests__/prompt-contract.test.ts --maxWorkers=4`
Expected: FAIL — one writer call only; prompt still says "only when it genuinely helps".

- [ ] **Step 3: Implement**

`prompt-examples.ts`: bump `PROMPT_EXAMPLES_VERSION = 'prompt-examples-v1.2.0'`, add `SOCRATIC_QUESTION_RULES` (above), and replace the last line of `WRITER_STANDARD_EXAMPLES` with:

```ts
    'Good revision goal (part): { "skillTag": "identify", "goal": "Write a clear definition of a thermometer.", "action": "Say which group of objects it belongs to, then give one feature that makes it different.", "guidedQuestion": "In your first sentence, what group of objects does a thermometer belong to?", "questionScope": "part" }',
    'Good revision goal (whole): { "skillTag": "reader", "goal": "Plan the report for a reader who is new to thermometers.", "action": "List what that reader must know first, second and third, and check your stages follow that order.", "guidedQuestion": "Who will read your report, and what do they need to know before anything else?", "questionScope": "whole" }',
    'Weak question (avoid): "Is your definition clear?" — a yes/no question. "Did you forget the class word?" — gives the answer away.'
```

and append to `WRITER_GLOBAL_EXAMPLE`'s JSON a `"guidedQuestion": "What should a reader know about precipitation before reading about its types?"` field.

`feedback-engine.ts`:
- `standardMethod` step 6 becomes `'6. Return one to three revision goals, each with a concrete action, a guidedQuestion and a questionScope (see Questions).'` and step 8 becomes `'8. Also fill globalRevision (used if staff switch this submission to rewrite feedback): diagnosisStatement, whatToKeep, rewriteDirection, guidedQuestion.'`
- `globalMethod` step 4 becomes `'4. Return exactly one revision goal: rewrite as the target genre, with an action naming the first stage to write and a whole-submission guidedQuestion (questionScope "whole").'` and add `'3b. globalRevision.guidedQuestion: one question about the whole submission that helps the student see what the genre asks.'` after step 3.
- Insert `SOCRATIC_QUESTION_RULES` after the `buildStudentReaderContract(...)` line in the returned prompt array.
- `deterministicFeedback`: goals become

and `globalRevision` gains `guidedQuestion: 'What does the assignment ask your text to do, and what does your text do now?'`.
- Writer call: wrap it in the gate. Replace the `stripNulls((await this.llm!.sendStructuredConversation([...], schema, options)).parsed)` expression with:

where `writerUserContent` is the existing joined user content, hoisted into a `const` just above. Import `withQuestionGate, validateSocraticQuestions` from `./socratic-questions`.
- `sfl-foundation.ts`: `SFL_WRITER_PROMPT_VERSION = 'sfl-feedback-writer-v3.2.0'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts src/writing-feedback/__tests__/prompt-contract.test.ts src/writing-feedback/__tests__/feedback-engine.test.ts --maxWorkers=4`
Expected: PASS. If `feedback-engine.test.ts` asserts the old prompt wording or version string, update those assertions to the new text.

- [ ] **Step 5: Leave changes unstaged**

---

### Task 4: Technical writer — prompt, gate, mock

**Files:**
- Modify: `src/writing-feedback/technical-feedback-engine.ts` (version line 42, deterministic goals ~130-135, prompt line ~170, call ~241-258)
- Test: `src/writing-feedback/__tests__/technical-feedback-engine.test.ts`

**Interfaces:**
- Consumes: `SOCRATIC_QUESTION_RULES` (Task 3), `withQuestionGate`, `validateSocraticQuestions` (Task 1)

- [ ] **Step 1: Write the failing tests**

Delete the existing test `'flags analysis terms for staff, naming terms only'` and `'does not flag calibration in technical feedback'` (the flag is removed in Task 10; deleting them here keeps this task green — Task 10 removes the code).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/writing-feedback/__tests__/technical-feedback-engine.test.ts --maxWorkers=4`
Expected: FAIL — prompt wording and version, single call.

- [ ] **Step 3: Implement**

- `TECHNICAL_PROMPT_VERSION = 'lab-report-technical-v1.5.0'`.
- Prompt line becomes `'Return one to three revision goals. Each has a concrete action, a guidedQuestion and a questionScope.'`, followed by `SOCRATIC_QUESTION_RULES`.
- Deterministic goals: index 0 `guidedQuestion: 'What should a reader understand about your results before anything else?', questionScope: 'whole'`; others `guidedQuestion: \`Which part of your report most affects ${criterion.label.toLowerCase()}, and what would a reader need there?\`, questionScope: 'part'`.
- Wrap the structured call:

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/writing-feedback/__tests__/technical-feedback-engine.test.ts --maxWorkers=4`
Expected: PASS

- [ ] **Step 5: Leave changes unstaged**

---

### Task 5: Summary redraft — prompt, gate, mock fallback

**Files:**
- Modify: `src/writing-feedback/summary-redraft-engine.ts` (RULES line 54, fallback line 144, `redraft` ~170-185)
- Modify: `src/writing-feedback/summary-sources.ts:33` (`SUMMARY_REDRAFT_PROMPT_VERSION = 'summary-redraft-v1.3.0'`)
- Test: `src/writing-feedback/__tests__/summary-redraft-engine.test.ts`

**Interfaces:**
- Consumes: `SOCRATIC_QUESTION_RULES`, `withQuestionGate`, `validateSocraticQuestions`

- [ ] **Step 1: Write the failing tests**

Update the existing `'sends the structured schema…'` test's `parsed.revisionGoals[0]` to include `questionScope: 'whole'`. Add:

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/writing-feedback/__tests__/summary-redraft-engine.test.ts --maxWorkers=4`
Expected: FAIL

- [ ] **Step 3: Implement**

- RULES line 54 becomes `'Return one to three revision goals. Each has a goal, a concrete action the student can take, a guidedQuestion and a questionScope.'`; insert `SOCRATIC_QUESTION_RULES` after the contract line in `buildSummaryRedraftSystemPrompt`.
- Fallback goal: `{ skillTag: 'revision', goal: 'Revise the annotated passages.', action: 'Start with the annotated passage that matters most.', guidedQuestion: 'Which annotated passage would change your reader\'s understanding most, and why?', questionScope: 'whole' }`.
- `redraft`:

- `SUMMARY_REDRAFT_PROMPT_VERSION = 'summary-redraft-v1.3.0'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/writing-feedback/__tests__/summary-redraft-engine.test.ts src/writing-feedback/__tests__/summary-sources.test.ts --maxWorkers=4`
Expected: PASS

- [ ] **Step 5: Leave changes unstaged**

---

### Task 6: Rewrite-block question — editor, PDF, student view, lint

**Files:**
- Modify: `public/scripts/feature/writing-feedback-diagnosis.ts` (`GlobalRevisionDraft`, `renderGlobalRevisionEditor`)
- Modify: `public/scripts/feature/writing-feedback-summary-editor.ts` (global revision maps ~65, 236-262)
- Modify: `src/report-generation/writing-feedback-report.ts` (`renderGlobalRevisionSections` ~255-272)
- Modify: `src/writing-feedback/writing-feedback-service.ts:166` (base default gains `guidedQuestion` only when present — no change needed if the spread already carries it; verify)
- Modify: `src/writing-feedback/plain-language.ts` (`LintableFeedback.globalRevision` and `lintFeedbackProse` fields list)
- Test: `src/report-generation/__tests__/` (the existing writing-feedback report test file; find with `ls src/report-generation/__tests__`), `src/writing-feedback/__tests__/plain-language.test.ts`, `public/scripts/feature/__tests__/writing-feedback-summary-editor*.test.ts` (if present; else a source test in `src/writing-feedback/__tests__/writing-feedback-review-source.test.ts`)

**Interfaces:**
- Consumes: `GlobalRevision.guidedQuestion` (Task 2)
- Produces: `GlobalRevisionDraft.guidedQuestion: string` (frontend)

- [ ] **Step 1: Write the failing tests**

Report test (follow the file's existing PDF-text extraction helper):

`renderRewriteReportText` is a local helper you add in that test file: build a gated (`gateDecision: 'global_revision'`) result with the given fields using the file's existing fixture builders, render it, and return the extracted text.

Plain-language test:

Editor source guard (append to `writing-feedback-review-source.test.ts` or a new `src/writing-feedback/__tests__/rewrite-question-source.test.ts`):

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/report-generation src/writing-feedback/__tests__/plain-language.test.ts src/writing-feedback/__tests__/rewrite-question-source.test.ts --maxWorkers=4`
Expected: FAIL

- [ ] **Step 3: Implement**

- `GlobalRevisionDraft` adds `guidedQuestion: string;`. In `renderGlobalRevisionEditor`, append after the direction field: `field('wf-global-question', 'Question for the student', current.guidedQuestion, 2, (raw) => { current.guidedQuestion = raw; })`.
- Summary editor: the global-revision map types gain `guidedQuestion: string`; seed from `run.result.globalRevision?.guidedQuestion ?? ''`; when building the save payload (~line 258), include `...(global.guidedQuestion.trim() ? { guidedQuestion: global.guidedQuestion.trim() } : {})`.
- Report:

- `plain-language.ts`: `LintableFeedback.globalRevision` gains `guidedQuestion?: string`; in `lintFeedbackProse` the rewrite list becomes `[result.globalRevision?.diagnosisStatement, result.globalRevision?.rewriteDirection, result.globalRevision?.guidedQuestion]`.

- [ ] **Step 4: Run tests to verify they pass**

Run: same command as Step 2. Expected: PASS

- [ ] **Step 5: Leave changes unstaged**

---

### Task 7: Eval check `socraticQuestions`

**Files:**
- Modify: `src/writing-feedback/eval-checks.ts`
- Test: `src/writing-feedback/__tests__/eval-checks.test.ts`

**Interfaces:**
- Consumes: `validateSocraticQuestions`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/writing-feedback/__tests__/eval-checks.test.ts --maxWorkers=4`
Expected: FAIL — no `socraticQuestions` check.

- [ ] **Step 3: Implement**

Extend `EvalRunOutput.result.revisionGoals` items with `questionScope?: string` and `globalRevision` with `guidedQuestion?: string`. Add after the `plainLanguage` check:

Also pass `guidedQuestion` of the rewrite block to the plain-language lint (it already spreads `result.globalRevision`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/writing-feedback/__tests__/eval-checks.test.ts --maxWorkers=4`
Expected: PASS

- [ ] **Step 5: Leave changes unstaged**

---

### Task 8: Course-material coverage needs

**Files:**
- Modify: `src/writing-feedback/course-material-mentions.ts` (`LANGUAGE_FUNCTION_QUERIES` ~140, `buildGenreNeeds` ~223)
- Modify: `src/writing-feedback/material-coverage.ts` (`isCoverageCurrent`)
- Modify: `src/writing-feedback/contracts.ts` (`MaterialCoverage` adds `needsVersion?: string`) and `public/scripts/feature/writing-feedback-shared.ts:231` mirror
- Modify: `src/writing-feedback/writing-feedback-service.ts:836,857-861`
- Test: `src/writing-feedback/__tests__/course-material-needs.test.ts`, `src/writing-feedback/__tests__/material-coverage.test.ts`

**Interfaces:**
- Produces:
  - `export const COVERAGE_NEEDS_VERSION = 'coverage-needs-v2';` (in `material-coverage.ts`)
  - `export function isTeachableRequirement(requirement: string, stageLabels: string[], task: string): boolean` (in `course-material-mentions.ts`)
  - `export const GENRE_LANGUAGE_FUNCTIONS: Record<WritingFoundedGenreId | 'default', LanguageFunctionNeed[]>` with `interface LanguageFunctionNeed { key: string; label: string; query: string; overlapsStage?: RegExp }`
  - `isCoverageCurrent(coverage, rubricVersion, fingerprint)` now also requires `coverage.needsVersion === COVERAGE_NEEDS_VERSION`

- [ ] **Step 1: Write the failing tests**

In `course-material-needs.test.ts`, replace the first test's Theme assertion and add:

(Import `isTeachableRequirement` alongside the existing imports.)

In `material-coverage.test.ts`:

Update any existing `isCoverageCurrent(...) === true` assertion in that file to include `needsVersion: COVERAGE_NEEDS_VERSION` on the coverage object.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/writing-feedback/__tests__/course-material-needs.test.ts src/writing-feedback/__tests__/material-coverage.test.ts --maxWorkers=4`
Expected: FAIL

- [ ] **Step 3: Implement**

In `course-material-mentions.ts`, replace `LANGUAGE_FUNCTION_QUERIES` with:

`buildGenreNeeds` becomes:

Import `WritingFoundedGenreId` from `./contracts`. Keep `LANGUAGE_FUNCTION_QUERIES` only if another module still imports it (`grep -rn LANGUAGE_FUNCTION_QUERIES src public/scripts`); otherwise delete it.

Note on the descriptive-report filter: the eval fixture's stages are "General statement" and "Classification or composition", so `definition` and `classification` drop, leaving the three labels the test expects.

`material-coverage.ts`:

`contracts.ts` `MaterialCoverage` adds `needsVersion?: string; // absent on coverage cached before D-154`; mirror in `writing-feedback-shared.ts`. In `writing-feedback-service.ts` `recomputeMaterialCoverage`, add `needsVersion: COVERAGE_NEEDS_VERSION,` to the stored object and import it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/writing-feedback/__tests__/course-material-needs.test.ts src/writing-feedback/__tests__/material-coverage.test.ts src/writing-feedback/__tests__/material-coverage-service.test.ts src/writing-feedback/__tests__/course-material-grounding.test.ts --maxWorkers=4`
Expected: PASS. Update any assertion that counted the old five language functions.

- [ ] **Step 5: Leave changes unstaged**

---

### Task 9: Diagnosis panel restyle

**Files:**
- Modify: `public/scripts/feature/writing-feedback-diagnosis-model.ts` (`diagnosisBannerView`)
- Modify: `public/scripts/feature/writing-feedback-diagnosis.ts` (`renderDiagnosisBanner`)
- Modify: `public/styles/instructor-components/writing-feedback.css:4054-4111`
- Test: `public/scripts/feature/__tests__/writing-feedback-diagnosis-model.test.ts`; new `src/writing-feedback/__tests__/diagnosis-banner-source.test.ts`

**Interfaces:**
- Produces: `stageChips: Array<{ label: string; status: string; required: boolean; tone: 'green' | 'amber' | 'red' | 'neutral' }>`

- [ ] **Step 1: Write the failing tests**

Model test — update the first `diagnosisBannerView` expectation:

and add:

Source guard `diagnosis-banner-source.test.ts`:

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest public/scripts/feature/__tests__/writing-feedback-diagnosis-model.test.ts src/writing-feedback/__tests__/diagnosis-banner-source.test.ts --maxWorkers=4`
Expected: FAIL

- [ ] **Step 3: Implement**

Model:

Update the return type's `stageChips` element to include `tone`.

Renderer (import `chip` from `./writing-feedback-shared.js`):

(Import `refreshIcons` from `./writing-feedback-shared.js`. Remove the `wf-diagnosis--rewrite` class; nothing else reads it — verify with `grep -rn "wf-diagnosis--rewrite" public src`.)

CSS — replace the block from `/* Whole-text diagnosis banner` through `.wf-diagnosis-toggle {…}` with:

Before finalizing, check whether the review panel already has a disclosure style (`grep -n "details" public/styles/instructor-components/writing-feedback.css`); if one exists (e.g. `.wf-held-back > summary` or a chevron rule), apply the same rule to `.wf-diagnosis-why > summary` instead of the plain rule above.

- [ ] **Step 4: Run tests to verify they pass**

Run: same as Step 2. Expected: PASS

- [ ] **Step 5: Leave changes unstaged**

---

### Task 10: Remove the readability callout and its flag

**Files:**
- Modify: `public/scripts/feature/writing-feedback-review.ts` (import line 74; `plainHosts` ~857-865, 926, 960)
- Modify: `public/scripts/feature/writing-feedback-diagnosis-model.ts` (delete `PLAIN_FLAG_PREFIX`, `plainLanguageWarning`)
- Modify: `src/writing-feedback/feedback-engine.ts` (~538-540), `src/writing-feedback/technical-feedback-engine.ts` (~256-258)
- Modify: `src/writing-feedback/plain-language.ts` (delete `plainLanguageFlag` if unused afterwards)
- Delete: `src/writing-feedback/__tests__/plain-language-ui-source.test.ts`
- Test: new `src/writing-feedback/__tests__/readability-callout-removed-source.test.ts`; update `public/scripts/feature/__tests__/writing-feedback-diagnosis-model.test.ts` and `src/writing-feedback/__tests__/plain-language.test.ts`

- [ ] **Step 1: Write the failing test**

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/writing-feedback/__tests__/readability-callout-removed-source.test.ts --maxWorkers=4`
Expected: FAIL

- [ ] **Step 3: Implement**

- `writing-feedback-review.ts`: import becomes `import { diagnosisBannerView, resolvedMode } from './writing-feedback-diagnosis-model.js';`; delete the `plainHosts` declaration and its comment, the `plainHosts.forEach(...)` line in `selectLens`, and `plainHosts.forEach((host) => annotationsBody.append(host));`.
- `writing-feedback-diagnosis-model.ts`: delete `PLAIN_FLAG_PREFIX` and `plainLanguageWarning`.
- Engines: delete the two `plainFlag` lines in each and the now-unused imports (`lintFeedbackProse`, `plainLanguageFlag`, and `knownTermsFor`/`LAB_REPORT_FAMILIAR_TERMS` only if no longer referenced).
- `plain-language.ts`: delete `plainLanguageFlag` if `grep -rn plainLanguageFlag src public/scripts scripts` finds no other user; remove its tests in `plain-language.test.ts`.
- Diagnosis model test: delete the `describe('plainLanguageWarning')` block and the `'leaves plain-language drift to the per-lens warning'` test; remove `plainLanguageWarning` from its import.
- Delete `src/writing-feedback/__tests__/plain-language-ui-source.test.ts`.
- Check `writing-feedback.css` for a rule used only by the callout (`wf-callout--warning` is shared with rubric panels — keep it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/writing-feedback/__tests__/readability-callout-removed-source.test.ts src/writing-feedback/__tests__/plain-language.test.ts public/scripts/feature/__tests__/writing-feedback-diagnosis-model.test.ts --maxWorkers=4`
Expected: PASS

- [ ] **Step 5: Leave changes unstaged**

---

### Task 11: Fixture sweep, docs, full verification, live eval, browser pass, memory

**Files:**
- Modify: any test fixture still producing goals without `guidedQuestion`/`questionScope` or a rewrite block without `guidedQuestion` (find with `grep -rn "guidedQuestion: null\|revisionGoals: \[{" src public/scripts --include=*.test.ts`)
- Modify: `documents/MONGO_DATA_LAYER.md` (`materialCoverage.needsVersion`; `RevisionGoal.questionScope`; `GlobalRevision.guidedQuestion`)
- Modify: `documents/ENDPOINT_ARCHITECTURE.md` (summary-edit payload `globalRevision.guidedQuestion`; coverage `current` now also keyed on needs version)
- Modify: `.cursor/rules/writing-feedback/01-rubric-sfl-feedback.mdc` (add the D-153 question rule in one bullet)
- Modify: memory — `../project-memory/01 Project Memory/Decisions.md` (D-153, D-154, D-155; mark D-148's optional-question clause superseded), `Current State.md` (new top section), `Open Questions.md` (any new), new `../project-memory/02 Session Log/2026-10-05 - Writing Feedback Socratic Questions Coverage Panel.md`

- [ ] **Step 1: Full jest in the background**

Run (background): `npx jest --maxWorkers=4 > <scratchpad>/jest-full.log 2>&1`
Expected: only `instructor-onboarding-ta-progression` and `scenario-practice-limits` fail. Fix any other failure (most likely old fixtures missing the new required fields), then re-run.

- [ ] **Step 2: Type checks and build in the background**

Run: `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p public/tsconfig.json`, `npm run build`, `git diff --check`
Expected: all clean.

- [ ] **Step 3: Live eval**

Run: `npm run wf:eval` then `npm run wf:eval -- --lens technical`
Expected: every fixture PASS on every check, including `socraticQuestions` and `plainLanguage`. Record the report ids.

- [ ] **Step 4: Browser pass on the mock course**

With the app running (`SAML_AVAILABLE=false npm run dev`, login `instructor`), open `http://localhost:8020/course/f525ec5d0c94/instructor/writing-feedback?wfAssignment=48070162-c582-4785-b787-f76dc542a06b&wfSubmission=3ff8be8b-84c9-438a-b036-406d7982819f`, regenerate feedback, and check with Playwright (Chromium from the Playwright cache, NSS libs via `LD_LIBRARY_PATH`; close the Course Summary modal first) at 1440, 768 and 390 px:
- the diagnosis banner matches the annotation cards (screenshot and look), no horizontal overflow;
- no "Some comments may be hard for students to read" text anywhere;
- the summary step shows `Ask yourself:` under every goal;
- the rubric page's coverage panel (after "Check coverage") lists Descriptive report, the 4 stages, and 3 language skills, no `Use 250–350 words.`;
- toggle to rewrite feedback: banner shows the amber `Rewrite feedback` chip; the rewrite editor shows "Question for the student"; the PDF preview prints `Ask yourself:` once after How to rewrite.

- [ ] **Step 5: Docs and memory**

Write the doc updates, the rule bullet, D-153/D-154/D-155, the Current State section (what changed, evidence: jest counts, eval report ids, browser pass result, what is not verified), and the session log. No secrets, no student text, no generated feedback in memory.

- [ ] **Step 6: Leave changes unstaged; report to the user**
