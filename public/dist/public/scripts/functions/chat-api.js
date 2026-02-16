// public/scripts/functions/chat-api.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * Create a new chat on the server
 * @param chatRequest - Chat creation request
 * @returns Promise with chat creation response
 */
export function createNewChat(chatRequest) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch('/api/chat/newchat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(chatRequest),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = yield response.json();
            return result;
        }
        catch (error) {
            console.error('Error creating new chat:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    });
}
/**
 * Send a message to the server with streaming response
 * @param chatId - ID of the chat
 * @param message - Message content
 * @param userId - User ID (instructor/student)
 * @param courseName - Course name
 * @returns Promise that resolves when message is sent
 */
export function sendMessageToChat(chatId, message, userId, courseName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(`/api/chat/${chatId}`, {
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
        }
        catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    });
}
/**
 * Delete a chat from the server
 * @param chatId - ID of the chat to delete
 * @returns Promise with deletion response
 */
export function deleteChat(chatId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(`/api/chat/${chatId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = yield response.json();
            return result;
        }
        catch (error) {
            console.error('Error deleting chat:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    });
}
/**
 * Get all chats for a user from the server
 * @param userId - User ID
 * @param courseName - Course name
 * @returns Promise with chats array
 */
export function getChats(userId, courseName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(`/api/chat/user/${userId}/course/${courseName}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = yield response.json();
            return result.chats || [];
        }
        catch (error) {
            console.error('Error fetching chats:', error);
            return [];
        }
    });
}
/**
 * Update chat pin status on the server
 * @param chatId - ID of the chat
 * @param isPinned - Pin status
 * @returns Promise with update response
 */
export function updateChatPinStatus(chatId, isPinned) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(`/api/chat/${chatId}/pin`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ isPinned }),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = yield response.json();
            return result;
        }
        catch (error) {
            console.error('Error updating chat pin status:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    });
}
