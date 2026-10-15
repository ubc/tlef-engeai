/**
 * @fileoverview Summary seeding prints each goal's concrete action, and a question only
 * when the goal has one; the overall message is saved with the writing lens edit.
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


describe('SummaryEditor overall message', () => {
    it('saves the edited message with the writing lens edit', () => {
        const markDirty = jest.fn();
        const editor = new SummaryEditor(markDirty);
        editor.setOverallMessage('linguistic', '  Keep your topic.\n1. Define it.  ');
        expect(markDirty).toHaveBeenCalled();
        expect(editor.readEdit('linguistic', 'run-1').overallMessage).toBe('Keep your topic.\n1. Define it.');
    });

    it('sends an emptied message so the clear reaches the server', () => {
        const editor = new SummaryEditor(() => undefined);
        editor.setOverallMessage('linguistic', '   ');
        expect(editor.readEdit('linguistic', 'run-1').overallMessage).toBe('');
    });

    it('resends the displayed message on every save without marking the page dirty', () => {
        const markDirty = jest.fn();
        const editor = new SummaryEditor(markDirty);
        editor.seedOverallMessage('linguistic', 'Staff message.');
        expect(markDirty).not.toHaveBeenCalled();
        expect(editor.readEdit('linguistic', 'run-1').overallMessage).toBe('Staff message.');
    });

    it('never sends a message for a lens without one', () => {
        const editor = new SummaryEditor(() => undefined);
        expect(editor.readEdit('linguistic', 'run-1')).not.toHaveProperty('overallMessage');
        expect(editor.readEdit('technical', 'run-2')).not.toHaveProperty('overallMessage');
    });
});
