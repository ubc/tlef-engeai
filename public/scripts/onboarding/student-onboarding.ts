/**
 * STUDENT ONBOARDING MODULE
 * 
 * This module handles the student onboarding flow following instructor onboarding design patterns.
 * It provides a 6-step tutorial to introduce students to EngE-AI features and functionality.
 * 
 * FEATURES:
 * - 6-step onboarding process with navigation
 * - Static artefact demo with Mermaid diagram
 * - Static flag modal preview
 * - Course-specific information display
 * - AI Assistant disclaimer and guidelines
 * - Help system with context-sensitive content
 * - Sidebar hiding during onboarding
 * - Completion tracking and redirect
 * 
 * ONBOARDING STEPS:
 * 1. Welcome - Introduction to EngE-AI and Socratic method
 * 2. Engineering Focus - How to ask good questions
 * 3. Important Information - AI Assistant disclaimer and guidelines
 * 4. Artefacts & Features - Visual diagrams and tools demo
 * 5. How to Report - Flagging system preview
 * 6. You're Ready! - Completion summary and next steps
 * 
 * @author: AI Assistant
 * @date: 2025-01-27
 * @version: 1.0.0
 */

import { loadComponentHTML } from "../functions/api.js";
import { User } from "../../../src/functions/types.js";
import { showErrorModal, showHelpModal } from "../modal-overlay.js";
import { getArtefactHandler } from "../feature/artefact.js";
import { authService } from "../services/AuthService.js";

// Declare feather for TypeScript
declare const feather: any;

// ===========================================
// TYPE DEFINITIONS
// ===========================================

/**
 * Represents the current state of the student onboarding process
 */
interface StudentOnboardingState {
    currentStep: number;
    totalSteps: number;
    isValid: boolean;
    completedSteps: Set<number>;
    highestVisitedStep: number;
}

/**
 * Sample Mermaid diagram for chemical/material engineering demo
 */
const SAMPLE_MERMAID_CODE = `
graph TD
    A[Problem: Select Material for<br/>Chemical Reactor Vessel] --> B[Identify Operating Conditions]
    B --> C{Temperature Range}
    C -->|High Temp| D[Consider Ceramic Materials]
    C -->|Medium Temp| E[Consider Metal Alloys]
    C -->|Low Temp| F[Consider Polymers]
    
    D --> G[Check Chemical Resistance]
    E --> G
    F --> G
    
    G --> H{Corrosion Resistance?}
    H -->|Yes| I[Evaluate Mechanical Properties]
    H -->|No| J[Consider Coatings/Protection]
    
    I --> K{Strength Requirements?}
    K -->|High| L[Select Steel Alloy]
    K -->|Medium| M[Select Aluminum]
    K -->|Low| N[Select Polymer]
    
    J --> O[Apply Protective Coating]
    O --> I
    
    L --> P[Final Material Selection]
    M --> P
    N --> P
    
    P --> Q[Verify with Safety Standards]
    Q --> R[Complete Selection Process]
`;

// ===========================================
// MAIN EXPORT FUNCTION
// ===========================================

/**
 * Renders the student onboarding page and orchestrates the complete flow.
 * 
 * This function:
 * 1. Loads the student onboarding HTML component
 * 2. Initializes the onboarding state
 * 3. Sets up event listeners for all interactions
 * 4. Manages step navigation and validation
 * 5. Handles completion and redirect to main interface
 * 
 * @param user - The student user object
 * @returns Promise<void>
 */
export const renderStudentOnboarding = async (user: User): Promise<void> => {
    console.log("🚀 Starting student onboarding process...");
    
    try {
        // Initialize onboarding state
        const state: StudentOnboardingState = {
            currentStep: 1,
            totalSteps: 6,
            isValid: false,
            completedSteps: new Set(),
            highestVisitedStep: 1
        };

        // Store state globally for access by demo functions
        (window as any).studentOnboardingState = state;

        // Load the onboarding component
        const container = document.getElementById('main-content-area');
        if (!container) {
            throw new Error("Main content area not found");
        }

        // Add onboarding-active class to hide student sidebar
        document.body.classList.add('onboarding-active');

        const html = await loadComponentHTML('student-onboarding');
        container.innerHTML = html;

        // Wait for DOM to be ready
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }

        // Initialize the onboarding interface
        await initializeStudentOnboarding(state, user);

    } catch (error) {
        console.error("❌ Error during student onboarding initialization:", error);
        await showErrorModal("Initialization Error", "Failed to initialize student onboarding. Please refresh the page and try again.");
    }
};

