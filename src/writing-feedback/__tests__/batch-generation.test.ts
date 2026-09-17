/**
 * Batch feedback generation tests
 *
 * Covers how submissions are classified, what a started batch confirms and queues, and how
 * stopping returns submissions to their previous state.
 *
 * @author: EngE-AI Team
 * @date: 2026-09-16
 * @version: 1.0.0
 * @description: Regression coverage for assignment-wide feedback generation.
 */

import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { approveRubricDraft } from '../rubric-schema';
import type { WritingAssignment, WritingFeedbackLens, WritingJob, WritingSubmission } from '../contracts';
import {
    BATCH_ERRORS,
    type BatchGenerationStore,
    classifyForBatch,
    WritingBatchGenerationService
} from '../batch-generation';

const prose = 'The measured flow rate increased steadily as the valve opened, which matches the expected trend. '.repeat(8);

function assignment(version = 2): WritingAssignment {
    const base = buildDefaultWritingAssignment('course-1', 'assignment-1', 'Lab write-up');
    base.rubric = approveRubricDraft(
        {
            ...base.rubric,
            version,
            sflContext: {
                ...base.rubric.sflContext!,
                genreLabel: 'Report',
                genreState: 'custom',
                task: 'Report the result.',
                purpose: 'Explain the finding.',
                audience: 'The instructor.',
                field: 'Coursework.',
                tenor: 'Student to instructor.',
                mode: 'Written take-home.',
                productionConditions: 'Individual.',
                taskRequirements: ['Report the trend.']
            }
        },
        'instructor-1',
        new Date('2026-01-01T00:00:00.000Z')
    );
    return base;
}

