/**
 * COURSE SELECTION MODULE
 * 
 * Displays available courses and handles course entry
 */

import { GlobalUser } from '../../src/functions/types.js';
import { showConfirmModal, showErrorModal, showSuccessModal, ModalOverlay } from './modal-overlay.js';

// Store current user's affiliation to check if they're an instructor
let currentUserAffiliation: 'student' | 'faculty' | null = null;
// Store globalUser for enrollment modal
let currentGlobalUser: GlobalUser | null = null;

/**
 * Initialize course selection page
 */
async function initializeCourseSelection(): Promise<void> {
    try {
        // console.log('[COURSE-SELECTION] 🚀 Initializing course selection page'); // 🟢 MEDIUM: Initialization - keep for monitoring
        
        // Show loading message
        showLoadingMessage();
        
        // Fetch user data
        const userResponse = await fetch('/auth/current-user');
        if (!userResponse.ok) {
            throw new Error('Failed to fetch user data');
        }
        
        const authData = await userResponse.json();

        if (!authData.authenticated) {
            // console.log('[COURSE-SELECTION] ❌ User not authenticated, redirecting to login');
            window.location.href = '/';
            return;
        }
        
        const { globalUser } = authData;
        
        if (!globalUser) {
            throw new Error('No global user found');
        }
        
        // Store user affiliation to determine if they're an instructor
        currentUserAffiliation = globalUser.affiliation;
        // Store globalUser for enrollment modal
        currentGlobalUser = globalUser;
        
        // Update welcome message with first name only
        const userName = globalUser.name.split(' ')[0]; // Get first name
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = userName;
        }


        // Setup buttons based on affiliation
        setupCourseButtons();
        
        // Fetch course data
        await loadCourses();
        
    } catch (error) {
        console.error('[COURSE-SELECTION] ❌ Error initializing course selection:', error);
        showErrorMessage();
    }
}

/**
 * Load and display available courses
 */
async function loadCourses(): Promise<void> {
    try {
        // console.log('[COURSE-SELECTION] 📚 Loading courses...');

        const container = document.getElementById('course-cards');
        if (!container) return;
        
        // Fetch all courses
        const response = await fetch('/api/courses');
        if (!response.ok) {
            throw new Error('Failed to fetch courses');
        }
        
        const { data: courses } = await response.json();
        // console.log('[COURSE-SELECTION] 📋 Courses fetched:', courses.length);

        // Filter to only show enrolled courses (fixed bug: courses should only show if enrolled)
        const enrolledCourseIds = currentGlobalUser?.coursesEnrolled || [];
        const enrolledCourses = courses.filter((course: any) => {
            return enrolledCourseIds.includes(course.id);
        });

        // console.log('[COURSE-SELECTION] 📋 Enrolled courses:', enrolledCourses.length);

        // Hide loading message
        hideLoadingMessage();
        
        // Hide empty state initially (will show if needed)
        hideEmptyState();
        
        // Handle empty enrolled courses (valid state, not an error)
        if (enrolledCourses.length === 0) {
            showEmptyState();
            return; // Don't throw error, this is a valid state
        }
        
        // Render workspace rows for enrolled courses only
        container.innerHTML = enrolledCourses.map((course: any) => 
            createCourseCard(course)
        ).join('');
        
        // Re-initialize Feather icons for any new icons in the content
        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
        
        // Attach event listeners
        attachCourseCardListeners();

        // console.log('[COURSE-SELECTION] ✅ Course cards rendered');

    } catch (error) {
        console.error('[COURSE-SELECTION] ❌ Error loading courses:', error);
        hideLoadingMessage();
        showErrorMessage();
    }
}

/**
 * Create HTML for a Slack-style workspace row
 */
function createCourseCard(course: any): string {
    // Display instructor names - handles both old format (string[]) and new format (InstructorInfo[])
    const instructorNames = course.instructors?.map((inst: any) => {
        // Handle both old format (string userId) and new format (object with userId and name)
        if (typeof inst === 'string') {
            return inst; // Old format - just show userId for now (can be improved with lookup later)
        } else if (inst && inst.name) {
            return inst.name; // New format - show name
        }
        return inst.userId || 'Unknown';
    }).join(', ') || 'No instructors';
    
    return `
        <div class="workspace-row" data-course-id="${course.id}">
            <div class="workspace-info">
                <div class="workspace-name">${course.courseName}</div>
                <div class="workspace-members">
                    <span class="member-count">${instructorNames}</span>
                </div>
            </div>
            <div class="workspace-action">
                <button class="launch-btn" data-course-id="${course.id}">
                    ENTER CLASS
                </button>
            </div>
        </div>
    `;
}

