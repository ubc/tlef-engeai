/**
 * Queued release tests — the worker path, and what it refuses to retry
 *
 * A live release writes to Canvas long after the staff member has closed the page, so it runs on
 * the job queue with their stored credential. The rules that matter here are the ones a generic
 * retry would break: a release parked for reconciliation must be left alone, a missing credential
 * must say who has to reconnect, and a failure message must not carry submission content.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for the release job handler, its refusals, and its sanitized failures.
 */

import { MongoWritingFeedbackJobRunner, SanitizedJobError } from '../job-runner';
import { WritingFeedbackService } from '../writing-feedback-service';
import type {
    CanvasReleaseService,
    WritingJob,
    WritingRelease,
    WritingSubmission
} from '../contracts';
import type { QueuedReleaseResolution } from '../queued-release-service';
import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';

function release(overrides: Partial<WritingRelease> = {}): WritingRelease {
    return {
        id: 'release-1',
        courseId: 'course-1',
        submissionId: 'submission-1',
        feedbackRunId: 'run-1',
        payloadFingerprint: 'fingerprint-1',
        status: 'previewed',
        queuedByUserId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

function job(overrides: Partial<WritingJob> = {}): WritingJob {
    return {
        id: 'job-1',
        courseId: 'course-1',
        type: 'release',
        state: 'leased',
        attempts: 1,
        maxAttempts: 1,
        payload: { submissionId: 'submission-1' },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

/**
 * buildService - a service whose queued release resolves to a stated coordinator.
 *
 * @param stored - The release record the worker will reload
 * @param resolution - What the off-request adapter resolution returns
 * @returns The service, its release coordinator double, and the Mongo doubles
 */
function buildService(stored: WritingRelease | null, resolution?: QueuedReleaseResolution) {
    const coordinator = {
        preview: jest.fn(),
        release: jest.fn(async () => release({ status: 'released' }))
    } as unknown as CanvasReleaseService & { release: jest.Mock };

    const resolved: QueuedReleaseResolution = resolution
        ?? { integration: 'canvas', service: coordinator };
    const resolveQueuedRelease = jest.fn(async () => resolved);

    const mongo = {
        getLatestWritingRelease: jest.fn(async () => stored),
        // `release` itself is exercised in the service suites; here it only has to be reachable.
        getWritingSubmission: jest.fn(async (): Promise<WritingSubmission | null> => null)
    };

    const service = new WritingFeedbackService(
        mongo as unknown as EngEAI_MongoDB,
        { generate: jest.fn() },
        { render: jest.fn(async () => Buffer.from('pdf')) },
        undefined,
        resolveQueuedRelease as unknown as typeof import('../queued-release-service').resolveQueuedReleaseService
    );
    return { service, coordinator, mongo, resolveQueuedRelease };
}

describe('queued release handler', () => {
    it('runs a queued release as the staff member who queued it', async () => {
        const { service, resolveQueuedRelease, coordinator } = buildService(release());
        // The submission lookup inside `release` is not the subject here; stop after the
        // coordinator has been resolved for the right person.
        await service.runQueuedRelease('course-1', 'submission-1').catch(() => undefined);
        expect(resolveQueuedRelease).toHaveBeenCalledWith(expect.anything(), 'course-1', 'user-1');
        expect(coordinator.release).not.toHaveBeenCalled(); // the submission double returns null
    });

    it('fails with a reconnect message when the credential is gone', async () => {
        const { service } = buildService(release(), {
            integration: 'none',
            service: null,
            reason: 'Canvas rejected the stored authorization for the staff member who queued this release. '
                + 'Ask them to reconnect Canvas and release it again.'
        });
        await expect(service.runQueuedRelease('course-1', 'submission-1'))
            .rejects.toThrow(/reconnect Canvas/);
        await expect(service.runQueuedRelease('course-1', 'submission-1'))
            .rejects.toBeInstanceOf(SanitizedJobError);
    });

    it('does not retry a release parked for reconciliation', async () => {
        const { service, resolveQueuedRelease } = buildService(release({ status: 'reconciliation_required' }));
        await expect(service.runQueuedRelease('course-1', 'submission-1')).resolves.toBeUndefined();
        expect(resolveQueuedRelease).not.toHaveBeenCalled();
    });

    it('treats an already-released submission as nothing left to do', async () => {
        const { service, resolveQueuedRelease } = buildService(release({ status: 'released' }));
        await expect(service.runQueuedRelease('course-1', 'submission-1')).resolves.toBeUndefined();
        expect(resolveQueuedRelease).not.toHaveBeenCalled();
    });

    it('refuses a release queued without a staff canvas account', async () => {
        const { service } = buildService(release({ queuedByUserId: undefined }));
        await expect(service.runQueuedRelease('course-1', 'submission-1'))
            .rejects.toThrow(/release it again from the review page/);
    });
});

describe('job runner failure text', () => {
    it('persists a handler-sanitized message rather than the generic one', async () => {
        const failWritingJob = jest.fn(async () => null);
        const mongo = {
            leaseNextWritingJob: jest.fn(async () => job()),
            completeWritingJob: jest.fn(async () => null),
            failWritingJob
        } as unknown as EngEAI_MongoDB;
        const runner = new MongoWritingFeedbackJobRunner(mongo, {
            release: async () => { throw new SanitizedJobError('Ask them to reconnect Canvas and release it again.'); }
        });

        await runner.runNext();

        expect(failWritingJob).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'job-1' }),
            'Ask them to reconnect Canvas and release it again.'
        );
    });

    it('still hides an unvetted error, which may quote submission text', async () => {
        const failWritingJob = jest.fn(async () => null);
        const mongo = {
            leaseNextWritingJob: jest.fn(async () => job()),
            completeWritingJob: jest.fn(async () => null),
            failWritingJob
        } as unknown as EngEAI_MongoDB;
        const runner = new MongoWritingFeedbackJobRunner(mongo, {
            release: async () => { throw new Error('provider said: "the student wrote ..."'); }
        });

        await runner.runNext();

        expect(failWritingJob).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'job-1' }),
            'Writing feedback job failed'
        );
    });

    it('completes a release job whose handler returned without writing', async () => {
        const completeWritingJob = jest.fn(async () => null);
        const mongo = {
            leaseNextWritingJob: jest.fn(async () => job()),
            completeWritingJob,
            failWritingJob: jest.fn(async () => null)
        } as unknown as EngEAI_MongoDB;
        const runner = new MongoWritingFeedbackJobRunner(mongo, { release: async () => undefined });

        await runner.runNext();

        expect(completeWritingJob).toHaveBeenCalledWith('job-1');
    });
});