function submission(id: string, overrides: Partial<WritingSubmission> = {}): WritingSubmission {
    return {
        id,
        courseId: 'course-1',
        assignmentId: 'assignment-1',
        studentId: `student-${id}`,
        attempt: 1,
        sourceType: 'canvas_text',
        originalText: prose,
        verifiedText: prose,
        requiresVerification: false,
        status: 'imported',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

function fileSubmission(id: string, originalText = prose): WritingSubmission {
    return submission(id, {
        sourceType: 'digital_file',
        originalText,
        verifiedText: undefined,
        requiresVerification: true,
        status: 'verification_needed'
    });
}

function store(input: {
    assignment?: WritingAssignment | null;
    submissions: WritingSubmission[];
    versions?: Record<string, Partial<Record<WritingFeedbackLens, number>>>;
    active?: string[];
    cancelled?: string[];
}) {
    const doubles = {
        getWritingAssignment: jest.fn(async () => (input.assignment === undefined ? assignment() : input.assignment)),
        listWritingSubmissions: jest.fn(async () => input.submissions),
        listLatestWritingRunVersions: jest.fn(async () => new Map(Object.entries(input.versions ?? {}))),
        listActiveWritingGenerationSubmissionIds: jest.fn(async () => new Set(input.active ?? [])),
        autoConfirmWritingTranscript: jest.fn(async (_courseId: string, submissionId: string) =>
            submission(submissionId, { transcriptConfirmedBy: 'batch' })),
        cancelWritingGenerationJobs: jest.fn(async () => input.cancelled ?? []),
        getLatestWritingFeedbackRun: jest.fn(async (): Promise<null | { id: string }> => null),
        setWritingSubmissionStatus: jest.fn(async () => null)
    };
    return doubles;
}

function build(doubles: ReturnType<typeof store>) {
    const enqueue = jest.fn(async (courseId: string, submissionId: string) =>
        ({ id: `job-${submissionId}`, courseId } as WritingJob));
    const service = new WritingBatchGenerationService(doubles as unknown as BatchGenerationStore, enqueue);
    return { service, enqueue };
}

describe('classifyForBatch', () => {
    const context = (overrides: Partial<Parameters<typeof classifyForBatch>[1]> = {}) => ({
        assignment: assignment(2),
        runVersions: undefined,
        hasActiveJob: false,
        ...overrides
    });

    it('queues verified text with no feedback', () => {
        expect(classifyForBatch(submission('a'), context())).toBe('no_draft');
    });

    it('retries failed submissions, and ones left generating with no job', () => {
        expect(classifyForBatch(submission('a', { status: 'failed' }), context())).toBe('failed');
        expect(classifyForBatch(submission('a', { status: 'generating' }), context())).toBe('failed');
    });

    it('does not touch released or in-progress submissions', () => {
        expect(classifyForBatch(submission('a', { status: 'released' }), context())).toBe('done');
        expect(classifyForBatch(submission('a', { status: 'generating' }), context({ hasActiveJob: true }))).toBe('in_progress');
    });

    it('confirms readable file text and leaves the rest for staff', () => {
        expect(classifyForBatch(fileSubmission('a'), context())).toBe('transcript');
        expect(classifyForBatch(fileSubmission('a', 'Title only.'), context())).toBe('needs_transcript');
        expect(classifyForBatch(submission('a', {
            sourceType: 'paper_scan', originalText: '', verifiedText: undefined, requiresVerification: true, status: 'verification_needed'
        }), context())).toBe('needs_transcript');
    });

    it('marks feedback from an older rubric stale and current feedback done', () => {
        const drafted = submission('a', { status: 'draft_ready' });
        expect(classifyForBatch(drafted, context({ runVersions: { linguistic: 1 } }))).toBe('stale');
        expect(classifyForBatch(submission('a', { status: 'approved' }), context({ runVersions: { linguistic: 1 } }))).toBe('stale');
        expect(classifyForBatch(drafted, context({ runVersions: { linguistic: 2 } }))).toBe('done');
    });

    it('marks a lab report missing current technical feedback stale', () => {
        const lab = assignment(2);
        lab.isLabReport = true;
        lab.technicalRubric = { ...lab.rubric, version: 3 };
        const drafted = submission('a', { status: 'draft_ready' });
        expect(classifyForBatch(drafted, context({ assignment: lab, runVersions: { linguistic: 2 } }))).toBe('stale');
        expect(classifyForBatch(drafted, context({ assignment: lab, runVersions: { linguistic: 2, technical: 2 } }))).toBe('stale');
        expect(classifyForBatch(drafted, context({ assignment: lab, runVersions: { linguistic: 2, technical: 3 } }))).toBe('done');
    });
});

describe('WritingBatchGenerationService', () => {
    const mixed = () => store({
        submissions: [
            submission('new'),
            submission('failed', { status: 'failed' }),
            fileSubmission('file'),
            fileSubmission('garbled', 'Title only.'),
            submission('stale', { status: 'draft_ready' }),
            submission('current', { status: 'draft_ready' }),
            submission('running', { status: 'generating' })
        ],
        versions: { stale: { linguistic: 1 }, current: { linguistic: 2 } },
        active: ['running']
    });

    it('previews counts for every category', async () => {
        const { service } = build(mixed());
        await expect(service.preview('course-1', 'assignment-1')).resolves.toEqual({
            counts: { no_draft: 1, failed: 1, transcript: 1, stale: 1, needs_transcript: 1, in_progress: 1, done: 1 }
        });
    });

    it('reports why a batch cannot run', async () => {
        const draftOnly = assignment();
        draftOnly.rubric = { ...draftOnly.rubric, status: 'draft' };
        const { service, enqueue } = build(store({ assignment: draftOnly, submissions: [submission('new')] }));
        await expect(service.preview('course-1', 'assignment-1')).resolves.toMatchObject({ blockedReason: BATCH_ERRORS.rubricNotApproved });
        await expect(service.start('course-1', 'assignment-1', { includeStale: false })).rejects.toThrow(BATCH_ERRORS.rubricNotApproved);
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('refuses an assignment outside the course', async () => {
        const { service } = build(store({ assignment: null, submissions: [] }));
        await expect(service.preview('course-1', 'assignment-1')).rejects.toThrow(BATCH_ERRORS.notFound);
        await expect(service.stop('course-1', 'assignment-1')).rejects.toThrow(BATCH_ERRORS.notFound);
    });

    it('confirms passing transcripts and queues new, failed, and confirmed submissions', async () => {
        const doubles = mixed();
        const { service, enqueue } = build(doubles);
        const result = await service.start('course-1', 'assignment-1', { includeStale: false });

        expect(result).toEqual({ queued: 3, transcriptsConfirmed: 1, skipped: 1 });
        expect(enqueue.mock.calls.map((call) => call[1])).toEqual(['new', 'failed', 'file']);
        expect(doubles.autoConfirmWritingTranscript).toHaveBeenCalledTimes(1);
        expect(doubles.autoConfirmWritingTranscript).toHaveBeenCalledWith('course-1', 'file', prose.trim());
    });

    it('regenerates stale feedback only when staff opt in', async () => {
        const { service, enqueue } = build(mixed());
        await service.start('course-1', 'assignment-1', { includeStale: true });
        expect(enqueue.mock.calls.map((call) => call[1])).toEqual(['new', 'failed', 'file', 'stale']);
    });

    it('skips a transcript staff confirmed in the meantime', async () => {
        const doubles = store({ submissions: [fileSubmission('file')] });
        doubles.autoConfirmWritingTranscript.mockResolvedValueOnce(null as never);
        const { service, enqueue } = build(doubles);
        await expect(service.start('course-1', 'assignment-1', { includeStale: false }))
            .resolves.toEqual({ queued: 0, transcriptsConfirmed: 0, skipped: 1 });
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('counts a refused enqueue as skipped and carries on', async () => {
        const { service, enqueue } = build(store({ submissions: [submission('a'), submission('b')] }));
        enqueue.mockRejectedValueOnce(new Error('Writing submission not found'));
        await expect(service.start('course-1', 'assignment-1', { includeStale: false }))
            .resolves.toEqual({ queued: 1, transcriptsConfirmed: 0, skipped: 1 });
    });

    it('stops queued work and restores each submission to what its feedback supports', async () => {
        const doubles = store({ submissions: [submission('drafted'), submission('fresh')], cancelled: ['drafted', 'fresh'] });
        doubles.getLatestWritingFeedbackRun.mockImplementation(async (...args: unknown[]) =>
            (args[0] === 'drafted' ? { id: 'run-1' } : null));
        const { service } = build(doubles);

        await expect(service.stop('course-1', 'assignment-1')).resolves.toEqual({ stopped: 2 });
        expect(doubles.cancelWritingGenerationJobs).toHaveBeenCalledWith('course-1', ['drafted', 'fresh']);
        expect(doubles.setWritingSubmissionStatus).toHaveBeenCalledWith('course-1', 'drafted', 'draft_ready', ['generating']);
        expect(doubles.setWritingSubmissionStatus).toHaveBeenCalledWith('course-1', 'fresh', 'imported', ['generating']);
    });
});
