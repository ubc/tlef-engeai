/**
 * scenario-generation-fixture.ts
 *
 * Canned values seeded into the real scenario generate partial during onboarding.
 *
 * The tutorial mounts `scenario-questions-generate.html`, the same markup the
 * production feature mounts, but no controller runs. These values stand in for
 * what the controller would have fetched, so the instructor sees a populated
 * form without a request reaching any scenario endpoint.
 *
 * @author: @rdschrs
 * @date: 2026-08-18
 */

/** One learning objective checkbox in the catalog region. */
export interface ScenarioDemoObjective {
    id: string;
    text: string;
    selected: boolean;
}

/** Everything the tutorial seeds into the real generate partial. */
export interface ScenarioGenerationDemo {
    prompt: string;
    learningObjectives: ScenarioDemoObjective[];
    /** Real product subquestion type keys, not invented ones. */
    subquestionTypes: Array<'calculation' | 'troubleshoot' | 'action' | 'corrective'>;
    difficulty: 'easy' | 'medium' | 'hard';
}

/** Fixed example shown to every instructor taking the tutorial. */
export const SCENARIO_GENERATION_DEMO: ScenarioGenerationDemo = {
    prompt:
        'A shell-and-tube heat exchanger is underperforming after six months of service. ' +
        'Cooling water outlet temperature has dropped by 8 °C at unchanged flow rates.',
    learningObjectives: [
        { id: 'lo-energy-balance', text: 'Energy balances on process equipment', selected: true },
        { id: 'lo-fouling', text: 'Fouling and heat transfer resistance', selected: true },
        { id: 'lo-pressure-drop', text: 'Pressure drop in pipe networks', selected: false }
    ],
    subquestionTypes: ['calculation', 'troubleshoot', 'corrective'],
    difficulty: 'medium'
};
