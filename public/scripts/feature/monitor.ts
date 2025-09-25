import { renderFeatherIcons } from "../functions/api.js";

/**
 * Monitor Dashboard Types
 */
interface StudentData {
    id: string;
    name: string;
    tokens: number;
    chatHistory: ChatSession[];
}

interface ChatSession {
    id: string;
    title: string;
    date: Date;
    tokensUsed: number;
}

interface UsageStats {
    todayPercentage: number;
    todayTrend: string;
    monthlyPercentage: number;
    monthlyTrend: string;
}

interface DateRange {
    start: Date | null;
    end: Date | null;
}

/**
 * Monitor Dashboard Class
 */
class MonitorDashboard {
    private students: StudentData[] = [];
    private currentSort: 'tokens' | 'name' = 'tokens';
    private selectedDateRange: DateRange = { start: null, end: null };
    private isCalendarOpen: boolean = false;

    constructor() {
        this.initializeMockData();
        this.bindEvents();
        this.render();
    }

    /**
     * Initialize mock data for students and usage statistics
     */
    private initializeMockData(): void {
        // Mock student data with chat history - 20 students
        this.students = [
            { 
                id: '1', 
                name: 'Rusdiyanto, Charisma', 
                tokens: 1351,
                chatHistory: [
                    { id: '1-1', title: 'Thermodynamics Problem Set 3', date: new Date('2024-01-15'), tokensUsed: 450 },
                    { id: '1-2', title: 'Heat Transfer Calculations', date: new Date('2024-01-14'), tokensUsed: 320 },
                    { id: '1-3', title: 'Mass Balance Equations', date: new Date('2024-01-13'), tokensUsed: 280 }
                ]
            },
            { 
                id: '2', 
                name: 'Megury, Christian', 
                tokens: 2500,
                chatHistory: [
                    { id: '2-1', title: 'Fluid Mechanics Lab Report', date: new Date('2024-01-15'), tokensUsed: 680 },
                    { id: '2-2', title: 'Bernoulli Equation Applications', date: new Date('2024-01-14'), tokensUsed: 520 },
                    { id: '2-3', title: 'Reynolds Number Calculations', date: new Date('2024-01-13'), tokensUsed: 410 }
                ]
            },
            { 
                id: '3', 
                name: 'Maximoff, Wanda', 
                tokens: 5700,
                chatHistory: [
                    { id: '3-1', title: 'Process Control Systems Design', date: new Date('2024-01-15'), tokensUsed: 1200 },
                    { id: '3-2', title: 'PID Controller Tuning', date: new Date('2024-01-14'), tokensUsed: 980 },
                    { id: '3-3', title: 'Feedback Control Theory', date: new Date('2024-01-13'), tokensUsed: 750 },
                    { id: '3-4', title: 'Laplace Transform Applications', date: new Date('2024-01-12'), tokensUsed: 650 }
                ]
            },
            { 
                id: '4', 
                name: 'Smith, John', 
                tokens: 1200,
                chatHistory: [
                    { id: '4-1', title: 'Material Properties Analysis', date: new Date('2024-01-15'), tokensUsed: 380 },
                    { id: '4-2', title: 'Stress-Strain Relationships', date: new Date('2024-01-14'), tokensUsed: 290 }
                ]
            },
            { 
                id: '5', 
                name: 'Johnson, Sarah', 
                tokens: 3200,
                chatHistory: [
                    { id: '5-1', title: 'Chemical Reaction Kinetics', date: new Date('2024-01-15'), tokensUsed: 850 },
                    { id: '5-2', title: 'Catalyst Design Principles', date: new Date('2024-01-14'), tokensUsed: 720 },
                    { id: '5-3', title: 'Reaction Rate Constants', date: new Date('2024-01-13'), tokensUsed: 580 }
                ]
            },
            { 
                id: '6', 
                name: 'Williams, Michael', 
                tokens: 1800,
                chatHistory: [
                    { id: '6-1', title: 'Heat Exchanger Design', date: new Date('2024-01-15'), tokensUsed: 520 },
                    { id: '6-2', title: 'Energy Balance Problems', date: new Date('2024-01-14'), tokensUsed: 380 }
                ]
            },
            { 
                id: '7', 
                name: 'Brown, Emily', 
                tokens: 4100,
                chatHistory: [
                    { id: '7-1', title: 'Distillation Column Design', date: new Date('2024-01-15'), tokensUsed: 980 },
                    { id: '7-2', title: 'Vapor-Liquid Equilibrium', date: new Date('2024-01-14'), tokensUsed: 750 },
                    { id: '7-3', title: 'McCabe-Thiele Method', date: new Date('2024-01-13'), tokensUsed: 650 }
                ]
            },
            { 
                id: '8', 
                name: 'Jones, David', 
                tokens: 2900,
                chatHistory: [
                    { id: '8-1', title: 'Pump Selection and Sizing', date: new Date('2024-01-15'), tokensUsed: 680 },
                    { id: '8-2', title: 'Pipe Flow Calculations', date: new Date('2024-01-14'), tokensUsed: 520 }
                ]
            },
            { 
                id: '9', 
                name: 'Garcia, Maria', 
                tokens: 1500,
                chatHistory: [
                    { id: '9-1', title: 'Chemical Safety Protocols', date: new Date('2024-01-15'), tokensUsed: 420 },
                    { id: '9-2', title: 'Hazard Identification', date: new Date('2024-01-14'), tokensUsed: 320 }
                ]
            },
            { 
                id: '10', 
                name: 'Miller, James', 
                tokens: 3800,
                chatHistory: [
                    { id: '10-1', title: 'Reactor Design Principles', date: new Date('2024-01-15'), tokensUsed: 850 },
                    { id: '10-2', title: 'Kinetic Rate Expressions', date: new Date('2024-01-14'), tokensUsed: 720 },
                    { id: '10-3', title: 'Batch vs Continuous Reactors', date: new Date('2024-01-13'), tokensUsed: 580 }
                ]
            },
            { 
                id: '11', 
                name: 'Davis, Jennifer', 
                tokens: 2200,
                chatHistory: [
                    { id: '11-1', title: 'Process Optimization', date: new Date('2024-01-15'), tokensUsed: 620 },
                    { id: '11-2', title: 'Cost-Benefit Analysis', date: new Date('2024-01-14'), tokensUsed: 480 }
                ]
            },
            { 
                id: '12', 
                name: 'Rodriguez, Carlos', 
                tokens: 3400,
                chatHistory: [
                    { id: '12-1', title: 'Environmental Impact Assessment', date: new Date('2024-01-15'), tokensUsed: 780 },
                    { id: '12-2', title: 'Sustainability Metrics', date: new Date('2024-01-14'), tokensUsed: 650 },
                    { id: '12-3', title: 'Green Engineering Principles', date: new Date('2024-01-13'), tokensUsed: 520 }
                ]
            },
            { 
                id: '13', 
                name: 'Martinez, Ana', 
                tokens: 1900,
                chatHistory: [
                    { id: '13-1', title: 'Quality Control Systems', date: new Date('2024-01-15'), tokensUsed: 520 },
                    { id: '13-2', title: 'Statistical Process Control', date: new Date('2024-01-14'), tokensUsed: 380 }
                ]
            },
            { 
                id: '14', 
                name: 'Hernandez, Luis', 
                tokens: 2600,
                chatHistory: [
                    { id: '14-1', title: 'Instrumentation and Control', date: new Date('2024-01-15'), tokensUsed: 680 },
                    { id: '14-2', title: 'Sensor Selection Criteria', date: new Date('2024-01-14'), tokensUsed: 520 }
                ]
            },
            { 
                id: '15', 
                name: 'Lopez, Carmen', 
                tokens: 3100,
                chatHistory: [
                    { id: '15-1', title: 'Plant Layout Design', date: new Date('2024-01-15'), tokensUsed: 750 },
                    { id: '15-2', title: 'Equipment Placement Optimization', date: new Date('2024-01-14'), tokensUsed: 620 },
                    { id: '15-3', title: 'Safety Distance Calculations', date: new Date('2024-01-13'), tokensUsed: 480 }
                ]
            },
            { 
                id: '16', 
                name: 'Gonzalez, Pedro', 
                tokens: 1700,
                chatHistory: [
                    { id: '16-1', title: 'Material Selection Criteria', date: new Date('2024-01-15'), tokensUsed: 480 },
                    { id: '16-2', title: 'Corrosion Resistance Analysis', date: new Date('2024-01-14'), tokensUsed: 360 }
                ]
            },
            { 
                id: '17', 
                name: 'Wilson, Lisa', 
                tokens: 4200,
                chatHistory: [
                    { id: '17-1', title: 'Process Simulation Software', date: new Date('2024-01-15'), tokensUsed: 950 },
                    { id: '17-2', title: 'Aspen Plus Modeling', date: new Date('2024-01-14'), tokensUsed: 780 },
                    { id: '17-3', title: 'Steady State Analysis', date: new Date('2024-01-13'), tokensUsed: 650 }
                ]
            },
            { 
                id: '18', 
                name: 'Anderson, Robert', 
                tokens: 2800,
                chatHistory: [
                    { id: '18-1', title: 'Economic Analysis Methods', date: new Date('2024-01-15'), tokensUsed: 680 },
                    { id: '18-2', title: 'Capital Cost Estimation', date: new Date('2024-01-14'), tokensUsed: 520 }
                ]
            },
            { 
                id: '19', 
                name: 'Taylor, Jessica', 
                tokens: 3600,
                chatHistory: [
                    { id: '19-1', title: 'Process Integration Techniques', date: new Date('2024-01-15'), tokensUsed: 820 },
                    { id: '19-2', title: 'Heat Integration Networks', date: new Date('2024-01-14'), tokensUsed: 680 },
                    { id: '19-3', title: 'Pinch Analysis Methods', date: new Date('2024-01-13'), tokensUsed: 550 }
                ]
            },
            { 
                id: '20', 
                name: 'Thomas, Christopher', 
                tokens: 2400,
                chatHistory: [
                    { id: '20-1', title: 'Risk Assessment Procedures', date: new Date('2024-01-15'), tokensUsed: 620 },
                    { id: '20-2', title: 'Failure Mode Analysis', date: new Date('2024-01-14'), tokensUsed: 480 }
                ]
            }
        ];

        // Initialize with no dates selected
        this.selectedDateRange.start = null;
        this.selectedDateRange.end = null;
    }

