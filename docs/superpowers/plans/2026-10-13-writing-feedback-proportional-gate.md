# Writing Feedback Proportional Rewrite Gate Implementation Plan

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

```ts
    it('stays standard when one of two required stages is missing', () => {
        const stages = diagnosis({}).stages.map((stage) => stage.stageId === 'classify' ? { ...stage, status: 'missing' as const } : stage);
        expect(resolveGateDecision(diagnosis({ stages }), profile)).toBe('standard');
    });

    it('is global when every required stage is weak or missing', () => {
        const stages = diagnosis({}).stages.map((stage) => stage.stageId === 'classify'
            ? { ...stage, status: 'missing' as const }
            : stage.stageId === 'identify' ? { ...stage, status: 'weak' as const } : stage);
        expect(resolveGateDecision(diagnosis({ stages }), profile)).toBe('global_revision');
    });
```

Then add a new `describe` after the existing `resolveGateDecision` block:

```ts
describe('resolveGateDecision at the 75% boundary', () => {
    const ids = ['s1', 's2', 's3', 's4', 's5', 's6'];
    const sixRequired = { stages: ids.map((id) => ({ id, label: id, purpose: 'p', required: true })) } as unknown as WritingSflContextProfile;
    const withFailing = (count: number, status: 'weak' | 'missing' = 'missing'): TextDiagnosis => diagnosis({
        stages: ids.map((id, index) => ({ stageId: id, status: index < count ? status : 'present' as const }))
    });

    it('uses a 0.75 share', () => {
        expect(REWRITE_STAGE_SHARE).toBe(0.75);
    });

    it('keeps standard feedback for one, two, three or four of six', () => {
        [1, 2, 3, 4].forEach((count) => expect(resolveGateDecision(withFailing(count), sixRequired)).toBe('standard'));
    });

    it('rewrites at five of six, weak or missing alike', () => {
        expect(resolveGateDecision(withFailing(5), sixRequired)).toBe('global_revision');
        expect(resolveGateDecision(withFailing(5, 'weak'), sixRequired)).toBe('global_revision');
    });

    it('rewrites at exactly 75% (three of four)', () => {
        const four = { stages: ids.slice(0, 4).map((id) => ({ id, label: id, purpose: 'p', required: true })) } as unknown as WritingSflContextProfile;
        const stages = ids.slice(0, 4).map((id, index) => ({ stageId: id, status: index < 3 ? 'weak' as const : 'present' as const }));
        expect(resolveGateDecision(diagnosis({ stages }), four)).toBe('global_revision');
    });

    it('stays standard with no required stages, even when every stage is missing', () => {
        const optional = { stages: ids.map((id) => ({ id, label: id, purpose: 'p', required: false })) } as unknown as WritingSflContextProfile;
        expect(resolveGateDecision(withFailing(6), optional)).toBe('standard');
    });

    it('counts a duplicated diagnosis entry once', () => {
        const two = { stages: ids.slice(0, 2).map((id) => ({ id, label: id, purpose: 'p', required: true })) } as unknown as WritingSflContextProfile;
        const stages = [{ stageId: 's1', status: 'missing' as const }, { stageId: 's1', status: 'missing' as const }, { stageId: 's2', status: 'present' as const }];
        expect(resolveGateDecision(diagnosis({ stages }), two)).toBe('standard');
    });
});
```

- [ ] **Step 2: Run to see the new tests fail**

Run: `npx jest src/writing-feedback/__tests__/feedback-gate.test.ts --maxWorkers=4`
Expected: FAIL — `REWRITE_STAGE_SHARE` is undefined; "stays standard when one of two required stages is missing" gets `global_revision`.

- [ ] **Step 3: Implement the rule**

Replace the header description and `resolveGateDecision` in `feedback-gate.ts` (bump `@version` to `1.1.0`, header paragraph: "A text that is the wrong genre, or leaves most required stages weak or missing, needs a rewrite. A text missing one or two sections still gets standard feedback, whose first goal names them."):

