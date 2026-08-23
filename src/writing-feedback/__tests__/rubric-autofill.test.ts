/**
 * @fileoverview Pins how much of a rubric draft auto-fill may rewrite. The rules
 * differ by where the grid came from: an instructor's imported rubric outranks a
 * generated one, and the APSC 182 form is the department's, not the model's.
 */

import { autofillMergeRules, mergeAutofill } from '../rubric-autofill';
import type { WritingRubricDefinition } from '../contracts';

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
});
