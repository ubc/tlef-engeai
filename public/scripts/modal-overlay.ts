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
// UPLOAD MODAL FUNCTION
// ===========================================

/**
 * Opens a document upload modal for adding course materials
 * 
 * @param divisionId - The ID of the division
 * @param contentId - The ID of the content item
 * @param onUpload - Callback function called when upload is successful
 * @returns Promise<void>
 */
export async function openUploadModal(
    divisionId: string, 
    contentId: string, 
    onUpload?: (material: any) => void
): Promise<void> {
    console.log('Open upload modal called for divisionId: ', divisionId, ' and contentId: ', contentId);
    
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
    modal.className = 'modal';
    overlay.appendChild(modal);

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
         if (e.target === overlay) close(); 
    });

    // Create the event listener for the escape key
    window.addEventListener('keydown', function esc(e) { 
        if (e.key === 'Escape') { 
            close(); window.removeEventListener('keydown', esc); 
        } 
    });

    // Create the event listener for the upload file button
    let selectedFile: File | null = null;
    let currentMethod: 'file' | 'text' = 'file';
    
    // Get references to the toggle buttons and content sections
    const toggleButtons = overlay.querySelectorAll('.toggle-option');
    const uploadMethodContentElement = overlay.querySelector('#upload-method-content') as HTMLElement;
    const fileSectionElement = overlay.querySelector('#file-upload-section') as HTMLElement;
    const textSectionElement = overlay.querySelector('#text-input-section') as HTMLElement;
    const uploadFileBtnElement = overlay.querySelector('#upload-file-btn') as HTMLButtonElement;
    const hiddenInputElement = overlay.querySelector('#hidden-file-input') as HTMLInputElement;
    const selectedFileNameElement = overlay.querySelector('#selected-file-name') as HTMLElement;
    const textAreaElement = overlay.querySelector('#mat-text') as HTMLTextAreaElement;
    
    // Set up file input with supported file types
    hiddenInputElement.accept = '.pdf,.docx,.html,.htm,.md,.txt';
    
    // Toggle method functionality
    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const method = button.getAttribute('data-method') as 'file' | 'text';
            
            // Update active state
            toggleButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Clear previous data when switching methods
            if (currentMethod === 'file') {
                selectedFile = null;
                hiddenInputElement.value = '';
                selectedFileNameElement.textContent = 'No file selected';
            } else {
                textAreaElement.value = '';
            }
            
            // Show/hide sections within the upload method content
            if (method === 'file') {
                fileSectionElement.style.display = 'flex';
                textSectionElement.style.display = 'none';
                textSectionElement.classList.remove('active');
            } else {
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
    uploadBtn.addEventListener('click', async () => {
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
                divisionId: divisionId,
                contentId: contentId,
                sourceType: currentMethod,
                file: currentMethod === 'file' ? selectedFile : null,
                text: currentMethod === 'text' ? text : '',
                fileName: currentMethod === 'file' && selectedFile ? selectedFile.name : undefined,
                date: new Date(),
            };

            // Call the upload callback if provided and wait for completion
            if (onUpload) {
                try {
                    await onUpload(material);
                    // Only close modal after successful upload
                    close();
                } catch (error) {
                    console.error('Upload failed:', error);
                    alert('Upload failed. Please try again.');
                    // Don't close modal on error - let user try again
                    return;
                }
            } else {
                // Close the modal if no upload callback
                close();
            }
        } catch (error) {
            console.error('Error in upload process:', error);
            alert('An error occurred during upload. Please try again.');
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
    showDisclaimerModal,
    showHelpModal,
    showCustomModal,
    showSimpleErrorModal,
    showDeleteConfirmationModal,
    showChatCreationErrorModal,
    openUploadModal,
    closeModal
};