```ts
/** Share of required stages that must be weak or missing before rewrite feedback applies. */
export const REWRITE_STAGE_SHARE = 0.75;

/**
 * resolveGateDecision - the mode a fresh run gets from its diagnosis.
 *
 * Rewrite feedback is for a text that misses the point: the wrong genre, or at least
 * `REWRITE_STAGE_SHARE` of the required stages weak or missing. Only `required === true`
 * counts, so an absent flag can never push a student into rewrite feedback; a profile
 * with no required stage rewrites only on a genre mismatch.
 *
 * @param diagnosis - Validated whole-text diagnosis
 * @param profile - Approved genre profile whose stages the diagnosis covers
 * @returns `global_revision` on a mismatch or when most required stages fail, else `standard`
 */
export function resolveGateDecision(diagnosis: TextDiagnosis, profile: WritingSflContextProfile): FeedbackMode {
    if (diagnosis.genreFit === 'mismatch') return 'global_revision';
    const required = new Set(profile.stages.filter((stage) => stage.required === true).map((stage) => stage.id));
    if (!required.size) return 'standard';
    const failing = new Set(diagnosis.stages
        .filter((stage) => required.has(stage.stageId) && stage.status !== 'present')
        .map((stage) => stage.stageId));
    return failing.size / required.size >= REWRITE_STAGE_SHARE ? 'global_revision' : 'standard';
}
```

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

```ts
        globalRevision: {
            diagnosisStatement: 'd', whatToKeep: [], rewriteDirection: 'r', guidedQuestion: 'What does the genre ask?', supportingExcerptIds: null,
            rewriteGoal: { skillTag: 'descriptive_report', goal: 'Rewrite as a report.', action: 'Start with a definition.', guidedQuestion: 'What should your reader learn first?', questionScope: 'whole' }
        }
```

and add:

```ts
    it('requires a rewrite goal in the global block', () => {
        const { rewriteGoal, ...withoutGoal } = base.globalRevision;
        void rewriteGoal;
        expect(schema.safeParse({ ...base, globalRevision: withoutGoal }).success).toBe(false);
    });
```

Replace the test `'in global mode keeps only transferable strengths, falling back to the diagnosis'` with:

```ts
    it('never replaces strengths with transferable ones; the mode is applied at display', () => {
        const draft = { ...result([]), strengths: ['Accurate terms.'] };
        guardStrengths(draft, diagnosis);
        expect(draft.strengths).toEqual(['Accurate terms.']);
    });
```

and change `guardStrengths(draft, diagnosis, 'standard')` in the first guard test to `guardStrengths(draft, diagnosis)`.

In `socratic-questions.test.ts` add (import `validateRewriteGoal`):

```ts
describe('validateRewriteGoal', () => {
    const good = { action: 'Start with a definition.', guidedQuestion: 'What should your reader learn first?', questionScope: 'whole' };

    it('accepts a whole-submission goal with an action and an open question', () => {
        expect(validateRewriteGoal(good)).toEqual([]);
    });

    it('reports a missing goal', () => {
        expect(validateRewriteGoal(undefined)).toEqual(['globalRevision has no rewriteGoal.']);
    });

    it('refuses a part-scoped goal, a missing action and a yes/no question', () => {
        expect(validateRewriteGoal({ ...good, questionScope: 'part' }).join(' ')).toMatch(/questionScope "whole"/);
        expect(validateRewriteGoal({ ...good, action: ' ' }).join(' ')).toMatch(/no action/);
        expect(validateRewriteGoal({ ...good, guidedQuestion: 'Is your definition clear?' }).length).toBeGreaterThan(0);
    });
});
```

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

```ts
export function guardStrengths(result: WritingFeedbackResult, diagnosis: TextDiagnosis): string[] {
    const contradicting = diagnosis.contradictingFeatures.map((feature) => words(feature.quote)).filter(Boolean);
    const before = result.strengths.length;
    result.strengths = result.strengths.filter((strength) => !contradicting.some((quote) => words(strength).includes(quote)));
    return result.strengths.length < before ? [STRENGTH_DROPPED_FLAG] : [];
}
```

`socratic-questions.ts`, after `validateSocraticQuestions`:

