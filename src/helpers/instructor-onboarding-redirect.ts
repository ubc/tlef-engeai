/**
 * instructor-onboarding-redirect.ts
 *
 * Resolves instructor-mode redirect URLs from course onboarding flags.
 */

import type { activeCourse } from '../types/shared';

/** Instructor-mode redirect based on course onboarding flags. */
export function resolveInstructorModeRedirect(
    courseId: string,
    courseData: activeCourse
): { redirect: string; requiresOnboarding: boolean } {
    if (!courseData.courseSetup) {
        return { redirect: `/course/${courseId}/instructor/onboarding/course-setup`, requiresOnboarding: true };
    }
    if (!courseData.contentSetup) {
        return { redirect: `/course/${courseId}/instructor/onboarding/document-setup`, requiresOnboarding: true };
    }
    if (!courseData.flagSetup) {
        return { redirect: `/course/${courseId}/instructor/onboarding/flag-setup`, requiresOnboarding: true };
    }
    if (!courseData.monitorSetup) {
        return { redirect: `/course/${courseId}/instructor/onboarding/monitor-setup`, requiresOnboarding: true };
    }
    return { redirect: `/course/${courseId}/instructor/documents`, requiresOnboarding: false };
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
