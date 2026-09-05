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

import type { CourseMaterialMention, SflAnalysis, WritingAssignment, WritingRubricCriterion } from '../contracts';
import { SFL_FOUNDATION_VERSION } from '../contracts';
import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { RubricWritingFeedbackEngine, buildWritingFeedbackSystemPrompt } from '../feedback-engine';
import { buildFeedbackSchema } from '../feedback-schema';
import { approveRubricDraft } from '../rubric-schema';
import type { LLMModule } from 'ubc-genai-toolkit-llm';

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
        sflContext: assignment.rubric.sflContext
            ? {
                ...assignment.rubric.sflContext,
                genreLabel: 'Concise lab report',
                genreState: 'custom',
                task: 'Write a concise lab report grounded in the recorded observations.',
                purpose: 'Explain what happened, why it matters, and what limits the conclusion.',
                audience: 'A technical reader who did not attend the lab.',
                field: 'Undergraduate heat exchanger lab measurements.',
                tenor: 'Student reporting findings to an evaluating instructor.',
                mode: 'A written take-home report submitted after the lab session.',
                productionConditions: 'Take-home, individually written, open resources.'
            }
            : assignment.rubric.sflContext,
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
        expect(prompt).toContain('Never state a confidence level, certainty, or how sure you are anywhere in prose');
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

    it('uses separate analyzer and writer calls and stores V2 run trace', async () => {
        const assignment = dynamicAssignment();
        const verifiedText = 'The measured outlet temperature increased steadily. The conclusion does not explain why that increase matters.';
        const analysis: SflAnalysis = {
            schemaVersion: 'writing-feedback-v2',
            foundationVersion: SFL_FOUNDATION_VERSION,
            profileGenreState: assignment.rubric.sflContext!.genreState,
            findings: [{
                id: 'finding-1',
                evidence: [{ quote: 'The measured outlet temperature increased steadily.' }],
                observation: 'The draft reports a measured increase.',
                functionalInterpretation: 'The report can use that observation as evidence, but the interpretation still needs to connect it to significance.',
                primaryFunction: 'content',
                crossFunctions: ['organizational'],
                languageLevel: 'section',
                ruleIds: [],
                sourceIds: ['SRC-WALSH-MARR-F2F#runtime'],
                confidence: 0.8,
                alternatives: ['A brief interpretation can be acceptable if the assignment is short.']
            }],
            abstentions: [],
            internalFlags: []
        };
        const mention: CourseMaterialMention = {
            id: 'material-1',
            label: 'Week 4 · Lecture 2 · Information flow',
            materialId: 'material-1'
        };
        const writerResult = {
            schemaVersion: 'writing-feedback-v2',
            criteria: assignment.rubric.criteria.map((criterion) => ({
                criterion: criterion.id,
                suggestedLevel: 'established',
                evidence: [{
                    quote: 'The measured outlet temperature increased steadily.',
                    rationale: 'The passage gives exact evidence for the criterion.',
                    sflFindingIds: ['finding-1'],
                    courseMaterialMention: mention
                }],
                explanation: `Revise ${criterion.label} directly against the evidence and profile.`,
                confidence: 0.7
            })),
            strengths: [],
            revisionGoals: [{
                skillTag: 'content',
                goal: 'Connect the reported increase to its significance.',
                guidedQuestion: 'What does the increase show for the assignment purpose?'
            }],
            internalFlags: [],
            courseMaterialMentions: [mention]
        };
        const sendStructuredConversation = jest.fn(async (_messages, _schema, options) => (
            options.structuredOutputName === 'sfl_analysis'
                ? { parsed: analysis }
                : { parsed: writerResult }
        ));
        const llm = { sendStructuredConversation } as unknown as LLMModule;
        const retriever = { retrieve: jest.fn(async () => [{ content: 'x', score: 0.9, published: true, metadata: { id: 'material-1', topicOrWeekTitle: 'Week 4', itemTitle: 'Lecture 2', name: 'Information flow' } }]) };

        process.env.MOCK_RESPONSE = 'false';
        try {
            const generated = await new RubricWritingFeedbackEngine(llm, retriever)
                .generate({ assignment, verifiedText });
            expect(sendStructuredConversation).toHaveBeenCalledTimes(2);
            expect(sendStructuredConversation.mock.calls[0][2].structuredOutputName).toBe('sfl_analysis');
            expect(sendStructuredConversation.mock.calls[1][2].structuredOutputName).toBe('writing_feedback_v2');
            expect(sendStructuredConversation.mock.calls[1][0][1].content).toContain('<validated_sfl_analysis>');
            expect(sendStructuredConversation.mock.calls[1][0][1].content).not.toContain('The conclusion does not explain');
            expect(generated.schemaVersion).toBe('writing-feedback-v2');
            expect(generated.courseMaterialMentions?.[0].label).toBe('Week 4 · Lecture 2 · Information flow');
            expect(generated.runTrace?.sflAnalysis?.findings[0].id).toBe('finding-1');
            expect(generated.runTrace?.writerPromptVersion).toBe('sfl-feedback-writer-v2.1.0');
        } finally {
            process.env.MOCK_RESPONSE = 'true';
        }
    });
});
