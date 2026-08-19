/**
 * Writing Feedback engine tests — assignment-specific prompt and output contracts
 *
 * Verifies that generation is gated by explicit rubric approval and that prompt,
 * schema, and deterministic output are derived from arbitrary assignment-owned
 * criteria rather than a course-specific profile.
 *
 * @author: @rdschrs
 * @date: 2026-08-10
 * @version: 1.0.0
 * @description: Regression coverage for generic rubric-bound feedback generation.
 */

import type { WritingAssignment, WritingRubricCriterion } from '../contracts';
import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { RubricWritingFeedbackEngine, buildWritingFeedbackSystemPrompt } from '../feedback-engine';
import { buildFeedbackSchema } from '../feedback-schema';
import { approveRubricDraft } from '../rubric-schema';

const dynamicCriteria: WritingRubricCriterion[] = [
    {
        id: 'method_traceability',
        label: 'Method Traceability',
        description: 'How clearly the text connects observations to the procedure.'
    },
    {
        id: 'result_interpretation',
        label: 'Result Interpretation',
        description: 'How completely the text explains the significance of its results.',
        functionTag: 'content'
    },
    {
        id: 'reader_orientation',
        label: 'Reader Orientation',
        description: 'How effectively the text guides its intended technical reader.',
        functionTag: 'organizational'
    },
    {
        id: 'claim_calibration',
        label: 'Claim Calibration',
        description: 'How appropriately claims reflect the limits of the evidence.',
        functionTag: 'interpersonal'
    },
    {
        id: 'limitations',
        label: 'Limitations',
        description: 'How precisely the text identifies constraints on its conclusions.'
    }
];

function dynamicAssignment(): WritingAssignment {
    const assignment = buildDefaultWritingAssignment(
        'course-generic',
        'assignment-lab-report',
        'Heat exchanger lab report',
        'Report the observed trend, interpret the result, and identify a limitation.'
    );
    assignment.rubric = approveRubricDraft({
        ...assignment.rubric,
        task: 'Write a concise lab report grounded in the recorded observations.',
        audience: 'A technical reader who did not attend the lab.',
        purpose: 'Explain what happened, why it matters, and what limits the conclusion.',
        criteria: dynamicCriteria.map((criterion) => ({ ...criterion })),
        levels: [
            { id: 'emerging', label: 'Emerging', description: 'Not yet demonstrated consistently.', rank: 1 },
            { id: 'established', label: 'Established', description: 'Demonstrated for this task.', rank: 2 },
            { id: 'advanced', label: 'Advanced', description: 'Demonstrated precisely and effectively.', rank: 3 }
        ]
    }, 'instructor-1', new Date('2026-01-01T00:00:00.000Z'));
    return assignment;
}

describe('RubricWritingFeedbackEngine generic rubric contract', () => {
    const originalMockResponse = process.env.MOCK_RESPONSE;

    beforeAll(() => {
        process.env.MOCK_RESPONSE = 'true';
    });

    afterAll(() => {
        if (originalMockResponse === undefined) delete process.env.MOCK_RESPONSE;
        else process.env.MOCK_RESPONSE = originalMockResponse;
    });

    it('requires explicit approval of the default assignment rubric', async () => {
        const draftAssignment = buildDefaultWritingAssignment(
            'course-generic',
            'assignment-draft',
            'Draft writing task'
        );

        await expect(new RubricWritingFeedbackEngine().generate({
            assignment: draftAssignment,
            verifiedText: 'The verified submission contains a complete observation.'
        })).rejects.toThrow('An approved rubric is required');
    });

    it('derives the prompt, schema, and complete output from every dynamic criterion', async () => {
        const assignment = dynamicAssignment();
        const prompt = buildWritingFeedbackSystemPrompt(assignment);
        const verifiedText = 'The measured outlet temperature increased steadily during the synthetic trial.';
        const generated = await new RubricWritingFeedbackEngine().generate({ assignment, verifiedText });

        expect(prompt).not.toMatch(/LLED\s*200|Assignment\s*2|\bA2\b/i);
        for (const criterion of dynamicCriteria) {
            expect(prompt).toContain(criterion.id);
            expect(prompt).toContain(criterion.label);
        }
        expect(generated.criteria.map((criterion) => criterion.criterion))
            .toEqual(dynamicCriteria.map((criterion) => criterion.id));
        expect(generated.criteria.every((criterion) => verifiedText.includes(criterion.evidence[0].quote)))
            .toBe(true);
        expect(() => buildFeedbackSchema(assignment.rubric).parse(generated)).not.toThrow();
    });
});
