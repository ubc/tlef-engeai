/**
 * MONITOR SETUP MODULE - ONBOARDING VERSION
 * 
 * This module handles the monitor setup onboarding flow for instructors.
 * It provides a step-by-step tutorial on how to use the monitor dashboard.
 * 
 * FEATURES:
 * - 6-step onboarding process with navigation
 * - Interactive usage statistics demonstration
 * - Working calendar modal with date selection
 * - Interactive student sorting functionality
 * - Expandable student cards with exact monitor replication
 * - Demo download functionality
 * - No backend integration (pure tutorial)
 * 
 * ONBOARDING STEPS:
 * 1. Welcome - Introduction to monitoring capabilities
 * 2. Usage Statistics - Understanding dashboard metrics
 * 3. Date Filtering - Calendar selection and date range functionality
 * 4. Student Overview - Sorting functionality and student list navigation
 * 5. Student Details - Expandable student cards and chat history access
 * 6. Congratulations - Completion and next steps
 * 
 * @author: gatahcha (revised)
 * @date: 2025-01-27
 * @version: 1.0.0
 */

import { loadComponentHTML } from "../functions/api.js";
import { activeCourse } from "../../../src/functions/types.js";
import { showErrorModal, showHelpModal } from "../modal-overlay.js";

// ===========================================
// TYPE DEFINITIONS
// ===========================================

/**
 * Represents the current state of the monitor setup onboarding process
 */
interface MonitorSetupState {
    currentStep: number;
    totalSteps: number;
    isValid: boolean;
    completedSteps: Set<number>;
}

/**
 * Demo student data structure matching monitor.ts
 */
interface DemoStudentData {
    id: string;
    name: string;
    tokens: number;
    chatHistory: DemoChatSession[];
}

interface DemoChatSession {
    id: string;
    title: string;
    date: Date;
    tokensUsed: number;
}

/**
 * Demo date range for calendar functionality
 */
interface DemoDateRange {
    start: Date | null;
    end: Date | null;
}

// ===========================================
// MAIN EXPORT FUNCTION
// ===========================================

/**
 * Renders the monitor setup onboarding page and orchestrates the complete flow.
 * 
 * This function:
 * 1. Loads the monitor setup HTML component
 * 2. Initializes the onboarding state
 * 3. Sets up event listeners for all interactions
 * 4. Manages step navigation and validation
 * 5. Handles demo functionality for monitor features
 * 
 * @param instructorCourse - The instructor's course object
 * @returns Promise<void>
 */
export const renderMonitorSetup = async (instructorCourse: activeCourse): Promise<void> => {
    //START DEBUG LOG : DEBUG-CODE(001)
    console.log("🚀 Starting monitor setup onboarding...");
    //END DEBUG LOG : DEBUG-CODE(001)
    
    try {
        // Initialize monitor setup state
        const state: MonitorSetupState = {
            currentStep: 1,
            totalSteps: 6,
            isValid: false,
            completedSteps: new Set()
        };

        // Store state globally for access by demo functions
        (window as any).monitorSetupState = state;

        // Load the monitor setup component
        const container = document.getElementById('main-content-area');
        if (!container) {
            throw new Error("Main content area not found");
        }

        // Add onboarding-active class to hide instructor sidebar
        document.body.classList.add('onboarding-active');

        const html = await loadComponentHTML('monitor-setup');
        container.innerHTML = html;

        // Wait for DOM to be ready
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }

        // Initialize the monitor setup interface
        await initializeMonitorSetup(state, instructorCourse);

    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(002)
        console.error("❌ Error during monitor setup initialization:", error);
        //END DEBUG LOG : DEBUG-CODE(002)
        await showErrorModal("Initialization Error", "Failed to initialize monitor setup. Please refresh the page and try again.");
    }
};

// ===========================================
// INITIALIZATION FUNCTIONS
// ===========================================

/**
 * Initializes the monitor setup interface with all event listeners and demo functionality
 * 
 * @param state - The current onboarding state
 * @param instructorCourse - The instructor's course object
 */
async function initializeMonitorSetup(state: MonitorSetupState, instructorCourse: activeCourse): Promise<void> {
    //START DEBUG LOG : DEBUG-CODE(003)
    console.log("🔧 Initializing monitor setup interface...");
    //END DEBUG LOG : DEBUG-CODE(003)

    try {
        // Initialize demo data
        initializeDemoData();

        // Set up navigation
        setupNavigation(state);

        // Set up help system
        setupHelpSystem();

        // Set up demo functionality
        setupDemoFunctionality();

        // Initialize step 1
        await showStep(state, 1);

        //START DEBUG LOG : DEBUG-CODE(004)
        console.log("✅ Monitor setup interface initialized successfully");
        //END DEBUG LOG : DEBUG-CODE(004)

    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(005)
        console.error("❌ Error initializing monitor setup interface:", error);
        //END DEBUG LOG : DEBUG-CODE(005)
        throw error;
    }
}

