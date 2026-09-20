/**
 * onboarding-progress.ts
 *
 * Client helper for recording instructor tutorial progress.
 *
 * Progress lives on the user (`active-users`), not the course, so a second instructor
 * joining an already-set-up course is still taught, and an instructor who has been taught
 * is never taught again on a new course. `courseSetup` is deliberately not covered here:
 * it writes real course configuration and stays on the course document.
 */

import { InstructorOnboardingProgress } from '../types.js';

/** Tutorial stages that are recorded per user. */
export type InstructorOnboardingStage = keyof InstructorOnboardingProgress;

/**
 * Marks one instructor tutorial stage complete for the signed-in user.
 *
 * @param stage - Stage the instructor just finished
 * @throws Error carrying the server's message when the update fails, so callers can
 *         surface it and revert their optimistic UI state
 */
export async function completeInstructorOnboardingStage(stage: InstructorOnboardingStage): Promise<void> {
    const response = await fetch('/api/user/onboarding/instructor-stage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ stage })
    });

    if (!response.ok) {
        const errorData = await response
            .json()
            .catch(() => ({ error: 'Failed to record onboarding progress' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Failed to record onboarding progress');
    }
}

/**
 * Marks this course's content as filed by Document Setup.
 *
 * The companion to {@link completeInstructorOnboardingStage} for the half of Document Setup
 * that is course state rather than tutorial progress. Without it a veteran who owes no
 * tutorial would skip the stage on every new course and leave it with no content.
 *
 * @param courseId - Course whose content has just been set up
 * @throws Error carrying the server's message when the update fails
 */
export async function markCourseContentSetupComplete(courseId: string): Promise<void> {
    const response = await fetch(`/api/courses/${courseId}/onboarding/content-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
    });

    if (!response.ok) {
        const errorData = await response
            .json()
            .catch(() => ({ error: 'Failed to record course content setup' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Failed to record course content setup');
    }
}
