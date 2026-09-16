import { SUMMARY_CHANGED_MESSAGE, assertSummaryEditsBound, summaryEditsInputSchema } from '../summary-edits';
import type { WritingAssignment, WritingFeedbackRun } from '../contracts';

const runFor = (id: string, lens: 'linguistic' | 'technical') => ({
    id, lens, rubricVersion: 1,
    result: { criteria: [{ criterion: 'content' }], strengths: [], revisionGoals: [], internalFlags: [] }
}) as unknown as WritingFeedbackRun;

/**
 * assignmentWith - an assignment whose approved rubrics carry the given criteria.
 *
 * Both lenses share the shape; `assessedBy` is what each case is actually about.
 */
const assignmentWith = (criteria: Array<{ id: string; assessedBy?: 'model' | 'staff' }>) => {
    const rubric = {
        version: 1,
        status: 'approved',
        levels: [{ id: 'weak', label: 'Weak', description: 'd', rank: 1 }],
        criteria: criteria.map((criterion) => ({ ...criterion, label: criterion.id, description: 'd' }))
    };
    return { rubric, technicalRubric: rubric } as unknown as WritingAssignment;
};

/** The default: every criterion is model-assessed, so only run criteria bind. */
const modelOnly = assignmentWith([{ id: 'content' }]);

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
        ], latest, modelOnly)).not.toThrow();
    });

    it('refuses an edit written against an older run', () => {
        expect(() => assertSummaryEditsBound([
            { lens: 'linguistic', feedbackRunId: 'old', strengths: [], criterionExplanations: [] }
        ], latest, modelOnly)).toThrow(SUMMARY_CHANGED_MESSAGE);
    });

    it('refuses unknown criteria, duplicate lenses, and writing-lens goal text', () => {
        expect(() => assertSummaryEditsBound([
            { lens: 'linguistic', feedbackRunId: 'run-l', strengths: [], criterionExplanations: [{ criterion: 'nope', explanation: 'x' }] }
        ], latest, modelOnly)).toThrow('Summary edits failed validation');
        expect(() => assertSummaryEditsBound([
            { lens: 'technical', feedbackRunId: 'run-t', strengths: [], criterionExplanations: [] },
            { lens: 'technical', feedbackRunId: 'run-t', strengths: [], criterionExplanations: [] }
        ], latest, modelOnly)).toThrow('Summary edits failed validation');
        expect(() => assertSummaryEditsBound([
            { lens: 'linguistic', feedbackRunId: 'run-l', strengths: [], criterionExplanations: [], revisionGoalsText: 'x' }
        ], latest, modelOnly)).toThrow('Summary edits failed validation');
    });
    it('accepts an explanation for a staff-assessed criterion absent from the run', () => {
        // Generation never produced this row, so the run is not evidence the id is unknown.
        const assignment = assignmentWith([{ id: 'content' }, { id: 'formatting', assessedBy: 'staff' }]);

        expect(() => assertSummaryEditsBound([
            { lens: 'linguistic', feedbackRunId: 'run-l', strengths: [], criterionExplanations: [{ criterion: 'formatting', explanation: 'Margins are correct.' }] }
        ], latest, assignment)).not.toThrow();
    });

    it('still refuses a model-assessed criterion the run does not carry', () => {
        const assignment = assignmentWith([{ id: 'content' }, { id: 'formatting' }]);

        expect(() => assertSummaryEditsBound([
            { lens: 'linguistic', feedbackRunId: 'run-l', strengths: [], criterionExplanations: [{ criterion: 'formatting', explanation: 'x' }] }
        ], latest, assignment)).toThrow('Summary edits failed validation');
    });
});
