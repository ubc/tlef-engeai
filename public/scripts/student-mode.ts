// public/scripts/student-mode.ts

declare const feather: {
    replace: () => void;
};

interface ChatMessage {
    sender: 'user' | 'bot';
    text: string;
}

interface Chat {
    id: number;
    title: string;
    messages: ChatMessage[];
    isPinned: boolean;
}

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let chats: Chat[] = []; // Start with no chats
    let activeChatId: number | null = null;

    // --- DOM ELEMENT SELECTORS ---
    const mainContentArea = document.getElementById('main-content-area');
    const addChatBtn = document.getElementById('add-chat-btn');
    const chatListEl = document.getElementById('chat-list-ul');

    // --- COMPONENT LOADING ---
    const loadComponent = async (componentName: 'welcome-screen' | 'chat-window') => {
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
            } else {
                attachWelcomeScreenListeners();
            }
        } catch (error) {
            console.error(`Error loading component ${componentName}:`, error);
            mainContentArea.innerHTML = `<p style="color: red; text-align: center;">Error loading content.</p>`;
        }
    };

    // --- RENDER & UPDATE FUNCTIONS ---
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
            const li = document.createElement('li');
            li.className = `chat-item ${chat.id === activeChatId ? 'active' : ''}`;
            li.textContent = chat.title;
            li.dataset.chatId = chat.id.toString();
            chatListEl.appendChild(li);
        });
    };

    const renderActiveChat = () => {
        const activeChat = chats.find(c => c.id === activeChatId);
        const chatTitleEl = document.getElementById('chat-title');
        const messageAreaEl = document.getElementById('message-area');
        const pinBtn = document.getElementById('pin-chat-btn');
        
        if (!activeChat || !chatTitleEl || !messageAreaEl || !pinBtn) return;

        chatTitleEl.textContent = activeChat.title;
        pinBtn.classList.toggle('pinned', activeChat.isPinned);

        messageAreaEl.innerHTML = '';
        activeChat.messages.forEach(msg => {
            const messageEl = createMessageElement(msg.sender, msg.text);
            messageAreaEl.appendChild(messageEl);
        });
        messageAreaEl.scrollTop = messageAreaEl.scrollHeight;
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
        activeChat.messages.push({ sender: 'user', text });
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
            activeChat.messages.push({ sender: 'bot', text: data.reply });
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

    chatListEl?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.matches('.chat-item')) {
            activeChatId = Number(target.dataset.chatId);
            renderChatList();
            renderActiveChat();
        }
    });

    addChatBtn?.addEventListener('click', createNewChat);

    const createMessageElement = (sender: 'user' | 'bot', text: string): HTMLElement => {
        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('message', `${sender}-message`);
        messageWrapper.textContent = text;
        return messageWrapper;
    };

    // --- INITIALIZATION ---
    updateUI();
});
