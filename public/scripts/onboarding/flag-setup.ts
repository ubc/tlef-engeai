/**
 * FLAG SETUP MODULE - ONBOARDING VERSION
 * 
 * This module handles the flag setup onboarding flow for instructors.
 * It provides a step-by-step tutorial on how to manage and respond to student flags.
 * 
 * FEATURES:
 * - 5-step onboarding process with navigation
 * - Interactive accordion for flag types explanation
 * - Demo flag resolution interface
 * - Demo response editing functionality
 * - No backend integration (pure tutorial)
 * 
 * ONBOARDING STEPS:
 * 1. Welcome - Introduction to flag management
 * 2. Flag Types - Accordion showing different flag categories
 * 3. Resolving Flags - Demo of flag resolution interface
 * 4. Edit Comments - Demo of response editing functionality
 * 5. Congratulations - Completion and next steps
 * 
 * @author: gatahcha (revised)
 * @date: 2025-01-27
 * @version: 1.0.0
 */

import { loadComponentHTML } from "../functions/api.js";
import { activeCourse } from "../../../src/functions/types.js";
import { showErrorModal, showHelpModal } from "../modal-overlay.js";

// ===========================================
// TYPE DEFINITIONS
// ===========================================

/**
 * Represents the current state of the flag setup onboarding process
 */
interface FlagSetupState {
    currentStep: number;
    totalSteps: number;
    isValid: boolean;
}

// ===========================================
// MAIN EXPORT FUNCTION
// ===========================================

/**
 * Renders the flag setup onboarding page and orchestrates the complete flow.
 * 
 * This function:
 * 1. Loads the flag setup HTML component
 * 2. Initializes the onboarding state
 * 3. Sets up event listeners for all interactions
 * 4. Manages step navigation and validation
 * 5. Handles demo functionality for flag management
 * 
 * @param instructorCourse - The instructor's course object
 * @returns Promise<void>
 */
export const renderFlagSetup = async (instructorCourse: activeCourse): Promise<void> => {
    console.log("🚀 Starting flag setup onboarding...");
    
    try {
        // Initialize flag setup state
        const state: FlagSetupState = {
            currentStep: 1,
            totalSteps: 5,
            isValid: false
        };

        // Load the flag setup component
        const container = document.getElementById('main-content-area');
        if (!container) {
            throw new Error("Main content area not found");
        }

        // Add onboarding-active class to hide instructor sidebar
        document.body.classList.add('onboarding-active');

        const html = await loadComponentHTML('flag-setup');
        container.innerHTML = html;

        // Wait for DOM to be ready
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }

        // Initialize the flag setup interface
        await initializeFlagSetup(state, instructorCourse);

    } catch (error) {
        console.error("❌ Error during flag setup initialization:", error);
        await showErrorModal("Initialization Error", "Failed to initialize flag setup. Please refresh the page and try again.");
    }
};

// ===========================================
// INITIALIZATION FUNCTIONS
// ===========================================

/**
 * Initializes the flag setup interface with event listeners and initial state
 * 
 * @param state - The flag setup state object
 * @param instructorCourse - The instructor course object
 */
async function initializeFlagSetup(state: FlagSetupState, instructorCourse: activeCourse): Promise<void> {
    console.log("🔧 Initializing flag setup interface...");

    // Set up navigation event listeners
    setupNavigationListeners(state, instructorCourse);
    
    // Set up demo event listeners
    setupDemoListeners(state);
    
    // Set up help button listener
    setupHelpListener(state);
    
    // Set up window resize listener for responsive justify-content
    setupResizeListener(state);
    
    // Initialize the first step
    updateStepDisplay(state);
    
    // Set up step indicators
    updateStepIndicators(state);
    
    console.log("✅ Flag setup interface initialized successfully");
}

/**
 * Sets up window resize listener to recalculate content justification
 * 
 * @param state - The flag setup state object
 */
function setupResizeListener(state: FlagSetupState): void {
    let resizeTimeout: number;
    
    window.addEventListener('resize', () => {
        // Debounce resize events to avoid excessive calculations
        clearTimeout(resizeTimeout);
        resizeTimeout = window.setTimeout(() => {
            const currentStepElement = document.getElementById(`content-step-${state.currentStep}`);
            if (currentStepElement && currentStepElement.classList.contains('active')) {
                adjustContentJustification(currentStepElement);
            }
        }, 100);
    });
}

/**
 * Sets up navigation button event listeners
 * 
 * @param state - The flag setup state object
 * @param instructorCourse - The instructor course object
 */
function setupNavigationListeners(state: FlagSetupState, instructorCourse: activeCourse): void {
    const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;

    if (backBtn) {
        backBtn.addEventListener('click', () => handleBackNavigation(state));
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => handleNextNavigation(state, instructorCourse));
    }
}

