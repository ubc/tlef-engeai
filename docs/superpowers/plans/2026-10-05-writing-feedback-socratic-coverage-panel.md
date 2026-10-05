# Writing Feedback Socratic Questions, Coverage Cleanup and Review-Panel Polish Implementation Plan

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

```ts
/**
 * @fileoverview Socratic question rules and the one-retry gate (D-153).
 */
import { SanitizedJobError } from '../job-runner';
import {
    SOCRATIC_QUESTIONS_FAILED_MESSAGE,
    validateSocraticQuestions,
    withQuestionGate
} from '../socratic-questions';

const whole = { guidedQuestion: 'Who will read your report, and what do they need first?', questionScope: 'whole' };
const part = { guidedQuestion: 'In your first sentence, what makes renewable energy different?', questionScope: 'part' };

describe('validateSocraticQuestions', () => {
    it('accepts one whole and one part question', () => {
        expect(validateSocraticQuestions([whole, part])).toEqual([]);
    });

    it('requires a question and a scope on every goal', () => {
        expect(validateSocraticQuestions([whole, { guidedQuestion: null, questionScope: 'part' }]))
            .toContain('Goal 2 has no guidedQuestion.');
        expect(validateSocraticQuestions([whole, { guidedQuestion: part.guidedQuestion }]))
            .toContain('Goal 2 has no questionScope ("whole" or "part").');
    });

    it('requires at least one whole-submission question', () => {
        expect(validateSocraticQuestions([part])).toContain('At least one goal needs a question about the whole submission (questionScope "whole").');
    });

    it('rejects yes/no openers in any case, and questions without a question mark', () => {
        expect(validateSocraticQuestions([whole, { guidedQuestion: 'is your definition clear?', questionScope: 'part' }]))
            .toContain('Goal 2 asks a yes/no question; ask what, which, how or why instead.');
        expect(validateSocraticQuestions([whole, { guidedQuestion: 'Did you forget the closing?', questionScope: 'part' }]))
            .toContain('Goal 2 asks a yes/no question; ask what, which, how or why instead.');
        expect(validateSocraticQuestions([{ ...whole, guidedQuestion: 'Think about your reader.' }]))
            .toContain('Goal 1 question must end with a question mark.');
    });

    it('accepts a question mark followed by a closing quote or spaces', () => {
        expect(validateSocraticQuestions([{ ...whole, guidedQuestion: 'What does "first?" ' }])).toEqual([]);
        expect(validateSocraticQuestions([{ ...whole, guidedQuestion: 'What does your reader need first?"' }])).toEqual([]);
    });

    it('requires the rewrite block question when a rewrite block is present', () => {
        expect(validateSocraticQuestions([whole], { guidedQuestion: '' })).toContain('globalRevision has no guidedQuestion.');
        expect(validateSocraticQuestions([whole], { guidedQuestion: 'Did it work?' }))
            .toContain('globalRevision asks a yes/no question; ask what, which, how or why instead.');
        expect(validateSocraticQuestions([whole], { guidedQuestion: 'What does your reader need to know first?' })).toEqual([]);
    });
});

describe('withQuestionGate', () => {
    it('returns the first valid attempt without retrying', async () => {
        const attempt = jest.fn(async () => 'ok');
        await expect(withQuestionGate(attempt, () => [])).resolves.toBe('ok');
        expect(attempt).toHaveBeenCalledTimes(1);
        expect(attempt).toHaveBeenCalledWith(undefined);
    });

    it('retries once with the problems as a correction', async () => {
        const attempt = jest.fn(async (correction?: string) => (correction ? 'fixed' : 'broken'));
        const result = await withQuestionGate(attempt, (value) => (value === 'broken' ? ['Goal 1 has no guidedQuestion.'] : []));
        expect(result).toBe('fixed');
        expect(attempt).toHaveBeenCalledTimes(2);
        expect(attempt.mock.calls[1][0]).toContain('Goal 1 has no guidedQuestion.');
    });

    it('fails with the fixed, prose-free message after a second invalid reply', async () => {
        const attempt = jest.fn(async () => 'model prose that must not leak');
        const failure = withQuestionGate(attempt, () => ['Goal 1 has no guidedQuestion.']);
        await expect(failure).rejects.toBeInstanceOf(SanitizedJobError);
        await expect(withQuestionGate(attempt, () => ['x'])).rejects.toThrow(SOCRATIC_QUESTIONS_FAILED_MESSAGE);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/writing-feedback/__tests__/socratic-questions.test.ts --maxWorkers=4`
Expected: FAIL with "Cannot find module '../socratic-questions'"

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Socratic questions — rules every revision goal's question must meet (D-153)
 *
 * The questions let the student find the change themselves, which keeps the writing
 * theirs. A run needs one question per goal, at least one about the whole submission,
 * and none that a yes or no answers. The gate gives the model one corrective retry.
 *
 * @author: @rdschrs
 * @date: 2026-10-05
 * @version: 1.0.0
 * @description: Pure question validation plus a one-retry generation gate.
 */

import { SanitizedJobError } from './job-runner';

export type QuestionScope = 'whole' | 'part';

export const SOCRATIC_QUESTIONS_FAILED_MESSAGE = 'Feedback questions were incomplete; regenerate.';

