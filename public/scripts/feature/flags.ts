/**
 * Flag Management System
 * 
 * @author: Assistant
 * @date: 2025-01-27
 * @version: 4.0.0
 * @description: Dynamic flag management interface - renders content from data using TypeScript
 */

// Types for flags - matching backend FlagReport interface
interface FlagReport {
    id: string;
    courseName: string;
    date: Date;
    flagType: 'innacurate_response' | 'harassment' | 'inappropriate' | 'dishonesty' | 'interface bug' | 'other';
    reportType: string;
    chatContent: string;
    userId: number;
    status: 'unresolved' | 'resolved';
    response?: string;
    createdAt: Date;
    updatedAt: Date;
    // Additional fields from API
    userName?: string;
    userPuid?: string;
    userAffiliation?: string;
    // Frontend-specific fields
    collapsed?: boolean;
    timestamp?: string; // Formatted timestamp for display
    studentName?: string; // Computed from userName
}

// Global variable to store flag data
let flagData: FlagReport[] = [];

// Calendar state
let isCalendarOpen: boolean = false;
let selectedStartDate: Date | null = null;
let selectedEndDate: Date | null = null;

// API configuration
const API_BASE_URL = '/api/courses';

/**
 * Fetch flags from the backend API
 * @param courseId - The course ID to fetch flags for
 * @returns Promise<FlagReport[]> - Array of flags with user names resolved
 */
