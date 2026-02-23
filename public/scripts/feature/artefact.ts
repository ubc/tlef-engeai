// public/scripts/feature/artefact.ts

/**
 * Artefact Handler - Manages artefact detection, parsing, and display
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { showSimpleErrorModal } from "../modal-overlay.js";

/**
 * Artefact data structure
 */
export interface ArtefactData {
    id: string;
    mermaidCode: string;
    isOpen: boolean;
    messageId: string;
}

/**
 * Artefact Handler Class
 * Handles all artefact-related functionality including detection, parsing, and display
 */
export class ArtefactHandler {
    private static instance: ArtefactHandler | null = null;
    private artefacts: Map<string, ArtefactData> = new Map();
    private artefactCounter: number = 0;
    private currentlyOpenArtefactId: string | null = null;
    private eventDelegationSetup: boolean = false;

    private constructor() {
        this.setupEventDelegation();
    }

    /**
     * Setup event delegation for artefact buttons
     * This handles clicks on buttons that are dynamically added via innerHTML
     */
    private setupEventDelegation(): void {
        // Prevent multiple event listeners
        if (this.eventDelegationSetup) {
            return;
        }
        
        this.eventDelegationSetup = true;
        
        // Use event delegation on the document to catch clicks on artefact buttons
        document.addEventListener('click', async (event) => {
            const target = event.target as HTMLElement;
            
            // Check if the clicked element is an artefact button or inside one
            const button = target.closest('.artefact-button') as HTMLButtonElement;
            if (button) {
                // Extract artefact ID from button ID
                const buttonId = button.id;
                if (buttonId && (buttonId.startsWith('artefact-btn-') || buttonId === 'demo-artefact-btn')) {
                    const artefactId = buttonId === 'demo-artefact-btn' ? 'demo-artefact-onboarding' : buttonId.replace('artefact-btn-', '');
                    
                    // Prevent event bubbling to avoid multiple handlers
                    event.stopPropagation();
                    event.preventDefault();
                    
                    // Toggle the artefact (open if closed, close if open)
                    await this.toggleArtefact(artefactId);
                }
                return;
            }

            // Check for close button clicks
            const closeBtn = target.closest('#close-artefact-btn') as HTMLButtonElement;
            if (closeBtn) {
                this.closeArtefact();
                return;
            }

            // Check for download button clicks
            const downloadBtn = target.closest('#download-artefact-btn') as HTMLButtonElement;
            if (downloadBtn) {
                const panel = downloadBtn.closest('.artefact-panel') as HTMLElement;
                if (panel) {
                    // Find the currently open artefact
                    const openArtefact = Array.from(this.artefacts.values()).find(a => a.isOpen);
                    if (openArtefact) {
                        try {
                            await this.downloadDiagram(panel, openArtefact);
                        } catch {
                            await showSimpleErrorModal('Failed to download diagram. Please try again.', 'Download Error');
                        }
                    }
                }
                return;
            }
        });
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): ArtefactHandler {
        if (!ArtefactHandler.instance) {
            ArtefactHandler.instance = new ArtefactHandler();
        }
        return ArtefactHandler.instance;
    }

    /**
     * Debug method to check if demo button exists and is properly set up
     */
    public debugDemoButton(): void {
        document.getElementById('demo-artefact-btn');
    }

