// public/scripts/feature/writing-feedback.ts
/**
 * Writing Feedback Workspace — entry point and assignment queue
 *
 * The queue lists assignment cards (Canvas-imported or manually created) and creates new
 * ones. Opening a card moves to that assignment's own page, which owns its submissions and
 * every action on them. The assignment, rubric, and review pages live in sibling modules
 * registered through the shared view registry.
 *
 * @author: @rdschrs
 * @date: 2026-07-20
 * @version: 1.0.0
 * @description: Initializes course-scoped state and coordinates assignment, submission, and Canvas intake flows.
 */

import type { activeCourse } from '../types.js';
import { showSuccessToast, showToast } from '../ui/toast-notification.js';
import { showDeleteConfirmationModal, showConfirmModal } from '../ui/modal-overlay.js';
import {
    Assignment,
    assignmentOriginText,
    CanvasAssignment,
    CanvasAccountMismatchError,
    CanvasAuthRequiredError,
    CanvasImportResult,
    CanvasStatus,
    Submission,
    WfViewName,
    WorkspaceContext,
    canvasOutcomeNotes,
    chip,
    closeActionPanel,
    confirmDiscardDirty,
    createButton,
    createIconButton,
    createText,
    element,
    field,
    formatDate,
    handleActionError,
    inputControl,
    jsonRequest,
    openActionPanel,
    queryState,
    refreshIcons,
    rememberDisplayedUrl,
    request,
    restoreDisplayedUrl,
    runButtonAction,
    savedScrollTop,
    scrollingAncestor,
    setQueryState,
    setView,
    setWorkspaceMessage,
    clearWorkspaceMessage,
    state,
    textAreaControl,
    views
} from './writing-feedback-shared.js';
import { openAssignmentPage } from './writing-feedback-assignment-page.js';
import { openRubricPage } from './writing-feedback-rubric.js';
import { openReview } from './writing-feedback-review.js';
import { setWritingFeedbackDemoMode } from './writing-feedback-demo-mode.js';
import { oldestPendingAssignment } from './writing-feedback-assignment-type-state.js';
import { connectUrlReturningTo } from './writing-feedback-canvas-connect.js';
import { stopFollowingGeneration } from './writing-feedback-batch.js';

/** Mount the shared setup panel is moved into while the queue is the page on screen. */
const ACTION_MOUNT_ID = 'wf-landing-action-mount';

// ---------------------------------------------------------------------------
// Assignment queue
// ---------------------------------------------------------------------------

async function loadLanding(mode: 'push' | 'replace' = 'push'): Promise<void> {
    stopFollowingGeneration();
    setView('landing');
    // The queue is about no one assignment, so it drops the assignment parameter too: what
    // stays in the address is what the page on screen actually shows.
    setQueryState({ wfSubmission: null, wfView: null, wfAssignment: null }, mode);
    state.activeAssignmentId = null;
    state.currentAssignment = null;
    const list = element<HTMLDivElement>('wf-assignment-list');
    list.setAttribute('aria-busy', 'true');
    list.replaceChildren(createText('p', 'Loading assignments…', 'wf-muted-note'));
    state.assignments = await request<Assignment[]>('/assignments');
    renderLanding();

    // An assignment left without a type (the page was closed before staff answered) is asked
    // about again here, oldest first, and then opened on its rubric page (D-123).
    const pending = oldestPendingAssignment(state.assignments);
    if (pending && state.workspace?.permissions.canManageRubric) {
        await openNewAssignment(pending);
    }
}

/**
 * openNewAssignment - opens a new assignment's rubric page, which asks for its type.
 *
 * The question is asked from the rubric view rather than here: a lab report then waits on
 * the auto-fill of its writing rubric, and that wait must show the rubric page loading,
 * not the stale assignment list the import started from.
 *
 * @param assignment - Newly created or imported assignment, or one still pending
 */
async function openNewAssignment(assignment: Assignment): Promise<void> {
    state.activeAssignmentId = assignment.id;
    state.assignments = await request<Assignment[]>('/assignments');
    await openRubricPage(assignment.id);
}

