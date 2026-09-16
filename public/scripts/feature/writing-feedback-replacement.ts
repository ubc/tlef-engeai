/**
 * Writing Feedback resubmission notice
 *
 * A Canvas sync holds a student's newer attempt beside the submission already in the queue.
 * This notice asks staff which attempt to review, and appears both under the queue row and at
 * the top of the review page, so the choice is offered wherever staff meet the submission.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Builds the "use newer attempt / keep current attempt" notice and applies the choice.
 */

import { showConfirmModal } from '../ui/modal-overlay.js';
import { showSuccessToast } from '../ui/toast-notification.js';
import {
    ReplacementDecision,
    Submission,
    createButton,
    createText,
    formatDate,
    jsonRequest
} from './writing-feedback-shared.js';

/** Where the notice is shown, and what that view does once staff have chosen. */
export interface ReplacementNoticeOptions {
    /**
     * Runs before a `use_newer` request; returning `false` cancels it. The review page uses it
     * to settle unsaved edits, since the submission they belong to is about to be replaced.
     */
    beforeUseNewer?: () => Promise<boolean>;
    /** Refreshes the view with the student's submission as it now stands. */
    onResolved: (decision: ReplacementDecision, active: Submission) => Promise<void>;
}

/**
 * replacementConfirmation - what staff lose by switching to the newer attempt
 *
 * Returns `null` when nothing staff did is lost, so the switch needs no confirmation.
 *
 * @param submission - Current submission with a held newer attempt
 * @returns Confirmation copy, or `null`
 */
function replacementConfirmation(submission: Submission): string | null {
    const current = `attempt ${submission.attempt}`;
    const newer = `attempt ${submission.pendingReplacement!.attempt}`;
    const nextSteps = submission.pendingReplacement!.sourceType === 'digital_file'
        ? `You will need to verify the text of ${newer} and generate new feedback for it.`
        : `You will need to generate new feedback for ${newer}.`;
    switch (submission.status) {
        case 'draft_ready':
            return `The feedback draft and your edits for ${current} will be discarded. ${nextSteps}`;
        case 'approved':
            return `The approved feedback and your edits for ${current} will be discarded, and the approval removed. ${nextSteps}`;
        case 'released':
            return `Feedback for ${current} has already been released to Canvas. Releasing feedback for ${newer} will replace the grade in Canvas, and the comments already posted on ${current} will stay visible to the student. ${nextSteps}`;
        default:
            return null;
    }
}

/**
 * renderReplacementNotice - asks staff which of a student's two attempts to review
 *
 * @param submission - Current submission carrying `pendingReplacement`
 * @param options - View-specific hooks run around the choice
 * @returns Detached notice element
 */
export function renderReplacementNotice(submission: Submission, options: ReplacementNoticeOptions): HTMLElement {
    const pending = submission.pendingReplacement!;
    const notice = document.createElement('div');
    notice.className = 'wf-replacement-notice';
    const submitted = pending.submittedAt ? `, submitted ${formatDate(pending.submittedAt, true)}` : '';
    notice.append(createText(
        'span',
        `This student resubmitted in Canvas (attempt ${pending.attempt}${submitted}). Which attempt should be reviewed?`
    ));

    const decide = async (decision: ReplacementDecision): Promise<void> => {
        if (decision === 'use_newer') {
            const warning = replacementConfirmation(submission);
            if (warning) {
                const choice = await showConfirmModal(`Use attempt ${pending.attempt}?`, warning, 'Use newer attempt', 'Cancel', 'danger');
                if (choice.action !== 'use-newer-attempt') return;
            }
            if (options.beforeUseNewer && !(await options.beforeUseNewer())) return;
        }
        const active = await jsonRequest<Submission>(`/submissions/${encodeURIComponent(submission.id)}/replacement`, 'POST', { decision });
        await options.onResolved(decision, active);
        showSuccessToast(decision === 'use_newer'
            ? `Now reviewing attempt ${pending.attempt}.`
            : `Keeping attempt ${submission.attempt}. Attempt ${pending.attempt} was discarded and will not be imported again.`);
    };

    const actions = document.createElement('div');
    actions.className = 'wf-button-row';
    const useNewer = createButton(`Use attempt ${pending.attempt}`, 'primary', async () => decide('use_newer'));
    // The server refuses this too; disabling says why before anyone clicks.
    if (submission.status === 'generating') {
        useNewer.disabled = true;
        useNewer.title = 'Wait for feedback generation to finish';
    }
    actions.append(useNewer, createButton(`Keep attempt ${submission.attempt}`, 'secondary', async () => decide('keep_current')));
    notice.append(actions);
    return notice;
}
