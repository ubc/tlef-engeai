// public/scripts/api/chat-api.ts

/**
 * chat-api.ts
 * 
 * @author: @gatahcha
 * @date: 2025-01-27
 * @latest frontend version: 1.0.6
 * @description: API helpers for chat CRUD, send message, pin/unpin, dismiss unstruggle block.
 */

import { 
    Chat, 
    CreateChatRequest, 
    CreateChatResponse, 
    ChatApiResponse 
} from '../types.js';

/**
 * createNewChat
 * 
 * @param chatRequest CreateChatRequest — userID, courseName, date
 * @returns Promise<CreateChatResponse> — success, chatId, initAssistantMessage, or error
 * POST to /api/chat/newchat. Returns error object on failure.
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
 * sendMessageToChat
 * 
 * @param chatId string — ID of the chat
 * @param message string — Message content
 * @param userId string — User ID (instructor/student)
 * @param courseName string — Course name
 * @returns Promise<void>
 * POST to /api/chat/:chatId. Streaming is handled by ChatManager, not this function.
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
 * deleteChat
 * 
 * @param chatId string — ID of the chat to delete
 * @returns Promise<ChatApiResponse> — success or error
 * DELETE /api/chat/:chatId. Returns error object on failure.
 */
export async function deleteChat(chatId: string): Promise<ChatApiResponse> {
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
 * getChats
 * 
 * @param userId string — User ID
 * @param courseName string — Course name
 * @returns Promise<Chat[]> — Array of chats; empty array on error
 * GET /api/chat/user/:userId/course/:courseName.
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
 * dismissUnstruggleBlock
 * 
 * @param chatId string — ID of the chat
 * @param messageId string — ID of the bot message containing the block
 * @param topic string — The topic from the questionUnstruggle tag
 * @returns Promise<{ success: boolean; updatedText?: string; error?: string }>
 * Dismisses "No, maybe later" unstruggle block. POST to /api/chat/:chatId/dismiss-unstruggle. Removes block from MongoDB so it stays hidden on reload.
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
 * updateChatPinStatus
 * 
 * @param chatId string — ID of the chat
 * @param isPinned boolean — Pin status
 * @returns Promise<ChatApiResponse> — success or error
 * PUT /api/chat/:chatId/pin. Returns error object on failure.
 */
export async function updateChatPinStatus(chatId: string, isPinned: boolean): Promise<ChatApiResponse> {
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
