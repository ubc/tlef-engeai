/**
 * @fileoverview Review-page diagnosis model: banner copy, held-back split and release,
 * effective mode, and when "Read again" appears.
 */

import {
    diagnosisBannerView,
    readAgainLabel,
    releaseHeldBack,
    resolvedMode,
    showReadAgain,
    splitHeldBack
} from '../writing-feedback-diagnosis-model';
import type { AnchoredComment, FeedbackRun } from '../writing-feedback-shared';

const stages = [
    { id: 'identify', label: 'General statement', required: true },
    { id: 'classify', label: 'Classification or composition', required: true },
    { id: 'conclude', label: 'Closing', required: false }
];

const run = {
    id: 'run-1', createdAt: 'x', gateDecision: 'global_revision', flags: ['no_genre_material'], supportedExcerptIds: ['f1'],
    textDiagnosis: {
        realizedGenre: 'explanation', genreFit: 'mismatch',
        stages: [{ stageId: 'identify', status: 'weak' }, { stageId: 'classify', status: 'missing' }, { stageId: 'conclude', status: 'missing' }],
        contradictingFeatures: [], transferableStrengths: [], rationale: 'Sequences a process.'
    },
    result: { criteria: [], strengths: [], revisionGoals: [], internalFlags: [] }
} as unknown as FeedbackRun;

const comment = (id: string, extra: Partial<AnchoredComment> = {}): AnchoredComment => ({
    id, lens: 'linguistic', quote: 'q', startOffset: 0, endOffset: 1, comment: 'c', origin: 'model_seed', ...extra
});

describe('diagnosisBannerView', () => {
    it('describes the diagnosis in plain words with required stages marked', () => {
        const view = diagnosisBannerView(run, stages, 'global_revision')!;
        expect(view.headline).toBe('This reads as an explanation, not the target genre.');
        expect(view.stageChips).toEqual([
            { label: 'General statement', status: 'Weak', required: true },
            { label: 'Classification or composition', status: 'Missing', required: true },
            { label: 'Closing', status: 'Missing', required: false }
        ]);
        expect(view.warnings).toEqual(['No course material on this genre was found, so the diagnosis relies on general knowledge.']);
        expect(view.toggleLabel).toBe('Switch to standard feedback');
    });

    it('returns null for a run stored before the diagnosis existed', () => {
        expect(diagnosisBannerView({ ...run, textDiagnosis: undefined } as FeedbackRun, stages, 'standard')).toBeNull();
    });
});

describe('held-back comments', () => {
    const comments = [comment('a', { heldBack: true }), comment('b', { origin: 'staff' })];

    it('splits only in global mode', () => {
        expect(splitHeldBack(comments, 'global_revision')).toEqual({ visible: [comments[1]], heldBack: [comments[0]] });
        expect(splitHeldBack(comments, 'standard')).toEqual({ visible: comments, heldBack: [] });
    });

    it('releases one comment by clearing its flag', () => {
        expect(releaseHeldBack(comments, 'a')[0].heldBack).toBe(false);
    });
});

describe('resolvedMode', () => {
    it('prefers the override, then the gate, then standard', () => {
        expect(resolvedMode(run, 'standard')).toBe('standard');
        expect(resolvedMode(run)).toBe('global_revision');
        expect(resolvedMode(null)).toBe('standard');
    });
});

describe('showReadAgain', () => {
    it('shows a model citation only when its excerpt was supported', () => {
        const cited = comment('c', { courseMaterialMention: { id: 'm', label: 'L' } });
        expect(showReadAgain({ ...cited, supportingExcerptId: 'f1' } as AnchoredComment, run)).toBe(true);
        expect(showReadAgain({ ...cited, supportingExcerptId: 'zz' } as AnchoredComment, run)).toBe(false);
    });

    it('always shows a staff-named reading', () => {
        expect(showReadAgain(comment('d', { origin: 'staff', courseMaterialTitle: 'Week 2 notes' }), run)).toBe(true);
    });
});


describe('readAgainLabel', () => {
    it('falls back to a staff-named title when a model citation lost its support', () => {
        const seed = comment('e', { courseMaterialMention: { id: 'm', label: 'Unsupported lecture' }, courseMaterialTitle: 'Week 2 notes' });
        expect(readAgainLabel({ ...seed, supportingExcerptId: 'zz' } as AnchoredComment, run)).toBe('Week 2 notes');
    });

    it('uses the supported mention first', () => {
        const seed = comment('f', { courseMaterialMention: { id: 'm', label: 'Supported lecture' }, courseMaterialTitle: 'Week 2 notes' });
        expect(readAgainLabel({ ...seed, supportingExcerptId: 'f1' } as AnchoredComment, run)).toBe('Supported lecture');
    });

    it('shows nothing for a model seed with no supported citation and no title', () => {
        expect(readAgainLabel(comment('g', { courseMaterialMention: { id: 'm', label: 'L' } }), run)).toBeUndefined();
    });
});

describe('splitHeldBack on a standard run switched to rewrite mode', () => {
    it('groups unflagged model seeds as held back', () => {
        const seeds = [comment('s1'), comment('s2', { heldBack: false }), comment('st', { origin: 'staff' })];
        const split = splitHeldBack(seeds, 'global_revision');
        expect(split.heldBack.map((item) => item.id)).toEqual(['s1']);
        expect(split.visible.map((item) => item.id)).toEqual(['s2', 'st']);
    });
});
