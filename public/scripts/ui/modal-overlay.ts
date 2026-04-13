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

import type { ModalType, ModalButton, ModalConfig, ModalResult } from '../types.js';

/** Payload passed to {@link openContentInputModal} submit handler */
export interface ContentInputPayload {
    name: string;
    sourceType: 'file' | 'text';
    file: File | null;
    text: string;
    fileName?: string;
}

/** Result from submit handler; drives loading/success modals */
export interface ContentInputSubmitResult {
    success: boolean;
    chunksGenerated?: number;
    successTitle?: string;
    successMessage?: string;
    /** If true, do not show {@link showSuccessModal} after close */
    skipSuccessModal?: boolean;
}

export interface ContentInputModalStrings {
    nameLabel?: string;
    namePlaceholder?: string;
    textLabel?: string;
    textPlaceholder?: string;
    submitLabel?: string;
    cancelLabel?: string;
    nameRequiredMessage?: string;
    fileRequiredMessage?: string;
    textRequiredMessage?: string;
}

export interface ContentInputInitialValues {
    title: string;
    text: string;
    method?: 'file' | 'text';
}

export interface ContentInputModalOptions {
    title: string;
    /** Edit mode: prefilled fields, Save disabled until dirty, confirm on close */
    mode?: 'create' | 'edit';
    initialValues?: ContentInputInitialValues;
    initialMethod?: 'file' | 'text';
    strings?: ContentInputModalStrings;
    /** HTML file input accept attribute (default: document types) */
    fileAccept?: string;
    /** When source is text, allow empty textarea (matches prompt POST APIs). Default false. */
    allowEmptyText?: boolean;
    onSubmit: (payload: ContentInputPayload) => Promise<ContentInputSubmitResult | void>;
    /** Copy for {@link showContentLoadingModal} while onSubmit runs */
    loadingContent?: {
        title: string;
        line1: string;
        line2: string;
    };
}

const CONTENT_INPUT_MODAL_MOUNT_ID = 'upload-modal-mount';

function getOrCreateContentInputModalMount(): HTMLElement | null {
    let el = document.getElementById(CONTENT_INPUT_MODAL_MOUNT_ID);
    if (!el) {
        el = document.createElement('div');
        el.id = CONTENT_INPUT_MODAL_MOUNT_ID;
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
    }
    return el;
}

// ===========================================
// MODAL OVERLAY CLASS
// ===========================================

export class ModalOverlay {
    private overlay: HTMLElement | null = null;
    private container: HTMLElement | null = null;
    private resolvePromise: ((result: ModalResult) => void) | null = null;
    private rejectPromise: ((error: Error) => void) | null = null;
    public isVisible = false;
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