/**
 * Initialize demo data for the onboarding session
 */
function initializeDemoData(): void {
    // Store demo student data globally for access by demo functions
    const demoStudents: DemoStudentData[] = [
        {
            id: 'demo-1',
            name: 'Rusdiyanto, Charisma',
            tokens: 1351,
            chatHistory: [
                { id: 'demo-1-1', title: 'Thermodynamics Problem Set 3', date: new Date('2024-01-15'), tokensUsed: 450 },
                { id: 'demo-1-2', title: 'Heat Transfer Calculations', date: new Date('2024-01-14'), tokensUsed: 320 },
                { id: 'demo-1-3', title: 'Mass Balance Equations', date: new Date('2024-01-13'), tokensUsed: 280 }
            ]
        },
        {
            id: 'demo-2',
            name: 'Megury, Christian',
            tokens: 2500,
            chatHistory: [
                { id: 'demo-2-1', title: 'Fluid Mechanics Lab Report', date: new Date('2024-01-15'), tokensUsed: 680 },
                { id: 'demo-2-2', title: 'Bernoulli Equation Applications', date: new Date('2024-01-14'), tokensUsed: 520 },
                { id: 'demo-2-3', title: 'Reynolds Number Calculations', date: new Date('2024-01-13'), tokensUsed: 410 }
            ]
        },
        {
            id: 'demo-3',
            name: 'Maximoff, Wanda',
            tokens: 5700,
            chatHistory: [
                { id: 'demo-3-1', title: 'Process Control Systems Design', date: new Date('2024-01-15'), tokensUsed: 1200 },
                { id: 'demo-3-2', title: 'PID Controller Tuning', date: new Date('2024-01-14'), tokensUsed: 980 },
                { id: 'demo-3-3', title: 'Feedback Control Theory', date: new Date('2024-01-13'), tokensUsed: 750 }
            ]
        }
    ];

    (window as any).demoStudents = demoStudents;
    (window as any).demoCurrentSort = 'tokens';
    (window as any).demoDateRange = { start: new Date(), end: null };
}

// ===========================================
// NAVIGATION FUNCTIONS
// ===========================================

/**
 * Sets up navigation between onboarding steps
 * 
 * @param state - The current onboarding state
 */
function setupNavigation(state: MonitorSetupState): void {
    const nextBtn = document.getElementById('nextBtn');
    const backBtn = document.getElementById('backBtn');

    nextBtn?.addEventListener('click', () => {
        if (state.currentStep < state.totalSteps) {
            showStep(state, state.currentStep + 1);
        }
    });

    backBtn?.addEventListener('click', () => {
        if (state.currentStep > 1) {
            showStep(state, state.currentStep - 1);
        }
    });
}

/**
 * Shows a specific step in the onboarding process
 * 
 * @param state - The current onboarding state
 * @param stepNumber - The step number to show
 */
async function showStep(state: MonitorSetupState, stepNumber: number): Promise<void> {
    //START DEBUG LOG : DEBUG-CODE(006)
    console.log(`📋 Showing step ${stepNumber}...`);
    //END DEBUG LOG : DEBUG-CODE(006)

    // Hide all content steps
    const contentSteps = document.querySelectorAll('.content-step');
    contentSteps.forEach(step => {
        step.classList.remove('active');
    });

    // Show the target step
    const targetStep = document.getElementById(`content-step-${stepNumber}`);
    if (targetStep) {
        targetStep.classList.add('active');
    }

    // Update step indicators
    updateStepIndicators(stepNumber);

    // Update navigation buttons
    updateNavigationButtons(state, stepNumber);

    // Update state
    state.currentStep = stepNumber;
    state.completedSteps.add(stepNumber);

    // Initialize step-specific functionality
    await initializeStepFunctionality(stepNumber);

    // Re-render feather icons
    if (typeof (window as any).feather !== 'undefined') {
        (window as any).feather.replace();
    }
}

/**
 * Updates the step indicators in the left panel
 * 
 * @param currentStep - The current step number
 */
