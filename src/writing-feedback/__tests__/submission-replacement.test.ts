/**
 * Submission replacement tests — staff choice between a submission and a held newer attempt
 *
 * @author: EngE-AI Team
 * @date: 2026-09-16
 * @version: 1.0.0
 * @description: Guards and outcomes of SubmissionReplacementService.
 */

import type { WritingSubmission, WritingSubmissionStatus } from '../contracts';
import { REPLACEMENT_ERRORS, SubmissionReplacementService, type SubmissionReplacementStore } from '../submission-replacement';

function submission(overrides: Partial<WritingSubmission>): WritingSubmission {
    const now = new Date('2026-10-01T00:00:00.000Z');
    return {
        id: 'current', courseId: 'course-1', assignmentId: 'assignment-1', studentId: 'canvas-abc',
        attempt: 1, sourceType: 'canvas_text', originalText: 'text', requiresVerification: false,
        status: 'imported', slot: 'active', createdAt: now, updatedAt: now,
        ...overrides
    };
}

function store(currentStatus: WritingSubmissionStatus, options: { held?: boolean; unsettled?: boolean } = {}) {
    const current = submission({ status: currentStatus });
    const held = options.held === false ? null : submission({ id: 'held', attempt: 2, slot: 'held', replacesSubmissionId: 'current' });
    const fake: jest.Mocked<SubmissionReplacementStore> = {
        getWritingSubmission: jest.fn().mockResolvedValue(current),
        getHeldWritingReplacement: jest.fn().mockResolvedValue(held),
        hasUnsettledWritingWork: jest.fn().mockResolvedValue(Boolean(options.unsettled)),
        replaceWritingSubmission: jest.fn().mockResolvedValue(held && { ...held, slot: 'active' }),
        declineWritingReplacement: jest.fn().mockResolvedValue({ ...current, declinedAttempts: [2] })
    };
    return fake;
}

describe('SubmissionReplacementService', () => {
    it.each<WritingSubmissionStatus>(['imported', 'verification_needed', 'failed', 'draft_ready', 'approved'])(
        'deletes a %s submission when staff use the newer attempt',
        async (status) => {
            const fake = store(status);
            const result = await new SubmissionReplacementService(fake).resolve('course-1', 'current', 'use_newer');
            expect(result).toMatchObject({ id: 'held', slot: 'active' });
            expect(fake.replaceWritingSubmission).toHaveBeenCalledWith('course-1', 'current', 'held', false);
        }
    );

    it('keeps a released submission as superseded so its release history survives', async () => {
        const fake = store('released');
        await new SubmissionReplacementService(fake).resolve('course-1', 'current', 'use_newer');
        expect(fake.replaceWritingSubmission).toHaveBeenCalledWith('course-1', 'current', 'held', true);
    });

    it('refuses to replace a submission while feedback is generating', async () => {
        const fake = store('generating');
        await expect(new SubmissionReplacementService(fake).resolve('course-1', 'current', 'use_newer'))
            .rejects.toThrow(REPLACEMENT_ERRORS.generating);
        expect(fake.replaceWritingSubmission).not.toHaveBeenCalled();
    });

    it('refuses to replace a submission while a job or Canvas release is unsettled', async () => {
        const fake = store('approved', { unsettled: true });
        await expect(new SubmissionReplacementService(fake).resolve('course-1', 'current', 'use_newer'))
            .rejects.toThrow(REPLACEMENT_ERRORS.unsettled);
        expect(fake.replaceWritingSubmission).not.toHaveBeenCalled();
    });

    it('records the declined attempt when staff keep the current submission, even mid-generation', async () => {
        const fake = store('generating');
        const result = await new SubmissionReplacementService(fake).resolve('course-1', 'current', 'keep_current');
        expect(result.declinedAttempts).toEqual([2]);
        expect(fake.declineWritingReplacement).toHaveBeenCalledWith('course-1', 'current', { id: 'held', attempt: 2 });
    });

    it('reports when no newer attempt is waiting', async () => {
        await expect(new SubmissionReplacementService(store('imported', { held: false })).resolve('course-1', 'current', 'use_newer'))
            .rejects.toThrow(REPLACEMENT_ERRORS.nothingHeld);
    });

    it('treats a held or superseded row as not found', async () => {
        const fake = store('imported');
        fake.getWritingSubmission.mockResolvedValue(submission({ slot: 'held' }));
        await expect(new SubmissionReplacementService(fake).resolve('course-1', 'current', 'keep_current'))
            .rejects.toThrow(REPLACEMENT_ERRORS.notFound);
    });

    it('reports a concurrent change when the swap no longer applies', async () => {
        const fake = store('imported');
        fake.replaceWritingSubmission.mockResolvedValue(null);
        await expect(new SubmissionReplacementService(fake).resolve('course-1', 'current', 'use_newer'))
            .rejects.toThrow(REPLACEMENT_ERRORS.changed);
    });
});
