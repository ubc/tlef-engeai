/**
 * writing-feedback-setup.ts
 *
 * Writing Feedback onboarding tutorial.
 *
 * Teaches assignment intake, the rubric grid and its draft-then-approve workflow, the
 * second technical rubric a lab report carries, evidence-backed feedback review, and the
 * separation between approval and release. Everything on screen is simulated: the Approve
 * button reveals canned copy and never calls `POST .../rubric-draft/approve` or
 * `POST .../submissions/:id/approve`, so no assignment, rubric, or feedback record is
 * created.
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
    completionEvent: 'writingFeedbackSetupComplete',
    totalSteps: 6,
    stepTitles: {
        1: "Welcome to Writing Feedback",
        2: "Assignment Details and the Rubric",
        3: "Lab Reports Carry a Second Rubric",
        4: "Reviewing Generated Feedback",
        5: "Approving and Releasing",
        6: "Writing Feedback Complete"
    },
    initializeStep: (stepNumber: number, context: FeatureTutorialContext) => {
        if (stepNumber === 1) {
            initializeIntakeDemo();
        }
        if (stepNumber === 5) {
            initializeApproveDemo(context);
        }
    }
};

/** Wires Canvas and manual intake controls as local orientation-only actions. */
function initializeIntakeDemo(): void {
    const importBtn = document.getElementById('wfSetupImportCanvasBtn') as HTMLButtonElement | null;
    const addBtn = document.getElementById('wfSetupAddAssignmentBtn') as HTMLButtonElement | null;
    const message = document.getElementById('wfSetupIntakeMessage');
    if (!importBtn || !addBtn || !message || importBtn.dataset.wired === 'true') return;

    importBtn.dataset.wired = 'true';
    importBtn.addEventListener('click', () => {
        message.textContent = 'In the full workspace, this lets course staff choose an assignment and submissions from Canvas.';
        message.hidden = false;
    });
    addBtn.addEventListener('click', () => {
        message.textContent = 'In the full workspace, this starts a manual assignment that course staff can add submissions to.';
        message.hidden = false;
    });
}

/**
 * Wires the simulated Approve button.
 *
 * Reveals the release explanation already present in the component markup and
 * marks step 5 satisfied, which unlocks the gated completion step.
 */
function initializeApproveDemo(context: FeatureTutorialContext): void {
    const approveBtn = document.getElementById('wfSetupApproveBtn') as HTMLButtonElement | null;
    const result = document.getElementById('wfSetupApprovedState');
    if (!approveBtn || !result || approveBtn.dataset.wired === 'true') return;

    approveBtn.dataset.wired = 'true';
    approveBtn.addEventListener('click', () => {
        result.hidden = false;
        approveBtn.disabled = true;
        context.markStepCompleted(5);

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
    });
}

/** Renders the Writing Feedback onboarding tutorial. */
export const renderWritingFeedbackSetup = async (instructorCourse: activeCourse): Promise<void> => {
    await runFeatureTutorial(definition, instructorCourse);
};