const YES_NO_OPENER = /^(is|are|do|does|did|can|could|should|would|will|have|has)\b/i;
const ENDS_WITH_QUESTION = /\?["'”’)\s]*$/;

/** Problems with one question, labelled by where it sits. */
function questionProblems(label: string, question: string): string[] {
    const problems: string[] = [];
    if (YES_NO_OPENER.test(question.trim())) problems.push(`${label} asks a yes/no question; ask what, which, how or why instead.`);
    if (!ENDS_WITH_QUESTION.test(question)) problems.push(`${label} question must end with a question mark.`);
    return problems;
}

/**
 * validateSocraticQuestions - every rule a new run's questions must meet.
 *
 * @param goals - Revision goals as parsed from the model
 * @param globalRevision - Rewrite block, when the output has one
 * @returns Human-readable problems for the corrective retry; empty when valid. Never contains student text.
 */
export function validateSocraticQuestions(
    goals: Array<{ guidedQuestion?: string | null; questionScope?: string | null }>,
    globalRevision?: { guidedQuestion?: string | null } | null
): string[] {
    const problems: string[] = [];
    goals.forEach((goal, index) => {
        const label = `Goal ${index + 1}`;
        const question = goal.guidedQuestion?.trim();
        if (!question) problems.push(`${label} has no guidedQuestion.`);
        else problems.push(...questionProblems(label, question));
        if (goal.questionScope !== 'whole' && goal.questionScope !== 'part') {
            problems.push(`${label} has no questionScope ("whole" or "part").`);
        }
    });
    if (goals.length && !goals.some((goal) => goal.questionScope === 'whole')) {
        problems.push('At least one goal needs a question about the whole submission (questionScope "whole").');
    }
    if (globalRevision) {
        const question = globalRevision.guidedQuestion?.trim();
        if (!question) problems.push('globalRevision has no guidedQuestion.');
        else problems.push(...questionProblems('globalRevision', question));
    }
    return problems;
}

/**
 * withQuestionGate - one structured call, plus one corrective retry when questions fail.
 *
 * @param attempt - Makes the model call; receives the correction text on the retry
 * @param inspect - Returns the problems for a parsed reply
 * @returns The first reply with no problems
 * @throws SanitizedJobError with a fixed message when the retry still fails
 */
export async function withQuestionGate<T>(
    attempt: (correction?: string) => Promise<T>,
    inspect: (value: T) => string[]
): Promise<T> {
    const first = await attempt(undefined);
    const problems = inspect(first);
    if (!problems.length) return first;
    const correction = [
        'Your previous reply broke the question rules. Return the whole result again with these fixed:',
        ...problems.map((problem) => `- ${problem}`)
    ].join('\n');
    const second = await attempt(correction);
    if (inspect(second).length) throw new SanitizedJobError(SOCRATIC_QUESTIONS_FAILED_MESSAGE);
    return second;
}
```

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

```ts
describe('Socratic questions in the output schema (D-153)', () => {
    const rubric = sixCriterionRubric();
    const valid = () => {
        const result = feedbackFor(rubric) as WritingFeedbackResult & { revisionGoals: Array<Record<string, unknown>> };
        result.revisionGoals = [{ ...result.revisionGoals[0], questionScope: 'whole' }];
        result.globalRevision = { ...result.globalRevision!, guidedQuestion: 'What does your reader need to know first?' };
        return result;
    };

    it('accepts a goal with a question and a scope, and a rewrite block with a question', () => {
        expect(buildFeedbackSchema(rubric).safeParse(valid()).success).toBe(true);
    });

    it('rejects a goal without a guidedQuestion', () => {
        const result = valid();
        delete (result.revisionGoals[0] as { guidedQuestion?: string }).guidedQuestion;
        expect(buildFeedbackSchema(rubric).safeParse(result).success).toBe(false);
    });

    it('rejects a goal without a questionScope or with an unknown scope', () => {
        const missing = valid();
        delete (missing.revisionGoals[0] as { questionScope?: string }).questionScope;
        expect(buildFeedbackSchema(rubric).safeParse(missing).success).toBe(false);
        const unknown = valid();
        (unknown.revisionGoals[0] as { questionScope?: string }).questionScope = 'paragraph';
        expect(buildFeedbackSchema(rubric).safeParse(unknown).success).toBe(false);
    });

    it('rejects a rewrite block without a guidedQuestion', () => {
        const result = valid();
        delete (result.globalRevision as { guidedQuestion?: string }).guidedQuestion;
        expect(buildFeedbackSchema(rubric).safeParse(result).success).toBe(false);
    });

    it('requires the question and scope in a summary redraft too', () => {
        const redraft = {
            criteria: rubric.criteria.map((criterion) => ({ criterion: criterion.id, suggestedLevel: rubric.levels[0].id, explanation: 'e', confidence: 0.5 })),
            strengths: [],
            revisionGoals: [{ skillTag: 'x', goal: 'g', action: 'a', guidedQuestion: 'What does your reader need first?' }]
        };
        expect(buildSummaryRedraftSchema(rubric).safeParse(redraft).success).toBe(false);
        redraft.revisionGoals[0] = { ...redraft.revisionGoals[0], questionScope: 'whole' } as typeof redraft.revisionGoals[0];
        expect(buildSummaryRedraftSchema(rubric).safeParse(redraft).success).toBe(true);
    });
});
```

Then update the existing `feedbackFor` helper at the top of the file so its goal carries `questionScope: 'whole'` and its `globalRevision` carries `guidedQuestion: 'What does a reader need to know first?'`, so the earlier tests keep passing.

Append to `summary-edits.test.ts`:

```ts
it('accepts and keeps a staff-edited rewrite question', () => {
    const parsed = parseSummaryEditsFixture({ guidedQuestion: 'What should your first sentence tell the reader?' });
    expect(parsed[0].globalRevision?.guidedQuestion).toBe('What should your first sentence tell the reader?');
});
```

Use the file's existing builder for a valid edit payload (search the file for the helper that builds a linguistic edit with `globalRevision`; name it `parseSummaryEditsFixture` only if none exists, implemented as a call to the exported parse function with that payload plus the extra field).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/writing-feedback/__tests__/feedback-schema.test.ts src/writing-feedback/__tests__/summary-edits.test.ts --maxWorkers=4`
Expected: FAIL — the "rejects … without …" cases pass validation today.

- [ ] **Step 3: Implement**

`feedback-schema.ts`:

```ts
const revisionGoalSchema = z.object({
    skillTag: z.string().min(1),
    goal: z.string().min(1),
    // A concrete step, required on every new goal: students ranked actionability second.
    action: z.string().min(1),
    // Required (D-153): the Socratic question lets the student find the change themselves.
    guidedQuestion: z.string().min(1),
    // Staff-only: whether the question is about the whole submission or one part of it.
    questionScope: z.enum(['whole', 'part'])
});

const globalRevisionSchema = z.object({
    diagnosisStatement: z.string().min(1).max(1500),
    whatToKeep: z.array(z.string().min(1).max(300)).max(3),
    rewriteDirection: z.string().min(1).max(1500),
    // Required (D-153): one question about the whole submission.
    guidedQuestion: z.string().min(1).max(400),
    supportingExcerptIds: z.array(z.string().trim().min(1).max(40)).max(3).nullish()
});
```

`contracts.ts`:

```ts
import type { QuestionScope } from './socratic-questions';
export type { QuestionScope } from './socratic-questions';

export interface RevisionGoal {
    skillTag: string; // stable pedagogical category for staff scanning; a stage id when it addresses a stage
    goal: string; // concise revision outcome
    /** Concrete step the student takes. Required on new runs; absent on runs stored before it existed. */
    action?: string;
    /** Socratic question. Required on new runs (D-153); absent on some runs stored before it. */
    guidedQuestion?: string;
    /** Staff-only: whole-submission or part question. Required on new runs; never printed. */
    questionScope?: QuestionScope;
}

export interface GlobalRevision {
    diagnosisStatement: string;
    whatToKeep: string[];
    rewriteDirection: string;
    /** Whole-submission Socratic question. Required on new runs (D-153). */
    guidedQuestion?: string;
    supportingExcerptIds?: string[];
}
```

and `StaffSummaryEdit.globalRevision?: Pick<GlobalRevision, 'diagnosisStatement' | 'whatToKeep' | 'rewriteDirection' | 'guidedQuestion'>;`

If importing from `socratic-questions.ts` into `contracts.ts` creates a cycle (`socratic-questions` → `job-runner` → `contracts`), instead declare `export type QuestionScope = 'whole' | 'part';` in `contracts.ts` and have `socratic-questions.ts` import it from there.

`summary-edits.ts`:

```ts
    globalRevision: z.object({
        diagnosisStatement: z.string().trim().min(1).max(1500),
        whatToKeep: z.array(z.string().trim().min(1).max(300)).max(3),
        rewriteDirection: z.string().trim().min(1).max(1500),
        guidedQuestion: z.string().trim().min(1).max(400).optional()
    }).optional()
```

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

```ts
export const SOCRATIC_QUESTION_RULES = [
    'Questions (required): every revision goal has exactly one guidedQuestion and a questionScope.',
    'The question helps the student find the change themselves, so the writing stays theirs. It sits beside the action; it does not replace it.',
    'questionScope "whole": a question about the whole submission — its purpose, its reader, or how it moves from stage to stage. At least one goal must have one.',
    'questionScope "part": a question about the one stage or passage the goal addresses. Name the stage or quote a few of the student\'s own words.',
    'Never ask a yes/no question (no question starting with is, are, do, does, did, can, could, should, would, will, have, has). Ask what, which, how or why.',
    'Never put the answer in the question ("Did you forget to add a definition?"). Use the same plain words as the rest of the feedback.'
].join('\n');
```

- [ ] **Step 1: Write the failing tests**

In `feedback-engine-pipeline.test.ts`, change the `writer(...)` helper's goal to a valid default and add a parameter for overriding goals:

```ts
function writer(criteria: Array<{ id: string }>, levelId: string, excerptId: string | null, goals?: unknown[]) {
    return {
        // …criteria and strengths unchanged…
        revisionGoals: goals ?? [{ skillTag: 'identify', goal: 'Define sound formally.', action: 'Name the class sound belongs to.', guidedQuestion: 'What group of things does sound belong to?', questionScope: 'whole' }],
        internalFlags: [],
        globalRevision: { diagnosisStatement: 'The text explains a process.', whatToKeep: ['Sound'], rewriteDirection: 'Classify the types of sound.', guidedQuestion: 'What should your reader learn about sound first?', supportingExcerptIds: null }
    };
}
```

Add to the `describe('RubricWritingFeedbackEngine pipeline')` block:

```ts
it('retries the writer once when a goal has no question, sending the problems back', async () => {
    const levelId = assignment.rubric.levels[0].id;
    const criteria = modelAssessedCriteria(assignment.rubric);
    const base = fakeLlm('fits', () => null);
    let writerCalls = 0;
    const send = jest.fn(async (messages: Array<{ role: string; content: string }>, schema: unknown, options: { structuredOutputName: string }) => {
        if (options.structuredOutputName !== 'writing_feedback_v2') return base(messages, schema, options);
        writerCalls += 1;
        return { parsed: writerCalls === 1
            ? writer(criteria, levelId, null, [{ skillTag: 'identify', goal: 'g', action: 'a', guidedQuestion: null, questionScope: 'part' }])
            : writer(criteria, levelId, null) };
    });
    const generated = await new RubricWritingFeedbackEngine({ sendStructuredConversation: send } as unknown as LLMModule, new InMemoryMaterialRetriever())
        .generate({ assignment, verifiedText: text });
    expect(writerCalls).toBe(2);
    const retryMessages = send.mock.calls.filter((call) => call[2].structuredOutputName === 'writing_feedback_v2')[1][0];
    expect(retryMessages[retryMessages.length - 1].content).toContain('Goal 1 has no guidedQuestion.');
    expect(generated.revisionGoals[0].questionScope).toBe('whole');
});

it('fails with the fixed message when the retry still has no whole-submission question', async () => {
    const levelId = assignment.rubric.levels[0].id;
    const criteria = modelAssessedCriteria(assignment.rubric);
    const base = fakeLlm('fits', () => null);
    const send = jest.fn(async (messages: Array<{ content: string }>, schema: unknown, options: { structuredOutputName: string }) =>
        options.structuredOutputName === 'writing_feedback_v2'
            ? { parsed: writer(criteria, levelId, null, [{ skillTag: 'identify', goal: 'g', action: 'a', guidedQuestion: 'Which word names the class?', questionScope: 'part' }]) }
            : base(messages, schema, options));
    await expect(new RubricWritingFeedbackEngine({ sendStructuredConversation: send } as unknown as LLMModule, new InMemoryMaterialRetriever())
        .generate({ assignment, verifiedText: text })).rejects.toThrow('Feedback questions were incomplete; regenerate.');
});

it('mock mode emits one whole and one part question and a rewrite question', async () => {
    process.env.MOCK_RESPONSE = 'true';
    const generated = await new RubricWritingFeedbackEngine(undefined, new InMemoryMaterialRetriever()).generate({ assignment, verifiedText: text });
    expect(generated.revisionGoals.some((goal) => goal.questionScope === 'whole')).toBe(true);
    expect(generated.revisionGoals.every((goal) => goal.guidedQuestion?.endsWith('?'))).toBe(true);
    expect(generated.globalRevision?.guidedQuestion).toMatch(/\?$/);
});
```

In `prompt-contract.test.ts` add:

```ts
it('writer prompt requires a scoped Socratic question on every goal and the rewrite block', () => {
    const prompt = buildWritingFeedbackSystemPrompt(buildEvalAssignment());
    expect(prompt).toContain('every revision goal has exactly one guidedQuestion and a questionScope');
    expect(prompt).not.toContain('Add a guidedQuestion only when it genuinely helps');
    const global = buildWritingFeedbackSystemPrompt(buildEvalAssignment(), 'global_revision');
    expect(global).toContain('globalRevision.guidedQuestion');
});
```

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

```ts
        revisionGoals: generated.slice(0, 3).map((criterion, index) => ({
            skillTag: criterion.id,
            goal: `Revise the passage or section that most affects ${criterion.label}.`,
            action: `Revise the passage that most affects ${criterion.label}.`,
            guidedQuestion: index === 0
                ? 'Who will read your text, and what do they need to know first?'
                : `Which passage most affects ${criterion.label.toLowerCase()}, and what would make it clearer for your reader?`,
            questionScope: index === 0 ? 'whole' as const : 'part' as const
        })),
```

and `globalRevision` gains `guidedQuestion: 'What does the assignment ask your text to do, and what does your text do now?'`.
- Writer call: wrap it in the gate. Replace the `stripNulls((await this.llm!.sendStructuredConversation([...], schema, options)).parsed)` expression with:

```ts
            : await withQuestionGate(
                async (correction) => stripNulls((await this.llm!.sendStructuredConversation([
                    { role: 'system', content: buildWritingFeedbackSystemPrompt(input.assignment, gateDecision) },
                    { role: 'user', content: writerUserContent },
                    ...(correction ? [{ role: 'user' as const, content: correction }] : [])
                ], buildFeedbackSchema(input.assignment.rubric), { structuredOutputName: 'writing_feedback_v2', ...input.llmCallOptions })).parsed) as WritingFeedbackResult,
                (parsed) => validateSocraticQuestions(parsed.revisionGoals ?? [], parsed.globalRevision ?? null)
            );
```

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

```ts
describe('Socratic questions (D-153)', () => {
    it('requires a scoped question in the prompt', () => {
        const prompt = buildTechnicalFeedbackSystemPrompt(labAssignment());
        expect(prompt).toContain('every revision goal has exactly one guidedQuestion and a questionScope');
        expect(prompt).not.toContain('only when it genuinely helps the student think');
        expect(TECHNICAL_PROMPT_VERSION).toBe('lab-report-technical-v1.5.0');
    });

    it('retries once when no goal asks about the whole report', async () => {
        process.env.MOCK_RESPONSE = 'true';
        const good = await new TechnicalWritingFeedbackEngine().generate({ assignment: labAssignment(), verifiedText });
        const bad = { ...good, revisionGoals: good.revisionGoals.map((goal) => ({ ...goal, questionScope: 'part' as const })) };
        process.env.MOCK_RESPONSE = 'false';
        const llm = { sendStructuredConversation: jest.fn()
            .mockResolvedValueOnce({ parsed: bad })
            .mockResolvedValueOnce({ parsed: good }) };
        const result = await new TechnicalWritingFeedbackEngine(llm as never).generate({ assignment: labAssignment(), verifiedText });
        expect(llm.sendStructuredConversation).toHaveBeenCalledTimes(2);
        expect(result.revisionGoals.some((goal) => goal.questionScope === 'whole')).toBe(true);
    });
});
```

Delete the existing test `'flags analysis terms for staff, naming terms only'` and `'does not flag calibration in technical feedback'` (the flag is removed in Task 10; deleting them here keeps this task green — Task 10 removes the code).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/writing-feedback/__tests__/technical-feedback-engine.test.ts --maxWorkers=4`
Expected: FAIL — prompt wording and version, single call.

- [ ] **Step 3: Implement**

- `TECHNICAL_PROMPT_VERSION = 'lab-report-technical-v1.5.0'`.
- Prompt line becomes `'Return one to three revision goals. Each has a concrete action, a guidedQuestion and a questionScope.'`, followed by `SOCRATIC_QUESTION_RULES`.
- Deterministic goals: index 0 `guidedQuestion: 'What should a reader understand about your results before anything else?', questionScope: 'whole'`; others `guidedQuestion: \`Which part of your report most affects ${criterion.label.toLowerCase()}, and what would a reader need there?\`, questionScope: 'part'`.
- Wrap the structured call:

```ts
        const parsedResult = await withQuestionGate(
            async (correction) => stripNulls((await this.llm!.sendStructuredConversation(
                [...messages, ...(correction ? [{ role: 'user' as const, content: correction }] : [])],
                buildFeedbackSchema(rubric, { requireGlobalRevision: false }),
                { structuredOutputName: 'lab_report_technical_feedback', ...input.llmCallOptions }
            )).parsed) as WritingFeedbackResult,
            (parsed) => validateSocraticQuestions(parsed.revisionGoals ?? [])
        );
```

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

```ts
it('retries once when a redrafted goal has a yes/no question', async () => {
    const value = input();
    const goodGoal = { skillTag: 'x', goal: 'New goal.', action: 'New step.', guidedQuestion: 'What does your reader need first?', questionScope: 'whole' };
    const criteria = value.rubric.criteria.map((criterion) => ({ criterion: criterion.id, suggestedLevel: value.rubric.levels[2].id, explanation: 'New.', confidence: 0.7 }));
    const llm = { sendStructuredConversation: jest.fn()
        .mockResolvedValueOnce({ parsed: { criteria, strengths: [], revisionGoals: [{ ...goodGoal, guidedQuestion: 'Is it clear?' }] } })
        .mockResolvedValueOnce({ parsed: { criteria, strengths: [], revisionGoals: [goodGoal] } }) };
    const previousMock = process.env.MOCK_RESPONSE;
    delete process.env.MOCK_RESPONSE;
    try {
        const output = await new LlmSummaryRedraftEngine(llm as never).redraft(value);
        expect(llm.sendStructuredConversation).toHaveBeenCalledTimes(2);
        expect(output.revisionGoals[0].guidedQuestion).toBe('What does your reader need first?');
    } finally {
        if (previousMock !== undefined) process.env.MOCK_RESPONSE = previousMock;
    }
});

it('requires scoped questions in the redraft prompt', () => {
    const prompt = buildSummaryRedraftSystemPrompt(input());
    expect(prompt).toContain('every revision goal has exactly one guidedQuestion and a questionScope');
    expect(prompt).not.toContain('only when it genuinely helps the student think');
});

it('mock fallback goal carries a whole-submission question', () => {
    const value = input();
    value.previousResult = { ...value.previousResult, revisionGoals: [] };
    expect(deterministicSummaryRedraft(value).revisionGoals[0]).toMatchObject({ questionScope: 'whole' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/writing-feedback/__tests__/summary-redraft-engine.test.ts --maxWorkers=4`
Expected: FAIL

- [ ] **Step 3: Implement**

- RULES line 54 becomes `'Return one to three revision goals. Each has a goal, a concrete action the student can take, a guidedQuestion and a questionScope.'`; insert `SOCRATIC_QUESTION_RULES` after the contract line in `buildSummaryRedraftSystemPrompt`.
- Fallback goal: `{ skillTag: 'revision', goal: 'Revise the annotated passages.', action: 'Start with the annotated passage that matters most.', guidedQuestion: 'Which annotated passage would change your reader\'s understanding most, and why?', questionScope: 'whole' }`.
- `redraft`:

```ts
        return withQuestionGate(
            async (correction) => stripNulls((await this.llm!.sendStructuredConversation(
                [...messages, ...(correction ? [{ role: 'user' as const, content: correction }] : [])],
                buildSummaryRedraftSchema(input.rubric),
                { structuredOutputName: 'writing_summary_redraft', ...input.llmCallOptions }
            )).parsed) as SummaryRedraftOutput,
            (parsed) => validateSocraticQuestions(parsed.revisionGoals ?? [])
        );
```

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

```ts
it('prints the rewrite question once, after How to rewrite', async () => {
    const text = await renderRewriteReportText({
        globalRevision: { diagnosisStatement: 'd', whatToKeep: [], rewriteDirection: 'r', guidedQuestion: 'What should your reader learn first?' },
        revisionGoals: [{ skillTag: 'rewrite', goal: 'Rewrite as a report.', action: 'Start with a definition.', guidedQuestion: 'What should your reader learn first?', questionScope: 'whole' }]
    });
    expect(text.match(/Ask yourself: What should your reader learn first\?/g)).toHaveLength(1);
    expect(text.indexOf('How to rewrite')).toBeLessThan(text.indexOf('Ask yourself:'));
});

it('still renders a legacy rewrite block with no question', async () => {
    const text = await renderRewriteReportText({
        globalRevision: { diagnosisStatement: 'd', whatToKeep: [], rewriteDirection: 'r' },
        revisionGoals: [{ skillTag: 'rewrite', goal: 'Rewrite as a report.' }]
    });
    expect(text).toContain('How to rewrite');
});
```

`renderRewriteReportText` is a local helper you add in that test file: build a gated (`gateDecision: 'global_revision'`) result with the given fields using the file's existing fixture builders, render it, and return the extracted text.

Plain-language test:

```ts
it('lints the rewrite question', () => {
    const report = lintFeedbackProse({ criteria: [], strengths: [], revisionGoals: [], globalRevision: { diagnosisStatement: 'Plain.', rewriteDirection: 'Plain.', guidedQuestion: 'How does the Theme work here?' } }, []);
    expect(report.bannedTerms).toContain('Theme');
});
```

Editor source guard (append to `writing-feedback-review-source.test.ts` or a new `src/writing-feedback/__tests__/rewrite-question-source.test.ts`):

```ts
import fs from 'fs';
import path from 'path';

const diagnosisSource = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', 'writing-feedback-diagnosis.ts'), 'utf8');

it('lets staff edit the rewrite question', () => {
    expect(diagnosisSource).toContain("field('wf-global-question', 'Question for the student'");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/report-generation src/writing-feedback/__tests__/plain-language.test.ts src/writing-feedback/__tests__/rewrite-question-source.test.ts --maxWorkers=4`
Expected: FAIL

- [ ] **Step 3: Implement**

- `GlobalRevisionDraft` adds `guidedQuestion: string;`. In `renderGlobalRevisionEditor`, append after the direction field: `field('wf-global-question', 'Question for the student', current.guidedQuestion, 2, (raw) => { current.guidedQuestion = raw; })`.
- Summary editor: the global-revision map types gain `guidedQuestion: string`; seed from `run.result.globalRevision?.guidedQuestion ?? ''`; when building the save payload (~line 258), include `...(global.guidedQuestion.trim() ? { guidedQuestion: global.guidedQuestion.trim() } : {})`.
- Report:

```ts
    sectionHeading(doc, 'How to rewrite');
    body(doc).text(globalRevision.rewriteDirection.trim(), { lineGap: 3 });
    if (globalRevision.guidedQuestion?.trim()) {
        body(doc).text(`Ask yourself: ${globalRevision.guidedQuestion.trim()}`, { lineGap: 3 });
    }
    // The rewrite goal's own question would repeat the block's question, so it is left off.
    if (feedback.gateDecision === 'global_revision') {
        renderRevisionGoals(doc, feedback.revisionGoals.slice(0, 1).map((goal) =>
            globalRevision.guidedQuestion?.trim() ? { ...goal, guidedQuestion: undefined } : goal));
    }
```

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

```ts
describe('socraticQuestions check', () => {
    const fixture = EVAL_FIXTURES.find((item) => item.id === 'dr-good')!;
    const output = (goals: unknown[], globalRevision?: unknown) => ({
        verifiedText: fixture.text,
        result: { gateDecision: 'standard', criteria: [], strengths: [], revisionGoals: goals, ...(globalRevision ? { globalRevision } : {}) }
    }) as never;
    const status = (value: never) => runEvalChecks(value, fixture).find((item) => item.name === 'socraticQuestions')!.status;

    it('passes with a whole and a part question', () => {
        expect(status(output([
            { goal: 'g', guidedQuestion: 'Who reads your report, and what do they need first?', questionScope: 'whole' },
            { goal: 'g', guidedQuestion: 'Which word in your first sentence names the class?', questionScope: 'part' }
        ]))).toBe('pass');
    });

    it('fails when a goal has no question or none is about the whole text', () => {
        expect(status(output([{ goal: 'g', questionScope: 'whole' }]))).toBe('fail');
        expect(status(output([{ goal: 'g', guidedQuestion: 'Which word names the class?', questionScope: 'part' }]))).toBe('fail');
    });

    it('fails a rewrite run whose rewrite block has no question', () => {
        const rewrite = { ...output([{ goal: 'g', guidedQuestion: 'What does your reader need first?', questionScope: 'whole' }], { diagnosisStatement: 'd', rewriteDirection: 'r' }) } as { result: { gateDecision: string } };
        rewrite.result.gateDecision = 'global_revision';
        expect(status(rewrite as never)).toBe('fail');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/writing-feedback/__tests__/eval-checks.test.ts --maxWorkers=4`
Expected: FAIL — no `socraticQuestions` check.

- [ ] **Step 3: Implement**

Extend `EvalRunOutput.result.revisionGoals` items with `questionScope?: string` and `globalRevision` with `guidedQuestion?: string`. Add after the `plainLanguage` check:

```ts
        ((): EvalCheckResult => {
            const problems = validateSocraticQuestions(goals, mode === 'global_revision' ? (result.globalRevision ?? {}) : null);
            return check('socraticQuestions', goals.length > 0, problems.length === 0, problems.join('; ') || `${goals.length} goals, all with questions`);
        })(),
```

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

```ts
const MOCK_TASK = 'Write a descriptive report (250–350 words) that classifies an everyday engineering or scientific entity into its main types, or breaks it into its main parts.';
const MOCK_STAGES = ['General statement', 'Classification', 'Description', 'Closing'];

describe('isTeachableRequirement', () => {
    it.each([
        'Use 250–350 words.',
        'Length: 1–2 pages',
        'Submit as a .docx file',
        'Due Friday at 11:59 pm',
        'No outside sources required.',
        'Drafted individually in class, typed afterwards.'
    ])('drops logistics: %s', (requirement) => {
        expect(isTeachableRequirement(requirement, MOCK_STAGES, MOCK_TASK)).toBe(false);
    });

    it('drops a requirement that repeats two or more stages', () => {
        expect(isTeachableRequirement('Include a general statement, classification, and description.', MOCK_STAGES, MOCK_TASK)).toBe(false);
    });

    it('drops a restatement of the task', () => {
        expect(isTeachableRequirement('Classify an everyday engineering or scientific entity into its main types or break it into its main parts.', MOCK_STAGES, MOCK_TASK)).toBe(false);
    });

    it('keeps a real skill requirement', () => {
        expect(isTeachableRequirement('Use at least two sources to support each type', MOCK_STAGES, MOCK_TASK)).toBe(true);
        expect(isTeachableRequirement('Include a title that names the entity.', MOCK_STAGES, MOCK_TASK)).toBe(true);
    });
});

describe('genre language functions', () => {
    it('drops functions that repeat a stage and uses readable labels', () => {
        const needs = buildGenreNeeds(assignment).filter((need) => need.kind === 'language_function');
        const labels = needs.map((need) => need.label);
        expect(labels).not.toContain('Defining the entity'); // eval stages include a General statement
        expect(labels).not.toContain('Classifying or naming parts'); // eval stages include Classification or composition
        expect(labels).toEqual(['Sentence openings that guide the reader', 'Building precise noun phrases', 'Objective stance']);
        labels.forEach((label) => expect(label).not.toMatch(/\b(theme|rheme|noun group|thematic)\b/i));
    });

    it('gives a custom genre the default list', () => {
        const custom = buildEvalAssignment();
        custom.rubric = { ...custom.rubric, sflContext: { ...custom.rubric.sflContext!, genreId: 'custom_memo' as never, stages: [] } };
        expect(buildGenreNeeds(custom).filter((need) => need.kind === 'language_function').map((need) => need.label))
            .toEqual(['Sentence openings that guide the reader', 'Linking ideas across sentences', 'Objective stance']);
    });
});
```

(Import `isTeachableRequirement` alongside the existing imports.)

In `material-coverage.test.ts`:

```ts
it('treats coverage cached before the needs version as out of date', () => {
    const old = { rubricVersion: 2, materialFingerprint: 'f', computedAt: new Date(), rows: [] };
    expect(isCoverageCurrent(old, 2, 'f')).toBe(false);
    expect(isCoverageCurrent({ ...old, needsVersion: COVERAGE_NEEDS_VERSION }, 2, 'f')).toBe(true);
});
```

Update any existing `isCoverageCurrent(...) === true` assertion in that file to include `needsVersion: COVERAGE_NEEDS_VERSION` on the coverage object.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/writing-feedback/__tests__/course-material-needs.test.ts src/writing-feedback/__tests__/material-coverage.test.ts --maxWorkers=4`
Expected: FAIL

- [ ] **Step 3: Implement**

In `course-material-mentions.ts`, replace `LANGUAGE_FUNCTION_QUERIES` with:

```ts
/** A language skill course materials might teach, offered only for the genres that use it. */
export interface LanguageFunctionNeed {
    key: string;
    label: string; // staff-facing and readable; no SFL theory names
    query: string; // retrieval wording; may keep technical words that course notes use
    /** Dropped when an approved stage label matches: the stage row already covers it. */
    overlapsStage?: RegExp;
}

const SENTENCE_OPENINGS: LanguageFunctionNeed = { key: 'theme', label: 'Sentence openings that guide the reader', query: 'theme rheme point of departure thematic progression information flow' };
const LINKING: LanguageFunctionNeed = { key: 'cohesion', label: 'Linking ideas across sentences', query: 'cohesion linking words reference connecting sentences' };
const OBJECTIVE_STANCE: LanguageFunctionNeed = { key: 'stance', label: 'Objective stance', query: 'objective impersonal academic tone avoiding personal opinion' };

export const GENRE_LANGUAGE_FUNCTIONS: Record<WritingFoundedGenreId | 'default', LanguageFunctionNeed[]> = {
    descriptive_report: [
        { key: 'definition', label: 'Defining the entity', query: 'formal definition term class distinguishing features', overlapsStage: /general statement|definition|identif/i },
        { key: 'classification', label: 'Classifying or naming parts', query: 'classification types subtypes composition parts of an entity', overlapsStage: /classif|composition|parts/i },
        SENTENCE_OPENINGS,
        { key: 'noun_groups', label: 'Building precise noun phrases', query: 'noun group expanded noun phrase modifier qualifier' },
        OBJECTIVE_STANCE
    ],
    data_commentary: [
        { key: 'trends', label: 'Describing trends and comparisons', query: 'describing trends comparisons figures tables data' },
        { key: 'data_claims', label: 'Linking data to claims', query: 'interpreting data linking evidence to claims location statement' },
        { key: 'hedging', label: 'Matching claims to the evidence', query: 'hedging modality qualifying claims tentative language' },
        SENTENCE_OPENINGS
    ],
    problem_solution: [
        { key: 'problem', label: 'Stating a problem and its cause', query: 'stating a problem cause and effect situation problem', overlapsStage: /problem/i },
        { key: 'solution', label: 'Proposing and justifying a solution', query: 'proposing a solution justification response', overlapsStage: /solution|response/i },
        { key: 'evaluation', label: 'Evaluating a solution', query: 'evaluating a solution advantages limitations', overlapsStage: /evaluat/i },
        LINKING
    ],
    default: [SENTENCE_OPENINGS, LINKING, OBJECTIVE_STANCE]
};

const LOGISTICS = [
    /\b\d+\s*[–-]\s*\d+\s*(words?|pages?)\b/i,
    /\b\d+\s*(words?|pages?)\b/i,
    /\b(word count|length|font|double[- ]spaced|margins?|file|\.docx|\.pdf|format|due|deadline|submit|upload|canvas)\b/i,
    /\bno (outside )?sources? (are )?required\b/i,
    /\b(individually|in groups?|in class|typed afterwards)\b/i
];

const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'into', 'its', 'it', 'that', 'this', 'your', 'you', 'for', 'in', 'on', 'with', 'as', 'by', 'their', 'main', 'write']);

