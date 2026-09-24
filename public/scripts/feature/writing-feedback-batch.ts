// public/scripts/feature/writing-feedback-batch.ts
/**
 * Writing Feedback batch generation — the "Generate feedback for all submissions" controls
 *
 * The batch action sits with the assignment page's other actions in its header; it previews the
 * batch, asks for confirmation in a modal (with an opt-in to regenerate feedback made with an
 * older rubric), and starts it. A progress strip above the submission list holds the running
 * count and Stop, and appears only while something is generating. While it is, it follows the
 * submissions' statuses and updates the list rows in place, so rows do not move under staff who
 * are opening finished submissions.
 *
 * @author: EngE-AI Team
 * @date: 2026-09-16
 * @version: 1.0.0
 * @description: Starts, follows, and stops batch feedback generation for one assignment.
 */

import { showConfirmModal, showCustomModal } from '../ui/modal-overlay.js';
import { showSuccessToast, showToast } from '../ui/toast-notification.js';
import {
    Assignment,
    BatchPreview,
    BatchStartResult,
    STATUS_LABELS,
    STATUS_TONES,
    Submission,
    chip,
    createButton,
    createText,
    jsonRequest,
    request,
    state
} from './writing-feedback-shared.js';

/** How often the list is re-read while anything is generating. */
const POLL_INTERVAL_MS = 5000;

/** Callbacks the assignment page supplies. */
export interface BatchBarOptions {
    /** Reloads the assignment's submission list after a batch starts or stops. */
    onChanged: () => Promise<void>;
}

/** The single poll timer; only one assignment's page is open at a time. */
let pollTimer: number | null = null;

/**
 * The page's Generate-feedback control, which lives in the page header rather than in the
 * progress strip. Held here because the poll has to hide it while a run is in flight and the
 * two are no longer in the same part of the page. One reference is enough for the same reason
 * one timer is: only one assignment page exists at a time.
 */
let startControl: HTMLButtonElement | null = null;

function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

/**
 * batchProgressText - what the bar says about the list as it stands.
 *
 * @param submissions - The assignment's submissions
 * @returns Progress sentence, or an empty string when nothing is generating
 */
export function batchProgressText(submissions: Submission[]): string {
    const generating = submissions.filter((item) => item.status === 'generating').length;
    if (!generating) return '';
    const ready = submissions.filter((item) => item.status === 'draft_ready').length;
    const readyNote = ready ? ` ${plural(ready, 'submission is', 'submissions are')} ready for review now.` : '';
    return `Generating feedback for ${plural(generating, 'submission', 'submissions')}, one at a time.${readyNote}`;
}

/**
 * buildConfirmation - the modal body for a batch preview.
 *
 * @param preview - Server counts per category
 * @returns The body, its opt-in checkbox when there is stale feedback, and how many are queued without opting in
 */
export function buildConfirmation(preview: BatchPreview): { body: HTMLElement; includeStale: HTMLInputElement | null; baseCount: number } {
    const { counts } = preview;
    const baseCount = counts.no_draft + counts.failed + counts.transcript;
    const body = document.createElement('div');
    body.className = 'wf-batch-modal';

    body.append(createText('p', baseCount
        ? `Generating feedback for ${plural(baseCount, 'submission', 'submissions')} in the background. You can review finished ones while the rest generate.`
        : 'No submission is waiting for a first draft.'));

    const list = document.createElement('ul');
    list.className = 'wf-batch-modal__list';
    if (counts.no_draft) list.append(createText('li', `${plural(counts.no_draft, 'has', 'have')} no feedback yet`));
    if (counts.failed) list.append(createText('li', `${plural(counts.failed, 'failed', 'failed')} last time`));
    if (counts.transcript) {
        list.append(createText('li', `${plural(counts.transcript, 'file submission', 'file submissions')}: text will be extracted without a staff check`));
    }
    if (list.childElementCount) body.append(list);

    let includeStale: HTMLInputElement | null = null;
    if (counts.stale) {
        const option = document.createElement('label');
        option.className = 'wf-batch-modal__option';
        includeStale = document.createElement('input');
        includeStale.type = 'checkbox';
        includeStale.checked = false;
        const text = document.createElement('span');
        text.append(
            createText('strong', `Also regenerate ${plural(counts.stale, 'submission', 'submissions')} with out-of-date feedback`),
            createText('span', 'Their feedback was made with an older rubric version, or is missing technical feedback. Staff comments are kept. Edited summaries and revision goals are replaced by the new draft, and these submissions need grading and approval again.', 'wf-muted-note')
        );
        option.append(includeStale, text);
        body.append(option);
    }

    const notes: string[] = [];
    if (counts.needs_transcript) {
        notes.push(`${plural(counts.needs_transcript, 'submission is', 'submissions are')} skipped: their text must be confirmed by hand (a scan, or a file whose text could not be read cleanly).`);
    }
    if (counts.in_progress) notes.push(`${plural(counts.in_progress, 'submission is', 'submissions are')} already generating.`);
    notes.forEach((note) => body.append(createText('p', note, 'wf-muted-note')));
    return { body, includeStale, baseCount };
}

