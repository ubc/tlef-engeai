/**
 * Summary edits — validation for staff-edited summary sections (D-126)
 *
 * @author: @rdschrs
 * @date: 2026-09-13
 * @version: 1.0.0
 * @description: Request schema and run-binding checks for StaffReviewRevision.summaryEdits.
 */

import { z } from 'zod';
import type { StaffSummaryEdit, WritingFeedbackLens, WritingFeedbackRun } from './contracts';

export const SUMMARY_CHANGED_MESSAGE = 'The summary changed since you opened it. Reload and try again.';
const INVALID_MESSAGE = 'Summary edits failed validation';

/** Bounded request shape for `POST …/reviews` `summaryEdits`. */
export const summaryEditsInputSchema = z.array(z.object({
    lens: z.enum(['linguistic', 'technical']),
    feedbackRunId: z.string().trim().min(1).max(64),
    strengths: z.array(z.string().trim().min(1).max(600)).max(5),
    criterionExplanations: z.array(z.object({
        criterion: z.string().trim().min(1).max(64),
        explanation: z.string().trim().min(1).max(4000)
    })).max(10),
    revisionGoalsText: z.string().trim().min(1).max(30000).optional()
})).max(2);

/**
 * assertSummaryEditsBound - refuses edits that do not match the runs staff are looking at.
 *
 * @param edits - Parsed edits
 * @param latestRuns - Latest run per lens
 * @throws Error `SUMMARY_CHANGED_MESSAGE` for a stale run; `Summary edits failed validation` otherwise
 */
export function assertSummaryEditsBound(
    edits: StaffSummaryEdit[],
    latestRuns: Partial<Record<WritingFeedbackLens, WritingFeedbackRun | null>>
): void {
    const seen = new Set<WritingFeedbackLens>();
    for (const edit of edits) {
        if (seen.has(edit.lens)) throw new Error(INVALID_MESSAGE);
        seen.add(edit.lens);
        if (edit.lens === 'linguistic' && edit.revisionGoalsText !== undefined) throw new Error(INVALID_MESSAGE);
        const run = latestRuns[edit.lens];
        if (!run || run.id !== edit.feedbackRunId) throw new Error(SUMMARY_CHANGED_MESSAGE);
        const criteria = new Set(run.result.criteria.map((criterion) => criterion.criterion));
        if (edit.criterionExplanations.some((item) => !criteria.has(item.criterion))) throw new Error(INVALID_MESSAGE);
    }
}
