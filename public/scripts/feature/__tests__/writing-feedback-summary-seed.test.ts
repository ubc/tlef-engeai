/**
 * @fileoverview Summary seeding prints each goal's concrete action, and a question only
 * when the goal has one.
 */

import { SummaryEditor, seedSummaryText } from '../writing-feedback-summary-editor';

describe('seedSummaryText', () => {
    it('prints the action and omits a missing question', () => {
        expect(seedSummaryText([{ goal: 'Define sound formally.', action: 'Name the class sound belongs to.' }]))
            .toBe('1. Define sound formally.\nNext step: Name the class sound belongs to.');
    });

    it('keeps the question for goals stored before actions existed', () => {
        expect(seedSummaryText([{ goal: 'Revise.', guidedQuestion: 'What would you change first?' }]))
            .toBe('1. Revise.\nAsk yourself: What would you change first?');
    });
});


describe('SummaryEditor rewrite block', () => {
    it('saves a complete rewrite block with the writing lens edit', () => {
        const editor = new SummaryEditor(() => undefined);
        editor.setGlobalRevision('linguistic', { diagnosisStatement: 'It explains.', whatToKeep: ['Sound'], rewriteDirection: 'Classify.' });
        expect(editor.readEdit('linguistic', 'run-1').globalRevision)
            .toEqual({ diagnosisStatement: 'It explains.', whatToKeep: ['Sound'], rewriteDirection: 'Classify.' });
    });

    it('omits an incomplete block the server would refuse', () => {
        const editor = new SummaryEditor(() => undefined);
        editor.setGlobalRevision('linguistic', { diagnosisStatement: '  ', whatToKeep: [], rewriteDirection: 'Classify.' });
        expect(editor.readEdit('linguistic', 'run-1').globalRevision).toBeUndefined();
    });
});

describe('SummaryEditor rewrite block seeding', () => {
    it('resends the displayed block on every save without marking the page dirty', () => {
        const markDirty = jest.fn();
        const editor = new SummaryEditor(markDirty);
        editor.seedGlobalRevision('linguistic', { diagnosisStatement: 'Staff diagnosis.', whatToKeep: [], rewriteDirection: 'Staff direction.' });
        expect(markDirty).not.toHaveBeenCalled();
        expect(editor.readEdit('linguistic', 'run-1').globalRevision?.diagnosisStatement).toBe('Staff diagnosis.');
    });
});
