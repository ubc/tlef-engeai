# Writing Feedback Plain Language Implementation Plan

> Code listings longer than three lines were removed after implementation; the code lives in the repository and its history.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every student-facing Writing Feedback string plain, precise English for Vantage One LLED 200 students (IELTS 5.5–6.5), and stop SFL analysis vocabulary from reaching them.

**Architecture:** A new pure module, `plain-language.ts`, owns three things: the student-reader contract (prompt text), the SFL-to-plain translation table, and a deterministic lint. The linguistic writer, the summary redraft and the technical lens all inject the contract. The writer and the technical lens add one staff-only lint line to `internalFlags`. The eval gains a `plainLanguage` check. The analyzer and the diagnosis call stay technical.

**Tech Stack:** TypeScript, Jest, `ubc-genai-toolkit-llm`, Node 24.1.0 (WSL).

**Spec:** `docs/superpowers/specs/2026-10-03-writing-feedback-plain-language-design.md`

## Global Constraints

- Work in worktree `tlef-engeai/.claude/worktrees/wf-diagnosis-grounding`. Cut a new branch `feature/writing-feedback-plain-language` from `feature/writing-feedback-diagnosis-grounding` (`2a13772`).
- Node 24.1.0. No Python anywhere.
- Run Jest/tsc/build in the background only, always with `--maxWorkers=4`.
- Never edit `dist/` or `public/dist/`.
- Do not commit unless the user authorizes. If they do: subject line only, sole `rdschrs` authorship, no co-author trailer.
- Invariants stay: exact evidence quotes, no rewritten student sentences or model answers, human approval before release, no logging of submission text, prompts or generated feedback.
- The lint never blocks a run. Its flag text holds only term names and counts, never student or feedback text.
- Sentence limits: aim ≤20 words, hard 25. Rationale ≤2 sentences, guidance ≤2 sentences, explanation ≤3 sentences.
- Eval thresholds: banned terms ≤1 per 100 words; sentences over 25 words ≤5%.

## Review Focus

1. A known term that is also on the banned list (staff add "stance" to the glossary terms). The lint must not flag it, and the prompt must list it as allowed.
2. Plain words that only *contain* a banned term: "registered", "processed", "the theme park", and sentence-initial "Theme" in a quoted title. Matching uses word boundaries. "Theme" is matched only as a capitalized mid-sentence word or as "Theme" followed by a space and a lowercase word, and terms inside quotation marks are ignored.
3. Evidence quotes from student text. The student may use "classification" themselves, so the lint must strip quoted spans (`"…"`, `“…”`) before counting.
4. Empty or missing `sflContext.approvedGlossaryTerms`, or a technical rubric with no `sflContext`. Known terms fall back to `[]` without throwing.
5. Decimal numbers and abbreviations ("e.g.", "3.5 g") must not split sentences and distort the length counts.

---

### Task 1: `plain-language.ts` contract, translation table and lint

**Files:**
- Create: `src/writing-feedback/plain-language.ts`
- Test: `src/writing-feedback/__tests__/plain-language.test.ts`

**Interfaces:**
- Produces:
  - `PLAIN_LANGUAGE_VERSION: string` (`'plain-language-v1.0.0'`)
  - `knownTermsFor(sflContext?: Pick<WritingSflContextProfile, 'approvedGlossaryTerms' | 'stages' | 'genreLabel'>): string[]`
  - `buildStudentReaderContract(knownTerms: string[]): string`
  - `lintStudentProse(text: string, knownTerms: string[], maxSentences?: number): PlainLanguageIssue`
  - `lintFeedbackProse(result: { criteria: Array<{ explanation: string; evidence: Array<{ rationale: string; revisionGuidance: string }> }>; strengths: string[]; revisionGoals: Array<{ goal: string; action?: string; guidedQuestion?: string }>; globalRevision?: { diagnosisStatement?: string; rewriteDirection?: string } }, knownTerms: string[]): PlainLanguageReport`
  - `plainLanguageFlag(report: PlainLanguageReport): string | undefined`
  - `interface PlainLanguageIssue { bannedTerms: string[]; longSentences: number; sentences: number; words: number; tooManySentences: boolean }`
  - `interface PlainLanguageReport { bannedTerms: string[]; bannedHits: number; longSentences: number; sentences: number; words: number; overLongComments: number }`

