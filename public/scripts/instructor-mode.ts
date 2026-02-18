import { loadComponentHTML, renderFeatherIcons } from "./functions/api.js";
import { activeCourse, User } from "../../src/functions/types.js";
import { instructorUserFactory } from "./factories/InstructorUserFactory.js";
import { initializeDocumentsPage } from "./feature/documents.js";
import { renderOnCourseSetup } from "./onboarding/course-setup.js";
import { renderDocumentSetup } from "./onboarding/document-setup.js";
import { renderFlagSetup } from "./onboarding/flag-setup.js";
import { renderMonitorSetup } from "./onboarding/monitor-setup.js";
import { initializeFlags } from "./feature/flags.js";
import { initializeMonitorDashboard } from "./feature/monitor.js";
import { ChatManager } from "./feature/chat.js";
import { authService } from './services/AuthService.js';
import { showConfirmModal, showInactivityWarningModal } from './modal-overlay.js';
import { renderAbout } from './about/about.js';
import { initializeCourseInformation } from './feature/course-information.js';
import { inactivityTracker } from './services/InactivityTracker.js';
import { initializeAssistantPrompts, hasUnsavedPromptChanges, resetUnsavedPromptChanges } from './feature/assistant-prompts.js';
import { initializeSystemPrompts, hasUnsavedSystemPromptChanges, resetUnsavedSystemPromptChanges } from './feature/system-prompts.js';
import { 
    getCourseIdFromURL, 
    getInstructorViewFromURL, 
    getChatIdFromURL,
    navigateToInstructorView,
    navigateToChat,
    getInstructorOnboardingStageFromURL,
    isNewCourseOnboardingURL
} from './utils/url-parser.js';

// Authentication check function
async function checkAuthentication(): Promise<boolean> {
    // Get courseId from URL if available, otherwise use default redirect
    const courseId = getCourseIdFromURL();
    const redirectPath = courseId ? `/course/${courseId}/instructor/documents` : '/pages/instructor-mode.html';
    return await authService.checkAuthenticationAndRedirect(redirectPath, 'INSTRUCTOR-MODE');
}

/**
 * Map URL view name to StateEvent enum
 */
function mapViewToStateEvent(view: string): StateEvent {
    switch (view) {
        case 'documents': return StateEvent.Documents;
        case 'flags': return StateEvent.Flag;
        case 'monitor': return StateEvent.Monitor;
        case 'chat': return StateEvent.Chat;
        case 'assistant-prompts': return StateEvent.AssistantPrompts;
        case 'system-prompts': return StateEvent.SystemPrompts;
        default: return StateEvent.Documents;
    }
}

const enum StateEvent {
    Flag,
    Monitor,
    Documents,
    Chat,
    AssistantPrompts,
    SystemPrompts
}

