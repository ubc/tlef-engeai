/**
 * instructor-onboarding-redirect.ts
 *
 * Resolves instructor-mode redirect URLs from course setup state and per-user tutorial progress.
 */

import type { activeCourse, GlobalUser } from '../types/shared';

/**
 * Instructor-mode redirect, mixing course state with the viewer's own tutorial progress.
 *
 * `courseSetup` is read from the course because it writes real configuration — frame type,
 * tile count, content structure — that a second instructor must not be able to override.
 * The three tutorial stages are read from the user, so an instructor who is new to EngE-AI
 * is taught even when a colleague already set the course up, and an instructor who has been
 * taught is never taught again on a new course.
 *
 * @param courseId - Course being entered
 * @param courseData - Course document, for `courseSetup` only
 * @param globalUser - Viewer's global record; a missing record is treated as no progress
 *
 * @returns Redirect path and whether it lands on an onboarding stage
 */
export function resolveInstructorModeRedirect(
    courseId: string,
    courseData: activeCourse,
    globalUser: Pick<GlobalUser, 'instructorOnboarding'> | null | undefined
): { redirect: string; requiresOnboarding: boolean } {
    if (!courseData.courseSetup) {
        return { redirect: `/course/${courseId}/instructor/onboarding/course-setup`, requiresOnboarding: true };
    }

    const progress = globalUser?.instructorOnboarding;

    if (!progress?.contentSetup) {
        return { redirect: `/course/${courseId}/instructor/onboarding/document-setup`, requiresOnboarding: true };
    }
    if (!progress.flagSetup) {
        return { redirect: `/course/${courseId}/instructor/onboarding/flag-setup`, requiresOnboarding: true };
    }
    if (!progress.monitorSetup) {
        return { redirect: `/course/${courseId}/instructor/onboarding/monitor-setup`, requiresOnboarding: true };
    }
    return { redirect: `/course/${courseId}/instructor/dashboard`, requiresOnboarding: false };
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
