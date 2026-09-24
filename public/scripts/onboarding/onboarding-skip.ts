/**
 * onboarding-skip.ts
 *
 * Client for Skip tutorial: the confirmation modal, the own-record write, and the
 * session-scoped memory of having already been offered the exit.
 *
 * Staff who already know EngE-AI had no way out of the seven-stage tutorial. The offer
 * appears once unprompted, on entry to the first skippable stage, and after that as a
 * footer button on every skippable stage — so declining only needs to be remembered for
 * the browser session.
 *
 * @author: @rdschrs
 * @date: 2026-09-18
 */

import { SKIP_TUTORIAL_CONFIRM_ACTION, showErrorModal, showSkipTutorialModal } from '../ui/modal-overlay.js';

/** Session key recording that the unprompted offer has already been shown. */
export const SKIP_PROMPT_SESSION_KEY = 'engeai.onboarding.skipPromptSeen';

/** Storage surface this module needs; injectable so it is testable without a DOM. */
type PromptStore = Pick<Storage, 'getItem' | 'setItem'>;

/** Session storage when available; a private window or blocked site data yields null. */
function defaultStore(): PromptStore | null {
    try {
        return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
        return null;
    }
}

/**
 * True when the unprompted offer has already been shown this session.
 *
 * A storage that throws reads as unseen: offering the exit once more is a smaller failure
 * than never offering it at all.
 *
 * @param storage - store to read; defaults to session storage
 */
export function hasSeenSkipPrompt(storage: PromptStore | null = defaultStore()): boolean {
    try {
        return storage?.getItem(SKIP_PROMPT_SESSION_KEY) === 'true';
    } catch {
        return false;
    }
}

/**
 * Records that the unprompted offer has been shown. Never throws.
 *
 * @param storage - store to write; defaults to session storage
 */
export function markSkipPromptSeen(storage: PromptStore | null = defaultStore()): void {
    try {
        storage?.setItem(SKIP_PROMPT_SESSION_KEY, 'true');
    } catch {
        // A blocked store costs one extra prompt; it must never break the tutorial.
    }
}

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
