/**
 * scenario-generation-setup.ts
 *
 * Scenario Generation onboarding tutorial.
 *
 * Teaches instructors how a practice scenario is generated, reviewed as a draft,
 * and published. Everything on screen is simulated: the Generate button renders a
 * canned draft from a local constant and never calls
 * `POST /api/courses/:courseId/scenario-questions/generate`, so no scenario record
 * is created and no model is invoked.
 *
 * @author: @rdschrs
 * @date: 2026-08-17
 */

import { activeCourse } from "../types.js";
import {
    runFeatureTutorial,
    type FeatureTutorialContext,
    type FeatureTutorialDefinition
} from "./feature-tutorial-runtime.js";

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
 * Wires the simulated Generate button.
 *
 * Reveals the canned draft already present in the component markup and marks
 * step 2 satisfied, which unlocks the gated step 3.
 */
function initializeGenerateDemo(context: FeatureTutorialContext): void {
    const generateBtn = document.getElementById('sgSetupGenerateBtn') as HTMLButtonElement | null;
    const result = document.getElementById('sgSetupGeneratedDraft');
    if (!generateBtn || !result || generateBtn.dataset.wired === 'true') return;

    generateBtn.dataset.wired = 'true';
    generateBtn.addEventListener('click', () => {
        result.hidden = false;
        generateBtn.disabled = true;
        context.markStepCompleted(2);

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
    });
}

/** Renders the Scenario Generation onboarding tutorial. */
export const renderScenarioGenerationSetup = async (instructorCourse: activeCourse): Promise<void> => {
    await runFeatureTutorial(definition, instructorCourse);
};
