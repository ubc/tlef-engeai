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
import { computeReleaseFingerprint } from '../canvas-release-service';
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

    it('marks the submission released only while it is still the approved one that was sent', async () => {
        const { service, mongo, releaseService } = buildService([]);
        await service.release('course-1', 'submission-1', releaseService);
        expect(mongo.setWritingSubmissionStatus)
            .toHaveBeenCalledWith('course-1', 'submission-1', 'released', ['approved']);
    });

    // D-095: one combined document per submission. A lab report leads with the technical
    // analysis inside that PDF rather than arriving as a second attachment.
    it('sends one combined pdf, not one attachment per lens', async () => {
        const { service, releaseService } = buildService([]);
        await service.release('course-1', 'submission-1', releaseService);
        const [sent] = releaseService.release.mock.calls[0] as [{ artifacts: Array<{ kind: string; filename: string }> }];
        expect(sent.artifacts).toHaveLength(1);
        expect(sent.artifacts[0]).toMatchObject({ kind: 'writing', filename: 'writing-feedback-complete.pdf' });
    });

    it('sends a demo submission with no canvas identity to the coordinator', async () => {
        const { service, releaseService } = buildService([], { canvasUserId: undefined, sourceType: 'manual' });
        await service.release('course-1', 'submission-1', releaseService);
        expect(releaseService.release).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
    });
});

