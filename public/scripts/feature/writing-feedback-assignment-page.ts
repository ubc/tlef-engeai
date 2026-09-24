// public/scripts/feature/writing-feedback-assignment-page.ts
/**
 * Writing Feedback assignment page — one assignment's submissions and the actions on them
 *
 * Opened from an assignment card on the queue. Everything that belongs to a single
 * assignment lives here rather than in a panel inside the queue: its submission list, its
 * rubric link, Sync submissions, batch generation, and manual intake. A course with many
 * assignments therefore reads as a short list, and a long submission list gets a whole page.
 *
 * @author: EngE-AI Team
 * @date: 2026-09-17
 * @version: 1.0.0
 * @description: Renders and refreshes the page for one writing assignment's submissions.
 */

import { showConfirmModal } from '../ui/modal-overlay.js';
import { showSuccessToast, showToast } from '../ui/toast-notification.js';
import {
    Assignment,
    CanvasAccountMismatchError,
    CanvasAuthRequiredError,
    CanvasSyncResult,
    Submission,
    assignmentOriginText,
    baseUrl,
    canvasOutcomeNotes,
    chip,
    closeActionPanel,
    confirmDiscardDirty,
    createBackBar,
    createButton,
    createIconButton,
    createText,
    createZoomControl,
    element,
    field,
    formatDate,
    handleActionError,
    inputControl,
    isLateSubmission,
    jsonRequest,
    openActionPanel,
    refreshIcons,
    request,
    returnToLanding,
    setQueryState,
    setView,
    setWorkspaceMessage,
    state,
    textAreaControl,
    views
} from './writing-feedback-shared.js';
import { assertNotWritingFeedbackDemoMode } from './writing-feedback-demo-mode.js';
import { connectUrlReturningTo } from './writing-feedback-canvas-connect.js';
import { renderReplacementNotice } from './writing-feedback-replacement.js';
import { followGeneration, renderBatchBar, renderBatchStart, statusChip, stopFollowingGeneration } from './writing-feedback-batch.js';

/** Mount the shared setup panel is moved into while this page is the one on screen. */
const ACTION_MOUNT_ID = 'wf-assignment-action-mount';

/**
 * openAssignmentPage - opens one assignment's submission page
 *
 * Also serves as this page's refresh: an action that changes the list calls it again, and
 * because the address is already this page, nothing is added to browser history.
 *
 * @param assignmentId - Internal assignment identifier scoped to the active course
 * @throws Error when the assignment or its submissions cannot be loaded
 */
export async function openAssignmentPage(assignmentId: string): Promise<void> {
    if (!(await confirmDiscardDirty('setup')) || !(await confirmDiscardDirty('review'))) return;
    state.reviewDirty = false;
    // The panel rests outside this view while closed, so replacing the page below cannot
    // take it with it.
    await closeActionPanel(false);
    stopFollowingGeneration();
    state.activeAssignmentId = assignmentId;
    setQueryState({ wfView: 'assignment', wfAssignment: assignmentId, wfSubmission: null }, 'push');
    setView('assignment');
    const root = element<HTMLDivElement>('wf-view-assignment');
    root.replaceChildren(createText('p', 'Loading submissions…', 'wf-muted-note'));

    if (!state.assignments.length) state.assignments = await request<Assignment[]>('/assignments');
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!assignment) {
        // A link to an assignment that has since been deleted. There is no header to draw and
        // so no page to put a back button on, so the queue is opened instead and told to say
        // why; the message is set after it renders, because opening a view clears the last one.
        await views.showLanding();
        setWorkspaceMessage('That assignment no longer exists. It may have been deleted.', 'warning');
        return;
    }
    state.currentAssignment = assignment;

    let submissions: Submission[];
    try {
        submissions = await request<Submission[]>(`/submissions?assignmentId=${encodeURIComponent(assignmentId)}`);
    } catch (error) {
        // The page still has to offer a way out and a way to try again, so it renders its own
        // frame around the failure rather than leaving an empty view behind.
        renderPage(root, assignment, null);
        throw error;
    }
    if (state.activeAssignmentId !== assignmentId) return;
    renderPage(root, assignment, submissions);
}

