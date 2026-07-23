// public/scripts/feature/writing-feedback.ts
/**
 * Writing Feedback Workspace — entry point and assignment landing view
 *
 * The landing view lists assignment cards (Canvas-imported or manually created).
 * Each card expands into its submission list; opening a submission moves to the
 * review view and "Edit rubric" opens the full-page rubric editor. The rubric and
 * review views live in sibling modules registered through the shared view registry.
 *
 * @author: @rdschrs
 * @date: 2026-07-20
 * @version: 1.0.0
 * @description: Initializes course-scoped state and coordinates assignment, submission, and Canvas intake flows.
 */

import type { activeCourse } from '../types.js';
import { showSuccessToast } from '../ui/toast-notification.js';
import { showDeleteConfirmationModal, showConfirmModal } from '../ui/modal-overlay.js';
import {
    Assignment,
    CanvasAssignment,
    CanvasImportResult,
    CanvasStatus,
    STATUS_LABELS,
    STATUS_TONES,
    Submission,
    WorkspaceContext,
    baseUrl,
    chip,
    confirmDiscardDirty,
    createButton,
    createIconButton,
    createText,
    createZoomControl,
    element,
    field,
    formatDate,
    handleActionError,
    inputControl,
    jsonRequest,
    queryState,
    refreshIcons,
    request,
    setQueryState,
    setView,
    setWorkspaceMessage,
    state,
    textAreaControl,
    views
} from './writing-feedback-shared.js';
import { openRubricPage } from './writing-feedback-rubric.js';
import { openReview } from './writing-feedback-review.js';

// ---------------------------------------------------------------------------
// Landing view
// ---------------------------------------------------------------------------

async function loadLanding(): Promise<void> {
    setView('landing');
    setQueryState({ wfSubmission: null, wfView: null });
    const list = element<HTMLDivElement>('wf-assignment-list');
    list.setAttribute('aria-busy', 'true');
    list.replaceChildren(createText('p', 'Loading assignments…', 'wf-muted-note'));
    state.assignments = await request<Assignment[]>('/assignments');
    renderLanding();
}

function renderLanding(): void {
    const list = element<HTMLDivElement>('wf-assignment-list');
    list.setAttribute('aria-busy', 'false');
    list.replaceChildren();

    if (!state.assignments.length) {
        const empty = document.createElement('div');
        empty.className = 'wf-card';
        empty.append(
            createText('p', 'No assignments yet. Pull writing assignments from Canvas, or create one manually and paste student submissions.', 'wf-muted-note')
        );
        const actions = document.createElement('div');
        actions.className = 'wf-button-row';
        actions.append(
            createButton('Import from Canvas', 'primary', async () => showCanvasImport()),
            createButton('Add assignment (manually)', 'secondary', async () => showAddAssignment())
        );
        empty.append(actions);
        list.append(empty);
        return;
    }

    state.assignments.forEach((assignment) => list.append(renderAssignmentCard(assignment)));
    refreshIcons();

    if (state.expandedAssignmentId && state.assignments.some((assignment) => assignment.id === state.expandedAssignmentId)) {
        void expandAssignment(state.expandedAssignmentId).catch(handleActionError);
    }
}

