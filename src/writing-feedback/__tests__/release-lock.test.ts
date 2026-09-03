/**
 * Release lock tests — the cap, the revision number, and what may be resumed
 *
 * `release-cap.test.ts` pins the arithmetic; this suite pins the service that applies it. Staff
 * may correct feedback and release it again, so a completed release must not freeze a submission,
 * but each release adds a fresh Canvas comment and notifies the student, so the fifth is the last.
 * Attempts that never reached the student — a preview, a failure part-way — must stay resumable
 * and must not consume a revision.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Service-level coverage for the five-release cap, revision numbering, and resume.
 */

import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { approveRubricDraft } from '../rubric-schema';
import { MAX_SUBMISSION_RELEASES } from '../release-cap';
import type {
    CanvasReleaseInput,
    WritingAssignment,
    WritingFeedbackResult,
    WritingFeedbackRun,
    WritingRelease,
    WritingSubmission
} from '../contracts';
import { WritingFeedbackService } from '../writing-feedback-service';
import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';

const result: WritingFeedbackResult = { criteria: [], strengths: [], revisionGoals: [], internalFlags: [] };

function approvedAssignment(): WritingAssignment {
    const assignment = buildDefaultWritingAssignment('course-1', 'assignment-1', 'Local writing assignment');
    assignment.canvasAssignmentId = 'canvas-assignment-1';
    assignment.rubric = approveRubricDraft(assignment.rubric, 'instructor-1', new Date('2026-01-01T00:00:00.000Z'));
    return assignment;
}