function renderLanding(): void {
    const list = element<HTMLDivElement>('wf-assignment-list');
    list.setAttribute('aria-busy', 'false');
    list.replaceChildren();

    if (!state.assignments.length) {
        // A plain line, the way the flags page reports an empty list. The box this replaces
        // repeated the header's Import and Add buttons directly beneath them; the header
        // already offers Import to every staff member and Add to those who can create one.
        list.append(createText('p', 'No assignments yet.', 'wf-assignment-list-empty'));
        return;
    }

    state.assignments.forEach((assignment) => list.append(renderAssignmentCard(assignment)));
    refreshIcons();
}

/**
 * renderAssignmentCard - one row of the queue, which opens that assignment's page
 *
 * The card answers only which assignment this is, where it came from, how much work is
 * waiting in it, and whether it should exist at all. Everything done *inside* an assignment
 * lives on its own page, so a course with many assignments still reads as a short list.
 *
 * @param assignment - Assignment to summarize
 * @returns Detached card
 */
function renderAssignmentCard(assignment: Assignment): HTMLElement {
    const card = document.createElement('article');
    card.className = 'wf-assignment';
    card.dataset.assignmentId = assignment.id;

    // The header is the object, so the header opens it: the same mouse/Enter/Space contract
    // the submission rows on the assignment page use. Delete stops its own propagation.
    const header = document.createElement('div');
    header.className = 'wf-assignment-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-label', `Open assignment "${assignment.title}"`);

    const heading = document.createElement('div');
    heading.className = 'wf-assignment-title-group';
    const title = createText('h2', assignment.title);
    // The kind sits inside the heading so it trails the last word of a wrapped title. Writing
    // is the default kind, so only the exception is labelled.
    if (assignment.isLabReport) title.append(chip('Lab report', 'blue'));
    heading.append(title);
    const meta = document.createElement('p');
    meta.className = 'wf-assignment-meta';
    // Provenance rides on the date rather than a separate badge: the record is created at the
    // moment it is imported, so one line answers both "where did this come from" and "when".
    const submissionCount = assignment.submissionCount ?? 0;
    meta.append(
        createText('span', assignmentOriginText(assignment)),
        createText('span', `${submissionCount} submission${submissionCount === 1 ? '' : 's'}`)
    );
    // A deadline is imported from Canvas whenever the assignment carries one, so its absence
    // means Canvas has none set. Saying "No deadline" spends a segment on that, so the
    // segment is omitted instead.
    if (assignment.dueAt) {
        meta.append(createText('span', `Deadline ${formatDate(assignment.dueAt, true)}`));
    }
    heading.append(meta);

    const controls = document.createElement('div');
    controls.className = 'wf-assignment-controls';
    const deleteButton = createIconButton('trash-2', `Delete assignment "${assignment.title}"`, 'danger', async () => {
        // Deleting the assignment deletes its submissions too, so say how much work goes with it.
        const submissions = await request<Submission[]>(`/submissions?assignmentId=${encodeURIComponent(assignment.id)}`);
        if (submissions.length) {
            const releasedCount = submissions.filter((item) => item.status === 'released').length;
            const releasedNote = releasedCount
                ? ` Feedback for ${releasedCount} of them was already released to Canvas; it stays in Canvas, but its record here is deleted.`
                : '';
            const result = await showConfirmModal(
                'Delete assignment',
                `Delete "${assignment.title}" and its ${submissions.length} submission${submissions.length === 1 ? '' : 's'}, including their feedback?${releasedNote} This cannot be undone.`,
                'Delete assignment',
                'Cancel',
                'danger'
            );
            if (result.action !== 'delete-assignment') return;
        } else {
            const result = await showDeleteConfirmationModal('assignment', assignment.title);
            if (result.action !== 'delete') return;
        }
        await jsonRequest(`/assignments/${encodeURIComponent(assignment.id)}`, 'DELETE');
        state.assignments = state.assignments.filter((item) => item.id !== assignment.id);
        renderLanding();
        showSuccessToast('Assignment deleted.');
    });
    controls.append(deleteButton);
    // Affordance only: the header carries the click, so this must not take focus or be read
    // out as a second control.
    const openIcon = document.createElement('span');
    openIcon.className = 'wf-submission-open-icon';
    openIcon.setAttribute('aria-hidden', 'true');
    openIcon.innerHTML = '<i data-feather="chevron-right"></i>';
    controls.append(openIcon);

    header.append(heading, controls);
    const open = () => void openAssignmentPage(assignment.id).catch(handleActionError);
    header.addEventListener('click', open);
    header.addEventListener('keydown', (event) => {
        if (event.target !== header) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
        }
    });
    card.append(header);
    return card;
}