```ts
/**
 * validateRewriteGoal - the rules a new run's rewrite goal must meet.
 *
 * The rewrite goal is about the whole submission, so its question must be scoped `whole`.
 *
 * @param goal - `globalRevision.rewriteGoal` as parsed from the model
 * @returns Problems for the corrective retry; empty when valid. Never contains student text.
 */
export function validateRewriteGoal(
    goal?: { action?: string | null; guidedQuestion?: string | null; questionScope?: string | null } | null
): string[] {
    if (!goal) return ['globalRevision has no rewriteGoal.'];
    const label = 'globalRevision.rewriteGoal';
    const problems: string[] = [];
    if (!goal.action?.trim()) problems.push(`${label} has no action.`);
    const question = goal.guidedQuestion?.trim();
    if (!question) problems.push(`${label} has no guidedQuestion.`);
    else problems.push(...questionProblems(label, question));
    if (goal.questionScope !== 'whole') problems.push(`${label} needs questionScope "whole".`);
    return problems;
}
```

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

```ts
    it('asks for standard feedback and the rewrite block in every run, never naming the mode', () => {
        const prompt = buildWritingFeedbackSystemPrompt(assignment);
        expect(prompt).not.toContain('This text needs a rewrite');
        expect(prompt).toContain('Always fill globalRevision');
        expect(prompt).toContain('globalRevision.rewriteGoal');
        expect(prompt).toContain('<worked_example_global>');
        expect(prompt).not.toMatch(/student will see only the rewrite/i);
    });

    it('points the first goal at a weak or missing section', () => {
        expect(buildWritingFeedbackSystemPrompt(assignment)).toMatch(/weak or missing, your first revision goal addresses it/);
    });
```

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

```ts
    it('sends the same writer system prompt whatever the gate decides', async () => {
        const writerPrompt = async (fit: 'fits' | 'mismatch') => {
            const send = fakeLlm(fit, () => null);
            await new RubricWritingFeedbackEngine({ sendStructuredConversation: send } as unknown as LLMModule, new InMemoryMaterialRetriever())
                .generate({ assignment, verifiedText: text });
            const call = send.mock.calls.find((entry) => entry[2].structuredOutputName === 'writing_feedback_v2')!;
            return call[0][0].content;
        };
        expect(await writerPrompt('mismatch')).toBe(await writerPrompt('fits'));
    });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx jest src/writing-feedback/__tests__/prompt-contract.test.ts src/writing-feedback/__tests__/feedback-engine-pipeline.test.ts --maxWorkers=4`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement the single method**

In `buildWritingFeedbackSystemPrompt`, remove the `mode` parameter (and its `@param`), delete `globalMethod`, and replace `standardMethod` with:

```ts
    const method = [
        'Method:',
        '1. Read the diagnosis. If a required stage is weak or missing, your first revision goal addresses it: name the section, say what to add or fix, and set skillTag to that stage id. When several are, take the earliest in the stage order. Otherwise, if genreFit is "partial", your first revision goal addresses the weakest stage.',
        `2. For each criterion, choose the passages that most affect its level. Return at most ${MAX_EVIDENCE_PER_CRITERION} evidence items per criterion. Three is a ceiling, not a target: every evidence item becomes one annotation the student reads.`,
        '3. Each evidence.rationale must name the specific problem in that passage; do not restate the quote and do not repeat the criterion explanation. Each evidence.revisionGuidance must give a concrete next revision action for that exact passage. It must not copy the criterion explanation, the rationale, or a full revision goal.',
        '4. Where finding_citations lists an excerpt for a finding linked to the passage, set supportingExcerptId to that id. Otherwise leave it null. Never cite for decoration.',
        '5. Each explanation must synthesize that criterion\'s evidence as a whole — the pattern across its passages and why it sits at that level — not repeat any single rationale.',
        '6. Return one to three revision goals, each with a concrete action, a guidedQuestion and a questionScope (see Questions).',
        '7. Return zero to two strengths that serve the target genre. Never praise a contradictingFeature from the diagnosis.',
        '8. Always fill globalRevision as well. Staff may give this student rewrite feedback instead, and then globalRevision carries the whole message:',
        '   - globalRevision.diagnosisStatement: open with what is worth keeping, then say plainly what the text does compared with what the genre asks. Quote at most two contradicting features as examples.',
        '   - globalRevision.whatToKeep: one to three choices from transferableStrengths.',
        '   - globalRevision.rewriteDirection: the stages the rewrite needs, in order, as numbered steps one per line, each saying what to write in plain words. Cite supporting genre_excerpts ids in supportingExcerptIds where they teach the stage.',
        '   - globalRevision.guidedQuestion: one question about the whole submission that helps the student see what the genre asks.',
        '   - globalRevision.rewriteGoal: one revision goal to rewrite the text as the target genre, with an action naming the first stage to write, a guidedQuestion about the whole submission, and questionScope "whole". It must not repeat globalRevision.guidedQuestion.'
    ];
```

