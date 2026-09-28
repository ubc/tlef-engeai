/**
 * @fileoverview Truth table for the whole-text gate: only a mismatch or a missing
 * `required === true` stage sends a submission to rewrite feedback.
 */

import type { TextDiagnosis, WritingSflContextProfile } from '../contracts';
import { effectiveMode, resolveGateDecision, studentFacingComments } from '../feedback-gate';

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

    it('is global when a required stage is missing', () => {
        const stages = diagnosis({}).stages.map((stage) => stage.stageId === 'classify' ? { ...stage, status: 'missing' as const } : stage);
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
