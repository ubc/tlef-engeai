/**
 * Page titles for the instructor and student app shells.
 *
 * Both shells are single-page apps, so `document.title` must be updated whenever the view
 * changes; otherwise every view shares the shell's static title. Titles follow
 * "<Page> | EngE-AI (Instructor Mode)" / "<Page> | EngE-AI (Student Mode)".
 *
 * The same sync marks the chat page on `<body>` so page-specific styles can follow the view.
 */

/** Body class present while the "Chat with EngE-AI" page is showing. */
export const CHAT_PAGE_BODY_CLASS = 'chat-page';

const CHAT_VIEWS = new Set(['chat', 'welcoming-message']);

const INSTRUCTOR_VIEW_TITLES: Record<string, string> = {
    'dashboard': 'Dashboard',
    'documents': 'Documents',
    'writing-feedback': 'Writing Feedback',
    'flags': 'Flag Management',
    'monitor': 'Monitor',
    'chat': 'Chat with EngE-AI',
    'welcoming-message': 'Chat with EngE-AI',
    'assistant-prompts': 'Initial Assistant Prompts',
    'system-prompts': 'System Prompts',
    'scenario-questions': 'Scenario Questions',
    'pathway-library': 'Pathway Library',
    'about': 'About'
};

const STUDENT_VIEW_TITLES: Record<string, string> = {
    'chat': 'Chat with EngE-AI',
    'welcoming-message': 'Chat with EngE-AI',
    'scenarios': 'Scenario Questions',
    'flag-history': 'Flag History',
    'profile': 'Profile',
    'about': 'About'
};

/** "guided-pathway-setup" -> "Guided Pathway Setup" */
function titleCaseSlug(slug: string): string {
    return slug
        .split('-')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Works out the page name for a shell URL path, or null when the path isn't a known view.
 *
 * @param pathname - e.g. `/course/abc123def456/instructor/documents`
 */
function getPageNameForPath(pathname: string): { page: string | null; view: string | null; mode: 'Instructor' | 'Student' } | null {
    // Onboarding: /course/:id/instructor/onboarding/<stage> and /instructor/onboarding/new-course
    const onboarding = pathname.match(/\/(instructor|student)\/onboarding\/([^/]+)/);
    if (onboarding) {
        const mode = onboarding[1] === 'instructor' ? 'Instructor' : 'Student';
        const stage = onboarding[2];
        const page = stage === 'new-course' ? 'New Course Setup'
            : stage === 'student' ? 'Onboarding'
            : titleCaseSlug(stage);
        return { page, view: null, mode };
    }

    const view = pathname.match(/^\/course\/[a-f0-9]{12}\/(instructor|student)(?:\/([^/]+))?/);
    if (!view) return null;

    if (view[1] === 'instructor') {
        const slug = view[2] ?? null;
        return { page: slug ? INSTRUCTOR_VIEW_TITLES[slug] ?? null : null, view: slug, mode: 'Instructor' };
    }
    // The bare student URL opens the chat
    const slug = view[2] ?? 'chat';
    return { page: STUDENT_VIEW_TITLES[slug] ?? null, view: slug, mode: 'Student' };
}

/**
 * Sets `document.title` from the current URL, e.g. "Documents | EngE-AI (Instructor Mode)".
 * Unknown views fall back to "EngE-AI (Instructor Mode)" / "EngE-AI (Student Mode)".
 * Also toggles `CHAT_PAGE_BODY_CLASS` on `<body>` while the chat page is showing.
 * Call on load and after every view change (each in-app navigation fires `popstate`).
 */
export function syncPageTitleFromURL(): void {
    const result = getPageNameForPath(window.location.pathname);
    document.body.classList.toggle(CHAT_PAGE_BODY_CLASS, Boolean(result?.view && CHAT_VIEWS.has(result.view)));
    if (!result) return;

    const suffix = `EngE-AI (${result.mode} Mode)`;
    document.title = result.page ? `${result.page} | ${suffix}` : suffix;
}
