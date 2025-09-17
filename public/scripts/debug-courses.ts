/**
 * DEBUG COURSES MODULE
 * 
 * This module handles the debug course functionality for the index.html page.
 * It provides methods to load, display, and manage debug courses for testing.
 * 
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

console.log('🚀 DEBUG COURSES SCRIPT LOADING...');

interface DebugCourses {
    apsc099: any | null;
    apsc080: any | null;
    apsc060: any | null;
}

class DebugCoursesManager {
    private debugCourses: DebugCourses | null = null;

    constructor() {
        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners for debug course buttons
     */
    private initializeEventListeners(): void {
        // Load courses when page loads
        document.addEventListener('DOMContentLoaded', () => {
            this.loadDebugCourses();
            this.setupClickHandlers();
        });
    }

    /**
     * Setup click handlers for all debug course buttons
     */
    private setupClickHandlers(): void {
        console.log('🔧 Setting up click handlers for debug course buttons...');
        
        // Add click handlers for course buttons
        console.log('Setting up APSC 099 button...');
        this.addClickHandler('apsc099', () => this.loadDebugCourse('apsc099'));
        
        console.log('Setting up APSC 080 button...');
        this.addClickHandler('apsc080', () => this.loadDebugCourse('apsc080'));
        
        console.log('Setting up APSC 060 button...');
        this.addClickHandler('apsc060', () => this.loadDebugCourse('apsc060'));
        
        console.log('Setting up Reset button...');
        this.addClickHandler('reset', () => this.resetDebugCourses());
        
        console.log('Setting up Refresh button...');
        this.addClickHandler('refresh', () => this.refreshDebugCourses());
        
        console.log('✅ All click handlers setup complete');
    }

    /**
     * Add click handler for a button by ID
     */
    private addClickHandler(buttonId: string, handler: () => void): void {
        const buttonIdFull = `${buttonId}-btn`;
        const button = document.getElementById(buttonIdFull);
        
        console.log(`Setting up click handler for button: ${buttonIdFull}`);
        console.log(`Button element found:`, button);
        
        if (button) {
            button.addEventListener('click', (event) => {
                console.log(`Button clicked: ${buttonIdFull}`);
                console.log('Click event:', event);
                handler();
            });
            console.log(`✅ Click handler successfully added to ${buttonIdFull}`);
        } else {
            console.error(`❌ Button with ID ${buttonIdFull} not found!`);
        }
    }

    /**
     * Load debug courses from the API
     */
    public async loadDebugCourses(): Promise<void> {
        try {
            const response = await fetch('/api/mongodb/debug/courses');
            const result = await response.json();
            
            if (result.success) {
                this.debugCourses = result.data;
                this.updateDebugCourseStatus();
            } else {
                console.error('Failed to load debug courses:', result.error);
                this.showError('Failed to load debug courses');
            }
        } catch (error) {
            console.error('Error loading debug courses:', error);
            this.showError('Error loading debug courses');
        }
    }

    /**
     * Update the status display of debug courses
     */
    private updateDebugCourseStatus(): void {
        if (!this.debugCourses) return;

        // Update APSC 099 status
        this.updateCourseStatus('apsc099', this.debugCourses.apsc099, 
            'Settled Course - Completed onboarding with learning objectives');

        // Update APSC 080 status
        this.updateCourseStatus('apsc080', this.debugCourses.apsc080, 
            'Course Onboarding View - Ready for document setup');

        // Update APSC 060 status
        this.updateCourseStatus('apsc060', this.debugCourses.apsc060, 
            'Flag Setup View - Ready for flag onboarding');
    }

    /**
     * Update status for a specific course
     */
    private updateCourseStatus(courseId: string, course: any, baseDescription: string): void {
        const courseElement = document.getElementById(`${courseId}-course`);
        if (!courseElement) return;

        const descriptionElement = courseElement.querySelector('.course-description');
        if (!descriptionElement) return;

        if (course) {
            courseElement.classList.add('course-loaded');
            descriptionElement.textContent = `${baseDescription} ✅`;
        } else {
            courseElement.classList.remove('course-loaded');
            descriptionElement.textContent = `${baseDescription} - Not found in database ❌`;
        }
    }

    /**
     * Load a specific debug course
     */
    public async loadDebugCourse(courseType: string): Promise<void> {
        console.log(`🚀 loadDebugCourse called with courseType: ${courseType}`);
        console.log('Current debugCourses:', this.debugCourses);
        
        if (!this.debugCourses) {
            console.log('No debug courses loaded, fetching...');
            await this.loadDebugCourses();
        }

        let course = null;
        if (courseType === 'apsc099' && this.debugCourses?.apsc099) {
            course = this.debugCourses.apsc099;
            console.log('✅ Found APSC 099 course:', course);
        } else if (courseType === 'apsc080' && this.debugCourses?.apsc080) {
            course = this.debugCourses.apsc080;
            console.log('✅ Found APSC 080 course:', course);
        } else if (courseType === 'apsc060' && this.debugCourses?.apsc060) {
            course = this.debugCourses.apsc060;
            console.log('✅ Found APSC 060 course:', course);
        } else {
            console.log(`❌ Course ${courseType} not found in debugCourses`);
        }

        if (course) {
            console.log('💾 Storing course in sessionStorage...');
            // Store course in sessionStorage for instructor mode
            sessionStorage.setItem('debugCourse', JSON.stringify(course));
            
            console.log('🧭 Navigating to instructor mode...');
            // Navigate to instructor mode
            window.location.href = '/pages/instructor-mode.html';
        } else {
            console.error(`❌ Course ${courseType} not found, showing error`);
            this.showError('Course not found. Please refresh and try again.');
        }
    }

    /**
     * Reset all debug courses to their original state
     */
    public async resetDebugCourses(): Promise<void> {
        console.log('🔄 resetDebugCourses called');
        
        if (!confirm('Are you sure you want to reset all debug courses? This will delete and recreate them.')) {
            console.log('❌ User cancelled reset operation');
            return;
        }

        console.log('✅ User confirmed reset, proceeding...');
        
        try {
            console.log('📡 Sending reset request to API...');
            const response = await fetch('/api/mongodb/debug/reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const result = await response.json();
            console.log('📡 Reset API response:', result);
            
            if (result.success) {
                console.log('✅ Reset successful, showing success message');
                this.showSuccess('Debug courses reset successfully!');
                console.log('🔄 Reloading debug courses...');
                await this.loadDebugCourses();
            } else {
                console.error('❌ Reset failed:', result.error);
                this.showError('Failed to reset debug courses: ' + result.error);
            }
        } catch (error) {
            console.error('❌ Error resetting debug courses:', error);
            this.showError('Error resetting debug courses. Please try again.');
        }
    }

    /**
     * Refresh debug courses status
     */
    public async refreshDebugCourses(): Promise<void> {
        console.log('🔄 refreshDebugCourses called');
        console.log('📡 Reloading debug courses...');
        await this.loadDebugCourses();
        console.log('✅ Debug courses refreshed');
    }

    /**
     * Show error message to user
     */
    private showError(message: string): void {
        // Try to use modal overlay if available, otherwise fallback to alert
        if (typeof (window as any).showSimpleErrorModal === 'function') {
            (window as any).showSimpleErrorModal(message, 'Debug Course Error');
        } else {
            alert(`Error: ${message}`);
        }
    }

    /**
     * Show success message to user
     */
    private showSuccess(message: string): void {
        // Try to use modal overlay if available, otherwise fallback to alert
        if (typeof (window as any).showSuccessModal === 'function') {
            (window as any).showSuccessModal(message, 'Success');
        } else {
            alert(message);
        }
    }
}

// Global functions for HTML onclick handlers
declare global {
    interface Window {
        loadDebugCourse: (courseType: string) => void;
        resetDebugCourses: () => void;
        refreshDebugCourses: () => void;
    }
}

// Initialize debug courses manager
console.log('Debug courses script loaded');
const debugCoursesManager = new DebugCoursesManager();

// Expose functions globally for HTML onclick handlers
window.loadDebugCourse = (courseType: string) => debugCoursesManager.loadDebugCourse(courseType);
window.resetDebugCourses = () => debugCoursesManager.resetDebugCourses();
window.refreshDebugCourses = () => debugCoursesManager.refreshDebugCourses();

export default debugCoursesManager;