// ---------------------------------------------------------------------------
// Action panel forms
// ---------------------------------------------------------------------------

async function showAddAssignment(): Promise<void> {
    if (!state.workspace?.permissions.canManageRubric) {
        throw new Error('Only instructors and administrators can create manual assignments.');
    }
    if (!(await confirmDiscardDirty('setup'))) return;
    state.panelDirty = false;
    const content = openActionPanel('Add a writing assignment', ACTION_MOUNT_ID);
    content.append(createText(
        'p',
        'Add the directions students receive. The assignment starts with an editable rubric draft that must be approved before feedback can be generated.',
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
    const instructions = textAreaControl('', 10);
    instructions.placeholder = 'Paste the assignment prompt, requirements, audience, purpose, and any grading directions.';
    instructions.maxLength = 30000;
    const instructionsFile = inputControl('', 'file');
    instructionsFile.accept = '.txt,.md,.markdown,.docx,.pdf,.html,.htm';
    const extractionState = createText('p', '', 'wf-help-text');
    extractionState.setAttribute('role', 'status');
    extractionState.setAttribute('aria-live', 'polite');
    let extractedFile: File | null = null;
    const extractInstructions = async (): Promise<void> => {
        const selectedFile = instructionsFile.files?.[0];
        if (!selectedFile) throw new Error('Choose an assignment-instructions file first.');
        const payload = new FormData();
        payload.append('file', selectedFile);
        const extracted = await request<{ text: string }>('/instructions/extract', {
            method: 'POST',
            body: payload
        });
        instructions.value = extracted.text;
        extractedFile = selectedFile;
        state.panelDirty = true;
        extractionState.textContent = `Extracted ${selectedFile.name}. Review the text before creating the assignment.`;
        instructions.focus();
    };
    instructionsFile.addEventListener('change', () => {
        extractedFile = null;
        state.panelDirty = true;
        extractionState.textContent = instructionsFile.files?.length
            ? 'File selected. Extract it to review and use its text.'
            : '';
    });
    const fileActions = document.createElement('div');
    fileActions.className = 'wf-inline-field-actions';
    fileActions.append(createButton('Extract into instructions', 'secondary', extractInstructions));
    const instructionsFileField = field(
        'Assignment instructions file',
        instructionsFile,
        'Optional. TXT, DOCX, text-based PDF, or HTML. Extracted text stays editable.'
    );
    instructionsFileField.classList.add('wf-field--wide');
    instructionsFileField.append(fileActions, extractionState);
    grid.append(
        field('Assignment instructions', instructions, 'Optional, but recommended so the rubric reflects the actual task.', true),
        instructionsFileField
    );
    form.append(grid);

    const actions = document.createElement('div');
    actions.className = 'wf-button-row';
    const submit = createButton('Create assignment', 'primary', async () => {
        if (!form.reportValidity()) return;
        const selectedFile = instructionsFile.files?.[0];
        if (selectedFile && selectedFile !== extractedFile) await extractInstructions();
        const created = await jsonRequest<Assignment>('/assignments', 'POST', {
            title: title.value.trim(),
            instructions: instructions.value.trim() || undefined,
            dueAt: deadline.value ? new Date(deadline.value).toISOString() : undefined
        });
        state.panelDirty = false;
        await closeActionPanel(false);
        await openNewAssignment(created);
        showSuccessToast('Assignment created. Review and approve its rubric before generating feedback.');
    });
    actions.append(submit, createButton('Cancel', 'quiet', async () => { await closeActionPanel(); }));
    form.append(actions);
    form.addEventListener('input', () => { state.panelDirty = true; });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submit.click();
    });
    content.append(form);
    title.focus();
}

/**
 * createAssignmentListPlaceholder - builds the loading state for the Canvas assignment list
 *
 * Skeleton cards sit in the same grid as the real assignment cards so the panel does not
 * reflow when the list arrives. They are decorative, so the announcement is carried by a
 * visually hidden live region rather than by the shapes themselves.
 *
 * @returns Detached container the caller appends while the fetch is in flight and removes after
 */
