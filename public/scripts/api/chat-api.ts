// public/scripts/functions/chat-api.ts

/**
 * Chat API Functions - Server-side only
 * Separated from api.ts for security reasons
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { Chat, ChatMessage } from '../../../src/functions/types.js';

/**
 * Create Chat Request interface
 */
export interface CreateChatRequest {
    userID: string;
    courseName: string;
    date: string;
}

/**
 * API Response interfaces for chat operations
 */
export interface ChatResponse {
    success: boolean;
    message?: string;
    error?: string;
}

export interface CreateChatResponse extends ChatResponse {
    chatId?: string;
    initAssistantMessage?: {
        id: string;
        sender: 'bot';
        userId: number;
        courseName: string;
        text: string;
        timestamp: number;
    };
}

export interface SendMessageResponse {
    success: boolean;
    message?: ChatMessage;
    error?: string;
}

/**
 * Create a new chat on the server
 * @param chatRequest - Chat creation request
 * @returns Promise with chat creation response
 */
export async function createNewChat(chatRequest: CreateChatRequest): Promise<CreateChatResponse> {
    try {
        const response = await fetch('/api/chat/newchat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chatRequest),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error creating new chat:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

/**
 * Send a message to the server with streaming response
 * @param chatId - ID of the chat
 * @param message - Message content
 * @param userId - User ID (instructor/student)
 * @param courseName - Course name
 * @returns Promise that resolves when message is sent
 */
export async function sendMessageToChat(
    chatId: string, 
    message: string, 
    userId: string, 
    courseName: string
): Promise<void> {
    try {
        const response = await fetch(`/api/chat/${chatId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                userId,
                courseName
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Note: This function doesn't handle streaming - that's handled by the ChatManager
        // This is just for the API call structure
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

/**
 * Delete a chat from the server
 * @param chatId - ID of the chat to delete
 * @returns Promise with deletion response
 */
export async function deleteChat(chatId: string): Promise<ChatResponse> {
    try {
        const response = await fetch(`/api/chat/${chatId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error deleting chat:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

/**
 * Get all chats for a user from the server
 * @param userId - User ID
 * @param courseName - Course name
 * @returns Promise with chats array
 */
export async function getChats(userId: string, courseName: string): Promise<Chat[]> {
    try {
        const response = await fetch(`/api/chat/user/${userId}/course/${courseName}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result.chats || [];
    } catch (error) {
        console.error('Error fetching chats:', error);
        return [];
    }
}

/**
 * Dismiss the unstruggle confidence question block ("No, maybe later")
 * Removes the block from the message in MongoDB so it stays hidden on reload
 * @param chatId - ID of the chat
 * @param messageId - ID of the bot message containing the block
 * @param topic - The topic from the questionUnstruggle tag
 * @returns Promise with success and updatedText
 */
export async function dismissUnstruggleBlock(
    chatId: string,
    messageId: string,
    topic: string
): Promise<{ success: boolean; updatedText?: string; error?: string }> {
    try {
        const response = await fetch(`/api/chat/${chatId}/dismiss-unstruggle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messageId, topic }),
        });

        const result = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: result.error || `HTTP error! status: ${response.status}`,
            };
        }

        return {
            success: true,
            updatedText: result.updatedText,
        };
    } catch (error) {
        console.error('Error dismissing unstruggle block:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
}

/**
 * Update chat pin status on the server
 * @param chatId - ID of the chat
 * @param isPinned - Pin status
 * @returns Promise with update response
 */
export async function updateChatPinStatus(chatId: string, isPinned: boolean): Promise<ChatResponse> {
    try {
        const response = await fetch(`/api/chat/${chatId}/pin`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ isPinned }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error updating chat pin status:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}
