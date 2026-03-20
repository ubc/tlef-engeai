// public/scripts/entry/course-selection.ts

/**
 * course-selection.ts
 * 
 * @author: @gatahcha
 * @date: 2026-03-07
 * @latest app version: 1.2.9.9
 * @description: Displays available courses, handles course entry by ID or code, new course creation for instructors, enrollment modals.
 */

import { GlobalUser } from '../types.js';
import { showConfirmModal, 
    showErrorModal, 
    showSuccessModal, 
    showInactivityWarningModal, 
    showInputModal,
    ModalOverlay 
} from '../ui/modal-overlay.js';
import { inactivityTracker } from '../services/inactivity-tracker.js';
import { authService } from '../services/auth-service.js';

// Store current user's affiliation to check if they're an instructor
let currentUserAffiliation: 'student' | 'faculty' | null = null;
// Store globalUser for enrollment modal
let currentGlobalUser: GlobalUser | null = null;

/**
 * initializeCourseSelection
 * @returns Promise<void>
 * Fetches user data, sets up course buttons by affiliation, loads enrolled courses. Redirects to login if unauthenticated.
 */
async function initializeCourseSelection(): Promise<void> {
    try {
        
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
 * loadCourses
 * 
 * @returns Promise<void>
 * GET /api/courses. Filters to enrolled courses only, renders course cards, attaches listeners. Shows empty state if none.
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

/** Instructor names to exclude from display (e.g. dev team members) */
const EXCLUDED_INSTRUCTOR_NAMES = ['Charisma Rusdiyanto', 'Richard Tape'];

/**
 * createCourseCard
 * 
 * @param course any — Course object (id, courseName, instructors, etc.)
 * @returns string — HTML for workspace row with course name, instructors, enter/restart buttons
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
    }).filter((name: string) => !EXCLUDED_INSTRUCTOR_NAMES.includes(name)).join(', ') || 'No instructors';
    
    return `
        <div class="workspace-row" data-course-id="${course.id}">
            <div class="workspace-info">
                <div class="workspace-name">${course.courseName}</div>
                <div class="workspace-members">
                    <span class="member-count">${instructorNames}</span>
                </div>
            </div>
            <div class="workspace-action">
                <button class="launch-btn" data-course-id="${course.id}" aria-label="Enter course" title="Enter course">
                    <i data-feather="log-in"></i>
                    <span class="btn-text">ENTER CLASS</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * attachCourseCardListeners
 * 
 * @returns void
 * Binds click handlers to launch-btn, restart-onboarding-btn, and workspace-row for enter/restart actions.
 */
function attachCourseCardListeners(): void {
    const buttons = document.querySelectorAll('.launch-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', async (event) => {
            event.stopPropagation(); // Prevent row click
            const courseId = (event.currentTarget as HTMLElement).getAttribute('data-course-id');
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
        row.addEventListener('click', async (event) => {
            // Don't trigger if clicking any button (avoid double trigger)
            if (!(event.target as HTMLElement).closest('.launch-btn') &&
                !(event.target as HTMLElement).closest('.restart-onboarding-btn')) {
                const courseId = (event.currentTarget as HTMLElement).getAttribute('data-course-id');
                if (courseId) {
                    await enterCourse(courseId);
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
 * enterCourse
 * 
 * @param courseId string — ID of the course to enter
 * @returns Promise<void>
 * POST /api/course/enter. Redirects to instructor or student view based on user role.
 */
async function enterCourse(courseId: string): Promise<void> {
    try {
        
        // Find and disable only the clicked button
        const clickedButton = document.querySelector(`button.launch-btn[data-course-id="${courseId}"]`);
        if (clickedButton) {
            (clickedButton as HTMLButtonElement).disabled = true;
            clickedButton.innerHTML = '<i data-feather="loader"></i><span class="btn-text">ENTERING...</span>';
            if (typeof (window as any).feather !== 'undefined') {
                (window as any).feather.replace();
            }
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
                clickedButton.innerHTML = '<i data-feather="log-in"></i><span class="btn-text">ENTER CLASS</span>';
                if (typeof (window as any).feather !== 'undefined') {
                    (window as any).feather.replace();
                }
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
            clickedButton.innerHTML = '<i data-feather="log-in"></i><span class="btn-text">ENTER CLASS</span>';
            if (typeof (window as any).feather !== 'undefined') {
                (window as any).feather.replace();
            }
        }
    }
}

/**
 * restartOnboarding
 * 
 * @param courseId string — ID of the course
 * @param courseName string — Course name for confirmation message
 * @returns Promise<void>
 * DELETE /api/courses/:id/restart-onboarding. Shows confirmation modal; reloads page on success.
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
 * Initialize inactivity tracking for course selection page
 * Shows countdown warning modal at 4 min idle, logs out at 5 min
 */
/**
 * initializeInactivityTracking
 * 
 * @returns void
 * Sets up inactivityTracker warning and logout events. Shows modal on warning; redirects on timeout.
 */
function initializeInactivityTracking(): void {
    inactivityTracker.on('warning', async (data: any) => {
        inactivityTracker.pause();

        const remainingSeconds = Math.floor((data.remainingTimeUntilLogout || 60000) / 1000);
        const result = await showInactivityWarningModal(remainingSeconds, () => {
            inactivityTracker.reset();
        });

        inactivityTracker.resume();

        if (result.action === 'timeout') {
            inactivityTracker.stop();
            authService.logout();
            return;
        }
    });

    inactivityTracker.on('logout', async () => {
        inactivityTracker.stop();

        try {
            await showConfirmModal(
                'Session Expired',
                'You have been inactive for too long. You will be logged out now.',
                'OK',
                ''
            );
        } catch (error) {
            console.warn('[COURSE-SELECTION] ⚠️ Could not show logout modal:', error);
        }

        authService.logout();
    });

    inactivityTracker.start();
}

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
 * setupCourseButtons
 * 
 * @returns void
 * Shows add-new-course and create-new-course buttons by affiliation. Faculty: both; student: add-new only.
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
 * createNewCourseForInstructor
 *
 * @returns Promise<void>
 * Goes directly to course setup. Skip modal is shown after course-setup completes (in instructor-mode).
 */
async function createNewCourseForInstructor(): Promise<void> {
    try {
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

        // Go directly to course setup - skip modal appears after course-setup completes
        const tempCourse: any = {
            id: '',
            date: new Date().toISOString(),
            courseSetup: false,
            contentSetup: false,
            flagSetup: false,
            monitorSetup: false,
            courseName: '',
            instructors: [{ userId: currentUser.userId, name: currentUser.name }],
            teachingAssistants: [],
            frameType: 'byWeek',
            tilesNumber: 12,
            topicOrWeekInstances: []
        };
        
        sessionStorage.setItem('debugCourse', JSON.stringify(tempCourse));
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
 * showInstructorEnrollmentModal
 * 
 * @returns Promise<void>
 * Opens course code entry modal for instructors. Same flow as students; backend handles faculty vs student.
 */
async function showInstructorEnrollmentModal(): Promise<void> {
    await showCourseCodeEntryModal('instructor');
}

/**
 * showEnrollmentModal
 * 
 * @returns Promise<void>
 * Opens course code entry modal for students to join by 6-char PIN.
 */
async function showEnrollmentModal(): Promise<void> {
    // For students, show PIN entry modal instead of course list
    await showCourseCodeEntryModal();
}

/**
 * showCourseCodeEntryModal
 * 
 * @param userType 'student' | 'instructor' — Affects modal title and instructions (default: student)
 * @returns Promise<void>
 * Renders modal with 6-char PIN input. POST /api/course/enter-by-code on submit.
 */
async function showCourseCodeEntryModal(userType: 'student' | 'instructor' = 'student'): Promise<void> {
    if (!currentGlobalUser) {
        await showErrorModal('Error', 'User data not available. Please refresh the page.');
        return;
    }
    
    const isInstructor = userType === 'instructor';
    const modal = new ModalOverlay();
    
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
            await handleCourseCodeSubmit(codeInput.value, codeInput, modal);
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
            await handleCourseCodeSubmit(codeInput.value, codeInput, modal);
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
 * handleCourseCodeSubmit
 * 
 * @param courseCode string — 6-character course PIN
 * @param inputElement HTMLInputElement — Input field (disabled during request)
 * @param courseCodeModal ModalOverlay — Optional; closed before showing skip modal for clearer UX
 * @returns Promise<void>
 * POST /api/course/enter-by-code. Redirects on success; shows error in modal on failure.
 */
async function handleCourseCodeSubmit(courseCode: string, inputElement: HTMLInputElement, courseCodeModal?: ModalOverlay): Promise<void> {
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
        
        // Skip onboarding: if requires onboarding and user has completed before, offer skip
        // Close course code modal first so skip modal is clearly visible (displayed after code validated)
        const courseId = data.courseId || data.courseUser?.courseId || data.redirect?.match(/\/course\/([^/]+)\//)?.[1];
        const isStudentOnboardingRedirect = data.redirect?.includes('/student/onboarding/');
        const isInstructorOnboardingRedirect = data.redirect?.includes('/instructor/onboarding/');
        const showStudentSkip = data.requiresOnboarding && data.studentOnboardingCompleted === true && isStudentOnboardingRedirect && currentGlobalUser;
        const showInstructorSkip = data.requiresOnboarding && data.instructorOnboardingCompleted === true && isInstructorOnboardingRedirect && currentGlobalUser && courseId;

        if ((showStudentSkip || showInstructorSkip) && courseCodeModal) {
            courseCodeModal.close('success');
        }

        // Student skip: requires onboarding + completed student onboarding before
        if (showStudentSkip) {
            const skipResult = await showConfirmModal(
                'Skip Onboarding?',
                "You've completed student onboarding before. Skip for this course?",
                'Skip',
                'Show Onboarding'
            );

            if (skipResult.action === 'confirm' && currentGlobalUser) {
                const updateRes = await fetch('/api/user/update-onboarding', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        userId: currentGlobalUser.userId,
                        courseName: data.courseName,
                        userOnboarding: true
                    })
                });
                const updateData = await updateRes.json();
                if (updateData.success && courseId) {
                    window.location.href = `/course/${courseId}/student`;
                    return;
                }
            }
        }
        // Instructor skip: requires onboarding + completed instructor onboarding before
        else if (showInstructorSkip) {
            const skipResult = await showConfirmModal(
                'Skip Setup?',
                "You've completed instructor setup before. Skip the full setup for this course?",
                'Skip',
                'Full Setup'
            );

            if (skipResult.action === 'confirm') {
                const updateRes = await fetch(`/api/courses/${courseId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        courseSetup: true,
                        contentSetup: true,
                        flagSetup: true,
                        monitorSetup: true
                    })
                });
                const updateData = await updateRes.json();
                if (updateData.success) {
                    window.location.href = `/course/${courseId}/instructor/documents`;
                    return;
                }
            }
        }

        // Success - redirect to appropriate page
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
    initializeInactivityTracking();
    setupRetryButton();
    setupLogoutButton();
});

