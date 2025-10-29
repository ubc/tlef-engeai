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

// API configuration
const API_BASE_URL = '/api/courses';

/**
 * Fetch flags from the backend API
 * @param courseId - The course ID to fetch flags for
 * @returns Promise<FlagReport[]> - Array of flags with user names resolved
 */
async function fetchFlags(courseId: string): Promise<FlagReport[]> {
    try {
        console.log('🔍 [FLAG-DEBUG] Fetching flags for course:', courseId);
        console.log('🔍 [FLAG-DEBUG] API URL:', `${API_BASE_URL}/${courseId}/flags/with-names`);
        
        const response = await fetch(`${API_BASE_URL}/${courseId}/flags/with-names`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        console.log('📡 [FLAG-DEBUG] API Response status:', response.status);
        console.log('📡 [FLAG-DEBUG] API Response ok:', response.ok);

        if (!response.ok) {
            console.error('❌ [FLAG-DEBUG] API Response not ok:', response.status, response.statusText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const apiResponse = await response.json();
        console.log('📊 [FLAG-DEBUG] Raw API response:', apiResponse);
        console.log('📊 [FLAG-DEBUG] API response success:', apiResponse.success);
        console.log('📊 [FLAG-DEBUG] API response data:', apiResponse.data);

        if (!apiResponse.success) {
            console.error('❌ [FLAG-DEBUG] API returned success: false');
            throw new Error(apiResponse.error || 'Failed to fetch flags');
        }

        // Transform API data to frontend format
        console.log('🔄 [FLAG-DEBUG] Transforming API data...');
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

        console.log('✅ [FLAG-DEBUG] Successfully fetched', transformedFlags.length, 'flags');
        console.log('📋 [FLAG-DEBUG] Transformed flags:', transformedFlags);
        return transformedFlags;

    } catch (error) {
        console.error('❌ [FLAG-DEBUG] Error fetching flags:', error);
        console.error('❌ [FLAG-DEBUG] Error details:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace'
        });
        
        // Show error message to user
        showErrorMessage('Failed to load flags. Please refresh the page and try again.');
        
        // Return empty array as fallback
        return [];
    }
}

/**
 * Delete all flags for a course via API
 */
async function deleteAllFlags(courseId: string): Promise<{ deletedCount: number } | null> {
    try {
        console.log('[FLAG-API] Deleting all flags for course:', courseId);
        
        const apiResponse = await fetch(`${API_BASE_URL}/${courseId}/flags`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!apiResponse.ok) {
            throw new Error(`HTTP ${apiResponse.status}: ${apiResponse.statusText}`);
        }

        const responseData = await apiResponse.json();
        
        if (!responseData.success) {
            throw new Error(responseData.error || 'Failed to delete all flags');
        }

        console.log('[FLAG-API] All flags deleted successfully:', responseData.deletedCount);
        return { deletedCount: responseData.deletedCount };
        
    } catch (error) {
        console.error('[FLAG-API] Error deleting all flags:', error);
        throw error;
    }
}

/**
 * Handle delete all flags button click
 */
async function handleDeleteAllFlags(): Promise<void> {
    // Get course ID from context
    const courseId = getCourseIdFromContext();
    if (!courseId) {
        showErrorMessage('Unable to determine course context');
        return;
    }

    // Confirm deletion with user
    const confirmed = confirm(
        'Are you sure you want to delete ALL flags for this course?\n\n' +
        'This action cannot be undone. All flag reports will be permanently deleted.'
    );

    if (!confirmed) {
        return;
    }

    const deleteButton = document.getElementById('delete-all-flags-button') as HTMLButtonElement;
    if (!deleteButton) return;

    // Show loading state on button
    const originalText = deleteButton.innerHTML;
    deleteButton.disabled = true;
    deleteButton.style.cursor = 'wait';
    deleteButton.innerHTML = '<i data-feather="loader"></i><span>Deleting...</span>';

    // Re-initialize feather icons for the loading spinner
    if (typeof (window as any).feather !== 'undefined') {
        (window as any).feather.replace();
    }

    try {
        // Call API to delete all flags
        const result = await deleteAllFlags(courseId);
        
        if (!result) {
            throw new Error('Failed to delete flags - no data returned');
        }

        // Clear local data
        flagData = [];

        // Re-render to show empty state and update navigation counts
        renderFlags();
        updateNavigationCounts();

        console.log('[FLAG-DELETE-ALL] Successfully deleted', result.deletedCount, 'flags');
        
        // Show success message
        showSuccessMessage(`Successfully deleted ${result.deletedCount} flag(s).`);
        
    } catch (error) {
        console.error('[FLAG-DELETE-ALL] Error deleting all flags:', error);
        
        // Show error notification
        showErrorMessage(
            'Failed to delete all flags. Please try again.'
        );
        
    } finally {
        // Reset button state
        deleteButton.innerHTML = originalText;
        deleteButton.disabled = false;
        deleteButton.style.cursor = 'pointer';
        
        // Re-initialize feather icons
        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }
    }
}

/**
 * Show success message to user
 * @param message - Success message to display
 */
function showSuccessMessage(message: string): void {
    // Create success message element
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.style.cssText = `
        background-color: #efe;
        border: 1px solid #cfc;
        color: #3c3;
        padding: 12px;
        margin: 10px 0;
        border-radius: 4px;
        font-size: 14px;
    `;
    successDiv.textContent = message;
    
    // Insert at the top of the main content or flags list
    const mainContent = document.querySelector('.main-content');
    const flagsList = document.getElementById('flags-list');
    const container = mainContent || flagsList;
    
    if (container) {
        // Insert before flags-list or at the start of main-content
        if (flagsList && flagsList.parentNode) {
            flagsList.parentNode.insertBefore(successDiv, flagsList);
        } else if (mainContent) {
            mainContent.insertBefore(successDiv, mainContent.firstChild);
        }
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.parentNode.removeChild(successDiv);
            }
        }, 5000);
    }
}