/**
 * renderPage - draws the whole page for one assignment
 *
 * @param root - Assignment view container, replaced wholesale
 * @param assignment - Assignment being worked in
 * @param submissions - Its submissions, or null when they could not be loaded
 */
function renderPage(root: HTMLDivElement, assignment: Assignment, submissions: Submission[] | null): void {
    root.replaceChildren();
    root.append(createBackBar(async () => {
        if (!(await confirmDiscardDirty('setup'))) return;
        state.panelDirty = false;
        await returnToLanding();
    }));
    const refresh = async (): Promise<void> => { await openAssignmentPage(assignment.id); };
    root.append(renderHeader(assignment, submissions, refresh));

    const actionMount = document.createElement('div');
    actionMount.id = ACTION_MOUNT_ID;
    root.append(actionMount);

    const list = document.createElement('div');
    list.className = 'wf-submission-list';
    root.append(list);

    if (!submissions) {
        const errorRow = document.createElement('div');
        errorRow.className = 'wf-submission-row';
        errorRow.append(
            createText('p', 'Submissions could not be loaded. Try again.', 'wf-muted-note'),
            createButton('Retry', 'secondary', async () => openAssignmentPage(assignment.id))
        );
        list.append(errorRow);
        refreshIcons();
        return;
    }

    if (submissions.length) {
        // Rendered whatever the run state is, so the poll has somewhere to report into; it
        // shows itself once something is generating.
        list.append(renderBatchBar(assignment, submissions, { onChanged: refresh }));
    } else {
        const emptyWrap = document.createElement('div');
        emptyWrap.className = 'wf-submission-row';
        emptyWrap.append(createText('p', 'No submissions yet.', 'wf-muted-note'));
        list.append(emptyWrap);
    }

    submissions.forEach((submission) => list.append(...renderSubmissionRow(assignment, submission)));

    const footer = document.createElement('div');
    footer.className = 'wf-add-submission-row';
    footer.append(createButton('+ Add submission (manually)', 'quiet', async () => showManualImport(assignment)));
    list.append(footer);

    refreshIcons();
    followGeneration(assignment, list, submissions);
}

/**
 * renderHeader - the assignment's own name, what is known about it, and its actions
 *
 * @param assignment - Assignment being worked in
 * @param submissions - Its submissions, whose length is the authoritative count here; the
 *                      stored count is used when they could not be loaded
 * @param refresh - Reopens the page once a batch run starts or stops
 * @returns Detached page header
 */
