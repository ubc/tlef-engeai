/**
 * URL Parser Utilities
 * 
 * Provides functions to parse and construct course-related URLs
 */

/**
 * Extract courseId from current URL
 * Example: /course/abc123def456/instructor/documents -> abc123def456
 * Example: /course/abc123def456/student/chat -> abc123def456
 */
export function getCourseIdFromURL(): string | null {
    // Match both instructor and student URLs
    const pathMatch = window.location.pathname.match(/^\/course\/([a-f0-9]{12})\/(instructor|student)/);
    return pathMatch ? pathMatch[1] : null;
}

/**
 * Extract instructor view from current URL
 * Example: /course/abc123/instructor/documents -> 'documents'
 */
export function getInstructorViewFromURL(): 'documents' | 'flags' | 'monitor' | 'chat' | 'assistant-prompts' | 'course-information' | 'about' | null {
    const pathMatch = window.location.pathname.match(/^\/course\/[a-f0-9]{12}\/instructor\/([^\/]+)/);
    if (!pathMatch) return null;
    
    const view = pathMatch[1];
    const validViews = ['documents', 'flags', 'monitor', 'chat', 'assistant-prompts', 'course-information', 'about'];
    return validViews.includes(view) ? view as any : null;
}

/**
 * Extract chatId from query parameters
 * Example: /course/abc123/instructor/chat?chatId=xyz789 -> xyz789
 */
export function getChatIdFromURL(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('chatId');
}

/**
 * Build instructor URL
 */
export function buildInstructorURL(courseId: string, view: string, chatId?: string): string {
    let url = `/course/${courseId}/instructor/${view}`;
    if (chatId) {
        url += `?chatId=${chatId}`;
    }
    return url;
}

/**
 * Navigate to instructor view using history.pushState (no page reload)
 * This maintains SPA behavior - faster navigation, preserves state
 */
export function navigateToInstructorView(view: string, chatId?: string): void {
    const courseId = getCourseIdFromURL();
    if (!courseId) {
        console.error('[URL-PARSER] Cannot navigate: courseId not found in URL');
        return;
    }
    
    const url = buildInstructorURL(courseId, view, chatId);
    
    // Use pushState for SPA navigation (no page reload)
    window.history.pushState({ view, chatId }, '', url);
    
    // Trigger popstate event manually to handle navigation
    window.dispatchEvent(new PopStateEvent('popstate', { state: { view, chatId } }));
}

/**
 * Navigate to specific chat
 */
export function navigateToChat(courseId: string, chatId: string): void {
    const url = buildInstructorURL(courseId, 'chat', chatId);
    window.history.pushState({ view: 'chat', chatId }, '', url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'chat', chatId } }));
}

/**
 * Extract student view from current URL
 * Example: /course/abc123/student/chat -> 'chat'
 */
export function getStudentViewFromURL(): 'chat' | 'profile' | 'flag-history' | 'about' | null {
    const pathMatch = window.location.pathname.match(/^\/course\/[a-f0-9]{12}\/student\/([^\/]+)/);
    if (!pathMatch) {
        // Check if it's just /course/:courseId/student (default view)
        const defaultMatch = window.location.pathname.match(/^\/course\/[a-f0-9]{12}\/student$/);
        if (defaultMatch) return 'chat'; // Default to chat view
        return null;
    }
    
    const view = pathMatch[1]; 
    const validViews: Array<'chat' | 'profile' | 'flag-history' | 'about'> = ['chat', 'profile', 'flag-history', 'about'];
    return validViews.includes(view as any) ? (view as 'chat' | 'profile' | 'flag-history' | 'about') : null;
}

/**
 * Build student URL
 */
export function buildStudentURL(courseId: string, view?: string, chatId?: string): string {
    let url = `/course/${courseId}/student`;
    if (view && view !== 'chat') {
        url += `/${view}`;
    } else if (view === 'chat') {
        url += '/chat';
    }
    if (chatId) {
        url += `?chatId=${chatId}`;
    }
    return url;
}

/**
 * Navigate to student view using history.pushState (no page reload)
 */
export function navigateToStudentView(view?: string, chatId?: string): void {
    const courseId = getCourseIdFromURL();
    if (!courseId) {
        console.error('[URL-PARSER] Cannot navigate: courseId not found in URL');
        return;
    }
    
    const url = buildStudentURL(courseId, view, chatId);
    
    // Check if we're already on this URL to prevent unnecessary navigation
    if (window.location.pathname + window.location.search === url) {
        console.log('[URL-PARSER] Already on target URL, skipping navigation:', url);
        return;
    }
    
    // Use pushState for SPA navigation (no page reload)
    window.history.pushState({ view, chatId }, '', url);
    
    // Trigger popstate event manually to handle navigation
    window.dispatchEvent(new PopStateEvent('popstate', { state: { view, chatId } }));
}

/**
 * Navigate to specific student chat
 */
export function navigateToStudentChat(courseId: string, chatId: string): void {
    const url = buildStudentURL(courseId, 'chat', chatId);
    
    // Check if we're already on this URL to prevent unnecessary navigation
    if (window.location.pathname + window.location.search === url) {
        console.log('[URL-PARSER] Already on target URL, skipping navigation:', url);
        return;
    }
    
    window.history.pushState({ view: 'chat', chatId }, '', url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'chat', chatId } }));
}

