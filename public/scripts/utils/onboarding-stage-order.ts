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
 * Both `activeCourse` copies satisfy it. Tutorial progress is not here: it lives
 * on the user and arrives as the separate `progress` argument.
 */
export interface OnboardingCourseProgress {
    courseSetup?: boolean;
    features?: {
        scenarioGeneration?: { enabled: boolean };
        writingFeedback?: { enabled: boolean };
        guidedPathway?: { enabled: boolean };
    };
}

/**
 * Structural view of the viewer's own tutorial progress.
 *
 * Satisfied by both `InstructorOnboardingProgress` copies. `courseSetup` is
 * deliberately absent: it writes real course configuration and stays on the course.
 */
export interface OnboardingUserProgress {
    contentSetup?: boolean;
    flagSetup?: boolean;
    monitorSetup?: boolean;
    scenarioGeneration?: boolean;
    writingFeedback?: boolean;
    guidedPathway?: boolean;
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
 * resolveNextOnboardingStage - first onboarding stage this staff member still owes.
 *
 * Sequence: Course, Document, then each enabled-and-incomplete feature tutorial
 * in `FEATURE_ONBOARDING_STAGES` order, then Flag and Monitor.
 *
 * `courseSetup` is read from the course because it writes real configuration that
 * a second instructor must not be able to override. Every tutorial stage is read
 * from the viewer's own record, so an instructor new to EngE-AI is taught even on
 * a course a colleague set up, and one who has been taught is never taught again.
 * The three feature tutorials are additionally gated on their course capability.
 *
 * Course Setup is reserved for roster managers. It defines `frameType` and
 * `tilesNumber` — whether the course runs by week or by topic, and how many
 * divisions it has — and its endpoint requires roster-management authority. Every
 * later stage files content under those divisions, so a teaching assistant reaching
 * an unconfigured course is owed nothing here rather than being sent into a stage
 * they cannot complete or a document step with no structure to populate.
 *
 * @param course - course setup flag and capability map
 * @param progress - viewer's own tutorial progress; missing is treated as none
 * @param canManageRoster - true for faculty instructors and platform admins
 * @returns the stage slug to render, or null when nothing is owed
 */
export function resolveNextOnboardingStage(
    course: OnboardingCourseProgress,
    progress: OnboardingUserProgress | null | undefined,
    canManageRoster = true
): InstructorOnboardingStage | null {
    if (!course.courseSetup) {
        return canManageRoster ? 'course-setup' : null;
    }
    if (!progress?.contentSetup) {
        return 'document-setup';
    }

    for (const { stage, feature } of FEATURE_ONBOARDING_STAGES) {
        if (isFeatureEnabled(course, feature) && progress[feature] !== true) {
            return stage;
        }
    }

    if (!progress.flagSetup) {
        return 'flag-setup';
    }
    if (!progress.monitorSetup) {
        return 'monitor-setup';
    }
    return null;
}

/** Builds the instructor onboarding route for a stage. */
export function buildOnboardingStagePath(courseId: string, stage: InstructorOnboardingStage): string {
    return `/course/${courseId}/instructor/onboarding/${stage}`;
}