function createAssignmentListPlaceholder(): HTMLElement {
    const placeholder = document.createElement('div');
    placeholder.className = 'wf-canvas-list';
    placeholder.setAttribute('role', 'status');
    placeholder.setAttribute('aria-busy', 'true');
    placeholder.append(createText('p', 'Loading assignments from Canvas…', 'wf-visually-hidden'));

    // Three cards: enough to read as a list without implying a count the fetch may not match.
    for (let cardIndex = 0; cardIndex < 3; cardIndex += 1) {
        const card = document.createElement('div');
        card.className = 'wf-canvas-assignment wf-canvas-assignment--skeleton';
        card.setAttribute('aria-hidden', 'true');
        const lines = document.createElement('div');
        lines.className = 'wf-skeleton-lines';
        for (let lineIndex = 0; lineIndex < 3; lineIndex += 1) {
            lines.append(createText('span', '', 'wf-skeleton-line'));
        }
        card.append(lines);
        placeholder.append(card);
    }
    return placeholder;
}

/** Query marker on the Canvas authorization return address that reopens the import panel. */
const CANVAS_IMPORT_RETURN_PARAM = 'wfImport';

/**
 * The page staff are on, as the same-site path Canvas authorization should return to.
 *
 * Carries {@link CANVAS_IMPORT_RETURN_PARAM} so the workspace reopens the import panel on
 * arrival: staff connected Canvas in order to import, and would otherwise have to find the
 * button again.
 */
