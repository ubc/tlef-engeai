/**
 * SFL analysis tests — V2 validation gates
 *
 * Pins the runtime SFL rule allowlist and deterministic validation that sits
 * between the analyzer and feedback-writer calls.
 *
 * @author: @rdschrs
 * @date: 2026-08-24
 * @version: 1.0.0
 * @description: Regression coverage for SFL exact evidence, custom genres, and dedupe gates.
 */

import type { SflAnalysis, WritingSflContextProfile } from '../contracts';
import { SFL_FERREIRA_RULES } from '../sfl-foundation';
import { requireCompleteSflProfile, validateSflAnalysis } from '../sfl-analysis';
import { buildDefaultSflContextProfile } from '../default-rubric-profile';

const profile: WritingSflContextProfile = {
    genreId: 'data_commentary',
    genreLabel: 'Data commentary',
    genreState: 'staff_confirmed',
    task: 'Interpret a result.',
    purpose: 'Explain what the result means.',
    audience: 'A course instructor.',
    field: 'Engineering measurements.',
    tenor: 'Student writer to evaluator.',
    mode: 'Written take-home response.',
    actualEvaluator: 'Teaching assistant.',
    productionConditions: 'Submitted after lab.',
    stages: [{ id: 'interpretation', label: 'Interpretation', purpose: 'Explains the result.', required: true, order: 1 }],
    embeddedGenres: [],
    taskRequirements: ['Refer to the reported data.'],
    learningOutcomes: ['Connect evidence to interpretation.']
};

function analysis(overrides: Partial<SflAnalysis> = {}): SflAnalysis {
    return {
        schemaVersion: 'writing-feedback-v2',
        foundationVersion: 'test',
        profileGenreState: 'staff_confirmed',
        findings: [{
            id: 'finding-1',
            evidence: [{ quote: 'The measured value increased.' }],
            observation: 'The passage reports an increasing measured value.',
            functionalInterpretation: 'The wording can support a data-commentary interpretation when linked to significance.',
            primaryFunction: 'content',
            crossFunctions: ['organizational'],
            languageLevel: 'section',
            ruleIds: ['C09'],
            sourceIds: ['SRC-FERREIRA-2026-AI-FEEDBACK#table-2-r10'],
            confidence: 0.7,
            alternatives: ['A concise description may be enough if interpretation appears nearby.'],
            stageId: 'interpretation'
        }],
        abstentions: [],
        internalFlags: [],
        ...overrides
    };
}

describe('SFL foundation resource', () => {
    it('packages all 42 Ferreira rules with stable ids', () => {
        expect(SFL_FERREIRA_RULES).toHaveLength(42);
        expect(new Set(SFL_FERREIRA_RULES.map((rule) => rule.ruleId)).size).toBe(42);
        expect(SFL_FERREIRA_RULES.map((rule) => rule.ruleId)).toEqual([
            ...Array.from({ length: 14 }, (_value, index) => `C${String(index + 1).padStart(2, '0')}`),
            ...Array.from({ length: 14 }, (_value, index) => `I${String(index + 1).padStart(2, '0')}`),
            ...Array.from({ length: 14 }, (_value, index) => `O${String(index + 1).padStart(2, '0')}`)
        ]);
    });
});

