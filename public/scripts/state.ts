// public/scripts/state.ts

import type { Chat, ChatMessage } from './types';

export type State = {
    chats: Chat[];
    activeChatId: number | null;
};

export const state: State = {
    chats: [],
    activeChatId: null
};

export function getActiveChat(): Chat | undefined {
    return state.chats.find(c => c.id === state.activeChatId);
}

export function setActiveChat(chatId: number): void {
    state.activeChatId = chatId;
}

export function createChat(): Chat {
    const newChat: Chat = { id: Date.now(), title: 'no title', messages: [], isPinned: false };
    state.chats.push(newChat);
    state.activeChatId = newChat.id;
    return newChat;
}

export function deleteChat(chatId: number): void {
    state.chats = state.chats.filter(c => c.id !== chatId);
    if (state.chats.length > 0) {
        const lastPinned = state.chats.filter(c => c.isPinned).pop();
        state.activeChatId = lastPinned ? lastPinned.id : state.chats[0].id;
    } else {
        state.activeChatId = null;
    }
}

export function toggleChatPin(chatId: number): void {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    chat.isPinned = !chat.isPinned;
}

export function addMessage(chatId: number, message: ChatMessage): void {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    chat.messages.push(message);
}

export function togglePinnedMessage(chatId: number, messageId: number): void {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    chat.pinnedMessageId = chat.pinnedMessageId === messageId ? null : messageId;
}