    /**
     * Bind event listeners
     */
    private bindEvents(): void {
        // Choose date button
        const chooseDateBtn = document.getElementById('choose-date-btn');
        chooseDateBtn?.addEventListener('click', () => this.openCalendar());

        // Close calendar button
        const closeCalendarBtn = document.getElementById('close-calendar-btn');
        closeCalendarBtn?.addEventListener('click', () => this.closeCalendar());

        // Calendar OK button
        const calendarOkBtn = document.getElementById('calendar-ok-btn');
        calendarOkBtn?.addEventListener('click', () => this.applyDateSelection());

        // Sort buttons
        const sortTokensBtn = document.getElementById('sort-tokens');
        const sortNameBtn = document.getElementById('sort-name');
        
        sortTokensBtn?.addEventListener('click', () => this.setSort('tokens'));
        sortNameBtn?.addEventListener('click', () => this.setSort('name'));

        // Close calendar when clicking outside
        const calendarModal = document.getElementById('calendar-modal');
        calendarModal?.addEventListener('click', (e) => {
            if (e.target === calendarModal) {
                this.closeCalendar();
            }
        });

        // Accordion functionality will be handled by global functions
    }

    /**
     * Render the monitor dashboard
     */
    private render(): void {
        this.renderUsageStats();
        this.renderStudentList();
        this.updateDateDisplay();
        renderFeatherIcons();
    }

