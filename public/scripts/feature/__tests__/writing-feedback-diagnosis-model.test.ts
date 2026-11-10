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
    splitHeldBack,
    staffFlagNotes
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

describe('staffFlagNotes', () => {
    const withFlags = (flags: string[], internalFlags: string[] = []): FeedbackRun => ({
        id: 'run-1', createdAt: 'x', flags,
        result: { criteria: [], strengths: [], revisionGoals: [], internalFlags }
    } as unknown as FeedbackRun);

    it('says the whole-text check did not run when there was no assignment material', () => {
        expect(staffFlagNotes(withFlags(['no_assignment_material']))[0]).toContain('could not check whether this submission does what the assignment asks or is missing sections');
    });

    it('lists pipeline notes first, then what the model could not judge', () => {
        expect(staffFlagNotes(withFlags(['assignment_material_truncated'], ['Could not read the figure.']))).toEqual([
            'The assignment material was too long, so EngE-AI read only part of it.',
            'Could not read the figure.'
        ]);
    });

    it('names a missing reading once when retrieval itself failed', () => {
        const notes = staffFlagNotes(withFlags(['relevance_unavailable', 'no_course_material']));
        expect(notes).toEqual(['Course materials could not be checked for this run, so no readings were cited.']);
    });

    it('explains an empty reading list when retrieval worked', () => {
        expect(staffFlagNotes(withFlags(['no_course_material']))).toEqual(['No published course material supported this feedback, so no readings were cited.']);
    });

    it('leaves out a course-setup gap and any flag it has no wording for', () => {
        expect(staffFlagNotes(withFlags(['no_genre_material', 'some_future_flag']))).toEqual([]);
    });

    it('returns nothing for a run with no flags', () => {
        expect(staffFlagNotes({ id: 'run-1', result: { internalFlags: [] } } as unknown as FeedbackRun)).toEqual([]);
    });
});

describe('sectionCheckView', () => {
    const generalRun = (statuses: string[], genreFit = 'partial'): FeedbackRun => ({
        ...run,
        analysisMode: 'general',
        textDiagnosis: {
            ...run.textDiagnosis!,
            genreFit,
            stages: statuses.map((status, index) => ({ stageId: `section-${index + 1}`, label: `Part ${index + 1}`, status }))
        }
    } as unknown as FeedbackRun);

    it('builds a general run\'s chips from the sections the check found, not the inactive profile', () => {
        const view = sectionCheckView(generalRun(['missing', 'weak']), stages)!;
        expect(view.headline).toBe('This submission is missing several sections.');
        expect(view.stageChips).toEqual([
            { label: 'Part 1', status: 'Missing', required: true, tone: 'red' },
            { label: 'Part 2', status: 'Weak', required: true, tone: 'amber' }
        ]);
    });

    it('uses assignment wording, not genre wording, on a general run', () => {
        const both = sectionCheckView(generalRun(['missing', 'missing'], 'mismatch'), stages)!;
        expect(both.title).toBe('Off-task or missing sections');
        expect(both.headline).toBe('This submission does not do what the assignment asks and is missing several sections.');
    });

    it('keeps the genre wording on an SFL run', () => {
        expect(sectionCheckView(run, stages)!.title).toBe('Off-genre or missing sections');
    });

    it('shows an off-task general run with no named sections and no chips', () => {
        const view = sectionCheckView(generalRun([], 'mismatch'), stages)!;
        expect(view.headline).toBe('This submission does not do what the assignment asks.');
        expect(view.stageChips).toEqual([]);
    });

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