    /**
     * Parse text and create HTML elements with inline artefact buttons
     * @param text - The text to parse for artefacts
     * @param messageId - The message ID this text belongs to
     * @returns Object containing HTML elements and artefact data
     */
    public parseArtefacts(text: string, messageId: string): {
        elements: HTMLElement[];
        artefacts: ArtefactData[];
        hasArtefacts: boolean;
    } {
        const artefacts: ArtefactData[] = [];
        const elements: HTMLElement[] = [];
        let artefactIndex = 0;

        let currentPos = 0;
        let textBuffer = '';

        while (currentPos < text.length) {
            // Look for <Artefact> tag
            const artefactStart = text.indexOf('<Artefact>', currentPos);
            
            if (artefactStart === -1) {
                // No more artefacts, add remaining text
                if (textBuffer || currentPos < text.length) {
                    const remainingText = text.substring(currentPos);
                    if (remainingText.trim()) {
                        const textElement = document.createElement('span');
                        textElement.textContent = remainingText;
                        elements.push(textElement);
                    }
                }
                break;
            }

            // Add text before artefact
            if (artefactStart > currentPos) {
                const beforeArtefact = text.substring(currentPos, artefactStart);
                if (beforeArtefact.trim()) {
                    const textElement = document.createElement('span');
                    textElement.textContent = beforeArtefact;
                    elements.push(textElement);
                }
            }

            // Find closing </Artefact> tag
            const artefactEnd = text.indexOf('</Artefact>', artefactStart);
            if (artefactEnd === -1) {
                // No closing tag found, treat as regular text
                const textElement = document.createElement('span');
                textElement.textContent = text.substring(artefactStart);
                elements.push(textElement);
                break;
            }

            // Extract mermaid code
            const rawMermaidCode = text.substring(artefactStart + '<Artefact>'.length, artefactEnd).trim();
            // Format the Mermaid code to ensure proper line breaks
            const mermaidCode = this.formatMermaidCode(rawMermaidCode);
            const artefactId = `artefact-${messageId}-${artefactIndex}`;
            
            const artefactData: ArtefactData = {
                id: artefactId,
                mermaidCode: mermaidCode,
                isOpen: false,
                messageId: messageId
            };

            artefacts.push(artefactData);
            this.artefacts.set(artefactId, artefactData);
            artefactIndex++;

            // Create line break before artefact
            const lineBreakBefore = document.createElement('br');
            elements.push(lineBreakBefore);

            // Create artefact button
            const artefactButton = this.createArtefactButton(artefactData);
            
            elements.push(artefactButton);

            // Create line break after artefact
            const lineBreakAfter = document.createElement('br');
            elements.push(lineBreakAfter);

            // Move position past the closing tag
            currentPos = artefactEnd + '</Artefact>'.length;
        }

        return {
            elements,
            artefacts,
            hasArtefacts: artefacts.length > 0
        };
    }

    /**
     * Create artefact button element
     * @param artefactData - The artefact data
     * @returns HTML button element
     */
    public createArtefactButton(artefactData: ArtefactData): HTMLElement {
        const button = document.createElement('button');
        button.className = 'artefact-button';
        button.id = `artefact-btn-${artefactData.id}`;
        
        // Always show "View Diagram" text, but the functionality will toggle
        button.innerHTML = `
            <i data-feather="image"></i>
            <span>View Diagram</span>
        `;
        
        // Event listener is now handled by event delegation in setupEventDelegation()
        // This allows buttons injected via innerHTML to work properly

        return button;
    }

    /**
     * Toggle artefact panel (open if closed, close if open)
     * @param artefactId - The artefact ID to toggle
     */
    public async toggleArtefact(artefactId: string): Promise<void> {
        let artefactData = this.artefacts.get(artefactId);
        
        // Create demo artefact if it doesn't exist and this is the demo
        if (!artefactData && artefactId === 'demo-artefact-onboarding') {
            const mermaidCode = `
graph TD
    A[Thermodynamics in Electrochemistry] --> B[Gibbs Free Energy]
    A --> C[Electrode Potentials]
    A --> D[Electrochemical Cells]
    
    B --> E["ΔG = -nFE"]
    C --> F["E = E° - RT/nF lnQ"]
    D --> G[Anode: Oxidation]
    D --> H[Cathode: Reduction]
    
    G --> I[Electrons Flow]
    H --> I
    I --> J[Current Generation]
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#f3e5f5
    style D fill:#f3e5f5
    style E fill:#fff3e0
    style F fill:#fff3e0
    `;
            
            artefactData = {
                id: artefactId,
                mermaidCode: mermaidCode,
                isOpen: false,
                messageId: 'demo-message'
            };
            
            this.artefacts.set(artefactId, artefactData);
        }
        
        if (!artefactData) {
            return;
        }

        if (this.currentlyOpenArtefactId === artefactId) {
            // Currently open, so close it
            this.closeArtefact();
        } else {
            // Not open, so open it
            await this.openArtefact(artefactId);
        }
    }

