// public/scripts/student-mode.ts

import { loadComponentHTML, renderFeatherIcons } from './functions/api.js';
import { ChatManager } from './feature/chat.js';
import { authService } from './services/AuthService.js';
import { renderStudentOnboarding } from './onboarding/student-onboarding.js';
import { initializeStudentFlagHistory } from './feature/student-flag-history.js';
import { showConfirmModal, showInactivityWarningModal } from './modal-overlay.js';
import { renderAbout } from './about/about.js';
import { inactivityTracker } from './services/InactivityTracker.js';
import { 
    getCourseIdFromURL, 
    getStudentViewFromURL, 
    getChatIdFromURL,
    navigateToStudentView,
    navigateToStudentChat,
    isStudentOnboardingURL
} from './utils/url-parser.js';

// Authentication check function
async function checkAuthentication(): Promise<boolean> {
    // Get courseId from URL if available, otherwise use default redirect
    const courseId = getCourseIdFromURL();
    const redirectPath = courseId ? `/course/${courseId}/student` : '/pages/student-mode.html';
    return await authService.checkAuthenticationAndRedirect(redirectPath, 'STUDENT-MODE');
}

// State tracking for navigation
let currentComponent: 'welcome-screen' | 'chat-window' | 'profile' | 'flag-history' = 'welcome-screen';
let previousComponent: 'welcome-screen' | 'chat-window' | 'profile' | 'flag-history' = 'welcome-screen';

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication first
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) {
        return; // Stop execution if not authenticated
    }
    
    console.log('[STUDENT-MODE] 🚀 Loading student mode...');
    
    // Initialize inactivity tracker
    initializeInactivityTracking();
    
    // Extract courseId and view from URL
    const courseIdFromURL = getCourseIdFromURL();
    const viewFromURL = getStudentViewFromURL();
    const chatIdFromURL = getChatIdFromURL();
    
    // Store URL state for later use (after courseUser validation)
    // Note: We'll validate courseId matches session after courseUser is fetched
    
    try {
        // Fetch current CourseUser from session
        const response = await fetch('/api/user/current');
        const { courseUser } = await response.json();
        
        if (!courseUser) {
            console.error('[STUDENT-MODE] ❌ No course user found');
            window.location.href = '/course-selection';
            return;
        }
        
        console.log('[STUDENT-MODE] 👤 CourseUser found:', courseUser.name);
        
        // Validate courseId from URL matches session courseUser
        if (courseIdFromURL && courseUser.courseId !== courseIdFromURL) {
            console.error('[STUDENT-MODE] ❌ URL courseId mismatch:', {
                urlCourseId: courseIdFromURL,
                sessionCourseId: courseUser.courseId
            });
            // Redirect to correct course URL
            window.location.href = `/course/${courseUser.courseId}/student`;
            return;
        }
        
        // Check if we're on an onboarding URL
        if (isStudentOnboardingURL()) {
            console.log('[STUDENT-MODE] 🎓 Onboarding URL detected');
            
            // Preserve URL state for after onboarding (using closure variable)
            const intendedView = 'chat'; // Default to chat after onboarding
            const intendedChatId = null;
            
            // Trigger onboarding
            await renderStudentOnboarding(courseUser);
            
            // Listen for onboarding completion event
            window.addEventListener('onboarding-completed', async (event: any) => {
                console.log('[STUDENT-MODE] ✅ Onboarding completed, redirecting to main interface...');
                const completedUser = event.detail.user || courseUser;
                completedUser.userOnboarding = true;
                
                // Redirect to main student interface
                const courseId = getCourseIdFromURL();
                if (courseId) {
                    window.location.href = `/course/${courseId}/student`;
                } else {
                    // Fallback: initialize chat interface
                    await initializeChatInterface(completedUser, { view: intendedView, chatId: intendedChatId });
                }
            });
            
            return; // Stop execution here - onboarding will handle completion
        } else if (!courseUser.userOnboarding) {
            // User needs onboarding but not on onboarding URL - redirect to onboarding
            console.log('[STUDENT-MODE] 🎓 User needs onboarding, redirecting...');
            const courseId = getCourseIdFromURL();
            if (courseId) {
                window.location.href = `/course/${courseId}/student/onboarding/student`;
            }
            return;
        } else {
            console.log('[STUDENT-MODE] ✅ User already onboarded');
            // Pass URL state to initializeChatInterface
            initializeChatInterface(courseUser, { view: viewFromURL, chatId: chatIdFromURL });
        }
        
    } catch (error) {
        console.error('[STUDENT-MODE] ❌ Error initializing student mode:', error);
        window.location.href = '/course-selection';
    }
});

