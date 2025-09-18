// public/scripts/feature/chat.ts

/**
 * Unified Chat Manager - Handles all chat functionality for both instructor and student modes
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { loadComponentHTML, renderFeatherIcons } from "../functions/api.js";
import { createNewChat, sendMessageToChat, deleteChat, updateChatPinStatus, CreateChatRequest } from "../functions/chat-api.js";
import { Chat, ChatMessage, Student, activeCourse } from "../../../src/functions/types.js";
import { ArtefactHandler, ArtefactData, getArtefactHandler } from "./artefact.js";

/**
 * LaTeX Rendering Utility Functions
 */
export function renderLatexInElement(text: string, element: HTMLElement): void {
    element.textContent = text;
    
    if (typeof (window as any).renderMathInElement !== 'undefined') {
        (window as any).renderMathInElement(element, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ],
            throwOnError: false,
            errorColor: '#cc0000',
            strict: false
        });
    }
}

export function renderLatexInMessage(messageElement: HTMLElement): void {
    const contentEl = messageElement.querySelector('.message-content') as HTMLElement;
    if (contentEl && typeof (window as any).renderMathInElement !== 'undefined') {
        (window as any).renderMathInElement(contentEl, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ],
            throwOnError: false,
            errorColor: '#cc0000',
            strict: false
        });
    }
}

/**
 * Chat Manager Configuration
 */
export interface ChatManagerConfig {
    isInstructor: boolean;
    userContext: Student | activeCourse;
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
                : (this.config.userContext as Student).courseAttended;
            
            const userId = this.config.isInstructor ? 'instructor' : 'student';
            this.chats = await this.loadChatsFromServer(userId, courseName);
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
            const chatRequest: CreateChatRequest = {
                userID: this.config.isInstructor ? 'instructor' : 'student',
                courseName: this.config.isInstructor 
                    ? (this.config.userContext as activeCourse).courseName 
                    : (this.config.userContext as Student).courseAttended,
                date: new Date().toISOString().split('T')[0]
            };

            const response = await createNewChat(chatRequest);

            if (!response.success) {
                return {
                    success: false,
                    error: response.error || 'Unknown error occurred'
                };
            }

            const newChat: Chat = {
                id: response.chatId || Date.now().toString(),
                courseName: this.config.isInstructor 
                    ? (this.config.userContext as activeCourse).courseName 
                    : (this.config.userContext as Student).courseAttended,
                divisionTitle: 'General',
                itemTitle: 'Chat',
                messages: [],
                isPinned: false
            };

            if (response.initAssistantMessage) {
                const defaultMessage: ChatMessage = {
                    id: response.initAssistantMessage.id,
                    sender: response.initAssistantMessage.sender as 'bot',
                    userId: this.config.isInstructor ? 0 : (this.config.userContext as Student).userId,
                    courseName: response.initAssistantMessage.courseName,
                    text: response.initAssistantMessage.text,
                    timestamp: response.initAssistantMessage.timestamp,
                } as ChatMessage & { artefact?: any };
                newChat.messages.push(defaultMessage);
            }

            this.chats.push(newChat);
            this.activeChatId = newChat.id;

            // Notify UI update needed
            this.notifyUIUpdate();

