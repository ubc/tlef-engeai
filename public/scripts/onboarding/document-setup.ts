/**
 * DOCUMENT SETUP MODULE - ONBOARDING VERSION
 * 
 * This module handles the document setup onboarding flow for course staff.
 * It provides a step-by-step tutorial for saving learning objectives and course materials.
 * 
 * FEATURES:
 * - 4-step onboarding process with navigation
 * - Learning objectives saved to the selected course area
 * - Document uploads processed and saved through the production upload service
 * - No tutorial deletion controls for actions that are not represented faithfully
 * - Data structure initialization and validation
 * 
 * ONBOARDING STEPS:
 * 1. Welcome - Overview of document setup process
 * 2. Learning Objectives - Add a learning objective to the course
 * 3. Document Upload - Upload course materials
 * 4. Completion - Summary and next steps
 * 
 * @author: gatahcha (revised)
 * @date: 2025-01-27
 * @version: 1.0.0
 */

import { loadComponentHTML } from "../api/api.js";
import { activeCourse, TopicOrWeekInstance, TopicOrWeekItem } from "../types.js";
import { showErrorModal, showHelpModal, showConfirmModal, openContentInputModal, showSimpleErrorModal } from "../ui/modal-overlay.js";
import type { ContentInputPayload, ContentInputSubmitResult } from "../ui/modal-overlay.js";
import { DocumentUploadModule } from '../services/document-upload-module.js';
import { completeInstructorOnboardingStage } from './onboarding-progress.js';
import { updateStaffOnboardingProgress } from './staff-onboarding-ui.js';

// ===========================================
// TYPE DEFINITIONS
// ===========================================

/**
 * Represents the current state of the document setup onboarding process
 */
interface DocumentSetupState {
    currentStep: number;
    totalSteps: number;
    isValid: boolean;
}

/**
 * Demo learning objective for the tutorial
 */
interface DemoObjective {
    id: string;
    learningObjective: string;
}

/**
 * Demo uploaded file for the tutorial
 */
interface DemoFile {
    id: string;
    name: string;
    type: string;
}

// ===========================================
// MAIN EXPORT FUNCTION
// ===========================================

/**
 * Renders the document setup onboarding page and orchestrates the complete flow.
 * 
 * This function:
 * 1. Loads the document setup HTML component
 * 2. Initializes the onboarding state
 * 3. Sets up event listeners for all interactions
 * 4. Manages step navigation and validation
 * 5. Handles demo functionality for learning objectives and file uploads
 * 
 * @param instructorCourse - The course object to be populated
 * @returns Promise<void>
 */
export const renderDocumentSetup = async (instructorCourse: activeCourse): Promise<void> => {
    console.log("🚀 Starting document setup onboarding...");
    
    try {
        // Initialize document setup state
        const state: DocumentSetupState = {
            currentStep: 1,
            totalSteps: 4,
            isValid: false
        };

        // Load the document setup component
        const container = document.getElementById('main-content-area');
        if (!container) {
            throw new Error("Main content area not found");
        }

        // Add onboarding-active class to hide instructor sidebar
        document.body.classList.add('onboarding-active');

        const html = await loadComponentHTML('document-setup');
        container.innerHTML = html;

        // Wait for DOM to be ready
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }

        // Initialize the document setup interface
        await initializeDocumentSetup(state, instructorCourse);

    } catch (error) {
        console.error("❌ Error during document setup initialization:", error);
        await showErrorModal("Initialization Error", "Failed to initialize document setup. Please refresh the page and try again.");
    }
};

// ===========================================
// INITIALIZATION FUNCTIONS
// ===========================================

/**
 * Initializes the document setup interface with event listeners and initial state
 * 
 * @param state - The document setup state object
 * @param instructorCourse - The instructor course object
 */
async function initializeDocumentSetup(state: DocumentSetupState, instructorCourse: activeCourse): Promise<void> {
    console.log("🔧 Initializing document setup interface...");

    // Set the current course for demo operations
    currentCourse = instructorCourse;

    // Practice state is in-memory only, so reset it: a second instructor working through
    // this tutorial must start clean rather than inherit a previous run's list.
    demoFiles = [];
    demoObjectives = [];

    // Initialize data structures if needed
    initializeCourseData(instructorCourse);

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
    
    console.log("✅ Document setup interface initialized successfully");
}

/**
 * Initialize course data structures if they don't exist
 * 
 * @param instructorCourse - The instructor course object
 */
