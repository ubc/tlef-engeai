/**
 * Release cap tests — a submission may be revised, but not indefinitely
 *
 * Feedback can be corrected and sent again, so the first release is not final. It is capped at
 * five because each release adds a fresh Canvas submission comment and notifies the student, and
 * an accidental loop would bury them. The revision number is what the review page shows staff so
 * a re-released submission is visible as such without opening its history.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for the five-release cap and the revision number it assigns.
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

    it('counts only releases that actually reached the student', () => {
        const attempts = [
            release('released'),
            release('failed'),
            release('previewed'),
            release('reconciliation_required'),
            release('reconciled')
        ];
        // released + reconciled are the two that landed; the rest never did.
        expect(nextReleaseRevision(attempts)).toBe(3);
    });

    it('returns null once the cap is reached', () => {
        const five = Array.from({ length: MAX_SUBMISSION_RELEASES }, () => release('released'));
        expect(nextReleaseRevision(five)).toBeNull();
    });

    it('allows exactly five', () => {
        const four = Array.from({ length: 4 }, () => release('released'));
        expect(nextReleaseRevision(four)).toBe(MAX_SUBMISSION_RELEASES);
    });

    it('caps at five, not five per status', () => {
        const mixed = [
            ...Array.from({ length: 3 }, () => release('released')),
            ...Array.from({ length: 2 }, () => release('reconciled')),
            release('failed')
        ];
        expect(nextReleaseRevision(mixed)).toBeNull();
    });
});
