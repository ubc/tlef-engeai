// public/scripts/feature/chat.ts

/**
 * Unified Chat Manager - Handles all chat functionality for both instructor and student modes
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { loadComponentHTML, renderFeatherIcons } from "../functions/api.js";
import { createNewChat, sendMessageToChat, deleteChat, updateChatPinStatus, CreateChatRequest } from "../functions/chat-api.js";
import { Chat, ChatMessage, CourseUser, activeCourse } from "../../../src/functions/types.js";
import { RenderChat } from "./render-chat.js";
import { showDisclaimerModal, showDeleteConfirmationModal, showSimpleErrorModal } from "../modal-overlay.js";

/**
 * Chat Metadata Interface - Lightweight chat information without full message history
 */
interface ChatMetadata {
    id: string;
    courseName: string;
    itemTitle: string;
    isPinned: boolean;
    pinnedMessageId: string | null;
    lastMessageTimestamp: number;
    messageCount: number;
}

/**
 * LaTeX Rendering Utility Functions
 */
export function renderLatexInElement(text: string, element: HTMLElement): void {
    // Set text content directly - KaTeX's renderMathInElement can process it correctly
    // textContent preserves newlines in the DOM, which KaTeX can then process
    element.textContent = text;
    
    // Wait for KaTeX to be available and render
    const renderMath = () => {
        if (typeof (window as any).renderMathInElement !== 'undefined') {
            try {
                // console.log('🧮 Rendering LaTeX in element:', element); // 🟢 MEDIUM: LaTeX rendering - keep for monitoring
                (window as any).renderMathInElement(element, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false}
                    ],
                    throwOnError: false,
                    errorColor: '#cc0000',
                    strict: false
                });
                // console.log('✅ LaTeX rendering completed'); // 🟢 MEDIUM: LaTeX rendering - keep for monitoring
            } catch (error) {
                // console.warn('❌ LaTeX rendering error:', error);
            }
        } else {
            // console.log('⏳ KaTeX not ready yet, retrying...'); // 🟢 MEDIUM: LaTeX rendering - keep for monitoring
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
                // console.warn('LaTeX rendering error:', error);
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
                // console.log('🧮 Rendering LaTeX in HTML content:', element); // 🟢 MEDIUM: LaTeX rendering - keep for monitoring
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
                // console.log('✅ LaTeX rendering in HTML content completed'); // 🟢 MEDIUM: LaTeX rendering - keep for monitoring
            } catch (error) {
                // console.warn('❌ LaTeX rendering error in HTML content:', error);
            }
        } else {
            // console.log('⏳ KaTeX not ready for HTML content, retrying...'); // 🟢 MEDIUM: LaTeX rendering - keep for monitoring
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
    userContext: CourseUser;  // Always use CourseUser for both students and instructors
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
    private renderChat: RenderChat;
    
    // Metadata and lazy loading tracking
    private chatMetadata: ChatMetadata[] = []; // Store chat metadata separately
    private loadedChatIds: Set<string> = new Set(); // Track which chats are fully loaded
    
    // Logging configuration
    private readonly LOG_PREFIX = '[CHAT-MANAGER]';
    private readonly LOG_LEVELS = {
        INFO: 'ℹ️',
        DEBUG: '🔍',
        WARN: '⚠️',
        ERROR: '❌',
        SUCCESS: '✅'
    };
    
    // Incremental update tracking
    private domMessageIds: Set<string> = new Set(); // Track which messages are in DOM
    private lastRenderedMessageCount: number = 0; // Track last rendered count for active chat
    
    // Streaming configuration
    private readonly STREAM_DELAY_MS = 15; // Delay between words (milliseconds) - adjust for faster/slower streaming
    
    // ===== LOGGING HELPER METHODS =====
    
    /**
     * Log active chat state with detailed information
     */
    private logActiveChatState(event: string, details?: any): void {
        const timestamp = new Date().toISOString();
        const state = this.getActiveChatState();
        

    }
    
    /**
     * Get comprehensive active chat state snapshot
     */
    private getActiveChatState(): any {
        return {
            activeChatId: this.activeChatId,
            totalMetadataChats: this.chatMetadata.length,
            totalLoadedChats: this.chats.length,
            loadedChatIds: Array.from(this.loadedChatIds),
            chatMetadata: this.chatMetadata.map(m => ({
                id: m.id,
                title: m.itemTitle,
                isPinned: m.isPinned,
                messageCount: m.messageCount,
                lastMessageTime: new Date(m.lastMessageTimestamp).toISOString()
            })),
            loadedChats: this.chats.map(c => ({
                id: c.id,
                title: c.itemTitle,
                messageCount: c.messages?.length || 0,
                isPinned: c.isPinned
            }))
        };
    }
    
    /**
     * Log with consistent formatting
     */
    private log(level: keyof typeof this.LOG_LEVELS, message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        // console.log(`${this.LOG_PREFIX} ${this.LOG_LEVELS[level]} [${timestamp}] ${message}`); // 🟢 MEDIUM: Debug info - keep for monitoring

    }

    private constructor(config: ChatManagerConfig) {
        this.config = config;
        this.renderChat = new RenderChat();
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

        this.log('INFO', '🚀 INITIALIZING CHAT MANAGER - First time user login');
        this.log('DEBUG', 'User context:', {
            userId: this.config.userContext.userId,
            courseName: this.config.userContext.courseName,
            userName: this.config.userContext.name,
            isInstructor: this.config.isInstructor
        });
        
        // Artefact panel is now embedded in chat-window.html (disabled for now)

        // Load initial chats from server
        try {
            const courseName = this.config.userContext.courseName;
            const userId = this.config.userContext.userId;
            
            this.log('DEBUG', '📥 Loading chat metadata from server...');
            
            // Load only metadata initially
            this.chatMetadata = await this.loadChatMetadataFromServer(userId, courseName);
            
            this.log('SUCCESS', `📊 Loaded ${this.chatMetadata.length} chat metadata entries`);
            
            // Initialize empty chats array
            this.chats = [];
            this.loadedChatIds.clear(); // Clear any previously loaded chats
            
            // Don't auto-select any chat on initial load - user must explicitly choose one
            this.activeChatId = null;
            if (this.chatMetadata.length > 0) {
                this.log('INFO', `📋 Loaded ${this.chatMetadata.length} chats - no chat selected initially`);
            } else {
                this.log('INFO', '📭 No existing chats found - user will see welcome screen');
            }
            
            this.log('DEBUG', '🎨 Rendering chat list after initialization...');
            
            // Render the chat list with metadata only
            this.renderChatList();
            
            this.logActiveChatState('INITIALIZATION_COMPLETE', {
                metadataLoaded: this.chatMetadata.length,
                activeChatSet: !!this.activeChatId,
                willShowWelcome: this.chatMetadata.length === 0
            });
            
        } catch (error) {
            this.log('ERROR', 'Failed to initialize chat manager:', error);
            this.chatMetadata = [];
            this.chats = [];
            this.activeChatId = null;
        }

        this.bindEvents();
        this.isInitialized = true;
        this.log('SUCCESS', '✅ Chat manager initialization complete');
    }

    /**
     * Get all chats
     */
    public getChats(): Chat[] {
        return this.chats;
    }

    /**
     * Get chat metadata
     */
    public getChatMetadata(): ChatMetadata[] {
        return this.chatMetadata;
    }

    /**
     * Get active chat ID
     */
    public getActiveChatId(): string | null {
        return this.activeChatId;
    }

    /**
     * Set active chat ID and trigger lazy loading if needed
     */
    public async setActiveChatId(chatId: string | null): Promise<void> {
        this.log('INFO', `🔄 SWITCHING ACTIVE CHAT - User triggered chat switch`);
        
        if (!chatId) {
            this.log('INFO', '📭 Setting active chat to null');
            this.activeChatId = null;
            this.logActiveChatState('ACTIVE_CHAT_CLEARED');
            return;
        }
        
        const previousActiveChatId = this.activeChatId;
        const needsLoading = !this.loadedChatIds.has(chatId);
        
        this.log('DEBUG', `Chat switch details:`, {
            previousActiveChatId,
            newChatId: chatId,
            needsLoading,
            isAlreadyLoaded: this.loadedChatIds.has(chatId)
        });
        
        // Check if we need to load this chat
        if (needsLoading) {
            this.log('INFO', `📥 LAZY LOADING CHAT - Chat ${chatId} needs to be loaded from server`);
            
            // Show loading indicator in UI
            this.showChatLoadingIndicator();
            
            try {
                const fullChat = await this.loadFullChat(chatId);
                this.log('SUCCESS', `✅ Chat ${chatId} loaded successfully for activation`);
            } catch (error) {
                this.log('ERROR', `Failed to load chat ${chatId}:`, error);
                this.showChatLoadError();
                return;
            }
        } else {
            this.log('DEBUG', `💾 Chat ${chatId} already loaded in memory`);
        }
        
        // Set as active
        this.activeChatId = chatId;
        
        this.logActiveChatState('ACTIVE_CHAT_SWITCHED', {
            previousActiveChatId,
            newActiveChatId: chatId,
            wasLazyLoaded: needsLoading,
            totalLoadedChats: this.chats.length,
            totalMetadataChats: this.chatMetadata.length
        });
    }

    /**
     * Check if ChatManager is initialized
     */
    public getInitializationStatus(): boolean {
        return this.isInitialized;
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
        this.log('INFO', '🆕 CREATING NEW CHAT - User triggered new chat creation');
        this.logActiveChatState('BEFORE_NEW_CHAT_CREATION');
        
        try {
            const chatRequest: CreateChatRequest = {
                userID: this.config.userContext.userId,
                courseName: this.config.userContext.courseName,
                date: new Date().toISOString().split('T')[0]
            };

            this.log('DEBUG', '📤 Sending new chat request to server:', chatRequest);
            const response = await createNewChat(chatRequest);

            if (!response.success) {
                this.log('ERROR', 'Failed to create chat:', response.error);
                return {
                    success: false,
                    error: response.error || 'Unknown error occurred'
                };
            }

            // Backend now returns the complete chat object with initial message
            // Use it directly if available
            const newChat: Chat = (response as any).chat || {
                id: response.chatId || Date.now().toString(),
                courseName: this.config.userContext.courseName,
                divisionTitle: '',
                itemTitle: '',
                messages: response.initAssistantMessage ? [{
                    id: response.initAssistantMessage.id,
                    sender: response.initAssistantMessage.sender as 'bot',
                    userId: this.config.userContext.userId,
                    courseName: response.initAssistantMessage.courseName,
                    text: response.initAssistantMessage.text,
                    timestamp: response.initAssistantMessage.timestamp,
                }] : [],
                isPinned: false
            };

            this.log('SUCCESS', `📝 New chat created: ${newChat.id} (${newChat.itemTitle})`);

            // Add to chats array
            this.chats.push(newChat);
            this.activeChatId = newChat.id;
            
            // Add to metadata array for sidebar rendering
            const newMetadata: ChatMetadata = {
                id: newChat.id,
                courseName: newChat.courseName,
                itemTitle: newChat.itemTitle,
                isPinned: newChat.isPinned,
                pinnedMessageId: newChat.pinnedMessageId || null,
                messageCount: newChat.messages ? newChat.messages.length : 0,
                lastMessageTimestamp: newChat.messages && newChat.messages.length > 0 
                    ? newChat.messages[newChat.messages.length - 1].timestamp 
                    : Date.now()
            };
            this.chatMetadata.unshift(newMetadata); // Add to beginning of list
            
            // Mark as loaded since we have the full chat
            this.loadedChatIds.add(newChat.id);

            this.logActiveChatState('AFTER_NEW_CHAT_CREATION', {
                newChatId: newChat.id,
                newChatTitle: newChat.itemTitle,
                initialMessageCount: newChat.messages?.length || 0,
                metadataAdded: true,
                markedAsLoaded: true
            });

            // Notify UI update needed
            this.notifyUIUpdate();

            return {
                success: true,
                chat: newChat
            };
        } catch (error) {
            this.log('ERROR', 'Network error occurred while creating chat:', error);
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

        // console.log('[CHAT-MANAGER] 💬 Sending message...'); // 🟢 MEDIUM: Debug info - keep for monitoring

        // Add user message locally (will be replaced with server version)
        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            sender: 'user',
            userId: this.config.userContext.userId,
            courseName: this.config.userContext.courseName,
            text,
            timestamp: Date.now()
        };
        activeChat.messages.push(userMessage);

        // Create bot message placeholder for loading indicator
        const botMessageId = (Date.now() + 1).toString();
        const botMessage: ChatMessage = {
            id: botMessageId,
            sender: 'bot',
            userId: this.config.userContext.userId,
            courseName: this.config.userContext.courseName,
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
                credentials: 'same-origin', 
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: text,
                    userId: this.config.userContext.userId,
                    courseName: this.config.userContext.courseName
                }),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to send message');
            }

            // console.log('[CHAT-MANAGER] ✅ Message sent successfully'); // 🟢 MEDIUM: Success info - keep for monitoring

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
                //START DEBUG LOG : DEBUG-CODE(NON-STREAMING-ARTEFACT)
                // console.log('🎨 Processing assistant message for streaming'); // 🟢 MEDIUM: Debug info - keep for monitoring
                // console.log('🎨 Message ID:', data.assistantMessage.id); // 🟡 HIGH: Message ID exposure
                // console.log('🎨 Message text length:', data.assistantMessage.text.length); // 🟡 HIGH: Message content metadata
                // console.log('🎨 Contains artefact tags:', data.assistantMessage.text.includes('<Artefact>')); // 🟡 HIGH: Message content analysis
                //END DEBUG LOG : DEBUG-CODE(NON-STREAMING-ARTEFACT)
                
                // Add the assistant message to the array (with full text for data consistency)
                activeChat.messages.push(data.assistantMessage);
                
                // Create message element with empty content initially for streaming effect
                const messageWithEmptyText = {
                    ...data.assistantMessage,
                    text: '' // Start with empty text - will be streamed in
                };
                this.addMessageToDOM(messageWithEmptyText, activeChat);
                
                // Stream the text word-by-word to simulate ChatGPT/Claude-like effect
                await this.streamTextToDOM(
                    data.assistantMessage.text,
                    data.assistantMessage.id,
                    () => {
                        // Streaming complete - message already has full text in array
                        onComplete?.(data.assistantMessage);
                    }
                );
            }

            // Refresh chat data from server to get updated title
            await this.refreshChatDataFromServer();

        } catch (error) {
            // console.error('[CHAT-MANAGER] 🚨 Error sending message:', error);
            
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
        this.log('INFO', `🗑️ DELETING CHAT - User triggered chat deletion: ${chatId}`);
        this.logActiveChatState('BEFORE_CHAT_DELETION', { chatIdToDelete: chatId });
        
        try {
            // Delete from server first and wait for proper response
            this.log('DEBUG', `📤 Sending delete request to server for chat: ${chatId}`);
            const response = await deleteChat(chatId);
            
            // Check if server deletion was successful
            if (!response.success) {
                this.log('ERROR', `Server deletion failed for chat ${chatId}:`, response.error);
                throw new Error(response.error || 'Server deletion failed');
            }
            
            this.log('SUCCESS', `✅ Server confirmed deletion of chat: ${chatId}`);
            
            // Store previous state for logging
            const previousActiveChatId = this.activeChatId;
            const wasActiveChat = this.activeChatId === chatId;
            
            // Only remove from local arrays if server deletion was successful
            this.chats = this.chats.filter(c => c.id !== chatId);
            this.chatMetadata = this.chatMetadata.filter(m => m.id !== chatId);
            this.loadedChatIds.delete(chatId);
            
            // Update active chat if needed
            if (this.activeChatId === chatId) {
                if (this.chatMetadata.length > 0) {
                    // Try to find a pinned chat first, otherwise use first chat
                    const lastPinned = this.chatMetadata.filter(m => m.isPinned).pop();
                    this.activeChatId = lastPinned ? lastPinned.id : this.chatMetadata[0].id;
                    this.log('INFO', `🔄 Switched active chat from deleted ${chatId} to: ${this.activeChatId}`);
                } else {
                    this.activeChatId = null;
                    this.log('INFO', `📭 No remaining chats - active chat set to null`);
                }
            }
            
            this.logActiveChatState('AFTER_CHAT_DELETION', {
                deletedChatId: chatId,
                wasActiveChat: wasActiveChat,
                previousActiveChatId: previousActiveChatId,
                newActiveChatId: this.activeChatId,
                remainingChats: this.chatMetadata.length,
                remainingLoadedChats: this.chats.length
            });
            
            // Notify UI update needed
            this.notifyUIUpdate();
        } catch (error) {
            this.log('ERROR', `Failed to delete chat ${chatId}:`, error);
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
        
        // If no chat metadata, show welcome screen
        if (this.chatMetadata.length === 0) {
            // console.log('🎯 No chats available, triggering welcome screen'); // 🟢 MEDIUM: Status info - keep for monitoring
            this.callModeSpecificCallback('no-chats', { showWelcome: true });
            return;
        }
        
        // Sort by pinned status first, then by most recent message timestamp
        // This ensures chats with recent activity (like updated titles) appear at the top
        const sortedMetadata = [...this.chatMetadata].sort((a, b) => {
            // Pinned chats first
            if (a.isPinned !== b.isPinned) {
                return b.isPinned ? 1 : -1;
            }
            // Then by most recent message timestamp
            return b.lastMessageTimestamp - a.lastMessageTimestamp;
        });

        sortedMetadata.forEach(metadata => {
            const li = this.createChatListItemFromMetadata(metadata);
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
        
        // Wait for LaTeX rendering to complete before scrolling
        // LaTeX rendering is asynchronous and can change element heights
        // Delay ensures layout is stable before scrolling
        this.scrollToBottom(150);
        
        this.renderPinnedBanner(activeChat);
        renderFeatherIcons();
        
        // Update questionUnstruggle button states after rendering
        // Use setTimeout to ensure DOM is fully updated
        setTimeout(() => {
            this.updateQuestionUnstruggleButtonStates();
        }, 0);
    }

    /**
     * Render active chat with incremental updates (Optimized for new messages)
     */
    public renderActiveChatIncremental(): void {
        const activeChat = this.getActiveChat();
        const chatTitleEl = document.getElementById('chat-title');
        const messageAreaEl = document.getElementById('message-area');
        const pinBtn = document.getElementById('pin-chat-btn');
        
        if (!activeChat || !chatTitleEl || !messageAreaEl || !pinBtn) {
            // console.log('🎯 renderActiveChatIncremental: No active chat or missing DOM elements, skipping render'); // 🟢 MEDIUM: Debug info - keep for monitoring
            return;
        }

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
        
        // Wait for LaTeX rendering to complete before scrolling
        // Only delay if we added new messages (they need LaTeX rendering time)
        if (this.domMessageIds.size > 0) {
            this.scrollToBottom(150);
        } else {
            this.scrollToBottom();
        }
        
        this.renderPinnedBanner(activeChat);
        renderFeatherIcons();
        
        // Update questionUnstruggle button states after rendering
        // Use setTimeout to ensure DOM is fully updated
        setTimeout(() => {
            this.updateQuestionUnstruggleButtonStates();
        }, 0);
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
     * Update questionUnstruggle button states based on whether they're in the most recent bot message
     * Only buttons in the most recent bot message should be enabled
     */
    private updateQuestionUnstruggleButtonStates(): void {
        const activeChat = this.getActiveChat();
        if (!activeChat) return;

        // Find the most recent bot message
        const lastBotMessage = [...activeChat.messages]
            .reverse()
            .find(msg => msg.sender === 'bot');

        // Get all questionUnstruggle buttons in the DOM
        const allButtons = document.querySelectorAll('.question-unstruggle-btn') as NodeListOf<HTMLButtonElement>;
        
        allButtons.forEach(button => {
            const messageId = button.dataset.messageId;
            const topic = button.dataset.topic;
            
            if (!messageId || !topic) {
                // Missing data attributes - disable for safety
                button.disabled = true;
                button.classList.add('disabled');
                return;
            }

            // Check if this button belongs to the most recent bot message
            const isInMostRecentMessage = lastBotMessage && 
                lastBotMessage.id === messageId &&
                lastBotMessage.text.includes(`<questionUnstruggle`) &&
                lastBotMessage.text.includes(`Topic="${topic}"`);

            if (isInMostRecentMessage) {
                // Enable buttons in the most recent message
                button.disabled = false;
                button.classList.remove('disabled');
            } else {
                // Disable buttons not in the most recent message
                button.disabled = true;
                button.classList.add('disabled');
            }
        });
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

        // COMMENTED OUT: Artifact processing
        // // Process artefacts and render
        // const result = this.artefactHandler.processStreamingText(newText, messageId);
        
        // if (result.hasArtefacts) {
        //     // Use innerHTML for content with artefacts (contains button HTML)
        //     contentEl.innerHTML = result.processedText;
        //     // Render LaTeX safely without breaking HTML elements
        //     renderLatexInHtmlContent(contentEl);
        // } else {
        //     // Simple text update
        //     renderLatexInElement(newText, contentEl);
        // }
        
        // NEW: Markdown + LaTeX rendering with messageId for artifacts
        contentEl.innerHTML = this.renderChat.render(newText, messageId);
        renderLatexInHtmlContent(contentEl);
        
        renderFeatherIcons();
        this.scrollToBottom();
        
        // Update button states after message update
        setTimeout(() => {
            this.updateQuestionUnstruggleButtonStates();
        }, 0);
    }

    /**
     * Stream text word-by-word to simulate ChatGPT/Claude-like streaming effect
     * @param fullText - The complete text to stream
     * @param messageId - The ID of the message element to update
     * @param onComplete - Optional callback when streaming completes
     */
    private async streamTextToDOM(fullText: string, messageId: string, onComplete?: () => void): Promise<void> {
        const messageEl = document.getElementById(`msg-${messageId}`);
        if (!messageEl) {
            // console.warn(`[CHAT-MANAGER] Message element not found for ID: ${messageId}`);
            onComplete?.();
            return;
        }

        const contentEl = messageEl.querySelector('.message-content') as HTMLElement;
        if (!contentEl) {
            // console.warn(`[CHAT-MANAGER] Message content element not found for ID: ${messageId}`);
            onComplete?.();
            return;
        }

        // Split text into words while preserving spaces and punctuation
        // This approach splits on word boundaries but keeps punctuation attached to words
        const words: string[] = [];
        let currentWord = '';
        
        for (let i = 0; i < fullText.length; i++) {
            const char = fullText[i];
            
            // Handle whitespace characters
            if (char === ' ' || char === '\n' || char === '\t') {
                if (currentWord) {
                    words.push(currentWord);
                    currentWord = '';
                }
                words.push(char); // Preserve whitespace as separate tokens
            } else {
                // Add character to current word (including punctuation)
                currentWord += char;
            }
        }
        
        // Add any remaining word
        if (currentWord) {
            words.push(currentWord);
        }

        // Stream words one by one
        let accumulatedText = '';
        
        for (let i = 0; i < words.length; i++) {
            accumulatedText += words[i];
            
            // Update DOM with accumulated text
            // Use renderChat.render for markdown + LaTeX support
            contentEl.innerHTML = this.renderChat.render(accumulatedText, messageId);
            renderLatexInHtmlContent(contentEl);
            
            // Scroll to bottom as text streams
            this.scrollToBottom();
            
            // Wait before next word (except for the last word)
            if (i < words.length - 1) {
                await new Promise(resolve => setTimeout(resolve, this.STREAM_DELAY_MS));
            }
        }

        // Final render to ensure everything is properly formatted
        contentEl.innerHTML = this.renderChat.render(fullText, messageId);
        renderLatexInHtmlContent(contentEl);
        renderFeatherIcons();
        this.scrollToBottom();
        
        onComplete?.();
    }

    /**
     * Scroll to bottom of chat instantly (no animation)
     * Waits for LaTeX rendering to complete before scrolling to avoid layout shifts
     */
    public scrollToBottom(delay: number = 0): void {
        const scrollContainer = document.getElementById('message-area') as HTMLElement | null;
        if (!scrollContainer) return;
        
        const performScroll = () => {
            // Wait for layout to stabilize (LaTeX rendering, markdown processing)
            // Then instantly jump to bottom (no smooth animation)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // Use instant scroll (no animation) - directly set scrollTop
                    scrollContainer.scrollTop = scrollContainer.scrollHeight;
                });
            });
        };
        
        if (delay > 0) {
            setTimeout(performScroll, delay);
        } else {
            performScroll();
        }
    }

    /**
     * Open disclaimer modal using the proper modal-overlay system
     */
    public async openDisclaimerModal(): Promise<void> {
        const disclaimerContent = `
            <p><strong>Purpose:</strong> This AI is designed as a study assistant to help you understand course materials. It is not a substitute for attending lectures, completing assignments, or your own critical thinking.</p>
            <p><strong>Accuracy:</strong> While we strive for accuracy, the AI can make mistakes, misunderstand context, or generate incorrect information. Always verify critical information against your course materials and lectures.</p>
            <p><strong>Academic Integrity:</strong> You are responsible for your own work. Do not submit AI-generated responses as your own. Use this tool to learn, not to cheat.</p>
            <p><strong>Privacy:</strong> Your conversations may be reviewed for quality assurance and to improve the system. Do not share personal or sensitive information.</p>
        `;
        
        await showDisclaimerModal('AI Assistant Disclaimer', disclaimerContent);
    }


    // Artefact panel loading removed - now embedded in chat-window.html

    private async loadChatsFromServer(userId: string, courseName: string): Promise<Chat[]> {
        try {
            // console.log('[CHAT-MANAGER] 📂 Loading chats from server...'); // 🟢 MEDIUM: Debug info - keep for monitoring
            
            const response = await fetch('/api/chat/user/chats', {
                method: 'GET',
                credentials: 'same-origin', 
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            // console.log('[CHAT-MANAGER] 📡 Server response status:', response.status, response.statusText); // 🟢 MEDIUM: HTTP status - keep for monitoring

            if (!response.ok) {
                // console.error('[CHAT-MANAGER] ❌ Failed to load chats:', response.statusText);
                // console.error('[CHAT-MANAGER] 🔍 Response details:', { // 🟡 HIGH: Response details with URL
                //     status: response.status,
                //     statusText: response.statusText,
                //     url: response.url
                // });
                
                // Handle specific error cases
                if (response.status === 401) {
                    // console.error('[CHAT-MANAGER] 🔐 Authentication failed - user may need to re-login');
                } else if (response.status === 500) {
                    // console.error('[CHAT-MANAGER] 🚨 Server error - database or backend issue');
                }
                
                return [];
            }
            
            const data = await response.json();
            // console.log('[CHAT-MANAGER] 📦 Response data:', {
            //     success: data.success,
            //     chatCount: data.chats ? data.chats.length : 0,
            //     hasError: !!data.error
            // });
            
            if (data.success && data.chats) {
                // console.log(`[CHAT-MANAGER] ✅ Loaded ${data.chats.length} chats from database`);
                if (data.chats.length > 0) {
                    // console.log('[CHAT-MANAGER] 📋 Chat details:', data.chats.map((chat: any) => ({
                    //     id: chat.id,
                    //     title: chat.itemTitle,
                    //     messageCount: chat.messages ? chat.messages.length : 0
                    // })));
                }
                return data.chats;
            }
            
            if (data.error) {
                // console.error('[CHAT-MANAGER] ❌ Server error:', data.error);
            }
            
            // console.log('[CHAT-MANAGER] ⚠️ No chats found or invalid response format');
            return [];
            
        } catch (error) {
            // console.error('[CHAT-MANAGER] 🚨 Error loading chats:', error);
            
            // Handle specific error types
            if (error instanceof TypeError && error.message.includes('fetch')) {
                // console.error('[CHAT-MANAGER] 🌐 Network error - check internet connection');
            } else if (error instanceof SyntaxError) {
                // console.error('[CHAT-MANAGER] 📄 JSON parsing error - server response may be malformed');
            }
            
            return [];
        }
    }

    private async loadChatMetadataFromServer(userId: string, courseName: string): Promise<ChatMetadata[]> {
        try {
            // console.log('[CHAT-MANAGER] 📊 Loading chat metadata from server...');
            // console.log('[CHAT-MANAGER] 📊 Request context:', {
            //     userId,
            //     courseName,
            //     endpoint: '/api/chat/user/chats/metadata'
            // });
            
            const response = await fetch('/api/chat/user/chats/metadata', {
                method: 'GET',
                credentials: 'same-origin', 
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            // console.log('[CHAT-MANAGER] 📡 Server response status:', response.status, response.statusText);
            
            if (!response.ok) {
                // console.error('[CHAT-MANAGER] ❌ Failed to load chat metadata:', response.statusText);
                // console.error('[CHAT-MANAGER] 🔍 Response details:', {
                //     status: response.status,
                //     statusText: response.statusText,
                //     url: response.url
                // });
                return [];
            }
            
            const data = await response.json();
            // console.log('[CHAT-MANAGER] 📊 Raw response data:', data);
            
            if (data.success && Array.isArray(data.chats)) {
                // console.log(`[CHAT-MANAGER] ✅ Loaded ${data.chats.length} chat metadata from database`);
                if (data.chats.length > 0) {
                    // console.log('[CHAT-MANAGER] 📋 Chat metadata details:', data.chats.map((metadata: any) => ({
                    //     id: metadata.id,
                    //     title: metadata.itemTitle,
                    //     messageCount: metadata.messageCount,
                    //     lastMessageTimestamp: metadata.lastMessageTimestamp
                    // })));
                }
                return data.chats;
            }
            
            if (data.error) {
                // console.error('[CHAT-MANAGER] ❌ Server error:', data.error);
            }
            
            // console.log('[CHAT-MANAGER] ⚠️ No chat metadata found or invalid response format');
            return [];
            
        } catch (error) {
            // console.error('[CHAT-MANAGER] 🚨 Error loading chat metadata:', error);
            
            // Handle specific error types
            if (error instanceof TypeError && error.message.includes('fetch')) {
                // console.error('[CHAT-MANAGER] 🌐 Network error - check internet connection');
            } else if (error instanceof SyntaxError) {
                // console.error('[CHAT-MANAGER] 📄 JSON parsing error - server response may be malformed');
            }
            
            return [];
        }
    }

    /**
     * Load full chat from server using restoration endpoint
     * @param chatId - The chat ID to load
     * @returns Promise<Chat> - The full chat object with messages
     */
    private async loadFullChat(chatId: string): Promise<Chat> {
        this.log('DEBUG', `🔍 Checking if chat ${chatId} is already loaded...`);
        
        // Check if chat already loaded
        if (this.loadedChatIds.has(chatId)) {
            const existingChat = this.chats.find(chat => chat.id === chatId);
            if (existingChat) {
                this.log('DEBUG', `💾 Chat ${chatId} already loaded in memory, returning cached version`);
                return existingChat;
            }
        }

        this.log('INFO', `📥 Loading full chat ${chatId} from server via restoration endpoint`);
        
        try {
            const response = await fetch(`/api/chat/restore/${chatId}`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            this.log('DEBUG', `📡 Restoration response status: ${response.status}`);
            
            if (!response.ok) {
                this.log('ERROR', `HTTP error ${response.status} when restoring chat ${chatId}: ${response.statusText}`);
                throw new Error(`Failed to restore chat: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.log('DEBUG', `📊 Restoration response received for chat ${chatId}`);
            
            if (data.success && data.chat) {
                const fullChat = data.chat;
                
                this.log('SUCCESS', `📝 Chat ${chatId} restored successfully with ${fullChat.messages?.length || 0} messages`);
                
                // Add to chats array if not already present
                const existingIndex = this.chats.findIndex(chat => chat.id === chatId);
                if (existingIndex >= 0) {
                    this.chats[existingIndex] = fullChat;
                    this.log('DEBUG', `🔄 Updated existing chat ${chatId} in memory`);
                } else {
                    this.chats.push(fullChat);
                    this.log('DEBUG', `➕ Added chat ${chatId} to memory`);
                }
                
                // Mark as loaded
                this.loadedChatIds.add(chatId);
                
                this.log('DEBUG', `📊 Memory state after loading:`, {
                    totalLoadedChats: this.chats.length,
                    loadedChatIds: Array.from(this.loadedChatIds),
                    newChatMessageCount: fullChat.messages?.length || 0
                });
                
                return fullChat;
            } else {
                this.log('ERROR', `Server returned error for chat ${chatId}:`, data.error);
                throw new Error(data.error || 'Failed to restore chat');
            }
            
        } catch (error) {
            // console.error(`[CHAT-MANAGER] 🚨 Error loading full chat ${chatId}:`, error);
            throw error;
        }
    }

    /**
     * Show loading indicator while chat is being loaded
     */
    private showChatLoadingIndicator(): void {
        const messageAreaEl = document.getElementById('message-area');
        if (messageAreaEl) {
            messageAreaEl.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #525252;">
                    <div class="spinner" style="
                        width: 40px;
                        height: 40px;
                        border: 4px solid #f3f3f3;
                        border-top: 4px solid #007bff;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 1rem;
                    "></div>
                    <p>Loading conversation...</p>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                </div>
            `;
        }
    }

    /**
     * Show error message when chat loading fails
     */
    private showChatLoadError(): void {
        const messageAreaEl = document.getElementById('message-area');
        if (messageAreaEl) {
            messageAreaEl.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #dc3545;">
                    <p>⚠️ Failed to load conversation</p>
                    <button onclick="window.location.reload()" style="
                        background: #007bff;
                        color: white;
                        border: none;
                        padding: 0.5rem 1rem;
                        border-radius: 0.375rem;
                        cursor: pointer;
                        margin-top: 1rem;
                    ">Retry</button>
                </div>
            `;
        }
    }

    /**
     * Refresh chat data from server to get updated titles and other changes
     * This is called after sending a message to ensure the frontend has the latest data
     */
    private async refreshChatDataFromServer(): Promise<void> {
        try {
            //START DEBUG LOG : DEBUG-CODE(REFRESH-CHAT-DATA)
            // console.log('[CHAT-MANAGER] 🔄 Refreshing chat data from server...');
            //END DEBUG LOG : DEBUG-CODE(REFRESH-CHAT-DATA)
            
            const courseName = this.config.userContext.courseName;
            const userId = this.config.userContext.userId;
            
            // Load fresh chat data from server
            const freshChats = await this.loadChatsFromServer(userId, courseName);
            
            // Store the current active chat ID before updating
            const currentActiveChatId = this.activeChatId;
            
            // Update the local chats array
            this.chats = freshChats;
            
            // Sync metadata array from refreshed chats to ensure sidebar shows updated titles
            this.chatMetadata = freshChats.map((chat: Chat) => ({
                id: chat.id,
                courseName: chat.courseName,
                itemTitle: chat.itemTitle,
                isPinned: chat.isPinned,
                pinnedMessageId: chat.pinnedMessageId || null,
                messageCount: chat.messages ? chat.messages.length : 0,
                lastMessageTimestamp: chat.messages && chat.messages.length > 0 
                    ? chat.messages[chat.messages.length - 1].timestamp 
                    : Date.now()
            }));
            
            // Restore the active chat ID
            this.activeChatId = currentActiveChatId;
            
            // Update the UI to reflect any changes (like updated titles)
            this.renderChatList();
            this.renderActiveChatIncremental();
            
            //START DEBUG LOG : DEBUG-CODE(REFRESH-CHAT-DATA-SUCCESS)
            // console.log('[CHAT-MANAGER] ✅ Chat data refreshed successfully');
            // console.log(`[CHAT-MANAGER] 📊 Refreshed ${freshChats.length} chats`);
            //END DEBUG LOG : DEBUG-CODE(REFRESH-CHAT-DATA-SUCCESS)
            
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(REFRESH-CHAT-DATA-ERROR)
            // console.error('[CHAT-MANAGER] 🚨 Error refreshing chat data:', error);
            //END DEBUG LOG : DEBUG-CODE(REFRESH-CHAT-DATA-ERROR)
            // Don't throw error - refresh failure shouldn't break the chat flow
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

        chatListEl?.addEventListener('click', async (e) => {
            const target = e.target as HTMLElement;
            const li = target.closest('.chat-item') as HTMLLIElement | null;
            if (li && !((target as HTMLElement).closest('button'))) {
                const chatId = li.dataset.chatId || null;
                if (chatId) {
                    // This now triggers lazy loading if needed
                    await this.setActiveChatId(chatId);
                    
                    // Reset DOM tracking when switching chats
                    this.domMessageIds.clear();
                    this.lastRenderedMessageCount = 0;
                    
                    this.renderChatList();
                    this.renderActiveChat(); // Will render the now-loaded chat
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
        // console.log('🔗 Binding message events - Delete button found:', !!deleteBtn);

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
        //START DEBUG LOG : DEBUG-CODE(STAR-001)
        // console.log('[CHAT] 🔍 Attaching pin button event listener', { pinBtn: pinBtn?.id, exists: !!pinBtn });
        //END DEBUG LOG : DEBUG-CODE(STAR-001)

        pinBtn?.addEventListener('click', () => {
            //START DEBUG LOG : DEBUG-CODE(STAR-001)
            // console.log('[CHAT] ⭐ Pin button clicked - calling handleTogglePin');
            //END DEBUG LOG : DEBUG-CODE(STAR-001)
            this.handleTogglePin();
        });
        deleteBtn?.addEventListener('click', () => {
            // console.log('🗑️ Delete button clicked in chat header');
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
        
        // Use event delegation to handle questionUnstruggle button clicks
        document.addEventListener('click', async (e) => {
            const target = e.target as HTMLElement;
            const unstruggleBtn = target.closest('.question-unstruggle-btn') as HTMLButtonElement | null;
            
            if (unstruggleBtn) {
                // Check if button is disabled - if so, ignore the click
                if (unstruggleBtn.disabled || unstruggleBtn.classList.contains('disabled')) {
                    // console.log('⚠️ Unstruggle button is disabled. Ignoring click.');
                    return;
                }
                
                e.preventDefault();
                e.stopPropagation();
                
                const topic = unstruggleBtn.dataset.topic;
                const response = unstruggleBtn.dataset.response; // "True" or "False"
                const messageId = unstruggleBtn.dataset.messageId;
                
                if (!topic || !response || !messageId) {
                    // console.error('❌ Missing data attributes on unstruggle button');
                    return;
                }
                
                // Check if previous bot message has the same topic
                const activeChat = this.chats.find(c => c.id === this.activeChatId);
                if (!activeChat) {
                    // console.error('❌ No active chat found');
                    return;
                }
                
                // Find the last bot message
                const lastBotMessage = [...activeChat.messages]
                    .reverse()
                    .find(msg => msg.sender === 'bot');
                
                if (!lastBotMessage || !lastBotMessage.text.includes(`<questionUnstruggle`) || !lastBotMessage.text.includes(`Topic="${topic}"`)) {
                    // Previous message doesn't match - treat as regular message (ignore)
                    // console.log('⚠️ Unstruggle button clicked but previous message doesn\'t match. Ignoring.');
                    return;
                }
                
                // Disable buttons to prevent multiple clicks
                const container = unstruggleBtn.closest('.question-unstruggle-container') as HTMLElement;
                if (container) {
                    const buttons = container.querySelectorAll('.question-unstruggle-btn');
                    buttons.forEach(btn => {
                        (btn as HTMLButtonElement).disabled = true;
                        btn.classList.add('disabled');
                    });
                }
                
                // Format natural language message to send to backend
                // Yes: "yes, I am confident with [topic]"
                // No: "I might need some practice with [topic]"
                const isConfident = response === 'True';
                const formattedMessage = isConfident 
                    ? `yes, I am confident with "${topic}"`
                    : `I might need some practice with "${topic}"`;
                
                // Send message to backend
                try {
                    await this.sendMessage(
                        formattedMessage,
                        undefined, // No streaming callback
                        undefined, // No completion callback
                        (error) => {
                            // console.error('❌ Error sending unstruggle response:', error);
                            // Re-enable buttons on error
                            if (container) {
                                const buttons = container.querySelectorAll('.question-unstruggle-btn');
                                buttons.forEach(btn => {
                                    (btn as HTMLButtonElement).disabled = false;
                                    btn.classList.remove('disabled');
                                });
                            }
                        }
                    );
                } catch (error) {
                    // console.error('❌ Error sending unstruggle response:', error);
                    // Re-enable buttons on error
                    if (container) {
                        const buttons = container.querySelectorAll('.question-unstruggle-btn');
                        buttons.forEach(btn => {
                            (btn as HTMLButtonElement).disabled = false;
                            btn.classList.remove('disabled');
                        });
                    }
                }
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
                        // COMMENTED OUT: Artifact processing
                        // if (hasArtefacts) {
                        //     // Use innerHTML for content with artefacts (contains button HTML)
                        //     (botContentElement as HTMLElement).innerHTML = content;
                        //     // Render LaTeX safely without breaking HTML elements
                        //     renderLatexInHtmlContent(botContentElement as HTMLElement);
                        // } else {
                        //     // Use text rendering for normal content
                        //     renderLatexInElement(content, botContentElement as HTMLElement);
                        // }
                        
                        // NEW: Markdown + LaTeX rendering with messageId for artifacts
                        (botContentElement as HTMLElement).innerHTML = this.renderChat.render(content, botMessage.id);
                        renderLatexInHtmlContent(botContentElement as HTMLElement);
                        
                        this.scrollToBottom();
                        
                        // Update button states after each chunk (in case buttons appear)
                        setTimeout(() => {
                            this.updateQuestionUnstruggleButtonStates();
                        }, 0);
                    }
                }
                // Re-render icons after each chunk update
                renderFeatherIcons();
            },
            (message: ChatMessage) => {
                const botMessageElement = document.getElementById(`msg-${message.id}`);
                const botContentElement = botMessageElement?.querySelector('.message-content');
                if (botContentElement) {
                    // COMMENTED OUT: Artifact processing
                    // // Check if the final message has artefacts
                    // const result = this.artefactHandler.processStreamingText(message.text, message.id);
                    
                    // if (result.hasArtefacts) {
                    //     // Use innerHTML for content with artefacts
                    //     (botContentElement as HTMLElement).innerHTML = result.processedText;
                    //     // Render LaTeX safely without breaking HTML elements
                    //     renderLatexInHtmlContent(botContentElement as HTMLElement);
                    // } else {
                    //     // Use text rendering for normal content
                    //     renderLatexInElement(message.text, botContentElement as HTMLElement);
                    // }
                    
                    // NEW: Markdown + LaTeX rendering with messageId for artifacts
                    (botContentElement as HTMLElement).innerHTML = this.renderChat.render(message.text, message.id);
                    renderLatexInHtmlContent(botContentElement as HTMLElement);
                    
                    this.scrollToBottom();
                    
                    // Update button states after message completion
                    setTimeout(() => {
                        this.updateQuestionUnstruggleButtonStates();
                    }, 0);
                }
                // Re-render icons after message completion
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
        //START DEBUG LOG : DEBUG-CODE(STAR-001)
        // console.log('[CHAT] 🎯 handleTogglePin called');
        //END DEBUG LOG : DEBUG-CODE(STAR-001)

        const activeChatId = this.getActiveChatId();

        //START DEBUG LOG : DEBUG-CODE(STAR-001)
        // console.log('[CHAT] 📋 Active chat ID:', activeChatId);
        //END DEBUG LOG : DEBUG-CODE(STAR-001)

        if (!activeChatId) {
            //START DEBUG LOG : DEBUG-CODE(STAR-001)
            // console.log('[CHAT] ⚠️ No active chat ID, returning early');
            //END DEBUG LOG : DEBUG-CODE(STAR-001)
            return;
        }

        //START DEBUG LOG : DEBUG-CODE(STAR-001)
        // console.log('[CHAT] 🔄 Calling togglePin with ID:', activeChatId);
        //END DEBUG LOG : DEBUG-CODE(STAR-001)

        this.togglePin(activeChatId);
        this.renderActiveChatIncremental(); // Use incremental updates for pin toggle
        this.renderChatList();
    }

    private async handleDeleteActiveChat(): Promise<void> {
        // console.log('🗑️ handleDeleteActiveChat called');
        const activeChatId = this.getActiveChatId();
        // console.log('🗑️ Active chat ID:', activeChatId);
        
        if (!activeChatId) {
            // console.log('🗑️ No active chat to delete');
            return;
        }
        
        // Get the active chat object to display its title/name
        const chat = this.chats.find(c => c.id === activeChatId);
        const result = await showDeleteConfirmationModal(
            'Chat',
            chat?.itemTitle || 'this chat'
        );
        
        if (result.action === 'delete') {
            try {
                // console.log('🗑️ Attempting to delete chat:', activeChatId);
                await this.deleteChat(activeChatId);
                // console.log('🗑️ Chat deleted successfully');
                
                // Check if we still have an active chat after deletion
                const currentActiveChat = this.getActiveChat();
                if (currentActiveChat) {
                    // We have a new active chat, render it
                    this.renderActiveChatIncremental();
                } else {
                    // No active chat, render the welcome screen or empty state
                    // console.log('🗑️ No active chat after deletion, updating UI');
                    this.renderChatList(); // This will handle showing welcome screen if no chats
                }
                
                // Always render the chat list to update the sidebar
                this.renderChatList();
                
            } catch (error) {
                // console.error('Failed to delete active chat:', error);
                // Use modal instead of alert to avoid potential conflicts
                await showSimpleErrorModal('Failed to delete chat. Please try again.', 'Delete Error');
                return; // Don't update UI if deletion failed
            }
        } else {
            // console.log('🗑️ Chat deletion cancelled by user');
        }
        
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
        titleSpan.className = 'chat-title'; // Apply existing CSS class with ellipsis styling
        titleSpan.textContent = chat.itemTitle;

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
            
            // Show confirmation modal
            const result = await showDeleteConfirmationModal(
                'Chat',
                chat.itemTitle || 'this chat'
            );
            
            if (result.action === 'delete') {
                try {
                    await this.deleteChat(chat.id);
                    this.renderChatList();
                    
                    // Notify instructor mode that a chat was deleted from the list
                    this.callModeSpecificCallback('chat-deleted', { 
                        remainingChats: this.chats.length,
                        hasChats: this.chats.length > 0 
                    });
                } catch (error) {
                    // console.error('Failed to delete chat:', error);
                    // Show user-friendly error message
                    await showSimpleErrorModal('Failed to delete chat. Please try again.', 'Delete Error');
                }
            } else {
                // console.log('🗑️ Chat deletion cancelled by user');
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

    private createChatListItemFromMetadata(metadata: ChatMetadata): HTMLLIElement {
        const li = document.createElement('li');
        li.className = `chat-item ${metadata.id === this.activeChatId ? 'active' : ''}`;
        li.dataset.chatId = metadata.id.toString();

        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'chat-title';
        titleSpan.textContent = metadata.itemTitle;

        // Add loading indicator if chat is not fully loaded
        const isLoaded = this.loadedChatIds.has(metadata.id);
        if (!isLoaded && metadata.id === this.activeChatId) {
            titleSpan.innerHTML = `${metadata.itemTitle} <span style="color: #525252; font-size: 0.8em;">(loading...)</span>`;
        }

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
            
            // Show confirmation modal
            const result = await showDeleteConfirmationModal(
                'Chat',
                metadata.itemTitle || 'this chat'
            );
            
            if (result.action === 'delete') {
                try {
                    await this.deleteChat(metadata.id);
                    this.renderChatList();
                    
                    // Notify instructor mode that a chat was deleted from the list
                    this.callModeSpecificCallback('chat-deleted', { 
                        remainingChats: this.chatMetadata.length,
                        hasChats: this.chatMetadata.length > 0 
                    });
                } catch (error) {
                    // console.error('Failed to delete chat:', error);
                    // Show user-friendly error message
                    await showSimpleErrorModal('Failed to delete chat. Please try again.', 'Delete Error');
                }
            } else {
                // console.log('🗑️ Chat deletion cancelled by user');
            }
        });

        actions.appendChild(deleteBtn);

        const rightSide = document.createElement('div');
        rightSide.style.display = 'flex';
        rightSide.style.alignItems = 'center';
        rightSide.style.gap = '6px';

        if (metadata.isPinned) {
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
                this.togglePin(metadata.id);
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
                this.togglePin(metadata.id);
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

        li.addEventListener('click', async () => {
            try {
                // Wait for chat to be fully loaded
                await this.setActiveChatId(metadata.id);
                
                // Update UI AFTER loading
                this.renderChatList();
                this.renderActiveChat();
                
                // Now notify the mode that chat is ready to display
                this.callModeSpecificCallback('chat-clicked', { 
                    chatId: metadata.id,
                    loaded: true 
                });
            } catch (error) {
                // console.error('[CHAT-MANAGER] Failed to load chat:', error);
                this.callModeSpecificCallback('chat-load-failed', { 
                    chatId: metadata.id,
                    error: error 
                });
            }
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
            // COMMENTED OUT: Artifact processing to show plain LLM responses
            // //START DEBUG LOG : DEBUG-CODE(ARTEFACT-DEBUG)
            // console.log('🎨 Processing bot message for artefacts:', messageId);
            // console.log('🎨 Message text length:', text.length);
            // console.log('🎨 Contains <Artefact> tag:', text.includes('<Artefact>'));
            // console.log('🎨 Contains </Artefact> tag:', text.includes('</Artefact>'));
            // //END DEBUG LOG : DEBUG-CODE(ARTEFACT-DEBUG)
            
            // const parsed = this.artefactHandler.parseArtefacts(text, messageId);
            
            // //START DEBUG LOG : DEBUG-CODE(022)
            // console.log('🎨 createMessageElement - Parsed artefacts:', parsed);
            // console.log('🎨 Has artefacts:', parsed.hasArtefacts);
            // console.log('🎨 Elements count:', parsed.elements.length);
            // //END DEBUG LOG : DEBUG-CODE(022)
            
            // if (parsed.hasArtefacts) {
            //     // Add all elements (text + buttons) directly to content
            //     parsed.elements.forEach(element => {
            //         contentEl.appendChild(element);
            //     });
                
            //     // Render LaTeX safely in the content that may contain HTML
            //     renderLatexInHtmlContent(contentEl);
                
            //     // Re-render icons for any buttons that were added
            //     renderFeatherIcons();
            // } else {
            //     // No artefacts, render normally
            //     renderLatexInElement(text, contentEl);
            // }
            
            // NEW: Direct markdown + LaTeX rendering with messageId for artifacts
            contentEl.innerHTML = this.renderChat.render(text, messageId);
            renderLatexInHtmlContent(contentEl);
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

    /**
     * Open flag dialog modal
     * Displays the flagged message and a form to report issues
     */
    private async openFlagDialog(messageId: string): Promise<void> {
        const activeChat = this.getActiveChat();
        if (!activeChat) return;

        // Find the message being flagged
        const message = activeChat.messages.find(m => m.id === messageId);
        if (!message || message.sender !== 'bot') {
            // console.error('Message not found or not a bot message');
            return;
        }

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay flag-modal-overlay';
        document.body.appendChild(overlay);

        // Create modal structure
        const modal = document.createElement('div');
        modal.className = 'flag-modal';
        
        // Modal Header
        const header = document.createElement('div');
        header.className = 'flag-modal-header';
        
        const title = document.createElement('h2');
        title.textContent = 'Flag Message';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-modal icon-btn';
        closeBtn.setAttribute('aria-label', 'Close');
        const closeIcon = document.createElement('i');
        closeIcon.setAttribute('data-feather', 'x');
        closeBtn.appendChild(closeIcon);
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        // Modal Content - Message Display
        const content = document.createElement('div');
        content.className = 'flag-modal-content';
        
        const messageContainer = document.createElement('div');
        messageContainer.className = 'flagged-message-container';
        
        const messageLabel = document.createElement('p');
        messageLabel.className = 'flagged-message-label';
        messageLabel.textContent = 'Flagged Message:';
        
        const messageDisplay = document.createElement('div');
        messageDisplay.className = 'flagged-message-display';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'flagged-message-content';
        
        // Render message with LaTeX
        renderLatexInElement(message.text, messageContent);
        
        const messageTimestamp = document.createElement('div');
        messageTimestamp.className = 'flagged-message-timestamp';
        messageTimestamp.textContent = this.formatFullTimestamp(message.timestamp);
        
        messageDisplay.appendChild(messageContent);
        messageDisplay.appendChild(messageTimestamp);
        messageContainer.appendChild(messageLabel);
        messageContainer.appendChild(messageDisplay);
        
        // Flag Form
        const form = document.createElement('form');
        form.className = 'flag-form';
        form.id = 'flag-form';
        
        const formLabel = document.createElement('p');
        formLabel.className = 'flag-form-label';
        formLabel.textContent = 'Select reason for flagging (choose one):';
        
        const flagOptions = [
            { value: 'innacurate_response', label: 'Wrong calculations, formulas, or engineering principles' },
            { value: 'harassment', label: 'Contains harassment, or content that violates EDI principles' },
            { value: 'inappropriate', label: 'Response veers into personal opinions, political views, or non-academic discussions' },
            { value: 'dishonesty', label: 'Provides content that appears copied from sources without attribution' },
            { value: 'interface bug', label: 'Interface bugs or usability issues' },
            { value: 'other', label: 'Others (please specify below)' }
        ];
        
        const radioGroup = document.createElement('div');
        radioGroup.className = 'flag-radio-group';
        
        flagOptions.forEach((option, index) => {
            const radioWrapper = document.createElement('div');
            radioWrapper.className = 'flag-radio-item';
            
            const radioInput = document.createElement('input');
            radioInput.type = 'radio';
            radioInput.name = 'flagReason';
            radioInput.value = option.value;
            radioInput.id = `flag-reason-${index}`;
            if (index === 0) radioInput.checked = true; // Default to first option
            
            const radioLabel = document.createElement('label');
            radioLabel.htmlFor = `flag-reason-${index}`;
            radioLabel.textContent = option.label;
            
            radioWrapper.appendChild(radioInput);
            radioWrapper.appendChild(radioLabel);
            radioGroup.appendChild(radioWrapper);
            
            // Make the entire card clickable - clicking anywhere on the card selects the radio
            radioWrapper.addEventListener('click', (e) => {
                // Get the actual element that was clicked (handle text nodes)
                let clickedElement: HTMLElement | null = null;
                
                if (e.target instanceof HTMLElement) {
                    clickedElement = e.target;
                } else if (e.target instanceof Node && e.target.nodeType === Node.TEXT_NODE) {
                    clickedElement = e.target.parentElement;
                } else {
                    clickedElement = e.target as HTMLElement | null;
                }
                
                if (!clickedElement) return;
                
                // If clicking directly on the radio input, let native behavior handle it
                if (clickedElement === radioInput || clickedElement.tagName === 'INPUT') {
                    return;
                }
                
                // If clicking on or inside the label, let label's 'for' attribute handle it
                // Labels automatically trigger their associated input via 'for' attribute
                const labelElement = clickedElement.closest('label');
                if (labelElement === radioLabel || clickedElement === radioLabel || clickedElement.tagName === 'LABEL') {
                    return; // Label will automatically select the radio via 'for' attribute
                }
                
                // For any other click (wrapper div, margin area, padding), select the radio
                // This makes clicking anywhere on the card select the radio option
                radioInput.checked = true;
                radioInput.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            // Show/hide "Other" text input based on selection
            if (option.value === 'other') {
                radioInput.addEventListener('change', () => {
                    otherInput.style.display = 'block';
                    otherInput.focus();
                });
            } else {
                radioInput.addEventListener('change', () => {
                    otherInput.style.display = 'none';
                });
            }
        });
        
        // "Other" text input (hidden by default)
        const otherInput = document.createElement('textarea');
        otherInput.className = 'flag-other-input';
        otherInput.id = 'flag-other-input';
        otherInput.placeholder = 'Please provide additional details...';
        otherInput.style.display = 'none';
        otherInput.rows = 3;
        
        form.appendChild(formLabel);
        form.appendChild(radioGroup);
        form.appendChild(otherInput);
        
        content.appendChild(messageContainer);
        content.appendChild(form);
        
        // Modal Footer
        const footer = document.createElement('div');
        footer.className = 'flag-modal-footer';
        
        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'flag-submit-btn';
        submitBtn.textContent = 'Submit Flag';
        
        const statusMessage = document.createElement('div');
        statusMessage.className = 'flag-status-message';
        statusMessage.style.display = 'none';
        
        footer.appendChild(statusMessage);
        footer.appendChild(submitBtn);
        
        // Assemble modal
        modal.appendChild(header);
        modal.appendChild(content);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        
        // Show modal with animation
        requestAnimationFrame(() => {
            overlay.classList.add('show');
            document.body.classList.add('modal-open');
        });
        
        // Render feather icons
        renderFeatherIcons();
        
        // Close modal function
        const closeModal = () => {
            document.body.classList.remove('modal-open');
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
        };
        
        // Event Listeners
        closeBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
        
        // ESC key handler
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeModal();
                window.removeEventListener('keydown', handleEscape);
            }
        };
        window.addEventListener('keydown', handleEscape);
        
        // Submit handler
        submitBtn.addEventListener('click', async () => {
            // Get selected flag reason
            const selectedReason = form.querySelector('input[name="flagReason"]:checked') as HTMLInputElement;
            if (!selectedReason) {
                this.showFlagStatus(statusMessage, 'Please select a reason for flagging', 'error');
                return;
            }
            
            const flagType = selectedReason.value;
            const otherDetails = otherInput.value.trim();
            
            // Validate "Other" option
            if (flagType === 'other' && !otherDetails) {
                this.showFlagStatus(statusMessage, 'Please provide details for "Other" reason', 'error');
                otherInput.focus();
                return;
            }
            
            // Show loading state
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';
            submitBtn.classList.add('loading');
            
            try {
                // Get the label text for the selected reason
                let reportTypeText: string;
                if (flagType === 'other') {
                    reportTypeText = otherDetails;
                } else {
                    // Find the label associated with the selected radio button
                    const labelElement = document.querySelector(`label[for="${selectedReason.id}"]`) as HTMLLabelElement;
                    reportTypeText = labelElement?.textContent?.trim() || 'Unknown reason';
                }
                
                // Real API call to backend
                const requestBody = {
                    flagType: flagType as 'innacurate_response' | 'harassment' | 'inappropriate' | 'dishonesty' | 'interface bug' | 'other',
                    reportType: reportTypeText,
                    chatContent: message.text,
                    userId: this.config.userContext.userId
                };

                // console.log('🏴 Submitting flag to API:', requestBody);

                const response = await fetch(`/api/courses/${this.config.userContext.courseId}/flags`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody)
                });

                const apiResponse = await response.json();
                // console.log('🏴 Flag API response:', apiResponse);
                
                if (!response.ok) {
                    throw new Error(apiResponse.error || `HTTP ${response.status}: ${response.statusText}`);
                }
                
                if (apiResponse.success) {
                    // Show success message
                    this.showFlagStatus(statusMessage, 'Flag submitted successfully! Thank you for your feedback.', 'success');
                    submitBtn.style.display = 'none';
                    
                    // Auto-close after 2 seconds
                    setTimeout(() => {
                        closeModal();
                        window.removeEventListener('keydown', handleEscape);
                    }, 2000);
                } else {
                    throw new Error('Failed to submit flag');
                }
                
            } catch (error) {
                // console.error('Error submitting flag:', error);
                this.showFlagStatus(
                    statusMessage, 
                    'Failed to submit flag. Please try again.', 
                    'error'
                );
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Flag';
                submitBtn.classList.remove('loading');
            }
        });
        
        // Focus on first radio button
        const firstRadio = radioGroup.querySelector('input[type="radio"]') as HTMLInputElement;
        firstRadio?.focus();
    }
    
    /**
     * Show status message in flag modal
     */
    private showFlagStatus(statusElement: HTMLElement, message: string, type: 'success' | 'error'): void {
        statusElement.textContent = message;
        statusElement.className = `flag-status-message ${type}`;
        statusElement.style.display = 'block';
        
        // Auto-hide error messages after 5 seconds
        if (type === 'error') {
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 5000);
        }
    }




}