describe('queueing a release', () => {
    // The fingerprint the stored payload in these fixtures produces. Queueing refuses anything
    // else, so a fixture that means "this preview is current" has to carry exactly this.
    const CURRENT_FINGERPRINT = computeReleaseFingerprint({
        submissionId: 'submission-1',
        feedbackRunId: 'run-linguistic',
        rubricVersion: approvedAssignment().rubric.version
    });

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
        claimed?: boolean; // false plays the caller that lost the atomic claim
        stale?: boolean; // true leaves the stored preview hashing differently from the payload
    } = {}) {
        const assignment = approvedAssignment();
        const stored = options.stored && !options.stale
            ? { ...options.stored, payloadFingerprint: CURRENT_FINGERPRINT }
            : options.stored ?? null;
        const mongo = {
            getWritingSubmission: jest.fn(async () => submission(options.submissionOverrides ?? {})),
            getWritingAssignment: jest.fn(async () => assignment),
            listWritingReleases: jest.fn(async () => [] as WritingRelease[]),
            findActiveWritingJob: jest.fn(async () => options.activeJob ?? null),
            getLatestWritingRelease: jest.fn(async () => stored),
            claimWritingReleaseForQueue: jest.fn(async () => (
                options.claimed === false || !stored
                    ? null
                    : { ...stored, releaseLockedAt: new Date(), queuedByUserId: 'user-1' }
            )),
            releaseWritingReleaseLock: jest.fn(async () => stored),
            getLatestWritingFeedbackRun: jest.fn(async () => feedbackRun(assignment.rubric.version)),
            finalizeWritingRelease: jest.fn(async () => stored),
            enqueueWritingJob: jest.fn(async (input) => ({ ...input, id: 'job-1', attempts: 0 }))
        };
        const service = new WritingFeedbackService(mongo as unknown as EngEAI_MongoDB, { generate: jest.fn() });
        return { service, mongo };
    }

    it('records whose canvas credential the queued write will use', async () => {
        const { service, mongo } = buildQueueService({ stored: release('previewed') });
        const queued = await service.enqueueRelease('course-1', 'submission-1', 'user-1');
        expect(mongo.claimWritingReleaseForQueue).toHaveBeenCalledWith(CURRENT_FINGERPRINT, { queuedByUserId: 'user-1' });
        expect(queued.id).toBe('job-1');
    });

    it('stamps the job that owns the release, so the audit trail says which run carried it', async () => {
        const { service, mongo } = buildQueueService({ stored: release('previewed') });
        await service.enqueueRelease('course-1', 'submission-1', 'user-1');
        expect(mongo.finalizeWritingRelease)
            .toHaveBeenCalledWith(CURRENT_FINGERPRINT, { releaseJobId: 'job-1' });
    });

    // Two staff members pressing Release in the same second both pass the active-job check,
    // because neither job exists yet. Only the atomic claim separates them.
    it('refuses the caller that lost the claim rather than queueing a second canvas comment', async () => {
        const { service, mongo } = buildQueueService({ stored: release('previewed'), claimed: false });
        await expect(service.enqueueRelease('course-1', 'submission-1', 'user-2'))
            .rejects.toThrow('already in progress');
        expect(mongo.enqueueWritingJob).not.toHaveBeenCalled();
    });

    it('hands the loser the winner\'s job once that job exists', async () => {
        const { service, mongo } = buildQueueService({ stored: release('previewed'), claimed: false });
        // The winner's job appears between this caller's first look and its failed claim.
        mongo.findActiveWritingJob
            .mockImplementationOnce(async () => null)
            .mockImplementationOnce(async () => ({ id: 'job-winner' }));
        const queued = await service.enqueueRelease('course-1', 'submission-1', 'user-2');
        expect(queued.id).toBe('job-winner');
        expect(mongo.enqueueWritingJob).not.toHaveBeenCalled();
    });

    it('refuses to queue a release that already reached the student', async () => {
        const { service, mongo } = buildQueueService({ stored: release('released') });
        await expect(service.enqueueRelease('course-1', 'submission-1', 'user-1'))
            .rejects.toThrow('already been released');
        expect(mongo.enqueueWritingJob).not.toHaveBeenCalled();
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

    it('joins the winning job when the database refuses a duplicate queued release', async () => {
        const { service, mongo } = buildQueueService({ stored: release('previewed') });
        // The unique partial index is the last line of defence when two processes insert.
        mongo.enqueueWritingJob.mockRejectedValueOnce(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
        mongo.findActiveWritingJob
            .mockImplementationOnce(async () => null)
            .mockImplementationOnce(async () => ({ id: 'job-winner' }));

        const queued = await service.enqueueRelease('course-1', 'submission-1', 'user-1');

        expect(queued.id).toBe('job-winner');
    });

    it('refuses to queue a preview the feedback has moved on from', async () => {
        const { service, mongo } = buildQueueService({ stored: release('previewed'), stale: true });
        await expect(service.enqueueRelease('course-1', 'submission-1', 'user-1'))
            .rejects.toThrow('changed after it was previewed');
        expect(mongo.claimWritingReleaseForQueue).not.toHaveBeenCalled();
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

describe('running a queued release', () => {
    /**
     * buildWorkerService - a service whose queued release resolves to a stated adapter.
     *
     * @param options - The stored release record and what the worker's resolver answers with
     * @returns The service plus the adapter double the assertions read
     */
    function buildWorkerService(options: {
        stored: WritingRelease | null;
        resolution: { integration: 'canvas' | 'mock_canvas'; service: unknown } | { integration: 'none'; service: null; reason: string };
    }) {
        const assignment = approvedAssignment();
        const releaseService = {
            preview: jest.fn(async () => release('previewed')),
            release: jest.fn(async () => release('released'))
        };
        const resolution = options.resolution.service === null
            ? options.resolution
            : { ...options.resolution, service: releaseService };
        const mongo = {
            getWritingSubmission: jest.fn(async () => submission()),
            getWritingAssignment: jest.fn(async () => assignment),
            getLatestWritingFeedbackRun: jest.fn(async () => feedbackRun(assignment.rubric.version)),
            listWritingReleases: jest.fn(async () => [] as WritingRelease[]),
            getLatestWritingRelease: jest.fn(async () => options.stored),
            setWritingSubmissionStatus: jest.fn(async () => null),
            releaseWritingReleaseLock: jest.fn(async () => options.stored)
        };
        const resolveQueuedRelease = jest.fn(async () => resolution);
        const service = new WritingFeedbackService(
            mongo as unknown as EngEAI_MongoDB,
            { generate: jest.fn(async () => result) },
            { render: jest.fn(async () => Buffer.from('pdf')) },
            undefined,
            resolveQueuedRelease as never
        );
        return { service, releaseService, resolveQueuedRelease };
    }

    function queuedRelease(overrides: Partial<WritingRelease> = {}): WritingRelease {
        return {
            ...release('previewed'),
            queuedByUserId: 'user-1',
            integration: 'canvas',
            releaseLockedAt: new Date(),
            ...overrides
        };
    }

    // The fail-open this guards: a course whose Canvas link disappeared between preview and
    // worker resolves to the mock, which would finalize the release with synthetic ids while
    // nothing reached the real course.
    it('refuses to run a canvas release through the mock adapter', async () => {
        const { service, releaseService } = buildWorkerService({
            stored: queuedRelease(),
            resolution: { integration: 'mock_canvas', service: {} }
        });
        await expect(service.runQueuedRelease('course-1', 'submission-1'))
            .rejects.toThrow('no longer connected to Canvas');
        expect(releaseService.release).not.toHaveBeenCalled();
        expect(releaseService.preview).not.toHaveBeenCalled();
    });

    it('runs a mock release through the mock adapter, because that is what it was previewed as', async () => {
        const { service, releaseService } = buildWorkerService({
            stored: queuedRelease({ integration: 'mock_canvas' }),
            resolution: { integration: 'mock_canvas', service: {} }
        });
        await service.runQueuedRelease('course-1', 'submission-1');
        expect(releaseService.release).toHaveBeenCalled();
    });

    // The prepared PDFs and preflight a preview leaves behind are process-local, so the worker
    // rebuilds them from the same payload before releasing.
    it('rebuilds the preview in the worker before sending it', async () => {
        const { service, releaseService } = buildWorkerService({
            stored: queuedRelease(),
            resolution: { integration: 'canvas', service: {} }
        });
        await service.runQueuedRelease('course-1', 'submission-1');
        expect(releaseService.preview.mock.invocationCallOrder[0])
            .toBeLessThan(releaseService.release.mock.invocationCallOrder[0]);
    });

    it('stops with the resolver reason when no adapter can be built at all', async () => {
        const { service } = buildWorkerService({
            stored: queuedRelease(),
            resolution: { integration: 'none', service: null, reason: 'Reconnect your Canvas account' }
        });
        await expect(service.runQueuedRelease('course-1', 'submission-1'))
            .rejects.toThrow('Reconnect your Canvas account');
    });

    it('does nothing for a release that already landed', async () => {
        const { service, releaseService, resolveQueuedRelease } = buildWorkerService({
            stored: queuedRelease({ status: 'released' }),
            resolution: { integration: 'canvas', service: {} }
        });
        await service.runQueuedRelease('course-1', 'submission-1');
        expect(resolveQueuedRelease).not.toHaveBeenCalled();
        expect(releaseService.release).not.toHaveBeenCalled();
    });

    it('leaves a release parked for reconciliation to a human', async () => {
        const { service, releaseService } = buildWorkerService({
            stored: queuedRelease({ status: 'reconciliation_required' }),
            resolution: { integration: 'canvas', service: {} }
        });
        await service.runQueuedRelease('course-1', 'submission-1');
        expect(releaseService.release).not.toHaveBeenCalled();
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
