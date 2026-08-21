/**
 * Writing feedback service tests — provenance and human review transitions
 *
 * Exercises orchestration across generation, verified text, saved comment
 * revisions, approval, stale anchors, rubric versions, and student PDF output.
 *
 * @author: @rdschrs
 * @date: 2026-07-18
 * @version: 1.0.0
 * @description: Regression coverage for the human-in-the-loop feedback lifecycle.
 */

import { ModelSelectionService } from '../../dashboard-setting/model-selection-service';
import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { approveRubricDraft } from '../rubric-schema';
import type {
    AnchoredComment,
    StaffReviewRevision,
    WritingAssignment,
    WritingFeedbackLens,
    WritingFeedbackResult,
    WritingFeedbackRun,
    WritingSubmission
} from '../contracts';
import { WritingFeedbackService } from '../writing-feedback-service';
import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';

const result: WritingFeedbackResult = {
    criteria: [],
    strengths: [],
    revisionGoals: [],
    internalFlags: []
};

function approvedAssignment(version = 1): WritingAssignment {
    const assignment = buildDefaultWritingAssignment(
        'course-1',
        'assignment-1',
        'Local writing assignment'
    );
    assignment.rubric = approveRubricDraft(
        { ...assignment.rubric, version },
        'instructor-1',
        new Date('2026-01-01T00:00:00.000Z')
    );
    return assignment;
}