        // Tab navigation (overlay-level)
        this.overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                this.handleTabNavigation(e);
            } else if (e.key === ' ' || e.key === 'Spacebar') {
                // Handle Space key for success modals
                const modalType = this.getModalType();
                if (modalType === 'success') {
                    const activeElement = document.activeElement;
                    // Don't handle Space if user is typing in an input field
                    if (activeElement &&
                        (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleEnterKey(e); // Reuse Enter key logic for Space
                }
            }
        });

        // Enter key handling (document-level, like Escape)
        document.addEventListener('keydown', this.handleEnterKey);
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
     * Handles Enter key press within the modal
     *
     * @param e - Keyboard event
     */
    private handleEnterKey = (e: KeyboardEvent): void => {
        // Only handle Enter when this modal is visible
        if (!this.isVisible || e.key !== 'Enter') return;

        // Don't handle Enter if user is typing in an input field (except buttons)
        const activeElement = document.activeElement;
        if (activeElement &&
            (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') &&
            activeElement.getAttribute('type') !== 'button') {
            return; // Let the input handle its own Enter key behavior
        }

        // Prevent default behavior (form submission, etc.) and stop propagation
        e.preventDefault();
        e.stopPropagation();

        // Modal-specific Enter key handling based on modal type
        if (!this.container) return;

        const modalType = this.getModalType();
        const action = this.determineEnterAction(modalType);

        if (action) {
            // For delete confirmation modals, find and click the danger button
            if (action === 'delete') {
                const dangerButton = this.focusableElements.find(element =>
                    element.tagName === 'BUTTON' && element.classList.contains('modal-btn-danger')
                );

                if (dangerButton) {
                    // Simulate a click on the danger button to execute its action
                    (dangerButton as HTMLButtonElement).click();
                    return;
                }
            }

            // For other modals, find the appropriate button to click
            // First try primary button
            const primaryButton = this.focusableElements.find(element =>
                element.tagName === 'BUTTON' && element.classList.contains('modal-btn-primary')
            );

            if (primaryButton) {
                // Simulate a click on the primary button
                (primaryButton as HTMLButtonElement).click();
                return;
            }

            // Fallback: click the first button
            const firstButton = this.focusableElements.find(element =>
                element.tagName === 'BUTTON'
            );

            if (firstButton) {
                // Simulate a click on the first button
                (firstButton as HTMLButtonElement).click();
                return;
            }

            // Last resort: directly close modal with the determined action
            this.close(action);
        }
    };

    /**
     * Gets the modal type from the container classes
     * 
     * @returns The modal type
     */
    private getModalType(): ModalType {
        if (!this.container) return 'custom';
        
        const classList = this.container.classList;
        
        if (classList.contains('modal-warning')) return 'warning';
        if (classList.contains('modal-error')) return 'error';
        if (classList.contains('modal-success')) return 'success';
        if (classList.contains('modal-info')) return 'info';
        if (classList.contains('modal-disclaimer')) return 'disclaimer';
        
        return 'custom';
    }

    /**
     * Determines what action should be taken when Enter is pressed
     * 
     * @param modalType - The type of modal
     * @returns The action to take, or null if no action should be taken
     */
    private determineEnterAction(modalType: ModalType): string | null {
        // Check if this is a delete confirmation modal by looking for danger buttons
        const hasDangerButton = this.focusableElements.some(element => 
            element.tagName === 'BUTTON' && element.classList.contains('modal-btn-danger')
        );
        
        // Check if this is a confirmation modal by looking for specific button text
        const hasCancelButton = this.focusableElements.some(element => 
            element.tagName === 'BUTTON' && 
            element.textContent?.toLowerCase().includes('cancel')
        );
        
        // Modal-specific Enter key behavior
        if (hasDangerButton && hasCancelButton) {
            // This is likely a delete confirmation modal
            // Enter should trigger the danger action (Delete)
            return 'delete';
        }
        
        // Check for primary buttons
        const primaryButton = this.focusableElements.find(element => 
            element.tagName === 'BUTTON' && element.classList.contains('modal-btn-primary')
        );
        
        if (primaryButton) {
            // Get the action from the button's data-action or text content
            const action = primaryButton.getAttribute('data-action') || 
                          primaryButton.textContent?.toLowerCase().replace(/\s+/g, '-') || 
                          'confirm';
            return action;
        }
        
        // Fallback: use the first button's action
        const firstButton = this.focusableElements.find(element => 
            element.tagName === 'BUTTON'
        );
        
        if (firstButton) {
            const action = firstButton.getAttribute('data-action') || 
                          firstButton.textContent?.toLowerCase().replace(/\s+/g, '-') || 
                          'confirm';
            return action;
        }
        
        return null;
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
        // Remove document event listeners
        document.removeEventListener('keydown', this.handleEnterKey);
        document.removeEventListener('keydown', this.handleEscapeKey);

        this.overlay = null;
        this.container = null;
        this.focusableElements = [];
        this.lastFocusedElement = null;
        this.resolvePromise = null;
        this.rejectPromise = null;

        // Clear the global modal reference if this was the current global modal
        // This ensures fresh modal instances for consecutive modal calls
        if (globalModal === this) {
            globalModal = null;
        }
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
    // Always create a new modal instance for each call to prevent conflicts
    // between consecutive modals (like delete confirmation -> success modal)
    if (globalModal && globalModal.isVisible) {
        // console.log('⚠️ Modal already open, closing previous modal first'); // 🟢 MEDIUM: Modal state
        globalModal.close('replaced');
    }

    // Create a fresh modal instance
    globalModal = new ModalOverlay();
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
 * @param confirmVariant - Styling for the confirm button (destructive actions use "danger")
 * @returns Promise that resolves with user choice
 */
export async function showConfirmModal(
    title: string = 'Confirm',
    message: string,
    confirmText: string = 'Confirm',
    cancelText: string = 'Cancel',
    confirmVariant: 'primary' | 'danger' = 'primary'
): Promise<ModalResult> {
    const modal = getModal();
    const confirmType = confirmVariant === 'danger' ? 'danger' : 'primary';
    return modal.show({
        type: 'info',
        title,
        content: message,
        buttons: [
            { text: cancelText, type: 'secondary', closeOnClick: true },
            { text: confirmText, type: confirmType, closeOnClick: true }
        ]
    });
}

/**
 * Skip vs continue onboarding: Continue Onboarding (muted), Skip (primary).
 * Resolved `action` values are slugified button labels (e.g. skip, continue-onboarding).
 */
export async function showSkipOnboardingModal(
    title: string,
    message: string
): Promise<ModalResult> {
    const modal = getModal();
    return modal.show({
        type: 'info',
        title,
        content: message,
        maxWidth: '480px',
        buttons: [
            { text: 'Continue Onboarding', type: 'muted', closeOnClick: true },
            { text: 'Skip', type: 'primary', closeOnClick: true }
        ]
    });
}

/**
 * Shows an input modal for text entry
 * 
 * @param title - Modal title
 * @param message - Instruction message
 * @param currentValue - Pre-filled value in the input
 * @param confirmText - Text for confirm button
 * @param cancelText - Text for cancel button
 * @returns Promise that resolves with user's input and action
 */
export async function showInputModal(
    title: string,
    message: string,
    currentValue: string = '',
    confirmText: string = 'Save',
    cancelText: string = 'Cancel'
): Promise<ModalResult> {
    return new Promise((resolve) => {
        const modal = getModal();
        
        // Create input element
        const inputContainer = document.createElement('div');
        inputContainer.style.padding = '20px 0';
        
        if (message) {
            const messageP = document.createElement('p');
            messageP.textContent = message;
            messageP.style.marginBottom = '15px';
            messageP.style.color = 'var(--text-primary)';
            inputContainer.appendChild(messageP);
        }
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentValue;
        input.className = 'modal-input-field';
        input.style.width = '100%';
        input.style.padding = '10px 12px';
        input.style.border = '2px solid #e9ecef';
        input.style.borderRadius = '8px';
        input.style.fontSize = '16px';
        input.style.fontFamily = 'inherit';
        input.style.boxSizing = 'border-box';
        input.style.transition = 'border-color 0.2s ease';
        
        input.addEventListener('focus', () => {
            input.style.borderColor = 'var(--color-chbe-green)';
            input.style.outline = 'none';
        });
        
        input.addEventListener('blur', () => {
            input.style.borderColor = '#e9ecef';
        });
        
        inputContainer.appendChild(input);
        
        // Show modal and focus input after a short delay
        modal.show({
            type: 'info',
            title,
            content: inputContainer,
            buttons: [
                { 
                    text: cancelText, 
                    type: 'secondary', 
                    action: async () => {
                        resolve({ action: 'cancel', data: null });
                    },
                    closeOnClick: true 
                },
                { 
                    text: confirmText, 
                    type: 'primary',
                    action: async () => {
                        const value = input.value.trim();
                        resolve({ action: 'confirm', data: value });
                    },
                    closeOnClick: true 
                }
            ]
        }).then(result => {
            // If modal was closed by other means (ESC, overlay click)
            if (result.action !== 'confirm' && result.action !== 'cancel') {
                resolve({ action: 'cancel', data: null });
            }
        });
        
        // Focus input after modal is shown
        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);
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
 * Shows a simple error modal for general errors
 * 
 * @param message - Error message to display
 * @param title - Optional custom title (defaults to "Error")
 * @returns Promise that resolves when modal is closed
 */
export async function showSimpleErrorModal(message: string, title: string = "Error"): Promise<ModalResult> {
    return showErrorModal(title, message);
}

/**
 * Shows a success modal after document deletion with chunk breakdown
 *
 * @param deletedDocuments - Array of deleted documents with name and chunksDeleted
 * @param totalChunksDeleted - Total number of chunks deleted
 * @returns Promise that resolves when modal is closed
 */
export async function showDeletionSuccessModal(
    deletedDocuments: { name: string; chunksDeleted: number }[],
    totalChunksDeleted: number
): Promise<ModalResult> {
    const title = totalChunksDeleted === 0
        ? 'No chunks were deleted'
        : `${totalChunksDeleted} chunk(s) deleted successfully`;

    const contentEl = document.createElement('div');
    contentEl.className = 'deletion-success-content';

    if (deletedDocuments.length === 0 && totalChunksDeleted === 0) {
        contentEl.textContent = 'No documents with chunks were found to delete.';
    } else if (deletedDocuments.length > 0) {
        const list = document.createElement('ul');
        list.style.margin = '0';
        list.style.paddingLeft = '1.5em';
        list.style.listStyle = 'disc';
        deletedDocuments.forEach((doc) => {
            const li = document.createElement('li');
            const chunkLabel = doc.chunksDeleted === 1 ? 'chunk' : 'chunks';
            li.textContent = `${doc.name}: ${doc.chunksDeleted} ${chunkLabel}`;
            list.appendChild(li);
        });
        contentEl.appendChild(list);
    } else {
        contentEl.textContent = `${totalChunksDeleted} chunk(s) were removed from the vector database.`;
    }

    const modal = getModal();
    return modal.show({
        type: 'success',
        title,
        content: contentEl,
        buttons: [
            { text: 'OK', type: 'primary', closeOnClick: true }
        ]
    });
}

/**
 * Shows a confirmation modal for deletion operations
 * 
 * @param itemType - Type of item being deleted (e.g., "Learning Objective", "Instructor", "TA", "Additional Material")
 * @param itemName - Optional name of the specific item
 * @returns Promise that resolves with user's choice
 */
export async function showDeleteConfirmationModal(itemType: string, itemName?: string): Promise<ModalResult> {
    const message = itemName 
        ? `Are you sure you want to delete this ${itemType.toLowerCase()} "${itemName}"? This action cannot be undone.`
        : `Are you sure you want to delete this ${itemType.toLowerCase()}? This action cannot be undone.`;
    
    const modal = getModal();
    return modal.show({
        type: 'warning',
        title: `Delete ${itemType}`,
        content: message,
        buttons: [
            { text: 'Cancel', type: 'secondary', closeOnClick: true },
            { text: 'Delete', type: 'danger', closeOnClick: true }
        ]
    });
}

const CONTENT_LOADING_MODAL_HTML = (line1: string, line2: string) => `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">📄</div>
                <p style="margin-bottom: 16px; color: var(--text-primary);">
                    ${line1}
                </p>
                <p style="color: var(--text-secondary); font-size: 14px;">
                    ${line2}
                </p>
                <div style="margin-top: 20px;">
                    <div style="width: 100%; height: 4px; background-color: #e0e0e0; border-radius: 2px; overflow: hidden;">
                        <div style="width: 100%; height: 100%; background-color: #4CAF50; animation: progress 3s ease-in-out infinite;"></div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes progress {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(0%); }
                    100% { transform: translateX(100%); }
                }
            </style>
        `;

/**
 * Generic loading modal (upload, save, parse, etc.)
 */
export async function showContentLoadingModal(options?: {
    title?: string;
    line1?: string;
    line2?: string;
}): Promise<ModalResult> {
    const modal = getModal();
    return modal.show({
        type: 'info',
        title: options?.title ?? 'Uploading Document',
        content: CONTENT_LOADING_MODAL_HTML(
            options?.line1 ?? 'Uploading your document...',
            options?.line2 ?? 'Please wait while we process and store your document.'
        ),
        showCloseButton: false,
        closeOnOverlayClick: false,
        closeOnEscape: false,
        maxWidth: '400px'
    });
}

/**
 * Shows an upload loading modal with progress indication
 *
 * @returns Promise that resolves when modal is closed
 */
export async function showUploadLoadingModal(): Promise<ModalResult> {
    return showContentLoadingModal();
}

/**
 * Shows a loading modal for title updates
 * 
 * @param itemType - Type of item being updated (e.g., "Division" or "Section")
 * @returns Promise that resolves when modal is closed
 */
export async function showTitleUpdateLoadingModal(itemType: string = 'Title'): Promise<ModalResult> {
    const modal = getModal();
    return modal.show({
        type: 'info',
        title: 'Updating Title',
        content: `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">⏳</div>
                <p style="margin-bottom: 16px; color: var(--text-primary);">
                    Updating ${itemType.toLowerCase()} title...
                </p>
                <p style="color: var(--text-secondary); font-size: 14px;">
                    Please wait while we save your changes.
                </p>
                <div style="margin-top: 20px;">
                    <div style="width: 100%; height: 4px; background-color: #e0e0e0; border-radius: 2px; overflow: hidden;">
                        <div style="width: 100%; height: 100%; background-color: #4CAF50; animation: progress 3s ease-in-out infinite;"></div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes progress {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(0%); }
                    100% { transform: translateX(100%); }
                }
            </style>
        `,
        showCloseButton: false,
        closeOnOverlayClick: false,
        closeOnEscape: false,
        maxWidth: '400px'
    });
}

/**
 * Shows a chat creation error modal
 * 
 * @param errorMessage - The error message to display
 * @returns Promise that resolves when modal is closed
 */
export async function showChatCreationErrorModal(errorMessage: string): Promise<ModalResult> {
    const modal = getModal();
    return modal.show({
        type: 'error',
        title: 'Failed to Create Chat',
        content: `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <p style="margin-bottom: 16px; color: var(--text-primary);">
                    ${errorMessage}
                </p>
                <p style="color: var(--text-secondary); font-size: 14px;">
                    Please try again or contact support if the problem persists.
                </p>
            </div>
        `,
        buttons: [
            { text: 'Try Again', type: 'primary', closeOnClick: true },
            { text: 'Cancel', type: 'secondary', closeOnClick: true }
        ],
        maxWidth: '400px'
    });
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
// CONTENT INPUT MODAL (shared: documents + prompts)
// ===========================================

/**
 * Shared modal: title + File/Text toggle + name + file or textarea.
 * Mount uses `#upload-modal-mount` when present, otherwise creates it on `document.body`.
 */
export async function openContentInputModal(options: ContentInputModalOptions): Promise<void> {
    const mount = getOrCreateContentInputModalMount();
    if (!mount) {
        console.error('Content input modal mount could not be created.');
        return;
    }

    const isEditMode = options.mode === 'edit';
    if (isEditMode && !options.initialValues) {
        console.error('openContentInputModal: edit mode requires initialValues');
        return;
    }

    const s = options.strings ?? {};
    const nameLabel = s.nameLabel ?? 'Content Title';
    const namePlaceholder = s.namePlaceholder ?? 'Enter a name...';
    const textLabel = s.textLabel ?? 'Content Text';
    const textPlaceholder = s.textPlaceholder ?? 'Enter or paste content here...';
    const cancelLabel = s.cancelLabel ?? 'Cancel';
    const submitLabel = s.submitLabel ?? (isEditMode ? 'Save edit' : 'Submit');
    const initialMethod: 'file' | 'text' = isEditMode
        ? options.initialValues!.method ?? 'text'
        : options.initialMethod ?? 'file';
    const allowEmptyText = options.allowEmptyText ?? false;
    const fileAccept = options.fileAccept ?? '.pdf,.docx,.html,.htm,.md,.txt';
    const loadingDefault = {
        title: 'Uploading Document',
        line1: 'Uploading your document...',
        line2: 'Please wait while we process and store your document.'
    };
    const loading = options.loadingContent ?? loadingDefault;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay upload-modal-overlay';
    mount.innerHTML = '';
    mount.appendChild(overlay);
    document.body.classList.add('modal-open');

    const modal = document.createElement('div');
    modal.className = 'modal-container';
    overlay.appendChild(modal);
    overlay.offsetHeight;
    overlay.classList.add('show');

    const header = document.createElement('div');
    header.className = 'modal-header';
    const titleEl = document.createElement('h2');
    titleEl.className = 'modal-title';
    titleEl.textContent = options.title;

    const headerToggleContainer = document.createElement('div');
    headerToggleContainer.className = 'upload-method-toggle upload-header-toggle';
    headerToggleContainer.id = 'upload-method-toggle';

    const headerFileToggleBtn = document.createElement('button');
    headerFileToggleBtn.type = 'button';
    headerFileToggleBtn.className = 'toggle-option';
    headerFileToggleBtn.setAttribute('data-method', 'file');

    const headerFileIcon = document.createElement('span');
    headerFileIcon.className = 'toggle-icon';
    headerFileIcon.textContent = '📁';
    const headerFileText = document.createElement('span');
    headerFileText.className = 'toggle-text';
    headerFileText.textContent = 'File';
    headerFileToggleBtn.appendChild(headerFileIcon);
    headerFileToggleBtn.appendChild(headerFileText);

    const headerTextToggleBtn = document.createElement('button');
    headerTextToggleBtn.type = 'button';
    headerTextToggleBtn.className = 'toggle-option';
    headerTextToggleBtn.setAttribute('data-method', 'text');
    const headerTextIcon = document.createElement('span');
    headerTextIcon.className = 'toggle-icon';
    headerTextIcon.textContent = '📝';
    const headerTextText = document.createElement('span');
    headerTextText.className = 'toggle-text';
    headerTextText.textContent = 'Text';
    headerTextToggleBtn.appendChild(headerTextIcon);
    headerTextToggleBtn.appendChild(headerTextText);

    if (initialMethod === 'file') {
        headerFileToggleBtn.classList.add('active');
    } else {
        headerTextToggleBtn.classList.add('active');
    }

    headerToggleContainer.appendChild(headerFileToggleBtn);
    headerToggleContainer.appendChild(headerTextToggleBtn);

    const titleToggleWrapper = document.createElement('div');
    titleToggleWrapper.className = 'modal-title-toggle-wrapper';
    titleToggleWrapper.appendChild(titleEl);
    titleToggleWrapper.appendChild(headerToggleContainer);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'upload-close-btn';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    header.appendChild(titleToggleWrapper);
    header.appendChild(closeBtn);

    const content = document.createElement('div');
    content.className = 'modal-content';

    const headerSection = document.createElement('div');
    headerSection.className = 'upload-header-section';

    const section1 = document.createElement('div');
    section1.className = 'form-section form-section-inline';

    const label1 = document.createElement('label');
    label1.className = 'section-label';
    label1.setAttribute('for', 'mat-name');
    label1.textContent = nameLabel;

    const nameInput = document.createElement('input');
    nameInput.id = 'mat-name';
    nameInput.type = 'text';
    nameInput.className = 'text-input';
    nameInput.placeholder = namePlaceholder;
    section1.appendChild(label1);
    section1.appendChild(nameInput);
    headerSection.appendChild(section1);

    const uploadMethodContent = document.createElement('div');
    uploadMethodContent.className = 'upload-method-content active';
    uploadMethodContent.id = 'upload-method-content';

    const fileUploadSection = document.createElement('div');
    fileUploadSection.className = 'form-section';
    fileUploadSection.id = 'file-upload-section';

    const modalUploadCard = document.createElement('div');
    modalUploadCard.className = 'modal-upload-card';

    const uploadFileBtn = document.createElement('button');
    uploadFileBtn.type = 'button';
    uploadFileBtn.className = 'upload-file-btn';
    uploadFileBtn.id = 'upload-file-btn';
    const uploadIcon = document.createElement('span');
    uploadIcon.className = 'upload-icon';
    uploadIcon.textContent = '📁';
    const uploadText = document.createElement('span');
    uploadText.className = 'upload-text';
    uploadText.textContent = 'Choose File';
    uploadFileBtn.appendChild(uploadIcon);
    uploadFileBtn.appendChild(uploadText);

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'file';
    hiddenInput.id = 'hidden-file-input';
    hiddenInput.style.display = 'none';

    const fileSelected = document.createElement('div');
    fileSelected.className = 'file-selected';
    const selectedFileName = document.createElement('span');
    selectedFileName.id = 'selected-file-name';
    selectedFileName.textContent = 'No file selected';
    fileSelected.appendChild(selectedFileName);

    modalUploadCard.appendChild(uploadFileBtn);
    modalUploadCard.appendChild(hiddenInput);
    modalUploadCard.appendChild(fileSelected);
    fileUploadSection.appendChild(modalUploadCard);

    const textInputSection = document.createElement('div');
    textInputSection.className = 'form-section';
    textInputSection.id = 'text-input-section';

    const textLabelEl = document.createElement('label');
    textLabelEl.className = 'section-label';
    textLabelEl.setAttribute('for', 'mat-text');
    textLabelEl.textContent = textLabel;

    const textArea = document.createElement('textarea');
    textArea.id = 'mat-text';
    textArea.className = 'text-area';
    textArea.placeholder = textPlaceholder;
    textInputSection.appendChild(textLabelEl);
    textInputSection.appendChild(textArea);

    uploadMethodContent.appendChild(fileUploadSection);
    uploadMethodContent.appendChild(textInputSection);

    const formColumn = document.createElement('div');
    formColumn.className = 'upload-form-column';
    formColumn.appendChild(headerSection);
    formColumn.appendChild(uploadMethodContent);
    content.appendChild(formColumn);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'upload-cancel-btn';
    cancelBtn.className = 'cancel-btn';
    cancelBtn.textContent = cancelLabel;

    const uploadBtn = document.createElement('button');
    uploadBtn.id = 'upload-submit-btn';
    uploadBtn.type = 'button';
    uploadBtn.className = 'save-btn';
    uploadBtn.textContent = submitLabel;
    if (isEditMode) {
        uploadBtn.classList.add('save-btn--primary');
        uploadBtn.disabled = true;
        uploadBtn.classList.add('save-btn--disabled');
        uploadBtn.setAttribute('aria-disabled', 'true');
    }
    footer.appendChild(cancelBtn);
    footer.appendChild(uploadBtn);

    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(footer);

    if (isEditMode && options.initialValues) {
        nameInput.value = options.initialValues.title;
        textArea.value = options.initialValues.text;
    }

    const snapshotTitle = isEditMode && options.initialValues ? options.initialValues.title.trim() : '';
    const snapshotText = isEditMode && options.initialValues ? options.initialValues.text : '';

    let selectedFile: File | null = null;
    let currentMethod: 'file' | 'text' = initialMethod;

    const close = () => {
        window.removeEventListener('keydown', keyHandler);
        mount.innerHTML = '';
        document.body.classList.remove('modal-open');
    };

    function computeDirty(): boolean {
        if (!isEditMode) return true;
        const titleNow = nameInput.value.trim();
        const textNow = textArea.value;
        if (titleNow !== snapshotTitle) return true;
        if (textNow !== snapshotText) return true;
        if (selectedFile !== null) return true;
        return false;
    }

    function updateDirtyState(): void {
        if (!isEditMode) return;
        const dirty = computeDirty();
        uploadBtn.disabled = !dirty;
        uploadBtn.classList.toggle('save-btn--disabled', !dirty);
        uploadBtn.setAttribute('aria-disabled', dirty ? 'false' : 'true');
    }

    async function requestClose(): Promise<void> {
        if (isEditMode && computeDirty()) {
            const r = await showConfirmModal(
                'Discard changes?',
                'You have unsaved changes. Discard them and close?',
                'Discard',
                'Keep editing'
            );
            if (r.action !== 'discard') return;
        }
        close();
    }

    function keyHandler(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            e.preventDefault();
            void requestClose();
        } else if (e.key === 'Enter') {
            if (isEditMode && uploadBtn.disabled) {
                return;
            }
            const activeElement = document.activeElement;
            if (
                activeElement &&
                (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') &&
                activeElement.getAttribute('type') !== 'button'
            ) {
                return;
            }
            e.preventDefault();
            uploadBtn.click();
        }
    }

    closeBtn.addEventListener('click', () => void requestClose());
    cancelBtn.addEventListener('click', () => void requestClose());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) void requestClose();
    });

    window.addEventListener('keydown', keyHandler);

    const toggleButtons = overlay.querySelectorAll('.toggle-option');
    const fileSectionElement = overlay.querySelector('#file-upload-section') as HTMLElement;
    const textSectionElement = overlay.querySelector('#text-input-section') as HTMLElement;
    const uploadFileBtnElement = overlay.querySelector('#upload-file-btn') as HTMLButtonElement;
    const hiddenInputElement = overlay.querySelector('#hidden-file-input') as HTMLInputElement;
    const selectedFileNameElement = overlay.querySelector('#selected-file-name') as HTMLElement;
    const textAreaElement = overlay.querySelector('#mat-text') as HTMLTextAreaElement;

    hiddenInputElement.accept = fileAccept;

    const applyMethodVisibility = (method: 'file' | 'text') => {
        if (method === 'file') {
            fileSectionElement.style.display = 'flex';
            textSectionElement.style.display = 'none';
            textSectionElement.classList.remove('active');
        } else {
            fileSectionElement.style.display = 'none';
            textSectionElement.style.display = 'flex';
            textSectionElement.classList.add('active');
        }
    };
    applyMethodVisibility(currentMethod);

    toggleButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const method = button.getAttribute('data-method') as 'file' | 'text';
            toggleButtons.forEach((btn) => btn.classList.remove('active'));
            button.classList.add('active');
            if (currentMethod === 'file') {
                selectedFile = null;
                hiddenInputElement.value = '';
                selectedFileNameElement.textContent = 'No file selected';
            } else {
                if (!isEditMode) {
                    textAreaElement.value = '';
                }
            }
            applyMethodVisibility(method);
            currentMethod = method;
            updateDirtyState();
        });
    });

    nameInput.addEventListener('input', updateDirtyState);
    textArea.addEventListener('input', updateDirtyState);

    uploadFileBtnElement.addEventListener('click', () => hiddenInputElement.click());
    hiddenInputElement.addEventListener('change', () => {
        const f = hiddenInputElement.files && hiddenInputElement.files[0] ? hiddenInputElement.files[0] : null;
        selectedFile = f;
        selectedFileNameElement.textContent = f ? f.name : 'No file selected';
        updateDirtyState();
    });

    if (isEditMode) {
        updateDirtyState();
    }

    uploadBtn.addEventListener('click', async () => {
        if (isEditMode && uploadBtn.disabled) {
            return;
        }
        const name = nameInput.value.trim();
        const text = textAreaElement.value.trim();

        if (!name) {
            alert(s.nameRequiredMessage ?? 'Please enter a name.');
            return;
        }
        if (currentMethod === 'file' && !selectedFile) {
            alert(s.fileRequiredMessage ?? 'Please select a file.');
            return;
        }
        if (currentMethod === 'text' && !text && !allowEmptyText) {
            alert(s.textRequiredMessage ?? 'Please enter some text content.');
            return;
        }

        const payload: ContentInputPayload = {
            name,
            sourceType: currentMethod,
            file: currentMethod === 'file' ? selectedFile : null,
            text: currentMethod === 'text' ? text : '',
            fileName: currentMethod === 'file' && selectedFile ? selectedFile.name : undefined
        };

        try {
            void showContentLoadingModal({
                title: loading.title,
                line1: loading.line1,
                line2: loading.line2
            });

            try {
                const result = await options.onSubmit(payload);
                closeModal('success');
                close();

                const success =
                    result &&
                    typeof result === 'object' &&
                    'success' in result &&
                    (result as ContentInputSubmitResult).success;
                if (success) {
                    const r = result as ContentInputSubmitResult;
                    if (r.skipSuccessModal) {
                        return;
                    }
                    const title =
                        r.successTitle ??
                        (r.chunksGenerated !== undefined ? 'Upload Success' : 'Success');
                    let message = r.successMessage;
                    if (!message && r.chunksGenerated !== undefined) {
                        message = `Document uploaded successfully! Generated ${r.chunksGenerated} searchable chunks.`;
                    }
                    if (message) {
                        await showSuccessModal(message, title);
                    }
                }
            } catch (error) {
                console.error('Content input submit failed:', error);
                closeModal('error');
                const errorMessage = error instanceof Error ? error.message : String(error);
                alert(`Failed: ${errorMessage}`);
            }
        } catch (error) {
            console.error('Error in content input submit:', error);
            alert('An error occurred. Please try again.');
        }
    });
}

