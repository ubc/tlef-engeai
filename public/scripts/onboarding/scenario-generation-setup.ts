/**
 * scenario-generation-setup.ts
 *
 * Scenario Generation onboarding tutorial.
 *
 * The tutorial mounts the production generation partial and keeps every edit in
 * local browser state. Generate builds a deterministic sample; it never calls a
 * scenario endpoint, saves course data, or invokes a model.
 *
 * @author: @rdschrs
 * @date: 2026-08-20
 */

import { activeCourse } from "../types.js";
import { SUB_QUESTION_TYPE_LABELS } from "../feature/scenario-answer-flashcard.js";
import {
    runFeatureTutorial,
    type FeatureTutorialContext,
    type FeatureTutorialDefinition
} from "./feature-tutorial-runtime.js";
import {
    buildScenarioTutorialPreview,
    SCENARIO_GENERATION_DEMO,
    type ScenarioDemoObjective,
    type ScenarioTutorialDifficulty,
    type ScenarioTutorialPreview,
    type ScenarioTutorialSelection,
    type ScenarioTutorialSubquestionType
} from "./fixtures/scenario-generation-fixture.js";

const ALL_TYPES: readonly ScenarioTutorialSubquestionType[] = [
    'calculation',
    'troubleshoot',
    'action',
    'corrective'
];

interface ScenarioTutorialUiState {
    types: ScenarioTutorialSubquestionType[];
    difficulty: ScenarioTutorialDifficulty;
    generated: boolean;
}

let tutorialUiAbort: AbortController | null = null;

const definition: FeatureTutorialDefinition = {
    component: 'scenario-generation-setup',
    feature: 'scenarioGeneration',
    completionEvent: 'scenarioGenerationSetupComplete',
    totalSteps: 4,
    stepTitles: {
        1: "Welcome to Scenario Generation",
        2: "Generating a Practice Scenario",
        3: "Reviewing and Publishing Drafts",
        4: "Scenario Generation Complete"
    },
    initializeStep: async (stepNumber: number, context: FeatureTutorialContext) => {
        if (stepNumber === 2) {
            await initializeGenerateDemo(context);
        }
    }
};

function seedLearningObjectives(
    container: HTMLElement,
    objectives: ScenarioDemoObjective[],
    signal: AbortSignal,
    clearValidation: () => void
): void {
    container.replaceChildren();

    objectives.forEach(objective => {
        const item = document.createElement('label');
        item.className = 'sg-instructor-lo-catalog-item';

        const box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'sg-instructor-generate-lo-checkbox';
        box.value = objective.id;
        box.checked = objective.selected;
        box.addEventListener('change', clearValidation, { signal });

        const text = document.createElement('span');
        text.className = 'sg-instructor-lo-catalog-text';
        text.textContent = objective.text;

        item.append(box, text);
        container.append(item);
    });
}

function selectedObjectiveLabels(container: HTMLElement): string[] {
    return Array.from(
        container.querySelectorAll<HTMLInputElement>('.sg-instructor-generate-lo-checkbox:checked')
    ).map(box => box.closest('label')?.querySelector<HTMLElement>('.sg-instructor-lo-catalog-text')?.textContent?.trim())
        .filter((label): label is string => Boolean(label));
}

function setDisclosureOpen(
    button: HTMLButtonElement,
    menu: HTMLElement,
    open: boolean,
    focusPosition: 'first' | 'last' | null = null
): void {
    menu.style.display = open ? '' : 'none';
    button.setAttribute('aria-expanded', String(open));

    if (open && focusPosition) {
        const options = menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const target = focusPosition === 'last' ? options.item(options.length - 1) : options.item(0);
        target?.focus();
    }
}