function initializeCourseData(instructorCourse: activeCourse): void {
    // Initialize topic/week instances array if it doesn't exist
    if (!instructorCourse.topicOrWeekInstances) {
        instructorCourse.topicOrWeekInstances = [];
    }

    // Initialize learning objectives for each topic/week instance if they don't exist
    instructorCourse.topicOrWeekInstances.forEach((instance_topicOrWeek: TopicOrWeekInstance) => {
        instance_topicOrWeek.items.forEach((item: TopicOrWeekItem) => {
            if (!item.learningObjectives) {
                item.learningObjectives = [];
            }
            if (!item.additionalMaterials) {
                item.additionalMaterials = [];
            }
        });
    });
}

/**
 * Sets up window resize listener to recalculate content justification
 * 
 * @param state - The document setup state object
 */
function setupResizeListener(state: DocumentSetupState): void {
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
 * @param state - The document setup state object
 * @param instructorCourse - The instructor course object
 */
function setupNavigationListeners(state: DocumentSetupState, instructorCourse: activeCourse): void {
    const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;

    if (backBtn) {
        backBtn.addEventListener('click', () => handleBackNavigation(state));
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', async () => {
            console.log('[DOCUMENT-SETUP] Next button clicked, currentStep:', state.currentStep, 'totalSteps:', state.totalSteps);
            await handleNextNavigation(state, instructorCourse);
        });
    } else {
        console.error('[DOCUMENT-SETUP] ❌ Next button not found!');
    }
}

/**
 * Sets up demo functionality event listeners
 * 
 * @param state - The document setup state object
 */
function setupDemoListeners(state: DocumentSetupState): void {
    // Learning objectives demo
    const addDemoObjectiveBtn = document.getElementById('addDemoObjective') as HTMLButtonElement;
    
    if (addDemoObjectiveBtn) {
        addDemoObjectiveBtn.addEventListener('click', async () => await addDemoObjective());
    }
    
    // File upload demo
    const demoUploadBtn = document.getElementById('demoUploadBtn') as HTMLButtonElement;
    
    if (demoUploadBtn) {
        console.log('DEBUG #15: Setting up demoUploadBtn event listener');
        demoUploadBtn.addEventListener('click', () => {
            console.log('DEBUG #14: demoUploadBtn clicked');
            openDemoUploadModal().catch(error => {
                console.error('Error opening demo upload modal:', error);
            });
        });
    } else {
        console.error('DEBUG #16: demoUploadBtn not found!');
    }
    
}

/**
 * Sets up the help button event listener
 * 
 * @param state - The document setup state object
 */