    /**
     * Open artefact panel with mermaid diagram
     * Creates the panel dynamically if it doesn't exist
     * @param artefactId - The artefact ID to open
     */
    public async openArtefact(artefactId: string): Promise<void> {
        const artefactData = this.artefacts.get(artefactId);
        if (!artefactData) {
            return;
        }

        // Update artefact state
        artefactData.isOpen = true;
        this.artefacts.set(artefactId, artefactData);
        
        // Track currently open artefact
        this.currentlyOpenArtefactId = artefactId;
        
        // Update button appearance for this artefact
        this.updateArtefactButton(artefactId);

        // Get the appropriate container
        // Check if we're in onboarding mode
        const onboardingContainer = document.querySelector('.onboarding') as HTMLElement | null;
        const chatContainer = document.querySelector('.chat-window-container') as HTMLElement | null;
        
        const container = onboardingContainer || chatContainer;
        if (!container) {
            return;
        }

        // Get or create artefact panel
        let panel = document.getElementById('artefact-panel') as HTMLElement;
        if (!panel) {
            // Create panel dynamically
            panel = this.createArtefactPanel();
            container.appendChild(panel);
            // Feather icons must be replaced after panel is in DOM
            if (typeof (window as any).feather !== 'undefined') {
                (window as any).feather.replace();
            }
        }

        // Add artefact-open class to container
        container.classList.add('artefact-open');

        // Show the panel first
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');

        // Wait for panel to be visible before updating content
        await this.waitForPanelVisible(panel);

        // Update panel content with mermaid diagram
        this.updateArtefactPanel(panel, artefactData);

        // Add ESC listener
        this.addEscListener();
    }

    /**
     * Close artefact panel
     * Removes the panel from DOM after closing animation
     */
    public closeArtefact(): void {
        const panel = document.getElementById('artefact-panel');
        if (!panel) return;

        // Update currently open artefact state
        if (this.currentlyOpenArtefactId) {
            const artefactData = this.artefacts.get(this.currentlyOpenArtefactId);
            if (artefactData) {
                artefactData.isOpen = false;
                this.artefacts.set(this.currentlyOpenArtefactId, artefactData);
            }
            
            // Update button appearance for the previously open artefact
            this.updateArtefactButton(this.currentlyOpenArtefactId);
            
            // Clear currently open artefact
            this.currentlyOpenArtefactId = null;
        }

        // Get the appropriate container and remove artefact-open class
        // Check if we're in onboarding mode
        const onboardingContainer = document.querySelector('.onboarding') as HTMLElement | null;
        const chatContainer = document.querySelector('.chat-window-container') as HTMLElement | null;
        
        const container = onboardingContainer || chatContainer;
        if (container) {
            container.classList.remove('artefact-open');
        }

        // Start closing animation
        panel.classList.add('closing');
        setTimeout(() => {
            // Remove panel from DOM after animation completes
            panel.remove();
            
            // Remove ESC listener
            this.removeEscListener();
        }, 180);
    }

    /**
     * Update artefact button appearance based on current state
     * @param artefactId - The artefact ID to update
     */
    private updateArtefactButton(artefactId: string): void {
        const button = document.getElementById(`artefact-btn-${artefactId}`) as HTMLButtonElement;
        if (!button) return;

        const artefactData = this.artefacts.get(artefactId);
        if (!artefactData) return;

        // Always show "View Diagram" text, but the functionality will toggle
        button.innerHTML = `
            <i data-feather="image"></i>
            <span>View Diagram</span>
        `;
        
        // Re-render feather icons for the updated button
        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
    }

