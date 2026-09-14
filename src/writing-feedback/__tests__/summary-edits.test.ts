import { SUMMARY_CHANGED_MESSAGE, assertSummaryEditsBound, summaryEditsInputSchema } from '../summary-edits';
import type { WritingFeedbackRun } from '../contracts';

const runFor = (id: string, lens: 'linguistic' | 'technical') => ({
    id, lens, result: { criteria: [{ criterion: 'content' }], strengths: [], revisionGoals: [], internalFlags: [] }
}) as unknown as WritingFeedbackRun;

describe('summaryEditsInputSchema', () => {
    it('accepts bounded edits and rejects blank or oversized ones', () => {
        const valid = [{ lens: 'technical', feedbackRunId: 'run-t', strengths: ['Good.'], criterionExplanations: [{ criterion: 'content', explanation: 'Why.' }], revisionGoalsText: '1. Goal' }];
        expect(summaryEditsInputSchema.safeParse(valid).success).toBe(true);
        expect(summaryEditsInputSchema.safeParse([{ ...valid[0], strengths: [''] }]).success).toBe(false);
        expect(summaryEditsInputSchema.safeParse([{ ...valid[0], strengths: Array(6).fill('x') }]).success).toBe(false);
        expect(summaryEditsInputSchema.safeParse([valid[0], valid[0], valid[0]]).success).toBe(false);
    });
});

describe('assertSummaryEditsBound', () => {
    const latest = { linguistic: runFor('run-l', 'linguistic'), technical: runFor('run-t', 'technical') };

    it('accepts edits bound to the latest run for each lens', () => {
        expect(() => assertSummaryEditsBound([
            { lens: 'linguistic', feedbackRunId: 'run-l', strengths: [], criterionExplanations: [{ criterion: 'content', explanation: 'x' }] }
        ], latest)).not.toThrow();
    });

    it('refuses an edit written against an older run', () => {
        expect(() => assertSummaryEditsBound([
            { lens: 'linguistic', feedbackRunId: 'old', strengths: [], criterionExplanations: [] }
        ], latest)).toThrow(SUMMARY_CHANGED_MESSAGE);
    });

    it('refuses unknown criteria, duplicate lenses, and writing-lens goal text', () => {
        expect(() => assertSummaryEditsBound([
            { lens: 'linguistic', feedbackRunId: 'run-l', strengths: [], criterionExplanations: [{ criterion: 'nope', explanation: 'x' }] }
        ], latest)).toThrow('Summary edits failed validation');
        expect(() => assertSummaryEditsBound([
            { lens: 'technical', feedbackRunId: 'run-t', strengths: [], criterionExplanations: [] },
            { lens: 'technical', feedbackRunId: 'run-t', strengths: [], criterionExplanations: [] }
        ], latest)).toThrow('Summary edits failed validation');
        expect(() => assertSummaryEditsBound([
            { lens: 'linguistic', feedbackRunId: 'run-l', strengths: [], criterionExplanations: [], revisionGoalsText: 'x' }
        ], latest)).toThrow('Summary edits failed validation');
    });
});
