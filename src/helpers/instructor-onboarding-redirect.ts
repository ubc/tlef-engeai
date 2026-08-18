/**
 * instructor-onboarding-redirect.ts
 *
 * Resolves instructor-mode redirect URLs from course onboarding flags.
 */

import type { activeCourse } from '../types/shared';
import { isCourseFeatureEnabled } from '../dashboard-setting/course-features';

/**
 * Instructor onboarding stage slugs, matching their routes and components.
 *
 * Mirrors `public/scripts/utils/onboarding-stage-order.ts`. The browser cannot
 * import backend modules and this file cannot import browser modules, so both
 * sides are pinned to identical behavior by
 * `src/helpers/__tests__/instructor-onboarding-redirect.test.ts`.
 */
export type InstructorOnboardingStage =
    | 'course-setup'
    | 'document-setup'
    | 'scenario-generation-setup'
    | 'writing-feedback-setup'
    | 'guided-pathway-setup'
    | 'flag-setup'
    | 'monitor-setup';

/** Course capability keys that own an onboarding tutorial. */
export type OnboardingFeatureKey = 'scenarioGeneration' | 'writingFeedback' | 'guidedPathway';

/** Feature tutorials in presentation order, between Document and Flag setup. */
export const FEATURE_ONBOARDING_STAGES: ReadonlyArray<{
    stage: InstructorOnboardingStage;
    feature: OnboardingFeatureKey;
}> = [
    { stage: 'scenario-generation-setup', feature: 'scenarioGeneration' },
    { stage: 'writing-feedback-setup', feature: 'writingFeedback' },
    { stage: 'guided-pathway-setup', feature: 'guidedPathway' }
];

/**
 * A tutorial is owed unless explicitly completed.
 *
 * Missing progress is incomplete, which routes courses created before
 * `featureOnboarding` existed through the new stages.
 */
function isFeatureTutorialComplete(courseData: activeCourse, feature: OnboardingFeatureKey): boolean {
    return courseData.featureOnboarding?.[feature] === true;
}

/**
 * resolveNextOnboardingStage - first onboarding stage the instructor still owes.
 *
 * Sequence: Course, Document, then each enabled-and-incomplete feature tutorial
 * in `FEATURE_ONBOARDING_STAGES` order, then Flag and Monitor.
 *
 * @returns the stage slug to render, or null when onboarding is complete
 */
export function resolveNextOnboardingStage(courseData: activeCourse): InstructorOnboardingStage | null {
    if (!courseData.courseSetup) {
        return 'course-setup';
    }
    if (!courseData.contentSetup) {
        return 'document-setup';
    }

    for (const { stage, feature } of FEATURE_ONBOARDING_STAGES) {
        if (isCourseFeatureEnabled(courseData, feature) && !isFeatureTutorialComplete(courseData, feature)) {
            return stage;
        }
    }

    if (!courseData.flagSetup) {
        return 'flag-setup';
    }
    if (!courseData.monitorSetup) {
        return 'monitor-setup';
    }
    return null;
}

/** Instructor-mode redirect based on course onboarding flags and feature tutorial progress. */
export function resolveInstructorModeRedirect(
    courseId: string,
    courseData: activeCourse
): { redirect: string; requiresOnboarding: boolean } {
    const stage = resolveNextOnboardingStage(courseData);
    if (stage === null) {
        return { redirect: `/course/${courseId}/instructor/dashboard`, requiresOnboarding: false };
    }
    return { redirect: `/course/${courseId}/instructor/onboarding/${stage}`, requiresOnboarding: true };
}

/**
 * Validates frameType and tilesNumber for course-setup completion (mirrors frontend rules).
 *
 * @returns Error message or null when valid
 */
export function validateCourseSetupFields(
    frameType: unknown,
    tilesNumber: unknown
): string | null {
    if (frameType !== 'byWeek' && frameType !== 'byTopic') {
        return 'Frame type must be either "byWeek" or "byTopic"';
    }
    if (typeof tilesNumber !== 'number' || !Number.isFinite(tilesNumber) || tilesNumber < 1 || tilesNumber > 52) {
        return 'Tiles number must be between 1 and 52';
    }
    if (frameType === 'byWeek' && tilesNumber > 14) {
        return 'For weekly organization, maximum 14 weeks allowed';
    }
    return null;
}