// ===========================================
// INITIALIZATION FUNCTIONS
// ===========================================

/**
 * Initializes the student onboarding interface with event listeners and initial state
 * 
 * @param state - The onboarding state object
 * @param user - The student user object
 */
async function initializeStudentOnboarding(state: StudentOnboardingState, user: User): Promise<void> {
    console.log("🎯 Initializing student onboarding interface...");

    // Update course name display
    updateCourseDisplay(user);

    // Render demo artefact
    await renderDemoArtefact();

    // Set up event listeners
    bindEventListeners(state, user);

    // Initialize step indicators
    updateStepIndicators(state);

    // Show first step
    showStep(state.currentStep);

    console.log("✅ Student onboarding interface initialized successfully");
}

/**
 * Updates the course name display in the welcome step
 * 
 * @param user - The student user object
 */
function updateCourseDisplay(user: User): void {
    const courseDisplay = document.getElementById('course-name-display');
    if (courseDisplay) {
        if (user.courseName && user.courseName.trim() !== '') {
            courseDisplay.textContent = `You're enrolled in: ${user.courseName}`;
        } else {
            courseDisplay.textContent = 'Your course will be displayed here once assigned by your instructor.';
        }
    }
}

/**
 * Renders the demo Mermaid diagram for the artefact demo
 */
async function renderDemoArtefact(): Promise<void> {
    try {
        const artefactContainer = document.getElementById('demo-artefact-content');
        if (!artefactContainer) {
            console.warn("Demo artefact container not found");
            return;
        }

        // Create a temporary container for the Mermaid diagram
        const tempContainer = document.createElement('div');
        tempContainer.style.width = '100%';
        tempContainer.style.height = '300px';
        tempContainer.style.border = '1px solid #e9ecef';
        tempContainer.style.borderRadius = '8px';
        tempContainer.style.padding = '1rem';
        tempContainer.style.backgroundColor = '#f8f9fa';

        // Add loading message
        tempContainer.innerHTML = '<p style="text-align: center; color: #525252; margin: 50px 0;">Loading demo diagram...</p>';
        artefactContainer.appendChild(tempContainer);

        // Wait a moment for the container to be visible
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try to render the Mermaid diagram
        try {
            // Create a unique ID for this demo diagram
            const diagramId = `demo-diagram-${Date.now()}`;
            tempContainer.innerHTML = `<div id="${diagramId}" class="mermaid">${SAMPLE_MERMAID_CODE}</div>`;

            // Initialize Mermaid if available
            if (typeof (window as any).mermaid !== 'undefined') {
                await (window as any).mermaid.init(undefined, `#${diagramId}`);
                console.log("✅ Demo Mermaid diagram rendered successfully");
            } else {
                // Fallback: show a text representation
                tempContainer.innerHTML = `
                    <div style="padding: 1rem; text-align: center;">
                        <h4 style="color: #2c3e50; margin-bottom: 1rem;">Material Selection Process Flow</h4>
                        <div style="text-align: left; line-height: 1.6; color: #495057;">
                            <p><strong>1.</strong> Identify operating conditions (temperature, pressure, chemical environment)</p>
                            <p><strong>2.</strong> Consider material categories (metals, ceramics, polymers)</p>
                            <p><strong>3.</strong> Evaluate chemical resistance and corrosion properties</p>
                            <p><strong>4.</strong> Check mechanical properties (strength, toughness, fatigue)</p>
                            <p><strong>5.</strong> Verify compliance with safety standards</p>
                            <p><strong>6.</strong> Make final material selection</p>
                        </div>
                        <p style="margin-top: 1rem; font-style: italic; color: #525252;">
                            💡 <em>In real conversations, you'll see interactive diagrams like this!</em>
                        </p>
                    </div>
                `;
            }
        } catch (error) {
            console.warn("Failed to render Mermaid diagram, using fallback:", error);
            // Fallback content
            tempContainer.innerHTML = `
                <div style="padding: 1rem; text-align: center;">
                    <h4 style="color: #2c3e50; margin-bottom: 1rem;">Material Selection Process</h4>
                    <p style="color: #525252;">
                        💡 <em>Interactive diagrams will appear here during your conversations with EngE-AI!</em>
                    </p>
                </div>
            `;
        }
        
        // Check for content overflow after artefact is rendered
        const currentStep = document.getElementById('step-4');
        if (currentStep && currentStep.classList.contains('active')) {
            checkContentOverflow(currentStep);
        }
    } catch (error) {
        console.error("Error rendering demo artefact:", error);
    }
}

