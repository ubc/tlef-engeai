/**
 * admin-edit-button.ts
 *
 * Triple-dot button that opens the edit modal directly (no intermediate menu).
 */

export interface AdminEditButtonOptions {
    ariaLabel: string;
    onClick: () => void;
}

/**
 * Renders a feather more-vertical button that triggers edit on click.
 */
export function createAdminEditButton(options: AdminEditButtonOptions): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-row-menu-btn';
    button.setAttribute('aria-label', options.ariaLabel);
    button.innerHTML = '<i data-feather="more-vertical"></i>';

    button.addEventListener('click', (e) => {
        e.stopPropagation();
        options.onClick();
    });

    return button;
}
