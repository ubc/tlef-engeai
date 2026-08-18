/**
 * guided-pathway-setup.ts
 *
 * Guided Pathway onboarding tutorial.
 *
 * Teaches the recommended default pathways, per-pathway instructor notifications,
 * and the anonymous alert decision. Two behaviors differ deliberately:
 *
 * - "Customize now" mounts the real Pathway Library, so edits persist through the
 *   existing `/api/courses/:courseId/pathways` endpoints. This is intended.
 * - The alert in the final teaching step is canned. Dismiss and Escalate never call
 *   `PATCH /api/courses/:courseId/guided-pathway-flags/:flagId/decision`, so no alert
 *   record is created or decided.
 *
 * @author: @rdschrs
 * @date: 2026-08-17
 */

import { loadComponentHTML } from "../api/api.js";
import { initializePathwayLibrary } from "../feature/pathway-library.js";
import { activeCourse } from "../types.js";
import {
    runFeatureTutorial,
    type FeatureTutorialContext,
    type FeatureTutorialDefinition
} from "./feature-tutorial-runtime.js";

const definition: FeatureTutorialDefinition = {
    component: 'guided-pathway-setup',
    feature: 'guidedPathway',
    completionSlug: 'guided-pathway',
    completionEvent: 'guidedPathwaySetupComplete',
    totalSteps: 5,
    stepTitles: {
        1: "Welcome to Guided Pathways",
        2: "Recommended Default Pathways",
        3: "Instructor Notifications",
        4: "Responding to an Alert",
        5: "Guided Pathways Complete"
    },
    initializeStep: async (stepNumber: number, context: FeatureTutorialContext) => {
        if (stepNumber === 2) {
            await initializePathwayChoice(context);
        }
        if (stepNumber === 4) {
            initializeAlertDemo(context);
        }
    }
};

/**
 * Wires the defaults-versus-customize choice.
 *
 * "Keep recommended defaults" is preselected and needs no action. Choosing
 * "Customize now" injects the real Pathway Library component and initializes it.
 * The library resolves its nodes through global ids, so it is mounted once and
 * only after its markup is in the live DOM.
 */
async function initializePathwayChoice(context: FeatureTutorialContext): Promise<void> {
    const customizeRadio = document.getElementById('gpSetupCustomize') as HTMLInputElement | null;
    const defaultsRadio = document.getElementById('gpSetupKeepDefaults') as HTMLInputElement | null;
    const mountPoint = document.getElementById('gpSetupLibraryMount');
    if (!customizeRadio || !defaultsRadio || !mountPoint || customizeRadio.dataset.wired === 'true') return;

    customizeRadio.dataset.wired = 'true';

    const mountLibrary = async (): Promise<void> => {
        if (mountPoint.dataset.mounted === 'true') {
            mountPoint.hidden = false;
            return;
        }

        try {
            mountPoint.innerHTML = await loadComponentHTML('pathway-library-instructor');
            mountPoint.hidden = false;
            mountPoint.dataset.mounted = 'true';
            await new Promise(resolve => requestAnimationFrame(resolve));
            await initializePathwayLibrary(context.course);
        } catch (error) {
            console.error('[GUIDED-PATHWAY-SETUP] Failed to mount pathway library:', error);
            mountPoint.innerHTML = '<p class="gp-setup-library-error">The Pathway Library could not be loaded. You can configure pathways later from the Pathway Library page.</p>';
            mountPoint.hidden = false;
        }
    };

    customizeRadio.addEventListener('change', () => {
        if (customizeRadio.checked) {
            void mountLibrary();
        }
    });

    defaultsRadio.addEventListener('change', () => {
        if (defaultsRadio.checked) {
            mountPoint.hidden = true;
        }
    });
}

/**
 * Wires the simulated alert decision.
 *
 * Either Dismiss or Escalate reveals the matching outcome copy and marks step 4
 * satisfied. No request is issued and no alert record exists.
 */
function initializeAlertDemo(context: FeatureTutorialContext): void {
    const dismissBtn = document.getElementById('gpSetupDismissBtn') as HTMLButtonElement | null;
    const escalateBtn = document.getElementById('gpSetupEscalateBtn') as HTMLButtonElement | null;
    const dismissedState = document.getElementById('gpSetupDismissedState');
    const escalatedState = document.getElementById('gpSetupEscalatedState');
    if (!dismissBtn || !escalateBtn || !dismissedState || !escalatedState) return;
    if (dismissBtn.dataset.wired === 'true') return;

    dismissBtn.dataset.wired = 'true';

    const decide = (decided: HTMLElement, other: HTMLElement): void => {
        decided.hidden = false;
        other.hidden = true;
        dismissBtn.disabled = true;
        escalateBtn.disabled = true;
        context.markStepCompleted(4);

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
    };

    dismissBtn.addEventListener('click', () => decide(dismissedState, escalatedState));
    escalateBtn.addEventListener('click', () => decide(escalatedState, dismissedState));
}

/** Renders the Guided Pathway onboarding tutorial. */
export const renderGuidedPathwaySetup = async (instructorCourse: activeCourse): Promise<void> => {
    await runFeatureTutorial(definition, instructorCourse);
};
