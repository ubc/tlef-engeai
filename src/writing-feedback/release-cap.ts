/**
 * Release cap — how many times one submission's feedback may reach Canvas
 *
 * The first release is not final. Staff correct mistakes, and a rule that froze feedback at the
 * first push would turn a typo into an unfixable one, so a submission may be released again with
 * revised feedback.
 *
 * It is capped because each release adds a **new** Canvas submission comment rather than
 * replacing the previous one, and Canvas notifies the student every time. Five is enough for any
 * genuine correction and low enough that an accidental loop cannot bury a student in
 * notifications. The rubric and the grade do overwrite; only the comments accumulate.
 *
 * The count is derived from the release records themselves, so nothing has to be kept in step.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Counts a submission's completed releases and assigns the next revision number.
 */

import type { WritingRelease } from './contracts';

/** Completed releases allowed per submission. */
export const MAX_SUBMISSION_RELEASES = 5;

/**
 * Statuses that mean feedback actually reached the student.
 *
 * A failed or previewed attempt cost the student nothing and must not consume a revision;
 * `reconciliation_required` is deliberately excluded too, because its whole meaning is that
 * nobody yet knows whether Canvas accepted it.
 */
const COMPLETED: ReadonlyArray<WritingRelease['status']> = ['released', 'reconciled'];

/**
 * countCompletedReleases - how many times this submission's feedback has landed in Canvas.
 *
 * @param releases - Every release record for one submission
 * @returns The number that reached the student
 */
export function countCompletedReleases(releases: ReadonlyArray<WritingRelease>): number {
    return releases.filter((release) => COMPLETED.includes(release.status)).length;
}

/**
 * nextReleaseRevision - the revision number a new release would carry.
 *
 * @param releases - Every release record for one submission
 * @returns The next revision number, or `null` when the cap has been reached
 */
export function nextReleaseRevision(releases: ReadonlyArray<WritingRelease>): number | null {
    const completed = countCompletedReleases(releases);
    return completed >= MAX_SUBMISSION_RELEASES ? null : completed + 1;
}

/** Staff-facing sentence for a submission that has used every revision. */
export function releaseCapMessage(): string {
    return `This submission's feedback has already been released ${MAX_SUBMISSION_RELEASES} times, `
        + 'which is the limit. Releasing again would add another comment to the student\'s Canvas submission.';
}