/**
 * Initialize inactivity tracking for student mode
 */
function initializeInactivityTracking(): void {
    console.log('[STUDENT-MODE] 🔍 Initializing inactivity tracking...');
    
    // Set up event listeners for inactivity tracker
    inactivityTracker.on('warning', async (data: any) => {
        console.log('[STUDENT-MODE] ⚠️ Inactivity warning triggered');
        
        // Pause tracker while modal is shown
        inactivityTracker.pause();
        
        // Show warning modal with countdown
        const remainingSeconds = Math.floor((data.remainingTimeUntilLogout || 60000) / 1000);
        const result = await showInactivityWarningModal(remainingSeconds, () => {
            // User clicked "Stay Active" - reset tracker
            console.log('[STUDENT-MODE] ✅ User chose to stay active');
            inactivityTracker.reset();
        });
        
        // Resume tracker after modal closes
        inactivityTracker.resume();
        
        // If timeout occurred, logout will be triggered by logout event
        if (result.action === 'timeout') {
            console.log('[STUDENT-MODE] ⏱️ Inactivity warning timeout - logout will be triggered');

            // MANUALLY TRIGGER LOGOUT HERE since logout timer was cleared
            inactivityTracker.stop();
            authService.logout();
            return; // Stop execution here - logout will be triggered by logout event
        }
    });
    
    inactivityTracker.on('logout', async (data: any) => {
        console.log('[STUDENT-MODE] 🚪 Inactivity logout triggered');
        
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
            console.warn('[STUDENT-MODE] ⚠️ Could not show logout modal:', error);
        }
        
        // Logout user
        authService.logout();
    });
    
    inactivityTracker.on('activity-reset', (data: any) => {
        console.log('[STUDENT-MODE] 🔄 Activity detected - inactivity timer reset');
    });
    
    // Start tracking
    inactivityTracker.start();
    
    console.log('[STUDENT-MODE] ✅ Inactivity tracking initialized');
}

/**
 * Initialize the chat interface for the student
 */
