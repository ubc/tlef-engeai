/**
 * DOCUMENT SETUP ONBOARDING MODULE - REVISED VERSION
 * 
 * This module handles the complete onboarding flow for instructors learning how to manage
 * course content, including learning objectives and additional materials.
 * 
 * FEATURES:
 * - Two-column layout with left steps panel and right content area
 * - Step-by-step tutorial for document management
 * - Interactive examples and demonstrations
 * - Clear explanations of content structure
 * - Tips and best practices
 * - Comprehensive validation and error handling
 * - Clean, maintainable code structure
 * 
 * ONBOARDING STEPS:
 * 1. Document Upload Overview - Understanding content structure
 * 2. Learning Objectives - How to add and manage objectives
 * 3. Additional Materials - Upload files, text, and URLs
 * 4. Complete Setup - Ready to start managing content
 * 
 * @author: gatahcha (revised)
 * @date: 2025-01-27
 * @version: 2.0.0
 */

import { loadComponentHTML } from "../functions/api.js";
import { activeCourse, ContentDivision, courseItem, onBoardingScreen } from "../../../src/functions/types.js";
import { showErrorModal, showHelpModal } from "../modal-overlay.js";

// ===========================================
// TYPE DEFINITIONS
// ===========================================

/**
 * Represents the current state of the document onboarding process
 */
interface DocumentOnboardingState {
    currentStep: number;
    totalSteps: number;
    isValid: boolean;
}

/**
 * Document onboarding step configuration
 */
interface DocumentOnboardingStep {
    id: number;
    title: string;
    description: string;
    content: string;
}

// ===========================================
// ONBOARDING STEPS CONFIGURATION
// ===========================================

const DOCUMENT_ONBOARDING_STEPS: DocumentOnboardingStep[] = [
    {
        id: 1,
        title: "Document Upload Overview",
        description: "Understanding the content structure",
        content: "step-1"
    },
    {
        id: 2,
        title: "Learning Objectives",
        description: "How to add and manage objectives",
        content: "step-2"
    },
    {
        id: 3,
        title: "Additional Materials",
        description: "Upload files, text, and URLs",
        content: "step-3"
    },
    {
        id: 4,
        title: "Complete Setup",
        description: "Ready to start managing content",
        content: "step-4"
    }
];

// ===========================================
// GLOBAL STATE
// ===========================================

let documentOnboardingState: DocumentOnboardingState = {
    currentStep: 1,
    totalSteps: DOCUMENT_ONBOARDING_STEPS.length,
    isValid: true
};

// ===========================================
// MAIN EXPORT FUNCTION
// ===========================================

/**
 * Renders the document setup onboarding page and orchestrates the complete onboarding flow.
 * 
 * This function:
 * 1. Loads the onboarding HTML component
 * 2. Initializes the onboarding state
 * 3. Sets up event listeners for all interactions
 * 4. Manages step navigation and validation
 * 5. Handles final completion
 * 
 * @param instructorCourse - The instructor's course object to be populated
 * @returns Promise<void>
 */
export const renderDocumentOnboarding = async (instructorCourse: activeCourse): Promise<void> => {
    console.log("🚀 Starting document setup onboarding process...");
    
    try {
        // Create a copy of the instructor course for temporary state management
        const onBoardingCourse: activeCourse = { ...instructorCourse };
        
        // Initialize onboarding state
        const state: DocumentOnboardingState = {
            currentStep: 1,
            totalSteps: 4,
            isValid: false
        };

        // Load the onboarding component
        const container = document.getElementById('main-content-area');
        if (!container) {
            throw new Error("Main content area not found");
        }

        // Add onboarding-active class to hide instructor sidebar
        document.body.classList.add('onboarding-active');

        const html = await loadComponentHTML('onboarding');
        container.innerHTML = html;

        // Wait for DOM to be ready
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }

        // Initialize the onboarding interface
        await initializeDocumentOnboarding(state, onBoardingCourse, instructorCourse);

    } catch (error) {
        console.error("❌ Error during document onboarding initialization:", error);
        await showErrorModal("Initialization Error", "Failed to initialize document setup onboarding. Please refresh the page and try again.");
    }
};

/**
 * Initialize the document setup onboarding process
 * 
 * @param containerId - The ID of the container to render the onboarding
 * @returns Promise<void>
 */
