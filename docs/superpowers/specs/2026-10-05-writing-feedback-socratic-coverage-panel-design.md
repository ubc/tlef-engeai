# Writing Feedback Socratic questions, coverage cleanup and review-panel polish — design

Date: 2026-10-05
Branch: `feature/writing-feedback-plain-language` (worktree `wf-diagnosis-grounding`, base `8d0e9d7`)
Test course: local mock `LLED 200 Plain Language Mock 202610050249` (EngE-AI `f525ec5d0c94`, Canvas course 25)

## Improved request

> **Writing Feedback: Socratic questions, coverage cleanup, review-panel polish.**
>
> 1. **Required Socratic questions.** Every revision goal carries a guiding question, in every mode and lens (linguistic writer, technical writer, summary redraft, rewrite feedback). The questions help students improve their own writing through reflection. They never hand over the answer, which keeps the student's authorship. Two scopes: at least one question about the **whole submission** (purpose, reader, how the text moves stage to stage); the rest about **a part** (one stage or passage). Questions follow the plain-language contract (option A, chosen 2026-10-05: one question per goal, scope-tagged, ≥1 whole-submission per run). Enforce in the output format and code, not only in the prompt wording. An eval check fails any run that breaks this.
> 2. **Confirm plain-language coverage** of every student-facing field and list any gap.
> 3. **Course-material coverage list.** Show only topics course materials can teach. Drop logistics and stage repeats from task requirements. Choose language-skill topics per genre, not one fixed list. Merge duplicates. Short, consistent labels.
> 4. **Whole-text diagnosis panel.** Restyle to match the annotation cards. Checked at 1440, 768 and 390 px.
> 5. **Remove the "Some comments may be hard for students to read" callout.** Keep the plain-language lint in the eval harness only.

## Evidence (mock run, 2026-10-05)

- Linguistic run, standard mode: 3 revision goals, **1** with a `guidedQuestion`.
- Coverage panel listed 13 rows. Three were task requirements copied from auto-fill: `Use 250–350 words.` (logistics), `Classify an everyday engineering or scientific entity…` (task restated), `Include a general statement, classification, and description.` (repeats the stages). Five were the fixed language-function list: `Formal definition` and `Classification into types` repeat stages, `Composition into parts` is the alternative the assignment did not take, `Theme and thematic progression` and `Noun groups` are SFL metalanguage. All rows ✗ because the mock course has no materials; that part is expected.
- Diagnosis banner (screenshot at 1440 px): left accent bar unlike the annotation cards; headline and body larger than annotation text; status pills plain and identical for Present and Weak; warning in large red body text; native `Why?` disclosure; no section label.
- Readability callout: `Some comments may be hard for students to read: 2 analysis term(s)… (entity, evaluative)…`. Staff found it unhelpful.

## Root causes

1. **D-148 made `guidedQuestion` optional** (`feedback-schema.ts:83`, `z.string().min(1).nullish()`), and all three prompts say to add one "only when it genuinely helps the student think" (`feedback-engine.ts:253`, `technical-feedback-engine.ts:170`, `summary-redraft-engine.ts:54`). `GlobalRevision` has no question field. The original purpose (D-122) was a reflection prompt beside each goal.
2. **`buildGenreNeeds`** (`course-material-mentions.ts:223`) takes the first three auto-filled `taskRequirements` verbatim and appends the fixed `LANGUAGE_FUNCTION_QUERIES` for every genre, with no filtering against the stages.
3. The banner was built as a standalone component (`writing-feedback-diagnosis.ts`, `.wf-diagnosis*` in `writing-feedback.css`) rather than from the annotation card's classes.

## Plain-language coverage check (item 2)

Already covered by `buildStudentReaderContract` and `lintFeedbackProse`: criterion explanations, evidence rationale and revision guidance, strengths, revision goals (goal, action, question), rewrite feedback (`diagnosisStatement`, `rewriteDirection`), summary redraft. Not covered, by design: rubric descriptors imported from Canvas (staff-authored) and the staff-only diagnosis rationale. The new `GlobalRevision.guidedQuestion` joins the linted fields. No other gap.

