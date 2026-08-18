/**
 * onboarding-stage-order.ts
 *
 * Single source of instructor onboarding stage ordering for the browser.
 *
 * Deliberately import-free and DOM-free so it can be unit tested from the
 * backend Jest project, which compiles `src` only and runs in a Node
 * environment. `tsconfig.jest.json` hand-includes this file for that reason,
 * following the precedent set by `instructor-response-carousel.ts`.
 *
 * The backend mirror lives in `src/helpers/instructor-onboarding-redirect.ts`.
 * Neither side can import the other, so `src/helpers/__tests__/instructor-onboarding-redirect.test.ts`
 * asserts both resolve identically for every input combination.
 *
 * @author: @rdschrs
 * @date: 2026-08-17
 */

/** Every instructor onboarding stage slug, matching its route and component name. */
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

/**
 * Structural view of the course fields stage resolution depends on.
 *
 * Declared structurally rather than imported so this module stays import-free.
 * Both `activeCourse` copies satisfy it.
 */
export interface OnboardingCourseProgress {
    courseSetup?: boolean;
    contentSetup?: boolean;
    flagSetup?: boolean;
    monitorSetup?: boolean;
    features?: {
        scenarioGeneration?: { enabled: boolean };
        writingFeedback?: { enabled: boolean };
        guidedPathway?: { enabled: boolean };
    };
    featureOnboarding?: {
        scenarioGeneration?: boolean;
        writingFeedback?: boolean;
        guidedPathway?: boolean;
    };
}

/**
 * Feature tutorials in the order they are presented, between Document and Flag setup.
 *
 * Order is product-specified. Changing it changes what instructors see, so the
 * sequence is pinned by test rather than left to declaration order elsewhere.
 */
export const FEATURE_ONBOARDING_STAGES: ReadonlyArray<{
    stage: InstructorOnboardingStage;
    feature: OnboardingFeatureKey;
}> = [
    { stage: 'scenario-generation-setup', feature: 'scenarioGeneration' },
    { stage: 'writing-feedback-setup', feature: 'writingFeedback' },
    { stage: 'guided-pathway-setup', feature: 'guidedPathway' }
];

/** A capability counts as available only on an explicit true, matching `isCourseFeatureEnabled`. */
function isFeatureEnabled(course: OnboardingCourseProgress, feature: OnboardingFeatureKey): boolean {
    return course.features?.[feature]?.enabled === true;
}

/**
 * A tutorial is owed unless it has been explicitly completed.
 *
 * Missing progress is incomplete, which is what routes courses created before
 * `featureOnboarding` existed through the new stages.
 */
function isFeatureTutorialComplete(course: OnboardingCourseProgress, feature: OnboardingFeatureKey): boolean {
    return course.featureOnboarding?.[feature] === true;
}

/**
 * resolveNextOnboardingStage - first onboarding stage the instructor still owes.
 *
 * Sequence: Course, Document, then each enabled-and-incomplete feature tutorial
 * in `FEATURE_ONBOARDING_STAGES` order, then Flag and Monitor.
 *
 * @param course - course progress flags, capability map, and tutorial progress
 * @returns the stage slug to render, or null when onboarding is complete
 */
export function resolveNextOnboardingStage(
    course: OnboardingCourseProgress
): InstructorOnboardingStage | null {
    if (!course.courseSetup) {
        return 'course-setup';
    }
    if (!course.contentSetup) {
        return 'document-setup';
    }

    for (const { stage, feature } of FEATURE_ONBOARDING_STAGES) {
        if (isFeatureEnabled(course, feature) && !isFeatureTutorialComplete(course, feature)) {
            return stage;
        }
    }

    if (!course.flagSetup) {
        return 'flag-setup';
    }
    if (!course.monitorSetup) {
        return 'monitor-setup';
    }
    return null;
}

/** Builds the instructor onboarding route for a stage. */
export function buildOnboardingStagePath(courseId: string, stage: InstructorOnboardingStage): string {
    return `/course/${courseId}/instructor/onboarding/${stage}`;
}