/**
 * Attach event listeners to workspace rows
 */
function attachCourseCardListeners(): void {
    const buttons = document.querySelectorAll('.launch-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', async (event) => {
            event.stopPropagation(); // Prevent row click
            const courseId = (event.target as HTMLElement).getAttribute('data-course-id');
            if (courseId) {
                await enterCourse(courseId);
            }
        });
    });
    
    // Attach click listeners to restart onboarding buttons
    const restartButtons = document.querySelectorAll('.restart-onboarding-btn');
    
    restartButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            event.stopPropagation(); // Prevent row click
            const courseId = (event.target as HTMLElement).getAttribute('data-course-id');
            const courseName = (event.target as HTMLElement).getAttribute('data-course-name');
            if (courseId && courseName) {
                await restartOnboarding(courseId, courseName);
            }
        });
    });
    
    // Attach click listener to entire row for better UX
    const rows = document.querySelectorAll('.workspace-row');
    rows.forEach(row => {
        row.addEventListener('click', (event) => {
            // Don't trigger if clicking any button (avoid double trigger)
            if (!(event.target as HTMLElement).closest('.launch-btn') &&
                !(event.target as HTMLElement).closest('.restart-onboarding-btn')) {
                const courseId = row.getAttribute('data-course-id');
                if (courseId) {
                    enterCourse(courseId);
                }
            }
        });
    });
    
    // Re-render feather icons for remove buttons
    if (typeof (window as any).feather !== 'undefined') {
        (window as any).feather.replace();
    }
}

/**
 * Enter a selected course
 */
async function enterCourse(courseId: string): Promise<void> {
    try {
        
        // Find and disable only the clicked button
        const clickedButton = document.querySelector(`button.launch-btn[data-course-id="${courseId}"]`);
        if (clickedButton) {
            (clickedButton as HTMLButtonElement).disabled = true;
            clickedButton.textContent = 'ENTERING...';
        }
        
        // Call API to enter course
        const response = await fetch('/api/course/enter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseId })
        });
        
        const data = await response.json();
        
        if (data.error) {
            console.error('[COURSE-SELECTION] ❌ Error entering course:', data.error);
            alert('Failed to enter course. Please try again.');
            
            // Re-enable the clicked button
            const clickedButton = document.querySelector(`button.launch-btn[data-course-id="${courseId}"]`);
            if (clickedButton) {
                (clickedButton as HTMLButtonElement).disabled = false;
                clickedButton.textContent = 'ENTER CLASS';
            }
            return;
        }
        
        // Redirect to appropriate page
        // console.log('[COURSE-SELECTION] ✅ Redirecting to:', data.redirect);
        window.location.href = data.redirect;
        
    } catch (error) {
        console.error('[COURSE-SELECTION] ❌ Error entering course:', error);
        alert('Failed to enter course. Please try again.');
        
        // Re-enable the clicked button
        const clickedButton = document.querySelector(`button.launch-btn[data-course-id="${courseId}"]`);
        if (clickedButton) {
            (clickedButton as HTMLButtonElement).disabled = false;
            clickedButton.textContent = 'ENTER CLASS';
        }
    }
}

/**
 * Restart onboarding by deleting course and related collections
 */
