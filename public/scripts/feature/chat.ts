// public/scripts/feature/chat.ts

/**
 * Unified Chat Manager - Handles all chat functionality for both instructor and student modes
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { loadComponentHTML, renderFeatherIcons } from "../functions/api.js";
import { createNewChat, sendMessageToChat, deleteChat, updateChatPinStatus, CreateChatRequest } from "../functions/chat-api.js";
import { Chat, ChatMessage, User, activeCourse } from "../../../src/functions/types.js";
import { ArtefactHandler, ArtefactData, getArtefactHandler } from "./artefact.js";

/**
 * LaTeX Rendering Utility Functions
 */
export function renderLatexInElement(text: string, element: HTMLElement): void {
    element.textContent = text;
    
    // Wait for KaTeX to be available and render
    const renderMath = () => {
        if (typeof (window as any).renderMathInElement !== 'undefined') {
            try {
                console.log('🧮 Rendering LaTeX in element:', element);
                (window as any).renderMathInElement(element, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false}
                    ],
                    throwOnError: false,
                    errorColor: '#cc0000',
                    strict: false
                });
                console.log('✅ LaTeX rendering completed');
            } catch (error) {
                console.warn('❌ LaTeX rendering error:', error);
            }
        } else {
            console.log('⏳ KaTeX not ready yet, retrying...');
            // Retry after a short delay if KaTeX isn't loaded yet
            setTimeout(renderMath, 100);
        }
    };
    
    renderMath();
}

export function renderLatexInMessage(messageElement: HTMLElement): void {
    const contentEl = messageElement.querySelector('.message-content') as HTMLElement;
    if (!contentEl) return;
    
    // Wait for KaTeX to be available and render
    const renderMath = () => {
        if (typeof (window as any).renderMathInElement !== 'undefined') {
            try {
                (window as any).renderMathInElement(contentEl, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false}
                    ],
                    throwOnError: false,
                    errorColor: '#cc0000',
                    strict: false
                });
            } catch (error) {
                console.warn('LaTeX rendering error:', error);
            }
        } else {
            // Retry after a short delay if KaTeX isn't loaded yet
            setTimeout(renderMath, 100);
        }
    };
    
    renderMath();
}

/**
 * Render LaTeX in content that may contain HTML (like artefact buttons)
 * This function safely renders LaTeX without affecting HTML elements
 */
export function renderLatexInHtmlContent(element: HTMLElement): void {
    // Wait for KaTeX to be available and render
    const renderMath = () => {
        if (typeof (window as any).renderMathInElement !== 'undefined') {
            try {
                console.log('🧮 Rendering LaTeX in HTML content:', element);
                (window as any).renderMathInElement(element, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false}
                    ],
                    throwOnError: false,
                    errorColor: '#cc0000',
                    strict: false,
                    // Skip HTML elements to avoid breaking artefact buttons
                    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'button']
                });
                console.log('✅ LaTeX rendering in HTML content completed');
            } catch (error) {
                console.warn('❌ LaTeX rendering error in HTML content:', error);
            }
        } else {
            console.log('⏳ KaTeX not ready for HTML content, retrying...');
            // Retry after a short delay if KaTeX isn't loaded yet
            setTimeout(renderMath, 100);
        }
    };
    
    renderMath();
}

/**
 * Chat Manager Configuration
 */
export interface ChatManagerConfig {
    isInstructor: boolean;
    userContext: User | activeCourse;
    onModeSpecificCallback?: (action: string, data?: any) => void;
}

/**
 * Unified Chat Manager Class
 * Handles all chat functionality for both instructor and student modes
 */
export class ChatManager {
    private static instance: ChatManager | null = null;
    
    private chats: Chat[] = [];
    private activeChatId: string | null = null;
    private config: ChatManagerConfig;
    private isInitialized: boolean = false;
    private artefactHandler: ArtefactHandler;
    
    // Incremental update tracking
    private domMessageIds: Set<string> = new Set(); // Track which messages are in DOM
    private lastRenderedMessageCount: number = 0; // Track last rendered count for active chat

