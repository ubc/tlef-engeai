/**
 * MONITOR SETUP MODULE - ONBOARDING VERSION
 *
 * This module handles the monitor setup onboarding flow for instructors.
 * It provides a step-by-step tutorial on how to use the monitor dashboard.
 *
 * FEATURES:
 * - 5-step onboarding process with navigation
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
 * 3. Student Overview - Sorting functionality and student list navigation
 * 4. Student Details - Expandable student cards and chat history access
 * 5. Congratulations - Completion and next steps
 *
 * @author: gatahcha (revised)
 * @date: 2025-01-27
 * @version: 1.0.0
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
export const renderMonitorSetup = (instructorCourse) => __awaiter(void 0, void 0, void 0, function* () {
    //START DEBUG LOG : DEBUG-CODE(001)
    // console.log("🚀 Starting monitor setup onboarding..."); // 🟢 MEDIUM: Initialization logging
    //END DEBUG LOG : DEBUG-CODE(001)
    try {
        // Initialize monitor setup state
        const state = {
            currentStep: 1,
            totalSteps: 5,
            isValid: false,
            completedSteps: new Set()
        };
        // Store state globally for access by demo functions
        window.monitorSetupState = state;
        // Load the monitor setup component
        const container = document.getElementById('main-content-area');
        if (!container) {
            throw new Error("Main content area not found");
        }
        // Add onboarding-active class to hide instructor sidebar
        document.body.classList.add('onboarding-active');
        const html = yield loadComponentHTML('monitor-setup');
        container.innerHTML = html;
        // Wait for DOM to be ready
        yield new Promise(resolve => requestAnimationFrame(resolve));
        if (typeof window.feather !== 'undefined') {
            window.feather.replace();
        }
        // Initialize the monitor setup interface
        yield initializeMonitorSetup(state, instructorCourse);
    }
    catch (error) {
        //START DEBUG LOG : DEBUG-CODE(002)
        console.error("❌ Error during monitor setup initialization:", error);
        //END DEBUG LOG : DEBUG-CODE(002)
        yield showErrorModal("Initialization Error", "Failed to initialize monitor setup. Please refresh the page and try again.");
    }
});
// ===========================================
// INITIALIZATION FUNCTIONS
// ===========================================
/**
 * Initializes the monitor setup interface with all event listeners and demo functionality
 *
 * @param state - The current onboarding state
 * @param instructorCourse - The instructor's course object
 */
function initializeMonitorSetup(state, instructorCourse) {
    return __awaiter(this, void 0, void 0, function* () {
        //START DEBUG LOG : DEBUG-CODE(003)
        // console.log("🔧 Initializing monitor setup interface..."); // 🟢 MEDIUM: Interface initialization
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
            // Set up window resize listener for overflow detection
            setupResizeListener(state);
            // Initialize step 1
            yield showStep(state, 1);
            //START DEBUG LOG : DEBUG-CODE(004)
            console.log("✅ Monitor setup interface initialized successfully");
            //END DEBUG LOG : DEBUG-CODE(004)
        }
        catch (error) {
            //START DEBUG LOG : DEBUG-CODE(005)
            console.error("❌ Error initializing monitor setup interface:", error);
            //END DEBUG LOG : DEBUG-CODE(005)
            throw error;
        }
    });
}
/**
 * Initialize demo data for the onboarding session
 */
