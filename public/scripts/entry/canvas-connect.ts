// public/scripts/entry/canvas-connect.ts

/**
 * canvas-connect.ts
 *
 * "Connect to Canvas" flow on the course selection pages.
 *
 * Answers two questions in sequence — are you connected, and which course — and skips the first
 * whenever the answer is already yes. An instructor who connected last week should open this on
 * the course list, not on a button they have no reason to press.
 *
 * Hosted by both course lists — the instructor/student page and the admin page — which is why
 * the OAuth return path is captured from the host page rather than fixed here. See
 * {@link returnBasePath}.
 *
 * Both roles drive the same three steps; only the wording differs. An instructor imports a course
 * they teach into EngE-AI, a student joins one their instructor already imported, and the server
 * decides which of those happened from the caller's Canvas enrollment. Nothing here decides
 * anything about authorization.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-14
 * @description: Canvas account connection and course import/join from course selection.
 */

import { ModalOverlay, showErrorModal, showSuccessModal } from '../ui/modal-overlay.js';

/** One row from `GET /api/lms/canvas/available-courses`. */
interface CanvasCourseOption {
    canvasCourseId: string;
    name: string;
    code: string;
    role: 'teacher' | 'student';
    connected: boolean;
    engeAiCourseId?: string;
}

/** `POST /api/lms/canvas/connect-course` response body. */
interface ConnectCanvasCourseResult {
    status: 'imported' | 'joined' | 'awaiting_instructor';
    courseId?: string;
    courseName?: string;
    message: string;
}

/**
 * Marks a return trip from Canvas OAuth so the modal can reopen where the user left off.
 *
 * Canvas navigates the whole page away and back, which would otherwise drop the instructor on a
 * blank course list with no sign that anything happened. The value travels in `returnTo`, which
 * the LMS package validates as a local absolute path.
 */
const RETURN_MARKER = 'canvas';
const RETURN_MARKER_VALUE = 'connected';
const RETURN_PERIOD_PARAM = 'canvasPeriod';

/**
 * The page Canvas should hand the browser back to. Captured on load, not hardcoded.
 *
 * Returning every user to `/course-selection` would silently break the admin page: the server
 * redirects an admin off that path to `/admin/course-selection`, and a redirect drops the query
 * string with it. The marker and the period would be gone by the time the page ran, so the picker
 * would never reopen and the round trip would look like it had simply failed.
 */
let returnBasePath = '/course-selection';

/**
 * Builds the path Canvas should return the browser to after authorization.
 *
 * The academic period is carried across the round trip because it is only known to the button
 * that opened step 1, and the page is destroyed and rebuilt in between. Without it, an imported
 * course would land in no period at all.
 */
function buildReturnPath(academicPeriodId?: string): string {
    const params = new URLSearchParams({ [RETURN_MARKER]: RETURN_MARKER_VALUE });
    if (academicPeriodId) {
        params.set(RETURN_PERIOD_PARAM, academicPeriodId);
    }
    return `${returnBasePath}?${params.toString()}`;
}

/** Whether this deployment has Canvas configured at all. Resolved once, on load. */
let canvasEnabled = false;

/** Reloads the course list after a successful connect, injected to avoid a circular import. */
let reloadCourses: (() => Promise<void>) | null = null;

/**
 * initCanvasConnect — probes Canvas availability and wires the return-from-OAuth path.
 *
 * A `404`-equivalent — Canvas absent from `/api/lms/status`, or present and disabled — means this
 * institution has no Canvas credentials configured, so nothing is rendered. Advertising a
 * connection the deployment cannot make is worse than omitting it.
 *
 * @param onConnected - called after a successful connect so the caller can refresh its list
 * @returns Whether Canvas is enabled, so the caller knows whether to render the button
 */