    private constructor(config: ChatManagerConfig) {
        this.config = config;
        this.artefactHandler = getArtefactHandler();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(config?: ChatManagerConfig): ChatManager {
        if (!ChatManager.instance && config) {
            ChatManager.instance = new ChatManager(config);
        }
        return ChatManager.instance!;
    }

    /**
     * Initialize the chat manager
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) return;

        
        // Artefact panel is now embedded in chat-window.html (disabled for now)

        // Load initial chats from server
        try {
            const courseName = this.config.isInstructor 
                ? (this.config.userContext as activeCourse).courseName 
                : (this.config.userContext as User).activeCourseName;
            
            const userId = this.config.isInstructor ? 'instructor' : 'student';
            this.chats = await this.loadChatsFromServer(userId, courseName);
            
            // Set the first chat as active if there are any chats
            if (this.chats.length > 0) {
                this.activeChatId = this.chats[0].id;
                console.log('[CHAT-MANAGER] ✅ Set active chat:', this.activeChatId);
            }
        } catch (error) {
            console.error('Error loading initial chats:', error);
            this.chats = [];
        }

        this.bindEvents();
        this.isInitialized = true;
    }

    /**
     * Get all chats
     */
    public getChats(): Chat[] {
        return this.chats;
    }

    /**
     * Get active chat ID
     */
    public getActiveChatId(): string | null {
        return this.activeChatId;
    }

    /**
     * Set active chat ID
     */
    public setActiveChatId(chatId: string | null): void {
        this.activeChatId = chatId;
    }

    /**
     * Get active chat
     */
    public getActiveChat(): Chat | undefined {
        return this.chats.find(c => c.id === this.activeChatId);
    }

    /**
     * Call mode-specific callback
     */
    public callModeSpecificCallback(action: string, data?: any): void {
        this.config.onModeSpecificCallback?.(action, data);
    }

    /**
     * Notify mode files that UI should be updated
     */
    public notifyUIUpdate(): void {
        this.callModeSpecificCallback('ui-update-needed');
    }

    /**
     * Create a new chat
     */
    public async createNewChat(): Promise<{ success: boolean; error?: string; chat?: Chat }> {
        try {
            console.log('[CHAT-MANAGER] 🆕 Creating new chat...');
            
            const chatRequest: CreateChatRequest = {
                userID: this.config.isInstructor ? 'instructor' : 'student',
                courseName: this.config.isInstructor 
                    ? (this.config.userContext as activeCourse).courseName 
                    : (this.config.userContext as User).activeCourseName,
                date: new Date().toISOString().split('T')[0]
            };

            const response = await createNewChat(chatRequest);

            if (!response.success) {
                console.error('[CHAT-MANAGER] ❌ Failed to create chat:', response.error);
                return {
                    success: false,
                    error: response.error || 'Unknown error occurred'
                };
            }

            // Backend now returns the complete chat object with initial message
            // Use it directly if available
            const newChat: Chat = (response as any).chat || {
                id: response.chatId || Date.now().toString(),
                courseName: this.config.isInstructor 
                    ? (this.config.userContext as activeCourse).courseName 
                    : (this.config.userContext as User).activeCourseName,
                divisionTitle: '',
                itemTitle: '',
                messages: response.initAssistantMessage ? [{
                    id: response.initAssistantMessage.id,
                    sender: response.initAssistantMessage.sender as 'bot',
                    userId: this.config.isInstructor ? 0 : (this.config.userContext as User).userId,
                    courseName: response.initAssistantMessage.courseName,
                    text: response.initAssistantMessage.text,
                    timestamp: response.initAssistantMessage.timestamp,
                }] : [],
                isPinned: false
            };

            this.chats.push(newChat);
            this.activeChatId = newChat.id;

            console.log('[CHAT-MANAGER] ✅ Chat created successfully:', newChat.id);

            // Notify UI update needed
            this.notifyUIUpdate();

            return {
                success: true,
                chat: newChat
            };
        } catch (error) {
            console.error('[CHAT-MANAGER] 🚨 Error creating new chat:', error);
            return {
                success: false,
                error: 'Network error occurred while creating chat'
            };
        }
    }

    /**
     * Send a message (NO STREAMING - Simple request-response)
     */
    public async sendMessage(
        text: string, 
        onChunk?: (content: string, hasArtefacts?: boolean) => void,
        onComplete?: (message: ChatMessage) => void,
        onError?: (error: string) => void
    ): Promise<void> {
        const activeChat = this.getActiveChat();
        if (!activeChat) {
            onError?.('No active chat found');
            return;
        }

        console.log('[CHAT-MANAGER] 💬 Sending message...');

        // Add user message locally (will be replaced with server version)
        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            sender: 'user',
            userId: this.config.isInstructor ? 0 : (this.config.userContext as User).userId,
            courseName: this.config.isInstructor 
                ? (this.config.userContext as activeCourse).courseName 
                : (this.config.userContext as User).activeCourseName,
            text,
            timestamp: Date.now()
        };
        activeChat.messages.push(userMessage);

        // Create bot message placeholder for loading indicator
        const botMessageId = (Date.now() + 1).toString();
        const botMessage: ChatMessage = {
            id: botMessageId,
            sender: 'bot',
            userId: this.config.isInstructor ? 0 : (this.config.userContext as User).userId,
            courseName: this.config.isInstructor 
                ? (this.config.userContext as activeCourse).courseName 
                : (this.config.userContext as User).activeCourseName,
            text: 'Thinking...',
            timestamp: Date.now(),
        } as ChatMessage & { artefact?: any };
        activeChat.messages.push(botMessage);

        // Add messages to DOM incrementally
        this.addMessageToDOM(userMessage, activeChat);
        this.addMessageToDOM(botMessage, activeChat);

        // Show loading state immediately
        onChunk?.('Thinking...', false);

        try {
            const response = await fetch(`/api/chat/${this.activeChatId}`, {
                method: 'POST',
                credentials: 'include', // Important for session cookies
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: text,
                    userId: this.config.isInstructor ? 'instructor' : 'student',
                    courseName: this.config.isInstructor 
                        ? (this.config.userContext as activeCourse).courseName 
                        : (this.config.userContext as User).activeCourseName
                }),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to send message');
            }

            console.log('[CHAT-MANAGER] ✅ Message sent successfully');

            // Replace the placeholder messages with server response using incremental updates
            // Remove placeholder messages from DOM and data
            this.removeMessageFromDOM(botMessageId);
            this.removeMessageFromDOM(userMessage.id);
            activeChat.messages.pop(); // Remove bot placeholder
            activeChat.messages.pop(); // Remove user placeholder

            // Add the actual messages from server
            if (data.userMessage) {
                activeChat.messages.push(data.userMessage);
                this.addMessageToDOM(data.userMessage, activeChat);
            }
            
            if (data.assistantMessage) {
                // Process artefacts in the complete response
                try {
                    const result = this.artefactHandler.processStreamingText(
                        data.assistantMessage.text,
                        data.assistantMessage.id
                    );
                    
                    // Update the assistant message with processed text
                    const finalMessage = {
                        ...data.assistantMessage,
                        text: result.processedText
                    };
                    
                    activeChat.messages.push(finalMessage);
                    this.addMessageToDOM(finalMessage, activeChat);
                    onComplete?.(finalMessage);
                } catch (artefactError) {
                    console.error('[CHAT-MANAGER] ⚠️ Error processing artefacts:', artefactError);
                    // Fallback to original message if artefact processing fails
                    activeChat.messages.push(data.assistantMessage);
                    this.addMessageToDOM(data.assistantMessage, activeChat);
                    onComplete?.(data.assistantMessage);
                }
            }

        } catch (error) {
            console.error('[CHAT-MANAGER] 🚨 Error sending message:', error);
            
            // Remove placeholder messages from DOM and data using incremental updates
            this.removeMessageFromDOM(botMessageId);
            this.removeMessageFromDOM(userMessage.id);
            activeChat.messages.pop(); // Remove bot placeholder
            activeChat.messages.pop(); // Remove user placeholder
            
            onError?.(error instanceof Error ? error.message : 'Sorry, I encountered an error. Please try again.');
        }
    }

    /**
     * Toggle pin status
     */
    public togglePin(chatId: string): void {
        const chat = this.chats.find(c => c.id === chatId);
        if (chat) {
            chat.isPinned = !chat.isPinned;
            // Update on server
            updateChatPinStatus(chatId, chat.isPinned);
        }
    }

    /**
     * Delete a chat
     */
    public async deleteChat(chatId: string): Promise<void> {
        try {
            // Delete from server first and wait for proper response
            const response = await deleteChat(chatId);
            
            // Check if server deletion was successful
            if (!response.success) {
                throw new Error(response.error || 'Server deletion failed');
            }
            
            // Only remove from local array if server deletion was successful
            this.chats = this.chats.filter(c => c.id !== chatId);
            
            // Update active chat if needed
            if (this.activeChatId === chatId) {
                if (this.chats.length > 0) {
                    const lastPinned = this.chats.filter(c => c.isPinned).pop();
                    this.activeChatId = lastPinned ? lastPinned.id : this.chats[0].id;
                } else {
                    this.activeChatId = null;
                }
            }
            
            // Notify UI update needed
            this.notifyUIUpdate();
        } catch (error) {
            console.error('Error deleting chat:', error);
            // Don't remove from local array if server call failed
            // This ensures data consistency
            throw error; // Re-throw to let caller handle the error
        }
    }

    /**
     * Toggle pinned message
     */
    public togglePinnedMessage(messageId: string): void {
        const activeChat = this.getActiveChat();
        if (activeChat) {
            activeChat.pinnedMessageId = activeChat.pinnedMessageId === messageId ? null : messageId;
        }
    }

    /**
     * Render chat list
     */
    public renderChatList(): void {
        const chatListEl = document.getElementById('chat-list-ul');
        if (!chatListEl) return;

        chatListEl.innerHTML = '';
        const sortedChats = [...this.chats].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

        sortedChats.forEach(chat => {
            const li = this.createChatListItem(chat);
            chatListEl.appendChild(li);
        });

        renderFeatherIcons();
    }

    /**
     * Render active chat (Full render - for initial load or when switching chats)
     */
    public renderActiveChat(): void {
        const activeChat = this.getActiveChat();
        const chatTitleEl = document.getElementById('chat-title');
        const messageAreaEl = document.getElementById('message-area');
        const pinBtn = document.getElementById('pin-chat-btn');
        
        if (!activeChat || !chatTitleEl || !messageAreaEl || !pinBtn) return;

        this.ensureChatHeaderStructure();

        chatTitleEl.textContent = activeChat.itemTitle;
        pinBtn.classList.toggle('pinned', activeChat.isPinned);

        // Full render - clear everything and rebuild
        messageAreaEl.innerHTML = '';
        this.domMessageIds.clear();
        
        activeChat.messages.forEach(msg => {
            this.addMessageToDOM(msg, activeChat);
        });

        this.lastRenderedMessageCount = activeChat.messages.length;
        this.scrollToBottom();
        this.renderPinnedBanner(activeChat);
        renderFeatherIcons();
    }

    /**
     * Render active chat with incremental updates (Optimized for new messages)
     */
    public renderActiveChatIncremental(): void {
        const activeChat = this.getActiveChat();
        const chatTitleEl = document.getElementById('chat-title');
        const messageAreaEl = document.getElementById('message-area');
        const pinBtn = document.getElementById('pin-chat-btn');
        
        if (!activeChat || !chatTitleEl || !messageAreaEl || !pinBtn) return;

        this.ensureChatHeaderStructure();

        chatTitleEl.textContent = activeChat.itemTitle;
        pinBtn.classList.toggle('pinned', activeChat.isPinned);

        // Check if we need incremental updates or full render
        if (this.lastRenderedMessageCount === activeChat.messages.length && 
            this.domMessageIds.size === activeChat.messages.length) {
            // No new messages, just update UI elements
            this.renderPinnedBanner(activeChat);
            return;
        }

        // Add only new messages that aren't in DOM yet
        const currentMessageIds = new Set(activeChat.messages.map(m => m.id));
        
        // Add missing messages
        activeChat.messages.forEach(msg => {
            if (!this.domMessageIds.has(msg.id)) {
                this.addMessageToDOM(msg, activeChat);
            }
        });

        // Remove messages that no longer exist (shouldn't happen in normal flow)
        this.domMessageIds.forEach(msgId => {
            if (!currentMessageIds.has(msgId)) {
                this.removeMessageFromDOM(msgId);
            }
        });

        this.lastRenderedMessageCount = activeChat.messages.length;
        this.scrollToBottom();
        this.renderPinnedBanner(activeChat);
        renderFeatherIcons();
    }

    /**
     * Add a single message to the DOM
     */
    private addMessageToDOM(msg: ChatMessage, activeChat: Chat): void {
        const messageAreaEl = document.getElementById('message-area');
        if (!messageAreaEl) return;

        const isPinnedMessage = activeChat.pinnedMessageId === msg.id;
        const messageEl = this.createMessageElement(
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
                this.renderActiveChatIncremental();
            }
        );
        
        messageAreaEl.appendChild(messageEl);
        this.domMessageIds.add(msg.id);
    }

    /**
     * Remove a message from the DOM
     */
    private removeMessageFromDOM(messageId: string): void {
        const messageEl = document.getElementById(`msg-${messageId}`);
        if (messageEl) {
            messageEl.remove();
            this.domMessageIds.delete(messageId);
        }
    }

    /**
     * Update an existing message in the DOM
     */
    public updateMessageInDOM(messageId: string, newText: string): void {
        const messageEl = document.getElementById(`msg-${messageId}`);
        if (!messageEl) return;

        const contentEl = messageEl.querySelector('.message-content') as HTMLElement;
        if (!contentEl) return;

        // Process artefacts and render
        const result = this.artefactHandler.processStreamingText(newText, messageId);
        
        if (result.hasArtefacts) {
            // Use innerHTML for content with artefacts (contains button HTML)
            contentEl.innerHTML = result.processedText;
            // Render LaTeX safely without breaking HTML elements
            renderLatexInHtmlContent(contentEl);
        } else {
            // Simple text update
            renderLatexInElement(newText, contentEl);
        }
        
        renderFeatherIcons();
        this.scrollToBottom();
    }

    /**
     * Scroll to bottom of chat
     */
    public scrollToBottom(): void {
        const scrollContainer = document.getElementById('message-area') as HTMLElement | null;
        if (!scrollContainer) return;
        requestAnimationFrame(() => {
            try {
                scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
            } catch {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        });
    }

    /**
     * Open disclaimer modal
     */
    public async openDisclaimerModal(): Promise<void> {
        if (document.querySelector('.modal-overlay')) {
            document.body.classList.add('modal-open');
            (document.querySelector('.modal-overlay') as HTMLElement)?.classList.add('show');
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);

        try {
            overlay.innerHTML = await loadComponentHTML('disclaimer');
        } catch (err) {
            overlay.innerHTML = '<div class="modal"><div class="modal-header"><h2>Disclaimer</h2></div><div class="modal-content"><p>Unable to load content.</p></div></div>';
        }

        overlay.classList.add('show');
        document.body.classList.add('modal-open');
        renderFeatherIcons();

        const closeBtn = overlay.querySelector('.close-modal') as HTMLButtonElement | null;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.closeDisclaimerModal(overlay);
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
    }


    // Artefact panel loading removed - now embedded in chat-window.html

    private async loadChatsFromServer(userId: string, courseName: string): Promise<Chat[]> {
        try {
            console.log('[CHAT-MANAGER] 📂 Loading chats from server...');
            
            const response = await fetch('/api/chat/user/chats', {
                method: 'GET',
                credentials: 'include', // Important for session cookies
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                console.error('[CHAT-MANAGER] ❌ Failed to load chats:', response.statusText);
                return [];
            }
            
            const data = await response.json();
            
            if (data.success && data.chats) {
                console.log(`[CHAT-MANAGER] ✅ Loaded ${data.chats.length} chats from database`);
                return data.chats;
            }
            
            console.log('[CHAT-MANAGER] ⚠️ No chats found');
            return [];
            
        } catch (error) {
            console.error('[CHAT-MANAGER] 🚨 Error loading chats:', error);
            return [];
        }
    }

    private bindEvents(): void {
        // Bind all chat-related events
        this.bindChatListEvents();
        this.bindMessageEvents();
        this.bindModalEvents();
    }

    private bindChatListEvents(): void {
        const chatListEl = document.getElementById('chat-list-ul');
        const addChatBtn = document.getElementById('add-chat-btn');

        addChatBtn?.addEventListener('click', () => {
            this.createNewChat().then(result => {
                if (result.success) {
                    // Reset DOM tracking for new chat
                    this.domMessageIds.clear();
                    this.lastRenderedMessageCount = 0;
                    
                    // Use full render for new chat (no existing messages to preserve)
                    this.renderActiveChat();
                    this.renderChatList();
                    this.scrollToBottom();
                    
                    // Notify instructor mode that a new chat was created
                    this.callModeSpecificCallback('new-chat-created', { chat: result.chat });
                }
            });
        });

        chatListEl?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const li = target.closest('.chat-item') as HTMLLIElement | null;
            if (li && !((target as HTMLElement).closest('button'))) {
                const chatId = li.dataset.chatId || null;
                if (chatId) {
                    this.setActiveChatId(chatId);
                    
                    // Reset DOM tracking when switching chats
                    this.domMessageIds.clear();
                    this.lastRenderedMessageCount = 0;
                    
                    this.renderChatList();
                    this.renderActiveChat(); // Use full render when switching chats
                }
            }
        });
    }

    /**
     * Public method to re-bind message events (useful after DOM changes)
     * Note: Only re-binds message events, not chat list events to prevent duplicate listeners
     */
    public rebindMessageEvents(): void {
        this.bindMessageEvents();
        // Don't rebind chat list events to prevent duplicate event listeners
        // Chat list events are bound once during initialization and don't need rebinding
    }

    /**
     * Reset DOM tracking (useful when switching contexts or initializing)
     */
    public resetDOMTracking(): void {
        this.domMessageIds.clear();
        this.lastRenderedMessageCount = 0;
    }

    public bindMessageEvents(): void {
        const sendBtn = document.getElementById('send-btn');
        const inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
        const pinBtn = document.getElementById('pin-chat-btn');
        const deleteBtn = document.getElementById('delete-chat-btn');
        
        // Debug logging for delete button binding
        console.log('🔗 Binding message events - Delete button found:', !!deleteBtn);

        // Auto-grow textarea
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

        sendBtn?.addEventListener('click', () => this.handleSendMessage());
        inputEl?.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
        pinBtn?.addEventListener('click', () => this.handleTogglePin());
        deleteBtn?.addEventListener('click', () => {
            console.log('🗑️ Delete button clicked in chat header');
            this.handleDeleteActiveChat();
        });
    }

    private bindModalEvents(): void {
        // Use event delegation to handle dynamically loaded disclaimer links
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const disclaimerLink = target.closest('#disclaimer a') as HTMLAnchorElement | null;
            if (disclaimerLink) {
                e.preventDefault();
                this.openDisclaimerModal();
            }
        });
    }

    private handleSendMessage(): void {
        const inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
        const text = inputEl.value.trim();
        if (text === '') return;
        
        const activeChat = this.getActiveChat();
        if (!activeChat) return;
        
        inputEl.value = '';
        inputEl.style.height = 'auto';
        
        // Store the current message count before adding new messages
        const currentMessageCount = activeChat.messages.length;
        
        this.sendMessage(
            text,
            (content: string, hasArtefacts?: boolean) => {
                // Find the bot message element by looking for the last bot message
                const botMessage = activeChat.messages[activeChat.messages.length - 1];
                if (botMessage && botMessage.sender === 'bot') {
                    const botMessageElement = document.getElementById(`msg-${botMessage.id}`);
                    const botContentElement = botMessageElement?.querySelector('.message-content');
                    if (botContentElement) {
                        if (hasArtefacts) {
                            // Use innerHTML for content with artefacts (contains button HTML)
                            (botContentElement as HTMLElement).innerHTML = content;
                            // Render LaTeX safely without breaking HTML elements
                            renderLatexInHtmlContent(botContentElement as HTMLElement);
                        } else {
                            // Use text rendering for normal content
                            renderLatexInElement(content, botContentElement as HTMLElement);
                        }
                        this.scrollToBottom();
                    }
                }
                // Re-render icons after each chunk update (important for artefact buttons)
                renderFeatherIcons();
            },
            (message: ChatMessage) => {
                const botMessageElement = document.getElementById(`msg-${message.id}`);
                const botContentElement = botMessageElement?.querySelector('.message-content');
                if (botContentElement) {
                    // Check if the final message has artefacts
                    const result = this.artefactHandler.processStreamingText(message.text, message.id);
                    
                    if (result.hasArtefacts) {
                        // Use innerHTML for content with artefacts
                        (botContentElement as HTMLElement).innerHTML = result.processedText;
                        // Render LaTeX safely without breaking HTML elements
                        renderLatexInHtmlContent(botContentElement as HTMLElement);
                    } else {
                        // Use text rendering for normal content
                        renderLatexInElement(message.text, botContentElement as HTMLElement);
                    }
                    this.scrollToBottom();
                }
                // Re-render icons after message completion (important for artefact buttons)
                renderFeatherIcons();
            },
            (error: string) => {
                const botMessage = activeChat.messages[activeChat.messages.length - 1];
                if (botMessage && botMessage.sender === 'bot') {
                    const botMessageElement = document.getElementById(`msg-${botMessage.id}`);
                    const botContentElement = botMessageElement?.querySelector('.message-content');
                    if (botContentElement) {
                        renderLatexInElement(error, botContentElement as HTMLElement);
                    }
                }
            }
        );
        
        // No need to render the chat - messages are added incrementally
        // this.renderActiveChat(); // Removed - using incremental updates
    }

    private handleTogglePin(): void {
        const activeChatId = this.getActiveChatId();
        if (!activeChatId) return;
        this.togglePin(activeChatId);
        this.renderActiveChatIncremental(); // Use incremental updates for pin toggle
        this.renderChatList();
    }

    private async handleDeleteActiveChat(): Promise<void> {
        console.log('🗑️ handleDeleteActiveChat called');
        const activeChatId = this.getActiveChatId();
        console.log('🗑️ Active chat ID:', activeChatId);
        
        if (activeChatId) {
            try {
                console.log('🗑️ Attempting to delete chat:', activeChatId);
                await this.deleteChat(activeChatId);
                console.log('🗑️ Chat deleted successfully');
            } catch (error) {
                console.error('Failed to delete active chat:', error);
                alert('Failed to delete chat. Please try again.');
                return; // Don't update UI if deletion failed
            }
        }
        
        // Update UI after deletion using incremental updates
        this.renderActiveChatIncremental();
        this.renderChatList();
        
        // Notify instructor mode that a chat was deleted
        this.callModeSpecificCallback('chat-deleted', { 
            remainingChats: this.chats.length,
            hasChats: this.chats.length > 0 
        });
    }

    private createChatListItem(chat: Chat): HTMLLIElement {
        const li = document.createElement('li');
        li.className = `chat-item ${chat.id === this.activeChatId ? 'active' : ''}`;
        li.dataset.chatId = chat.id.toString();

        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = chat.itemTitle;
        titleSpan.style.flex = '1';
        titleSpan.style.minWidth = '0';

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
        deleteBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            try {
                await this.deleteChat(chat.id);
                this.renderChatList();
                
                // Notify instructor mode that a chat was deleted from the list
                this.callModeSpecificCallback('chat-deleted', { 
                    remainingChats: this.chats.length,
                    hasChats: this.chats.length > 0 
                });
            } catch (error) {
                console.error('Failed to delete chat:', error);
                // Show user-friendly error message
                alert('Failed to delete chat. Please try again.');
            }
        });

        actions.appendChild(deleteBtn);

        const rightSide = document.createElement('div');
        rightSide.style.display = 'flex';
        rightSide.style.alignItems = 'center';
        rightSide.style.gap = '6px';

        if (chat.isPinned) {
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
                this.togglePin(chat.id);
                this.renderChatList();
            });
            rightSide.appendChild(actions);
            rightSide.appendChild(alwaysPinBtn);
        } else {
            const pinBtn = document.createElement('button');
            pinBtn.className = 'icon-btn';
            pinBtn.style.padding = '0';
            pinBtn.title = 'Pin chat';
            const pinIcon = document.createElement('i');
            pinIcon.setAttribute('data-feather', 'star');
            pinBtn.appendChild(pinIcon);
            pinBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                this.togglePin(chat.id);
                this.renderChatList();
            });
            actions.appendChild(pinBtn);
            rightSide.appendChild(actions);
        }

        li.addEventListener('mouseenter', () => {
            actions.style.visibility = 'visible';
            actions.style.opacity = '1';
        });
        li.addEventListener('mouseleave', () => {
            actions.style.opacity = '0';
            actions.style.visibility = 'hidden';
        });

        li.addEventListener('click', () => {
            this.setActiveChatId(chat.id);
            this.renderChatList();
            this.renderActiveChat();
        });

        li.appendChild(titleSpan);
        li.appendChild(rightSide);
        return li;
    }

    private createMessageElement(
        messageId: string,
        sender: 'user' | 'bot',
        text: string,
        timestamp: number | undefined,
        isPinned: boolean,
        onTogglePin: () => void
    ): HTMLElement {
        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('message', `${sender}-message`);
        messageWrapper.id = `msg-${messageId}`;
        
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        
        // Process artefacts for all messages (including initial messages)
        if (sender === 'bot') {
            const parsed = this.artefactHandler.parseArtefacts(text, messageId);
            
            //START DEBUG LOG : DEBUG-CODE(022)
            console.log('🎨 createMessageElement - Parsed artefacts:', parsed);
            //END DEBUG LOG : DEBUG-CODE(022)
            
            if (parsed.hasArtefacts) {
                // Add all elements (text + buttons) directly to content
                parsed.elements.forEach(element => {
                    contentEl.appendChild(element);
                });
                
                // Render LaTeX safely in the content that may contain HTML
                renderLatexInHtmlContent(contentEl);
                
                // Re-render icons for any buttons that were added
                renderFeatherIcons();
            } else {
                // No artefacts, render normally
                renderLatexInElement(text, contentEl);
            }
        } else {
            // User messages don't have artefacts
            renderLatexInElement(text, contentEl);
        }
        
        messageWrapper.appendChild(contentEl);

        const timeEl = document.createElement('div');
        timeEl.className = 'message-timestamp';
        
        const clockIcon = document.createElement('i');
        clockIcon.setAttribute('data-feather', 'clock');
        clockIcon.classList.add('timestamp-clock');
        const timeTextEl = document.createElement('span');
        timeTextEl.className = 'timestamp-text';
        timeTextEl.textContent = this.formatFullTimestamp(timestamp);
        timeEl.appendChild(clockIcon);
        timeEl.appendChild(timeTextEl);

        const actionsInline = document.createElement('span');
        actionsInline.className = 'timestamp-actions';

        const pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = 'timestamp-action-btn pin-action-btn';
        pinBtn.title = isPinned ? 'Unpin this message' : 'Pin this message';
        pinBtn.setAttribute('aria-label', pinBtn.title);
        const pinIconEl = document.createElement('i');
        pinIconEl.setAttribute('data-feather', 'map-pin');
        if (isPinned) {
            pinIconEl.classList.add('pinned');
        }
        const pinLabelEl = document.createElement('span');
        pinLabelEl.textContent = isPinned ? 'Unpin' : 'Pin';
        pinLabelEl.className = 'timestamp-action-label';
        pinLabelEl.style.marginLeft = '4px';
        pinBtn.appendChild(pinIconEl);
        pinBtn.appendChild(pinLabelEl);
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onTogglePin();
        });
        actionsInline.appendChild(pinBtn);

        if (sender === 'bot') {
            const flagBtn = document.createElement('button');
            flagBtn.type = 'button';
            flagBtn.className = 'timestamp-action-btn flag-action-btn';
            flagBtn.title = 'Flag this message';
            flagBtn.setAttribute('aria-label', 'Flag this message');
            flagBtn.style.marginLeft = '6px';
            const flagIconEl = document.createElement('i');
            flagIconEl.setAttribute('data-feather', 'flag');
            const flagLabelEl = document.createElement('span');
            flagLabelEl.textContent = 'Flag';
            flagLabelEl.className = 'timestamp-action-label';
            flagLabelEl.style.marginLeft = '4px';
            flagBtn.appendChild(flagIconEl);
            flagBtn.appendChild(flagLabelEl);
            flagBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openFlagDialog(messageId);
            });
            actionsInline.appendChild(flagBtn);
        }

        timeEl.appendChild(actionsInline);
        messageWrapper.appendChild(timeEl);

        return messageWrapper;
    }

    private ensureChatHeaderStructure(): void {
        const header = document.getElementById('chat-header');
        if (!header) return;
        
        let mainRow = header.querySelector('.chat-header-main') as HTMLDivElement | null;
        const title = document.getElementById('chat-title');
        const actions = header.querySelector('.chat-actions') as HTMLElement | null;
        if (!mainRow && title && actions) {
            mainRow = document.createElement('div');
            mainRow.className = 'chat-header-main';
            header.insertBefore(mainRow, actions);
            mainRow.appendChild(title);
            mainRow.appendChild(actions);
        }

        let pinnedLine = document.getElementById('pinned-inline') as HTMLDivElement | null;
        if (!pinnedLine) {
            pinnedLine = document.createElement('div');
            pinnedLine.id = 'pinned-inline';
            pinnedLine.className = 'pinned-inline';
            header.appendChild(pinnedLine);
        }
    }

    private renderPinnedBanner(chat: Chat): void {
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
        renderLatexInElement(pinned.text, text);
        pinnedLine.appendChild(icon);
        pinnedLine.appendChild(text);

        const timeEl = document.createElement('span');
        timeEl.className = 'pinned-time';
        timeEl.textContent = `• ${this.formatFullTimestamp((pinned as any).timestamp)}`;
        pinnedLine.appendChild(timeEl);
        pinnedLine.onclick = () => {
            const msgEl = document.getElementById(`msg-${(pinned as any).id}`);
            if (msgEl) {
                msgEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
        };

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-pin-btn icon-btn';
        removeBtn.title = 'Remove pin';
        removeBtn.classList.add('remove-pin-btn');
        removeBtn.textContent = 'remove';
        removeBtn.style.color = 'var(--text-secondary)';
        removeBtn.style.marginLeft = 'auto';
        removeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.deletePinnedMessage(chat);
        });
        pinnedLine.appendChild(removeBtn);
    }

    private deletePinnedMessage(chat: Chat): void {
        const pinnedLine = document.getElementById('pinned-inline') as HTMLDivElement | null;
        if (!pinnedLine) return;
        pinnedLine.style.display = 'none';
        chat.pinnedMessageId = null;
        this.renderActiveChatIncremental(); // Use incremental updates for pinned message removal
        this.renderChatList();
        renderFeatherIcons();
    }

    private formatFullTimestamp(timestampMs: number | undefined): string {
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
    }

    private openFlagDialog(messageId: string): void {
        // Flag dialog implementation
        console.log('Flag dialog for message:', messageId);
    }

    private closeDisclaimerModal(overlay: HTMLElement): void {
        document.body.classList.remove('modal-open');
        overlay.classList.remove('show');
        overlay.remove();
    }



}

/**
 * Utility function to create a default user context
 */
export function createDefaultUser(): User {
    return {
        id: 'student-001',
        name: 'Student User',
        puid: 'student-user',
        userId: 1,
        activeCourseId: 'default-course',
        activeCourseName: 'APSC 099: Engineering for Kindergarten',
        userOnboarding: false, // Student onboarding status
        role: 'student',
        status: 'active',
        chats: [],
        createdAt: new Date(),
        updatedAt: new Date()
    };
}
