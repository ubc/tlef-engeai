// public/scripts/entry/instructor-mode.ts

/**
 * instructor-mode.ts
 * 
 * @author: @gatahcha
 * @date: 2026-03-07
 * @description: Instructor entry point. Loads documents, flags, monitor, chat, assistant/system prompts. Handles onboarding, sidebar navigation, ChatManager.
 */

import { loadComponentHTML, renderFeatherIcons } from "../api/api.js";
import { activeCourse, InstructorOnboardingProgress, User } from "../types.js";
import { instructorUserFactory } from "../factories/instructor-user-factory.js";
import { initializeDocumentsPage } from "../feature/documents.js";
import { renderOnCourseSetup } from "../onboarding/course-setup.js";
import { renderDocumentSetup } from "../onboarding/document-setup.js";
import { renderFlagSetup } from "../onboarding/flag-setup.js";
import { renderMonitorSetup } from "../onboarding/monitor-setup.js";
import { initializeFlags } from "../feature/flags.js";
import { initializeMonitorDashboard } from "../feature/monitor.js";
import { ChatManager } from "../feature/chat.js";
import { authService } from '../services/auth-service.js';
import { showConfirmModal, showSimpleErrorModal } from '../ui/modal-overlay.js';
import { renderAbout } from '../about/about.js';
// @rdschrs: Integrated capability-gated Writing Feedback navigation and initialization.
import { initializeWritingFeedback } from '../feature/writing-feedback.js';
import { initializeCourseSummary, summonCourseSummary, configureCourseSummaryFabVisibility } from '../feature/course-summary.js';
import { startInactivityTracking } from '../services/inactivity-tracker.js';
import { initializeAssistantPrompts, hasUnsavedPromptChanges, resetUnsavedPromptChanges } from '../feature/assistant-prompts.js';
import { initializeSystemPrompts, flushSystemPromptOnLeave } from '../feature/system-prompts.js';
import { initializeScenarioQuestionsInstructor, isScenarioQuestionsMounted, syncScenarioQuestionsFromURL } from '../feature/scenario-questions-instructor.js';
import { initializePathwayLibrary } from '../feature/pathway-library.js';
import { initializeDashboard, renderDashboardCards } from '../feature/dashboard.js';
import { 
    getCourseIdFromURL, 
    getInstructorViewFromURL, 
    getChatIdFromURL,
    navigateToInstructorView,
    navigateToChat,
    getInstructorOnboardingStageFromURL,
    isNewCourseOnboardingURL,
    replaceInstructorViewURL
} from '../utils/url-parser.js';

/**
 * checkAuthentication
 * @returns Promise<boolean>
 * Calls authService.checkAuthenticationAndRedirect. Returns false if unauthenticated; redirects to login.
 */
async function checkAuthentication(): Promise<boolean> {
    // Get courseId from URL if available, otherwise use default redirect
    const courseId = getCourseIdFromURL();
    const redirectPath = courseId ? `/course/${courseId}/instructor/dashboard` : '/pages/instructor-mode.html';
    return await authService.checkAuthenticationAndRedirect(redirectPath, 'INSTRUCTOR-MODE');
}

/** Extract userId from InstructorInfo or legacy string entry. */
function instructorEntryUserId(entry: { userId: string } | string): string {
    return typeof entry === 'string' ? entry : entry.userId;
}

/** True when userId is in course.teachingAssistants[]. */
function isInCourseTAs(course: activeCourse, userId: string): boolean {
    return (course.teachingAssistants ?? []).some((ta) => instructorEntryUserId(ta) === userId);
}

/**
 * updateSidebarCompanionText — sets sidebar subtitle to `{firstName} (Instructor|TA)`.
 *
 * @param name — Full display name from auth
 * @param userId — Auth user id for TA roster lookup
 * @param course — Loaded course (teachingAssistants used for role)
 */
function updateSidebarCompanionText(name: string, userId: string, course: activeCourse): void {
    const companionText = document.getElementById('companion-text');
    if (!companionText || !name) return;

    const firstName = name.trim().split(/\s+/)[0] || name;
    const role = isInCourseTAs(course, userId) ? 'TA' : 'Instructor';
    companionText.textContent = `${firstName} (${role})`;
}

/**
 * mapViewToStateEvent
 * 
 * @param view string — URL view name (documents, flags, monitor, chat, assistant-prompts, system-prompts)
 * @returns StateEvent — Corresponding enum value; defaults to Documents
 */
function mapViewToStateEvent(view: string): StateEvent {
    switch (view) {
        case 'dashboard': return StateEvent.Dashboard;
        case 'documents': return StateEvent.Documents;
        case 'writing-feedback': return StateEvent.WritingFeedback;
        case 'flags': return StateEvent.Flag;
        case 'monitor': return StateEvent.Monitor;
        case 'chat': return StateEvent.Chat;
        case 'assistant-prompts': return StateEvent.AssistantPrompts;
        case 'system-prompts': return StateEvent.SystemPrompts;
        case 'scenario-questions': return StateEvent.ScenarioQuestions;
        case 'pathway-library': return StateEvent.PathwayLibrary;
        case 'settings':
        case 'course-information':
            return StateEvent.Dashboard;
        default: return StateEvent.Dashboard;
    }
}

const enum StateEvent {
    Dashboard,
    Flag,
    Monitor,
    Documents,
    WritingFeedback,
    Chat,
    AssistantPrompts,
    SystemPrompts,
    ScenarioQuestions,
    PathwayLibrary
}

let currentClass : activeCourse =
{
    id: '',
    date: new Date(),
    courseSetup : true,
    courseName:'CHBE 241: Material and Energy Balances',
    instructors: [
    ],
    teachingAssistants: [
    ],
    frameType: 'byTopic',
    tilesNumber: 12,
    topicOrWeekInstances: [
    ]
}

/**
 * Instructor tutorial progress for the signed-in user, loaded from `/auth/current-user`.
 *
 * Defaults to complete so a failed fetch never traps an instructor inside onboarding —
 * the same reasoning as the all-complete `currentClass` fallback above.
 */
let instructorOnboarding: InstructorOnboardingProgress = {
    contentSetup: true,
    flagSetup: true,
    monitorSetup: true
};

/** True once the course is configured and the viewer has been through every tutorial. */
function isInstructorOnboardingComplete(): boolean {
    return currentClass.courseSetup === true
        && instructorOnboarding.contentSetup === true
        && instructorOnboarding.flagSetup === true
        && instructorOnboarding.monitorSetup === true;
}

// ChatManager instance for instructor mode
let chatManager: ChatManager | null = null;

// Instructor User data (loaded from database)
let instructorUser: User | null = null;

// Make chatManager, loadChatWindow, and currentClass globally accessible for fallback scenarios
declare global {
    interface Window {
        chatManager: ChatManager | null;
        loadChatWindow: () => Promise<void>;
        currentClass: activeCourse;
    }
}


// Flag to prevent multiple initializations
let isInitialized = false;

