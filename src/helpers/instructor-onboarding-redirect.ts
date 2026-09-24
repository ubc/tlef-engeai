/**
 * instructor-onboarding-redirect.ts
 *
 * Resolves instructor-mode redirect URLs from course setup state and per-user tutorial progress.
 */

import type { activeCourse, GlobalUser, InstructorOnboardingProgress } from '../types/shared';
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
 * True when this course still owes the content Document Setup files.
 *
 * Read from the course's own items rather than from `contentSetup` alone, because that
 * flag cannot be trusted as history: `provisionCourse` has written `contentSetup: false`
 * on every new course since OB-002 moved the tutorial to the user, and nothing wrote it
 * back to `true`, so a flag-only test would drag every course created since through
 * Document Setup a second time. The items are the fact; the flag is a fast path once a
 * completed Document Setup has recorded it, and lets a deliberately empty course settle.
 *
 * Course Setup creates the divisions, so their presence proves nothing — only an item
 * filed under one of them does.
 *
 * @param course - course whose content is in question
 */
function courseOwesContent(course: Pick<activeCourse, 'contentSetup' | 'topicOrWeekInstances'>): boolean {
    if (course.contentSetup === true) {
        return false;
    }
    return !(course.topicOrWeekInstances ?? []).some(instance => (instance.items?.length ?? 0) > 0);
}

/**
 * resolveNextOnboardingStage - first onboarding stage this staff member still owes.
 *
 * Sequence: Course, Document, then each enabled-and-incomplete feature tutorial
 * in `FEATURE_ONBOARDING_STAGES` order, then Flag and Monitor.
 *
 * `courseSetup` is read from the course because it writes real configuration —
 * frame type, tile count, content structure — that a second instructor must not
 * be able to override. Every tutorial stage is read from the viewer's own record,
 * so an instructor new to EngE-AI is taught even on a course a colleague set up,
 * and an instructor who has been taught is never taught again on a new course.
 * A tutorial is owed unless explicitly completed, which routes users who predate
 * the field through the stages.
 *
 * The three feature tutorials are additionally gated on their course capability:
 * a course that never enabled Writing Feedback owes nobody that tutorial.
 *
 * Course Setup is reserved for roster managers. Its endpoint requires
 * roster-management authority, and every later stage files content under the
 * divisions it defines, so a teaching assistant reaching an unconfigured course
 * is owed nothing here rather than being sent into a stage they cannot complete.
 * Course entry routes all staff through this resolver, so without the distinction
 * a TA looped on Course Setup forever.
 *
 * @param courseData - course supplying `courseSetup` and the capability map
 * @param progress - viewer's own tutorial progress; missing is treated as none
 * @param canManageRoster - true for faculty instructors and platform admins
 * @returns the stage slug to render, or null when nothing is owed
 */
export function resolveNextOnboardingStage(
    courseData: activeCourse,
    progress: InstructorOnboardingProgress | null | undefined,
    canManageRoster = true
): InstructorOnboardingStage | null {
    if (!courseData.courseSetup) {
        return canManageRoster ? 'course-setup' : null;
    }
    // Document Setup does two jobs: it teaches the viewer and it files the course's content.
    // Either one being outstanding owes the stage.
    if (courseOwesContent(courseData) || !progress?.contentSetup) {
        return 'document-setup';
    }

    for (const { stage, feature } of FEATURE_ONBOARDING_STAGES) {
        if (isCourseFeatureEnabled(courseData, feature) && progress[feature] !== true) {
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

/**
 * Instructor-mode redirect, mixing course state with the viewer's own tutorial progress.
 *
 * @param courseId - Course being entered
 * @param courseData - Course document, for `courseSetup` and the capability map
 * @param globalUser - Viewer's global record; a missing record is treated as no progress
 * @param canManageRoster - true for faculty instructors and platform admins; teaching
 * assistants pass false so Course Setup is never selected for them
 */
export function resolveInstructorModeRedirect(
    courseId: string,
    courseData: activeCourse,
    globalUser: Pick<GlobalUser, 'instructorOnboarding'> | null | undefined,
    canManageRoster = true
): { redirect: string; requiresOnboarding: boolean } {
    const stage = resolveNextOnboardingStage(courseData, globalUser?.instructorOnboarding, canManageRoster);
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

/**
 * Human-readable stage names for tutorial chrome.
 *
 * Mirrors `public/scripts/utils/onboarding-stage-order.ts`; parity is pinned by
 * `src/helpers/__tests__/instructor-onboarding-redirect.test.ts`.
 */
export const ONBOARDING_STAGE_LABELS: Record<InstructorOnboardingStage, string> = {
    'course-setup': 'Course Setup',
    'document-setup': 'Course Content',
    'scenario-generation-setup': 'Scenario Generation',
    'writing-feedback-setup': 'Writing Feedback',
    'guided-pathway-setup': 'Guided Pathway',
    'flag-setup': 'Flags',
    'monitor-setup': 'Monitor'
};

/**
 * Stages that offer Skip tutorial.
 *
 * Course Setup writes the course's own structure and Course Content files real
 * material under it, so neither may be skipped.
 */
export const SKIPPABLE_ONBOARDING_STAGES: ReadonlyArray<InstructorOnboardingStage> = [
    'scenario-generation-setup',
    'writing-feedback-setup',
    'guided-pathway-setup',
    'flag-setup',
    'monitor-setup'
];

/** True when this stage offers Skip tutorial. */
export function isSkippableOnboardingStage(stage: InstructorOnboardingStage): boolean {
    return SKIPPABLE_ONBOARDING_STAGES.includes(stage);
}

/**
 * Every stage this viewer can be routed through on this course, in presentation order.
 *
 * Completion is ignored so the total stays stable as stages are finished. Ordering and
 * capability gating mirror {@link resolveNextOnboardingStage}.
 *
 * @param courseData - course supplying `courseSetup` and the capability map
 * @param canManageRoster - true for faculty instructors and platform admins
 */
export function buildOnboardingStageSequence(
    courseData: activeCourse,
    canManageRoster = true
): InstructorOnboardingStage[] {
    const sequence: InstructorOnboardingStage[] = [];
    if (canManageRoster) {
        sequence.push('course-setup');
    }
    sequence.push('document-setup');
    for (const { stage, feature } of FEATURE_ONBOARDING_STAGES) {
        if (isCourseFeatureEnabled(courseData, feature)) {
            sequence.push(stage);
        }
    }
    sequence.push('flag-setup', 'monitor-setup');
    return sequence;
}

/**
 * One-based position of a stage within {@link buildOnboardingStageSequence}.
 *
 * @returns `{ index, total }`, or null when this viewer is never routed through the stage
 */
export function resolveOnboardingStagePosition(
    stage: InstructorOnboardingStage,
    courseData: activeCourse,
    canManageRoster = true
): { index: number; total: number } | null {
    const sequence = buildOnboardingStageSequence(courseData, canManageRoster);
    const zeroBased = sequence.indexOf(stage);
    return zeroBased === -1 ? null : { index: zeroBased + 1, total: sequence.length };
}
