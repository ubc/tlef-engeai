/**
 * DOCUMENT SETUP MODULE - ONBOARDING VERSION
 * 
 * This module handles the document setup onboarding flow for instructors.
 * It provides a step-by-step tutorial on how to add learning objectives and upload documents.
 * 
 * FEATURES:
 * - 4-step onboarding process with navigation
 * - Learning objectives demo with add/delete functionality
 * - Document upload demo with file handling
 * - Backend integration placeholders (unimplemented)
 * - Data structure initialization and validation
 * 
 * ONBOARDING STEPS:
 * 1. Welcome - Overview of document setup process
 * 2. Learning Objectives - Demo how to add learning objectives
 * 3. Document Upload - Demo how to upload course materials
 * 4. Completion - Summary and next steps
 * 
 * @author: gatahcha (revised)
 * @date: 2025-01-27
 * @version: 1.0.0
 */

import { loadComponentHTML } from "../functions/api.js";
import { activeCourse, LearningObjective, AdditionalMaterial, TopicOrWeekInstance, TopicOrWeekItem } from "../../../src/functions/types.js";
import { showErrorModal, showHelpModal, showConfirmModal, openUploadModal, showSimpleErrorModal, showDeleteConfirmationModal } from "../modal-overlay.js";
import { DocumentUploadModule, UploadResult } from '../services/DocumentUploadModule.js';

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
 * @param instructorCourse - The instructor's course object to be populated
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
    const clearDemoBtn = document.getElementById('clearDemo') as HTMLButtonElement;
    
    if (addDemoObjectiveBtn) {
        addDemoObjectiveBtn.addEventListener('click', async () => await addDemoObjective());
    }
    
    if (clearDemoBtn) {
        clearDemoBtn.addEventListener('click', async () => await clearDemoObjectives());
    }

    // File upload demo
    const demoUploadBtn = document.getElementById('demoUploadBtn') as HTMLButtonElement;
    const processDemoFilesBtn = document.getElementById('processDemoFiles') as HTMLButtonElement;
    const clearDemoFilesBtn = document.getElementById('clearDemoFiles') as HTMLButtonElement;
    
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
    
    if (processDemoFilesBtn) {
        processDemoFilesBtn.addEventListener('click', () => processDemoFiles());
    }
    
    if (clearDemoFilesBtn) {
        clearDemoFilesBtn.addEventListener('click', () => clearDemoFiles());
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
        // Validate courseId exists
        if (!instructorCourse.id) {
            throw new Error("Course ID is missing. Cannot update database.");
        }
        
        // Mark content setup as complete locally
        instructorCourse.contentSetup = true;
        
        // Persist to database
        console.log(`📡 Updating database: setting contentSetup=true for course ${instructorCourse.id}`);
        const response = await fetch(`/api/courses/${instructorCourse.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                contentSetup: true
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
        
        console.log("✅ Content setup status persisted to database successfully!");
        
        // Keep onboarding-active class - sidebar should remain hidden until ALL onboarding is complete
        // The class will be removed by instructor-mode.ts when all setup steps are done
        
        // Dispatch completion event
        window.dispatchEvent(new CustomEvent('documentSetupComplete'));
        
        console.log("✅ Document setup completed successfully!");
        
    } catch (error) {
        console.error("❌ Error during final completion:", error);
        // Revert local change on error
        instructorCourse.contentSetup = false;
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
        if (state.currentStep === state.totalSteps) {
            nextBtn.textContent = 'Complete Setup';
            // Ensure button is enabled on final step
            nextBtn.disabled = false;
        } else {
            nextBtn.textContent = 'Next';
            nextBtn.disabled = false;
        }
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
 * Adds a demo learning objective to the real course data (first division, first item)
 */
async function addDemoObjective(): Promise<void> {
    const objectiveInput = document.getElementById('demoObjectiveTitle') as HTMLInputElement;
    
    if (!objectiveInput) return;
    
    const learningObjective = objectiveInput.value.trim();
    
    if (!learningObjective) {
        alert('Please fill in the learning objective.');
        return;
    }
    
    // Get the current course from the global state
    const currentCourse = getCurrentCourse();
    if (!currentCourse) {
        console.error('No current course found');
        return;
    }
    
    // Get the first topic/week instance and first item
    const firstInstance = currentCourse.topicOrWeekInstances?.[0];
    const firstItem = firstInstance?.items?.[0];
    
    if (!firstInstance || !firstItem) {
        console.error('No first topic/week instance or first item found');
        return;
    }
    
    // Create a real LearningObjective object
    const newObjective: LearningObjective = {
        id: `obj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        LearningObjective: learningObjective,
        courseName: currentCourse.courseName,
        topicOrWeekTitle: firstInstance.title,
        itemTitle: firstItem.title,
        createdAt: new Date(),
        updatedAt: new Date()
    };
    
    // Add to demo display
    const demoObjective: DemoObjective = {
        id: newObjective.id,
        learningObjective: learningObjective
    };
    
    demoObjectives.push(demoObjective);
    updateDemoObjectivesDisplay();
    
    // Add to real course data
    if (!firstItem.learningObjectives) {
        firstItem.learningObjectives = [];
    }
    firstItem.learningObjectives.push(newObjective);
    
    // Save to database
    try {
        const result = await addLearningObjectiveToBackend(
            newObjective, 
            currentCourse.id, 
            firstInstance.id, 
            firstItem.id
        );
        
        if (result.success) {
            console.log('Learning objective added to real course data:', newObjective);
        } else {
            await showSimpleErrorModal('Failed to save learning objective to database', 'Save Learning Objective Error');
        }
    } catch (error) {
        console.error('Error saving learning objective:', error);
        await showSimpleErrorModal('An error occurred while saving the learning objective. Please try again.', 'Save Learning Objective Error');
    }
    
    // Clear input
    objectiveInput.value = '';
}

