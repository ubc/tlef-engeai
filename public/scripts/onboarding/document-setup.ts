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
import { activeCourse, LearningObjective, AdditionalMaterial } from "../../../src/functions/types.js";
import { showErrorModal, showHelpModal, showConfirmModal, openUploadModal } from "../modal-overlay.js";

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
    title: string;
    description: string;
}

/**
 * Demo uploaded file for the tutorial
 */
interface DemoFile {
    id: string;
    name: string;
    size: number;
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
    // Initialize divisions array if it doesn't exist
    if (!instructorCourse.divisions) {
        instructorCourse.divisions = [];
    }

    // Initialize learning objectives for each division if they don't exist
    instructorCourse.divisions.forEach(division => {
        division.items.forEach(item => {
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
        nextBtn.addEventListener('click', () => handleNextNavigation(state, instructorCourse));
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
        addDemoObjectiveBtn.addEventListener('click', () => addDemoObjective());
    }
    
    if (clearDemoBtn) {
        clearDemoBtn.addEventListener('click', () => clearDemoObjectives());
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
        // Mark content setup as complete
        instructorCourse.contentSetup = true;
        
        // Remove onboarding-active class to show instructor sidebar
        document.body.classList.remove('onboarding-active');
        
        // Dispatch completion event
        window.dispatchEvent(new CustomEvent('documentSetupComplete'));
        
        console.log("✅ Document setup completed successfully!");
        
    } catch (error) {
        console.error("❌ Error during final completion:", error);
        await showErrorModal("Completion Error", "Failed to complete document setup. Please try again.");
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
        } else {
            nextBtn.textContent = 'Next';
        }
    }
}

// ===========================================
// DEMO FUNCTIONALITY
// ===========================================

// Demo data storage
let demoObjectives: DemoObjective[] = [];
let demoFiles: DemoFile[] = [];

/**
 * Adds a demo learning objective
 */
function addDemoObjective(): void {
    const titleInput = document.getElementById('demoObjectiveTitle') as HTMLInputElement;
    const descriptionInput = document.getElementById('demoObjectiveDescription') as HTMLTextAreaElement;
    
    if (!titleInput || !descriptionInput) return;
    
    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();
    
    if (!title || !description) {
        alert('Please fill in both title and description.');
        return;
    }
    
    const newObjective: DemoObjective = {
        id: `demo-obj-${Date.now()}`,
        title: title,
        description: description
    };
    
    demoObjectives.push(newObjective);
    updateDemoObjectivesDisplay();
    
    // Clear inputs
    titleInput.value = '';
    descriptionInput.value = '';
    
    console.log('Added demo objective:', newObjective);
}

/**
 * Clears all demo learning objectives
 */
function clearDemoObjectives(): void {
    demoObjectives = [];
    updateDemoObjectivesDisplay();
    
    // Clear inputs
    const titleInput = document.getElementById('demoObjectiveTitle') as HTMLInputElement;
    const descriptionInput = document.getElementById('demoObjectiveDescription') as HTMLTextAreaElement;
    
    if (titleInput) titleInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    
    console.log('Cleared demo objectives');
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
                <h5>${objective.title}</h5>
                <button class="delete-demo-btn" data-index="${index}">×</button>
            </div>
            <div class="objective-description">${objective.description}</div>
        `;
        
        // Add delete functionality
        const deleteBtn = objectiveElement.querySelector('.delete-demo-btn') as HTMLButtonElement;
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                demoObjectives.splice(index, 1);
                updateDemoObjectivesDisplay();
            });
        }
        
        container.appendChild(objectiveElement);
    });
}

/**
 * Opens the demo upload modal using the openUploadModal function
 */
async function openDemoUploadModal() {
    // Use demo IDs for the modal
    const divisionId = 'demo-division';
    const contentId = 'demo-content';
    
    await openUploadModal(divisionId, contentId, handleDemoUpload);
}

/**
 * Handles demo upload from the modal
 * 
 * @param material - The material object from the upload modal
 */
function handleDemoUpload(material: any) {
    const demoFile: DemoFile = {
        id: `demo-file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: material.fileName || material.name || 'Text Content',
        size: material.file ? material.file.size : 0,
        type: material.sourceType === 'file' ? (material.file ? material.file.type : 'file') : 'text'
    };
    
    demoFiles.push(demoFile);
    updateDemoFilesDisplay();
    console.log('Added demo file:', demoFile);
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
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
            <button class="delete-file-btn" data-index="${index}">×</button>
        `;
        
        // Add delete functionality
        const deleteBtn = fileElement.querySelector('.delete-file-btn') as HTMLButtonElement;
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                demoFiles.splice(index, 1);
                updateDemoFilesDisplay();
            });
        }
        
        container.appendChild(fileElement);
    });
}

/**
 * Processes demo files (placeholder for backend integration)
 */
async function processDemoFiles(): Promise<void> {
    if (demoFiles.length === 0) {
        alert('No files to process. Please upload some files first.');
        return;
    }
    
    console.log('Processing demo files:', demoFiles);
    
    // Simulate backend processing
    try {
        // TODO: Implement actual backend integration
        const result = await simulateBackendProcessing(demoFiles);
        console.log('Files processed successfully:', result);
        alert(`Successfully processed ${demoFiles.length} files! (This is a demo)`);
    } catch (error) {
        console.error('Error processing files:', error);
        alert('Error processing files. Please try again.');
    }
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

/**
 * Formats file size for display
 * 
 * @param bytes - File size in bytes
 * @returns Formatted file size string
 */
function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ===========================================
// BACKEND INTEGRATION PLACEHOLDERS
// ===========================================

/**
 * Simulates backend processing of files
 * 
 * @param files - Array of demo files to process
 * @returns Promise with processing result
 */
async function simulateBackendProcessing(files: DemoFile[]): Promise<{ success: boolean; processed: number }> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // TODO: Replace with actual backend API calls
    console.log('Simulating backend processing for files:', files);
    
    return {
        success: true,
        processed: files.length
    };
}

/**
 * Placeholder function for adding learning objective to backend
 * 
 * @param objective - Learning objective to add
 * @returns Promise with result
 */
async function addLearningObjectiveToBackend(objective: LearningObjective): Promise<{ success: boolean; id?: string }> {
    // TODO: Implement actual backend API call
    console.log('Adding learning objective to backend:', objective);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
        success: true,
        id: `backend-obj-${Date.now()}`
    };
}

/**
 * Placeholder function for deleting learning objective from backend
 * 
 * @param objectiveId - ID of objective to delete
 * @returns Promise with result
 */
async function deleteLearningObjectiveFromBackend(objectiveId: string): Promise<{ success: boolean }> {
    // TODO: Implement actual backend API call
    console.log('Deleting learning objective from backend:', objectiveId);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
        success: true
    };
}

/**
 * Placeholder function for uploading file to backend
 * 
 * @param file - File to upload
 * @returns Promise with result
 */
async function uploadFileToBackend(file: File): Promise<{ success: boolean; id?: string }> {
    // TODO: Implement actual backend API call
    console.log('Uploading file to backend:', file);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
        success: true,
        id: `backend-file-${Date.now()}`
    };
}