    /**
     * Render usage statistics
     */
    private renderUsageStats(): void {
        const stats = this.generateUsageStats();
        
        const todayPercentage = document.getElementById('today-percentage');
        const todayTrend = document.getElementById('today-trend');
        const monthlyPercentage = document.getElementById('monthly-percentage');
        const monthlyTrend = document.getElementById('monthly-trend');

        if (todayPercentage) todayPercentage.textContent = `${stats.todayPercentage}%`;
        if (todayTrend) todayTrend.textContent = stats.todayTrend;
        if (monthlyPercentage) monthlyPercentage.textContent = `${stats.monthlyPercentage}%`;
        if (monthlyTrend) monthlyTrend.textContent = stats.monthlyTrend;
    }

    /**
     * Generate mock usage statistics based on selected date range
     */
    private generateUsageStats(): UsageStats {
        // Mock data generation based on date range
        const isToday = this.isToday(this.selectedDateRange.start);
        const isRange = this.selectedDateRange.end !== null;

        return {
            todayPercentage: isToday ? 6 : Math.floor(Math.random() * 20) + 1,
            todayTrend: isToday ? '↑ 12% from yesterday' : '↑ 8% from previous day',
            monthlyPercentage: isRange ? 73 : Math.floor(Math.random() * 30) + 50,
            monthlyTrend: isRange ? '1 days remaining' : `${Math.floor(Math.random() * 10) + 1} days remaining`
        };
    }

