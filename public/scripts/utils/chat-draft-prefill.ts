/**
 * chat-draft-prefill.ts — sessionStorage draft for the chat composer
 *
 * Used when Practice Scenarios sends a student to chat with scenario context prefilled.
 */

import type { ConversationModeId } from '../types.js';

const STORAGE_PREFIX = 'engeai-chat-draft:';

/** @see stashChatDraftPrefill */
export interface ChatDraftPrefill {
    text: string;
    conversationMode?: ConversationModeId;
    createdAt: number;
}

/**
 * Generate the storage key for the draft of the chat composer in sessionStorage.
 * @param courseId - The ID of the course.
 * @returns The storage key.
 */
function storageKey(courseId: string): string {
    return `${STORAGE_PREFIX}${courseId}`;
}

/**
 * Parse the draft of the chat composer in sessionStorage.
 * @param raw - The raw string of the draft.
 * @returns The parsed draft.
 */
function parseDraft(raw: string): ChatDraftPrefill | null {
    try {
        const parsed = JSON.parse(raw) as Partial<ChatDraftPrefill>;
        if (typeof parsed.text !== 'string') return null;
        return {
            text: parsed.text,
            conversationMode: parsed.conversationMode,
            createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
        };
    } catch {
        return null;
    }
}


/**
 * Stash a draft of the chat composer in sessionStorage.
 * @param courseId - The ID of the course.
 * @param text - The text of the draft.
 * @param conversationMode - The conversation mode of the draft.
 */
export function stashChatDraftPrefill(
    courseId: string,
    text: string,
    conversationMode?: ConversationModeId
): void {
    try {
        const payload: ChatDraftPrefill = { text, conversationMode, createdAt: Date.now() };
        sessionStorage.setItem(storageKey(courseId), JSON.stringify(payload));
    } catch {
        // ponytail: sessionStorage full or unavailable — navigation still works without prefill
    }
}

/**
 * Peek at the draft of the chat composer in sessionStorage.
 * @param courseId - The ID of the course.
 * @returns The draft of the chat composer.
 */
export function peekChatDraftPrefill(courseId: string): ChatDraftPrefill | null {
    try {
        const raw = sessionStorage.getItem(storageKey(courseId));
        if (!raw) return null;
        return parseDraft(raw);
    } catch {
        return null;
    }
}

/**
 * Clear the draft of the chat composer in sessionStorage.
 * @param courseId - The ID of the course.
 */
export function clearChatDraftPrefill(courseId: string): void {
    try {
        sessionStorage.removeItem(storageKey(courseId));
    } catch {
        // ignore
    }
}

/**
 * Consume the draft of the chat composer in sessionStorage.
 * @param courseId - The ID of the course.
 * @returns The text of the draft.
 */
export function consumeChatDraftPrefill(courseId: string): string | null {
    const draft = peekChatDraftPrefill(courseId);
    if (!draft) return null;
    clearChatDraftPrefill(courseId);
    return draft.text;
}