/**
 * Update flag status via API
 */
async function updateFlagStatus(courseId: string, flagId: string, status: 'unresolved' | 'resolved', response?: string): Promise<FlagReport | null> {
    try {
        console.log('[FLAG-API] Updating flag status:', { flagId, status, response });
        
        const apiResponse = await fetch(`${API_BASE_URL}/${courseId}/flags/${flagId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                status, 
                response: response || undefined 
            })
        });

        if (!apiResponse.ok) {
            throw new Error(`HTTP ${apiResponse.status}: ${apiResponse.statusText}`);
        }

        const responseData = await apiResponse.json();
        
        if (!responseData.success) {
            throw new Error(responseData.error || 'Failed to update flag status');
        }

        console.log('[FLAG-API] Flag updated successfully:', responseData.data);
        return responseData.data;
        
    } catch (error) {
        console.error('[FLAG-API] Error updating flag status:', error);
        throw error;
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
    
    // Insert at the top of the main content or flags list
    const mainContent = document.querySelector('.main-content');
    const flagsList = document.getElementById('flags-list');
    
    if (flagsList && flagsList.parentNode) {
        flagsList.parentNode.insertBefore(errorDiv, flagsList);
    } else if (mainContent) {
        mainContent.insertBefore(errorDiv, mainContent.firstChild);
    }
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
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
    console.log('🚀 [FLAG-DEBUG] Starting initializeFlags() function');
    
    try {
        // Get course ID from URL or global context
        const courseId = getCourseIdFromContext();
        
        console.log('🔍 [FLAG-DEBUG] Course ID from context:', courseId);
        console.log('🔍 [FLAG-DEBUG] Window.currentClass:', (window as any).currentClass);
        console.log('🔍 [FLAG-DEBUG] URL params:', window.location.search);
        
        if (!courseId) {
            console.error('❌ [FLAG-DEBUG] No course ID found in context');
            showErrorMessage('Unable to determine course context. Please refresh the page.');
            return;
        }

        console.log('🔍 [FLAG-DEBUG] Initializing flags for course:', courseId);
        
        // Show loading state
        console.log('⏳ [FLAG-DEBUG] Showing loading state');
        showLoadingState();
        
        // Fetch flags from API
        console.log('📡 [FLAG-DEBUG] Fetching flags from API...');
        flagData = await fetchFlags(courseId);
        console.log('📊 [FLAG-DEBUG] Fetched flag data:', flagData);
        console.log('📊 [FLAG-DEBUG] Number of flags fetched:', flagData.length);
        
        // Hide loading state
        console.log('✅ [FLAG-DEBUG] Hiding loading state');
        hideLoadingState();
        
        // Render flags with fetched data
        console.log('🎨 [FLAG-DEBUG] Rendering flags...');
        renderFlags();
        
        // Setup event listeners
        console.log('🎧 [FLAG-DEBUG] Setting up event listeners...');
        setupEventListeners();
        
        // Update navigation stats
        console.log('📊 [FLAG-DEBUG] Updating navigation stats...');
        updateActiveNavigation();
        
        console.log('✅ [FLAG-DEBUG] Flags initialized successfully');
        
    } catch (error) {
        console.error('❌ [FLAG-DEBUG] Error initializing flags:', error);
        console.error('❌ [FLAG-DEBUG] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        
        // Hide loading state
        hideLoadingState();
        
        // Show error message
        showErrorMessage('Failed to initialize flags. Please refresh the page and try again.');
        
        // Fallback to mock data for development
        console.log('🔄 [FLAG-DEBUG] Falling back to mock data for development');
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
    console.log('🔍 [FLAG-DEBUG] Getting course ID from context...');
    
    // Try to get from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const courseIdFromUrl = urlParams.get('courseId');
    console.log('🔍 [FLAG-DEBUG] Course ID from URL:', courseIdFromUrl);
    
    if (courseIdFromUrl) {
        console.log('✅ [FLAG-DEBUG] Found course ID in URL:', courseIdFromUrl);
        return courseIdFromUrl;
    }
    
    // Try to get from global context (if available)
    if (typeof window !== 'undefined' && (window as any).courseContext) {
        const courseIdFromContext = (window as any).courseContext.activeCourseId;
        console.log('🔍 [FLAG-DEBUG] Course ID from global context:', courseIdFromContext);
        if (courseIdFromContext) {
            console.log('✅ [FLAG-DEBUG] Found course ID in global context:', courseIdFromContext);
            return courseIdFromContext;
        }
    }
    
    // Try to get from instructor mode's currentClass
    if (typeof window !== 'undefined' && (window as any).currentClass && (window as any).currentClass.id) {
        const courseIdFromCurrentClass = (window as any).currentClass.id;
        console.log('🔍 [FLAG-DEBUG] Course ID from currentClass:', courseIdFromCurrentClass);
        if (courseIdFromCurrentClass) {
            console.log('✅ [FLAG-DEBUG] Found course ID in currentClass:', courseIdFromCurrentClass);
            return courseIdFromCurrentClass;
        }
    }
    
    // Try to get from localStorage (if available)
    try {
        const storedContext = localStorage.getItem('courseContext');
        console.log('🔍 [FLAG-DEBUG] Stored context from localStorage:', storedContext);
        if (storedContext) {
            const context = JSON.parse(storedContext);
            const courseIdFromStorage = context.activeCourseId;
            console.log('🔍 [FLAG-DEBUG] Course ID from localStorage:', courseIdFromStorage);
            if (courseIdFromStorage) {
                console.log('✅ [FLAG-DEBUG] Found course ID in localStorage:', courseIdFromStorage);
                return courseIdFromStorage;
            }
        }
    } catch (error) {
        console.warn('⚠️ [FLAG-DEBUG] Could not parse course context from localStorage:', error);
    }
    
    console.error('❌ [FLAG-DEBUG] No course ID found in any context');
    return null;
}

/**
 * Show loading state
 */
function showLoadingState(): void {
    const flagsList = document.getElementById('flags-list');
    if (flagsList) {
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
        flagsList.innerHTML = '';
        flagsList.appendChild(loadingDiv);
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
    console.log('🎧 [FLAG-DEBUG] Setting up flag card click listeners on:', flagsList);
    if (flagsList) {
        flagsList.addEventListener('click', handleFlagCardClick);
        console.log('🎧 [FLAG-DEBUG] Event listener attached successfully');
    } else {
        console.error('❌ [FLAG-DEBUG] Flags list element not found for event listener');
    }

    // Navigation tile listeners
    const navTiles = document.querySelectorAll('.nav-tile');
    navTiles.forEach(tile => {
        tile.addEventListener('click', handleNavigationClick);
    });

    // Delete all flags button listener
    const deleteAllButton = document.getElementById('delete-all-flags-button');
    if (deleteAllButton) {
        deleteAllButton.addEventListener('click', handleDeleteAllFlags);
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
    
    console.log('🖱️ [FLAG-DEBUG] Flag card clicked, target:', target);
    console.log('🖱️ [FLAG-DEBUG] Target classes:', target.className);
    console.log('🖱️ [FLAG-DEBUG] Target tag:', target.tagName);
    
    // Handle resolve button clicks
    if (target.classList.contains('resolve-button')) {
        console.log('🖱️ [FLAG-DEBUG] Resolve button clicked, handling resolve');
        handleResolveClick(target);
        return;
    }
    
    // Don't collapse if clicking on response section elements
    if (target.closest('.response-section')) {
        console.log('🖱️ [FLAG-DEBUG] Clicked on response section, ignoring');
        return;
    }
    
    const flagCard = target.closest('.flag-card') as HTMLElement;
    if (!flagCard) {
        console.log('🖱️ [FLAG-DEBUG] No flag card found');
        return;
    }

    const flagId = flagCard.dataset.flagId;
    if (!flagId) {
        console.log('🖱️ [FLAG-DEBUG] No flag ID found');
        return;
    }

    console.log('🖱️ [FLAG-DEBUG] Toggling collapse for flag:', flagId);
    // Toggle collapse state
    toggleFlagCollapse(flagId);
}

/**
 * Handle resolve button clicks
 */
async function handleResolveClick(button: HTMLElement): Promise<void> {
    const flagId = button.dataset.flagId;
    if (!flagId) return;

    const flag = flagData.find(f => f.id === flagId);
    if (!flag) return;

    // Get course ID from context
    const courseId = getCourseIdFromContext();
    if (!courseId) {
        showErrorMessage('Unable to determine course context');
        return;
    }

    // Determine new status
    const newStatus: 'unresolved' | 'resolved' = flag.status === 'unresolved' ? 'resolved' : 'unresolved';
    
    // Get response from textarea if resolving
    let response: string | undefined;
    if (newStatus === 'resolved') {
        const flagCard = document.querySelector(`[data-flag-id="${flagId}"]`);
        const responseTextarea = flagCard?.querySelector('.response-textarea') as HTMLTextAreaElement;
        response = responseTextarea?.value?.trim() || undefined;
    }

    // Show loading state on button
    const originalText = button.textContent;
    button.textContent = 'Loading...';
    (button as HTMLButtonElement).disabled = true;
    button.style.cursor = 'wait';

    try {
        // Call API to update flag status
        const updatedFlag = await updateFlagStatus(courseId, flagId, newStatus, response);
        
        if (!updatedFlag) {
            throw new Error('Failed to update flag - no data returned');
        }

        // Update local data with response from API
        const flagIndex = flagData.findIndex(f => f.id === flagId);
        if (flagIndex !== -1) {
            flagData[flagIndex] = {
                ...flagData[flagIndex],
                status: updatedFlag.status,
                response: updatedFlag.response,
                updatedAt: new Date(updatedFlag.updatedAt)
            };
        }

        // Re-render to update UI and navigation counts
        renderFlags();
        updateNavigationCounts();

        console.log('[FLAG-RESOLVE] Successfully updated flag:', flagId, 'to', newStatus);
        
    } catch (error) {
        console.error('[FLAG-RESOLVE] Error updating flag:', error);
        
        // Show error notification
        showErrorMessage(
            `Failed to ${newStatus === 'resolved' ? 'resolve' : 'unresolve'} flag. Please try again.`
        );
        
        // Reset button state
        button.textContent = originalText;
        (button as HTMLButtonElement).disabled = false;
        button.style.cursor = 'pointer';
    }
}

/**
 * Toggle the collapse state of a flag card
 */
function toggleFlagCollapse(flagId: string): void {
    const flag = flagData.find(f => f.id === flagId);
    if (!flag) return;

    // Toggle collapse state
    flag.collapsed = !flag.collapsed;
    
    // Find the flag card element and update it directly instead of re-rendering
    const flagCard = document.querySelector(`[data-flag-id="${flagId}"]`) as HTMLElement;
    if (!flagCard) return;
    
    // Update the card classes
    if (flag.collapsed) {
        flagCard.classList.remove('expanded');
    } else {
        flagCard.classList.add('expanded');
    }
    
    // Update the chat content
    const chatContent = flagCard.querySelector('.chat-content') as HTMLElement;
    if (chatContent) {
        if (flag.collapsed) {
            chatContent.classList.add('collapsed');
        } else {
            chatContent.classList.remove('collapsed');
        }
    }
    
    // Update the expand arrow
    const expandArrow = flagCard.querySelector('.expand-arrow') as HTMLElement;
    if (expandArrow) {
        expandArrow.textContent = flag.collapsed ? '▼' : '▲';
    }
    
    console.log(`🔄 [FLAG-DEBUG] Toggled flag ${flagId} to ${flag.collapsed ? 'collapsed' : 'expanded'}`);
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
    console.log('🎨 [FLAG-DEBUG] Starting renderFlags() function');
    console.log('🎨 [FLAG-DEBUG] Current flag data:', flagData);
    console.log('🎨 [FLAG-DEBUG] Number of flags in data:', flagData.length);
    console.log('🎨 [FLAG-DEBUG] Current section:', currentSection);
    console.log('🎨 [FLAG-DEBUG] Current filters:', currentFilters);
    
    const flagsList = document.getElementById('flags-list');
    console.log('🎨 [FLAG-DEBUG] Flags list element:', flagsList);
    
    if (!flagsList) {
        console.error('❌ [FLAG-DEBUG] Flags list element not found!');
        return;
    }

    // Filter flags based on current section, flag types, and date range
    let sectionFlags: FlagReport[] = [];
    
    console.log('🔍 [FLAG-DEBUG] Filtering flags...');
    
    switch (currentSection) {
        case 'unresolved-flags':
            sectionFlags = flagData.filter(flag => {
                const statusMatch = flag.status === 'unresolved';
                const typeMatch = currentFilters.flagTypes.has(flag.flagType);
                const dateMatch = isDateInRange(flag);
                
                console.log(`🔍 [FLAG-DEBUG] Flag ${flag.id}: status=${statusMatch}, type=${typeMatch}, date=${dateMatch}`);
                
                if (!statusMatch || !typeMatch || !dateMatch) {
                    return false;
                }
                
                return true;
            });
            break;
        case 'resolved-flags':
            sectionFlags = flagData.filter(flag => {
                const statusMatch = flag.status === 'resolved';
                const typeMatch = currentFilters.flagTypes.has(flag.flagType);
                const dateMatch = isDateInRange(flag);
                
                console.log(`🔍 [FLAG-DEBUG] Flag ${flag.id}: status=${statusMatch}, type=${typeMatch}, date=${dateMatch}`);
                
                if (!statusMatch || !typeMatch || !dateMatch) {
                    return false;
                }
                
                return true;
            });
            break;
        default:
            console.error('❌ [FLAG-DEBUG] Invalid section:', currentSection);
            sectionFlags = [];
            break;
    }

    console.log('📊 [FLAG-DEBUG] Filtered section flags:', sectionFlags);
    console.log('📊 [FLAG-DEBUG] Number of filtered flags:', sectionFlags.length);

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

    console.log('📊 [FLAG-DEBUG] Sorted flags:', sortedFlags);

    // Clear and render
    console.log('🧹 [FLAG-DEBUG] Clearing flags list innerHTML');
    flagsList.innerHTML = '';
    
    console.log('🎨 [FLAG-DEBUG] Creating flag cards...');
    sortedFlags.forEach((flag, index) => {
        console.log(`🎨 [FLAG-DEBUG] Creating card ${index + 1} for flag:`, flag);
        const flagCard = createFlagCard(flag);
        flagsList.appendChild(flagCard);
        console.log(`✅ [FLAG-DEBUG] Card ${index + 1} created and appended`);
    });

    console.log('📊 [FLAG-DEBUG] Updating navigation counts...');
    updateNavigationCounts();
    
    console.log('✅ [FLAG-DEBUG] renderFlags() completed successfully');
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
    // Add "Chat:" prefix to align with student view format
    const chatDiv = document.createElement('div');
    chatDiv.className = flag.collapsed ? 'chat-content collapsed' : 'chat-content';
    chatDiv.textContent = `Chat: ${flag.chatContent}`;

    // Create flag footer
    const footer = document.createElement('div');
    footer.className = 'flag-footer';

    const studentName = document.createElement('div');
    studentName.className = 'student-name';
    studentName.textContent = flag.studentName || 'Unknown Student';

    const statusBadge = document.createElement('div');
    statusBadge.className = 'status-badge';
    statusBadge.textContent = ` ${flag.status === 'unresolved' ? 'Unresolved' : 'Resolved'}`;

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
    responseTextarea.value = flag.response || '';

    const responseActions = document.createElement('div');
    responseActions.className = 'response-actions';

    const resolveButton = document.createElement('button');
    resolveButton.className = 'resolve-button';
    resolveButton.textContent = flag.status === 'unresolved' ? 'Resolve' : 'Resolved';
    resolveButton.dataset.flagId = flag.id;
    resolveButton.dataset.status = flag.status;
    resolveButton.disabled = false; // Ensure button is not disabled by default

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
    // No date filtering - show all flags
    return true;
}

