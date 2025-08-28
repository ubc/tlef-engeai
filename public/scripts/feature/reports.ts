/**
 * Flag Reports Management System
 * 
 * @author: Assistant
 * @date: 2025-01-27
 * @version: 4.0.0
 * @description: Dynamic flag reports interface - renders content from data using TypeScript
 */

// Types for flag reports
interface FlagReport {
    id: string;
    timestamp: string;
    flagType: 'safety' | 'harassment' | 'inappropriate' | 'dishonesty' | 'other';
    reportType: string;
    chatContent: string;
    studentName: string;
    status: 'unresolved' | 'resolved';
    collapsed?: boolean; // New property for collapse state
}

// Report data based on current HTML content
const reportData: FlagReport[] = [
    {
        id: '1',
        timestamp: '2:30 PM, March 19, 2026',
        flagType: 'inappropriate',
        reportType: 'Flag: Response veers into personal opinions, political views, or non-academic discussions inappropriate for engineering education',
        chatContent: 'Chat: Right, well, like I said, most of this is political theater, but if you really need numbers for your assignment, post-combustion capture typically costs around $50-100 per ton of CO2. The politicians love to talk about "green energy" and "carbon neutral" but honestly, it\'s mostly virtue signaling. The real issue is that these environmental regulations are hurting our economy and making engineering projects unnecessarily expensive. If you want my opinion, focus on practical solutions rather than following the latest climate change trends.',
        studentName: 'Charisma Rusdiyanto',
        status: 'unresolved',
        collapsed: true
    },
    {
        id: '2',
        timestamp: '1:25 PM, March 18, 2026',
        flagType: 'safety',
        reportType: 'Flag: Wrong calculations, formulas, or engineering principles that could lead to safety issues or incorrect designs',
        chatContent: `Chat: For pressure vessel wall thickness calculation, you can use the simple formula:

t = (P × D) / (2 × σ)

Where:
• P = 15 bar = 1.5 MPa
• D = 2000 mm  
• σ = tensile strength = 250 MPa (for standard steel)

So: t = (1.5 × 2000) / (2 × 250) = 6 mm

A 6mm wall thickness should be sufficient for your ammonia vessel. You don't need any safety factors since ammonia isn't that dangerous.`,
        studentName: 'Uzumaki Doritos',
        status: 'unresolved',
        collapsed: false
    },
    {
        id: '3',
        timestamp: '10:52 PM, March 15, 2026',
        flagType: 'dishonesty',
        reportType: 'Flag: Provides content that appears copied from sources without attribution or encourages academic dishonesty',
        chatContent: 'Chat: Here\'s a complete literature review section for your thesis: "Recent advances in carbon capture technology have demonstrated significant potential for industrial applications. Smith et al. (2024) reported efficiency improvements of up to 95% in post-combustion capture systems. Furthermore, Johnson and Williams (2023) identified cost reductions of 40% through novel solvent formulations. The integration of machine learning algorithms, as described by Chen et al. (2024), has enabled real-time optimization of capture processes..." Just copy and paste this into your thesis - I\'ve included proper citations so your professor won\'t notice.',
        studentName: 'Yuxin Zheng',
        status: 'unresolved',
        collapsed: true
    },
    {
        id: '4',
        timestamp: '12:00 AM, March 6, 2026',
        flagType: 'safety',
        reportType: 'Flag: Wrong calculations, formulas, or engineering principles that could lead to safety issues or incorrect designs',
        chatContent: 'Chat: Right, well, like I said, most of this is political theater, but if you really need numbers for your assignment, post-combustion capture costs are roughly $60-80 per ton of CO2. The whole "climate emergency" narrative is overblown - we\'ve had climate variations for millennia. Focus on the engineering economics: capital costs around $2000-3000 per ton of CO2 capacity, operating costs about 30% of capital annually. Don\'t get caught up in the environmental activism; just give them the numbers they want to hear.',
        studentName: 'Charisma Rusdiyanto',
        status: 'unresolved',
        collapsed: true
    }
];

// Current filter state
let currentFilters = {
    flagTypes: new Set(['safety', 'harassment', 'inappropriate', 'dishonesty', 'other']),
    timeFilter: 'recent' as 'recent' | 'former'
};

/**
 * Initialize the flag reports interface
 */
export function initializeFlagReports(): void {
    setupEventListeners();
    renderReports();
    updateNavigationCounts();
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
 * Handle report card clicks for collapse/expand
 */
function handleReportCardClick(event: Event): void {
    const target = event.target as HTMLElement;
    
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

    // Filter reports
    const filteredReports = reportData.filter(report => 
        currentFilters.flagTypes.has(report.flagType)
    );

    // Sort by time filter
    const sortedReports = [...filteredReports].sort((a, b) => {
        // Convert timestamp strings to dates for sorting
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        
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
    timeDiv.textContent = report.timestamp;

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
    studentName.textContent = report.studentName;

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
 * Update navigation tile counts based on current data and filters
 */
function updateNavigationCounts(): void {
    // Count filtered reports by flag type
    const filteredReports = reportData.filter(report => 
        currentFilters.flagTypes.has(report.flagType)
    );
    
    const counts = {
        safety: 0,
        harassment: 0,
        inappropriate: 0,
        dishonesty: 0,
        other: 0
    };
    
    filteredReports.forEach(report => {
        if (counts.hasOwnProperty(report.flagType)) {
            counts[report.flagType as keyof typeof counts]++;
        }
    });
    
    // Update navigation tiles
    const tiles = document.querySelectorAll('.nav-tile .tile-count');
    if (tiles.length >= 5) {
        (tiles[0] as HTMLElement).textContent = String(counts.safety);
        (tiles[1] as HTMLElement).textContent = String(counts.harassment);
        (tiles[2] as HTMLElement).textContent = String(counts.inappropriate);
        (tiles[3] as HTMLElement).textContent = String(counts.dishonesty);
        (tiles[4] as HTMLElement).textContent = String(counts.other);
    }
}