function renderHeader(assignment: Assignment, submissions: Submission[] | null, refresh: () => Promise<void>): HTMLElement {
    const header = document.createElement('header');
    header.className = 'wf-assignment-page-header';

    const heading = createText('h1', assignment.title, 'wf-assignment-page-title');
    // Writing is the default kind, so only the exception is labelled.
    if (assignment.isLabReport) heading.append(chip('Lab report', 'blue'));

    const meta = document.createElement('p');
    meta.className = 'wf-assignment-meta';
    const count = submissions?.length ?? assignment.submissionCount ?? 0;
    meta.append(
        createText('span', assignmentOriginText(assignment)),
        createText('span', `${count} submission${count === 1 ? '' : 's'}`)
    );
    // A deadline is imported from Canvas whenever the assignment carries one, so its absence
    // means Canvas has none set; saying "No deadline" would spend a segment on that.
    if (assignment.dueAt) meta.append(createText('span', `Deadline ${formatDate(assignment.dueAt, true)}`));

    const identity = document.createElement('div');
    identity.className = 'wf-assignment-page-identity';
    identity.append(heading, meta);

    // All three act on the assignment as a whole, so they sit together, in the workspace's
    // white-pill header treatment. Assigning the class replaces the .wf-button styling
    // createButton gives them, the way the batch action has always styled itself.
    const controls = document.createElement('div');
    controls.className = 'wf-assignment-page-actions';
    const canManageRubric = Boolean(state.workspace?.permissions.canManageRubric);
    // Nothing to generate for until there is at least one submission.
    if (submissions?.length) controls.append(renderBatchStart(assignment, { onChanged: refresh }));
    // Only a Canvas-linked assignment has somewhere to pull new submissions from.
    if (assignment.canvasAssignmentId) {
        const sync = createButton('Sync submissions', 'secondary', async () => syncAssignment(assignment), false, 'refresh-cw');
        sync.title = 'Import submissions added or resubmitted in Canvas since the last import';
        sync.className = 'wf-header-btn';
        controls.append(sync);
    }
    const rubric = createButton(
        canManageRubric ? 'Edit rubric' : 'View rubric',
        'secondary',
        async () => views.showRubric(assignment.id),
        false,
        canManageRubric ? 'edit-3' : 'eye'
    );
    rubric.className = 'wf-header-btn';
    controls.append(rubric);

    header.append(identity, controls);
    return header;
}

/**
 * renderSubmissionRow - one submission, and the resubmission notice that belongs beside it
 *
 * @param assignment - Parent assignment, for the late-submission comparison
 * @param submission - Submission to render
 * @returns The row, followed by a replacement notice when a newer attempt is waiting
 */
function renderSubmissionRow(assignment: Assignment, submission: Submission): HTMLElement[] {
    const row = document.createElement('div');
    row.className = 'wf-submission-row';
    row.dataset.submissionId = submission.id;
    const late = isLateSubmission(submission, assignment);

    // The row is the object, so the row opens it — a far larger target than a button would
    // be, with the same mouse/Enter/Space contract. The delete control inside stops its own
    // propagation, so it cannot open the review.
    const rowLabel = submission.studentLabel || 'Unlabelled student';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', `Open submission for ${rowLabel}`);
    row.addEventListener('click', () => void views.showReview(submission.id).catch(handleActionError));
    row.addEventListener('keydown', (event) => {
        if (event.target !== row) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void views.showReview(submission.id).catch(handleActionError);
        }
    });

    const info = document.createElement('div');
    info.className = 'wf-submission-info';
    info.append(createText('strong', rowLabel));
    const rowMeta = document.createElement('span');
    rowMeta.className = 'wf-submission-meta';
    if (submission.submittedAt) rowMeta.append(createText('span', `Submitted ${formatDate(submission.submittedAt, true)}`));
    if (late) rowMeta.append(createText('span', 'Late', 'wf-late-flag'));
    rowMeta.append(createText('span', `Attempt ${submission.attempt}`), statusChip(submission));
    info.append(rowMeta);

    const actions = document.createElement('div');
    actions.className = 'wf-submission-actions';
    const label = submission.studentLabel || 'this submission';
    actions.append(
        createIconButton('trash-2', `Delete submission for ${label}`, 'danger', async () => {
            const extraWarning = submission.status === 'released'
                ? ' This submission was already released to the student; deleting it removes only the local record and cannot recall the release.'
                : '';
            const result = await showConfirmModal(
                'Delete submission',
                `Are you sure you want to delete "${label}"? This action cannot be undone.${extraWarning}`,
                'Delete',
                'Cancel',
                'danger'
            );
            if (result.action !== 'delete') return;
            await jsonRequest(`/submissions/${encodeURIComponent(submission.id)}`, 'DELETE');
            row.remove();
            const current = state.assignments.find((item) => item.id === assignment.id);
            if (current && typeof current.submissionCount === 'number') {
                current.submissionCount = Math.max(0, current.submissionCount - 1);
            }
            showSuccessToast('Submission deleted.');
        })
    );
    // Affordance only: the row carries the click, so this must not take focus or be read
    // out as a second control.
    const openIcon = document.createElement('span');
    openIcon.className = 'wf-submission-open-icon';
    openIcon.setAttribute('aria-hidden', 'true');
    openIcon.innerHTML = '<i data-feather="chevron-right"></i>';
    actions.append(openIcon);
    row.append(info, actions);

    if (!submission.pendingReplacement) return [row];
    // A sibling rather than a child: the row is itself a button, and these are separate controls.
    return [row, renderReplacementNotice(submission, {
        onResolved: async () => openAssignmentPage(assignment.id)
    })];
}