    /**
     * Create artefact panel dynamically using DOM manipulation
     * Matches the structure from chat-window.html and student-onboarding.html
     * Detects if we're in onboarding mode to apply appropriate classes
     */
    private createArtefactPanel(): HTMLElement {
        // Check if we're in onboarding mode
        const onboardingContainer = document.querySelector('.onboarding') as HTMLElement | null;
        const isOnboarding = onboardingContainer !== null;
        
        // Create main panel element
        const panel = document.createElement('aside');
        panel.id = 'artefact-panel';
        panel.className = isOnboarding ? 'artefact-panel artefact-onboarding' : 'artefact-panel';
        panel.setAttribute('aria-hidden', 'true');
        
        // Create header
        const header = document.createElement('div');
        header.className = 'artefact-header';
        
        // Create header title
        const title = document.createElement('h3');
        title.textContent = isOnboarding ? 'Interactive Diagram' : 'Diagram';
        header.appendChild(title);
        
        // Create header actions container
        const headerActions = document.createElement('div');
        headerActions.className = 'artefact-header-actions';
        
        // Create download button
        const downloadBtn = document.createElement('button');
        downloadBtn.id = 'download-artefact-btn';
        downloadBtn.className = 'icon-btn';
        downloadBtn.title = 'Download diagram';
        const downloadIcon = document.createElement('i');
        downloadIcon.setAttribute('data-feather', 'download');
        downloadBtn.appendChild(downloadIcon);
        headerActions.appendChild(downloadBtn);
        
        // Create close button
        const closeBtn = document.createElement('button');
        closeBtn.id = 'close-artefact-btn';
        closeBtn.className = 'icon-btn';
        closeBtn.title = 'Close';
        const closeIcon = document.createElement('i');
        closeIcon.setAttribute('data-feather', 'x');
        closeBtn.appendChild(closeIcon);
        headerActions.appendChild(closeBtn);
        
        // Append actions to header
        header.appendChild(headerActions);
        
        // Create content container
        const content = document.createElement('div');
        content.className = 'artefact-content';
        
        // Create pan-zoom container
        const panZoomContainer = document.createElement('div');
        panZoomContainer.className = 'pan-zoom-container';
        
        // Create mermaid viewport
        const mermaidViewport = document.createElement('div');
        mermaidViewport.className = 'mermaid-viewport';
        panZoomContainer.appendChild(mermaidViewport);
        
        // Append viewport to content
        content.appendChild(panZoomContainer);
        
        // Assemble panel structure
        panel.appendChild(header);
        panel.appendChild(content);

        // Note: feather.replace() is called in openArtefact() after panel is appended to DOM,
        // since Feather only processes elements that exist in the document

        return panel;
    }

    /**
     * Update artefact panel with mermaid diagram
     * @param panel - The artefact panel element
     * @param artefactData - The artefact data
     */
    private updateArtefactPanel(panel: HTMLElement, artefactData: ArtefactData): void {
        const viewport = panel.querySelector('.mermaid-viewport');
        if (!viewport) {
            return;
        }

        // Clear previous content
        viewport.innerHTML = '';

        // Create mermaid diagram element
        const mermaidElement = document.createElement('div');
        mermaidElement.className = 'mermaid';
        mermaidElement.textContent = artefactData.mermaidCode;
        
        // Add to viewport
        viewport.appendChild(mermaidElement);

        // Initialize mermaid
        this.initializeMermaid(mermaidElement).catch(() => {
            // Mermaid initialization failed - diagram may not render
        });

        // Setup pan/zoom functionality
        this.setupPanZoom(panel, artefactData);

        // Download functionality is handled by event delegation - no need for direct setup
    }

