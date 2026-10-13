/**
 * @fileoverview Truth table for the whole-text gate: only a mismatch, or 75% or more of the
 * `required === true` stages weak or missing, sends a submission to rewrite feedback.
 */

import type { TextDiagnosis, WritingSflContextProfile } from '../contracts';
import { REWRITE_STAGE_SHARE, effectiveMode, resolveGateDecision, resolveRewriteGoal, studentFacingComments } from '../feedback-gate';

const profile = {
    stages: [
        { id: 'identify', label: 'General statement', purpose: 'Define', required: true },
        { id: 'classify', label: 'Classification', purpose: 'Types', required: true },
        { id: 'conclude', label: 'Closing', purpose: 'Generalize', required: false },
        { id: 'legacy', label: 'Legacy', purpose: 'No flag stored' }
    ]
} as unknown as WritingSflContextProfile;

function diagnosis(overrides: Partial<TextDiagnosis>): TextDiagnosis {
    return {
        realizedGenre: 'descriptive_report',
        genreFit: 'fits',
        stages: [
            { stageId: 'identify', status: 'present' },
            { stageId: 'classify', status: 'present' },
            { stageId: 'conclude', status: 'present' },
            { stageId: 'legacy', status: 'present' }
        ],
        contradictingFeatures: [],
        transferableStrengths: [],
        rationale: 'r',
        ...overrides
    };
}

describe('resolveGateDecision', () => {
    it('is standard when the text fits and every stage is present', () => {
        expect(resolveGateDecision(diagnosis({}), profile)).toBe('standard');
    });

    it('is global on a genre mismatch even when every stage is present', () => {
        expect(resolveGateDecision(diagnosis({ genreFit: 'mismatch', realizedGenre: 'explanation' }), profile)).toBe('global_revision');
    });

    it('stays standard when one of two required stages is missing', () => {
        const stages = diagnosis({}).stages.map((stage) => stage.stageId === 'classify' ? { ...stage, status: 'missing' as const } : stage);
        expect(resolveGateDecision(diagnosis({ stages }), profile)).toBe('standard');
    });

    it('is global when every required stage is weak or missing', () => {
        const stages = diagnosis({}).stages.map((stage) => stage.stageId === 'classify'
            ? { ...stage, status: 'missing' as const }
            : stage.stageId === 'identify' ? { ...stage, status: 'weak' as const } : stage);
        expect(resolveGateDecision(diagnosis({ stages }), profile)).toBe('global_revision');
    });

    it('stays standard when an optional or unflagged stage is missing', () => {
        const stages = diagnosis({}).stages.map((stage) => ['conclude', 'legacy'].includes(stage.stageId) ? { ...stage, status: 'missing' as const } : stage);
        expect(resolveGateDecision(diagnosis({ stages }), profile)).toBe('standard');
    });

    it('stays standard on a partial fit with a weak required stage', () => {
        const stages = diagnosis({}).stages.map((stage) => stage.stageId === 'identify' ? { ...stage, status: 'weak' as const } : stage);
        expect(resolveGateDecision(diagnosis({ genreFit: 'partial', stages }), profile)).toBe('standard');
    });
});

