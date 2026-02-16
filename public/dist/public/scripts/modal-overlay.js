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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// ===========================================
// MODAL OVERLAY CLASS
// ===========================================
export class ModalOverlay {
    constructor() {
        this.overlay = null;
        this.container = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
        this.isVisible = false;
        this.focusableElements = [];
        this.lastFocusedElement = null;
        /**
         * Handles Enter key press within the modal
         *
         * @param e - Keyboard event
         */
        this.handleEnterKey = (e) => {
            // Only handle Enter when this modal is visible
            if (!this.isVisible || e.key !== 'Enter')
                return;
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
            if (!this.container)
                return;
            const modalType = this.getModalType();
            const action = this.determineEnterAction(modalType);
            if (action) {
                // For delete confirmation modals, find and click the danger button
                if (action === 'delete') {
                    const dangerButton = this.focusableElements.find(element => element.tagName === 'BUTTON' && element.classList.contains('modal-btn-danger'));
                    if (dangerButton) {
                        // Simulate a click on the danger button to execute its action
                        dangerButton.click();
                        return;
                    }
                }
                // For other modals, find the appropriate button to click
                // First try primary button
                const primaryButton = this.focusableElements.find(element => element.tagName === 'BUTTON' && element.classList.contains('modal-btn-primary'));
                if (primaryButton) {
                    // Simulate a click on the primary button
                    primaryButton.click();
                    return;
                }
                // Fallback: click the first button
                const firstButton = this.focusableElements.find(element => element.tagName === 'BUTTON');
                if (firstButton) {
                    // Simulate a click on the first button
                    firstButton.click();
                    return;
                }
                // Last resort: directly close modal with the determined action
                this.close(action);
            }
        };
        /**
         * Handles escape key press
         *
         * @param e - Keyboard event
         */
        this.handleEscapeKey = (e) => {
            if (e.key === 'Escape') {
                this.close('escape');
            }
        };
    }
    /**
     * Creates and shows a modal with the specified configuration
     *
     * @param config - Modal configuration
     * @returns Promise that resolves when modal is closed
     */
    show(config) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.resolvePromise = resolve;
                this.rejectPromise = reject;
                this.createModal(config);
                this.showModal();
            });
        });
    }
    /**
     * Creates the modal DOM structure
     *
     * @param config - Modal configuration
     */
    createModal(config) {
        // Store the currently focused element
        this.lastFocusedElement = document.activeElement;
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
    createHeader(config) {
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
    createBody(config) {
        const body = document.createElement('div');
        body.className = 'modal-body';
        const content = document.createElement('div');
        content.className = 'modal-content';
        if (typeof config.content === 'string') {
            content.innerHTML = config.content;
        }
        else {
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
    createFooter(buttons) {
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        buttons.forEach((buttonConfig, index) => {
            const button = document.createElement('button');
            button.className = `modal-btn modal-btn-${buttonConfig.type}`;
            button.textContent = buttonConfig.text;
            button.setAttribute('data-action', buttonConfig.text.toLowerCase().replace(/\s+/g, '-'));
            button.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
                var _a;
                try {
                    if (buttonConfig.action) {
                        yield buttonConfig.action();
                    }
                    if (buttonConfig.closeOnClick !== false) {
                        this.close(buttonConfig.text.toLowerCase().replace(/\s+/g, '-'));
                    }
                }
                catch (error) {
                    console.error('Error in button action:', error);
                    (_a = this.rejectPromise) === null || _a === void 0 ? void 0 : _a.call(this, error);
                }
            }));
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
    setupEventListeners(config) {
        if (!this.overlay)
            return;
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
            const escapeHandler = (e) => {
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
            }
            else if (e.key === ' ' || e.key === 'Spacebar') {
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
    handleTabNavigation(e) {
        if (this.focusableElements.length === 0)
            return;
        const firstElement = this.focusableElements[0];
        const lastElement = this.focusableElements[this.focusableElements.length - 1];
        if (e.shiftKey) {
            // Shift + Tab (backward)
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        }
        else {
            // Tab (forward)
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    }
    /**
     * Gets the modal type from the container classes
     *
     * @returns The modal type
     */
    getModalType() {
        if (!this.container)
            return 'custom';
        const classList = this.container.classList;
        if (classList.contains('modal-warning'))
            return 'warning';
        if (classList.contains('modal-error'))
            return 'error';
        if (classList.contains('modal-success'))
            return 'success';
        if (classList.contains('modal-info'))
            return 'info';
        if (classList.contains('modal-disclaimer'))
            return 'disclaimer';
        return 'custom';
    }
    /**
     * Determines what action should be taken when Enter is pressed
     *
     * @param modalType - The type of modal
     * @returns The action to take, or null if no action should be taken
     */
    determineEnterAction(modalType) {
        var _a, _b;
        // Check if this is a delete confirmation modal by looking for danger buttons
        const hasDangerButton = this.focusableElements.some(element => element.tagName === 'BUTTON' && element.classList.contains('modal-btn-danger'));
        // Check if this is a confirmation modal by looking for specific button text
        const hasCancelButton = this.focusableElements.some(element => {
            var _a;
            return element.tagName === 'BUTTON' &&
                ((_a = element.textContent) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('cancel'));
        });
        // Modal-specific Enter key behavior
        if (hasDangerButton && hasCancelButton) {
            // This is likely a delete confirmation modal
            // Enter should trigger the danger action (Delete)
            return 'delete';
        }
        // Check for primary buttons
        const primaryButton = this.focusableElements.find(element => element.tagName === 'BUTTON' && element.classList.contains('modal-btn-primary'));
        if (primaryButton) {
            // Get the action from the button's data-action or text content
            const action = primaryButton.getAttribute('data-action') ||
                ((_a = primaryButton.textContent) === null || _a === void 0 ? void 0 : _a.toLowerCase().replace(/\s+/g, '-')) ||
                'confirm';
            return action;
        }
        // Fallback: use the first button's action
        const firstButton = this.focusableElements.find(element => element.tagName === 'BUTTON');
        if (firstButton) {
            const action = firstButton.getAttribute('data-action') ||
                ((_b = firstButton.textContent) === null || _b === void 0 ? void 0 : _b.toLowerCase().replace(/\s+/g, '-')) ||
                'confirm';
            return action;
        }
        return null;
    }
    /**
     * Shows the modal with animation
     */
    showModal() {
        if (!this.overlay)
            return;
        // Trigger reflow
        this.overlay.offsetHeight;
        // Show modal
        this.overlay.classList.add('show');
        this.isVisible = true;
        // Focus first focusable element
        if (this.focusableElements.length > 0) {
            this.focusableElements[0].focus();
        }
        else {
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
    close(action = 'close') {
        var _a;
        if (!this.overlay || !this.isVisible)
            return;
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
        (_a = this.resolvePromise) === null || _a === void 0 ? void 0 : _a.call(this, { action, data: null });
    }
    /**
     * Cleans up modal resources
     */
    cleanup() {
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
let globalModal = null;
/**
 * Gets or creates the global modal instance
 *
 * @returns Modal overlay instance
 */
function getModal() {
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
export function showErrorModal() {
    return __awaiter(this, arguments, void 0, function* (title = 'Error', message, buttons) {
        const modal = getModal();
        return modal.show({
            type: 'error',
            title,
            content: message,
            buttons: buttons || [
                { text: 'OK', type: 'primary', closeOnClick: true }
            ]
        });
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
export function showWarningModal() {
    return __awaiter(this, arguments, void 0, function* (title = 'Warning', message, buttons) {
        const modal = getModal();
        return modal.show({
            type: 'warning',
            title,
            content: message,
            buttons: buttons || [
                { text: 'OK', type: 'primary', closeOnClick: true }
            ]
        });
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
export function showSuccessModal() {
    return __awaiter(this, arguments, void 0, function* (title = 'Success', message, buttons) {
        const modal = getModal();
        return modal.show({
            type: 'success',
            title,
            content: message,
            buttons: buttons || [
                { text: 'OK', type: 'primary', closeOnClick: true }
            ]
        });
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
export function showInfoModal() {
    return __awaiter(this, arguments, void 0, function* (title = 'Information', message, buttons) {
        const modal = getModal();
        return modal.show({
            type: 'info',
            title,
            content: message,
            buttons: buttons || [
                { text: 'OK', type: 'primary', closeOnClick: true }
            ]
        });
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
export function showConfirmModal() {
    return __awaiter(this, arguments, void 0, function* (title = 'Confirm', message, confirmText = 'Confirm', cancelText = 'Cancel') {
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
export function showInputModal(title_1, message_1) {
    return __awaiter(this, arguments, void 0, function* (title, message, currentValue = '', confirmText = 'Save', cancelText = 'Cancel') {
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
                        action: () => __awaiter(this, void 0, void 0, function* () {
                            resolve({ action: 'cancel', data: null });
                        }),
                        closeOnClick: true
                    },
                    {
                        text: confirmText,
                        type: 'primary',
                        action: () => __awaiter(this, void 0, void 0, function* () {
                            const value = input.value.trim();
                            resolve({ action: 'confirm', data: value });
                        }),
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
export function showDisclaimerModal() {
    return __awaiter(this, arguments, void 0, function* (title = 'Disclaimer', content, buttons) {
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
export function showHelpModal(stepNumber_1) {
    return __awaiter(this, arguments, void 0, function* (stepNumber, title = 'Help', content) {
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
    });
}
/**
 * Shows a custom modal
 *
 * @param config - Modal configuration
 * @returns Promise that resolves when modal is closed
 */
export function showCustomModal(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const modal = getModal();
        return modal.show(config);
    });
}
/**
 * Shows a simple error modal for general errors
 *
 * @param message - Error message to display
 * @param title - Optional custom title (defaults to "Error")
 * @returns Promise that resolves when modal is closed
 */
export function showSimpleErrorModal(message_1) {
    return __awaiter(this, arguments, void 0, function* (message, title = "Error") {
        return showErrorModal(title, message);
    });
}
/**
 * Shows a confirmation modal for deletion operations
 *
 * @param itemType - Type of item being deleted (e.g., "Learning Objective", "Instructor", "TA", "Additional Material")
 * @param itemName - Optional name of the specific item
 * @returns Promise that resolves with user's choice
 */
export function showDeleteConfirmationModal(itemType, itemName) {
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
/**
 * Shows an upload loading modal with progress indication
 *
 * @returns Promise that resolves when modal is closed
 */
export function showUploadLoadingModal() {
    return __awaiter(this, void 0, void 0, function* () {
        const modal = getModal();
        return modal.show({
            type: 'info',
            title: 'Uploading Document',
            content: `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">📄</div>
                <p style="margin-bottom: 16px; color: var(--text-primary);">
                    Uploading your document...
                </p>
                <p style="color: var(--text-secondary); font-size: 14px;">
                    Please wait while we process and store your document.
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
    });
}
/**
 * Shows a loading modal for title updates
 *
 * @param itemType - Type of item being updated (e.g., "Division" or "Section")
 * @returns Promise that resolves when modal is closed
 */
export function showTitleUpdateLoadingModal() {
    return __awaiter(this, arguments, void 0, function* (itemType = 'Title') {
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
    });
}
/**
 * Shows a chat creation error modal
 *
 * @param errorMessage - The error message to display
 * @returns Promise that resolves when modal is closed
 */
export function showChatCreationErrorModal(errorMessage) {
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
/**
 * Closes the currently open modal
 *
 * @param action - Action that triggered the close
 */
export function closeModal(action = 'close') {
    if (globalModal) {
        globalModal.close(action);
    }
}
// ===========================================
// UPLOAD MODAL FUNCTION
// ===========================================
/**
 * Opens a document upload modal for adding course materials
 *
 * @param topicOrWeekId - The ID of the topic/week instance
 * @param itemId - The ID of the content item
 * @param onUpload - Callback function called when upload is successful
 * @returns Promise<void>
 */
export function openUploadModal(topicOrWeekId, itemId, onUpload) {
    return __awaiter(this, void 0, void 0, function* () {
        // console.log('🔍 OPEN UPLOAD MODAL CALLED'); // 🟢 MEDIUM: Debug info
        // console.log('  - topicOrWeekId:', topicOrWeekId); // 🟡 HIGH: Upload parameter exposure
        // console.log('  - itemId:', itemId); // 🟡 HIGH: Upload parameter exposure
        // console.log('  - onUpload callback provided:', !!onUpload); // 🟢 MEDIUM: Callback presence
        // console.log('  - onUpload callback type:', typeof onUpload); // 🟢 MEDIUM: Callback type
        // console.log('  - onUpload callback:', onUpload); // 🔴 CRITICAL: Function implementation exposure
        // Get the mount point for the modal
        const mount = document.getElementById('upload-modal-mount');
        if (!mount) {
            console.error('Upload modal mount point not found! Make sure #upload-modal-mount exists in the HTML.');
            return;
        }
        console.log('Upload modal mount point found:', mount);
        // Create the overlay for the modal
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay upload-modal-overlay';
        mount.innerHTML = '';
        mount.appendChild(overlay);
        document.body.classList.add('modal-open');
        // Create the modal
        const modal = document.createElement('div');
        modal.className = 'modal-container';
        overlay.appendChild(modal);
        // Trigger reflow to ensure initial state is rendered before showing
        overlay.offsetHeight;
        // Show the modal
        overlay.classList.add('show');
        // Create the header for the modal
        const header = document.createElement('div');
        header.className = 'modal-header';
        const spacer = document.createElement('div');
        const closeBtn = document.createElement('button');
        closeBtn.className = 'upload-close-btn';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.textContent = '×';
        header.appendChild(spacer);
        header.appendChild(closeBtn);
        // Create the content for the modal
        const content = document.createElement('div');
        content.className = 'modal-content';
        // Create the header section (Content Title + Upload Method)
        const headerSection = document.createElement('div');
        headerSection.className = 'upload-header-section';
        // Create the first section for the modal (Content Title)
        const section1 = document.createElement('div');
        section1.className = 'form-section';
        // Create the label for the first section
        const label1 = document.createElement('label');
        label1.className = 'section-label';
        label1.setAttribute('for', 'mat-name');
        label1.textContent = 'Content Title';
        // Create the input for the first section
        const nameInput = document.createElement('input');
        nameInput.id = 'mat-name';
        nameInput.type = 'text';
        nameInput.className = 'text-input';
        nameInput.placeholder = 'Enter a name for this additional material...';
        section1.appendChild(label1);
        section1.appendChild(nameInput);
        // Create the upload method toggle section
        const toggleSection = document.createElement('div');
        toggleSection.className = 'form-section';
        // Create label
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'section-label';
        toggleLabel.textContent = 'Upload Method';
        // Create toggle container
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'upload-method-toggle';
        // Create file toggle button
        const fileToggleBtn = document.createElement('button');
        fileToggleBtn.type = 'button';
        fileToggleBtn.className = 'toggle-option active';
        fileToggleBtn.setAttribute('data-method', 'file');
        const fileIcon = document.createElement('span');
        fileIcon.className = 'toggle-icon';
        fileIcon.textContent = '📁';
        const fileText = document.createElement('span');
        fileText.className = 'toggle-text';
        fileText.textContent = 'Upload File';
        fileToggleBtn.appendChild(fileIcon);
        fileToggleBtn.appendChild(fileText);
        // Create text toggle button
        const textToggleBtn = document.createElement('button');
        textToggleBtn.type = 'button';
        textToggleBtn.className = 'toggle-option';
        textToggleBtn.setAttribute('data-method', 'text');
        const textIcon = document.createElement('span');
        textIcon.className = 'toggle-icon';
        textIcon.textContent = '📝';
        const textText = document.createElement('span');
        textText.className = 'toggle-text';
        textText.textContent = 'Enter Text';
        textToggleBtn.appendChild(textIcon);
        textToggleBtn.appendChild(textText);
        // Assemble toggle section
        toggleContainer.appendChild(fileToggleBtn);
        toggleContainer.appendChild(textToggleBtn);
        toggleSection.appendChild(toggleLabel);
        toggleSection.appendChild(toggleContainer);
        // Add sections to header
        headerSection.appendChild(section1);
        headerSection.appendChild(toggleSection);
        // Create the upload method content container
        const uploadMethodContent = document.createElement('div');
        uploadMethodContent.className = 'upload-method-content active';
        uploadMethodContent.id = 'upload-method-content';
        // Create the file upload section
        const fileUploadSection = document.createElement('div');
        fileUploadSection.className = 'form-section';
        fileUploadSection.id = 'file-upload-section';
        // Create modal upload card (different from document-setup upload-card)
        const modalUploadCard = document.createElement('div');
        modalUploadCard.className = 'modal-upload-card';
        // Create upload button
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
        // Create hidden file input
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'file';
        hiddenInput.id = 'hidden-file-input';
        hiddenInput.style.display = 'none';
        // Create file selected display
        const fileSelected = document.createElement('div');
        fileSelected.className = 'file-selected';
        const selectedFileName = document.createElement('span');
        selectedFileName.id = 'selected-file-name';
        selectedFileName.textContent = 'No file selected';
        fileSelected.appendChild(selectedFileName);
        // Assemble modal upload card
        modalUploadCard.appendChild(uploadFileBtn);
        modalUploadCard.appendChild(hiddenInput);
        modalUploadCard.appendChild(fileSelected);
        fileUploadSection.appendChild(modalUploadCard);
        // Create the text input section
        const textInputSection = document.createElement('div');
        textInputSection.className = 'form-section';
        textInputSection.id = 'text-input-section';
        // Create text label
        const textLabel = document.createElement('label');
        textLabel.className = 'section-label';
        textLabel.setAttribute('for', 'mat-text');
        textLabel.textContent = 'Content Text';
        // Create textarea
        const textArea = document.createElement('textarea');
        textArea.id = 'mat-text';
        textArea.className = 'text-area';
        textArea.placeholder = 'Enter or paste your content directly here...';
        // Assemble text input section
        textInputSection.appendChild(textLabel);
        textInputSection.appendChild(textArea);
        // Add sections to upload method content
        uploadMethodContent.appendChild(fileUploadSection);
        uploadMethodContent.appendChild(textInputSection);
        // Append the sections to the content
        content.appendChild(headerSection);
        content.appendChild(uploadMethodContent);
        // Create the footer for the modal
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        // Create the cancel button for the footer
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'upload-cancel-btn';
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = 'Cancel';
        // Create the upload button for the footer
        const uploadBtn = document.createElement('button');
        uploadBtn.id = 'upload-submit-btn';
        uploadBtn.className = 'save-btn';
        uploadBtn.textContent = 'Upload';
        footer.appendChild(cancelBtn);
        footer.appendChild(uploadBtn);
        // Append the header, content, and footer to the modal
        modal.appendChild(header);
        modal.appendChild(content);
        modal.appendChild(footer);
        // Create the close function for the modal
        const close = () => {
            mount.innerHTML = '';
            document.body.classList.remove('modal-open');
        };
        // Add the event listeners to the modal
        closeBtn.addEventListener('click', close);
        cancelBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay)
                close();
        });
        // Create the event listener for the escape key and enter key
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                close();
                window.removeEventListener('keydown', keyHandler);
            }
            else if (e.key === 'Enter') {
                // Handle Enter key for form submission
                const activeElement = document.activeElement;
                // If focused on input fields, don't prevent default behavior
                if (activeElement &&
                    (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') &&
                    activeElement.getAttribute('type') !== 'button') {
                    return; // Let the input handle its own Enter key behavior
                }
                // Otherwise, trigger the upload button
                e.preventDefault();
                uploadBtn.click();
            }
        };
        window.addEventListener('keydown', keyHandler);
        // Create the event listener for the upload file button
        let selectedFile = null;
        let currentMethod = 'file';
        // Get references to the toggle buttons and content sections
        const toggleButtons = overlay.querySelectorAll('.toggle-option');
        const uploadMethodContentElement = overlay.querySelector('#upload-method-content');
        const fileSectionElement = overlay.querySelector('#file-upload-section');
        const textSectionElement = overlay.querySelector('#text-input-section');
        const uploadFileBtnElement = overlay.querySelector('#upload-file-btn');
        const hiddenInputElement = overlay.querySelector('#hidden-file-input');
        const selectedFileNameElement = overlay.querySelector('#selected-file-name');
        const textAreaElement = overlay.querySelector('#mat-text');
        // Set up file input with supported file types
        hiddenInputElement.accept = '.pdf,.docx,.html,.htm,.md,.txt';
        // Toggle method functionality
        toggleButtons.forEach(button => {
            button.addEventListener('click', () => {
                const method = button.getAttribute('data-method');
                // Update active state
                toggleButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                // Clear previous data when switching methods
                if (currentMethod === 'file') {
                    selectedFile = null;
                    hiddenInputElement.value = '';
                    selectedFileNameElement.textContent = 'No file selected';
                }
                else {
                    textAreaElement.value = '';
                }
                // Show/hide sections within the upload method content
                if (method === 'file') {
                    fileSectionElement.style.display = 'flex';
                    textSectionElement.style.display = 'none';
                    textSectionElement.classList.remove('active');
                }
                else {
                    fileSectionElement.style.display = 'none';
                    textSectionElement.style.display = 'flex';
                    textSectionElement.classList.add('active');
                }
                currentMethod = method;
            });
        });
        // File upload functionality
        uploadFileBtnElement.addEventListener('click', () => hiddenInputElement.click());
        hiddenInputElement.addEventListener('change', () => {
            const f = hiddenInputElement.files && hiddenInputElement.files[0] ? hiddenInputElement.files[0] : null;
            selectedFile = f;
            selectedFileNameElement.textContent = f ? f.name : 'No file selected';
        });
        // Create the event listener for the upload button
        uploadBtn.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            const name = nameInput.value.trim();
            const text = textAreaElement.value.trim();
            if (!name) {
                alert('Please enter a material name.');
                return;
            }
            // Validate based on current method
            if (currentMethod === 'file' && !selectedFile) {
                alert('Please select a file to upload.');
                return;
            }
            if (currentMethod === 'text' && !text) {
                alert('Please enter some text content.');
                return;
            }
            try {
                // Create the material object
                const material = {
                    id: '',
                    name: name,
                    topicOrWeekId: topicOrWeekId,
                    itemId: itemId,
                    sourceType: currentMethod,
                    file: currentMethod === 'file' ? selectedFile : null,
                    text: currentMethod === 'text' ? text : '',
                    fileName: currentMethod === 'file' && selectedFile ? selectedFile.name : undefined,
                    date: new Date(),
                };
                // console.log('🔍 MATERIAL OBJECT CREATED IN UPLOAD MODAL:'); // 🔴 CRITICAL: Upload content exposure
                // console.log('  - material:', material); // 🔴 CRITICAL: Complete material object exposure
                // console.log('  - material.topicOrWeekId:', material.topicOrWeekId); // 🟡 HIGH: Material ID exposure
                // console.log('  - material.itemId:', material.itemId); // 🟡 HIGH: Material ID exposure
                // Call the upload callback if provided and wait for completion
                if (onUpload) {
                    // console.log('🔍 CALLING onUpload CALLBACK'); // 🟢 MEDIUM: Callback execution
                    // console.log('🔍 onUpload function:', onUpload); // 🔴 CRITICAL: Function implementation exposure
                    // console.log('🔍 onUpload function type:', typeof onUpload); // 🟢 MEDIUM: Function type
                    // console.log('🔍 material being passed:', material); // 🔴 CRITICAL: Material content exposure
                    // Show loading modal
                    // console.log('🔍 SHOWING LOADING MODAL'); // 🟢 MEDIUM: UI state
                    const loadingModalPromise = showUploadLoadingModal();
                    // console.log('🔍 LOADING MODAL PROMISE CREATED:', loadingModalPromise); // 🟢 MEDIUM: Promise object exposure
                    try {
                        console.log('🔍 ABOUT TO CALL onUpload(material)');
                        console.log('🔍 Calling onUpload with material:', material);
                        const result = yield onUpload(material);
                        console.log('🔍 UPLOAD CALLBACK COMPLETED SUCCESSFULLY');
                        console.log('🔍 Upload result:', result);
                        // Close loading modal manually
                        console.log('🔍 CLOSING LOADING MODAL - SUCCESS');
                        closeModal('success');
                        // Close upload modal before showing success modal
                        console.log('🔍 CLOSING UPLOAD MODAL');
                        close();
                        // Show success modal with OK button after upload modal is closed
                        if (result && result.success) {
                            const chunksGenerated = result.chunksGenerated || 0;
                            yield showSuccessModal(`Document uploaded successfully! Generated ${chunksGenerated} searchable chunks.`, 'Upload Success');
                        }
                    }
                    catch (error) {
                        console.error('❌ UPLOAD CALLBACK FAILED:', error);
                        console.error('❌ Error details:', error);
                        console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
                        // Close loading modal manually
                        console.log('🔍 CLOSING LOADING MODAL - ERROR');
                        closeModal('error');
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        alert(`Upload failed: ${errorMessage}`);
                        // Don't close modal on error - let user try again
                        return;
                    }
                }
                else {
                    console.warn('⚠️ No onUpload callback provided');
                    console.warn('⚠️ onUpload is:', onUpload);
                    console.warn('⚠️ onUpload type:', typeof onUpload);
                    alert('Upload callback not available. Please try again.');
                }
            }
            catch (error) {
                console.error('Error in upload process:', error);
                alert('An error occurred during upload. Please try again.');
            }
        }));
    });
}
/**
 * Shows an inactivity warning modal with countdown timer
 *
 * @param remainingSeconds - Remaining seconds until logout (default: 60)
 * @param onStayActive - Callback function called when user clicks "Stay Active"
 * @returns Promise that resolves when modal is closed
 */
export function showInactivityWarningModal() {
    return __awaiter(this, arguments, void 0, function* (remainingSeconds = 60, onStayActive) {
        const modal = getModal();
        let countdown = remainingSeconds;
        let countdownInterval = null;
        let logoutTimeout = null;
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
            }
            else if (countdown <= 30) {
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
            const result = yield modal.show({
                type: 'warning',
                title: 'Session Timeout Warning',
                content: countdownContainer,
                buttons: [
                    {
                        text: 'Stay Active',
                        type: 'primary',
                        action: () => __awaiter(this, void 0, void 0, function* () {
                            // Clear timers
                            cleanup();
                            modalClosed = true;
                            // Call stay active callback if provided
                            if (onStayActive) {
                                try {
                                    yield onStayActive();
                                }
                                catch (error) {
                                    console.error('[INACTIVITY-MODAL] Error in onStayActive callback:', error);
                                }
                            }
                        }),
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
        }
        catch (error) {
            // Clean up timers on error
            cleanup();
            throw error;
        }
    });
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
    showInputModal,
    showDisclaimerModal,
    showHelpModal,
    showCustomModal,
    showSimpleErrorModal,
    showDeleteConfirmationModal,
    showUploadLoadingModal,
    showChatCreationErrorModal,
    showInactivityWarningModal,
    openUploadModal,
    closeModal
};
