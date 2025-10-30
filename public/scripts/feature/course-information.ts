/**
 * COURSE INFORMATION MODULE
 * 
 * This module handles the display and editing of course information for instructors.
 * It provides an editable view of course setup data with save functionality.
 * 
 * FEATURES:
 * - Display current course information in editable form
 * - Allow modification of instructors, TAs, and content count
 * - Course name and organization type are readonly
 * - Save changes to database with proper validation
 * - Confirmation modals for instructor/TA removal
 * - Handle section count changes with automatic division management
 * 
 * @author: gatahcha
 * @date: 2025-01-29
 * @version: 2.0.0
 */

import { activeCourse, ContentDivision } from "../../../src/functions/types.js";
import { showErrorModal, showSuccessModal, showConfirmModal } from "../modal-overlay.js";
import { renderFeatherIcons } from "../functions/api.js";

// ===========================================
// DROPDOWN OPTIONS DATA
// ===========================================

/**
 * Available course options for selection
 * (Reused from course-setup.ts)
 */
const BASE_COURSE_OPTIONS = [
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
 * (Reused from course-setup.ts)
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
 * (Reused from course-setup.ts)
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
// UTILITY FUNCTIONS
// ===========================================

/**
 * Populates a select element with options from the provided data
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
 * Ensures the current course name is in the course options list
 * If not present, adds it to the list
 */
function ensureCourseInOptions(courseName: string): Array<{value: string, text: string}> {
    const courseOptions = [...BASE_COURSE_OPTIONS];
    
    // Check if the current course name is already in the list
    const courseExists = courseOptions.some(option => option.value === courseName);
    
    if (!courseExists && courseName) {
        // Add the current course to the list (after "Select a course..." option)
        courseOptions.splice(1, 0, {
            value: courseName,
            text: courseName
        });
        console.log(`[COURSE-INFO] Added current course to options: ${courseName}`);
    }
    
    return courseOptions;
}

/**
 * Updates the display of selected items (instructors or TAs) with confirmation on removal
 */
async function updateSelectedItemsDisplay(containerId: string, items: string[], itemType: 'instructor' | 'ta'): Promise<void> {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    for (const item of items) {
        const itemElement = document.createElement('div');
        itemElement.className = 'selected-item';
        itemElement.innerHTML = `
            <span>${item}</span>
            <button class="remove-btn" data-item="${item}">×</button>
        `;
        
        // Add remove functionality with confirmation modal
        const removeBtn = itemElement.querySelector('.remove-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', async () => {
                const typeName = itemType === 'instructor' ? 'instructor' : 'teaching assistant';
                const result = await showConfirmModal(
                    `Remove ${typeName.charAt(0).toUpperCase() + typeName.slice(1)}`,
                    `Are you sure you want to remove ${item}?`,
                    'Confirm',
                    'Cancel'
                );
                
                // Check if user confirmed (clicked Confirm button)
                if (result.action === 'confirm') {
                    const index = items.indexOf(item);
                    if (index > -1) {
                        items.splice(index, 1);
                        await updateSelectedItemsDisplay(containerId, items, itemType);
                    }
                }
            });
        }
        
        container.appendChild(itemElement);
    }
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

/**
 * Generates a unique ID for divisions
 */
function generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Handles section count changes and updates divisions array
 */
async function handleSectionCountChange(
    newCount: number, 
    oldCount: number, 
    frameType: 'byWeek' | 'byTopic',
    divisions: ContentDivision[],
    courseName: string
): Promise<ContentDivision[] | null> {
    // If decreasing, show confirmation modal
    if (newCount < oldCount) {
        const result = await showConfirmModal(
            "Confirm Reduction",
            `Reducing sections will permanently delete the last ${oldCount - newCount} division(s). Are you sure?`,
            'Confirm',
            'Cancel'
        );
        
        if (result.action !== 'confirm') {
            return null; // User cancelled
        }
        
        // Keep only the first newCount divisions
        return divisions.slice(0, newCount);
    } 
    // If increasing, add placeholder divisions
    else if (newCount > oldCount) {
        const updatedDivisions = [...divisions];
        const divisionPrefix = frameType === 'byWeek' ? 'Week' : 'Topic';
        
        for (let i = oldCount; i < newCount; i++) {
            const newDivision: ContentDivision = {
                id: generateUniqueId(),
                date: new Date(),
                title: `${divisionPrefix}: no name`,
                courseName: courseName,
                published: false,
                items: [],
                createdAt: new Date(),
                updatedAt: new Date()
            };
            updatedDivisions.push(newDivision);
        }
        
        return updatedDivisions;
    }
    
    // No change
    return divisions;
}

/**
 * Validates course information before saving
 */
async function validateCourseInfo(courseData: Partial<activeCourse>): Promise<boolean> {
    if (!courseData.courseName) {
        await showErrorModal("Validation Error", "Course name is required.");
        return false;
    }
    
    if (!courseData.instructors || courseData.instructors.length === 0) {
        await showErrorModal("Validation Error", "At least one instructor is required.");
        return false;
    }
    
    if (courseData.tilesNumber === undefined || courseData.tilesNumber < 1 || courseData.tilesNumber > 52) {
        await showErrorModal("Validation Error", "Invalid number of sections. Please enter a value between 1 and 52.");
        return false;
    }
    
    if (courseData.frameType === 'byWeek' && courseData.tilesNumber > 14) {
        await showErrorModal("Validation Error", "For weekly organization, maximum 14 weeks allowed.");
        return false;
    }
    
    return true;
}

/**
 * Saves course information to the database
 */
async function saveCourseInfo(courseData: activeCourse): Promise<boolean> {
    try {
        // Validate before saving
        if (!(await validateCourseInfo(courseData))) {
            return false;
        }
        
        console.log("🎯 Saving course information to database...");
        console.log("courseData: ", courseData);
        
        const response = await fetch(`/api/courses/${courseData.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                instructors: courseData.instructors,
                teachingAssistants: courseData.teachingAssistants,
                tilesNumber: courseData.tilesNumber,
                divisions: courseData.divisions
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to update course: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            await showSuccessModal("Success", "Course information has been updated successfully.");
            return true;
        } else {
            await showErrorModal("Error", result.error || "Failed to update course information.");
            return false;
        }
    } catch (error) {
        console.error("❌ Error saving course information:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to save course information. Please try again.";
        await showErrorModal("Error", errorMessage);
        return false;
    }
}

// ===========================================
// MAIN EXPORT FUNCTION
// ===========================================

/**
 * Initializes the course information page with current course data
 * 
 * @param currentClass - The current active course object
 */
export const initializeCourseInformation = async (currentClass: activeCourse): Promise<void> => {
    console.log("🔧 Initializing course information page...");
    
    try {
        // Create a deep copy for local modifications
        const localCourseData: activeCourse = { 
            ...currentClass,
            instructors: [...currentClass.instructors],
            teachingAssistants: [...currentClass.teachingAssistants],
            divisions: [...currentClass.divisions]
        };
        
        // Store the original count for comparison
        let originalTilesNumber = localCourseData.tilesNumber;
        
        // Ensure current course name is in the options list
        const courseOptions = ensureCourseInOptions(localCourseData.courseName);
        
        // Populate dropdown options
        const courseSelect = document.getElementById('courseInfoCourseSelect') as HTMLSelectElement;
        const instructorSelect = document.getElementById('courseInfoInstructorSelect') as HTMLSelectElement;
        const taSelect = document.getElementById('courseInfoTASelect') as HTMLSelectElement;
        
        if (courseSelect) populateSelectOptions(courseSelect, courseOptions);
        if (instructorSelect) populateSelectOptions(instructorSelect, INSTRUCTOR_OPTIONS);
        if (taSelect) populateSelectOptions(taSelect, TA_OPTIONS);
        
        // Set current values
        if (courseSelect) courseSelect.value = localCourseData.courseName;
        if (instructorSelect) await updateSelectedItemsDisplay('courseInfoSelectedInstructors', localCourseData.instructors, 'instructor');
        if (taSelect) await updateSelectedItemsDisplay('courseInfoSelectedTAs', localCourseData.teachingAssistants, 'ta');
        
        // Set radio buttons (they are disabled, but should show current value)
        const byWeekRadio = document.getElementById('courseInfoByWeek') as HTMLInputElement;
        const byTopicRadio = document.getElementById('courseInfoByTopic') as HTMLInputElement;
        if (byWeekRadio && byTopicRadio) {
            if (localCourseData.frameType === 'byWeek') {
                byWeekRadio.checked = true;
            } else {
                byTopicRadio.checked = true;
            }
        }
        
        // Set content count
        const contentCountInput = document.getElementById('courseInfoContentCount') as HTMLInputElement;
        if (contentCountInput) {
            contentCountInput.value = localCourseData.tilesNumber.toString();
        }
        
        updateContentCountDescription(localCourseData.frameType);
        
        // Add instructors
        const addInstructorBtn = document.getElementById('courseInfoAddInstructorBtn');
        if (addInstructorBtn && instructorSelect) {
            const addInstructor = async () => {
                const selectedValue = instructorSelect.value;
                if (selectedValue && !localCourseData.instructors.includes(selectedValue)) {
                    localCourseData.instructors.push(selectedValue);
                    await updateSelectedItemsDisplay('courseInfoSelectedInstructors', localCourseData.instructors, 'instructor');
                    instructorSelect.value = '';
                }
            };
            
            addInstructorBtn.addEventListener('click', addInstructor);
            instructorSelect.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && instructorSelect.value) {
                    e.preventDefault();
                    addInstructor();
                }
            });
        }
        
        // Add TAs
        const addTABtn = document.getElementById('courseInfoAddTABtn');
        if (addTABtn && taSelect) {
            const addTA = async () => {
                const selectedValue = taSelect.value;
                if (selectedValue && !localCourseData.teachingAssistants.includes(selectedValue)) {
                    localCourseData.teachingAssistants.push(selectedValue);
                    await updateSelectedItemsDisplay('courseInfoSelectedTAs', localCourseData.teachingAssistants, 'ta');
                    taSelect.value = '';
                }
            };
            
            addTABtn.addEventListener('click', addTA);
            taSelect.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && taSelect.value) {
                    e.preventDefault();
                    addTA();
                }
            });
        }
        
        // Handle content count changes (track changes for save)
        if (contentCountInput) {
            contentCountInput.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                localCourseData.tilesNumber = parseInt(target.value) || 0;
            });
        }
        
        // Handle save button click
        const saveBtn = document.getElementById('btnSaveCourseInfo');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                console.log("💾 Saving course information...");
                
                // Handle section count changes if necessary
                if (localCourseData.tilesNumber !== originalTilesNumber) {
                    const updatedDivisions = await handleSectionCountChange(
                        localCourseData.tilesNumber,
                        originalTilesNumber,
                        localCourseData.frameType,
                        localCourseData.divisions,
                        localCourseData.courseName
                    );
                    
                    if (updatedDivisions === null) {
                        // User cancelled the operation
                        if (contentCountInput) {
                            contentCountInput.value = originalTilesNumber.toString();
                            localCourseData.tilesNumber = originalTilesNumber;
                        }
                        return;
                    }
                    
                    localCourseData.divisions = updatedDivisions;
                }
                
                const success = await saveCourseInfo(localCourseData);
                
                if (success) {
                    // Update the global currentClass and original count
                    Object.assign(currentClass, localCourseData);
                    originalTilesNumber = localCourseData.tilesNumber;
                    
                    console.log("✅ Course information saved successfully");
                }
            });
        }
        
        // Handle back button click
        const backBtn = document.getElementById('course-info-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                console.log('[COURSE-INFO] 🔙 Back button clicked');
                window.dispatchEvent(new CustomEvent('course-info-closed'));
            });
            console.log('[COURSE-INFO] ✅ Back button listener attached');
        }
        
        // Render feather icons
        renderFeatherIcons();
        
        console.log("✅ Course information page initialized successfully");
        
    } catch (error) {
        console.error("❌ Error initializing course information:", error);
        await showErrorModal("Initialization Error", "Failed to initialize course information page.");
    }
};
