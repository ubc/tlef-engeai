/**
 * Transcript edits — which feedback and staff revisions still match the submission text
 *
 * Staff can correct a submission's confirmed text after feedback exists. Every model finding and
 * staff annotation is anchored to character offsets in that text, so anything produced before
 * the edit no longer lines up: runs must be generated again, and older revisions' annotations are
 * no longer loaded. `WritingSubmission.transcriptEditedAt` marks the boundary.
 *
 * @author: EngE-AI Team
 * @date: 2026-09-17
 * @version: 1.0.0
 * @description: Pure rules separating feedback made for the current text from feedback made for an older one.
 */

import type { StaffReviewRevision, WritingFeedbackRun, WritingSubmission } from './contracts';

/** Refusal shown when feedback made for the old text would be approved, redrafted, saved, or released. */
export const TEXT_EDITED_MESSAGE = 'The submission text was edited after this feedback was generated. Generate feedback again first.';

/** Edits the confirmed text may be made in; generating and released submissions are excluded. */
export const TRANSCRIPT_EDITABLE_STATUSES = ['imported', 'failed', 'draft_ready', 'approved'] as const;

function editedAt(submission: Pick<WritingSubmission, 'transcriptEditedAt'>): number | null {
    return submission.transcriptEditedAt ? new Date(submission.transcriptEditedAt).getTime() : null;
}

/**
 * runPredatesTextEdit - whether a feedback run was generated for text staff have since edited.
 *
 * @param submission - Submission carrying the last edit time
 * @param run - Run to check; absent runs never predate anything
 * @returns True when the run was created at or before the last edit
 */
export function runPredatesTextEdit(
    submission: Pick<WritingSubmission, 'transcriptEditedAt'>,
    run: Pick<WritingFeedbackRun, 'createdAt'> | null | undefined
): boolean {
    const edit = editedAt(submission);
    return edit !== null && Boolean(run) && new Date(run!.createdAt).getTime() <= edit;
}

/**
 * reviewsSinceTextEdit - the staff revisions saved against the current text.
 *
 * @param submission - Submission with its revision history and last edit time
 * @returns Revisions created after the last edit, oldest first; all of them when never edited
 */
export function reviewsSinceTextEdit(
    submission: Pick<WritingSubmission, 'transcriptEditedAt'> & { reviews?: StaffReviewRevision[] }
): StaffReviewRevision[] {
    const reviews = submission.reviews ?? [];
    const edit = editedAt(submission);
    if (edit === null) return reviews;
    return reviews.filter((review) => new Date(review.createdAt).getTime() > edit);
}
