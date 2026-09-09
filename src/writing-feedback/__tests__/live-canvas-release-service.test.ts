import { canvas } from '@ubc/ubc-genai-toolkit-lms-integration';
import type { CanvasReleaseInput, WritingRelease, WritingSubmission } from '../contracts';
import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { approveRubricDraft } from '../rubric-schema';
import { buildStaffFinalAssessment } from '../staff-final-assessment';
import { LiveCanvasReleaseService } from '../live-canvas-release-service';
import { computeReleaseFingerprint } from '../canvas-release-service';

const assignment = buildDefaultWritingAssignment('course-1', 'assignment-1', 'Canvas assignment');
assignment.rubric = approveRubricDraft(assignment.rubric, 'staff-1');
assignment.canvasAssignmentId = '88';

const assessment = buildStaffFinalAssessment({
    rubricVersion: assignment.rubric.version,
    criteria: assignment.rubric.criteria.map((criterion) => ({
        criterionId: criterion.id,
        points: criterion.points ?? 0
    }))
}, assignment.rubric);

function input(id: string): CanvasReleaseInput {
    const submission: WritingSubmission = {
        id,
        courseId: 'course-1',
        assignmentId: assignment.id,
        studentId: `hashed-${id}`,
        canvasUserId: '42',
        attempt: 2,
        sourceType: 'canvas_text',
        originalText: 'Student text.',
        verifiedText: 'Student text.',
        requiresVerification: false,
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date()
    };
    return {
        submission,
        assignment,
        feedbackRun: {
            id: `run-${id}`,
            courseId: 'course-1',
            assignmentId: assignment.id,
            submissionId: id,
            profileVersion: 'test',
            rubricVersion: assignment.rubric.version,
            result: { criteria: [], strengths: [], revisionGoals: [], internalFlags: [] },
            createdAt: new Date(),
            modelMetadata: { engine: 'test', promptVersion: 'test' }
        },
        artifacts: [
            { kind: 'writing', filename: 'writing-feedback.pdf', data: Buffer.from('%PDF-1.7\nwriting') },
            { kind: 'technical', filename: 'technical-feedback.pdf', data: Buffer.from('%PDF-1.7\ntechnical') }
        ],
        finalAssessment: assessment,
        gradedRubric: assignment.rubric,
        studentFeedback: 'Approved narrative.'
    };
}

function fingerprintFor(releaseInput: CanvasReleaseInput): string {
    return computeReleaseFingerprint({
        submissionId: releaseInput.submission.id,
        feedbackRunId: releaseInput.feedbackRun.id,
        rubricVersion: releaseInput.feedbackRun.rubricVersion,
        grade: releaseInput.finalAssessment?.totalPoints,
        studentFeedback: releaseInput.studentFeedback,
        technicalFeedbackRunId: releaseInput.technicalFeedbackRun?.id,
        finalAssessment: releaseInput.finalAssessment
    });
}

function harness(clientOverrides: Record<string, jest.Mock> = {}) {
    const records = new Map<string, WritingRelease>();
    let file = 0;
    const client = {
        get: jest.fn(async (path: string) => (path.includes('/submissions/')
            ? { assignment_id: 88, user_id: 42, attempt: 2 }
            : { id: 88, rubric: liveCanvasRubric(), use_rubric_for_grading: false })),
        uploadFile: jest.fn(async () => ({ id: String(++file) })),
        put: jest.fn(async () => ({ id: 900 })),
        ...clientOverrides
    } as any;
    const service = new LiveCanvasReleaseService(
        client,
        '7',
        async (fingerprint) => records.get(fingerprint) ?? null,
        async (record) => {
            const saved = { ...record, id: 'release-1', createdAt: new Date(), updatedAt: new Date() };
            records.set(record.payloadFingerprint, saved);
            return saved;
        },
        async (fingerprint, update, expectedStatuses) => {
            const current = records.get(fingerprint);
            if (!current) return null;
            if (expectedStatuses?.length && !expectedStatuses.includes(current.status)) return null;
            const next = { ...current, ...update, updatedAt: new Date() };
            records.set(fingerprint, next);
            return next;
        }
    );
    return { service, client, records };
}

