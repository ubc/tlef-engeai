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
    const loadComponent = async (componentName: 'welcome-screen' | 'chat-window' | 'report-history' | 'profile') => {
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
            } else if (componentName === 'profile') {
                attachProfileListeners();
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
            loadComponent('chat-window');
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
                loadComponent('chat-window');
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

    const attachProfileListeners = () => {
        // Populate user profile information
        populateUserProfile();
        
        // Render sample report history
        renderSampleReportHistory();
        
        // Back to chat button
        const backBtn = document.getElementById('back-to-chat-btn');
        backBtn?.addEventListener('click', () => loadComponent('chat-window'));

        // Report card expand/collapse functionality - following report-instructor.css pattern
        const reportHistoryList = document.getElementById('report-history-list');
        reportHistoryList?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const reportCard = target.closest('.report-card') as HTMLElement;
            if (!reportCard) return;

            // Toggle collapse state
            toggleReportCollapse(reportCard);
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

    // --- PROFILE FUNCTIONALITY ---
    const populateUserProfile = () => {
        const profileName = document.getElementById('profile-name');
        const profileAffiliation = document.getElementById('profile-affiliation');
        const profileCourse = document.getElementById('profile-course');

        if (profileName && authState.user) {
            profileName.textContent = `${authState.user.firstName} ${authState.user.lastName}`;
        }
        
        if (profileAffiliation && authState.user) {
            profileAffiliation.textContent = authState.user.affiliation || 'UBC Engineering Student';
        }
        
        if (profileCourse && authState.user) {
            profileCourse.textContent = user.activeCourseName || 'APSC 099: Engineering for Kindergarten';
        }
    };

    const renderSampleReportHistory = () => {
        const reportHistoryList = document.getElementById('report-history-list');
        if (!reportHistoryList) return;

        // Sample report history data - following reports.ts structure
        const sampleReports = [
            {
                id: '1',
                timestamp: '2:30 PM, March 19, 2026',
                flagType: 'inappropriate',
                reportType: 'Response veers into personal opinions, political views, or non-academic discussions',
                chatContent: 'Chat: Right, well, like I said, most of this is political theater, but if you really need numbers for your assignment, post-combustion capture typically costs around $50-100 per ton of CO2. The politicians love to talk about "green energy" and "carbon neutral" but honestly, it\'s mostly virtue signaling.',
                status: 'unresolved',
                collapsed: true
            },
            {
                id: '2',
                timestamp: '1:25 PM, March 18, 2026',
                flagType: 'safety',
                reportType: 'Wrong calculations, formulas, or engineering principles',
                chatContent: 'Chat: For pressure vessel wall thickness calculation, you can use the simple formula: t = (P × D) / (2 × σ). So: t = (1.5 × 2000) / (2 × 250) = 6 mm. A 6mm wall thickness should be sufficient for your ammonia vessel. You don\'t need any safety factors since ammonia isn\'t that dangerous.',
                status: 'unresolved',
                collapsed: true
            },
            {
                id: '3',
                timestamp: '10:52 PM, March 15, 2026',
                flagType: 'interface bug',
                reportType: 'Interface bugs or usability issues',
                chatContent: 'Chat: The diagram viewer is not displaying correctly. The buttons are not working and the interface seems to be broken.',
                status: 'resolved',
                collapsed: true
            }
        ];

        reportHistoryList.innerHTML = '';
        sampleReports.forEach(report => {
            const reportItem = createReportItem(report);
            reportHistoryList.appendChild(reportItem);
        });
    };

    const createReportItem = (report: any): HTMLElement => {
        // Following exact structure from report-instructor.html and report-instructor.css
        const reportCard = document.createElement('div');
        reportCard.className = 'report-card';
        reportCard.dataset.reportId = report.id;

        // Report Header Row
        const headerRow = document.createElement('div');
        headerRow.className = 'report-header-row';

        const reportTime = document.createElement('div');
        reportTime.className = 'report-time';
        reportTime.textContent = report.timestamp || 'Today at 2:30 PM';

        const reportType = document.createElement('div');
        reportType.className = 'report-type';
        reportType.textContent = report.reportType || 'Assignment Submission';

        headerRow.appendChild(reportTime);
        headerRow.appendChild(reportType);

        // Chat Content (truncated by default)
        const chatContent = document.createElement('div');
        chatContent.className = 'chat-content collapsed';
        chatContent.innerHTML = `
            <strong>Question:</strong> ${report.question || 'Sample engineering question about thermodynamics and heat transfer...'}
            <br><br>
            <strong>Your Response:</strong> ${report.answer || 'Sample student response explaining the solution step by step with proper calculations...'}
        `;

        // Report Footer
        const reportFooter = document.createElement('div');
        reportFooter.className = 'report-footer';

        const studentName = document.createElement('div');
        studentName.className = 'student-name';
        studentName.textContent = report.studentName || 'You';

        const statusBadge = document.createElement('div');
        statusBadge.className = 'status-badge';
        statusBadge.innerHTML = `
            <span>${report.status || 'Submitted'}</span>
            <i class="feather expand-arrow" data-feather="chevron-down"></i>
        `;

        reportFooter.appendChild(studentName);
        reportFooter.appendChild(statusBadge);

        // Expanded Content (hidden by default)
        const expandedContent = document.createElement('div');
        expandedContent.className = 'expanded-content';
        expandedContent.innerHTML = `
            <div class="full-chat-content">
                <p><strong>Question:</strong></p>
                <p>${report.question || 'Sample engineering question about thermodynamics and heat transfer in industrial processes...'}</p>
                <br>
                <p><strong>Your Response:</strong></p>
                <p>${report.answer || 'Sample student response explaining the solution step by step with proper calculations and engineering principles...'}</p>
                <br>
                <p><strong>Feedback:</strong></p>
                <p>${report.feedback || 'Good understanding of the concepts. Consider explaining the assumptions more clearly and double-check your calculations.'}</p>
            </div>
        `;

        // Assemble the card
        reportCard.appendChild(headerRow);
        reportCard.appendChild(chatContent);
        reportCard.appendChild(reportFooter);
        reportCard.appendChild(expandedContent);

        return reportCard;
    };

    const toggleReportCollapse = (reportCard: HTMLElement) => {
        const isExpanded = reportCard.classList.contains('expanded');
        const chatContent = reportCard.querySelector('.chat-content') as HTMLElement;
        const expandArrow = reportCard.querySelector('.expand-arrow') as HTMLElement;

        if (isExpanded) {
            // Collapse the card
            reportCard.classList.remove('expanded');
            if (chatContent) {
                chatContent.classList.add('collapsed');
                chatContent.style.display = 'block'; // Show collapsed content
            }
            if (expandArrow) expandArrow.style.transform = 'rotate(0deg)';
        } else {
            // Expand the card
            reportCard.classList.add('expanded');
            if (chatContent) {
                chatContent.classList.remove('collapsed');
                chatContent.style.display = 'none'; // Hide collapsed content when expanded
            }
            if (expandArrow) expandArrow.style.transform = 'rotate(180deg)';
        }
    };

    const attachProfileButtonListener = () => {
        const profileBtn = document.getElementById('profile-btn');
        if (!profileBtn) {
            console.warn('[STUDENT-MODE] ⚠️ Profile button not found');
            return;
        }
        
        profileBtn.addEventListener('click', () => {
            console.log('[STUDENT-MODE] 👤 Loading profile component...');
            loadComponent('profile');
        });
        console.log('[STUDENT-MODE] ✅ Profile button listener attached');
    };

    // --- INITIALIZATION ---
    attachLogoutListener(); // Attach logout button listener
    attachProfileButtonListener(); // Attach profile button listener
    updateUI();
});