export async function initializeDocumentSetupOnboarding(containerId: string): Promise<void> {
    try {
        console.log('Initializing document setup onboarding...');
        
        // Load the onboarding HTML
        const onboardingHTML = await loadComponentHTML('onboarding');
        
        // Render the onboarding
        renderDocumentOnboardingHTML(containerId, onboardingHTML);
        
        // Setup event listeners
        setupDocumentOnboardingEventListeners();
        
        // Initialize the first step
        updateDocumentOnboardingStep(1);
        
        console.log('Document setup onboarding initialized successfully');
        
    } catch (error) {
        console.error('Error initializing document setup onboarding:', error);
        showErrorModal('Error', 'Failed to load document setup onboarding. Please try again.');
    }
}

// ===========================================
// INITIALIZATION FUNCTIONS
// ===========================================

/**
 * Initializes the document onboarding interface with event listeners and initial state
 * 
 * @param state - The document onboarding state object
 * @param onBoardingCourse - The onboarding course object for temporary state management
 * @param instructorCourse - The original instructor course object (only modified when database is set)
 */
async function initializeDocumentOnboarding(state: DocumentOnboardingState, onBoardingCourse: activeCourse, instructorCourse: activeCourse): Promise<void> {
    console.log("🔧 Initializing document onboarding interface...");

    // Set up navigation event listeners
    setupDocumentNavigationListeners(state, onBoardingCourse, instructorCourse);
    
    // Set up help button listener
    setupDocumentHelpListener(state);
    
    // Set up window resize listener for responsive justify-content
    setupDocumentResizeListener(state, onBoardingCourse);
    
    // Initialize the first step
    updateDocumentStepDisplay(state, onBoardingCourse);
    
    // Set up step indicators
    updateDocumentStepIndicators(state, onBoardingCourse);
    
    console.log("✅ Document onboarding interface initialized successfully");
}

/**
 * Sets up window resize listener to recalculate content justification
 * 
 * @param state - The document onboarding state object
 * @param onBoardingCourse - The document onboarding course object for state synchronization
 */
function setupDocumentResizeListener(state: DocumentOnboardingState, onBoardingCourse: activeCourse): void {
    let resizeTimeout: number;
    
    window.addEventListener('resize', () => {
        // Debounce resize events to avoid excessive calculations
        clearTimeout(resizeTimeout);
        resizeTimeout = window.setTimeout(() => {
            const currentStepElement = document.getElementById(`step-${state.currentStep}`);
            if (currentStepElement && currentStepElement.classList.contains('active')) {
                adjustDocumentContentJustification(currentStepElement);
            }
        }, 100);
    });
}

/**
 * Sets up navigation button event listeners
 * 
 * @param state - The document onboarding state object
 * @param onBoardingCourse - The document onboarding course object for temporary state management
 * @param instructorCourse - The original instructor course object (only modified when database is set)
 */
function setupDocumentNavigationListeners(state: DocumentOnboardingState, onBoardingCourse: activeCourse, instructorCourse: activeCourse): void {
    const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('next-btn') as HTMLButtonElement;
    const completeBtn = document.getElementById('complete-btn') as HTMLButtonElement;

    if (prevBtn) {
        prevBtn.addEventListener('click', () => handleDocumentBackNavigation(state, onBoardingCourse));
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => handleDocumentNextNavigation(state, onBoardingCourse, instructorCourse));
    }

    if (completeBtn) {
        completeBtn.addEventListener('click', () => handleDocumentFinalSubmission(state, onBoardingCourse, instructorCourse));
    }
}

/**
 * Sets up the help button event listener
 * 
 * @param state - The document onboarding state object
 */
function setupDocumentHelpListener(state: DocumentOnboardingState): void {
    const helpBtn = document.getElementById('helpBtn') as HTMLButtonElement;
    if (helpBtn) {
        helpBtn.addEventListener('click', () => {
            showDocumentStepHelp(state.currentStep);
        });
    }
}

/**
 * Shows help content for the current step
 * 
 * @param stepNumber - The current step number
 */
async function showDocumentStepHelp(stepNumber: number): Promise<void> {
    const helpContent = getDocumentStepHelpContent(stepNumber);
    await showHelpModal(stepNumber, helpContent.title, helpContent.content);
}