function wireMenuKeyboard(
    menu: HTMLElement,
    button: HTMLButtonElement,
    close: (restoreFocus: boolean) => void,
    open: (focusPosition: 'first' | 'last') => void,
    signal: AbortSignal
): void {
    menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close(true);
            return;
        }

        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const options = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        if (options.length === 0) return;

        event.preventDefault();
        const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (currentIndex + offset + options.length) % options.length;
        options[nextIndex].focus();
    }, { signal });

    button.addEventListener('keydown', event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        open(event.key === 'ArrowDown' ? 'first' : 'last');
    }, { signal });
}

function renderTypePills(
    container: HTMLElement,
    state: ScenarioTutorialUiState,
    signal: AbortSignal,
    clearValidation: () => void
): void {
    container.replaceChildren();

    state.types.forEach((type, index) => {
        const label = SUB_QUESTION_TYPE_LABELS[type] ?? type;
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `sg-instructor-type-pill sg-part-type-badge sg-part-type-${type}`;
        pill.dataset.type = type;
        pill.setAttribute('aria-label', `Remove ${label} subquestion type`);

        const name = document.createElement('span');
        name.textContent = label;
        const remove = document.createElement('span');
        remove.className = 'sg-instructor-type-pill-remove';
        remove.setAttribute('aria-hidden', 'true');
        remove.textContent = 'x';

        pill.append(name, remove);
        pill.addEventListener('click', () => {
            state.types.splice(index, 1);
            renderTypePills(container, state, signal, clearValidation);
            clearValidation();
        }, { signal });
        container.append(pill);
    });
}

function setDifficultyUi(state: ScenarioTutorialUiState, difficulty: ScenarioTutorialDifficulty): void {
    state.difficulty = difficulty;
    const label = document.getElementById('sg-instructor-difficulty-label');
    if (label) label.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

    document.querySelectorAll<HTMLButtonElement>(
        '#sg-instructor-generate-view .sg-instructor-difficulty-option'
    ).forEach(option => {
        const active = option.dataset.difficulty === difficulty;
        option.classList.toggle('sg-instructor-difficulty-option--active', active);
        option.setAttribute('aria-selected', String(active));
    });

    const button = document.getElementById('sg-instructor-difficulty-btn');
    if (button) {
        button.classList.remove(
            'sg-instructor-difficulty-btn-easy',
            'sg-instructor-difficulty-btn-medium',
            'sg-instructor-difficulty-btn-hard'
        );
        button.classList.add(`sg-instructor-difficulty-btn-${difficulty}`);
    }
}

function renderPreview(preview: ScenarioTutorialPreview): void {
    const prompt = document.getElementById('sgSetupPreviewPrompt');
    const objectives = document.getElementById('sgSetupPreviewObjectives');
    const difficulty = document.getElementById('sgSetupPreviewDifficulty');
    const subquestions = document.getElementById('sgSetupPreviewSubquestions');
    if (!prompt || !objectives || !difficulty || !subquestions) return;

    prompt.textContent = preview.prompt;
    objectives.textContent = preview.selectedObjectiveLabels.length > 0
        ? preview.selectedObjectiveLabels.join(', ')
        : 'None selected';
    difficulty.textContent = preview.difficulty.charAt(0).toUpperCase() + preview.difficulty.slice(1);
    subquestions.replaceChildren();

    preview.subquestions.forEach(part => {
        const item = document.createElement('li');
        const label = document.createElement('strong');
        label.textContent = `${part.label}: `;
        item.append(label, document.createTextNode(part.prompt));
        subquestions.append(item);
    });
}

function createSelection(
    prompt: HTMLTextAreaElement,
    objectives: HTMLElement,
    state: ScenarioTutorialUiState
): ScenarioTutorialSelection {
    return {
        prompt: prompt.value,
        selectedObjectiveLabels: selectedObjectiveLabels(objectives),
        subquestionTypes: [...state.types],
        difficulty: state.difficulty
    };
}

