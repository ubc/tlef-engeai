/**
 * writing-feedback-setup.ts
 *
 * Writing Feedback onboarding tutorial.
 *
 * Teaches assignment intake, the draft-then-approve rubric workflow, evidence-backed
 * feedback review, and the separation between approval and release. Everything on
 * screen is simulated: the Approve button reveals canned copy and never calls
 * `POST .../rubric-draft/approve` or `POST .../submissions/:id/approve`, so no
 * assignment, rubric, or feedback record is created.
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
    component: 'writing-feedback-setup',
    feature: 'writingFeedback',
    completionSlug: 'writing-feedback',
    completionEvent: 'writingFeedbackSetupComplete',
    totalSteps: 5,
    stepTitles: {
        1: "Welcome to Writing Feedback",
        2: "Building and Approving a Rubric",
        3: "Reviewing Generated Feedback",
        4: "Approving and Releasing",
        5: "Writing Feedback Complete"
    },
    initializeStep: (stepNumber: number, context: FeatureTutorialContext) => {
        if (stepNumber === 4) {
            initializeApproveDemo(context);
        }
    }
};

/**
 * Wires the simulated Approve button.
 *
 * Reveals the release explanation already present in the component markup and
 * marks step 4 satisfied, which unlocks the gated completion step.
 */
function initializeApproveDemo(context: FeatureTutorialContext): void {
    const approveBtn = document.getElementById('wfSetupApproveBtn') as HTMLButtonElement | null;
    const result = document.getElementById('wfSetupApprovedState');
    if (!approveBtn || !result || approveBtn.dataset.wired === 'true') return;

    approveBtn.dataset.wired = 'true';
    approveBtn.addEventListener('click', () => {
        result.hidden = false;
        approveBtn.disabled = true;
        context.markStepCompleted(4);

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
    });
}

/** Renders the Writing Feedback onboarding tutorial. */
export const renderWritingFeedbackSetup = async (instructorCourse: activeCourse): Promise<void> => {
    await runFeatureTutorial(definition, instructorCourse);
};