/**
 * Gets help content for a specific step from HTML templates
 * 
 * @param stepNumber - The step number
 * @returns Object with title and content
 */
function getDocumentStepHelpContent(stepNumber: number): { title: string; content: string } {
    const stepTitles = {
        1: "Document Upload Overview",
        2: "Learning Objectives", 
        3: "Additional Materials",
        4: "Complete Setup"
    };

    // Get content from HTML template
    const helpElement = document.getElementById(`help-step-${stepNumber}`);
    const content = helpElement ? helpElement.innerHTML : "<p>No help content available for this step.</p>";
    
    return {
        title: stepTitles[stepNumber as keyof typeof stepTitles] || "Help",
        content: content
    };
}

// ===========================================
// RENDERING FUNCTIONS
// ===========================================

/**
 * Render the document onboarding HTML into the specified container
 * 
 * @param containerId - The ID of the container element
 * @param html - The HTML content to render
 */
function renderDocumentOnboardingHTML(containerId: string, html: string): void {
    const container = document.getElementById(containerId);
    if (!container) {
        throw new Error(`Container with ID '${containerId}' not found`);
    }
    
    container.innerHTML = html;
    
    // Initialize Feather icons if available
    if (typeof (window as any).feather !== 'undefined') {
        (window as any).feather.replace();
    }
}

// ===========================================
// NAVIGATION FUNCTIONS
// ===========================================

/**
 * Handles back navigation between steps
 * 
 * @param state - The document onboarding state object
 */
function handleDocumentBackNavigation(state: DocumentOnboardingState, onBoardingCourse: activeCourse): void {
    if (state.currentStep > 1) {
        state.currentStep--;
        updateDocumentStepDisplay(state, onBoardingCourse);
        updateDocumentStepIndicators(state, onBoardingCourse);
        updateDocumentNavigationButtons(state);
        console.log(`⬅️ Navigated to step ${state.currentStep}`);
    }
}

/**
 * Handles next navigation and final submission
 * 
 * @param state - The document onboarding state object
 * @param onBoardingCourse - The document onboarding course object for temporary state management
 * @param instructorCourse - The original instructor course object (only modified when database is set)
 */
async function handleDocumentNextNavigation(state: DocumentOnboardingState, onBoardingCourse: activeCourse, instructorCourse: activeCourse): Promise<void> {
    // Validate current step before proceeding
    if (!(await validateDocumentCurrentStep(state, onBoardingCourse))) {
        return;
    } 

    if (state.currentStep < state.totalSteps) {
        // Move to next step
        state.currentStep++; 
        updateDocumentStepDisplay(state, onBoardingCourse);
        updateDocumentStepIndicators(state, onBoardingCourse);
        updateDocumentNavigationButtons(state);
        
        console.log(`➡️ Navigated to step ${state.currentStep}`);
    } else {
        // Final submission
        await handleDocumentFinalSubmission(state, onBoardingCourse, instructorCourse);
    }
}

/**
 * Validates the current step before allowing navigation
 * 
 * @param state - The document onboarding state object
 * @returns Promise<boolean> indicating if validation passed
 */
async function validateDocumentCurrentStep(state: DocumentOnboardingState, onBoardingCourse: activeCourse): Promise<boolean> {
    switch (state.currentStep) {
        case 1: // Document Upload Overview - always valid
            return true;
            
        case 2: // Learning Objectives - always valid (tutorial)
            return true;
            
        case 3: // Additional Materials - always valid (tutorial)
            return true;
            
        case 4: // Complete Setup - always valid
            return true;
            
        default:
            return true;
    }
}

// ===========================================
// EVENT LISTENERS
// ===========================================

/**
 * Setup all event listeners for the document onboarding
 */
