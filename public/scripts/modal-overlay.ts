/**
 * MODAL OVERLAY SYSTEM
 * 
 * This module provides a comprehensive modal overlay system for EngE-AI.
 * It supports various types of modals including error, warning, success, info,
 * disclaimer, and custom content modals.
 * 
 * FEATURES:
 * - Multiple modal types (error, warning, success, info, disclaimer, custom)
 * - Keyboard navigation support (ESC to close, Tab navigation)
 * - Focus management and accessibility
 * - Responsive design
 * - Animation support
 * - Promise-based API for user interactions
 * 
 * @author: gatahcha
 * @date: 2025-01-27
 * @version: 1.0.0
 */

// ===========================================
// TYPE DEFINITIONS
// ===========================================

/**
 * Available modal types
 */
export type ModalType = 'error' | 'warning' | 'success' | 'info' | 'disclaimer' | 'custom';

/**
 * Button configuration for modal footer
 */
export interface ModalButton {
    text: string;
    type: 'primary' | 'secondary' | 'outline' | 'danger';
    action?: () => void | Promise<void>;
    closeOnClick?: boolean;
}

/**
 * Configuration options for creating a modal
 */
export interface ModalConfig {
    type: ModalType;
    title: string;
    content: string | HTMLElement;
    buttons?: ModalButton[];
    showCloseButton?: boolean;
    closeOnOverlayClick?: boolean;
    closeOnEscape?: boolean;
    maxWidth?: string;
    customClass?: string;
}

/**
 * Result of modal interaction
 */
export interface ModalResult {
    action: string;
    data?: any;
}

// ===========================================
// MODAL OVERLAY CLASS
// ===========================================

export class ModalOverlay {
    private overlay: HTMLElement | null = null;
    private container: HTMLElement | null = null;
    private resolvePromise: ((result: ModalResult) => void) | null = null;
    private rejectPromise: ((error: Error) => void) | null = null;
    private isVisible = false;
    private focusableElements: HTMLElement[] = [];
    private lastFocusedElement: HTMLElement | null = null;

