// File: public/scripts/lib/state/ChatStateManager.ts

import { Chat, ChatMessage, StateEvent, StateEventData } from './StateTypes';

/**
 * ChatStateManage is a singleton class that manages the state of the chat application.
 * 
 * It is responsible for:
 *  - Managing the state of the chat application, including chats, messages, and active chat.
 *  - Managing the event system for the chat application.
 *  - Being a singleton class, so there is only one instance of the class.
 *  - Managing the state of the chat application, including chats, messages, and active chat.
 * 
 *  @author : @gatahcha
 *  @version : 1.0.0
 *  @since : 2025-08-13
 * 
 */

export class ChatStateManager {
    // ===== PRIVATE STATE =====
    private chats: Chat[] = [];
    private activeChatId: number | null = null;
    private listeners: Map<StateEvent, Array<(data: any) => void>> = new Map();

    // ===== SINGLETON PATTERN (Optional) =====
    private static instance: ChatStateManager | null = null;

    private constructor() {
        this.chats = [];
        this.activeChatId = null;
        this.listeners = new Map();
    }

    static getInstance(): ChatStateManager {
        if (!ChatStateManager.instance) {
            ChatStateManager.instance = new ChatStateManager();
        }
        return ChatStateManager.instance;
    }

    // ===== EVENT SYSTEM =====
    
    /**
     * Listen to state events
     * 
     * Rep Invariant : 
     *  - The listeners map is always a map of event to array of callbacks.
     * 
     * @param event - the event to listen to
     * @param callback - the callback to call when the event is emitted
     */
    on<T extends StateEvent>(event: T, callback: (data: StateEventData[T]) => void): void {
        // TODO: Add callback to listeners map
        // TODO: Create array if event doesn't exist
        
    }

    /**
     * Remove event listener
     */
    off<T extends StateEvent>(event: T, callback: (data: StateEventData[T]) => void): void {
        // TODO: Remove callback from listeners map
    }

    /**
     * Emit an event to all listeners
     */
    private emit<T extends StateEvent>(event: T, data: StateEventData[T]): void {
        // TODO: Find all callbacks for this event
        // TODO: Call each callback with the data
        // TODO: Always emit 'state:changed' after other events
    }

    // ===== CHAT OPERATIONS =====

    /**
     * Create a new chat
     */
    createChat(title: string = 'no title'): Chat {
        // TODO: Create new Chat object with unique ID
        // TODO: Add to chats array
        // TODO: Emit 'chat:added' event
        // TODO: Return the new chat
        throw new Error('Not implemented');
    }

    /**
     * Delete a chat by ID
     */
    deleteChat(chatId: number): boolean {
        // TODO: Find chat index in array
        // TODO: Return false if not found
        // TODO: Remove from array
        // TODO: Handle active chat cleanup if needed
        // TODO: Emit 'chat:removed' event
        // TODO: Return true on success
        throw new Error('Not implemented');
    }

    /**
     * Update chat properties
     */
    updateChat(chatId: number, updates: Partial<Omit<Chat, 'id'>>): boolean {
        // TODO: Find chat by ID
        // TODO: Return false if not found
        // TODO: Apply updates using Object.assign
        // TODO: Emit 'chat:updated' event
        // TODO: Return true on success
        throw new Error('Not implemented');
    }

    /**
     * Set the active chat
     */
    setActiveChat(chatId: number | null): boolean {
        // TODO: Validate chat exists (if not null)
        // TODO: Store previous active chat ID
        // TODO: Update activeChatId
        // TODO: Emit 'chat:activated' event
        // TODO: Return true on success
        throw new Error('Not implemented');
    }

    /**
     * Toggle chat pin status
     */
    toggleChatPin(chatId: number): boolean {
        // TODO: Find chat by ID
        // TODO: Return false if not found
        // TODO: Toggle isPinned property
        // TODO: Emit 'chat:updated' event
        // TODO: Return true on success
        throw new Error('Not implemented');
    }

    // ===== MESSAGE OPERATIONS =====

    /**
     * Add a message to a chat
     */
    addMessage(chatId: number, messageData: Omit<ChatMessage, 'id'>): ChatMessage | null {
        // TODO: Find chat by ID
        // TODO: Return null if chat not found
        // TODO: Create new ChatMessage with unique ID
        // TODO: Add to chat's messages array
        // TODO: Auto-update chat title if needed (first user message)
        // TODO: Emit 'message:added' event
        // TODO: Return the new message
        throw new Error('Not implemented');
    }

    /**
     * Pin a message in a chat
     */
    pinMessage(chatId: number, messageId: number): boolean {
        // TODO: Find chat by ID
        // TODO: Return false if not found
        // TODO: Verify message exists in chat
        // TODO: Set chat.pinnedMessageId
        // TODO: Emit 'message:pinned' event
        // TODO: Return true on success
        throw new Error('Not implemented');
    }

    /**
     * Unpin the current pinned message in a chat
     */
    unpinMessage(chatId: number): boolean {
        // TODO: Find chat by ID
        // TODO: Return false if not found or no pinned message
        // TODO: Store messageId before clearing
        // TODO: Set chat.pinnedMessageId to null
        // TODO: Emit 'message:unpinned' event
        // TODO: Return true on success
        throw new Error('Not implemented');
    }

    /**
     * Toggle pin status of a message
     */
    toggleMessagePin(chatId: number, messageId: number): boolean {
        // TODO: Check if message is currently pinned
        // TODO: Call pinMessage or unpinMessage accordingly
        // TODO: Return the result
        throw new Error('Not implemented');
    }

    // ===== QUERY METHODS =====

    /**
     * Get all chats (returns copy to prevent mutation)
     */
    getAllChats(): Chat[] {
        // TODO: Return a deep copy of chats array
        throw new Error('Not implemented');
    }

