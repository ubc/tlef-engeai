/**
 * Feedback schema — structured model validation and exact-evidence reconciliation
 *
 * Validates a rubric-complete assignment result and constrains generated evidence to a
 * focused clause or sentence. Cosmetic model drift may be reconciled through a UTF-16
 * source map, but paraphrases and unmatched evidence fail instead of being invented.
 *
 * @author: @rdschrs
 * @date: 2026-07-18
 * @version: 1.0.0
 * @description: Enforces rubric-driven output, exact evidence, and safe numeric mapping.
 */

import { z } from 'zod';
import type {
    WritingFeedbackResult,
    WritingRubricDefinition
} from './contracts';

/** Maximum model evidence span so seeded annotations stay clause- or sentence-focused. */
export const MAX_EVIDENCE_QUOTE_LENGTH = 280;

const evidenceSchema = z.object({
    quote: z.string().min(1).max(MAX_EVIDENCE_QUOTE_LENGTH),
    rationale: z.string().min(1)
});

const revisionGoalSchema = z.object({
    skillTag: z.string().min(1),
    goal: z.string().min(1),
    guidedQuestion: z.string().min(1)
});

/**
 * buildFeedbackSchema - builds structured output validation from one approved rubric.
 *
 * Allowed criterion and level ids come only from the assignment rubric. Output
 * order is flexible, but every criterion must appear exactly once.
 *
 * @param rubric - Assignment rubric governing the pending generation run
 * @returns Zod schema accepting only a complete result for that rubric
 * @throws Error when a rubric has no criteria or levels
 */
export function buildFeedbackSchema(rubric: WritingRubricDefinition) {
    const criterionIds = rubric.criteria.map((criterion) => criterion.id);
    const levelIds = rubric.levels.map((level) => level.id);
    if (!criterionIds.length || !levelIds.length) {
        throw new Error('An approved rubric requires criteria and performance levels');
    }
    const allowedCriteria = new Set(criterionIds);
    const allowedLevels = new Set(levelIds);
    return z.object({
        criteria: z.array(z.object({
            criterion: z.string().refine((value) => allowedCriteria.has(value), 'Criterion is not part of the approved rubric'),
            suggestedLevel: z.string().refine((value) => allowedLevels.has(value), 'Performance level is not part of the approved rubric'),
            evidence: z.array(evidenceSchema).min(1),
            explanation: z.string().min(1),
            confidence: z.number().min(0).max(1)
        })).length(criterionIds.length),
        strengths: z.array(z.string().min(1)).max(5),
        revisionGoals: z.array(revisionGoalSchema).max(3),
        internalFlags: z.array(z.string()).max(8)
    }).superRefine((feedback, ctx) => {
        const returnedIds = feedback.criteria.map((criterion) => criterion.criterion);
        if (new Set(returnedIds).size !== criterionIds.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Feedback must contain each approved criterion exactly once',
                path: ['criteria']
            });
        }
    });
}

/**
 * validateExactEvidence — enforces the no-invented-evidence invariant.
 *
 * @param result - Structured feedback result to validate
 * @param verifiedText - Staff-verified source text
 * @returns The unchanged result when every quote is an exact substring
 * @throws Error when any quote is absent from the verified source
 */
export function validateExactEvidence(result: WritingFeedbackResult, verifiedText: string): WritingFeedbackResult {
    for (const criterion of result.criteria) {
        for (const evidence of criterion.evidence) {
            if (!verifiedText.includes(evidence.quote)) {
                throw new Error('Feedback evidence did not match the verified submission text');
            }
        }
    }
    return result;
}

interface NormalizedText {
    text: string;
    /** map[i] = UTF-16 index in the original string of normalized character i. */
    map: number[];
}

/** Typographic variants folded to their ASCII equivalent before matching. */
const CANONICAL_CHARS = new Map<string, string>([
    ['‘', "'"], // left single quotation mark
    ['’', "'"], // right single quotation mark
    ['‚', "'"], // single low-9 quotation mark
    ['‛', "'"], // single high-reversed-9 quotation mark
    ['′', "'"], // prime
    ['“', '"'], // left double quotation mark
    ['”', '"'], // right double quotation mark
    ['„', '"'], // double low-9 quotation mark
    ['‟', '"'], // double high-reversed-9 quotation mark
    ['″', '"'], // double prime
    ['–', '-'], // en dash
    ['—', '-'], // em dash
    ['−', '-'] // minus sign
]);