function submission(status: WritingSubmission['status'] = 'imported'): WritingSubmission {
    return {
        id: 'submission-1',
        courseId: 'course-1',
        assignmentId: 'assignment-1',
        studentId: 'local-student-1',
        attempt: 1,
        sourceType: 'manual',
        originalText: 'Verified student text.',
        verifiedText: 'Verified student text.',
        requiresVerification: false,
        status,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

/** Options controlling the lab-report/technical-lens shape of a `buildService` fixture. */
interface BuildServiceOptions {
    isLabReport?: boolean; // whether the assignment requires the technical lens
    technicalApproved?: boolean; // whether an approved technical rubric exists
    technicalRun?: WritingFeedbackRun | null; // explicit override; null simulates "no technical run yet"
    technicalRubricVersion?: number; // approved technical rubric version
    technicalRunRubricVersion?: number; // rubric version stamped on the existing technical run
}

function labReportAssignment(options: BuildServiceOptions): WritingAssignment {
    const assignment = approvedAssignment(1);
    assignment.isLabReport = options.isLabReport ?? false;
    if (options.technicalApproved) {
        assignment.technicalRubric = approveRubricDraft(
            { ...assignment.rubric, version: options.technicalRubricVersion ?? 1 },
            'instructor-1',
            new Date('2026-01-01T00:00:00.000Z')
        );
    }
    return assignment;
}

function feedbackRun(lens: WritingFeedbackLens, rubricVersion: number): WritingFeedbackRun {
    return {
        id: `run-${lens}`,
        courseId: 'course-1',
        assignmentId: 'assignment-1',
        submissionId: 'submission-1',
        profileVersion: 'test-profile',
        rubricVersion,
        lens,
        result,
        createdAt: new Date(),
        modelMetadata: { engine: 'test', promptVersion: 'test' }
    };
}

/**
 * buildService - assembles a `WritingFeedbackService` with jest-double collaborators.
 *
 * Reused by the two-lens generation and approval suites so each test only states
 * the lab-report/technical-rubric shape it needs rather than re-wiring mocks.
 *
 * @param options - Lab-report and technical-rubric/run shape for this fixture
 * @returns The constructed service plus every double, for call-shape assertions
 */
function buildService(options: BuildServiceOptions = {}) {
    const assignment = labReportAssignment(options);
    const technicalRunRubricVersion = options.technicalRunRubricVersion
        ?? options.technicalRubricVersion
        ?? 1;
    const runsByLens: Partial<Record<WritingFeedbackLens, WritingFeedbackRun | null>> = {
        linguistic: feedbackRun('linguistic', assignment.rubric.version),
        technical: options.technicalRun === null
            ? null
            : (options.technicalRun ?? (options.technicalApproved
                ? feedbackRun('technical', technicalRunRubricVersion)
                : null))
    };

    // Kept as a plain object (not cast) so tests can assert on `.mock.calls` directly.
    const mongo = {
        getWritingSubmission: jest.fn(async () => submission('draft_ready')),
        getWritingAssignment: jest.fn(async () => assignment),
        setWritingSubmissionStatus: jest.fn(async () => null),
        createWritingFeedbackRun: jest.fn(async (input) => ({ ...input, id: `run-${input.lens}`, createdAt: new Date() })),
        getLatestWritingFeedbackRun: jest.fn(async (_submissionId: string, lens: WritingFeedbackLens = 'linguistic') =>
            runsByLens[lens] ?? null),
        approveWritingSubmission: jest.fn(async () => submission('approved'))
    };

    const engine = { generate: jest.fn(async () => result) };
    const technicalEngine = { generate: jest.fn(async () => result) };
    const pdfService = { render: jest.fn(async () => Buffer.from('pdf')) };
    // Feature-flag/model-config lookup is not under test here; stub it directly rather
    // than restoring a spy, since these describes run only at the end of this file.
    ModelSelectionService.getInstance().buildFeatureLlmCallOptions = jest.fn(async () => ({}));

    const service = new WritingFeedbackService(mongo as unknown as EngEAI_MongoDB, engine, pdfService, technicalEngine);
    return { service, mongo, engine, technicalEngine, pdfService, assignment };
}

describe('WritingFeedbackService rubric provenance', () => {
    it('stamps the active approved rubric version on each generated run', async () => {
        const assignment = approvedAssignment(3);
        const createRun = jest.fn(async (input) => ({ ...input, id: 'run-1', createdAt: new Date() }));
        const mongo = {
            getWritingSubmission: jest.fn(async () => submission()),
            getWritingAssignment: jest.fn(async () => assignment),
            setWritingSubmissionStatus: jest.fn(async () => null),
            createWritingFeedbackRun: createRun
        } as unknown as EngEAI_MongoDB;
        const engine = { generate: jest.fn(async () => result) };
        const modelOptions = jest.spyOn(ModelSelectionService.getInstance(), 'buildFeatureLlmCallOptions')
            .mockResolvedValue({});

        try {
            await new WritingFeedbackService(mongo, engine).generate('course-1', 'submission-1');
        } finally {
            modelOptions.mockRestore();
        }

        expect(createRun).toHaveBeenCalledWith(expect.objectContaining({ rubricVersion: 3 }));
    });

    it('blocks approval when feedback was generated against an older rubric', async () => {
        const assignment = approvedAssignment(2);
        const run: WritingFeedbackRun = {
            id: 'run-1',
            courseId: 'course-1',
            assignmentId: 'assignment-1',
            submissionId: 'submission-1',
            profileVersion: assignment.profileVersion,
            rubricVersion: 1,
            result,
            createdAt: new Date(),
            modelMetadata: { engine: 'test', promptVersion: 'test' }
        };
        const approve = jest.fn();
        const mongo = {
            getWritingSubmission: jest.fn(async () => submission('draft_ready')),
            getWritingAssignment: jest.fn(async () => assignment),
            getLatestWritingFeedbackRun: jest.fn(async () => run),
            approveWritingSubmission: approve
        } as unknown as EngEAI_MongoDB;

        const engine = { generate: jest.fn(async () => result) };
        await expect(new WritingFeedbackService(mongo, engine).approve('course-1', 'submission-1', 'instructor-1'))
            .rejects.toThrow('Rubric changed after feedback generation');
        expect(approve).not.toHaveBeenCalled();
    });
});

describe('WritingFeedbackService anchored comments', () => {
    const engine = { generate: jest.fn(async () => result) };
    const assignment = approvedAssignment();

    function runFor(sub: WritingSubmission): WritingFeedbackRun {
        return {
            id: 'run-1',
            courseId: sub.courseId,
            assignmentId: sub.assignmentId,
            submissionId: sub.id,
            profileVersion: 'test-profile',
            rubricVersion: 1,
            result: {
                criteria: [{
                    criterion: 'organization',
                    suggestedLevel: 'proficient',
                    evidence: [{ quote: 'Verified student text.', rationale: 'Anchors the description.' }],
                    explanation: 'Sequencing is clear.',
                    confidence: 0.8
                }],
                strengths: [],
                revisionGoals: [],
                internalFlags: []
            },
            createdAt: new Date(),
            modelMetadata: { engine: 'test', promptVersion: 'test' }
        };
    }

    function storedComment(overrides: Partial<AnchoredComment> = {}): AnchoredComment {
        return {
            id: 'comment-1',
            quote: 'Verified student text.',
            startOffset: 0,
            endOffset: 22,
            comment: 'Consider the reader here.',
            origin: 'staff',
            ...overrides
        };
    }

    it('detail seeds comments from run evidence when no revision stored comments', async () => {
        const sub = submission('draft_ready');
        const mongo = {
            getWritingSubmission: jest.fn(async () => sub),
            getWritingAssignment: jest.fn(async () => assignment),
            getLatestWritingFeedbackRun: jest.fn(async () => runFor(sub))
        } as unknown as EngEAI_MongoDB;

        const detail = await new WritingFeedbackService(mongo, engine).detail('course-1', 'submission-1');

        expect(detail.comments).toHaveLength(0);
        expect(detail.seedComments).toHaveLength(1);
        expect(detail.seedComments[0].origin).toBe('model_seed');
        expect(detail.seedComments[0].startOffset).toBe(0);
    });

    it('detail prefers stored comments and stale-flags drifted anchors', async () => {
        const sub = submission('draft_ready');
        const drifted = storedComment({ id: 'comment-2', quote: 'No longer present.', startOffset: 0, endOffset: 18 });
        const review: StaffReviewRevision = {
            id: 'review-1', submissionId: sub.id, feedbackRunId: 'run-1', staffUserId: 'instructor-1',
            studentFeedback: 'Nice work.', comments: [storedComment(), drifted], createdAt: new Date()
        };
        const mongo = {
            getWritingSubmission: jest.fn(async () => ({ ...sub, reviews: [review] })),
            getWritingAssignment: jest.fn(async () => assignment),
            getLatestWritingFeedbackRun: jest.fn(async () => runFor(sub))
        } as unknown as EngEAI_MongoDB;

        const detail = await new WritingFeedbackService(mongo, engine).detail('course-1', 'submission-1');

        expect(detail.seedComments).toHaveLength(0);
        expect(detail.comments).toHaveLength(2);
        expect(detail.comments[0].stale).toBeUndefined();
        expect(detail.comments[1].stale).toBe(true);
    });

    it('appendReview rejects comments that no longer match the verified text', async () => {
        const appendWritingReview = jest.fn();
        const mongo = {
            getWritingSubmission: jest.fn(async () => submission('draft_ready')),
            appendWritingReview
        } as unknown as EngEAI_MongoDB;

        await expect(new WritingFeedbackService(mongo, engine).appendReview('course-1', 'submission-1', {
            feedbackRunId: 'run-1',
            staffUserId: 'instructor-1',
            studentFeedback: 'Nice work.',
            comments: [storedComment({ quote: 'Drifted anchor text.', startOffset: 0, endOffset: 20 })]
        })).rejects.toThrow('Feedback comments no longer match the verified text');
        expect(appendWritingReview).not.toHaveBeenCalled();
    });

    it('appendReview persists a valid comment working set', async () => {
        const appendWritingReview = jest.fn(async (_courseId, _submissionId, revision) => revision);
        const mongo = {
            getWritingSubmission: jest.fn(async () => submission('draft_ready')),
            appendWritingReview
        } as unknown as EngEAI_MongoDB;

        await new WritingFeedbackService(mongo, engine).appendReview('course-1', 'submission-1', {
            feedbackRunId: 'run-1',
            staffUserId: 'instructor-1',
            studentFeedback: 'Nice work.',
            comments: [storedComment()]
        });

        expect(appendWritingReview).toHaveBeenCalledWith('course-1', 'submission-1',
            expect.objectContaining({ comments: [expect.objectContaining({ id: 'comment-1' })] }));
    });

    it('appendReview stamps author names: carries prior attribution and names new staff comments', async () => {
        const sub = submission('approved');
        const priorReview: StaffReviewRevision = {
            id: 'review-1', submissionId: sub.id, feedbackRunId: 'run-1', staffUserId: 'instructor-1',
            studentFeedback: 'Nice work.',
            comments: [storedComment({ authorName: 'Pat Lee' })],
            createdAt: new Date()
        };
        const appendWritingReview = jest.fn(async (_courseId, _submissionId, revision) => revision);
        const mongo = {
            getWritingSubmission: jest.fn(async () => ({ ...sub, reviews: [priorReview] })),
            appendWritingReview
        } as unknown as EngEAI_MongoDB;

        await new WritingFeedbackService(mongo, engine).appendReview('course-1', 'submission-1', {
            feedbackRunId: 'run-1',
            staffUserId: 'instructor-2',
            studentFeedback: 'Updated.',
            comments: [
                // Echoed prior comment: the client never controls attribution.
                storedComment(),
                storedComment({ id: 'comment-new-staff', quote: 'student', startOffset: 9, endOffset: 16 }),
                storedComment({ id: 'comment-new-seed', quote: 'text.', startOffset: 17, endOffset: 22, origin: 'model_seed' })
            ]
        }, 'Jamie Rivera');

        const persisted = appendWritingReview.mock.calls[0][2].comments as AnchoredComment[];
        expect(persisted.find((c) => c.id === 'comment-1')?.authorName).toBe('Pat Lee');
        expect(persisted.find((c) => c.id === 'comment-new-staff')?.authorName).toBe('Jamie Rivera');
        expect(persisted.find((c) => c.id === 'comment-new-seed')?.authorName).toBeUndefined();
    });

    it('renderPdf uses the newest revision comments after a save-approve-save-approve cycle', async () => {
        const sub = submission('approved');
        const firstCycle: StaffReviewRevision = {
            id: 'review-1', submissionId: sub.id, feedbackRunId: 'run-1', staffUserId: 'instructor-1',
            studentFeedback: 'First pass.', comments: [storedComment()], createdAt: new Date('2026-07-25T10:00:00Z')
        };
        const secondCycle: StaffReviewRevision = {
            id: 'review-2', submissionId: sub.id, feedbackRunId: 'run-1', staffUserId: 'instructor-1',
            studentFeedback: 'Second pass.',
            comments: [
                storedComment(),
                storedComment({ id: 'comment-added-later', quote: 'student', startOffset: 9, endOffset: 16 })
            ],
            createdAt: new Date('2026-07-26T10:00:00Z')
        };
        const mongo = {
            getWritingSubmission: jest.fn(async () => ({ ...sub, reviews: [firstCycle, secondCycle] })),
            getWritingAssignment: jest.fn(async () => assignment),
            getLatestWritingFeedbackRun: jest.fn(async () => ({ ...runFor(sub), rubricVersion: assignment.rubric.version }))
        } as unknown as EngEAI_MongoDB;
        const pdfService = { render: jest.fn(async () => Buffer.from('pdf')) };

        await new WritingFeedbackService(mongo, engine, pdfService).renderPdf('course-1', 'submission-1', 'annotated');

        expect(pdfService.render).toHaveBeenCalledWith(expect.objectContaining({
            comments: [
                expect.objectContaining({ id: 'comment-1' }),
                expect.objectContaining({ id: 'comment-added-later' })
            ]
        }));
    });

    it('renderPdf forwards only valid anchored comments with the include flag', async () => {
        const sub = submission('approved');
        const drifted = storedComment({ id: 'comment-2', quote: 'No longer present.', startOffset: 0, endOffset: 18 });
        const review: StaffReviewRevision = {
            id: 'review-1', submissionId: sub.id, feedbackRunId: 'run-1', staffUserId: 'instructor-1',
            studentFeedback: 'Nice work.', comments: [storedComment(), drifted], createdAt: new Date()
        };
        const mongo = {
            getWritingSubmission: jest.fn(async () => ({ ...sub, reviews: [review] })),
            getWritingAssignment: jest.fn(async () => assignment),
            getLatestWritingFeedbackRun: jest.fn(async () => ({ ...runFor(sub), rubricVersion: assignment.rubric.version }))
        } as unknown as EngEAI_MongoDB;
        const pdfService = { render: jest.fn(async () => Buffer.from('pdf')) };

        await new WritingFeedbackService(mongo, engine, pdfService).renderPdf('course-1', 'submission-1', 'both');

        expect(pdfService.render).toHaveBeenCalledWith(expect.objectContaining({
            include: 'both',
            comments: [expect.objectContaining({ id: 'comment-1' })]
        }));
    });
});

describe('two-lens generation', () => {
    it('generates only linguistic feedback for an ordinary assignment', async () => {
        const { service, technicalEngine } = buildService({ isLabReport: false });
        const result = await service.generate('course-1', 'submission-1');
        expect(result.linguistic).toBeDefined();
        expect(result.technical).toBeUndefined();
        expect(technicalEngine.generate).not.toHaveBeenCalled();
    });

    it('generates both lenses for a lab report with an approved technical rubric', async () => {
        const { service, mongo } = buildService({ isLabReport: true, technicalApproved: true });
        const result = await service.generate('course-1', 'submission-1');
        expect(result.linguistic).toBeDefined();
        expect(result.technical).toBeDefined();
        const lenses = mongo.createWritingFeedbackRun.mock.calls.map(([input]: [{ lens: string }]) => input.lens);
        expect(lenses).toEqual(['linguistic', 'technical']);
    });

    it('skips the technical lens when its rubric is not yet approved', async () => {
        const { service, technicalEngine } = buildService({ isLabReport: true, technicalApproved: false });
        const result = await service.generate('course-1', 'submission-1');
        expect(result.linguistic).toBeDefined();
        expect(result.technical).toBeUndefined();
        expect(technicalEngine.generate).not.toHaveBeenCalled();
    });

    it('keeps linguistic feedback when the technical lens fails', async () => {
        const { service, technicalEngine, mongo } = buildService({ isLabReport: true, technicalApproved: true });
        technicalEngine.generate.mockRejectedValueOnce(new Error('model unavailable'));
        const result = await service.generate('course-1', 'submission-1');
        expect(result.linguistic).toBeDefined();
        expect(result.technical).toBeUndefined();
        // A partial failure is still a reviewable draft, not a dead submission.
        expect(mongo.setWritingSubmissionStatus).toHaveBeenLastCalledWith('course-1', 'submission-1', 'draft_ready');
    });

    it('fails the submission when the linguistic lens fails', async () => {
        const { service, engine, mongo } = buildService({ isLabReport: true, technicalApproved: true });
        engine.generate.mockRejectedValueOnce(new Error('model unavailable'));
        await expect(service.generate('course-1', 'submission-1')).rejects.toThrow('model unavailable');
        expect(mongo.setWritingSubmissionStatus).toHaveBeenLastCalledWith('course-1', 'submission-1', 'failed');
    });

    it('stamps the technical prompt version on the technical run', async () => {
        const { service, mongo } = buildService({ isLabReport: true, technicalApproved: true });
        await service.generate('course-1', 'submission-1');
        const technicalRun = mongo.createWritingFeedbackRun.mock.calls
            .map(([input]: [{ lens: string; modelMetadata: { promptVersion: string } }]) => input)
            .find((input) => input.lens === 'technical');
        expect(technicalRun?.modelMetadata.promptVersion).toBe('lab-report-technical-v1');
    });
});

describe('two-lens approval', () => {
    it('refuses approval when a lab report has no technical run', async () => {
        const { service } = buildService({ isLabReport: true, technicalApproved: true, technicalRun: null });
        await expect(service.approve('course-1', 'submission-1', 'user-1'))
            .rejects.toThrow('Generate technical feedback before staff approval');
    });

    it('refuses approval when the technical rubric changed after generation', async () => {
        const { service } = buildService({
            isLabReport: true,
            technicalApproved: true,
            technicalRubricVersion: 3,
            technicalRunRubricVersion: 2
        });
        await expect(service.approve('course-1', 'submission-1', 'user-1'))
            .rejects.toThrow('Technical rubric changed after feedback generation');
    });

    it('approves when both lenses are current', async () => {
        const { service } = buildService({ isLabReport: true, technicalApproved: true });
        await expect(service.approve('course-1', 'submission-1', 'user-1')).resolves.toBeDefined();
    });
});