/**
 * Removes a specific demo learning objective from both demo and real course data
 * 
 * @param index - The index of the objective to remove
 */
async function removeDemoObjective(index: number): Promise<void> {
    if (index < 0 || index >= demoObjectives.length) {
        await showSimpleErrorModal('Invalid objective index', 'Remove Learning Objective Error');
        return;
    }
    
    const objectiveToRemove = demoObjectives[index];
    if (!objectiveToRemove) {
        await showSimpleErrorModal('Objective not found', 'Remove Learning Objective Error');
        return;
    }
    
    // Show confirmation modal
    const result = await showDeleteConfirmationModal(
        'Learning Objective',
        objectiveToRemove.learningObjective
    );
    
    if (result.action !== 'delete') {
        return; // User cancelled
    }
    
    // Remove from demo display
    demoObjectives.splice(index, 1);
    updateDemoObjectivesDisplay();
    
    // Remove from real course data (first topic/week instance, first item)
    const course = getCurrentCourse();
    if (course?.topicOrWeekInstances?.[0]?.items?.[0]) {
        const firstItem = course.topicOrWeekInstances[0].items[0];
        if (firstItem.learningObjectives) {
            // Find and remove the objective from real data
            const realObjectiveIndex = firstItem.learningObjectives.findIndex((obj: LearningObjective) => obj.id === objectiveToRemove.id);
            if (realObjectiveIndex !== -1) {
                try {
                    // Delete from database
                    await deleteLearningObjectiveFromBackend(
                        objectiveToRemove.id,
                        course.id,
                        course.topicOrWeekInstances[0].id,
                        firstItem.id
                    );
                    
                    // Remove from local data
                    firstItem.learningObjectives.splice(realObjectiveIndex, 1);
                    
                    console.log('Learning objective removed from real course data:', objectiveToRemove.id);
                } catch (error) {
                    console.error('Error removing learning objective from database:', error);
                    await showSimpleErrorModal('An error occurred while removing the learning objective from the database.', 'Remove Learning Objective Error');
                }
            }
        }
    }
    
    console.log('Removed demo objective:', objectiveToRemove);
}

/**
 * Clears all demo learning objectives
 */
async function clearDemoObjectives(): Promise<void> {
    // Show confirmation modal
    const result = await showDeleteConfirmationModal('All Learning Objectives');
    
    if (result.action !== 'delete') {
        return; // User cancelled
    }
    
    // Clear demo display
    demoObjectives = [];
    updateDemoObjectivesDisplay();
    
    // Clear input
    const objectiveInput = document.getElementById('demoObjectiveTitle') as HTMLInputElement;
    
    if (objectiveInput) objectiveInput.value = '';
    
    // Clear from real course data (first topic/week instance, first item)
    const course = getCurrentCourse();
    if (course?.topicOrWeekInstances?.[0]?.items?.[0]) {
        const firstItem = course.topicOrWeekInstances[0].items[0];
        if (firstItem.learningObjectives) {
            // Delete each learning objective from database
            for (const objective of firstItem.learningObjectives) {
                try {
                    await deleteLearningObjectiveFromBackend(
                        objective.id,
                        course.id,
                        course.topicOrWeekInstances[0].id,
                        firstItem.id
                    );
                } catch (error) {
                    console.error('Error deleting learning objective:', error);
                    await showSimpleErrorModal('An error occurred while clearing learning objectives.', 'Clear Learning Objectives Error');
                }
            }
            // Clear from local data
            firstItem.learningObjectives = [];
        }
    }
    
    console.log('Cleared all demo objectives from both demo and real course data');
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
    
    demoObjectives.forEach((objective, index) => {
        const objectiveElement = document.createElement('div');
        objectiveElement.className = 'demo-objective-item';
        objectiveElement.innerHTML = `
            <div class="objective-header">
                <h5>${objective.learningObjective}</h5>
                <button class="delete-demo-btn" data-index="${index}">×</button>
            </div>
        `;
        
        // Add delete functionality
        const deleteBtn = objectiveElement.querySelector('.delete-demo-btn') as HTMLButtonElement;
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                await removeDemoObjective(index);
            });
        }
        
        container.appendChild(objectiveElement);
    });
}