async function restartOnboarding(courseId: string, courseName: string): Promise<void> {
    try {
        // Show confirmation modal
        const confirmationMessage = 
            `Are you sure you want to restart onboarding for "${courseName}"?\n\n` +
            `This will permanently delete:\n` +
            `- The course from active courses\n` +
            `- All user data (${courseName}_users)\n` +
            `- All flag reports (${courseName}_flags)\n\n` +
            `The course will be recreated with empty defaults.\n\n` +
            `This action cannot be undone.`;
        
        const result = await showConfirmModal(
            'Restart Onboarding',
            confirmationMessage,
            'Restart Onboarding',
            'Cancel'
        );
        
        // Check if user confirmed (clicked "Restart Onboarding" button)
        if (result.action !== 'Restart Onboarding') {
            // console.log('[COURSE-SELECTION] 🚫 Restart onboarding cancelled by user');
            return;
        }

        // console.log('[COURSE-SELECTION] 🔄 Restarting onboarding for course:', courseId); // 🟡 HIGH: Course ID exposure
        
        // Find and disable the clicked button
        const clickedButton = document.querySelector(`button.restart-onboarding-btn[data-course-id="${courseId}"]`);
        if (clickedButton) {
            (clickedButton as HTMLButtonElement).disabled = true;
            clickedButton.textContent = 'PROCESSING...';
        }
        
        // Call API to restart onboarding
        const response = await fetch(`/api/courses/${courseId}/restart-onboarding`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            console.error('[COURSE-SELECTION] ❌ Error restarting onboarding:', data.error);
            await showErrorModal(
                'Error',
                `Failed to restart onboarding: ${data.error || 'Unknown error'}`
            );
            
            // Re-enable the clicked button
            if (clickedButton) {
                (clickedButton as HTMLButtonElement).disabled = false;
                clickedButton.textContent = 'RESTART ONBOARDING';
            }
            return;
        }
        
        // Success - reload the page to refresh course list
        // console.log('[COURSE-SELECTION] ✅ Onboarding restarted successfully');
        await showSuccessModal(
            'Success',
            'Onboarding restarted successfully. The page will reload.'
        );
        window.location.reload();
        
    } catch (error) {
        console.error('[COURSE-SELECTION] ❌ Error restarting onboarding:', error);
        await showErrorModal(
            'Error',
            'Failed to restart onboarding. Please try again.'
        );
        
        // Re-enable the clicked button
        const clickedButton = document.querySelector(`button.restart-onboarding-btn[data-course-id="${courseId}"]`);
        if (clickedButton) {
            (clickedButton as HTMLButtonElement).disabled = false;
            clickedButton.textContent = 'RESTART ONBOARDING';
        }
    }
}

/**
 * Remove a course completely (instructor only)
 * REMOVED: Course deletion is now only available from within the course (instructor sidebar)
 */
/*
async function removeCourse(courseId: string, courseName: string): Promise<void> {
    try {
        // Show confirmation modal
        const confirmationMessage = `Are you sure you want to remove the course "${courseName}"?\n\n` +
            `This will permanently delete:\n` +
            `• All enrolled users from this course\n` +
            `• All course data (users, flags, memory-agent collections)\n` +
            `• All documents from the vector database for this course\n` +
            `• The course instance itself\n\n` +
            `This action cannot be undone!`;
        
        const result = await showConfirmModal(
            'Remove Course',
            confirmationMessage,
            'Remove Course',
            'Cancel'
        );
        
        // Check if user confirmed
        if (result.action !== 'Confirm' && result.action !== 'confirm') {
            // console.log('[COURSE-SELECTION] ❌ Course removal cancelled by user');
            return;
        }
        
        // Disable the button during request
        const removeButton = document.querySelector(`button.remove-course-btn[data-course-id="${courseId}"]`) as HTMLButtonElement;
        if (removeButton) {
            removeButton.disabled = true;
            const icon = removeButton.querySelector('i');
            if (icon) {
                icon.setAttribute('data-feather', 'loader');
                if (typeof (window as any).feather !== 'undefined') {
                    (window as any).feather.replace();
                }
            }
        }
        
        // Call the API endpoint
        const response = await fetch(`/api/courses/${courseId}/remove`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to remove course' }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Success - show message and reload page
        await showSuccessModal(
            'Success',
            data.message || 'Course removed successfully. The page will reload.'
        );
        
        // Reload to refresh course list
        window.location.reload();
        
    } catch (error) {
        console.error('[COURSE-SELECTION] ❌ Error removing course:', error);
        await showErrorModal(
            'Error',
            `Failed to remove course: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        
        // Re-enable the button
        const removeButton = document.querySelector(`button.remove-course-btn[data-course-id="${courseId}"]`) as HTMLButtonElement;
        if (removeButton) {
            removeButton.disabled = false;
            const icon = removeButton.querySelector('i');
            if (icon) {
                icon.setAttribute('data-feather', 'trash-2');
                if (typeof (window as any).feather !== 'undefined') {
                    (window as any).feather.replace();
                }
            }
        }
    }
}
*/

/**
 * Handle logout button click
 */
function setupLogoutButton(): void {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                // Logout endpoint expects GET request
                window.location.href = '/auth/logout';
            } catch (error) {
                console.error('Error logging out:', error);
                alert('Failed to logout. Please try again.');
            }
        });
    }
}

