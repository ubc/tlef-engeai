/**
 * Submission replacement — staff choice between a student's submission and a newer attempt
 *
 * A Canvas sync stores a resubmission `held` beside the student's active submission. This
 * service applies the staff decision: use the newer attempt, or keep the current one. The
 * confirmation staff see before choosing lives in the workspace; this layer enforces what must
 * hold regardless of what the client asked.
 *
 * @author: EngE-AI Team
 * @date: 2026-09-16
 * @version: 1.0.0
 * @description: Replaces or keeps a student's active Writing Feedback submission.
 */

import type { WritingReplacementDecision, WritingSubmission } from './contracts';

/** Persistence the replacement decision needs; implemented by `EngEAI_MongoDB`. */
export interface SubmissionReplacementStore {
    getWritingSubmission(courseId: string, submissionId: string): Promise<WritingSubmission | null>;
    getHeldWritingReplacement(courseId: string, submissionId: string): Promise<WritingSubmission | null>;
    hasUnsettledWritingWork(courseId: string, submissionId: string): Promise<boolean>;
    replaceWritingSubmission(courseId: string, currentId: string, heldId: string, keepReplaced: boolean): Promise<WritingSubmission | null>;
    declineWritingReplacement(courseId: string, currentId: string, held: { id: string; attempt: number }): Promise<WritingSubmission | null>;
}

/** Refusals staff can read and act on; the route passes these through unchanged. */
export const REPLACEMENT_ERRORS = {
    notFound: 'Writing submission not found',
    nothingHeld: 'No newer attempt is waiting for this submission',
    generating: 'Wait for feedback generation to finish before replacing this submission',
    unsettled: 'Wait for the running job or Canvas release to finish before replacing this submission',
    changed: 'The submission changed while you were choosing; reload and try again'
} as const;

/** Refusals that mean "try again later" rather than "bad request". */
export const REPLACEMENT_CONFLICTS: ReadonlyArray<string> = [
    REPLACEMENT_ERRORS.nothingHeld,
    REPLACEMENT_ERRORS.generating,
    REPLACEMENT_ERRORS.unsettled,
    REPLACEMENT_ERRORS.changed
];

/**
 * Applies staff decisions about held newer attempts.
 */
export class SubmissionReplacementService {
    constructor(private readonly store: SubmissionReplacementStore) {}

    /**
     * resolve — replaces the active submission with the held attempt, or discards the held one.
     *
     * `use_newer` deletes the current submission with its drafts and reviews, except when its
     * feedback was already released: that row is kept superseded, out of the queue, so its
     * Canvas release history survives. It is refused while generation, a queued job, or a
     * Canvas release is still in progress for the current submission.
     *
     * `keep_current` deletes the held attempt and records its number so sync skips it.
     *
     * @param courseId - Owning course id
     * @param submissionId - The student's active submission
     * @param decision - Which attempt staff chose
     * @returns The submission now active for the student
     * @throws Error with a {@link REPLACEMENT_ERRORS} message when the decision cannot apply
     */
    async resolve(courseId: string, submissionId: string, decision: WritingReplacementDecision): Promise<WritingSubmission> {
        // Step 1: both rows must still be in the state staff saw.
        const current = await this.store.getWritingSubmission(courseId, submissionId);
        if (!current || (current.slot ?? 'active') !== 'active') throw new Error(REPLACEMENT_ERRORS.notFound);
        const held = await this.store.getHeldWritingReplacement(courseId, submissionId);
        if (!held) throw new Error(REPLACEMENT_ERRORS.nothingHeld);

        if (decision === 'keep_current') {
            const kept = await this.store.declineWritingReplacement(courseId, current.id, { id: held.id, attempt: held.attempt });
            if (!kept) throw new Error(REPLACEMENT_ERRORS.changed);
            return kept;
        }

        // Step 2: never pull a row out from under a worker or a half-written Canvas release.
        if (current.status === 'generating') throw new Error(REPLACEMENT_ERRORS.generating);
        if (await this.store.hasUnsettledWritingWork(courseId, current.id)) throw new Error(REPLACEMENT_ERRORS.unsettled);

        // Step 3: swap; released feedback keeps its row for the release record.
        const promoted = await this.store.replaceWritingSubmission(courseId, current.id, held.id, current.status === 'released');
        if (!promoted) throw new Error(REPLACEMENT_ERRORS.changed);
        return promoted;
    }
}
