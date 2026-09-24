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

/** Subquestion types supported by the production Scenario Generation feature. */
export type ScenarioTutorialSubquestionType = 'calculation' | 'troubleshoot' | 'action' | 'corrective';

/** Difficulty choices supported by the production Scenario Generation feature. */
export type ScenarioTutorialDifficulty = 'easy' | 'medium' | 'hard';

/** Editable values used to build a local tutorial preview. */
export interface ScenarioTutorialSelection {
    prompt: string;
    selectedObjectiveLabels: string[];
    subquestionTypes: ScenarioTutorialSubquestionType[];
    difficulty: ScenarioTutorialDifficulty;
}

/** One deterministic subquestion in the local tutorial preview. */
export interface ScenarioTutorialPreviewPart {
    type: ScenarioTutorialSubquestionType;
    label: string;
    prompt: string;
}

/** DOM-free preview model rendered after the tutorial's Generate action. */
export interface ScenarioTutorialPreview {
    prompt: string;
    selectedObjectiveLabels: string[];
    difficulty: ScenarioTutorialDifficulty;
    subquestions: ScenarioTutorialPreviewPart[];
}

/** Everything the tutorial seeds into the real generate partial. */
export interface ScenarioGenerationDemo {
    prompt: string;
    learningObjectives: ScenarioDemoObjective[];
    /** Real product subquestion type keys, not invented ones. */
    subquestionTypes: ScenarioTutorialSubquestionType[];
    difficulty: ScenarioTutorialDifficulty;
}

const TUTORIAL_PROMPTS: Record<ScenarioTutorialSubquestionType, string> = {
    calculation: 'Estimate the relevant performance value using the information in the base question, and state your assumptions.',
    troubleshoot: 'Identify two plausible causes and explain what evidence would help distinguish between them.',
    action: 'Choose the next diagnostic action and explain what evidence it should produce.',
    corrective: 'Recommend a corrective response and justify when it should be used.'
};

const TUTORIAL_LABELS: Record<ScenarioTutorialSubquestionType, string> = {
    calculation: 'Calculation',
    troubleshoot: 'Troubleshoot',
    action: 'Action',
    corrective: 'Corrective'
};

/**
 * Builds the deterministic preview used by onboarding without touching the DOM,
 * a scenario endpoint, or an AI model.
 */
export function buildScenarioTutorialPreview(selection: ScenarioTutorialSelection): ScenarioTutorialPreview {
    if (!selection.prompt.trim()) {
        throw new Error('Enter a base question before generating a sample.');
    }
    if (selection.subquestionTypes.length === 0) {
        throw new Error('Choose at least one subquestion type before generating a sample.');
    }

    return {
        prompt: selection.prompt,
        selectedObjectiveLabels: [...selection.selectedObjectiveLabels],
        difficulty: selection.difficulty,
        subquestions: selection.subquestionTypes.map(type => ({
            type,
            label: TUTORIAL_LABELS[type],
            prompt: TUTORIAL_PROMPTS[type]
        }))
    };
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