// ===========================================
// EVENT HANDLERS
// ===========================================

/**
 * Binds all event listeners for the onboarding interface
 * 
 * @param state - The onboarding state object
 * @param user - The student user object
 */
function bindEventListeners(state: StudentOnboardingState, user: User): void {
    // Navigation buttons
    const backBtn = document.getElementById('back-btn');
    const nextBtn = document.getElementById('next-btn');

    if (backBtn) {
        backBtn.addEventListener('click', () => handleBackClick(state, user));
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => handleNextClick(state, user));
    }

    // Help button
    const helpBtn = document.getElementById('help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', () => handleHelpClick(state));
    }

    // Help modal close
    const helpModalClose = document.getElementById('help-modal-close');
    if (helpModalClose) {
        helpModalClose.addEventListener('click', closeHelpModal);
    }

    // ESC key support for help modal
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeHelpModal();
        }
    });

    // Window resize listener to recalculate content overflow
    window.addEventListener('resize', () => {
        const state = (window as any).studentOnboardingState;
        if (state) {
            const currentStep = document.getElementById(`step-${state.currentStep}`);
            if (currentStep && currentStep.classList.contains('active')) {
                checkContentOverflow(currentStep);
            }
        }
    });

    // Demo flag button click handler
    const demoFlagBtn = document.getElementById('demo-flag-btn');
    if (demoFlagBtn) {
        demoFlagBtn.addEventListener('click', handleDemoFlagClick);
    }

    // Demo artefact button is now handled by ArtefactHandler via event delegation
    // No direct event listener needed

    // Close artefact button click handler
    const closeArtefactBtn = document.getElementById('close-artefact-btn');
    if (closeArtefactBtn) {
        closeArtefactBtn.addEventListener('click', () => {
            const onboardingContainer = document.querySelector('.onboarding');
            if (onboardingContainer) {
                onboardingContainer.classList.remove('artefact-open');
            }
        });
    }

    // Flag modal close handlers
    const flagModalClose = document.getElementById('flag-modal-close');
    if (flagModalClose) {
        flagModalClose.addEventListener('click', closeFlagModal);
    }

    // Handle "Other" option in flag form
    const flagOtherInput = document.getElementById('flag-other-input') as HTMLTextAreaElement;
    const flagOtherRadio = document.getElementById('flag-reason-5') as HTMLInputElement;
    
    if (flagOtherRadio && flagOtherInput) {
        flagOtherRadio.addEventListener('change', () => {
            if (flagOtherRadio.checked) {
                flagOtherInput.style.display = 'block';
                flagOtherInput.focus();
            } else {
                flagOtherInput.style.display = 'none';
            }
        });
    }

    // Handle flag form submission
    const flagSubmitBtn = document.getElementById('flag-submit-btn');
    if (flagSubmitBtn) {
        flagSubmitBtn.addEventListener('click', handleFlagSubmission);
    }
}

/**
 * Handles back button click
 * 
 * @param state - The onboarding state object
 * @param user - The student user object
 */
function handleBackClick(state: StudentOnboardingState, user: User): void {
    if (state.currentStep > 1) {
        state.currentStep--;
        updateStepIndicators(state);
        showStep(state.currentStep);
        updateNavigationButtons(state);
    }
}

/**
 * Handles next button click
 * 
 * @param state - The onboarding state object
 * @param user - The student user object
 */
function handleNextClick(state: StudentOnboardingState, user: User): void {
    if (state.currentStep < state.totalSteps) {
        // Mark current step as completed
        state.completedSteps.add(state.currentStep);
        
        // Move to next step
        state.currentStep++;
        updateStepIndicators(state);
        showStep(state.currentStep);
        updateNavigationButtons(state);
    } else {
        // Complete onboarding
        handleOnboardingCompletion(user);
    }
}