function renderAssignmentCard(assignment: Assignment): HTMLElement {
    const card = document.createElement('article');
    card.className = 'wf-assignment';
    card.dataset.assignmentId = assignment.id;
    const panelId = `wf-assignment-panel-${assignment.id}`;

    // The expandable card header mirrors a disclosure control: mouse, Enter,
    // and Space all update the same panel and aria-expanded state.
    const header = document.createElement('div');
    header.className = 'wf-assignment-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', String(state.expandedAssignmentId === assignment.id));
    header.setAttribute('aria-controls', panelId);

    const heading = document.createElement('div');
    heading.className = 'wf-assignment-title-group';
    heading.append(createText('h2', assignment.title));
    const meta = document.createElement('p');
    meta.className = 'wf-assignment-meta';
    meta.append(
        createText('span', `Created ${formatDate(assignment.createdAt)}`),
        createText('span', assignment.dueAt ? `Deadline ${formatDate(assignment.dueAt, true)}` : 'No deadline')
    );
    heading.append(meta);

    const controls = document.createElement('div');
    controls.className = 'wf-assignment-controls';
    controls.append(
        chip(assignment.canvasAssignmentId ? 'Canvas import' : 'Manual', assignment.canvasAssignmentId ? 'blue' : 'neutral'),
        chip(`${assignment.submissionCount ?? 0} submissions`, 'green')
    );
    const rubricButton = createButton('Edit rubric', 'secondary', async () => openRubricPage(assignment.id));
    rubricButton.addEventListener('click', (event) => event.stopPropagation());
    controls.append(rubricButton);
    const deleteButton = createIconButton('trash-2', `Delete assignment "${assignment.title}"`, 'danger', async () => {
        const result = await showDeleteConfirmationModal('assignment', assignment.title);
        if (result.action !== 'delete') return;
        await jsonRequest(`/assignments/${encodeURIComponent(assignment.id)}`, 'DELETE');
        state.assignments = state.assignments.filter((item) => item.id !== assignment.id);
        if (state.expandedAssignmentId === assignment.id) state.expandedAssignmentId = null;
        renderLanding();
        showSuccessToast('Assignment deleted.');
    });
    controls.append(deleteButton);
    const expandIcon = document.createElement('span');
    expandIcon.className = 'wf-expand-icon';
    expandIcon.innerHTML = '<i data-feather="chevron-down" aria-hidden="true"></i>';
    controls.append(expandIcon);

    header.append(heading, controls);
    const toggle = () => void toggleAssignmentExpand(assignment.id).catch(handleActionError);
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (event) => {
        if (event.target !== header) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
        }
    });
    card.append(header);

    const panel = document.createElement('div');
    panel.className = 'wf-submission-panel';
    panel.id = panelId;
    panel.hidden = state.expandedAssignmentId !== assignment.id;
    card.append(panel);
    return card;
}

async function toggleAssignmentExpand(assignmentId: string): Promise<void> {
    if (state.expandedAssignmentId === assignmentId) {
        state.expandedAssignmentId = null;
        setQueryState({ wfAssignment: null });
        renderLanding();
        return;
    }
    state.expandedAssignmentId = assignmentId;
    setQueryState({ wfAssignment: assignmentId });
    document.querySelectorAll<HTMLElement>('.wf-submission-panel').forEach((panel) => { panel.hidden = true; });
    document.querySelectorAll<HTMLElement>('.wf-assignment-header').forEach((header) => {
        header.setAttribute('aria-expanded', String(header.getAttribute('aria-controls') === `wf-assignment-panel-${assignmentId}`));
    });
    await expandAssignment(assignmentId);
}