function updateStepIndicators(currentStep: number): void {
    const stepItems = document.querySelectorAll('.step-item');
    
    stepItems.forEach((item, index) => {
        const stepNumber = index + 1;
        const circle = item.querySelector('.step-circle');
        
        if (circle) {
            circle.classList.remove('completed', 'current', 'pending');
            
            if (stepNumber < currentStep) {
                circle.classList.add('completed');
            } else if (stepNumber === currentStep) {
                circle.classList.add('current');
            } else {
                circle.classList.add('pending');
            }
        }
    });
}

/**
 * Updates the navigation buttons based on current step
 * 
 * @param state - The current onboarding state
 * @param currentStep - The current step number
 */
function updateNavigationButtons(state: MonitorSetupState, currentStep: number): void {
    const nextBtn = document.getElementById('nextBtn');
    const backBtn = document.getElementById('backBtn');

    if (backBtn) {
        backBtn.style.display = currentStep > 1 ? 'flex' : 'none';
    }

    if (nextBtn) {
        if (currentStep === state.totalSteps) {
            nextBtn.textContent = 'Complete';
            nextBtn.innerHTML = 'Complete <i data-feather="check"></i>';
        } else {
            nextBtn.textContent = 'Next';
            nextBtn.innerHTML = 'Next <i data-feather="chevron-right"></i>';
        }
    }
}

// ===========================================
// STEP-SPECIFIC FUNCTIONALITY
// ===========================================

/**
 * Initializes functionality specific to each step
 * 
 * @param stepNumber - The step number to initialize
 */
async function initializeStepFunctionality(stepNumber: number): Promise<void> {
    switch (stepNumber) {
        case 1:
            // Welcome step - no special functionality needed
            break;
        case 2:
            // Usage statistics step - already has static demo
            break;
        case 3:
            // Date filtering step - calendar functionality
            initializeCalendarDemo();
            break;
        case 4:
            // Student overview step - sorting functionality
            initializeStudentListDemo();
            break;
        case 5:
            // Student details step - accordion functionality
            initializeStudentDetailsDemo();
            break;
        case 6:
            // Completion step - no special functionality needed
            break;
    }
}

/**
 * Initialize calendar demo functionality
 */
function initializeCalendarDemo(): void {
    // Calendar functionality is handled by global demo functions
    // This is just a placeholder for any step-specific initialization
}

/**
 * Initialize student list demo with sorting
 */
function initializeStudentListDemo(): void {
    renderDemoStudentList();
}

/**
 * Initialize student details demo
 */
function initializeStudentDetailsDemo(): void {
    // Student details functionality is handled by global demo functions
    // This is just a placeholder for any step-specific initialization
}

// ===========================================
// DEMO FUNCTIONALITY
// ===========================================

/**
 * Sets up all demo functionality for the onboarding session
 */
function setupDemoFunctionality(): void {
    // Make demo functions globally available
    (window as any).openDemoCalendar = openDemoCalendar;
    (window as any).closeDemoCalendar = closeDemoCalendar;
    (window as any).demoSortStudents = demoSortStudents;
    (window as any).toggleDemoStudentAccordion = toggleDemoStudentAccordion;
    (window as any).demoDownloadChat = demoDownloadChat;
    (window as any).renderDemoStudentList = renderDemoStudentList;
}

/**
 * Opens the demo calendar modal
 */
function openDemoCalendar(): void {
    const modal = document.getElementById('demo-calendar-modal');
    if (modal) {
        modal.style.display = 'flex';
        renderDemoCalendar();
    }
}

/**
 * Closes the demo calendar modal
 */