function setupDocumentOnboardingEventListeners(): void {
    // Step navigation
    const stepItems = document.querySelectorAll('.step-item');
    stepItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            const stepNumber = index + 1;
            if (stepNumber <= documentOnboardingState.currentStep) {
                updateDocumentOnboardingStep(stepNumber);
            }
        });
    });
    
    // Navigation buttons
    const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('next-btn') as HTMLButtonElement;
    const completeBtn = document.getElementById('complete-btn') as HTMLButtonElement;
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (documentOnboardingState.currentStep > 1) {
                updateDocumentOnboardingStep(documentOnboardingState.currentStep - 1);
            }
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (documentOnboardingState.currentStep < documentOnboardingState.totalSteps) {
                updateDocumentOnboardingStep(documentOnboardingState.currentStep + 1);
            }
        });
    }
    
    if (completeBtn) {
        completeBtn.addEventListener('click', () => {
            completeDocumentOnboarding();
        });
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', handleDocumentOnboardingKeyboard);
}

/**
 * Handle keyboard navigation for the document onboarding
 * 
 * @param event - The keyboard event
 */
function handleDocumentOnboardingKeyboard(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' && documentOnboardingState.currentStep > 1) {
        updateDocumentOnboardingStep(documentOnboardingState.currentStep - 1);
    } else if (event.key === 'ArrowRight' && documentOnboardingState.currentStep < documentOnboardingState.totalSteps) {
        updateDocumentOnboardingStep(documentOnboardingState.currentStep + 1);
    } else if (event.key === 'Enter' && documentOnboardingState.currentStep === documentOnboardingState.totalSteps) {
        completeDocumentOnboarding();
    }
}

// ===========================================
// UI UPDATE FUNCTIONS
// ===========================================

/**
 * Updates the display to show the current step and synchronizes all form values
 * 
 * @param state - The document onboarding state object
 * @param onBoardingCourse - The document onboarding course object for state synchronization
 */
function updateDocumentStepDisplay(state: DocumentOnboardingState, onBoardingCourse: activeCourse): void {
    // Hide all content steps
    const contentSteps = document.querySelectorAll('.step-content-panel');
    contentSteps.forEach(step => step.classList.remove('active'));
    
    // Show current step
    const currentStepElement = document.getElementById(`step-${state.currentStep}`);
    if (currentStepElement) {
        currentStepElement.classList.add('active');
        
        // Check if content overflows and adjust justify-content accordingly
        setTimeout(() => adjustDocumentContentJustification(currentStepElement), 10);
    }
}

/**
 * Adjusts the justify-content of a content step based on whether content overflows
 * 
 * @param contentStepElement - The content step element to adjust
 */
function adjustDocumentContentJustification(contentStepElement: HTMLElement): void {
    const contentStepInner = contentStepElement.querySelector('.step-body') as HTMLElement;
    if (!contentStepInner) return;
    
    // Get the available height (viewport height minus navigation and padding)
    const availableHeight = window.innerHeight - 200; // Account for navigation and margins
    
    // Get the content height
    const contentHeight = contentStepInner.scrollHeight;
    
    // If content is taller than available space, use flex-start for scrolling
    // Otherwise, use center for better visual balance
    if (contentHeight > availableHeight) {
        contentStepElement.classList.add('overflow-content');
        contentStepElement.classList.remove('center-content');
    } else {
        contentStepElement.classList.add('center-content');
        contentStepElement.classList.remove('overflow-content');
    }
}

/**
 * Updates the step indicators in the left panel
 * 
 * @param state - The document onboarding state object
 */
function updateDocumentStepIndicators(state: DocumentOnboardingState, onBoardingCourse: activeCourse): void {
    const stepItems = document.querySelectorAll('.step-item');
    
    stepItems.forEach((item, index) => {
        const stepNumber = index + 1;
        const stepCircle = item.querySelector('.step-circle');
        const stepLine = item.querySelector('.step-line');
        
        if (stepCircle) {
            stepCircle.className = 'step-circle';
            
            if (stepNumber < state.currentStep) {
                stepCircle.classList.add('completed');
            } else if (stepNumber === state.currentStep) {
                stepCircle.classList.add('current');
            } else {
                stepCircle.classList.add('pending');
            }
        }
        
        if (stepLine && stepNumber < state.currentStep) {
            stepLine.classList.add('completed');
        }
    });
}

/**
 * Updates the navigation buttons based on current step
 * 
 * @param state - The document onboarding state object
 */
