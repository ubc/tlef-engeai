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
 * resolveNextOnboardingStage - first onboarding stage this staff member still owes.
 *
 * Sequence: Course, Document, then each enabled-and-incomplete feature tutorial
 * in `FEATURE_ONBOARDING_STAGES` order, then Flag and Monitor.
 *
 * Course Setup is reserved for roster managers. It defines `frameType` and
 * `tilesNumber` — whether the course runs by week or by topic, and how many
 * divisions it has — and its endpoint requires roster-management authority. Every
 * later stage files content under those divisions, so a teaching assistant reaching
 * an unconfigured course is owed nothing here rather than being sent into a stage
 * they cannot complete or a document step with no structure to populate. Course
 * entry routes all staff through this resolver, so without the distinction a TA
 * looped on Course Setup forever.
 *
 * @param courseData - course whose onboarding flags drive the sequence
 * @param canManageRoster - true for faculty instructors and platform admins
 * @returns the stage slug to render, or null when nothing is owed
 */
export function resolveNextOnboardingStage(
    courseData: activeCourse,
    canManageRoster = true
): InstructorOnboardingStage | null {
    if (!courseData.courseSetup) {
        return canManageRoster ? 'course-setup' : null;
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

/**
 * Instructor-mode redirect based on course onboarding flags and feature tutorial progress.
 *
 * @param canManageRoster - true for faculty instructors and platform admins; teaching
 * assistants pass false so Course Setup is never selected for them
 */
export function resolveInstructorModeRedirect(
    courseId: string,
    courseData: activeCourse,
    canManageRoster = true
): { redirect: string; requiresOnboarding: boolean } {
    const stage = resolveNextOnboardingStage(courseData, canManageRoster);
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