## Design

### S1. Required Socratic questions

**Contract** (`contracts.ts`, mirrored in `public/scripts/types.ts` where the type is shared):

```ts
export type QuestionScope = 'whole' | 'part';

export interface RevisionGoal {
    skillTag: string;
    goal: string;
    action?: string;          // required on new runs (unchanged)
    guidedQuestion?: string;  // required on new runs; optional only for stored legacy runs
    questionScope?: QuestionScope; // required on new runs
}

export interface GlobalRevision {
    diagnosisStatement: string;
    whatToKeep: string[];
    rewriteDirection: string;
    guidedQuestion?: string;  // required on new runs; always whole-submission
    supportingExcerptIds?: string[];
}
```

**Output schemas.** Writer, technical and redraft structured schemas make `guidedQuestion` (`min(1)`) and `questionScope` (`enum`) required on each goal. The writer's `globalRevision` schema requires `guidedQuestion`.

**Code gate** (`socratic-questions.ts`, new, pure):

- `validateSocraticQuestions(goals, globalRevision?)` returns a list of problems: a goal without a question or scope; no goal with `questionScope: 'whole'`; a question that does not end in `?`; a question that opens as yes/no (`Is|Are|Do|Does|Did|Can|Could|Should|Would|Will|Have|Has` as first word); a rewrite block without a question.
- Each engine calls it after parsing. On problems, retry the structured call once with the problems appended as a correction message. On a second failure, the run fails with a sanitized job error (`Feedback questions were incomplete; regenerate.`), never logging prose.
- Deterministic mock outputs (`isMockResponse`) emit one `whole` and one `part` question so mock mode passes the gate.

**Prompt changes** (writer, technical, redraft; versions bump minor):

- Purpose: questions let the student find the change themselves, keeping authorship; they replace telling, not the action.
- Scope rule: at least one question about the whole text (purpose, reader, order of stages); the others about the part the goal addresses, naming the stage or quoting a few of the student's own words.
- Bans: yes/no questions; questions that contain the answer ("Did you forget to add…"); metalanguage outside known terms; more than one question per goal.
- Two worked examples per prompt, e.g. whole: "Who will read your report, and what do they need to know first?"; part: "In your first sentence, what makes renewable energy different from other kinds of energy?"
- Rewrite feedback gets one whole-text question.

**Rendering.** Summary seed (`writing-feedback-summary-editor.ts`) and PDF (`writing-feedback-report.ts`) already print `Ask yourself:` when present; add the rewrite block's question to both. Order of questions unchanged. `questionScope` is staff-only metadata and never printed.

**Plain language.** `lintFeedbackProse` adds `globalRevision.guidedQuestion`.

**Eval.** New `socraticQuestions` check in `eval-checks.ts`: every goal has a question and scope, ≥1 `whole`, no yes/no opener, rewrite block has a question. Live eval re-run for both lenses.

**Decision:** D-153 — reverses D-148's optional question; `action` stays required.

### S2. Course-material coverage

In `course-material-mentions.ts`:

