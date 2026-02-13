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
export function getInstructorViewFromURL(): 'documents' | 'flags' | 'monitor' | 'chat' | 'assistant-prompts' | 'system-prompts' | 'course-information' | 'about' | null {
    const pathMatch = window.location.pathname.match(/^\/course\/[a-f0-9]{12}\/instructor\/([^\/]+)/);
    if (!pathMatch) return null;
    
    const view = pathMatch[1];
    const validViews = ['documents', 'flags', 'monitor', 'chat', 'assistant-prompts', 'system-prompts', 'course-information', 'about'];
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
        // console.log('[URL-PARSER] Already on target URL, skipping navigation:', url);
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
        // console.log('[URL-PARSER] Already on target URL, skipping navigation:', url);
        return;
    }
    
    window.history.pushState({ view: 'chat', chatId }, '', url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'chat', chatId } }));
}

// ===========================================
// ONBOARDING URL PARSER FUNCTIONS
// ===========================================

/**
 * Extract instructor onboarding stage from current URL
 * Example: /course/abc123/instructor/onboarding/course-setup -> 'course-setup'
 * Returns null if not on an onboarding URL
 */
export function getInstructorOnboardingStageFromURL(): 'course-setup' | 'document-setup' | 'flag-setup' | 'monitor-setup' | null {
    const pathMatch = window.location.pathname.match(/^\/course\/[a-f0-9]{12}\/instructor\/onboarding\/([^\/]+)/);
    if (!pathMatch) return null;
    
    const stage = pathMatch[1];
    const validStages: Array<'course-setup' | 'document-setup' | 'flag-setup' | 'monitor-setup'> = 
        ['course-setup', 'document-setup', 'flag-setup', 'monitor-setup'];
    return validStages.includes(stage as any) ? stage as any : null;
}

/**
 * Check if current URL is a student onboarding URL
 * Example: /course/abc123/student/onboarding/student -> true
 */
export function isStudentOnboardingURL(): boolean {
    return /^\/course\/[a-f0-9]{12}\/student\/onboarding\/student$/.test(window.location.pathname);
}

/**
 * Build instructor onboarding URL
 */
export function buildInstructorOnboardingURL(courseId: string, stage: 'course-setup' | 'document-setup' | 'flag-setup' | 'monitor-setup'): string {
    return `/course/${courseId}/instructor/onboarding/${stage}`;
}

/**
 * Build student onboarding URL
 */
export function buildStudentOnboardingURL(courseId: string): string {
    return `/course/${courseId}/student/onboarding/student`;
}

/**
 * Navigate to instructor onboarding stage using history.pushState (no page reload)
 */
export function navigateToInstructorOnboarding(stage: 'course-setup' | 'document-setup' | 'flag-setup' | 'monitor-setup'): void {
    const courseId = getCourseIdFromURL();
    if (!courseId) {
        console.error('[URL-PARSER] Cannot navigate: courseId not found in URL');
        return;
    }
    
    const url = buildInstructorOnboardingURL(courseId, stage);
    
    // Use pushState for SPA navigation (no page reload)
    window.history.pushState({ onboardingStage: stage }, '', url);
    
    // Trigger popstate event manually to handle navigation
    window.dispatchEvent(new PopStateEvent('popstate', { state: { onboardingStage: stage } }));
}

/**
 * Navigate to student onboarding using history.pushState (no page reload)
 */
export function navigateToStudentOnboarding(): void {
    const courseId = getCourseIdFromURL();
    if (!courseId) {
        console.error('[URL-PARSER] Cannot navigate: courseId not found in URL');
        return;
    }
    
    const url = buildStudentOnboardingURL(courseId);
    
    // Use pushState for SPA navigation (no page reload)
    window.history.pushState({ onboarding: 'student' }, '', url);
    
    // Trigger popstate event manually to handle navigation
    window.dispatchEvent(new PopStateEvent('popstate', { state: { onboarding: 'student' } }));
}

/**
 * Check if current URL is the new course onboarding route
 * Example: /instructor/onboarding/new-course -> true
 */
export function isNewCourseOnboardingURL(): boolean {
    return window.location.pathname === '/instructor/onboarding/new-course';
}