/**
 * Handles help button click
 * 
 * @param state - The onboarding state object
 */
function handleHelpClick(state: StudentOnboardingState): void {
    const helpContent = getHelpContent(state.currentStep);
    showHelpModal(state.currentStep, "Student Onboarding Help", helpContent);
}

/**
 * Handles demo flag button click
 */
function handleDemoFlagClick(): void {
    const flagModal = document.getElementById('flag-modal');
    if (flagModal) {
        flagModal.style.display = 'flex';
        flagModal.classList.add('show');
        document.body.classList.add('modal-open');
        
        // Add ESC key listener
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeFlagModal();
                window.removeEventListener('keydown', handleEscape);
                flagModal.removeEventListener('click', handleOverlayClick);
            }
        };
        
        // Add overlay click listener to close modal when clicking outside
        const handleOverlayClick = (e: MouseEvent) => {
            if (e.target === flagModal) {
                closeFlagModal();
                window.removeEventListener('keydown', handleEscape);
                flagModal.removeEventListener('click', handleOverlayClick);
            }
        };
        
        window.addEventListener('keydown', handleEscape);
        flagModal.addEventListener('click', handleOverlayClick);
    }
}

    // Demo artefact functionality is now handled entirely by ArtefactHandler
    // Debug the demo button setup
    setTimeout(() => {
        const artefactHandler = getArtefactHandler();
        if (artefactHandler && typeof artefactHandler.debugDemoButton === 'function') {
            artefactHandler.debugDemoButton();
        }
    }, 1000);

/**
 * Handles flag form submission
 */
function handleFlagSubmission(): void {
    const selectedReason = document.querySelector('input[name="flagReason"]:checked') as HTMLInputElement;
    const otherInput = document.getElementById('flag-other-input') as HTMLTextAreaElement;
    const statusMessage = document.querySelector('.flag-status-message') as HTMLElement;
    const submitBtn = document.getElementById('flag-submit-btn') as HTMLButtonElement;

    if (!selectedReason) {
        showFlagStatus(statusMessage, 'Please select a reason for flagging', 'error');
        return;
    }

    const flagType = selectedReason.value;
    const otherDetails = otherInput?.value.trim() || '';

    // Validate "Other" option
    if (flagType === 'other' && !otherDetails) {
        showFlagStatus(statusMessage, 'Please provide details for "Other" reason', 'error');
        otherInput?.focus();
        return;
    }

    // Show loading state
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        submitBtn.classList.add('loading');
    }

    // Simulate API call (replace with actual implementation later)
    setTimeout(() => {
        showFlagStatus(statusMessage, 'Flag submitted successfully! Thank you for your feedback.', 'success');
        if (submitBtn) {
            submitBtn.style.display = 'none';
        }
        
        // Auto-close after 2 seconds
        setTimeout(() => {
            closeFlagModal();
        }, 2000);
    }, 1000);
}

/**
 * Shows status message in flag modal
 */
function showFlagStatus(statusElement: HTMLElement | null, message: string, type: 'success' | 'error'): void {
    if (!statusElement) return;
    
    statusElement.textContent = message;
    statusElement.className = `flag-status-message ${type}`;
    statusElement.style.display = 'block';
    
    // Auto-hide error messages after 5 seconds
    if (type === 'error') {
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 5000);
    }
}

/**
 * Closes the flag modal
 */
function closeFlagModal(): void {
    const flagModal = document.getElementById('flag-modal');
    if (flagModal) {
        flagModal.classList.remove('show');
        // Wait for animation to complete before hiding
        setTimeout(() => {
            flagModal.style.display = 'none';
        }, 300);
        document.body.classList.remove('modal-open');
    }
}

/**
 * Closes the help modal
 */
function closeHelpModal(): void {
    const helpModal = document.getElementById('help-modal');
    if (helpModal) {
        helpModal.style.display = 'none';
    }
}

// ===========================================
// NAVIGATION AND UI UPDATES
// ===========================================

/**
 * Updates step indicators in the left panel
 * 
 * @param state - The onboarding state object
 */