/**
 * Opens the demo upload modal using the openUploadModal function
 */
async function openDemoUploadModal() {
    // Use real course data for the upload
    const course = getCurrentCourse();
    if (!course) {
        console.error('No current course found');
        await showSimpleErrorModal('No course available for upload', 'Upload Error');
        return;
    }

    // Get the first topic/week instance and first item
    const firstInstance = course.topicOrWeekInstances?.[0];
    const firstItem = firstInstance?.items?.[0];

    if (!firstInstance || !firstItem) {
        console.error('No first topic/week instance or first item found');
        await showSimpleErrorModal('No content available for upload', 'Upload Error');
        return;
    }

    await openUploadModal(firstInstance.id, firstItem.id, handleOnboardingUpload);
}

/**
 * Handles actual document upload during onboarding
 *
 * @param material - The material object from the upload modal
 * @returns Promise that resolves when the document is uploaded
 */
async function handleOnboardingUpload(material: any): Promise<{ success: boolean; chunksGenerated?: number } | void> {
    console.log('🔍 HANDLE ONBOARDING UPLOAD CALLED - FUNCTION STARTED');
    console.log('  - material:', material);

    try {
        // Get the current course
        const course = getCurrentCourse();
        if (!course) {
            console.error('❌ No current course found for upload');
            await showSimpleErrorModal('No course available for upload', 'Upload Error');
            return;
        }

        // Get the first topic/week instance and first item
        const firstInstance = course.topicOrWeekInstances?.[0];
        const firstItem = firstInstance?.items?.[0];

        if (!firstInstance || !firstItem) {
            console.error('❌ No first topic/week instance or first item found');
            await showSimpleErrorModal('No content available for upload', 'Upload Error');
            return;
        }

        // Create the additional material object
        const additionalMaterial: AdditionalMaterial = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: material.name,
            courseName: course.courseName,
            topicOrWeekTitle: firstInstance.title,
            itemTitle: firstItem.title,
            sourceType: material.sourceType,
            file: material.file,
            text: material.text,
            fileName: material.fileName,
            date: new Date(),
            courseId: course.id || '',
            topicOrWeekId: firstInstance.id,
            itemId: firstItem.id
        };

        console.log('🔍 CREATING DOCUMENT UPLOAD MODULE FOR ONBOARDING');
        console.log('  - additionalMaterial:', additionalMaterial);

        // Use DocumentUploadModule for upload
        const uploadModule = new DocumentUploadModule((progress, stage) => {
            console.log(`Upload progress: ${progress}% - ${stage}`);
            // You could update a progress bar here if needed
        });

        console.log('🔍 CALLING UPLOAD MODULE.uploadDocument');
        const uploadResult: UploadResult = await uploadModule.uploadDocument(additionalMaterial);
        console.log('🔍 UPLOAD RESULT:', uploadResult);

        if (!uploadResult.success) {
            console.error(`Upload failed: ${uploadResult.error}`);
            await showSimpleErrorModal(`Failed to upload content: ${uploadResult.error}`, 'Upload Error');
            return;
        }

        if (!uploadResult.document) {
            console.error('Upload succeeded but no document returned');
            await showSimpleErrorModal('Upload succeeded but no document was returned. Please try again.', 'Upload Error');
            return;
        }

        // Add the uploaded document to the course data
        if (!firstItem.additionalMaterials) {
            firstItem.additionalMaterials = [];
        }
        firstItem.additionalMaterials.push(uploadResult.document);

        // Create a demo file object for UI display
        const uploadedFile: DemoFile = {
            id: uploadResult.document.id,
            name: uploadResult.document.name,
            type: uploadResult.document.sourceType === 'file' ? (uploadResult.document.file ? uploadResult.document.file.type : 'file') : 'text'
        };

        demoFiles.push(uploadedFile);
        updateDemoFilesDisplay();

        console.log('Material uploaded successfully during onboarding:', uploadResult.document);
        console.log(`Generated ${uploadResult.chunksGenerated} chunks in Qdrant`);

        // Return success info for the upload modal handler to show the success modal
        return { success: true, chunksGenerated: uploadResult.chunksGenerated };

    } catch (error) {
        console.error('Error in onboarding upload process:', error);
        await showSimpleErrorModal('An error occurred during upload. Please try again.', 'Upload Error');
        throw error; // Re-throw so modal handler can catch it
    }
}

