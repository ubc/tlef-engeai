import { renderFeatherIcons } from "../api/api.js";
import { authService } from "../services/auth-service.js";
import { fetchCourseMongoBackupZip } from "./course-mongo-backup-download.js";
import { openConversationExportFormatModal } from "./conversations-export-modal.js";
import { fetchCourseReportPdf } from "./report-pdf-download.js";
import { chartsController, mapCourseSummaryStackedBarToChartSpec } from "../ui/charts.js";
import type {
    CourseSummaryStruggleTopics,
    MemoryAgentChapterStruggle,
    StruggleStatsLegendItem
} from "../types.js";

/**
 * Monitor Dashboard Types
 */
type MonitorActivePanel = 'none' | 'conversations' | 'struggle';

interface UserData {
    id: string;
    name: string;
    role: 'student' | 'instructor' | 'admin';
    conversationCount: number;
    struggleTopicCount: number;
    struggleTopics: string[];
    struggleTopicsByChapter: MemoryAgentChapterStruggle[];
    activePanel: MonitorActivePanel;
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
    private users: UserData[] = [];
    private struggleTopics: CourseSummaryStruggleTopics | null = null;
    private currentSort: 'conversations' | 'name' | 'struggle' = 'conversations';
    private selectedDateRange: DateRange = { start: null, end: null };
    private isCalendarOpen: boolean = false;
    private courseId: string | null = null;

    constructor() {
        this.getCourseId();
        void this.loadStruggleStats();
        void this.configureMongoBackupButton();
        this.bindEvents();
        this.render();
    }

    /**
     * Get course ID from global context
     */
    private getCourseId(): void {
        // Try to get from window.currentClass (set by instructor-mode.ts)
        if (typeof window !== 'undefined' && (window as any).currentClass && (window as any).currentClass.id) {
            this.courseId = (window as any).currentClass.id;
            // console.log('[MONITOR] Course ID:', this.courseId); // 🟡 HIGH: Course ID exposure
        } else {
            console.error('[MONITOR] ❌ No course ID found in context'); // Keep - from error condition
        }
    }