function updateStepIndicators(state: StudentOnboardingState): void {
    for (let i = 1; i <= state.totalSteps; i++) {
        const stepItem = document.querySelector(`[data-step="${i}"]`);
        const stepCircle = stepItem?.querySelector('.step-circle');
        
        if (stepCircle) {
            stepCircle.className = 'step-circle';
            
            if (state.completedSteps.has(i)) {
                stepCircle.classList.add('completed');
            } else if (i === state.currentStep) {
                stepCircle.classList.add('current');
            } else {
                stepCircle.classList.add('pending');
            }
        }
    }
}

/**
 * Closes the artefact panel and cleans up the layout
 * Note: ArtefactHandler handles the actual closing, this just ensures layout cleanup
 */
function closeArtefactPanel(): void {
    // ArtefactHandler will handle the actual closing via its closeArtefact() method
    // This function is kept for compatibility but the heavy lifting is done by ArtefactHandler
    console.log('🎨 Artefact panel cleanup requested - handled by ArtefactHandler');
}

/**
 * Shows the specified step and hides others
 * 
 * @param stepNumber - The step number to show
 */
function showStep(stepNumber: number): void {
    // Close artefact panel when navigating to another step
    closeArtefactPanel();

    // Hide all steps
    const allSteps = document.querySelectorAll('.content-step');
    allSteps.forEach(step => {
        step.classList.remove('active');
    });

    // Show current step
    const currentStep = document.getElementById(`step-${stepNumber}`);
    if (currentStep) {
        currentStep.classList.add('active');
        
        // Check if content overflows and apply appropriate class
        checkContentOverflow(currentStep);
    }

    // Update sidebar step indicators
    updateSidebarStepIndicators(stepNumber);

    // Update navigation buttons
    const state = (window as any).studentOnboardingState;
    if (state) {
        updateNavigationButtons(state);
    }
}

/**
 * Updates sidebar step indicators to show current progress
 * 
 * @param currentStepNumber - The current step number
 */
function updateSidebarStepIndicators(currentStepNumber: number): void {
    const stepItems = document.querySelectorAll('.step-item');
    const state = (window as any).studentOnboardingState;
    
    // Track the highest visited step
    if (state) {
        if (currentStepNumber > state.highestVisitedStep) {
            state.highestVisitedStep = currentStepNumber;
        }
    }
    
    stepItems.forEach((item, index) => {
        const stepNumber = index + 1;
        const stepCircle = item.querySelector('.step-circle');
        
        if (!stepCircle) return;
        
        // Remove all status classes
        stepCircle.classList.remove('pending', 'current', 'completed');
        
        if (stepNumber === currentStepNumber) {
            // Current step - current (red)
            stepCircle.classList.add('current');
        } else if (stepNumber < currentStepNumber) {
            // Previous steps - completed (green)
            stepCircle.classList.add('completed');
        } else {
            // Future steps - pending (basic/uncolored)
            stepCircle.classList.add('pending');
        }
    });
}

/**
 * Checks if step content overflows and applies appropriate CSS class
 * 
 * @param stepElement - The step element to check
 */
function checkContentOverflow(stepElement: HTMLElement): void {
    // Wait for content to be rendered
    setTimeout(() => {
        const stepInner = stepElement.querySelector('.content-step-inner');
        if (!stepInner) return;

        const stepHeight = stepElement.clientHeight;
        const contentHeight = stepInner.scrollHeight;
        
        // Remove existing overflow classes
        stepElement.classList.remove('overflow-content', 'center-content');
        
        // Check if content overflows
        if (contentHeight > stepHeight) {
            stepElement.classList.add('overflow-content');
            console.log(`Step content overflows (${contentHeight}px > ${stepHeight}px), using flex-start`);
        } else {
            stepElement.classList.add('center-content');
            console.log(`Step content fits (${contentHeight}px <= ${stepHeight}px), using center`);
        }
    }, 100); // Small delay to ensure content is rendered
}

/**
 * Updates navigation button visibility and text
 * 
 * @param state - The onboarding state object
 */
