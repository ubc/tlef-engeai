/**
 * ONBOARDING MODULE - REVISED VERSION
 * 
 * This module handles the complete onboarding flow for instructors setting up their courses.
 * It provides a clean, step-by-step interface with dropdown selections and gentle navigation.
 * 
 * FEATURES:
 * - Two-column layout with left steps panel and right content area
 * - Hardcoded dropdown options for courses, instructors, and TAs
 * - Gentle navigation with fixed button positioning
 * - Comprehensive validation and error handling
 * - Clean, maintainable code structure
 * 
 * ONBOARDING STEPS:
 * 1. Getting Started - Welcome message and project credits
 * 2. Course Name - Select from predefined course options
 * 3. Instructors - Multi-select from predefined instructor list
 * 4. Teaching Assistants - Multi-select from predefined TA list (optional)
 * 5. Course Division - Choose between "By Week" or "By Topic"
 * 6. Content Count - Specify number of sections (1-52)
 * 7. Finalization - Review all selections and complete setup
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
 * Represents the current state of the onboarding process
 */
interface OnboardingState {
    currentStep: number;
    totalSteps: number;
    courseName: string;
    instructors: string[];
    teachingAssistants: string[];
    divisionType: 'byWeek' | 'byTopic';
    contentCount: number;
    isValid: boolean;
}

// ===========================================
// MAIN EXPORT FUNCTION
// ===========================================

/**
 * Renders the onboarding page and orchestrates the complete onboarding flow.
 * 
 * This function:
 * 1. Loads the onboarding HTML component
 * 2. Initializes the onboarding state
 * 3. Sets up event listeners for all interactions
 * 4. Manages step navigation and validation
 * 5. Handles final submission to the database
 * 
 * @param instructorClass - The instructor's course object to be populated
 * @returns Promise<void>
 */
export const renderOnboarding = async (instructorClass: activeCourse): Promise<void> => {
    console.log("🚀 Starting onboarding process...");
    
    try {
        // Initialize onboarding state
        const state: OnboardingState = {
            currentStep: 1,
            totalSteps: 7,
            courseName: '',
            instructors: [],
            teachingAssistants: [],
            divisionType: 'byWeek',
            contentCount: 12,
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
        await initializeOnboarding(state, instructorClass);

    } catch (error) {
        console.error("❌ Error during onboarding initialization:", error);
        await showErrorModal("Initialization Error", "Failed to initialize onboarding. Please refresh the page and try again.");
    }
};

// ===========================================
// INITIALIZATION FUNCTIONS
// ===========================================

/**
 * Initializes the onboarding interface with event listeners and initial state
 * 
 * @param state - The onboarding state object
 * @param instructorClass - The instructor's course object
 */
async function initializeOnboarding(state: OnboardingState, instructorClass: activeCourse): Promise<void> {
    console.log("🔧 Initializing onboarding interface...");

    // Set up navigation event listeners
    setupNavigationListeners(state, instructorClass);
    
    // Set up form event listeners
    setupFormListeners(state);
    
    // Set up help button listener
    setupHelpListener(state);
    
    // Initialize the first step
    updateStepDisplay(state);
    
    // Set up step indicators
    updateStepIndicators(state);
    
    console.log("✅ Onboarding interface initialized successfully");
}

/**
 * Sets up navigation button event listeners
 * 
 * @param state - The onboarding state object
 * @param instructorClass - The instructor's course object
 */
function setupNavigationListeners(state: OnboardingState, instructorClass: activeCourse): void {
    const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;

    if (backBtn) {
        backBtn.addEventListener('click', () => handleBackNavigation(state));
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => handleNextNavigation(state, instructorClass));
    }
}

/**
 * Sets up form element event listeners
 * 
 * @param state - The onboarding state object
 */
