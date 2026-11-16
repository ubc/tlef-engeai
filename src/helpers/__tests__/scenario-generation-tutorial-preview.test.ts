/**
 * scenario-generation-tutorial-preview.test.ts
 *
 * Pins the onboarding scenario preview as a deterministic, DOM-free simulator.
 *
 * @author: @rdschrs
 * @date: 2026-08-20
 */

import {
    buildScenarioTutorialPreview,
    SCENARIO_GENERATION_DEMO,
    type ScenarioTutorialSelection
} from '../../../public/scripts/onboarding/fixtures/scenario-generation-fixture';

function defaultSelection(): ScenarioTutorialSelection {
    return {
        prompt: SCENARIO_GENERATION_DEMO.prompt,
        selectedObjectiveLabels: SCENARIO_GENERATION_DEMO.learningObjectives
            .filter(objective => objective.selected)
            .map(objective => objective.text),
        subquestionTypes: [...SCENARIO_GENERATION_DEMO.subquestionTypes],
        difficulty: SCENARIO_GENERATION_DEMO.difficulty
    };
}

describe('buildScenarioTutorialPreview', () => {
    it('separates the seeded inputs from a complete generated output', () => {
        const preview = buildScenarioTutorialPreview(defaultSelection());

        expect(preview.inputs.prompt).toBe(SCENARIO_GENERATION_DEMO.prompt);
        expect(preview.inputs.selectedObjectiveLabels).toEqual([
            'Energy balances on process equipment',
            'Fouling and heat transfer resistance'
        ]);
        expect(preview.inputs.difficulty).toBe('medium');
        expect(preview.inputs.subquestionTypes.map(part => part.type)).toEqual([
            'calculation',
            'troubleshoot',
            'corrective'
        ]);
        expect(preview.output).toMatchObject({
            title: 'Naphtha Stabilizer Overhead Condenser Failure',
            context: expect.stringContaining('E-2104'),
            crisis: expect.stringContaining('30 °C')
        });
        expect(preview.output.designBaselines).toEqual(expect.arrayContaining([
            expect.objectContaining({ label: 'Outside tube area', value: '125 m²' })
        ]));
        expect(preview.output.subquestions.map(part => part.type)).toEqual([
            'calculation',
            'troubleshoot',
            'corrective'
        ]);
        expect(preview.output.subquestions[0].modelAnswer).toContain('3,389 kW');
        expect(preview.output.subquestions[0].modelAnswer).toContain('44.4% loss');
    });

    it('reflects edited text, objectives, types, and difficulty', () => {
        const preview = buildScenarioTutorialPreview({
            prompt: 'A pump is cavitating after a tank level change.',
            selectedObjectiveLabels: ['Diagnose pump cavitation'],
            subquestionTypes: ['action', 'calculation'],
            difficulty: 'hard'
        });

        expect(preview.inputs).toMatchObject({
            prompt: 'A pump is cavitating after a tank level change.',
            selectedObjectiveLabels: ['Diagnose pump cavitation'],
            difficulty: 'hard'
        });
        expect(preview.inputs.subquestionTypes).toEqual([
            expect.objectContaining({ type: 'action', label: 'Action' }),
            expect.objectContaining({ type: 'calculation', label: 'Calculation' })
        ]);
        expect(preview.output.subquestions).toEqual([
            expect.objectContaining({
                type: 'action',
                label: 'Action',
                modelAnswer: expect.stringContaining('independent calibrated instruments')
            }),
            expect.objectContaining({
                type: 'calculation',
                label: 'Calculation',
                modelAnswer: expect.stringContaining('1,883 kW')
            })
        ]);
    });

    it('rejects an empty base question', () => {
        expect(() => buildScenarioTutorialPreview({
            ...defaultSelection(),
            prompt: '   '
        })).toThrow('Enter a base question');
    });

    it('rejects an empty subquestion selection', () => {
        expect(() => buildScenarioTutorialPreview({
            ...defaultSelection(),
            subquestionTypes: []
        })).toThrow('Choose at least one subquestion type');
    });
});
