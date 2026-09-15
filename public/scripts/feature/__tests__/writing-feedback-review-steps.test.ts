import { changedLenses, decideNextAction, stepBarState } from '../writing-feedback-review-steps';

describe('stepBarState', () => {
    it('enables only the usable direction', () => {
        expect(stepBarState('annotations')).toEqual({ title: 'Review annotations', position: 'Step 1 of 3', backDisabled: true, nextDisabled: false });
        expect(stepBarState('summary')).toEqual({ title: 'Review feedback and grades', position: 'Step 2 of 3', backDisabled: false, nextDisabled: false });
        expect(stepBarState('review')).toEqual({ title: 'Review and release', position: 'Step 3 of 3', backDisabled: false, nextDisabled: true });
    });
});

describe('changedLenses', () => {
    it('lists lenses whose current fingerprint differs from the summary source', () => {
        expect(changedLenses({
            lenses: ['technical', 'linguistic'],
            currentFingerprints: { technical: 'aaaa0000', linguistic: 'bbbb0000' },
            sourceFingerprints: { technical: 'aaaa0000', linguistic: 'cccc0000' }
        })).toEqual(['linguistic']);
    });

    it('ignores a lens with no summary source', () => {
        expect(changedLenses({ lenses: ['technical'], currentFingerprints: { technical: 'a' }, sourceFingerprints: {} })).toEqual([]);
    });
});

describe('decideNextAction', () => {
    it('advances when nothing changed or the submission is past draft', () => {
        expect(decideNextAction({ status: 'draft_ready', changedLenses: [], editedLenses: ['linguistic'] })).toEqual({ kind: 'advance' });
        expect(decideNextAction({ status: 'approved', changedLenses: ['linguistic'], editedLenses: [] })).toEqual({ kind: 'advance' });
    });

    it('redrafts changed lenses nobody edited', () => {
        expect(decideNextAction({ status: 'draft_ready', changedLenses: ['technical'], editedLenses: ['linguistic'] }))
            .toEqual({ kind: 'redraft', lenses: ['technical'] });
    });

    it('asks first when a changed lens has an edited summary', () => {
        expect(decideNextAction({ status: 'draft_ready', changedLenses: ['technical', 'linguistic'], editedLenses: ['linguistic'] }))
            .toEqual({ kind: 'confirm', lenses: ['technical', 'linguistic'] });
    });
});