and in the returned array replace `...(mode === 'global_revision' ? globalMethod : standardMethod),` with `...method,` and `...(mode === 'global_revision' ? [`<worked_example_global>…`] : []),` with the unconditional `` `<worked_example_global>\n${WRITER_GLOBAL_EXAMPLE}\n</worked_example_global>`, ``.

In `generate` step 7, change the comment to "the writer produces standard and rewrite content in one call, whatever the gate decides; the question gate (D-153) gives it one corrective retry when a goal or the rewrite goal lacks a valid question", call `buildWritingFeedbackSystemPrompt(input.assignment)`, and make the inspector:

```ts
                (parsed) => [
                    ...validateSocraticQuestions(parsed.revisionGoals ?? [], parsed.globalRevision ?? null),
                    ...validateRewriteGoal(parsed.globalRevision?.rewriteGoal)
                ]
```

(import `validateRewriteGoal` beside `validateSocraticQuestions`). Step 3's comment becomes "Step 3: the gate is code, so staff can predict it. It selects what is shown, not what is written."

In `deterministicFeedback`, add to `globalRevision`:

```ts
            rewriteGoal: {
                skillTag: profileGenreId,
                goal: 'Rewrite the draft so it does the work of the target genre.',
                action: 'Write the first stage of the genre before anything else.',
                guidedQuestion: 'Which section should your reader meet first, and what should it tell them?',
                questionScope: 'whole' as const
            }
```

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

```ts
describe('resolveRewriteGoal', () => {
    const rewriteGoal = { skillTag: 'descriptive_report', goal: 'REWRITE', action: 'a', guidedQuestion: 'q?', questionScope: 'whole' as const };
    const standardGoal = { skillTag: 'theme', goal: 'STANDARD', action: 'a' };

    it('uses the stored rewrite goal whatever the gate decided', () => {
        expect(resolveRewriteGoal({ gateDecision: 'standard', revisionGoals: [standardGoal] }, { rewriteGoal })?.goal).toBe('REWRITE');
        expect(resolveRewriteGoal({ gateDecision: 'global_revision', revisionGoals: [standardGoal] }, { rewriteGoal })?.goal).toBe('REWRITE');
    });

    it('falls back to the first goal of a legacy rewrite-gated run', () => {
        expect(resolveRewriteGoal({ gateDecision: 'global_revision', revisionGoals: [standardGoal] }, {})?.goal).toBe('STANDARD');
    });

    it('never presents a legacy standard run\'s goal as a rewrite goal', () => {
        expect(resolveRewriteGoal({ gateDecision: 'standard', revisionGoals: [standardGoal] }, {})).toBeUndefined();
        expect(resolveRewriteGoal({ revisionGoals: [standardGoal] }, undefined)).toBeUndefined();
    });
});
```

`writing-feedback-report-global.test.ts`, new describe:

```ts
describe('rewrite goal from the rewrite block (2026-10-13)', () => {
    const rewriteGoal = { skillTag: 'descriptive_report', goal: 'REWRITEGOALMARKER rewrite as a report.', action: 'Start with a definition.', guidedQuestion: 'Which types will your reader need?', questionScope: 'whole' as const };

    it('prints the stored rewrite goal when staff force rewrite on a standard run', async () => {
        const standardRun = { ...feedback({ skillTag: 'theme', goal: 'STANDARDGOALMARKER improve theme.', action: 'Move the entity.' }), gateDecision: 'standard' as const };
        const text = searchableText(await service.render({ assignment, submission, feedback: standardRun, mode: 'global_revision', globalRevision: { ...globalRevision, rewriteGoal } }));
        expect(text).toContain('REWRITEGOALMARKER');
        expect(text).not.toContain('STANDARDGOALMARKER');
    });

    it('prints the standard goals, not the rewrite goal, when staff switch a rewrite-gated run to standard', async () => {
        const gatedRun = { ...feedback({ skillTag: 'classify', goal: 'STANDARDGOALMARKER add the types.', action: 'Name the three types.' }), gateDecision: 'global_revision' as const };
        const text = searchableText(await service.render({ assignment, submission, feedback: gatedRun, mode: 'standard', globalRevision: { ...globalRevision, rewriteGoal } }));
        expect(text).toContain('STANDARDGOALMARKER');
        expect(text).toContain('EXPLANATIONMARKER');
        expect(text).not.toContain('REWRITEGOALMARKER');
        expect(text).not.toContain('What to do next: rewrite');
    });
});
```