describe('validateSflAnalysis', () => {
    it('accepts exact evidence and known rule/source ids', () => {
        const result = validateSflAnalysis(
            analysis(),
            'The measured value increased. This matters for the conclusion.',
            profile
        );

        expect(result.schemaVersion).toBe('writing-feedback-v2');
        expect(result.findings[0].ruleIds).toEqual(['C09']);
    });

    it('rejects evidence that is not an exact verified-text span', () => {
        expect(() => validateSflAnalysis(
            analysis(),
            'The measured value decreased.',
            profile
        )).toThrow('SFL analysis evidence did not match');
    });

    it('reconciles a quote whose whitespace was collapsed by the model', () => {
        const verifiedText = 'The measured value\n   increased. This matters for the conclusion.';
        const result = validateSflAnalysis(analysis(), verifiedText, profile);

        // Stored evidence is the exact original slice, not the model's normalized form.
        expect(verifiedText).toContain(result.findings[0].evidence[0].quote);
        expect(result.findings[0].evidence[0].quote).toBe('The measured value\n   increased.');
    });

    it('reconciles a quote whose apostrophe typography drifted', () => {
        const verifiedText = 'The reviewer’s note explains the change.';
        const drifted = analysis({
            findings: [{
                ...analysis().findings[0],
                evidence: [{ quote: "The reviewer's note" }]
            }]
        });

        const result = validateSflAnalysis(drifted, verifiedText, profile);

        expect(result.findings[0].evidence[0].quote).toBe('The reviewer’s note');
        expect(verifiedText).toContain(result.findings[0].evidence[0].quote);
    });

    it('still rejects a paraphrase that cannot be relocated', () => {
        const paraphrased = analysis({
            findings: [{
                ...analysis().findings[0],
                evidence: [{ quote: 'The author reports a rising trend.' }]
            }]
        });

        expect(() => validateSflAnalysis(
            paraphrased,
            'The measured value increased. This matters for the conclusion.',
            profile
        )).toThrow('SFL analysis evidence did not match');
    });

    it('omits Ferreira expectedness rules from custom genres instead of failing the run', () => {
        const result = validateSflAnalysis(
            analysis(),
            'The measured value increased.',
            { ...profile, genreId: 'memo', genreLabel: 'Technical memo', genreState: 'custom' }
        );

        expect(result.findings[0].ruleIds).toEqual([]);
        expect(result.findings[0].sourceIds).toEqual([]);
        expect(result.internalFlags).toContain(
            'Ferreira expectedness rule ids were omitted because the approved profile is custom or composite.'
        );
    });

    it('deduplicates C01/O01 genre-staging findings over the same evidence', () => {
        const duplicate = analysis({
            findings: [
                { ...analysis().findings[0], id: 'finding-1', ruleIds: ['C01'], sourceIds: ['SRC-FERREIRA-2026-AI-FEEDBACK#table-2-r02'] },
                { ...analysis().findings[0], id: 'finding-2', ruleIds: ['O01'], sourceIds: ['SRC-FERREIRA-2026-AI-FEEDBACK#table-4-r02'] }
            ]
        });

        expect(() => validateSflAnalysis(duplicate, 'The measured value increased.', profile))
            .toThrow('SFL analysis duplicated a genre-staging finding');
    });
});

describe('requireCompleteSflProfile', () => {
    it('rejects profiles still marked as needing staff input', () => {
        expect(() => requireCompleteSflProfile({ ...profile, genreState: 'needs_staff_input' }))
            .toThrow('Confirm the genre and register profile');
    });

    it('rejects the shipped default profile even after its state is changed', () => {
        const placeholder = buildDefaultSflContextProfile();
        expect(() => requireCompleteSflProfile({ ...placeholder, genreState: 'staff_confirmed' }))
            .toThrow('Complete the genre and register profile');
    });

    it('accepts a profile once every placeholder field has been replaced', () => {
        const filled: WritingSflContextProfile = {
            ...buildDefaultSflContextProfile(),
            genreState: 'staff_confirmed',
            genreLabel: 'Data commentary',
            task: 'Write a data commentary interpreting the lab results.',
            purpose: 'Explain what the measured trend means for the hypothesis.',
            audience: 'A lab instructor familiar with the experiment.',
            field: 'Undergraduate chemical engineering lab measurements.',
            tenor: 'Student reporting findings to an evaluating instructor.',
            mode: 'A written take-home report submitted after the lab session.',
            productionConditions: 'Take-home, individually written, open resources.'
        };
        expect(() => requireCompleteSflProfile(filled)).not.toThrow();
    });
});
