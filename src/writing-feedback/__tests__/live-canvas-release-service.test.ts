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
        get: jest.fn(async () => ({ assignment_id: 88, user_id: 42, attempt: 2 })),
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
        async (fingerprint, update) => {
            const current = records.get(fingerprint);
            if (!current) return null;
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
        expect(client.get).not.toHaveBeenCalled();
        expect(client.uploadFile).not.toHaveBeenCalled();
        expect(canvas.postGrades).not.toHaveBeenCalled();
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
