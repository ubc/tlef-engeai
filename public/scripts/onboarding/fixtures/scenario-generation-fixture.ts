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

/** One selected subquestion type displayed in the tutorial input summary. */
export interface ScenarioTutorialPreviewType {
    type: ScenarioTutorialSubquestionType;
    label: string;
}

/** One design value displayed in the generated troubleshooting scenario. */
export interface ScenarioTutorialDesignBaseline {
    label: string;
    value: string;
}

/** One deterministic generated subquestion and answer key in the tutorial preview. */
export interface ScenarioTutorialPreviewPart {
    type: ScenarioTutorialSubquestionType;
    label: string;
    prompt: string;
    modelAnswer: string;
}

/** Production-shaped generated scenario displayed after the tutorial's Generate action. */
export interface ScenarioTutorialGeneratedOutput {
    title: string;
    context: string;
    designBaselines: ScenarioTutorialDesignBaseline[];
    crisis: string;
    subquestions: ScenarioTutorialPreviewPart[];
}

/** DOM-free model separating the instructor's inputs from the generated output. */
export interface ScenarioTutorialPreview {
    inputs: {
        prompt: string;
        selectedObjectiveLabels: string[];
        difficulty: ScenarioTutorialDifficulty;
        subquestionTypes: ScenarioTutorialPreviewType[];
    };
    output: ScenarioTutorialGeneratedOutput;
}

/** Everything the tutorial seeds into the real generate partial. */
export interface ScenarioGenerationDemo {
    prompt: string;
    learningObjectives: ScenarioDemoObjective[];
    /** Real product subquestion type keys, not invented ones. */
    subquestionTypes: ScenarioTutorialSubquestionType[];
    difficulty: ScenarioTutorialDifficulty;
}

const TUTORIAL_LABELS: Record<ScenarioTutorialSubquestionType, string> = {
    calculation: 'Calculation',
    troubleshoot: 'Troubleshoot',
    action: 'Action',
    corrective: 'Corrective'
};

const TUTORIAL_OUTPUT_PARTS: Record<ScenarioTutorialSubquestionType, Omit<ScenarioTutorialPreviewPart, 'type' | 'label'>> = {
    calculation: {
        prompt:
            'Calculate the clean-design and current heat-transfer rates in kW, then determine the percentage loss in thermal duty. ' +
            'If the effective LMTD changed by no more than 10%, explain what the relation Q = UAΔTlm implies about U.',
        modelAnswer:
            'The clean-design duty is 45.0 × 4.184 × (38 - 20) = 3,389 kW. The current duty is ' +
            '45.0 × 4.184 × (30 - 20) = 1,883 kW, a 44.4% loss. With area fixed and LMTD changing by at most 10%, ' +
            'the overall heat-transfer coefficient must have fallen substantially. The lower water outlet temperature is therefore consistent ' +
            'with a real loss of heat transfer, not only a faulty temperature reading.'
    },
    troubleshoot: {
        prompt:
            'Identify three distinct, physically plausible root causes for the lower cooling-water outlet temperature at unchanged flow. ' +
            'For each cause, name field evidence that would help confirm or reject it.',
        modelAnswer:
            'Plausible causes include tube-side scale or biological fouling, shell-side hydrocarbon fouling, and non-condensable gas or flow ' +
            'maldistribution reducing the active surface. Compare exchanger pressure drop and water quality with the clean baseline; inspect ' +
            'tube and shell deposits during an outage; and check vent composition, temperature profiles, and flow distribution for inactive area.'
    },
    action: {
        prompt:
            'Choose the safest immediate diagnostic action before opening the bypass or purging the cooling-water lines. Explain what evidence ' +
            'the action should produce.',
        modelAnswer:
            'Verify all four terminal temperatures with independent calibrated instruments, then repeat the cooling-water energy balance. ' +
            'This separates an RTD fault from a genuine duty loss without disturbing the exchanger. If the independent readings confirm the ' +
            '1.88 MW duty, move to differential-pressure, vent-gas, and fouling checks before changing the process configuration.'
    },
    corrective: {
        prompt:
            'Propose one practical, field-executable corrective action for each root cause, including the condition that would justify using it.',
        modelAnswer:
            'For confirmed tube-side fouling, isolate and mechanically or chemically clean the tubes, then correct water-treatment controls. ' +
            'For confirmed shell-side deposits, schedule a controlled shutdown and clean the shell-side surface. For non-condensables or ' +
            'maldistribution, restore the venting path or correct the affected distributor, valve, or pass partition after field verification.'
    }
};

const TUTORIAL_OUTPUT_BASE: Omit<ScenarioTutorialGeneratedOutput, 'subquestions'> = {
    title: 'Naphtha Stabilizer Overhead Condenser Failure',
    context:
        'You are the junior process engineer responsible for the light-ends separation unit at an oil refinery. ' +
        'E-2104 is a 1-shell, 2-tube-pass shell-and-tube exchanger that condenses and subcools hot stabilizer overhead vapour ' +
        'using once-through cooling water from an industrial supply canal.',
    designBaselines: [
        {
            label: 'Cooling-water inlet',
            value: '20 °C at a constant mass flow rate of 45.0 kg/s'
        },
        {
            label: 'Clean cooling-water outlet',
            value: '38 °C (ΔTc = 18 °C), with Cp = 4.184 kJ/(kg·°C)'
        },
        {
            label: 'Hydrocarbon stream',
            value: 'Saturated vapour enters at 105 °C; target subcooled liquid leaves at 45 °C'
        },
        {
            label: 'Outside tube area',
            value: '125 m²'
        }
    ],
    crisis:
        'After six months of continuous operation, receiver pressure is rising and the unit is flaring because the overhead vapour is not ' +
        'fully condensing. Cooling-water flow remains 45.0 kg/s and its inlet remains 20 °C, but its outlet has fallen to 30 °C ' +
        '(ΔTc = 10 °C). The supervisor suspects a faulty RTD and proposes opening the bypass and purging the water lines. ' +
        'Use an energy-balance audit to decide whether the temperature drop indicates a genuine internal heat-transfer failure.'
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

    const subquestionTypes = selection.subquestionTypes.map(type => ({
        type,
        label: TUTORIAL_LABELS[type]
    }));

    return {
        inputs: {
            prompt: selection.prompt,
            selectedObjectiveLabels: [...selection.selectedObjectiveLabels],
            difficulty: selection.difficulty,
            subquestionTypes
        },
        output: {
            ...TUTORIAL_OUTPUT_BASE,
            subquestions: subquestionTypes.map(({ type, label }) => ({
                type,
                label,
                ...TUTORIAL_OUTPUT_PARTS[type]
            }))
        }
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