/**
 * Show loading message
 */
function showLoadingMessage(): void {
    const loadingElement = document.getElementById('loading-message');
    const errorElement = document.getElementById('error-message');
    
    if (loadingElement) loadingElement.style.display = 'block';
    if (errorElement) errorElement.style.display = 'none';
    
    // Hide empty state when loading
    hideEmptyState();
}

/**
 * Hide loading message
 */
function hideLoadingMessage(): void {
    const loadingElement = document.getElementById('loading-message');
    if (loadingElement) loadingElement.style.display = 'none';
}

/**
 * Show error message
 */
function showErrorMessage(): void {
    const loadingElement = document.getElementById('loading-message');
    const errorElement = document.getElementById('error-message');
    
    if (loadingElement) loadingElement.style.display = 'none';
    if (errorElement) errorElement.style.display = 'block';
    
    // Hide empty state when showing error
    hideEmptyState();
}

/**
 * Show empty state when user has no enrolled courses
 */
function showEmptyState(): void {
    const emptyStateElement = document.getElementById('empty-state');
    const emptyStateMessage = document.getElementById('empty-state-message');
    const container = document.getElementById('course-cards');
    
    if (emptyStateElement && emptyStateMessage) {
        // Set appropriate message based on user affiliation
        if (currentUserAffiliation === 'faculty') {
            emptyStateMessage.textContent = "You're not enrolled in any courses. Create a new course or join an existing one.";
        } else {
            emptyStateMessage.textContent = "You're not enrolled in any courses. Click 'Add New Course' to join a course.";
        }
        
        emptyStateElement.style.display = 'block';
        
        // Re-initialize Feather icons for the empty state icon
        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
    }
    
    // Clear course cards container
    if (container) {
        container.innerHTML = '';
    }
}

/**
 * Hide empty state
 */
function hideEmptyState(): void {
    const emptyStateElement = document.getElementById('empty-state');
    if (emptyStateElement) {
        emptyStateElement.style.display = 'none';
    }
}

/**
 * Setup retry button
 */
function setupRetryButton(): void {
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            initializeCourseSelection();
        });
    }
}

/**
 * Setup course action buttons based on user affiliation
 */
function setupCourseButtons(): void {
    const addNewCourseBtn = document.getElementById('add-new-course-btn');
    const createNewCourseBtn = document.getElementById('create-new-course-btn');
    
    // Show/hide buttons based on affiliation
    if (currentUserAffiliation === 'faculty') {
        // For instructors: show both buttons
        if (addNewCourseBtn) {
            addNewCourseBtn.style.display = 'flex';
        }
        if (createNewCourseBtn) {
            createNewCourseBtn.style.display = 'flex';
        }
        
        // Setup "Add New Course" button - shows enrollment modal
        if (addNewCourseBtn) {
            addNewCourseBtn.addEventListener('click', async () => {
                await showInstructorEnrollmentModal();
            });
        }
        
        // Setup "Create New Course" button - creates new course
        if (createNewCourseBtn) {
            createNewCourseBtn.addEventListener('click', async () => {
                await createNewCourseForInstructor();
            });
        }
    } else if (currentUserAffiliation === 'student') {
        // For students: only show "Add New Course" button
        if (addNewCourseBtn) {
            addNewCourseBtn.style.display = 'flex';
        }
        if (createNewCourseBtn) {
            createNewCourseBtn.style.display = 'none';
        }

        // Setup "Add New Course" button - shows enrollment modal
        if (addNewCourseBtn) {
            addNewCourseBtn.addEventListener('click', async () => {
                await showEnrollmentModal();
            });
        }
    }
    
    // Re-render feather icons for the buttons
    if (typeof (window as any).feather !== 'undefined') {
        (window as any).feather.replace();
    }
}

/**
 * Create a new course object and navigate to instructor mode for onboarding
 * Stores temporary course data in sessionStorage and redirects to new-course onboarding route
 * The course will be created during onboarding, not before
 */
