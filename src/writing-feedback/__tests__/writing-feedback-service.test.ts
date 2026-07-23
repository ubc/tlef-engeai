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

import { buildA2Assignment } from '../a2-profile';
import type { A2FeedbackResult, AnchoredComment, StaffReviewRevision, WritingFeedbackRun, WritingSubmission } from '../contracts';
import { WritingFeedbackService } from '../writing-feedback-service';
import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';

const result: A2FeedbackResult = {
    criteria: [],
    strengths: [],
    revisionGoals: [],
    internalFlags: []
};

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

describe('WritingFeedbackService rubric provenance', () => {
    it('stamps the active approved rubric version on each generated run', async () => {
        const assignment = buildA2Assignment('course-1', 'assignment-1');
        assignment.rubric.version = 3;
        const createRun = jest.fn(async (input) => ({ ...input, id: 'run-1', createdAt: new Date() }));
        const mongo = {
            getWritingSubmission: jest.fn(async () => submission()),
            getWritingAssignment: jest.fn(async () => assignment),
            setWritingSubmissionStatus: jest.fn(async () => null),
            createWritingFeedbackRun: createRun
        } as unknown as EngEAI_MongoDB;
        const engine = { generate: jest.fn(async () => result) };

        await new WritingFeedbackService(mongo, engine).generate('course-1', 'submission-1');

        expect(createRun).toHaveBeenCalledWith(expect.objectContaining({ rubricVersion: 3 }));
    });

    it('blocks approval when feedback was generated against an older rubric', async () => {
        const assignment = buildA2Assignment('course-1', 'assignment-1');
        assignment.rubric.version = 2;
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
                    suggestedLevel: 'competent',
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

    it('renderPdf forwards only valid anchored comments with the include flag', async () => {
        const sub = submission('approved');
        const drifted = storedComment({ id: 'comment-2', quote: 'No longer present.', startOffset: 0, endOffset: 18 });
        const review: StaffReviewRevision = {
            id: 'review-1', submissionId: sub.id, feedbackRunId: 'run-1', staffUserId: 'instructor-1',
            studentFeedback: 'Nice work.', comments: [storedComment(), drifted], createdAt: new Date()
        };
        const assignment = buildA2Assignment('course-1', 'assignment-1');
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
