/**
 * onboarding-tutorial-chrome.ts
 *
 * Renders the shared "you are in a tutorial" chrome above every staff onboarding stage:
 * a `Tutorial 3 of 6 · Stage` line over a segmented track, one segment per stage.
 *
 * This is about stages, not steps. The per-stage rail and the mobile step strip already
 * answer "where am I in this stage"; an instructor at a workshop reported that nothing
 * answered "am I still in a tutorial or in the real interface, and how much is left".
 * There is no "nothing here changes your course" banner: Course Setup creates the real
 * course, so that promise would be false on the first stage.
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

export interface TutorialChromeCopy {
    /** `Tutorial 4 of 7`, or plain `Tutorial` when the stage is outside this viewer's sequence. */
    position: string;
    stageLabel: string;
    /** One segment per stage in this viewer's sequence; 0 when the stage is outside it. */
    segmentCount: number;
    /** 1-based segment of the stage being rendered; 0 when the stage is outside the sequence. */
    currentSegment: number;
}

/**
 * Derives the chrome's copy and segment state for one stage.
 *
 * Segments before `currentSegment` are finished, that one is in progress, and the rest are
 * still to come — so "Tutorial 3 of 6" shows two filled segments and a highlighted third,
 * rather than a continuous fill that reads as a third of the way while the label says half.
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
        return { position: 'Tutorial', stageLabel, segmentCount: 0, currentSegment: 0 };
    }

    return {
        position: `Tutorial ${position.index} of ${position.total}`,
        stageLabel,
        segmentCount: position.total,
        currentSegment: position.index
    };
}

/**
 * Inserts or updates the chrome at the top of the stage's content area.
 *
 * Idempotent, so a controller may call it on every step change. The segments are
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
            <div class="tutorial-chrome__progress" role="status" aria-live="polite" aria-atomic="true">
                <span class="tutorial-chrome__position"></span>
                <span class="tutorial-chrome__stage"></span>
            </div>
            <div class="tutorial-chrome__segments" aria-hidden="true"></div>
        `;
        contentArea.insertBefore(chrome, contentArea.firstChild);
    }

    const positionText = chrome.querySelector<HTMLElement>('.tutorial-chrome__position');
    const stageText = chrome.querySelector<HTMLElement>('.tutorial-chrome__stage');
    const segments = chrome.querySelector<HTMLElement>('.tutorial-chrome__segments');

    if (positionText) positionText.textContent = copy.position;
    if (stageText) stageText.textContent = copy.stageLabel;
    if (segments) {
        segments.replaceChildren(
            ...Array.from({ length: copy.segmentCount }, (_, i) => {
                const segment = document.createElement('span');
                const n = i + 1;
                const state = n < copy.currentSegment ? 'done' : n === copy.currentSegment ? 'current' : 'upcoming';
                segment.className = `tutorial-chrome__segment tutorial-chrome__segment--${state}`;
                return segment;
            })
        );
    }
}
