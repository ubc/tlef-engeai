// public/scripts/types.ts

/**
 * Types for the student mode
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-08-16
 */

/**
 * The type of artefact
 */
export interface Artefact {
    type: 'mermaid';
    source: string;
    title?: string;
}

/**
 * The type of chat message
 */
export interface ChatMessage {
    id: number;
    sender: 'user' | 'bot';
    text: string;
    timestamp: number;
    artefact?: Artefact;
}

/**
 * The type of chat
 */
export interface Chat {
    id: number;
    title: string;
    messages: ChatMessage[];
    isPinned: boolean;
    pinnedMessageId?: number | null;
}