function closeDemoCalendar(): void {
    const modal = document.getElementById('demo-calendar-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Renders the demo calendar
 */
function renderDemoCalendar(): void {
    const calendar = document.getElementById('demo-calendar');
    if (!calendar) return;

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Generate calendar HTML
    const calendarHTML = generateDemoCalendarHTML(currentYear, currentMonth);
    calendar.innerHTML = calendarHTML;

    // Bind calendar events
    bindDemoCalendarEvents();
}

/**
 * Generates HTML for the demo calendar
 */
function generateDemoCalendarHTML(year: number, month: number): string {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days = [];
    const today = new Date();

    // Generate 42 days (6 weeks)
    for (let i = 0; i < 42; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        
        const isCurrentMonth = date.getMonth() === month;
        const isToday = isSameDay(date, today);
        const isSelected = isDateSelected(date);
        
        days.push(`
            <div class="calendar-day ${isCurrentMonth ? 'current-month' : 'other-month'} 
                       ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" 
                 data-date="${date.toISOString().split('T')[0]}">
                ${date.getDate()}
            </div>
        `);
    }

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    return `
        <div class="calendar-header">
            <button class="calendar-nav-btn" id="demo-prev-month">
                <i data-feather="chevron-left"></i>
            </button>
            <h3>${monthNames[month]} ${year}</h3>
            <button class="calendar-nav-btn" id="demo-next-month">
                <i data-feather="chevron-right"></i>
            </button>
        </div>
        <div class="calendar-weekdays">
            <div class="weekday">Mo</div>
            <div class="weekday">Tu</div>
            <div class="weekday">We</div>
            <div class="weekday">Th</div>
            <div class="weekday">Fr</div>
            <div class="weekday">Sa</div>
            <div class="weekday">Su</div>
        </div>
        <div class="calendar-days">
            ${days.join('')}
        </div>
    `;
}

/**
 * Binds events for the demo calendar
 */
function bindDemoCalendarEvents(): void {
    // Date selection
    const calendarDays = document.querySelectorAll('.calendar-day');
    calendarDays.forEach(day => {
        day.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const dateStr = target.getAttribute('data-date');
            if (dateStr) {
                selectDemoDate(new Date(dateStr));
            }
        });
    });

    // Close calendar when clicking outside
    const modal = document.getElementById('demo-calendar-modal');
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeDemoCalendar();
        }
    });

    // Close button
    const closeBtn = document.getElementById('demo-close-calendar-btn');
    closeBtn?.addEventListener('click', closeDemoCalendar);

    // OK button
    const okBtn = document.getElementById('demo-calendar-ok-btn');
    okBtn?.addEventListener('click', () => {
        applyDemoDateSelection();
        closeDemoCalendar();
    });

    // Re-render feather icons
    if (typeof (window as any).feather !== 'undefined') {
        (window as any).feather.replace();
    }
}

/**
 * Selects a date in the demo calendar
 */
function selectDemoDate(date: Date): void {
    const dateRange = (window as any).demoDateRange as DemoDateRange;
    
    if (!dateRange.start) {
        // First selection
        dateRange.start = date;
        dateRange.end = null;
    } else if (!dateRange.end) {
        // Second selection - determine if it's start or end
        if (date < dateRange.start) {
            dateRange.end = dateRange.start;
            dateRange.start = date;
        } else {
            dateRange.end = date;
        }
    } else {
        // New selection - reset
        dateRange.start = date;
        dateRange.end = null;
    }

    updateDemoSelectedDatesDisplay();
    renderDemoCalendar();
}

/**
 * Checks if a date is selected in the demo calendar
 */
function isDateSelected(date: Date): boolean {
    const dateRange = (window as any).demoDateRange as DemoDateRange;
    
    if (!dateRange.start) return false;
    
    if (!dateRange.end) {
        return isSameDay(date, dateRange.start);
    }
    
    return date >= dateRange.start && date <= dateRange.end;
}

/**
 * Updates the selected dates display in the demo calendar
 */
function updateDemoSelectedDatesDisplay(): void {
    const selectedDatesEl = document.getElementById('demo-selected-dates');
    if (!selectedDatesEl) return;

    const dateRange = (window as any).demoDateRange as DemoDateRange;

    if (dateRange.start && !dateRange.end) {
        selectedDatesEl.textContent = `Selected: ${formatDate(dateRange.start)}`;
    } else if (dateRange.start && dateRange.end) {
        selectedDatesEl.textContent = `Selected: ${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`;
    } else {
        selectedDatesEl.textContent = '';
    }
}

/**
 * Applies the demo date selection
 */
function applyDemoDateSelection(): void {
    const dateRange = (window as any).demoDateRange as DemoDateRange;
    const currentDateDisplay = document.getElementById('demo-current-date-display');
    
    if (!currentDateDisplay) return;

    if (dateRange.start && !dateRange.end) {
        if (isSameDay(dateRange.start, new Date())) {
            currentDateDisplay.textContent = 'Today';
        } else {
            currentDateDisplay.textContent = formatDate(dateRange.start);
        }
    } else if (dateRange.start && dateRange.end) {
        currentDateDisplay.textContent = `${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`;
    } else {
        currentDateDisplay.textContent = 'Today';
    }
}

/**
 * Demo student sorting functionality
 */
function demoSortStudents(sortType: 'tokens' | 'name'): void {
    (window as any).demoCurrentSort = sortType;
    
    // Update button states
    const sortButtons = document.querySelectorAll('#demo-student-list-section .sort-btn');
    sortButtons.forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = document.getElementById(`demo-sort-${sortType}`);
    activeBtn?.classList.add('active');
    
    // Re-render student list
    renderDemoStudentList();
}

