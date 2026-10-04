# Writing Feedback Plain Language Implementation Plan

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

```ts
/**
 * @fileoverview Plain-language contract and lint: known terms, banned SFL vocabulary,
 * quoted student words ignored, sentence length, staff-only flag text.
 */

import {
    buildStudentReaderContract,
    knownTermsFor,
    lintFeedbackProse,
    lintStudentProse,
    plainLanguageFlag
} from '../plain-language';

describe('knownTermsFor', () => {
    it('unions glossary terms, stage labels and the genre label', () => {
        expect(knownTermsFor({
            approvedGlossaryTerms: ['stance'],
            stages: [{ id: 's1', label: 'General statement', purpose: 'x' }],
            genreLabel: 'Descriptive report'
        })).toEqual(['stance', 'General statement', 'Descriptive report']);
    });

    it('returns an empty list without a profile', () => {
        expect(knownTermsFor(undefined)).toEqual([]);
    });
});

describe('lintStudentProse', () => {
    it('flags SFL terms students were not taught', () => {
        const issue = lintStudentProse('Use relational processes and keep the entity as the Theme of each clause.', []);
        expect(issue.bannedTerms).toEqual(expect.arrayContaining(['relational process', 'entity', 'Theme', 'clause']));
    });

    it('allows a known term', () => {
        expect(lintStudentProse('Your stance is too strong here.', ['stance']).bannedTerms).toEqual([]);
    });

    it('ignores words inside quotation marks', () => {
        expect(lintStudentProse('You wrote "The classification of rocks" as your title.', []).bannedTerms).toEqual([]);
        expect(lintStudentProse('You wrote “Theme parks” here.', []).bannedTerms).toEqual([]);
    });

    it('does not match words that merely contain a term', () => {
        expect(lintStudentProse('The data was processed and registered.', []).bannedTerms).toEqual([]);
    });

    it('counts sentences over 25 words without splitting on decimals or e.g.', () => {
        const long = 'You explain each step of how sound moves from the guitar string through the air to the ear and then to the brain, which is a time order and not a report.';
        const issue = lintStudentProse(`${long} Add 3.5 g, e.g. salt.`, []);
        expect(issue.sentences).toBe(2);
        expect(issue.longSentences).toBe(1);
    });

    it('marks a comment with more sentences than allowed', () => {
        expect(lintStudentProse('One. Two. Three.', [], 2).tooManySentences).toBe(true);
    });
});

describe('lintFeedbackProse and plainLanguageFlag', () => {
    const result = {
        criteria: [{
            explanation: 'Your paragraph explains how sound travels.',
            evidence: [{ rationale: 'The Theme shifts to scientists.', revisionGuidance: 'Start each sentence with the volcano type you describe.' }]
        }],
        strengths: ['Your title names the topic.'],
        revisionGoals: [{ goal: 'Rewrite it as a descriptive report.', action: 'Write your first sentence so it says what a volcano is.' }]
    };

    it('aggregates hits across every student-facing field', () => {
        const report = lintFeedbackProse(result, []);
        expect(report.bannedTerms).toEqual(['Theme']);
        expect(report.bannedHits).toBe(1);
    });

    it('produces a staff flag with names and counts only', () => {
        const flag = plainLanguageFlag(lintFeedbackProse(result, []));
        expect(flag).toBe('Plain language: 1 analysis term(s) students may not know (Theme); 0 sentence(s) over 25 words; 0 comment(s) over length.');
        expect(flag).not.toContain('scientists');
    });

    it('returns no flag for clean prose', () => {
        expect(plainLanguageFlag(lintFeedbackProse({ ...result, criteria: [] }, []))).toBeUndefined();
    });
});

describe('buildStudentReaderContract', () => {
    const contract = buildStudentReaderContract(['General statement']);

    it('names the real reader and the limits', () => {
        expect(contract).toMatch(/student is the final reader/i);
        expect(contract).toMatch(/additional language/);
        expect(contract).toMatch(/25 words/);
    });

    it('lists known terms and asks for a gloss', () => {
        expect(contract).toContain('General statement');
        expect(contract).toMatch(/short plain explanation the first time/i);
    });

    it('carries the translation table', () => {
        expect(contract).toContain('the start of your sentence');
        expect(contract).toContain('how sure your sentence sounds');
    });

    it('keeps the quality floor', () => {
        expect(contract).toMatch(/Plain does not mean simple/);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (background): `npx jest src/writing-feedback/__tests__/plain-language.test.ts --maxWorkers=4`
Expected: FAIL with "Cannot find module '../plain-language'".

- [ ] **Step 3: Implement the module**

```ts
/**
 * Plain-language contract — student-reader rules, SFL translations and a prose lint
 *
 * Vantage One LLED 200 students read feedback in English as an additional language
 * (about IELTS 5.5–6.5). The analyzer works in SFL terms on purpose; this module keeps
 * those terms out of what students read, and measures whether a draft did.
 *
 * @author: @rdschrs
 * @date: 2026-10-03
 * @version: 1.0.0
 * @description: Shared student-reader prompt contract and deterministic plain-language lint.
 */