function setupHelpListener(state: DocumentSetupState): void {
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
        1: "Welcome to Document Setup",
        2: "Learning Objectives", 
        3: "Document Upload",
        4: "Setup Complete"
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
 * @param state - The document setup state object
 */
function handleBackNavigation(state: DocumentSetupState): void {
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
 * @param state - The document setup state object
 * @param instructorCourse - The instructor course object
 */
async function handleNextNavigation(state: DocumentSetupState, instructorCourse: activeCourse): Promise<void> {
    console.log('[DOCUMENT-SETUP] handleNextNavigation called, currentStep:', state.currentStep, 'totalSteps:', state.totalSteps);
    
    // Validate current step before proceeding
    const isValid = await validateCurrentStep(state);
    console.log('[DOCUMENT-SETUP] Validation result:', isValid);
    
    if (!isValid) {
        console.log('[DOCUMENT-SETUP] Validation failed, stopping navigation');
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
        console.log('[DOCUMENT-SETUP] On final step, calling handleFinalCompletion');
        await handleFinalCompletion(state, instructorCourse);
    }
}

/**
 * Validates the current step before allowing navigation
 * 
 * @param state - The document setup state object
 * @returns Promise<boolean> indicating if validation passed
 */
async function validateCurrentStep(state: DocumentSetupState): Promise<boolean> {
    switch (state.currentStep) {
        case 1: // Welcome - always valid
            return true;
            
        case 2: // Learning Objectives Demo
            return await validateLearningObjectivesStep();
            
        case 3: // Document Upload Demo
            return await validateDocumentUploadStep();
            
        case 4: // Completion - always valid
            return true;
            
        default:
            return true;
    }
}

/**
 * Validates the learning objectives step
 * 
 * @returns Promise<boolean> indicating if validation passed
 */
async function validateLearningObjectivesStep(): Promise<boolean> {
    const demoObjectives = document.querySelectorAll('.demo-objective-item');
    
    if (demoObjectives.length === 0) {
        const result = await showConfirmModal(
            "Learning Objectives Required",
            "You haven't added any learning objectives yet. Learning objectives are essential for guiding student learning and ensuring course alignment with educational goals.\n\nAre you sure you want to proceed without adding any learning objectives?",
            "Proceed Anyway",
            "Add Objectives"
        );
        
        return result.action === 'proceed-anyway';
    }
    
    return true;
}

/**
 * Validates the document upload step
 * 
 * @returns Promise<boolean> indicating if validation passed
 */
async function validateDocumentUploadStep(): Promise<boolean> {
    const demoFiles = document.querySelectorAll('.demo-file-item');
    
    if (demoFiles.length === 0) {
        const result = await showConfirmModal(
            "Course Materials Required",
            "You haven't uploaded any course materials yet. Course materials provide essential content for student learning and enable the AI tutor to provide contextually relevant assistance.\n\nAre you sure you want to proceed without uploading any materials?",
            "Proceed Anyway",
            "Upload Materials"
        );
        
        return result.action === 'proceed-anyway';
    }
    
    return true;
}

/**
 * Handles the final completion of document setup
 * 
 * @param state - The document setup state object
 * @param instructorCourse - The instructor course object
 */
async function handleFinalCompletion(state: DocumentSetupState, instructorCourse: activeCourse): Promise<void> {
    console.log("🎯 Completing document setup...");
    
    try {
        // Record the tutorial against the instructor, not the course, so a colleague who
        // is new to EngE-AI still gets taught on this same course.
        console.log(`📡 Recording contentSetup tutorial for the current instructor`);
        await completeInstructorOnboardingStage('contentSetup');

        console.log("✅ Content setup progress persisted to database successfully!");
        
        // Keep onboarding-active class - sidebar should remain hidden until ALL onboarding is complete
        // The class will be removed by instructor-mode.ts when all setup steps are done
        
        // Dispatch completion event
        window.dispatchEvent(new CustomEvent('documentSetupComplete'));
        
        console.log("✅ Document setup completed successfully!");
        
    } catch (error) {
        console.error("❌ Error during final completion:", error);
        await showErrorModal("Completion Error", `Failed to complete document setup: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
    }
}

// ===========================================
// UI UPDATE FUNCTIONS
// ===========================================

/**
 * Updates the display to show the current step
 * 
 * @param state - The document setup state object
 */
function updateStepDisplay(state: DocumentSetupState): void {
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

    updateStaffOnboardingProgress(state.currentStep, state.totalSteps);
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
 * @param state - The document setup state object
 */
function updateStepIndicators(state: DocumentSetupState): void {
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
 * @param state - The document setup state object
 */
function updateNavigationButtons(state: DocumentSetupState): void {
    const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
    
    if (backBtn) {
        backBtn.style.display = state.currentStep > 1 ? 'flex' : 'none';
    }
    
    if (nextBtn) {
        const navTextSpan = nextBtn.querySelector('.nav-btn-text');
        const label = state.currentStep === state.totalSteps ? 'Complete Setup' : 'Next';
        if (navTextSpan) {
            navTextSpan.textContent = label;
        } else {
            nextBtn.textContent = label;
        }
        nextBtn.disabled = false;
    }
}

// ===========================================
// DEMO FUNCTIONALITY
// ===========================================

// Demo data storage
let demoObjectives: DemoObjective[] = [];
let demoFiles: DemoFile[] = [];

// Current course reference for demo operations
let currentCourse: activeCourse | null = null;

/**
 * Get the current course for demo operations
 */
function getCurrentCourse(): activeCourse | null {
    return currentCourse;
}

/**
 * Adds a practice learning objective to the tutorial list.
 *
 * Tutorial state is deliberately in-memory only: the course belongs to whoever set it up,
 * and a second instructor working through the tutorial must not write into it.
 */
async function addDemoObjective(): Promise<void> {
    const objectiveInput = document.getElementById('demoObjectiveTitle') as HTMLInputElement;

    if (!objectiveInput) return;

    const learningObjective = objectiveInput.value.trim();

    if (!learningObjective) {
        await showSimpleErrorModal('Please fill in the learning objective.', 'Add Learning Objective');
        return;
    }

    demoObjectives.push({
        id: `demo-obj-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        learningObjective
    });
    updateDemoObjectivesDisplay();

    // Clear input
    objectiveInput.value = '';
}

/**
 * Updates the demo objectives display
 */
function updateDemoObjectivesDisplay(): void {
    const container = document.getElementById('objectivesContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (demoObjectives.length === 0) {
        const noObjectives = document.createElement('p');
        noObjectives.className = 'no-objectives';
        noObjectives.textContent = 'No learning objectives added yet. Try adding one above!';
        container.appendChild(noObjectives);
        return;
    }
    
    demoObjectives.forEach(objective => {
        const objectiveElement = document.createElement('div');
        objectiveElement.className = 'demo-objective-item';
        const header = document.createElement('div');
        header.className = 'objective-header';
        const title = document.createElement('h5');
        title.textContent = objective.learningObjective;
        header.append(title);
        objectiveElement.append(header);
        
        container.appendChild(objectiveElement);
    });
}

/**
 * Opens the practice upload modal.
 *
 * Unlike the real Documents page, this writes nothing: no Mongo material record, no Qdrant
 * vectors, no struggle-topic generation. The tutorial has to be safe to re-run, because a
 * second instructor joining an already-set-up course now works through it on that same
 * course — anything persisted here would land in a colleague's material library.
 *
 * It also no longer requires the course to have content, which used to dead-end this step
 * on a freshly created course.
 */
async function openDemoUploadModal() {
    await openContentInputModal({
        title: 'Practice Document Upload',
        initialMethod: 'file',
        allowEmptyText: false,
        strings: {
            nameLabel: 'Content Title',
            namePlaceholder: 'Enter a name for this practice material...',
            textLabel: 'Content Text',
            textPlaceholder: 'Enter or paste your content directly here...',
            nameRequiredMessage: 'Please enter a material name.',
            fileRequiredMessage: 'Please select a file to upload.',
            textRequiredMessage: 'Please enter some text content.'
        },
        onSubmit: handleOnboardingUpload,
        loadingContent: {
            title: 'Checking Document',
            line1: 'Checking your document...',
            line2: 'This is a practice run — nothing is added to your course.'
        }
    });
}

/**
 * Validates a practice upload and adds it to the tutorial list.
 *
 * Runs the same file-type and size checks as a real upload so the instructor sees realistic
 * feedback, then stops. Nothing is sent to the server.
 *
 * @param payload - Name, source type, and file or text from the modal
 * @returns Result driving the modal's success panel
 */
async function handleOnboardingUpload(payload: ContentInputPayload): Promise<ContentInputSubmitResult> {
    if (payload.sourceType === 'file') {
        if (!payload.file) {
            await showSimpleErrorModal('Please select a file to upload.', 'Upload Error');
            return { success: false };
        }

        // Same rules the real upload path enforces, so practice matches reality.
        const validation = new DocumentUploadModule().validateFile(payload.file);
        if (!validation.isValid) {
            await showSimpleErrorModal(validation.error || 'Unsupported file.', 'Upload Error');
            return { success: false };
        }
    }

    demoFiles.push({
        id: `demo-file-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        name: payload.name,
        type: payload.sourceType === 'file' && payload.file ? payload.file.type : 'text'
    });
    updateDemoFilesDisplay();

    return {
        success: true,
        successTitle: 'Practice Upload Complete',
        successMessage:
            'That is all there is to it. This was a practice run, so nothing was added to your course — ' +
            'upload your real course material from the Documents page once setup is finished.'
    };
}

/**
 * Updates the demo files display
 */
function updateDemoFilesDisplay(): void {
    const container = document.getElementById('filesContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (demoFiles.length === 0) {
        const noFiles = document.createElement('p');
        noFiles.className = 'no-files';
        noFiles.textContent = 'No files uploaded yet. Try uploading some materials!';
        container.appendChild(noFiles);
        return;
    }
    
    demoFiles.forEach(file => {
        const fileElement = document.createElement('div');
        fileElement.className = 'demo-file-item';
        const info = document.createElement('div');
        info.className = 'file-info';
        const name = document.createElement('span');
        name.className = 'file-name';
        name.textContent = file.name;
        info.append(name);
        fileElement.append(info);
        
        container.appendChild(fileElement);
    });
}

// ===========================================
// BACKEND INTEGRATION
// ===========================================


