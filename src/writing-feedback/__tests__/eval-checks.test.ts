/**
 * @fileoverview Pins the live eval's pass/fail rules so a prompt change is judged by fixed checks.
 */

import { runEvalChecks, type EvalRunOutput } from '../eval-checks';
import type { EvalFixture } from './fixtures/eval/eval-fixtures';

const text = 'Sound happens when an object vibrates. First, the object pushes the air.';
const fixture: EvalFixture = {
    id: 'unit',
    text,
    materials: 'lecture-notes',
    expect: { mode: 'global_revision', stageStatuses: { classify: 'missing' }, flags: ['no_genre_material'] }
};

function byName(output: EvalRunOutput, f: EvalFixture = fixture) {
    return Object.fromEntries(runEvalChecks(output, f).map((check) => [check.name, check]));
}

describe('runEvalChecks', () => {
    it('fails new-behaviour checks on baseline output instead of throwing', () => {
        const checks = byName({
            verifiedText: text,
            result: {
                criteria: [{ evidence: [{ quote: 'Sound happens when an object vibrates.' }] }],
                strengths: ['Good use of temporal markers.'],
                revisionGoals: [{ goal: 'Revise.', guidedQuestion: 'What would you change?' }]
            }
        });
        expect(checks.mode.status).toBe('fail');
        expect(checks.goalsHaveAction.status).toBe('fail');
        expect(checks.quotesExact.status).toBe('pass');
    });

    it('passes a global-revision output that holds back local annotations', () => {
        const checks = byName({
            verifiedText: text,
            result: {
                gateDecision: 'global_revision',
                criteria: [{ evidence: [{ quote: 'First, the object pushes the air.' }] }],
                strengths: ['Sound is a good entity to classify.'],
                revisionGoals: [{ goal: 'Rewrite as a report.', action: 'List the types of sound first.' }],
                globalRevision: { diagnosisStatement: 'x', whatToKeep: ['Sound'], rewriteDirection: 'y' }
            },
            runTrace: {
                gateDecision: 'global_revision',
                textDiagnosis: {
                    stages: [{ stageId: 'classify', status: 'missing' }],
                    contradictingFeatures: [{ quote: 'First, the object pushes the air.' }]
                },
                flags: ['no_genre_material']
            },
            studentComments: []
        });
        expect(checks.mode.status).toBe('pass');
        expect(checks.stageStatuses.status).toBe('pass');
        expect(checks.strengthsGuard.status).toBe('pass');
        expect(checks.noLocalAnnotationsInGlobal.status).toBe('pass');
        expect(checks.flags.status).toBe('pass');
    });

    it('fails the strengths guard when a strength repeats a contradicting feature', () => {
        const checks = byName({
            verifiedText: text,
            result: { strengths: ['"First, the object pushes the air." sequences the process clearly.'], revisionGoals: [], criteria: [] },
            runTrace: { textDiagnosis: { stages: [], contradictingFeatures: [{ quote: 'First, the object pushes the air.' }] } }
        });
        expect(checks.strengthsGuard.status).toBe('fail');
    });

    it('fails a citation without a supporting excerpt', () => {
        const checks = byName({
            verifiedText: text,
            result: { criteria: [{ evidence: [{ quote: 'Sound happens when an object vibrates.', courseMaterialMention: { id: 'm1', label: 'L' } }] }], strengths: [], revisionGoals: [] }
        }, { ...fixture, expect: {} });
        expect(checks.citationsSupported.status).toBe('fail');
    });
});

describe('plainLanguage check', () => {
    const base = { verifiedText: text, result: { strengths: [], revisionGoals: [] } };

    it('fails dense SFL prose', () => {
        const output: EvalRunOutput = { ...base, result: { ...base.result, criteria: [{ explanation: 'The interpersonal choices are calibrated to the register.', evidence: [] }] } };
        const check = runEvalChecks(output, fixture, []).find((item) => item.name === 'plainLanguage');
        expect(check?.status).toBe('fail');
    });

    it('passes plain prose', () => {
        const output: EvalRunOutput = { ...base, result: { ...base.result, criteria: [{ explanation: 'Your paragraph explains how sound travels. A report says what sound is.', evidence: [] }] } };
        const check = runEvalChecks(output, fixture, []).find((item) => item.name === 'plainLanguage');
        expect(check?.status).toBe('pass');
    });

    it('allows a known course term', () => {
        const output: EvalRunOutput = { ...base, result: { ...base.result, criteria: [{ explanation: 'Your stance is clear.', evidence: [] }] } };
        expect(runEvalChecks(output, fixture, ['stance']).find((item) => item.name === 'plainLanguage')?.status).toBe('pass');
    });
});

describe('socraticQuestions check (D-153)', () => {
    const output = (goals: NonNullable<EvalRunOutput['result']['revisionGoals']>, gateDecision = 'standard', globalRevision?: EvalRunOutput['result']['globalRevision']): EvalRunOutput => ({
        verifiedText: text,
        result: { gateDecision, criteria: [], strengths: [], revisionGoals: goals, ...(globalRevision ? { globalRevision } : {}) }
    });

    it('passes with a whole and a part question', () => {
        expect(byName(output([
            { goal: 'g', guidedQuestion: 'Who reads your report, and what do they need first?', questionScope: 'whole' },
            { goal: 'g', guidedQuestion: 'Which word in your first sentence names the class?', questionScope: 'part' }
        ])).socraticQuestions.status).toBe('pass');
    });

    it('fails when a goal has no question or none is about the whole text', () => {
        expect(byName(output([{ goal: 'g', questionScope: 'whole' }])).socraticQuestions.status).toBe('fail');
        expect(byName(output([{ goal: 'g', guidedQuestion: 'Which word names the class?', questionScope: 'part' }])).socraticQuestions.status).toBe('fail');
    });

    it('fails a rewrite run whose rewrite block has no question', () => {
        expect(byName(output(
            [{ goal: 'g', guidedQuestion: 'What does your reader need first?', questionScope: 'whole' }],
            'global_revision',
            { diagnosisStatement: 'd', rewriteDirection: 'r' }
        )).socraticQuestions.status).toBe('fail');
    });
});