import type { WritingSflContextProfile } from './contracts';

export const PLAIN_LANGUAGE_VERSION = 'plain-language-v1.0.0';

const MAX_SENTENCE_WORDS = 25;

/** Internal concept → wording the student sees. Order is the order the prompt lists them. */
export const SFL_PLAIN_TRANSLATIONS: ReadonlyArray<readonly [string, string]> = [
    ['Theme / thematic progression', '"the start of your sentence" / "what your sentences start with"'],
    ['relational process or clause', '"verbs such as is, has, consists of"'],
    ['material process or temporal sequence', '"describing steps in time order (first, then, finally)"'],
    ['timeless present', '"present tense (is, are), because these facts are always true"'],
    ['entity or participant', 'the name of the thing itself, e.g. "sound", "volcanoes"'],
    ['classification or composition stage', 'the stage label if it is a known term, or "a sentence that names the main types (or parts) of X"'],
    ['impersonal stance or tenor', '"write about the topic itself rather than about we or you"'],
    ['modality, hedging or calibration', '"how sure your sentence sounds (can, may, always)"'],
    ['evaluative language or appraisal', '"words that give your opinion, such as very dangerous"'],
    ['register', '"the formal style this assignment needs"'],
    ['cohesion or cohesive ties', '"words that link your sentences (this, these types, however)"'],
    ['nominalization', '"turning a verb into a noun (decide → decision)"'],
    ['positions the reader', '"makes the reader feel…" or "tells the reader…"']
];

/** Banned analysis terms: label shown to staff, and the pattern that finds it. */
const BANNED_TERMS: ReadonlyArray<readonly [string, RegExp]> = [
    // Capitalized mid-sentence only, so "theme" in everyday use passes.
    ['Theme', /(?<![.!?]\s)(?<!^)\bThemes?\b/],
    ['Rheme', /\brhemes?\b/i],
    ['relational process', /\brelational (process|processes|clause|clauses|verb|verbs)\b/i],
    ['material process', /\bmaterial process(es)?\b/i],
    ['mental process', /\bmental process(es)?\b/i],
    ['participant', /\bparticipants?\b/i],
    ['circumstance', /\bcircumstances?\b/i],
    ['entity', /\bentit(y|ies)\b/i],
    ['clause', /\bclauses?\b/i],
    ['nominalization', /\bnominali[sz]ations?\b/i],
    ['metafunction', /\bmetafunctions?\b/i],
    ['ideational', /\bideational\b/i],
    ['interpersonal', /\binterpersonal\b/i],
    ['textual', /\btextual\b/i],
    ['thematic', /\bthematic\b/i],
    ['positioning', /\bposition(s|ing|ed)? (the|a) reader\b|\bpositioning\b/i],
    ['calibrated', /\bcalibrat(e|ed|es|ing|ion)\b/i],
    ['register', /\bregister\b/i],
    ['modality', /\bmodality\b/i],
    ['hedging', /\bhedg(e|es|ed|ing)\b/i],
    ['stance', /\bstances?\b/i],
    ['appraisal', /\bappraisal\b/i],
    ['evaluative', /\bevaluative\b/i],
    ['foreground', /\bforeground(s|ed|ing)?\b/i],
    ['construe', /\bconstru(e|es|ed|ing)\b/i],
    ['tenor', /\btenor\b/i],
    ['technicality', /\btechnicality\b/i],
    ['cohesive ties', /\bcohesive\b|\bcohesion\b/i],
    ['lexical', /\blexical\b/i],
    ['grammatical metaphor', /\bgrammatical metaphor\b/i],
    ['timeless present', /\btimeless[- ]present\b/i],
    ['congruent', /\bcongruent\b/i]
];

