/**
 * @fileoverview Pins the general analysis engine: its system prompt carries the rubric,
 * assignment material, and course terms with no SFL apparatus; course-material queries never
 * carry student text; and the shared evidence and citation guards still hold.
 */

import { buildDefaultWritingAssignment } from '../../rubric/default-rubric-profile';
import { buildLabReportRubric } from '../../rubric/lab-report-profile';
import { approveRubricDraft } from '../../rubric/rubric-schema';
import { buildAssignmentContext } from '../../sources/assignment-context';
import {
    buildCriterionNeeds,
    buildGeneralFeedbackSystemPrompt,
    GENERAL_FEEDBACK_PROMPT_VERSION,
    GeneralFeedbackEngine
} from '../general-feedback-engine';
import type { WritingAssignment, WritingFeedbackResult, WritingSourceMaterial } from '../../contracts';

const NOW = new Date('2026-10-26T00:00:00.000Z');
const verifiedText = 'Bridges fail because of fatigue. The measured load was 12 kN at failure.';

function assignment(overrides: Partial<WritingAssignment> = {}): WritingAssignment {
    const base = buildDefaultWritingAssignment('course-1', 'assignment-1', 'Bridge failure essay', 'Explain one cause of bridge failure.', NOW);
    const rubric = { ...base.rubric, title: 'Essay rubric', courseTerms: ['fatigue'] };
    delete rubric.sflContext;
    base.rubric = approveRubricDraft(rubric, 'instructor-1', NOW);
    return { ...base, ...overrides };
}

function handout(text: string): WritingSourceMaterial {
    return {
        id: 'm1', courseId: 'course-1', assignmentId: 'assignment-1', kind: 'file', fileName: 'handout.pdf',
        text, hasTables: false, characterCount: text.length, addedAt: NOW, addedBy: 'instructor-1'
    };
}

function modelResult(quote = 'Bridges fail because of fatigue.'): WritingFeedbackResult {
    return {
        criteria: ['organization', 'content', 'interpersonal_positioning'].map((criterion) => ({
            criterion,
            suggestedLevel: 'developing',
            evidence: [{ quote, rationale: 'The claim names a cause but no source.', revisionGuidance: 'Name the reading that supports it.' }],
            explanation: 'The cause is named but not supported.',
            confidence: 0.6
        })),
        strengths: ['You name a clear cause.'],
        revisionGoals: [{
            skillTag: 'content',
            goal: 'Support the cause with a source.',
            action: 'Add the course reading that explains fatigue.',
            guidedQuestion: 'Which reading explains why fatigue weakens a bridge?',
            questionScope: 'whole'
        }],
        internalFlags: []
    };
}

describe('buildGeneralFeedbackSystemPrompt', () => {
    const subject = assignment();
    const prompt = buildGeneralFeedbackSystemPrompt(subject, subject.rubric, buildAssignmentContext(subject, [handout('Use at least two course readings.')]));

    it('puts the rubric first in the authority order and forbids invented requirements', () => {
        expect(prompt).toContain('Authority, highest first: (1) the approved rubric; (2) the assignment details and instructor materials; (3) the course material excerpts.');
        expect(prompt).toContain('Never add a requirement, criterion, or expectation of your own');
    });

    it('carries the assignment instructions and every handout', () => {
        expect(prompt).toContain('Explain one cause of bridge failure.');
        expect(prompt).toContain('handout.pdf');
        expect(prompt).toContain('Use at least two course readings.');
    });

    it('lists the approved course terms and allows terms the materials define', () => {
        expect(prompt).toContain('Known course terms you may use: "fatigue"');
        expect(prompt).toContain('A term that the assignment material or a course material excerpt defines or teaches may also be used');
    });

    it('carries no SFL apparatus', () => {
        ['Ferreira', 'sflContext', 'sflDimension', 'genre', 'diagnosis', 'Translate each one'].forEach((term) => expect(prompt).not.toContain(term));
    });

    it('says so when there is no assignment material', () => {
        const bare = assignment({ instructions: undefined });
        expect(buildGeneralFeedbackSystemPrompt(bare, bare.rubric, buildAssignmentContext(bare, [])))
            .toContain('No assignment details or instructor materials were provided');
    });
});