async function createNewCourseForInstructor(): Promise<void> {
    try {
        // console.log('[COURSE-SELECTION] 🚀 Preparing new course onboarding...');

        // Get current user info to include as instructor
        const userResponse = await fetch('/auth/current-user');
        if (!userResponse.ok) {
            throw new Error('Failed to fetch user data');
        }
        
        const authData = await userResponse.json();
        if (!authData.authenticated || !authData.globalUser) {
            throw new Error('User not authenticated');
        }
        
        const currentUser = authData.globalUser;
        
        // Create a temporary course object with all setup flags set to false
        // This will be stored in sessionStorage and loaded by instructor-mode.ts
        // The course will be created in the database during onboarding completion
        const tempCourse: any = {
            id: '', // Will be generated during onboarding when course is created
            date: new Date().toISOString(), // Convert to ISO string for JSON serialization
            courseSetup: false, // This triggers the onboarding
            contentSetup: false,
            flagSetup: false,
            monitorSetup: false,
            courseName: '', // Will be filled during onboarding
            instructors: [{
                userId: currentUser.userId,
                name: currentUser.name
            }], // Include creator
            teachingAssistants: [],
            frameType: 'byWeek', // Default, will be changed during onboarding
            tilesNumber: 12, // Default, will be set during onboarding
            topicOrWeekInstances: []
        };
        
        // Store in sessionStorage (instructor-mode.ts checks for this)
        sessionStorage.setItem('debugCourse', JSON.stringify(tempCourse));

        // console.log('[COURSE-SELECTION] ✅ Temporary course data stored, redirecting to onboarding...');

        // Redirect to new-course onboarding route (no courseId needed)
        window.location.href = '/instructor/onboarding/new-course';
        
    } catch (error) {
        console.error('[COURSE-SELECTION] ❌ Error preparing new course:', error);
        await showErrorModal(
            'Error',
            `Failed to start course creation: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`
        );
    }
}

/**
 * Show enrollment modal for instructors - 6-digit course code entry
 * (Same flow as students; backend handles faculty vs student)
 */
async function showInstructorEnrollmentModal(): Promise<void> {
    await showCourseCodeEntryModal('instructor');
}

/**
 * Show enrollment modal with courses student is not enrolled in
 */
async function showEnrollmentModal(): Promise<void> {
    // For students, show PIN entry modal instead of course list
    await showCourseCodeEntryModal();
}

/**
 * Show course code PIN entry modal
 * @param userType - 'student' or 'instructor' for different instructions and title
 */
