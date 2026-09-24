/**
 * Release cap — how many times one submission's feedback may reach Canvas
 *
 * Once (D-128, supersedes the five-release cap of D-090). Course staff release feedback a single
 * time: each release adds a **new** Canvas submission comment and notifies the student, and
 * released feedback cannot be edited anyway, so a correction is a new attempt rather than a
 * second comment on this one.
 *
 * The count is derived from the release records themselves, so nothing has to be kept in step.
 * Attempts that never reached the student — a preview, a failure part-way — do not count, so a
 * release that failed safely can still be retried.
 *
 * @author: EngE-AI Team
 * @version: 1.1.0
 * @description: Counts a submission's completed releases and assigns the next revision number.
 */

import type { WritingRelease } from './contracts';

/** Completed releases allowed per submission. */
export const MAX_SUBMISSION_RELEASES = 1;

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
    return 'This submission\'s feedback has already been released to Canvas, and feedback can be released only once. '
        + 'To send a correction, add or import a new attempt for this student.';
}
