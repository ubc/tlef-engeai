/**
 * Canvas release service tests — preview, approval, and external-write guards
 *
 * Confirms that preview remains side-effect free and that an explicit staff
 * approval is mandatory before the release adapter can perform an external write.
 *
 * @author: @rdschrs
 * @date: 2026-07-13
 * @version: 1.0.0
 * @description: Safety regression coverage for staged Canvas feedback release.
 */

import { computeReleaseFingerprint, MockCanvasGateway, SafeCanvasReleaseService } from '../canvas-release-service';
import type { WritingFeedbackRun, WritingRelease, WritingSubmission } from '../contracts';
import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { approveRubricDraft } from '../rubric-schema';

const submission: WritingSubmission = {
    id: 'submission-1', courseId: 'course-1', assignmentId: 'assignment-1', studentId: 'student-1', attempt: 1,
    sourceType: 'manual', originalText: 'Verified text.', verifiedText: 'Verified text.', requiresVerification: false,
    status: 'draft_ready', createdAt: new Date(), updatedAt: new Date()
};
const assignment = buildDefaultWritingAssignment(
    'course-1',
    'assignment-1',
    'Local writing assignment'
);
assignment.rubric = approveRubricDraft(
    assignment.rubric,
    'instructor-1',
    new Date('2026-01-01T00:00:00.000Z')
);
const run: WritingFeedbackRun = {
    id: 'run-1', courseId: 'course-1', assignmentId: 'assignment-1', submissionId: 'submission-1', profileVersion: 'v1', rubricVersion: 1, createdAt: new Date(), modelMetadata: { engine: 'test', promptVersion: 'v1' },
    result: { criteria: [], strengths: [], revisionGoals: [], internalFlags: [] }
};

describe('Canvas release safeguards', () => {
    it('creates a dry-run preview without calling Canvas release', async () => {
        const gateway = new MockCanvasGateway();
        const release = jest.spyOn(gateway, 'release');
        const records = new Map<string, WritingRelease>();
        const service = new SafeCanvasReleaseService(
            gateway,
            async (fingerprint) => records.get(fingerprint) ?? null,
            async (record) => { const saved = { ...record, id: 'release-1', createdAt: new Date(), updatedAt: new Date() }; records.set(record.payloadFingerprint, saved); return saved; },
            async (fingerprint, update) => ({ ...(records.get(fingerprint) as WritingRelease), ...update, updatedAt: new Date() })
        );
        const preview = await service.preview({ submission, assignment, feedbackRun: run, pdf: Buffer.from('pdf') });
        expect(preview.status).toBe('previewed');
        expect(release).not.toHaveBeenCalled();
    });

    it('never releases a submission before explicit staff approval', async () => {
        const service = new SafeCanvasReleaseService(new MockCanvasGateway(), async () => null, async () => { throw new Error('not reached'); }, async () => null);
        await expect(service.release({ submission, assignment, feedbackRun: run, pdf: Buffer.from('pdf') })).rejects.toThrow('Staff approval is required');
    });

    it('reuses one preview when the same payload re-renders to different PDF bytes', async () => {
        const harness = buildRecordingService();
        // Renderer output varies per call (annotation UUIDs and timestamps), so
        // identical released content must still resolve to one release record.
        const first = await harness.service.preview({ submission, assignment, feedbackRun: run, pdf: Buffer.from('pdf-render-1'), studentFeedback: 'Approved narrative.' });
        const second = await harness.service.preview({ submission, assignment, feedbackRun: run, pdf: Buffer.from('pdf-render-2'), studentFeedback: 'Approved narrative.' });

        expect(second.payloadFingerprint).toBe(first.payloadFingerprint);
        expect(harness.records.size).toBe(1);
        expect(harness.saves).toBe(1);
    });

    it('creates a distinct release when staff re-approve edited student feedback', async () => {
        const { service, records } = buildRecordingService();
        const first = await service.preview({ submission, assignment, feedbackRun: run, pdf: Buffer.from('pdf'), studentFeedback: 'First narrative.' });
        const second = await service.preview({ submission, assignment, feedbackRun: run, pdf: Buffer.from('pdf'), studentFeedback: 'Revised narrative.' });

        expect(second.payloadFingerprint).not.toBe(first.payloadFingerprint);
        expect(records.size).toBe(2);
    });
});

describe('computeReleaseFingerprint', () => {
    const payload = {
        submissionId: 'submission-1',
        feedbackRunId: 'run-1',
        rubricVersion: 1,
        grade: 80,
        studentFeedback: 'Approved narrative.'
    };

    it('is stable across repeated calls for an identical payload', () => {
        expect(computeReleaseFingerprint(payload)).toBe(computeReleaseFingerprint({ ...payload }));
    });

    it('changes for every field that alters what a student receives', () => {
        const baseline = computeReleaseFingerprint(payload);
        expect(computeReleaseFingerprint({ ...payload, submissionId: 'submission-2' })).not.toBe(baseline);
        expect(computeReleaseFingerprint({ ...payload, feedbackRunId: 'run-2' })).not.toBe(baseline);
        expect(computeReleaseFingerprint({ ...payload, rubricVersion: 2 })).not.toBe(baseline);
        expect(computeReleaseFingerprint({ ...payload, grade: 81 })).not.toBe(baseline);
        expect(computeReleaseFingerprint({ ...payload, studentFeedback: 'Other.' })).not.toBe(baseline);
    });

    it('separates an absent optional value from an empty one', () => {
        expect(computeReleaseFingerprint({ ...payload, studentFeedback: undefined }))
            .not.toBe(computeReleaseFingerprint({ ...payload, studentFeedback: '' }));
        expect(computeReleaseFingerprint({ ...payload, grade: undefined }))
            .not.toBe(computeReleaseFingerprint({ ...payload, grade: 0 }));
    });
});

/** Release coordinator over an in-memory fingerprint store that counts inserts. */
function buildRecordingService(): { service: SafeCanvasReleaseService; records: Map<string, WritingRelease>; saves: number } {
    const records = new Map<string, WritingRelease>();
    const state = { saves: 0 };
    const service = new SafeCanvasReleaseService(
        new MockCanvasGateway(),
        async (fingerprint) => records.get(fingerprint) ?? null,
        async (record) => {
            state.saves += 1;
            const saved = { ...record, id: `release-${state.saves}`, createdAt: new Date(), updatedAt: new Date() };
            records.set(record.payloadFingerprint, saved);
            return saved;
        },
        async (fingerprint, update) => ({ ...(records.get(fingerprint) as WritingRelease), ...update, updatedAt: new Date() })
    );
    return { service, records, get saves() { return state.saves; } };
}