const WHITESPACE = /\s/;

/**
 * Canonicalizes cosmetic variation (typographic quotes/dashes, whitespace runs)
 * while recording where every normalized character came from, so a normalized
 * match can be mapped back to an exact slice of the original string.
 *
 * The map uses JavaScript string indices (UTF-16 code units), matching persisted anchors
 * and browser selections; normalization is never used as the stored quote.
 */
function normalizeWithMap(source: string): NormalizedText {
    const chars: string[] = [];
    const map: number[] = [];
    let pendingSpace = false;
    // Indexed loop rather than for...of: iteration must advance one UTF-16 code
    // unit at a time so recorded indices stay slice()-compatible.
    for (let index = 0; index < source.length; index++) {
        const char = source[index];
        // Collapse whitespace runs to one space, and drop leading whitespace entirely.
        if (WHITESPACE.test(char)) {
            pendingSpace = chars.length > 0;
            continue;
        }
        if (pendingSpace) {
            // Anchor the collapsed space at the run's first surviving character.
            chars.push(' ');
            map.push(index);
            pendingSpace = false;
        }
        chars.push(CANONICAL_CHARS.get(char) ?? char);
        map.push(index);
    }
    return { text: chars.join(''), map };
}

/**
 * Tolerant counterpart to {@link validateExactEvidence}: when a model quote is
 * not an exact substring (curly quotes, dash variants, collapsed whitespace,
 * stray wrapping quotation marks), re-locate it in the verified text and
 * replace it with the exact original slice. The stored evidence therefore
 * always satisfies the exact-substring invariant; quotes that cannot be
 * re-located (paraphrase, truncation) still fail the run.
 *
 * @param result - Schema-validated model result whose quote typography may have drifted
 * @param verifiedText - Staff-verified source and final evidence authority
 * @returns Cloned feedback containing exact original source slices
 * @throws Error when a quote cannot be mapped back to verified text
 */
export function reconcileExactEvidence(result: WritingFeedbackResult, verifiedText: string): WritingFeedbackResult {
    // Normalize the source once, retaining an index back to every original code unit.
    const normalizedText = normalizeWithMap(verifiedText);
    const relocate = (quote: string): string | undefined => {
        if (verifiedText.includes(quote)) return quote;
        // Try conservative wrapper trimming before typography/whitespace normalization.
        const candidates = [quote, quote.trim(), quote.trim().replace(/^["'‘’“”]+|["'‘’“”]+$/g, '')];
        for (const candidate of candidates) {
            if (!candidate) continue;
            if (verifiedText.includes(candidate)) return candidate;
            const needle = normalizeWithMap(candidate).text;
            if (!needle) continue;
            let start = normalizedText.text.indexOf(needle);
            if (start === -1) start = normalizedText.text.toLowerCase().indexOf(needle.toLowerCase());
            if (start === -1) continue;
            // Persist the original slice, never the normalized approximation.
            const exact = verifiedText.slice(normalizedText.map[start], normalizedText.map[start + needle.length - 1] + 1);
            if (exact && verifiedText.includes(exact)) return exact;
        }
        return undefined;
    };
    const reconciled: WritingFeedbackResult = {
        ...result,
        criteria: result.criteria.map((criterion) => ({
            ...criterion,
            evidence: criterion.evidence.map((evidence) => {
                const exact = relocate(evidence.quote);
                if (exact === undefined) {
                    throw new Error('Feedback evidence did not match the verified submission text');
                }
                return { ...evidence, quote: exact };
            })
        }))
    };
    return validateExactEvidence(reconciled, verifiedText);
}

/**
 * resolveNumericGrade — averages criterion points only for a complete approved mapping.
 *
 * @param result - Feedback levels selected for all four criteria
 * @param gradeMapping - Instructor-authored points keyed by every supported level
 * @returns Two-decimal mean, or undefined when any required mapping is absent
 */
export function resolveNumericGrade(
    result: WritingFeedbackResult,
    gradeMapping: Record<string, number> | undefined
): number | undefined {
    if (!gradeMapping || result.criteria.some((criterion) => gradeMapping[criterion.suggestedLevel] === undefined)) {
        return undefined;
    }
    const points = result.criteria.map((criterion) => gradeMapping[criterion.suggestedLevel]!);
    return Math.round((points.reduce((sum, point) => sum + point, 0) / points.length) * 100) / 100;
}