async function showCourseCodeEntryModal(userType: 'student' | 'instructor' = 'student'): Promise<void> {
    if (!currentGlobalUser) {
        await showErrorModal('Error', 'User data not available. Please refresh the page.');
        return;
    }
    
    const isInstructor = userType === 'instructor';
    
    // Create modal content with PIN input
    const modalContent = document.createElement('div');
    modalContent.className = 'course-code-entry-modal';
    
    // Instructions
    const instructions = document.createElement('p');
    instructions.className = 'course-code-instructions';
    instructions.textContent = isInstructor
        ? 'Enter the 6-character course code to join as instructor.'
        : 'Enter the 6-character course code provided by your instructor.';
    instructions.style.marginBottom = '1.5rem';
    instructions.style.color = '#666';
    instructions.style.fontSize = '0.9rem';
    modalContent.appendChild(instructions);
    
    // Input container
    const inputContainer = document.createElement('div');
    inputContainer.className = 'course-code-input-container';
    inputContainer.style.marginBottom = '1rem';
    
    // Input field
    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.id = 'courseCodeInput';
    codeInput.className = 'course-code-input';
    codeInput.placeholder = 'XXXXXX';
    codeInput.maxLength = 6;
    codeInput.autocomplete = 'off';
    codeInput.style.textTransform = 'uppercase';
    codeInput.style.textAlign = 'center';
    codeInput.style.fontSize = '1.5rem';
    codeInput.style.letterSpacing = '0.5rem';
    codeInput.style.fontFamily = 'monospace';
    codeInput.style.fontWeight = '600';
    
    // Auto-uppercase and alphanumeric only
    codeInput.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        let value = target.value.toUpperCase();
        // Remove any non-alphanumeric characters
        value = value.replace(/[^A-Z0-9]/g, '');
        target.value = value;
    });
    
    // Handle Enter key
    codeInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && codeInput.value.length === 6) {
            e.preventDefault();
            await handleCourseCodeSubmit(codeInput.value, codeInput);
        }
    });
    
    inputContainer.appendChild(codeInput);
    modalContent.appendChild(inputContainer);
    
    // Error message area
    const errorMessage = document.createElement('div');
    errorMessage.id = 'courseCodeError';
    errorMessage.className = 'course-code-error';
    errorMessage.style.display = 'none';
    errorMessage.style.color = '#dc3545';
    errorMessage.style.fontSize = '0.875rem';
    errorMessage.style.marginTop = '0.5rem';
    errorMessage.style.textAlign = 'center';
    modalContent.appendChild(errorMessage);
    
    // Submit button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'course-code-button-container';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'center';
    buttonContainer.style.marginTop = '1.5rem';
    
    const submitButton = document.createElement('button');
    submitButton.id = 'courseCodeSubmitBtn';
    submitButton.className = 'course-code-submit-btn';
    submitButton.textContent = 'Enter Course';
    submitButton.style.padding = '0.75rem 2rem';
    submitButton.style.backgroundColor = 'var(--color-chbe-green)';
    submitButton.style.color = 'white';
    submitButton.style.border = 'none';
    submitButton.style.borderRadius = '8px';
    submitButton.style.fontSize = '1rem';
    submitButton.style.fontWeight = '600';
    submitButton.style.cursor = 'pointer';
    submitButton.style.transition = 'all 0.2s ease';
    
    submitButton.addEventListener('click', async () => {
        if (codeInput.value.length === 6) {
            await handleCourseCodeSubmit(codeInput.value, codeInput);
        } else {
            showCodeError('Please enter a 6-character course code.');
        }
    });
    
    // Disable submit if input is not 6 characters
    codeInput.addEventListener('input', () => {
        submitButton.disabled = codeInput.value.length !== 6;
        if (codeInput.value.length === 6) {
            submitButton.style.opacity = '1';
            submitButton.style.cursor = 'pointer';
        } else {
            submitButton.style.opacity = '0.6';
            submitButton.style.cursor = 'not-allowed';
        }
        hideCodeError();
    });
    
    // Initial state
    submitButton.disabled = true;
    submitButton.style.opacity = '0.6';
    submitButton.style.cursor = 'not-allowed';
    
    buttonContainer.appendChild(submitButton);
    modalContent.appendChild(buttonContainer);
    
    // Show modal using ModalOverlay
    const modal = new ModalOverlay();
    await modal.show({
        type: 'custom',
        title: isInstructor ? 'Join Course as Instructor' : 'Enter Course Code',
        content: modalContent,
        showCloseButton: true,
        closeOnOverlayClick: true,
        maxWidth: '500px'
    });
    
    // Focus input when modal opens
    setTimeout(() => {
        codeInput.focus();
    }, 100);
}

/**
 * Handle course code submission
 */
async function handleCourseCodeSubmit(courseCode: string, inputElement: HTMLInputElement): Promise<void> {
    const submitButton = document.getElementById('courseCodeSubmitBtn') as HTMLButtonElement;
    const errorMessage = document.getElementById('courseCodeError');
    
    // Disable input and button during request
    inputElement.disabled = true;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Entering...';
    }
    hideCodeError();
    
    try {
        const response = await fetch('/api/course/enter-by-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ courseCode })
        });
        
        const data = await response.json();
        
        if (data.error) {
            console.error('[COURSE-SELECTION] ❌ Error entering course:', data.error);
            showCodeError(data.error || 'Failed to enter course. Please check the code and try again.');
            
            // Re-enable input and button
            inputElement.disabled = false;
            inputElement.focus();
            inputElement.select();
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Enter Course';
            }
            return;
        }
        
        // Success - redirect to appropriate page
        // console.log('[COURSE-SELECTION] ✅ Redirecting to:', data.redirect);
        window.location.href = data.redirect;
        
    } catch (error) {
        console.error('[COURSE-SELECTION] ❌ Error entering course:', error);
        showCodeError('Failed to enter course. Please try again.');
        
        // Re-enable input and button
        inputElement.disabled = false;
        inputElement.focus();
        inputElement.select();
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Enter Course';
        }
    }
}

/**
 * Show error message in course code modal
 */
function showCodeError(message: string): void {
    const errorMessage = document.getElementById('courseCodeError');
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }
}

/**
 * Hide error message in course code modal
 */
function hideCodeError(): void {
    const errorMessage = document.getElementById('courseCodeError');
    if (errorMessage) {
        errorMessage.style.display = 'none';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeCourseSelection();
    setupRetryButton();
    setupLogoutButton();
});

