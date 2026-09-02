// public/scripts/entry/canvas-connect.ts

/**
 * canvas-connect.ts
 *
 * "Connect to Canvas" flow on the course selection page.
 *
 * Answers two questions in sequence — are you connected, and which course — and skips the first
 * whenever the answer is already yes. An instructor who connected last week should open this on
 * the course list, not on a button they have no reason to press.
 *
 * Hosted by both course lists — the instructor/student page and the admin page — which is why
 * the OAuth return path is captured from the host page rather than fixed here. See
 * {@link returnBasePath}.
 *
 * Both roles connect an account and choose a course; only the wording differs. An instructor
 * imports a course they teach into EngE-AI, a student joins one their instructor already
 * imported, and the server decides which of those happened from the caller's Canvas enrollment.
 * Nothing here decides anything about authorization.
 *
 * An import also asks for the academic term the new course belongs to. A student joining, or an
 * instructor joining a course somebody already imported, never sees that step: the term is
 * already assigned.
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

/** One row from `GET /api/academic-periods/selectable`. */
interface AcademicTermOption {
    id: string;
    title: string;
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
 * Only the marker travels. The page is destroyed and rebuilt across the round trip, but nothing
 * chosen before step 1 needs to survive it — the term is asked for after the course, on a page
 * that has been rebuilt by then.
 */
function buildReturnPath(): string {
    const params = new URLSearchParams({ [RETURN_MARKER]: RETURN_MARKER_VALUE });
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
        // Drop the marker before reopening so a later refresh does not reopen the modal again.
        window.history.replaceState({}, '', returnBasePath);
        void openCanvasConnectModal();
    }

    return canvasEnabled;
}

/** True when the current URL carries the post-OAuth marker set by {@link buildReturnPath}. */
function returnedFromCanvasOAuth(): boolean {
    return new URLSearchParams(window.location.search).get(RETURN_MARKER) === RETURN_MARKER_VALUE;
}

/**
 * openCanvasConnectModal — the entry point behind the "Connect to Canvas" button.
 *
 * Fetches the user's Canvas courses first, because that request doubles as the connection check:
 * the LMS package answers `401` with a `connectUrl` when no usable credential is stored, which is
 * exactly the "you need to connect first" case and needs no separate probe.
 */
export async function openCanvasConnectModal(): Promise<void> {
    try {
        const response = await fetch('/api/lms/canvas/available-courses', {
            credentials: 'same-origin',
        });

        if (response.status === 401) {
            const body = await response.json().catch(() => ({}));
            await showConnectAccountStep(body?.connectUrl);
            return;
        }

        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body?.error ?? 'Could not reach Canvas');
        }

        const body = await response.json();
        await showCoursePickerStep((body.courses ?? []) as CanvasCourseOption[]);
    } catch (error) {
        await showErrorModal(
            'Canvas',
            error instanceof Error ? error.message : 'Could not reach Canvas. Try again shortly.'
        );
    }
}

/**
 * Step 1 — send the user to Canvas to authorize EngE-AI.
 *
 * Only reached when no usable credential is stored. The `connectUrl` comes from the LMS package
 * rather than being built here, so token handling and the OAuth base path stay its concern.
 */