function initializeDemoData() {
    // Store demo student data globally for access by demo functions
    const demoStudents = [
        {
            id: 'demo-1',
            name: 'Maximoff, Wanda',
            tokens: 2500,
            chatHistory: [
                { id: 'demo-1-1', title: 'Process Control Systems Design', date: new Date('2024-01-15'), tokensUsed: 800 },
                { id: 'demo-1-2', title: 'PID Controller Tuning', date: new Date('2024-01-14'), tokensUsed: 700 },
                { id: 'demo-1-3', title: 'Feedback Control Theory', date: new Date('2024-01-13'), tokensUsed: 500 }
            ]
        },
        {
            id: 'demo-2',
            name: 'Megury, Christian',
            tokens: 1351,
            chatHistory: [
                { id: 'demo-2-1', title: 'Fluid Mechanics Lab Report', date: new Date('2024-01-15'), tokensUsed: 450 },
                { id: 'demo-2-2', title: 'Bernoulli Equation Applications', date: new Date('2024-01-14'), tokensUsed: 400 },
                { id: 'demo-2-3', title: 'Reynolds Number Calculations', date: new Date('2024-01-13'), tokensUsed: 300 }
            ]
        },
        {
            id: 'demo-3',
            name: 'Rusdiyanto, Charisma',
            tokens: 5700,
            chatHistory: [
                { id: 'demo-3-1', title: 'Thermodynamics Problem Set 3', date: new Date('2024-01-15'), tokensUsed: 1900 },
                { id: 'demo-3-2', title: 'Heat Transfer Calculations', date: new Date('2024-01-14'), tokensUsed: 1800 },
                { id: 'demo-3-3', title: 'Mass Balance Equations', date: new Date('2024-01-13'), tokensUsed: 1500 }
            ]
        }
    ];
    window.demoStudents = demoStudents;
    window.demoCurrentSort = 'tokens';
    window.demoDateRange = { start: null, end: null };
}
// ===========================================
// NAVIGATION FUNCTIONS
// ===========================================
/**
 * Sets up navigation between onboarding steps
 *
 * @param state - The current onboarding state
 */
