/**
 * feature-tutorial-runtime.ts
 *
 * Shared step engine for the three feature onboarding tutorials.
 *
 * The four inherited tutorials each carry their own copy of this logic. The
 * feature tutorials differ only in their markup, their per-step wiring, and the
 * capability they mark complete, so they share one runtime rather than adding
 * three more copies. Behavior matches the inherited controllers exactly: same
 * rail classes, same Help modal contract, same `data-requires-completion`
 * gating, same `Complete Setup` label swap on the final step.
 *
 * @author: @rdschrs
 * @date: 2026-08-17
 */

import { loadComponentHTML } from "../api/api.js";
import { activeCourse } from "../types.js";
import { showErrorModal, showHelpModal } from "../ui/modal-overlay.js";
import type { OnboardingFeatureKey } from "../utils/onboarding-stage-order.js";
import { updateStaffOnboardingProgress } from "./staff-onboarding-ui.js";
import { completeInstructorOnboardingStage } from "./onboarding-progress.js";

/** Component names for the three feature tutorials. */
export type FeatureTutorialComponent =
    | 'scenario-generation-setup'
    | 'writing-feedback-setup'
    | 'guided-pathway-setup';

/** Mutable per-render state, shared with step wiring through {@link FeatureTutorialContext}. */
export interface FeatureTutorialState {
    currentStep: number;
    totalSteps: number;
    completedSteps: Set<number>;
}

/** Handle passed to per-step wiring so a simulated action can unlock progression. */
export interface FeatureTutorialContext {
    course: activeCourse;
    state: FeatureTutorialState;
    /** Marks a step satisfied, enabling a Next button gated on it. */
    markStepCompleted: (stepNumber: number) => void;
}

export interface FeatureTutorialDefinition {
    component: FeatureTutorialComponent;
    /**
     * Capability marked complete when the instructor finishes the tutorial.
     *
     * Doubles as the stage key on the user's own progress record, which is where
     * tutorial completion lives (OB-002).
     */
    feature: OnboardingFeatureKey;
    /** Window event dispatched after progress is persisted. */
    completionEvent: string;
    totalSteps: number;
    /** Help modal titles, keyed by step number. */
    stepTitles: Record<number, string>;
    /** Optional per-step wiring, run each time a step becomes visible. */
    initializeStep?: (stepNumber: number, context: FeatureTutorialContext) => void | Promise<void>;
}

/** Swaps Next button label while preserving its icon markup. */
function setNextButtonText(nextBtn: HTMLButtonElement, label: string): void {
    const icon = label === 'Next' ? 'chevron-right' : 'check';
    nextBtn.innerHTML = `<span class="nav-btn-text">${label}</span> <i data-feather="${icon}"></i>`;
    if (typeof (window as any).feather !== 'undefined') {
        (window as any).feather.replace();
    }
}

/** Marks rail circles completed, current, or pending relative to the visible step. */
function updateStepIndicators(currentStep: number): void {
    document.querySelectorAll('.step-item').forEach((item, index) => {
        const circle = item.querySelector('.step-circle');
        if (!circle) return;

        circle.classList.remove('completed', 'current', 'pending');
        const stepNumber = index + 1;
        if (stepNumber < currentStep) {
            circle.classList.add('completed');
        } else if (stepNumber === currentStep) {
            circle.classList.add('current');
        } else {
            circle.classList.add('pending');
        }
    });
}

/** Centers a step that fits and scrolls one that does not. */
function adjustContentJustification(contentStepElement: HTMLElement): void {
    const inner = contentStepElement.querySelector('.content-step-inner') as HTMLElement | null;
    if (!inner) return;

    const availableHeight = window.innerHeight - 200;
    if (inner.scrollHeight > availableHeight) {
        contentStepElement.classList.add('overflow-content');
        contentStepElement.classList.remove('center-content');
    } else {
        contentStepElement.classList.add('center-content');
        contentStepElement.classList.remove('overflow-content');
    }
}

/**
 * Enables or blocks Next based on the next step's `data-requires-completion`.
 *
 * A gated step names the step number that must be satisfied first, which is how
 * a simulated Generate, Approve, or alert decision unlocks progression.
 */