let currentClass : activeCourse =
{
    id: '',
    date: new Date(),
    courseSetup : true,
    contentSetup : true,
    flagSetup : true,
    monitorSetup : true,
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
    
    // Load the current course
    await loadCurrentCourse();

    // Make currentClass globally accessible for onboarding completion
    window.currentClass = currentClass;
    
    // Remove onboarding-active class if all setup is complete
    if (currentClass.courseSetup && currentClass.contentSetup && currentClass.flagSetup && currentClass.monitorSetup) {
        document.body.classList.remove('onboarding-active');
    }

    // Listen for document setup completion event
    window.addEventListener('documentSetupComplete', () => {
        // console.log('📋 Document setup completed, redirecting to next onboarding stage...');
        
        const courseId = getCourseIdFromURL();
        if (courseId) {
            // Check if flag setup is needed
            if (!currentClass.flagSetup) {
                window.location.href = `/course/${courseId}/instructor/onboarding/flag-setup`;
            } else if (!currentClass.monitorSetup) {
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
            if (!currentClass.monitorSetup) {
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
        // The class will be removed automatically when all setup steps (courseSetup, contentSetup, flagSetup, monitorSetup) are done
        
        // Update the UI - this will check currentClass.flagSetup and proceed to flag setup if needed
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
        
        // Switch to documents view (or default view)
        currentState = StateEvent.Documents;
        
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

    // --- DOM ELEMNET SELECTORS ---
    const sidebarEl = document.querySelector('.instructor-sidebar');
    const logoBox = document.querySelector('.logo-box');
    const sidebarMenuListEl =document.querySelector('.sidebar-menu-list');
    const sidebarCollapseButton = document.querySelector('.sidebar-collapse-icon');
    const sidebarContentEl = document.getElementById('sidebar-content');
    const mainContentAreaEl = document.getElementById('main-content-area');
    const instructorFeatureSidebarEl = document.querySelector('.instructor-feature-sidebar');
    const chatListEl = document.getElementById('chat-list');

    // Current State
    let currentState: StateEvent = StateEvent.Documents;

    // Check if we're on the new course onboarding route FIRST (before extracting courseId)
    const isNewCourseOnboarding = isNewCourseOnboardingURL();
    
    // Extract courseId and view from URL (after currentState is declared)
    const courseIdFromURL = getCourseIdFromURL();
    const viewFromURL = getInstructorViewFromURL();
    const chatIdFromURL = getChatIdFromURL();
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
        // console.log(`[INSTRUCTOR-MODE] 🎓 New course onboarding URL detected`); // 🟢 MEDIUM: Onboarding detection - keep for monitoring
        // Don't set currentState - onboarding will be handled in updateUI() based on URL
        // Skip the regular view logic below
    } else if (onboardingStageFromURL) {
        // Check if we're on an onboarding URL for existing course
        // console.log(`[INSTRUCTOR-MODE] 🎓 Onboarding URL detected during initialization: ${onboardingStageFromURL}`); // 🟢 MEDIUM: Debug info - onboarding stage exposure
        // Don't set currentState - onboarding will be handled in updateUI() based on URL
        // Skip the regular view logic below
    } else if (viewFromURL) {
        // Handle regular views only if not on onboarding URL
        // Handle special views that aren't StateEvent enum values
        if (viewFromURL === 'course-information' || viewFromURL === 'about') {
            // These will be handled separately in initialization, keep current state as is
            // Don't change currentState for these special views
        } else {
            currentState = mapViewToStateEvent(viewFromURL);
        }
    } else {
        // Default to documents if no view specified and not on onboarding URL
        currentState = StateEvent.Documents;
        // Redirect to documents URL if not already there
        if (courseIdFromURL) {
            navigateToInstructorView('documents');
            // Note: navigateToInstructorView uses pushState, so we continue execution
        }
    }

    // --- STATE MANAGEMENT ----
    let isSidebarCollapsed: boolean = false;
    
    const flagStateEl = document.getElementById('flag-state');
    const monitorStateEl = document.getElementById('monitor-state');
    const documentsStateEl = document.getElementById('documents-state');
    const chatStateEl = document.getElementById('chat-state');
    const assistantPromptsStateEl = document.getElementById('assistant-prompts-state');
    const systemPromptsStateEl = document.getElementById('system-prompts-state');

    chatStateEl?.addEventListener('click', async () => {
        navigateToInstructorView('chat');
    });

    flagStateEl?.addEventListener('click', () => {
        // console.log('🖱️ [INSTRUCTOR-DEBUG] Flag state clicked'); // 🟢 MEDIUM: UI interaction - keep for monitoring
        navigateToInstructorView('flags');
    });

    monitorStateEl?.addEventListener('click', () => {
        navigateToInstructorView('monitor');
    });

    documentsStateEl?.addEventListener('click', () => {
        navigateToInstructorView('documents');
    });

    assistantPromptsStateEl?.addEventListener('click', () => {
        navigateToInstructorView('assistant-prompts');
    });

    systemPromptsStateEl?.addEventListener('click', () => {
        navigateToInstructorView('system-prompts');
    });
    
    // Handle browser back/forward navigation
    window.addEventListener('popstate', async () => {
        const view = getInstructorViewFromURL();
        const chatId = getChatIdFromURL();
        
        if (view) {
            if (view === 'chat') {
                // Load chat interface
                await showChatContent();
            } else if (view === 'course-information') {
                // Load course information component
                await loadComponent('course-information');
                expandFeatureSidebar();
                hideChatList();
            } else if (view === 'about') {
                // Load about component
                await renderAbout({ state: currentState, mode: 'instructor' });
            } else {
                // Load component for current view
                currentState = mapViewToStateEvent(view);
                updateUI();
            }
        }
    });



    // Artefact functionality moved to chat.ts

    //Ensure sidebar collpase toggle
    const sidebarCollapseToggle = () => {
        if (!sidebarCollapseButton) return;
        sidebarCollapseButton.addEventListener('click', () => {
            // Disable hamburger button when in chat mode
            if (currentState === StateEvent.Chat) {
                return; // Hamburger button is non-functional in chat mode
            }
            
            // Toggle the instructor-feature-sidebar (not the entire instructor-sidebar)
            if (!instructorFeatureSidebarEl) return;
            instructorFeatureSidebarEl.classList.toggle('collapsed');
            
            if(!logoBox) return;
            logoBox.classList.toggle('collapsed');
            
            // Update the collapse state tracking
            isSidebarCollapsed = instructorFeatureSidebarEl.classList.contains('collapsed');
            
            if(!sidebarMenuListEl) return;
            sidebarMenuListEl.classList.toggle('collapsed');
            
        } );
    }
    
    sidebarCollapseToggle();

    const loadComponent = async (
        componentName :'flag-instructor' 
                        | 'monitor-instructor' 
                        | 'documents-instructor' 
                        | 'flag-history' 
                        | 'course-setup'
                        | 'document-setup'
                        | 'course-information'
                        | 'assistant-prompts-instructor'
                        | 'system-prompts-instructor'
        ) => {
        // console.log(`🚀 [INSTRUCTOR-DEBUG] Loading component: ${componentName}`); // 🟢 MEDIUM: Component name debug info

        if (!mainContentAreaEl) {
            console.error('❌ [INSTRUCTOR-DEBUG] Main content area element not found!'); // Keep - from try-catch context
            return;
        }

        try {
            // console.log(`📡 [INSTRUCTOR-DEBUG] Fetching HTML for component: ${componentName}`); // 🟢 MEDIUM: Component name debug info
            const html = await loadComponentHTML(componentName);
            // console.log(`✅ [INSTRUCTOR-DEBUG] HTML fetched successfully for: ${componentName}`); // 🟢 MEDIUM: Component name debug info

            // console.log(`🎨 [INSTRUCTOR-DEBUG] Setting innerHTML for component: ${componentName}`); // 🟢 MEDIUM: Component name debug info
            mainContentAreaEl.innerHTML = html;
            
            if (componentName === 'documents-instructor') {
                // console.log(`🔧 [INSTRUCTOR-DEBUG] Initializing documents page...`); // 🟢 MEDIUM: Component init - keep for monitoring
                initializeDocumentsPage(currentClass);
            }
            else if (componentName === 'flag-instructor') {
                // console.log(`🔧 [INSTRUCTOR-DEBUG] Initializing flags...`); // 🟢 MEDIUM: Debug info
                await initializeFlags();
            }
            else if (componentName === 'monitor-instructor') {
                // console.log(`🔧 [INSTRUCTOR-DEBUG] Initializing monitor dashboard...`);
                initializeMonitorDashboard();
            }
            else if (componentName === 'course-setup') {
                // console.log(`🔧 [INSTRUCTOR-DEBUG] Course setup component - handled by renderOnCourseSetup`);
                // Course setup component - handled by renderOnCourseSetup
            }
            else if (componentName === 'document-setup') {
                // console.log(`🔧 [INSTRUCTOR-DEBUG] Document setup component - handled by renderDocumentSetup`);
                //course setup component - handled by renderDocumentSetup
            }
            else if (componentName === 'course-information') {
                // console.log(`🔧 [INSTRUCTOR-DEBUG] Initializing course information...`);
                await initializeCourseInformation(currentClass);
            }
            else if (componentName === 'assistant-prompts-instructor') {
                // console.log(`🔧 [INSTRUCTOR-DEBUG] Initializing assistant prompts...`);
                await initializeAssistantPrompts(currentClass);
            }
            else if (componentName === 'system-prompts-instructor') {
                // console.log(`🔧 [INSTRUCTOR-DEBUG] Initializing system prompts...`);
                await initializeSystemPrompts(currentClass);
            }
            
            // console.log(`🎨 [INSTRUCTOR-DEBUG] Rendering feather icons...`);
            renderFeatherIcons();
            
            // console.log(`✅ [INSTRUCTOR-DEBUG] Component ${componentName} loaded successfully`);
        }
        catch (error) {
            console.error(`❌ [INSTRUCTOR-DEBUG] Error loading component ${componentName}:`, error);
            // console.error(`❌ [INSTRUCTOR-DEBUG] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
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

        // Fallback to flag-based detection if not on onboarding URL
        if (!currentClass.courseSetup) {
            renderOnCourseSetup(currentClass);
            return;
        }
        if (!currentClass.contentSetup) {
            renderDocumentSetup(currentClass); // change this to renderOnContentSetup later
            return;
        }
        if (!currentClass.flagSetup) {
            renderFlagSetup(currentClass);
            return;
        }
        if (!currentClass.monitorSetup) {
            renderMonitorSetup(currentClass);
            return;
        }

        if ( currentState === StateEvent.Flag){
            // console.log('🎯 [INSTRUCTOR-DEBUG] updateUI() handling flag state');
            // console.log('🎯 [INSTRUCTOR-DEBUG] Calling loadComponent("flag-instructor")');
            loadComponent('flag-instructor');
            updateSidebarState();
            expandFeatureSidebar();
            hideChatList(); // Ensure chat list is hidden
        }
        else if ( currentState === StateEvent.Monitor){
            loadComponent('monitor-instructor');
            updateSidebarState();
            expandFeatureSidebar();
            hideChatList(); // Ensure chat list is hidden
        }
        else if ( currentState === StateEvent.Documents){
            loadComponent('documents-instructor');
            updateSidebarState();
            expandFeatureSidebar();
            hideChatList(); // Ensure chat list is hidden
        }
        else if ( currentState === StateEvent.Chat){
            updateSidebarState(); // Update menu active state
            collapseFeatureSidebar();
            // showChatContent is now handled by the click event listener
        }
        else if ( currentState === StateEvent.AssistantPrompts){
            loadComponent('assistant-prompts-instructor');
            updateSidebarState();
            expandFeatureSidebar();
            hideChatList(); // Ensure chat list is hidden
        }
        else if ( currentState === StateEvent.SystemPrompts){
            loadComponent('system-prompts-instructor');
            updateSidebarState();
            expandFeatureSidebar();
            hideChatList(); // Ensure chat list is hidden
        }
    }

    // make fucntio that makes a get request given a coursename
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
        documentsStateEl?.classList.remove('active');
        chatStateEl?.classList.remove('active');
        flagStateEl?.classList.remove('active');
        monitorStateEl?.classList.remove('active');
        assistantPromptsStateEl?.classList.remove('active');
        systemPromptsStateEl?.classList.remove('active');

        // Add active class to the current state's menu item
        switch(currentState) {
            case StateEvent.Documents:
                documentsStateEl?.classList.add('active');
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
        }
    }

    // Helper functions for chat behavior
    const hideChatList = () => {
        if (chatListEl) {
            chatListEl.classList.remove('active');
            //START DEBUG LOG : DEBUG-CODE(013)
            // console.log('🚫 Chat list hidden (not in chat mode)');
            //END DEBUG LOG : DEBUG-CODE(013)
        }
    }

    const collapseFeatureSidebar = () => {
        if (!instructorFeatureSidebarEl) return;
        instructorFeatureSidebarEl.classList.add('collapsed');
        
        if(!logoBox) return;
        logoBox.classList.add('collapsed');
        
        if(!sidebarMenuListEl) return;
        sidebarMenuListEl.classList.add('collapsed');
        
        // Update the collapse state tracking
        isSidebarCollapsed = true;
    }

    const expandFeatureSidebar = () => {
        if (!instructorFeatureSidebarEl) return;
        instructorFeatureSidebarEl.classList.remove('collapsed');
        
        if(!logoBox) return;
        logoBox.classList.remove('collapsed');
        
        if(!sidebarMenuListEl) return;
        sidebarMenuListEl.classList.remove('collapsed');
        
        // Hide chat list when expanding feature sidebar
        hideChatList();
        
        // Update the collapse state tracking
        isSidebarCollapsed = false;
    }


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
                        // Chat restored, now switch to it
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
     */
    const showWelcomeScreen = async (): Promise<void> => {
        if (!mainContentAreaEl) return;
        
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

    const showChatContent = async () => {
        // Update current state
        currentState = StateEvent.Chat;
        
        // Update menu active state
        updateSidebarState();
        
        // Ensure feature sidebar is collapsed when in chat mode
        collapseFeatureSidebar();
        
        
        // Show chat list (slides in from left to right)
        if (chatListEl) {
            chatListEl.classList.add('active');
        }
        
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

    //set custom windows listener on onboarding
    window.addEventListener('onboardingComplete', () => {
        
        // Check if we're coming from new-course onboarding (course was just created)
        const isNewCourse = isNewCourseOnboardingURL();
        
        // Get courseId from currentClass (it should be set after course creation)
        const courseId = currentClass?.id;
        
        if (isNewCourse && courseId) {
            
            // Store course in session for future use
            // The course-entry endpoint will handle this, but we can also do it here
            fetch('/api/course/enter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId })
            }).then(() => {
                // Redirect to next onboarding stage
                window.location.href = `/course/${courseId}/instructor/onboarding/document-setup`;
            }).catch((error) => {
                console.error('[INSTRUCTOR-MODE] Error entering course:', error);
                // Still redirect even if enter fails
                window.location.href = `/course/${courseId}/instructor/onboarding/document-setup`;
            });
        } else if (courseId) {
            // Existing course - redirect to next onboarding stage or main interface
            if (!currentClass.contentSetup) {
                window.location.href = `/course/${courseId}/instructor/onboarding/document-setup`;
            } else if (!currentClass.flagSetup) {
                window.location.href = `/course/${courseId}/instructor/onboarding/flag-setup`;
            } else if (!currentClass.monitorSetup) {
                window.location.href = `/course/${courseId}/instructor/onboarding/monitor-setup`;
            } else {
                window.location.href = `/course/${courseId}/instructor/documents`;
            }
        } else {
            // Fallback: update UI (shouldn't happen, but just in case)
            console.warn('[INSTRUCTOR-MODE] ⚠️ Course setup completed but courseId not available');
            updateUI();
        }
    })

    // --- LOGOUT FUNCTIONALITY ---
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

        // Course Information button listener
        const courseInfoBtn = document.getElementById('instructor-course-info-btn');
        if (courseInfoBtn) {
            courseInfoBtn.addEventListener('click', async () => {
                navigateToInstructorView('course-information');
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

    // --- STATE RESTORATION ---
    const restorePreviousState = () => {
        // console.log('[INSTRUCTOR-MODE] 🔄 Restoring previous state:', currentState);
        // Navigate back to documents view when closing about/course-info
        const courseId = getCourseIdFromURL();
        if (courseId) {
            navigateToInstructorView('documents');
        } else {
            updateUI();
        }
    };

    // Listen for about page close event
    window.addEventListener('about-page-closed', restorePreviousState);
    
    // Listen for course info page close event
    window.addEventListener('course-info-closed', restorePreviousState);

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
    } else if (viewFromURL === 'chat' && chatIdFromURL) {
        // Load specific chat
        await loadChatById(chatIdFromURL).catch(err => {
            // console.error('[INSTRUCTOR-MODE] Error loading chat from URL:', err);
            updateUI();
        });
    } else if (viewFromURL === 'course-information') {
        // Load course information component
        await loadComponent('course-information');
        expandFeatureSidebar();
        hideChatList();
    } else if (viewFromURL === 'about') {
        // Load about component
        await renderAbout({ state: currentState, mode: 'instructor' });
    } else {
        // Load component for current view
        updateUI();
    }

});

/**
 * Initialize inactivity tracking for instructor mode
 */
function initializeInactivityTracking(): void {
    // console.log('[INSTRUCTOR-MODE] 🔍 Initializing inactivity tracking...'); // 🟢 MEDIUM: Initialization logging
    
    // Set up event listeners for inactivity tracker
    inactivityTracker.on('warning', async (data: any) => {
        // console.log('[INSTRUCTOR-MODE] ⚠️ Inactivity warning triggered'); // 🟢 MEDIUM: Warning notification
        
        // Pause tracker while modal is shown
        inactivityTracker.pause();
        
        // Show warning modal with countdown
        const remainingSeconds = Math.floor((data.remainingTimeUntilLogout || 60000) / 1000);
        const result = await showInactivityWarningModal(remainingSeconds, () => {
            // User clicked "Stay Active" - reset tracker
            // console.log('[INSTRUCTOR-MODE] ✅ User chose to stay active'); // 🟢 MEDIUM: User action logging
            inactivityTracker.reset();
        });
        
        // Resume tracker after modal closes
        inactivityTracker.resume();
        
        // If timeout occurred, logout will be triggered by logout event
        if (result.action === 'timeout') {
            // console.log('[INSTRUCTOR-MODE] ⏱️ Inactivity warning timeout - logout will be triggered'); // 🟢 MEDIUM: Timeout logging

            // MANUALLY TRIGGER LOGOUT HERE since logout timer was cleared
            inactivityTracker.stop();
            authService.logout();
            return; // Stop execution here - logout will be triggered by logout event
        }
    });
    
    inactivityTracker.on('logout', async (data: any) => {
        // console.log('[INSTRUCTOR-MODE] 🚪 Inactivity logout triggered'); // 🟢 MEDIUM: Logout trigger logging
        
        // Stop tracking
        inactivityTracker.stop();
        
        // Show logout message and redirect
        try {
            await showConfirmModal(
                'Session Expired',
                'You have been inactive for too long. You will be logged out now.',
                'OK',
                ''
            );
        } catch (error) {
            // Modal might fail if already logged out, continue anyway
            console.warn('[INSTRUCTOR-MODE] ⚠️ Could not show logout modal:', error);
        }
        
        // Logout user
        authService.logout();
    });
    
    // inactivityTracker.on('activity-reset', (data: any) => {
    //     // console.log('[INSTRUCTOR-MODE] 🔄 Activity detected - inactivity timer reset'); // 🟢 MEDIUM: Activity reset logging
    // });

    // Start tracking
    inactivityTracker.start();
    
}