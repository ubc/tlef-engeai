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
    it('builds the default sample from the seeded tutorial values', () => {
        const preview = buildScenarioTutorialPreview(defaultSelection());

        expect(preview.prompt).toBe(SCENARIO_GENERATION_DEMO.prompt);
        expect(preview.selectedObjectiveLabels).toEqual([
            'Energy balances on process equipment',
            'Fouling and heat transfer resistance'
        ]);
        expect(preview.difficulty).toBe('medium');
        expect(preview.subquestions.map(part => part.type)).toEqual([
            'calculation',
            'troubleshoot',
            'corrective'
        ]);
    });

    it('reflects edited text, objectives, types, and difficulty', () => {
        const preview = buildScenarioTutorialPreview({
            prompt: 'A pump is cavitating after a tank level change.',
            selectedObjectiveLabels: ['Diagnose pump cavitation'],
            subquestionTypes: ['action', 'calculation'],
            difficulty: 'hard'
        });

        expect(preview).toMatchObject({
            prompt: 'A pump is cavitating after a tank level change.',
            selectedObjectiveLabels: ['Diagnose pump cavitation'],
            difficulty: 'hard'
        });
        expect(preview.subquestions).toEqual([
            expect.objectContaining({ type: 'action', label: 'Action' }),
            expect.objectContaining({ type: 'calculation', label: 'Calculation' })
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
