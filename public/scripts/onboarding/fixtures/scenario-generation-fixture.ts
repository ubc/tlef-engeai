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

/** One generated part, shaped like a production `ScenarioSubQuestion`. */
export interface ScenarioTutorialPreviewPart {
    type: ScenarioTutorialSubquestionType;
    label: string;
    /** Markdown prompt shown in the part card. */
    prompt: string;
    /** Markdown answer key; each `# Title` line starts one answer card. */
    modelAnswer: string;
}

/**
 * DOM-free draft rendered after the tutorial's Generate action, in the same
 * title / scenario body / parts shape the production editor displays.
 */
export interface ScenarioTutorialPreview {
    title: string;
    /** Markdown scenario narrative, as the generator writes `questionBody`. */
    questionBody: string;
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

const TUTORIAL_LABELS: Record<ScenarioTutorialSubquestionType, string> = {
    calculation: 'Calculation',
    troubleshoot: 'Troubleshoot',
    action: 'Action',
    corrective: 'Corrective'
};

// Written in the generator's output format: narrative markdown with no section
// headings or bullet lists (the editor's renderer shows `- ` lines literally),
// `$`/`$$` LaTeX, and answer keys split into `# Title` cards.
const TUTORIAL_OUTPUT_PARTS: Record<ScenarioTutorialSubquestionType, Pick<ScenarioTutorialPreviewPart, 'prompt' | 'modelAnswer'>> = {
    calculation: {
        prompt:
            'Calculate the clean-design and current heat-transfer rates in kW, then determine the percentage loss in thermal duty. ' +
            'If the effective LMTD changed by no more than 10%, explain what $Q = UA\\,\\Delta T_{lm}$ implies about $U$.',
        modelAnswer: [
            '# Clean-design duty',
            '$$Q_{clean} = \\dot m\\, c_p\\, \\Delta T_c = 45.0 \\times 4.184 \\times 18 = 3{,}389\\ \\text{kW}$$',
            '',
            '# Current duty',
            '$$Q_{now} = 45.0 \\times 4.184 \\times 10 = 1{,}883\\ \\text{kW}$$',
            '',
            '# Percentage loss',
            '$$\\frac{3{,}389 - 1{,}883}{3{,}389} \\times 100 = 44.4\\%$$',
            '',
            '# What it implies about U',
            'With $A$ fixed and the LMTD within 10%, $U$ must have fallen substantially. The lower outlet temperature ' +
            'reflects a real loss of heat transfer, not only a faulty reading.'
        ].join('\n')
    },
    troubleshoot: {
        prompt:
            'Identify three distinct, physically plausible root causes for the lower cooling-water outlet temperature at unchanged flow. ' +
            'For each cause, name field evidence that would help confirm or reject it.',
        modelAnswer: [
            '# Tube-side fouling',
            'Scale or biological growth from canal water. Compare tube-side pressure drop with the clean baseline and review water-quality records.',
            '',
            '# Shell-side fouling',
            'Hydrocarbon deposits on the outside of the tubes. Compare shell-side pressure drop trends and inspect during the next outage.',
            '',
            '# Non-condensables or maldistribution',
            'Trapped gas or uneven flow blanks off active area. Check vent-gas composition and the temperature profile across passes.'
        ].join('\n')
    },
    action: {
        prompt:
            'Choose the safest immediate diagnostic action before opening the bypass or purging the cooling-water lines. Explain what evidence ' +
            'the action should produce.',
        modelAnswer: [
            '# Verify the instruments',
            'Check all four terminal temperatures with independent calibrated instruments.',
            '',
            '# Repeat the energy balance',
            'If the independent readings still show about 1.88 MW, the duty loss is real rather than an RTD fault.',
            '',
            '# Then investigate the exchanger',
            'Move to differential-pressure, vent-gas, and fouling checks before changing the process configuration.'
        ].join('\n')
    },
    corrective: {
        prompt:
            'Propose one practical, field-executable corrective action for each root cause, including the condition that would justify using it.',
        modelAnswer: [
            '# Tube-side fouling',
            'If confirmed, isolate and clean the tubes mechanically or chemically, then correct the water-treatment programme.',
            '',
            '# Shell-side fouling',
            'If confirmed, schedule a controlled shutdown and clean the shell-side surface.',
            '',
            '# Non-condensables or maldistribution',
            'After field checks, restore the venting path or repair the affected distributor, valve, or pass partition.'
        ].join('\n')
    }
};

const TUTORIAL_OUTPUT_TITLE = 'Naphtha Stabilizer Overhead Condenser Failure';

const TUTORIAL_OUTPUT_BODY = [
    'You are the junior process engineer responsible for the light-ends separation unit at an oil refinery. ' +
        '**E-2104** is a 1-shell, 2-tube-pass shell-and-tube exchanger that condenses and subcools hot stabilizer overhead vapour ' +
        'using once-through cooling water from an industrial supply canal.',
    '',
    'On the clean-design data sheet, cooling water enters at 20 °C at a constant 45.0 kg/s and leaves at 38 °C ' +
        '($\\Delta T_c = 18$ °C), with $c_p = 4.184$ kJ/(kg·°C). Saturated hydrocarbon vapour enters at 105 °C, the target ' +
        'subcooled liquid leaves at 45 °C, and the outside tube area is $A = 125$ m².',
    '',
    'After six months of continuous operation, receiver pressure is rising and the unit is flaring because the overhead vapour ' +
        'is not fully condensing. Cooling-water flow and inlet temperature are unchanged, but the outlet has fallen to **30 °C** ' +
        '($\\Delta T_c = 10$ °C). Your supervisor suspects a faulty RTD and proposes opening the bypass and purging the water lines.'
].join('\n');

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
        title: TUTORIAL_OUTPUT_TITLE,
        questionBody: TUTORIAL_OUTPUT_BODY,
        subquestions: selection.subquestionTypes.map(type => ({
            type,
            label: TUTORIAL_LABELS[type],
            ...TUTORIAL_OUTPUT_PARTS[type]
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
