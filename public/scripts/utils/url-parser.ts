/**
 * URL Parser Utilities
 * 
 * Provides functions to parse and construct course-related URLs
 */

/**
 * Extract courseId from current URL
 * Example: /course/abc123def456/instructor/documents -> abc123def456
 */
export function getCourseIdFromURL(): string | null {
    const pathMatch = window.location.pathname.match(/^\/course\/([a-f0-9]{12})\/instructor\//);
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

