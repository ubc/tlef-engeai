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

        //check if event exists in the listeners map
        const existingListeners = this.listeners.get(event) || [];

        //check if callback is already in the array
        if (existingListeners.includes(callback)) {
            return;
        }

        //add callback to the array
        existingListeners.push(callback);
        this.listeners.set(event, existingListeners);
        
    }

    /**
     * Remove event listener
     * 
     * Rep Invariant : 
     *  - The listeners map is always a map of event to array of callbacks.
     *  - The callback is only removed if it is in the array.
     *  - The callback is only removed if it is the same function object.
     * 
     * @param event - the event to remove the listener from
     * @param callback - the callback to remove from the event
     * 
     */
    off<T extends StateEvent>(event: T, callback: (data: StateEventData[T]) => void): void {
        // TODO: Remove callback from listeners map
        const existingListeners = this.listeners.get(event) || [];

        //check if callback is in the array
        if (!existingListeners.includes(callback)) {
            return;
        }

        //remove callback from the array ( O(n) )
        const newListeners = existingListeners.filter(cb => cb !== callback);
        this.listeners.set(event, newListeners);
    }

    /**
     * Emit an event to all listeners
     * 
     * Rep Invariant : 
     *  - The listeners map is always a map of event to array of callbacks.
     *  - The callbacks are always called with the data.
     *  - The 'state:changed' event is always emitted after other events.
     * 
     * @param event - the event to emit
     * @param data - the data to emit to the listeners
     * 
     */
    private emit<T extends StateEvent>(event: T, data: StateEventData[T]): void {

        //get all callbacks for the event
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(callback => callback(data));

        //always emit 'state:changed' after other events
        this.emit('state:changed', { chatId: this.activeChatId || 0});
    }

    // ===== CHAT OPERATIONS =====

    /**
     * Create a new chat
     * 
     * Rep Invariant : 
     *  - The String should not be empty
     *  - The chatId is always a unique number.
     */
    createChat(title: string = 'no title'): Chat {
        // TODO: Create new Chat object with unique ID
        // TODO: Add to chats array
        // TODO: Emit 'chat:added' event
        // TODO: Return the new chat

        const newChat = {
            id: this.generateId(),
            title,
            messages: [],
            isPinned: false,
            pinnedMessageId: null,
            timestamp: Date.now()
        }

        this.chats.push(newChat);
        this.emit('chat-added', { chatId: newChat.id });
        return newChat;
    }

    /**
     * Delete a chat by ID
     * 
     * Rep Invariant : 
     *  - The chatId is always a unique number.
     *  - The chat is always removed from the chats array in the activeChatId.
     * 
     * @param chatId - the id of the chat to delete
     * @returns true if the chat was deleted, false otherwise
     * 
     */
    deleteChat(chatId: number): boolean {
        // TODO: Find chat index in array
        // TODO: Return false if not found
        // TODO: Remove from array
        // TODO: Handle active chat cleanup if needed
        // TODO: Emit 'chat:removed' event
        // TODO: Return true on success

        const index = this.chats.findIndex(chat => chat.id === chatId);
        if (index === -1) {
            return false;
        }
        else {
            this.chats.splice(index, 1);
            this.emit('chat-removed', { chatId: chatId });
            return true;
        }
    }

    /**
     * Update chat properties
     * 
     * Rep Invariant : 
     *  - The chatId is always a unique number.
     *  - The chat is always updated in the chats array.
     *  - The chat is always updated in the activeChatId.
     *  - The chat is always updated in the listeners.
     * 
     * @param chatId - the id of the chat to update
     * @param updates - the updates to apply to the chat
     * @returns true if the chat was updated, false otherwise
     * 
     */
    updateChat(chatId: number, updates: Partial<Omit<Chat, 'id'>>): boolean {
        // TODO: Find chat by ID
        // TODO: Return false if not found
        // TODO: Apply updates using Object.assign
        // TODO: Emit 'chat:updated' event
        // TODO: Return true on success

        const chat = this.chats.find(chat => chat.id === chatId);
        if (!chat) {
            return false;
        }
        Object.assign(chat, updates);
        this.emit('chat-updated', { chatId: chatId });

        return true;

    }

    /**
     * Set the active chat
     * activateChat means the chat is activated when user click on the chat in the chat list.
     * 
     * Rep Invariant : 
     *  - The chatId is always a unique number and exist in the chats array.
     *  - The chat is always set as the active chat.
     * 
     * @param chatId - the id of the chat to set as active
     * @returns true if the chat was set as active, false otherwise
     * 
     */
    setActiveChat(chatId: number | null): boolean {
        // TODO: Validate chat exists (if not null)
        // TODO: Store previous active chat ID
        // TODO: Update activeChatId
        // TODO: Emit 'chat:activated' event
        // TODO: Return true on success

        if (chatId === null) {
            this.activeChatId = null;
            this.emit('chat-activated', { chatId: null });
            return true;
        }
        else {
            this.activeChatId = chatId;
            this.emit('chat-activated', { chatId: chatId });
            return true;
        }
    }

    /**
     * Toggle chat pin status
     * toggleChatPin status means the chat is pinned when user click on the chat in the chat list.
     * 
     * Rep Invariant : 
     *  - The chatId is always a unique number and exist in the chats array.
     *  - The chat is always toggled in the chats array.
     * 
     * @param chatId - the id of the chat to toggle the pin status of
     * @returns true if the chat was toggled, false otherwise
     * 
     */
    toggleChatPin(chatId: number): boolean {
        // TODO: Find chat by ID
        // TODO: Return false if not found
        // TODO: Toggle isPinned property
        // TODO: Emit 'chat:updated' event
        // TODO: Return true on success

        const chat = this.chats.find(chat => chat.id === chatId);
        if (!chat) {
            return false;
        }

        chat.isPinned = !chat.isPinned;
        this.emit('chat-updated', { chatId: chatId });
        return true;
    }

    // ===== MESSAGE OPERATIONS =====

    /**
     * Add a message to a chat
     * 
     * Rep Invariant : 
     *  - The chatId is always a unique number.
     *  - The message is always added to the chat's messages array.
     *  - The message is always added to the activeChatId, chats array, and listeners.
     * 
     * @param chatId - the id of the chat to add the message to
     * @param messageData - the data of the message to add
     * @returns the new message or null if the chat was not found
     * 
     * @author : @gatahcha
     * @version : 1.0.0
     */
    addMessage(chatId: number, messageData: Omit<ChatMessage, 'id'>): ChatMessage | null {
        // TODO: Find chat by ID
        // TODO: Return null if chat not found
        // TODO: Create new ChatMessage with unique ID
        // TODO: Add to chat's messages array
        // TODO: Auto-update chat title if needed (first user message)
        // TODO: Emit 'message:added' event
        // TODO: Return the new message

        const chat = this.chats.find(chat => chat.id === chatId);
        if (!chat) {
            return null;
        }

        const newMessage = {
            id: this.generateId(),
            text: messageData.text,
            sender: messageData.sender,
            timestamp: messageData.timestamp,
            isPinned: false,
            artefact: messageData.artefact
        }

        chat.messages.push(newMessage);
        this.emit('message-added', { chatId: chatId, messageId: newMessage.id });
        return newMessage;
    }

    /**
     * Pin a message in a chat
     * 
     * Pin message means pin message in the chat
     * 
     * Rep Invariant : 
     *  - The chatId is always a unique number and exist in the chats array.
     *  - The messageId is always a unique number and exist in the chat's messages array.
     *  - The message is always pinned in the chats.
     * 
     * @param chatId - the id of the chat to pin the message to
     * @param messageId - the id of the message to pin
     * @returns true if the message was pinned, false otherwise
     */
    pinMessage(chatId: number, messageId: number): boolean {

        //check if chat exists
        const chat = this.chats.find(chat => chat.id === chatId);
        if (!chat) {
            return false;
        }

        //check if message exists in the chat
        const message = chat.messages.find(message => message.id === messageId);
        if (!message) {
            return false;
        }

        //already True
        if (chat.pinnedMessageId === messageId) {
            return true;
        }

        //pin the message
        chat.pinnedMessageId = messageId;
        this.emit('message-pinned', { chatId: chatId, messageId: messageId });
        return true;
    }

    /**
     * Unpin the current pinned message in a chat
     * 
     * Rep Invariant : 
     *  - The chatId is always a unique number and exist in the chats array.
     *  - The message is always unpinned in the chats.
     * 
     * @param chatId - the id of the chat to unpin the message from
     * @returns true if the message was unpinned, false otherwise
     */
    unpinMessage(chatId: number): boolean {
        
        //check if chat exists
        const chat = this.chats.find(chat => chat.id === chatId);
        if (!chat) {
            return false;
        }

        //check if pinned message exists, return false if not
        if (chat.pinnedMessageId === null) {
            return false;
        }

        //unpin the message
        chat.pinnedMessageId = null;
        this.emit('message-unpinned', { chatId: chatId});

        //return true if the message was unpinned
        return true;
    }

    /**
     * Toggle pin status of a message
     * 
     * Rep Invariant : 
     *  - The chatId is always a unique number and exist in the chats array.
     *  - The messageId is always a unique number and exist in the chat's messages array.
     *  - The message is always toggled in the chats.
     * 
     * @param chatId - the id of the chat to toggle the pin status of
     * @param messageId - the id of the message to toggle the pin status of
     */
    toggleMessagePin(chatId: number, messageId: number): boolean {

        //check if chat exists
        const chat = this.chats.find(chat => chat.id === chatId);
        if (!chat) {
            return false;
        }

        //check if message exists in the chat
        const message = chat.messages.find(message => message.id === messageId);
        if (!message) {
            return false;
        }

        //toggle the pin status of the message
        if (chat.pinnedMessageId === messageId) {
            return this.unpinMessage(chatId);
        }
        else {
            return this.pinMessage(chatId, messageId);
        }
    }

    // ===== QUERY METHODS =====

    /**
     * Get all chats (returns copy to prevent mutation)
     * 
     * Rep Invariant : 
     *  - Return the chats array
     * 
     * @returns the chats array
     */
    getAllChats(): Chat[] {
        //return all chats
        return this.chats;
    }

    /**
     * Get a specific chat by ID
     * 
     * Rep Invariant : 
     *  - Return the chat or null if not found
     * 
     * @param chatId - the id of the chat to get
     * @returns the chat or null if not found
     */
    getChat(chatId: number): Chat | null {
        
        return this.chats.find(chat => chat.id === chatId) || null;
    }

    /**
     * Get the currently active chat
     * 
     * Rep Invariant : 
     *  - Return the active chat or null if not found
     * 
     * @returns the active chat or null if not found
     */
    getActiveChat(): Chat | null {
        return this.chats.find(chat => chat.id === this.activeChatId) || null;
    }

    /**
     * Get the active chat ID
     * 
     * Rep Invariant : 
     *  - Return the active chat ID or null if not found
     * 
     * @returns the active chat ID or null if not found
     */
    getActiveChatId(): number | null {
       
        return this.activeChatId;
    }

    /**
     * Get chats sorted by pin status (pinned first)
     * 
     * Rep Invariant : 
     *  - The chats are always returned in the order of the chats array.
     * 
     * @returns all chats that are pinned
     */
    getSortedChats(): Chat[] {
        //get all pinned chats
        const pinnedChats = this.getPinnedChats();
        //sort pinned chats by timestamp
        pinnedChats.sort((a, b) => b.timestamp - a.timestamp);

        //get all unpinned chats
        const unpinnedChats = this.chats.filter(chat => !chat.isPinned);
        //sort unpinned chats by timestamp
        unpinnedChats.sort((a, b) => b.timestamp - a.timestamp);

        //return all chats sorted by pin status
        return [...pinnedChats, ...unpinnedChats];
    }

    /**
     * Get only pinned chats
     * 
     * Rep Invariant : 
     *  - The chats are always returned in the order of the chats array.
     * 
     * @returns all chats that are pinned
     */
    getPinnedChats(): Chat[] {

        //return all chats that are pinned
        return this.chats.filter(chat => chat.isPinned);
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

        const chat = this.chats.find(chat => chat.id === chatId);
        if (!chat) {
            return null;
        }

        return chat.messages.find(message => message.id === messageId) || null;
    }

    /**
     * Get the pinned message from a chat
     * 
     * @param chatId - the id of the chat to get the pinned message from
     * @returns the pinned message or null if not found
     */
    getPinnedMessage(chatId: number): ChatMessage | null {

        //check if chat exists
        const chat = this.chats.find(chat => chat.id === chatId);
        if (!chat) {
            return null;
        }

        //check if pinned message exists
        const pinnedId = chat.pinnedMessageId;
        if (pinnedId == null) {
            return null;
        }

        //return the pinned message 
        return chat.messages.find(message => message.id === pinnedId) || null;
    }

    // // ===== UTILITY METHODS =====
    // /**
    //  * Get statistics about the current state
    //  * 
    //  * @returns an object with the following properties:
    //  */
    // getStats() {
    //     // TODO: Return object with:
    //     // - totalChats: number of chats
    //     // - pinnedChats: number of pinned chats
    //     // - totalMessages: total messages across all chats
    //     // - activeChatId: current active chat ID
        
    // }
    

    // // ===== PERSISTENCE (Optional) =====

    // /**
    //  * Serialize state to JSON string
    //  * 
    //  * @returns a JSON string representation of the state
    //  */
    // serialize(): string {
    //     // TODO: Create object with chats and activeChatId
    //     // TODO: Return JSON.stringify of the object
    //     throw new Error('Not implemented');
    // }

    // /**
    //  * Load state from JSON string
    //  */
    // deserialize(data: string): boolean {
    //     // TODO: Try to parse JSON
    //     // TODO: Validate data structure
    //     // TODO: Update chats and activeChatId
    //     // TODO: Validate activeChatId still exists
    //     // TODO: Emit 'state:changed' event
    //     // TODO: Return true on success, false on error
    //     throw new Error('Not implemented');
    // }

    // /**
    //  * IMPLEMENT LATER : (SHOULD NOT BE DONE BY AI)
    //  * Save state to localStorage 
    //  */
    // saveToStorage(): void {
    //     // TODO: Call serialize()
    //     // TODO: Save to localStorage with key 'chatState'
    //     throw new Error('Not implemented');
    // }

    // /**
    //  * IMPLEMENT LATER : (SHOULD NOT BE DONE BY AI)
    //  * Load state from localStorage
    //  */
    // loadFromStorage(): boolean {
    //     // TODO: Get data from localStorage
    //     // TODO: Call deserialize() if data exists
    //     // TODO: Return result
    //     throw new Error('Not implemented');
    // }

    // // ===== DEBUGGING =====

    // /**
    //  * IMPLEMENT LATER : (SHOULD NOT BE DONE BY AI)
    //  * Print current state to console
    //  */
    // debug(): void {
    //     // TODO: Log stats, active chat, all chats, listeners
    //     console.group('ChatStateManager Debug');
    //     console.log('Stats:', this.getStats());
    //     console.log('Active Chat:', this.getActiveChat());
    //     console.log('All Chats:', this.getAllChats());
    //     console.log('Event Listeners:', Object.fromEntries(this.listeners));
    //     console.groupEnd();
    // }

    // // ===== PRIVATE HELPER METHODS =====

    /**
     * IMPLEMENT LATER : (SHOULD NOT BE DONE BY AI)
     * Generate unique ID for chats/messages
     */
    private generateId(): number {
        // TODO: Return unique ID (Date.now() or other method)
        return Date.now();
    }

    // /**
    //  * IMPLEMENT LATER : (SHOULD NOT BE DONE BY AI)
    //  * Validate chat object structure
    //  */
    // private isValidChat(chat: any): chat is Chat {
    //     // TODO: Check if object has required Chat properties
    //     // TODO: Return boolean
    //     throw new Error('Not implemented');
    // }

    // /**
    //  * IMPLEMENT LATER : (SHOULD NOT BE DONE BY AI)
    //  * Validate message object structure
    //  */
    // private isValidMessage(message: any): message is ChatMessage {
    //     // TODO: Check if object has required ChatMessage properties
    //     // TODO: Return boolean
    //     throw new Error('Not implemented');
    // }

    // /**
    //  * IMPLEMENT LATER : (SHOULD NOT BE DONE BY AI)
    //  * Find chat index by ID
    //  */
    // private findChatIndex(chatId: number): number {
    //     // TODO: Return index of chat in array, or -1 if not found
    //     throw new Error('Not implemented');
    // }

    // /**
    //  * IMPLEMENT LATER : (SHOULD NOT BE DONE BY AI)
    //  * Create a deep copy of an object
    //  */
    // private deepCopy<T>(obj: T): T {
    //     // TODO: Return deep copy of object (JSON parse/stringify or other method)
    //     throw new Error('Not implemented');
    // }
}

// ===== EXPORT SINGLETON INSTANCE =====
export const chatState = ChatStateManager.getInstance();

