import {
    LlmSummaryRedraftEngine,
    buildSummaryRedraftSystemPrompt,
    buildSummaryRedraftUserMessage,
    deterministicSummaryRedraft,
    type SummaryRedraftInput
} from '../summary-redraft-engine';
import { PRIME_DIRECTIVE } from '../technical-feedback-engine';
import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { buildLabReportRubric } from '../lab-report-profile';

function input(lens: 'linguistic' | 'technical' = 'linguistic'): SummaryRedraftInput {
    const assignment = buildDefaultWritingAssignment('course-1', 'assignment-1', 'A2 Report');
    const rubric = lens === 'technical' ? buildLabReportRubric('u', new Date()) : assignment.rubric;
    return {
        assignment,
        lens,
        rubric,
        verifiedText: 'The results clearly prove the claim. It is obvious.',
        previousResult: {
            criteria: rubric.criteria.map((criterion) => ({
                criterion: criterion.id, suggestedLevel: rubric.levels[1].id, evidence: [], explanation: 'Previous explanation.', confidence: 0.5
            })),
            strengths: ['Previous strength.'],
            revisionGoals: [{ skillTag: 'x', goal: 'Previous goal.', guidedQuestion: 'Previous question?' }],
            internalFlags: []
        },
        comments: [{
            id: 'c1', lens, criterion: rubric.criteria[0].id, quote: 'The results clearly prove the claim.',
            startOffset: 0, endOffset: 36, comment: 'Overclaims.', howToImprove: 'Limit the claim.', origin: 'staff'
        }]
    };
}

describe('summary redraft prompts', () => {
    it('states every redraft rule', () => {
        const prompt = buildSummaryRedraftSystemPrompt(input());
        expect(prompt).toContain('final annotations are the teaching team');
        expect(prompt).toContain('annotations win');
        expect(prompt).toContain('Re-judge each criterion');
        expect(prompt).toContain('synthesize that criterion');
        expect(prompt).toContain('at most 2 strengths');
        expect(prompt).toContain('one to three revision goals');
        expect(prompt).toContain('guidedQuestion');
        expect(prompt).toContain('Never rewrite student sentences');
        expect(prompt).toContain('Never state a confidence level');
        expect(prompt).toContain('Never tell the student what you did not assess');
        expect(prompt).toContain('Never invent numeric weights or grades');
        expect(prompt).not.toContain(PRIME_DIRECTIVE);
    });

    it('withholds a staff-assessed criterion from the redraft prompt and output', () => {
        const base = input();
        const staffId = base.rubric.criteria[0].id;
        const withStaff: SummaryRedraftInput = {
            ...base,
            rubric: {
                ...base.rubric,
                criteria: base.rubric.criteria.map((criterion) => (
                    criterion.id === staffId ? { ...criterion, assessedBy: 'staff' as const } : criterion
                ))
            }
        };

        const prompt = buildSummaryRedraftSystemPrompt(withStaff);
        expect(prompt).not.toContain(staffId);
        // A redraft that re-judged this row would overwrite what staff wrote themselves.
        expect(deterministicSummaryRedraft(withStaff).criteria.map((criterion) => criterion.criterion))
            .not.toContain(staffId);
    });

    it('adds the technical prime directive and lab context only for the technical lens', () => {
        const technical = input('technical');
        technical.rubric = { ...technical.rubric, labContext: 'Heat exchanger handout.' };
        const prompt = buildSummaryRedraftSystemPrompt(technical);
        expect(prompt).toContain(PRIME_DIRECTIVE);
        expect(prompt).toContain('<lab_context>Heat exchanger handout.</lab_context>');
    });

    it('delimits student-derived content in the user message', () => {
        const message = buildSummaryRedraftUserMessage(input());
        expect(message).toContain('<verified_student_text>');
        expect(message).toContain('<final_annotations>');
        expect(message).toContain('<previous_draft>');
        expect(message).toContain('Overclaims.');
    });
});

describe('deterministicSummaryRedraft', () => {
    it('keeps previous levels and derives explanations from annotation comments', () => {
        const value = input();
        const output = deterministicSummaryRedraft(value);
        expect(output.criteria).toHaveLength(value.rubric.criteria.length);
        expect(output.criteria[0].suggestedLevel).toBe(value.previousResult.criteria[0].suggestedLevel);
        expect(output.criteria[0].explanation).toContain('Overclaims.');
        expect(output.criteria[1].explanation).toBe('Previous explanation.');
        expect(output.revisionGoals.length).toBeGreaterThanOrEqual(1);
    });
});

describe('LlmSummaryRedraftEngine', () => {
    it('sends the structured schema and strips structured-output nulls', async () => {
        const value = input();
        const parsed = {
            criteria: value.rubric.criteria.map((criterion) => ({ criterion: criterion.id, suggestedLevel: value.rubric.levels[2].id, explanation: 'New.', confidence: 0.7 })),
            strengths: ['New strength.'],
            revisionGoals: [{ skillTag: 'x', goal: 'New goal.', guidedQuestion: 'New question?' }]
        };
        const llm = { sendStructuredConversation: jest.fn(async () => ({ parsed })) };
        const previousMock = process.env.MOCK_RESPONSE;
        delete process.env.MOCK_RESPONSE;
        try {
            const output = await new LlmSummaryRedraftEngine(llm as never).redraft(value);
            expect(output.criteria[0].suggestedLevel).toBe(value.rubric.levels[2].id);
            const [messages, , options] = llm.sendStructuredConversation.mock.calls[0] as unknown as [Array<{ role: string }>, unknown, { structuredOutputName: string }];
            expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
            expect(options.structuredOutputName).toBe('writing_summary_redraft');
        } finally {
            if (previousMock !== undefined) process.env.MOCK_RESPONSE = previousMock;
        }
    });
});