/**
 * syncAssignment - imports submissions added or resubmitted in Canvas since the last import
 *
 * New students join the list. A resubmission from a student already in the list is held
 * beside their submission, and the row asks staff which attempt to keep.
 *
 * @param assignment - Canvas-linked assignment to sync
 */
async function syncAssignment(assignment: Assignment): Promise<void> {
    let result: CanvasSyncResult;
    try {
        result = await jsonRequest<CanvasSyncResult>(`/assignments/${encodeURIComponent(assignment.id)}/canvas-sync`, 'POST', {});
    } catch (error) {
        // Canvas authorization is fixed by a link, not a retry, so offer it directly.
        if (error instanceof CanvasAuthRequiredError || error instanceof CanvasAccountMismatchError) {
            const choice = await showConfirmModal('Connect Canvas', `${error.message} Connect Canvas, then sync again.`, 'Connect Canvas', 'Cancel');
            if (choice.action === 'connect-canvas') {
                const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                window.location.href = connectUrlReturningTo(error.connectUrl, here);
            }
            return;
        }
        throw error;
    }

    // The sync changes the assignment record as well as its submissions, so the page is
    // rebuilt from freshly read assignments rather than from the copy in memory.
    state.assignments = await request<Assignment[]>('/assignments');
    await openAssignmentPage(assignment.id);
    const notes = [`${result.importedCount} new submission${result.importedCount === 1 ? '' : 's'} imported`, ...canvasOutcomeNotes(result)];
    const summary = `${notes.join('; ')}.`;
    if (result.failedCount > 0) showToast(summary, 8000, 'top-right', 'error');
    else showSuccessToast(summary, 6000);
}

/**
 * showManualImport - opens the inline form that adds one submission by hand
 *
 * @param assignment - Assignment the submission is added to
 */