async function expandAssignment(assignmentId: string): Promise<void> {
    const panel = document.getElementById(`wf-assignment-panel-${assignmentId}`);
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!panel || !assignment) return;
    panel.hidden = false;
    panel.replaceChildren(createText('p', 'Loading submissions…', 'wf-muted-note'));
    const submissions = await request<Submission[]>(`/submissions?assignmentId=${encodeURIComponent(assignmentId)}`);
    panel.replaceChildren();

    if (!submissions.length) {
        const emptyWrap = document.createElement('div');
        emptyWrap.className = 'wf-submission-row';
        emptyWrap.append(createText('p', 'No submissions yet. Add one manually or import from Canvas.', 'wf-muted-note'));
        panel.append(emptyWrap);
    }
    submissions.forEach((submission) => {
        const row = document.createElement('div');
        row.className = 'wf-submission-row';
        const late = Boolean(assignment.dueAt && new Date(submission.createdAt) > new Date(assignment.dueAt));

        const info = document.createElement('div');
        info.className = 'wf-submission-info';
        info.append(createText('strong', submission.studentLabel || 'Unlabelled student'));
        const rowMeta = document.createElement('span');
        rowMeta.className = 'wf-submission-meta';
        rowMeta.append(createText('span', `Submitted ${formatDate(submission.createdAt, true)}`));
        if (late) rowMeta.append(createText('span', 'Late', 'wf-late-flag'));
        rowMeta.append(
            createText('span', `Attempt ${submission.attempt}`),
            chip(STATUS_LABELS[submission.status], STATUS_TONES[submission.status])
        );
        info.append(rowMeta);

        const actions = document.createElement('div');
        actions.className = 'wf-submission-actions';
        const label = submission.studentLabel || 'this submission';
        actions.append(
            createButton('Open submission', 'secondary', async () => openReview(submission.id)),
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
                const current = state.assignments.find((item) => item.id === assignmentId);
                if (current && typeof current.submissionCount === 'number') {
                    current.submissionCount = Math.max(0, current.submissionCount - 1);
                }
                showSuccessToast('Submission deleted.');
            })
        );
        row.append(info, actions);
        panel.append(row);
    });

    const footer = document.createElement('div');
    footer.className = 'wf-add-submission-row';
    footer.append(createButton('+ Add submission (manually)', 'quiet', async () => showManualImport(assignment)));
    panel.append(footer);
    refreshIcons();
}

// ---------------------------------------------------------------------------
// Action panel forms
// ---------------------------------------------------------------------------

function openActionPanel(title: string): HTMLElement {
    const panel = element<HTMLElement>('wf-action-panel');
    element('wf-action-panel-title').textContent = title;
    const content = element<HTMLElement>('wf-action-panel-content');
    content.replaceChildren();
    panel.hidden = false;
    panel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    return content;
}

async function closeActionPanel(confirm = true): Promise<void> {
    // Never clear setup controls until the reviewer has resolved dirty state;
    // successful submissions bypass the prompt only after persistence completes.
    if (confirm && !(await confirmDiscardDirty('setup'))) return;
    state.panelDirty = false;
    element<HTMLElement>('wf-action-panel').hidden = true;
    element('wf-action-panel-content').replaceChildren();
}

async function showAddAssignment(): Promise<void> {
    if (!(await confirmDiscardDirty('setup'))) return;
    state.panelDirty = false;
    const content = openActionPanel('Add a writing assignment');
    content.append(createText(
        'p',
        'Manual assignments start from the approved internal rubric profile. You can adjust the rubric before generating feedback.',
        'wf-panel-intro'
    ));

    const form = document.createElement('form');
    const grid = document.createElement('div');
    grid.className = 'wf-form-grid';
    const title = inputControl();
    title.required = true;
    title.maxLength = 200;
    const deadline = inputControl('', 'datetime-local');
    grid.append(
        field('Assignment title', title, undefined, true),
        field('Submission deadline', deadline, 'Optional. Used to flag late submissions in the list.')
    );
    form.append(grid);

    const actions = document.createElement('div');
    actions.className = 'wf-button-row';
    const submit = createButton('Create assignment', 'primary', async () => {
        if (!form.reportValidity()) return;
        const created = await jsonRequest<Assignment>('/assignments', 'POST', {
            title: title.value,
            dueAt: deadline.value ? new Date(deadline.value).toISOString() : undefined
        });
        state.panelDirty = false;
        await closeActionPanel(false);
        state.expandedAssignmentId = created.id;
        await loadLanding();
        showSuccessToast('Assignment created. Add submissions to begin.');
    });
    actions.append(submit, createButton('Cancel', 'quiet', async () => closeActionPanel()));
    form.append(actions);
    form.addEventListener('input', () => { state.panelDirty = true; });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submit.click();
    });
    content.append(form);
    title.focus();
}