/**
 * knownTermsFor - terms the course has taught for this assignment.
 *
 * @param sflContext - Staff-approved writing profile; absent on some technical rubrics
 * @returns Glossary terms, stage labels and the genre label, in that order
 */
export function knownTermsFor(
    sflContext?: Pick<WritingSflContextProfile, 'approvedGlossaryTerms' | 'stages' | 'genreLabel'>
): string[] {
    if (!sflContext) return [];
    return [
        ...(sflContext.approvedGlossaryTerms ?? []),
        ...(sflContext.stages ?? []).map((stage) => stage.label),
        ...(sflContext.genreLabel ? [sflContext.genreLabel] : [])
    ].map((term) => term.trim()).filter(Boolean);
}

/**
 * buildStudentReaderContract - rules every student-facing writer follows.
 *
 * @param knownTerms - Course terms students have been taught for this assignment
 * @returns Prompt section; contains no student text
 */
export function buildStudentReaderContract(knownTerms: string[]): string {
    return [
        '<student_reader>',
        'The student is the final reader. They are a capable first-year university student writing in English as an additional language (about IELTS 5.5–6.5). Staff will review your text, but write it for the student.',
        'Plain does not mean simple. Keep the precise point and the correct course terms, and never talk down. No exclamation marks, no "Great job".',
        `- Address the student as "you". Use active voice. One idea per sentence. Aim for 20 words or fewer; never more than ${MAX_SENTENCE_WORDS}.`,
        '- Use everyday words. Prefer verbs to abstract nouns: "you explain how sound travels", not "the text represents sound as a process".',
        '- Name the actual thing ("sound", "volcanoes"), never "the entity" or "the topic".',
        '- A rationale says what the quoted words do and what that means for the reader, in at most two sentences.',
        '- Revision guidance starts with a verb and gives one action the student can take on that passage, in at most two sentences.',
        '- A criterion explanation is at most three sentences.',
        '- Make each point once, in the place it fits best. Do not repeat the same advice under another criterion, goal, or the rewrite direction.',
        '- In a rewrite direction, write numbered steps, one per line, each one short sentence.',
        knownTerms.length
            ? `- Known course terms you may use: ${knownTerms.map((term) => `"${term}"`).join(', ')}. Give each one a short plain explanation the first time you use it, e.g. "a general statement (your first sentence, which says what X is)".`
            : '- No course terms are listed. Use plain words only.',
        '- Your inputs (analysis findings, the profile, the rubric) use linguistics terms. Never copy them. Translate each one:',
        ...SFL_PLAIN_TRANSLATIONS.map(([internal, plain]) => `  ${internal} → ${plain}`),
        '- Never use these words with the student unless they are known course terms: Theme, clause, entity, participant, process, register, stance, modality, hedging, calibrated, positioning, interpersonal, evaluative, foreground, nominalization.',
        '</student_reader>'
    ].join('\n');
}

/** Removes quoted spans so student words and titles are not counted. */
function stripQuotes(text: string): string {
    return text.replace(/"[^"]*"|“[^”]*”|'[^']{2,}'|‘[^’]*’/g, ' ');
}

/** Splits on sentence ends, ignoring decimals and common abbreviations. */
function sentencesOf(text: string): string[] {
    const masked = text
        .replace(/\b(e\.g|i\.e|etc|vs|cf)\./gi, (match) => match.replace(/\./g, '\u0000'))
        .replace(/(\d)\.(\d)/g, '$1\u0000$2');
    return masked
        .split(/(?<=[.!?])\s+|\n+/)
        .map((sentence) => sentence.replace(/\u0000/g, '.').trim())
        .filter((sentence) => /\w/.test(sentence));
}