document.addEventListener('DOMContentLoaded', async () => {
    // console.log("DOMContentLoaded is called"); // 🟢 MEDIUM: Debug info - keep for monitoring

    // Prevent multiple initializations
    if (isInitialized) {
        // console.log("Already initialized, skipping..."); // 🟢 MEDIUM: Debug info - keep for monitoring
        return;
    }
    isInitialized = true;

    // --- SIDEBAR CONTROLLER ---
    // Initialize the visible sidebar controls before this callback's first await.
    // Slow or failed authentication/course setup must never leave the button inert.
    const sidebarEl = document.getElementById('instructor-sidebar');
    const logoBox = document.querySelector<HTMLButtonElement>('.logo-box');
    const sidebarMenuListEl = document.querySelector('.sidebar-menu-list');
    const sidebarContentEl = document.getElementById('sidebar-content');
    const mainContentAreaEl = document.getElementById('main-content-area');
    const instructorFeatureSidebarEl = document.querySelector('.instructor-feature-sidebar');
    const chatListEl = document.getElementById('chat-list');
    const instructorSidebarOverlayEl = document.getElementById('instructor-sidebar-overlay');
    const SIDEBAR_COLLAPSED_KEY = 'instructor-sidebar-collapsed';
    const MOBILE_BREAKPOINT = 768;
    const instructorSidebarMediaQuery = window.matchMedia(
        `(max-width: ${MOBILE_BREAKPOINT}px)`
    );
    const isMobileView = (): boolean => instructorSidebarMediaQuery.matches;
    let instructorMobileSidebarTrigger: HTMLElement | null = null;

    const readSidebarPreference = (): boolean => {
        try {
            return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
        } catch {
            // Private-mode or blocked storage must not break navigation.
            return false;
        }
    };

    const writeSidebarPreference = (collapsed: boolean): void => {
        try {
            window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
        } catch {
            // Preference is a convenience; ignore quota/permission failures.
        }
    };

    let isSidebarCollapsed: boolean = readSidebarPreference();

    const updateSidebarToggleAccessibility = (collapsed: boolean): void => {
        const expanded = !collapsed;
        const label = expanded ? 'Collapse sidebar' : 'Expand sidebar';
        document.querySelectorAll<HTMLButtonElement>('.sidebar-collapse-icon').forEach((control) => {
            control.setAttribute('aria-expanded', String(expanded));
            control.setAttribute('aria-label', label);
            control.setAttribute('aria-controls', 'instructor-feature-sidebar');
            control.title = label;
        });

        if (isMobileView()) {
            const drawerOpen = sidebarEl?.classList.contains('mobile-open') ?? false;
            if (drawerOpen) {
                sidebarEl?.removeAttribute('aria-hidden');
                sidebarEl?.removeAttribute('inert');
            } else {
                sidebarEl?.setAttribute('aria-hidden', 'true');
                sidebarEl?.setAttribute('inert', '');
            }

            if (logoBox) {
                logoBox.setAttribute('aria-expanded', String(drawerOpen));
                logoBox.setAttribute('aria-label', 'Close navigation');
                logoBox.setAttribute('aria-controls', 'instructor-sidebar');
                logoBox.title = 'Close navigation';
            }
            return;
        }

        sidebarEl?.removeAttribute('aria-hidden');
        sidebarEl?.removeAttribute('inert');
        if (!logoBox) return;

        logoBox.setAttribute('aria-expanded', String(expanded));
        logoBox.setAttribute('aria-label', label);
        logoBox.setAttribute('aria-controls', 'instructor-feature-sidebar');
        logoBox.title = label;
    };

    const hideChatList = (): void => {
        chatListEl?.classList.remove('active');
    };

    const showChatList = (): void => {
        chatListEl?.classList.add('active');
    };

    /**
     * Applies a collapse state to the sidebar DOM.
     *
     * @param collapsed - Target width state
     * @param persist - Whether this reflects a deliberate user choice. Chat mode
     *                  passes false so its temporary narrowing does not overwrite
     *                  the preference the reader set on the other tabs.
     */
    const setSidebarCollapsed = (collapsed: boolean, persist: boolean): void => {
        if (!instructorFeatureSidebarEl) return;
        instructorFeatureSidebarEl.classList.toggle('collapsed', collapsed);

        logoBox?.classList.toggle('collapsed', collapsed);
        sidebarMenuListEl?.classList.toggle('collapsed', collapsed);

        // The chat list is positioned against the collapsed rail and would sit
        // underneath an expanded sidebar.
        if (!collapsed) hideChatList();

        isSidebarCollapsed = collapsed;
        updateSidebarToggleAccessibility(collapsed);
        if (persist) writeSidebarPreference(collapsed);
    };

    const collapseFeatureSidebar = (): void => setSidebarCollapsed(true, true);

    const expandFeatureSidebar = (): void => setSidebarCollapsed(false, true);

    /** Restores the reader's stored width choice when entering a non-chat tab. */
    const applySidebarPreference = (): void =>
        setSidebarCollapsed(readSidebarPreference(), false);

    updateSidebarToggleAccessibility(
        instructorFeatureSidebarEl?.classList.contains('collapsed') ?? false
    );
    instructorSidebarMediaQuery.addEventListener('change', (event: MediaQueryListEvent) => {
        if (!event.matches) {
            sidebarEl?.classList.remove('mobile-open');
            instructorSidebarOverlayEl?.classList.remove('show');
            instructorSidebarOverlayEl?.setAttribute('aria-hidden', 'true');
            instructorMobileSidebarTrigger = null;
        }
        updateSidebarToggleAccessibility(
            instructorFeatureSidebarEl?.classList.contains('collapsed') ?? false
        );
    });

    // Delegation makes both the green logo and menu button—including their
    // Feather SVG/path children—reliable hit targets.
    document.addEventListener('click', (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const toggleControl = target.closest(
            '.sidebar-collapse-icon, .instructor-feature-sidebar .logo-box'
        );
        if (!toggleControl) return;

        // On mobile the outer drawer replaces desktop width collapsing. Tapping
        // the visible logo closes that drawer instead of creating a trapped 64px rail.
        if (
            toggleControl.classList.contains('logo-box') &&
            isMobileView()
        ) {
            sidebarEl?.classList.remove('mobile-open');
            instructorSidebarOverlayEl?.classList.remove('show');
            instructorSidebarOverlayEl?.setAttribute('aria-hidden', 'true');
            const focusTarget = instructorMobileSidebarTrigger ??
                document.querySelector<HTMLElement>(
                    '#hamburger-btn, #instructor-hamburger-btn, .mobile-hamburger-btn, .instructor-mobile-hamburger-btn'
                );
            focusTarget?.focus();
            instructorMobileSidebarTrigger = null;
            updateSidebarToggleAccessibility(
                instructorFeatureSidebarEl?.classList.contains('collapsed') ?? false
            );
            return;
        }

        const featureSidebar = document.querySelector('.instructor-feature-sidebar');
        if (!featureSidebar) return;

        if (featureSidebar.classList.contains('collapsed')) {
            expandFeatureSidebar();
            return;
        }

        collapseFeatureSidebar();
        const view = getInstructorViewFromURL();
        if (view === 'chat' || view === 'welcoming-message') {
            showChatList();
        }
    });

    // Check authentication first
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) {
        // console.log('[INSTRUCTOR-MODE] ❌ User not authenticated, redirecting to login...'); // 🟢 MEDIUM: Auth status - keep for monitoring
        return; // Stop execution if not authenticated
    }

    // console.log('[INSTRUCTOR-MODE] 🚀 Loading instructor mode...'); // 🟢 MEDIUM: Loading status - keep for monitoring
    
    // Initialize inactivity tracking
    initializeInactivityTracking();

    /**
     * Load the current course from session or fallback sources
     * Priority: 1) Session course, 2) Debug course
     */
    async function loadCurrentCourse(): Promise<void> {
        try {
            // Priority 1: Try to get current course from session (set by course selection)
            // console.log('[INSTRUCTOR-MODE] 🔍 Checking for current course in session...'); // 🟢 MEDIUM: Session check - keep for monitoring
            const sessionResponse = await fetch('/api/course/current', {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (sessionResponse.ok) {
                const sessionData = await sessionResponse.json();
                if (sessionData.course && sessionData.course.courseName) {

                    // Fetch full course data using the course name from session
                    const courseResponse = await fetch(`/api/courses?name=${encodeURIComponent(sessionData.course.courseName)}`, {
                        method: 'GET',
                        credentials: 'same-origin',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (courseResponse.ok) {
                        const courseResult = await courseResponse.json();
                        if (courseResult.success && courseResult.data) {
                            currentClass = courseResult.data;
                            // console.log('[INSTRUCTOR-MODE] ✅ Course loaded from session:', currentClass.courseName); // 🟡 HIGH: Course name exposure
                            return; // Successfully loaded, exit function
                        }
                    }
                }
            }
            
            // Priority 2: Check for debug course in sessionStorage
            // console.log('[INSTRUCTOR-MODE] 🔍 No session course, checking for debug course...');
            const debugCourseData = sessionStorage.getItem('debugCourse');
            if (debugCourseData) {
                try {
                    const debugCourse = JSON.parse(debugCourseData);
                    currentClass = debugCourse;
                    // console.log('[INSTRUCTOR-MODE] ✅ Loaded debug course:', debugCourse.courseName); // 🟡 HIGH: Course name exposure
                    
                    // Clear the debug course from sessionStorage after loading
                    sessionStorage.removeItem('debugCourse');
                    return; // Successfully loaded, exit function
                } catch (error) {
                    console.error('[INSTRUCTOR-MODE] ❌ Error parsing debug course data:', error);
                }
            }
            
            // If all attempts failed, log error but keep default currentClass
            console.error('[INSTRUCTOR-MODE] ❌ Failed to load course from session or debug course');
            
        } catch (error) {
            console.error('[INSTRUCTOR-MODE] 🚨 Error loading course:', error);
            // Keep default currentClass if all loading attempts fail
        }
    }
    
    /**
     * Load the signed-in user's instructor tutorial progress.
     *
     * Progress lives on the user rather than the course, so a new instructor on an
     * already-set-up course is still taught. Leaves the all-complete default in place
     * on failure rather than forcing onboarding.
     */
    async function loadInstructorOnboardingProgress(): Promise<void> {
        try {
            const response = await fetch('/auth/current-user', { credentials: 'same-origin' });
            if (!response.ok) return;

            const data = await response.json();
            const progress = data?.globalUser?.instructorOnboarding;
            if (!progress) return;

            instructorOnboarding = {
                contentSetup: progress.contentSetup === true,
                flagSetup: progress.flagSetup === true,
                monitorSetup: progress.monitorSetup === true
            };
        } catch (error) {
            console.error('[INSTRUCTOR-MODE] 🚨 Error loading instructor onboarding progress:', error);
        }
    }

    // Load the current course and the viewer's tutorial progress
    await Promise.all([loadCurrentCourse(), loadInstructorOnboardingProgress()]);

    // Sidebar header: `{firstName} (Instructor|TA)`
    const authUser = authService.getAuthState().user;
    if (authUser) {
        updateSidebarCompanionText(authUser.name, authUser.userId, currentClass);
    }

    // Make currentClass globally accessible for onboarding completion
    window.currentClass = currentClass;

    if (isInstructorOnboardingComplete()) {
        void initializeCourseSummary(currentClass);
        void configureCourseSummaryFabVisibility(currentClass.id);
    }
    
    // Remove onboarding-active class if all setup is complete
    if (isInstructorOnboardingComplete()) {
        document.body.classList.remove('onboarding-active');
    }

    // Listen for document setup completion event
    window.addEventListener('documentSetupComplete', () => {
        // console.log('📋 Document setup completed, redirecting to next onboarding stage...');
        
        const courseId = getCourseIdFromURL();
        if (courseId) {
            // Check if flag setup is needed
            if (!instructorOnboarding.flagSetup) {
                window.location.href = `/course/${courseId}/instructor/onboarding/flag-setup`;
            } else if (!instructorOnboarding.monitorSetup) {
                window.location.href = `/course/${courseId}/instructor/onboarding/monitor-setup`;
            } else {
                window.location.href = `/course/${courseId}/instructor/documents`;
            }
        } else {
            // Fallback to old behavior
            redirectToDocumentsPage();
        }
    });

    // Listen for flag setup completion event
    window.addEventListener('flagSetupComplete', () => {
        // console.log('🏁 Flag setup completed, redirecting to monitor setup...');
        
        const courseId = getCourseIdFromURL();
        if (courseId) {
            if (!instructorOnboarding.monitorSetup) {
                window.location.href = `/course/${courseId}/instructor/onboarding/monitor-setup`;
            } else {
                window.location.href = `/course/${courseId}/instructor/documents`;
            }
        } else {
            // Fallback to old behavior
            updateUI();
        }
    });

    // Listen for monitor setup completion event
    window.addEventListener('monitorSetupComplete', () => {
        // console.log('📊 Monitor setup completed, redirecting to main interface...');
        
        const courseId = getCourseIdFromURL();
        if (courseId) {
            window.location.href = `/course/${courseId}/instructor/documents`;
        } else {
            // Fallback to old behavior
            redirectToMainInterface();
        }
    });

    /**
     * Redirect to documents page after document setup completion
     */
    function redirectToDocumentsPage(): void {
        // console.log('🔄 Document setup completed, proceeding to next onboarding step...');
        
        // Keep onboarding-active class - sidebar should remain hidden until ALL onboarding is complete
        // The class will be removed automatically once courseSetup and all three per-user tutorials are done
        
        // Update the UI - this will check the viewer's flagSetup progress and proceed to flag setup if needed
        updateUI();
        
        // console.log('✅ Successfully redirected to documents page');
    }

    /**
     * Redirect to main interface after flag setup completion
     */
    function redirectToMainInterface(): void {
        // console.log('🔄 Flag setup completed, redirecting to main interface...');
        
        // Remove onboarding-active class from body
        document.body.classList.remove('onboarding-active');
        
        // Show the main instructor interface
        const mainContentArea = document.getElementById('main-content-area');
        if (mainContentArea) {
            mainContentArea.style.display = 'block';
        }
        
        // Show the sidebar
        const sidebar = document.querySelector('.instructor-sidebar');
        if (sidebar) {
            (sidebar as HTMLElement).style.display = 'flex';
        }
        
        // Switch to dashboard view (default home)
        currentState = StateEvent.Dashboard;
        
        // Update the UI
        updateUI();
        
        // console.log('✅ Successfully redirected to main interface');
    }

    /**
     * Update UI elements after document setup completion
     */
    function updateUIAfterDocumentSetup(): void {
        // Update course status indicators
        const courseStatusElements = document.querySelectorAll('.course-status');
        courseStatusElements.forEach(element => {
            element.textContent = 'Setup Complete';
            element.classList.add('status-complete');
        });
        
        // Show success message
        const successMessage = document.createElement('div');
        successMessage.className = 'setup-complete-message';
        successMessage.innerHTML = `
            <div class="success-banner">
                <h3>✅ Document Setup Complete!</h3>
                <p>Your course materials have been successfully configured. You can now manage your course content.</p>
            </div>
        `;
        
        // Insert the success message at the top of the main content
        const mainContent = document.getElementById('main-content-area');
        if (mainContent && mainContent.firstChild) {
            mainContent.insertBefore(successMessage, mainContent.firstChild);
            
            // Remove the success message after 5 seconds
            setTimeout(() => {
                if (successMessage.parentNode) {
                    successMessage.parentNode.removeChild(successMessage);
                }
            }, 5000);
        }
    }

    // --- MOBILE SIDEBAR ---
    const openMobileSidebar = (): void => {
        if (!sidebarEl || !instructorSidebarOverlayEl) return;

        // The desktop width preference can otherwise leave a 64px drawer with
        // hidden labels and no visible collapse control at the mobile breakpoint.
        // Normalize the two-pane chat layout without overwriting that preference.
        const view = getInstructorViewFromURL();
        if (view === 'chat' || view === 'welcoming-message') {
            setSidebarCollapsed(true, false);
            showChatList();
        } else {
            setSidebarCollapsed(false, false);
            hideChatList();
        }

        sidebarEl.classList.add('mobile-open');
        instructorSidebarOverlayEl.classList.add('show');
        instructorSidebarOverlayEl.setAttribute('aria-hidden', 'false');
        updateSidebarToggleAccessibility(
            instructorFeatureSidebarEl?.classList.contains('collapsed') ?? false
        );
    };

    const closeMobileSidebar = (): void => {
        if (!sidebarEl || !instructorSidebarOverlayEl) return;
        sidebarEl.classList.remove('mobile-open');
        instructorSidebarOverlayEl.classList.remove('show');
        instructorSidebarOverlayEl.setAttribute('aria-hidden', 'true');
        updateSidebarToggleAccessibility(
            instructorFeatureSidebarEl?.classList.contains('collapsed') ?? false
        );
    };

    const toggleMobileSidebar = (): void => {
        if (!sidebarEl) return;
        if (sidebarEl.classList.contains('mobile-open')) {
            closeMobileSidebar();
        } else {
            openMobileSidebar();
        }
    };

    // Event delegation for hamburger (works across all loaded components including chat/welcome)
    document.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const mobileTrigger = target.closest(
            '#hamburger-btn, #instructor-hamburger-btn, .mobile-hamburger-btn, .instructor-mobile-hamburger-btn'
        ) as HTMLElement | null;
        if (mobileTrigger) {
            if (isMobileView()) {
                instructorMobileSidebarTrigger = mobileTrigger;
                toggleMobileSidebar();
            }
        }
    });

    // Overlay click closes sidebar
    instructorSidebarOverlayEl?.addEventListener('click', () => {
        if (isMobileView()) closeMobileSidebar();
    });

    // Close sidebar when clicking any sidebar menu item or footer button
    sidebarEl?.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('.menu-list-item') || target.closest('.instructor-sidebar-footer button') ||
            target.closest('.chat-item') || target.closest('.add-chat-btn')) {
            if (isMobileView()) closeMobileSidebar();
        }
    });

    // Current State
    let currentState: StateEvent = StateEvent.Dashboard;

    // Check if we're on the new course onboarding route FIRST (before extracting courseId)
    const isNewCourseOnboarding = isNewCourseOnboardingURL();
    
    // Extract courseId and view from URL (after currentState is declared)
    const courseIdFromURL = getCourseIdFromURL();
    const viewFromURL = getInstructorViewFromURL();
    const onboardingStageFromURL = getInstructorOnboardingStageFromURL();
    
    // For new course onboarding, skip course validation
    if (!isNewCourseOnboarding) {
        // Validate courseId matches session (only if not new course onboarding)
        const sessionResponse = await fetch('/api/course/current');
        const sessionData = await sessionResponse.json();
        
        if (courseIdFromURL && sessionData.course?.courseId !== courseIdFromURL) {
            // Optionally redirect to sync session - but for now, just log warning
        }
    }
    
    // Check if we're on new course onboarding route
    if (isNewCourseOnboarding) {
        // Don't set currentState - onboarding will be handled in updateUI() based on URL
        // Skip the regular view logic below
    } else if (onboardingStageFromURL) {
        // Check if we're on an onboarding URL for existing course
        // Don't set currentState - onboarding will be handled in updateUI() based on URL
        // Skip the regular view logic below
    } else if (viewFromURL) {
        // Legacy settings / course-information URLs → dashboard (Advanced Settings lives there)
        if (viewFromURL === 'settings' || viewFromURL === 'course-information') {
            replaceInstructorViewURL('dashboard');
            currentState = StateEvent.Dashboard;
        } else if (viewFromURL === 'about') {
            // About is handled separately in initialization; keep current state as is
        } else {
            currentState = mapViewToStateEvent(viewFromURL);
        }
    } else {
        // Default to dashboard if no view specified and not on onboarding URL
        currentState = StateEvent.Dashboard;
        // Redirect to dashboard URL if not already there
        if (courseIdFromURL) {
            navigateToInstructorView('dashboard');
            // Note: navigateToInstructorView uses pushState, so we continue execution
        }
    }

    const FEATURE_NOTICE_LABELS: Record<string, string> = {
        writingFeedback: 'Writing Feedback',
        memoryAgent: 'Memory Agent',
        guidedPathway: 'Guided Pathway',
        scenarioGeneration: 'Scenario Generation'
    };
    const noticeParams = new URLSearchParams(window.location.search);
    const notice = noticeParams.get('notice');
    if (notice === 'writing-feedback-disabled' || notice === 'feature-disabled') {
        const featureKey = noticeParams.get('feature') || (notice === 'writing-feedback-disabled' ? 'writingFeedback' : '');
        const label = FEATURE_NOTICE_LABELS[featureKey] || 'This feature';
        void showSimpleErrorModal(
            `${label} is not enabled for this course. You can enable it from Advanced Settings on the Dashboard if you have instructor or admin access.`,
            'Feature unavailable'
        );
        const cleanUrl = `${window.location.pathname}${window.location.hash}`;
        window.history.replaceState(window.history.state, '', cleanUrl);
    }

    // --- STATE MANAGEMENT ----
    const dashboardStateEl = document.getElementById('dashboard-state');
    const flagStateEl = document.getElementById('flag-state');
    const monitorStateEl = document.getElementById('monitor-state');
    const documentsStateEl = document.getElementById('documents-state');
    const writingFeedbackStateEl = document.getElementById('writing-feedback-state');
    const chatStateEl = document.getElementById('chat-state');
    const assistantPromptsStateEl = document.getElementById('assistant-prompts-state');
    const systemPromptsStateEl = document.getElementById('system-prompts-state');
    const scenarioQuestionsStateEl = document.getElementById('scenario-questions-state');
    const pathwayLibraryStateEl = document.getElementById('pathway-library-state');

    dashboardStateEl?.addEventListener('click', () => {
        navigateToInstructorView('dashboard');
    });

    chatStateEl?.addEventListener('click', async () => {
        navigateToInstructorView('chat');
    });

    flagStateEl?.addEventListener('click', () => {
        navigateToInstructorView('flags');
    });

    monitorStateEl?.addEventListener('click', () => {
        navigateToInstructorView('monitor');
    });

    documentsStateEl?.addEventListener('click', () => {
        navigateToInstructorView('documents');
    });

    writingFeedbackStateEl?.addEventListener('click', () => {
        navigateToInstructorView('writing-feedback');
    });

    assistantPromptsStateEl?.addEventListener('click', () => {
        navigateToInstructorView('assistant-prompts');
    });

    systemPromptsStateEl?.addEventListener('click', () => {
        navigateToInstructorView('system-prompts');
    });

    scenarioQuestionsStateEl?.addEventListener('click', () => {
        navigateToInstructorView('scenario-questions');
    });

    pathwayLibraryStateEl?.addEventListener('click', () => {
        navigateToInstructorView('pathway-library');
    });
    
    // Handle browser back/forward navigation
    window.addEventListener('popstate', async () => {
        const view = getInstructorViewFromURL();
        const chatId = getChatIdFromURL();
        
        if (view) {
            if (view === 'settings' || view === 'course-information') {
                replaceInstructorViewURL('dashboard');
                currentState = StateEvent.Dashboard;
                updateUI();
            } else if (view === 'chat') {
                // Load chat interface
                await showChatContent();
            } else if (view === 'about') {
                // Load about component
                await renderAbout({ state: currentState, mode: 'instructor' });
            } else if (view === 'welcoming-message') {
                // Show welcome screen (chat view with no chats)
                currentState = StateEvent.Chat;
                await showChatContent();
            } else if (view === 'writing-feedback' && currentClass.features?.writingFeedback?.enabled !== true) {
                await showSimpleErrorModal(
                    'Writing Feedback is not enabled for this course. You can enable it from Advanced Settings on the Dashboard if you have instructor or admin access.',
                    'Feature unavailable'
                );
                navigateToInstructorView('dashboard');
            } else if (view === 'pathway-library' && currentClass.features?.guidedPathway?.enabled !== true) {
                await showSimpleErrorModal(
                    'Guided Pathway is not enabled for this course. You can enable it from Advanced Settings on the Dashboard if you have instructor or admin access.',
                    'Feature unavailable'
                );
                navigateToInstructorView('dashboard');
            } else if (view === 'scenario-questions' && currentClass.features?.scenarioGeneration?.enabled !== true) {
                await showSimpleErrorModal(
                    'Scenario Generation is not enabled for this course. You can enable it from Advanced Settings on the Dashboard if you have instructor or admin access.',
                    'Feature unavailable'
                );
                navigateToInstructorView('dashboard');
            } else if (
                (view === 'monitor' || view === 'assistant-prompts' || view === 'system-prompts' || view === 'scenario-questions' || view === 'pathway-library') &&
                window.innerWidth < 768
            ) {
                // Desktop-first warning on mobile/tablet
                const result = await showConfirmModal(
                    'Desktop Recommended',
                    'This feature is usually handled on desktop. Are you sure you want to continue on a non-desktop device?',
                    'Continue',
                    'Go Back'
                );
                if (result.action === 'continue') {
                    currentState = mapViewToStateEvent(view);
                    updateUI();
                } else {
                    navigateToInstructorView('dashboard');
                }
            } else if (
                view === 'scenario-questions' &&
                currentState === StateEvent.ScenarioQuestions &&
                isScenarioQuestionsMounted()
            ) {
                await syncScenarioQuestionsFromURL(true);
            } else {
                // Load component for current view
                currentState = mapViewToStateEvent(view);
                updateUI();
            }
        }
    });



    // Artefact functionality moved to chat.ts


    const loadComponent = async (
        componentName :'flag-instructor' 
                        | 'monitor-instructor' 
                        | 'documents-instructor'
                        | 'dashboard-instructor'
                        | 'writing-feedback'
                        | 'flag-history' 
                        | 'course-setup'
                        | 'document-setup'
                        | 'assistant-prompts-instructor'
                        | 'system-prompts-instructor'
                        | 'scenario-questions-instructor'
                        | 'pathway-library-instructor'
        ) => {


        if (!mainContentAreaEl) {
            console.error('❌ [INSTRUCTOR-DEBUG] Main content area element not found!'); // Keep - from try-catch context
            return;
        }

        try {
            if (
                document.getElementById('system-prompt-modules-list') &&
                componentName !== 'system-prompts-instructor'
            ) {
                await flushSystemPromptOnLeave();
            }

            const html = await loadComponentHTML(componentName);

            mainContentAreaEl.innerHTML = html;
            
            if (componentName === 'documents-instructor') {
                initializeDocumentsPage(currentClass);
            }
            else if (componentName === 'dashboard-instructor') {
                await initializeDashboard(currentClass);
            }
            else if (componentName === 'writing-feedback') {
                await initializeWritingFeedback(currentClass);
            }
            else if (componentName === 'flag-instructor') {
                await initializeFlags();
            }
            else if (componentName === 'monitor-instructor') {
                initializeMonitorDashboard();
            }
            else if (componentName === 'course-setup') {
                // Course setup component - handled by renderOnCourseSetup
            }
            else if (componentName === 'document-setup') {
                //course setup component - handled by renderDocumentSetup
            }
            else if (componentName === 'assistant-prompts-instructor') {
                await initializeAssistantPrompts(currentClass);
            }
            else if (componentName === 'system-prompts-instructor') {
                await initializeSystemPrompts(currentClass);
            }
            else if (componentName === 'scenario-questions-instructor') {
                await initializeScenarioQuestionsInstructor(currentClass);
            }
            else if (componentName === 'pathway-library-instructor') {
                await initializePathwayLibrary(currentClass);
            }
            
            renderFeatherIcons();
            
        }
        catch (error) {
            console.error(`❌ [INSTRUCTOR-DEBUG] Error loading component ${componentName}:`, error);
            mainContentAreaEl.innerHTML = `<p style="color: red; text-align: center;"> Error loading content. </p>`
        }
    };

    const updateUI = () => {

        // console.log("updateUI is called");
        // console.log("current state is : " + currentState.toString());
        // console.log("currentClass is : ", JSON.stringify(currentClass));

        // Check if we're on a new course onboarding URL FIRST (before checking course-scoped onboarding URLs)
        const isNewCourseOnboarding = isNewCourseOnboardingURL();
        if (isNewCourseOnboarding) {
            console.log(`[INSTRUCTOR-MODE] 🆕 Rendering new course setup from URL`);
            renderOnCourseSetup(currentClass);
            return;
        }

        // Check if we're on an onboarding URL - prioritize URL over flags
        const onboardingStageFromURL = getInstructorOnboardingStageFromURL();
        if (onboardingStageFromURL) {
            console.log(`[INSTRUCTOR-MODE] 🎓 Rendering onboarding stage from URL: ${onboardingStageFromURL}`);
            switch (onboardingStageFromURL) {
                case 'course-setup':
                    renderOnCourseSetup(currentClass);
                    return;
                case 'document-setup':
                    renderDocumentSetup(currentClass);
                    return;
                case 'flag-setup':
                    renderFlagSetup(currentClass);
                    return;
                case 'monitor-setup':
                    renderMonitorSetup(currentClass);
                    return;
            }
        }

        // Fallback to flag-based detection if not on onboarding URL.
        // `courseSetup` is course state; the three tutorials are the viewer's own progress.
        if (!currentClass.courseSetup) {
            renderOnCourseSetup(currentClass);
            return;
        }
        if (!instructorOnboarding.contentSetup) {
            renderDocumentSetup(currentClass); // change this to renderOnContentSetup later
            return;
        }
        if (!instructorOnboarding.flagSetup) {
            renderFlagSetup(currentClass);
            return;
        }
        if (!instructorOnboarding.monitorSetup) {
            renderMonitorSetup(currentClass);
            return;
        }

        if ( currentState === StateEvent.Dashboard){
            loadComponent('dashboard-instructor');
            updateSidebarState();
            expandFeatureSidebar();
            hideChatList();
        }
        else if ( currentState === StateEvent.Flag){
            loadComponent('flag-instructor');
            updateSidebarState();
            applySidebarPreference();
            hideChatList(); // Ensure chat list is hidden
        }
        else if ( currentState === StateEvent.Monitor){
            loadComponent('monitor-instructor');
            updateSidebarState();
            applySidebarPreference();
            hideChatList(); // Ensure chat list is hidden
        }
        else if ( currentState === StateEvent.Documents){
            loadComponent('documents-instructor');
            updateSidebarState();
            applySidebarPreference();
            hideChatList(); // Ensure chat list is hidden
        }
        else if (currentState === StateEvent.WritingFeedback) {
            if (currentClass.features?.writingFeedback?.enabled !== true) {
                void showSimpleErrorModal(
                    'Writing Feedback is not enabled for this course. You can enable it from Advanced Settings on the Dashboard if you have instructor or admin access.',
                    'Feature unavailable'
                );
                navigateToInstructorView('dashboard');
                return;
            }
            loadComponent('writing-feedback');
            updateSidebarState();
            expandFeatureSidebar();
            hideChatList();
        }
        else if ( currentState === StateEvent.Chat){
            updateSidebarState(); // Update menu active state
            // Narrow the rail to make room for the chat list, but leave the stored
            // preference alone so the other tabs still open the way the reader left them.
            setSidebarCollapsed(true, false);
            // showChatContent is now handled by the click event listener
        }
        else if ( currentState === StateEvent.AssistantPrompts){
            loadComponent('assistant-prompts-instructor');
            updateSidebarState();
            applySidebarPreference();
            hideChatList(); // Ensure chat list is hidden
        }
        else if ( currentState === StateEvent.SystemPrompts){
            loadComponent('system-prompts-instructor');
            updateSidebarState();
            applySidebarPreference();
            hideChatList(); // Ensure chat list is hidden
        }
        else if ( currentState === StateEvent.ScenarioQuestions){
            if (currentClass.features?.scenarioGeneration?.enabled !== true) {
                void showSimpleErrorModal(
                    'Scenario Generation is not enabled for this course. You can enable it from Advanced Settings on the Dashboard if you have instructor or admin access.',
                    'Feature unavailable'
                );
                navigateToInstructorView('dashboard');
                return;
            }
            loadComponent('scenario-questions-instructor');
            updateSidebarState();
            applySidebarPreference();
            hideChatList(); // Ensure chat list is hidden
        }
        else if ( currentState === StateEvent.PathwayLibrary){
            if (currentClass.features?.guidedPathway?.enabled !== true) {
                void showSimpleErrorModal(
                    'Guided Pathway is not enabled for this course. You can enable it from Advanced Settings on the Dashboard if you have instructor or admin access.',
                    'Feature unavailable'
                );
                navigateToInstructorView('dashboard');
                return;
            }
            loadComponent('pathway-library-instructor');
            updateSidebarState();
            expandFeatureSidebar();
            hideChatList();
        }
    }

    /**
     * getCourse
     * 
     * @param courseName string — Course name to fetch
     * @returns Promise<activeCourse> — Course data from GET /api/courses?name=
     */
    async function getCourse (courseName: string){
        const response = await fetch(`/api/courses?name=${courseName}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch course');
        }
        
        return result.data; // Return only the course data, not the wrapper object
    }
    
    const updateSidebarState = () => {
        // Handle collapsed state
        if (sidebarMenuListEl) {
            if (isSidebarCollapsed) {
                sidebarMenuListEl.classList.add('collapsed');
            } else {
                sidebarMenuListEl.classList.remove('collapsed');
            }
        }
        
        // Handle active state for menu items
        // Remove active class from all menu items first
        dashboardStateEl?.classList.remove('active');
        documentsStateEl?.classList.remove('active');
        writingFeedbackStateEl?.classList.remove('active');
        chatStateEl?.classList.remove('active');
        flagStateEl?.classList.remove('active');
        monitorStateEl?.classList.remove('active');
        assistantPromptsStateEl?.classList.remove('active');
        systemPromptsStateEl?.classList.remove('active');
        scenarioQuestionsStateEl?.classList.remove('active');
        pathwayLibraryStateEl?.classList.remove('active');
        [
            dashboardStateEl,
            documentsStateEl,
            writingFeedbackStateEl,
            chatStateEl,
            flagStateEl,
            monitorStateEl,
            assistantPromptsStateEl,
            systemPromptsStateEl,
            scenarioQuestionsStateEl,
            pathwayLibraryStateEl
        ].forEach((item) => item?.removeAttribute('aria-current'));

        // Add active class to the current state's menu item
        switch(currentState) {
            case StateEvent.Dashboard:
                dashboardStateEl?.classList.add('active');
                break;
            case StateEvent.Documents:
                documentsStateEl?.classList.add('active');
                break;
            case StateEvent.WritingFeedback:
                writingFeedbackStateEl?.classList.add('active');
                break;
            case StateEvent.Chat:
                chatStateEl?.classList.add('active');
                break;
            case StateEvent.Flag:
                flagStateEl?.classList.add('active');
                break;
            case StateEvent.Monitor:
                monitorStateEl?.classList.add('active');
                break;
            case StateEvent.AssistantPrompts:
                assistantPromptsStateEl?.classList.add('active');
                break;
            case StateEvent.SystemPrompts:
                systemPromptsStateEl?.classList.add('active');
                break;
            case StateEvent.ScenarioQuestions:
                scenarioQuestionsStateEl?.classList.add('active');
                break;
            case StateEvent.PathwayLibrary:
                pathwayLibraryStateEl?.classList.add('active');
                break;
        }
        [
            dashboardStateEl,
            documentsStateEl,
            writingFeedbackStateEl,
            chatStateEl,
            flagStateEl,
            monitorStateEl,
            assistantPromptsStateEl,
            systemPromptsStateEl,
            scenarioQuestionsStateEl,
            pathwayLibraryStateEl
        ].find((item) => item?.classList.contains('active'))?.setAttribute('aria-current', 'page');
    }

    const updateFeatureNavigation = () => {
        const wfEnabled = currentClass.features?.writingFeedback?.enabled === true;
        const pathwayEnabled = currentClass.features?.guidedPathway?.enabled === true;
        const scenarioEnabled = currentClass.features?.scenarioGeneration?.enabled === true;

        // Hide the whole sidebar list item (not only the button) when a capability is off.
        if (writingFeedbackStateEl) {
            writingFeedbackStateEl.hidden = !wfEnabled;
            const wfItem = writingFeedbackStateEl.closest('li');
            if (wfItem) wfItem.hidden = !wfEnabled;
        }
        if (pathwayLibraryStateEl) {
            pathwayLibraryStateEl.hidden = !pathwayEnabled;
            const pathwayItem = pathwayLibraryStateEl.closest('li');
            if (pathwayItem) pathwayItem.hidden = !pathwayEnabled;
        }
        if (scenarioQuestionsStateEl) {
            scenarioQuestionsStateEl.hidden = !scenarioEnabled;
            const scenarioItem = scenarioQuestionsStateEl.closest('li');
            if (scenarioItem) scenarioItem.hidden = !scenarioEnabled;
        }
        if (currentState === StateEvent.Dashboard) {
            renderDashboardCards(currentClass);
        }
    };
    updateFeatureNavigation();

    window.addEventListener('course-feature-changed', (event: Event) => {
        const detail = (event as CustomEvent<{ feature?: string; enabled?: boolean }>).detail;
        if (!detail?.feature) return;
        currentClass.features = {
            ...currentClass.features,
            [detail.feature]: { enabled: detail.enabled === true }
        };
        updateFeatureNavigation();
        if (detail.feature === 'writingFeedback' && !detail.enabled && currentState === StateEvent.WritingFeedback) {
            navigateToInstructorView('dashboard');
        }
        if (detail.feature === 'guidedPathway' && !detail.enabled && currentState === StateEvent.PathwayLibrary) {
            navigateToInstructorView('dashboard');
        }
        if (detail.feature === 'scenarioGeneration' && !detail.enabled && currentState === StateEvent.ScenarioQuestions) {
            navigateToInstructorView('dashboard');
        }
    });

    /**
     * Initialize ChatManager for instructor mode
     */
    const initializeChatManager = async (): Promise<void> => {
        try {
            //START DEBUG LOG : DEBUG-CODE(001)
            // console.log('🚀 Initializing ChatManager for instructor mode...'); // 🟢 MEDIUM: Debug info - keep for monitoring
            //END DEBUG LOG : DEBUG-CODE(001)
            
            // Get instructor's real User data from authentication
            const authState = authService.getAuthState();
            if (!authState.isAuthenticated || !authState.user) {
                console.error('[INSTRUCTOR-MODE] ❌ No authenticated user found');
                return;
            }
            
            // Create instructor User object via factory (handles undefined courseName safely)
            instructorUser = instructorUserFactory.createUser({
                authState,
                courseContext: currentClass
            });
            
            // Initialize ChatManager with instructor User context
            chatManager = ChatManager.getInstance({
                isInstructor: true,
                userContext: instructorUser!, // Use instructor User object instead of activeCourse
                onModeSpecificCallback: (action: string, data?: any) => {
                    
                    // Handle instructor-specific chat callbacks
                    if (action === 'new-chat-created') {
                        // Load chat window when a new chat is created from sidebar
                        const newChatId = data?.chatId;
                        if (newChatId) {
                            const courseId = getCourseIdFromURL();
                            if (courseId) {
                                navigateToChat(courseId, newChatId);
                            }
                        }
                        loadChatWindow();
                        
                        //START DEBUG LOG : DEBUG-CODE(015)
                        console.log('🆕 New chat created from sidebar, loading chat window');
                        //END DEBUG LOG : DEBUG-CODE(015)
                    } else if (action === 'chat-deleted') {
                        // Handle chat deletion - update main content area
                        console.log('🗑️ Chat deleted, updating main content area');
                        // Update URL to remove chatId if we're on that chat
                        const currentChatId = getChatIdFromURL();
                        if (currentChatId === data?.chatId) {
                            const courseId = getCourseIdFromURL();
                            if (courseId) {
                                navigateToInstructorView('chat');
                            }
                        }
                        loadChatWindow();
                    } else if (action === 'chat-clicked') {
                        // Chat is fully loaded from sidebar click, switch to chat window
                        console.log('[INSTRUCTOR-MODE] 💬 Chat loaded and ready, switching to chat window');
                        const clickedChatId = data?.chatId;
                        if (clickedChatId) {
                            const courseId = getCourseIdFromURL();
                            if (courseId) {
                                navigateToChat(courseId, clickedChatId);
                            }
                        }
                        if (data?.loaded) {
                            loadChatWindow();
                        }
                    } else if (action === 'chat-load-failed') {
                        console.error('[INSTRUCTOR-MODE] ❌ Chat loading failed:', data?.error);
                        showWelcomeScreen();
                    }
                }
            });
            
            // Initialize the chat manager
            await chatManager.initialize();
            
            // Make chatManager globally accessible
            window.chatManager = chatManager;
            
            // Make loadChatWindow globally accessible
            window.loadChatWindow = loadChatWindow;
            
            //START DEBUG LOG : DEBUG-CODE(004)
            // console.log('✅ ChatManager initialized successfully for instructor mode');
            //END DEBUG LOG : DEBUG-CODE(004)
            
            // Update UI after initialization
            updateChatUI();
            
        } catch (error) {
            console.error('❌ Error initializing ChatManager for instructor mode:', error);
        }
    };

    /**
     * Load chat window component in main content area
     * 
     * @returns Promise<void>
     * Loads chat-window component into main content area. Shows welcome screen if no chats exist.
     */
    const loadChatWindow = async (): Promise<void> => {
        if (!mainContentAreaEl) return;
        
        // Check if there are actually chats to display
        if (chatManager && chatManager.getChats().length === 0) {
            // console.log('🚫 No chats available, showing welcome screen instead of chat window');
            showWelcomeScreen();
            return;
        }
        
        try {
            // Load the chat-window component
            const chatWindowHTML = await loadComponentHTML('chat-window');
            mainContentAreaEl.innerHTML = chatWindowHTML;
            
            // Render the active chat in the loaded chat window
            if (chatManager) {
                chatManager.renderActiveChat();
                
                // Re-bind message events after chat window is loaded
                chatManager.rebindMessageEvents();
                
                //START DEBUG LOG : DEBUG-CODE(014)
                // console.log('🔗 Message events re-bound after chat window load');
                //END DEBUG LOG : DEBUG-CODE(014)
            }
            
            renderFeatherIcons();
            
            //START DEBUG LOG : DEBUG-CODE(010)
            // console.log('💬 Chat window loaded in main content area');
            //END DEBUG LOG : DEBUG-CODE(010)
            
        } catch (error) {
            console.error('Error loading chat window:', error);
            mainContentAreaEl.innerHTML = `
                <div class="error-message">
                    <h2>Chat Interface</h2>
                    <p>Failed to load chat interface. Please try again.</p>
                </div>
            `;
        }
    };

    /**
     * Load chat by ID and update URL
     * 
     * @param chatId string — ID of the chat to load
     * @returns Promise<void>
     * Loads chat by ID and updates URL. Ensures ChatManager is initialized. Shows welcome screen if chat not found.
     */
    const loadChatById = async (chatId: string): Promise<void> => {
        const courseId = getCourseIdFromURL();
        if (!courseId) {
            console.error('[INSTRUCTOR-MODE] Cannot load chat: courseId not found in URL');
            return;
        }
        
        // Update URL with chatId query parameter using navigateToChat
        navigateToChat(courseId, chatId);
        
        // Ensure ChatManager is initialized
        if (!chatManager) {
            await initializeChatManager();
        }
        
        if (!chatManager) {
            console.error('[INSTRUCTOR-MODE] ChatManager not available');
            return;
        }
        
        // Load chat content
        await loadChatWindow();
        
        // Load the specific chat
        try {
            // Check if chat exists in ChatManager
            const chats = chatManager.getChats();
            const chatExists = chats.some(chat => chat.id === chatId);
            
            if (chatExists) {
                // Chat is already loaded, just switch to it
                await chatManager.setActiveChatId(chatId);
                chatManager.renderActiveChat();
            } else {
                // Chat not in memory, try to restore it
                const restoreResponse = await fetch(`/api/chat/restore/${chatId}`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (restoreResponse.ok) {
                    const restoreData = await restoreResponse.json();
                    if (restoreData.success) {
                        if (restoreData.chat) {
                            chatManager.ingestChatFromRestore(restoreData.chat);
                        }
                        await chatManager.setActiveChatId(chatId);
                        chatManager.renderActiveChat();
                    } else {
                        console.error('[INSTRUCTOR-MODE] Failed to restore chat:', restoreData.error);
                        showWelcomeScreen();
                    }
                } else {
                    console.error('[INSTRUCTOR-MODE] Failed to restore chat from server');
                    showWelcomeScreen();
                }
            }
        } catch (error) {
            console.error('[INSTRUCTOR-MODE] Error loading chat by ID:', error);
            showWelcomeScreen();
        }
    };

    /**
     * Update chat UI after ChatManager initialization
     * 
     * @returns void
     * Updates chat UI after ChatManager initialization. Renders chat list in sidebar. Shows welcome screen if no chats exist.
     */
    const updateChatUI = (): void => {
        if (!chatManager) return;
        
        //START DEBUG LOG : DEBUG-CODE(005)
        // console.log('🔄 Updating chat UI for instructor mode...');
        //END DEBUG LOG : DEBUG-CODE(005)
        
        // Render chat list in the instructor's chat menu
        chatManager.renderChatList();
        
        // Show welcome screen if no chats exist, otherwise load chat window
        const chats = chatManager.getChats();
        
        
        if (chats.length === 0) {
            showWelcomeScreen();
        } else {
            loadChatWindow();
        }
    };

    /**
     * Show welcome screen when no chats exist
     * 
     * @returns Promise<void>
     * Shows welcome screen when no chats exist. Loads welcome screen component into main content area. Binds welcome screen events.
     */
    const showWelcomeScreen = async (): Promise<void> => {
        if (!mainContentAreaEl) return;
        
        const courseId = getCourseIdFromURL();
        if (courseId) {
            navigateToInstructorView('welcoming-message');
        }
        
        try {
            // Load welcome screen component
            const welcomeHTML = await loadComponentHTML('welcome-screen');
            mainContentAreaEl.innerHTML = welcomeHTML;
            
            // Bind welcome screen events
            const addChatBtn = mainContentAreaEl.querySelector('.welcome-add-btn');
            addChatBtn?.addEventListener('click', async () => {
                if (chatManager) {
                    
                    const result = await chatManager.createNewChat();
                    if (result.success) {
                        
                        // Load chat window in main content area after creating new chat
                        await loadChatWindow();
                        
                        // Update chat list in sidebar
                        chatManager.renderChatList();
                        
                        // Re-bind message events after creating new chat
                        chatManager.rebindMessageEvents();
                    }
                }
            });
            
            renderFeatherIcons();
        } catch (error) {
            console.error('Error loading welcome screen:', error);
            mainContentAreaEl.innerHTML = `
                <div class="error-message">
                    <h2>Welcome to Instructor Chat</h2>
                    <p>Click the button below to start a new chat session.</p>
                    <button class="welcome-add-btn" onclick="if(window.chatManager) { window.chatManager.createNewChat().then(async result => { if(result.success) { await window.loadChatWindow(); window.chatManager.renderChatList(); } }); }">
                        Start New Chat
                    </button>
                </div>
            `;
        }
    };

    /**
     * Show chat content
     * 
     * @returns Promise<void>
     * Shows chat content. Updates current state. Updates menu active state. Ensures feature sidebar is collapsed when in chat mode. Shows chat list (slides in from left to right). Loads specific chat if chatId is in URL. Initializes ChatManager if not already done.
     */
    const showChatContent = async (): Promise<void> => {
        // Update current state
        currentState = StateEvent.Chat;
        
        // Update menu active state
        updateSidebarState();
        
        // Narrow the rail so the chat list has room, without overwriting the
        // reader's stored preference for the other tabs.
        setSidebarCollapsed(true, false);


        // Show chat list (slides in from left to right)
        showChatList();
        
        // Check if there's a chatId in URL
        const chatIdFromURL = getChatIdFromURL();
        if (chatIdFromURL) {
            // Load specific chat
            await loadChatById(chatIdFromURL).catch(err => {
                console.error('[INSTRUCTOR-MODE] Error loading chat from URL:', err);
                // Fall back to normal chat UI
                if (!chatManager) {
                    initializeChatManager();
                } else {
                    updateChatUI();
                }
            });
        } else {
            // Initialize ChatManager if not already done
            if (!chatManager) {
                await initializeChatManager();
            } else {
                // Update UI if ChatManager already exists
                updateChatUI();
            }
        }
    }

    /**
     * Next destination once course setup is done, from the viewer's own tutorial progress.
     *
     * Mirrors the tail of the server's `resolveInstructorModeRedirect`. An instructor who
     * has already been taught lands on the course; one who has not is taught, even when a
     * colleague set the course up.
     */
    function nextStageAfterCourseSetup(courseId: string): string {
        if (!instructorOnboarding.contentSetup) {
            return `/course/${courseId}/instructor/onboarding/document-setup`;
        }
        if (!instructorOnboarding.flagSetup) {
            return `/course/${courseId}/instructor/onboarding/flag-setup`;
        }
        if (!instructorOnboarding.monitorSetup) {
            return `/course/${courseId}/instructor/onboarding/monitor-setup`;
        }
        return `/course/${courseId}/instructor/documents`;
    }

    //set custom windows listener on onboarding
    window.addEventListener('onboardingComplete', async () => {
        
        // Check if we're coming from new-course onboarding (course was just created)
        const isNewCourse = isNewCourseOnboardingURL();
        
        // Get courseId from currentClass (it should be set after course creation)
        const courseId = currentClass?.id;
        
        if (isNewCourse && courseId) {
            // Store course in session
            try {
                await fetch('/api/course/enter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ courseId })
                });
            } catch (error) {
                console.error('[INSTRUCTOR-MODE] Error entering course:', error);
            }

            // Tutorial progress is per-user, so an instructor who has already been taught
            // skips straight to the course instead of being offered a skip prompt.
            window.location.href = nextStageAfterCourseSetup(courseId);
        } else if (courseId) {
            // Existing course - redirect to next onboarding stage or main interface
            window.location.href = nextStageAfterCourseSetup(courseId);
        } else {
            // Fallback: update UI (shouldn't happen, but just in case)
            console.warn('[INSTRUCTOR-MODE] ⚠️ Course setup completed but courseId not available');
            updateUI();
        }
    })

    // --- LOGOUT FUNCTIONALITY ---
    /**
     * Handle instructor logout
     * 
     * @returns Promise<void>
     * Shows confirmation modal. Checks current authentication status before logout. Calls authService.logout. Redirects to login page if logout fails.
     */
    const handleInstructorLogout = async (): Promise<void> => {
        try {
            // Show confirmation modal
            const result = await showConfirmModal(
                'Confirm Logout',
                'Are you sure you want to log out? You will be redirected to the login page.',
                'Log Out',
                'Cancel'
            );
            if (result.action !== 'log-out') {
                console.log('[INSTRUCTOR-MODE] 🚫 Logout cancelled by user');
                return;
            }
            
            
            // Check current authentication status before logout
            const authCheck = await fetch('/auth/me', {
                method: 'GET',
                credentials: 'same-origin'
            });
            const authData = await authCheck.json();
    
            // Call logout endpoint - let the browser follow the redirect naturally
           
            window.location.href = '/auth/logout';
            
        } catch (error) {
            // Fallback: redirect to login page
            window.location.href = '/';
        }
    };

    /**
     * Attach instructor logout listener
     * 
     * @returns void
     * Attaches logout button listener. Attaches about button listener. Attaches course information button listener. Attaches course selection button listener.
     */
    const attachInstructorLogoutListener = () => {
        const logoutBtn = document.getElementById('instructor-logout-btn');
        if (!logoutBtn) {
            console.warn('[INSTRUCTOR-MODE] ⚠️ Logout button not found');
            return;
        }
        
        logoutBtn.addEventListener('click', handleInstructorLogout);

        // About button listener
        const aboutBtn = document.getElementById('instructor-about-btn');
        if (aboutBtn) {
            aboutBtn.addEventListener('click', async () => {
                navigateToInstructorView('about');
            });
        }

        const courseSummaryFab = document.getElementById('course-summary-summon-fab');
        if (courseSummaryFab) {
            courseSummaryFab.addEventListener('click', () => {
                const cc = (window as unknown as { currentClass?: activeCourse }).currentClass;
                if (!cc) {
                    console.warn('[INSTRUCTOR-MODE] course summary FAB: currentClass not ready');
                    return;
                }
                void summonCourseSummary(cc);
            });
        }

        // Course Selection button listener
        const courseSelectionBtn = document.getElementById('instructor-course-selection-btn');
        if (courseSelectionBtn) {
            courseSelectionBtn.addEventListener('click', async () => {

                // Clear all frontend state
                try {
                    // Clear local storage
                    localStorage.clear();

                    // Clear any global state objects (adjust based on your app's state management)
                    if ((window as any).appState) {
                        (window as any).appState = {};
                    }

                    // Navigate to course selection (server will handle session cleanup)
                    window.location.href = '/course-selection';
                } catch (error) {
                    // Still navigate even if clearing fails
                    window.location.href = '/course-selection';
                }
            });
            // console.log('[INSTRUCTOR-MODE] ✅ Course Selection button listener attached');
        }
    };

    /**
     * Restore previous state
     * 
     * @returns void
     * Restores previous state. Navigates back to dashboard view when closing about/course-info. Updates UI if no courseId is found.
     */
    const restorePreviousState = () => {
        // Navigate back to dashboard view when closing about/course-info
        const courseId = getCourseIdFromURL();
        if (courseId) {
            navigateToInstructorView('dashboard');
        } else {
            updateUI();
        }
    };

    // Listen for about page close event
    window.addEventListener('about-page-closed', restorePreviousState);

    // Artefact functionality moved to chat.ts

    // Attach logout button listener
    attachInstructorLogoutListener();
    
    // Load appropriate component based on URL view
    if (isNewCourseOnboarding) {
        // New course onboarding URL detected - let updateUI() handle it
        // console.log(`[INSTRUCTOR-MODE] 🎓 Loading new course onboarding`);
        updateUI();
    } else if (onboardingStageFromURL) {
        // Onboarding URL detected for existing course - let updateUI() handle it
        // console.log(`[INSTRUCTOR-MODE] 🎓 Loading onboarding stage: ${onboardingStageFromURL}`);
        updateUI();
    } else if (viewFromURL === 'chat') {
        // Use the same initialization path for empty chat and deep-linked chats so
        // a hard reload always restores the collapsed rail and visible chat list.
        await showChatContent();
    } else if (viewFromURL === 'about') {
        // Load about component
        await renderAbout({ state: currentState, mode: 'instructor' });
    } else if (viewFromURL === 'welcoming-message') {
        // Show welcome screen (chat view with no chats)
        currentState = StateEvent.Chat;
        await showChatContent();
    } else if (
        (viewFromURL === 'monitor' || viewFromURL === 'assistant-prompts' || viewFromURL === 'system-prompts' || viewFromURL === 'scenario-questions' || viewFromURL === 'pathway-library') &&
        window.innerWidth < 768
    ) {
        // Desktop-first warning for Monitor, Assistant Prompts, System Prompts on mobile/tablet
        const result = await showConfirmModal(
            'Desktop Recommended',
            'This feature is usually handled on desktop. Are you sure you want to continue on a non-desktop device?',
            'Continue',
            'Go Back'
        );
        if (result.action === 'continue') {
            updateUI();
        } else {
            navigateToInstructorView('dashboard');
        }
    } else {
        // Load component for current view
        updateUI();
    }

});

/**
 * initializeInactivityTracking - start server-directed idle poll loop
 */
function initializeInactivityTracking(): void {
    startInactivityTracking();
}