            return {
                success: true,
                chat: newChat
            };
        } catch (error) {
            console.error('Error creating new chat:', error);
            return {
                success: false,
                error: 'Network error occurred while creating chat'
            };
        }
    }

    /**
     * Send a message with streaming
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

        // Add user message
        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            sender: 'user',
            userId: this.config.isInstructor ? 0 : (this.config.userContext as Student).userId,
            courseName: this.config.isInstructor 
                ? (this.config.userContext as activeCourse).courseName 
                : (this.config.userContext as Student).courseAttended,
            text,
            timestamp: Date.now()
        };
        activeChat.messages.push(userMessage);

        // Create bot message placeholder
        const botMessageId = (Date.now() + 1).toString();
        const botMessage: ChatMessage = {
            id: botMessageId,
            sender: 'bot',
            userId: this.config.isInstructor ? 0 : (this.config.userContext as Student).userId,
            courseName: this.config.isInstructor 
                ? (this.config.userContext as activeCourse).courseName 
                : (this.config.userContext as Student).courseAttended,
            text: '...',
            timestamp: Date.now(),
        } as ChatMessage & { artefact?: any };
        activeChat.messages.push(botMessage);

        try {
            const response = await fetch(`/api/chat/${this.activeChatId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: text,
                    userId: this.config.isInstructor ? 'instructor' : 'student',
                    courseName: this.config.isInstructor 
                        ? (this.config.userContext as activeCourse).courseName 
                        : (this.config.userContext as Student).courseAttended
                }),
            });

            if (!response.ok || !response.body) {
                throw new Error('Network response was not ok.');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = '';

            const processStream = async () => {
                try {
                    const { done, value } = await reader.read();
                    
                    if (done) {
                        console.log('Stream complete');
                        botMessage.text = accumulatedContent;
                        onComplete?.(botMessage);
                        return;
                    }

                    const chunk = decoder.decode(value, { stream: true });
                    chunk.split('\n').forEach(line => {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                
                                if (data.type === 'chunk' && data.content) {
                                    accumulatedContent += data.content;
                                    
                                    // Process artefacts in streaming content
                                    try {
                                        const result = this.artefactHandler.processStreamingText(
                                            accumulatedContent,
                                            botMessageId
                                        );
                                        
                                        // Pass both the processed content and HTML flag to the chunk handler
                                        onChunk?.(result.processedText, result.hasArtefacts);
                                    } catch (artefactError) {
                                        console.error('Error processing artefacts during streaming:', artefactError);
                                        // Fallback to original content if artefact processing fails
                                        onChunk?.(accumulatedContent, false);
                                    }
                                } else if (data.type === 'complete' && data.message) {
                                    botMessage.text = data.message.text;
                                    onComplete?.(data.message);
                                } else if (data.type === 'error') {
                                    throw new Error(data.error || 'Unknown error occurred');
                                }
                            } catch (error) {
                                console.error('Error parsing stream chunk:', error, 'Chunk:', line);
                            }
                        }
                    });
                    
                    processStream();
                } catch (error) {
                    console.error('Error in stream processing:', error);
                    onError?.('Error processing stream');
                }
            };

            processStream();
        } catch (error) {
            console.error('Error sending message:', error);
            onError?.('Sorry, I encountered an error. Please try again.');
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
     * Render active chat
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

        messageAreaEl.innerHTML = '';
        activeChat.messages.forEach(msg => {
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
                    this.renderActiveChat();
                }
            );
            messageAreaEl.appendChild(messageEl);
        });

        this.scrollToBottom();
        this.renderPinnedBanner(activeChat);
        renderFeatherIcons();
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
        // This would call the getChats API function
        // For now, return empty array
        return [];
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
                    this.renderChatList();
                    this.renderActiveChat();
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
                            // Still render LaTeX in the text parts
                            renderLatexInMessage(botMessageElement as HTMLElement);
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
                        // Still render LaTeX in the text parts
                        renderLatexInMessage(botMessageElement as HTMLElement);
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
        
        // Render the chat after adding the messages to ensure bot message element exists
        this.renderActiveChat();
        this.scrollToBottom();
    }

    private handleTogglePin(): void {
        const activeChatId = this.getActiveChatId();
        if (!activeChatId) return;
        this.togglePin(activeChatId);
        this.renderActiveChat();
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
        
        // Update UI after deletion
        this.renderActiveChat();
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
        this.renderActiveChat();
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
 * Utility function to create a default student context
 */
export function createDefaultStudent(): Student {
    return {
        id: 'student-001',
        name: 'Student User',
        courseAttended: 'APSC 099',
        userId: 1
    };
}
