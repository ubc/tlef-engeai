/**
 * TOAST NOTIFICATION SYSTEM
 *
 * A transient notification (toast) that appears in the top-right corner,
 * auto-dismisses after a configurable duration, similar to modal-overlay.
 * Supports success (green), error (red), and default variants.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 */

import type { ToastPosition, ToastType, ToastConfig } from '../types.js';

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
 * Shows a toast notification that auto-dismisses after the specified duration.
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
    const container = document.createElement('div');
    container.className = `toast-container toast-${position}`;

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    // @rdschrs: Added accessible live-region and dismiss controls for feature workflows.
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    toast.setAttribute('aria-atomic', 'true');

    const messageElement = document.createElement('span');
    messageElement.className = 'toast-message';
    messageElement.textContent = message;

    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'toast-dismiss';
    dismissButton.setAttribute('aria-label', 'Dismiss notification');
    dismissButton.textContent = '\u00d7';

    toast.append(messageElement, dismissButton);

    container.appendChild(toast);
    document.body.appendChild(container);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    const dismiss = () => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => {
            if (container.parentNode) {
                container.parentNode.removeChild(container);
            }
        }, 300);
    };

    const timeoutId = setTimeout(dismiss, durationMs);

    toast.addEventListener('click', () => {
        clearTimeout(timeoutId);
        dismiss();
    });
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