function setupNavigation(state) {
    const nextBtn = document.getElementById('nextBtn');
    const backBtn = document.getElementById('backBtn');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            console.log('[MONITOR-SETUP] Next button clicked, currentStep:', state.currentStep, 'totalSteps:', state.totalSteps);
            if (state.currentStep < state.totalSteps) {
                showStep(state, state.currentStep + 1);
            }
            else if (state.currentStep === state.totalSteps) {
                // Complete the monitor setup onboarding
                console.log('[MONITOR-SETUP] On final step, calling completeMonitorSetup');
                yield completeMonitorSetup();
            }
        }));
    }
    else {
        console.error('[MONITOR-SETUP] ❌ Next button not found!');
    }
    backBtn === null || backBtn === void 0 ? void 0 : backBtn.addEventListener('click', () => {
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
function showStep(state, stepNumber) {
    return __awaiter(this, void 0, void 0, function* () {
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
        yield initializeStepFunctionality(stepNumber);
        // Re-render feather icons
        if (typeof window.feather !== 'undefined') {
            window.feather.replace();
        }
        // Check if content overflows and adjust justify-content accordingly
        setTimeout(() => {
            if (targetStep) {
                adjustContentJustification(targetStep);
            }
        }, 10);
    });
}
/**
 * Updates the step indicators in the left panel
 *
 * @param currentStep - The current step number
 */
function updateStepIndicators(currentStep) {
    const stepItems = document.querySelectorAll('.step-item');
    stepItems.forEach((item, index) => {
        const stepNumber = index + 1;
        const circle = item.querySelector('.step-circle');
        if (circle) {
            circle.classList.remove('completed', 'current', 'pending');
            if (stepNumber < currentStep) {
                circle.classList.add('completed');
            }
            else if (stepNumber === currentStep) {
                circle.classList.add('current');
            }
            else {
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
function updateNavigationButtons(state, currentStep) {
    const nextBtn = document.getElementById('nextBtn');
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.style.display = currentStep > 1 ? 'flex' : 'none';
    }
    if (nextBtn) {
        if (currentStep === state.totalSteps) {
            nextBtn.textContent = 'Complete Setup';
            nextBtn.innerHTML = 'Complete Setup <i data-feather="check"></i>';
            // Ensure button is enabled on final step
            nextBtn.disabled = false;
        }
        else {
            nextBtn.textContent = 'Next';
            nextBtn.innerHTML = 'Next <i data-feather="chevron-right"></i>';
            nextBtn.disabled = false;
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
function initializeStepFunctionality(stepNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (stepNumber) {
            case 1:
                // Welcome step - no special functionality needed
                break;
            case 2:
                // Usage statistics step - already has static demo
                break;
            case 3:
                // Student overview step - sorting functionality
                initializeStudentListDemo();
                break;
            case 4:
                // Student details step - accordion functionality
                initializeStudentDetailsDemo();
                break;
            case 5:
                // Completion step - no special functionality needed
                break;
        }
    });
}
/**
 * Initialize calendar demo functionality
 */
function initializeCalendarDemo() {
    // Calendar functionality is handled by global demo functions
    // This is just a placeholder for any step-specific initialization
}
/**
 * Initialize student list demo with sorting
 */
function initializeStudentListDemo() {
    // Ensure the initial sort state is set
    window.demoCurrentSort = 'tokens';
    // Set initial button state
    const sortButtons = document.querySelectorAll('.student-list-section .sort-btn');
    sortButtons.forEach(btn => btn.classList.remove('active'));
    const tokensBtn = document.getElementById('demo-sort-tokens');
    tokensBtn === null || tokensBtn === void 0 ? void 0 : tokensBtn.classList.add('active');
    // Render the student list (will retry if DOM not ready)
    renderDemoStudentList();
}
/**
 * Initialize student details demo
 */
function initializeStudentDetailsDemo() {
    // Render the student details (will retry if DOM not ready)
    renderDemoStudentDetails();
}
/**
 * Renders the demo student details (expanded view)
 */
function renderDemoStudentDetails() {
    const container = document.getElementById('demo-student-details-container');
    if (!container) {
        // If container not found, retry after a short delay
        setTimeout(() => renderDemoStudentDetails(), 50);
        return;
    }
    const students = window.demoStudents;
    const currentSort = window.demoCurrentSort;
    if (!students || students.length === 0)
        return;
    // Sort students the same way as in the main list
    const sortedStudents = [...students].sort((a, b) => {
        if (currentSort === 'tokens') {
            return b.tokens - a.tokens;
        }
        else {
            return a.name.localeCompare(b.name);
        }
    });
    // Use the first student as the demo (highest token user or first alphabetically)
    const demoStudent = sortedStudents[0];
    container.innerHTML = `
        <div class="student-item expanded" data-student-id="${demoStudent.id}">
            <div class="student-header" onclick="toggleDemoStudentAccordion('${demoStudent.id}')">
                <div class="student-name">${demoStudent.name}</div>
                <div class="student-tokens">${demoStudent.tokens.toLocaleString()} tokens</div>
                <i data-feather="chevron-down" class="expand-arrow"></i>
            </div>
            <div class="monitor-student-content">
                <div class="chat-history-list">
                    ${demoStudent.chatHistory.map(chat => `
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
    `;
    // Re-initialize Feather icons
    if (typeof window.feather !== 'undefined') {
        window.feather.replace();
    }
}
// ===========================================
// DEMO FUNCTIONALITY
// ===========================================
/**
 * Sets up all demo functionality for the onboarding session
 */
function setupDemoFunctionality() {
    // Make demo functions globally available
    window.openDemoCalendar = openDemoCalendar;
    window.closeDemoCalendar = closeDemoCalendar;
    window.demoSortStudents = demoSortStudents;
    window.toggleDemoStudentAccordion = toggleDemoStudentAccordion;
    window.demoDownloadChat = demoDownloadChat;
    window.renderDemoStudentList = renderDemoStudentList;
    window.clearDemoDateSelection = clearDemoDateSelection;
}
/**
 * Opens the demo calendar modal
 */
function openDemoCalendar() {
    const modal = document.getElementById('demo-calendar-modal');
    if (modal) {
        modal.style.display = 'flex';
        renderDemoCalendar();
    }
}
/**
 * Closes the demo calendar modal
 */
function closeDemoCalendar() {
    const modal = document.getElementById('demo-calendar-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}
/**
 * Renders the demo calendar
 */
function renderDemoCalendar() {
    const calendar = document.getElementById('demo-calendar');
    if (!calendar)
        return;
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
function generateDemoCalendarHTML(year, month) {
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
        const selectionType = getDateSelectionType(date);
        const isSelected = selectionType !== 'none';
        // Build CSS classes for different selection states
        const selectionClass = isSelected ? `selected ${selectionType}` : '';
        days.push(`
            <div class="calendar-day ${isCurrentMonth ? 'current-month' : 'other-month'} 
                       ${isToday ? 'today' : ''} ${selectionClass}" 
                 data-date="${date.toISOString().split('T')[0]}"
                 data-selection-type="${selectionType}">
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
        <div class="calendar-selection-info">
            <div id="demo-selection-status">No dates selected</div>
            <button class="clear-selection-btn" id="demo-clear-selection" style="display: none;">
                <i data-feather="x"></i> Clear
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
function bindDemoCalendarEvents() {
    // Date selection
    const calendarDays = document.querySelectorAll('.calendar-day');
    calendarDays.forEach(day => {
        day.addEventListener('click', (e) => {
            const target = e.target;
            const dateStr = target.getAttribute('data-date');
            if (dateStr) {
                // Fix timezone issue by ensuring local timezone interpretation
                selectDemoDate(new Date(dateStr + 'T00:00:00'));
            }
        });
    });
    // Close calendar when clicking outside
    const modal = document.getElementById('demo-calendar-modal');
    modal === null || modal === void 0 ? void 0 : modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeDemoCalendar();
        }
    });
    // Close button
    const closeBtn = document.getElementById('demo-close-calendar-btn');
    closeBtn === null || closeBtn === void 0 ? void 0 : closeBtn.addEventListener('click', closeDemoCalendar);
    // OK button
    const okBtn = document.getElementById('demo-calendar-ok-btn');
    okBtn === null || okBtn === void 0 ? void 0 : okBtn.addEventListener('click', () => {
        applyDemoDateSelection();
        closeDemoCalendar();
    });
    // Clear selection button
    const clearBtn = document.getElementById('demo-clear-selection');
    clearBtn === null || clearBtn === void 0 ? void 0 : clearBtn.addEventListener('click', () => {
        clearDemoDateSelection();
    });
    // Re-render feather icons
    if (typeof window.feather !== 'undefined') {
        window.feather.replace();
    }
}
/**
 * Selects a date in the demo calendar with enhanced range handling
 */
function selectDemoDate(date) {
    const dateRange = window.demoDateRange;
    if (!dateRange.start) {
        // First selection
        dateRange.start = date;
        dateRange.end = null;
    }
    else if (!dateRange.end) {
        // Second selection - create range
        if (date < dateRange.start) {
            dateRange.end = dateRange.start;
            dateRange.start = date;
        }
        else {
            dateRange.end = date;
        }
    }
    else {
        // Range exists - show confirmation dialog for clearing
        showRangeClearConfirmation(date);
        return;
    }
    updateDemoSelectedDatesDisplay();
    updateDemoSelectionStatus();
    renderDemoCalendar();
}
/**
 * Shows confirmation dialog when trying to clear an existing range
 */
function showRangeClearConfirmation(newDate) {
    const dateRange = window.demoDateRange;
    const startDate = formatDate(dateRange.start);
    const endDate = formatDate(dateRange.end);
    const newDateStr = formatDate(newDate);
    const confirmed = confirm(`You have selected a date range from ${startDate} to ${endDate}.\n\n` +
        `Clicking ${newDateStr} will clear this range and start a new selection.\n\n` +
        `Do you want to continue?`);
    if (confirmed) {
        dateRange.start = newDate;
        dateRange.end = null;
        updateDemoSelectedDatesDisplay();
        updateDemoSelectionStatus();
        renderDemoCalendar();
    }
}
/**
 * Checks if a date is selected in the demo calendar and returns selection type
 */
function getDateSelectionType(date) {
    const dateRange = window.demoDateRange;
    if (!dateRange.start)
        return 'none';
    if (!dateRange.end) {
        return isSameDay(date, dateRange.start) ? 'single' : 'none';
    }
    if (isSameDay(date, dateRange.start))
        return 'start';
    if (isSameDay(date, dateRange.end))
        return 'end';
    if (date > dateRange.start && date < dateRange.end)
        return 'between';
    return 'none';
}
/**
 * Checks if a date is selected in the demo calendar (legacy function for compatibility)
 */
function isDateSelected(date) {
    const selectionType = getDateSelectionType(date);
    return selectionType !== 'none';
}
/**
 * Clears the demo date selection
 */
function clearDemoDateSelection() {
    const dateRange = window.demoDateRange;
    dateRange.start = null;
    dateRange.end = null;
    updateDemoSelectedDatesDisplay();
    updateDemoSelectionStatus();
    renderDemoCalendar();
}
/**
 * Updates the selected dates display in the demo calendar
 */
function updateDemoSelectedDatesDisplay() {
    const selectedDatesEl = document.getElementById('demo-selected-dates');
    if (!selectedDatesEl)
        return;
    const dateRange = window.demoDateRange;
    if (dateRange.start && !dateRange.end) {
        selectedDatesEl.textContent = `Selected: ${formatDate(dateRange.start)}`;
    }
    else if (dateRange.start && dateRange.end) {
        selectedDatesEl.textContent = `Selected: ${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`;
    }
    else {
        selectedDatesEl.textContent = '';
    }
}
/**
 * Updates the selection status display in the calendar header
 */
function updateDemoSelectionStatus() {
    const statusEl = document.getElementById('demo-selection-status');
    const clearBtn = document.getElementById('demo-clear-selection');
    if (!statusEl || !clearBtn)
        return;
    const dateRange = window.demoDateRange;
    if (!dateRange.start) {
        statusEl.textContent = 'No dates selected';
        clearBtn.style.display = 'none';
    }
    else if (!dateRange.end) {
        statusEl.textContent = `Single date: ${formatDate(dateRange.start)}`;
        clearBtn.style.display = 'inline-flex';
    }
    else {
        statusEl.textContent = `Range: ${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`;
        clearBtn.style.display = 'inline-flex';
    }
}
/**
 * Applies the demo date selection
 */
function applyDemoDateSelection() {
    const dateRange = window.demoDateRange;
    const currentDateDisplay = document.getElementById('demo-current-date-display');
    if (!currentDateDisplay)
        return;
    if (dateRange.start && !dateRange.end) {
        if (isSameDay(dateRange.start, new Date())) {
            currentDateDisplay.textContent = 'Today';
        }
        else {
            currentDateDisplay.textContent = formatDate(dateRange.start);
        }
    }
    else if (dateRange.start && dateRange.end) {
        currentDateDisplay.textContent = `${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`;
    }
    else {
        currentDateDisplay.textContent = 'Today';
    }
}
/**
 * Demo student sorting functionality
 */
function demoSortStudents(sortType) {
    var _a;
    window.demoCurrentSort = sortType;
    // Update button states
    const sortButtons = document.querySelectorAll('.student-list-section .sort-btn');
    sortButtons.forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`demo-sort-${sortType}`);
    activeBtn === null || activeBtn === void 0 ? void 0 : activeBtn.classList.add('active');
    // Re-render student list
    renderDemoStudentList();
    // Also update student details if we're on step 5
    const currentStep = (_a = window.monitorSetupState) === null || _a === void 0 ? void 0 : _a.currentStep;
    if (currentStep === 5) {
        renderDemoStudentDetails();
    }
}
/**
 * Renders the demo student list
 */
function renderDemoStudentList() {
    const studentList = document.getElementById('demo-student-list');
    if (!studentList) {
        // If container not found, retry after a short delay
        setTimeout(() => renderDemoStudentList(), 50);
        return;
    }
    const students = window.demoStudents;
    const currentSort = window.demoCurrentSort;
    if (!students || students.length === 0)
        return;
    // Sort students
    const sortedStudents = [...students].sort((a, b) => {
        if (currentSort === 'tokens') {
            return b.tokens - a.tokens;
        }
        else {
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
    if (typeof window.feather !== 'undefined') {
        window.feather.replace();
    }
}
/**
 * Toggles demo student accordion expand/collapse
 */
function toggleDemoStudentAccordion(studentId) {
    const studentItem = document.querySelector(`[data-student-id="${studentId}"]`);
    if (studentItem) {
        studentItem.classList.toggle('expanded');
        // Recalculate overflow after accordion state change
        const state = window.monitorSetupState;
        const currentStepElement = document.getElementById(`content-step-${state.currentStep}`);
        if (currentStepElement) {
            setTimeout(() => {
                adjustContentJustification(currentStepElement);
            }, 100);
        }
    }
}
/**
 * Demo download chat functionality
 */
function demoDownloadChat(chatId) {
    //START DEBUG LOG : DEBUG-CODE(007)
    // console.log(`📥 Demo download for chat session: ${chatId}`); // 🟡 HIGH: Chat session ID exposure
    //END DEBUG LOG : DEBUG-CODE(007)
    alert(`Demo: Download functionality for chat session ${chatId} will be implemented in the actual monitor dashboard!`);
}
// ===========================================
// HELP SYSTEM
// ===========================================
/**
 * Sets up the help system for the onboarding session
 */
function setupHelpSystem() {
    const helpBtn = document.getElementById('helpBtn');
    helpBtn === null || helpBtn === void 0 ? void 0 : helpBtn.addEventListener('click', () => {
        const state = window.monitorSetupState;
        showHelpModal(state.currentStep, 'Monitor Setup Help', getHelpContent(state.currentStep));
    });
}
/**
 * Gets help content for a specific step
 *
 * @param stepNumber - The step number
 * @returns The help content HTML
 */
function getHelpContent(stepNumber) {
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
function formatDate(date) {
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
function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate();
}
// ===========================================
// COMPLETION FUNCTION
// ===========================================
/**
 * Completes the monitor setup onboarding and updates the course status
 */
function completeMonitorSetup() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            //START DEBUG LOG : DEBUG-CODE(010)
            // console.log("🎉 Completing monitor setup onboarding..."); // 🟢 MEDIUM: Completion logging
            //END DEBUG LOG : DEBUG-CODE(010)
            // Get the current course from the global state
            const currentCourse = window.currentClass;
            if (!currentCourse) {
                throw new Error("Current course not found");
            }
            // Validate courseId exists
            if (!currentCourse.id) {
                throw new Error("Course ID is missing. Cannot update database.");
            }
            // Update the course's monitorSetup status to true locally
            currentCourse.monitorSetup = true;
            //START DEBUG LOG : DEBUG-CODE(011)
            // console.log("✅ Monitor setup status updated to true for course:", currentCourse.courseName); // 🟡 HIGH: Course name exposure
            //END DEBUG LOG : DEBUG-CODE(011)
            // Persist to database
            // console.log(`📡 Updating database: setting monitorSetup=true for course ${currentCourse.id}`); // 🟡 HIGH: Course ID exposure
            const response = yield fetch(`/api/courses/${currentCourse.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    monitorSetup: true
                })
            });
            if (!response.ok) {
                const errorData = yield response.json().catch(() => ({ error: 'Failed to update course in database' }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const result = yield response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to update course in database');
            }
            // console.log("✅ Monitor setup status persisted to database successfully!"); // 🟢 MEDIUM: Database operation success
            // Dispatch the completion event
            const event = new CustomEvent('monitorSetupComplete', {
                detail: {
                    course: currentCourse,
                    completedAt: new Date()
                }
            });
            window.dispatchEvent(event);
            //START DEBUG LOG : DEBUG-CODE(012)
            // console.log("📡 Monitor setup completion event dispatched"); // 🟢 MEDIUM: Event dispatch logging
            //END DEBUG LOG : DEBUG-CODE(012)
        }
        catch (error) {
            //START DEBUG LOG : DEBUG-CODE(013)
            console.error("❌ Error completing monitor setup:", error);
            //END DEBUG LOG : DEBUG-CODE(013)
            // Revert local change on error
            if (window.currentClass) {
                window.currentClass.monitorSetup = false;
            }
            yield showErrorModal("Completion Error", `Failed to complete monitor setup: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
        }
    });
}
// ===========================================
// CLEANUP FUNCTION
// ===========================================
/**
 * Cleans up the monitor setup onboarding session
 */
export const cleanupMonitorSetup = () => {
    //START DEBUG LOG : DEBUG-CODE(008)
    // console.log("🧹 Cleaning up monitor setup onboarding..."); // 🟢 MEDIUM: Cleanup logging
    //END DEBUG LOG : DEBUG-CODE(008)
    // Remove onboarding-active class
    document.body.classList.remove('onboarding-active');
    // Clear global state
    delete window.monitorSetupState;
    delete window.demoStudents;
    delete window.demoCurrentSort;
    delete window.demoDateRange;
    // Clear global demo functions
    delete window.openDemoCalendar;
    delete window.closeDemoCalendar;
    delete window.demoSortStudents;
    delete window.toggleDemoStudentAccordion;
    delete window.demoDownloadChat;
    delete window.renderDemoStudentList;
    delete window.clearDemoDateSelection;
    //START DEBUG LOG : DEBUG-CODE(009)
    // console.log("✅ Monitor setup cleanup completed"); // 🟢 MEDIUM: Cleanup completion
    //END DEBUG LOG : DEBUG-CODE(009)
};
/**
 * Adjusts content justification based on overflow detection
 * If content exceeds available height, uses flex-start for scrolling
 * Otherwise, uses center for better visual balance
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
 * Sets up window resize listener for overflow detection
 *
 * @param state - The monitor setup state object
 */
function setupResizeListener(state) {
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = window.setTimeout(() => {
            const currentStepElement = document.getElementById(`content-step-${state.currentStep}`);
            if (currentStepElement && currentStepElement.classList.contains('active')) {
                adjustContentJustification(currentStepElement);
            }
        }, 100);
    });
}