`rewrite-question-clear.test.ts` (it already builds runs and calls `resolveStudentView`): add a case where the stored `result.globalRevision` has `rewriteGoal` and the latest review's `summaryEdits[0].globalRevision` edits `diagnosisStatement`; assert `resolveStudentView(run, submission, []).globalRevision?.rewriteGoal?.goal` equals the stored goal and `diagnosisStatement` equals the staff edit.

`summary-sources.test.ts`: add a case that a redraft of a run whose `result.globalRevision.rewriteGoal` is set keeps it on the redraft result (use the file's existing redraft builder; assert `redraft.result.globalRevision?.rewriteGoal` deep-equals the original).

- [ ] **Step 2: Run to see them fail**

Run: `npx jest src/writing-feedback/__tests__/feedback-gate.test.ts src/report-generation/__tests__/writing-feedback-report-global.test.ts src/writing-feedback/__tests__/rewrite-question-clear.test.ts src/writing-feedback/__tests__/summary-sources.test.ts --maxWorkers=4`
Expected: `resolveRewriteGoal` not exported; the forced-rewrite PDF lacks `REWRITEGOALMARKER`. The merge and redraft cases may already pass — they pin behaviour the change relies on; keep them.

- [ ] **Step 3: Implement**

`feedback-gate.ts` (import `GlobalRevision`, `RevisionGoal`, `WritingFeedbackResult` types from `./contracts`):

```ts
/**
 * resolveRewriteGoal - the one goal printed with rewrite feedback.
 *
 * New runs store it on the rewrite block, so staff can switch any submission to rewrite
 * feedback. Runs stored before that wrote it as the first goal only when gated to
 * rewrite; a standard run's first goal is about local revision and is never shown as one.
 *
 * @param feedback - Student-facing result (staff edits applied)
 * @param globalRevision - Resolved rewrite block, if any
 * @returns The rewrite goal, or undefined when the run has none
 */
export function resolveRewriteGoal(
    feedback: Pick<WritingFeedbackResult, 'gateDecision' | 'revisionGoals'>,
    globalRevision?: Pick<GlobalRevision, 'rewriteGoal'>
): RevisionGoal | undefined {
    if (globalRevision?.rewriteGoal) return globalRevision.rewriteGoal;
    return feedback.gateDecision === 'global_revision' ? feedback.revisionGoals[0] : undefined;
}
```

`writing-feedback-report.ts`, replace lines 272-277 (the comment and the `if (feedback.gateDecision === 'global_revision')` block) with:

```ts
    // The rewrite goal comes from the rewrite block on new runs, or from a legacy rewrite-gated
    // run's first goal; a standard goal is never shown as one. Its question is left off when
    // the block already asks one, so the student reads it once.
    const rewriteGoal = resolveRewriteGoal(feedback, globalRevision);
    if (rewriteGoal) renderRevisionGoals(doc, [blockQuestion ? { ...rewriteGoal, guidedQuestion: undefined } : rewriteGoal]);
```

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

```ts
    it('does not redraft a new rewrite-gated run: its standard content is already stored', () => {
        const run = { gateDecision: 'global_revision' as const, result: { globalRevision: { rewriteGoal: { goal: 'g' } } } };
        expect(needsModeRedraft(run, 'standard')).toBe(false);
    });

    it('still redrafts a legacy rewrite-gated run with no rewrite goal', () => {
        expect(needsModeRedraft({ gateDecision: 'global_revision', result: { globalRevision: {} } }, 'standard')).toBe(true);
    });
```

`writing-feedback-diagnosis-model.test.ts` (import `rewriteGoalFor`; reuse the file's run builder, adding `result` fields as needed):

```ts
describe('rewriteGoalFor', () => {
    const goal = { skillTag: 'descriptive_report', goal: 'REWRITE', action: 'a', guidedQuestion: 'q?', questionScope: 'whole' as const };

    it('reads the stored rewrite goal on any run', () => {
        const run = { gateDecision: 'standard', result: { revisionGoals: [{ skillTag: 's', goal: 'STANDARD' }], globalRevision: { diagnosisStatement: 'd', whatToKeep: [], rewriteDirection: 'r', rewriteGoal: goal } } } as unknown as FeedbackRun;
        expect(rewriteGoalFor(run)?.goal).toBe('REWRITE');
    });

    it('falls back to the first goal only on a legacy rewrite-gated run', () => {
        const legacy = { gateDecision: 'global_revision', result: { revisionGoals: [{ skillTag: 's', goal: 'FIRST' }] } } as unknown as FeedbackRun;
        const standard = { gateDecision: 'standard', result: { revisionGoals: [{ skillTag: 's', goal: 'FIRST' }] } } as unknown as FeedbackRun;
        expect(rewriteGoalFor(legacy)?.goal).toBe('FIRST');
        expect(rewriteGoalFor(standard)).toBeUndefined();
    });
});
```

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

```ts
/**
 * needsModeRedraft - whether switching to standard feedback needs a writing-lens redraft.
 *
 * New runs store standard feedback whatever the gate decided, so the switch is instant.
 * Only a rewrite-gated run stored before that (no rewrite goal on its rewrite block)
 * lacks standard content; it is redrafted once, and the redraft's `redraftOfRunId`
 * marks the summary as already standard.
 *
 * @param run - Latest writing-lens run
 * @param mode - Effective mode on screen
 * @returns True only for a legacy rewrite-gated run shown in standard mode
 */
export function needsModeRedraft(
    run: { gateDecision?: 'standard' | 'global_revision'; redraftOfRunId?: string; result?: { globalRevision?: { rewriteGoal?: unknown } } },
    mode: 'standard' | 'global_revision'
): boolean {
    return run.gateDecision === 'global_revision' && mode === 'standard' && !run.redraftOfRunId && !run.result?.globalRevision?.rewriteGoal;
}
```

`writing-feedback-diagnosis-model.ts`, after `resolvedMode`:

```ts
/**
 * rewriteGoalFor - the rewrite goal the student receives in rewrite mode.
 *
 * Mirrors the server's `resolveRewriteGoal`: the stored rewrite goal, else a legacy
 * rewrite-gated run's first goal; a standard run's goal is never shown as one.
 *
 * @param run - Latest writing-lens run
 * @returns The rewrite goal, or undefined
 */
export function rewriteGoalFor(run: FeedbackRun): FeedbackRun['result']['revisionGoals'][number] | undefined {
    if (run.result.globalRevision?.rewriteGoal) return run.result.globalRevision.rewriteGoal;
    return (run.gateDecision ?? run.result.gateDecision) === 'global_revision' ? run.result.revisionGoals[0] : undefined;
}
```

(If `FeedbackRun['result']` has no `globalRevision` field in the frontend type, add `globalRevision?: GlobalRevision;` beside `revisionGoals` in `writing-feedback-shared.ts`.)

`writing-feedback-diagnosis.ts`, after `renderGlobalRevisionEditor`:

```ts
/**
 * renderRewriteGoal - read-only view of the goal the student gets with rewrite feedback.
 *
 * @param goal - From rewriteGoalFor
 * @returns Field-styled block matching the rewrite editor
 */
export function renderRewriteGoal(goal: { goal: string; action?: string; guidedQuestion?: string }): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'wf-field wf-field--wide';
    wrapper.append(createText('h4', 'Rewrite goal'), createText('p', goal.goal));
    if (goal.action) wrapper.append(createText('p', `Next step: ${goal.action}`));
    if (goal.guidedQuestion) wrapper.append(createText('p', `Ask yourself: ${goal.guidedQuestion}`));
    return wrapper;
}
```

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

```ts
describe('bothModes', () => {
    const goals = [{ skillTag: 'identify', goal: 'Define sound.', action: 'Name its class.', guidedQuestion: 'What group of things does sound belong to?', questionScope: 'whole' }];
    const block = { diagnosisStatement: 'd', whatToKeep: [], rewriteDirection: 'r', guidedQuestion: 'What does your reader need first?' };
    const rewriteGoal = { skillTag: 'descriptive_report', goal: 'Rewrite.', action: 'Start with a definition.', guidedQuestion: 'Which types will your reader need?', questionScope: 'whole' };

    it('passes when standard goals and a complete rewrite block are stored', () => {
        const checks = byName({ verifiedText: text, result: { gateDecision: 'standard', revisionGoals: goals, globalRevision: { ...block, rewriteGoal } } });
        expect(checks.bothModes.status).toBe('pass');
    });

    it('fails a run without a rewrite goal, whatever its gate decision', () => {
        const checks = byName({ verifiedText: text, result: { gateDecision: 'standard', revisionGoals: goals, globalRevision: block } });
        expect(checks.bothModes.status).toBe('fail');
    });

    it('fails a run with no standard goals', () => {
        const checks = byName({ verifiedText: text, result: { gateDecision: 'global_revision', revisionGoals: [], globalRevision: { ...block, rewriteGoal } } });
        expect(checks.bothModes.status).toBe('fail');
    });
});
```

Existing tests in this file that build a `globalRevision` and assert `socraticQuestions` on a **standard** run may now see the block checked too; give such fixtures a valid `guidedQuestion` rather than relaxing the check.

- [ ] **Step 2: Run to see them fail**

Run: `npx jest src/writing-feedback/__tests__/eval-checks.test.ts --maxWorkers=4`
Expected: FAIL — no `bothModes` check.

- [ ] **Step 3: Implement**

`eval-checks.ts`:
- In `EvalRunOutput.result.globalRevision` add `rewriteGoal?: { skillTag?: string; goal?: string; action?: string; guidedQuestion?: string; questionScope?: string }`.
- Both blocks are stored and either may reach the student, so lint and question-check them on every run. Replace the `plainLanguage` input's conditional spread with an unconditional one and lint the rewrite goal with the goals:

```ts
    const rewriteGoal = result.globalRevision?.rewriteGoal;
    const plain = lintFeedbackProse({
        criteria: (result.criteria ?? []).map((criterion) => ({ explanation: criterion.explanation, evidence: criterion.evidence ?? [] })),
        strengths: result.strengths ?? [],
        revisionGoals: [...goals, ...(rewriteGoal ? [rewriteGoal] : [])].map((goal) => ({ goal: goal.goal ?? '', action: goal.action, guidedQuestion: goal.guidedQuestion })),
        ...(result.globalRevision ? { globalRevision: result.globalRevision } : {})
    }, knownTerms);
    // Every goal needs a scoped question, and so does the rewrite block (D-153); both are stored on every run.
    const socraticProblems = validateSocraticQuestions(goals, result.globalRevision ?? null);
    const rewriteGoalProblems = validateRewriteGoal(rewriteGoal);
```

- Add the check after `socraticQuestions`:

```ts
        check(
            'bothModes',
            true,
            goals.length > 0 && Boolean(result.globalRevision) && rewriteGoalProblems.length === 0,
            rewriteGoalProblems.join('; ') || `${goals.length} standard goals and a rewrite goal`
        ),
```

`eval-fixtures.ts`: change `dr-missing-classification`'s expectation to the new behaviour (definition present, classification missing — two of three required stages fail, under 75%):

```ts
        expect: { mode: 'standard', stageStatuses: { identify: 'present', classify: 'missing' }, firstGoalAddressesStage: 'classify' }
```

and append:

```ts
    {
        id: 'dr-mostly-missing',
        materials: 'lecture-notes',
        text: 'Batteries. Batteries are in a lot of things we use every day. My phone battery always runs out too fast. Some people say you should not charge your phone overnight. I think batteries will get better in the future because companies are working on it.',
        expect: { mode: 'global_revision' }
    }
```

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

```bash
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p public/tsconfig.json
npx jest --maxWorkers=4
npm run build
git diff --check
```

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