function setupFormListeners(state: OnboardingState): void {
    // Course selection
    const courseSelect = document.getElementById('courseSelect') as HTMLSelectElement;
    if (courseSelect) {
        courseSelect.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            state.courseName = target.value;
            updateStepIndicators(state);
        });
    }

    // Instructor selection with add button
    const instructorSelect = document.getElementById('instructorSelect') as HTMLSelectElement;
    const addInstructorBtn = document.getElementById('addInstructorBtn') as HTMLButtonElement;
    if (instructorSelect && addInstructorBtn) {
        const addInstructor = () => {
            const selectedValue = instructorSelect.value;
            if (selectedValue && !state.instructors.includes(selectedValue)) {
                state.instructors.push(selectedValue);
                updateSelectedItemsDisplay('selectedInstructors', state.instructors, state);
                updateStepIndicators(state);
                instructorSelect.value = ''; // Reset selection
            }
        };

        // Click event for add button
        addInstructorBtn.addEventListener('click', addInstructor);

        // Enter key event for dropdown when focused
        instructorSelect.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && instructorSelect.value) {
                e.preventDefault();
                addInstructor();
            }
        });
    }

    // Teaching assistant selection with add button
    const taSelect = document.getElementById('taSelect') as HTMLSelectElement;
    const addTABtn = document.getElementById('addTABtn') as HTMLButtonElement;
    if (taSelect && addTABtn) {
        const addTA = () => {
            const selectedValue = taSelect.value;
            if (selectedValue && !state.teachingAssistants.includes(selectedValue)) {
                state.teachingAssistants.push(selectedValue);
                updateSelectedItemsDisplay('selectedTAs', state.teachingAssistants, state);
                updateStepIndicators(state);
                taSelect.value = ''; // Reset selection
            }
        };

        // Click event for add button
        addTABtn.addEventListener('click', addTA);

        // Enter key event for dropdown when focused
        taSelect.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && taSelect.value) {
                e.preventDefault();
                addTA();
            }
        });
    }

    // Division type selection
    const divisionRadios = document.querySelectorAll('input[name="division"]') as NodeListOf<HTMLInputElement>;
    divisionRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            state.divisionType = target.value as 'byWeek' | 'byTopic';
            updateContentCountDescription(state);
        });
    });

    // Content count input
    const contentCountInput = document.getElementById('contentCount') as HTMLInputElement;
    if (contentCountInput) {
        contentCountInput.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            state.contentCount = parseInt(target.value) || 0;
            updateStepIndicators(state);
        });
    }
}

/**
 * Sets up event listeners for the review step form elements
 * 
 * @param state - The onboarding state object
 */
function setupReviewFormListeners(state: OnboardingState): void {
    // Review course selection
    const reviewCourseSelect = document.getElementById('reviewCourseSelect') as HTMLSelectElement;
    if (reviewCourseSelect) {
        reviewCourseSelect.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            state.courseName = target.value;
            updateStepIndicators(state);
        });
    }

    // Review instructor selection with add button
    const reviewInstructorSelect = document.getElementById('reviewInstructorSelect') as HTMLSelectElement;
    const reviewAddInstructorBtn = document.getElementById('reviewAddInstructorBtn') as HTMLButtonElement;
    if (reviewInstructorSelect && reviewAddInstructorBtn) {
        const addReviewInstructor = () => {
            const selectedValue = reviewInstructorSelect.value;
            if (selectedValue && !state.instructors.includes(selectedValue)) {
                state.instructors.push(selectedValue);
                updateSelectedItemsDisplay('reviewSelectedInstructors', state.instructors, state);
                updateStepIndicators(state);
                reviewInstructorSelect.value = ''; // Reset selection
            }
        };

        // Click event for add button
        reviewAddInstructorBtn.addEventListener('click', addReviewInstructor);

        // Enter key event for dropdown when focused
        reviewInstructorSelect.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && reviewInstructorSelect.value) {
                e.preventDefault();
                addReviewInstructor();
            }
        });
    }

    // Review teaching assistant selection with add button
    const reviewTASelect = document.getElementById('reviewTASelect') as HTMLSelectElement;
    const reviewAddTABtn = document.getElementById('reviewAddTABtn') as HTMLButtonElement;
    if (reviewTASelect && reviewAddTABtn) {
        const addReviewTA = () => {
            const selectedValue = reviewTASelect.value;
            if (selectedValue && !state.teachingAssistants.includes(selectedValue)) {
                state.teachingAssistants.push(selectedValue);
                updateSelectedItemsDisplay('reviewSelectedTAs', state.teachingAssistants, state);
                updateStepIndicators(state);
                reviewTASelect.value = ''; // Reset selection
            }
        };

        // Click event for add button
        reviewAddTABtn.addEventListener('click', addReviewTA);

        // Enter key event for dropdown when focused
        reviewTASelect.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && reviewTASelect.value) {
                e.preventDefault();
                addReviewTA();
            }
        });
    }

    // Review division type selection
    const reviewDivisionRadios = document.querySelectorAll('input[name="reviewDivision"]') as NodeListOf<HTMLInputElement>;
    reviewDivisionRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            state.divisionType = target.value as 'byWeek' | 'byTopic';
            updateReviewContentCountDescription(state);
        });
    });

    // Review content count input
    const reviewContentCountInput = document.getElementById('reviewContentCount') as HTMLInputElement;
    if (reviewContentCountInput) {
        reviewContentCountInput.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            state.contentCount = parseInt(target.value) || 0;
            updateStepIndicators(state);
        });
    }
}

/**
 * Sets up the help button event listener
 * 
 * @param state - The onboarding state object
 */