- [ ] **Step 1: Write the failing tests**

- [ ] **Step 2: Run the tests to verify they fail**

Run (background): `npx jest src/writing-feedback/__tests__/plain-language.test.ts --maxWorkers=4`
Expected: FAIL with "Cannot find module '../plain-language'".

- [ ] **Step 3: Implement the module**

The `Theme` pattern relies on `sentencesOf` running first, so `^` means the start of a sentence. Sentence-initial "Theme parks are…" is allowed, while "keep sound as the Theme" is flagged. If Review Focus item 2 shows a false positive, tighten the pattern and add that case to the tests.

- [ ] **Step 4: Run the tests to verify they pass**

Run (background): `npx jest src/writing-feedback/__tests__/plain-language.test.ts --maxWorkers=4`
Expected: PASS. Adjust the regexes until they pass, not the tests, unless a test contradicts the spec.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/writing-feedback/plain-language.ts src/writing-feedback/__tests__/plain-language.test.ts
git commit -m "feat: add plain-language contract and lint"
```

---

### Task 2: Linguistic writer uses the contract, translates findings, flags drift

**Files:**
- Modify: `src/writing-feedback/feedback-engine.ts` (the `buildWritingFeedbackSystemPrompt` Pedagogy line and the line after it; Step 8 near `guardStrengths`)
- Modify: `src/writing-feedback/prompt-examples.ts`
- Modify: `src/writing-feedback/sfl-foundation.ts` (`SFL_WRITER_PROMPT_VERSION`)
- Test: `src/writing-feedback/__tests__/prompt-contract.test.ts`, `src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts`

**Interfaces:**
- Consumes: `buildStudentReaderContract`, `knownTermsFor`, `lintFeedbackProse`, `plainLanguageFlag` from Task 1.
- Produces: `SFL_WRITER_PROMPT_VERSION = 'sfl-feedback-writer-v3.1.0'`; `PROMPT_EXAMPLES_VERSION = 'prompt-examples-v1.1.0'`.

- [ ] **Step 1: Write the failing prompt-contract tests** (append to the `writer prompt` describe block)

And in `feedback-engine-pipeline.test.ts`, add a case that uses the existing mocked-LLM helper in that file. Its writer response must contain `"rationale": "Keep the entity as the Theme."`. Assert:

```ts
expect(result.internalFlags.some((flag) => flag.startsWith('Plain language: '))).toBe(true);
expect(result.internalFlags.join(' ')).not.toContain('Keep the entity');
```

- [ ] **Step 2: Run them to verify they fail**

Run (background): `npx jest src/writing-feedback/__tests__/prompt-contract.test.ts src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts --maxWorkers=4`
Expected: the 3 new prompt tests and the new pipeline case FAIL.

- [ ] **Step 3: Edit the writer prompt**

In `buildWritingFeedbackSystemPrompt`, replace the line starting `'You are the feedback-writer step…'` and the `Pedagogy:` line with:

```ts
        'You are the feedback-writer step. Staff review your draft and then release it to the student, so the student is your reader.',
        'Pedagogy: feedback builds the student\'s long-term capacity to write this kind of text, not a perfect copy of this one. Say clearly what works and what does not, and give one concrete next move per issue. Be candid and respectful: direct about shortcomings, no praise sandwich, no euphemisms such as "you may want to consider".',
        buildStudentReaderContract(knownTermsFor(rubric.sflContext)),
```

Add the import:

```ts
import { buildStudentReaderContract, knownTermsFor, lintFeedbackProse, plainLanguageFlag } from './plain-language';
```

In the global method, change step 3 to:

```ts
        '3. globalRevision.rewriteDirection: the stages the rewrite needs, in order, as numbered steps one per line, each saying what to write in plain words. Cite supporting genre_excerpts ids in supportingExcerptIds where they teach the stage.',