/**
 * Sets up demo functionality event listeners
 * 
 * @param state - The flag setup state object
 */
function setupDemoListeners(state: FlagSetupState): void {
    // Accordion functionality for step 2
    setupAccordionListeners();
    
    // Flag card toggle functionality for step 3
    setupFlagCardListeners();
    
    // Demo edit functionality for step 4
    setupDemoEditListeners();
}

/**
 * Sets up accordion event listeners for flag types
 */
function setupAccordionListeners(): void {
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    
    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const accordionItem = header.closest('.accordion-item');
            const targetId = header.getAttribute('data-target');
            
            if (accordionItem && targetId) {
                // Close all other accordion items
                document.querySelectorAll('.accordion-item').forEach(item => {
                    if (item !== accordionItem) {
                        item.classList.remove('active');
                    }
                });
                
                // Toggle current accordion item
                accordionItem.classList.toggle('active');
                
                // Update feather icons
                if (typeof (window as any).feather !== 'undefined') {
                    (window as any).feather.replace();
                }
                
                // Recalculate overflow handling after accordion change
                const currentStepElement = document.querySelector('.content-step.active');
                if (currentStepElement) {
                    // Use a small delay to allow the DOM to update after the toggle
                    setTimeout(() => {
                        adjustContentJustification(currentStepElement as HTMLElement);
                    }, 100);
                }
            }
        });
    });
}

/**
 * Sets up flag card toggle functionality for step 3
 */
function setupFlagCardListeners(): void {
    // Make toggleFlagCard function globally available
    (window as any).toggleFlagCard = toggleFlagCard;
}

/**
 * Toggles the flag card content visibility
 * 
 * @param headerElement - The flag card header element that was clicked
 */
function toggleFlagCard(headerElement: HTMLElement): void {
    const flagCard = headerElement.closest('.flag-card');
    if (!flagCard) return;
    
    const content = flagCard.querySelector('.flag-card-content') as HTMLElement;
    const chevron = flagCard.querySelector('.chevron-icon') as HTMLElement;
    
    if (!content || !chevron) return;
    
    // Toggle active class
    flagCard.classList.toggle('active');
    
    // Toggle content visibility
    if (flagCard.classList.contains('active')) {
        content.style.display = 'block';
        // Update feather icons after showing content
        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
    } else {
        content.style.display = 'none';
    }
    
    // Recalculate overflow handling after content change
    // Find the current active step element
    const currentStepElement = document.querySelector('.content-step.active');
    if (currentStepElement) {
        // Use a small delay to allow the DOM to update after the toggle
        setTimeout(() => {
            adjustContentJustification(currentStepElement as HTMLElement);
        }, 100);
    }
}

/**
 * Sets up demo edit functionality event listeners
 */
function setupDemoEditListeners(): void {
    const editBtn = document.querySelector('.demo-edit-actions .demo-btn');
    const editForm = document.querySelector('.demo-edit-form');
    const saveBtn = document.querySelector('.demo-edit-form .demo-btn');
    const cancelBtn = document.querySelector('.demo-edit-form .demo-btn.secondary');
    
    // Helper function to recalculate overflow after form visibility changes
    const recalculateOverflow = () => {
        const currentStepElement = document.querySelector('.content-step.active');
        if (currentStepElement) {
            setTimeout(() => {
                adjustContentJustification(currentStepElement as HTMLElement);
            }, 100);
        }
    };
    
    if (editBtn && editForm) {
        editBtn.addEventListener('click', () => {
            (editForm as HTMLElement).style.display = 'block';
            recalculateOverflow();
        });
    }
    
    if (cancelBtn && editForm) {
        cancelBtn.addEventListener('click', () => {
            (editForm as HTMLElement).style.display = 'none';
            recalculateOverflow();
        });
    }
    
    if (saveBtn && editForm) {
        saveBtn.addEventListener('click', () => {
            // Demo save functionality
            const textarea = editForm.querySelector('.demo-response-input') as HTMLTextAreaElement;
            if (textarea) {
                const newResponse = textarea.value;
                const originalResponse = document.querySelector('.demo-original-response');
                if (originalResponse) {
                    originalResponse.textContent = newResponse;
                }
            }
            (editForm as HTMLElement).style.display = 'none';
            recalculateOverflow();
        });
    }
}

/**
 * Sets up the help button event listener
 * 
 * @param state - The flag setup state object
 */
function setupHelpListener(state: FlagSetupState): void {
    const helpBtn = document.getElementById('helpBtn') as HTMLButtonElement;
    if (helpBtn) {
        helpBtn.addEventListener('click', () => {
            showStepHelp(state.currentStep);
        });
    }
}

/**
 * Shows help content for the current step
 * 
 * @param stepNumber - The current step number
 */