async function fetchFlags(courseId: string): Promise<FlagReport[]> {
    try {
        console.log('🔍 Fetching flags for course:', courseId);
        
        const response = await fetch(`${API_BASE_URL}/${courseId}/flags/with-names`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const apiResponse = await response.json();
        console.log('🔍 Flags API response:', apiResponse);

        if (!apiResponse.success) {
            throw new Error(apiResponse.error || 'Failed to fetch flags');
        }

        // Transform API data to frontend format
        const transformedFlags = apiResponse.data.map((flag: any) => ({
            ...flag,
            // Convert date strings to Date objects
            date: new Date(flag.date || flag.createdAt),
            createdAt: new Date(flag.createdAt || new Date()),
            updatedAt: new Date(flag.updatedAt || flag.createdAt || new Date()),
            // Format timestamp for display
            timestamp: formatTimestamp(new Date(flag.createdAt || new Date())),
            // Use userName as studentName for display
            studentName: flag.userName || 'Unknown Student',
            // Set default collapsed state
        collapsed: true
        }));

        console.log('✅ Successfully fetched', transformedFlags.length, 'flags');
        return transformedFlags;

    } catch (error) {
        console.error('❌ Error fetching flags:', error);
        
        // Show error message to user
        showErrorMessage('Failed to load flags. Please refresh the page and try again.');
        
        // Return empty array as fallback
        return [];
    }
}

/**
 * Format timestamp for display
 * @param date - Date object to format
 * @returns Formatted timestamp string
 */
function formatTimestamp(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    } else if (diffDays === 1) {
        return 'Yesterday, ' + date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    } else if (diffDays < 7) {
        return date.toLocaleDateString('en-US', { 
            weekday: 'long',
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    } else {
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    }
}

/**
 * Show error message to user
 * @param message - Error message to display
 */
function showErrorMessage(message: string): void {
    // Create error message element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        background-color: #fee;
        border: 1px solid #fcc;
        color: #c33;
        padding: 12px;
        margin: 10px 0;
        border-radius: 4px;
        font-size: 14px;
    `;
    errorDiv.textContent = message;
    
    // Insert at the top of the flags container
    const flagsContainer = document.getElementById('flags-container');
    if (flagsContainer) {
        flagsContainer.insertBefore(errorDiv, flagsContainer.firstChild);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }
}

// Mock data for fallback (empty array - API will provide real data)
const mockFlagData: FlagReport[] = [];

// Current filter state
let currentFilters = {
    flagTypes: new Set(['innacurate_response', 'harassment', 'inappropriate', 'dishonesty', 'interface bug', 'other']),
    timeFilter: 'recent' as 'recent' | 'former'
};

let currentSection: 'unresolved-flags' | 'resolved-flags' = 'unresolved-flags';

/**
 * Initialize the flag management interface
 */
export async function initializeFlags(): Promise<void> {
    try {
        // Get course ID from URL or global context
        const courseId = getCourseIdFromContext();
        
        if (!courseId) {
            console.error('❌ No course ID found in context');
            showErrorMessage('Unable to determine course context. Please refresh the page.');
            return;
        }

        console.log('🔍 Initializing flags for course:', courseId);
        
        // Show loading state
        showLoadingState();
        
        // Fetch flags from API
        flagData = await fetchFlags(courseId);
        
        // Hide loading state
        hideLoadingState();
        
        // Render flags with fetched data
        renderFlags();
        
        // Setup event listeners
        setupEventListeners();
        
        // Update navigation stats
        updateActiveNavigation();
        
        console.log('✅ Flags initialized successfully');
        
    } catch (error) {
        console.error('❌ Error initializing flags:', error);
        
        // Hide loading state
        hideLoadingState();
        
        // Show error message
        showErrorMessage('Failed to initialize flags. Please refresh the page and try again.');
        
        // Fallback to mock data for development
        console.log('🔄 Falling back to mock data for development');
        flagData = mockFlagData;
        renderFlags();
        setupEventListeners();
        updateActiveNavigation();
    }
}

/**
 * Get course ID from URL or global context
 * @returns Course ID string or null if not found
 */
function getCourseIdFromContext(): string | null {
    // Try to get from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const courseIdFromUrl = urlParams.get('courseId');
    
    if (courseIdFromUrl) {
        return courseIdFromUrl;
    }
    
    // Try to get from global context (if available)
    if (typeof window !== 'undefined' && (window as any).courseContext) {
        return (window as any).courseContext.activeCourseId;
    }
    
    // Try to get from instructor mode's currentClass
    if (typeof window !== 'undefined' && (window as any).currentClass && (window as any).currentClass.id) {
        return (window as any).currentClass.id;
    }
    
    // Try to get from localStorage (if available)
    try {
        const storedContext = localStorage.getItem('courseContext');
        if (storedContext) {
            const context = JSON.parse(storedContext);
            return context.activeCourseId;
        }
    } catch (error) {
        console.warn('Could not parse course context from localStorage:', error);
    }
    
    return null;
}

/**
 * Show loading state
 */
function showLoadingState(): void {
    const flagsContainer = document.getElementById('flags-container');
    if (flagsContainer) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loading-indicator';
        loadingDiv.style.cssText = `
            text-align: center;
            padding: 40px;
            color: #666;
            font-size: 16px;
        `;
        loadingDiv.innerHTML = `
            <div style="margin-bottom: 10px;">⏳</div>
            <div>Loading flags...</div>
        `;
        
        // Clear existing content and show loading
        flagsContainer.innerHTML = '';
        flagsContainer.appendChild(loadingDiv);
    }
}

/**
 * Hide loading state
 */
function hideLoadingState(): void {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

/**
 * Setup event listeners for filtering and collapse functionality
 */
function setupEventListeners(): void {
    // Filter checkbox listeners
    const filterCheckboxes = document.querySelectorAll('.filter-checkbox input[type="checkbox"]');
    filterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleFilterChange);
    });

    // Time filter dropdown listener
    const timeFilter = document.getElementById('time-filter') as HTMLSelectElement;
    if (timeFilter) {
        timeFilter.addEventListener('change', handleTimeFilterChange);
    }

    // Flag card collapse listeners (event delegation)
    const flagsList = document.getElementById('flags-list');
    if (flagsList) {
        flagsList.addEventListener('click', handleFlagCardClick);
    }

    // Navigation tile listeners
    const navTiles = document.querySelectorAll('.nav-tile');
    navTiles.forEach(tile => {
        tile.addEventListener('click', handleNavigationClick);
    });

    // Calendar button listener
    const chooseDateBtn = document.getElementById('choose-date-btn');
    chooseDateBtn?.addEventListener('click', () => openCalendar());

    // Close calendar button
    const closeCalendarBtn = document.getElementById('close-calendar-btn');
    closeCalendarBtn?.addEventListener('click', () => closeCalendar());

    // Calendar OK button
    const calendarOkBtn = document.getElementById('calendar-ok-btn');
    calendarOkBtn?.addEventListener('click', () => applyDateSelection());

    // Calendar modal click outside to close
    const calendarModal = document.getElementById('calendar-modal');
    calendarModal?.addEventListener('click', (e) => {
        if (e.target === calendarModal) {
            closeCalendar();
        }
    });
}

/**
 * Handle filter checkbox changes
 */
function handleFilterChange(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const flagType = checkbox.dataset.filter; // Use data-filter attribute
    
    if (!flagType) return;
    
    if (checkbox.checked) {
        currentFilters.flagTypes.add(flagType);
                    } else {
        currentFilters.flagTypes.delete(flagType);
    }
    
    renderFlags(); // Re-render with new filters
}

/**
 * Handle navigation tile clicks
 */
function handleNavigationClick(event: Event): void {
    const target = event.target as HTMLElement;
    const navTile = target.closest('.nav-tile') as HTMLElement;
    if (!navTile) return;

    const section = navTile.dataset.section as typeof currentSection;
    if (!section) return;

    // Update active section
    currentSection = section;
    
    // Update active state in UI
    updateActiveNavigation();
    
    // Re-render flags for new section
    renderFlags();
}

/**
 * Update active navigation state
 */
function updateActiveNavigation(): void {
    const navTiles = document.querySelectorAll('.nav-tile');
    navTiles.forEach(tile => {
        const tileElement = tile as HTMLElement;
        const section = tileElement.dataset.section;
        
        if (section === currentSection) {
            tileElement.classList.add('active');
        } else {
            tileElement.classList.remove('active');
        }
    });
}

/**
 * Handle flag card clicks for collapse/expand
 */
function handleFlagCardClick(event: Event): void {
    const target = event.target as HTMLElement;
    
    // Handle resolve button clicks
    if (target.classList.contains('resolve-button')) {
        handleResolveClick(target);
        return;
    }
    
    // Don't collapse if clicking on response section elements
    if (target.closest('.response-section')) {
        return;
    }
    
    const flagCard = target.closest('.flag-card') as HTMLElement;
    if (!flagCard) return;

    const flagId = flagCard.dataset.flagId;
    if (!flagId) return;

    // Toggle collapse state
    toggleFlagCollapse(flagId);
}

/**
 * Handle resolve button clicks
 */
function handleResolveClick(button: HTMLElement): void {
    const flagId = button.dataset.flagId;
    if (!flagId) return;

    const flag = flagData.find(f => f.id === flagId);
    if (!flag) return;

    // Toggle resolved status
    flag.status = flag.status === 'unresolved' ? 'resolved' : 'unresolved';
    
    // Re-render to update UI and navigation counts
    renderFlags();
    updateNavigationCounts();
}

/**
 * Toggle the collapse state of a flag card
 */
function toggleFlagCollapse(flagId: string): void {
    const flag = flagData.find(f => f.id === flagId);
    if (!flag) return;

    // Toggle collapse state
    flag.collapsed = !flag.collapsed;
    
    // Re-render to apply changes
    renderFlags();
}

/**
 * Handle time filter dropdown changes
 */
function handleTimeFilterChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    currentFilters.timeFilter = select.value as 'recent' | 'former';
    renderFlags();
}

/**
 * Render all flags dynamically
 */
function renderFlags(): void {
    const flagsList = document.getElementById('flags-list');
    if (!flagsList) return;

    // Filter flags based on current section, flag types, and date range
    let sectionFlags: FlagReport[] = [];
    
    switch (currentSection) {
        case 'unresolved-flags':
            sectionFlags = flagData.filter(flag => {
                if (flag.status !== 'unresolved' || !currentFilters.flagTypes.has(flag.flagType)) {
                    return false;
                }
                
                // Apply date range filter
                return isDateInRange(flag);
            });
            break;
        case 'resolved-flags':
            sectionFlags = flagData.filter(flag => {
                if (flag.status !== 'resolved' || !currentFilters.flagTypes.has(flag.flagType)) {
                    return false;
                }
                
                // Apply date range filter
                return isDateInRange(flag);
            });
            break;
        default:
            //alert
            alert('Invalid section');
            sectionFlags = [];
            break;
    }

    // Sort by time filter
    const sortedFlags = [...sectionFlags].sort((a, b) => {
        // Convert timestamp strings to dates for sorting
        const dateA = new Date(a.timestamp || a.createdAt);
        const dateB = new Date(b.timestamp || b.createdAt);
        
        if (currentFilters.timeFilter === 'recent') {
            return dateB.getTime() - dateA.getTime(); // new -> old
            } else {
            return dateA.getTime() - dateB.getTime(); // old -> new
        }
    });

    // Clear and render
    flagsList.innerHTML = '';
    sortedFlags.forEach(flag => {
        const flagCard = createFlagCard(flag);
        flagsList.appendChild(flagCard);
    });

    updateNavigationCounts();
}

/**
 * Create a flag card element dynamically
 */
function createFlagCard(flag: FlagReport): HTMLElement {
    const card = document.createElement('div');
    card.className = flag.collapsed ? 'flag-card' : 'flag-card expanded';
    card.dataset.flagType = flag.flagType;
    card.dataset.flagId = flag.id;

    // Create flag header
    const headerRow = document.createElement('div');
    headerRow.className = 'flag-header-row';

    const timeDiv = document.createElement('div');
    timeDiv.className = 'flag-time';
    timeDiv.textContent = flag.timestamp || 'Unknown time';

    const typeDiv = document.createElement('div');
    typeDiv.className = 'flag-type';
    typeDiv.textContent = flag.reportType;

    headerRow.appendChild(timeDiv);
    headerRow.appendChild(typeDiv);

    // Create chat content with collapse support
    const chatDiv = document.createElement('div');
    chatDiv.className = flag.collapsed ? 'chat-content collapsed' : 'chat-content';
    chatDiv.textContent = flag.chatContent;

    // Create flag footer
    const footer = document.createElement('div');
    footer.className = 'flag-footer';

    const studentName = document.createElement('div');
    studentName.className = 'student-name';
    studentName.textContent = flag.studentName || 'Unknown Student';

    const statusBadge = document.createElement('div');
    statusBadge.className = 'status-badge';
    statusBadge.textContent = `🏳 ${flag.status === 'unresolved' ? 'Unresolved' : 'Resolved'}`;

    const expandArrow = document.createElement('div');
    expandArrow.className = 'expand-arrow';
    expandArrow.textContent = flag.collapsed ? '▼' : '▲';

    footer.appendChild(studentName);
    footer.appendChild(statusBadge);
    footer.appendChild(expandArrow);

    // Create expanded content (response section)
    const expandedContent = document.createElement('div');
    expandedContent.className = 'expanded-content';

    const responseSection = document.createElement('div');
    responseSection.className = 'response-section';

    const responseHeader = document.createElement('div');
    responseHeader.className = 'response-header';
    responseHeader.textContent = 'Response:';

    const responseTextarea = document.createElement('textarea');
    responseTextarea.className = 'response-textarea';
    responseTextarea.placeholder = 'Write your response to this flag...';

    const responseActions = document.createElement('div');
    responseActions.className = 'response-actions';

    const resolveButton = document.createElement('button');
    resolveButton.className = 'resolve-button';
    resolveButton.textContent = flag.status === 'unresolved' ? 'Resolve' : 'Resolved';
    resolveButton.dataset.flagId = flag.id;
    resolveButton.dataset.status = flag.status;

    responseActions.appendChild(resolveButton);

    responseSection.appendChild(responseHeader);
    responseSection.appendChild(responseTextarea);
    responseSection.appendChild(responseActions);

    expandedContent.appendChild(responseSection);

    // Assemble the complete card
    card.appendChild(headerRow);
    card.appendChild(chatDiv);
    card.appendChild(footer);
    card.appendChild(expandedContent);

    return card;
}

/**
 * Update navigation tile counts for all sections
 */
function updateNavigationCounts(): void {
    const navTiles = document.querySelectorAll('.nav-tile');   
    if (navTiles) {
        // Count unresolved flags
        const unresolvedFlags = flagData.filter(flag => flag.status === 'unresolved').length;
        const unresolvedFlagsCount = document.getElementById('unresolved-flags-count');
        if (unresolvedFlagsCount) {
            unresolvedFlagsCount.textContent = String(unresolvedFlags);
        }
        
        // Count resolved flags  
        const resolvedFlags = flagData.filter(flag => flag.status === 'resolved').length;
        const resolvedFlagsCount = document.getElementById('resolved-flags-count');
        if (resolvedFlagsCount) {
            resolvedFlagsCount.textContent = String(resolvedFlags);
        }
    }
}

/**
 * Check if a flag's date is within the selected date range
 */
function isDateInRange(flag: FlagReport): boolean {
    // If no date range is selected, include all flags
    if (!selectedStartDate && !selectedEndDate) {
        return true;
    }
    
    const flagDate = new Date(flag.date || flag.createdAt);
    
    if (selectedStartDate && selectedEndDate) {
        // Date range filter - flag date must be within range
        return flagDate >= selectedStartDate && flagDate <= selectedEndDate;
    } else if (selectedStartDate) {
        // Single date filter - flag date must be the same day
        return isSameDate(flagDate, selectedStartDate);
    }
    
    return true;
}

/**
 * Calendar Functions - Adapted from monitor.ts
 */

/**
 * Open calendar modal
 */
function openCalendar(): void {
    const calendarModal = document.getElementById('calendar-modal');
    if (calendarModal) {
        calendarModal.style.display = 'flex';
        isCalendarOpen = true;
        renderCalendar();
    }
}

/**
 * Close calendar modal
 */
function closeCalendar(): void {
    const calendarModal = document.getElementById('calendar-modal');
    if (calendarModal) {
        calendarModal.style.display = 'none';
        isCalendarOpen = false;
    }
}

/**
 * Render calendar
 */
function renderCalendar(): void {
    const calendar = document.getElementById('calendar');
    if (!calendar) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Generate calendar HTML
    const calendarHTML = generateCalendarHTML(currentYear, currentMonth);
    calendar.innerHTML = calendarHTML;

    // Bind calendar date selection events
    bindCalendarEvents();
}

/**
 * Generate calendar HTML for a given month/year
 */
function generateCalendarHTML(year: number, month: number): string {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDay = firstDay.getDay(); // 0 = Sunday

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let html = `
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
            <span id="calendar-selection-status">No dates selected</span>
        </div>
        <div class="calendar-weekdays">
            ${weekdays.map(day => `<div class="calendar-weekday">${day}</div>`).join('')}
        </div>
        <div class="calendar-days">
    `;

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startDay; i++) {
        html += `<div class="calendar-day other-month"></div>`;
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const isToday = isSameDate(date, new Date());
        const isSelected = isDateSelected(date);
        const isCurrentMonth = true;

        html += `
            <div class="calendar-day ${isCurrentMonth ? 'current-month' : 'other-month'} 
                ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" 
                data-date="${date.toISOString()}">
                ${day}
            </div>
        `;
    }

    html += '</div>';
    return html;
}

/**
 * Bind calendar event listeners
 */
function bindCalendarEvents(): void {
    // Date selection
    const calendarDays = document.querySelectorAll('.calendar-day');
    calendarDays.forEach(day => {
        day.addEventListener('click', () => {
            const dateStr = day.getAttribute('data-date');
            if (dateStr) {
                selectDate(new Date(dateStr));
            }
        });
    });

    // Month navigation
    const prevBtn = document.getElementById('prev-month');
    const nextBtn = document.getElementById('next-month');
    
    prevBtn?.addEventListener('click', () => {
        // This would update the calendar view
        renderCalendar();
    });

    nextBtn?.addEventListener('click', () => {
        // This would update the calendar view
        renderCalendar();
    });
}

/**
 * Select a date in the calendar
 */
function selectDate(date: Date): void {
    if (!selectedStartDate) {
        // First selection - set as start date
        selectedStartDate = date;
        selectedEndDate = null;
    } else if (!selectedEndDate) {
        // Second selection - set as end date
        if (date < selectedStartDate) {
            // If selected date is before start date, swap them
            selectedEndDate = selectedStartDate;
            selectedStartDate = date;
        } else {
            selectedEndDate = date;
        }
    } else {
        // Reset selection and start over
        selectedStartDate = date;
        selectedEndDate = null;
    }

    updateCalendarSelectionStatus();
    renderCalendar();
}

/**
 * Check if a date is selected
 */
function isDateSelected(date: Date): boolean {
    if (!selectedStartDate) return false;
    
    if (selectedStartDate && !selectedEndDate) {
        return isSameDate(date, selectedStartDate);
    }
    
    if (selectedStartDate && selectedEndDate) {
        return date >= selectedStartDate && date <= selectedEndDate;
    }
    
    return false;
}

/**
 * Check if two dates are the same day
 */
function isSameDate(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

/**
 * Update the selection status display in the calendar header
 */
function updateCalendarSelectionStatus(): void {
    const statusElement = document.getElementById('calendar-selection-status');
    if (!statusElement) return;

    if (!selectedStartDate) {
        statusElement.textContent = 'No dates selected';
    } else if (!selectedEndDate) {
        statusElement.textContent = `Start: ${selectedStartDate.toLocaleDateString()}`;
    } else {
        statusElement.textContent = `${selectedStartDate.toLocaleDateString()} - ${selectedEndDate.toLocaleDateString()}`;
    }
}

/**
 * Apply date selection and close calendar
 */
function applyDateSelection(): void {
    // Apply the date filter to the flags
    renderFlags(); // This will use the selected dates for filtering
    closeCalendar();
}