function wordCount(text: string): number {
    return text.split(/\s+/).filter((word) => /\w/.test(word)).length;
}

/**
 * lintStudentProse - plain-language issues in one student-facing string.
 *
 * @param text - Generated prose; quoted spans are ignored
 * @param knownTerms - Course terms that are allowed
 * @param maxSentences - Sentence ceiling for this field, if any
 * @returns Banned terms found, long-sentence and size counts
 */
export function lintStudentProse(text: string, knownTerms: string[], maxSentences?: number): PlainLanguageIssue {
    const known = knownTerms.map((term) => term.toLowerCase());
    const unquoted = stripQuotes(text);
    const bannedTerms = BANNED_TERMS
        .filter(([label]) => !known.some((term) => term.includes(label.toLowerCase())))
        .filter(([, pattern]) => sentencesOf(unquoted).some((sentence) => pattern.test(sentence)))
        .map(([label]) => label);
    const sentences = sentencesOf(text);
    return {
        bannedTerms,
        longSentences: sentences.filter((sentence) => wordCount(sentence) > MAX_SENTENCE_WORDS).length,
        sentences: sentences.length,
        words: wordCount(text),
        tooManySentences: maxSentences !== undefined && sentences.length > maxSentences
    };
}

/**
 * lintFeedbackProse - aggregates the lint across every student-facing field.
 *
 * @param result - Writer, technical or redraft output
 * @param knownTerms - Course terms that are allowed
 * @returns Totals; holds term names and counts only
 */
export function lintFeedbackProse(result: LintableFeedback, knownTerms: string[]): PlainLanguageReport {
    const fields: Array<[string, number | undefined]> = [
        ...result.criteria.flatMap((criterion) => [
            [criterion.explanation, 3] as [string, number],
            ...criterion.evidence.flatMap((item) => [[item.rationale, 2], [item.revisionGuidance, 2]] as Array<[string, number]>)
        ]),
        ...result.strengths.map((strength) => [strength, undefined] as [string, undefined]),
        ...result.revisionGoals.flatMap((goal) => [goal.goal, goal.action, goal.guidedQuestion]
            .filter((text): text is string => Boolean(text))
            .map((text) => [text, undefined] as [string, undefined])),
        ...[result.globalRevision?.diagnosisStatement, result.globalRevision?.rewriteDirection]
            .filter((text): text is string => Boolean(text))
            .map((text) => [text, undefined] as [string, undefined])
    ];
    const issues = fields.map(([text, max]) => lintStudentProse(text, knownTerms, max));
    return {
        bannedTerms: [...new Set(issues.flatMap((issue) => issue.bannedTerms))],
        bannedHits: issues.reduce((sum, issue) => sum + issue.bannedTerms.length, 0),
        longSentences: issues.reduce((sum, issue) => sum + issue.longSentences, 0),
        sentences: issues.reduce((sum, issue) => sum + issue.sentences, 0),
        words: issues.reduce((sum, issue) => sum + issue.words, 0),
        overLongComments: issues.filter((issue) => issue.tooManySentences).length
    };
}

/**
 * plainLanguageFlag - staff-only internal flag line, or nothing when clean.
 *
 * @param report - Aggregated lint
 * @returns A flag naming terms and counts, never prose
 */
export function plainLanguageFlag(report: PlainLanguageReport): string | undefined {
    if (!report.bannedHits && !report.longSentences && !report.overLongComments) return undefined;
    const terms = report.bannedTerms.length ? ` (${report.bannedTerms.join(', ')})` : '';
    return `Plain language: ${report.bannedHits} analysis term(s) students may not know${terms}; ${report.longSentences} sentence(s) over ${MAX_SENTENCE_WORDS} words; ${report.overLongComments} comment(s) over length.`;
}