    /**
     * Format Mermaid code to ensure proper line breaks for parsing
     * Converts single-line Mermaid code to properly formatted multi-line code
     * Also wraps node labels containing special characters in quotes
     * 
     * @param code - The raw Mermaid code (potentially single-line)
     * @returns Formatted Mermaid code with proper line breaks and quoted labels
     */
    private formatMermaidCode(code: string): string {
        try {
            let formattedCode = code;
            
            // Step 1: Add quotes to node labels with special characters (parentheses, etc.)
            // Match pattern: NodeId[Label with (parentheses)] but not already quoted
            formattedCode = formattedCode.replace(
                /(\w+)\[([^\]"']+[()][^\]"']*)\]/g,
                (match, nodeId, label) => {
                    // Only quote if not already quoted
                    if (!label.trim().startsWith('"') && !label.trim().startsWith("'")) {
                        return `${nodeId}["${label}"]`;
                    }
                    return match;
                }
            );
            
            // Step 2: If already has line breaks, return with quoted labels
            if (code.includes('\n')) {
                return formattedCode;
            }
            
            // Step 3: Format single-line Mermaid code by adding line breaks
            formattedCode = formattedCode
                // Add line break after graph declaration
                .replace(/^(graph\s+TD)\s+/g, '$1\n    ')
                // Add line breaks before arrows, but preserve indentation
                .replace(/\s+(-->\s+)/g, '\n    --> ')
                // Add line breaks before style declarations
                .replace(/\s+(style\s+)/g, '\n$1')
                // Add proper spacing in node definitions
                .replace(/\]\s+(\w+\[)/g, ']\n    $1');
            
            return formattedCode;
        } catch {
            // Return original code if formatting fails
            return code;
        }
    }

    /**
     * Check if Mermaid is loaded and ready
     * @returns Promise that resolves when Mermaid is ready
     */
    private waitForMermaid(): Promise<any> {
        return new Promise((resolve, reject) => {
            const checkMermaid = () => {
                const mermaid = (window as any).mermaid;
                if (mermaid) {
                    resolve(mermaid);
                } else {
                    setTimeout(checkMermaid, 100);
                }
            };
            
            // Start checking immediately
            checkMermaid();
            
            // Timeout after 5 seconds
            setTimeout(() => {
                reject(new Error('Mermaid library failed to load within 5 seconds'));
            }, 5000);
        });
    }

    /**
     * Ensure element is ready for Mermaid rendering (attached to DOM and visible)
     * @param element - The element to check
     */
    private async ensureElementReady(element: HTMLElement): Promise<void> {
        return new Promise((resolve, reject) => {
            const maxAttempts = 50; // 5 seconds max
            let attempts = 0;
            
            const checkReady = () => {
                attempts++;
                
                // Check if element is attached to DOM
                const isAttached = document.contains(element);
                
                // Check if element has dimensions (is visible)
                const rect = element.getBoundingClientRect();
                const hasSize = rect.width > 0 && rect.height > 0;
                
                if (isAttached && hasSize) {
                    resolve();
                    return;
                }
                
                if (attempts >= maxAttempts) {
                    resolve(); // Proceed anyway to avoid blocking
                    return;
                }
                
                // Wait and try again
                setTimeout(checkReady, 100);
            };
            
            checkReady();
        });
    }

    /**
     * Wait for panel to be visible and have dimensions
     * @param panel - The artefact panel element
     */
    private async waitForPanelVisible(panel: HTMLElement): Promise<void> {
        return new Promise((resolve) => {
            const maxAttempts = 30; // 3 seconds max
            let attempts = 0;
            
            const checkVisible = () => {
                attempts++;
                
                const rect = panel.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0;
                
                if (isVisible || attempts >= maxAttempts) {
                    resolve();
                    return;
                }
                
                setTimeout(checkVisible, 100);
            };
            
            // Start checking after a small delay to allow CSS transitions
            setTimeout(checkVisible, 50);
        });
    }

    /**
     * Initialize mermaid diagram
     * @param element - The mermaid element
     */
    private async initializeMermaid(element: HTMLElement): Promise<void> {
        try {
            // Wait for Mermaid to be available
            const mermaid = await this.waitForMermaid();
            
            // Ensure element is attached to DOM and visible
            await this.ensureElementReady(element);
            
            // Check if Mermaid is already initialized
            if (mermaid.render) {
                // Mermaid v10+ API
                const id = 'mermaid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                const mermaidCode = element.textContent || '';
                
                // Use the render method for v10+
                const result = await mermaid.render(id, mermaidCode);
                element.innerHTML = result.svg;
                element.id = id; // Set ID after rendering
            } else if (mermaid.init) {
                // Older Mermaid API
                const id = 'mermaid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                element.id = id;
                mermaid.init(undefined, [element]);
            } else {
                throw new Error('Mermaid API not recognized - neither render nor init available');
            }
        } catch (error) {
            this.showMermaidError(element, error instanceof Error ? error.message : 'Unknown error');
        }
    }

    /**
     * Show mermaid error message
     * @param element - The element to show error in
     * @param message - Error message
     */
    private showMermaidError(element: HTMLElement, message: string): void {
        element.innerHTML = `
            <div class="mermaid-error">
                <p><strong>Error rendering diagram:</strong> ${message}</p>
                <p><strong>Mermaid Code:</strong></p>
                <pre>${element.textContent || 'No content'}</pre>
                <p><strong>Debug Info:</strong></p>
                <ul>
                    <li>Mermaid loaded: ${!!(window as any).mermaid ? 'Yes' : 'No'}</li>
                    <li>Element ID: ${element.id || 'None'}</li>
                    <li>Element class: ${element.className || 'None'}</li>
                </ul>
            </div>
        `;
    }


    /**
     * Add ESC key listener for closing artefact panel
     */
    private addEscListener(): void {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.closeArtefact();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    /**
     * Remove ESC key listener
     */
    private removeEscListener(): void {
        // ESC listener is automatically removed when panel closes
    }

    /**
     * Setup pan and zoom functionality for the mermaid diagram
     * @param panel - The artefact panel element
     * @param artefactData - The artefact data
     */
    private setupPanZoom(panel: HTMLElement, artefactData: ArtefactData): void {
        const container = panel.querySelector('.pan-zoom-container') as HTMLElement;
        const viewport = panel.querySelector('.mermaid-viewport') as HTMLElement;
        
        if (!container || !viewport) return;

        let scale = 1;
        let translateX = 0;
        let translateY = 0;
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;

        // Apply transform
        const updateTransform = () => {
            viewport.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        };

        // Mouse wheel zoom
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const rect = container.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            // Mouse position relative to container
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Calculate offset from center
            const offsetX = mouseX - centerX;
            const offsetY = mouseY - centerY;
            
            // ZOOM CONFIGURATION - Modify these values as needed
            const zoomSpeed = 0.1;        // Speed of zoom (0.05 = slower, 0.2 = faster)
            const maxZoom = 5.0;          // Maximum zoom level (was 3.0)
            const minZoom = 0.1;          // Minimum zoom level (was 0.2)
            const oldScale = scale;
            
            if (e.deltaY < 0) {
                // Zoom in
                scale = Math.min(scale + zoomSpeed, maxZoom);
            } else {
                // Zoom out
                scale = Math.max(scale - zoomSpeed, minZoom);
            }
            
            // Adjust translation to zoom towards mouse position
            const scaleChange = scale - oldScale;
            translateX -= offsetX * scaleChange;
            translateY -= offsetY * scaleChange;
            
            updateTransform();
        });

        // Mouse drag to pan
        container.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button
                isDragging = true;
                lastX = e.clientX;
                lastY = e.clientY;
                container.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const deltaX = e.clientX - lastX;
                const deltaY = e.clientY - lastY;
                
                translateX += deltaX;
                translateY += deltaY;
                
                lastX = e.clientX;
                lastY = e.clientY;
                
                updateTransform();
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                container.style.cursor = 'grab';
            }
        });

        // Double-click to reset
        container.addEventListener('dblclick', () => {
            scale = 1;
            translateX = 0;
            translateY = 0;
            updateTransform();
        });

        // Touch support for mobile
        let lastTouchDistance = 0;
        let lastTouchX = 0;
        let lastTouchY = 0;

        container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                // Single touch - start panning
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                // Two touches - start zooming
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
            }
            e.preventDefault();
        });

        container.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                // Single touch - pan
                const deltaX = e.touches[0].clientX - lastTouchX;
                const deltaY = e.touches[0].clientY - lastTouchY;
                
                translateX += deltaX;
                translateY += deltaY;
                
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
                
                updateTransform();
            } else if (e.touches.length === 2) {
                // Two touches - zoom
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (lastTouchDistance > 0) {
                    // TOUCH ZOOM CONFIGURATION - Modify these values as needed
                    const touchSensitivity = 0.01;  // Touch zoom sensitivity (0.005 = slower, 0.02 = faster)
                    const maxZoom = 5.0;            // Maximum zoom level (was 3.0)
                    const minZoom = 0.1;            // Minimum zoom level (was 0.2)
                    
                    const scaleChange = (distance - lastTouchDistance) * touchSensitivity;
                    scale = Math.max(minZoom, Math.min(maxZoom, scale + scaleChange));
                    updateTransform();
                }
                
                lastTouchDistance = distance;
            }
            e.preventDefault();
        });
    }


    /**
     * Download the mermaid diagram as PNG or SVG
     * @param panel - The artefact panel element
     * @param artefactData - The artefact data
     */
    private async downloadDiagram(panel: HTMLElement, artefactData: ArtefactData): Promise<void> {
        const mermaidElement = panel.querySelector('.mermaid') as HTMLElement;
        if (!mermaidElement) {
            throw new Error('Mermaid element not found');
        }

        // Find the SVG element within the mermaid container
        const svgElement = mermaidElement.querySelector('svg') as SVGElement;
        if (!svgElement) {
            throw new Error('SVG element not found in mermaid diagram');
        }

        try {
            // First try PNG export
            await this.downloadAsPNG(svgElement, artefactData.id);
        } catch {
            // Fallback to SVG export
            await this.downloadAsSVG(svgElement, artefactData.id);
        }
    }

    /**
     * Download diagram as PNG
     * @param svgElement - The SVG element
     * @param artefactId - The artefact ID
     */
    private async downloadAsPNG(svgElement: SVGElement, artefactId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Create a canvas element
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Cannot get canvas context'));
                return;
            }

            // Get SVG dimensions
            const svgRect = svgElement.getBoundingClientRect();
            const svgWidth = svgRect.width || 800;
            const svgHeight = svgRect.height || 600;

            // Set canvas size (with higher resolution for better quality)
            const scale = 2; // 2x resolution
            canvas.width = svgWidth * scale;
            canvas.height = svgHeight * scale;
            canvas.style.width = svgWidth + 'px';
            canvas.style.height = svgHeight + 'px';

            // Scale the context for high DPI
            ctx.scale(scale, scale);

            // Set white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, svgWidth, svgHeight);

            // Convert SVG to data URL
            const svgData = new XMLSerializer().serializeToString(svgElement);
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const svgUrl = URL.createObjectURL(svgBlob);

            // Create image and draw to canvas
            const img = new Image();
            img.onload = () => {
                try {
                    ctx.drawImage(img, 0, 0, svgWidth, svgHeight);
                    
                    // Convert canvas to PNG blob
                    canvas.toBlob((blob) => {
                        if (blob) {
                            this.downloadBlob(blob, `mermaid-diagram-${artefactId}.png`);
                            URL.revokeObjectURL(svgUrl);
                            resolve();
                        } else {
                            reject(new Error('Failed to create PNG blob'));
                        }
                    }, 'image/png', 1.0);
                } catch (error) {
                    URL.revokeObjectURL(svgUrl);
                    reject(error);
                }
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(svgUrl);
                reject(new Error('Failed to load SVG image'));
            };
            
            img.src = svgUrl;
        });
    }

    /**
     * Download diagram as SVG (fallback)
     * @param svgElement - The SVG element
     * @param artefactId - The artefact ID
     */
    private async downloadAsSVG(svgElement: SVGElement, artefactId: string): Promise<void> {
        // Clone the SVG to avoid modifying the original
        const clonedSvg = svgElement.cloneNode(true) as SVGElement;
        
        // Ensure SVG has proper attributes
        clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        
        // Add white background
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', '100%');
        rect.setAttribute('height', '100%');
        rect.setAttribute('fill', 'white');
        clonedSvg.insertBefore(rect, clonedSvg.firstChild);

        // Serialize SVG
        const svgData = new XMLSerializer().serializeToString(clonedSvg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        
        this.downloadBlob(svgBlob, `mermaid-diagram-${artefactId}.svg`);
    }

    /**
     * Download a blob as a file
     * @param blob - The blob to download
     * @param filename - The filename
     */
    private downloadBlob(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Process streaming text for artefacts
     * @param text - The streaming text
     * @param messageId - The message ID
     * @param onArtefactDetected - Callback when artefact is detected
     * @returns Object with processed text and flag indicating if HTML rendering is needed
     */
    public processStreamingText(
        text: string, 
        messageId: string, 
        onArtefactDetected?: (artefactData: ArtefactData) => void
    ): { processedText: string; hasArtefacts: boolean } {
        try {
            // Check if we have a complete artefact (both opening and closing tags)
            const artefactStart = text.lastIndexOf('<Artefact>');
            const artefactEnd = text.lastIndexOf('</Artefact>');
            
            if (artefactStart !== -1 && artefactEnd !== -1 && artefactEnd > artefactStart) {
                // We have a complete artefact, extract it
                const rawMermaidCode = text.substring(artefactStart + '<Artefact>'.length, artefactEnd).trim();
                // Format the Mermaid code to ensure proper line breaks
                const mermaidCode = this.formatMermaidCode(rawMermaidCode);
                const artefactId = `artefact-${messageId}-streaming-${Date.now()}`;
                
                const artefactData: ArtefactData = {
                    id: artefactId,
                    mermaidCode: mermaidCode,
                    isOpen: false,
                    messageId: messageId
                };

                // Store the artefact
                this.artefacts.set(artefactId, artefactData);
                
                // Create the actual button HTML immediately
                const buttonElement = this.createArtefactButton(artefactData);
                const buttonHTML = buttonElement.outerHTML;
                
                // Replace the artefact tags with the actual button HTML
                const beforeArtefact = text.substring(0, artefactStart);
                const afterArtefact = text.substring(artefactEnd + '</Artefact>'.length);
                
                const processedText = beforeArtefact + '\n' + buttonHTML + '\n' + afterArtefact;
                
                // Notify that an artefact was detected
                if (onArtefactDetected) {
                    onArtefactDetected(artefactData);
                }
                
                return { processedText, hasArtefacts: true };
            }
            
            return { processedText: text, hasArtefacts: false };
        } catch {
            return { processedText: text, hasArtefacts: false }; // Return original text if processing fails
        }
    }

    /**
     * Get artefact data by ID
     * @param artefactId - The artefact ID
     * @returns Artefact data or undefined
     */
    public getArtefact(artefactId: string): ArtefactData | undefined {
        return this.artefacts.get(artefactId);
    }

    /**
     * Get all artefacts for a message
     * @param messageId - The message ID
     * @returns Array of artefact data
     */
    public getArtefactsForMessage(messageId: string): ArtefactData[] {
        return Array.from(this.artefacts.values()).filter(
            artefact => artefact.messageId === messageId
        );
    }
}

/**
 * Utility function to get artefact handler instance
 */
export function getArtefactHandler(): ArtefactHandler {
    return ArtefactHandler.getInstance();
}