    /**
     * Load struggle stats and per-user monitor rows from API.
     */
    private async loadStruggleStats(): Promise<void> {
        if (!this.courseId) {
            console.error('[MONITOR] ❌ Cannot load struggle stats: no course ID');
            this.users = [];
            this.struggleTopics = null;
            this.render();
            return;
        }

        try {
            const response = await fetch(`/api/courses/monitor/${this.courseId}/struggle-stats`, {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success && result.data) {
                this.struggleTopics = result.data.struggleTopics as CourseSummaryStruggleTopics;
                this.users = (result.data.users || []).map((user: {
                    userId: string;
                    userName: string;
                    role: UserData['role'];
                    conversationCount: number;
                    struggleTopicCount: number;
                    struggleTopics: string[];
                    struggleTopicsByChapter: MemoryAgentChapterStruggle[];
                    chats: Array<{ id: string; title: string }>;
                }) => ({
                    id: user.userId,
                    name: user.userName,
                    role: user.role || 'student',
                    conversationCount: user.conversationCount ?? (user.chats || []).length,
                    struggleTopicCount: user.struggleTopicCount ?? 0,
                    struggleTopics: user.struggleTopics ?? [],
                    struggleTopicsByChapter: user.struggleTopicsByChapter ?? [],
                    activePanel: 'none' as MonitorActivePanel,
                    chatHistory: (user.chats || []).map((chat) => ({
                        id: chat.id,
                        title: chat.title,
                        date: new Date(),
                        tokensUsed: 0
                    }))
                }));
            } else {
                console.error('[MONITOR] ❌ Failed to load struggle stats:', result.error);
                this.users = [];
                this.struggleTopics = null;
            }
        } catch (error) {
            console.error('[MONITOR] ❌ Error loading struggle stats:', error);
            this.users = [];
            this.struggleTopics = null;
        }

        this.render();
        await this.renderStruggleChart();
    }


    /**
     * Show Mongo backup button only for platform admins.
     */
    private async configureMongoBackupButton(): Promise<void> {
        const mongoBackupBtn = document.getElementById('monitor-course-mongo-backup-btn');
        if (!mongoBackupBtn) return;

        try {
            await authService.checkAuthStatus();
            const user = authService.getUser();
            if (user?.isAdmin) {
                mongoBackupBtn.classList.remove('monitor-backup-hidden');
            } else {
                mongoBackupBtn.classList.add('monitor-backup-hidden');
            }
        } catch {
            mongoBackupBtn.classList.add('monitor-backup-hidden');
        }
    }

    private static roleBadgeLabel(role: UserData['role']): string {
        if (role === 'admin') return 'Admin';
        if (role === 'instructor') return 'Instructor';
        return 'Student';
    }

    /**
     * Bind event listeners
     */
    private bindEvents(): void {
        // COMMENTED OUT: Calendar functionality hidden as requested
        // Choose date button
        // const chooseDateBtn = document.getElementById('choose-date-btn');
        // chooseDateBtn?.addEventListener('click', () => this.openCalendar());

        // Close calendar button
        // const closeCalendarBtn = document.getElementById('close-calendar-btn');
        // closeCalendarBtn?.addEventListener('click', () => this.closeCalendar());

        // Calendar OK button
        // const calendarOkBtn = document.getElementById('calendar-ok-btn');
        // calendarOkBtn?.addEventListener('click', () => this.applyDateSelection());

        // Sort dropdown
        const sortSelect = document.getElementById('sort-select') as HTMLSelectElement | null;
        sortSelect?.addEventListener('change', (e) => {
            const value = (e.target as HTMLSelectElement).value as 'conversations' | 'name' | 'struggle';
            this.setSort(value);
        });

        const downloadConversationsBtn = document.getElementById('monitor-download-conversations-btn');
        downloadConversationsBtn?.addEventListener('click', () => {
            if (!this.courseId) {
                alert('Error: Course ID not found. Please refresh the page.');
                return;
            }
            openConversationExportFormatModal(this.courseId);
        });

        const downloadReportBtn = document.getElementById('monitor-download-report-btn');
        downloadReportBtn?.addEventListener('click', () => {
            if (!this.courseId) {
                alert('Error: Course ID not found. Please refresh the page.');
                return;
            }
            const btn = downloadReportBtn as HTMLButtonElement;
            btn.disabled = true;
            void fetchCourseReportPdf(this.courseId).catch((err) => {
                alert(`Report download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }).finally(() => {
                btn.disabled = false;
            });
        });

        const mongoBackupBtn = document.getElementById('monitor-course-mongo-backup-btn');
        mongoBackupBtn?.addEventListener('click', () => {
            if (!this.courseId) {
                alert('Error: Course ID not found. Please refresh the page.');
                return;
            }
            const btn = mongoBackupBtn as HTMLButtonElement;
            btn.disabled = true;
            void fetchCourseMongoBackupZip(this.courseId).catch((err) => {
                alert(`Mongo backup failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }).finally(() => {
                btn.disabled = false;
            });
        });

        // COMMENTED OUT: Calendar modal click handler
        // Close calendar when clicking outside
        // const calendarModal = document.getElementById('calendar-modal');
        // calendarModal?.addEventListener('click', (e) => {
        //     if (e.target === calendarModal) {
        //         this.closeCalendar();
        //     }
        // });

    }

    private toggleUserPanel(userId: string, panel: 'conversations' | 'struggle'): void {
        this.users = this.users.map((user) => {
            if (user.id !== userId) {
                return { ...user, activePanel: 'none' as MonitorActivePanel };
            }
            const nextPanel: MonitorActivePanel = user.activePanel === panel ? 'none' : panel;
            return { ...user, activePanel: nextPanel };
        });
        this.syncUserPanelExpansion(true);
        renderFeatherIcons();
    }

    /**
     * Apply expanded/collapsed panel state in the DOM (optionally animated).
     */
    private syncUserPanelExpansion(animate: boolean): void {
        const userList = document.getElementById('student-list');
        if (!userList) return;

        const applyState = (item: HTMLElement, user: UserData): void => {
            const convBtn = item.querySelector('.monitor-btn-conversations');
            const struggleBtn = item.querySelector('.monitor-btn-struggle');
            const convWrap = item.querySelector('.monitor-user-panel-wrap--conversations');
            const struggleWrap = item.querySelector('.monitor-user-panel-wrap--struggle');

            convBtn?.classList.toggle('monitor-btn--active', user.activePanel === 'conversations');
            struggleBtn?.classList.toggle('monitor-btn--active', user.activePanel === 'struggle');

            convWrap?.classList.toggle('is-expanded', user.activePanel === 'conversations');
            struggleWrap?.classList.toggle('is-expanded', user.activePanel === 'struggle');
        };

        this.users.forEach((user) => {
            const item = userList.querySelector<HTMLElement>(
                `.student-item[data-student-id="${CSS.escape(user.id)}"]`
            );
            if (!item) return;

            if (!animate) {
                applyState(item, user);
                return;
            }

            item.querySelector('.monitor-user-panel-wrap--conversations')?.classList.remove('is-expanded');
            item.querySelector('.monitor-user-panel-wrap--struggle')?.classList.remove('is-expanded');
            void item.offsetHeight;

            requestAnimationFrame(() => {
                applyState(item, user);
            });
        });
    }

    /**
     * Render the monitor dashboard
     */
    private render(): void {
        this.renderUsageStats();
        this.renderUserList();
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
        // Set tokens to 0 for both boxes as requested
        return {
            todayPercentage: 0,
            todayTrend: '0% from yesterday',
            monthlyPercentage: 0,
            monthlyTrend: '0 days remaining'
        };
    }

    private renderStruggleLegend(legend: StruggleStatsLegendItem[]): void {
        const legendEl = document.getElementById('monitor-struggle-legend');
        if (!legendEl) return;

        const visibleLegend = legend.filter((item) => item.studentCount > 0);

        if (!visibleLegend.length) {
            legendEl.innerHTML = '<p class="monitor-struggle-legend-empty">No struggle topic data yet.</p>';
            return;
        }

        legendEl.innerHTML = visibleLegend
            .map(
                (item) => `
            <div class="monitor-struggle-legend-item">
                <span class="monitor-struggle-legend-swatch" style="background-color: ${item.color}"></span>
                <span class="monitor-struggle-legend-label">${item.topic}</span>
                <span class="monitor-struggle-legend-count">${item.studentCount}</span>
            </div>
        `
            )
            .join('');
    }

    private async renderStruggleChart(): Promise<void> {
        const canvas = document.getElementById('monitor-struggle-chart') as HTMLCanvasElement | null;
        const stackedBar = this.struggleTopics?.stackedBar;
        const legend = this.struggleTopics?.legend ?? [];

        this.renderStruggleLegend(legend);

        if (!stackedBar?.categories?.length || !stackedBar.series?.length) {
            chartsController.destroyActiveChart();
            return;
        }

        const spec = mapCourseSummaryStackedBarToChartSpec(stackedBar);
        await chartsController.renderStackedBarChart(canvas, spec, { showLegend: false });
    }

    private renderStrugglePanelContent(user: UserData): string {
        if (!user.struggleTopicsByChapter.length) {
            return '<p class="monitor-panel-empty">No struggle topics recorded.</p>';
        }

        return user.struggleTopicsByChapter
            .map(
                (chapter) => `
            <div class="monitor-struggle-chapter">
                <h4 class="monitor-struggle-chapter-title">${chapter.topicOrWeekTitle}</h4>
                <ul class="monitor-struggle-label-list">
                    ${chapter.struggleTopics.map((label) => `<li>${label}</li>`).join('')}
                </ul>
            </div>
        `
            )
            .join('');
    }

    /**
     * Render user list with conversation and struggle action buttons.
     */
    private renderUserList(): void {
        const userList = document.getElementById('student-list');
        if (!userList) return;

        const userCountEl = document.getElementById('user-count');
        if (userCountEl) {
            userCountEl.textContent = `(${this.users.length})`;
        }

        const sortedUsers = this.getSortedUsers();

        userList.innerHTML = sortedUsers
            .map((user) => {
                const convActive = user.activePanel === 'conversations' ? ' monitor-btn--active' : '';
                const struggleActive = user.activePanel === 'struggle' ? ' monitor-btn--active' : '';

                return `
            <div class="student-item" data-student-id="${user.id}">
                <div class="student-header">
                    <div class="student-name">
                        <span class="role-badge role-${user.role}">${MonitorDashboard.roleBadgeLabel(user.role)}</span>
                        ${user.name}
                    </div>
                    <div class="monitor-user-actions">
                        <button type="button" class="monitor-btn-conversations${convActive}" data-action="conversations" data-user-id="${user.id}">
                            ${user.conversationCount} conversation${user.conversationCount !== 1 ? 's' : ''}
                        </button>
                        <button type="button" class="monitor-btn-struggle${struggleActive}" data-action="struggle" data-user-id="${user.id}">
                            ${user.struggleTopicCount} struggle topic${user.struggleTopicCount !== 1 ? 's' : ''}
                        </button>
                    </div>
                </div>
                <div class="monitor-user-panel-wrap monitor-user-panel-wrap--conversations${
                    user.activePanel === 'conversations' ? ' is-expanded' : ''
                }">
                    <div class="monitor-user-panel-inner">
                        <div class="monitor-user-panel monitor-user-panel--conversations">
                            <div class="chat-history-list">
                                ${
                                    user.chatHistory.length
                                        ? user.chatHistory
                                              .map(
                                                  (chat) => `
                                <div class="chat-history-item">
                                    <div class="chat-title">${chat.title}</div>
                                    <button class="download-button" onclick="downloadChatHistory('${chat.id}')">
                                        <i data-feather="download"></i>
                                        Download
                                    </button>
                                </div>
                            `
                                              )
                                              .join('')
                                        : '<p class="monitor-panel-empty">No conversations yet.</p>'
                                }
                            </div>
                        </div>
                    </div>
                </div>
                <div class="monitor-user-panel-wrap monitor-user-panel-wrap--struggle${
                    user.activePanel === 'struggle' ? ' is-expanded' : ''
                }">
                    <div class="monitor-user-panel-inner">
                        <div class="monitor-user-panel monitor-user-panel--struggle">
                            ${this.renderStrugglePanelContent(user)}
                        </div>
                    </div>
                </div>
            </div>
        `;
            })
            .join('');

        userList.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.userId;
                const action = btn.dataset.action as 'conversations' | 'struggle' | undefined;
                if (userId && action) {
                    this.toggleUserPanel(userId, action);
                }
            });
        });

        this.syncUserPanelExpansion(false);
        renderFeatherIcons();
    }

    /**
     * Get sorted users based on current sort option
     */
    private getSortedUsers(): UserData[] {
        const users = [...this.users];
        
        if (this.currentSort === 'conversations') {
            return users.sort((a, b) => b.conversationCount - a.conversationCount);
        }
        if (this.currentSort === 'struggle') {
            return users.sort((a, b) => b.struggleTopicCount - a.struggleTopicCount);
        }
        return users.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Set sort option and update UI
     */
    private setSort(sort: 'conversations' | 'name' | 'struggle'): void {
        this.currentSort = sort;
        
        // Update dropdown value
        const sortSelect = document.getElementById('sort-select') as HTMLSelectElement | null;
        if (sortSelect) sortSelect.value = sort;
        
        // Re-render user list
        this.renderUserList();
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

declare global {
    function downloadChatHistory(chatId: string): void;
}

/**
 * Download chat history for a specific chat
 */
async function downloadChatHistory(chatId: string): Promise<void> {
    try {
        // Get course ID from global context
        let courseId: string | null = null;
        if (typeof window !== 'undefined' && (window as any).currentClass && (window as any).currentClass.id) {
            courseId = (window as any).currentClass.id;
        }
        
        if (!courseId) {
            alert('Error: Course ID not found. Please refresh the page.');
            return;
        }

        // Call the download endpoint
        const response = await fetch(`/api/courses/monitor/${courseId}/chat/${chatId}/download`, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to download chat' }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        // Get the text content from response
        const textContent = await response.text();
        
        // Get filename from Content-Disposition header or use default
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `chat-${chatId}.txt`;
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }
        
        // Create a blob and download it
        const blob = new Blob([textContent], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        // console.log(`[MONITOR] ✅ Chat downloaded successfully: ${filename}`); // 🟢 MEDIUM: Filename exposure

    } catch (error) {
        console.error('[MONITOR] ❌ Error downloading chat:', error);
        alert(`Failed to download chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Make function globally available for inline onclick handlers
(window as any).downloadChatHistory = downloadChatHistory;

/**
 * Initialize Monitor Dashboard
 */
export function initializeMonitorDashboard(): void {
    //START DEBUG LOG : DEBUG-CODE(001)
    // console.log('🚀 Initializing Monitor Dashboard...'); // 🟢 MEDIUM: Initialization logging
    //END DEBUG LOG : DEBUG-CODE(001)
    
    new MonitorDashboard();
    
    //START DEBUG LOG : DEBUG-CODE(002)
    // console.log('✅ Monitor Dashboard initialized successfully'); // 🟢 MEDIUM: Success logging
    //END DEBUG LOG : DEBUG-CODE(002)
}

