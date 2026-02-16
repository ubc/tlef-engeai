/**
 * ===========================================
 * ===== STUDENT FLAG HISTORY MANAGER =======
 * ===========================================
 *
 * Manages the student's view of their flag submissions,
 * including loading, filtering, and displaying flag history.
 *
 * @author EngE-AI Team
 * @version 1.0.0
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
import { renderFeatherIcons } from '../functions/api.js';
// API Base URL
const API_BASE_URL = '/api/courses';
// Current filter state
let currentFilter = 'all';
let allFlags = [];
/**
 * Initialize the student flag history interface
 */
export function initializeStudentFlagHistory(courseId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🏴 [FLAG-HISTORY] Initializing student flag history for user:', userId);
        // Show loading state
        showLoadingState();
        try {
            // Fetch student's flag reports from API
            const flags = yield fetchStudentFlags(courseId, userId);
            allFlags = flags;
            console.log(`✅ [FLAG-HISTORY] Loaded ${flags.length} flags`);
            console.log('📋 [FLAG-HISTORY] Flags:', flags);
            // Update statistics (if elements exist)
            updateStatistics(flags);
            // Render flags
            renderFlags(flags);
            // Attach event listeners
            attachEventListeners(courseId, userId);
            // Hide loading state
            hideLoadingState();
            // Show empty state if no flags
            if (flags.length === 0) {
                showEmptyState();
            }
        }
        catch (error) {
            console.error('❌ [FLAG-HISTORY] Error loading flag history:', error);
            console.error('❌ [FLAG-HISTORY] Error details:', error);
            hideLoadingState();
            showErrorState();
        }
    });
}
/**
 * Fetch student's flag reports from API
 */