describe('LiveCanvasReleaseService', () => {
    beforeEach(() => {
        jest.spyOn(canvas, 'preflightGradeExport').mockResolvedValue({
            courseId: '7', gradeItemId: '88', postManually: true,
            maxScore: assessment.maxPoints, gradingType: 'points', assignmentName: 'Canvas assignment', raw: {}
        });
        jest.spyOn(canvas, 'preflightSubmissionFeedbackExport').mockResolvedValue({
            courseId: '7', gradeItemId: '88', assignmentName: 'Canvas assignment', postManually: true,
            fileCount: 1, totalBytes: 20, batchFingerprint: 'a'.repeat(64), raw: {}
        });
        jest.spyOn(canvas, 'postGrades').mockResolvedValue({
            progressId: 'progress-1', workflowState: 'queued', postManually: true, raw: {}
        });
        jest.spyOn(canvas, 'waitForProgress').mockResolvedValue({
            progressId: 'progress-1', workflowState: 'completed', completion: 100, raw: {}
        });
    });

    afterEach(() => jest.restoreAllMocks());

    it('preflights without writing and retains the Canvas posting policy', async () => {
        const { service, client } = harness();
        const preview = await service.preview(input('submission-preview'));
        expect(preview).toMatchObject({ status: 'previewed', grade: assessment.totalPoints, postManually: true });
        // Reading the live rubric is a GET; nothing is written.
        expect(client.uploadFile).not.toHaveBeenCalled();
        expect(client.put).not.toHaveBeenCalled();
        expect(canvas.postGrades).not.toHaveBeenCalled();
    });

    // The Canvas identity requirement lives here, not in the service: a demo course releases
    // manually created submissions through the mock gateway, which never had a Canvas user.
    it('refuses a submission that never came from canvas', async () => {
        const { service, client } = harness();
        const withoutCanvasUser = input('submission-manual');
        delete (withoutCanvasUser.submission as { canvasUserId?: string }).canvasUserId;

        await expect(service.preview(withoutCanvasUser))
            .rejects.toThrow('Canvas release requires a submission imported from Canvas');
        expect(client.uploadFile).not.toHaveBeenCalled();
    });

    it('attaches both PDFs in one exact-attempt comment before posting the staff-final grade', async () => {
        const { service, client } = harness();
        const releaseInput = input('submission-release');
        await service.preview(releaseInput);
        const released = await service.release(releaseInput);

        expect(client.get).toHaveBeenCalledWith(expect.stringContaining('/submissions/42'), { include: ['submission_history'] });
        expect(client.uploadFile).toHaveBeenCalledTimes(2);
        expect(client.put).toHaveBeenCalledWith(expect.stringContaining('/submissions/42'), {
            comment: {
                file_ids: ['1', '2'],
                attempt: 2,
                text_comment: 'Your approved writing feedback is attached.'
            }
        });
        expect((client.put as jest.Mock).mock.invocationCallOrder[0])
            .toBeLessThan((canvas.postGrades as jest.Mock).mock.invocationCallOrder[0]);
        expect(released).toMatchObject({ status: 'released', canvasFileIds: ['1', '2'], canvasProgressId: 'progress-1' });
    });

    it('refuses a newer Canvas attempt before uploading or grading', async () => {
        const { service, client } = harness({
            get: jest.fn(async () => ({ assignment_id: 88, user_id: 42, attempt: 3 }))
        });
        const releaseInput = input('submission-newer-attempt');
        await service.preview(releaseInput);
        await expect(service.release(releaseInput)).rejects.toThrow('newer submission attempt');
        expect(client.uploadFile).not.toHaveBeenCalled();
        expect(canvas.postGrades).not.toHaveBeenCalled();
    });

    it('records an uncertain comment outcome and never retries into a duplicate or posts the grade', async () => {
        const { service } = harness({ put: jest.fn(async () => { throw new Error('connection dropped'); }) });
        const releaseInput = input('submission-unknown-comment');
        await service.preview(releaseInput);
        const result = await service.release(releaseInput);
        expect(result).toMatchObject({
            status: 'reconciliation_required',
            failureStage: 'feedback',
            canvasFileIds: ['1', '2']
        });
        expect(canvas.postGrades).not.toHaveBeenCalled();
        await expect(service.release(releaseInput)).rejects.toThrow('requires reconciliation');
    });

    it('treats a canvas 5xx on the comment write as uncertain, not as a definite failure', async () => {
        const { service } = harness({
            put: jest.fn(async () => { throw new canvas.CanvasApiError('Canvas is unavailable', 503); })
        });
        const releaseInput = input('submission-comment-503');
        await service.preview(releaseInput);
        const result = await service.release(releaseInput);

        expect(result).toMatchObject({ status: 'reconciliation_required', failureStage: 'feedback' });
        expect(result.sanitizedError).toBe('Canvas feedback comment outcome is unknown');
        expect(canvas.postGrades).not.toHaveBeenCalled();
    });

    it('treats a canvas 429 on the comment write as uncertain, because rate limiting can land mid-flight', async () => {
        const { service } = harness({
            put: jest.fn(async () => { throw new canvas.CanvasApiError('Too many requests', 429); })
        });
        const releaseInput = input('submission-comment-429');
        await service.preview(releaseInput);

        expect(await service.release(releaseInput)).toMatchObject({ status: 'reconciliation_required' });
    });

    it('still fails definitely when canvas rejects the comment outright', async () => {
        const { service } = harness({
            put: jest.fn(async () => { throw new canvas.CanvasApiError('Unprocessable', 422); })
        });
        const releaseInput = input('submission-comment-422');
        await service.preview(releaseInput);
        const result = await service.release(releaseInput);

        expect(result).toMatchObject({ status: 'failed', failureStage: 'feedback' });
        expect(result.sanitizedError).toBe('Canvas rejected the feedback comment');
    });

    it('leaves a released record alone when a duplicate worker runs the same release again', async () => {
        const { service, client, records } = harness();
        const releaseInput = input('submission-terminal');
        await service.preview(releaseInput);
        await service.release(releaseInput);
        const fingerprint = fingerprintFor(releaseInput);
        expect(records.get(fingerprint)!.status).toBe('released');

        const writesBefore = (client.put as jest.Mock).mock.calls.length
            + (client.uploadFile as jest.Mock).mock.calls.length
            + (canvas.postGrades as jest.Mock).mock.calls.length;

        // A second worker arriving late must add nothing to the student's submission and must
        // not walk the release back out of its terminal state.
        const again = await service.release(releaseInput);

        expect(again.status).toBe('released');
        expect(records.get(fingerprint)!.status).toBe('released');
        expect((client.put as jest.Mock).mock.calls.length
            + (client.uploadFile as jest.Mock).mock.calls.length
            + (canvas.postGrades as jest.Mock).mock.calls.length).toBe(writesBefore);
    });

    it('finishes a queued grade progress check without requiring cached preview PDF bytes', async () => {
        const { service, client, records } = harness();
        const releaseInput = input('submission-queued-grade');
        const payloadFingerprint = fingerprintFor(releaseInput);
        records.set(payloadFingerprint, {
            id: 'release-queued',
            courseId: releaseInput.submission.courseId,
            submissionId: releaseInput.submission.id,
            feedbackRunId: releaseInput.feedbackRun.id,
            rubricVersion: releaseInput.feedbackRun.rubricVersion,
            payloadFingerprint,
            status: 'grade_queued',
            grade: assessment.totalPoints,
            integration: 'canvas',
            postManually: true,
            canvasFileIds: ['1', '2'],
            canvasProgressId: 'progress-after-restart',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const released = await service.release(releaseInput);

        expect(canvas.waitForProgress).toHaveBeenCalledWith(expect.anything(), 'progress-after-restart', { timeoutMs: 60_000 });
        expect(client.get).not.toHaveBeenCalled();
        expect(client.uploadFile).not.toHaveBeenCalled();
        expect(canvas.postGrades).not.toHaveBeenCalled();
        expect(released.status).toBe('released');
    });
});

/** The Canvas rubric as the live assignment reports it, matching the import id map below. */
function liveCanvasRubric() {
    return assignment.rubric.criteria.map((criterion) => ({ id: `canvas_${criterion.id}` }));
}

describe('canvas rubric assessment', () => {
    beforeEach(() => {
        assignment.canvasRubricImport = {
            shape: { criteria: assignment.rubric.criteria, levels: assignment.rubric.levels },
            ids: Object.fromEntries(assignment.rubric.criteria.map((criterion) => [
                criterion.id,
                {
                    criterionId: `canvas_${criterion.id}`,
                    ratingIds: Object.fromEntries(assignment.rubric.levels.map((level) => [level.id, `rating_${level.id}`]))
                }
            ])),
            importedAt: new Date()
        };
        jest.spyOn(canvas, 'preflightGradeExport').mockResolvedValue({
            courseId: '7', gradeItemId: '88', postManually: true,
            maxScore: assessment.maxPoints, gradingType: 'points', assignmentName: 'Canvas assignment', raw: {}
        } as never);
        jest.spyOn(canvas, 'preflightSubmissionFeedbackExport').mockResolvedValue({
            courseId: '7', gradeItemId: '88', assignmentName: 'Canvas assignment', postManually: true,
            fileCount: 1, totalBytes: 20, batchFingerprint: 'a'.repeat(64), raw: {}
        } as never);
        jest.spyOn(canvas, 'postGrades').mockResolvedValue({
            progressId: 'progress-1', workflowState: 'queued', postManually: true, raw: {}
        } as never);
        jest.spyOn(canvas, 'waitForProgress').mockResolvedValue({
            progressId: 'progress-1', workflowState: 'completed', completion: 100, raw: {}
        } as never);
    });

    afterEach(() => {
        delete assignment.canvasRubricImport;
        jest.restoreAllMocks();
    });

    it('writes the rubric assessment criterion by criterion, before the total grade', async () => {
        const { service, client } = harness();
        const releaseInput = input('submission-rubric');
        await service.preview(releaseInput);
        await service.release(releaseInput);

        const rubricPut = (client.put as jest.Mock).mock.calls
            .find(([, body]) => body && 'rubric_assessment' in body);
        expect(rubricPut).toBeDefined();
        const firstCriterion = assignment.rubric.criteria[0];
        expect(rubricPut![1].rubric_assessment[`canvas_${firstCriterion.id}`].points)
            .toBe(firstCriterion.points);
        expect(canvas.postGrades).toHaveBeenCalled();
    });

    it('does not post a total when the canvas rubric grades the assignment', async () => {
        const { service } = harness({
            get: jest.fn(async (path: string) => (path.includes('/submissions/')
                ? { assignment_id: 88, user_id: 42, attempt: 2 }
                : { id: 88, rubric: liveCanvasRubric(), use_rubric_for_grading: true }))
        });
        const releaseInput = input('submission-rubric-grades');
        await service.preview(releaseInput);
        const released = await service.release(releaseInput);

        expect(canvas.postGrades).not.toHaveBeenCalled();
        expect(released.status).toBe('released');
    });

    it('refuses at preview when the live canvas rubric no longer matches the import', async () => {
        const { service, client } = harness({
            get: jest.fn(async (path: string) => (path.includes('/submissions/')
                ? { assignment_id: 88, user_id: 42, attempt: 2 }
                : { id: 88, rubric: [{ id: 'rebuilt_in_canvas' }], use_rubric_for_grading: false }))
        });

        await expect(service.preview(input('submission-stale'))).rejects.toThrow('changed since');
        expect(client.uploadFile).not.toHaveBeenCalled();
        expect(client.put).not.toHaveBeenCalled();
    });

    it('treats a canvas 5xx on the rubric assessment as uncertain', async () => {
        const { service } = harness({
            put: jest.fn(async (_path: string, body: Record<string, unknown>) => {
                if (body && 'rubric_assessment' in body) throw new canvas.CanvasApiError('Canvas is unavailable', 502);
                return { id: 900 };
            })
        });
        const releaseInput = input('submission-rubric-502');
        await service.preview(releaseInput);
        const result = await service.release(releaseInput);

        expect(result).toMatchObject({ status: 'reconciliation_required', failureStage: 'grade' });
        expect(result.sanitizedError).toBe('Canvas rubric assessment outcome is unknown');
        expect(canvas.postGrades).not.toHaveBeenCalled();
    });

    it('treats a canvas 5xx on the grade write as uncertain', async () => {
        const { service } = harness();
        (canvas.postGrades as jest.Mock).mockRejectedValueOnce(new canvas.CanvasApiError('Canvas is unavailable', 500));
        const releaseInput = input('submission-grade-500');
        await service.preview(releaseInput);
        const result = await service.release(releaseInput);

        expect(result).toMatchObject({ status: 'reconciliation_required', failureStage: 'grade' });
        expect(result.sanitizedError).toBe('Canvas grade write outcome is unknown');
    });

    it('still fails definitely when the package refuses the grade export before sending it', async () => {
        const { service } = harness();
        (canvas.postGrades as jest.Mock)
            .mockRejectedValueOnce(new canvas.CanvasGradeExportError('Score exceeds the maximum', 'invalid-grade'));
        const releaseInput = input('submission-grade-refused');
        await service.preview(releaseInput);
        const result = await service.release(releaseInput);

        expect(result).toMatchObject({ status: 'failed', failureStage: 'grade' });
        expect(result.sanitizedError).toBe('Canvas rejected the grade write');
    });

    it('preflights every artifact rather than only the first', async () => {
        const { service } = harness();
        const releaseInput = input('submission-preflight');
        await service.preview(releaseInput);

        const batch = (canvas.preflightSubmissionFeedbackExport as jest.Mock).mock.calls[0][1].batch;
        expect(batch.writes).toHaveLength(releaseInput.artifacts.length);
    });
});