/** One string's lint result. */
export interface PlainLanguageIssue {
    bannedTerms: string[];
    longSentences: number;
    sentences: number;
    words: number;
    tooManySentences: boolean;
}

/** Lint totals across a result. */
export interface PlainLanguageReport {
    bannedTerms: string[];
    bannedHits: number;
    longSentences: number;
    sentences: number;
    words: number;
    overLongComments: number;
}

/** Structural view of any student-facing result the lint reads. */
export interface LintableFeedback {
    criteria: Array<{ explanation: string; evidence: Array<{ rationale: string; revisionGuidance: string }> }>;
    strengths: string[];
    revisionGoals: Array<{ goal: string; action?: string; guidedQuestion?: string }>;
    globalRevision?: { diagnosisStatement?: string; rewriteDirection?: string };
}
```

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

```ts
    it('writes for the student in plain language, not in SFL terms', () => {
        const prompt = buildWritingFeedbackSystemPrompt(assignment, 'standard');
        expect(prompt).not.toMatch(/light SFL terms/);
        expect(prompt).toContain('<student_reader>');
        expect(prompt).toMatch(/Never copy them\. Translate/);
    });

    it('offers the approved stage labels as known terms', () => {
        const prompt = buildWritingFeedbackSystemPrompt(assignment, 'standard');
        expect(prompt).toContain('"General statement"');
    });

    it('shows an abstract comment as one to avoid', () => {
        const prompt = buildWritingFeedbackSystemPrompt(assignment, 'standard');
        expect(prompt).toMatch(/Abstract annotation \(avoid\)/);
    });
```

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

```ts
        result.internalFlags.push(...guardStrengths(result, diagnosis, gateDecision));
        // Staff-only signal that the draft drifted into analysis terms or long sentences.
        const plainFlag = plainLanguageFlag(lintFeedbackProse(result, knownTermsFor(assignment.rubric.sflContext)));
        if (plainFlag) result.internalFlags.push(plainFlag);
```

Use whatever name the surrounding `generate` method gives the assignment. Check the method signature; if it is `input.assignment`, use that.

- [ ] **Step 5: Rewrite the writer examples** in `prompt-examples.ts` (keep `ANALYZER_EXAMPLES` unchanged and bump the version)

```ts
export const PROMPT_EXAMPLES_VERSION = 'prompt-examples-v1.1.0';

export const WRITER_STANDARD_EXAMPLES = [
    'Passage (synthetic): "A thermometer is a thing that tells you how hot it is."',
    'Good annotation: { "rationale": "The word \\"thing\\" does not tell the reader what kind of object a thermometer is.", "revisionGuidance": "Replace \\"thing\\" with the group of objects a thermometer belongs to. Then add one feature that makes it different from others in that group." }',
    'Vague annotation (avoid): { "rationale": "The definition is informal.", "revisionGuidance": "Make it more academic." }',
    'Abstract annotation (avoid): { "rationale": "The Theme and temporal marker establish the first event in a chronological explanation.", "revisionGuidance": "Use timeless-present relational clauses to describe each type." } — correct, but the student cannot tell what to change.',
    'Plain version of the same point: { "rationale": "\\"First\\" starts a list of steps in time order. That explains how sound travels, but a descriptive report describes what sound is.", "revisionGuidance": "Remove the time words (first, then, finally). Write sentences that say what each type of sound is or has, using the present tense." }',
    'Good revision goal: { "skillTag": "identify", "goal": "Write a clear definition of a thermometer.", "action": "Say which group of objects it belongs to, then give one feature that makes it different." }'
].join('\n');