function canvasImportReturnPath(): string {
    const url = new URL(window.location.href);
    url.searchParams.set(CANVAS_IMPORT_RETURN_PARAM, 'canvas');
    return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Removes the import-return marker from the address bar and reports whether it was there.
 *
 * Removed before anything renders so a refresh or a copied link does not reopen the panel.
 */
function consumeCanvasImportReturn(): boolean {
    const url = new URL(window.location.href);
    if (url.searchParams.get(CANVAS_IMPORT_RETURN_PARAM) !== 'canvas') return false;
    url.searchParams.delete(CANVAS_IMPORT_RETURN_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return true;
}

/**
 * showCanvasImport - opens the assignment chooser for the active Canvas adapter
 *
 * The same panel serves three states, and the copy must not blur them: a live Canvas course
 * reads real student submissions, the local demo reads synthetic fixtures, and an unconnected
 * or unlinked course offers the one action that would change that. Status is therefore fetched
 * and acted on *before* assignments — listing assignments in a live course requires a Canvas
 * authorization this staff member may not have, and that call answers `401`, not an empty list.
 */
async function showCanvasImport(): Promise<void> {
    if (!(await confirmDiscardDirty('setup'))) return;
    state.panelDirty = false;
    const workspace = state.workspace!;
    const content = openActionPanel(
        workspace.canvas.mode === 'demo' ? 'Try the Canvas import workflow' : 'Select assignment to import from Canvas',
        ACTION_MOUNT_ID
    );
    content.append(createText('p', 'Checking Canvas availability…', 'wf-muted-note'));

    // Refresh integration truth on every open. The UI must distinguish synthetic demo data
    // from a live Canvas course and from an unavailable connection before showing any action.
    const status = await request<CanvasStatus>('/canvas/status');
    workspace.canvas = status;
    content.replaceChildren();

    const isDemo = status.mode === 'demo';
    const isLive = status.mode === 'live';

    if (!status.canImport) {
        // Capability/connection failure is a durable inline state, not an attempt to call
        // Canvas or a misleading disabled demo. Only this path reports the integration's
        // own status text, because only here does the reason for it drive what to do next.
        const blocked = document.createElement('div');
        blocked.className = 'wf-callout wf-callout--warning';
        blocked.append(createText('strong', status.label), createText('span', status.message));
        content.append(blocked);
        content.append(createText('p', status.nextStep || 'Canvas connection setup is required.', 'wf-panel-intro'));
        if (status.connectUrl) {
            // Authorization is the only blocker, and it is one this staff member can clear.
            const connectRow = document.createElement('div');
            connectRow.className = 'wf-button-row';
            const connect = document.createElement('a');
            connect.className = 'wf-button wf-button--primary';
            connect.href = connectUrlReturningTo(status.connectUrl, canvasImportReturnPath());
            connect.textContent = 'Connect Canvas';
            connectRow.append(connect);
            content.append(connectRow);
        } else {
            content.append(createText(
                'p',
                workspace.permissions.canManageRubric
                    ? 'Next production gate: configure a scoped developer key, encrypted user OAuth tokens, an approved retention policy, and a Canvas sandbox.'
                    : 'Ask the course instructor to complete the institutionally approved Canvas connection setup.'
            ));
        }
        return;
    }

    // Once importing is possible, the connection is not the reviewer's problem. The callout
    // spends itself on what import does and on why the list may be shorter than Canvas.
    // Phrased as "only ... appear below" on purpose: the gateway also hides assignments that
    // take no text or file entry and ones graded anonymously, so a sentence claiming the
    // submission count is what hides them would send staff looking for the wrong cause.
    const callout = document.createElement('div');
    callout.className = 'wf-callout wf-callout--success';
    callout.append(createText(
        'span',
        "This will import all of the selected assignment's submissions. Only assignments with at least one submission appear below. To import late submissions, use Sync submissions on the assignment."
    ));
    content.append(callout);

    // Listing assignments is the slower of the two Canvas calls, and the status check's
    // own placeholder was cleared above. Without one here the panel looks finished and
    // empty for a second or two, which reads as "this course has no assignments".
    const loading = createAssignmentListPlaceholder();
    content.append(loading);

    let canvasAssignments: CanvasAssignment[];
    try {
        canvasAssignments = await request<CanvasAssignment[]>('/canvas/assignments');
    } catch (error) {
        // A connection refused as someone else's still exists, so offer connecting again instead.
        if (error instanceof CanvasAccountMismatchError) {
            const connectRow = document.createElement('div');
            connectRow.className = 'wf-button-row';
            const connect = document.createElement('a');
            connect.className = 'wf-button wf-button--primary';
            connect.href = connectUrlReturningTo(error.connectUrl, canvasImportReturnPath());
            connect.textContent = 'Connect Canvas';
            connectRow.append(connect);
            content.append(createText('p', error.message, 'wf-panel-intro'), connectRow);
            return;
        }
        // A credential revoked between the status check and this call lands here.
        if (error instanceof CanvasAuthRequiredError) {
            const connectRow = document.createElement('div');
            connectRow.className = 'wf-button-row';
            const connect = document.createElement('a');
            connect.className = 'wf-button wf-button--primary';
            connect.href = connectUrlReturningTo(error.connectUrl, canvasImportReturnPath());
            connect.textContent = 'Connect Canvas';
            connectRow.append(connect);
            content.append(createText('p', error.message, 'wf-panel-intro'), connectRow);
            return;
        }
        throw error;
    } finally {
        loading.remove();
    }

    if (canvasAssignments.length === 0) {
        if (!isLive) {
            content.append(createText('p', 'No assignments are available to import.', 'wf-muted-note'));
            return;
        }
        content.append(createText(
            'p',
            'No assignments in this Canvas course can be imported. An assignment appears only if it accepts text entry or file uploads, has at least one submission, and is not anonymously graded.',
            'wf-muted-note'
        ));
        // Canvas answers an invited-but-unaccepted enrollment with an empty assignment list, not
        // an error, so from here it is indistinguishable from a course with nothing to import.
        content.append(createText(
            'p',
            'If you were recently added to this Canvas course, accept the course invitation in Canvas first. Until you do, Canvas shows you no assignments.',
            'wf-muted-note'
        ));
        return;
    }

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
        // Canvas cannot report a submitted count without a request per assignment, so the
        // segment appears only when the list call happened to carry one. A due date is
        // likewise shown only when Canvas holds one; neither absence is worth a placeholder.
        const summary: string[] = [];
        if (assignment.submissionCount !== undefined) {
            summary.push(`${assignment.submissionCount} submissions`);
        }
        summary.push(`${assignment.pointsPossible ?? '—'} points`);
        if (assignment.dueAt) summary.push(formatDate(assignment.dueAt));
        label.append(
            createText('strong', assignment.title),
            createText('span', summary.join(' · ')),
            createText('span', assignment.rubricState === 'canvas_rubric' ? 'Canvas rubric detected' : 'No Canvas rubric')
        );
        card.append(radio, label);
        list.append(card);
    });
    content.append(list);

    const actions = document.createElement('div');
    actions.className = 'wf-button-row';
    actions.append(
        createButton('Import selected assignment', 'primary', async () => {
            const selected = content.querySelector<HTMLInputElement>('input[name="wf-canvas-assignment"]:checked');
            if (!selected) throw new Error('Choose an assignment first');
            // Import is an explicit, idempotent intake action. It creates local
            // records only and never generates feedback or writes back to Canvas.
            const result = await jsonRequest<CanvasImportResult>('/canvas/import', 'POST', {
                canvasAssignmentId: selected.value
            });
            await closeActionPanel(false);
            // Only a newly created assignment is pending; a re-import returns the existing one.
            if (result.targetAssignment.assignmentTypePending) {
                await openNewAssignment(result.targetAssignment);
            } else {
                await openAssignmentPage(result.targetAssignment.id);
            }

            // One report of the outcome, in the toast the instructor is already
            // watching for. The counts ride along with it rather than in a second
            // banner that would outlive the action that produced it.
            const notes = [
                `${result.importedCount} submissions imported${isDemo ? ' from the Canvas demo' : ''}`,
                `${result.skippedCount} unchanged attempts skipped`,
                ...canvasOutcomeNotes(result)
            ];
            const summary = `${notes.join('; ')}. No feedback was generated automatically.`;
            // Longer than the 3s default: the count list takes longer to read, and
            // a partial failure is the case the instructor most needs to catch.
            if (result.failedCount > 0) showToast(summary, 8000, 'top-right', 'error');
            else showSuccessToast(summary, 6000);
        })
    );
    content.append(actions);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function bindStaticActions(): void {
    // Routed through runButtonAction rather than a bare listener so the header control
    // shows a busy state while Canvas is being reached.
    const importCanvas = element<HTMLButtonElement>('wf-import-canvas');
    importCanvas.addEventListener('click', () => void runButtonAction(importCanvas, showCanvasImport));
    element<HTMLButtonElement>('wf-add-assignment').addEventListener('click', () => void showAddAssignment().catch(handleActionError));
    element<HTMLButtonElement>('wf-action-panel-close').addEventListener('click', () => void closeActionPanel().catch(handleActionError));
    element<HTMLButtonElement>('wf-workspace-message-dismiss').addEventListener('click', clearWorkspaceMessage);
}

/**
 * showPageFromUrl - renders the workspace page the current URL names
 *
 * Restores exactly one page; each opener reloads its own server-authoritative data rather
 * than trusting stale browser state. The URL already names the page, so nothing here adds
 * a history entry.
 *
 * @returns Which page was shown
 */
async function showPageFromUrl(): Promise<WfViewName> {
    const requestedAssignment = queryState('wfAssignment');
    state.activeAssignmentId = requestedAssignment;
    const requestedSubmission = queryState('wfSubmission');
    if (requestedSubmission) {
        state.assignments = await request<Assignment[]>('/assignments');
        await openReview(requestedSubmission);
        return 'review';
    }
    const requestedView = queryState('wfView');
    if (requestedView === 'rubric' && requestedAssignment) {
        state.assignments = await request<Assignment[]>('/assignments');
        await openRubricPage(requestedAssignment);
        return 'rubric';
    }
    if (requestedView === 'assignment' && requestedAssignment) {
        state.assignments = await request<Assignment[]>('/assignments');
        await openAssignmentPage(requestedAssignment);
        return 'assignment';
    }
    await loadLanding('replace');
    return 'landing';
}

/**
 * isWritingFeedbackMounted - whether the workspace is the component on screen
 *
 * @returns True once {@link initializeWritingFeedback} has run against mounted markup
 */
export function isWritingFeedbackMounted(): boolean {
    return state.course !== null && document.getElementById('wf-view-landing') !== null;
}

/**
 * confirmLeaveWritingFeedbackPage - resolves unsaved edits before the page on screen changes
 *
 * Asks about unsaved staff feedback and setup edits in turn, and clears both once staff
 * agree to discard them.
 *
 * @returns True when there was nothing unsaved or staff chose to discard it
 */
export async function confirmLeaveWritingFeedbackPage(): Promise<boolean> {
    if (!(await confirmDiscardDirty('review')) || !(await confirmDiscardDirty('setup'))) return false;
    state.reviewDirty = false;
    state.panelDirty = false;
    return true;
}

/**
 * syncWritingFeedbackFromUrl - follows browser Back/Forward between workspace pages
 *
 * The browser has already changed the address when this runs and cannot be stopped, so
 * choosing "Keep editing" puts the on-screen page's address back instead. Returning to a
 * list page restores the scroll position staff left it at.
 *
 * @returns False when the workspace is not mounted and the shell must load it instead
 */
export async function syncWritingFeedbackFromUrl(): Promise<boolean> {
    if (!isWritingFeedbackMounted()) return false;
    if (!(await confirmLeaveWritingFeedbackPage())) {
        restoreDisplayedUrl();
        return true;
    }
    const scrollTop = savedScrollTop();
    try {
        const page = await showPageFromUrl();
        // Both list pages can be long enough to have been scrolled; the rubric and review
        // pages open at their own top.
        const scroller = page === 'landing' ? 'wf-view-landing' : page === 'assignment' ? 'wf-view-assignment' : null;
        if (scroller && scrollTop !== null) {
            // After layout, once the list has rendered to full height.
            requestAnimationFrame(() => {
                scrollingAncestor(element(scroller)).scrollTop = scrollTop;
            });
        }
    } catch (error) {
        await handleActionError(error);
    }
    return true;
}

/**
 * initializeWritingFeedback - boots the course-scoped instructor workspace
 *
 * Resets module state, registers sibling view openers, loads capability-aware
 * workspace context, and restores the URL-addressed queue, assignment, rubric, or
 * review page.
 * The instructor shell calls this only after confirming that the course feature
 * is enabled; operational API authorization remains server-enforced.
 *
 * @param currentClass - Active course used to scope every Writing Feedback request
 */
export async function initializeWritingFeedback(currentClass: activeCourse): Promise<void> {
    // A tutorial may have armed demo mode and been abandoned without completing.
    // Clearing unconditionally here is what guarantees the real staff workspace
    // can always save, however the tutorial was left.
    setWritingFeedbackDemoMode(false);

    // Reset all cross-view state because the instructor shell can replace the
    // component while switching courses without reloading the browser tab.
    state.course = currentClass;
    state.assignments = [];
    state.activeAssignmentId = queryState('wfAssignment');
    const returningFromCanvasConnect = consumeCanvasImportReturn();
    state.currentAssignment = null;
    state.reviewDirty = false;
    state.panelDirty = false;
    rememberDisplayedUrl();
    views.showLanding = loadLanding;
    views.showAssignment = openAssignmentPage;
    views.showRubric = openRubricPage;
    views.showReview = openReview;
    bindStaticActions();
    try {
        // Workspace context supplies permission and Canvas-mode truth before any
        // deep link is restored, preventing actions from rendering optimistically.
        state.workspace = await request<WorkspaceContext>('/workspace-context');
        element<HTMLButtonElement>('wf-add-assignment').hidden = !state.workspace.permissions.canManageRubric;
        // Canvas mode and its data-handling terms are stated where they apply —
        // the import dialog and the release control — so the workspace opens
        // without a standing banner repeating them on every view.
        const page = await showPageFromUrl();
        if (page === 'landing') {
            if (returningFromCanvasConnect) {
                // Through the button's own action wrapper, so a Canvas failure is reported
                // the way a click would report it rather than as "workspace unavailable".
                const importCanvas = element<HTMLButtonElement>('wf-import-canvas');
                void runButtonAction(importCanvas, showCanvasImport);
            }
        }
    } catch (error) {
        // Keep the component mounted with a durable, non-sensitive error state;
        // request helpers have already discarded response details outside `error`.
        const message = error instanceof Error ? error.message : 'The workspace could not be loaded.';
        setWorkspaceMessage(message, 'error');
        element('wf-assignment-list').replaceChildren(createText('p', 'Writing Feedback is unavailable.', 'wf-muted-note'));
    }
}
