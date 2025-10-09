/**
 * Flag Reports Management System
 * 
 * @author: Assistant
 * @date: 2025-01-27
 * @version: 4.0.0
 * @description: Dynamic flag reports interface - renders content from data using TypeScript
 */

// Types for flag reports - matching backend FlagReport interface
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

// Global variable to store flag reports data
let reportData: FlagReport[] = [];

// API configuration
const API_BASE_URL = '/api/courses';

/**
 * Fetch flag reports from the backend API
 * @param courseId - The course ID to fetch flags for
 * @returns Promise<FlagReport[]> - Array of flag reports with user names resolved
 */
async function fetchFlagReports(courseId: string): Promise<FlagReport[]> {
    try {
        console.log('🔍 Fetching flag reports for course:', courseId);
        
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
        console.log('🔍 Flag reports API response:', apiResponse);

        if (!apiResponse.success) {
            throw new Error(apiResponse.error || 'Failed to fetch flag reports');
        }

        // Transform API data to frontend format
        const transformedReports = apiResponse.data.map((flag: any) => ({
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

        console.log('✅ Successfully fetched', transformedReports.length, 'flag reports');
        return transformedReports;

    } catch (error) {
        console.error('❌ Error fetching flag reports:', error);
        
        // Show error message to user
        showErrorMessage('Failed to load flag reports. Please refresh the page and try again.');
        
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
    
    // Insert at the top of the reports container
    const reportsContainer = document.getElementById('reports-container');
    if (reportsContainer) {
        reportsContainer.insertBefore(errorDiv, reportsContainer.firstChild);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }
}

// Mock data for fallback (empty array - API will provide real data)
const mockReportData: FlagReport[] = [];

// Current filter state
let currentFilters = {
    flagTypes: new Set(['innacurate_response', 'harassment', 'inappropriate', 'dishonesty', 'interface bug', 'other']),
    timeFilter: 'recent' as 'recent' | 'former'
};

let currentSection: 'flag-reports' | 'resolved-flag' = 'flag-reports';

/**
 * Initialize the flag reports interface
 */
export async function initializeFlagReports(): Promise<void> {
    try {
        // Get course ID from URL or global context
        const courseId = getCourseIdFromContext();
        
        if (!courseId) {
            console.error('❌ No course ID found in context');
            showErrorMessage('Unable to determine course context. Please refresh the page.');
            return;
        }

        console.log('🔍 Initializing flag reports for course:', courseId);
        
        // Show loading state
        showLoadingState();
        
        // Fetch flag reports from API
        reportData = await fetchFlagReports(courseId);
        
        // Hide loading state
        hideLoadingState();
        
        // Render reports with fetched data
        renderReports();
        
        // Setup event listeners
        setupEventListeners();
        
        // Update navigation stats
        updateActiveNavigation();
        
        console.log('✅ Flag reports initialized successfully');
        
    } catch (error) {
        console.error('❌ Error initializing flag reports:', error);
        
        // Hide loading state
        hideLoadingState();
        
        // Show error message
        showErrorMessage('Failed to initialize flag reports. Please refresh the page and try again.');
        
        // Fallback to mock data for development
        console.log('🔄 Falling back to mock data for development');
        reportData = mockReportData;
        renderReports();
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
    const reportsContainer = document.getElementById('reports-container');
    if (reportsContainer) {
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
            <div>Loading flag reports...</div>
        `;
        
        // Clear existing content and show loading
        reportsContainer.innerHTML = '';
        reportsContainer.appendChild(loadingDiv);
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

    // Report card collapse listeners (event delegation)
    const reportsList = document.getElementById('flag-reports-list');
    if (reportsList) {
        reportsList.addEventListener('click', handleReportCardClick);
    }

    // Navigation tile listeners
    const navTiles = document.querySelectorAll('.nav-tile');
    navTiles.forEach(tile => {
        tile.addEventListener('click', handleNavigationClick);
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
    
    renderReports(); // Re-render with new filters
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
    
    // Re-render reports for new section
    renderReports();
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
 * Handle report card clicks for collapse/expand
 */
function handleReportCardClick(event: Event): void {
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
    
    const reportCard = target.closest('.report-card') as HTMLElement;
    if (!reportCard) return;

    const reportId = reportCard.dataset.reportId;
    if (!reportId) return;

    // Toggle collapse state
    toggleReportCollapse(reportId);
}

/**
 * Handle resolve button clicks
 */
function handleResolveClick(button: HTMLElement): void {
    const reportId = button.dataset.reportId;
    if (!reportId) return;

    const report = reportData.find(r => r.id === reportId);
    if (!report) return;

    // Toggle resolved status
    report.status = report.status === 'unresolved' ? 'resolved' : 'unresolved';
    
    // Re-render to update UI and navigation counts
    renderReports();
    updateNavigationCounts();
}

/**
 * Toggle the collapse state of a report card
 */
function toggleReportCollapse(reportId: string): void {
    const report = reportData.find(r => r.id === reportId);
    if (!report) return;

    // Toggle collapse state
    report.collapsed = !report.collapsed;
    
    // Re-render to apply changes
    renderReports();
}

/**
 * Handle time filter dropdown changes
 */
function handleTimeFilterChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    currentFilters.timeFilter = select.value as 'recent' | 'former';
    renderReports();
}

/**
 * Render all flag reports dynamically
 */
function renderReports(): void {
    const reportsList = document.getElementById('flag-reports-list');
    if (!reportsList) return;

    // Filter reports based on current section
    let sectionReports: FlagReport[] = [];
    
    switch (currentSection) {
        case 'flag-reports':
            sectionReports = reportData.filter(report => 
                report.status === 'unresolved' && currentFilters.flagTypes.has(report.flagType)
            );
            break;
        case 'resolved-flag':
            sectionReports = reportData.filter(report => 
                report.status === 'resolved' && currentFilters.flagTypes.has(report.flagType)
            );
            break;
        default:
            //alert
            alert('Invalid section');
            sectionReports = [];
            break;
    }

    // Sort by time filter
    const sortedReports = [...sectionReports].sort((a, b) => {
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
    reportsList.innerHTML = '';
    sortedReports.forEach(report => {
        const reportCard = createReportCard(report);
        reportsList.appendChild(reportCard);
    });

    updateNavigationCounts();
}

/**
 * Create a report card element dynamically
 */
function createReportCard(report: FlagReport): HTMLElement {
    const card = document.createElement('div');
    card.className = report.collapsed ? 'report-card' : 'report-card expanded';
    card.dataset.flagType = report.flagType;
    card.dataset.reportId = report.id;

    // Create report header
    const headerRow = document.createElement('div');
    headerRow.className = 'report-header-row';

    const timeDiv = document.createElement('div');
    timeDiv.className = 'report-time';
    timeDiv.textContent = report.timestamp || 'Unknown time';

    const typeDiv = document.createElement('div');
    typeDiv.className = 'report-type';
    typeDiv.textContent = report.reportType;

    headerRow.appendChild(timeDiv);
    headerRow.appendChild(typeDiv);

    // Create chat content with collapse support
    const chatDiv = document.createElement('div');
    chatDiv.className = report.collapsed ? 'chat-content collapsed' : 'chat-content';
    chatDiv.textContent = report.chatContent;

    // Create report footer
    const footer = document.createElement('div');
    footer.className = 'report-footer';

    const studentName = document.createElement('div');
    studentName.className = 'student-name';
    studentName.textContent = report.studentName || 'Unknown Student';

    const statusBadge = document.createElement('div');
    statusBadge.className = 'status-badge';
    statusBadge.textContent = `🏳 ${report.status === 'unresolved' ? 'Unresolved' : 'Resolved'}`;

    const expandArrow = document.createElement('div');
    expandArrow.className = 'expand-arrow';
    expandArrow.textContent = report.collapsed ? '▼' : '▲';

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
    resolveButton.textContent = report.status === 'unresolved' ? 'Resolve' : 'Resolved';
    resolveButton.dataset.reportId = report.id;
    resolveButton.dataset.status = report.status;

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
        // Count unresolved flag reports
        const unresolvedFlags = reportData.filter(report => report.status === 'unresolved').length;
        const flagReportsCount = document.getElementById('flag-reports-count');
        if (flagReportsCount) {
            flagReportsCount.textContent = String(unresolvedFlags);
        }
        
        // Count resolved flag reports  
        const resolvedFlags = reportData.filter(report => report.status === 'resolved').length;
        const resolvedFlagCount = document.getElementById('resolved-flag-count');
        if (resolvedFlagCount) {
            resolvedFlagCount.textContent = String(resolvedFlags);
        }
    }
}