function updateNavigationButtons(state: FeatureTutorialState): void {
    const backBtn = document.getElementById('backBtn') as HTMLButtonElement | null;
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement | null;

    if (backBtn) {
        backBtn.style.display = state.currentStep > 1 ? 'flex' : 'none';
    }
    if (!nextBtn) return;

    if (state.currentStep === state.totalSteps) {
        setNextButtonText(nextBtn, 'Complete Setup');
        nextBtn.disabled = false;
        nextBtn.removeAttribute('aria-label');
        return;
    }

    const nextStepElement = document.getElementById(`content-step-${state.currentStep + 1}`);
    const requiresCompletion = nextStepElement?.getAttribute('data-requires-completion');
    if (requiresCompletion && !state.completedSteps.has(parseInt(requiresCompletion, 10))) {
        nextBtn.disabled = true;
        nextBtn.setAttribute('aria-label', 'Next, complete this step first');
        setNextButtonText(nextBtn, 'Next');
        return;
    }

    nextBtn.disabled = false;
    nextBtn.removeAttribute('aria-label');
    setNextButtonText(nextBtn, 'Next');
}

/**
 * Persists tutorial completion on the signed-in user's own record.
 *
 * Resolves false so the caller can keep the instructor in place behind an error
 * modal rather than advancing past a stage that was never recorded.
 */
async function persistCompletion(feature: OnboardingFeatureKey): Promise<boolean> {
    try {
        await completeInstructorOnboardingStage(feature);
        return true;
    } catch {
        return false;
    }
}

/**
 * runFeatureTutorial - mounts one feature tutorial and drives its step flow.
 *
 * Fetches the component, wires the rail, Help modal, and Back/Next navigation,
 * then on the final step persists completion and dispatches the tutorial's
 * completion event. A failed write keeps the instructor on the completion screen
 * behind the standard error modal, matching how course setup recovers.
 *
 * @param definition - static description of the tutorial
 * @param instructorCourse - course being set up
 */
export async function runFeatureTutorial(
    definition: FeatureTutorialDefinition,
    instructorCourse: activeCourse
): Promise<void> {
    try {
        const container = document.getElementById('main-content-area');
        if (!container) {
            throw new Error("Main content area not found");
        }

        document.body.classList.add('onboarding-active');
        container.innerHTML = await loadComponentHTML(definition.component);

        await new Promise(resolve => requestAnimationFrame(resolve));
        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }

        const state: FeatureTutorialState = {
            currentStep: 1,
            totalSteps: definition.totalSteps,
            completedSteps: new Set<number>()
        };

        const context: FeatureTutorialContext = {
            course: instructorCourse,
            state,
            markStepCompleted: (stepNumber: number) => {
                state.completedSteps.add(stepNumber);
                updateNavigationButtons(state);
            }
        };

        const showStep = async (stepNumber: number): Promise<void> => {
            document.querySelectorAll('.content-step').forEach(step => step.classList.remove('active'));

            const targetStep = document.getElementById(`content-step-${stepNumber}`);
            targetStep?.classList.add('active');

            state.currentStep = stepNumber;
            updateStepIndicators(stepNumber);
            updateNavigationButtons(state);
            updateStaffOnboardingProgress(state.currentStep, state.totalSteps);

            await definition.initializeStep?.(stepNumber, context);

            if (typeof (window as any).feather !== 'undefined') {
                (window as any).feather.replace();
            }
            if (targetStep) {
                setTimeout(() => adjustContentJustification(targetStep as HTMLElement), 10);
            }
        };

        const complete = async (): Promise<void> => {
            const persisted = await persistCompletion(definition.feature);
            if (!persisted) {
                await showErrorModal(
                    "Save Error",
                    "Your progress could not be saved. Please check your connection and try again."
                );
                return;
            }

            window.dispatchEvent(new CustomEvent(definition.completionEvent, {
                detail: { course: instructorCourse, feature: definition.feature, completedAt: new Date() }
            }));
        };

        document.getElementById('backBtn')?.addEventListener('click', () => {
            if (state.currentStep > 1) {
                void showStep(state.currentStep - 1);
            }
        });

        document.getElementById('nextBtn')?.addEventListener('click', () => {
            if (state.currentStep < state.totalSteps) {
                void showStep(state.currentStep + 1);
            } else {
                void complete();
            }
        });

        document.getElementById('helpBtn')?.addEventListener('click', () => {
            const helpElement = document.getElementById(`help-step-${state.currentStep}`);
            void showHelpModal(
                state.currentStep,
                definition.stepTitles[state.currentStep] ?? "Help",
                helpElement ? helpElement.innerHTML : "<p>No help content available for this step.</p>"
            );
        });

        window.addEventListener('resize', () => {
            const activeStep = document.querySelector('.content-step.active');
            if (activeStep) {
                adjustContentJustification(activeStep as HTMLElement);
            }
        });

        await showStep(1);
    } catch (error) {
        console.error(`❌ Error during ${definition.component} initialization:`, error);
        await showErrorModal(
            "Initialization Error",
            "Failed to initialize this tutorial. Please refresh the page and try again."
        );
    }
}