async function initializeChatInterface(user: any, urlState?: { view: string | null, chatId: string | null }): Promise<void> {
    console.log('[STUDENT-MODE] 🚀 Initializing chat interface for user:', user.name);
    
    const chatManager = ChatManager.getInstance({
        isInstructor: false,
        userContext: user,
        onModeSpecificCallback: (action: string, data?: any) => {
            // Handle student-specific behaviors
            if (action === 'ui-update-needed') {
                updateUI();
            } else if (action === 'new-chat-created') {
                // New chat created from welcome screen or sidebar
                const newChatId = data?.chatId;
                if (newChatId) {
                    const courseId = getCourseIdFromURL();
                    if (courseId) {
                        // Only navigate if not already navigating (prevent recursion)
                        if (!isNavigating) {
                            navigateToStudentChat(courseId, newChatId);
                        }
                    }
                }
                // Note: loadChatWindow() is called by updateUI() or ChatManager
            } else if (action === 'chat-clicked') {
                // Chat clicked from sidebar
                const clickedChatId = data?.chatId;
                if (clickedChatId) {
                    const courseId = getCourseIdFromURL();
                    if (courseId) {
                        // Only navigate if not already navigating (prevent recursion)
                        if (!isNavigating) {
                            navigateToStudentChat(courseId, clickedChatId);
                        }
                    }
                }
                if (data?.loaded) {
                    // Chat is fully loaded, safe to switch to chat window
                    console.log('[STUDENT-MODE] 💬 Chat loaded and ready, switching to chat window');
                    // Only load component if not already navigating
                    if (!isNavigating) {
                        loadComponent('chat-window');
                    }
                }
            } else if (action === 'chat-load-failed') {
                console.error('[STUDENT-MODE] ❌ Chat loading failed:', data?.error);
                // Stay on current view or show error message
                if (!isNavigating) {
                    loadComponent('welcome-screen');
                }
            }
            console.log('Student mode callback:', action, data);
        }
    });
    
    // --- DOM ELEMENT SELECTORS ---
    const mainContentArea = document.getElementById('main-content-area');
    const sidebarEl = document.querySelector('.sidebar') as HTMLElement | null;
    const sidebarHeaderEl = document.querySelector('.sidebar-header') as HTMLElement | null;
    const artefactCloseBtn = document.getElementById('close-artefact-btn');

    // Artefact functionality moved to chat.ts

    // --- COMPONENT LOADING ---
    const loadComponent = async (componentName: 'welcome-screen' | 'chat-window' | 'profile' | 'flag-history') => {
        if (!mainContentArea) return;
        
        // Track previous and current component for navigation
        previousComponent = currentComponent;
        currentComponent = componentName;
        
        try {
            // Special handling for flag-history component (it's in student/ subdirectory)
            let html: string;
            if (componentName === 'flag-history') {
                const response = await fetch('/components/student/flag-history.html');
                if (!response.ok) throw new Error(`Failed to load flag-history component: ${response.statusText}`);
                html = await response.text();
            } else {
                html = await loadComponentHTML(componentName);
            }
            
            mainContentArea.innerHTML = html;
            renderFeatherIcons();
            
            // After loading, attach necessary event listeners
            if (componentName === 'chat-window') {
                // Defensive check: if no chats exist, show welcome screen instead
                if (chatManager.getChats().length === 0) {
                    console.log('[STUDENT-MODE] 🚫 No chats available, showing welcome screen instead');
                    loadComponent('welcome-screen');
                    return;
                }
                
                // Rebind message events after chat window is loaded
                chatManager.bindMessageEvents();
                // Reset DOM tracking and render active chat
                chatManager.resetDOMTracking();
                chatManager.renderActiveChat();
            } else if (componentName === 'welcome-screen') {
                attachWelcomeScreenListeners();
            } else if (componentName === 'profile') {
                attachProfileListeners();
            } else if (componentName === 'flag-history') {
                attachFlagHistoryListeners();
            }
        } catch (error) {
            console.error(`Error loading component ${componentName}:`, error);
            mainContentArea.innerHTML = `<p style="color: red; text-align: center;">Error loading content.</p>`;
        }
    };

    // All chat rendering functions are now handled by ChatManager
    
    const updateUI = async () => {
        console.log('[STUDENT-MODE] 🔄 Updating UI...');
        
        // Wait for chat manager to be fully initialized
        if (!chatManager.getInitializationStatus()) {
            console.log('[STUDENT-MODE] ⏳ ChatManager not yet initialized, waiting...');
            return;
        }
        
        const chats = chatManager.getChats();
        
        console.log(`[STUDENT-MODE] 📊 Chat count: ${chats.length}`);
        
        // Show welcome screen if no chats exist (like instructor mode)
        if (chats.length === 0) {
            console.log('[STUDENT-MODE] 📺 Showing welcome screen (no chats exist)');
            loadComponent('welcome-screen');
        } else {
            console.log('[STUDENT-MODE] 💬 Loading chat window with active chat');
            loadComponent('chat-window');
        }
    };

    // Initialize the chat manager and wait for it to complete
    console.log('[STUDENT-MODE] 🚀 Initializing ChatManager with real user data...');
    console.log('[STUDENT-MODE] 📊 User context:', {
        userId: user.userId,
        courseName: user.courseName,
        affiliation: user.affiliation
    });
    
    /**
     * Handle URL-based component loading
     * Called after ChatManager is initialized
     */
    const handleURLState = async (view: string | null, chatId: string | null): Promise<void> => {
        if (view === 'chat' && chatId) {
            // Load specific chat
            await loadChatById(chatId).catch(err => {
                console.error('[STUDENT-MODE] Error loading chat from URL:', err);
                // Fall back to default chat interface (updateUI already handled this)
            });
        } else if (view === 'profile') {
            await loadComponent('profile');
        } else if (view === 'flag-history') {
            await loadComponent('flag-history');
        } else if (view === 'about') {
            await renderAbout({ component: currentComponent, mode: 'student' });
        }
        // If view is null or 'chat' without chatId, updateUI() already handled default state
    };

    /**
     * Load chat by ID and update URL
     * Includes comprehensive error handling for invalid chatIds, network failures, etc.
     */
    const loadChatById = async (chatId: string): Promise<void> => {
        // Validate chatId format (basic validation)
        if (!chatId || typeof chatId !== 'string' || chatId.trim().length === 0) {
            console.error('[STUDENT-MODE] ❌ Invalid chatId provided:', chatId);
            await loadComponent('welcome-screen');
            return;
        }
        
        const courseId = getCourseIdFromURL();
        if (!courseId) {
            console.error('[STUDENT-MODE] ❌ Cannot load chat: courseId not found in URL');
            await loadComponent('welcome-screen');
            return;
        }
        
        // Update URL with chatId query parameter
        navigateToStudentChat(courseId, chatId);
        
        // Ensure ChatManager is initialized
        if (!chatManager) {
            console.warn('[STUDENT-MODE] ⚠️ ChatManager not initialized');
            await loadComponent('welcome-screen');
            return;
        }
        
        // Load chat window component first
        await loadComponent('chat-window');
        
        // Load the specific chat
        try {
            // Check if chat exists in ChatManager
            const chats = chatManager.getChats();
            const chatExists = chats.some(chat => chat.id === chatId);
            
            if (chatExists) {
                // Chat is already loaded, just switch to it
                await chatManager.setActiveChatId(chatId);
                chatManager.renderActiveChat();
                console.log('[STUDENT-MODE] ✅ Switched to existing chat:', chatId);
            } else {
                // Chat not in memory, try to restore it from server
                console.log('[STUDENT-MODE] 🔄 Chat not in memory, restoring from server...');
                
                const restoreResponse = await fetch(`/api/chat/restore/${chatId}`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!restoreResponse.ok) {
                    // Handle different error cases
                    if (restoreResponse.status === 404) {
                        console.error('[STUDENT-MODE] ❌ Chat not found (404):', chatId);
                        // Show user-friendly error message
                        const mainContentArea = document.getElementById('main-content-area');
                        if (mainContentArea) {
                            mainContentArea.innerHTML = `
                                <div style="text-align: center; padding: 2rem; color: #dc3545;">
                                    <h3>⚠️ Chat Not Found</h3>
                                    <p>The chat you're looking for doesn't exist or you don't have access to it.</p>
                                    <button onclick="window.location.href='/course/${courseId}/student'" style="
                                        background: #007bff;
                                        color: white;
                                        border: none;
                                        padding: 0.75rem 1.5rem;
                                        border-radius: 0.375rem;
                                        cursor: pointer;
                                        margin-top: 1rem;
                                    ">Return to Chat</button>
                                </div>
                            `;
                        }
                        return;
                    } else if (restoreResponse.status === 403) {
                        console.error('[STUDENT-MODE] ❌ Access denied (403):', chatId);
                        await loadComponent('welcome-screen');
                        return;
                    } else {
                        console.error('[STUDENT-MODE] ❌ Failed to restore chat:', restoreResponse.status, restoreResponse.statusText);
                        await loadComponent('welcome-screen');
                        return;
                    }
                }
                
                const restoreData = await restoreResponse.json();
                if (restoreData.success) {
                    // Chat restored, now switch to it
                    await chatManager.setActiveChatId(chatId);
                    chatManager.renderActiveChat();
                    console.log('[STUDENT-MODE] ✅ Chat restored and loaded:', chatId);
                } else {
                    console.error('[STUDENT-MODE] ❌ Failed to restore chat:', restoreData.error);
                    await loadComponent('welcome-screen');
                }
            }
        } catch (error) {
            // Handle network errors, timeouts, etc.
            console.error('[STUDENT-MODE] ❌ Error loading chat by ID:', error);
            
            // Check if it's a network error
            if (error instanceof TypeError && error.message.includes('fetch')) {
                console.error('[STUDENT-MODE] ❌ Network error - check connection');
                const mainContentArea = document.getElementById('main-content-area');
                if (mainContentArea) {
                    mainContentArea.innerHTML = `
                        <div style="text-align: center; padding: 2rem; color: #dc3545;">
                            <h3>⚠️ Connection Error</h3>
                            <p>Unable to load chat. Please check your connection and try again.</p>
                            <button onclick="window.location.reload()" style="
                                background: #007bff;
                                color: white;
                                border: none;
                                padding: 0.75rem 1.5rem;
                                border-radius: 0.375rem;
                                cursor: pointer;
                                margin-top: 1rem;
                            ">Retry</button>
                        </div>
                    `;
                }
            } else {
                // Other errors - fall back to welcome screen
                await loadComponent('welcome-screen');
            }
        }
    };

    try {
        await chatManager.initialize();
        console.log('[STUDENT-MODE] ✅ ChatManager initialized successfully');
        await updateUI();
        
        // After ChatManager initialization and updateUI(), check URL state
        if (urlState) {
            await handleURLState(urlState.view, urlState.chatId);
        }
    } catch (error) {
        console.error('[STUDENT-MODE] ❌ Failed to initialize ChatManager:', error);
        // Show error message to user
        if (mainContentArea) {
            mainContentArea.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #dc3545;">
                    <h3>⚠️ Chat Initialization Failed</h3>
                    <p>Unable to load chat interface. Please refresh the page or contact support.</p>
                    <button onclick="window.location.reload()" style="
                        background: #007bff;
                        color: white;
                        border: none;
                        padding: 0.75rem 1.5rem;
                        border-radius: 0.375rem;
                        cursor: pointer;
                        margin-top: 1rem;
                    ">Refresh Page</button>
                </div>
            `;
        }
        return;
    }

    // Scroll to bottom is now handled by ChatManager

    // Artefact functionality moved to chat.ts

    // Chat list rendering is now handled by ChatManager

    // All chat operations are now handled by ChatManager

    // Chat list item creation is now handled by ChatManager

    // Active chat rendering is now handled by ChatManager

    // Chat header structure and pinned message handling is now handled by ChatManager

    // Pinned banner rendering is now handled by ChatManager

    // --- LOGOUT FUNCTIONALITY ---
    const handleLogout = async (): Promise<void> => {
        try {
            // Show confirmation modal
            const result = await showConfirmModal(
                'Confirm Logout',
                'Are you sure you want to log out? You will be redirected to the login page.',
                'Log Out',
                'Cancel'
            );
            if (result.action !== 'log-out') {
                console.log('[STUDENT-MODE] 🚫 Logout cancelled by user');
                return;
            }
            
            console.log('[STUDENT-MODE] 🚪 Initiating logout...');
            
            // Check current authentication status before logout
            const authCheck = await fetch('/auth/me', {
                method: 'GET',
                credentials: 'same-origin'
            });
            const authData = await authCheck.json();
            console.log('[STUDENT-MODE] 📋 Current auth status before logout:', authData);
            
            // Call logout endpoint - let the browser follow the redirect naturally
            console.log('[STUDENT-MODE] 🔄 Redirecting to logout endpoint...');
            window.location.href = '/auth/logout';
            
        } catch (error) {
            console.error('[STUDENT-MODE] 🚨 Logout error:', error);
            // Fallback: redirect to login page
            window.location.href = '/';
        }
    };

    const attachLogoutListener = () => {
        const logoutBtn = document.getElementById('logout-btn');
        if (!logoutBtn) {
            console.warn('[STUDENT-MODE] ⚠️ Logout button not found');
            return;
        }
        
        logoutBtn.addEventListener('click', handleLogout);
        console.log('[STUDENT-MODE] ✅ Logout button listener attached');

        // About button listener
        const aboutBtn = document.getElementById('about-btn');
        if (aboutBtn) {
            aboutBtn.addEventListener('click', () => {
                console.log('[STUDENT-MODE] ℹ️ About button clicked');
                navigateToStudentView('about');
            });
            console.log('[STUDENT-MODE] ✅ About button listener attached');
        }
    };

    // --- STATE RESTORATION ---
    const restorePreviousComponent = async () => {
        console.log('[STUDENT-MODE] 🔄 Restoring previous component:', currentComponent);
        await loadComponent(currentComponent);
    };

    // Listen for about page close event
    window.addEventListener('about-page-closed', () => {
        const courseId = getCourseIdFromURL();
        if (courseId) {
            navigateToStudentView('chat');
        } else {
            // Fallback for non-URL-based navigation
            restorePreviousComponent();
        }
    });

    // Update flag-history-closed handler
    window.addEventListener('flag-history-closed', () => {
        const courseId = getCourseIdFromURL();
        if (courseId) {
            navigateToStudentView('chat');
        } else {
            // Fallback for non-URL-based navigation
            restorePreviousComponent();
        }
    });

    // Guard flag to prevent recursive navigation
    let isNavigating = false;

    // Handle browser back/forward navigation
    window.addEventListener('popstate', (event: PopStateEvent) => {
        // Prevent recursive navigation calls
        if (isNavigating) {
            console.log('[STUDENT-MODE] ⚠️ Navigation already in progress, skipping...');
            return;
        }
        
        (async () => {
        isNavigating = true;
        try {
        // Validate courseId matches session before navigation
        const courseIdFromURL = getCourseIdFromURL();
        if (!courseIdFromURL) {
            console.error('[STUDENT-MODE] ❌ Cannot navigate: courseId not found in URL');
            return;
        }
        
        // Verify courseId matches current session
        try {
            const response = await fetch('/api/user/current');
            const { courseUser } = await response.json();
            if (courseUser && courseUser.courseId !== courseIdFromURL) {
                console.error('[STUDENT-MODE] ❌ CourseId mismatch in popstate:', {
                    urlCourseId: courseIdFromURL,
                    sessionCourseId: courseUser.courseId
                });
                // Redirect to correct course
                window.location.href = `/course/${courseUser.courseId}/student`;
                return;
            }
        } catch (error) {
            console.error('[STUDENT-MODE] ❌ Error validating courseId:', error);
            return;
        }
        
        const view = getStudentViewFromURL();
        const chatId = getChatIdFromURL();
        
        if (view === 'chat' && chatId) {
            // Load specific chat
            try {
                await loadChatById(chatId);
            } catch (err) {
                console.error('[STUDENT-MODE] Error loading chat from URL:', err);
                // Fall back to default chat interface
                await loadComponent('chat-window');
            }
        } else if (view === 'chat' || !view) {
            // Default chat view
            await loadComponent('chat-window');
        } else if (view === 'profile') {
            await loadComponent('profile');
        } else if (view === 'flag-history') {
            await loadComponent('flag-history');
        } else if (view === 'about') {
            await renderAbout({ component: currentComponent, mode: 'student' });
        }
        } finally {
            isNavigating = false;
        }
        })();
    });

    // --- EVENT LISTENERS ATTACHMENT ---
    const attachWelcomeScreenListeners = () => {
        const welcomeBtn = document.getElementById('welcome-add-chat-btn');
        if (!welcomeBtn) return;
        welcomeBtn.addEventListener('click', async () => {
            console.log('[STUDENT-MODE] 🆕 Creating new chat from welcome screen...');
            const result = await chatManager.createNewChat();
            if (result.success) {
                console.log('[STUDENT-MODE] ✅ New chat created successfully, loading chat window');
                
                // Update chat list in sidebar
                chatManager.renderChatList();
                
                // Load chat window in main content area after creating new chat
                loadComponent('chat-window');
                
                // Re-bind message events after creating new chat
                chatManager.rebindMessageEvents();
            } else {
                console.error('[STUDENT-MODE] ❌ Error creating new chat:', result.error);
            }
        });
    };

    const attachChatWindowListeners = () => {
        // Chat window listeners are now handled by ChatManager
        // This function is kept for compatibility but ChatManager handles all chat events
    };

    const attachProfileListeners = () => {
        // Populate user profile information
        populateUserProfile();
        
        // Back to chat button
        const backBtn = document.getElementById('back-to-chat-btn');
        backBtn?.addEventListener('click', () => navigateToStudentView('chat'));
    };

    // Artefact functionality moved to chat.ts

    // --- EVENT HANDLERS ---
    // Chat creation is now handled by ChatManager

    // Message sending is now handled by ChatManager

    // All chat operations are now handled by ChatManager

    // Disclaimer modal is now handled by ChatManager

    // Chat list and add chat button events are now handled by ChatManager

    // Sidebar collapse toggle button
    const ensureSidebarCollapseButton = () => {
        if (!sidebarHeaderEl) return;
        if (sidebarHeaderEl.querySelector('.collapse-sidebar-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'icon-btn collapse-sidebar-btn';
        btn.title = 'Collapse sidebar';
        const icon = document.createElement('i');
        icon.setAttribute('data-feather', 'menu');
        btn.appendChild(icon);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!sidebarEl) return;
            sidebarEl.classList.toggle('collapsed');
        });

        sidebarHeaderEl.appendChild(btn);
        renderFeatherIcons();
    };
    ensureSidebarCollapseButton();

    // Message element creation is now handled by ChatManager

    // Artefact functionality disabled for now

    // Flagging support is now handled by ChatManager

    // Message context menu is now handled by ChatManager

    // --- PROFILE FUNCTIONALITY ---
    const populateUserProfile = () => {
        const authState = authService.getAuthState();
        const profileName = document.getElementById('profile-name');
        const profileAffiliation = document.getElementById('profile-affiliation');
        const profileCourse = document.getElementById('profile-course');

        if (profileName && authState.user) {
            profileName.textContent = authState.user.name;
        }
        
        if (profileAffiliation && authState.user) {
            profileAffiliation.textContent = authState.user.affiliation || 'UBC Engineering Student';
        }
        
        if (profileCourse && user) {
            profileCourse.textContent = user.courseName;
        }
    };

    const attachFlagHistoryListeners = () => {
        console.log('[STUDENT-MODE] 🏴 Initializing flag history...');
        
        // Initialize flag history with user context
        const courseId = user.courseId;
        const userId = user.userId;
        
        if (!courseId || !userId) {
            console.error('[STUDENT-MODE] ❌ Missing courseId or userId for flag history');
            return;
        }
        
        // Initialize the flag history interface
        initializeStudentFlagHistory(courseId, userId);
        
        // Back button listener - return to chat view
        const backBtn = document.getElementById('flag-history-back-btn');
        backBtn?.addEventListener('click', () => {
            console.log('[STUDENT-MODE] 🔙 Back button clicked, returning to chat');
            navigateToStudentView('chat');
        });
        
        // Also support ESC key
        const escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                console.log('[STUDENT-MODE] 🔙 ESC key pressed in flag history, returning to chat');
                navigateToStudentView('chat');
                
                // Remove listener after handling
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    };

    const attachProfileButtonListener = () => {
        const profileBtn = document.getElementById('profile-btn');
        if (!profileBtn) {
            console.warn('[STUDENT-MODE] ⚠️ Profile button not found');
            return;
        }

        profileBtn.addEventListener('click', () => {
            console.log('[STUDENT-MODE] 👤 Loading flag history component...');
            navigateToStudentView('flag-history');
        });
        console.log('[STUDENT-MODE] ✅ Flag history button listener attached');
    };

    const attachCourseSelectionListener = () => {
        const courseSelectionBtn = document.getElementById('course-selection-btn');
        if (!courseSelectionBtn) {
            console.warn('[STUDENT-MODE] ⚠️ Course Selection button not found');
            return;
        }

        courseSelectionBtn.addEventListener('click', async () => {
            console.log('[STUDENT-MODE] 🔄 Course Selection button clicked - clearing state and redirecting');

            // Clear all frontend state
            try {
                // Clear local storage
                localStorage.clear();

                // Clear any global state objects (adjust based on your app's state management)
                if ((window as any).appState) {
                    (window as any).appState = {};
                }

                console.log('[STUDENT-MODE] 🧹 Cleared frontend state (localStorage and global state)');

                // Navigate to course selection (server will handle session cleanup)
                window.location.href = '/course-selection';
            } catch (error) {
                console.error('[STUDENT-MODE] 🚨 Error clearing state:', error);
                // Still navigate even if clearing fails
                window.location.href = '/course-selection';
            }
        });
        console.log('[STUDENT-MODE] ✅ Course Selection button listener attached');
    };

    // --- INITIALIZATION ---
    attachLogoutListener(); // Attach logout button listener
    attachProfileButtonListener(); // Attach profile button listener
    attachCourseSelectionListener(); // Attach course selection button listener
    
    // Update companion text with current course
    updateCompanionText(user);
    
    updateUI();
}

/**
 * Update companion text with current course name
 */
function updateCompanionText(user: any): void {
    console.log('[STUDENT-MODE] 🔍 Updating companion text with user:', user);
    const companionText = document.getElementById('companion-text');
    console.log('[STUDENT-MODE] 🔍 Companion text element found:', !!companionText);
    console.log('[STUDENT-MODE] 🔍 User courseName:', user?.courseName);
    
    if (companionText && user.courseName) {
        companionText.textContent = `${user.courseName} companion`;
        console.log('[STUDENT-MODE] ✅ Companion text updated to:', companionText.textContent);
    } else {
        console.warn('[STUDENT-MODE] ⚠️ Could not update companion text:', {
            elementExists: !!companionText,
            hasCourseName: !!user.courseName
        });
    }
}