export async function initCanvasConnect(onConnected: () => Promise<void>): Promise<boolean> {
    reloadCourses = onConnected;
    // Same-origin by construction — `pathname` is this page's own path, never user input.
    returnBasePath = window.location.pathname || returnBasePath;

    try {
        const response = await fetch('/api/lms/status', { credentials: 'same-origin' });
        if (!response.ok) {
            return false;
        }
        const status = await response.json();
        canvasEnabled = status?.providers?.canvas?.enabled === true;
    } catch {
        // A deployment without the LMS routes mounted is a normal configuration, not an error.
        canvasEnabled = false;
    }

    if (canvasEnabled && returnedFromCanvasOAuth()) {
        const academicPeriodId =
            new URLSearchParams(window.location.search).get(RETURN_PERIOD_PARAM) ?? undefined;
        // Drop the marker before reopening so a later refresh does not reopen the modal again.
        window.history.replaceState({}, '', returnBasePath);
        void openCanvasConnectModal(academicPeriodId);
    }

    return canvasEnabled;
}

/** True when the current URL carries the post-OAuth marker set by {@link buildReturnPath}. */
function returnedFromCanvasOAuth(): boolean {
    return new URLSearchParams(window.location.search).get(RETURN_MARKER) === RETURN_MARKER_VALUE;
}

/** Whether the Canvas button should be rendered. Call only after {@link initCanvasConnect}. */
export function isCanvasEnabled(): boolean {
    return canvasEnabled;
}

/**
 * openCanvasConnectModal — the entry point behind the "Connect to Canvas" button.
 *
 * Fetches the user's Canvas courses first, because that request doubles as the connection check:
 * the LMS package answers `401` with a `connectUrl` when no usable credential is stored, which is
 * exactly the "you need to connect first" case and needs no separate probe.
 *
 * @param academicPeriodId - period an imported course should land in; ignored for students, who
 * join the course their instructor already placed in a period.
 */
export async function openCanvasConnectModal(academicPeriodId?: string): Promise<void> {
    try {
        const response = await fetch('/api/lms/canvas/available-courses', {
            credentials: 'same-origin',
        });

        if (response.status === 401) {
            const body = await response.json().catch(() => ({}));
            await showConnectAccountStep(body?.connectUrl, academicPeriodId);
            return;
        }

        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body?.error ?? 'Could not reach Canvas');
        }

        const body = await response.json();
        await showCoursePickerStep((body.courses ?? []) as CanvasCourseOption[], academicPeriodId);
    } catch (error) {
        await showErrorModal(
            'Canvas',
            error instanceof Error ? error.message : 'Could not reach Canvas. Try again shortly.'
        );
    }
}

/**
 * Step 1 of 2 — send the user to Canvas to authorize EngE-AI.
 *
 * Only reached when no usable credential is stored. The `connectUrl` comes from the LMS package
 * rather than being built here, so token handling and the OAuth base path stay its concern.
 */
async function showConnectAccountStep(
    connectUrl: unknown,
    academicPeriodId?: string
): Promise<void> {
    if (typeof connectUrl !== 'string' || !connectUrl.startsWith('/')) {
        await showErrorModal(
            'Canvas',
            'Canvas is not available right now. Please contact your course administrator.'
        );
        return;
    }

    const modal = new ModalOverlay();
    const content = document.createElement('div');
    content.className = 'canvas-connect-modal';

    const step = document.createElement('p');
    step.className = 'canvas-connect-step';
    step.textContent = 'Step 1 of 2 · Connect your account';

    const explanation = document.createElement('p');
    explanation.textContent =
        'EngE-AI will open Canvas so you can sign in and approve access. '
    explanation.style.marginBottom = '1rem';

    const actions = document.createElement('div');
    actions.className = 'admin-modal-actions';
    actions.style.marginTop = '1.25rem';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'retry-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => modal.close('cancel'));

    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className = 'create-new-course-btn';
    continueBtn.textContent = 'Continue to Canvas';
    continueBtn.addEventListener('click', () => {
        modal.close('success');
        // `connectUrl` already carries a `returnTo` pointing at the JSON endpoint that issued the
        // 401. Appending a second one makes `req.query.returnTo` an array, which the package
        // rejects as non-string and silently replaces with `/` — dropping the user on the home
        // page. Overwrite the existing parameter instead of adding to it.
        const loginUrl = new URL(connectUrl, window.location.origin);
        loginUrl.searchParams.set('returnTo', buildReturnPath(academicPeriodId));
        window.location.href = `${loginUrl.pathname}${loginUrl.search}`;
    });

    actions.append(cancelBtn, continueBtn);
    content.append(step, explanation, actions);

    await modal.show({
        type: 'custom',
        title: 'Connect to Canvas',
        content,
        showCloseButton: true,
        closeOnOverlayClick: true,
        maxWidth: '480px',
    });
}

