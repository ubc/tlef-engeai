// public/scripts/onboarding/staff-onboarding-ui.ts
/**
 * Shared browser-only presentation helpers for staff onboarding tutorials.
 *
 * @author: @rdschrs
 * @date: 2026-08-20
 * @version: 1.0.0
 */

/**
 * Updates the compact mobile progress label and announces the active step.
 *
 * The helper derives the step title from the tutorial rail so legacy and feature
 * controllers do not need to duplicate presentation copy.
 *
 * @param currentStep - One-based active step number
 * @param totalSteps - Total number of steps in the current tutorial
 */
export function updateStaffOnboardingProgress(currentStep: number, totalSteps: number): void {
    const root = document.querySelector<HTMLElement>('.onboarding.staff-onboarding');
    const contentArea = root?.querySelector<HTMLElement>('.onboarding-content-area');
    const contentSteps = contentArea?.querySelector<HTMLElement>('.onboarding-content-steps');
    if (!root || !contentArea || !contentSteps) return;

    let progress = contentArea.querySelector<HTMLElement>('.staff-onboarding-progress');
    if (!progress) {
        progress = document.createElement('div');
        progress.className = 'staff-onboarding-progress';
        progress.setAttribute('role', 'status');
        progress.setAttribute('aria-live', 'polite');
        progress.setAttribute('aria-atomic', 'true');
        contentArea.insertBefore(progress, contentSteps);
    }

    const activeItem = root.querySelector<HTMLElement>(`.step-item[data-step="${currentStep}"]`);
    const stepTitle = activeItem?.querySelector('h3')?.textContent?.trim() || 'Onboarding';

    const count = document.createElement('span');
    count.className = 'staff-onboarding-progress__count';
    count.textContent = `Step ${currentStep} of ${totalSteps}`;

    const title = document.createElement('span');
    title.className = 'staff-onboarding-progress__title';
    title.textContent = stepTitle;

    progress.replaceChildren(count, title);

    root.querySelectorAll<HTMLElement>('.step-item').forEach(item => {
        if (item === activeItem) {
            item.setAttribute('aria-current', 'step');
        } else {
            item.removeAttribute('aria-current');
        }
    });
}
