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

    it('writes cells but not weights for the APSC 182 form, banding to the locked weight', () => {
        const apsc = [{ id: 'organization', label: 'Organization', description: 'old desc', points: 15 }];
        const merged = mergeAutofill(draft(apsc), proposal, autofillMergeRules('apsc182'));
        expect(merged.criteria[0].points).toBe(15);
        // The proposal's own points (25) are ignored for banding; the row's locked
        // weight (15) is, matching what "Space points evenly" would compute.
        expect(merged.criteria[0].cells).toEqual({
            weak: { min: 0, max: 7, descriptor: 'W' },
            strong: { min: 8, max: 15, descriptor: 'S' }
        });
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

    it('replaces an inverted model band for a known level with the weight-derived band', () => {
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
        expect(merged.criteria[0].cells).toEqual({
            weak: { min: 0, max: 12, descriptor: 'W' },
            strong: { min: 13, max: 25, descriptor: 'S' }
        });
        expect(writingRubricDraftInputSchema.safeParse(merged).success).toBe(true);
    });

    it('rescales a model band proposed on the wrong point total to the criterion\'s actual weight', () => {
        const wrongScaleProposal = {
            ...proposal,
            criteria: [
                {
                    id: 'organization', label: 'Organization', description: 'new desc', points: 30,
                    // The model assumed a 0-100 scale instead of the row's 30-point weight.
                    cells: { weak: { min: 0, max: 24 }, strong: { min: 25, max: 100 } }
                }
            ]
        };
        const merged = mergeAutofill(draft(existing), wrongScaleProposal, autofillMergeRules('metafunctions_plain'));
        expect(merged.criteria[0].cells).toEqual({
            weak: { min: 0, max: 15 },
            strong: { min: 16, max: 30 }
        });
    });

    it('replaces degenerate zero-value model bands with the weight-derived split', () => {
        const zeroedProposal = {
            ...proposal,
            criteria: [
                {
                    id: 'organization', label: 'Organization', description: 'new desc', points: 30,
                    cells: { weak: { min: 0, max: 0 }, strong: { min: 0, max: 0 } }
                }
            ]
        };
        const merged = mergeAutofill(draft(existing), zeroedProposal, autofillMergeRules('metafunctions_lab'));
        expect(merged.criteria[0].cells).toEqual({
            weak: { min: 0, max: 15 },
            strong: { min: 16, max: 30 }
        });
    });

    it('reconciles cells on a newly added row against that row\'s own proposed weight', () => {
        const merged = mergeAutofill(draft(existing), proposal, autofillMergeRules('metafunctions_plain'));
        const added = merged.criteria.find((criterion) => criterion.id === 'method');
        // proposal's "method" row proposes points 20 with cells 0-7/8-20; the weight-
        // derived award for 20 points across two levels is 10/20, so the model's
        // own numbers are overridden here too, exactly as for an existing row.
        expect(added?.cells).toEqual({
            weak: { min: 0, max: 10, descriptor: 'W' },
            strong: { min: 11, max: 20, descriptor: 'S' }
        });
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

    /**
     * Injected in place of a real `LLMModule`; only `sendStructuredConversation` is ever
     * called. `sendStructuredConversation` enforces JSON output and validation at the API
     * level, so the fake returns already-parsed data the way the real toolkit would.
     */
    function fakeLlm(parsed: unknown): LLMModule {
        return { sendStructuredConversation: async () => ({ parsed }) } as unknown as LLMModule;
    }

    /** Simulates the toolkit itself rejecting (malformed/non-JSON model output, schema mismatch). */
    function rejectingLlm(): LLMModule {
        return {
            sendStructuredConversation: async () => { throw new Error('model did not return valid structured output'); }
        } as unknown as LLMModule;
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

    it('throws a fixed message when the model does not return usable structured output', async () => {
        // Covers what used to be "no JSON in the response," "malformed JSON," and
        // "schema-invalid response": sendStructuredConversation now owns all three
        // failure modes and simply rejects; our code only needs a fixed message back.
        await expect(
            proposeRubricFromInstructions('i', draft(knownCriteria), rejectingLlm())
        ).rejects.toThrow('Auto-fill response was not usable');
    });

    it('drops any criterion id the model invented', async () => {
        const result = await proposeRubricFromInstructions(
            'i', draft(knownCriteria), fakeLlm(validResponseBody)
        );
        expect(result.criteria.map((c) => c.id)).toEqual(['organization']);
    });

    it('clips an over-long field to the draft limit instead of refusing the proposal', async () => {
        // Longer than the proposal schema's own max(2000) is refused elsewhere; this is
        // the gap the proposal schema allows but the draft validator (max 1200) does not.
        const longTask = 'word '.repeat(300).trim();
        expect(longTask.length).toBeGreaterThan(1200);
        const verboseBody = { ...validResponseBody, task: longTask };

        const result = await proposeRubricFromInstructions(
            'i', draft(knownCriteria), fakeLlm(verboseBody)
        );

        expect(result.task.length).toBeLessThanOrEqual(1200);
        // Clipped at a word boundary: the shortened text is a clean prefix of the original.
        expect(longTask.startsWith(result.task)).toBe(true);
    });

    it('omits (not merely undefines) optional fields the model returned as null', async () => {
        // OpenAI's structured-output JSON-schema mode requires every optional field to
        // be nullable, and the API sends an explicit `null` for a field the model left
        // unset rather than omitting the key. The proposal schema must accept that shape.
        //
        // The returned AutofillProposal must OMIT the key entirely, not merely set it to
        // `undefined` — `{ ...obj, key: undefined }` still leaves `key` as an own property,
        // and MongoDB's driver serializes an undefined-valued property as a stored BSON
        // null on write. A later read-back then hands the frontend a literal `null`,
        // which the draft-save schema rejects ("Expected string, received null") the next
        // time that draft is saved — this is the actual bug this test pins, not just the
        // narrower "is the value falsy" check `toBeUndefined()` alone would allow to regress.
        const bodyWithNulls = {
            ...validResponseBody,
            sflContext: {
                genreId: null,
                genreLabel: 'Custom genre',
                genreState: 'custom',
                task: 't', purpose: 'p', audience: 'a', field: 'f', tenor: 'te', mode: 'm',
                actualEvaluator: 'ae', productionConditions: 'pc',
                stages: [{ id: 'stage_one', label: 'Stage one', purpose: 'Does the work.', required: null, order: null }],
                embeddedGenres: [],
                taskRequirements: ['req'],
                learningOutcomes: ['outcome'],
                approvedGlossaryTerms: null
            },
            criteria: [
                { id: 'organization', label: 'Organization', description: 'd', points: null,
                  cells: { weak: { min: 0, max: 5, descriptor: null } } }
            ]
        };

        const result = await proposeRubricFromInstructions('i', draft(knownCriteria), fakeLlm(bodyWithNulls));

        // The property must be ABSENT, not present-with-undefined — `in` distinguishes
        // the two the same way MongoDB's serializer does; `toBeUndefined()` alone would not.
        expect('genreId' in (result.sflContext as object)).toBe(false);
        expect('approvedGlossaryTerms' in (result.sflContext as object)).toBe(false);
        expect('required' in result.sflContext!.stages[0]).toBe(false);
        expect('order' in result.sflContext!.stages[0]).toBe(false);
        expect('points' in result.criteria[0]).toBe(false);
        expect('descriptor' in result.criteria[0].cells!.weak).toBe(false);
        // Confirm no literal `null` leaked through anywhere in the normalized result,
        // including via JSON.stringify (which itself drops undefined-valued keys, so this
        // check alone is necessary-but-not-sufficient — the `in` checks above are the
        // ones that actually pin the key-omission behavior this bug required).
        expect(JSON.stringify(result)).not.toContain('null');
    });
});
