/**
 * onboarding-tutorial-chrome.ts
 *
 * Renders the shared "you are in a tutorial" chrome above every staff onboarding stage:
 * a banner naming the mode, and a cross-stage progress line.
 *
 * This is about stages, not steps. The per-stage rail and the mobile step strip already
 * answer "where am I in this stage"; an instructor at a workshop reported that nothing
 * answered "am I still in a tutorial or in the real interface, and how much is left".
 *
 * @author: @rdschrs
 * @date: 2026-09-18
 */

import {
    ONBOARDING_STAGE_LABELS,
    resolveOnboardingStagePosition,
    type InstructorOnboardingStage,
    type OnboardingCourseProgress
} from '../utils/onboarding-stage-order.js';

/** Fixed banner copy: the same sentence at every breakpoint and on every stage. */
const BANNER_TEXT = 'Tutorial — nothing you do here changes your live course.';

export interface TutorialChromeCopy {
    banner: string;
    /** `Tutorial 4 of 7`, or plain `Tutorial` when the stage is outside this viewer's sequence. */
    position: string;
    stageLabel: string;
    /** Track fill, 0-100, counting completed stages so the first stage reads empty. */
    percent: number;
}

/**
 * Derives the chrome's copy and track fill for one stage.
 *
 * Fill counts *completed* stages (`index - 1`), so entering the first stage shows an empty
 * track and entering the last still shows one stage to go — which is what an instructor
 * mid-tutorial actually has left.
 *
 * @param stage - stage being rendered
 * @param course - course supplying the capability map
 * @param canManageRoster - false for teaching assistants, who never see Course Setup
 */
export function buildTutorialChromeCopy(
    stage: InstructorOnboardingStage,
    course: OnboardingCourseProgress,
    canManageRoster = true
): TutorialChromeCopy {
    const stageLabel = ONBOARDING_STAGE_LABELS[stage];
    const position = resolveOnboardingStagePosition(stage, course, canManageRoster);
    if (!position) {
        return { banner: BANNER_TEXT, position: 'Tutorial', stageLabel, percent: 0 };
    }

    return {
        banner: BANNER_TEXT,
        position: `Tutorial ${position.index} of ${position.total}`,
        stageLabel,
        percent: Math.round(((position.index - 1) / position.total) * 100)
    };
}

/**
 * Inserts or updates the chrome at the top of the stage's content area.
 *
 * Idempotent, so a controller may call it on every step change. The track is
 * `aria-hidden` because the same information is in the adjacent text, which carries
 * `role="status"` so a stage change is announced once rather than twice.
 *
 * A missing content area is not an error: a controller may render the chrome before its
 * component is mounted, and the next call after mounting will place it.
 *
 * @param stage - stage being rendered
 * @param course - course supplying the capability map
 * @param canManageRoster - false for teaching assistants
 */
export function renderTutorialChrome(
    stage: InstructorOnboardingStage,
    course: OnboardingCourseProgress | null | undefined,
    canManageRoster = true
): void {
    const contentArea = document.querySelector<HTMLElement>(
        '.onboarding.staff-onboarding .onboarding-content-area'
    );
    if (!contentArea) return;

    const copy = buildTutorialChromeCopy(stage, course ?? {}, canManageRoster);

    let chrome = contentArea.querySelector<HTMLElement>('.tutorial-chrome');
    if (!chrome) {
        chrome = document.createElement('div');
        chrome.className = 'tutorial-chrome';
        chrome.innerHTML = `
            <div class="tutorial-chrome__banner" role="note">
                <i data-feather="book-open"></i>
                <span class="tutorial-chrome__banner-text"></span>
            </div>
            <div class="tutorial-chrome__progress" role="status" aria-live="polite" aria-atomic="true">
                <span class="tutorial-chrome__position"></span>
                <span class="tutorial-chrome__stage"></span>
            </div>
            <div class="tutorial-chrome__track" aria-hidden="true">
                <span class="tutorial-chrome__fill"></span>
            </div>
        `;
        contentArea.insertBefore(chrome, contentArea.firstChild);
    }

    const bannerText = chrome.querySelector<HTMLElement>('.tutorial-chrome__banner-text');
    const positionText = chrome.querySelector<HTMLElement>('.tutorial-chrome__position');
    const stageText = chrome.querySelector<HTMLElement>('.tutorial-chrome__stage');
    const fill = chrome.querySelector<HTMLElement>('.tutorial-chrome__fill');

    if (bannerText) bannerText.textContent = copy.banner;
    if (positionText) positionText.textContent = copy.position;
    if (stageText) stageText.textContent = copy.stageLabel;
    if (fill) fill.style.width = `${copy.percent}%`;

    if (typeof (window as any).feather !== 'undefined') {
        (window as any).feather.replace();
    }
}