function fetchStudentFlags(courseId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('🔍 [FLAG-HISTORY] Fetching flags for user:', userId);
            const response = yield fetch(`${API_BASE_URL}/${courseId}/flags/student/${userId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin'
            });
            if (!response.ok) {
                // For now, return sample data instead of throwing error
                console.log('⚠️ [FLAG-HISTORY] API returned error, using sample data for development');
                return getSampleFlags();
            }
            const apiResponse = yield response.json();
            console.log('🔍 [FLAG-HISTORY] API response:', apiResponse);
            if (!apiResponse.success) {
                // Return sample data instead of throwing
                console.log('⚠️ [FLAG-HISTORY] API returned unsuccessful response, using sample data for development');
                return getSampleFlags();
            }
            // Transform API data to frontend format
            const transformedFlags = apiResponse.data.map((flag) => (Object.assign(Object.assign({}, flag), { 
                // Convert date strings to Date objects
                date: new Date(flag.date || flag.createdAt), createdAt: new Date(flag.createdAt || new Date()), updatedAt: new Date(flag.updatedAt || flag.createdAt || new Date()) })));
            console.log(`✅ [FLAG-HISTORY] Successfully fetched ${transformedFlags.length} flags`);
            return transformedFlags;
        }
        catch (error) {
            console.error('❌ [FLAG-HISTORY] Error fetching flags:', error);
            // Return sample data for development
            console.log('📋 [FLAG-HISTORY] Using sample data for development');
            return getSampleFlags();
        }
    });
}
/**
 * Get sample flags for development/testing
 */
function getSampleFlags() {
    const now = new Date();
    return [
        {
            id: 'flag_001',
            courseName: 'APSC 101',
            date: now,
            flagType: 'innacurate_response',
            reportType: 'Inaccurate Response',
            chatContent: 'The AI stated that the heat capacity equation is Q = mc²T, which is incorrect. The correct formula is Q = mcΔT where c is the specific heat capacity. This fundamental error could lead to significant misconceptions in thermodynamics calculations.',
            userId: 1,
            status: 'unresolved',
            createdAt: now,
            updatedAt: now,
            response: ''
        },
        {
            id: 'flag_002',
            courseName: 'APSC 101',
            date: new Date(now.getTime() - 86400000), // Yesterday
            flagType: 'interface bug',
            reportType: 'Interface Bug',
            chatContent: 'When trying to copy the code snippet provided by the AI, the copy button doesn\'t work consistently. Sometimes I have to click it multiple times before it actually copies to my clipboard. This makes it difficult to quickly test the suggested solutions in my development environment.',
            userId: 1,
            status: 'unresolved',
            createdAt: new Date(now.getTime() - 86400000),
            updatedAt: new Date(now.getTime() - 86400000),
            response: ''
        },
        {
            id: 'flag_003',
            courseName: 'APSC 101',
            date: new Date(now.getTime() - 172800000), // 2 days ago
            flagType: 'inappropriate',
            reportType: 'Inappropriate Content',
            chatContent: 'I asked about sustainable engineering practices and the AI started discussing political policies about climate change rather than focusing on the technical engineering aspects of sustainability. The response included opinions about government regulations instead of sticking to the engineering principles I was trying to learn.',
            userId: 1,
            status: 'unresolved',
            createdAt: new Date(now.getTime() - 172800000),
            updatedAt: new Date(now.getTime() - 172800000),
            response: ''
        },
        {
            id: 'flag_004',
            courseName: 'APSC 101',
            date: new Date(now.getTime() - 259200000), // 3 days ago
            flagType: 'innacurate_response',
            reportType: 'Inaccurate Response',
            chatContent: 'The AI provided an incorrect value for Young\'s modulus of steel, stating it as 20 GPa when the correct value is approximately 200 GPa. This is an order of magnitude error that would lead to completely wrong calculations in structural analysis problems.',
            userId: 1,
            status: 'resolved',
            createdAt: new Date(now.getTime() - 259200000),
            updatedAt: new Date(now.getTime() - 259200000),
            response: 'Thank you for flagging this! You\'re absolutely correct - the AI made an error in the stress-strain relationship. The correct Young\'s modulus for steel is approximately 200 GPa, not 20 GPa as stated. I\'ve updated the knowledge base to prevent this error in the future. Great attention to detail!'
        }
    ];
}
/**
 * Update statistics display
 */
function updateStatistics(flags) {
    const totalCount = flags.length;
    const unresolvedCount = flags.filter(f => f.status === 'unresolved').length;
    const resolvedCount = flags.filter(f => f.status === 'resolved').length;
    const totalEl = document.getElementById('total-flags-count');
    const unresolvedEl = document.getElementById('unresolved-flags-count');
    const resolvedEl = document.getElementById('resolved-flags-count');
    if (totalEl)
        totalEl.textContent = totalCount.toString();
    if (unresolvedEl)
        unresolvedEl.textContent = unresolvedCount.toString();
    if (resolvedEl)
        resolvedEl.textContent = resolvedCount.toString();
}
/**
 * Render flags in the list
 */
function renderFlags(flags) {
    const flagList = document.getElementById('student-flag-list');
    console.log('📊 [FLAG-HISTORY] Rendering flags, flagList element:', flagList);
    if (!flagList) {
        console.error('❌ [FLAG-HISTORY] student-flag-list element not found!');
        return;
    }
    // Filter flags based on current filter
    let filteredFlags = flags;
    if (currentFilter !== 'all') {
        filteredFlags = flags.filter(f => f.status === currentFilter);
    }
    console.log(`📊 [FLAG-HISTORY] Rendering ${filteredFlags.length} flags (filtered from ${flags.length} total)`);
    // Clear existing flags
    flagList.innerHTML = '';
    // Render each flag
    filteredFlags.forEach((flag, index) => {
        console.log(`🎴 [FLAG-HISTORY] Creating card ${index + 1}:`, flag);
        const flagCard = createFlagCard(flag);
        flagList.appendChild(flagCard);
    });
    // Render feather icons
    renderFeatherIcons();
    // Show empty state if no flags after filtering
    if (filteredFlags.length === 0 && flags.length > 0) {
        flagList.innerHTML = `
            <div class="no-results-message">
                <i data-feather="filter"></i>
                <p>No ${currentFilter} flags found.</p>
            </div>
        `;
        renderFeatherIcons();
    }
}
/**
 * Create a flag card element (matching instructor structure)
 */
function createFlagCard(flag) {
    const card = document.createElement('div');
    card.className = 'flag-card'; // Will add 'expanded' class when clicked
    card.dataset.flagId = flag.id;
    card.dataset.flagType = flag.flagType;
    card.dataset.status = flag.status;
    // Format timestamp
    const timestamp = formatTimestamp(new Date(flag.createdAt));
    // Create flag header row
    const headerRow = document.createElement('div');
    headerRow.className = 'flag-header-row';
    const timeDiv = document.createElement('div');
    timeDiv.className = 'flag-time';
    timeDiv.textContent = timestamp;
    const typeDiv = document.createElement('div');
    typeDiv.className = 'flag-type';
    typeDiv.textContent = flag.reportType;
    headerRow.appendChild(timeDiv);
    headerRow.appendChild(typeDiv);
    // Create chat content (with collapsed class by default)
    // Add "Chat:" prefix to align with instructor view format
    const chatContent = document.createElement('div');
    chatContent.className = 'chat-content collapsed';
    chatContent.textContent = `Chat: ${flag.chatContent}`;
    // Create instructor response section (if resolved and has response)
    let instructorResponse = null;
    if (flag.status === 'resolved' && flag.response) {
        instructorResponse = document.createElement('div');
        instructorResponse.className = 'instructor-response collapsed';
        instructorResponse.textContent = `Instructor Response: ${flag.response}`;
    }
    // Create flag footer
    const footer = document.createElement('div');
    footer.className = 'flag-footer';
    const studentName = document.createElement('div');
    studentName.className = 'student-name';
    studentName.textContent = 'You';
    const statusBadge = document.createElement('div');
    statusBadge.className = 'status-badge';
    statusBadge.textContent = ` ${flag.status === 'unresolved' ? 'Unresolved' : 'Resolved'}`;
    const expandArrow = document.createElement('div');
    expandArrow.className = 'expand-arrow';
    expandArrow.textContent = '▼';
    footer.appendChild(studentName);
    footer.appendChild(statusBadge);
    footer.appendChild(expandArrow);
    // Assemble the card
    card.appendChild(headerRow);
    card.appendChild(chatContent);
    if (instructorResponse) {
        card.appendChild(instructorResponse);
    }
    card.appendChild(footer);
    // Make the entire card clickable to toggle expand/collapse
    card.addEventListener('click', (e) => {
        const target = e.target;
        const isExpanded = card.classList.contains('expanded');
        const chatContentEl = card.querySelector('.chat-content');
        const instructorResponseEl = card.querySelector('.instructor-response');
        const expandArrow = card.querySelector('.expand-arrow');
        if (isExpanded) {
            card.classList.remove('expanded');
            if (chatContentEl)
                chatContentEl.classList.add('collapsed');
            if (instructorResponseEl)
                instructorResponseEl.classList.add('collapsed');
            if (expandArrow)
                expandArrow.textContent = '▼';
        }
        else {
            card.classList.add('expanded');
            if (chatContentEl)
                chatContentEl.classList.remove('collapsed');
            if (instructorResponseEl)
                instructorResponseEl.classList.remove('collapsed');
            if (expandArrow)
                expandArrow.textContent = '▲';
        }
        renderFeatherIcons();
    });
    return card;
}
/**
 * Get human-readable flag type label
 */
function getFlagTypeLabel(flagType) {
    const labels = {
        'innacurate_response': 'Inaccurate Response',
        'harassment': 'Harassment',
        'inappropriate': 'Inappropriate Content',
        'dishonesty': 'Academic Dishonesty',
        'interface bug': 'Interface Bug',
        'other': 'Other'
    };
    return labels[flagType] || flagType;
}
/**
 * Format timestamp for display
 */
function formatTimestamp(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1)
        return 'Just now';
    if (diffMins < 60)
        return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24)
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7)
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    // Format as date
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        hour: 'numeric',
        minute: '2-digit'
    });
}
/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
/**
 * Attach event listeners
 */
function attachEventListeners(courseId, userId) {
    // Filter buttons
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const filter = target.dataset.filter;
            // Update active state
            filterBtns.forEach(b => b.classList.remove('active'));
            target.classList.add('active');
            // Update filter and re-render
            currentFilter = filter;
            renderFlags(allFlags);
        });
    });
    // Refresh button
    const refreshBtn = document.getElementById('refresh-flags-btn');
    refreshBtn === null || refreshBtn === void 0 ? void 0 : refreshBtn.addEventListener('click', () => {
        initializeStudentFlagHistory(courseId, userId);
    });
    // Back button (handled by student-mode.ts)
    const backBtn = document.getElementById('flag-history-back-btn');
    if (backBtn) {
        console.log('✅ [FLAG-HISTORY] Back button found and will be handled by student-mode.ts');
    }
}
/**
 * UI State Management
 */
function showLoadingState() {
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');
    const errorState = document.getElementById('error-state');
    const flagList = document.getElementById('student-flag-list');
    if (loadingState)
        loadingState.style.display = 'flex';
    if (emptyState)
        emptyState.style.display = 'none';
    if (errorState)
        errorState.style.display = 'none';
    if (flagList)
        flagList.style.display = 'none';
}
function hideLoadingState() {
    const loadingState = document.getElementById('loading-state');
    const flagList = document.getElementById('student-flag-list');
    if (loadingState)
        loadingState.style.display = 'none';
    if (flagList)
        flagList.style.display = 'flex'; // Match the CSS flex layout
}
function showEmptyState() {
    const emptyState = document.getElementById('empty-state');
    const flagList = document.getElementById('student-flag-list');
    if (emptyState)
        emptyState.style.display = 'flex';
    if (flagList)
        flagList.style.display = 'none';
}
function showErrorState() {
    const errorState = document.getElementById('error-state');
    const flagList = document.getElementById('student-flag-list');
    if (errorState)
        errorState.style.display = 'flex';
    if (flagList)
        flagList.style.display = 'none';
}