export const WRITER_GLOBAL_EXAMPLE = [
    'Text (synthetic) explains how rain forms step by step instead of describing the types of precipitation.',
    '{ "diagnosisStatement": "Precipitation is a good topic for a descriptive report, and you use accurate words such as condensation. But your paragraph explains how rain forms, step by step. A descriptive report instead says what precipitation is and describes its types.", "whatToKeep": ["Precipitation as your topic", "Accurate terms such as condensation"], "rewriteDirection": "1. Start with one sentence that says what precipitation is.\\n2. Name its main types (rain, snow, sleet, hail).\\n3. Describe each type in turn, using the present tense." }'
].join('\n');
```

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

```ts
describe('plain-language contract', () => {
    it('names the student as the final reader and carries the contract', () => {
        const prompt = buildSummaryRedraftSystemPrompt({ assignment, lens: 'linguistic', rubric: assignment.rubric });
        expect(prompt).not.toMatch(/Your reader is the teaching team/);
        expect(prompt).toContain('<student_reader>');
    });
});
```

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

```ts
describe('plain-language contract', () => {
    it('names the student as the final reader', () => {
        const prompt = buildTechnicalFeedbackSystemPrompt(technicalAssignment);
        expect(prompt).not.toMatch(/Your reader is the teaching team, not the student/);
        expect(prompt).toContain('<student_reader>');
        expect(prompt.indexOf('<student_reader>')).toBeGreaterThan(0); // after PRIME_DIRECTIVE (D-055)
    });
});
```

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

```ts
        const result = reconcileExactEvidence(parsedResult, input.verifiedText);
        // Staff-only signal that the draft drifted into jargon or long sentences.
        const plainFlag = plainLanguageFlag(lintFeedbackProse(result, []));
        if (plainFlag) result.internalFlags.push(plainFlag);
        return result;
