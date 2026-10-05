import { buildLabReportRubric } from '../lab-report-profile';
import {
    buildTechnicalFeedbackSystemPrompt,
    TECHNICAL_PROMPT_VERSION,
    TechnicalWritingFeedbackEngine
} from '../technical-feedback-engine';
import type { WritingAssignment, WritingRubricDefinition } from '../contracts';

const NOW = new Date('2026-08-20T00:00:00.000Z');

function approvedTechnicalRubric(overrides: Partial<WritingRubricDefinition> = {}): WritingRubricDefinition {
    return {
        ...buildLabReportRubric('platform', NOW),
        status: 'approved',
        approvedAt: NOW,
        approvedBy: 'user-1',
        ...overrides
    };
}

function labAssignment(technicalRubric = approvedTechnicalRubric()): WritingAssignment {
    return {
        id: 'assignment-1',
        courseId: 'course-1',
        title: 'Lab 1: Thermal Expansion',
        profileVersion: 'writing-feedback-v1',
        rubricSource: 'internal_profile',
        isLabReport: true,
        rubric: { ...buildLabReportRubric('platform', NOW), status: 'approved' },
        technicalRubric,
        createdAt: NOW,
        updatedAt: NOW
    };
}

describe('technical system prompt', () => {
    it('states the prime directive before anything else', () => {
        const prompt = buildTechnicalFeedbackSystemPrompt(labAssignment());
        expect(prompt.split('\n')[0]).toContain('Do not judge whether the student');
        expect(prompt).toContain('A well-explained anomalous result is stronger work');
    });

    it('enumerates every technical criterion id and level id', () => {
        const prompt = buildTechnicalFeedbackSystemPrompt(labAssignment());
        ['report_presentation', 'language', 'abstract', 'results_discussion', 'conclusions', 'references', 'sample_calculations']
            .forEach((id) => expect(prompt).toContain(id));
        ['weak', 'developing', 'proficient', 'exemplary'].forEach((id) => expect(prompt).toContain(id));
    });

    it('carries every judgment axis', () => {
        const prompt = buildTechnicalFeedbackSystemPrompt(labAssignment());
        [
            'traces to a value the student reports',
            'size of the observed deviation',
            'reported uncertainty',
            'internally consistent',
            'does the explanatory work',
            'stages expected',
            'as a question rather than a verdict',
            'practically possible'
        ].forEach((axis) => expect(prompt).toContain(axis));
    });

    it('carries every hard prohibition', () => {
        const prompt = buildTechnicalFeedbackSystemPrompt(labAssignment());
        [
            'Never state that a result is wrong because it disagrees with theory',
            'Never supply the correct value',
            'Do not write or rewrite sentences',
            'Never introduce literature or reference values from your own knowledge',
            'Abstain from any judgment that requires reading a figure, graph, or image',
            'internalFlags',
            'untrusted student content',
            'Never state a confidence level, certainty, or how sure you are anywhere in prose'
        ].forEach((rule) => expect(prompt).toContain(rule));
    });

    it('includes the approved lab context when one exists', () => {
        const prompt = buildTechnicalFeedbackSystemPrompt(
            labAssignment(approvedTechnicalRubric({ labContext: 'Heat three rods with steam; record elongation.' }))
        );
        expect(prompt).toContain('<lab_context>');
        expect(prompt).toContain('Heat three rods with steam');
    });

    it('omits the lab context block when none is set', () => {
        expect(buildTechnicalFeedbackSystemPrompt(labAssignment())).not.toContain('<lab_context>');
    });

    it('never leaks an unapproved draft lab context', () => {
        const assignment = labAssignment();
        assignment.technicalRubricDraft = { ...buildLabReportRubric(), labContext: 'UNAPPROVED DRAFT CONTEXT' };
        expect(buildTechnicalFeedbackSystemPrompt(assignment)).not.toContain('UNAPPROVED DRAFT CONTEXT');
    });
});

