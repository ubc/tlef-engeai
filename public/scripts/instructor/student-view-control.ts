/**
 * student-view-control.ts
 * @description The instructor sidebar entry into Student View, with its confirmation.
 *
 * The decisions live in pure functions so they can be tested under this repository's
 * node-only Jest; the DOM wiring is exercised in the browser pass.
 */

import { showConfirmModal, showErrorModal } from '../ui/modal-overlay.js';

/** Copy for the entry confirmation, kept beside the control so a test can pin it. */
export const STUDENT_VIEW_CONFIRM_COPY = {
    title: 'Enter student view?',
    body:
        'You will see this course as a new student in your class sees it, using your own ' +
        'test student. Nothing you do there affects real students.',
    confirmText: 'Enter student view',
    cancelText: 'Cancel'
} as const;

/** Slugified label of the confirm button, which is what `ModalResult.action` carries. */
export const STUDENT_VIEW_CONFIRM_ACTION = 'enter-student-view';

/** The course-scoped enter endpoint. */
export function studentViewEnterPath(courseId: string): string {
    return `/api/course/${courseId}/student-view/enter`;
}

/**
 * shouldShowStudentViewControl — whether this viewer sees the sidebar item at all.
 *
 * Deliberately the same predicate the endpoint authorizes (`canManageCourseRoster`), so the
 * button never appears where the request would be refused. Admitting teaching assistants
 * later is a change to what the caller passes, not to this function.
 *
 * @param canManageCourse - Whether the viewer may manage this course
 */
export function shouldShowStudentViewControl(canManageCourse: boolean): boolean {
    return canManageCourse === true;
}

/**
 * enterStudentView — start previewing and return where the browser should go next.
 *
 * @param courseId - Course to preview
 * @returns The path to navigate to
 * @throws When the server refuses or fails
 */
export async function enterStudentView(courseId: string): Promise<string> {
    const response = await fetch(studentViewEnterPath(courseId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
    });
    if (!response.ok) {
        throw new Error('Could not start student view');
    }
    const body = (await response.json()) as { redirectTo: string };
    return body.redirectTo;
}

/**
 * initStudentViewControl — show and wire the sidebar item.
 *
 * @param options - Course being viewed and whether the viewer may manage it
 */
export function initStudentViewControl(options: {
    courseId: string;
    canManageCourse: boolean;
}): void {
    const button = document.getElementById('student-view-btn') as HTMLButtonElement | null;
    if (!button) {
        return;
    }
    if (!shouldShowStudentViewControl(options.canManageCourse)) {
        button.hidden = true;
        return;
    }
    button.hidden = false;

    button.addEventListener('click', async () => {
        const result = await showConfirmModal(
            STUDENT_VIEW_CONFIRM_COPY.title,
            STUDENT_VIEW_CONFIRM_COPY.body,
            STUDENT_VIEW_CONFIRM_COPY.confirmText,
            STUDENT_VIEW_CONFIRM_COPY.cancelText
        );
        if (result.action !== STUDENT_VIEW_CONFIRM_ACTION) {
            return;
        }

        try {
            window.location.href = await enterStudentView(options.courseId);
        } catch {
            await showErrorModal(
                'Student view unavailable',
                'Student view could not be started. Try again.'
            );
        }
    });
}
