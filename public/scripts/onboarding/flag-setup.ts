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
    completedSteps: Set<number>;
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
            isValid: false,
            completedSteps: new Set()
        };

        // Store state globally for access by demo functions
        (window as any).flagSetupState = state;

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
        nextBtn.addEventListener('click', async () => {
            console.log('[FLAG-SETUP] Next button clicked, currentStep:', state.currentStep, 'totalSteps:', state.totalSteps);
            await handleNextNavigation(state, instructorCourse);
        });
    } else {
        console.error('[FLAG-SETUP] ❌ Next button not found!');
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
    // Make demo functions globally available for tutorial
    (window as any).toggleReportCard = toggleReportCard;
    (window as any).handleDemoResolve = handleDemoResolve;
    (window as any).toggleEditMode = toggleEditMode;
    (window as any).saveEdit = saveEdit;
    (window as any).handleDemoSave = handleDemoSave;
    (window as any).markStepCompleted = markStepCompleted;
}

/**
 * Demo function to toggle report cards for tutorial purposes
 * 
 * @param card - The report card element that was clicked
 */
function toggleReportCard(card: HTMLElement): void {
    // Check if click was inside response-section - if so, don't toggle
    const responseSection = card.querySelector('.response-section');
    if (responseSection && responseSection.contains(event?.target as Node)) {
        return;
    }
    
    card.classList.toggle('expanded');
    const arrow = card.querySelector('.expand-arrow');
    if (arrow) {
        if (card.classList.contains('expanded')) {
            arrow.textContent = '▲';
        } else {
            arrow.textContent = '▼';
        }
    }
    
    // Update expanded-content visibility
    const expandedContent = card.querySelector('.expanded-content') as HTMLElement;
    if (expandedContent) {
        if (card.classList.contains('expanded')) {
            expandedContent.style.display = 'block';
        } else {
            expandedContent.style.display = 'none';
        }
    }
}

/**
 * Demo function to handle resolve button clicks in tutorial
 * 
 * @param button - The resolve button that was clicked
 */
function handleDemoResolve(button: HTMLElement): void {
    // Stop event propagation to prevent card collapse
    if (event) {
        event.stopPropagation();
    }
    
    const reportCard = button.closest('.report-card') as HTMLElement;
    const emptyState = document.getElementById('demo-empty-state');
    
    if (reportCard && emptyState) {
        // Get the actual response text that was submitted
        const textarea = reportCard.querySelector('.response-textarea') as HTMLTextAreaElement;
        const submittedResponse = textarea ? textarea.value : '';
        
        // Store the submitted response for Step 4
        (window as any).submittedResponse = submittedResponse;
        
        // Hide the report card
        reportCard.style.display = 'none';
        
        // Show the empty state explanation
        emptyState.style.display = 'block';
        
        // Update button to show it was resolved
        button.textContent = 'Resolved';
        button.setAttribute('disabled', 'true');
        button.style.background = '#6c757d';
        
        // Mark step 3 as completed
        markStepCompleted(3);
    }
}

/**
 * Demo function to toggle edit mode for Step 4 tutorial
 * 
 * @param button - The edit button that was clicked
 */
function toggleEditMode(button: HTMLElement): void {
    // Stop event propagation to prevent card collapse
    if (event) {
        event.stopPropagation();
    }
    
    const responseContent = document.getElementById('editable-response');
    const editButton = button;
    const saveButton = button.nextElementSibling as HTMLElement;
    
    if (responseContent && editButton && saveButton) {
        // Get current text and trim whitespace
        const currentText = (responseContent.textContent || '').trim();
        
        // Replace with textarea
        const textarea = document.createElement('textarea');
        textarea.className = 'response-textarea';
        textarea.id = 'demo-response-textarea';
        textarea.name = 'demo-response';
        textarea.value = currentText;
        textarea.style.cssText = 'margin-bottom: 15px; width: 100%; min-height: 100px; resize: vertical; text-align: left;';
        textarea.setAttribute('aria-label', 'Edit response text');
        
        responseContent.parentNode?.replaceChild(textarea, responseContent);
        
        // Switch buttons
        editButton.style.display = 'none';
        saveButton.style.display = 'inline-block';
    }
}

/**
 * Demo function to save edit for Step 4 tutorial
 * 
 * @param button - The save button that was clicked
 */
function saveEdit(button: HTMLElement): void {
    // Stop event propagation to prevent card collapse
    if (event) {
        event.stopPropagation();
    }
    
    const textarea = document.querySelector('.response-textarea') as HTMLTextAreaElement;
    const saveButton = button;
    const editButton = button.previousElementSibling as HTMLElement;
    
    if (textarea && editButton && saveButton) {
        // Get new text
        const newText = textarea.value;
        
        // Replace with div
        const responseContent = document.createElement('div');
        responseContent.className = 'full-chat-content';
        responseContent.id = 'editable-response';
        responseContent.textContent = newText;
        
        textarea.parentNode?.replaceChild(responseContent, textarea);
        
        // Switch buttons
        saveButton.style.display = 'none';
        editButton.style.display = 'inline-block';
    }
}

/**
 * Demo function to handle save button clicks in Step 4 tutorial
 * 
 * @param button - The save button that was clicked
 */