    /**
     * Get a specific chat by ID
     */
    getChat(chatId: number): Chat | null {
        // TODO: Find and return chat by ID
        // TODO: Return copy to prevent mutation
        // TODO: Return null if not found
        throw new Error('Not implemented');
    }

    /**
     * Get the currently active chat
     */
    getActiveChat(): Chat | null {
        // TODO: Return null if no active chat
        // TODO: Find and return active chat
        // TODO: Return copy to prevent mutation
        throw new Error('Not implemented');
    }

    /**
     * Get the active chat ID
     */
    getActiveChatId(): number | null {
        // TODO: Return activeChatId
        throw new Error('Not implemented');
    }

    /**
     * Get chats sorted by pin status (pinned first)
     */
    getSortedChats(): Chat[] {
        // TODO: Get all chats
        // TODO: Sort with pinned chats first
        // TODO: Return sorted array
        throw new Error('Not implemented');
    }

    /**
     * Get only pinned chats
     */
    getPinnedChats(): Chat[] {
        // TODO: Filter chats where isPinned is true
        // TODO: Return filtered array
        throw new Error('Not implemented');
    }

    /**
     * Get a specific message from a chat
     * 
     * @param chatId - the id of the chat to get the message from
     * @param messageId - the id of the message to get
     * @returns the message or null if not found
     */
    getMessage(chatId: number, messageId: number): ChatMessage | null {
        // TODO: Find chat by ID
        // TODO: Find message in chat by ID
        // TODO: Return copy of message or null
        throw new Error('Not implemented');
    }

    /**
     * Get the pinned message from a chat
     * 
     * @param chatId - the id of the chat to get the pinned message from
     * @returns the pinned message or null if not found
     */
    getPinnedMessage(chatId: number): ChatMessage | null {
        // TODO: Find chat by ID
        // TODO: Check if chat has pinned message
        // TODO: Return the pinned message or null
        throw new Error('Not implemented');
    }

    // ===== UTILITY METHODS =====

    /**
     * Check if there are no chats
     * 
     * @returns true if there are no chats, false otherwise
     */
    isEmpty(): boolean {
        // TODO: Return true if chats array is empty
        throw new Error('Not implemented');
    }

    /**
     * Get statistics about the current state
     * 
     * @returns an object with the following properties:
     */
    getStats() {
        // TODO: Return object with:
        // - totalChats: number of chats
        // - pinnedChats: number of pinned chats
        // - totalMessages: total messages across all chats
        // - activeChatId: current active chat ID
        throw new Error('Not implemented');
    }

    // ===== PERSISTENCE (Optional) =====

    /**
     * Serialize state to JSON string
     * 
     * @returns a JSON string representation of the state
     */
    serialize(): string {
        // TODO: Create object with chats and activeChatId
        // TODO: Return JSON.stringify of the object
        throw new Error('Not implemented');
    }

    /**
     * Load state from JSON string
     */
    deserialize(data: string): boolean {
        // TODO: Try to parse JSON
        // TODO: Validate data structure
        // TODO: Update chats and activeChatId
        // TODO: Validate activeChatId still exists
        // TODO: Emit 'state:changed' event
        // TODO: Return true on success, false on error
        throw new Error('Not implemented');
    }

    /**
     * IMPLEMENT LATER : 
     * Save state to localStorage 
     */
    saveToStorage(): void {
        // TODO: Call serialize()
        // TODO: Save to localStorage with key 'chatState'
        throw new Error('Not implemented');
    }

    /**
     * IMPLEMENT LATER : 
     * Load state from localStorage
     */
    loadFromStorage(): boolean {
        // TODO: Get data from localStorage
        // TODO: Call deserialize() if data exists
        // TODO: Return result
        throw new Error('Not implemented');
    }

    // ===== DEBUGGING =====

    /**
     * IMPLEMENT LATER : 
     * Print current state to console
     */
    debug(): void {
        // TODO: Log stats, active chat, all chats, listeners
        console.group('ChatStateManager Debug');
        console.log('Stats:', this.getStats());
        console.log('Active Chat:', this.getActiveChat());
        console.log('All Chats:', this.getAllChats());
        console.log('Event Listeners:', Object.fromEntries(this.listeners));
        console.groupEnd();
    }

    // ===== PRIVATE HELPER METHODS =====

    /**
     * IMPLEMENT LATER : 
     * Generate unique ID for chats/messages
     */
    private generateId(): number {
        // TODO: Return unique ID (Date.now() or other method)
        throw new Error('Not implemented');
    }

    /**
     * IMPLEMENT LATER : 
     * Validate chat object structure
     */
    private isValidChat(chat: any): chat is Chat {
        // TODO: Check if object has required Chat properties
        // TODO: Return boolean
        throw new Error('Not implemented');
    }

    /**
     * IMPLEMENT LATER : 
     * Validate message object structure
     */
    private isValidMessage(message: any): message is ChatMessage {
        // TODO: Check if object has required ChatMessage properties
        // TODO: Return boolean
        throw new Error('Not implemented');
    }

    /**
     * IMPLEMENT LATER : 
     * Find chat index by ID
     */
    private findChatIndex(chatId: number): number {
        // TODO: Return index of chat in array, or -1 if not found
        throw new Error('Not implemented');
    }

    /**
     * IMPLEMENT LATER : 
     * Create a deep copy of an object
     */
    private deepCopy<T>(obj: T): T {
        // TODO: Return deep copy of object (JSON parse/stringify or other method)
        throw new Error('Not implemented');
    }
}

// ===== EXPORT SINGLETON INSTANCE =====
export const chatState = ChatStateManager.getInstance();