    /**
     * Creates and shows a modal with the specified configuration
     * 
     * @param config - Modal configuration
     * @returns Promise that resolves when modal is closed
     */
    public async show(config: ModalConfig): Promise<ModalResult> {
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
            
            this.createModal(config);
            this.showModal();
        });
    }

    /**
     * Creates the modal DOM structure
     * 
     * @param config - Modal configuration
     */
    private createModal(config: ModalConfig): void {
        // Store the currently focused element
        this.lastFocusedElement = document.activeElement as HTMLElement;

        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.setAttribute('role', 'dialog');
        this.overlay.setAttribute('aria-modal', 'true');
        this.overlay.setAttribute('aria-labelledby', 'modal-title');

        // Create container
        this.container = document.createElement('div');
        this.container.className = `modal-container modal-${config.type}`;
        
        if (config.customClass) {
            this.container.classList.add(config.customClass);
        }

        if (config.maxWidth) {
            this.container.style.maxWidth = config.maxWidth;
        }

        // Create header
        const header = this.createHeader(config);
        this.container.appendChild(header);

        // Create body
        const body = this.createBody(config);
        this.container.appendChild(body);

        // Create footer
        if (config.buttons && config.buttons.length > 0) {
            const footer = this.createFooter(config.buttons);
            this.container.appendChild(footer);
        }

        this.overlay.appendChild(this.container);
        document.body.appendChild(this.overlay);

        // Set up event listeners
        this.setupEventListeners(config);
    }

    /**
     * Creates the modal header
     * 
     * @param config - Modal configuration
     * @returns Header element
     */
    private createHeader(config: ModalConfig): HTMLElement {
        const header = document.createElement('div');
        header.className = 'modal-header';

        const title = document.createElement('h2');
        title.id = 'modal-title';
        title.className = 'modal-title';
        title.textContent = config.title;

        header.appendChild(title);

        if (config.showCloseButton !== false) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close-btn';
            closeBtn.innerHTML = '×';
            closeBtn.setAttribute('aria-label', 'Close modal');
            closeBtn.addEventListener('click', () => this.close('close'));

            header.appendChild(closeBtn);
            this.focusableElements.push(closeBtn);
        }

        return header;
    }

    /**
     * Creates the modal body
     * 
     * @param config - Modal configuration
     * @returns Body element
     */
    private createBody(config: ModalConfig): HTMLElement {
        const body = document.createElement('div');
        body.className = 'modal-body';

        const content = document.createElement('div');
        content.className = 'modal-content';

        if (typeof config.content === 'string') {
            content.innerHTML = config.content;
        } else {
            content.appendChild(config.content);
        }

        body.appendChild(content);
        return body;
    }

    /**
     * Creates the modal footer with buttons
     * 
     * @param buttons - Array of button configurations
     * @returns Footer element
     */
    private createFooter(buttons: ModalButton[]): HTMLElement {
        const footer = document.createElement('div');
        footer.className = 'modal-footer';

        buttons.forEach((buttonConfig, index) => {
            const button = document.createElement('button');
            button.className = `modal-btn modal-btn-${buttonConfig.type}`;
            button.textContent = buttonConfig.text;
            button.setAttribute('data-action', buttonConfig.text.toLowerCase().replace(/\s+/g, '-'));

            button.addEventListener('click', async () => {
                try {
                    if (buttonConfig.action) {
                        await buttonConfig.action();
                    }
                    
                    if (buttonConfig.closeOnClick !== false) {
                        this.close(buttonConfig.text.toLowerCase().replace(/\s+/g, '-'));
                    }
                } catch (error) {
                    console.error('Error in button action:', error);
                    this.rejectPromise?.(error as Error);
                }
            });

            footer.appendChild(button);
            this.focusableElements.push(button);
        });

        return footer;
    }

    /**
     * Sets up event listeners for the modal
     * 
     * @param config - Modal configuration
     */
    private setupEventListeners(config: ModalConfig): void {
        if (!this.overlay) return;

        // Overlay click to close
        if (config.closeOnOverlayClick !== false) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.close('overlay');
                }
            });
        }

        // Escape key to close
        if (config.closeOnEscape !== false) {
            const escapeHandler = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    this.close('escape');
                }
            };
            
            document.addEventListener('keydown', escapeHandler);
            this.overlay.setAttribute('data-escape-handler', 'true');
        }

        // Tab navigation
        this.overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                this.handleTabNavigation(e);
            }
        });
    }

    /**
     * Handles tab navigation within the modal
     * 
     * @param e - Keyboard event
     */
    private handleTabNavigation(e: KeyboardEvent): void {
        if (this.focusableElements.length === 0) return;

        const firstElement = this.focusableElements[0];
        const lastElement = this.focusableElements[this.focusableElements.length - 1];

        if (e.shiftKey) {
            // Shift + Tab (backward)
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            // Tab (forward)
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    }

    /**
     * Shows the modal with animation
     */
    private showModal(): void {
        if (!this.overlay) return;

        // Trigger reflow
        this.overlay.offsetHeight;

        // Show modal
        this.overlay.classList.add('show');
        this.isVisible = true;

        // Focus first focusable element
        if (this.focusableElements.length > 0) {
            this.focusableElements[0].focus();
        } else {
            this.overlay.focus();
        }

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    /**
     * Closes the modal
     * 
     * @param action - Action that triggered the close
     */
    public close(action: string = 'close'): void {
        if (!this.overlay || !this.isVisible) return;

        this.isVisible = false;

        // Remove escape key listener
        const escapeHandler = this.overlay.getAttribute('data-escape-handler');
        if (escapeHandler) {
            document.removeEventListener('keydown', this.handleEscapeKey);
        }

        // Hide modal with animation
        this.overlay.classList.remove('show');
        this.overlay.classList.add('hide');

        // Restore body scroll
        document.body.style.overflow = '';

        // Restore focus
        if (this.lastFocusedElement) {
            this.lastFocusedElement.focus();
        }

        // Clean up after animation
        setTimeout(() => {
            if (this.overlay && this.overlay.parentNode) {
                this.overlay.parentNode.removeChild(this.overlay);
            }
            this.cleanup();
        }, 300);

        // Resolve promise
        this.resolvePromise?.({ action, data: null });
    }

    /**
     * Handles escape key press
     * 
     * @param e - Keyboard event
     */
    private handleEscapeKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            this.close('escape');
        }
    };

    /**
     * Cleans up modal resources
     */
    private cleanup(): void {
        this.overlay = null;
        this.container = null;
        this.focusableElements = [];
        this.lastFocusedElement = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
    }
}

// ===========================================
// CONVENIENCE FUNCTIONS
// ===========================================

/**
 * Global modal instance
 */
let globalModal: ModalOverlay | null = null;

/**
 * Gets or creates the global modal instance
 * 
 * @returns Modal overlay instance
 */
function getModal(): ModalOverlay {
    if (!globalModal) {
        globalModal = new ModalOverlay();
    }
    return globalModal;
}

/**
 * Shows an error modal
 * 
 * @param title - Modal title
 * @param message - Error message
 * @param buttons - Optional custom buttons
 * @returns Promise that resolves when modal is closed
 */
