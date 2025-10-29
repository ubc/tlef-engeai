/**
 * COURSE SELECTION MODULE
 * 
 * Displays available courses and handles course entry
 */

import { GlobalUser } from '../../src/functions/types.js';
import { showConfirmModal, showErrorModal, showSuccessModal } from './modal-overlay.js';

// Store current user's affiliation to check if they're an instructor
let currentUserAffiliation: 'student' | 'faculty' | null = null;

/**
 * Initialize course selection page
 */
async function initializeCourseSelection(): Promise<void> {
    try {
        console.log('[COURSE-SELECTION] 🚀 Initializing course selection page');
        
        // Show loading message
        showLoadingMessage();
        
        // Fetch user data
        const userResponse = await fetch('/auth/current-user');
        if (!userResponse.ok) {
            throw new Error('Failed to fetch user data');
        }
        
        const authData = await userResponse.json();
        
        if (!authData.authenticated) {
            console.log('[COURSE-SELECTION] ❌ User not authenticated, redirecting to login');
            window.location.href = '/';
            return;
        }
        
        const { globalUser } = authData;
        
        if (!globalUser) {
            throw new Error('No global user found');
        }
        
        // Store user affiliation to determine if they're an instructor
        currentUserAffiliation = globalUser.affiliation;
        
        // Update welcome message with first name only
        const userName = globalUser.name.split(' ')[0]; // Get first name
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = userName;
        }
        
        console.log('[COURSE-SELECTION] ✅ User data loaded:', userName, 'Affiliation:', currentUserAffiliation);
        
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
        console.log('[COURSE-SELECTION] 📚 Loading courses...');
        
        const container = document.getElementById('course-cards');
        if (!container) return;
        
        // Fetch all courses
        const response = await fetch('/api/courses');
        if (!response.ok) {
            throw new Error('Failed to fetch courses');
        }
        
        const { data: courses } = await response.json();
        console.log('[COURSE-SELECTION] 📋 Courses fetched:', courses.length);
        
        // Display all courses from the database (no filtering)
        if (courses.length === 0) {
            throw new Error('No available courses found');
        }
        
        // Hide loading message
        hideLoadingMessage();
        
        // Render workspace rows for all courses
        container.innerHTML = courses.map((course: any) => 
            createCourseCard(course)
        ).join('');
        
        // Re-initialize Feather icons for any new icons in the content
        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
        
        // Attach event listeners
        attachCourseCardListeners();
        
        console.log('[COURSE-SELECTION] ✅ Course cards rendered');
        
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
    // Display instructor names instead of avatars
    const instructorNames = course.instructors?.join(', ') || 'No instructors';
    
    // Only show restart onboarding button for instructors (faculty)
    const isInstructor = currentUserAffiliation === 'faculty';
    const restartButton = isInstructor ? `
        <button class="restart-onboarding-btn" data-course-id="${course.id}" data-course-name="${course.courseName}">
            RESTART ONBOARDING
        </button>
    ` : '';
    
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
                ${restartButton}
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
}

/**
 * Enter a selected course
 */
async function enterCourse(courseId: string): Promise<void> {
    try {
        console.log('[COURSE-SELECTION] 🚀 Entering course:', courseId);
        
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
        console.log('[COURSE-SELECTION] ✅ Redirecting to:', data.redirect);
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
            console.log('[COURSE-SELECTION] 🚫 Restart onboarding cancelled by user');
            return;
        }
        
        console.log('[COURSE-SELECTION] 🔄 Restarting onboarding for course:', courseId);
        
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
        console.log('[COURSE-SELECTION] ✅ Onboarding restarted successfully');
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeCourseSelection();
    setupRetryButton();
    setupLogoutButton();
});