/** An approved submission carrying a saved staff-final grade, as release requires. */
function submission(overrides: Partial<WritingSubmission> = {}): WritingSubmission {
    return {
        id: 'submission-1',
        courseId: 'course-1',
        assignmentId: 'assignment-1',
        studentId: 'local-student-1',
        canvasUserId: 'canvas-user-1',
        attempt: 1,
        sourceType: 'canvas_text',
        originalText: 'Verified student text.',
        verifiedText: 'Verified student text.',
        requiresVerification: false,
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

function feedbackRun(rubricVersion: number): WritingFeedbackRun {
    return {
        id: 'run-linguistic',
        courseId: 'course-1',
        assignmentId: 'assignment-1',
        submissionId: 'submission-1',
        profileVersion: 'test-profile',
        rubricVersion,
        lens: 'linguistic',
        result,
        createdAt: new Date(),
        modelMetadata: { engine: 'test', promptVersion: 'test' }
    };
}

function release(status: WritingRelease['status'], id = 'release-1'): WritingRelease {
    return {
        id,
        courseId: 'course-1',
        submissionId: 'submission-1',
        feedbackRunId: 'run-linguistic',
        payloadFingerprint: `fingerprint-${id}`,
        status,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

/**
 * buildService - a `WritingFeedbackService` over doubles, with a stated release history.
 *
 * @param priorReleases - Every release record the submission already has
 * @param submissionOverrides - Fields differing from the approved Canvas-imported default
 * @returns The service plus the release coordinator double, for call-shape assertions
 */
function buildService(priorReleases: WritingRelease[] = [], submissionOverrides: Partial<WritingSubmission> = {}) {
    const assignment = approvedAssignment();
    const mongo = {
        getWritingSubmission: jest.fn(async () => submission(submissionOverrides)),
        getWritingAssignment: jest.fn(async () => assignment),
        getLatestWritingFeedbackRun: jest.fn(async () => feedbackRun(assignment.rubric.version)),
        listWritingReleases: jest.fn(async () => priorReleases),
        getLatestWritingRelease: jest.fn(async () => priorReleases[priorReleases.length - 1] ?? null),
        setWritingSubmissionStatus: jest.fn(async () => null)
    };

    // The coordinator is a double: this suite is about which calls the service permits, not
    // about fingerprints or any Canvas write.
    const releaseService = {
        preview: jest.fn(async (input: CanvasReleaseInput) => ({
            ...release('previewed'),
            ...(input.revision !== undefined ? { revision: input.revision } : {})
        })),
        release: jest.fn(async (input: CanvasReleaseInput) => ({
            ...release('released'),
            ...(input.revision !== undefined ? { revision: input.revision } : {})
        }))
    };

    const engine = { generate: jest.fn(async () => result) };
    const pdfService = { render: jest.fn(async () => Buffer.from('pdf')) };
    const service = new WritingFeedbackService(mongo as unknown as EngEAI_MongoDB, engine, pdfService);
    return { service, mongo, releaseService };
}

describe('release preview cap', () => {
    // A manually created submission has no Canvas identity and never needed one: the local demo
    // gateway fabricates its own ids. Requiring one here made every demo release impossible,
    // which the browser pass caught. The live adapter still refuses, where it belongs.
    it('lets a submission with no canvas identity reach the coordinator', async () => {
        const { service, releaseService } = buildService([], { canvasUserId: undefined, sourceType: 'manual' });
        await service.previewRelease('course-1', 'submission-1', releaseService);
        expect(releaseService.preview).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
    });

    it('numbers a first release as revision one', async () => {
        const { service, releaseService } = buildService([]);
        await service.previewRelease('course-1', 'submission-1', releaseService);
        expect(releaseService.preview).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
    });

    it('allows a revised release after one has succeeded, numbered as the next revision', async () => {
        const { service, releaseService } = buildService([release('released')]);
        const preview = await service.previewRelease('course-1', 'submission-1', releaseService);
        expect(releaseService.preview).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }));
        expect(preview.revision).toBe(2);
    });

    it('does not spend a revision on an attempt that never reached the student', async () => {
        const { service, releaseService } = buildService([release('failed', 'r-failed'), release('previewed', 'r-prev')]);
        await service.previewRelease('course-1', 'submission-1', releaseService);
        expect(releaseService.preview).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
    });

    it('refuses a sixth release', async () => {
        const spent = Array.from({ length: MAX_SUBMISSION_RELEASES }, (_unused, index) => release('released', `r${index}`));
        const { service, releaseService } = buildService(spent);
        await expect(service.previewRelease('course-1', 'submission-1', releaseService))
            .rejects.toThrow('limit');
        expect(releaseService.preview).not.toHaveBeenCalled();
    });
});

describe('release cap', () => {
    it('lets any staff member resume a release that failed part-way', async () => {
        const { service, releaseService } = buildService([release('failed', 'r-failed')]);
        await expect(service.release('course-1', 'submission-1', releaseService)).resolves.toBeDefined();
        expect(releaseService.release).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
    });

    it('refuses to send a sixth release even when preview is bypassed', async () => {
        const spent = Array.from({ length: MAX_SUBMISSION_RELEASES }, (_unused, index) => release('released', `r${index}`));
        const { service, releaseService } = buildService(spent);
        await expect(service.release('course-1', 'submission-1', releaseService))
            .rejects.toThrow('limit');
        expect(releaseService.release).not.toHaveBeenCalled();
    });

    it('sends a demo submission with no canvas identity to the coordinator', async () => {
        const { service, releaseService } = buildService([], { canvasUserId: undefined, sourceType: 'manual' });
        await service.release('course-1', 'submission-1', releaseService);
        expect(releaseService.release).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
    });
});

describe('queueing a release', () => {
    /**
     * buildQueueService - a service whose Mongo doubles cover the enqueue path only.
     *
     * @param options - The stored release record and any already-queued job
     * @returns The service and the doubles the assertions read
     */
    function buildQueueService(options: {
        stored?: WritingRelease | null;
        activeJob?: { id: string } | null;
        submissionOverrides?: Partial<WritingSubmission>;
    } = {}) {
        const assignment = approvedAssignment();
        const mongo = {
            getWritingSubmission: jest.fn(async () => submission(options.submissionOverrides ?? {})),
            getWritingAssignment: jest.fn(async () => assignment),
            listWritingReleases: jest.fn(async () => [] as WritingRelease[]),
            findActiveWritingJob: jest.fn(async () => options.activeJob ?? null),
            getLatestWritingRelease: jest.fn(async () => options.stored ?? null),
            finalizeWritingRelease: jest.fn(async () => options.stored ?? null),
            enqueueWritingJob: jest.fn(async (input) => ({ ...input, id: 'job-1', attempts: 0 }))
        };
        const service = new WritingFeedbackService(mongo as unknown as EngEAI_MongoDB, { generate: jest.fn() });
        return { service, mongo };
    }

    it('records whose canvas credential the queued write will use', async () => {
        const { service, mongo } = buildQueueService({ stored: release('previewed') });
        const queued = await service.enqueueRelease('course-1', 'submission-1', 'user-1');
        expect(mongo.finalizeWritingRelease).toHaveBeenCalledWith('fingerprint-release-1', { queuedByUserId: 'user-1' });
        expect(queued.id).toBe('job-1');
    });

    it('queues one attempt, because an external write must not be retried blindly', async () => {
        const { service, mongo } = buildQueueService({ stored: release('previewed') });
        await service.enqueueRelease('course-1', 'submission-1', 'user-1');
        expect(mongo.enqueueWritingJob).toHaveBeenCalledWith(expect.objectContaining({ type: 'release', maxAttempts: 1 }));
    });

    it('joins the job already queued rather than scheduling a second comment', async () => {
        const { service, mongo } = buildQueueService({ stored: release('previewed'), activeJob: { id: 'job-existing' } });
        const queued = await service.enqueueRelease('course-1', 'submission-1', 'user-1');
        expect(queued.id).toBe('job-existing');
        expect(mongo.enqueueWritingJob).not.toHaveBeenCalled();
    });

    it('refuses to queue a release nobody previewed', async () => {
        const { service, mongo } = buildQueueService({ stored: null });
        await expect(service.enqueueRelease('course-1', 'submission-1', 'user-1'))
            .rejects.toThrow('Preview this release before sending it to Canvas');
        expect(mongo.enqueueWritingJob).not.toHaveBeenCalled();
    });

    it('refuses to queue a release parked for reconciliation', async () => {
        const { service, mongo } = buildQueueService({ stored: release('reconciliation_required') });
        await expect(service.enqueueRelease('course-1', 'submission-1', 'user-1'))
            .rejects.toThrow('Canvas returned an uncertain result');
        expect(mongo.enqueueWritingJob).not.toHaveBeenCalled();
    });

    it('refuses to queue a submission staff have not approved', async () => {
        const { service, mongo } = buildQueueService({
            stored: release('previewed'),
            submissionOverrides: { status: 'draft_ready' }
        });
        await expect(service.enqueueRelease('course-1', 'submission-1', 'user-1'))
            .rejects.toThrow('Staff approval is required');
        expect(mongo.enqueueWritingJob).not.toHaveBeenCalled();
    });
});

describe('submission detail', () => {
    it('reports how many releases have landed and what the cap is', async () => {
        const { service } = buildService([release('released', 'r0'), release('failed', 'r1')]);
        const detail = await service.detail('course-1', 'submission-1');
        expect(detail.releaseCount).toBe(1);
        expect(detail.maxReleases).toBe(MAX_SUBMISSION_RELEASES);
    });
});
