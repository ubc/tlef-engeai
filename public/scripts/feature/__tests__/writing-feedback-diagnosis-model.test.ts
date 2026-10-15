/**
 * @fileoverview Review-page section check model: when it shows and its copy, held-back
 * split and release, the hold-back default, and when "Read again" appears.
 */

import {
    hasWholeTextProblem,
    readAgainLabel,
    releaseHeldBack,
    resolveHoldBack,
    sectionCheckView,
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

describe('sectionCheckView', () => {
    it('names both problems when the text is off-genre and missing most required sections', () => {
        const view = sectionCheckView(run, stages)!;
        expect(view.headline).toBe('This submission is off-genre and missing several sections.');
        expect(view.stageChips).toEqual([
            { label: 'General statement', status: 'Weak', required: true, tone: 'amber' },
            { label: 'Classification or composition', status: 'Missing', required: true, tone: 'red' },
            { label: 'Closing', status: 'Missing', required: false, tone: 'red' }
        ]);
        // Missing genre material belongs to the rubric page's coverage report, not each submission.
        expect(view.warnings).toEqual([]);
    });

    it('names missing sections alone when the genre fits', () => {
        const mostlyMissing = { ...run, textDiagnosis: { ...run.textDiagnosis!, genreFit: 'partial' } } as FeedbackRun;
        const view = sectionCheckView(mostlyMissing, stages)!;
        expect(view.headline).toBe('This submission is missing several sections.');
    });

    it('names off-genre alone when most required sections are present, whatever genre it reads as', () => {
        for (const realizedGenre of ['explanation', 'unclear']) {
            const offGenre = { ...run, textDiagnosis: { ...run.textDiagnosis!, realizedGenre, stages: [{ stageId: 'identify', status: 'present' }, { stageId: 'classify', status: 'weak' }] } } as FeedbackRun;
            const view = sectionCheckView(offGenre, stages)!;
            expect(view.headline).toBe('This submission is off-genre.');
        }
    });

    it('colours Present green and an unchecked section neutral', () => {
        const fits = { ...run, textDiagnosis: { ...run.textDiagnosis!, stages: [{ stageId: stages[0].id, status: 'present' }] } } as FeedbackRun;
        const chips = sectionCheckView(fits, stages)!.stageChips;
        expect(chips[0].tone).toBe('green');
        expect(chips[1]).toMatchObject({ status: 'Not checked', tone: 'neutral' });
    });

    it('is hidden without a whole-text problem', () => {
        expect(sectionCheckView({ ...run, gateDecision: 'standard' } as FeedbackRun, stages)).toBeNull();
    });

    it('is hidden for a run stored before the diagnosis existed', () => {
        expect(sectionCheckView({ ...run, textDiagnosis: undefined } as FeedbackRun, stages)).toBeNull();
    });
});

describe('held-back comments', () => {
    const comments = [comment('a', { heldBack: true }), comment('b', { origin: 'staff' })];

    it('splits only while annotations are held back', () => {
        expect(splitHeldBack(comments, true)).toEqual({ visible: [comments[1]], heldBack: [comments[0]] });
        expect(splitHeldBack(comments, false)).toEqual({ visible: comments, heldBack: [] });
    });

    it('groups unflagged model seeds as held back, but not released seeds or staff comments', () => {
        const seeds = [comment('s1'), comment('s2', { heldBack: false }), comment('st', { origin: 'staff' })];
        const split = splitHeldBack(seeds, true);
        expect(split.heldBack.map((item) => item.id)).toEqual(['s1']);
        expect(split.visible.map((item) => item.id)).toEqual(['s2', 'st']);
    });

    it('releases one comment by clearing its flag', () => {
        expect(releaseHeldBack(comments, 'a')[0].heldBack).toBe(false);
    });
});

describe('hold-back default', () => {
    it('holds back exactly when the run has a whole-text problem, unless staff chose', () => {
        expect(hasWholeTextProblem(run)).toBe(true);
        expect(resolveHoldBack(run)).toBe(true);
        expect(resolveHoldBack(run, false)).toBe(false);
        expect(resolveHoldBack({ ...run, gateDecision: 'standard' } as FeedbackRun)).toBe(false);
        expect(resolveHoldBack(null)).toBe(false);
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