function contentWords(text: string): string[] {
    return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * isTeachableRequirement - whether course materials could teach this requirement.
 *
 * Logistics, a list of the stages, and a restatement of the task are not topics a
 * reading teaches, so they would only ever show as uncovered.
 *
 * @param requirement - One approved task requirement
 * @param stageLabels - Approved stage labels
 * @param task - The profile's task statement
 * @returns False for logistics, stage repeats and task restatements
 */
export function isTeachableRequirement(requirement: string, stageLabels: string[], task: string): boolean {
    if (LOGISTICS.some((pattern) => pattern.test(requirement))) return false;
    const lower = requirement.toLowerCase();
    if (stageLabels.filter((label) => lower.includes(label.toLowerCase())).length >= 2) return false;
    const words = contentWords(requirement);
    const taskWords = new Set(contentWords(task));
    if (words.length && words.filter((word) => taskWords.has(word)).length / words.length >= 0.6) return false;
    return true;
}

/** First clause of a requirement, at most 60 characters, for a coverage label. */
function requirementLabel(requirement: string): string {
    const clause = requirement.split(/[.;:]/)[0].trim();
    return clause.length > 60 ? `${clause.slice(0, 59).trimEnd()}…` : clause;
}
```

`buildGenreNeeds` becomes:

```ts
export function buildGenreNeeds(assignment: WritingAssignment): RetrievalNeed[] {
    const profile = assignment.rubric.sflContext;
    if (!profile) return [];
    const stageLabels = profile.stages.map((stage) => stage.label);
    const functions = GENRE_LANGUAGE_FUNCTIONS[(profile.genreId as WritingFoundedGenreId) in GENRE_LANGUAGE_FUNCTIONS ? profile.genreId as WritingFoundedGenreId : 'default'];
    const needs: RetrievalNeed[] = [
        { id: 'genre', kind: 'genre', label: profile.genreLabel, query: `${profile.genreLabel}: ${profile.purpose}`.slice(0, 280) },
        ...profile.stages.slice(0, 5).map((stage) => ({
            id: `stage:${stage.id}`,
            kind: 'stage' as const,
            label: stage.label,
            query: `${profile.genreLabel} ${stage.label}: ${stage.purpose}`.slice(0, 280),
            stageId: stage.id
        })),
        ...profile.taskRequirements
            .filter((requirement) => isTeachableRequirement(requirement, stageLabels, profile.task ?? ''))
            .slice(0, 3)
            .map((requirement, index) => ({
                id: `task:${index}`,
                kind: 'task_requirement' as const,
                label: requirementLabel(requirement),
                query: requirement.slice(0, 280)
            })),
        ...functions
            .filter((entry) => !entry.overlapsStage || !stageLabels.some((label) => entry.overlapsStage!.test(label)))
            .map((entry) => ({ id: `function:${entry.key}`, kind: 'language_function' as const, label: entry.label, query: entry.query }))
    ];
    return needs.slice(0, MAX_GENRE_QUERIES);
}
```

Import `WritingFoundedGenreId` from `./contracts`. Keep `LANGUAGE_FUNCTION_QUERIES` only if another module still imports it (`grep -rn LANGUAGE_FUNCTION_QUERIES src public/scripts`); otherwise delete it.

Note on the descriptive-report filter: the eval fixture's stages are "General statement" and "Classification or composition", so `definition` and `classification` drop, leaving the three labels the test expects.

`material-coverage.ts`:

```ts
/** Bumped whenever buildGenreNeeds changes which rows exist, so cached rows rebuild once. */
export const COVERAGE_NEEDS_VERSION = 'coverage-needs-v2';

export function isCoverageCurrent(coverage: MaterialCoverage | undefined, rubricVersion: number, fingerprint: string): boolean {
    return Boolean(coverage
        && coverage.rubricVersion === rubricVersion
        && coverage.materialFingerprint === fingerprint
        && coverage.needsVersion === COVERAGE_NEEDS_VERSION);
}
```

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

```ts
        expect(view.stageChips).toEqual([
            { label: 'General statement', status: 'Weak', required: true, tone: 'amber' },
            { label: 'Classification or composition', status: 'Missing', required: true, tone: 'red' },
            { label: 'Closing', status: 'Missing', required: false, tone: 'red' }
        ]);
```

and add:

```ts
    it('colours Present green and an unchecked stage neutral', () => {
        const fits = { ...run, textDiagnosis: { ...run.textDiagnosis!, stages: [{ stageId: stages[0].id, status: 'present' }] } } as FeedbackRun;
        const chips = diagnosisBannerView(fits, stages, 'standard')!.stageChips;
        expect(chips[0].tone).toBe('green');
        expect(chips[1]).toMatchObject({ status: 'Not checked', tone: 'neutral' });
    });
```

Source guard `diagnosis-banner-source.test.ts`:

```ts
/**
 * @fileoverview Source guard for the whole-text diagnosis banner (D-155). Jest has no DOM,
 * so the markup contract is pinned by reading the source; the browser pass checks the look.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', '..');
const source = fs.readFileSync(path.join(root, 'public', 'scripts', 'feature', 'writing-feedback-diagnosis.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles', 'instructor-components', 'writing-feedback.css'), 'utf8');
const bannerCss = css.slice(css.indexOf('/* Whole-text diagnosis banner'), css.indexOf('/* Annotations withheld'));

describe('diagnosis banner markup', () => {
    it('is an annotation card with the filter-label section label', () => {
        expect(source).toContain("banner.className = 'wf-annotation-card wf-diagnosis'");
        expect(source).toContain("createText('span', 'WHOLE-TEXT DIAGNOSIS', 'wf-filter-label')");
    });

    it('uses the shared chip for stages and the rewrite marker', () => {
        expect(source).toContain('chip(`${stage.label}: ${stage.status}`, stage.tone)');
        expect(source).toContain("chip('Rewrite feedback', 'amber')");
    });

    it('has no accent bar and no red body text', () => {
        expect(bannerCss).not.toMatch(/border-left/);
        expect(bannerCss).not.toMatch(/\.wf-diagnosis-warning\s*\{[^}]*color:\s*var\(--color-eng-red\)/);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest public/scripts/feature/__tests__/writing-feedback-diagnosis-model.test.ts src/writing-feedback/__tests__/diagnosis-banner-source.test.ts --maxWorkers=4`
Expected: FAIL

- [ ] **Step 3: Implement**

Model:

```ts
const STATUS_TONES: Record<string, 'green' | 'amber' | 'red' | 'neutral'> = { Present: 'green', Weak: 'amber', Missing: 'red' };
// …
        stageChips: stages.map((stage) => {
            const status = STATUS_LABELS[byId.get(stage.id) ?? ''] ?? 'Not checked';
            return { label: stage.label, status, required: stage.required === true, tone: STATUS_TONES[status] ?? 'neutral' };
        }),
```

Update the return type's `stageChips` element to include `tone`.

Renderer (import `chip` from `./writing-feedback-shared.js`):

```ts
    const banner = document.createElement('section');
    banner.className = 'wf-annotation-card wf-diagnosis';
    banner.setAttribute('aria-label', 'Whole-text diagnosis');

    const header = document.createElement('div');
    header.className = 'wf-annotation-header wf-diagnosis-header';
    header.append(createText('span', 'WHOLE-TEXT DIAGNOSIS', 'wf-filter-label'));
    if (mode === 'global_revision') header.append(chip('Rewrite feedback', 'amber'));
    banner.append(header);

    banner.append(createText('h4', view.headline, 'wf-diagnosis-headline'));
    banner.append(createText('p', mode === 'global_revision'
        ? 'The student gets rewrite feedback only. Passage comments are held back.'
        : 'The student gets passage comments and revision goals.', 'wf-diagnosis-mode'));

    const stages = document.createElement('ul');
    stages.className = 'wf-diagnosis-stages';
    stages.setAttribute('aria-label', 'Stages');
    view.stageChips.forEach((stage) => {
        const item = document.createElement('li');
        const node = chip(`${stage.label}: ${stage.status}`, stage.tone);
        if (stage.required) {
            const marker = document.createElement('span');
            marker.className = 'wf-diagnosis-required';
            marker.textContent = '*';
            marker.title = 'Required stage';
            marker.setAttribute('aria-label', 'required');
            node.append(marker);
        }
        item.append(node);
        stages.append(item);
    });
    banner.append(stages);

    view.warnings.forEach((warning) => {
        const note = document.createElement('p');
        note.className = 'wf-diagnosis-note';
        note.setAttribute('role', 'note');
        const icon = document.createElement('i');
        icon.setAttribute('data-feather', 'info');
        icon.setAttribute('aria-hidden', 'true');
        note.append(icon, document.createTextNode(warning));
        banner.append(note);
    });

    const why = document.createElement('details');
    why.className = 'wf-diagnosis-why';
    const summary = document.createElement('summary');
    summary.textContent = 'Why this diagnosis';
    why.append(summary, createText('p', view.rationale));
    banner.append(why);

    if (canEdit) {
        const toggle = createButton(view.toggleLabel, 'outline', async () => {
            onToggle(mode === 'global_revision' ? 'standard' : 'global_revision');
        });
        toggle.classList.add('wf-diagnosis-toggle');
        banner.append(toggle);
    }
    refreshIcons();
    return banner;
```

(Import `refreshIcons` from `./writing-feedback-shared.js`. Remove the `wf-diagnosis--rewrite` class; nothing else reads it — verify with `grep -rn "wf-diagnosis--rewrite" public src`.)

CSS — replace the block from `/* Whole-text diagnosis banner` through `.wf-diagnosis-toggle {…}` with:

```css
/* Whole-text diagnosis banner (review page, staff only). Built on .wf-annotation-card. */
.wf-diagnosis {
    display: grid;
    gap: 8px;
    margin: 0 0 16px;
    overflow-wrap: anywhere;
}

.wf-diagnosis-header {
    justify-content: space-between;
    margin-bottom: 0;
}

.wf-diagnosis .wf-diagnosis-headline {
    margin: 0;
}

.wf-diagnosis .wf-diagnosis-mode,
.wf-diagnosis-why p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
}

