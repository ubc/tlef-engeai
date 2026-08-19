/**
 * scenario-generation-setup.ts
 *
 * Scenario Generation onboarding tutorial.
 *
 * Teaches instructors how a practice scenario is generated, reviewed as a draft,
 * and published. The tutorial mounts the real `scenario-questions-generate.html`
 * partial — the same markup the production feature mounts — but no controller
 * runs and no scenario endpoint is ever contacted. The form is seeded locally
 * from a fixed fixture, and the Generate button is rewired to reveal a canned
 * draft, so nothing is saved and no model is invoked.
 *
 * @author: @rdschrs
 * @date: 2026-08-18
 */

import { activeCourse } from "../types.js";
import {
    runFeatureTutorial,
    type FeatureTutorialContext,
    type FeatureTutorialDefinition
} from "./feature-tutorial-runtime.js";
import { SUB_QUESTION_TYPE_LABELS } from "../feature/scenario-answer-flashcard.js";
import { SCENARIO_GENERATION_DEMO, type ScenarioDemoObjective } from "./fixtures/scenario-generation-fixture.js";

const definition: FeatureTutorialDefinition = {
    component: 'scenario-generation-setup',
    feature: 'scenarioGeneration',
    completionSlug: 'scenario-generation',
    completionEvent: 'scenarioGenerationSetupComplete',
    totalSteps: 4,
    stepTitles: {
        1: "Welcome to Scenario Generation",
        2: "Generating a Practice Scenario",
        3: "Reviewing and Publishing Drafts",
        4: "Scenario Generation Complete"
    },
    initializeStep: (stepNumber: number, context: FeatureTutorialContext) => {
        if (stepNumber === 2) {
            initializeGenerateDemo(context);
        }
    }
};

/**
 * Fills the learning-objective catalog with the exact markup the real controller emits.
 *
 * Structure is copied from `scenario-questions-instructor.ts:1515-1523`: a `label`
 * wrapping a checkbox and a text span. `.sg-instructor-lo-catalog-item:has(input:checked)`
 * supplies the selected appearance, so no modifier class is involved.
 */
function seedLearningObjectives(container: HTMLElement, objectives: ScenarioDemoObjective[]): void {
    container.replaceChildren();

    objectives.forEach(objective => {
        const item = document.createElement('label');
        item.className = 'sg-instructor-lo-catalog-item';

        const box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'sg-instructor-generate-lo-checkbox';
        box.value = objective.id;
        box.checked = objective.selected;
        box.disabled = true;

        const text = document.createElement('span');
        text.className = 'sg-instructor-lo-catalog-text';
        text.textContent = objective.text;

        item.append(box, text);
        container.append(item);
    });
}

/**
 * Fills the subquestion type row with the exact markup the real controller emits.
 *
 * Structure is copied from `scenario-questions-instructor.ts:1543-1548`. The
 * `sg-part-type-<type>` class carries the badge colour from
 * `public/styles/scenario-generation/sg-shared.css`, so the type key must be a
 * real one. The remove affordance is omitted because nothing is editable here.
 */
function seedTypePills(container: HTMLElement, types: readonly string[]): void {
    container.replaceChildren();

    types.forEach(type => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `sg-instructor-type-pill sg-part-type-badge sg-part-type-${type}`;
        pill.dataset.type = type;
        pill.disabled = true;
        pill.textContent = SUB_QUESTION_TYPE_LABELS[type] ?? type;
        container.append(pill);
    });
}

/**
 * Mounts the production scenario generate partial and fills it with the fixture.
 *
 * This is the same file `scenario-questions-instructor.ts` fetches, so the
 * tutorial shows the real interface rather than a copy that would drift. No
 * controller is initialized and no scenario endpoint is contacted; the Generate
 * button is rewired locally to reveal the canned draft.
 */
async function initializeGenerateDemo(context: FeatureTutorialContext): Promise<void> {
    const mount = document.getElementById('sgSetupGenerateMount');
    if (!mount || mount.dataset.mounted === 'true') return;

    try {
        // Step 1: fetch the production partial, exactly as the real feature does.
        const response = await fetch('/components/scenarios/scenario-questions-generate.html');
        if (!response.ok) throw new Error(`Generate partial responded ${response.status}`);
        mount.innerHTML = await response.text();
        mount.dataset.mounted = 'true';

        // Step 2: the partial is hidden by default because the real feature routes to it.
        const view = document.getElementById('sg-instructor-generate-view');
        if (view) view.style.display = 'block';

        // Step 3: the back control belongs to the real feature's routing, not here.
        document.querySelector('.sg-instructor-generate-sticky-chrome')?.remove();

        // Step 4: fill the regions the real controller would have fetched.
        const prompt = document.getElementById('sg-instructor-generate-prompt') as HTMLTextAreaElement | null;
        if (prompt) {
            prompt.value = SCENARIO_GENERATION_DEMO.prompt;
            prompt.readOnly = true;
        }

        const objectives = document.getElementById('sg-instructor-generate-lo-catalog');
        if (objectives) seedLearningObjectives(objectives, SCENARIO_GENERATION_DEMO.learningObjectives);

        const types = document.getElementById('sg-instructor-type-pills');
        if (types) seedTypePills(types, SCENARIO_GENERATION_DEMO.subquestionTypes);

        // The add-type and help controls belong to the real editing flow.
        document.getElementById('sg-instructor-type-add-btn')?.remove();
        (document.getElementById('sg-instructor-difficulty-btn') as HTMLButtonElement | null)?.setAttribute('disabled', 'true');

        // Step 5: replace the submit handler so Generate reveals the canned draft.
        const submit = document.getElementById('sg-instructor-generate-submit-btn') as HTMLButtonElement | null;
        const draft = document.getElementById('sgSetupGeneratedDraft');
        if (submit && draft) {
            submit.addEventListener('click', () => {
                draft.hidden = false;
                submit.disabled = true;
                context.markStepCompleted(2);
                if (typeof (window as any).feather !== 'undefined') {
                    (window as any).feather.replace();
                }
            });
        }

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
    } catch (error) {
        // A failed mount must never block the tutorial; it teaches a concept, not a widget.
        console.error('[SCENARIO-GENERATION-SETUP] Failed to mount generate partial:', error);
        mount.innerHTML =
            '<p class="sg-setup-mount-error">The scenario generator preview could not be loaded. ' +
            'Practice Scenarios is available from your course navigation.</p>';
        context.markStepCompleted(2);
    }
}

/** Renders the Scenario Generation onboarding tutorial. */
export const renderScenarioGenerationSetup = async (instructorCourse: activeCourse): Promise<void> => {
    await runFeatureTutorial(definition, instructorCourse);
};