function setupHelpListener(state: OnboardingState): void {
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
        1: "Getting Started",
        2: "Course Selection", 
        3: "Instructor Selection",
        4: "Teaching Assistants",
        5: "Course Organization",
        6: "Content Count",
        7: "Review & Complete"
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
 * @param state - The onboarding state object
 */
function handleBackNavigation(state: OnboardingState): void {
    if (state.currentStep > 1) {
        state.currentStep--;
        updateStepDisplay(state);
        updateStepIndicators(state);
        updateNavigationButtons(state);
        console.log(`⬅️ Navigated to step ${state.currentStep}`);
    }
}

/**
 * Handles next navigation and final submission
 * 
 * @param state - The onboarding state object
 * @param instructorClass - The instructor's course object
 */
async function handleNextNavigation(state: OnboardingState, instructorClass: activeCourse): Promise<void> {
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
        
        // Update review content if we're on the final step
        if (state.currentStep === state.totalSteps) {
            updateReviewContent(state);
        }
        
        console.log(`➡️ Navigated to step ${state.currentStep}`);
    } else {
        // Final submission
        await handleFinalSubmission(state, instructorClass);
    }
}

/**
 * Validates the current step before allowing navigation
 * 
 * @param state - The onboarding state object
 * @returns Promise<boolean> indicating if validation passed
 */
async function validateCurrentStep(state: OnboardingState): Promise<boolean> {
    switch (state.currentStep) {
        case 1: // Getting Started - always valid
            return true;
            
        case 2: // Course Name
            if (!state.courseName) {
                await showErrorModal("Validation Error", "Please select a course name.");
                return false;
            }
            return true;
            
        case 3: // Instructors
            if (state.instructors.length === 0) {
                await showErrorModal("Validation Error", "Please select at least one instructor.");
                return false;
            }
            return true;
            
        case 4: // Teaching Assistants - optional
            return true;
            
        case 5: // Course Division - always valid (has default)
            return true;
            
        case 6: // Content Count
            if (state.contentCount < 1 || state.contentCount > 52) {
                await showErrorModal("Validation Error", "Please enter a valid number of sections (1-52).");
                return false;
            }
            if (state.divisionType === 'byWeek' && state.contentCount > 14) {
                await showErrorModal("Validation Error", "For weekly organization, please enter 14 weeks or fewer.");
                return false;
            }
            return true;
            
        case 7: // Finalization - validate all fields
            return await validateAllFields(state);
            
        default:
            return true;
    }
}

/**
 * Validates all fields for final submission
 * 
 * @param state - The onboarding state object
 * @returns Promise<boolean> indicating if all validations passed
 */
async function validateAllFields(state: OnboardingState): Promise<boolean> {
    if (!state.courseName) {
        await showErrorModal("Validation Error", "Course name is required.");
        return false;
    }
    
    if (state.instructors.length === 0) {
        await showErrorModal("Validation Error", "At least one instructor is required.");
        return false;
    }
    
    if (state.contentCount < 1 || state.contentCount > 52) {
        await showErrorModal("Validation Error", "Invalid number of sections.");
        return false;
    }
    
    if (state.divisionType === 'byWeek' && state.contentCount > 14) {
        await showErrorModal("Validation Error", "For weekly organization, maximum 14 weeks allowed.");
        return false;
    }
    
    return true;
}

// ===========================================
// UI UPDATE FUNCTIONS
// ===========================================

/**
 * Updates the display to show the current step
 * 
 * @param state - The onboarding state object
 */
function updateStepDisplay(state: OnboardingState): void {
    // Hide all content steps
    const contentSteps = document.querySelectorAll('.content-step');
    contentSteps.forEach(step => step.classList.remove('active'));
    
    // Show current step
    const currentStepElement = document.getElementById(`content-step-${state.currentStep}`);
    if (currentStepElement) {
        currentStepElement.classList.add('active');
    }
}

/**
 * Updates the step indicators in the left panel
 * 
 * @param state - The onboarding state object
 */
function updateStepIndicators(state: OnboardingState): void {
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
 * @param state - The onboarding state object
 */
function updateNavigationButtons(state: OnboardingState): void {
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

/**
 * Updates the selected items display for multi-select dropdowns
 * 
 * @param containerId - The ID of the container element
 * @param items - Array of selected items
 * @param state - The onboarding state object
 */
function updateSelectedItemsDisplay(containerId: string, items: string[], state: OnboardingState): void {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    items.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'selected-item';
        itemElement.innerHTML = `
            <span>${item}</span>
            <button class="remove-btn" data-item="${item}">×</button>
        `;
        
        // Add remove functionality
        const removeBtn = itemElement.querySelector('.remove-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                removeSelectedItem(containerId, item, state);
            });
        }
        
        container.appendChild(itemElement);
    });
}

/**
 * Removes a selected item from the display and updates the state
 * 
 * @param containerId - The ID of the container element
 * @param item - The item to remove
 * @param state - The onboarding state object
 */
