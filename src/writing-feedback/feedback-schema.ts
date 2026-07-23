/**
 * Feedback schema — structured model validation and exact-evidence reconciliation
 *
 * Validates the complete four-criterion A2 result and constrains generated evidence to a
 * focused clause or sentence. Cosmetic model drift may be reconciled through a UTF-16
 * source map, but paraphrases and unmatched evidence fail instead of being invented.
 *
 * @author: @rdschrs
 * @date: 2026-07-18
 * @version: 1.0.0
 * @description: Enforces structured A2 output, exact evidence, and safe numeric mapping.
 */

import { z } from 'zod';
import type { A2FeedbackResult } from './contracts';

const level = z.enum(['emerging', 'developing', 'competent', 'strong']);

/** Maximum model evidence span so seeded annotations stay clause- or sentence-focused. */
export const MAX_EVIDENCE_QUOTE_LENGTH = 280;

/** Structured-output contract for one complete, bounded A2 model draft. */
export const a2FeedbackSchema = z.object({
    criteria: z.array(z.object({
        criterion: z.enum(['organization', 'content', 'interpersonal_positioning', 'task_constraints']),
        suggestedLevel: level,
        evidence: z.array(z.object({
            quote: z.string().min(1).max(MAX_EVIDENCE_QUOTE_LENGTH),
            rationale: z.string().min(1)
        })).min(1),
        explanation: z.string().min(1),
        confidence: z.number().min(0).max(1)
    })).length(4),
    strengths: z.array(z.string().min(1)).max(5),
    revisionGoals: z.array(z.object({
        skillTag: z.string().min(1),
        goal: z.string().min(1),
        guidedQuestion: z.string().min(1)
    })).max(3),
    internalFlags: z.array(z.string()).max(8)
}).superRefine((feedback, ctx) => {
    // Array length alone is insufficient: require every criterion exactly once.
    const criterionIds = feedback.criteria.map((criterion) => criterion.criterion);
    if (new Set(criterionIds).size !== 4) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Feedback must contain each A2 criterion exactly once',
            path: ['criteria']
        });
    }
});

/**
 * validateExactEvidence — enforces the no-invented-evidence invariant.
 *
 * @param result - Structured feedback result to validate
 * @param verifiedText - Staff-verified source text
 * @returns The unchanged result when every quote is an exact substring
 * @throws Error when any quote is absent from the verified source
 */
export function validateExactEvidence(result: A2FeedbackResult, verifiedText: string): A2FeedbackResult {
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

const QUOTE_SINGLE = /[‘’‚‛′]/;
const QUOTE_DOUBLE = /[“”„‟″]/;
const DASH = /[–—−]/;

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
    for (let index = 0; index < source.length; index++) {
        let char = source[index];
        if (/\s/.test(char)) {
            pendingSpace = chars.length > 0;
            continue;
        }
        if (QUOTE_SINGLE.test(char)) char = "'";
        else if (QUOTE_DOUBLE.test(char)) char = '"';
        else if (DASH.test(char)) char = '-';
        if (pendingSpace) {
            chars.push(' ');
            map.push(index);
            pendingSpace = false;
        }
        chars.push(char);
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
export function reconcileExactEvidence(result: A2FeedbackResult, verifiedText: string): A2FeedbackResult {
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
    const reconciled: A2FeedbackResult = {
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
    result: A2FeedbackResult,
    gradeMapping: Partial<Record<'emerging' | 'developing' | 'competent' | 'strong', number>> | undefined
): number | undefined {
    if (!gradeMapping || result.criteria.some((criterion) => gradeMapping[criterion.suggestedLevel] === undefined)) {
        return undefined;
    }
    const points = result.criteria.map((criterion) => gradeMapping[criterion.suggestedLevel]!);
    return Math.round((points.reduce((sum, point) => sum + point, 0) / points.length) * 100) / 100;
}