function handleDemoSave(button: HTMLElement): void {
    // Stop event propagation to prevent card collapse
    if (event) {
        event.stopPropagation();
    }
    
    const reportCard = button.closest('.report-card') as HTMLElement;
    const emptyState = document.getElementById('demo-empty-state-step4');
    
    if (reportCard && emptyState) {
        // Hide the report card
        reportCard.style.display = 'none';
        
        // Show the empty state explanation
        emptyState.style.display = 'block';
        
        // Mark step 4 as completed
        markStepCompleted(4);
    }
}

/**
 * Legacy function - kept for compatibility but not used in new tutorial
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
    console.log('[FLAG-SETUP] handleNextNavigation called, currentStep:', state.currentStep, 'totalSteps:', state.totalSteps);
    
    // Validate current step before proceeding
    const isValid = await validateCurrentStep(state);
    console.log('[FLAG-SETUP] Validation result:', isValid);
    
    if (!isValid) {
        console.log('[FLAG-SETUP] Validation failed, stopping navigation');
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
        console.log('[FLAG-SETUP] On final step, calling handleFinalCompletion');
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
        // Validate courseId exists
        if (!instructorCourse.id) {
            throw new Error("Course ID is missing. Cannot update database.");
        }
        
        // Mark flag setup as complete locally
        instructorCourse.flagSetup = true;
        
        // Persist to database
        console.log(`📡 Updating database: setting flagSetup=true for course ${instructorCourse.id}`);
        const response = await fetch(`/api/courses/${instructorCourse.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                flagSetup: true
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to update course in database' }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Failed to update course in database');
        }
        
        console.log("✅ Flag setup status persisted to database successfully!");
        
        // DO NOT remove onboarding-active class - let instructor-mode.ts handle the flow
        // DO NOT show instructor sidebar - we need to proceed to monitor setup
        
        // Dispatch completion event - instructor-mode.ts will handle next steps
        window.dispatchEvent(new CustomEvent('flagSetupComplete'));
        
        console.log("✅ Flag setup completed successfully!");
        
    } catch (error) {
        console.error("❌ Error during final completion:", error);
        // Revert local change on error
        instructorCourse.flagSetup = false;
        await showErrorModal("Completion Error", `Failed to complete flag setup: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
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
        
        // Special handling for Step 4 - update with submitted response
        if (state.currentStep === 4) {
            updateStep4WithSubmittedResponse();
        }
        
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
            // Ensure button is enabled on final step
            nextBtn.disabled = false;
        } else {
            nextBtn.textContent = 'Next';
            
            // Check if next step requires completion of current step
            const nextStepElement = document.getElementById(`content-step-${state.currentStep + 1}`);
            if (nextStepElement) {
                const requiresCompletion = nextStepElement.getAttribute('data-requires-completion');
                if (requiresCompletion) {
                    const requiredStep = parseInt(requiresCompletion);
                    if (!state.completedSteps.has(requiredStep)) {
                        nextBtn.disabled = true;
                        nextBtn.textContent = 'Complete Previous Step First';
                    } else {
                        nextBtn.disabled = false;
                    }
                } else {
                    nextBtn.disabled = false;
                }
            } else {
                nextBtn.disabled = false;
            }
        }
    }
}

/**
 * Marks a step as completed and updates the UI
 * 
 * @param stepNumber - The step number to mark as completed
 */
function markStepCompleted(stepNumber: number): void {
    // Get the current state from the global context
    const state = (window as any).flagSetupState as FlagSetupState;
    if (!state) return;
    
    // Add to completed steps
    state.completedSteps.add(stepNumber);
    
    // Update step indicators to show completion
    const stepItem = document.querySelector(`.step-item:nth-child(${stepNumber})`);
    if (stepItem) {
        const stepCircle = stepItem.querySelector('.step-circle');
        if (stepCircle) {
            stepCircle.classList.remove('current', 'pending');
            stepCircle.classList.add('completed');
        }
    }
    
    // Enable navigation to next step if it was blocked
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
    if (nextBtn && nextBtn.disabled) {
        const currentStepElement = document.querySelector('.content-step.active');
        if (currentStepElement) {
            const currentStep = parseInt(currentStepElement.id.split('-')[2]);
            const nextStepElement = document.getElementById(`content-step-${currentStep + 1}`);
            if (nextStepElement) {
                const requiresCompletion = nextStepElement.getAttribute('data-requires-completion');
                if (requiresCompletion && parseInt(requiresCompletion) === stepNumber) {
                    nextBtn.disabled = false;
                    nextBtn.textContent = 'Next';
                }
            }
        }
    }
    
    console.log(`✅ Step ${stepNumber} marked as completed`);
}

/**
 * Updates Step 4 with the response that was submitted in Step 3
 */
function updateStep4WithSubmittedResponse(): void {
    const submittedResponse = (window as any).submittedResponse;
    const placeholder = document.getElementById('submitted-response-placeholder');
    
    if (submittedResponse && placeholder) {
        // Replace placeholder with actual submitted response
        placeholder.textContent = submittedResponse;
        console.log('✅ Step 4 updated with submitted response from Step 3');
    } else if (placeholder) {
        // Show placeholder message if no response was submitted yet
        placeholder.textContent = 'Your submitted response will appear here after completing Step 3';
    }
}