function updateNavigationButtons(state: StudentOnboardingState): void {
    const backBtn = document.getElementById('back-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('next-btn') as HTMLButtonElement;

    if (backBtn) {
        backBtn.style.display = state.currentStep > 1 ? 'flex' : 'none';
    }

    if (nextBtn) {
        if (state.currentStep === state.totalSteps) {
            nextBtn.innerHTML = `
                <i data-feather="check" class="feather"></i>
                Start Chatting
            `;
            nextBtn.classList.remove('btn-next');
            nextBtn.classList.add('btn-finish');
        } else {
            nextBtn.innerHTML = `
                Next
                <i data-feather="chevron-right" class="feather"></i>
            `;
            nextBtn.classList.remove('btn-finish');
            nextBtn.classList.add('btn-next');
        }

        // Re-render feather icons
        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
    }
}

// ===========================================
// COMPLETION HANDLING
// ===========================================

/**
 * Handles onboarding completion
 * 
 * @param user - The student user object
 */
async function handleOnboardingCompletion(user: User): Promise<void> {
    console.log("🎉 Student onboarding completed!");

    try {
        // Mark onboarding as complete
        user.userOnboarding = true;

        // Get userId from AuthService (PUID is not available in frontend for privacy reasons)
        const authUser = authService.getUser();
        if (!authUser || !authUser.userId) {
            throw new Error('Unable to get user ID from authentication service');
        }

        // Update user in database
        const response = await fetch('/api/user/update-onboarding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: authUser.userId,
                courseName: user.courseName,
                userOnboarding: true
            })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error('Failed to update onboarding status');
        }
        
        console.log("✅ Onboarding status updated in database");

        // Immediately redirect to main interface - no delay
        redirectToMainInterface();

    } catch (error) {
        console.error("Error completing onboarding:", error);
        await showErrorModal("Completion Error", "There was an error completing your onboarding. Please try again.");
    }
}

/**
 * Shows completion message
 * @deprecated No longer used - removed to eliminate onboarding delay
 */
// async function showCompletionMessage(): Promise<void> {
//     const currentStep = document.getElementById(`step-${(window as any).studentOnboardingState?.currentStep}`);
//     if (currentStep) {
//         currentStep.innerHTML = `
//             <div class="content-step-inner">
//                 <div class="step-header">
//                     <h1>🎉 Welcome to EngE-AI!</h1>
//                     <p>You're all set to start your engineering learning journey</p>
//                 </div>
//                 <div class="completion-content">
//                     <div class="completion-message">
//                         <div class="success-icon">✅</div>
//                         <h3>Onboarding Complete!</h3>
//                         <p>You've successfully completed the onboarding process. You now know how to:</p>
//                         <ul class="completion-list">
//                             <li>Ask effective engineering questions</li>
//                             <li>Use interactive diagrams and artefacts</li>
//                             <li>Report inappropriate or incorrect responses</li>
//                             <li>Navigate the EngE-AI interface</li>
//                         </ul>
//                         <p><strong>Redirecting you to the main chat interface...</strong></p>
//                     </div>
//                 </div>
//             </div>
//         `;
//     }
// }

/**
 * Redirects to the main student interface
 */
function redirectToMainInterface(): void {
    // Remove onboarding-active class to show sidebar
    document.body.classList.remove('onboarding-active');

    // Hide onboarding container
    const onboardingContainer = document.getElementById('onboarding-container');
    if (onboardingContainer) {
        onboardingContainer.style.display = 'none';
    }

    // Clean up global state
    delete (window as any).studentOnboardingState;
    
    // Dispatch event to notify that onboarding is complete
    // This will allow student-mode.ts to continue with normal chat initialization
    const event = new CustomEvent('onboarding-completed', { 
        detail: { user: (window as any).studentOnboardingState?.user } 
    });
    window.dispatchEvent(event);
}

// ===========================================
// HELP SYSTEM
// ===========================================

/**
 * Gets help content for the current step
 * 
 * @param stepNumber - The current step number
 * @returns Help content string
 */
