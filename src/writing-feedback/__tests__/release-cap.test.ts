/**
 * Release cap tests — a submission's feedback reaches Canvas once (D-128)
 *
 * Course staff release feedback exactly once. A correction is a new attempt, not a second
 * Canvas comment on the same one. Attempts that never reached the student do not count.
 *
 * @author: EngE-AI Team
 * @version: 1.1.0
 * @description: Coverage for the single-release cap and the revision number it assigns.
 */

import { MAX_SUBMISSION_RELEASES, nextReleaseRevision } from '../release-cap';
import type { WritingRelease } from '../contracts';

function release(status: WritingRelease['status']): WritingRelease {
    return {
        id: 'r', courseId: 'course-1', submissionId: 'sub-1',
        feedbackRunId: 'run-1', payloadFingerprint: 'f',
        status, createdAt: new Date(), updatedAt: new Date()
    };
}

describe('nextReleaseRevision', () => {
    it('numbers a first release as revision one', () => {
        expect(nextReleaseRevision([])).toBe(1);
    });

    it('allows exactly one release per submission', () => {
        expect(MAX_SUBMISSION_RELEASES).toBe(1);
    });

    it('does not count attempts that never reached the student', () => {
        const attempts = [release('failed'), release('previewed'), release('reconciliation_required')];
        expect(nextReleaseRevision(attempts)).toBe(1);
    });

    it('refuses a second release once one has landed, whether released or reconciled', () => {
        expect(nextReleaseRevision([release('released')])).toBeNull();
        expect(nextReleaseRevision([release('reconciled')])).toBeNull();
    });
});