export async function showErrorModal(
    title: string = 'Error',
    message: string,
    buttons?: ModalButton[]
): Promise<ModalResult> {
    const modal = getModal();
    return modal.show({
        type: 'error',
        title,
        content: message,
        buttons: buttons || [
            { text: 'OK', type: 'primary', closeOnClick: true }
        ]
    });
}

/**
 * Shows a warning modal
 * 
 * @param title - Modal title
 * @param message - Warning message
 * @param buttons - Optional custom buttons
 * @returns Promise that resolves when modal is closed
 */
export async function showWarningModal(
    title: string = 'Warning',
    message: string,
    buttons?: ModalButton[]
): Promise<ModalResult> {
    const modal = getModal();
    return modal.show({
        type: 'warning',
        title,
        content: message,
        buttons: buttons || [
            { text: 'OK', type: 'primary', closeOnClick: true }
        ]
    });
}

/**
 * Shows a success modal
 * 
 * @param title - Modal title
 * @param message - Success message
 * @param buttons - Optional custom buttons
 * @returns Promise that resolves when modal is closed
 */
export async function showSuccessModal(
    title: string = 'Success',
    message: string,
    buttons?: ModalButton[]
): Promise<ModalResult> {
    const modal = getModal();
    return modal.show({
        type: 'success',
        title,
        content: message,
        buttons: buttons || [
            { text: 'OK', type: 'primary', closeOnClick: true }
        ]
    });
}

/**
 * Shows an info modal
 * 
 * @param title - Modal title
 * @param message - Info message
 * @param buttons - Optional custom buttons
 * @returns Promise that resolves when modal is closed
 */
export async function showInfoModal(
    title: string = 'Information',
    message: string,
    buttons?: ModalButton[]
): Promise<ModalResult> {
    const modal = getModal();
    return modal.show({
        type: 'info',
        title,
        content: message,
        buttons: buttons || [
            { text: 'OK', type: 'primary', closeOnClick: true }
        ]
    });
}

/**
 * Shows a confirmation modal
 * 
 * @param title - Modal title
 * @param message - Confirmation message
 * @param confirmText - Text for confirm button
 * @param cancelText - Text for cancel button
 * @returns Promise that resolves with user choice
 */
export async function showConfirmModal(
    title: string = 'Confirm',
    message: string,
    confirmText: string = 'Confirm',
    cancelText: string = 'Cancel'
): Promise<ModalResult> {
    const modal = getModal();
    return modal.show({
        type: 'info',
        title,
        content: message,
        buttons: [
            { text: cancelText, type: 'secondary', closeOnClick: true },
            { text: confirmText, type: 'primary', closeOnClick: true }
        ]
    });
}

/**
 * Shows a disclaimer modal
 * 
 * @param title - Modal title
 * @param content - Disclaimer content (HTML string)
 * @param buttons - Optional custom buttons
 * @returns Promise that resolves when modal is closed
 */
export async function showDisclaimerModal(
    title: string = 'Disclaimer',
    content: string,
    buttons?: ModalButton[]
): Promise<ModalResult> {
    const modal = getModal();
    return modal.show({
        type: 'disclaimer',
        title,
        content,
        maxWidth: '600px',
        buttons: buttons || [
            { text: 'I Understand', type: 'primary', closeOnClick: true }
        ]
    });
}

/**
 * Shows a help modal with step-specific information
 * 
 * @param stepNumber - Current step number
 * @param title - Modal title
 * @param content - Help content (HTML string)
 * @returns Promise that resolves when modal is closed
 */
export async function showHelpModal(
    stepNumber: number,
    title: string = 'Help',
    content: string
): Promise<ModalResult> {
    const modal = getModal();
    return modal.show({
        type: 'info',
        title: `Step ${stepNumber}: ${title}`,
        content,
        maxWidth: '500px',
        buttons: [
            { text: 'Got it!', type: 'primary', closeOnClick: true }
        ]
    });
}

/**
 * Shows a custom modal
 * 
 * @param config - Modal configuration
 * @returns Promise that resolves when modal is closed
 */
export async function showCustomModal(config: ModalConfig): Promise<ModalResult> {
    const modal = getModal();
    return modal.show(config);
}

/**
 * Closes the currently open modal
 * 
 * @param action - Action that triggered the close
 */
export function closeModal(action: string = 'close'): void {
    if (globalModal) {
        globalModal.close(action);
    }
}

// ===========================================
// EXPORT DEFAULT
// ===========================================

export default {
    ModalOverlay,
    showErrorModal,
    showWarningModal,
    showSuccessModal,
    showInfoModal,
    showConfirmModal,
    showDisclaimerModal,
    showHelpModal,
    showCustomModal,
    closeModal
};
