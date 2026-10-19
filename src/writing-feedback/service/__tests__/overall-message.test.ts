/**
 * @fileoverview The overall message and hold-back in the student view: only a whole-text
 * problem has an overall message, a staff edit wins and an empty edit clears it, and the
 * annotations the student sees follow the hold-back default or the staff choice.
 */
import type { AnchoredComment, StaffReviewRevision, WritingFeedbackRun } from '../../contracts';
import { summaryEditsInputSchema } from '../../review/summary-edits';
import { resolveStudentView } from '../writing-feedback-service';

function run(gateDecision: 'standard' | 'global_revision', overallMessage?: string): WritingFeedbackRun {
    return {
        id: 'run-1', lens: 'linguistic', createdAt: new Date('2026-10-01T00:00:00Z'), gateDecision,
        result: { criteria: [], strengths: [], revisionGoals: [], internalFlags: [], gateDecision, ...(overallMessage ? { overallMessage } : {}) }
    } as unknown as WritingFeedbackRun;
}

const review = (fields: Record<string, unknown>) => ({
    reviews: [{ createdAt: new Date('2026-10-02T00:00:00Z'), ...fields }] as unknown as StaffReviewRevision[]
});
const editing = (overallMessage: string) => review({
    summaryEdits: [{ lens: 'linguistic', feedbackRunId: 'run-1', strengths: [], criterionExplanations: [], overallMessage }]
});

const comments = [
    { id: 'seed', origin: 'model_seed', heldBack: true },
    { id: 'staff', origin: 'staff' }
] as unknown as AnchoredComment[];

describe('overall message', () => {
    it('comes from the model on a whole-text problem', () => {
        expect(resolveStudentView(run('global_revision', 'MODEL'), { reviews: [] }, []).overallMessage).toBe('MODEL');
    });

    it('is never shown without a whole-text problem, even if one is stored', () => {
        expect(resolveStudentView(run('standard', 'STRAY'), { reviews: [] }, []).overallMessage).toBeUndefined();
    });

    it('uses the staff edit over the model\'s', () => {
        expect(resolveStudentView(run('global_revision', 'MODEL'), editing('STAFF'), []).overallMessage).toBe('STAFF');
    });

    it('is removed when staff clear it', () => {
        expect(summaryEditsInputSchema.safeParse([{ lens: 'linguistic', feedbackRunId: 'run-1', strengths: [], criterionExplanations: [], overallMessage: '' }]).success).toBe(true);
        expect(resolveStudentView(run('global_revision', 'MODEL'), editing(''), []).overallMessage).toBeUndefined();
    });
});

describe('annotations the student sees', () => {
    it('holds the model\'s annotations back by default on a whole-text problem', () => {
        const view = resolveStudentView(run('global_revision', 'M'), { reviews: [] }, comments);
        expect(view.holdBackAnnotations).toBe(true);
        expect(view.comments.map((comment) => comment.id)).toEqual(['staff']);
    });

    it('shows every annotation when staff untick the box', () => {
        const view = resolveStudentView(run('global_revision', 'M'), review({ holdBackAnnotations: false }), comments);
        expect(view.holdBackAnnotations).toBe(false);
        expect(view.comments.map((comment) => comment.id)).toEqual(['seed', 'staff']);
    });

    it('shows every annotation without a whole-text problem', () => {
        const view = resolveStudentView(run('standard'), { reviews: [] }, comments);
        expect(view.holdBackAnnotations).toBe(false);
        expect(view.comments).toHaveLength(2);
    });
});
