/**
 * scenario-generation-tutorial-preview.test.ts
 *
 * Pins the onboarding scenario preview as a deterministic, DOM-free simulator
 * whose sample matches the production generator's output format.
 *
 * @author: @rdschrs
 * @date: 2026-08-20
 */

import {
    buildScenarioTutorialPreview,
    SCENARIO_GENERATION_DEMO,
    type ScenarioTutorialSelection
} from '../../../public/scripts/onboarding/fixtures/scenario-generation-fixture';
import { parseAnswerKeyFlashcardsDetailed } from '../../../public/scripts/feature/scenario-answer-flashcard';

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
    it('builds an editor-shaped draft from the seeded tutorial values', () => {
        const preview = buildScenarioTutorialPreview(defaultSelection());

        expect(preview.title).toBe('Naphtha Stabilizer Overhead Condenser Failure');
        expect(preview.questionBody).toContain('**E-2104**');
        expect(preview.questionBody).toContain('$A = 125$ m²');
        expect(preview.subquestions.map(part => part.type)).toEqual([
            'calculation',
            'troubleshoot',
            'corrective'
        ]);
        expect(preview.subquestions[0].modelAnswer).toContain('3{,}389');
        expect(preview.subquestions[0].modelAnswer).toContain('44.4\\%');
    });

    it('follows the generator format: no section headings, answer keys as # cards', () => {
        const preview = buildScenarioTutorialPreview({
            ...defaultSelection(),
            subquestionTypes: ['calculation', 'troubleshoot', 'action', 'corrective']
        });

        expect(preview.questionBody).not.toMatch(/^(#|- )/m);
        preview.subquestions.forEach(part => {
            const { steps, error } = parseAnswerKeyFlashcardsDetailed(part.modelAnswer);
            expect(error).toBeNull();
            expect(steps.length).toBeGreaterThan(1);
        });
    });

    it('follows the selected subquestion types and order', () => {
        const preview = buildScenarioTutorialPreview({
            prompt: 'A pump is cavitating after a tank level change.',
            selectedObjectiveLabels: ['Diagnose pump cavitation'],
            subquestionTypes: ['action', 'calculation'],
            difficulty: 'hard'
        });

        expect(preview.subquestions).toEqual([
            expect.objectContaining({
                type: 'action',
                label: 'Action',
                modelAnswer: expect.stringContaining('independent calibrated instruments')
            }),
            expect.objectContaining({
                type: 'calculation',
                label: 'Calculation',
                modelAnswer: expect.stringContaining('1{,}883')
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