    /**
     * Render student list with accordion functionality
     */
    private renderStudentList(): void {
        const studentList = document.getElementById('student-list');
        if (!studentList) return;

        const sortedStudents = this.getSortedStudents();
        
        studentList.innerHTML = sortedStudents.map(student => `
            <div class="student-item" data-student-id="${student.id}">
                <div class="student-header" onclick="toggleMonitorStudentAccordion('${student.id}')">
                <div class="student-name">${student.name}</div>
                <div class="student-tokens">${student.tokens.toLocaleString()} tokens</div>
                    <i data-feather="chevron-down" class="expand-arrow"></i>
                </div>
                <div class="monitor-student-content">
                    <div class="chat-history-list">
                        ${student.chatHistory.map(chat => `
                            <div class="chat-history-item">
                                <div class="chat-title">${chat.title}</div>
                                <button class="download-button" onclick="downloadChatHistory('${chat.id}')">
                                    <i data-feather="download"></i>
                                    Download
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('');

        // Re-render feather icons for the new content
        renderFeatherIcons();
    }

    /**
     * Get sorted students based on current sort option
     */
    private getSortedStudents(): StudentData[] {
        const students = [...this.students];
        
        if (this.currentSort === 'tokens') {
            return students.sort((a, b) => b.tokens - a.tokens);
        } else {
            return students.sort((a, b) => a.name.localeCompare(b.name));
        }
    }

    /**
     * Set sort option and update UI
     */
    private setSort(sort: 'tokens' | 'name'): void {
        this.currentSort = sort;
        
        // Update button states
        const sortButtons = document.querySelectorAll('.sort-btn');
        sortButtons.forEach(btn => btn.classList.remove('active'));
        
        const activeBtn = document.getElementById(`sort-${sort}`);
        activeBtn?.classList.add('active');
        
        // Re-render student list
        this.renderStudentList();
    }

    /**
     * Open calendar modal
     */
    private openCalendar(): void {
        const calendarModal = document.getElementById('calendar-modal');
        if (calendarModal) {
            calendarModal.style.display = 'flex';
            this.isCalendarOpen = true;
            this.renderCalendar();
        }
    }

    /**
     * Close calendar modal
     */
    private closeCalendar(): void {
        const calendarModal = document.getElementById('calendar-modal');
        if (calendarModal) {
            calendarModal.style.display = 'none';
            this.isCalendarOpen = false;
        }
    }

    /**
     * Render calendar
     */
    private renderCalendar(): void {
        const calendar = document.getElementById('calendar');
        if (!calendar) return;

        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        // Generate calendar HTML
        const calendarHTML = this.generateCalendarHTML(currentYear, currentMonth);
        calendar.innerHTML = calendarHTML;

        // Bind calendar date selection events
        this.bindCalendarEvents();
    }

    /**
     * Generate calendar HTML for a given month/year
     */
    private generateCalendarHTML(year: number, month: number): string {
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
            const isToday = this.isSameDay(date, today);
            const selectionType = this.getDateSelectionType(date);
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
                <button class="calendar-nav-btn" id="prev-month">
                    <i data-feather="chevron-left"></i>
                </button>
                <h3>${monthNames[month]} ${year}</h3>
                <button class="calendar-nav-btn" id="next-month">
                    <i data-feather="chevron-right"></i>
                </button>
            </div>
            <div class="calendar-selection-info">
                <div id="selection-status">No dates selected</div>
                <button class="clear-selection-btn" id="clear-selection" style="display: none;">
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
     * Bind calendar event listeners
     */
    private bindCalendarEvents(): void {
        // Date selection
        const calendarDays = document.querySelectorAll('.calendar-day');
        calendarDays.forEach(day => {
            day.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const dateStr = target.getAttribute('data-date');
                if (dateStr) {
                    // Fix timezone issue by ensuring local timezone interpretation
                    this.selectDate(new Date(dateStr + 'T00:00:00'));
                }
            });
        });

        // Month navigation
        const prevMonthBtn = document.getElementById('prev-month');
        const nextMonthBtn = document.getElementById('next-month');
        
        prevMonthBtn?.addEventListener('click', () => this.navigateMonth(-1));
        nextMonthBtn?.addEventListener('click', () => this.navigateMonth(1));

        // Clear selection button
        const clearBtn = document.getElementById('clear-selection');
        clearBtn?.addEventListener('click', () => this.clearDateSelection());

        renderFeatherIcons();
    }