describe('technical engine generation', () => {
    const verifiedText = 'The experimental value was 35.3% higher than the literature value. The uncertainty was larger than the calculated value.';
    const originalMockResponse = process.env.MOCK_RESPONSE;

    beforeAll(() => {
        process.env.MOCK_RESPONSE = 'true';
    });

    afterAll(() => {
        if (originalMockResponse === undefined) delete process.env.MOCK_RESPONSE;
        else process.env.MOCK_RESPONSE = originalMockResponse;
    });

    it('refuses generation without an approved technical rubric', async () => {
        const assignment = labAssignment(buildLabReportRubric('platform', NOW));
        await expect(new TechnicalWritingFeedbackEngine().generate({ assignment, verifiedText }))
            .rejects.toThrow('An approved technical rubric is required before feedback generation');
    });

    it('refuses generation on blank verified text', async () => {
        await expect(new TechnicalWritingFeedbackEngine().generate({ assignment: labAssignment(), verifiedText: '   ' }))
            .rejects.toThrow('Verified submission text is required');
    });

    it('produces one deterministic result per technical criterion with exact evidence', async () => {
        const result = await new TechnicalWritingFeedbackEngine().generate({ assignment: labAssignment(), verifiedText });
        expect(result.criteria).toHaveLength(7);
        expect(result.criteria.map((criterion) => criterion.criterion)).toContain('results_discussion');
        result.criteria.forEach((criterion) => {
            criterion.evidence.forEach((evidence) => {
                expect(verifiedText).toContain(evidence.quote);
            });
        });
    });

    it('forbids narrating what the model did not assess', () => {
        expect(buildTechnicalFeedbackSystemPrompt(labAssignment()))
            .toContain('Never tell the student what you did not assess');
    });

    it('exposes a stable prompt version', () => {
        expect(TECHNICAL_PROMPT_VERSION).toBe('lab-report-technical-v1.5.0');
    });
});

describe('plain-language contract', () => {
    const verifiedText = 'The experimental value was 35.3% higher than the literature value. The uncertainty was larger than the calculated value.';
    const originalMockResponse = process.env.MOCK_RESPONSE;
    afterAll(() => {
        if (originalMockResponse === undefined) delete process.env.MOCK_RESPONSE;
        else process.env.MOCK_RESPONSE = originalMockResponse;
    });

    it('names the student as the final reader, after the prime directive', () => {
        const prompt = buildTechnicalFeedbackSystemPrompt(labAssignment());
        expect(prompt).not.toMatch(/Your reader is the teaching team, not the student/);
        expect(prompt.indexOf('<student_reader>')).toBeGreaterThan(0); // after PRIME_DIRECTIVE (D-055)
    });

});

describe('technical known terms', () => {
    it('lets standard lab terms and the course glossary through without a gloss', () => {
        const assignment = labAssignment();
        assignment.rubric = { ...assignment.rubric, sflContext: { ...(assignment.rubric.sflContext ?? {}), approvedGlossaryTerms: ['thermal expansion coefficient'] } as never };
        const prompt = buildTechnicalFeedbackSystemPrompt(assignment);
        expect(prompt).toMatch(/no explanation needed\):[^\n]*"percent error"/);
        expect(prompt).toMatch(/Known course terms you may use:[^\n]*"thermal expansion coefficient"/);
    });

});

describe('Socratic questions (D-153)', () => {
    const verifiedText = 'The experimental value was 35.3% higher than the literature value.';
    const original = process.env.MOCK_RESPONSE;
    afterAll(() => { if (original === undefined) delete process.env.MOCK_RESPONSE; else process.env.MOCK_RESPONSE = original; });

    it('requires a scoped question in the prompt', () => {
        const prompt = buildTechnicalFeedbackSystemPrompt(labAssignment());
        expect(prompt).toContain('every revision goal has exactly one guidedQuestion and a questionScope');
        expect(prompt).not.toContain('only when it genuinely helps the student think');
        expect(TECHNICAL_PROMPT_VERSION).toBe('lab-report-technical-v1.5.0');
    });

    it('retries once when no goal asks about the whole report', async () => {
        process.env.MOCK_RESPONSE = 'true';
        const good = await new TechnicalWritingFeedbackEngine().generate({ assignment: labAssignment(), verifiedText });
        const bad = { ...good, revisionGoals: good.revisionGoals.map((goal) => ({ ...goal, questionScope: 'part' as const })) };
        process.env.MOCK_RESPONSE = 'false';
        const llm = { sendStructuredConversation: jest.fn()
            .mockResolvedValueOnce({ parsed: bad })
            .mockResolvedValueOnce({ parsed: good }) };
        const result = await new TechnicalWritingFeedbackEngine(llm as never).generate({ assignment: labAssignment(), verifiedText });
        expect(llm.sendStructuredConversation).toHaveBeenCalledTimes(2);
        expect(result.revisionGoals.some((goal) => goal.questionScope === 'whole')).toBe(true);
    });
});