async function initializeGenerateDemo(context: FeatureTutorialContext): Promise<void> {
    const mount = document.getElementById('sgSetupGenerateMount');
    if (!mount || mount.dataset.mounted === 'true') return;

    try {
        const response = await fetch('/components/scenarios/scenario-questions-generate.html');
        if (!response.ok) throw new Error(`Generate partial responded ${response.status}`);
        mount.innerHTML = await response.text();
        mount.dataset.mounted = 'true';

        tutorialUiAbort?.abort();
        tutorialUiAbort = new AbortController();
        const { signal } = tutorialUiAbort;

        const view = document.getElementById('sg-instructor-generate-view');
        const prompt = document.getElementById('sg-instructor-generate-prompt') as HTMLTextAreaElement | null;
        const objectives = document.getElementById('sg-instructor-generate-lo-catalog');
        const types = document.getElementById('sg-instructor-type-pills');
        const typeButton = document.getElementById('sg-instructor-type-add-btn') as HTMLButtonElement | null;
        const typeMenu = document.getElementById('sg-instructor-type-popover');
        const difficultyButton = document.getElementById('sg-instructor-difficulty-btn') as HTMLButtonElement | null;
        const difficultyMenu = document.getElementById('sg-instructor-difficulty-menu');
        const submit = document.getElementById('sg-instructor-generate-submit-btn') as HTMLButtonElement | null;
        const error = document.getElementById('sg-instructor-generate-error');
        const draft = document.getElementById('sgSetupGeneratedDraft');
        const actionPrompt = document.getElementById('sgSetupActionPrompt');

        if (!view || !prompt || !objectives || !types || !typeButton || !typeMenu ||
            !difficultyButton || !difficultyMenu || !submit || !error || !draft) {
            throw new Error('The generation form is missing a required tutorial control.');
        }

        view.style.display = 'block';
        document.querySelector('.sg-instructor-generate-sticky-chrome')?.remove();
        prompt.value = SCENARIO_GENERATION_DEMO.prompt;
        prompt.setAttribute('aria-describedby', 'sg-instructor-generate-error');
        types.setAttribute('aria-describedby', 'sg-instructor-generate-error');
        typeButton.setAttribute('aria-controls', 'sg-instructor-type-popover');
        difficultyButton.setAttribute('aria-controls', 'sg-instructor-difficulty-menu');
        error.setAttribute('role', 'alert');

        const state: ScenarioTutorialUiState = {
            types: [...SCENARIO_GENERATION_DEMO.subquestionTypes],
            difficulty: SCENARIO_GENERATION_DEMO.difficulty,
            generated: false
        };

        const clearValidation = (): void => {
            error.textContent = '';
            error.style.display = 'none';
            prompt.removeAttribute('aria-invalid');
            types.removeAttribute('aria-invalid');
            typeButton.removeAttribute('aria-invalid');
        };

        const showValidation = (message: string, target: HTMLElement): void => {
            error.textContent = message;
            error.style.display = 'block';
            target.setAttribute('aria-invalid', 'true');
            target.focus();
            error.scrollIntoView({ block: 'nearest' });
        };

        seedLearningObjectives(objectives, SCENARIO_GENERATION_DEMO.learningObjectives, signal, clearValidation);
        renderTypePills(types, state, signal, clearValidation);
        setDifficultyUi(state, state.difficulty);
        prompt.addEventListener('input', clearValidation, { signal });

        typeMenu.replaceChildren();
        ALL_TYPES.forEach(type => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'sg-instructor-type-popover-item';
            option.dataset.type = type;
            option.setAttribute('role', 'menuitem');
            option.textContent = SUB_QUESTION_TYPE_LABELS[type] ?? type;
            typeMenu.append(option);
        });

        const closeTypeMenu = (restoreFocus: boolean): void => {
            setDisclosureOpen(typeButton, typeMenu, false);
            if (restoreFocus) typeButton.focus();
        };
        const closeDifficultyMenu = (restoreFocus: boolean): void => {
            setDisclosureOpen(difficultyButton, difficultyMenu, false);
            if (restoreFocus) difficultyButton.focus();
        };
        const openTypeMenu = (focusPosition: 'first' | 'last'): void => {
            closeDifficultyMenu(false);
            setDisclosureOpen(typeButton, typeMenu, true, focusPosition);
        };
        const openDifficultyMenu = (focusPosition: 'first' | 'last'): void => {
            closeTypeMenu(false);
            setDisclosureOpen(difficultyButton, difficultyMenu, true, focusPosition);
        };

        typeButton.addEventListener('click', () => {
            const open = typeMenu.style.display === 'none';
            if (open) openTypeMenu('first');
            else closeTypeMenu(false);
        }, { signal });
        typeMenu.querySelectorAll<HTMLButtonElement>('.sg-instructor-type-popover-item').forEach(option => {
            option.addEventListener('click', () => {
                state.types.push(option.dataset.type as ScenarioTutorialSubquestionType);
                renderTypePills(types, state, signal, clearValidation);
                clearValidation();
                closeTypeMenu(true);
            }, { signal });
        });
        wireMenuKeyboard(typeMenu, typeButton, closeTypeMenu, openTypeMenu, signal);

        difficultyButton.addEventListener('click', () => {
            const open = difficultyMenu.style.display === 'none';
            if (open) openDifficultyMenu('first');
            else closeDifficultyMenu(false);
        }, { signal });
        difficultyMenu.querySelectorAll<HTMLButtonElement>('.sg-instructor-difficulty-option').forEach(option => {
            option.setAttribute('role', 'option');
            option.addEventListener('click', () => {
                setDifficultyUi(state, option.dataset.difficulty as ScenarioTutorialDifficulty);
                clearValidation();
                closeDifficultyMenu(true);
            }, { signal });
        });
        wireMenuKeyboard(
            difficultyMenu,
            difficultyButton,
            closeDifficultyMenu,
            openDifficultyMenu,
            signal
        );

        document.addEventListener('pointerdown', event => {
            const target = event.target as Node;
            if (!typeButton.parentElement?.contains(target)) closeTypeMenu(false);
            if (!difficultyButton.parentElement?.contains(target)) closeDifficultyMenu(false);
        }, { signal });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            if (typeMenu.style.display !== 'none') closeTypeMenu(true);
            if (difficultyMenu.style.display !== 'none') closeDifficultyMenu(true);
        }, { signal });

        document.getElementById('sg-instructor-type-help-btn')?.addEventListener('click', () => {
            document.getElementById('helpBtn')?.click();
        }, { signal });

        submit.addEventListener('click', () => {
            clearValidation();
            const selection = createSelection(prompt, objectives, state);
            if (!selection.prompt.trim()) {
                showValidation('Enter a base question before generating a sample.', prompt);
                return;
            }
            if (selection.subquestionTypes.length === 0) {
                showValidation('Choose at least one subquestion type before generating a sample.', typeButton);
                types.setAttribute('aria-invalid', 'true');
                return;
            }

            const preview = buildScenarioTutorialPreview(selection);
            renderPreview(preview);
            draft.hidden = false;
            submit.textContent = 'Update sample';
            if (!state.generated) {
                state.generated = true;
                context.markStepCompleted(2);
            }
            if (actionPrompt) {
                actionPrompt.textContent = 'Sample generated. Keep editing and select Update sample, or select Next.';
            }

            if (typeof (window as any).feather !== 'undefined') {
                (window as any).feather.replace();
            }

            draft.focus({ preventScroll: true });
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            draft.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
        }, { signal });

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
    } catch (error) {
        console.error('[SCENARIO-GENERATION-SETUP] Failed to mount generate partial:', error);
        const message = document.createElement('p');
        message.className = 'sg-setup-mount-error';
        message.textContent = 'The scenario generator preview could not be loaded. Refresh the tutorial and try again.';
        mount.replaceChildren(message);
    }
}

/** Renders the Scenario Generation onboarding tutorial. */
export const renderScenarioGenerationSetup = async (instructorCourse: activeCourse): Promise<void> => {
    await runFeatureTutorial(definition, instructorCourse);
};