/** Read-only prompt review: same upload-modal shell, no file/text inputs. */
export interface PromptReviewModalOptions {
    title: string;
    body: string;
}

/**
 * Opens a read-only overlay to review full prompt text (instructor assistant/system prompts).
 * Uses `#upload-modal-mount` and `upload-modal-overlay` shell; header title is `Display: {name}`.
 */
export function openPromptReviewModal(options: PromptReviewModalOptions): void {
    const mount = getOrCreateContentInputModalMount();
    if (!mount) {
        console.error('Prompt review modal mount could not be created.');
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay upload-modal-overlay prompt-review-modal';
    overlay.setAttribute('aria-labelledby', 'prompt-review-modal-title');
    mount.innerHTML = '';
    mount.appendChild(overlay);
    document.body.classList.add('modal-open');

    const modal = document.createElement('div');
    modal.className = 'modal-container';
    overlay.appendChild(modal);
    overlay.offsetHeight;
    overlay.classList.add('show');

    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleEl = document.createElement('h2');
    titleEl.id = 'prompt-review-modal-title';
    titleEl.className = 'modal-title';
    titleEl.textContent = `Display: ${options.title}`;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'upload-close-btn';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const content = document.createElement('div');
    content.className = 'modal-content prompt-review-modal-content';

    const bodyPre = document.createElement('pre');
    bodyPre.className = 'prompt-review-body text-area';
    bodyPre.textContent = options.body;

    content.appendChild(bodyPre);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.id = 'prompt-review-ok-btn';
    okBtn.className = 'save-btn save-btn--primary';
    okBtn.textContent = 'OK';

    footer.appendChild(okBtn);

    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(footer);

    const close = (): void => {
        window.removeEventListener('keydown', keyHandler);
        mount.innerHTML = '';
        document.body.classList.remove('modal-open');
    };

    function keyHandler(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    }

    closeBtn.addEventListener('click', close);
    okBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
    window.addEventListener('keydown', keyHandler);
}

/**
 * Opens a document upload modal for adding course materials
 *
 * @param topicOrWeekId - The ID of the topic/week instance
 * @param itemId - The ID of the content item
 * @param onUpload - Callback function called when upload is successful
 */
export async function openUploadModal(
    topicOrWeekId: string,
    itemId: string,
    onUpload?: (material: any) => Promise<{ success: boolean; chunksGenerated?: number } | void>
): Promise<void> {
    await openContentInputModal({
        title: 'Document Upload',
        initialMethod: 'file',
        allowEmptyText: false,
        strings: {
            nameLabel: 'Content Title',
            namePlaceholder: 'Enter a name for this additional material...',
            textLabel: 'Content Text',
            textPlaceholder: 'Enter or paste your content directly here...',
            nameRequiredMessage: 'Please enter a material name.',
            fileRequiredMessage: 'Please select a file to upload.',
            textRequiredMessage: 'Please enter some text content.'
        },
        onSubmit: async (payload) => {
            if (!onUpload) {
                alert('Upload callback not available. Please try again.');
                return { success: false };
            }
            const material = {
                id: '',
                name: payload.name,
                topicOrWeekId,
                itemId,
                sourceType: payload.sourceType,
                file: payload.sourceType === 'file' ? payload.file : null,
                text: payload.sourceType === 'text' ? payload.text : '',
                fileName: payload.sourceType === 'file' && payload.file ? payload.file.name : undefined,
                date: new Date()
            };
            const result = await onUpload(material);
            if (result && (result as { success?: boolean }).success) {
                const chunksGenerated = (result as { chunksGenerated?: number }).chunksGenerated ?? 0;
                return {
                    success: true,
                    chunksGenerated,
                    successTitle: 'Upload Success',
                    successMessage: `Document uploaded successfully! Generated ${chunksGenerated} searchable chunks.`
                };
            }
            return { success: false };
        },
        loadingContent: {
            title: 'Uploading Document',
            line1: 'Uploading your document...',
            line2: 'Please wait while we process and store your document.'
        }
    });
}

/**
 * Shows an inactivity warning modal with countdown timer
 * 
 * @param remainingSeconds - Remaining seconds until logout (default: 60)
 * @param onStayActive - Callback function called when user clicks "Stay Active"
 * @returns Promise that resolves when modal is closed
 */
export async function showInactivityWarningModal(
    remainingSeconds: number = 60,
    onStayActive?: () => void
): Promise<ModalResult> {
    const modal = getModal();
    let countdown = remainingSeconds;
    let countdownInterval: NodeJS.Timeout | null = null;
    let logoutTimeout: NodeJS.Timeout | null = null;
    let modalClosed = false;
    
    // Create countdown display element
    const countdownContainer = document.createElement('div');
    countdownContainer.style.textAlign = 'center';
    countdownContainer.style.padding = '20px 0';
    
    const countdownDisplay = document.createElement('div');
    countdownDisplay.id = 'inactivity-countdown';
    countdownDisplay.style.fontSize = '48px';
    countdownDisplay.style.fontWeight = 'bold';
    countdownDisplay.style.color = 'var(--color-chbe-green, #4CAF50)';
    countdownDisplay.style.marginBottom = '16px';
    countdownDisplay.textContent = `${countdown}`;
    
    const message = document.createElement('p');
    message.style.marginBottom = '8px';
    message.style.color = 'var(--text-primary)';
    message.style.fontSize = '16px';
    message.textContent = 'You have been inactive for a while.';
    
    const subMessage = document.createElement('p');
    subMessage.style.color = 'var(--text-secondary)';
    subMessage.style.fontSize = '14px';
    subMessage.textContent = 'Click "Stay Active" to continue your session, or you will be logged out automatically.';
    
    countdownContainer.appendChild(countdownDisplay);
    countdownContainer.appendChild(message);
    countdownContainer.appendChild(subMessage);
    
    // Cleanup function
    const cleanup = () => {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        if (logoutTimeout) {
            clearTimeout(logoutTimeout);
            logoutTimeout = null;
        }
    };
    
    // Update countdown every second
    const updateCountdown = () => {
        if (modalClosed) {
            cleanup();
            return;
        }
        
        countdown--;
        countdownDisplay.textContent = `${countdown}`;
        
        // Change color as time runs out
        if (countdown <= 10) {
            countdownDisplay.style.color = '#f44336'; // Red
        } else if (countdown <= 30) {
            countdownDisplay.style.color = '#ff9800'; // Orange
        }
        
        if (countdown <= 0) {
            // Time's up - close modal and trigger logout
            cleanup();
            modalClosed = true;
            modal.close('timeout');
        }
    };
    
    // Start countdown interval
    countdownInterval = setInterval(updateCountdown, 1000);
    
    // Set logout timeout as backup
    logoutTimeout = setTimeout(() => {
        if (!modalClosed) {
            cleanup();
            modalClosed = true;
            modal.close('timeout');
        }
    }, countdown * 1000);
    
    // Show modal and handle result
    try {
        const result = await modal.show({
            type: 'warning',
            title: 'Session Timeout Warning',
            content: countdownContainer,
            buttons: [
                {
                    text: 'Stay Active',
                    type: 'primary',
                    action: async () => {
                        // Clear timers
                        cleanup();
                        modalClosed = true;
                        
                        // Call stay active callback if provided
                        if (onStayActive) {
                            try {
                                await onStayActive();
                            } catch (error) {
                                console.error('[INACTIVITY-MODAL] Error in onStayActive callback:', error);
                            }
                        }
                    },
                    closeOnClick: true
                }
            ],
            showCloseButton: false,
            closeOnOverlayClick: false,
            closeOnEscape: false,
            maxWidth: '400px'
        });
        
        // Clean up timers
        cleanup();
        
        // Return result
        return result;
    } catch (error) {
        // Clean up timers on error
        cleanup();
        throw error;
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
    showSkipOnboardingModal,
    showInputModal,
    showDisclaimerModal,
    showHelpModal,
    showCustomModal,
    showSimpleErrorModal,
    showDeletionSuccessModal,
    showDeleteConfirmationModal,
    showUploadLoadingModal,
    showContentLoadingModal,
    showChatCreationErrorModal,
    showInactivityWarningModal,
    openUploadModal,
    openContentInputModal,
    openPromptReviewModal,
    closeModal
};