async function showConnectAccountStep(connectUrl: unknown): Promise<void> {
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
    // No total here: whether this flow runs to two steps or three depends on the Canvas role,
    // which is not known until the course list comes back.
    step.textContent = 'Step 1 · Connect your account';

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
        loginUrl.searchParams.set('returnTo', buildReturnPath());
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
 * Step 2 — choose which Canvas course to connect.
 *
 * The last step for everyone except an instructor importing a course EngE-AI does not have yet;
 * that case continues to {@link showTermPickerStep}, which is why the button reads "Continue"
 * there and commits ("Add to EngE-AI" / "Join course") everywhere else.
 *
 * Courses EngE-AI already has are marked rather than hidden. A student seeing "already on
 * EngE-AI" next to a course understands why it is selectable, and a student seeing a course
 * without that mark understands the wait is on their instructor, not on them.
 */
async function showCoursePickerStep(
    courses: CanvasCourseOption[],
    preselectedCanvasCourseId?: string
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
    // The total depends on the course, not the account: a second instructor joining a course a
    // colleague already imported stops here, while importing a new one continues to the term.
    // Printing a total before a course is chosen would tell half of them the wrong number.
    step.textContent = 'Step 2 · Choose the course';

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

    if (preselectedCanvasCourseId) {
        select.value = preselectedCanvasCourseId;
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

    const importsNewCourse = (canvasCourseId: string): boolean => {
        const selected = courses.find((course) => course.canvasCourseId === canvasCourseId);
        return selected?.role === 'teacher' && !selected.connected;
    };

    const stepLabel = (canvasCourseId: string): string => {
        if (!canvasCourseId) {
            return 'Step 2 · Choose the course';
        }
        return `Step 2 of ${importsNewCourse(canvasCourseId) ? 3 : 2} · Choose the course`;
    };

    const submitLabel = (canvasCourseId: string): string => {
        if (importsNewCourse(canvasCourseId)) {
            return 'Continue';
        }
        return isTeacher ? 'Add to EngE-AI' : 'Join course';
    };

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'create-new-course-btn';
    submitBtn.textContent = submitLabel(select.value);
    submitBtn.disabled = !select.value;
    // Arriving back from step 3 with a course already selected, the header owes the total too.
    step.textContent = stepLabel(select.value);

    select.addEventListener('change', () => {
        submitBtn.disabled = !select.value;
        submitBtn.textContent = submitLabel(select.value);
        step.textContent = stepLabel(select.value);
        errorText.style.display = 'none';
    });

    submitBtn.addEventListener('click', async () => {
        if (!select.value) {
            return;
        }

        // A new import needs the term before anything is written, so hand off to step 3 rather
        // than connecting here. Joining an existing course skips it — that course is already
        // filed under a period, and this instructor is not the one who gets to move it.
        if (importsNewCourse(select.value)) {
            const chosenCourseId = select.value;
            modal.close('success');
            await showTermPickerStep(courses, chosenCourseId);
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Connecting…';
        errorText.style.display = 'none';

        try {
            const result = await connectCourse(select.value);
            modal.close('success');
            await announceResult(result);
        } catch (error) {
            errorText.textContent =
                error instanceof Error ? error.message : 'Could not connect that course.';
            errorText.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = submitLabel(select.value);
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

/**
 * Step 3 of 3 — choose the academic term the imported course belongs to.
 *
 * Instructor imports only. Canvas has its own notion of a term and EngE-AI has academic periods;
 * the two are neither named nor dated alike, so the person who knows which period this offering
 * belongs to says so, once, before the course exists. Getting it wrong here is recoverable — an
 * admin can move the course.
 *
 * Nothing is pre-selected. The flow is entered from a page-level button that carries no term
 * with it, and defaulting to the newest term would let an instructor importing next term's
 * offering commit the wrong answer by pressing straight through.
 *
 * @param courses - the full picker list, kept so "Back" can rebuild step 2 as it was
 * @param canvasCourseId - the course chosen in step 2
 */
async function showTermPickerStep(
    courses: CanvasCourseOption[],
    canvasCourseId: string
): Promise<void> {
    const terms = await fetchSelectableTerms();

    // A deployment with no periods to choose from should not be blocked on choosing one. The
    // server files the course under the default period when none is named, which is exactly the
    // behaviour this flow had before the step existed.
    if (terms.length === 0) {
        await submitConnect(canvasCourseId);
        return;
    }

    const modal = new ModalOverlay();
    const content = document.createElement('div');
    content.className = 'canvas-connect-modal';

    const step = document.createElement('p');
    step.className = 'canvas-connect-step';
    step.textContent = 'Step 3 of 3 · Choose the academic term';

    const instructions = document.createElement('p');
    instructions.textContent = 'Select the academic term this course is being offered in:';
    instructions.style.marginBottom = '1rem';

    // Labelled in place rather than with a <label>: the stylesheet has no visually-hidden
    // utility, and the visible instruction above already carries the wording.
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Academic term');
    select.className = 'admin-modal-input';
    select.style.width = '100%';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a term…';
    select.appendChild(placeholder);

    for (const term of terms) {
        const option = document.createElement('option');
        option.value = term.id;
        option.textContent = term.title;
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

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'retry-btn';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', () => {
        modal.close('cancel');
        void showCoursePickerStep(courses, canvasCourseId);
    });

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'create-new-course-btn';
    submitBtn.textContent = 'Add to EngE-AI';
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
        backBtn.disabled = true;
        submitBtn.textContent = 'Connecting…';
        errorText.style.display = 'none';

        try {
            const result = await connectCourse(canvasCourseId, select.value);
            modal.close('success');
            await announceResult(result);
        } catch (error) {
            errorText.textContent =
                error instanceof Error ? error.message : 'Could not connect that course.';
            errorText.style.display = 'block';
            submitBtn.disabled = false;
            backBtn.disabled = false;
            submitBtn.textContent = 'Add to EngE-AI';
        }
    });

    actions.append(backBtn, submitBtn);
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

/**
 * The academic terms an imported course may be assigned to, newest first.
 *
 * A failure here is not fatal to the import: an empty list sends the flow down the pre-existing
 * "server picks the default period" path rather than stranding the instructor on an error over a
 * field they could not fill in anyway.
 */
async function fetchSelectableTerms(): Promise<AcademicTermOption[]> {
    try {
        const response = await fetch('/api/academic-periods/selectable', {
            credentials: 'same-origin',
        });
        if (!response.ok) {
            return [];
        }
        const body = await response.json();
        const terms = Array.isArray(body?.data) ? body.data : [];
        return terms.filter(
            (term: AcademicTermOption) =>
                typeof term?.id === 'string' && typeof term?.title === 'string'
        );
    } catch {
        return [];
    }
}

/** Connects without a term step, reporting failure as a modal because no form is left to hold it. */
async function submitConnect(canvasCourseId: string): Promise<void> {
    try {
        await announceResult(await connectCourse(canvasCourseId));
    } catch (error) {
        await showErrorModal(
            'Connect to Canvas',
            error instanceof Error ? error.message : 'Could not connect that course.'
        );
    }
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