.wf-diagnosis-stages {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.wf-diagnosis-stages .wf-chip {
    white-space: normal;
}

.wf-diagnosis-required {
    margin-left: 2px;
    font-weight: 700;
}

.wf-diagnosis .wf-diagnosis-note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
}

.wf-diagnosis-note svg {
    flex: none;
    width: 14px;
    height: 14px;
    margin-top: 3px;
}

.wf-diagnosis-why > summary {
    cursor: pointer;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 600;
}

.wf-diagnosis-toggle {
    justify-self: start;
}

@media (hover: none) {
    .wf-diagnosis-why > summary,
    .wf-diagnosis-toggle {
        min-height: 44px;
    }
}
```

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

```ts
/**
 * @fileoverview D-155: the readability callout is gone from the review page and the engines
 * no longer write the plain-language flag. The lint itself stays for the eval harness.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

describe('readability callout removed', () => {
    it('is not rendered on the review page', () => {
        const review = read('public', 'scripts', 'feature', 'writing-feedback-review.ts');
        expect(review).not.toContain('plainLanguageWarning');
        expect(review).not.toContain('plainHosts');
    });

    it('is not written by either engine', () => {
        expect(read('src', 'writing-feedback', 'feedback-engine.ts')).not.toContain('plainLanguageFlag');
        expect(read('src', 'writing-feedback', 'technical-feedback-engine.ts')).not.toContain('plainLanguageFlag');
    });

    it('keeps the lint for the eval harness', () => {
        expect(read('src', 'writing-feedback', 'eval-checks.ts')).toContain('lintFeedbackProse');
    });
});
```

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