/** Explains a batch that cannot run, without offering to start it. */
async function showBlocked(message: string): Promise<void> {
    await showCustomModal({
        type: 'info',
        title: 'Feedback cannot be generated',
        content: createText('p', message),
        buttons: [{ text: 'OK', type: 'primary', closeOnClick: true }]
    });
}

/**
 * startBatch - previews, confirms, and starts batch generation.
 *
 * @param assignment - Assignment to generate for
 * @returns Whether anything was queued
 */
async function startBatch(assignment: Assignment): Promise<boolean> {
    const preview = await request<BatchPreview>(`/assignments/${encodeURIComponent(assignment.id)}/batch-generation`);
    if (preview.blockedReason) {
        await showBlocked(preview.blockedReason);
        return false;
    }
    const { body, includeStale, baseCount } = buildConfirmation(preview);
    if (!baseCount && !includeStale) {
        await showBlocked(preview.counts.in_progress
            ? 'Feedback is already being generated for every submission that needs it.'
            : 'Every submission already has current feedback, or needs its text confirmed by hand first.');
        return false;
    }
    const choice = await showCustomModal({
        type: 'info',
        title: 'Generate feedback for all submissions?',
        content: body,
        maxWidth: '560px',
        buttons: [
            { text: 'Cancel', type: 'secondary', closeOnClick: true },
            { text: 'Generate feedback', type: 'primary', closeOnClick: true }
        ]
    });
    if (choice.action !== 'generate-feedback') return false;
    const regenerate = includeStale?.checked === true;
    if (!baseCount && !regenerate) {
        showToast('Nothing was queued.');
        return false;
    }

    const result = await jsonRequest<BatchStartResult>(
        `/assignments/${encodeURIComponent(assignment.id)}/batch-generation`,
        'POST',
        { includeStale: regenerate }
    );
    const parts = [`Queued ${plural(result.queued, 'submission', 'submissions')} for feedback.`];
    if (result.transcriptsConfirmed) parts.push(`${plural(result.transcriptsConfirmed, 'transcript was', 'transcripts were')} confirmed automatically.`);
    if (result.skipped) parts.push(`${plural(result.skipped, 'submission was', 'submissions were')} skipped and need attention.`);
    if (result.queued) showSuccessToast(parts.join(' '));
    else showToast(parts.join(' '));
    return result.queued > 0;
}

/** Confirms, then removes the assignment's generation jobs that have not started. */
async function stopBatch(assignment: Assignment): Promise<boolean> {
    const choice = await showConfirmModal(
        'Stop generating feedback?',
        'Submissions still waiting will not be generated. The submission being generated right now will finish. You can start again later.',
        'Stop generating',
        'Keep generating'
    );
    if (choice.action !== 'stop-generating') return false;
    const { stopped } = await jsonRequest<{ stopped: number }>(
        `/assignments/${encodeURIComponent(assignment.id)}/batch-generation/stop`,
        'POST'
    );
    showToast(stopped
        ? `Stopped. ${plural(stopped, 'submission was', 'submissions were')} taken out of the queue.`
        : 'Nothing was waiting; any submission still generating will finish.');
    return true;
}

/**
 * renderBatchStart - the "Generate feedback for all submissions" action for the page header.
 *
 * Sits with the assignment's other actions rather than above the list, because all three act
 * on the assignment as a whole. It is hidden for as long as a run is in flight, when the
 * progress strip below carries both the count and the way to stop it.
 *
 * @param assignment - Assignment to generate for
 * @param options - Assignment page callbacks
 * @returns Detached button, styled as a header action by its caller
 */
