type ModalType = 'disclaimer' | 'flag' | 'artefact' | 'settings' | 'error' ;

interface ModalConfig {
    title? : string;
    content? : string;
    showCloseButton? : boolean;
    closeOnBackdropClick? : boolean;
    closeOnEscape? : boolean;
    size? : 'small' | 'medium' | 'large' | 'full-screen';
    customClass? : string;
}

export class ModalManager {

    // Track active modals to prevent duplicates and manage stacking
    private static activeModals: Set<string> = new Set();
    private static modalStack: string[] = [];
    private static escapeHandlers : Map<String, (e : KeyboardEvent) => void> = new Map();

    // ===== CORE MODAL OPENING ======
    /**
     * Show modal by loading its HTML
     * this is your main method for displaying modals
     * 
     * @param type - The type of modal to load
     * @param data - The data to pass to the modal
     * @param config - The configuration for the modal
     * @returns The modal element
     * 
     */

    static async showModal(
        type : ModalType,
        data? : any,
        config : ModalConfig = {}
    ) : Promise<HTMLElement> {

        //prevent duplicate modals
        if (ModalManager.activeModals.has(type)){
            console.warn(`Modal ${type} is already active`);
            return document.getElementById(type) as HTMLElement;
        }
         const modalId = `modal-${type}-${Date.now()}`;
         this.activeModals.add(type);
         this.modalStack.push(type);

         //create modal overlay
         const overlay = this.createModalOverlay(modalId, config);
         document.body.appendChild(overlay);

         try {
            //load modal content from HTML file and set content
            const content = await this.loadModalContent(type, data);
            overlay.innerHTML = content;

            //Setup modal behaviour
            this.setupModalBehavior(overlay, type, config);

            //Show modal with animation
            this.showModalWithAnimation(overlay);

            return overlay

         } catch (error) {
            console.error('Error loading modal content:', error);

            return overlay;
         }
    }

    // ===== MODAL CREATION ======

    /**
     * createOverlay
     * 
     * This method creates the modal overlay
     * 
     * @param modalId - The ID of the modal
     * @returns The modal overlay
     * 
     */

    private static createModalOverlay(
        modalId : string,
        config : ModalConfig
    ) : HTMLElement {

        //creating overlay component
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = modalId;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        //add size class if specified
        if (config.size) {
            overlay.classList.add(`modal-${config.size}`);
        }

        //add custom class if specified
        if (config.customClass) {
            overlay.classList.add(config.customClass);
        }

        return overlay;
    }

    /**
     * loadModalContent
     * 
     * This method loads the modal content from the HTML file
     * 
     * @param modalId - The ID of the modal
     * @param config - The configuration for the modal
     * @returns The modal overlay
     * 
     */

    private static async loadModalContent(
        type : ModalType, 
        data? : any
    ) : Promise<string> {

        try {
            //load modal content from HTML file
            const response = await fetch(`/components/modals/${type}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load modal content: ${response.statusText}`);
            }
            let html = await response.text();
            if (data) {
                html = this.replacePlaceHolders(html, data);
            }

            return html;

        } catch (error) {
            console.error('Error loading modal content:', error);
            throw error;
        }

