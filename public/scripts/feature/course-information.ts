/**
 * COURSE INFORMATION MODULE
 *
 * This module handles the display of course information for instructors.
 * All elements are read-only; instructors and TAs are managed through a separate feature.
 *
 * FEATURES:
 * - Display current course information in read-only form
 * - Course name, instructors, TAs, organization type, and section count are all non-editable
 * - Copy course code functionality
 *
 * @author: gatahcha
 * @date: 2025-01-29
 * @version: 3.0.0
 */

import { activeCourse, InstructorInfo } from "../../../src/functions/types.js";
import { showErrorModal } from "../modal-overlay.js";
import { renderFeatherIcons } from "../functions/api.js";

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

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

/** Instructor names to exclude from display (e.g. dev team members) */
const EXCLUDED_INSTRUCTOR_NAMES = ['Charisma Rusdiyanto', 'Richard Tape'];

/**
 * Formats an array of instructors/TAs as a comma-separated string for display
 */
function formatNamesForDisplay(arr: string[] | InstructorInfo[]): string {
    if (!arr || arr.length === 0) return 'None';
    return arr.map(item => getDisplayName(item)).join(', ');
}

/**
 * Formats instructors for display, excluding dev team members
 */
function formatInstructorsForDisplay(arr: string[] | InstructorInfo[]): string {
    if (!arr || arr.length === 0) return 'None';
    const names = arr
        .map(item => getDisplayName(item))
        .filter(name => !EXCLUDED_INSTRUCTOR_NAMES.includes(name));
    return names.length > 0 ? names.join(', ') : 'None';
}

/**
 * Updates the content count description based on division type
 */
function updateContentCountDescription(frameType: 'byWeek' | 'byTopic'): void {
    const descriptionElement = document.getElementById('courseInfoCountDescription');
    if (!descriptionElement) return;

    if (frameType === 'byWeek') {
        descriptionElement.textContent = 'How many weeks are in your course?';
    } else {
        descriptionElement.textContent = 'How many topics are in your course?';
    }
}

// ===========================================
// MAIN EXPORT FUNCTION
// ===========================================

/**
 * Initializes the course information page with current course data.
 * All elements are read-only; no editing or save functionality.
 *
 * @param currentClass - The current active course object
 */
export const initializeCourseInformation = async (currentClass: activeCourse): Promise<void> => {
    // console.log("🔧 Initializing course information page...");

    try {
        // Course name (read-only)
        const courseNameEl = document.getElementById('courseInfoCourseName');
        if (courseNameEl) {
            courseNameEl.textContent = currentClass.courseName || 'Not set';
        }

        // Instructors (read-only, empty if none)
        const instructorsEl = document.getElementById('courseInfoInstructors');
        if (instructorsEl) {
            instructorsEl.textContent = formatInstructorsForDisplay(currentClass.instructors || []);
        }

        // Teaching Assistants (read-only, empty if none)
        const tasEl = document.getElementById('courseInfoTAs');
        if (tasEl) {
            tasEl.textContent = formatNamesForDisplay(currentClass.teachingAssistants || []);
        }

        // Course organization (read-only radios - display only)
        const byWeekRadio = document.getElementById('courseInfoByWeek') as HTMLInputElement;
        const byTopicRadio = document.getElementById('courseInfoByTopic') as HTMLInputElement;
        if (byWeekRadio && byTopicRadio) {
            if (currentClass.frameType === 'byWeek') {
                byWeekRadio.checked = true;
            } else {
                byTopicRadio.checked = true;
            }
        }

        // Content count (read-only)
        const contentCountInput = document.getElementById('courseInfoContentCount') as HTMLInputElement;
        if (contentCountInput) {
            contentCountInput.value = (currentClass.tilesNumber ?? 0).toString();
        }

        updateContentCountDescription(currentClass.frameType);

        // Display course code
        const courseCodeDisplay = document.getElementById('courseCodeDisplay');
        if (courseCodeDisplay) {
            if (currentClass.courseCode) {
                courseCodeDisplay.textContent = currentClass.courseCode;
            } else {
                courseCodeDisplay.textContent = 'Not Set';
                courseCodeDisplay.style.color = '#999';
                // console.warn('[COURSE-INFO] ⚠️ Course code not found for course:', currentClass.courseName); // 🟡 HIGH: Course name exposure
            }
        }

        // Setup copy button functionality
        const copyCodeBtn = document.getElementById('copyCourseCodeBtn');
        if (copyCodeBtn && currentClass.courseCode) {
            copyCodeBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(currentClass.courseCode!);
                    // console.log('[COURSE-INFO] ✅ Course code copied to clipboard');

                    // Show visual feedback
                    const originalHTML = copyCodeBtn.innerHTML;
                    copyCodeBtn.innerHTML = '<i data-feather="check"></i>';
                    copyCodeBtn.style.backgroundColor = '#28a745';

                    // Re-render feather icon
                    if (typeof (window as any).feather !== 'undefined') {
                        (window as any).feather.replace();
                    }

                    // Reset after 2 seconds
                    setTimeout(() => {
                        copyCodeBtn.innerHTML = originalHTML;
                        copyCodeBtn.style.backgroundColor = '';
                        if (typeof (window as any).feather !== 'undefined') {
                            (window as any).feather.replace();
                        }
                    }, 2000);
                } catch (error) {
                    // console.error('[COURSE-INFO] ❌ Failed to copy course code:', error);
                    await showErrorModal('Copy Failed', 'Failed to copy course code to clipboard. Please try again.');
                }
            });
        } else if (copyCodeBtn && !currentClass.courseCode) {
            // Disable copy button if no course code
            (copyCodeBtn as HTMLButtonElement).disabled = true;
            (copyCodeBtn as HTMLButtonElement).style.opacity = '0.5';
            (copyCodeBtn as HTMLButtonElement).style.cursor = 'not-allowed';
        }

        // Handle back button click
        const backBtn = document.getElementById('course-info-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                // console.log('[COURSE-INFO] 🔙 Back button clicked');
                window.dispatchEvent(new CustomEvent('course-info-closed'));
            });
            // console.log('[COURSE-INFO] ✅ Back button listener attached');
        }

        // Render feather icons
        renderFeatherIcons();

        // console.log("✅ Course information page initialized successfully");
    } catch (error) {
        // console.error("❌ Error initializing course information:", error);
        await showErrorModal("Initialization Error", "Failed to initialize course information page.");
    }
};
