// public/scripts/student-mode.ts

import { loadComponentHTML, renderFeatherIcons } from './functions/api.js';
import { ChatManager, createDefaultStudent } from './feature/chat.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    // Initialize ChatManager for student mode
    const student = createDefaultStudent();
    const chatManager = ChatManager.getInstance({
        isInstructor: false,
        userContext: student,
        onModeSpecificCallback: (action: string, data?: any) => {
            // Handle student-specific behaviors if needed
            if (action === 'ui-update-needed') {
                updateUI();
            }
            console.log('Student mode callback:', action, data);
        }
    });
    
    // Initialize the chat manager
    chatManager.initialize();

    // --- DOM ELEMENT SELECTORS ---
    const mainContentArea = document.getElementById('main-content-area');
    const sidebarEl = document.querySelector('.sidebar') as HTMLElement | null;
    const sidebarHeaderEl = document.querySelector('.sidebar-header') as HTMLElement | null;
    const artefactCloseBtn = document.getElementById('close-artefact-btn');

    // --- ESC KEY LISTENER FOR ARTEFACT PANEL ---
    let artefactEscListener: ((e: KeyboardEvent) => void) | null = null;

    const addArtefactEscListener = () => {
        if (artefactEscListener) return; // Already added
        
        artefactEscListener = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                const panel = document.getElementById('artefact-panel');
                if (panel && panel.classList.contains('open')) {
                    toggleArtefactPanel();
                }
            }
        };
        
        document.addEventListener('keydown', artefactEscListener);
    };

    const removeArtefactEscListener = () => {
        if (artefactEscListener) {
            document.removeEventListener('keydown', artefactEscListener);
            artefactEscListener = null;
        }
    };

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
    
    const updateUI = () => {
        const chats = chatManager.getChats();
        const activeChatId = chatManager.getActiveChatId();
        
        if (chats.length === 0) {
            // No chats yet: show welcome screen
            loadComponent('welcome-screen');
        } else if (activeChatId) {
            // Has chats and active chat: show chat window
            loadComponent('chat-window');
        } else {
            // Has chats but no active chat: show welcome screen
            loadComponent('welcome-screen');
        }
    };

    // Scroll to bottom is now handled by ChatManager

    // Ensure artefact close button always closes the panel
    artefactCloseBtn?.addEventListener('click', () => {
        const panel = document.getElementById('artefact-panel');
        const dashboard = document.querySelector('.main-dashboard') as HTMLElement | null;
        if (!panel) return;
        if (panel.classList.contains('open')) {
            panel.classList.add('closing');
            setTimeout(() => {
                panel.classList.remove('open');
                panel.setAttribute('aria-hidden', 'true');
                panel.classList.remove('closing');
                if (dashboard) dashboard.classList.remove('artefact-open');
            }, 180);
        }
    });

    // Chat list rendering is now handled by ChatManager

    // All chat operations are now handled by ChatManager

    // Chat list item creation is now handled by ChatManager

    // Active chat rendering is now handled by ChatManager

    // Chat header structure and pinned message handling is now handled by ChatManager

    // Pinned banner rendering is now handled by ChatManager

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

    // --- ARTEFACT PANEL TOGGLE ---
    const toggleArtefactPanel = () => {
        const panel = document.getElementById('artefact-panel');
        const closeBtn = document.getElementById('close-artefact-btn');
        const dashboard = document.querySelector('.main-dashboard') as HTMLElement | null;
        if (!panel) return;
        const willOpen = !panel.classList.contains('open');
        if (willOpen) {
            panel.classList.remove('closing');
            panel.classList.add('open');
            panel.setAttribute('aria-hidden', 'false');
            // Add ESC listener when panel opens
            addArtefactEscListener();
        } else {
            // add a brief closing class so content fades, then remove .open
            panel.classList.add('closing');
            // allow fade-out to play before collapsing
            setTimeout(() => {
                panel.classList.remove('open');
                panel.setAttribute('aria-hidden', 'true');
                panel.classList.remove('closing');
                // Remove ESC listener when panel closes
                removeArtefactEscListener();
            }, 180);
        }
        // mark dashboard state so CSS can split widths evenly
        if (dashboard) {
            dashboard.classList.toggle('artefact-open', willOpen);
        }

        // Bind close button when present
        if (closeBtn) {
            closeBtn.onclick = () => toggleArtefactPanel();
        }

        // Lazy-load artefact content on open
        if (willOpen) {

            const container = panel.querySelector('.artefact-content') as HTMLElement | null;
            if (container && container.childElementCount === 0) {
                fetch('/components/artefact.html')
                    .then(res => res.text())
                    .then(html => {
                        container.innerHTML = html;
                        // Re-initialize Mermaid after content injection
                        try {
                            // @ts-ignore
                            if (window.mermaid && typeof window.mermaid.init === 'function') {
                                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                                // @ts-ignore
                                window.mermaid.init(undefined, container.querySelectorAll('.mermaid'));
                            }
                        } catch {}
                    })
                    .catch(() => {
                        container.innerHTML = '<p style="padding:8px;color:var(--text-secondary)">Failed to load artefact.</p>';
                    });
            }
        }
    };

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
        icon.setAttribute('data-feather', 'chevrons-left');
        btn.appendChild(icon);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!sidebarEl) return;
            const collapsed = sidebarEl.classList.toggle('collapsed');
            const i = btn.querySelector('i');
            if (i) i.setAttribute('data-feather', collapsed ? 'chevrons-right' : 'chevrons-left');
            renderFeatherIcons();
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
    updateUI();
});