/**
 * Step 2 of 2 — choose which Canvas course to connect.
 *
 * Courses EngE-AI already has are marked rather than hidden. A student seeing "already on
 * EngE-AI" next to a course understands why it is selectable, and a student seeing a course
 * without that mark understands the wait is on their instructor, not on them.
 */
async function showCoursePickerStep(
    courses: CanvasCourseOption[],
    academicPeriodId?: string
): Promise<void> {
    const isTeacher = courses.some((course) => course.role === 'teacher');

    if (courses.length === 0) {
        await showErrorModal(
            'Connect to Canvas',
            isTeacher
                ? 'Canvas does not list you as an instructor for any courses.'
                : 'Canvas does not list you as enrolled in any courses.'
        );
        return;
    }

    const modal = new ModalOverlay();
    const content = document.createElement('div');
    content.className = 'canvas-connect-modal';

    const step = document.createElement('p');
    step.className = 'canvas-connect-step';
    step.textContent = 'Step 2 of 2 · Choose the course';

    const instructions = document.createElement('p');
    instructions.textContent = isTeacher
        ? 'Select the Canvas course you want to add to EngE-AI:'
        : 'Select the Canvas course you want to join on EngE-AI:';
    instructions.style.marginBottom = '1rem';

    const select = document.createElement('select');
    select.className = 'admin-modal-input';
    select.style.width = '100%';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a course…';
    select.appendChild(placeholder);

    for (const course of courses) {
        const option = document.createElement('option');
        option.value = course.canvasCourseId;
        const label = course.code ? `${course.code} — ${course.name}` : course.name;
        option.textContent = course.connected ? `${label} (already on EngE-AI)` : label;
        select.appendChild(option);
    }

    const errorText = document.createElement('p');
    errorText.className = 'canvas-connect-error';
    errorText.style.display = 'none';
    errorText.style.marginTop = '0.75rem';
    errorText.setAttribute('role', 'alert');

    const actions = document.createElement('div');
    actions.className = 'admin-modal-actions';
    actions.style.marginTop = '1.25rem';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'retry-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => modal.close('cancel'));

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'create-new-course-btn';
    submitBtn.textContent = isTeacher ? 'Add to EngE-AI' : 'Join course';
    submitBtn.disabled = true;

    select.addEventListener('change', () => {
        submitBtn.disabled = !select.value;
        errorText.style.display = 'none';
    });

    submitBtn.addEventListener('click', async () => {
        if (!select.value) {
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Connecting…';
        errorText.style.display = 'none';

        try {
            const result = await connectCourse(select.value, academicPeriodId);
            modal.close('success');
            await announceResult(result);
        } catch (error) {
            errorText.textContent =
                error instanceof Error ? error.message : 'Could not connect that course.';
            errorText.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = isTeacher ? 'Add to EngE-AI' : 'Join course';
        }
    });

    actions.append(cancelBtn, submitBtn);
    content.append(step, instructions, select, errorText, actions);

    await modal.show({
        type: 'custom',
        title: 'Connect to Canvas',
        content,
        showCloseButton: true,
        closeOnOverlayClick: true,
        maxWidth: '520px',
    });
}

/** POSTs the selection and surfaces the server's message on failure. */
async function connectCourse(
    canvasCourseId: string,
    academicPeriodId?: string
): Promise<ConnectCanvasCourseResult> {
    const response = await fetch('/api/lms/canvas/connect-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ canvasCourseId, academicPeriodId }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body?.error ?? 'Could not connect that course.');
    }
    return body as ConnectCanvasCourseResult;
}

/**
 * Reports the outcome and refreshes the list when something actually changed.
 *
 * `awaiting_instructor` is not an error — the student did everything right and the course simply
 * is not on EngE-AI yet — so it reads as information rather than a failure.
 */
async function announceResult(result: ConnectCanvasCourseResult): Promise<void> {
    if (result.status === 'awaiting_instructor') {
        await showErrorModal('Not available yet', result.message);
        return;
    }

    await showSuccessModal('Connected to Canvas', result.message);
    if (reloadCourses) {
        await reloadCourses();
    }
}