async function showManualImport(assignment: Assignment): Promise<void> {
    if (!(await confirmDiscardDirty('setup'))) return;
    state.panelDirty = false;
    const content = openActionPanel(`Add a submission — ${assignment.title}`);
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
    file.accept = '.txt,.docx,.pdf,.html,.htm';
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
        state.expandedAssignmentId = assignment.id;
        await loadLanding();
        showSuccessToast(stored.requiresVerification
            ? 'File extracted. Verify its text before generation.'
            : 'Verified text added to the assignment.');
    });
    actions.append(submit, createButton('Cancel', 'quiet', async () => closeActionPanel()));
    form.append(actions);
    form.addEventListener('input', () => { state.panelDirty = true; });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submit.click();
    });
    content.append(form);
    studentId.focus();
}

async function showCanvasImport(): Promise<void> {
    if (!(await confirmDiscardDirty('setup'))) return;
    state.panelDirty = false;
    const workspace = state.workspace!;
    const content = openActionPanel(workspace.canvas.mode === 'demo' ? 'Try the Canvas import workflow' : 'Import assignments from Canvas');
    content.append(createText('p', 'Checking Canvas availability…', 'wf-muted-note'));

    // Refresh integration truth on every open. The UI must distinguish synthetic
    // demo data from an unavailable production connection before showing import actions.
    const [status, canvasAssignments] = await Promise.all([
        request<CanvasStatus>('/canvas/status'),
        request<CanvasAssignment[]>('/canvas/assignments')
    ]);
    workspace.canvas = status;
    content.replaceChildren();

    const callout = document.createElement('div');
    callout.className = `wf-callout${status.canImport ? ' wf-callout--success' : ' wf-callout--warning'}`;
    callout.append(createText('strong', status.label), createText('span', status.message));
    content.append(callout);

    if (!status.canImport) {
        // Capability/connection failure is a durable inline state, not an attempt
        // to call Canvas or a misleading disabled demo.
        content.append(
            createText('p', status.nextStep || 'Canvas connection setup is required.', 'wf-panel-intro'),
            createText(
                'p',
                workspace.permissions.canManageRubric
                    ? 'Next production gate: configure a scoped developer key, encrypted user OAuth tokens, an approved retention policy, and a Canvas sandbox.'
                    : 'Ask the course instructor to complete the institutionally approved Canvas connection setup.'
            )
        );
        return;
    }

    content.append(createText(
        'p',
        'Choose an assignment. Importing adds it to this workspace with an internal A2 rubric; a detected Canvas rubric is shown but is not silently copied or changed.',
        'wf-panel-intro'
    ));
    const list = document.createElement('div');
    list.className = 'wf-canvas-list';
    canvasAssignments.forEach((assignment, index) => {
        const card = document.createElement('article');
        card.className = 'wf-canvas-assignment';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'wf-canvas-assignment';
        radio.value = assignment.canvasAssignmentId;
        radio.id = `wf-canvas-assignment-${index}`;
        radio.checked = index === 0;
        const label = document.createElement('label');
        label.htmlFor = radio.id;
        const due = assignment.dueAt ? formatDate(assignment.dueAt) : 'No due date';
        label.append(
            createText('strong', assignment.title),
            createText('span', `${assignment.submissionCount} submissions · ${assignment.pointsPossible ?? '—'} points · ${due}`),
            createText('span', assignment.rubricState === 'canvas_rubric' ? 'Canvas rubric detected' : 'No Canvas rubric')
        );
        card.append(radio, label);
        list.append(card);
    });
    content.append(list);

    const previewState = document.createElement('div');
    previewState.className = 'wf-release-state';
    previewState.setAttribute('role', 'status');
    const actions = document.createElement('div');
    actions.className = 'wf-button-row';
    actions.append(
        createButton('Preview import', 'secondary', async () => {
            const selected = content.querySelector<HTMLInputElement>('input[name="wf-canvas-assignment"]:checked');
            if (!selected) throw new Error('Choose an assignment first');
            const preview = await request<{ assignment: CanvasAssignment; submissions: unknown[] }>(
                `/canvas/assignments/${encodeURIComponent(selected.value)}/preview`
            );
            previewState.textContent = `${preview.submissions.length} synthetic submissions are eligible. Import does not generate or release feedback.`;
        }),
        createButton('Import selected assignment', 'primary', async () => {
            const selected = content.querySelector<HTMLInputElement>('input[name="wf-canvas-assignment"]:checked');
            if (!selected) throw new Error('Choose an assignment first');
            // Import is an explicit, idempotent intake action. It creates local
            // records only and never generates feedback or writes back to Canvas.
            const result = await jsonRequest<CanvasImportResult>('/canvas/import', 'POST', {
                canvasAssignmentId: selected.value
            });
            await closeActionPanel(false);
            state.expandedAssignmentId = result.targetAssignment.id;
            await loadLanding();
            setWorkspaceMessage(
                `${result.importedCount} submissions imported; ${result.skippedCount} unchanged attempts skipped. No feedback was generated automatically.`,
                'success'
            );
            showSuccessToast(`Imported ${result.importedCount} submissions from the Canvas demo.`);
        })
    );
    content.append(previewState, actions);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function bindStaticActions(): void {
    element<HTMLButtonElement>('wf-import-canvas').addEventListener('click', () => void showCanvasImport().catch(handleActionError));
    element<HTMLButtonElement>('wf-add-assignment').addEventListener('click', () => void showAddAssignment().catch(handleActionError));
    element<HTMLButtonElement>('wf-action-panel-close').addEventListener('click', () => void closeActionPanel());
}

/**
 * initializeWritingFeedback - boots the course-scoped instructor workspace
 *
 * Resets module state, registers sibling view openers, loads capability-aware
 * workspace context, and restores a URL-addressed landing, rubric, or review view.
 * The instructor shell calls this only after confirming that the course feature
 * is enabled; operational API authorization remains server-enforced.
 *
 * @param currentClass - Active course used to scope every Writing Feedback request
 */
export async function initializeWritingFeedback(currentClass: activeCourse): Promise<void> {
    // Reset all cross-view state because the instructor shell can replace the
    // component while switching courses without reloading the browser tab.
    state.course = currentClass;
    state.assignments = [];
    state.expandedAssignmentId = queryState('wfAssignment');
    state.currentAssignment = null;
    state.reviewDirty = false;
    state.panelDirty = false;
    views.showLanding = loadLanding;
    views.showRubric = openRubricPage;
    views.showReview = openReview;
    bindStaticActions();
    try {
        // Workspace context supplies permission and Canvas-mode truth before any
        // deep link is restored, preventing actions from rendering optimistically.
        state.workspace = await request<WorkspaceContext>('/workspace-context');
        setWorkspaceMessage(
            state.workspace.canvas.mode === 'demo'
                ? 'Local demo mode is active: Canvas import and release use synthetic data only. Every student-facing result still requires staff approval.'
                : `${state.workspace.canvas.message} Manual intake, review, approval, and PDF download remain available.`,
            state.workspace.canvas.mode === 'demo' ? 'warning' : 'info'
        );
        // Restore exactly one URL-addressed view; each opener reloads its own
        // server-authoritative data rather than trusting stale browser state.
        const requestedSubmission = queryState('wfSubmission');
        const requestedView = queryState('wfView');
        if (requestedSubmission) {
            state.assignments = await request<Assignment[]>('/assignments');
            await openReview(requestedSubmission);
        } else if (requestedView === 'rubric' && state.expandedAssignmentId) {
            state.assignments = await request<Assignment[]>('/assignments');
            await openRubricPage(state.expandedAssignmentId);
        } else {
            await loadLanding();
        }
    } catch (error) {
        // Keep the component mounted with a durable, non-sensitive error state;
        // request helpers have already discarded response details outside `error`.
        const message = error instanceof Error ? error.message : 'The workspace could not be loaded.';
        setWorkspaceMessage(message, 'error');
        element('wf-assignment-list').replaceChildren(createText('p', 'Writing Feedback is unavailable.', 'wf-muted-note'));
    }
}