describe('resolveGateDecision at the 75% boundary', () => {
    const ids = ['s1', 's2', 's3', 's4', 's5', 's6'];
    const sixRequired = { stages: ids.map((id) => ({ id, label: id, purpose: 'p', required: true })) } as unknown as WritingSflContextProfile;
    const withFailing = (count: number, status: 'weak' | 'missing' = 'missing'): TextDiagnosis => diagnosis({
        stages: ids.map((id, index) => ({ stageId: id, status: index < count ? status : 'present' as const }))
    });

    it('uses a 0.75 share', () => {
        expect(REWRITE_STAGE_SHARE).toBe(0.75);
    });

    it('keeps standard feedback for one, two, three or four of six', () => {
        [1, 2, 3, 4].forEach((count) => expect(resolveGateDecision(withFailing(count), sixRequired)).toBe('standard'));
    });

    it('rewrites at five of six, weak or missing alike', () => {
        expect(resolveGateDecision(withFailing(5), sixRequired)).toBe('global_revision');
        expect(resolveGateDecision(withFailing(5, 'weak'), sixRequired)).toBe('global_revision');
    });

    it('rewrites at exactly 75% (three of four)', () => {
        const four = { stages: ids.slice(0, 4).map((id) => ({ id, label: id, purpose: 'p', required: true })) } as unknown as WritingSflContextProfile;
        const stages = ids.slice(0, 4).map((id, index) => ({ stageId: id, status: index < 3 ? 'weak' as const : 'present' as const }));
        expect(resolveGateDecision(diagnosis({ stages }), four)).toBe('global_revision');
    });

    it('stays standard with no required stages, even when every stage is missing', () => {
        const optional = { stages: ids.map((id) => ({ id, label: id, purpose: 'p', required: false })) } as unknown as WritingSflContextProfile;
        expect(resolveGateDecision(withFailing(6), optional)).toBe('standard');
    });

    it('counts a duplicated diagnosis entry once', () => {
        const two = { stages: ids.slice(0, 2).map((id) => ({ id, label: id, purpose: 'p', required: true })) } as unknown as WritingSflContextProfile;
        const stages = [{ stageId: 's1', status: 'missing' as const }, { stageId: 's1', status: 'missing' as const }, { stageId: 's2', status: 'present' as const }];
        expect(resolveGateDecision(diagnosis({ stages }), two)).toBe('standard');
    });
});

describe('effectiveMode', () => {
    it('lets the staff override win in both directions', () => {
        expect(effectiveMode('global_revision', 'standard')).toBe('standard');
        expect(effectiveMode('standard', 'global_revision')).toBe('global_revision');
    });

    it('treats a run stored before the gate as standard', () => {
        expect(effectiveMode(undefined, undefined)).toBe('standard');
    });
});

describe('studentFacingComments', () => {
    const comments = [{ id: 'a', heldBack: true }, { id: 'b' }, { id: 'c', heldBack: false }];

    it('hides held-back comments only in global mode', () => {
        expect(studentFacingComments(comments, 'global_revision').map((comment) => comment.id)).toEqual(['b', 'c']);
        expect(studentFacingComments(comments, 'standard').map((comment) => comment.id)).toEqual(['a', 'b', 'c']);
    });
});

describe('studentFacingComments after staff force rewrite mode on a standard run', () => {
    it('holds back model seeds that were never flagged, but not staff comments or released seeds', () => {
        const comments = [
            { id: 'seed', origin: 'model_seed' },
            { id: 'released', origin: 'model_seed', heldBack: false },
            { id: 'staff', origin: 'staff' }
        ];
        expect(studentFacingComments(comments, 'global_revision').map((comment) => comment.id)).toEqual(['released', 'staff']);
    });
});

describe('resolveRewriteGoal', () => {
    const rewriteGoal = { skillTag: 'descriptive_report', goal: 'REWRITE', action: 'a', guidedQuestion: 'q?', questionScope: 'whole' as const };
    const standardGoal = { skillTag: 'theme', goal: 'STANDARD', action: 'a' };

    it('uses the stored rewrite goal whatever the gate decided', () => {
        expect(resolveRewriteGoal({ gateDecision: 'standard', revisionGoals: [standardGoal] }, { rewriteGoal })?.goal).toBe('REWRITE');
        expect(resolveRewriteGoal({ gateDecision: 'global_revision', revisionGoals: [standardGoal] }, { rewriteGoal })?.goal).toBe('REWRITE');
    });

    it('falls back to the first goal of a legacy rewrite-gated run', () => {
        expect(resolveRewriteGoal({ gateDecision: 'global_revision', revisionGoals: [standardGoal] }, {})?.goal).toBe('STANDARD');
    });

    it('never presents a legacy standard run\'s goal as a rewrite goal', () => {
        expect(resolveRewriteGoal({ gateDecision: 'standard', revisionGoals: [standardGoal] }, {})).toBeUndefined();
        expect(resolveRewriteGoal({ revisionGoals: [standardGoal] }, undefined)).toBeUndefined();
    });
});
