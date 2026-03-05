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

export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export type ToastType = 'default' | 'success' | 'error';

export interface ToastConfig {
    message: string;
    durationMs?: number;
    position?: ToastPosition;
    type?: ToastType;
}

/**
 * Shows a toast notification that auto-dismisses after the specified duration.
 *
 * @param message - The message to display
 * @param durationMs - Duration in milliseconds (default: 3000)
 * @param position - Position on screen (default: 'top-right')
 * @param type - Toast variant: 'default', 'success' (green CHBE), or 'error' (red ubc-eng-red)
 */
export function showToast(
    message: string,
    durationMs: number = 3000,
    position: ToastPosition = 'top-right',
    type: ToastType = 'default'
): void {
    const container = document.createElement('div');
    container.className = `toast-container toast-${position}`;

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;

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
    showToast(message, durationMs ?? 3000, 'top-right', 'success');
}

/**
 * Shows an error toast (red ubc-eng-red styling).
 */
export function showErrorToast(message: string, durationMs?: number): void {
    showToast(message, durationMs ?? 4000, 'top-right', 'error');
}

export default { showToast, showSuccessToast, showErrorToast };