```

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

```ts
describe('plainLanguage check', () => {
    const base = { verifiedText: 'x', result: { strengths: [], revisionGoals: [] } };

    it('fails dense SFL prose', () => {
        const output = { ...base, result: { ...base.result, criteria: [{ explanation: 'The interpersonal choices are calibrated to the register.', evidence: [] }] } };
        const check = runEvalChecks(output as never, fixture, []).find((item) => item.name === 'plainLanguage');
        expect(check?.status).toBe('fail');
    });

    it('passes plain prose', () => {
        const output = { ...base, result: { ...base.result, criteria: [{ explanation: 'Your paragraph explains how sound travels. A report says what sound is.', evidence: [] }] } };
        const check = runEvalChecks(output as never, fixture, []).find((item) => item.name === 'plainLanguage');
        expect(check?.status).toBe('pass');
    });
});
```

Use the `fixture` value the file already uses for the other checks.

- [ ] **Step 2: Run them to verify they fail**

Run (background): `npx jest src/writing-feedback/__tests__/eval-checks.test.ts --maxWorkers=4`
Expected: FAIL, because no `plainLanguage` check exists.

- [ ] **Step 3: Implement the check**

Change the signature to `export function runEvalChecks(output: EvalRunOutput, fixture: EvalFixture, knownTerms: string[] = []): EvalCheckResult[]`, then add this before `return [`:

```ts
    const plain = lintFeedbackProse({
        criteria: (result.criteria ?? []).map((criterion) => ({
            explanation: (criterion as { explanation?: string }).explanation ?? '',
            evidence: (criterion.evidence ?? []).map((item) => ({
                rationale: (item as { rationale?: string }).rationale ?? '',
                revisionGuidance: (item as { revisionGuidance?: string }).revisionGuidance ?? ''
            }))
        })),
        strengths: result.strengths ?? [],
        revisionGoals: (result.revisionGoals ?? []).map((goal) => ({ goal: goal.goal ?? '', action: goal.action, guidedQuestion: goal.guidedQuestion })),
        ...(mode === 'global_revision' && result.globalRevision ? { globalRevision: result.globalRevision } : {})
    }, knownTerms);
    const bannedPer100 = plain.words ? (100 * plain.bannedHits) / plain.words : 0;
    const longShare = plain.sentences ? plain.longSentences / plain.sentences : 0;
```

Then add this entry to the returned array:

```ts
        check(
            'plainLanguage',
            plain.words > 0,
            bannedPer100 <= 1 && longShare <= 0.05,
            `${bannedPer100.toFixed(1)} analysis terms/100 words (${plain.bannedTerms.join(', ') || 'none'}); ${(longShare * 100).toFixed(0)}% sentences over 25 words`
        ),
```

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

```ts
import { lintStudentProse } from '../plain-language';

it('writes default descriptors in plain language', () => {
    const descriptors = buildDefaultWritingRubric().criteria.flatMap((criterion) =>
        Object.values(criterion.cells ?? {}).map((cell) => cell.descriptor ?? ''));
    for (const descriptor of descriptors) {
        expect(lintStudentProse(descriptor, []).bannedTerms).toEqual([]);
    }
});
```

`buildDefaultWritingRubric` is already exported from `../default-rubric-profile`; criteria carry `cells?: Record<WritingLevelId, WritingRubricCell>` with an optional `descriptor`.

- [ ] **Step 2: Run it to verify it fails**

Run (background): `npx jest src/writing-feedback/__tests__/default-rubric-profile.test.ts --maxWorkers=4`
Expected: FAIL. Terms such as "cohesive", "entities", "stance", "modality", "hedging", "calibrated" and "register" are flagged.

- [ ] **Step 3: Replace the descriptors**

```ts
const DEFAULT_WRITING_DESCRIPTORS: Record<string, Record<string, string>> = {
    organization: {
        weak: 'Ideas come in no clear order, paragraphs are unclear or missing, and the reader has to search for related information.',
        developing: 'There is a rough order, but links between ideas are missing or uneven, and some paragraphs mix unrelated ideas.',
        proficient: 'Ideas follow a logical order in clear paragraphs, and linking words help the reader follow without re-reading.',
        exemplary: 'The order of ideas builds toward the purpose of the task, links between ideas are always clear, and the paragraphs support the structure.'
    },
    content: {
        weak: 'The information is mostly wrong, missing, or not what the task asked for.',
        developing: 'The main information is there but incomplete, or has mistakes that a reader who knows the topic would notice.',
        proficient: 'The information is accurate and complete, and the things, processes and links between them are explained correctly.',
        exemplary: 'The information is accurate, complete and precise, and explains how things and processes connect in a way that shows strong understanding.'
    },
    interpersonal_positioning: {
        weak: 'The tone does not fit the reader or purpose; claims are too strong, unsupported, or written for the wrong reader.',
        developing: 'The tone mostly fits, but in places claims sound too sure or too unsure, or the wording is too casual or too technical for the reader.',
        proficient: 'Claims sound as sure as the evidence allows, and the formality and technical words fit the reader and purpose throughout.',
        exemplary: 'The writing speaks to the reader precisely and consistently, choosing tone, certainty and technical words that give this reader exactly what they need.'
    }
};
```

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

```bash
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p public/tsconfig.json
npx jest --maxWorkers=4
git diff --check
```

Expected: both tsc runs clean. Jest shows only the two inherited failing suites already noted on 2026-09-28. Any new failure blocks.

- [ ] **Step 2: Live eval** (needs the LLM env; ask the user to run it if no credentials are available)

```bash
npm run wf:eval -- --runs 1
```

Expected: `plainLanguage` passes on 18/18, and every other check matches the 2026-09-28 results. Compare against the baseline with the scratchpad script from the session, which measures density and average sentence length. Target: ≤1 banned term per 100 words (was 5.8) and ≤16 words per sentence on average (was 20.8).

- [ ] **Step 3: Human check pack**

From the old and new eval reports (synthetic texts only), take 10 matched comment pairs. Write them to a scratchpad file in random A/B order for the user to share with colleagues and the supervisor. The question is: "Which tells you more clearly what to change?" Do not put this in the repo or in project memory.

- [ ] **Step 4: Rule file** — append to `01-rubric-sfl-feedback.mdc`:

```markdown
## Student-facing language

- Student-facing prose follows `buildStudentReaderContract` in `src/writing-feedback/plain-language.ts`: the student (EAL, about IELTS 5.5–6.5) is the reader; ≤25-word sentences; rationale/guidance ≤2 sentences, explanation ≤3.
- The analyzer and the diagnosis may use SFL terms; writers must translate them. Only known terms (glossary terms, stage labels, genre label) may reach students, glossed on first use.
- Any new student-facing writer must inject the contract and add the `plainLanguageFlag` line to `internalFlags`.
```

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