describe('buildCriterionNeeds', () => {
    it('queries course material from the rubric and title only', () => {
        const subject = assignment();
        const needs = buildCriterionNeeds(subject, subject.rubric);
        expect(needs.map((need) => need.id)).toEqual(['criterion:organization', 'criterion:content', 'criterion:interpersonal_positioning']);
        needs.forEach((need) => {
            expect(need.query).toContain('Bridge failure essay');
            expect(need.query.length).toBeLessThanOrEqual(280);
        });
    });
});

describe('GeneralFeedbackEngine.generate', () => {
    it('runs one writer call and stamps the general provenance', async () => {
        const retriever = { retrieve: jest.fn(async () => []) };
        const llm = { sendStructuredConversation: jest.fn(async () => ({ parsed: modelResult() })) };
        const result = await new GeneralFeedbackEngine(llm as never, retriever).generate({
            assignment: assignment(), verifiedText, sourceMaterials: [handout('Use two readings.')]
        });
        expect(llm.sendStructuredConversation).toHaveBeenCalledTimes(1);
        expect(result.runTrace?.analysisMode).toBe('general');
        expect(result.runTrace?.writerPromptVersion).toBe(GENERAL_FEEDBACK_PROMPT_VERSION);
        expect(result.runTrace?.textDiagnosis).toBeUndefined();
        expect(result.runTrace?.sflAnalysis).toBeUndefined();
        expect(result.gateDecision).toBeUndefined();
        expect(result.overallMessage).toBeUndefined();
    });

    it('never sends student text to the course-material retriever', async () => {
        const retriever = { retrieve: jest.fn(async (_input: { query: string }) => []) };
        const llm = { sendStructuredConversation: jest.fn(async () => ({ parsed: modelResult() })) };
        await new GeneralFeedbackEngine(llm as never, retriever as never).generate({ assignment: assignment(), verifiedText });
        expect(retriever.retrieve).toHaveBeenCalled();
        retriever.retrieve.mock.calls.forEach(([input]) => {
            expect(input.query).not.toContain('fatigue.');
            expect(input.query).not.toContain('12 kN');
        });
    });

    it('flags missing assignment material instead of failing', async () => {
        const llm = { sendStructuredConversation: jest.fn(async () => ({ parsed: modelResult() })) };
        const result = await new GeneralFeedbackEngine(llm as never, { retrieve: jest.fn(async () => []) })
            .generate({ assignment: assignment({ instructions: undefined }), verifiedText });
        expect(result.runTrace?.flags).toEqual(expect.arrayContaining(['no_assignment_material', 'no_course_material']));
    });

    it('rejects evidence that is not in the verified text', async () => {
        const llm = { sendStructuredConversation: jest.fn(async () => ({ parsed: modelResult('Bridges never fail.') })) };
        await expect(new GeneralFeedbackEngine(llm as never, { retrieve: jest.fn(async () => []) })
            .generate({ assignment: assignment(), verifiedText }))
            .rejects.toThrow('Feedback evidence did not match the verified submission text');
    });

    it('assesses an existing lab report against its technical rubric when asked for that lens', async () => {
        const technicalRubric = { ...buildLabReportRubric('platform', NOW), status: 'approved' as const, approvedAt: NOW, approvedBy: 'instructor-1' };
        const lab = assignment({ isLabReport: true, technicalRubric });
        const llm = { sendStructuredConversation: jest.fn(async () => ({ parsed: {} })) };
        await new GeneralFeedbackEngine(llm as never, { retrieve: jest.fn(async () => []) })
            .generate({ assignment: lab, verifiedText, lens: 'technical' })
            .catch(() => undefined);
        const [messages] = llm.sendStructuredConversation.mock.calls[0] as unknown as [Array<{ content: string }>];
        expect(messages[0]!.content).toContain('sample_calculations');
        expect(messages[0]!.content).not.toContain('interpersonal_positioning');
    });
});