- **Task requirements.** New `isTeachableRequirement(requirement, stages)`: false for logistics (patterns for word/page counts, length, font, format, file type, due date, deadline, submit/upload, "no sources required", individual/group conditions) for a stage repeat (the requirement names two or more approved stage labels), and for a task restatement (at least 60% of its content words, after stop-word removal and lower-casing, appear in the profile's `task`). Up to 3 teachable requirements remain. Label is the requirement trimmed to its first clause, ≤ 60 characters.
- **Language functions per genre.** Replace the flat `LANGUAGE_FUNCTION_QUERIES` with `GENRE_LANGUAGE_FUNCTIONS: Record<WritingFoundedGenreId | 'default', Array<{ key; label; query; overlapsStage?: RegExp }>>`:
  - `descriptive_report`: definitions (overlaps a General-statement/definition stage), classifying or naming parts (overlaps a Classification/Composition stage), sentence openings that guide the reader, building precise noun phrases, objective stance.
  - `data_commentary`: describing trends and comparisons, linking data to claims, hedging claims to fit the evidence, sentence openings that guide the reader.
  - `problem_solution`: stating a problem and its cause, proposing and justifying a solution, evaluating a solution, linking ideas across sentences.
  - `default` (custom genres): sentence openings that guide the reader, linking ideas across sentences, objective stance.
  - A function whose `overlapsStage` matches an approved stage label is dropped.
- **Labels.** Staff-facing, readable, no SFL theory names (e.g. "Sentence openings that guide the reader", not "Theme and thematic progression"). Retrieval queries may keep technical words, since they match course-note wording.
- **Cache.** Add `COVERAGE_NEEDS_VERSION` to the cached `MaterialCoverage` and to `isCoverageCurrent`, so cached rows rebuild once.
- Mock assignment result: Descriptive report, 4 stages, 0 task requirements, 3 language functions (sentence openings, noun phrases, objective stance).

**Decision:** D-154.

### S3. Diagnosis panel

`renderDiagnosisBanner` keeps its inputs and behavior; markup and CSS change:

- Card uses the annotation card container styles (border, radius, padding, background); no left accent bar.
- Header row: small uppercase label `WHOLE-TEXT DIAGNOSIS` matching the `FUNCTION`/`LEVEL` filter labels; in rewrite mode an amber chip `Rewrite feedback` on the right.
- Headline at annotation card title size and weight; mode line in annotation body size, muted.
- Stage chips use the annotation chip shape: Present green, Weak amber, Missing red, Not checked neutral; `required` as a small trailing marker, not "(required)" text. Status is in text as well as colour.
- Warnings as a muted note row with a feather `info` icon, body size, not red.
- `Why?` uses the page's existing disclosure style (chevron, same as other collapsibles in the review panel).
- Toggle uses the standard small outline button.
- Width checks at 1440, 768 and 390 px: no overflow, chips wrap, touch targets ≥ 44 px under `hover: none`.

**Decision:** recorded with D-155.

### S4. Remove the readability callout

- Delete `plainLanguageWarning` and its host element/render path in `writing-feedback-review.ts` for both lenses, plus its CSS and tests.
- Engines stop adding the `Plain language:` internal flag (`plainLanguageFlag` removed from the writer and technical engines).
- `lintFeedbackProse` remains and is used only by `npm run wf:eval`.

**Decision:** D-155 — amends D-151/D-152 (UI warning and flag removed; lint kept for eval).

## Out of scope

- Sub-projects C (stage sub-requirements), D (ZPD stems) and E (12-cell matrix).
- Auto-fill changes to how task requirements are extracted.
- Backfilling questions into stored runs.
- Coverage for the technical (lab report) rubric.

## Testing

- Unit: `socratic-questions` validator (each problem type, legacy runs untouched); schema tests for required fields; engine retry-then-fail path with a stub LLM; mock outputs pass the gate; `isTeachableRequirement` with the mock's three requirements; genre function table and stage-overlap filter; coverage cache version; banner DOM (label, chip classes, no accent class, rewrite chip); callout absent.
- Builds: backend and frontend `tsc --noEmit`, `npm run build`, `git diff --check`.
- Full `npx jest --maxWorkers=4`: only the two inherited suites may fail.
- Live eval: `npm run wf:eval` and `npm run wf:eval -- --lens technical`, all checks including `socraticQuestions` pass.
- Browser pass on the mock course: regenerate, confirm every goal shows `Ask yourself:`, coverage panel rows, banner at 1440/768/390 px, callout gone.

## Success criteria

- 100% of goals in new runs carry a question; every run has ≥1 whole-submission question; rewrite feedback has one.
- Mock coverage panel shows no logistics, task restatement, stage repeat or SFL theory label.
- Banner visually matches the annotation cards at all three widths.
- No readability callout on either lens.
- All invariants hold: exact evidence, no rewritten student sentences, human approval, no logging of student text or feedback.