/**
 * Removes a demo file from both the UI and actual course data
 *
 * @param index - The index of the file to remove
 */
async function removeDemoFile(index: number): Promise<void> {
    if (index < 0 || index >= demoFiles.length) {
        await showSimpleErrorModal('Invalid file index', 'Remove File Error');
        return;
    }

    const fileToRemove = demoFiles[index];
    if (!fileToRemove) {
        await showSimpleErrorModal('File not found', 'Remove File Error');
        return;
    }

    // Show confirmation modal
    const result = await showDeleteConfirmationModal(
        'Uploaded File',
        fileToRemove.name
    );

    if (result.action !== 'delete') {
        return; // User cancelled
    }

    // Remove from demo display
    demoFiles.splice(index, 1);
    updateDemoFilesDisplay();

    // Remove from real course data (first topic/week instance, first item)
    const course = getCurrentCourse();
    if (course?.topicOrWeekInstances?.[0]?.items?.[0]) {
        const firstItem = course.topicOrWeekInstances[0].items[0];
        if (firstItem.additionalMaterials) {
            // Find and remove the material from real data
            const realMaterialIndex = firstItem.additionalMaterials.findIndex((material: AdditionalMaterial) => material.id === fileToRemove.id);
            if (realMaterialIndex !== -1) {
                // TODO: Also delete from vectorDB if needed
                // For now, just remove from local data
                firstItem.additionalMaterials.splice(realMaterialIndex, 1);
                console.log('File removed from real course data:', fileToRemove.id);
            }
        }
    }

    console.log('Removed uploaded file:', fileToRemove);
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
    
    demoFiles.forEach((file, index) => {
        const fileElement = document.createElement('div');
        fileElement.className = 'demo-file-item';
        fileElement.innerHTML = `
            <div class="file-info">
                <span class="file-name">${file.name}</span>
            </div>
            <button class="delete-file-btn" data-index="${index}">×</button>
        `;
        
        // Add delete functionality
        const deleteBtn = fileElement.querySelector('.delete-file-btn') as HTMLButtonElement;
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                await removeDemoFile(index);
            });
        }
        
        container.appendChild(fileElement);
    });
}

/**
 * Shows information about uploaded files during onboarding
 */
async function processDemoFiles(): Promise<void> {
    if (demoFiles.length === 0) {
        alert('No files uploaded yet. Please upload some files first.');
        return;
    }

    console.log('Uploaded files during onboarding:', demoFiles);

    // Show success message - files are already uploaded to vectorDB
    alert(`Successfully uploaded ${demoFiles.length} files to the knowledge base! These documents are now available for the AI tutor.`);
}

/**
 * Clears all demo files
 */
function clearDemoFiles(): void {
    demoFiles = [];
    updateDemoFilesDisplay();
    
    // Clear file input
    const fileInput = document.getElementById('demoFileInput') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
    
    console.log('Cleared demo files');
}


// ===========================================
// BACKEND INTEGRATION
// ===========================================

/**
 * Add learning objective to backend
 * 
 * @param objective - Learning objective to add
 * @param courseId - Course ID
 * @param topicOrWeekId - Topic/Week Instance ID
 * @param contentId - Content ID
 * @returns Promise with result
 */
async function addLearningObjectiveToBackend(objective: LearningObjective, courseId: string, topicOrWeekId: string, contentId: string): Promise<{ success: boolean; id?: string }> {
    try {
        const response = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${contentId}/objectives`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                learningObjective: objective
            })
        });

        const result = await response.json();
        
        if (result.success) {
            return {
                success: true,
                id: objective.id
            };
        } else {
            console.error('Failed to add learning objective:', result.error);
            return {
                success: false
            };
        }
    } catch (error) {
        console.error('Error adding learning objective to backend:', error);
        return {
            success: false
        };
    }
}

/**
 * Delete learning objective from backend
 * 
 * @param objectiveId - ID of objective to delete
 * @param courseId - Course ID
 * @param topicOrWeekId - Topic/Week Instance ID
 * @param contentId - Content ID
 * @returns Promise with result
 */
async function deleteLearningObjectiveFromBackend(objectiveId: string, courseId: string, topicOrWeekId: string, contentId: string): Promise<{ success: boolean }> {
    try {
        const response = await fetch(`/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${contentId}/objectives/${objectiveId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        
        if (result.success) {
            return {
                success: true
            };
        } else {
            console.error('Failed to delete learning objective:', result.error);
            return {
                success: false
            };
        }
    } catch (error) {
        console.error('Error deleting learning objective from backend:', error);
        return {
            success: false
        };
    }
}

