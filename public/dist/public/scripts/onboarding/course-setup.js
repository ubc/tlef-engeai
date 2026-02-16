/**
 * COURSE SETUP MODULE - REVISED VERSION
 *
 * This module handles the complete onboarding flow for instructors setting up their courses.
 * It provides a clean, step-by-step interface with fill-in course name and gentle navigation.
 *
 * FEATURES:
 * - Two-column layout with left steps panel and right content area
 * - Fill-in-the-blank course name input with duplicate prevention
 * - Gentle navigation with fixed button positioning
 * - Comprehensive validation and error handling
 * - Clean, maintainable code structure
 *
 * ONBOARDING STEPS:
 * 1. Getting Started - Welcome message and project credits
 * 2. Course Name - Enter course name (fill-in-the-blank, duplicate check)
 * 3. Course Division - Choose between "By Week" or "By Topic"
 * 4. Content Count - Specify number of sections (1-52)
 * 5. Finalization - Review all selections and complete setup
 * 6. Complete - Congratulations
 *
 * @author: gatahcha (revised)
 * @date: 2025-01-27
 * @version: 3.0.0
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { loadComponentHTML } from "../functions/api.js";
import { showErrorModal, showHelpModal } from "../modal-overlay.js";
// ===========================================
// COURSE DUPLICATE CHECK CACHE
// ===========================================
const CACHE_TTL_MS = 60000;
const courseExistsCache = new Map();
/**
 * Checks if a course with the given name already exists in the database.
 * Uses in-memory cache to avoid excessive API requests.
 *
 * @param courseName - The course name to check
 * @returns Promise<boolean> - true if course exists, false otherwise
 */
function checkCourseExists(courseName) {
    return __awaiter(this, void 0, void 0, function* () {
        const trimmed = courseName.trim();
        if (!trimmed)
            return false;
        const key = trimmed.toLowerCase();
        const cached = courseExistsCache.get(key);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return cached.exists;
        }
        try {
            const response = yield fetch(`/api/courses?name=${encodeURIComponent(trimmed)}`, {
                method: 'GET',
                credentials: 'same-origin'
            });
            const exists = response.ok;
            courseExistsCache.set(key, { exists, timestamp: Date.now() });
            return exists;
        }
        catch (_a) {
            // Network error - fail closed (treat as exists to prevent duplicate creation)
            courseExistsCache.set(key, { exists: true, timestamp: Date.now() });
            return true;
        }
    });
}
/**
 * Updates the course validation message display
 */
function updateCourseValidationMessage(message, isError) {
    const el = document.getElementById('courseValidationMessage');
    if (!el)
        return;
    el.textContent = message;
    el.style.color = isError ? '#dc3545' : '#6c757d';
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
export const renderOnCourseSetup = (instructorCourse) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("🚀 Starting onboarding process...");
    try {
        // Create a copy of the instructor course for temporary state management
        const onBoardingCourse = Object.assign({}, instructorCourse);
        // Initialize onboarding state
        const state = {
            currentStep: 1,
            totalSteps: 6,
            isValid: false
        };
        // Load the onboarding component
        const container = document.getElementById('main-content-area');
        if (!container) {
            throw new Error("Main content area not found");
        }
        // Add onboarding-active class to hide instructor sidebar
        document.body.classList.add('onboarding-active');
        const html = yield loadComponentHTML('course-setup');
        container.innerHTML = html;
        // Wait for DOM to be ready
        yield new Promise(resolve => requestAnimationFrame(resolve));
        if (typeof window.feather !== 'undefined') {
            window.feather.replace();
        }
        // Initialize the onboarding interface
        yield initializeOnboarding(state, onBoardingCourse, instructorCourse);
    }
    catch (error) {
        console.error("❌ Error during onboarding initialization:", error);
        yield showErrorModal("Initialization Error", "Failed to initialize onboarding. Please refresh the page and try again.");
    }
});
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
function initializeOnboarding(state, onBoardingCourse, instructorCourse) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("🔧 Initializing onboarding interface...");
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
    });
}
/**
 * Sets up window resize listener to recalculate content justification
 *
 * @param state - The onboarding state object
 * @param onBoardingCourse - The onboarding course object for state synchronization
 */
