/**
 * student-view-banner.ts
 * @description The persistent Student View banner shown on every student page while a staff
 *              member is previewing their own course.
 *
 * The banner's content and its visibility decision live in `buildStudentViewBannerModel`,
 * which is what the tests cover; `renderStudentViewBanner` turns that model into elements
 * and is verified in the browser pass.
 */

import { showConfirmModal, showErrorModal } from '../ui/modal-overlay.js';
import type { StudentViewState } from '../types.js';

const BANNER_TEXT = "You're in student view as Test student. Only you can see this.";

/** Marks the shell as making room for the banner. Styled in student-view-banner.css. */
export const STUDENT_VIEW_BODY_CLASS = 'student-view-active';

/** Copy for the Reset confirmation, kept here so a test can pin it. */
export const STUDENT_VIEW_RESET_COPY = {
    title: 'Reset your test student?',
    body:
        'This deletes every chat, practice attempt and flag your test student created, and ' +
        'starts it over. Real students are not affected.',
    confirmText: 'Reset',
    cancelText: 'Cancel'
} as const;

/** Slugified label of the Reset confirm button, which is what `ModalResult.action` carries. */
export const STUDENT_VIEW_RESET_ACTION = 'reset';

/** What the banner shows, decided without touching the DOM so it can be tested under node. */
export interface StudentViewBannerModel {
    text: string;
    courseId: string;
    actions: Array<{ action: 'reset' | 'exit'; label: string }>;
}

/**
 * buildStudentViewBannerModel — the banner's content, or null when there is no banner.
 *
 * Returns null unless Student View is both active and scoped to a course, because every
 * control on the banner posts to a course-scoped endpoint.
 *
 * @param state - Student View state from `GET /api/user/current`
 */
export function buildStudentViewBannerModel(
    state: StudentViewState
): StudentViewBannerModel | null {
    if (!state.active || !state.courseId) {
        return null;
    }
    return {
        text: BANNER_TEXT,
        courseId: state.courseId,
        actions: [
            { action: 'reset', label: 'Reset' },
            { action: 'exit', label: 'Exit student view' }
        ]
    };
}

/** POST one of the course-scoped Student View controls. */
async function post(courseId: string, action: 'reset' | 'exit'): Promise<Response> {
    return fetch(`/api/course/${courseId}/student-view/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
    });
}

/**
 * renderStudentViewBanner — draw the banner, or nothing when not previewing.
 *
 * `role="status"` with `aria-live="polite"` so a screen reader is told what mode this is on
 * arrival without interrupting, and both controls are ordinary buttons so the banner is
 * reachable by keyboard from the top of the page.
 *
 * @param state - Student View state from `GET /api/user/current`
 */
export function renderStudentViewBanner(state: StudentViewState): void {
    const root = document.getElementById('student-view-banner-root');
    if (!root) {
        return;
    }
    root.innerHTML = '';

    const model = buildStudentViewBannerModel(state);
    if (!model) {
        // The shell sizes itself to the whole viewport, so the layout compensation below
        // must come off again whenever the banner is not shown.
        document.body.classList.remove(STUDENT_VIEW_BODY_CLASS);
        return;
    }

    // Lets the body become a flex column so the banner does not push the dashboard's
    // bottom edge off screen; see student-view-banner.css.
    document.body.classList.add(STUDENT_VIEW_BODY_CLASS);

    const courseId = model.courseId;

    const banner = document.createElement('div');
    banner.className = 'student-view-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    const message = document.createElement('p');
    message.className = 'student-view-banner__text';
    message.textContent = model.text;

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'student-view-banner__button';
    reset.dataset.action = model.actions[0].action;
    reset.textContent = model.actions[0].label;

    const exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'student-view-banner__button student-view-banner__button--primary';
    exit.dataset.action = model.actions[1].action;
    exit.textContent = model.actions[1].label;

    reset.addEventListener('click', async () => {
        const confirmed = await showConfirmModal(
            STUDENT_VIEW_RESET_COPY.title,
            STUDENT_VIEW_RESET_COPY.body,
            STUDENT_VIEW_RESET_COPY.confirmText,
            STUDENT_VIEW_RESET_COPY.cancelText,
            'danger'
        );
        if (confirmed.action !== STUDENT_VIEW_RESET_ACTION) {
            return;
        }

        const response = await post(courseId, 'reset');
        if (!response.ok) {
            await showErrorModal('Reset failed', 'The test student could not be reset. Try again.');
            return;
        }
        window.location.href = `/course/${courseId}/student`;
    });

    exit.addEventListener('click', async () => {
        const response = await post(courseId, 'exit');
        if (!response.ok) {
            await showErrorModal('Could not exit', 'Student view could not be exited. Try again.');
            return;
        }
        const body = (await response.json()) as { redirectTo: string };
        window.location.href = body.redirectTo;
    });

    const actions = document.createElement('div');
    actions.className = 'student-view-banner__actions';
    actions.append(reset, exit);
    banner.append(message, actions);
    root.appendChild(banner);
}
