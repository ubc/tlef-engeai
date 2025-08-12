// public/scripts/student-mode.ts

declare const feather: {
    replace: () => void;
};

interface ChatMessage {
    id: number;
    sender: 'user' | 'bot';
    text: string;
    timestamp: number;
    artefact?: {
        type: 'mermaid';
        source: string;
        title?: string;
    };
}

interface Chat {
    id: number;
    title: string;
    messages: ChatMessage[];
    isPinned: boolean;
    pinnedMessageId?: number | null;
}

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let chats: Chat[] = []; // Start with no chats
    let activeChatId: number | null = null;

    // --- DOM ELEMENT SELECTORS ---
    const mainContentArea = document.getElementById('main-content-area');
    const addChatBtn = document.getElementById('add-chat-btn');
    const chatListEl = document.getElementById('chat-list-ul');
    const sidebarEl = document.querySelector('.sidebar') as HTMLElement | null;
    const sidebarHeaderEl = document.querySelector('.sidebar-header') as HTMLElement | null;
    const artefactCloseBtn = document.getElementById('close-artefact-btn');

    // --- COMPONENT LOADING ---
    const loadComponent = async (componentName: 'welcome-screen' | 'chat-window' | 'report-history') => {
        if (!mainContentArea) return;
        
        try {
            const response = await fetch(`/components/${componentName}.html`);
            if (!response.ok) throw new Error('Network response was not ok');
            console.log('Response:', response);
            mainContentArea.innerHTML = await response.text();
            feather.replace();
            
            // After loading, attach necessary event listeners
            if (componentName === 'chat-window') {
                attachChatWindowListeners();
                renderActiveChat();
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

    // --- RENDER & UPDATE FUNCTIONS ---
    const formatFullTimestamp = (timestampMs: number | undefined): string => {
        const d = new Date(typeof timestampMs === 'number' ? timestampMs : Date.now());
        const now = new Date();

        const sameYMD = (a: Date, b: Date) =>
            a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

        const hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');

        let dateLabel: string;
        if (sameYMD(d, now)) {
            dateLabel = 'Today';
        } else if (sameYMD(d, yesterday)) {
            dateLabel = 'Yesterday';
        } else {
            const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            const month = monthNames[d.getMonth()];
            const day = d.getDate();
            const year = d.getFullYear();
            dateLabel = `${month} ${day}, ${year}`;
        }

        return `${hours}:${minutes} ${dateLabel}`;
    };
    const scrollToBottom = () => {
        const scrollContainer = document.getElementById('message-area') as HTMLElement | null;
        if (!scrollContainer) return;
        requestAnimationFrame(() => {
            try {
                scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
            } catch {
                // Fallback for older browsers
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        });
    };
    const updateUI = () => {
        renderChatList();
        if (chats.length === 0) {
            // No chats yet: show welcome screen
            loadComponent('welcome-screen');
        } else {
            loadComponent('chat-window');
        }
    };

    // Ensure artefact close button always closes the panel
    artefactCloseBtn?.addEventListener('click', () => {
        const panel = document.getElementById('artefact-panel');
        const dashboard = document.querySelector('.chat-dashboard') as HTMLElement | null;
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

    const renderChatList = () => {
        if (!chatListEl) return;
        chatListEl.innerHTML = '';
        const sortedChats = [...chats].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

        sortedChats.forEach(chat => {
            const li = createChatListItem(chat);
            chatListEl.appendChild(li);
        });

        // Render Feather icons for newly injected buttons
        feather.replace();
    };

    const handlePinClickForChat = (targetChatId: number): void => {
        const targetChat = chats.find(c => c.id === targetChatId);
        if (!targetChat) return;
        targetChat.isPinned = !targetChat.isPinned;
        renderChatList();
        if (activeChatId === targetChatId) {
            renderActiveChat();
        }
    };

    const deleteChatById = (targetChatId: number): void => {
        chats = chats.filter(c => c.id !== targetChatId);
        // Do not change activeChatId here unless we deleted the active one
        renderChatList();
    };

    const handleDeleteClickForChat = (targetChatId: number): void => {
        if (activeChatId === targetChatId) {
            deleteActiveChat();
        } else {
            deleteChatById(targetChatId);
        }
    };

    const createChatListItem = (chat: Chat): HTMLLIElement => {
        const li = document.createElement('li');
        li.className = `chat-item ${chat.id === activeChatId ? 'active' : ''}`;
        li.dataset.chatId = chat.id.toString();

        // Layout: title on the left, right-side holds actions and optional always-visible pin
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = chat.title;
        titleSpan.style.flex = '1';
        titleSpan.style.minWidth = '0';

        // Actions shown on hover (trash first, then star if unpinned)
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '4px';
        actions.style.alignItems = 'center';
        actions.style.visibility = 'hidden';
        actions.style.opacity = '0';
        actions.style.transition = 'opacity 0.15s ease-in-out';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'icon-btn';
        deleteBtn.style.padding = '0';
        deleteBtn.title = 'Delete chat';
        const trashIcon = document.createElement('i');
        trashIcon.setAttribute('data-feather', 'trash-2');
        deleteBtn.appendChild(trashIcon);
        deleteBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            handleDeleteClickForChat(chat.id);
        });

        actions.appendChild(deleteBtn);

        // Right side container combines always-visible pin (if pinned) and hover actions
        const rightSide = document.createElement('div');
        rightSide.style.display = 'flex';
        rightSide.style.alignItems = 'center';
        rightSide.style.gap = '6px';

        if (chat.isPinned) {
            // Always visible, lit star; still clickable to unpin
            const alwaysPinBtn = document.createElement('button');
            alwaysPinBtn.className = 'icon-btn';
            alwaysPinBtn.style.padding = '0';
            alwaysPinBtn.title = 'Unpin chat';
            const alwaysPinIcon = document.createElement('i');
            alwaysPinIcon.setAttribute('data-feather', 'star');
            alwaysPinIcon.classList.add('pinned');
            alwaysPinBtn.appendChild(alwaysPinIcon);
            alwaysPinBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                handlePinClickForChat(chat.id);
            });
            rightSide.appendChild(actions); // trash on hover
            rightSide.appendChild(alwaysPinBtn); // star always visible
        } else {
            // Unpinned: star appears only on hover within actions (after trash)
            const pinBtn = document.createElement('button');
            pinBtn.className = 'icon-btn';
            pinBtn.style.padding = '0';
            pinBtn.title = 'Pin chat';
            const pinIcon = document.createElement('i');
            pinIcon.setAttribute('data-feather', 'star');
            pinBtn.appendChild(pinIcon);
            pinBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                handlePinClickForChat(chat.id);
            });
            actions.appendChild(pinBtn);
            rightSide.appendChild(actions);
        }

        // Hover behavior: reveal/hide actions
        li.addEventListener('mouseenter', () => {
            actions.style.visibility = 'visible';
            actions.style.opacity = '1';
        });
        li.addEventListener('mouseleave', () => {
            actions.style.opacity = '0';
            actions.style.visibility = 'hidden';
        });

        // Selecting a chat when clicking anywhere except buttons
        li.addEventListener('click', () => {
            activeChatId = chat.id;
            renderChatList();
            renderActiveChat();
        });

        li.appendChild(titleSpan);
        li.appendChild(rightSide);
        return li;
    };

    const renderActiveChat = () => {
        const activeChat = chats.find(c => c.id === activeChatId);
        const chatTitleEl = document.getElementById('chat-title');
        const messageAreaEl = document.getElementById('message-area');
        const pinBtn = document.getElementById('pin-chat-btn');
        
        if (!activeChat || !chatTitleEl || !messageAreaEl || !pinBtn) return;

        ensureChatHeaderStructure();

        chatTitleEl.textContent = activeChat.title;
        pinBtn.classList.toggle('pinned', activeChat.isPinned);

        messageAreaEl.innerHTML = '';
        activeChat.messages.forEach(msg => {
            const isPinnedMessage = activeChat.pinnedMessageId === msg.id;
            const messageEl = createMessageElement(
                msg.id,
                msg.sender,
                msg.text,
                msg.timestamp,
                isPinnedMessage,
                () => {
                    if (activeChat.pinnedMessageId === msg.id) {
                        activeChat.pinnedMessageId = null;
                    } else {
                        activeChat.pinnedMessageId = msg.id;
                    }
                    renderActiveChat();
                }
            );
            messageAreaEl.appendChild(messageEl);
        });
        // Always scroll to newest message on the scroll container (chat-window)
        scrollToBottom();
        renderPinnedBanner(activeChat);
        feather.replace();
        // In case icon rendering changes layout, scroll again next frame
        scrollToBottom();
    };

    const ensureChatHeaderStructure = () => {
        const header = document.getElementById('chat-header');
        if (!header) return;
        // Ensure a main row container exists to hold title + actions
        let mainRow = header.querySelector('.chat-header-main') as HTMLDivElement | null;
        const title = document.getElementById('chat-title');
        const actions = header.querySelector('.chat-actions') as HTMLElement | null;
        if (!mainRow && title && actions) {
            mainRow = document.createElement('div');
            mainRow.className = 'chat-header-main';
            header.insertBefore(mainRow, actions);
            // Move title and actions into main row
            mainRow.appendChild(title);
            mainRow.appendChild(actions);
        }

        // Ensure pinned line container exists under the main row
        let pinnedLine = document.getElementById('pinned-inline') as HTMLDivElement | null;
        if (!pinnedLine) {
            pinnedLine = document.createElement('div');
            pinnedLine.id = 'pinned-inline';
            pinnedLine.className = 'pinned-inline';
            header.appendChild(pinnedLine);
        }
    };

    const deletePinnedMessage = (chat: Chat) => {
        const pinnedLine = document.getElementById('pinned-inline') as HTMLDivElement | null;
        if (!pinnedLine) return;
        pinnedLine.style.display = 'none';
        chat.pinnedMessageId = null;
        renderActiveChat();
        renderChatList();
        feather.replace();
    };

    const renderPinnedBanner = (chat: Chat) => {
        const header = document.getElementById('chat-header');
        const pinnedLine = document.getElementById('pinned-inline') as HTMLDivElement | null;
        if (!header || !pinnedLine) return;

        if (!chat.pinnedMessageId) {
            pinnedLine.style.display = 'none';
            return;
        }

        const pinned = chat.messages.find(m => (m as any).id === chat.pinnedMessageId);
        if (!pinned) {
            pinnedLine.style.display = 'none';
            return;
        }

        pinnedLine.style.display = 'flex';
        pinnedLine.innerHTML = '';
        const icon = document.createElement('i');
        icon.setAttribute('data-feather', 'map-pin');
        icon.classList.add('pinned');
        const text = document.createElement('span');
        text.className = 'pinned-text';
        text.textContent = pinned.text;
        pinnedLine.appendChild(icon);
        pinnedLine.appendChild(text);

        // Timestamp right beside the pinned text
        const timeEl = document.createElement('span');
        timeEl.className = 'pinned-time';
        timeEl.textContent = `• ${formatFullTimestamp((pinned as any).timestamp)}`;
        pinnedLine.appendChild(timeEl);
        pinnedLine.onclick = () => {
            const msgEl = document.getElementById(`msg-${(pinned as any).id}`);
            if (msgEl) {
                msgEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
        };

        // Add remove button with text "remove"
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-pin-btn icon-btn';
        removeBtn.title = 'Remove pin';
        removeBtn.classList.add('remove-pin-btn');
        removeBtn.textContent = 'remove';
        removeBtn.style.color = 'var(--text-secondary)';
        // Push to the right edge
        removeBtn.style.marginLeft = 'auto';
        removeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            deletePinnedMessage(chat);
        });
        pinnedLine.appendChild(removeBtn);
    };

    // --- EVENT LISTENERS ATTACHMENT ---
    const attachWelcomeScreenListeners = () => {
        const welcomeBtn = document.getElementById('welcome-add-chat-btn');
        welcomeBtn?.addEventListener('click', createNewChat);
    };

    const attachChatWindowListeners = () => {
        const sendBtn = document.getElementById('send-btn');
        const inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
        const pinBtn = document.getElementById('pin-chat-btn');
        const deleteBtn = document.getElementById('delete-chat-btn');
        const artefactToggleBtn = document.getElementById('toggle-artefact-btn');
        const disclaimerLink = document.querySelector('#disclaimer a') as HTMLAnchorElement | null;
        const reportHistoryBtns = document.querySelectorAll('.report-history-btn');
        
        // auto-grow textarea up to 4 lines, wrap long strings
        const autoGrow = () => {
            if (!inputEl) return;
            inputEl.style.height = 'auto';
            const lineHeight = parseFloat(getComputedStyle(inputEl).lineHeight || '20');
            const maxH = lineHeight * 4;
            inputEl.style.height = Math.min(inputEl.scrollHeight, maxH) + 'px';
            inputEl.style.overflowY = inputEl.scrollHeight > maxH ? 'auto' : 'hidden';
        };
        inputEl?.addEventListener('input', autoGrow);
        autoGrow();

        sendBtn?.addEventListener('click', sendMessage);
        inputEl?.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        pinBtn?.addEventListener('click', togglePin);
        deleteBtn?.addEventListener('click', deleteActiveChat);

        // artefact toggle
        artefactToggleBtn?.addEventListener('click', toggleArtefactPanel);

        // open disclaimer modal
        disclaimerLink?.addEventListener('click', (e) => {
            e.preventDefault();
            openDisclaimerModal();
        });

        // open report history
        reportHistoryBtns.forEach(btn => btn.addEventListener('click', () => loadComponent('report-history')));
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
        const dashboard = document.querySelector('.chat-dashboard') as HTMLElement | null;
        if (!panel) return;
        const willOpen = !panel.classList.contains('open');
        if (willOpen) {
            panel.classList.remove('closing');
            panel.classList.add('open');
            panel.setAttribute('aria-hidden', 'false');
        } else {
            // add a brief closing class so content fades, then remove .open
            panel.classList.add('closing');
            // allow fade-out to play before collapsing
            setTimeout(() => {
                panel.classList.remove('open');
                panel.setAttribute('aria-hidden', 'true');
                panel.classList.remove('closing');
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
    const createNewChat = () => {
        const newChat: Chat = { id: Date.now(), 
                                title: 'no title', 
                                messages: [], 
                                isPinned: false };
        chats.push(newChat);
        activeChatId = newChat.id;
        updateUI();
    };

    const sendMessage = () => {
        const inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
        const text = inputEl.value.trim();
        if (text === '') return;
        const activeChat = chats.find(c => c.id === activeChatId);
        if (!activeChat) return;
        activeChat.messages.push({ id: Date.now(), sender: 'user', text, timestamp: Date.now() });
        renderActiveChat();
        inputEl.value = '';
        inputEl.style.height = 'auto';

        fetch('/api/chat/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        })
        .then(res => res.json())
        .then(data => {
            const serverTimestamp = typeof data.timestamp === 'number' ? data.timestamp : Date.now();
            const artefact = (data.artefact && data.artefact.type === 'mermaid' && typeof data.artefact.source === 'string')
                ? ({ type: 'mermaid' as const, source: data.artefact.source as string, title: (data.artefact.title as string | undefined) })
                : undefined;
            const botMsg: ChatMessage = { id: Date.now() + 1, sender: 'bot', text: data.reply, timestamp: serverTimestamp, artefact };
            activeChat.messages.push(botMsg);
            renderActiveChat();
            // Auto-open artefact when present
            if (artefact) {
                openArtefactFromMessage(botMsg);
            }
        });
    };

    const togglePin = () => {
        const activeChat = chats.find(c => c.id === activeChatId);
        if (!activeChat) return;
        activeChat.isPinned = !activeChat.isPinned;
        renderActiveChat();
        renderChatList();
    };

    const deleteActiveChat = () => {
        chats = chats.filter(c => c.id !== activeChatId);
        if (chats.length > 0) {
            const lastPinned = chats.filter(c => c.isPinned).pop();
            activeChatId = lastPinned ? lastPinned.id : chats[0].id;
        } else {
            activeChatId = null;
        }
        updateUI();
    };

    // --- DISCLAIMER MODAL ---
    const openDisclaimerModal = async () => {
        // Prevent multiple overlays
        if (document.querySelector('.modal-overlay')) {
            document.body.classList.add('modal-open');
            (document.querySelector('.modal-overlay') as HTMLElement)?.classList.add('show');
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);

        try {
            const response = await fetch('/components/disclaimer.html');
            if (!response.ok) throw new Error('Failed to load disclaimer');
            overlay.innerHTML = await response.text();
        } catch (err) {
            overlay.innerHTML = '<div class="modal"><div class="modal-header"><h2>Disclaimer</h2></div><div class="modal-content"><p>Unable to load content.</p></div></div>';
        }

        // Show overlay and lock background
        overlay.classList.add('show');
        document.body.classList.add('modal-open');
        feather.replace();

        const closeBtn = overlay.querySelector('.close-modal') as HTMLButtonElement | null;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeDisclaimerModal();
            }
        };

        const closeDisclaimerModal = () => {
            document.body.classList.remove('modal-open');
            overlay.classList.remove('show');
            overlay.remove();
            window.removeEventListener('keydown', onKeyDown);
        };

        closeBtn?.addEventListener('click', closeDisclaimerModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeDisclaimerModal();
        });
        window.addEventListener('keydown', onKeyDown);
    };

    chatListEl?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const li = target.closest('.chat-item') as HTMLLIElement | null;
        if (li && !((target as HTMLElement).closest('button'))) {
            activeChatId = Number(li.dataset.chatId);
            renderChatList();
            renderActiveChat();
        }
    });

    // Add chat button
    addChatBtn?.addEventListener('click', createNewChat);

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
            feather.replace();
        });

        // Place the button at the end of the header area
        sidebarHeaderEl.appendChild(btn);
        feather.replace();
    };
    ensureSidebarCollapseButton();

    const createMessageElement = (
        messageId: number,
        sender: 'user' | 'bot',
        text: string,
        timestamp: number | undefined,
        isPinned: boolean,
        onTogglePin: () => void
    ): HTMLElement => {
        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('message', `${sender}-message`);
        messageWrapper.id = `msg-${messageId}`;
        // Content container
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        contentEl.textContent = text;
        messageWrapper.appendChild(contentEl);

        // Append artefact chip for bot messages that carry artefacts
        const chat = chats.find(c => c.id === activeChatId);
        const thisMsg = chat?.messages.find(m => (m as any).id === messageId) as ChatMessage | undefined;
        if (sender === 'bot' && thisMsg && thisMsg.artefact) {
            const chip = document.createElement('button');
            chip.className = 'open-artefact-chip';
            chip.title = 'Open artefact';
            chip.innerHTML = `<i data-feather="monitor"></i><span>Open artefact</span>`;
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                openArtefactFromMessage(thisMsg);
            });
            messageWrapper.appendChild(chip);
        }

        // Timestamp footer with inline actions (Pin • Flag)
        const timeEl = document.createElement('div');
        timeEl.className = 'message-timestamp';
        timeEl.textContent = formatFullTimestamp(timestamp);

        // Inline text actions aligned with timestamp
        const actionsInline = document.createElement('span');
        actionsInline.className = 'timestamp-actions';

        // Separator helper
        const appendDot = () => {
            const dot = document.createElement('span');
            dot.className = 'timestamp-dot';
            dot.textContent = ' • ';
            actionsInline.appendChild(dot);
        };

        // Pin / Unpin action
        appendDot();
        const pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = 'timestamp-action-btn';
        pinBtn.textContent = isPinned ? 'Unpin' : 'Pin';
        pinBtn.title = isPinned ? 'Unpin this message' : 'Pin this message';
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onTogglePin();
        });
        pinBtn.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTogglePin();
            }
        });
        actionsInline.appendChild(pinBtn);

        // Flag action (only for bot messages)
        if (sender === 'bot') {
            appendDot();
            const flagBtn = document.createElement('button');
            flagBtn.type = 'button';
            flagBtn.className = 'timestamp-action-btn';
            flagBtn.textContent = 'Flag';
            flagBtn.title = 'Flag this message';
            flagBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openFlagDialog(messageId);
            });
            flagBtn.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openFlagDialog(messageId);
                }
            });
            actionsInline.appendChild(flagBtn);
        }

        timeEl.appendChild(actionsInline);
        messageWrapper.appendChild(timeEl);

        // Context menu (right-click) handler
        messageWrapper.addEventListener('contextmenu', (e: MouseEvent) => {
            e.preventDefault();
            openMessageContextMenu(e.clientX, e.clientY, isPinned, onTogglePin, sender, messageId);
        });

        // Hover affordance: down-facing arrow to indicate options
        const actions = document.createElement('div');
        actions.className = 'msg-actions';
        const moreBtn = document.createElement('button');
        moreBtn.className = 'icon-btn';
        moreBtn.title = 'More options';
        const moreIcon = document.createElement('i');
        moreIcon.setAttribute('data-feather', 'chevron-down');
        moreBtn.appendChild(moreIcon);
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            openMessageContextMenu(rect.left, rect.bottom, isPinned, onTogglePin, sender, messageId);
        });
        actions.appendChild(moreBtn);
        messageWrapper.appendChild(actions);
        return messageWrapper;
    };
    // Seed predefined chats with distinct Mermaid diagrams (reset every load)
    const seedPredefinedChats = () => {
        const samples: Array<{title: string; text: string; mermaid: string}> = [
            {
                title: 'Process Overview',
                text: 'Here is a high-level process overview. Click to view the artefact.',
                mermaid: `flowchart TD\n  Start --> A[Collect Input]\n  A --> B{Valid?}\n  B -- Yes --> C[Analyze]\n  B -- No --> D[Request Fix]\n  C --> E[Generate]\n  E --> End`
            },
            {
                title: 'Sequence Demo',
                text: 'A simple sequence between client and server.',
                mermaid: `sequenceDiagram\n  participant C as Client\n  participant S as Server\n  C->>S: Request data\n  S-->>C: Respond with JSON\n  C->>S: ACK`
            },
            {
                title: 'State Machine',
                text: 'A small state machine example.',
                mermaid: `stateDiagram-v2\n  [*] --> Idle\n  Idle --> Loading: fetch\n  Loading --> Success: ok\n  Loading --> Error: fail\n  Success --> [*]\n  Error --> Idle`
            },
            {
                title: 'Class Diagram',
                text: 'A mini class diagram sample.',
                mermaid: `classDiagram\n  class User {\n    +id: number\n    +name: string\n    +login() void\n  }\n  class Session {\n    +token: string\n    +expiresAt: Date\n  }\n  User "1" -- "*" Session`
            },
            {
                title: 'ER Diagram',
                text: 'An ER-style entity relation sample.',
                mermaid: `erDiagram\n  USER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains\n  USER {\n    string id\n    string name\n  }\n  ORDER {\n    string id\n    date created\n  }\n  LINE_ITEM {\n    string sku\n    int quantity\n  }`
            }
        ];

        chats = samples.map((s, idx) => ({
            id: Date.now() + idx,
            title: s.title,
            isPinned: idx === 0,
            messages: [
                { id: Date.now() + idx * 10 + 1, sender: 'bot', text: s.text, timestamp: Date.now(), artefact: { type: 'mermaid', source: s.mermaid } }
            ]
        }));
        activeChatId = chats[0].id;
    };

    // Open artefact from a specific message
    const openArtefactFromMessage = (msg: ChatMessage) => {
        if (!msg.artefact) return;
        const panel = document.getElementById('artefact-panel');
        const dashboard = document.querySelector('.chat-dashboard') as HTMLElement | null;
        if (!panel) return;

        // Close then open for the requested behaviour
        const wasOpen = panel.classList.contains('open');
        if (wasOpen) {
            panel.classList.add('closing');
            setTimeout(() => {
                panel.classList.remove('open');
                panel.setAttribute('aria-hidden', 'true');
                panel.classList.remove('closing');
                if (dashboard) dashboard.classList.remove('artefact-open');
                // after closed, proceed to open with new content
                setTimeout(() => showMermaidInPanel(msg), 10);
            }, 180);
        } else {
            showMermaidInPanel(msg);
        }
    };

    const showMermaidInPanel = (msg: ChatMessage) => {
        const panel = document.getElementById('artefact-panel');
        const dashboard = document.querySelector('.chat-dashboard') as HTMLElement | null;
        if (!panel || !msg.artefact) return;
        const container = panel.querySelector('.artefact-content') as HTMLElement | null;
        if (!container) return;

        // Replace body content but keep outer template
        const body = document.createElement('div');
        body.className = 'artefact-body';
        body.innerHTML = `<pre class="mermaid">${msg.artefact.source}</pre>`;
        container.innerHTML = '';
        container.appendChild(body);

        // open panel
        panel.classList.remove('closing');
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        if (dashboard) dashboard.classList.add('artefact-open');

        // init mermaid on new content
        try {
            // @ts-ignore
            if (window.mermaid && typeof window.mermaid.init === 'function') {
                // @ts-ignore
                window.mermaid.init(undefined, container.querySelectorAll('.mermaid'));
            }
        } catch {}
    };

    // --- FLAGGING SUPPORT ---
    const openFlagDialog = (messageId: number) => {
        const chat = chats.find(c => c.id === activeChatId);
        if (!chat) return;
        const msg = chat.messages.find(m => m.id === messageId);
        if (!msg || msg.sender !== 'bot') return; // Only bot messages can be flagged

        const panel = document.getElementById('artefact-panel');
        const dashboard = document.querySelector('.chat-dashboard') as HTMLElement | null;
        if (!panel) return;

        const proceed = () => {
            const container = panel.querySelector('.artefact-content') as HTMLElement | null;
            if (!container) return;

            fetch('/components/flag-message.html')
                .then(res => res.text())
                .then(html => {
                    container.innerHTML = html;
                    // Populate flagged message text only (exclude artefact chips)
                    const msgBox = container.querySelector('#flag-message-content') as HTMLElement | null;
                    if (msgBox) {
                        msgBox.textContent = msg.text;
                    }

                    // Wire up actions
                    const submitBtn = container.querySelector('#flag-submit-btn') as HTMLButtonElement | null;
                    const cancelBtn = container.querySelector('#flag-cancel-btn') as HTMLButtonElement | null;
                    submitBtn?.addEventListener('click', () => handleFlagSubmit());
                    cancelBtn?.addEventListener('click', () => closeArtefactPanel());
                })
                .catch(() => {
                    const container = panel.querySelector('.artefact-content') as HTMLElement | null;
                    if (container) {
                        container.innerHTML = '<p style="padding:8px;color:var(--text-secondary)">Failed to load flag form.</p>';
                    }
                });

            // Open panel
            panel.classList.remove('closing');
            panel.classList.add('open');
            panel.setAttribute('aria-hidden', 'false');
            if (dashboard) dashboard.classList.add('artefact-open');
        };

        // If already open, close first for consistent animation, then open
        const wasOpen = panel.classList.contains('open');
        if (wasOpen) {
            panel.classList.add('closing');
            setTimeout(() => {
                panel.classList.remove('open');
                panel.setAttribute('aria-hidden', 'true');
                panel.classList.remove('closing');
                if (dashboard) dashboard.classList.remove('artefact-open');
                setTimeout(proceed, 10);
            }, 180);
        } else {
            proceed();
        }
    };

    const handleFlagSubmit = () => {
        const form = document.getElementById('flag-form') as HTMLFormElement | null;
        if (!form) return;
        const reasons: string[] = [];
        form.querySelectorAll('input[name="reasons"]:checked').forEach((el) => {
            reasons.push((el as HTMLInputElement).value);
        });
        const other = (document.getElementById('flag-other-text') as HTMLInputElement | null)?.value?.trim();
        if (other) reasons.push(`other:${other}`);

        // Confirmation message (no backend integration yet)
        alert('Thanks for your report. Your feedback helps improve EngE-AI.');
        closeArtefactPanel();
    };

    const closeArtefactPanel = () => {
        const panel = document.getElementById('artefact-panel');
        const dashboard = document.querySelector('.chat-dashboard') as HTMLElement | null;
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
    };

    // Load and control message context menu
    let messageMenuLoaded = false;
    const ensureMessageMenu = async () => {
        if (messageMenuLoaded) return;
        const containerId = 'message-context-menu-container';
        if (!document.getElementById(containerId)) {
            const holder = document.createElement('div');
            holder.id = containerId;
            document.body.appendChild(holder);
        }
        try {
            const res = await fetch('/components/message-menu.html');
            if (!res.ok) throw new Error('Failed to load message menu');
            const html = await res.text();
            (document.getElementById('message-context-menu-container') as HTMLElement).innerHTML = html;
            messageMenuLoaded = true;
        } catch (err) {
            console.error(err);
        }
    };

    const closeMessageContextMenu = () => {
        const menu = document.getElementById('message-context-menu') as HTMLElement | null;
        if (menu) menu.style.display = 'none';
        document.removeEventListener('click', closeMessageContextMenu);
        document.removeEventListener('keydown', escListener);
    };

    const escListener = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeMessageContextMenu();
    };

    const openMessageContextMenu = async (
        x: number,
        y: number,
        isPinned: boolean,
        onTogglePin: () => void,
        sender: 'user' | 'bot',
        messageId: number
    ) => {
        await ensureMessageMenu();
        const menu = document.getElementById('message-context-menu') as HTMLElement | null;
        if (!menu) return;
        // Toggle pin/unpin visibility
        const pinItem = menu.querySelector('[data-action="pin"]') as HTMLElement | null;
        const unpinItem = menu.querySelector('[data-action="unpin"]') as HTMLElement | null;
        const flagItem = menu.querySelector('[data-action="flag"]') as HTMLElement | null;
        if (pinItem && unpinItem) {
            pinItem.style.display = isPinned ? 'none' : 'block';
            unpinItem.style.display = isPinned ? 'block' : 'none';
        }
        // Only show flag option for bot messages
        if (flagItem) {
            flagItem.style.display = sender === 'bot' ? 'block' : 'none';
        }
        // Set position
        const menuRect = menu.getBoundingClientRect();
        const maxX = window.innerWidth - menuRect.width - 8;
        const maxY = window.innerHeight - menuRect.height - 8;
        menu.style.left = Math.min(x, maxX) + 'px';
        menu.style.top = Math.min(y, maxY) + 'px';
        menu.style.display = 'block';

        // Bind click handlers
        const onAction = (e: Event) => {
            const target = e.target as HTMLElement;
            const li = target.closest('.menu-item') as HTMLElement | null;
            if (!li) return;
            const action = li.dataset.action;
            if (action === 'pin' || action === 'unpin') {
                onTogglePin();
                closeMessageContextMenu();
            }
            if (action === 'flag' && sender === 'bot') {
                openFlagDialog(messageId);
                closeMessageContextMenu();
            }
        };
        menu.onclick = onAction;

        // Close on outside click or ESC
        setTimeout(() => {
            document.addEventListener('click', closeMessageContextMenu);
            document.addEventListener('keydown', escListener);
        }, 0);
    };

    // --- INITIALIZATION ---
    updateUI();
});
