// public/scripts/state.ts

/**
 * State management for the student mode
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-08-16
 */

import type { Chat, ChatMessage } from '../../../src/functions/types';

/**
 * The state of the student mode
 */
export type State = {
    chats: Chat[];
    activeChatId: number | null;
};

/**
 * The state of the student mode
 */
export const state: State = {
    chats: [],
    activeChatId: null
};

/**
 * Get the active chat
 * @returns The active chat
 */
export function getActiveChat(): Chat | undefined {
    return state.chats.find(c => c.id === state.activeChatId);
}

/**
 * Set the active chat
 * @param chatId - The id of the chat to set as active
 */
export function setActiveChat(chatId: number): void {
    state.activeChatId = chatId;
}

/**
 * Create a new chat
 * @returns The new chat
 */
export function createChat(): Chat {
    const newChat: Chat = { id: Date.now(), courseName: 'Default Course', divisionTitle: 'Default Division', itemTitle: 'no title', messages: [], isPinned: false };
    state.chats.push(newChat);
    state.activeChatId = newChat.id;
    return newChat;
}

/**
 * Delete a chat
 * @param chatId - The id of the chat to delete
 */
export function deleteChat(chatId: number): void {
    state.chats = state.chats.filter(c => c.id !== chatId);
    if (state.chats.length > 0) {
        const lastPinned = state.chats.filter(c => c.isPinned).pop();
        state.activeChatId = lastPinned ? lastPinned.id : state.chats[0].id;
    } else {
        state.activeChatId = null;
    }
}

/**
 * Toggle the pinned state of a chat
 * @param chatId - The id of the chat to toggle the pinned state of
 */
export function toggleChatPin(chatId: number): void {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    chat.isPinned = !chat.isPinned;
}

/**
 * Add a message to a chat
 * @param chatId - The id of the chat to add the message to
 * @param message - The message to add to the chat
 */
export function addMessage(chatId: number, message: ChatMessage): void {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    chat.messages.push(message);
}

/**
 * Toggle the pinned state of a message
 * @param chatId - The id of the chat to toggle the pinned state of
 * @param messageId - The id of the message to toggle the pinned state of
 */
export function togglePinnedMessage(chatId: number, messageId: number): void {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    chat.pinnedMessageId = chat.pinnedMessageId === messageId ? null : messageId;
}


