/**
 * TOAST NOTIFICATION SYSTEM
 *
 * A transient notification (toast) that appears in the top-right corner and
 * auto-dismisses after a configurable duration. Supports success (green),
 * error (red), and default variants.
 *
 * Every toast is written into one live region (`#toast-region`, `role="status"`) that the page
 * ships empty. Screen readers only announce changes to a live region that already exists, so the
 * region is never created alongside its message; each new toast replaces the previous one.
 *
 * @author: EngE-AI Team
 * @version: 2.0.0
 */

import type { ToastPosition, ToastType, ToastConfig } from '../types.js';

const TOAST_REGION_ID = 'toast-region';

/** Timer that dismisses the toast currently on screen; cleared when a newer toast replaces it. */
let dismissTimeoutId: ReturnType<typeof setTimeout> | undefined;

/**
 * readingDurationMs - how long a toast stays up when its caller does not say.
 *
 * A fixed few seconds suits "Changes saved." but takes a long sentence away before it can be
 * read, so the time grows with the message: two seconds to notice the toast, then about
 * 200 words a minute, never less than `minimumMs` and never more than 12 seconds.
 *
 * @param message - The text the toast shows
 * @param minimumMs - Shortest time the toast stays up
 * @returns Milliseconds before the toast dismisses itself
 */
export function readingDurationMs(message: string, minimumMs = 4000): number {
    return Math.min(12000, Math.max(minimumMs, 2000 + message.length * 60));
}

/**
 * Returns the page's toast live region. Pages that show toasts include it in their HTML; if one
 * does not, the region is created here, though its first message may then go unannounced.
 */
function getToastRegion(): HTMLElement {
    const existing = document.getElementById(TOAST_REGION_ID);
    if (existing) return existing;

    const region = document.createElement('div');
    region.id = TOAST_REGION_ID;
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    document.body.appendChild(region);
    return region;
}

/**
 * Shows a toast notification that auto-dismisses after the specified duration, replacing any
 * toast already on screen.
 *
 * @param message - The message to display
 * @param durationMs - Duration in milliseconds (default: long enough to read the message)
 * @param position - Position on screen (default: 'top-right')
 * @param type - Toast variant: 'default', 'success' (green CHBE), or 'error' (red ubc-eng-red)
 */
export function showToast(
    message: string,
    durationMs: number = readingDurationMs(message),
    position: ToastPosition = 'top-right',
    type: ToastType = 'default'
): void {
    const region = getToastRegion();
    clearTimeout(dismissTimeoutId);
    region.className = `toast-region toast-${position}`;

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;

    // Remove whatever the region holds, then add the new message in the same step.
    region.replaceChildren(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    dismissTimeoutId = setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        // Leave the region empty once the slide-out finishes.
        setTimeout(() => toast.remove(), 300);
    }, durationMs);
}

/**
 * Shows a success toast (green CHBE styling).
 */
export function showSuccessToast(message: string, durationMs?: number): void {
    showToast(message, durationMs ?? readingDurationMs(message), 'top-right', 'success');
}

/**
 * Shows an error toast (red ubc-eng-red styling).
 */
export function showErrorToast(message: string, durationMs?: number): void {
    showToast(message, durationMs ?? readingDurationMs(message, 5000), 'top-right', 'error');
}

export default { showToast, showSuccessToast, showErrorToast };
