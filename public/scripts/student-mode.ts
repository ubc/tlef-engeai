// public/scripts/student-mode.ts

declare const feather: {
    replace: () => void;
};

interface ChatMessage {
    id: number;
    sender: 'user' | 'bot';
    text: string;
    timestamp: number;
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
        const hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const month = monthNames[d.getMonth()];
        const day = d.getDate();
        const year = d.getFullYear();
        return `${hours}:${minutes} ${month} ${day}, ${year}`;
    };
    const scrollToBottom = () => {
        const scrollContainer = document.querySelector('.chat-window') as HTMLElement | null;
        if (!scrollContainer) return;
        requestAnimationFrame(() => {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        });
    };
    const updateUI = () => {
        renderChatList();
        if (chats.length === 0) {
            loadComponent('welcome-screen');
        } else {
            loadComponent('chat-window');
        }
    };

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

    // --- EVENT HANDLERS ---
    const createNewChat = () => {
        const newChat: Chat = { id: Date.now(), 
                                title: 'New Chat', 
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
            activeChat.messages.push({ id: Date.now() + 1, sender: 'bot', text: data.reply, timestamp: serverTimestamp });
            renderActiveChat();
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

        // Timestamp footer
        const timeEl = document.createElement('div');
        timeEl.className = 'message-timestamp';
        timeEl.textContent = formatFullTimestamp(timestamp);
        messageWrapper.appendChild(timeEl);

        const actions = document.createElement('div');
        actions.className = 'msg-actions';
        const pinBtn = document.createElement('button');
        pinBtn.className = 'icon-btn';
        pinBtn.title = isPinned ? 'Unpin message' : 'Pin message';
        const pinIcon = document.createElement('i');
        pinIcon.setAttribute('data-feather', 'map-pin');
        if (isPinned) pinIcon.classList.add('pinned');
        pinBtn.appendChild(pinIcon);
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onTogglePin();
        });
        actions.appendChild(pinBtn);
        messageWrapper.appendChild(actions);
        return messageWrapper;
    };

    // --- INITIALIZATION ---
    updateUI();
});
