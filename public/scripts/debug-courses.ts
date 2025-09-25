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
    apsc091: any | null;
    newRegistration: any | null;
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
        console.log('Setting up newRegistration button...');
        this.addClickHandler('newRegistration', () => this.loadDebugCourse('newRegistration'));
        
        console.log('Setting up APSC 099 button...');
        this.addClickHandler('apsc099', () => this.loadDebugCourse('apsc099'));
        
        console.log('Setting up APSC 080 button...');
        this.addClickHandler('apsc080', () => this.loadDebugCourse('apsc080'));
        
        console.log('Setting up APSC 060 button...');
        this.addClickHandler('apsc060', () => this.loadDebugCourse('apsc060'));
        
        console.log('Setting up APSC 091 button...');
        this.addClickHandler('apsc091', () => this.loadDebugCourse('apsc091'));
        
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
     * Load debug courses without database interaction (for newRegistration)
     */
    public async loadDebugCoursesNoDB(): Promise<void> {
        // Initialize with null data for all courses except newRegistration
        this.debugCourses = {
            apsc099: null,
            apsc080: null,
            apsc060: null,
            apsc091: null,
            newRegistration: null
        };
        this.updateDebugCourseStatus();
    }

    /**
     * Update the status display of debug courses
     */
    private updateDebugCourseStatus(): void {
        if (!this.debugCourses) return;

        // Update newRegistration status (Mock Course Onboarding - always null in database)
        this.updateCourseStatus('newRegistration', null, 
            'Plain onboarding session with no database setup<br>Complete 4-step onboarding process from scratch');

        // Update APSC 099 status
        this.updateCourseStatus('apsc099', this.debugCourses.apsc099, 
            'Mock Course: APSC 099 - Engineering for Kindergarten<br>Settled Course - Completed onboarding with learning objectives');

        // Update APSC 080 status
        this.updateCourseStatus('apsc080', this.debugCourses.apsc080, 
            'Mock Course: APSC 080 - Introduction to Engineering<br>Course Onboarding View - Ready for document setup');

        // Update APSC 060 status
        this.updateCourseStatus('apsc060', this.debugCourses.apsc060, 
            'Mock Course: APSC 060 - Engineering Society<br>Flag Setup View - Ready for flag onboarding');

        // Update APSC 091 status
        this.updateCourseStatus('apsc091', this.debugCourses.apsc091, 
            'Mock Course: APSC 091 - PID for Engineers<br>Monitor Setup View - Ready for monitor onboarding');
    }

    /**
     * Update status for a specific course
     */
    private updateCourseStatus(courseId: string, course: any, baseDescription: string): void {
        const courseElement = document.getElementById(`${courseId}-course`);
        if (!courseElement) return;

        // Handle both old and new description class names
        const descriptionElement = courseElement.querySelector('.course-description') || 
                                 courseElement.querySelector('.step-description');
        if (!descriptionElement) return;

        // Special exception for newRegistration - always show as available
        if (courseId === 'newRegistration') {
            courseElement.classList.add('course-loaded');
            descriptionElement.innerHTML = `${baseDescription} ✅`;
            return;
        }

        if (course) {
            courseElement.classList.add('course-loaded');
            descriptionElement.innerHTML = `${baseDescription} ✅`;
        } else {
            courseElement.classList.remove('course-loaded');
            descriptionElement.innerHTML = `${baseDescription} - Not found in database ❌`;
        }
    }

    /**
     * Load a specific debug course
     */
    public async loadDebugCourse(courseType: string): Promise<void> {
        console.log(`🚀 loadDebugCourse called with courseType: ${courseType}`);
        console.log('Current debugCourses:', this.debugCourses);
        
        // Handle newRegistration separately - no database interaction
        if (courseType === 'newRegistration') {
            console.log('✅ Mock Course Onboarding - no database interaction required');
            
            // Create a proper mock activeCourse object with all required properties
            const mockCourse = {
                id: 'mock-onboarding-' + Date.now(),
                date: new Date(),
                courseSetup: false,
                contentSetup: false,
                flagSetup: false,
                monitorSetup: false,
                courseName: 'Mock Course Onboarding',
                instructors: [],
                teachingAssistants: [],
                frameType: 'byTopic' as const,
                tilesNumber: 12,
                divisions: []
            };
            
            console.log('💾 Storing mock course in sessionStorage...');
            sessionStorage.setItem('debugCourse', JSON.stringify(mockCourse));
            
            console.log('🧭 Navigating to instructor mode...');
            window.location.href = '/pages/instructor-mode.html';
            return;
        }
        
        // For other courses, load from database
        if (!this.debugCourses) {
            console.log('No debug courses loaded, fetching from database...');
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
        } else if (courseType === 'apsc091' && this.debugCourses?.apsc091) {
            course = this.debugCourses.apsc091;
            console.log('✅ Found APSC 091 course:', course);
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
     * Reset all debug courses to their original state (excluding newRegistration)
     */
    public async resetDebugCourses(): Promise<void> {
        console.log('🔄 resetDebugCourses called');
        
        if (!confirm('Are you sure you want to reset all debug courses? This will delete and recreate them. (Note: Mock Course Onboarding will not be affected)')) {
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
                this.showSuccess('Debug courses reset successfully! (Mock Course Onboarding unaffected)');
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
