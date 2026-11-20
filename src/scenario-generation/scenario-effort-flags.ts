/**
 * Scenario effort flags — fixed rules that mark answers worth an instructor's second look
 *
 * Used by the usage CSV ("Flagged answers") and the Monitor scenarios panel. Flags are a prompt
 * to review, not a verdict: they are deterministic so the same data always gives the same
 * result and each flag can be explained in one sentence. No LLM is involved.
 *
 * @author: Kathleen Tom
 * @date: 2026-11-20
 * @version: 1.0.0
 * @description: Deterministic low-effort answer flags for Practice Scenarios usage reporting.
 */

import type { ScenarioEffortFlag } from '../types/shared';

/** Fewer words than this counts as too short. Kept low so terse numeric answers ("K = 0.66 eV") pass. */
export const MIN_ANSWER_WORDS = 3;

/** Share of an answer's word triples found in the source text for it to count as copied. */
export const COPY_OVERLAP_THRESHOLD = 0.6;

/**
 * An answer needs at least this many word triples (8+ words) before the copy checks apply:
 * a short correct answer ("K is about 0.66 eV") naturally reads like the model answer.
 */
const MIN_TRIPLES_FOR_COPY_CHECK = 6;

/** Stock non-answers, compared after normalization. */
const NON_ANSWERS = new Set([
    'idk', 'i dont know', 'i do not know', 'dont know', 'no idea', 'not sure', 'unsure', 'na', 'n a',
    'none', 'nothing', 'pass', 'skip', 'test', 'testing', 'asdf', 'help', 'no', 'yes', 'ok', 'okay',
]);

/** Inputs for one answer. `previousAnswer` is the same student's prior answer to the same part. */
export interface EffortFlagInput {
    answer: string;
    prompt: string;
    modelAnswer: string;
    previousAnswer?: string;
}

/** Lowercase, drop punctuation (keeping decimals like 0.66), collapse whitespace. */
export function normalizeAnswerText(text: string): string {
    return (text ?? '')
        .toLowerCase()
        .replace(/\\[a-z]+/g, ' ') // LaTeX command names carry no effort signal
        .replace(/['’‘`]/g, '') // "don’t" → "dont", whichever apostrophe was typed
        // Protect decimal points through the punctuation strip below
        .replace(/(\d)\.(\d)/g, '$1qqdecimalqq$2')
        .replace(/[^a-z0-9\s]|_/g, ' ')
        .replace(/qqdecimalqq/g, '.')
        .replace(/\s+/g, ' ')
        .trim();
}

function words(text: string): string[] {
    const normalized = normalizeAnswerText(text);
    return normalized ? normalized.split(' ') : [];
}

function triples(tokens: string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i + 2 < tokens.length; i++) out.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    return out;
}

/** Share of the answer's word triples that also appear in `source` (0 when the answer is too short to judge). */
export function copiedShare(answer: string, source: string): number {
    const answerTriples = triples(words(answer));
    if (answerTriples.length < MIN_TRIPLES_FOR_COPY_CHECK) return 0;
    const sourceTriples = new Set(triples(words(source)));
    if (sourceTriples.size === 0) return 0;
    return answerTriples.filter((t) => sourceTriples.has(t)).length / answerTriples.length;
}

/**
 * effortFlagsForAnswer — which low-effort rules an answer trips.
 *
 * - `too_short`: under {@link MIN_ANSWER_WORDS} words, or a stock non-answer ("idk", "n/a")
 * - `repeats_question`: mostly the part's own question text
 * - `duplicate`: same text as this student's previous answer to the part
 * - `copies_model_answer`: mostly the model answer's wording
 *
 * @param input - The answer, the part's prompt and model answer, and the previous answer if any
 * @returns Flags in a fixed order; empty when none apply
 */
export function effortFlagsForAnswer(input: EffortFlagInput): ScenarioEffortFlag[] {
    const flags: ScenarioEffortFlag[] = [];
    const normalized = normalizeAnswerText(input.answer);
    const wordCount = normalized ? normalized.split(' ').length : 0;

    if (wordCount < MIN_ANSWER_WORDS || NON_ANSWERS.has(normalized)) flags.push('too_short');
    if (copiedShare(input.answer, input.prompt) >= COPY_OVERLAP_THRESHOLD) flags.push('repeats_question');
    if (input.previousAnswer !== undefined && normalized === normalizeAnswerText(input.previousAnswer)) {
        flags.push('duplicate');
    }
    if (copiedShare(input.answer, input.modelAnswer) >= COPY_OVERLAP_THRESHOLD) flags.push('copies_model_answer');
    return flags;
}