function updateDocumentNavigationButtons(state: DocumentOnboardingState): void {
    const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('next-btn') as HTMLButtonElement;
    const completeBtn = document.getElementById('complete-btn') as HTMLButtonElement;
    
    if (prevBtn) {
        prevBtn.style.display = state.currentStep > 1 ? 'flex' : 'none';
    }
    
    if (nextBtn) {
        if (state.currentStep === state.totalSteps) {
            nextBtn.style.display = 'none';
        } else {
            nextBtn.style.display = 'flex';
        }
    }

    if (completeBtn) {
        if (state.currentStep === state.totalSteps) {
            completeBtn.style.display = 'flex';
        } else {
            completeBtn.style.display = 'none';
        }
    }
}

// ===========================================
// STEP MANAGEMENT
// ===========================================

/**
 * Update the current step of the document onboarding
 * 
 * @param stepNumber - The step number to navigate to
 */
function updateDocumentOnboardingStep(stepNumber: number): void {
    if (stepNumber < 1 || stepNumber > documentOnboardingState.totalSteps) {
        console.warn(`Invalid step number: ${stepNumber}`);
        return;
    }
    
    console.log(`Updating document onboarding to step ${stepNumber}`);
    
    // Update state
    documentOnboardingState.currentStep = stepNumber;
    
    // Update step indicators
    updateDocumentOnboardingStepIndicators();
    
    // Update content panels
    updateDocumentOnboardingContentPanels();
    
    // Update navigation buttons
    updateDocumentOnboardingNavigationButtons();
    
    // Scroll to top of content
    const contentContainer = document.querySelector('.content-container');
    if (contentContainer) {
        contentContainer.scrollTop = 0;
    }
}

/**
 * Update the step indicators in the left panel
 */
function updateDocumentOnboardingStepIndicators(): void {
    const stepItems = document.querySelectorAll('.step-item');
    
    stepItems.forEach((item, index) => {
        const stepNumber = index + 1;
        const stepCircle = item.querySelector('.step-circle') as HTMLElement;
        const stepLine = item.querySelector('.step-line') as HTMLElement;
        
        if (!stepCircle) return;
        
        // Remove all classes
        stepCircle.classList.remove('completed', 'current', 'pending');
        item.classList.remove('active');
        
        if (stepNumber < documentOnboardingState.currentStep) {
            // Completed step
            stepCircle.classList.add('completed');
            stepCircle.innerHTML = '<span class="step-number">✓</span>';
        } else if (stepNumber === documentOnboardingState.currentStep) {
            // Current step
            stepCircle.classList.add('current');
            stepCircle.innerHTML = `<span class="step-number">${stepNumber}</span>`;
            item.classList.add('active');
        } else {
            // Pending step
            stepCircle.classList.add('pending');
            stepCircle.innerHTML = `<span class="step-number">${stepNumber}</span>`;
        }
        
        // Update step line
        if (stepLine) {
            if (stepNumber < documentOnboardingState.currentStep) {
                stepLine.style.background = 'var(--success-color)';
            } else {
                stepLine.style.background = '#dee2e6';
            }
        }
    });
}

/**
 * Update the content panels to show the current step
 */
function updateDocumentOnboardingContentPanels(): void {
    const contentPanels = document.querySelectorAll('.step-content-panel');
    
    contentPanels.forEach((panel, index) => {
        const stepNumber = index + 1;
        const panelElement = panel as HTMLElement;
        
        if (stepNumber === documentOnboardingState.currentStep) {
            panelElement.style.display = 'block';
        } else {
            panelElement.style.display = 'none';
        }
    });
}

/**
 * Update the navigation buttons based on current step
 */
function updateDocumentOnboardingNavigationButtons(): void {
    const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('next-btn') as HTMLButtonElement;
    const completeBtn = document.getElementById('complete-btn') as HTMLButtonElement;
    
    // Update previous button
    if (prevBtn) {
        prevBtn.disabled = documentOnboardingState.currentStep === 1;
    }
    
    // Update next/complete buttons
    if (documentOnboardingState.currentStep === documentOnboardingState.totalSteps) {
        // Last step - show complete button
        if (nextBtn) nextBtn.style.display = 'none';
        if (completeBtn) completeBtn.style.display = 'inline-flex';
    } else {
        // Not last step - show next button
        if (nextBtn) nextBtn.style.display = 'inline-flex';
        if (completeBtn) completeBtn.style.display = 'none';
    }
}

// ===========================================
// COMPLETION HANDLING
// ===========================================