function setupResizeListener(state, onBoardingCourse) {
    let resizeTimeout;
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
function setupNavigationListeners(state, onBoardingCourse, instructorCourse) {
    const backBtn = document.getElementById('backBtn');
    const nextBtn = document.getElementById('nextBtn');
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
function setupFormListeners(state, onBoardingCourse) {
    // Course name input (fill-in-the-blank)
    const courseInput = document.getElementById('courseInput');
    if (courseInput) {
        courseInput.addEventListener('input', (e) => {
            const target = e.target;
            onBoardingCourse.courseName = target.value.trim();
            updateCourseValidationMessage('', false);
            updateStepIndicators(state, onBoardingCourse);
        });
        courseInput.addEventListener('change', (e) => {
            const target = e.target;
            onBoardingCourse.courseName = target.value.trim();
            updateStepIndicators(state, onBoardingCourse);
        });
    }
    // Division type selection
    const divisionRadios = document.querySelectorAll('input[name="division"]');
    divisionRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const target = e.target;
            onBoardingCourse.frameType = target.value;
            updateContentCountDescription(state, onBoardingCourse);
        });
    });
    // Content count input
    const contentCountInput = document.getElementById('contentCount');
    contentCountInput.value = onBoardingCourse.tilesNumber.toString();
    if (contentCountInput) {
        contentCountInput.addEventListener('input', (e) => {
            const target = e.target;
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
function setupReviewFormListeners(state, onBoardingCourse) {
    // Review step: course name is read-only display, no listener needed
    // Review division type selection
    const reviewDivisionRadios = document.querySelectorAll('input[name="reviewDivision"]');
    reviewDivisionRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const target = e.target;
            onBoardingCourse.frameType = target.value;
            updateReviewContentCountDescription(state, onBoardingCourse);
        });
    });
    // Review content count input
    const reviewContentCountInput = document.getElementById('reviewContentCount');
    if (reviewContentCountInput) {
        reviewContentCountInput.addEventListener('input', (e) => {
            const target = e.target;
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
function setupHelpListener(state) {
    const helpBtn = document.getElementById('helpBtn');
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
function showStepHelp(stepNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        const helpContent = getStepHelpContent(stepNumber);
        yield showHelpModal(stepNumber, helpContent.title, helpContent.content);
    });
}
/**
 * Gets help content for a specific step from HTML templates
 *
 * @param stepNumber - The step number
 * @returns Object with title and content
 */
function getStepHelpContent(stepNumber) {
    const stepTitles = {
        1: "Getting Started",
        2: "Course Name",
        3: "Course Organization",
        4: "Content Count",
        5: "Review & Complete",
        6: "Setup Complete"
    };
    // Get content from HTML template
    const helpElement = document.getElementById(`help-step-${stepNumber}`);
    const content = helpElement ? helpElement.innerHTML : "<p>No help content available for this step.</p>";
    return {
        title: stepTitles[stepNumber] || "Help",
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
function handleBackNavigation(state, onBoardingCourse) {
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
function handleNextNavigation(state, onBoardingCourse, instructorCourse) {
    return __awaiter(this, void 0, void 0, function* () {
        // Validate current step before proceeding
        if (!(yield validateCurrentStep(state, onBoardingCourse))) {
            return;
        }
        if (state.currentStep < state.totalSteps) {
            // Move to next step
            state.currentStep++;
            // Handle database submission when moving from step 5 (finalization) to step 6 (complete)
            if (state.currentStep === 6) {
                yield handleDatabaseSubmission(state, onBoardingCourse, instructorCourse);
            }
            updateStepDisplay(state, onBoardingCourse);
            updateStepIndicators(state, onBoardingCourse);
            updateNavigationButtons(state);
            // Update review content when entering final step
            if (state.currentStep === state.totalSteps) {
                updateReviewContent(state, onBoardingCourse);
            }
            console.log(`➡️ Navigated to step ${state.currentStep}`);
        }
        else {
            // Final submission
            yield handleFinalSubmission(state, onBoardingCourse, instructorCourse);
        }
    });
}
/**
 * Validates the current step before allowing navigation
 *
 * @param state - The onboarding state object
 * @returns Promise<boolean> indicating if validation passed
 */
function validateCurrentStep(state, onBoardingCourse) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        switch (state.currentStep) {
            case 1: // Getting Started - always valid
                return true;
            case 2: // Course Name
                // Check both the course object and the current input value to handle timing issues
                const courseInput = document.getElementById('courseInput');
                const currentInputValue = ((_a = courseInput === null || courseInput === void 0 ? void 0 : courseInput.value) === null || _a === void 0 ? void 0 : _a.trim()) || '';
                const courseNameValue = ((_b = onBoardingCourse.courseName) === null || _b === void 0 ? void 0 : _b.trim()) || '';
                if (!currentInputValue && !courseNameValue) {
                    console.log("DEBUG #431: currentInputValue: ", currentInputValue);
                    console.log("DEBUG #432: courseNameValue: ", courseNameValue);
                    console.log("DEBUG #433: onBoardingCourse.courseName: ", onBoardingCourse.courseName);
                    updateCourseValidationMessage("Please enter a course name.", true);
                    yield showErrorModal("Validation Error", "Please enter a course name.");
                    return false;
                }
                // Ensure the course object is updated with the current input value
                if (currentInputValue && currentInputValue !== courseNameValue) {
                    onBoardingCourse.courseName = currentInputValue;
                }
                // Check if course already exists (duplicate prevention)
                const exists = yield checkCourseExists(onBoardingCourse.courseName);
                if (exists) {
                    updateCourseValidationMessage("This course has already been initiated.", true);
                    yield showErrorModal("Course Already Initiated", "This course has already been initiated in the system. Please choose a different course name or contact support.");
                    return false;
                }
                updateCourseValidationMessage('', false);
                return true;
            case 3: // Course Division - always valid (has default)
                return true;
            case 4: // Content Count
                if (onBoardingCourse.tilesNumber < 1 || onBoardingCourse.tilesNumber > 52) {
                    yield showErrorModal("Validation Error", "Please enter a valid number of sections (1-52).");
                    return false;
                }
                if (onBoardingCourse.frameType === 'byWeek' && onBoardingCourse.tilesNumber > 14) {
                    yield showErrorModal("Validation Error", "For weekly organization, please enter 14 weeks or fewer.");
                    return false;
                }
                return true;
            case 5: // Finalization - validate all fields
                return yield validateAllFields(state, onBoardingCourse);
            case 6: // Congratulations - always valid
                return true;
            default:
                return true;
        }
    });
}
/**
 * Validates all fields for final submission
 *
 * @param state - The onboarding state object
 * @returns Promise<boolean> indicating if all validations passed
 */
function validateAllFields(state, onBoardingCourse) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!((_a = onBoardingCourse.courseName) === null || _a === void 0 ? void 0 : _a.trim())) {
            yield showErrorModal("Validation Error", "Course name is required.");
            return false;
        }
        if (onBoardingCourse.tilesNumber < 1 || onBoardingCourse.tilesNumber > 52) {
            yield showErrorModal("Validation Error", "Invalid number of sections.");
            return false;
        }
        if (onBoardingCourse.frameType === 'byWeek' && onBoardingCourse.tilesNumber > 14) {
            yield showErrorModal("Validation Error", "For weekly organization, maximum 14 weeks allowed.");
            return false;
        }
        return true;
    });
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
function updateStepDisplay(state, onBoardingCourse) {
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
function adjustContentJustification(contentStepElement) {
    const contentStepInner = contentStepElement.querySelector('.content-step-inner');
    if (!contentStepInner)
        return;
    // Get the available height (viewport height minus navigation and padding)
    const availableHeight = window.innerHeight - 200; // Account for navigation and margins
    // Get the content height
    const contentHeight = contentStepInner.scrollHeight;
    // If content is taller than available space, use flex-start for scrolling
    // Otherwise, use center for better visual balance
    if (contentHeight > availableHeight) {
        contentStepElement.classList.add('overflow-content');
        contentStepElement.classList.remove('center-content');
    }
    else {
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
function synchronizeFormValues(state, onBoardingCourse) {
    // Step 2: Course Name
    const courseInput = document.getElementById('courseInput');
    if (courseInput) {
        courseInput.value = onBoardingCourse.courseName || '';
    }
    // Step 3: Course Division
    const divisionRadios = document.querySelectorAll('input[name="division"]');
    divisionRadios.forEach(radio => {
        radio.checked = radio.value === onBoardingCourse.frameType;
    });
    // Step 4: Content Count
    const contentCountInput = document.getElementById('contentCount');
    if (contentCountInput) {
        contentCountInput.value = onBoardingCourse.tilesNumber.toString();
    }
    // Update content count description based on division type
    updateContentCountDescription(state, onBoardingCourse);
    // Step 5: Review step - synchronize all review form elements
    if (state.currentStep === 5) {
        updateReviewContent(state, onBoardingCourse);
    }
}
/**
 * Updates the step indicators in the left panel
 *
 * @param state - The onboarding state object
 */
function updateStepIndicators(state, onBoardingCourse) {
    const stepItems = document.querySelectorAll('.step-item');
    stepItems.forEach((item, index) => {
        const stepNumber = index + 1;
        const stepCircle = item.querySelector('.step-circle');
        const stepLine = item.querySelector('.step-line');
        if (stepCircle) {
            stepCircle.className = 'step-circle';
            if (stepNumber < state.currentStep) {
                stepCircle.classList.add('completed');
            }
            else if (stepNumber === state.currentStep) {
                stepCircle.classList.add('current');
            }
            else {
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
function updateNavigationButtons(state) {
    const backBtn = document.getElementById('backBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (backBtn) {
        backBtn.style.display = state.currentStep > 1 ? 'flex' : 'none';
    }
    if (nextBtn) {
        if (state.currentStep === state.totalSteps) {
            nextBtn.textContent = 'Complete Setup';
        }
        else {
            nextBtn.textContent = 'Next';
        }
    }
}
/**
 * Updates the content count description based on division type
 *
 * @param state - The onboarding state object
 * @param onBoardingCourse - The onboarding course object for temporary state management
 */
function updateContentCountDescription(state, onBoardingCourse) {
    const descriptionElement = document.getElementById('countDescription');
    if (!descriptionElement)
        return;
    if (onBoardingCourse.frameType === 'byWeek') {
        descriptionElement.textContent = 'How many weeks are in your course?';
    }
    else {
        descriptionElement.textContent = 'How many topics are in your course?';
    }
}
/**
 * Updates the review content on the final step
 *
 * @param state - The onboarding state object
 */
function updateReviewContent(state, onBoardingCourse) {
    // Update course name read-only display
    const reviewCourseName = document.getElementById('reviewCourseName');
    if (reviewCourseName) {
        reviewCourseName.textContent = onBoardingCourse.courseName || '';
    }
    // Update division type radio buttons
    const reviewByWeek = document.getElementById('reviewByWeek');
    const reviewByTopic = document.getElementById('reviewByTopic');
    if (reviewByWeek && reviewByTopic) {
        if (onBoardingCourse.frameType === 'byWeek') {
            reviewByWeek.checked = true;
        }
        else {
            reviewByTopic.checked = true;
        }
    }
    // Update content count input
    const reviewContentCountInput = document.getElementById('reviewContentCount');
    if (reviewContentCountInput) {
        reviewContentCountInput.value = onBoardingCourse.tilesNumber.toString();
    }
    // Update content count description
    updateReviewContentCountDescription(state, onBoardingCourse);
}
/**
 * Updates the content count description for review step
 *
 * @param state - The onboarding state object
 * @param onBoardingCourse - The onboarding course object for temporary state management
 */
function updateReviewContentCountDescription(state, onBoardingCourse) {
    const descriptionElement = document.getElementById('reviewCountDescription');
    if (!descriptionElement)
        return;
    if (onBoardingCourse.frameType === 'byWeek') {
        descriptionElement.textContent = 'How many weeks are in your course?';
    }
    else {
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
function handleDatabaseSubmission(state, onBoardingCourse, instructorCourse) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("🎯 Starting database submission...");
            // Create the course object from onboarding data
            // Instructors/TAs are empty - backend adds the authenticated creator as instructor
            const courseData = {
                id: generateUniqueId(), // remove later
                date: new Date(),
                courseSetup: true,
                contentSetup: false,
                flagSetup: false,
                monitorSetup: false,
                courseName: onBoardingCourse.courseName,
                instructors: [],
                teachingAssistants: [],
                frameType: onBoardingCourse.frameType,
                tilesNumber: onBoardingCourse.tilesNumber,
                topicOrWeekInstances: []
            };
            // Submit to database
            const submittedCourse = yield postCourseToDatabase(courseData);
            // console.log("DEBUG #76submittedCourse: ", submittedCourse); // 🟡 HIGH: Exposes submitted course data
            // Update the instructor course global variable (only modified when database is set)
            Object.assign(instructorCourse, submittedCourse);
            console.log("✅ Database submission completed successfully!");
        }
        catch (error) {
            console.error("❌ Error during database submission:", error);
            yield showErrorModal("Submission Error", "Failed to save course data. Please try again.");
            // Revert to previous step if database submission fails
            state.currentStep = 5;
            updateStepDisplay(state, onBoardingCourse);
            updateStepIndicators(state, onBoardingCourse);
            updateNavigationButtons(state);
        }
    });
}
/**
 * Handles window reset when course setup is complete
 */
function handleWindowReset() {
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
function handleFinalSubmission(state, onBoardingCourse, instructorCourse) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("🎯 Processing final submission...");
        try {
            // The database submission has already been handled in step 6
            // This function now handles the final cleanup and window reset
            // Reset the window for course setup completion
            handleWindowReset();
            console.log("✅ Final submission completed successfully!");
        }
        catch (error) {
            console.error("❌ Error during final submission:", error);
            yield showErrorModal("Submission Error", "Failed to complete setup. Please try again.");
        }
    });
}
/**
 * Posts the course data to the database
 *
 * @param courseData - The course data to submit
 * @returns Promise<activeCourse>
 */
function postCourseToDatabase(courseData) {
    return __awaiter(this, void 0, void 0, function* () {
        // console.log("🎯 Posting course data to database..."); // 🟢 MEDIUM: Debug info - keep for monitoring
        // console.log("courseData: ", courseData); // 🟡 HIGH: Exposes complete course configuration data
        // Ensure date is a Date object (it might be a string if loaded from sessionStorage)
        const courseDataToPost = Object.assign(Object.assign({}, courseData), { date: courseData.date instanceof Date ? courseData.date : new Date(courseData.date) });
        const response = yield fetch('/api/courses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(courseDataToPost)
        });
        if (!response.ok) {
            const errorData = yield response.json().catch(() => ({ error: response.statusText }));
            throw new Error(`Failed to post course data: ${errorData.error || response.statusText}`);
        }
        const result = yield response.json();
        return result.data;
    });
}
// ===========================================
// UTILITY FUNCTIONS
// ===========================================
/**
 * Generates a unique ID for the course
 *
 * @returns string - A unique identifier
 */
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