```

- [ ] **Step 4: Add the lint flag after the strengths guard (Step 8)**

Use whatever name the surrounding `generate` method gives the assignment. Check the method signature; if it is `input.assignment`, use that.

- [ ] **Step 5: Rewrite the writer examples** in `prompt-examples.ts` (keep `ANALYZER_EXAMPLES` unchanged and bump the version)

- [ ] **Step 6: Bump the writer version** in `sfl-foundation.ts`

```ts
export const SFL_WRITER_PROMPT_VERSION = 'sfl-feedback-writer-v3.1.0';
```

- [ ] **Step 7: Run the tests to verify they pass**

Run (background): `npx jest src/writing-feedback --maxWorkers=4`
Expected: PASS. Existing prompt-contract tests such as "states the pedagogy before the constraints" still pass, because `Pedagogy` still precedes `Constraints`. Fix any test that pins the old Pedagogy sentence or the old examples by updating the pinned string, not by weakening the assertion.

- [ ] **Step 8: Commit (only if authorized)**

```bash
git add src/writing-feedback/feedback-engine.ts src/writing-feedback/prompt-examples.ts src/writing-feedback/sfl-foundation.ts src/writing-feedback/__tests__/prompt-contract.test.ts src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts
git commit -m "feat: write linguistic feedback for the student in plain language"
```

---

### Task 3: Summary redraft writes for the student

**Files:**
- Modify: `src/writing-feedback/summary-redraft-engine.ts` (`buildSummaryRedraftSystemPrompt`)
- Modify: `src/writing-feedback/summary-sources.ts` (`SUMMARY_REDRAFT_PROMPT_VERSION`)
- Test: `src/writing-feedback/__tests__/summary-redraft-engine.test.ts`

**Interfaces:**
- Consumes: `buildStudentReaderContract`, `knownTermsFor` (Task 1).
- Produces: `SUMMARY_REDRAFT_PROMPT_VERSION = 'summary-redraft-v1.2.0'`.

`SummaryRedraftOutput` has no `internalFlags`, so the redraft gets the contract but no lint flag. That is deliberate: adding a field would change a stored contract.

- [ ] **Step 1: Write the failing test**

Use the assignment fixture the file already builds. If there is none, use `buildEvalAssignment()` from `./fixtures/eval/eval-fixtures`.

- [ ] **Step 2: Run it to verify it fails**

Run (background): `npx jest src/writing-feedback/__tests__/summary-redraft-engine.test.ts --maxWorkers=4`
Expected: FAIL on both assertions.

- [ ] **Step 3: Edit the prompt**

Replace `'You redraft the summary of staff-reviewed feedback. Your reader is the teaching team, who will edit and approve it.',` with:

```ts
        'You redraft the summary of staff-reviewed feedback. The teaching team edits and approves it, then the student reads it, so write for the student.',
        buildStudentReaderContract(knownTermsFor(input.lens === 'linguistic' ? rubric.sflContext : undefined)),
```

Add the import `import { buildStudentReaderContract, knownTermsFor } from './plain-language';`, then bump `SUMMARY_REDRAFT_PROMPT_VERSION` to `'summary-redraft-v1.2.0'`.

- [ ] **Step 4: Run the tests to verify they pass**

Run (background): `npx jest src/writing-feedback/__tests__/summary-redraft-engine.test.ts src/writing-feedback/__tests__/summary-sources.test.ts --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/writing-feedback/summary-redraft-engine.ts src/writing-feedback/summary-sources.ts src/writing-feedback/__tests__/summary-redraft-engine.test.ts
git commit -m "feat: redraft summaries for the student in plain language"
```

---

### Task 4: Technical lens writes for the student (droppable; spec Q3)

**Files:**
- Modify: `src/writing-feedback/technical-feedback-engine.ts` (`buildTechnicalFeedbackSystemPrompt`, `TECHNICAL_PROMPT_VERSION`, the return after `reconcileExactEvidence`)
- Test: `src/writing-feedback/__tests__/technical-feedback-engine.test.ts`

**Interfaces:**
- Consumes: `buildStudentReaderContract`, `lintFeedbackProse`, `plainLanguageFlag` (Task 1).
- Produces: `TECHNICAL_PROMPT_VERSION = 'lab-report-technical-v1.3.0'`.

- [ ] **Step 1: Write the failing tests**

Use the technical assignment fixture the file already defines, under whatever name it has.

- [ ] **Step 2: Run it to verify it fails**

Run (background): `npx jest src/writing-feedback/__tests__/technical-feedback-engine.test.ts --maxWorkers=4`
Expected: FAIL.

- [ ] **Step 3: Edit the prompt, the version and the flag**

Replace `'You are a technical lab-report reviewer for a staff review workspace. Your reader is the teaching team, not the student.',` with:

```ts
        'You are a technical lab-report reviewer. The teaching team reviews your draft and releases it to the student, so the student is your reader.',
        buildStudentReaderContract([]),
