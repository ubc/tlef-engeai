/**
 * @fileoverview Pins how much of a rubric draft auto-fill may rewrite. The rules
 * differ by where the grid came from: an instructor's imported rubric outranks a
 * generated one, and the APSC 182 form is the department's, not the model's.
 */

import type { LLMModule } from 'ubc-genai-toolkit-llm';
import {
    autofillMergeRules,
    gridSourceFor,
    mergeAutofill,
    proposeRubricFromInstructions
} from '../rubric-autofill';
import { writingRubricDraftInputSchema } from '../rubric-schema';
import type { WritingAssignment, WritingRubricDefinition } from '../contracts';

const levels = [
    { id: 'weak', label: 'Weak', description: 'd', rank: 1 },
    { id: 'strong', label: 'Strong', description: 'd', rank: 2 }
];

const draft = (criteria: WritingRubricDefinition['criteria']): WritingRubricDefinition => ({
    version: 1, status: 'draft', title: '', task: '', audience: '', purpose: '',
    constraints: [], learningOutcomes: [], gradingIntent: '',
    criteria, levels, updatedAt: new Date(), updatedBy: 'u'
});

const proposal = {
    title: 'Lab 3 rubric',
    task: 'Report the coefficient.',
    audience: 'A technical reader.',
    purpose: 'State what was found.',
    constraints: ['SI units'],
    learningOutcomes: ['Compare against theory'],
    gradingIntent: 'Formative.',
    criteria: [
        { id: 'organization', label: 'Organization', description: 'new desc', points: 25,
          cells: { weak: { min: 0, max: 9, descriptor: 'W' }, strong: { min: 10, max: 25, descriptor: 'S' } } },
        { id: 'method', label: 'Method', description: 'added by the model', points: 20,
          cells: { weak: { min: 0, max: 7, descriptor: 'W' }, strong: { min: 8, max: 20, descriptor: 'S' } } }
    ]
};

describe('autofillMergeRules', () => {
    it('locks everything for a Canvas-seeded grid', () => {
        expect(autofillMergeRules('canvas'))
            .toEqual({ mayAddRows: false, mayWriteRow: false, mayWriteCells: false });
    });

    it('locks rows and weights for the APSC 182 form', () => {
        expect(autofillMergeRules('apsc182'))
            .toEqual({ mayAddRows: false, mayWriteRow: false, mayWriteCells: true });
    });

    it('locks rows but allows weights for a lab report writing rubric', () => {
        expect(autofillMergeRules('metafunctions_lab'))
            .toEqual({ mayAddRows: false, mayWriteRow: true, mayWriteCells: true });
    });

    it('allows added rows on a plain assignment', () => {
        expect(autofillMergeRules('metafunctions_plain'))
            .toEqual({ mayAddRows: true, mayWriteRow: true, mayWriteCells: true });
    });
});

describe('mergeAutofill', () => {
    const existing = [{ id: 'organization', label: 'Organization', description: 'old desc' }];

    it('always fills the assignment details', () => {
        const merged = mergeAutofill(draft(existing), proposal, autofillMergeRules('canvas'));
        expect(merged.task).toBe('Report the coefficient.');
        expect(merged.constraints).toEqual(['SI units']);
    });

    it('leaves a Canvas grid completely alone', () => {
        const merged = mergeAutofill(draft(existing), proposal, autofillMergeRules('canvas'));
        expect(merged.criteria).toEqual(existing);
    });

    it('writes cells but not weights for the APSC 182 form', () => {
        const apsc = [{ id: 'organization', label: 'Organization', description: 'old desc', points: 15 }];
        const merged = mergeAutofill(draft(apsc), proposal, autofillMergeRules('apsc182'));
        expect(merged.criteria[0].points).toBe(15);
        expect(merged.criteria[0].cells?.weak.descriptor).toBe('W');
    });

    it('never adds a row when rows are locked', () => {
        const merged = mergeAutofill(draft(existing), proposal, autofillMergeRules('metafunctions_lab'));
        expect(merged.criteria.map((c) => c.id)).toEqual(['organization']);
        expect(merged.criteria[0].points).toBe(25);
    });

    it('adds a proposed row on a plain assignment', () => {
        const merged = mergeAutofill(draft(existing), proposal, autofillMergeRules('metafunctions_plain'));
        expect(merged.criteria.map((c) => c.id)).toEqual(['organization', 'method']);
    });

    it('never removes an existing row, even when the proposal omits it', () => {
        const twoRows = [
            { id: 'organization', label: 'Organization', description: 'd' },
            { id: 'content', label: 'Content', description: 'd' }
        ];
        const merged = mergeAutofill(draft(twoRows), proposal, autofillMergeRules('metafunctions_plain'));
        expect(merged.criteria.map((c) => c.id)).toContain('content');
    });

    it('never changes the approval status', () => {
        const merged = mergeAutofill(draft(existing), proposal, autofillMergeRules('metafunctions_plain'));
        expect(merged.status).toBe('draft');
    });

    it('produces a rubric the shared draft validator refuses when a band keys to an unknown level', () => {
        const badProposal = {
            ...proposal,
            criteria: [
                {
                    id: 'organization', label: 'Organization', description: 'new desc', points: 25,
                    cells: { weak: { min: 0, max: 9, descriptor: 'W' }, made_up_level: { min: 10, max: 25, descriptor: 'S' } }
                }
            ]
        };
        const merged = mergeAutofill(draft(existing), badProposal, autofillMergeRules('metafunctions_plain'));
        expect(writingRubricDraftInputSchema.safeParse(merged).success).toBe(false);
    });

    it('produces a rubric the shared draft validator refuses when a band starts above where it ends', () => {
        const badProposal = {
            ...proposal,
            criteria: [
                {
                    id: 'organization', label: 'Organization', description: 'new desc', points: 25,
                    cells: { weak: { min: 10, max: 2, descriptor: 'W' }, strong: { min: 11, max: 25, descriptor: 'S' } }
                }
            ]
        };
        const merged = mergeAutofill(draft(existing), badProposal, autofillMergeRules('metafunctions_plain'));
        expect(writingRubricDraftInputSchema.safeParse(merged).success).toBe(false);
    });
});

