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

import { MockCanvasGateway, SafeCanvasReleaseService } from '../canvas-release-service';
import type { WritingFeedbackRun, WritingRelease, WritingSubmission } from '../contracts';
import { buildA2Assignment } from '../a2-profile';

const submission: WritingSubmission = {
    id: 'submission-1', courseId: 'course-1', assignmentId: 'assignment-1', studentId: 'student-1', attempt: 1,
    sourceType: 'manual', originalText: 'Verified text.', verifiedText: 'Verified text.', requiresVerification: false,
    status: 'draft_ready', createdAt: new Date(), updatedAt: new Date()
};
const assignment = buildA2Assignment('course-1', 'assignment-1');
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
});
