/**
 * COURSE SETUP MODULE - REVISED VERSION
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
import { activeCourse, TopicOrWeekInstance, TopicOrWeekItem, onBoardingScreen, InstructorInfo } from "../../../src/functions/types.js";
import { showErrorModal, showHelpModal } from "../modal-overlay.js";

// ===========================================
// UTILITY FUNCTIONS FOR INSTRUCTOR/TA ARRAYS
// ===========================================

/**
 * Helper to check if an array contains a userId (handles both string[] and InstructorInfo[])
 */
function arrayContainsUserId(arr: string[] | InstructorInfo[], userId: string): boolean {
    if (!arr || arr.length === 0) return false;
    return arr.some(item => {
        if (typeof item === 'string') {
            return item === userId;
        } else if (item && item.userId) {
            return item.userId === userId;
        }
        return false;
    });
}

/**
 * Helper to get display name from an item (handles both string and InstructorInfo)
 */
function getDisplayName(item: string | InstructorInfo): string {
    if (typeof item === 'string') {
        return item;
    } else if (item && item.name) {
        return item.name;
    }
    return item?.userId || 'Unknown';
}

/**
 * Helper to add a userId to array (converts to InstructorInfo[] format if needed)
 */
function addUserIdToArray(arr: string[] | InstructorInfo[], userId: string, name?: string): (string | InstructorInfo)[] {
    const result = arr.map(item => {
        if (typeof item === 'string') {
            return { userId: item, name: item }; // Convert old format
        }
        return item;
    });
    
    // Check if already exists
    if (!arrayContainsUserId(result, userId)) {
        result.push({ userId, name: name || userId });
    }
    
    return result;
}

/**
 * Helper to remove a userId from array
 */
function removeUserIdFromArray(arr: string[] | InstructorInfo[], userId: string): (string | InstructorInfo)[] {
    return arr.filter(item => {
        if (typeof item === 'string') {
            return item !== userId;
        } else if (item && item.userId) {
            return item.userId !== userId;
        }
        return true;
    });
}

/**
 * Helper to find index of userId in array
 */
function indexOfUserId(arr: string[] | InstructorInfo[], userId: string): number {
    return arr.findIndex(item => {
        if (typeof item === 'string') {
            return item === userId;
        } else if (item && item.userId) {
            return item.userId === userId;
        }
        return false;
    });
}



// ===========================================
// TYPE DEFINITIONS
// ===========================================

/**
 * Represents the current state of the onboarding process
 */
interface OnboardingState {
    currentStep: number;
    totalSteps: number;
    isValid: boolean;
}

// ===========================================
// DROPDOWN OPTIONS DATA
// ===========================================

/**
 * Available course options for selection
 */
const COURSE_OPTIONS = [
    { value: "", text: "Select a course..." },
    { value: "CHBE 241", text: "CHBE 241 - Material and Energy Balances" },
    { value: "CHBE 251", text: "CHBE 251 - Transport Phenomena I" },
    { value: "MTRL 251", text: "MTRL 251 - Thermodynamics of Materials II" },
    { value: "MTRL 252", text: "MTRL 252 - Materials Engineering Design" },
    { value: "CHBE 344", text: "CHBE 344 - Introduction to Unit Operations" },
    { value: "MTRL 361", text: "MTRL 361 - Modelling of Materials Processes" }
];

/**
 * Available instructor options for selection
 */
const INSTRUCTOR_OPTIONS = [
    { value: "", text: "Select an instructor..." },
    { value: "Dr. S. Alireza Bagherzadeh", text: "Dr. S. Alireza Bagherzadeh" },
    { value: "Dr. Amir M. Dehkhoda", text: "Dr. Amir M. Dehkhoda" },
    { value: "Dr. Jonathan Verrett", text: "Dr. Jonathan Verrett" },
    { value: "Dr. Jane Smith", text: "Dr. Jane Smith" },
    { value: "Dr. John Doe", text: "Dr. John Doe" },
    { value: "Dr. Sarah Johnson", text: "Dr. Sarah Johnson" },
    { value: "Dr. Michael Brown", text: "Dr. Michael Brown" }
];