function baseAssignment(overrides: Partial<WritingAssignment> = {}): WritingAssignment {
    return {
        id: 'assignment-1',
        courseId: 'course-1',
        title: 'Assignment',
        profileVersion: 'writing-feedback-v1',
        rubricSource: 'internal_profile',
        rubric: draft([{ id: 'organization', label: 'Organization', description: 'd' }]),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

describe('gridSourceFor', () => {
    it('is the department form for the technical lens even on a Canvas-imported assignment', () => {
        // The technical grid is always `buildLabReportRubric`'s APSC 182 form and is
        // never Canvas-seeded, so the lens must be checked before `rubricSource`.
        expect(gridSourceFor(baseAssignment({ rubricSource: 'canvas', isLabReport: true }), 'technical'))
            .toBe('apsc182');
    });

    it('is Canvas for the linguistic lens when the assignment was imported', () => {
        expect(gridSourceFor(baseAssignment({ rubricSource: 'canvas' }), 'linguistic')).toBe('canvas');
    });

    it('is the lab-report metafunctions for the linguistic lens on a lab report', () => {
        expect(gridSourceFor(baseAssignment({ isLabReport: true }), 'linguistic')).toBe('metafunctions_lab');
    });

    it('is the plain metafunctions for the linguistic lens on a non-lab assignment', () => {
        expect(gridSourceFor(baseAssignment(), 'linguistic')).toBe('metafunctions_plain');
    });
});

describe('proposeRubricFromInstructions', () => {
    const originalMockResponse = process.env.MOCK_RESPONSE;
    const knownCriteria = [{ id: 'organization', label: 'Organization', description: 'd' }];

    afterEach(() => {
        if (originalMockResponse === undefined) delete process.env.MOCK_RESPONSE;
        else process.env.MOCK_RESPONSE = originalMockResponse;
    });

    /** Injected in place of a real `LLMModule`; only `sendMessage` is ever called. */
    function fakeLlm(content: string): LLMModule {
        return { sendMessage: async () => ({ content }) } as unknown as LLMModule;
    }

    const validResponseBody = {
        title: 'Lab 3 rubric',
        task: 'Report the coefficient.',
        audience: 'A technical reader.',
        purpose: 'State what was found.',
        constraints: ['SI units'],
        learningOutcomes: ['Compare against theory'],
        gradingIntent: 'Formative.',
        criteria: [
            { id: 'organization', label: 'Organization', description: 'new desc' },
            { id: 'invented_by_model', label: 'Invented', description: 'should be dropped' }
        ]
    };

    it('never calls a feature LLM under MOCK_RESPONSE, even with no injected module', async () => {
        process.env.MOCK_RESPONSE = 'true';
        const result = await proposeRubricFromInstructions('irrelevant', draft(knownCriteria));
        expect(result.criteria.map((c) => c.id)).toEqual(['organization']);
    });

    it('locates a JSON object fenced inside surrounding prose', async () => {
        const fenced = `Here is the rubric:\n\`\`\`json\n${JSON.stringify(validResponseBody)}\n\`\`\`\nHope that helps.`;
        const result = await proposeRubricFromInstructions('i', draft(knownCriteria), fakeLlm(fenced));
        expect(result.title).toBe('Lab 3 rubric');
    });

    it('throws a fixed message on malformed JSON', async () => {
        await expect(
            proposeRubricFromInstructions('i', draft(knownCriteria), fakeLlm('{"title": "T", corrupted}'))
        ).rejects.toThrow('Auto-fill response was not usable');
    });

    it('throws a fixed message on a schema-invalid response', async () => {
        await expect(
            proposeRubricFromInstructions('i', draft(knownCriteria), fakeLlm(JSON.stringify({ nonsense: true })))
        ).rejects.toThrow('Auto-fill response was not usable');
    });

    it('drops any criterion id the model invented', async () => {
        const result = await proposeRubricFromInstructions(
            'i', draft(knownCriteria), fakeLlm(JSON.stringify(validResponseBody))
        );
        expect(result.criteria.map((c) => c.id)).toEqual(['organization']);
    });
});