function getHelpContent(stepNumber: number): string {
    const helpContent = {
        1: `
            <h4>Welcome to EngE-AI!</h4>
            <p>EngE-AI is your AI-powered study assistant designed specifically for chemical and material engineering students.</p>
            
            <h4>Key Features:</h4>
            <ul>
                <li><strong>24/7 Availability:</strong> Get help whenever you need it</li>
                <li><strong>Socratic Method:</strong> Learn through guided questions, not direct answers</li>
                <li><strong>Engineering Focus:</strong> Specialized for chemical and material engineering</li>
                <li><strong>Interactive Diagrams:</strong> Visual learning with process flows and diagrams</li>
            </ul>
            
            <p><strong>Tip:</strong> EngE-AI will guide you to find answers yourself, helping you develop critical thinking skills!</p>
        `,
        2: `
            <h4>Asking Good Questions</h4>
            <p>To get the most out of EngE-AI, focus your questions on engineering concepts and problem-solving approaches.</p>
            
            <h4>Good Question Examples:</h4>
            <ul>
                <li>How do I approach this thermodynamics problem?</li>
                <li>What factors should I consider for material selection?</li>
                <li>Can you help me understand this process design concept?</li>
            </ul>
            
            <h4>Avoid:</h4>
            <ul>
                <li>Direct homework solutions</li>
                <li>Non-engineering topics</li>
                <li>General academic questions</li>
            </ul>
        `,
        3: `
            <h4>Important Information</h4>
            <p>Understanding the AI assistant's capabilities and limitations is crucial for effective use.</p>
            
            <h4>Key Points:</h4>
            <ul>
                <li><strong>Purpose:</strong> Study assistant, not a substitute for learning</li>
                <li><strong>Accuracy:</strong> May make mistakes - always verify important information</li>
                <li><strong>Academic Integrity:</strong> Don't submit AI responses as your own work</li>
                <li><strong>Privacy:</strong> Conversations may be reviewed for quality assurance</li>
            </ul>
            
            <p><strong>Remember:</strong> The disclaimer is also available at the bottom of the chat interface for ongoing reference.</p>
        `,
        4: `
            <h4>Artefacts and Interactive Features</h4>
            <p>EngE-AI can create visual diagrams to help explain complex engineering concepts.</p>
            
            <h4>Diagram Features:</h4>
            <ul>
                <li><strong>Zoom:</strong> Mouse wheel to zoom in/out</li>
                <li><strong>Pan:</strong> Click and drag to move around</li>
                <li><strong>Reset:</strong> Double-click to return to original view</li>
                <li><strong>Download:</strong> Save diagrams as PNG or SVG files</li>
            </ul>
            
            <h4>Types of Diagrams:</h4>
            <ul>
                <li>Process flow diagrams</li>
                <li>Material property charts</li>
                <li>Equipment schematics</li>
                <li>Thermodynamic cycles</li>
            </ul>
        `,
        5: `
            <h4>Reporting Issues</h4>
            <p>Help improve EngE-AI by flagging inappropriate or incorrect responses.</p>
            
            <h4>When to Flag:</h4>
            <ul>
                <li>Wrong calculations or engineering formulas</li>
                <li>Inappropriate content</li>
                <li>Interface bugs or technical issues</li>
                <li>Content that violates EDI principles</li>
                <li>Academic dishonesty encouragement</li>
            </ul>
            
            <h4>How to Flag:</h4>
            <ol>
                <li>Click the flag button on any message</li>
                <li>Select the appropriate reason</li>
                <li>Add additional details if needed</li>
                <li>Submit your flag</li>
            </ol>
            
            <p><strong>Note:</strong> All flags are reviewed by your instructors to help improve the system.</p>
        `,
        6: `
            <h4>You're Ready to Start!</h4>
            <p>Congratulations on completing the onboarding process!</p>
            
            <h4>What's Next:</h4>
            <ul>
                <li>Start asking engineering questions in the chat</li>
                <li>Use the Socratic method to develop your thinking</li>
                <li>Explore interactive diagrams and artefacts</li>
                <li>Flag any inappropriate content you encounter</li>
            </ul>
            
            <h4>Remember:</h4>
            <ul>
                <li>Verify important information independently</li>
                <li>Use EngE-AI as a learning tool, not a shortcut</li>
                <li>Ask specific engineering questions for best results</li>
                <li>Report issues to help improve the system</li>
            </ul>
            
            <p><strong>Ready to begin your learning journey with EngE-AI!</strong></p>
        `
    };

    return helpContent[stepNumber as keyof typeof helpContent] || "Help content not available for this step.";
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Validates the current step
 * 
 * @param state - The onboarding state object
 * @returns True if step is valid
 */
function validateCurrentStep(state: StudentOnboardingState): boolean {
    // All steps are valid by default for student onboarding
    // No complex validation needed like instructor onboarding
    return true;
}
