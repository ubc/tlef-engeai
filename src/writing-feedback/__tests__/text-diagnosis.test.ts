/**
 * @fileoverview Diagnosis validation: exact quotes, one entry per profile stage, and a
 * prompt that carries course material but never names excerpt text as the student's.
 */

import { buildEvalAssignment } from './fixtures/eval/eval-fixtures';
import {
    buildTextDiagnosisSystemPrompt,
    deterministicTextDiagnosis,
    validateTextDiagnosis
} from '../text-diagnosis';

const assignment = buildEvalAssignment();
const profile = assignment.rubric.sflContext!;
const text = 'How Sound Works. Sound happens when an object vibrates. First, the object pushes the air.';

function raw(overrides: Record<string, unknown> = {}) {
    return {
        realizedGenre: 'explanation',
        genreFit: 'mismatch',
        stages: [
            { stageId: 'identify', status: 'weak', evidence: 'Sound happens when an object vibrates.' },
            { stageId: 'classify', status: 'missing', evidence: null },
            { stageId: 'describe', status: 'missing', evidence: null },
            { stageId: 'conclude', status: 'missing', evidence: null }
        ],
        contradictingFeatures: [{ quote: 'First, the object pushes the air.', note: 'Temporal sequence of a process.' }],
        transferableStrengths: [{ text: 'Sound is a good entity to classify.', quote: null }],
        rationale: 'The text sequences a process.',
        ...overrides
    };
}

describe('validateTextDiagnosis', () => {
    it('accepts a complete diagnosis and strips nulls', () => {
        const diagnosis = validateTextDiagnosis(raw(), text, profile);
        expect(diagnosis.realizedGenre).toBe('explanation');
        expect(diagnosis.stages[1]).toEqual({ stageId: 'classify', status: 'missing' });
        expect(diagnosis.transferableStrengths[0]).toEqual({ text: 'Sound is a good entity to classify.' });
    });

    it('repairs cosmetic quote drift against the verified text', () => {
        const diagnosis = validateTextDiagnosis(raw({
            contradictingFeatures: [{ quote: 'First,  the object pushes the air.', note: 'n' }]
        }), text, profile);
        expect(diagnosis.contradictingFeatures[0].quote).toBe('First, the object pushes the air.');
    });

    it('rejects a quote absent from the verified text', () => {
        expect(() => validateTextDiagnosis(raw({
            contradictingFeatures: [{ quote: 'Sound has three types.', note: 'n' }]
        }), text, profile)).toThrow('Diagnosis evidence did not match the verified submission text');
    });

    it('rejects a stage id outside the profile', () => {
        const stages = [...raw().stages.slice(0, 3), { stageId: 'invented', status: 'missing', evidence: null }];
        expect(() => validateTextDiagnosis(raw({ stages }), text, profile)).toThrow('Diagnosis must cover each profile stage exactly once');
    });

    it('rejects a diagnosis that omits a profile stage', () => {
        expect(() => validateTextDiagnosis(raw({ stages: raw().stages.slice(0, 3) }), text, profile))
            .toThrow('Diagnosis must cover each profile stage exactly once');
    });

    it('drops evidence on a missing stage rather than trusting it', () => {
        const stages = raw().stages.map((stage) => stage.stageId === 'classify'
            ? { ...stage, evidence: 'Sound happens when an object vibrates.' }
            : stage);
        const diagnosis = validateTextDiagnosis(raw({ stages }), text, profile);
        expect(diagnosis.stages.find((stage) => stage.stageId === 'classify')?.evidence).toBeUndefined();
    });
});

describe('buildTextDiagnosisSystemPrompt', () => {
    it('lists every stage with its required flag and carries the excerpts', () => {
        const prompt = buildTextDiagnosisSystemPrompt(assignment, [{ id: 'ex-1', text: 'A report is not an explanation.' }]);
        expect(prompt).toContain('"id":"classify"');
        expect(prompt).toContain('"required":true');
        expect(prompt).toContain('A report is not an explanation.');
        expect(prompt).toContain('explanation');
    });

    it('tells the model how to proceed with no course material', () => {
        expect(buildTextDiagnosisSystemPrompt(assignment, [])).toContain('No course material was found');
    });
});

describe('deterministicTextDiagnosis', () => {
    it('reports a fit with every stage present, so mock flows stay standard', () => {
        const diagnosis = deterministicTextDiagnosis(profile, text);
        expect(diagnosis.genreFit).toBe('fits');
        expect(diagnosis.stages.map((stage) => stage.stageId)).toEqual(profile.stages.map((stage) => stage.id));
        expect(diagnosis.stages.every((stage) => stage.status === 'present')).toBe(true);
    });
});