export function renderBatchStart(assignment: Assignment, options: BatchBarOptions): HTMLButtonElement {
    const start = createButton('Generate feedback for all submissions', 'secondary', async () => {
        if (await startBatch(assignment)) await options.onChanged();
    }, false, 'zap');
    // Styled like the workspace's "Import assignment from Canvas" action, which it matches in
    // importance; the second class is what the progress strip's CSS and this module's tests find.
    start.className = 'wf-header-btn wf-batch-bar__start';
    startControl = start;
    return start;
}

/**
 * renderBatchBar - the progress strip above the submission list: what is running, and Stop.
 *
 * @param assignment - Assignment whose list the strip sits above
 * @param submissions - The list as just loaded
 * @param options - Assignment page callbacks
 * @returns Detached strip, hidden unless something is generating; call {@link updateBatchBar}
 *          when the list changes
 */
export function renderBatchBar(assignment: Assignment, submissions: Submission[], options: BatchBarOptions): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'wf-batch-bar';
    const status = createText('p', '', 'wf-batch-bar__status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const stop = createButton('Stop generating', 'outline', async () => {
        if (await stopBatch(assignment)) await options.onChanged();
    }, false, 'square');
    stop.classList.add('wf-batch-bar__stop');
    const actions = document.createElement('div');
    actions.className = 'wf-button-row';
    actions.append(stop);
    bar.append(status, actions);
    updateBatchBar(bar, submissions);
    return bar;
}

/**
 * updateBatchBar - shows the strip while anything generates, and the header action otherwise.
 *
 * The two are never on screen together: starting a run is meaningless while one is running,
 * and a strip reporting nothing is a tinted empty band above the list.
 *
 * @param bar - Strip from {@link renderBatchBar}
 * @param submissions - Current list
 */
export function updateBatchBar(bar: HTMLElement, submissions: Submission[]): void {
    const text = batchProgressText(submissions);
    const status = bar.querySelector<HTMLElement>('.wf-batch-bar__status');
    if (status && status.textContent !== text) status.textContent = text;
    bar.hidden = !text;
    const stop = bar.querySelector<HTMLButtonElement>('.wf-batch-bar__stop');
    if (stop) stop.hidden = !text;
    // The header control may have been replaced by a re-render since it was recorded.
    if (startControl?.isConnected) startControl.hidden = Boolean(text);
}

/**
 * stopFollowingGeneration - cancels the list poll, if one is running.
 */
export function stopFollowingGeneration(): void {
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    pollTimer = null;
}

/**
 * followGeneration - re-reads the list while anything is generating and updates rows in place.
 *
 * Rows are matched by `data-submission-id`; only their status chip changes, so the list keeps
 * its order until staff reload it. Polling ends once nothing is generating, or when the list
 * leaves the page (staff went back to the queue, or opened a submission).
 *
 * @param assignment - Assignment being followed
 * @param panel - Container holding the assignment page's submission rows
 * @param submissions - The list as just rendered
 */
export function followGeneration(assignment: Assignment, panel: HTMLElement, submissions: Submission[]): void {
    stopFollowingGeneration();
    if (!submissions.some((item) => item.status === 'generating')) return;

    const poll = async (): Promise<void> => {
        pollTimer = null;
        if (!panel.isConnected || state.activeAssignmentId !== assignment.id) return;
        let latest: Submission[];
        try {
            latest = await request<Submission[]>(`/submissions?assignmentId=${encodeURIComponent(assignment.id)}`);
        } catch {
            // A missed poll is not worth an error dialog; try again on the next interval.
            pollTimer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
            return;
        }
        if (!panel.isConnected || state.activeAssignmentId !== assignment.id) return;
        for (const submission of latest) {
            const row = panel.querySelector<HTMLElement>(`.wf-submission-row[data-submission-id="${CSS.escape(submission.id)}"]`);
            const current = row?.querySelector<HTMLElement>('.wf-chip[data-status]');
            if (!current || current.dataset.status === submission.status) continue;
            current.replaceWith(statusChip(submission));
        }
        const bar = panel.querySelector<HTMLElement>('.wf-batch-bar');
        if (bar) updateBatchBar(bar, latest);
        if (latest.some((item) => item.status === 'generating')) {
            pollTimer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
        }
    };
    pollTimer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
}

/**
 * statusChip - a submission's status chip, tagged so the poll can find and replace it.
 *
 * @param submission - Submission whose status is shown
 * @returns Chip element
 */
export function statusChip(submission: Submission): HTMLElement {
    const node = chip(STATUS_LABELS[submission.status], STATUS_TONES[submission.status]);
    node.dataset.status = submission.status;
    return node;
}
