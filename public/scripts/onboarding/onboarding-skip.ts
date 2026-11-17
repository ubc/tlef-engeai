/**
 * onboarding-skip.ts
 *
 * Client for Skip tutorial: the confirmation modal and the own-record write.
 *
 * Staff who already know EngE-AI had no way out of the seven-stage tutorial. The exit is
 * the footer's Skip tutorial button on every skippable stage; it is never offered
 * unprompted.
 *
 * @author: @rdschrs
 * @date: 2026-09-18
 */

import { SKIP_TUTORIAL_CONFIRM_ACTION, showErrorModal, showSkipTutorialModal } from '../ui/modal-overlay.js';

/**
 * Marks every remaining instructor tutorial taught on the signed-in user's own record.
 *
 * @throws Error carrying the server's message, so callers can keep the instructor in place
 *         behind an error modal rather than navigating away on a skip that was not recorded
 */
export async function skipRemainingOnboarding(): Promise<void> {
    const response = await fetch('/api/user/onboarding/skip-remaining', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
    });

    const data = await response.json().catch(() => ({ error: 'Failed to skip instructor onboarding' }));
    if (!response.ok || !data?.success) {
        throw new Error(data?.error || `HTTP error! status: ${response.status}`);
    }
}

/**
 * Shows the confirmation and, only on an explicit confirm, performs the write.
 *
 * Escape, the overlay, and the continue button all resolve to `continued`, so the
 * irreversible write needs a deliberate click.
 *
 * @returns `skipped` once the write succeeded; `continued` when staff declined, or when
 *          the write failed and the error modal has been shown
 */
export async function offerSkipTutorial(): Promise<'skipped' | 'continued'> {
    const result = await showSkipTutorialModal();
    if (result.action !== SKIP_TUTORIAL_CONFIRM_ACTION) {
        return 'continued';
    }

    try {
        await skipRemainingOnboarding();
        return 'skipped';
    } catch (error) {
        await showErrorModal(
            'Could not skip the tutorial',
            error instanceof Error && error.message
                ? error.message
                : 'Your choice could not be saved. Please check your connection and try again.'
        );
        return 'continued';
    }
}