        // Fallback to default content if HTML file is not found
        return this.createDefaultModalContent(type, data);
    }

    /**
     * replacePlaceHolders
     * 
     * This method replaces placeholders in the modal content with actual data
     * 
     * @param html - The modal content
     * @param data - The data to pass to the modal
     * @returns The modal content with the placeholders replaced
     * 
     */

        private static replacePlaceHolders(
            html : string, 
            data : any
        ) : string {
    
            let result = html;
    
            // Replace common placeholders (keep in mid that the data type of data is any)
            if (data.title) result = result.replace('{{title}}', data.title);
            if (data.content) result = result.replace('{{content}}', data.content);
            if (data.message) result = result.replace('{{message}}', data.message);
    
            // Replace all other placeholders
            Object.keys(data).forEach(key => {
                if (! (key === 'title' || key === 'content' || key === 'message')) {
                    //skip common placeholders
                    const placeHolder = `{{${key}}}`;
                    const value = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key])
                    result = result.replace(placeHolder, value);
                }
            })
            return result;
        }

    // ===== DEFAULT MODAL CONTENT ======

    /**
     * createDefaultModalContent
     * 
     * This method creates the default modal content when HTML file is not found
     * 
     * @param type - The type of modal to load
     * @param data - The data to pass to the modal
     * @returns The default modal content
     */
    private static createDefaultModalContent(
        type : ModalType,
        data? : any
    ) : string {

        const title = data?.title || this.getDefaultTitle(type);
        const content = data?.content || data?.message || 'Content not avalable';

        return `
            <div class="modal">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="close-modal icon-btn" aria-label="Close modal">
                        <i data-feather="x"></i>
                    </button>
                </div>
                <div class="modal-content">
                    ${content}
                </div>
                <div class="modal-footer">
                    <button class="close-modal btn">Close</button>
                </div>
            </div>
        `;
    }

    /**
     * getDefaultTitle
     * 
     * This method returns the default title for the modal
     * 
     * @param type - The type of modal to load
     * @returns The default title
     * 
     */

    private static getDefaultTitle(
        type : ModalType
    ) : string {

        const titles : Record<ModalType, string> = {
            disclaimer : 'Disclaimer',
            flag : 'Flag',
            artefact : 'Artefact',
            settings : 'Settings',
            error : 'Error'
        }

        return titles[type] || 'Modal';
    }

    // ===== MODAL BEHAVIOR SETUP ======

    /**
     * setUpModalBehavior
     * 
     * This method sets up the modal's behavior, including:
     * - Setting the modal's ID, Size, Close Button, Close on Backdrop Click, Close on Escape, Custom Class
     * 
     * @param type - The type of modal to load
     * @param data - The data to pass to the modal
     * @returns The modal content
     * 
     */

    private static setupModalBehavior(
        overlay : HTMLElement,
        type : ModalType,
        config : ModalConfig
    ) : void {

        //setup close button
        this.setupCloseButtons(overlay, type);

        //setup backdrop click
        this.setupBackdropClose(overlay, type);

        //setup escape key
        this.setupEscapeClose(type);

        //setup focus management
        this.setupFocusManagement(overlay);

        //replace feather icon if exists
        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
        
    }

    /**
     * setupCloseButton event Listeners
     * 
     * This method sets up the event listener for the close button
     * 
     * @param overlay - The modal overlay
     * @param type - The type of modal to load
     * 
     */
    private static setupCloseButtons(
        overlay : HTMLElement,
        type : ModalType
    ) : void {
        const closeButtons = overlay.querySelectorAll('.close-modal');
        closeButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.closeModal(type);
            })
        })
    }
    
    /**
     * setupBackDropClick
     * 
     * This method sets up the event listener for the backdrop click
     * 
     * @param overlay - The modal overlay
     * @param type - The type of modal to load
     * 
     */
    
    private static setupBackdropClose(
        overlay : HTMLElement,
        type : ModalType
    ) : void {
        overlay.addEventListener('click', (e) => {
            if ( e.target === overlay ) {
                this.closeModal(type);
            }
        });
    }

    /**
     * setupEscapeClose
     * 
     * this methods sets up the event listener for escape key
     * 
     * @param type - The type of modal to load
     * 
     */

    private static setupEscapeClose(type : ModalType) : void {
        const escHandler = (e : KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.closeModal(type);
            }
        }
        this.escapeHandlers.set(type, escHandler);
        document.addEventListener('keydown', escHandler);
    }

    /**
     * setupFocusManagement
     * 
     * This method sets up the focus management for the modal
     * 
     * @param overlay - The modal overlay
     * @param type - The type of modal to load
     * 
     */

    private static setupFocusManagement(overlay : HTMLElement) : void {

        //find first focusable element
        const focusableElements = overlay.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length > 0) {
            const firstFocusable = focusableElements[0] as HTMLElement;
            firstFocusable.focus();
        }
    }

    // ===== MODAL ANIMATION ======

    // ===== STEP 5: MODAL ANIMATIONS =====

    /**
     * Show modal with smooth animation
     * 
     * @param overlay - The modal overlay
     */
    private static showModalWithAnimation(
        overlay: HTMLElement
    ): void {

        // Add body class to prevent scrolling
        document.body.classList.add('modal-open');
        
        // Start hidden, then animate in
        overlay.style.opacity = '0';
        overlay.style.transform = 'scale(0.95)';
        overlay.setAttribute('aria-hidden', 'false');
        
        // Trigger animation on next frame
        requestAnimationFrame(() => {
            overlay.classList.add('show');
            overlay.style.opacity = '1';
            overlay.style.transform = 'scale(1)';
        });
    }

    /**
     * Hide modal with smooth animation
     * 
     * @param overlay - The modal overlay
     * @param type - The type of modal to load
     * @returns A promise that resolves when the modal is hidden
     * 
     */
    private static hideModalWithAnimation(
        overlay: HTMLElement, 
        type: ModalType
    ): Promise<void> {
        return new Promise(resolve => {
            //remove body class to allow scrolling
            overlay.style.opacity = '0';
            overlay.style.transform = 'scale(0.95)';
            overlay.setAttribute('aria-hidden', 'true');
            
            // Wait for animation to complete
            setTimeout(() => {
                overlay.remove();
                this.cleanupAfterClose(type);
                resolve();
            }, 300); // Match CSS animation duration
        });
    }


    // ===== MODAL CLOSING ======

    /**
     * closeModal
     * 
     * This method closes the modal
     * 
     */

    private static closeModal(
        type : ModalType
    ) : void {
        
    }

    /**
     * cleanup after the modal is closed
     * 
     * @param type - The type of modal to load
     * 
     */

    private static cleanupAfterClose(type : ModalType) : void {
        
        //remove body class if no modals are opened
        if  (this.activeModals.size === 0) {
            document.body.classList.remove('modal-open');
        }

        // Focus management - return focus to trigger element if needed
        // You could store the trigger element and restore focus here
    }

    // ===== UTILITY METHODS ======

    /**
     * close all open modals
     */

    static async closeAll() : Promise<void> {
        const promises = Array
            .from(this.activeModals)
            .map(type => this.closeModal(type as ModalType));

        await Promise.all(promises);

    }

    /**
     * Check if a specific modal is open
     */
    static isModalOpen(type: ModalType): boolean {
        return this.activeModals.has(type);
    }

    /**
     * Get all currently open modals
     */
    static getOpenModals(): string[] {
        return Array.from(this.activeModals);
    }

    /**
     * Check if any modal is open
     */
    static hasOpenModals(): boolean {
        return this.activeModals.size > 0;
    }

    // ===== SPECIFIC MODAL HELPERS ======

    /**
     * show error with specific styling
     */

    static showError(message: string, title: string = 'Error') : Promise<HTMLElement> {
        return this.showModal('error', {
            title,
            content: `<div class="error-content">
                <p>${message}</p>
            </div>`,
         }, {
                customClass: 'error-modal',
                size: 'small'
        });
    }

    /**
     * show confirmation modal with Yes / No buttons
     * 
     * @param message - The message to display in the modal
     * @param title - The title of the modal
     * @param onConfirm - The function to call when the user confirms
     * @param onCancel - The function to call when the user cancels
     * @returns A promise that resolves when the modal is closed
     * 
     */

    static showConfirmation(
        message: string,
        title: string,
        onConfirm?: () => void,
        onCancel?: () => void
    ) : Promise<HTMLElement> {
        
        //content
        const content = `
            <div class="confirmation-content">
                <p>${message}</p>
                <div class="confirmation-buttons">
                    <button class="btn btn-primary confirm-yes">Yes</button>
                    <button class="btn btn-secondary confirm-no">No</button>
                </div>
            </div>
        `;

        return this.showModal('error', {title, content}, {
            customClass: 'modal-confirmation',
            size: 'small',
            closeOnBackdropClick: false,
            closeOnEscape: false
        }).then(overlay => {
            const yesBtn  = overlay.querySelector('.confirm-yes');
            const noBtn = overlay.querySelector('.confirm-no');
            
            yesBtn?.addEventListener('click', () => {
                onConfirm?.();
                this.closeModal('error');
            });

            noBtn?.addEventListener('click', () => {
                onCancel?.();
                this.closeModal('error');
            });

            return overlay;
        });

    }

    /**
     * Show disclaimer modal (specific to your app)
     */
    static showDisclaimer(): Promise<HTMLElement> {
        return this.showModal('disclaimer', {}, {
            size: 'medium',
            closeOnBackdropClick: true,
            closeOnEscape: true
        });
    }

    /**
     * Show flag message modal (specific to your app)
     */
    static showFlagMessage(messageId: number, messageText: string): Promise<HTMLElement> {
        return this.showModal('flag', {
            messageId,
            messageText
        }, {
            size: 'medium',
            closeOnBackdropClick: false // Don't close accidentally when flagging
        });
    }

    /**
     * Show artefact viewer modal (specific to your app)
     */
    static showArtefact(artefactData: any): Promise<HTMLElement> {
        return this.showModal('artefact', artefactData, {
            size: 'large',
            customClass: 'modal-artefact'
        });
    }

    // ===== STEP 9: ERROR HANDLING =====

    /**
     * Create error modal when content loading fails
     */
    private static createErrorModal(overlay: HTMLElement, errorMessage: string): void {
        overlay.innerHTML = this.createDefaultModalContent('error', {
            title: 'Error',
            content: `<div class="error-content"><p>${errorMessage}</p></div>`
        });
        overlay.classList.add('modal-error');
        this.showModalWithAnimation(overlay);
    }


}