function removeSelectedItem(containerId: string, item: string, state: OnboardingState): void {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Remove from display
    const itemElements = container.querySelectorAll('.selected-item');
    itemElements.forEach(element => {
        const itemSpan = element.querySelector('span');
        if (itemSpan && itemSpan.textContent === item) {
            element.remove();
        }
    });
    
    // Update state based on container type
    if (containerId === 'selectedInstructors') {
        const index = state.instructors.indexOf(item);
        if (index > -1) {
            state.instructors.splice(index, 1);
            updateStepIndicators(state);
        }
    } else if (containerId === 'selectedTAs') {
        const index = state.teachingAssistants.indexOf(item);
        if (index > -1) {
            state.teachingAssistants.splice(index, 1);
            updateStepIndicators(state);
        }
    }
}

/**
 * Updates the content count description based on division type
 * 
 * @param state - The onboarding state object
 */
function updateContentCountDescription(state: OnboardingState): void {
    const descriptionElement = document.getElementById('countDescription');
    if (!descriptionElement) return;
    
    if (state.divisionType === 'byWeek') {
        descriptionElement.textContent = 'How many weeks are in your course?';
    } else {
        descriptionElement.textContent = 'How many topics are in your course?';
    }
}

/**
 * Updates the review content on the final step
 * 
 * @param state - The onboarding state object
 */
function updateReviewContent(state: OnboardingState): void {
    // Update course name dropdown
    const reviewCourseSelect = document.getElementById('reviewCourseSelect') as HTMLSelectElement;
    if (reviewCourseSelect) {
        reviewCourseSelect.value = state.courseName;
    }
    
    // Update division type radio buttons
    const reviewByWeek = document.getElementById('reviewByWeek') as HTMLInputElement;
    const reviewByTopic = document.getElementById('reviewByTopic') as HTMLInputElement;
    if (reviewByWeek && reviewByTopic) {
        if (state.divisionType === 'byWeek') {
            reviewByWeek.checked = true;
        } else {
            reviewByTopic.checked = true;
        }
    }
    
    // Update content count input
    const reviewContentCountInput = document.getElementById('reviewContentCount') as HTMLInputElement;
    if (reviewContentCountInput) {
        reviewContentCountInput.value = state.contentCount.toString();
    }
    
    // Update instructors display
    updateSelectedItemsDisplay('reviewSelectedInstructors', state.instructors, state);
    
    // Update teaching assistants display
    updateSelectedItemsDisplay('reviewSelectedTAs', state.teachingAssistants, state);
    
    // Update content count description
    updateReviewContentCountDescription(state);
}

/**
 * Updates the content count description for review step
 * 
 * @param state - The onboarding state object
 */
function updateReviewContentCountDescription(state: OnboardingState): void {
    const descriptionElement = document.getElementById('reviewCountDescription');
    if (!descriptionElement) return;
    
    if (state.divisionType === 'byWeek') {
        descriptionElement.textContent = 'How many weeks are in your course?';
    } else {
        descriptionElement.textContent = 'How many topics are in your course?';
    }
}

// ===========================================
// FINAL SUBMISSION
// ===========================================

/**
 * Handles the final submission of the onboarding data
 * 
 * @param state - The onboarding state object
 * @param instructorClass - The instructor's course object
 */
async function handleFinalSubmission(state: OnboardingState, instructorClass: activeCourse): Promise<void> {
    console.log("🎯 Processing final submission...");
    
    try {
        // Create the course object
        const courseData: activeCourse = {
            id: generateUniqueId(),
            date: new Date(),
            onBoarded: true,
            courseName: state.courseName,
            instructors: state.instructors,
            teachingAssistants: state.teachingAssistants,
            frameType: state.divisionType,
            tilesNumber: state.contentCount,
            divisions: []
        };
        
        // Submit to database
        const submittedCourse = await postCourseToDatabase(courseData);
        
        // Update the instructor class object
        Object.assign(instructorClass, submittedCourse);
        
        // Remove onboarding-active class to show instructor sidebar
        document.body.classList.remove('onboarding-active');
        
        // Dispatch completion event
        window.dispatchEvent(new CustomEvent('onboardingComplete'));
        
        console.log("✅ Onboarding completed successfully!");
        
    } catch (error) {
        console.error("❌ Error during final submission:", error);
        await showErrorModal("Submission Error", "Failed to complete setup. Please try again.");
    }
}

/**
 * Posts the course data to the database
 * 
 * @param courseData - The course data to submit
 * @returns Promise<activeCourse>
 */
async function postCourseToDatabase(courseData: activeCourse): Promise<activeCourse> {
    const response = await fetch('/api/mongodb/courses', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(courseData)
    });
    
    if (!response.ok) {
        throw new Error(`Failed to post course data: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data as activeCourse;
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Generates a unique ID for the course
 * 
 * @returns string - A unique identifier
 */
function generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}