    /**
     * Navigate to previous/next month
     */
    private navigateMonth(direction: number): void {
        // This would update the calendar view
        // For now, we'll just re-render with current month
        this.renderCalendar();
    }

    /**
     * Select a date in the calendar with enhanced range handling
     */
    private selectDate(date: Date): void {
        if (!this.selectedDateRange.start) {
            // First selection
            this.selectedDateRange.start = date;
            this.selectedDateRange.end = null;
        } else if (!this.selectedDateRange.end) {
            // Second selection - create range
            if (date < this.selectedDateRange.start) {
                this.selectedDateRange.end = this.selectedDateRange.start;
                this.selectedDateRange.start = date;
            } else {
                this.selectedDateRange.end = date;
            }
        } else {
            // Range exists - show confirmation dialog for clearing
            this.showRangeClearConfirmation(date);
            return;
        }

        this.updateSelectedDatesDisplay();
        this.updateSelectionStatus();
        this.renderCalendar();
    }

    /**
     * Shows confirmation dialog when trying to clear an existing range
     */
    private showRangeClearConfirmation(newDate: Date): void {
        const startDate = this.formatDate(this.selectedDateRange.start!);
        const endDate = this.formatDate(this.selectedDateRange.end!);
        const newDateStr = this.formatDate(newDate);
        
        const confirmed = confirm(
            `You have selected a date range from ${startDate} to ${endDate}.\n\n` +
            `Clicking ${newDateStr} will clear this range and start a new selection.\n\n` +
            `Do you want to continue?`
        );
        
        if (confirmed) {
            this.selectedDateRange.start = newDate;
            this.selectedDateRange.end = null;
            this.updateSelectedDatesDisplay();
            this.updateSelectionStatus();
            this.renderCalendar();
        }
    }

    /**
     * Checks if a date is selected and returns selection type
     */
    private getDateSelectionType(date: Date): 'none' | 'start' | 'end' | 'between' | 'single' {
        if (!this.selectedDateRange.start) return 'none';
        
        if (!this.selectedDateRange.end) {
            return this.isSameDay(date, this.selectedDateRange.start) ? 'single' : 'none';
        }
        
        if (this.isSameDay(date, this.selectedDateRange.start)) return 'start';
        if (this.isSameDay(date, this.selectedDateRange.end)) return 'end';
        if (date > this.selectedDateRange.start && date < this.selectedDateRange.end) return 'between';
        
        return 'none';
    }

    /**
     * Check if a date is selected (legacy function for compatibility)
     */
    private isDateSelected(date: Date): boolean {
        const selectionType = this.getDateSelectionType(date);
        return selectionType !== 'none';
    }

    /**
     * Clears the date selection
     */
    private clearDateSelection(): void {
        this.selectedDateRange.start = null;
        this.selectedDateRange.end = null;
        
        this.updateSelectedDatesDisplay();
        this.updateSelectionStatus();
        this.renderCalendar();
    }

