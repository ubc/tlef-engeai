// public/scripts/student-mode.ts

import { loadComponentHTML, renderFeatherIcons } from './functions/api.js';
import { ChatManager, createUserFromAuthData } from './feature/chat.js';
import { authService } from './services/AuthService.js';

// Authentication check function
async function checkAuthentication(): Promise<boolean> {
    return await authService.checkAuthenticationAndRedirect('/pages/student-mode.html', 'STUDENT-MODE');
}

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication first
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) {
        return; // Stop execution if not authenticated
    }
    
    console.log('[STUDENT-MODE] 🚀 Loading student mode...');
    
    // --- STATE MANAGEMENT ---
    // Get real user data from authentication
    const authState = authService.getAuthState();
    if (!authState.isAuthenticated || !authState.user) {
        console.error('[STUDENT-MODE] ❌ No authenticated user found');
        return;
    }
    
    console.log('[STUDENT-MODE] 👤 Using authenticated user data:', {
        puid: authState.user.puid,
        name: `${authState.user.firstName} ${authState.user.lastName}`,
        username: authState.user.username
    });
    
    // Create user context from real authentication data
    const user = createUserFromAuthData(authState.user);
    const chatManager = ChatManager.getInstance({
        isInstructor: false,
        userContext: user,
        onModeSpecificCallback: (action: string, data?: any) => {
            // Handle student-specific behaviors if needed
            if (action === 'ui-update-needed') {
                updateUI();
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
    const loadComponent = async (componentName: 'welcome-screen' | 'chat-window' | 'report-history') => {
        if (!mainContentArea) return;
        
        try {
            const html = await loadComponentHTML(componentName);
            mainContentArea.innerHTML = html;
            renderFeatherIcons();
            
            // After loading, attach necessary event listeners
            if (componentName === 'chat-window') {
                // Rebind message events after chat window is loaded
                chatManager.bindMessageEvents();
                // Reset DOM tracking and render active chat
                chatManager.resetDOMTracking();
                chatManager.renderActiveChat();
            } else if (componentName === 'welcome-screen') {
                attachWelcomeScreenListeners();
            } else if (componentName === 'report-history') {
                attachReportHistoryListeners();
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
        const activeChatId = chatManager.getActiveChatId();
        
        console.log(`[STUDENT-MODE] 📊 Chat status: ${chats.length} chats, active: ${activeChatId}`);
        
        if (chats.length === 0) {
            // No chats yet: show welcome screen for new users
            console.log('[STUDENT-MODE] 👋 No chats found, showing welcome screen');
            loadComponent('welcome-screen');
        } else if (activeChatId) {
            // Has chats and active chat: show chat window with last conversation
            console.log('[STUDENT-MODE] 💬 Has active chat, showing chat window');
            await loadComponent('chat-window');
            // Render the chat list in the sidebar after loading the component
            console.log('[STUDENT-MODE] 📋 Rendering chat list in sidebar');
            chatManager.renderChatList();
        } else {
            // Has chats but no active chat: set most recent chat as active and show it
            console.log('[STUDENT-MODE] 🔄 Has chats but no active chat, setting most recent as active');
            const mostRecentChat = chats.sort((a, b) => {
                // Use the timestamp of the last message in each chat
                const aLastMessage = a.messages[a.messages.length - 1];
                const bLastMessage = b.messages[b.messages.length - 1];
                
                const aTime = aLastMessage ? aLastMessage.timestamp : 0;
                const bTime = bLastMessage ? bLastMessage.timestamp : 0;
                
                return bTime - aTime; // Most recent first
            })[0];
            
            if (mostRecentChat) {
                chatManager.setActiveChatId(mostRecentChat.id);
                console.log(`[STUDENT-MODE] ✅ Set most recent chat as active: ${mostRecentChat.id}`);
                await loadComponent('chat-window');
                // Render the chat list in the sidebar after loading the component
                console.log('[STUDENT-MODE] 📋 Rendering chat list in sidebar');
                chatManager.renderChatList();
            } else {
                console.log('[STUDENT-MODE] ⚠️ No valid chat found, showing welcome screen');
                loadComponent('welcome-screen');
            }
        }
    };

    // Initialize the chat manager and wait for it to complete
    console.log('[STUDENT-MODE] 🚀 Initializing ChatManager with real user data...');
    console.log('[STUDENT-MODE] 📊 User context:', {
        puid: user.puid,
        activeCourseName: user.activeCourseName,
        role: user.role
    });
    
    try {
        await chatManager.initialize();
        console.log('[STUDENT-MODE] ✅ ChatManager initialized successfully');
        await updateUI();
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
            // Show confirmation dialog
            const confirmed = confirm('Are you sure you want to log out?');
            if (!confirmed) {
                console.log('[STUDENT-MODE] 🚫 Logout cancelled by user');
                return;
            }
            
            console.log('[STUDENT-MODE] 🚪 Initiating logout...');
            
            // Check current authentication status before logout
            const authCheck = await fetch('/auth/me', {
                method: 'GET',
                credentials: 'include'
            });
            const authData = await authCheck.json();
            console.log('[STUDENT-MODE] 📋 Current auth status before logout:', authData);
            
            // Call logout endpoint - let the browser follow the redirect naturally
            console.log('[STUDENT-MODE] 🔄 Redirecting to logout endpoint...');
            window.location.href = '/auth/logout';
            
        } catch (error) {
            console.error('[STUDENT-MODE] 🚨 Logout error:', error);
            // Fallback: redirect to login page
            window.location.href = '/auth/login';
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
    };

    // --- EVENT LISTENERS ATTACHMENT ---
    const attachWelcomeScreenListeners = () => {
        const welcomeBtn = document.getElementById('welcome-add-chat-btn');
        if (!welcomeBtn) return;
        welcomeBtn.addEventListener('click', async () => {
            const result = await chatManager.createNewChat();
            if (result.success) {
                chatManager.renderChatList();
                // UI update will be handled by the callback from createNewChat
            } else {
                console.error('Error creating new chat:', result.error);
            }
        });
    };

    const attachChatWindowListeners = () => {
        // Chat window listeners are now handled by ChatManager
        // This function is kept for compatibility but ChatManager handles all chat events
    };

    const attachReportHistoryListeners = () => {
        const backBtn = document.getElementById('back-to-chat-btn');
        const reportList = document.querySelector('.report-list');

        backBtn?.addEventListener('click', () => loadComponent('chat-window'));

        // Expand/collapse
        reportList?.addEventListener('click', (e) => {
            const header = (e.target as HTMLElement).closest('.report-item-header') as HTMLElement | null;
            if (!header) return;
            const item = header.closest('.report-item');
            item?.classList.toggle('open');
        });
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
            const collapsed = sidebarEl.classList.toggle('collapsed');
            // Keep the menu icon - no need to change it
        });

        // Place the button at the end of the header area
        sidebarHeaderEl.appendChild(btn);
        renderFeatherIcons();
    };
    ensureSidebarCollapseButton();

    // Message element creation is now handled by ChatManager

    // Artefact functionality disabled for now

    // Flagging support is now handled by ChatManager

    // Message context menu is now handled by ChatManager

    // --- INITIALIZATION ---
    attachLogoutListener(); // Attach logout button listener
    updateUI();
});