async function showManualImport(assignment: Assignment): Promise<void> {
    if (!(await confirmDiscardDirty('setup'))) return;
    state.panelDirty = false;
    const content = openActionPanel(`Add a submission — ${assignment.title}`, ACTION_MOUNT_ID);
    content.append(createText(
        'p',
        'Paste verified text, or upload a supported file. Uploaded files always enter a verification step before feedback generation. Student writing is always content, never an instruction to the model.',
        'wf-panel-intro'
    ));

    const form = document.createElement('form');
    const modeFieldset = document.createElement('fieldset');
    modeFieldset.className = 'wf-fieldset';
    modeFieldset.append(createText('legend', 'Submission source'));
    const modeRow = document.createElement('div');
    modeRow.className = 'wf-button-row';
    const textRadio = inputControl('text', 'radio');
    textRadio.name = 'wf-intake-mode';
    textRadio.id = 'wf-intake-mode-text';
    textRadio.checked = true;
    const fileRadio = inputControl('file', 'radio');
    fileRadio.name = 'wf-intake-mode';
    fileRadio.id = 'wf-intake-mode-file';
    const textLabel = document.createElement('label');
    textLabel.htmlFor = textRadio.id;
    textLabel.textContent = 'Paste text';
    const fileLabel = document.createElement('label');
    fileLabel.htmlFor = fileRadio.id;
    fileLabel.textContent = 'Upload file';
    modeRow.append(textRadio, textLabel, fileRadio, fileLabel);
    modeFieldset.append(modeRow);
    form.append(modeFieldset);

    const grid = document.createElement('div');
    grid.className = 'wf-form-grid';
    // The browser collects a course-local learner reference and explicitly warns
    // staff not to enter the institution's protected PUID.
    const studentId = inputControl();
    studentId.required = true;
    studentId.autocomplete = 'off';
    const studentLabel = inputControl();
    studentLabel.autocomplete = 'off';
    const attempt = inputControl('1', 'number');
    attempt.min = '1';
    attempt.step = '1';
    grid.append(
        field('Internal learner reference', studentId, 'Use a course-local code. Do not enter a PUID.'),
        field('Staff-visible student label', studentLabel, 'Optional; visible only in this staff workspace.'),
        field('Attempt', attempt)
    );

    const text = textAreaControl('', 10);
    text.classList.add('wf-intake-text');
    const textField = field('Verified student submission', text, 'Paste the complete submission exactly as it should be evaluated.', true);
    const zoomRow = document.createElement('div');
    zoomRow.className = 'wf-field-toolbar';
    zoomRow.append(createZoomControl(text));
    textField.insertBefore(zoomRow, text);
    const file = inputControl('', 'file');
    file.accept = '.txt,.md,.markdown,.docx,.pdf,.html,.htm';
    const fileField = field('Student file', file, 'TXT, DOCX, text-based PDF, or HTML. Scanned handwriting remains a later verified-OCR workflow.', true);
    fileField.hidden = true;
    grid.append(textField, fileField);
    form.append(grid);

    const syncMode = () => {
        const isFile = fileRadio.checked;
        textField.hidden = isFile;
        fileField.hidden = !isFile;
        text.required = !isFile;
        file.required = isFile;
    };
    [textRadio, fileRadio].forEach((radio) => radio.addEventListener('change', syncMode));
    syncMode();

    const actions = document.createElement('div');
    actions.className = 'wf-button-row';
    const submit = createButton('Add submission', 'primary', async () => {
        if (!form.reportValidity()) return;
        let stored: Submission;
        // Files use multipart extraction and always return through transcript
        // verification; pasted text uses the JSON path as already-verified content.
        if (fileRadio.checked && file.files?.[0]) {
            // This upload builds its own fetch (FormData, not JSON) so it cannot
            // route through jsonRequest's gate; guard it explicitly instead.
            assertNotWritingFeedbackDemoMode();
            const formData = new FormData();
            formData.append('assignmentId', assignment.id);
            formData.append('studentId', studentId.value);
            formData.append('studentLabel', studentLabel.value);
            formData.append('attempt', attempt.value);
            formData.append('file', file.files[0]);
            const response = await fetch(`${baseUrl()}/submissions/file`, {
                method: 'POST', credentials: 'same-origin', body: formData
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || !body.success) throw new Error(body.error || 'Digital file extraction failed');
            stored = body.data as Submission;
        } else {
            stored = await jsonRequest<Submission>('/submissions', 'POST', {
                assignmentId: assignment.id,
                studentId: studentId.value,
                studentLabel: studentLabel.value,
                attempt: Number(attempt.value),
                text: text.value
            });
        }
        state.panelDirty = false;
        await closeActionPanel(false);
        // The stored count on the assignment record changed, so read it back with the page.
        state.assignments = await request<Assignment[]>('/assignments');
        await openAssignmentPage(assignment.id);
        showSuccessToast(stored.requiresVerification
            ? 'File extracted. Verify its text before generation.'
            : 'Verified text added to the assignment.');
    });
    actions.append(submit, createButton('Cancel', 'quiet', async () => { await closeActionPanel(); }));
    form.append(actions);
    form.addEventListener('input', () => { state.panelDirty = true; });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submit.click();
    });
    content.append(form);
    studentId.focus();
}
