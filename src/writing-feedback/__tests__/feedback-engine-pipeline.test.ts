/**
 * @fileoverview Engine pipeline: diagnosis before analysis, gate on the result, contrast
 * retrieval only on a mismatch, citations only from supported excerpts, and a fixed
 * message when the diagnosis fails.
 */

import type { LLMModule } from 'ubc-genai-toolkit-llm';
import { SFL_FOUNDATION_VERSION } from '../contracts';
import { RubricWritingFeedbackEngine } from '../feedback-engine';
import { TEXT_DIAGNOSIS_FAILED_MESSAGE } from '../text-diagnosis';
import { modelAssessedCriteria } from '../criterion-assessment';
import { buildEvalAssignment } from './fixtures/eval/eval-fixtures';
import { InMemoryMaterialRetriever } from './fixtures/eval/eval-materials';

const assignment = buildEvalAssignment();
const text = 'How Sound Works. Sound happens when an object vibrates. First, the vibrating object pushes on the air particles next to it.';
const quoteA = 'Sound happens when an object vibrates.';
const quoteB = 'First, the vibrating object pushes on the air particles next to it.';

function diagnosis(fit: 'fits' | 'mismatch') {
    return {
        realizedGenre: fit === 'fits' ? 'descriptive_report' : 'explanation',
        genreFit: fit,
        stages: assignment.rubric.sflContext!.stages.map((stage) => ({
            stageId: stage.id,
            status: fit === 'fits' ? 'present' : (stage.id === 'identify' ? 'weak' : 'missing'),
            evidence: fit === 'fits' || stage.id === 'identify' ? quoteA : null
        })),
        contradictingFeatures: fit === 'fits' ? [] : [{ quote: quoteB, note: 'temporal sequence' }],
        transferableStrengths: [{ text: 'Sound is a strong entity to classify.', quote: null }],
        rationale: 'r'
    };
}

const analysis = {
    schemaVersion: 'writing-feedback-v2',
    foundationVersion: SFL_FOUNDATION_VERSION,
    profileGenreState: 'staff_confirmed',
    findings: [{
        id: 'F1', evidence: [{ quote: quoteA }], observation: 'Weak class word.', functionalInterpretation: 'Definition lacks a class.',
        primaryFunction: 'content', crossFunctions: [], languageLevel: 'clause_word', ruleIds: ['C12'], sourceIds: [],
        confidence: 0.7, alternatives: [], abstentionReason: null, stageId: 'identify'
    }],
    abstentions: [],
    internalFlags: []
};

function writer(criteria: Array<{ id: string }>, levelId: string, excerptId: string | null) {
    return {
        criteria: criteria.map((criterion) => ({
            criterion: criterion.id,
            suggestedLevel: levelId,
            evidence: [{ quote: quoteA, rationale: 'The definition names no class.', revisionGuidance: 'Add a class word.', sflFindingIds: ['F1'], supportingExcerptId: excerptId, courseMaterialMention: null }],
            explanation: 'e',
            confidence: 0.6
        })),
        strengths: ['Clear sequencing: "First, the vibrating object pushes on the air particles next to it."'],
        revisionGoals: [{ skillTag: 'identify', goal: 'Define sound formally.', action: 'Name the class sound belongs to.', guidedQuestion: null }],
        internalFlags: [],
        globalRevision: { diagnosisStatement: 'The text explains a process.', whatToKeep: ['Sound'], rewriteDirection: 'Classify the types of sound.', supportingExcerptIds: null }
    };
}

function fakeLlm(fit: 'fits' | 'mismatch', excerptPicker: (content: string) => string | null) {
    const levelId = assignment.rubric.levels[0].id;
    const criteria = modelAssessedCriteria(assignment.rubric);
    return jest.fn(async (messages: Array<{ content: string }>, _schema: unknown, options: { structuredOutputName: string }) => {
        switch (options.structuredOutputName) {
            case 'text_diagnosis': return { parsed: diagnosis(fit) };
            case 'material_relevance': {
                const pairs = JSON.parse(messages[1].content.replace(/^<pairs>|<\/pairs>$/g, '')) as Array<{ pairId: string }>;
                return { parsed: { verdicts: pairs.map((pair) => ({ pairId: pair.pairId, verdict: 'supports' })) } };
            }
            case 'sfl_analysis': return { parsed: analysis };
            default: return { parsed: writer(criteria, levelId, excerptPicker(messages[1].content)) };
        }
    });
}