/**
 * Renders the demo student list
 */
function renderDemoStudentList(): void {
    const studentList = document.getElementById('demo-student-list');
    if (!studentList) return;

    const students = (window as any).demoStudents as DemoStudentData[];
    const currentSort = (window as any).demoCurrentSort as string;
    
    // Sort students
    const sortedStudents = [...students].sort((a, b) => {
        if (currentSort === 'tokens') {
            return b.tokens - a.tokens;
        } else {
            return a.name.localeCompare(b.name);
        }
    });
    
    studentList.innerHTML = sortedStudents.map(student => `
        <div class="student-item" data-student-id="${student.id}">
            <div class="student-header" onclick="toggleDemoStudentAccordion('${student.id}')">
                <div class="student-name">${student.name}</div>
                <div class="student-tokens">${student.tokens.toLocaleString()} tokens</div>
                <i data-feather="chevron-down" class="expand-arrow"></i>
            </div>
            <div class="monitor-student-content">
                <div class="chat-history-list">
                    ${student.chatHistory.map(chat => `
                        <div class="chat-history-item">
                            <div class="chat-title">${chat.title}</div>
                            <button class="download-button" onclick="demoDownloadChat('${chat.id}')">
                                <i data-feather="download"></i>
                                Download
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `).join('');

    // Re-render feather icons
    if (typeof (window as any).feather !== 'undefined') {
        (window as any).feather.replace();
    }
}

/**
 * Toggles demo student accordion expand/collapse
 */
function toggleDemoStudentAccordion(studentId: string): void {
    const studentItem = document.querySelector(`[data-student-id="${studentId}"]`);
    if (studentItem) {
        studentItem.classList.toggle('expanded');
    }
}

/**
 * Demo download chat functionality
 */
function demoDownloadChat(chatId: string): void {
    //START DEBUG LOG : DEBUG-CODE(007)
    console.log(`📥 Demo download for chat session: ${chatId}`);
    //END DEBUG LOG : DEBUG-CODE(007)
    
    alert(`Demo: Download functionality for chat session ${chatId} will be implemented in the actual monitor dashboard!`);
}

// ===========================================
// HELP SYSTEM
// ===========================================

/**
 * Sets up the help system for the onboarding session
 */
function setupHelpSystem(): void {
    const helpBtn = document.getElementById('helpBtn');
    helpBtn?.addEventListener('click', () => {
        const state = (window as any).monitorSetupState as MonitorSetupState;
        showHelpModal(state.currentStep, 'Monitor Setup Help', getHelpContent(state.currentStep));
    });
}

/**
 * Gets help content for a specific step
 * 
 * @param stepNumber - The step number
 * @returns The help content HTML
 */
function getHelpContent(stepNumber: number): string {
    const helpTemplate = document.getElementById(`help-step-${stepNumber}`);
    return helpTemplate ? helpTemplate.innerHTML : 'No help content available for this step.';
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Formats a date for display
 * 
 * @param date - The date to format
 * @returns Formatted date string
 */
function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
    });
}

/**
 * Checks if two dates are the same day
 * 
 * @param date1 - First date
 * @param date2 - Second date
 * @returns True if same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

// ===========================================
// CLEANUP FUNCTION
// ===========================================

/**
 * Cleans up the monitor setup onboarding session
 */
export const cleanupMonitorSetup = (): void => {
    //START DEBUG LOG : DEBUG-CODE(008)
    console.log("🧹 Cleaning up monitor setup onboarding...");
    //END DEBUG LOG : DEBUG-CODE(008)
    
    // Remove onboarding-active class
    document.body.classList.remove('onboarding-active');
    
    // Clear global state
    delete (window as any).monitorSetupState;
    delete (window as any).demoStudents;
    delete (window as any).demoCurrentSort;
    delete (window as any).demoDateRange;
    
    // Clear global demo functions
    delete (window as any).openDemoCalendar;
    delete (window as any).closeDemoCalendar;
    delete (window as any).demoSortStudents;
    delete (window as any).toggleDemoStudentAccordion;
    delete (window as any).demoDownloadChat;
    delete (window as any).renderDemoStudentList;
    
    //START DEBUG LOG : DEBUG-CODE(009)
    console.log("✅ Monitor setup cleanup completed");
    //END DEBUG LOG : DEBUG-CODE(009)
};