    /**
     * Update selected dates display
     */
    private updateSelectedDatesDisplay(): void {
        const selectedDatesEl = document.getElementById('selected-dates');
        if (!selectedDatesEl) return;

        if (this.selectedDateRange.start && !this.selectedDateRange.end) {
            selectedDatesEl.textContent = `Selected: ${this.formatDate(this.selectedDateRange.start)}`;
        } else if (this.selectedDateRange.start && this.selectedDateRange.end) {
            selectedDatesEl.textContent = `Selected: ${this.formatDate(this.selectedDateRange.start)} - ${this.formatDate(this.selectedDateRange.end)}`;
        } else {
            selectedDatesEl.textContent = '';
        }
    }

    /**
     * Updates the selection status display in the calendar header
     */
    private updateSelectionStatus(): void {
        const statusEl = document.getElementById('selection-status');
        const clearBtn = document.getElementById('clear-selection');
        
        if (!statusEl || !clearBtn) return;

        if (!this.selectedDateRange.start) {
            statusEl.textContent = 'No dates selected';
            clearBtn.style.display = 'none';
        } else if (!this.selectedDateRange.end) {
            statusEl.textContent = `Single date: ${this.formatDate(this.selectedDateRange.start)}`;
            clearBtn.style.display = 'inline-flex';
        } else {
            statusEl.textContent = `Range: ${this.formatDate(this.selectedDateRange.start)} - ${this.formatDate(this.selectedDateRange.end)}`;
            clearBtn.style.display = 'inline-flex';
        }
    }

    /**
     * Apply date selection and close calendar
     */
    private applyDateSelection(): void {
        this.updateDateDisplay();
        this.updateSelectionStatus();
        this.renderUsageStats();
        this.closeCalendar();
    }

    /**
     * Update date display in header
     */
    private updateDateDisplay(): void {
        const currentDateDisplay = document.getElementById('current-date-display');
        if (!currentDateDisplay) return;

        if (this.selectedDateRange.start && !this.selectedDateRange.end) {
            if (this.isToday(this.selectedDateRange.start)) {
                currentDateDisplay.textContent = 'Today';
            } else {
                currentDateDisplay.textContent = this.formatDate(this.selectedDateRange.start);
            }
        } else if (this.selectedDateRange.start && this.selectedDateRange.end) {
            currentDateDisplay.textContent = `${this.formatDate(this.selectedDateRange.start)} - ${this.formatDate(this.selectedDateRange.end)}`;
        } else {
            currentDateDisplay.textContent = 'Today';
        }
    }

    /**
     * Format date for display
     */
    private formatDate(date: Date): string {
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
        });
    }

    /**
     * Check if date is today
     */
    private isToday(date: Date | null): boolean {
        if (!date) return false;
        return this.isSameDay(date, new Date());
    }

    /**
     * Check if two dates are the same day
     */
    private isSameDay(date1: Date, date2: Date): boolean {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

}

/**
 * Global functions for accordion functionality
 */
declare global {
    function toggleMonitorStudentAccordion(studentId: string): void;
    function downloadChatHistory(chatId: string): void;
}

/**
 * Toggle student accordion expand/collapse
 */
function toggleMonitorStudentAccordion(studentId: string): void {
    const studentItem = document.querySelector(`[data-student-id="${studentId}"]`);
    if (studentItem) {
        studentItem.classList.toggle('expanded');
    }
}

// Make function globally available
(window as any).toggleMonitorStudentAccordion = toggleMonitorStudentAccordion;

/**
 * Download chat history (placeholder function)
 */
function downloadChatHistory(chatId: string): void {
    console.log(`Downloading chat history for session: ${chatId}`);
    // TODO: Implement actual download functionality
    alert(`Download functionality for chat session ${chatId} will be implemented soon!`);
}

/**
 * Initialize Monitor Dashboard
 */
export function initializeMonitorDashboard(): void {
    //START DEBUG LOG : DEBUG-CODE(001)
    console.log('🚀 Initializing Monitor Dashboard...');
    //END DEBUG LOG : DEBUG-CODE(001)
    
    new MonitorDashboard();
    
    //START DEBUG LOG : DEBUG-CODE(002)
    console.log('✅ Monitor Dashboard initialized successfully');
    //END DEBUG LOG : DEBUG-CODE(002)
}