describe('RubricWritingFeedbackEngine pipeline', () => {
    const originalMock = process.env.MOCK_RESPONSE;
    beforeEach(() => { process.env.MOCK_RESPONSE = 'false'; });
    afterAll(() => {
        if (originalMock === undefined) delete process.env.MOCK_RESPONSE;
        else process.env.MOCK_RESPONSE = originalMock;
    });

    it('runs diagnosis first and gates a mismatch to global revision', async () => {
        const send = fakeLlm('mismatch', () => null);
        const retriever = new InMemoryMaterialRetriever();
        const generated = await new RubricWritingFeedbackEngine({ sendStructuredConversation: send } as unknown as LLMModule, retriever)
            .generate({ assignment, verifiedText: text });
        // Genre relevance may run first (it filters the diagnosis's course material); the
        // first model judgment about the student text is the diagnosis, before any analysis.
        const names = send.mock.calls.map((call) => call[2].structuredOutputName).filter((name) => name !== 'material_relevance');
        expect(names).toEqual(['text_diagnosis', 'sfl_analysis', 'writing_feedback_v2']);
        expect(generated.gateDecision).toBe('global_revision');
        expect(generated.runTrace?.gateDecision).toBe('global_revision');
        expect(generated.runTrace?.textDiagnosis?.realizedGenre).toBe('explanation');
        expect(generated.runTrace?.contrastExcerpts?.length).toBeGreaterThan(0);
        expect(generated.strengths).toEqual(['Sound is a strong entity to classify.']);
    });

    it('gives the analyzer the genre excerpts and the diagnosis', async () => {
        const send = fakeLlm('fits', () => null);
        await new RubricWritingFeedbackEngine({ sendStructuredConversation: send } as unknown as LLMModule, new InMemoryMaterialRetriever())
            .generate({ assignment, verifiedText: text });
        const analyzerCall = send.mock.calls.find((call) => call[2].structuredOutputName === 'sfl_analysis')!;
        expect(analyzerCall[0][0].content).toContain('<course_material_excerpts>');
        expect(analyzerCall[0][1].content).toContain('<text_diagnosis>');
    });

    it('cites only an excerpt the relevance check supported for that finding', async () => {
        const send = fakeLlm('fits', (writerInput) => {
            const excerpts = JSON.parse(writerInput.match(/<finding_excerpts>([\s\S]*?)<\/finding_excerpts>/)![1]) as Array<{ id: string; text: string }>;
            return excerpts.find((excerpt) => /formal definition/i.test(excerpt.text))?.id ?? null;
        });
        const generated = await new RubricWritingFeedbackEngine({ sendStructuredConversation: send } as unknown as LLMModule, new InMemoryMaterialRetriever())
            .generate({ assignment, verifiedText: text });
        const evidence = generated.criteria[0].evidence[0];
        expect(evidence.courseMaterialMention?.label).toBe('Week 2 · Lecture · Writing formal definitions');
        expect(generated.runTrace?.supportedExcerptIds).toContain(evidence.supportingExcerptId);
    });

    it('flags thin materials and still generates', async () => {
        const send = fakeLlm('mismatch', () => null);
        const generated = await new RubricWritingFeedbackEngine({ sendStructuredConversation: send } as unknown as LLMModule, new InMemoryMaterialRetriever([]))
            .generate({ assignment, verifiedText: text });
        expect(generated.runTrace?.flags).toContain('no_genre_material');
        expect(generated.gateDecision).toBe('global_revision');
    });

    it('fails with the fixed message when the diagnosis is invalid', async () => {
        const send = jest.fn(async (_m: unknown, _s: unknown, options: { structuredOutputName: string }) => (
            options.structuredOutputName === 'text_diagnosis' ? { parsed: { ...diagnosis('fits'), stages: [] } } : { parsed: {} }
        ));
        await expect(new RubricWritingFeedbackEngine({ sendStructuredConversation: send } as unknown as LLMModule, new InMemoryMaterialRetriever())
            .generate({ assignment, verifiedText: text })).rejects.toThrow(TEXT_DIAGNOSIS_FAILED_MESSAGE);
    });

    it('keeps mock mode standard with a deterministic diagnosis', async () => {
        process.env.MOCK_RESPONSE = 'true';
        const generated = await new RubricWritingFeedbackEngine().generate({ assignment, verifiedText: text });
        expect(generated.gateDecision).toBe('standard');
        expect(generated.runTrace?.textDiagnosis?.genreFit).toBe('fits');
    });
});
