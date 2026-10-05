/**
 * @fileoverview D-153 review fix: a staff edit that clears the rewrite question wins over
 * the model's question, while an edit to other fields keeps it.
 */
import type { StaffReviewRevision, WritingFeedbackRun } from '../contracts';
import { summaryEditsInputSchema } from '../summary-edits';
import { resolveStudentView } from '../writing-feedback-service';

const run = {
    id: 'run-1', lens: 'linguistic', createdAt: new Date('2026-10-01T00:00:00Z'),
    result: {
        criteria: [], strengths: [], revisionGoals: [], internalFlags: [], gateDecision: 'global_revision',
        globalRevision: { diagnosisStatement: 'd', whatToKeep: [], rewriteDirection: 'r', guidedQuestion: 'What does your reader need first?' }
    }
} as unknown as WritingFeedbackRun;

const withEdit = (globalRevision: Record<string, unknown>) => ({
    reviews: [{ createdAt: new Date('2026-10-02T00:00:00Z'), summaryEdits: [{ lens: 'linguistic', feedbackRunId: 'run-1', strengths: [], criterionExplanations: [], globalRevision }] }] as unknown as StaffReviewRevision[]
});

describe('clearing the rewrite question', () => {
    it('accepts an empty question as an explicit clear', () => {
        const parsed = summaryEditsInputSchema.safeParse([{ lens: 'linguistic', feedbackRunId: 'run-1', strengths: [], criterionExplanations: [], globalRevision: { diagnosisStatement: 'd', whatToKeep: [], rewriteDirection: 'r', guidedQuestion: '' } }]);
        expect(parsed.success).toBe(true);
    });

    it('drops the model question when staff cleared it', () => {
        const view = resolveStudentView(run, withEdit({ diagnosisStatement: 'd2', whatToKeep: [], rewriteDirection: 'r2', guidedQuestion: '' }), []);
        expect(view.globalRevision?.guidedQuestion).toBeUndefined();
        expect(view.globalRevision?.diagnosisStatement).toBe('d2');
    });

    it('keeps the model question when staff edited other fields only', () => {
        const view = resolveStudentView(run, withEdit({ diagnosisStatement: 'd2', whatToKeep: [], rewriteDirection: 'r2' }), []);
        expect(view.globalRevision?.guidedQuestion).toBe('What does your reader need first?');
    });
});