/**
 * Available teaching assistant options for selection
 */
const TA_OPTIONS = [
    { value: "", text: "Select a teaching assistant..." },
    { value: "Alice Chen", text: "Alice Chen" },
    { value: "Bob Wilson", text: "Bob Wilson" },
    { value: "Carol Davis", text: "Carol Davis" },
    { value: "David Lee", text: "David Lee" },
    { value: "Emma Garcia", text: "Emma Garcia" },
    { value: "Frank Miller", text: "Frank Miller" },
    { value: "Grace Taylor", text: "Grace Taylor" },
    { value: "Henry Anderson", text: "Henry Anderson" }
];

// ===========================================
// UTILITY FUNCTIONS FOR DROPDOWN POPULATION
// ===========================================

/**
 * Populates a select element with options from the provided data
 * 
 * @param selectElement - The select element to populate
 * @param options - Array of option objects with value and text properties
 */
function populateSelectOptions(selectElement: HTMLSelectElement, options: Array<{value: string, text: string}>): void {
    selectElement.innerHTML = '';
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        selectElement.appendChild(optionElement);
    });
}

/**
 * Populates all dropdown elements with their respective options
 */
function populateAllDropdowns(): void {
    // Course dropdowns
    const courseSelects = document.querySelectorAll('#courseSelect, #reviewCourseSelect') as NodeListOf<HTMLSelectElement>;
    courseSelects.forEach(select => {
        populateSelectOptions(select, COURSE_OPTIONS);
    });

    // Instructor dropdowns
    const instructorSelects = document.querySelectorAll('#instructorSelect, #reviewInstructorSelect') as NodeListOf<HTMLSelectElement>;
    instructorSelects.forEach(select => {
        populateSelectOptions(select, INSTRUCTOR_OPTIONS);
    });

    // Teaching Assistant dropdowns
    const taSelects = document.querySelectorAll('#taSelect, #reviewTASelect') as NodeListOf<HTMLSelectElement>;
    taSelects.forEach(select => {
        populateSelectOptions(select, TA_OPTIONS);
    });
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
 * @param instructorCourse - The instructor's course object to be populated
 * @returns Promise<void>
 */
export const renderOnCourseSetup = async (instructorCourse: activeCourse): Promise<void> => {
    console.log("🚀 Starting onboarding process...");
    
    try {
        // Create a copy of the instructor course for temporary state management
        const onBoardingCourse: activeCourse = { ...instructorCourse };
        
        // Initialize onboarding state
        const state: OnboardingState = {
            currentStep: 1,
            totalSteps: 8,
            isValid: false
        };

        // Load the onboarding component
        const container = document.getElementById('main-content-area');
        if (!container) {
            throw new Error("Main content area not found");
        }

        // Add onboarding-active class to hide instructor sidebar
        document.body.classList.add('onboarding-active');

        const html = await loadComponentHTML('course-setup');
        container.innerHTML = html;

        // Wait for DOM to be ready
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }

        // Initialize the onboarding interface
        await initializeOnboarding(state, onBoardingCourse, instructorCourse);

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
 * @param onBoardingCourse - The onboarding course object for temporary state management
 * @param instructorCourse - The original instructor course object (only modified when database is set)
 */
async function initializeOnboarding(state: OnboardingState, onBoardingCourse: activeCourse, instructorCourse: activeCourse): Promise<void> {
    console.log("🔧 Initializing onboarding interface...");

    // Populate all dropdowns with options from TypeScript
    populateAllDropdowns();

    // Set up navigation event listeners
    setupNavigationListeners(state, onBoardingCourse, instructorCourse);
    
    // Set up form event listeners
    setupFormListeners(state, onBoardingCourse);
    
    // Set up review step event listeners
    setupReviewFormListeners(state, onBoardingCourse);
    
    // Set up help button listener
    setupHelpListener(state);
    
    // Set up window resize listener for responsive justify-content
    setupResizeListener(state, onBoardingCourse);
    
    // Initialize the first step
    updateStepDisplay(state, onBoardingCourse);
    
    // Set up step indicators
    updateStepIndicators(state, onBoardingCourse);
    
    console.log("✅ Onboarding interface initialized successfully");
}

/**
 * Sets up window resize listener to recalculate content justification
 * 
 * @param state - The onboarding state object
 * @param onBoardingCourse - The onboarding course object for state synchronization
 */
function setupResizeListener(state: OnboardingState, onBoardingCourse: activeCourse): void {
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
 * @param state - The onboarding state object
 * @param onBoardingCourse - The onboarding course object for temporary state management
 * @param instructorCourse - The original instructor course object (only modified when database is set)
 */
function setupNavigationListeners(state: OnboardingState, onBoardingCourse: activeCourse, instructorCourse: activeCourse): void {
    const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;

    if (backBtn) {
        backBtn.addEventListener('click', () => handleBackNavigation(state, onBoardingCourse));
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => handleNextNavigation(state, onBoardingCourse, instructorCourse));
    }
}

/**
 * Sets up form element event listeners
 * 
 * @param state - The onboarding state object
 */
function setupFormListeners(state: OnboardingState, onBoardingCourse: activeCourse): void {
    // Course selection
    const courseSelect = document.getElementById('courseSelect') as HTMLSelectElement;
    if (courseSelect) {
        courseSelect.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            onBoardingCourse.courseName = target.value;
            updateStepIndicators(state, onBoardingCourse);
        });
    }

    // Instructor selection with add button
    const instructorSelect = document.getElementById('instructorSelect') as HTMLSelectElement;
    const addInstructorBtn = document.getElementById('addInstructorBtn') as HTMLButtonElement;
    if (instructorSelect && addInstructorBtn) {
        const addInstructor = () => {
            const selectedValue = instructorSelect.value;
            if (selectedValue && !arrayContainsUserId(onBoardingCourse.instructors, selectedValue)) {
                // Find the name from options
                const option = INSTRUCTOR_OPTIONS.find(opt => opt.value === selectedValue);
                const name = option ? option.text : selectedValue;
                onBoardingCourse.instructors = addUserIdToArray(onBoardingCourse.instructors, selectedValue, name) as InstructorInfo[];
                updateSelectedItemsDisplay('selectedInstructors', onBoardingCourse.instructors, state, onBoardingCourse);
                updateStepIndicators(state, onBoardingCourse);
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
            if (selectedValue && !arrayContainsUserId(onBoardingCourse.teachingAssistants, selectedValue)) {
                // Find the name from options
                const option = TA_OPTIONS.find(opt => opt.value === selectedValue);
                const name = option ? option.text : selectedValue;
                onBoardingCourse.teachingAssistants = addUserIdToArray(onBoardingCourse.teachingAssistants, selectedValue, name) as InstructorInfo[];
                updateSelectedItemsDisplay('selectedTAs', onBoardingCourse.teachingAssistants, state, onBoardingCourse);
                updateStepIndicators(state, onBoardingCourse);
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
            onBoardingCourse.frameType = target.value as 'byWeek' | 'byTopic';
            updateContentCountDescription(state, onBoardingCourse);
        });
    });

    // Content count input
    const contentCountInput = document.getElementById('contentCount') as HTMLInputElement;
    contentCountInput.value = onBoardingCourse.tilesNumber.toString();
    if (contentCountInput) {
        contentCountInput.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            onBoardingCourse.tilesNumber = parseInt(target.value) || 12;
            updateStepIndicators(state, onBoardingCourse);
        });
    }
}