```

Leave `PRIME_DIRECTIVE` first; it is pinned by D-055. Bump `TECHNICAL_PROMPT_VERSION` to `'lab-report-technical-v1.3.0'`. Replace the final `return reconcileExactEvidence(parsedResult, input.verifiedText);` with:

The technical lens passes `[]` as known terms because it has no `sflContext`. Lab-report technical terms such as "uncertainty" or "trendline" are not on the banned list, so they still pass.

- [ ] **Step 4: Run the tests to verify they pass**

Run (background): `npx jest src/writing-feedback/__tests__/technical-feedback-engine.test.ts --maxWorkers=4`
Expected: PASS, including the existing D-055 prime-directive pins.

- [ ] **Step 5: Commit (only if authorized)**

```bash
git add src/writing-feedback/technical-feedback-engine.ts src/writing-feedback/__tests__/technical-feedback-engine.test.ts
git commit -m "feat: write technical feedback for the student in plain language"
```

---

### Task 5: Eval `plainLanguage` check

**Files:**
- Modify: `src/writing-feedback/eval-checks.ts`
- Test: `src/writing-feedback/__tests__/eval-checks.test.ts`

**Interfaces:**
- Consumes: `lintFeedbackProse`, `knownTermsFor` (Task 1). Known terms come from `buildEvalAssignment().rubric.sflContext`, passed as a new optional `knownTerms: string[] = []` parameter on `runEvalChecks`. `scripts/wf-eval.ts` passes `knownTermsFor(assignment.rubric.sflContext)`.
- Produces: a check named `plainLanguage`.

- [ ] **Step 1: Write the failing tests**

Use the `fixture` value the file already uses for the other checks.

- [ ] **Step 2: Run them to verify they fail**

Run (background): `npx jest src/writing-feedback/__tests__/eval-checks.test.ts --maxWorkers=4`
Expected: FAIL, because no `plainLanguage` check exists.

- [ ] **Step 3: Implement the check**

Change the signature to `export function runEvalChecks(output: EvalRunOutput, fixture: EvalFixture, knownTerms: string[] = []): EvalCheckResult[]`, then add this before `return [`:

Then add this entry to the returned array:

Also add `explanation?: string` to the criteria element type, and `rationale?: string; revisionGuidance?: string` to the evidence element type in `EvalRunOutput`. That way the casts above can be removed. Do it and drop the casts.

In `scripts/wf-eval.ts`, import `knownTermsFor` and pass `knownTermsFor(assignment.rubric.sflContext)` as the third argument to `runEvalChecks`.

- [ ] **Step 4: Run the tests to verify they pass**

Run (background): `npx jest src/writing-feedback/__tests__/eval-checks.test.ts --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Baseline the old report** (proves the check bites)

Write a scratch Node script in the session scratchpad (not the repo). It loads `eval-reports/wf-eval-2026-09-28T21-17-39-314Z.json`, and for each `report[i].output`, runs it through `runEvalChecks` via `ts-node` with known terms `['General statement', 'Classification or composition', 'Description', 'Descriptive report']`. Expected: most runs FAIL `plainLanguage`. Record the counts for the handoff.

- [ ] **Step 6: Commit (only if authorized)**

```bash
git add src/writing-feedback/eval-checks.ts src/writing-feedback/__tests__/eval-checks.test.ts scripts/wf-eval.ts
git commit -m "test: score plain language in the writing feedback eval"
```

---

### Task 6: Plain default rubric descriptors and a clearer glossary-terms label

**Files:**
- Modify: `src/writing-feedback/default-rubric-profile.ts` (`DEFAULT_WRITING_DESCRIPTORS`)
- Modify: `public/scripts/feature/writing-feedback-rubric.ts:431-435`
- Test: `src/writing-feedback/__tests__/default-rubric-profile.test.ts`

**Interfaces:**
- Consumes: `lintStudentProse` (Task 1).
- Produces: nothing new. This changes the template only; existing approved rubrics are untouched (D-029, D-063).

- [ ] **Step 1: Write the failing test**

`buildDefaultWritingRubric` is already exported from `../default-rubric-profile`; criteria carry `cells?: Record<WritingLevelId, WritingRubricCell>` with an optional `descriptor`.

- [ ] **Step 2: Run it to verify it fails**

Run (background): `npx jest src/writing-feedback/__tests__/default-rubric-profile.test.ts --maxWorkers=4`
Expected: FAIL. Terms such as "cohesive", "entities", "stance", "modality", "hedging", "calibrated" and "register" are flagged.

- [ ] **Step 3: Replace the descriptors**

Check: "processes" in the content descriptors is not banned. Only `material/mental process` and `relational process` are, so the descriptors pass.

- [ ] **Step 4: Relabel the glossary field** in `writing-feedback-rubric.ts`

```ts
    glossaryTerms.placeholder = 'One per line. Feedback may use these terms, with a short explanation. Leave blank if none';
    // ...
    body.append(sflField({ label: 'Course terms students already know (optional)', control: glossaryTerms }));
```

Grep the tests for the old label `Words from your course glossary` and update any pin.

- [ ] **Step 5: Run the tests to verify they pass**

Run (background): `npx jest src/writing-feedback --maxWorkers=4`
Expected: PASS. Update any snapshot or pin of the old descriptor wording to the new wording.

- [ ] **Step 6: Commit (only if authorized)**

```bash
git add src/writing-feedback/default-rubric-profile.ts src/writing-feedback/__tests__/default-rubric-profile.test.ts public/scripts/feature/writing-feedback-rubric.ts
git commit -m "feat: plain default rubric descriptors"
```

---

### Task 7: Verification, rules, memory

**Files:**
- Modify: `.cursor/rules/writing-feedback/01-rubric-sfl-feedback.mdc` (add a "Student-facing language" section)
- Modify: `../project-memory/01 Project Memory/Decisions.md`, `Current State.md`, `Open Questions.md`
- Create: `../project-memory/02 Session Log/2026-10-03 - Writing Feedback Plain Language.md`

- [ ] **Step 1: Run both builds and the full suite** (background)

Expected: both tsc runs clean. Jest shows only the two inherited failing suites already noted on 2026-09-28. Any new failure blocks.

- [ ] **Step 2: Live eval** (needs the LLM env; ask the user to run it if no credentials are available)

```bash
npm run wf:eval -- --runs 1
```

Expected: `plainLanguage` passes on 18/18, and every other check matches the 2026-09-28 results. Compare against the baseline with the scratchpad script from the session, which measures density and average sentence length. Target: ≤1 banned term per 100 words (was 5.8) and ≤16 words per sentence on average (was 20.8).

- [ ] **Step 3: Human check pack**

From the old and new eval reports (synthetic texts only), take 10 matched comment pairs. Write them to a scratchpad file in random A/B order for the user to share with colleagues and the supervisor. The question is: "Which tells you more clearly what to change?" Do not put this in the repo or in project memory.

- [ ] **Step 4: Rule file** — append to `01-rubric-sfl-feedback.mdc`:

- [ ] **Step 5: Memory**

- Add `D-151` to `Decisions.md`: "Student-facing Writing Feedback prose follows a shared plain-language contract for Vantage One EAL readers. SFL terms stay internal, known terms come from staff-approved glossary terms, stage labels and the genre label, and a deterministic lint flags drift staff-only and in the eval." Rationale: the team found feedback too abstract, and the eval showed 5.8 analysis terms per 100 words.
- Update `Current State.md` with the branch, status and eval numbers.
- Move spec questions Q1–Q3 into `Open Questions.md`.
- Write the session log: no student text, no generated feedback excerpts.

- [ ] **Step 6: Commit (only if authorized)**

```bash
git add .cursor/rules/writing-feedback/01-rubric-sfl-feedback.mdc
git commit -m "docs: plain-language rule for writing feedback"
```

No documentation for `ENDPOINT_ARCHITECTURE.md` or `MONGO_DATA_LAYER.md` is needed, because no route or stored contract changes.