/**
 * Handles the final submission of the document onboarding data
 * 
 * @param state - The document onboarding state object
 * @param onBoardingCourse - The document onboarding course object for temporary state management
 * @param instructorCourse - The original instructor course object (only modified when database is set)
 * @returns Promise<void>
 */
async function handleDocumentFinalSubmission(state: DocumentOnboardingState, onBoardingCourse: activeCourse, instructorCourse: activeCourse): Promise<void> {
    console.log("🎯 Processing document onboarding final submission...");
    
    try {
        // Remove onboarding-active class to show instructor sidebar
        document.body.classList.remove('onboarding-active');
        
        // Dispatch completion event
        window.dispatchEvent(new CustomEvent('documentOnboardingComplete'));
        
        console.log("✅ Document onboarding completed successfully!");
        
    } catch (error) {
        console.error("❌ Error during document onboarding final submission:", error);
        await showErrorModal("Submission Error", "Failed to complete document setup onboarding. Please try again.");
    }
}

/**
 * Complete the document onboarding process
 */
function completeDocumentOnboarding(): void {
    console.log('Completing document setup onboarding...');
    
    try {
        // Show completion message
        showDocumentOnboardingCompletionMessage();
        
        // Dispatch completion event
        const completionEvent = new CustomEvent('documentOnboardingCompleted', {
            detail: {
                completedAt: new Date(),
                stepsCompleted: documentOnboardingState.totalSteps
            }
        });
        document.dispatchEvent(completionEvent);
        
        // Close onboarding after a delay
        setTimeout(() => {
            closeDocumentOnboarding();
        }, 2000);
        
    } catch (error) {
        console.error('Error completing document onboarding:', error);
        showErrorModal('Error', 'Failed to complete onboarding. Please try again.');
    }
}

/**
 * Show a completion message for the document onboarding
 */
function showDocumentOnboardingCompletionMessage(): void {
    // Create a temporary success message
    const message = document.createElement('div');
    message.className = 'onboarding-completion-message';
    message.innerHTML = `
        <div style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            text-align: center;
            z-index: 1000;
            max-width: 400px;
        ">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🎉</div>
            <h3 style="color: var(--success-color); margin-bottom: 1rem;">Document Setup Complete!</h3>
            <p style="color: #666; margin: 0;">You're ready to start managing your course content.</p>
        </div>
    `;
    
    document.body.appendChild(message);
    
    // Remove message after 3 seconds
    setTimeout(() => {
        if (message.parentNode) {
            message.parentNode.removeChild(message);
        }
    }, 3000);
}

/**
 * Close the document onboarding
 */
function closeDocumentOnboarding(): void {
    // Dispatch close event
    const closeEvent = new CustomEvent('documentOnboardingClosed', {
        detail: {
            closedAt: new Date(),
            finalStep: documentOnboardingState.currentStep
        }
    });
    document.dispatchEvent(closeEvent);
    
    // Clear the container
    const container = document.querySelector('.onboarding');
    if (container && container.parentNode) {
        container.parentNode.removeChild(container);
    }
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Get the current document onboarding state
 * 
 * @returns The current onboarding state
 */
export function getDocumentOnboardingState(): DocumentOnboardingState {
    return { ...documentOnboardingState };
}

/**
 * Reset the document onboarding to the first step
 */
export function resetDocumentOnboarding(): void {
    documentOnboardingState.currentStep = 1;
    updateDocumentOnboardingStep(1);
}

/**
 * Skip to a specific step in the document onboarding
 * 
 * @param stepNumber - The step number to skip to
 */
export function skipToDocumentOnboardingStep(stepNumber: number): void {
    if (stepNumber >= 1 && stepNumber <= documentOnboardingState.totalSteps) {
        updateDocumentOnboardingStep(stepNumber);
    } else {
        console.warn(`Invalid step number for skip: ${stepNumber}`);
    }
}

// ===========================================
// EXPORT FOR GLOBAL ACCESS
// ===========================================

// Make functions available globally if needed
(window as any).DocumentOnboarding = {
    initialize: initializeDocumentSetupOnboarding,
    render: renderDocumentOnboarding,
    getState: getDocumentOnboardingState,
    reset: resetDocumentOnboarding,
    skipTo: skipToDocumentOnboardingStep
};