/**
 * Sets up event listeners for the review step form elements
 * 
 * @param state - The onboarding state object
 */
function setupReviewFormListeners(state: OnboardingState, onBoardingCourse: activeCourse): void {
    // Review course selection
    const reviewCourseSelect = document.getElementById('reviewCourseSelect') as HTMLSelectElement;
    if (reviewCourseSelect) {
        reviewCourseSelect.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            onBoardingCourse.courseName = target.value;
            updateStepIndicators(state, onBoardingCourse);
        });
    }

    // Review instructor selection with add button
    const reviewInstructorSelect = document.getElementById('reviewInstructorSelect') as HTMLSelectElement;
    const reviewAddInstructorBtn = document.getElementById('reviewAddInstructorBtn') as HTMLButtonElement;
    if (reviewInstructorSelect && reviewAddInstructorBtn) {
        const addReviewInstructor = () => {
            const selectedValue = reviewInstructorSelect.value;
            if (selectedValue && !arrayContainsUserId(onBoardingCourse.instructors, selectedValue)) {
                console.log('Adding instructor:', selectedValue);
                // Find the name from options
                const option = INSTRUCTOR_OPTIONS.find(opt => opt.value === selectedValue);
                const name = option ? option.text : selectedValue;
                onBoardingCourse.instructors = addUserIdToArray(onBoardingCourse.instructors, selectedValue, name) as InstructorInfo[];
                updateSelectedItemsDisplay('reviewSelectedInstructors', onBoardingCourse.instructors, state, onBoardingCourse);
                updateStepIndicators(state, onBoardingCourse);
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
            if (selectedValue && !arrayContainsUserId(onBoardingCourse.teachingAssistants, selectedValue)) {
                // Find the name from options
                const option = TA_OPTIONS.find(opt => opt.value === selectedValue);
                const name = option ? option.text : selectedValue;
                onBoardingCourse.teachingAssistants = addUserIdToArray(onBoardingCourse.teachingAssistants, selectedValue, name) as InstructorInfo[];
                updateSelectedItemsDisplay('reviewSelectedTAs', onBoardingCourse.teachingAssistants, state, onBoardingCourse);
                updateStepIndicators(state, onBoardingCourse);
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
            onBoardingCourse.frameType = target.value as 'byWeek' | 'byTopic';
            updateReviewContentCountDescription(state, onBoardingCourse);
        });
    });

    // Review content count input
    const reviewContentCountInput = document.getElementById('reviewContentCount') as HTMLInputElement;
    if (reviewContentCountInput) {
        reviewContentCountInput.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            onBoardingCourse.tilesNumber = parseInt(target.value) || 12;
            updateStepIndicators(state, onBoardingCourse);
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
        7: "Review & Complete",
        8: "Setup Complete"
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
function handleBackNavigation(state: OnboardingState, onBoardingCourse: activeCourse): void {
    if (state.currentStep > 1) {
        state.currentStep--;
        updateStepDisplay(state, onBoardingCourse);
        updateStepIndicators(state, onBoardingCourse);
        updateNavigationButtons(state);
        console.log(`⬅️ Navigated to step ${state.currentStep}`);
    }
}

/**
 * Handles next navigation and final submission
 * 
 * @param state - The onboarding state object
 * @param onBoardingCourse - The onboarding course object for temporary state management
 * @param instructorCourse - The original instructor course object (only modified when database is set)
 */
async function handleNextNavigation(state: OnboardingState, onBoardingCourse: activeCourse, instructorCourse: activeCourse): Promise<void> {
    // Validate current step before proceeding
    if (!(await validateCurrentStep(state, onBoardingCourse))) {
            return;
        } 

    if (state.currentStep < state.totalSteps) {
        // Move to next step
        state.currentStep++; 
        
        // Handle database submission when moving from step 7 (finalization) to step 8 (complete)
        if (state.currentStep === 8) {
            await handleDatabaseSubmission(state, onBoardingCourse, instructorCourse);
        }
        
        updateStepDisplay(state, onBoardingCourse); //
        updateStepIndicators(state, onBoardingCourse);
        updateNavigationButtons(state); //
        
        // Update review content if we're on the final step
        if (state.currentStep === state.totalSteps) {
            updateReviewContent(state, onBoardingCourse);
        }
        
        
        console.log(`➡️ Navigated to step ${state.currentStep}`);
    } else {
        // Final submission
        await handleFinalSubmission(state, onBoardingCourse, instructorCourse);
    }
}

/**
 * Validates the current step before allowing navigation
 * 
 * @param state - The onboarding state object
 * @returns Promise<boolean> indicating if validation passed
 */
async function validateCurrentStep(state: OnboardingState, onBoardingCourse: activeCourse): Promise<boolean> {
    switch (state.currentStep) {
        case 1: // Getting Started - always valid
            return true;
            
        case 2: // Course Name
            if (!onBoardingCourse.courseName) {
                await showErrorModal("Validation Error", "Please select a course name.");
                return false;
            }
            return true;
            
        case 3: // Instructors
            if (onBoardingCourse.instructors.length === 0) {
                await showErrorModal("Validation Error", "Please select at least one instructor.");
                return false;
            }
            return true;
            
        case 4: // Teaching Assistants - optional
            return true;
            
        case 5: // Course Division - always valid (has default)
            return true;
            
        case 6: // Content Count
            if (onBoardingCourse.tilesNumber < 1 || onBoardingCourse.tilesNumber > 52) {
                await showErrorModal("Validation Error", "Please enter a valid number of sections (1-52).");
                return false;
            }
            if (onBoardingCourse.frameType === 'byWeek' && onBoardingCourse.tilesNumber > 14) {
                await showErrorModal("Validation Error", "For weekly organization, please enter 14 weeks or fewer.");
                return false;
            }
            return true;
            
        case 7: // Finalization - validate all fields
            return await validateAllFields(state, onBoardingCourse);
            
        case 8: // Congratulations - always valid
            return true;
            
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
async function validateAllFields(state: OnboardingState, onBoardingCourse: activeCourse): Promise<boolean> {
    if (!onBoardingCourse.courseName) {
        await showErrorModal("Validation Error", "Course name is required.");
        return false;
    }
    
    if (onBoardingCourse.instructors.length === 0) {
        await showErrorModal("Validation Error", "At least one instructor is required.");
        return false;
    }
    
    if (onBoardingCourse.tilesNumber < 1 || onBoardingCourse.tilesNumber > 52) {
        await showErrorModal("Validation Error", "Invalid number of sections.");
        return false;
    }
    
    if (onBoardingCourse.frameType === 'byWeek' && onBoardingCourse.tilesNumber > 14) {
        await showErrorModal("Validation Error", "For weekly organization, maximum 14 weeks allowed.");
        return false;
    }
    
    return true;
}

// ===========================================
// UI UPDATE FUNCTIONS
// ===========================================

/**
 * Updates the display to show the current step and synchronizes all form values
 * 
 * @param state - The onboarding state object
 * @param onBoardingCourse - The onboarding course object for state synchronization
 */
function updateStepDisplay(state: OnboardingState, onBoardingCourse: activeCourse): void {
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
    
    // Synchronize all form values with current state
    synchronizeFormValues(state, onBoardingCourse);
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
 * Synchronizes all form values with the current onboarding course state
 * This ensures that when users navigate between steps, all form elements
 * reflect their most recent selections
 * 
 * @param state - The onboarding state object
 * @param onBoardingCourse - The onboarding course object for state synchronization
 */
function synchronizeFormValues(state: OnboardingState, onBoardingCourse: activeCourse): void {
    // Step 2: Course Name
    const courseSelect = document.getElementById('courseSelect') as HTMLSelectElement;
    if (courseSelect) {
        courseSelect.value = onBoardingCourse.courseName;
    }
    
    // Step 3: Instructors
    updateSelectedItemsDisplay('selectedInstructors', onBoardingCourse.instructors, state, onBoardingCourse);
    
    // Step 4: Teaching Assistants
    updateSelectedItemsDisplay('selectedTAs', onBoardingCourse.teachingAssistants, state, onBoardingCourse);
    
    // Step 5: Course Division
    const divisionRadios = document.querySelectorAll('input[name="division"]') as NodeListOf<HTMLInputElement>;
    divisionRadios.forEach(radio => {
        radio.checked = radio.value === onBoardingCourse.frameType;
    });
    
    // Step 6: Content Count
    const contentCountInput = document.getElementById('contentCount') as HTMLInputElement;
    if (contentCountInput) {
        contentCountInput.value = onBoardingCourse.tilesNumber.toString();
    }
    
    // Update content count description based on division type
    updateContentCountDescription(state, onBoardingCourse);
    
    // Step 7: Review step - synchronize all review form elements
    if (state.currentStep === 7) {
        updateReviewContent(state, onBoardingCourse);
    }
}

/**
 * Updates the step indicators in the left panel
 * 
 * @param state - The onboarding state object
 */
function updateStepIndicators(state: OnboardingState, onBoardingCourse: activeCourse): void {
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
 * Handles both string[] and InstructorInfo[] formats
 * 
 * @param containerId - The ID of the container element
 * @param items - Array of selected items (string[] or InstructorInfo[])
 * @param state - The onboarding state object
 */
function updateSelectedItemsDisplay(containerId: string, items: string[] | InstructorInfo[], state: OnboardingState, onBoardingCourse: activeCourse): void {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    items.forEach(item => {
        const displayName = getDisplayName(item);
        const userId = typeof item === 'string' ? item : item.userId;
        
        const itemElement = document.createElement('div');
        itemElement.className = 'selected-item';
        itemElement.innerHTML = `
            <span>${displayName}</span>
            <button class="remove-btn" data-item="${userId}">×</button>
        `;
        
        // Add remove functionality
        const removeBtn = itemElement.querySelector('.remove-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                removeSelectedItem(containerId, userId, state, onBoardingCourse);
            });
        }
        
        container.appendChild(itemElement);
    });
}

/**
 * Removes a selected item from the display and updates the state
 * 
 * @param containerId - The ID of the container element
 * @param userId - The userId of the item to remove
 * @param state - The onboarding state object
 */
function removeSelectedItem(containerId: string, userId: string, state: OnboardingState, onBoardingCourse: activeCourse): void {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Remove from display
    const itemElements = container.querySelectorAll('.selected-item');
    itemElements.forEach(element => {
        const removeBtn = element.querySelector('.remove-btn');
        if (removeBtn && removeBtn.getAttribute('data-item') === userId) {
            element.remove();
        }
    });
    
    // Update state based on container type
    if (containerId === 'selectedInstructors' || containerId === 'reviewSelectedInstructors') {
        const index = indexOfUserId(onBoardingCourse.instructors, userId);
        if (index > -1) {
            onBoardingCourse.instructors.splice(index, 1);
            updateStepIndicators(state, onBoardingCourse);
        }
    } else if (containerId === 'selectedTAs' || containerId === 'reviewSelectedTAs') {
        const index = indexOfUserId(onBoardingCourse.teachingAssistants, userId);
        if (index > -1) {
            onBoardingCourse.teachingAssistants.splice(index, 1);
            updateStepIndicators(state, onBoardingCourse);
        }
    }
}

/**
 * Updates the content count description based on division type
 * 
 * @param state - The onboarding state object
 * @param onBoardingCourse - The onboarding course object for temporary state management
 */
function updateContentCountDescription(state: OnboardingState, onBoardingCourse: activeCourse): void {
    const descriptionElement = document.getElementById('countDescription');
    if (!descriptionElement) return;
    
    if (onBoardingCourse.frameType === 'byWeek') {
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
function updateReviewContent(state: OnboardingState, onBoardingCourse: activeCourse): void {
    // Update course name dropdown
    const reviewCourseSelect = document.getElementById('reviewCourseSelect') as HTMLSelectElement;
    if (reviewCourseSelect) {
        reviewCourseSelect.value = onBoardingCourse.courseName;
    }
    
    // Update division type radio buttons
    const reviewByWeek = document.getElementById('reviewByWeek') as HTMLInputElement;
    const reviewByTopic = document.getElementById('reviewByTopic') as HTMLInputElement;
    if (reviewByWeek && reviewByTopic) {
        if (onBoardingCourse.frameType === 'byWeek') {
            reviewByWeek.checked = true;
        } else {
            reviewByTopic.checked = true;
        }
    }
    
    // Update content count input
    const reviewContentCountInput = document.getElementById('reviewContentCount') as HTMLInputElement;
    if (reviewContentCountInput) {
        reviewContentCountInput.value = onBoardingCourse.tilesNumber.toString();
    }
    
    // Update instructors display
    updateSelectedItemsDisplay('reviewSelectedInstructors', onBoardingCourse.instructors, state, onBoardingCourse);
    
    // Update teaching assistants display
    updateSelectedItemsDisplay('reviewSelectedTAs', onBoardingCourse.teachingAssistants, state, onBoardingCourse);
    
    // Update content count description
    updateReviewContentCountDescription(state, onBoardingCourse);
}

/**
 * Updates the content count description for review step
 * 
 * @param state - The onboarding state object
 * @param onBoardingCourse - The onboarding course object for temporary state management
 */
function updateReviewContentCountDescription(state: OnboardingState, onBoardingCourse: activeCourse): void {
    const descriptionElement = document.getElementById('reviewCountDescription');
    if (!descriptionElement) return;
    
    if (onBoardingCourse.frameType === 'byWeek') {
        descriptionElement.textContent = 'How many weeks are in your course?';
    } else {
        descriptionElement.textContent = 'How many topics are in your course?';
    }
}

// ===========================================
// FINAL SUBMISSION
// ===========================================

/**
 * Handles database submission when moving from finalization to completion step
 * 
 * @param state - The onboarding state object
 * @param onBoardingCourse - The course data from onboarding
 * @param instructorCourse - The global instructor course object
 */
async function handleDatabaseSubmission(state: OnboardingState, onBoardingCourse: activeCourse, instructorCourse: activeCourse): Promise<void> {
    try {
        console.log("🎯 Starting database submission...");
        
        // Create the course object from onboarding data
        const courseData: activeCourse = {
            id: generateUniqueId(), // remove later
            date: new Date(),
            courseSetup: true,
            contentSetup: false,
            flagSetup: false,
            monitorSetup: false,
            courseName: onBoardingCourse.courseName,
            instructors: onBoardingCourse.instructors,
            teachingAssistants: onBoardingCourse.teachingAssistants,
            frameType: onBoardingCourse.frameType,
            tilesNumber: onBoardingCourse.tilesNumber,
            topicOrWeekInstances: []
        };
        
        // Submit to database
        const submittedCourse = await postCourseToDatabase(courseData);

        console.log("DEBUG #76submittedCourse: ", submittedCourse);
        
        // Update the instructor course global variable (only modified when database is set)
        Object.assign(instructorCourse, submittedCourse);
        
        console.log("✅ Database submission completed successfully!");
        
    } catch (error) {
        console.error("❌ Error during database submission:", error);
        await showErrorModal("Submission Error", "Failed to save course data. Please try again.");
        // Revert to previous step if database submission fails
        state.currentStep = 7;
        updateStepDisplay(state, onBoardingCourse);
        updateStepIndicators(state, onBoardingCourse);
        updateNavigationButtons(state);
    }
}

/**
 * Handles window reset when course setup is complete
 */
function handleWindowReset(): void {
    console.log("🔄 Resetting window for course setup completion...");
    
    // Remove onboarding-active class to show instructor sidebar
    document.body.classList.remove('onboarding-active');
    
    // Dispatch completion event
    window.dispatchEvent(new CustomEvent('onboardingComplete'));
    
    console.log("✅ Window reset completed!");
}

/**
 * Handles the final submission of the onboarding data
 * 
 * @param state - The onboarding state object
 * @param onBoardingCourse - The onboarding course object for temporary state management
 * @param instructorCourse - The original instructor course object (only modified when database is set)
 * @returns Promise<void>
 */
async function handleFinalSubmission(state: OnboardingState, onBoardingCourse: activeCourse, instructorCourse: activeCourse): Promise<void> {
    console.log("🎯 Processing final submission...");
    
    try {
        // The database submission has already been handled in step 8
        // This function now handles the final cleanup and window reset
        
        // Reset the window for course setup completion
        handleWindowReset();
        
        console.log("✅ Final submission completed successfully!");
        
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

        console.log("🎯 Posting course data to database...");
        console.log("courseData: ", courseData);

        // Ensure date is a Date object (it might be a string if loaded from sessionStorage)
        const courseDataToPost = {
            ...courseData,
            date: courseData.date instanceof Date ? courseData.date : new Date(courseData.date)
        };

        const response = await fetch('/api/courses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(courseDataToPost) 
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(`Failed to post course data: ${errorData.error || response.statusText}`);
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