async function showStepHelp(stepNumber: number): Promise<void> {
    const helpContent = getStepHelpContent(stepNumber);
    await showHelpModal(stepNumber, helpContent.title, helpContent.content);
}

/**
 * Gets help content for a specific step from HTML templates
 * 
 * @param stepNumber - The step number
 * @returns Object with title and content
 */
function getStepHelpContent(stepNumber: number): { title: string; content: string } {
    const stepTitles = {
        1: "Welcome to Flag Management",
        2: "Understanding Flag Types", 
        3: "Resolving Student Flags",
        4: "Editing Your Responses",
        5: "Flag Management Complete"
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
// NAVIGATION FUNCTIONS
// ===========================================

/**
 * Handles back navigation between steps
 * 
 * @param state - The flag setup state object
 */
function handleBackNavigation(state: FlagSetupState): void {
    if (state.currentStep > 1) {
        state.currentStep--;
        updateStepDisplay(state);
        updateStepIndicators(state);
        updateNavigationButtons(state);
        console.log(`⬅️ Navigated to step ${state.currentStep}`);
    }
}

/**
 * Handles next navigation and final completion
 * 
 * @param state - The flag setup state object
 * @param instructorCourse - The instructor course object
 */
async function handleNextNavigation(state: FlagSetupState, instructorCourse: activeCourse): Promise<void> {
    // Validate current step before proceeding
    if (!(await validateCurrentStep(state))) {
        return;
    }

    if (state.currentStep < state.totalSteps) {
        // Move to next step
        state.currentStep++; 
        updateStepDisplay(state);
        updateStepIndicators(state);
        updateNavigationButtons(state);
        
        console.log(`➡️ Navigated to step ${state.currentStep}`);
    } else {
        // Final completion
        await handleFinalCompletion(state, instructorCourse);
    }
}

/**
 * Validates the current step before allowing navigation
 * 
 * @param state - The flag setup state object
 * @returns Promise<boolean> indicating if validation passed
 */
async function validateCurrentStep(state: FlagSetupState): Promise<boolean> {
    switch (state.currentStep) {
        case 1: // Welcome - always valid
            return true;
            
        case 2: // Flag Types - always valid
            return true;
            
        case 3: // Resolving Flags - always valid
            return true;
            
        case 4: // Edit Comments - always valid
            return true;
            
        case 5: // Congratulations - always valid
            return true;
            
        default:
            return true;
    }
}

/**
 * Handles the final completion of flag setup
 * 
 * @param state - The flag setup state object
 * @param instructorCourse - The instructor course object
 */
async function handleFinalCompletion(state: FlagSetupState, instructorCourse: activeCourse): Promise<void> {
    console.log("🎯 Completing flag setup...");
    
    try {
        // Mark flag setup as complete
        instructorCourse.flagSetup = true;
        
        // Remove onboarding-active class to show instructor sidebar
        document.body.classList.remove('onboarding-active');
        
        // Dispatch completion event
        window.dispatchEvent(new CustomEvent('flagSetupComplete'));
        
        console.log("✅ Flag setup completed successfully!");
        
    } catch (error) {
        console.error("❌ Error during final completion:", error);
        await showErrorModal("Completion Error", "Failed to complete flag setup. Please try again.");
    }
}

// ===========================================
// UI UPDATE FUNCTIONS
// ===========================================

/**
 * Updates the display to show the current step
 * 
 * @param state - The flag setup state object
 */
function updateStepDisplay(state: FlagSetupState): void {
    // Hide all content steps
    const contentSteps = document.querySelectorAll('.content-step');
    contentSteps.forEach(step => step.classList.remove('active'));
    
    // Show current step
    const currentStepElement = document.getElementById(`content-step-${state.currentStep}`);
    if (currentStepElement) {
        currentStepElement.classList.add('active');
        
        // Check if content overflows and adjust justify-content accordingly
        setTimeout(() => adjustContentJustification(currentStepElement), 10);
    }
}

/**
 * Adjusts the justify-content of a content step based on whether content overflows
 * 
 * @param contentStepElement - The content step element to adjust
 */
function adjustContentJustification(contentStepElement: HTMLElement): void {
    const contentStepInner = contentStepElement.querySelector('.content-step-inner') as HTMLElement;
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
 * @param state - The flag setup state object
 */
function updateStepIndicators(state: FlagSetupState): void {
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
 * @param state - The flag setup state object
 */
function updateNavigationButtons(state: FlagSetupState): void {
    const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
    
    if (backBtn) {
        backBtn.style.display = state.currentStep > 1 ? 'flex' : 'none';
    }
    
    if (nextBtn) {
        if (state.currentStep === state.totalSteps) {
            nextBtn.textContent = 'Complete Setup';
        } else {
            nextBtn.textContent = 'Next';
        }
    }
}
