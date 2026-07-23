/**
 * Anchored comments — exact-span feedback over verified student text
 *
 * Comments anchor to exact spans of the staff-verified submission text. Offsets are the
 * anchor source of truth; the stored quote is a checksum re-validated on every save so a
 * re-verified transcript can never silently mis-anchor staff feedback. Seeds are derived
 * from the immutable model run at read time and only persisted with a staff revision.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.0.0
 * @description: Validates, seeds, and stale-checks exact UTF-16 comment anchors.
 */

import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { A2CriterionId, AnchoredComment, WritingFeedbackRun } from './contracts';

const criterionIds = ['organization', 'content', 'interpersonal_positioning', 'task_constraints'] as const;

/** Rubric criterion → matrix function; task constraints have no matrix function. */
const CRITERION_FUNCTION_TAG: Partial<Record<A2CriterionId, AnchoredComment['functionTag']>> = {
    organization: 'organizational',
    content: 'content',
    interpersonal_positioning: 'interpersonal'
};

const httpUrl = z.string().trim().max(500).url().refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    { message: 'Course material links must use http or https' }
);

/**
 * Validated API shape for one staff-editable anchored comment.
 *
 * The 4,000-character quote allowance supports deliberate staff selections; generated
 * evidence is constrained separately to 280 characters before it becomes a seed.
 */
export const anchoredCommentInputSchema = z.object({
    id: z.string().trim().min(1).max(64),
    criterion: z.enum(criterionIds).optional(),
    // This checksum may represent a deliberate staff span; generated seeds are capped upstream.
    quote: z.string().min(1).max(4000),
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().min(1),
    comment: z.string().trim().min(1).max(2000),
    howToImprove: z.string().trim().min(1).max(2000).optional(),
    courseMaterialLink: httpUrl.optional(),
    glossaryDefinition: z.object({
        term: z.string().trim().min(1).max(80),
        definition: z.string().trim().min(1).max(600)
    }).optional(),
    origin: z.enum(['model_seed', 'staff']),
    functionTag: z.enum(['content', 'interpersonal', 'organizational']).optional(),
    levelTag: z.enum(['text', 'section', 'clause_word']).optional(),
    priority: z.enum(['high', 'medium', 'low']).optional()
}).refine((comment) => comment.endOffset > comment.startOffset, {
    message: 'Comment anchor must cover a non-empty span',
    path: ['endOffset']
});

/** Bounded working set accepted when a staff revision snapshots its comments. */
export const anchoredCommentsInputSchema = z.array(anchoredCommentInputSchema).max(50);

/** Validated request payload for one anchored comment. */
export type AnchoredCommentInput = z.infer<typeof anchoredCommentInputSchema>;

/** A stored comment plus a read-time flag marking anchors invalidated by re-verification. */
export type AnchoredCommentWithState = AnchoredComment & { stale?: boolean };

function anchorMatches(comment: AnchoredComment, verifiedText: string): boolean {
    // JavaScript string offsets are UTF-16 code units, matching the browser selection API.
    return comment.endOffset <= verifiedText.length
        && verifiedText.slice(comment.startOffset, comment.endOffset) === comment.quote;
}

/**
 * Derive an initial working set of comments from a model run's evidence quotes.
 * Quotes were validated as exact substrings at generation time; any quote no longer
 * present (defensive) is skipped. Duplicate quotes advance past the previous match so
 * each seed anchors a distinct span.
 *
 * @param run - Immutable model result containing validated evidence quotes
 * @param verifiedText - Current staff-verified anchor source
 * @returns Up to 50 transient model seeds in rubric order
 */
export function seedCommentsFromRun(run: WritingFeedbackRun, verifiedText: string): AnchoredComment[] {
    const seeds: AnchoredComment[] = [];
    const searchFrom = new Map<string, number>();
    for (const criterion of run.result.criteria) {
        for (const evidence of criterion.evidence) {
            const from = searchFrom.get(evidence.quote) ?? 0;
            const start = verifiedText.indexOf(evidence.quote, from);
            if (start === -1) continue;
            // Advance per quote so repeated evidence maps to successive occurrences.
            searchFrom.set(evidence.quote, start + evidence.quote.length);
            // Level and priority stay unset: they are staff decisions, never model-asserted.
            seeds.push({
                id: randomUUID(),
                criterion: criterion.criterion,
                quote: evidence.quote,
                startOffset: start,
                endOffset: start + evidence.quote.length,
                comment: evidence.rationale,
                howToImprove: criterion.explanation,
                origin: 'model_seed',
                ...(CRITERION_FUNCTION_TAG[criterion.criterion]
                    ? { functionTag: CRITERION_FUNCTION_TAG[criterion.criterion] }
                    : {})
            });
            if (seeds.length >= 50) return seeds;
        }
    }
    return seeds;
}

/**
 * validateAnchoredComments — rejects comments whose offsets and quote checksum diverge.
 *
 * @param comments - Complete comment snapshot proposed for a staff revision
 * @param verifiedText - Current staff-verified anchor source
 * @throws Error when any span is out of bounds or no longer matches exactly
 */
export function validateAnchoredComments(comments: AnchoredComment[], verifiedText: string): void {
    for (const comment of comments) {
        if (!anchorMatches(comment, verifiedText)) {
            throw new Error('Feedback comments no longer match the verified text');
        }
    }
}

/**
 * withStaleFlags — decorates invalidated anchors for staff review without persisting changes.
 *
 * @param comments - Stored comments from a prior review revision
 * @param verifiedText - Current staff-verified anchor source
 * @returns Cloned comments with `stale` set only where the checksum fails
 */
export function withStaleFlags(comments: AnchoredComment[], verifiedText: string): AnchoredCommentWithState[] {
    return comments.map((comment) => (
        anchorMatches(comment, verifiedText) ? { ...comment } : { ...comment, stale: true }
    ));
}
