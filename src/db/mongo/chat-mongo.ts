// chat-mongo.ts
/**
 * chat-mongo.ts
 * @author @gatahcha (refactor)
 * @description User-scoped **chat threads** embedded on each `{courseName}_users` document (`chats[]`) with soft-delete and pin metadata.
 */

import type { Chat, ChatMessage } from '../../types/shared';
import type { MongoDalContext } from './mongo-context';
import { getCourseUsersMongoCollection } from './course-user-mongo';
import { appLogger } from '../../utils/logger';

/**
 * getUserChats
 *
 * Returns non-deleted chats for sidebar rendering (filters `isDeleted === true`).
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string — roster `userId`, not `puid`
 *
 * @returns `Chat[]` — may be empty when user missing
 *
 * Actions:
 * - Load user doc, read `chats` array (default `[]`), filter out soft-deleted entries.
 */
export async function getUserChats(
    ctx: MongoDalContext,
    courseName: string,
    userId: string
): Promise<Chat[]> {
    appLogger.log(`[MONGODB] 📋 Getting chats for user userId: ${userId} in course: ${courseName}`);
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const user = await userCollection.findOne({ userId });
        if (!user) {
            appLogger.log(`[MONGODB] ⚠️ User not found with userId: ${userId}`);
            return [];
        }
        const allChats = (user as any).chats || [];
        const activeChats = allChats.filter((chat: Chat) => !chat.isDeleted);
        appLogger.log(
            `[MONGODB] ✅ Found ${activeChats.length} active chats (${allChats.length - activeChats.length} deleted) for user`
        );
        return activeChats;
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error getting user chats:`, error);
        throw error;
    }
}

/**
 * getUserChatsMetadata
 * 
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string
 * @returns Promise<any[]>
 *
 * Lightweight listing without shipping full `messages[]` — sorted by most recent message timestamp.
 *
 * @returns Array of summary objects (`id`, `itemTitle`, pin fields, counts, `lastMessageTimestamp`)
 */
export async function getUserChatsMetadata(
    ctx: MongoDalContext,
    courseName: string,
    userId: string
): Promise<any[]> {
    appLogger.log(`[MONGODB] 📊 Getting chat metadata for user userId: ${userId} in course: ${courseName}`);
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const user = await userCollection.findOne({ userId });
        if (!user) {
            appLogger.log(`[MONGODB] ⚠️ User not found with userId: ${userId}`);
            return [];
        }
        const allChats = (user as any).chats || [];
        const activeChatsMetadata = allChats
            .filter((chat: Chat) => !chat.isDeleted)
            .map((chat: Chat) => ({
                id: chat.id,
                courseName: chat.courseName,
                itemTitle: chat.itemTitle,
                isPinned: chat.isPinned,
                pinnedMessageId: chat.pinnedMessageId,
                messageCount: chat.messages ? chat.messages.length : 0,
                lastMessageTimestamp:
                    chat.messages && chat.messages.length > 0
                        ? chat.messages[chat.messages.length - 1].timestamp
                        : 0
            }))
            .sort((a: any, b: any) => b.lastMessageTimestamp - a.lastMessageTimestamp);
        appLogger.log(`[MONGODB] ✅ Found ${activeChatsMetadata.length} active chat metadata for user`);
        return activeChatsMetadata;
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error getting user chat metadata:`, error);
        throw error;
    }
}

/**
 * addChatToUser
 * 
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string
 * @param chat - Chat
 * @returns Promise<void>
 *
 * Appends a new `Chat` object to the tail of `chats`.
 *
 * @throws When no user matches `userId`
 */
export async function addChatToUser(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    chat: Chat
): Promise<void> {
    appLogger.log(`[MONGODB] ➕ Adding chat ${chat.id} to user userId: ${userId} in course: ${courseName}`);
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const result = await userCollection.updateOne(
            { userId },
            {
                $push: { chats: chat } as any,
                $set: { updatedAt: new Date() }
            } as any
        );
        if (result.matchedCount === 0) {
            throw new Error(`User not found with userId: ${userId}`);
        }
        appLogger.log(`[MONGODB] ✅ Chat added successfully to user`);
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error adding chat to user:`, error);
        throw error;
    }
}

/**
 * updateUserChat
 * 
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string
 * @param chatId - string
 * @param chat - Chat
 * @returns Promise<void>
 *
 * Replaces the entire chat sub-document matching `chatId` (positional `$` operator).
 *
 * @throws When no matching chat id under the user
 */
export async function updateUserChat(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    chatId: string,
    chat: Chat
): Promise<void> {
    appLogger.log(`[MONGODB] 🔄 Updating chat ${chatId} for user userId: ${userId} in course: ${courseName}`);
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const result = await userCollection.updateOne(
            { userId, 'chats.id': chatId },
            {
                $set: {
                    'chats.$': chat,
                    updatedAt: new Date()
                }
            }
        );
        if (result.matchedCount === 0) {
            throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
        }
        appLogger.log(`[MONGODB] ✅ Chat updated successfully`);
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error updating user chat:`, error);
        throw error;
    }
}

/**
 * addMessageToChat
 * 
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string
 * @param chatId - string
 * @param message - ChatMessage
 * @returns Promise<void>
 *
 * Pushes a `ChatMessage` onto `chats.$.messages` for the matched thread.
 */
export async function addMessageToChat(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    chatId: string,
    message: ChatMessage
): Promise<void> {
    appLogger.log(`[MONGODB] 💬 Adding message to chat ${chatId} for user userId: ${userId}`);
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const result = await userCollection.updateOne(
            { userId, 'chats.id': chatId },
            {
                $push: { 'chats.$.messages': message } as any,
                $set: { updatedAt: new Date() }
            } as any
        );
        if (result.matchedCount === 0) {
            throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
        }
        appLogger.log(`[MONGODB] ✅ Message added to chat successfully`);
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error adding message to chat:`, error);
        throw error;
    }
}

/**
 * updateChatTitle
 * 
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string
 * @param chatId - string
 * @param newTitle - string
 * @returns Promise<void>
 *
 * Updates `itemTitle` (display label) for pinned sidebars / history lists.
 */
export async function updateChatTitle(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    chatId: string,
    newTitle: string
): Promise<void> {
    appLogger.log(
        `[MONGODB] 📝 Updating chat title for chat ${chatId} to "${newTitle}" for user userId: ${userId} in course: ${courseName}`
    );
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const result = await userCollection.updateOne(
            { userId, 'chats.id': chatId },
            {
                $set: {
                    'chats.$.itemTitle': newTitle,
                    updatedAt: new Date()
                }
            }
        );
        if (result.matchedCount === 0) {
            throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
        }
        appLogger.log(`[MONGODB] ✅ Chat title updated successfully to "${newTitle}"`);
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error updating chat title:`, error);
        throw error;
    }
}

/**
 * updateChatPinStatus
 *
 * Toggles `isPinned` for ordering pinned conversations.
 */
export async function updateChatPinStatus(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    chatId: string,
    isPinned: boolean
): Promise<void> {
    appLogger.log(
        `[MONGODB] 📌 Updating chat pin status for chat ${chatId} to ${isPinned} for user userId: ${userId} in course: ${courseName}`
    );
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const result = await userCollection.updateOne(
            { userId, 'chats.id': chatId },
            {
                $set: {
                    'chats.$.isPinned': isPinned,
                    updatedAt: new Date()
                }
            }
        );
        if (result.matchedCount === 0) {
            throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
        }
        appLogger.log(`[MONGODB] ✅ Chat pin status updated successfully to ${isPinned}`);
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error updating chat pin status:`, error);
        throw error;
    }
}

/**
 * updateMessageInChat
 *
 * Surgical text edit for a single assistant/user bubble (used by struggle-dismiss flows).
 * 
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string
 * @param chatId - string
 * @param messageId - string
 * @param newText - string
 * @returns Promise<void>
 *
 * Actions:
 * - `arrayFilters` locate nested `chat.id` + `msg.id`, `$set` `text`.
 */
export async function updateMessageInChat(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    chatId: string,
    messageId: string,
    newText: string
): Promise<void> {
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const result = await userCollection.updateOne(
            { userId, 'chats.id': chatId },
            {
                $set: {
                    'chats.$[chat].messages.$[msg].text': newText,
                    updatedAt: new Date()
                }
            },
            {
                arrayFilters: [{ 'chat.id': chatId }, { 'msg.id': messageId }]
            }
        );
        if (result.matchedCount === 0) {
            throw new Error(`Chat or message not found: chatId=${chatId}, messageId=${messageId}`);
        }
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error updating message in chat:`, error);
        throw error;
    }
}

/**
 * markChatAsDeleted
 * 
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string
 * @param chatId - string
 * @returns Promise<void>
 *
 * Soft-delete — retains messages for auditing but hides from routine queries (`getUserChats`).
 */
export async function markChatAsDeleted(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    chatId: string
): Promise<void> {
    appLogger.log(`[MONGODB] 🗑️ Marking chat ${chatId} as deleted for user userId: ${userId} in course: ${courseName}`);
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const result = await userCollection.updateOne(
            { userId, 'chats.id': chatId },
            {
                $set: {
                    'chats.$.isDeleted': true,
                    updatedAt: new Date()
                }
            }
        );
        if (result.matchedCount === 0) {
            throw new Error(`Chat not found with ID: ${chatId} for user userId: ${userId}`);
        }
        appLogger.log(`[MONGODB] ✅ Chat ${chatId} marked as deleted successfully`);
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error marking chat as deleted:`, error);
        throw error;
    }
}

/**
 * deleteChatFromUser
 * 
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string
 * @param chatId - string
 * @returns Promise<void>
 *
 * @deprecated Hard `$pull` removal — prefer `markChatAsDeleted` to keep history.
 *
 * @throws When user row missing
 */
export async function deleteChatFromUser(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    chatId: string
): Promise<void> {
    appLogger.log(`[MONGODB] 🗑️ Deleting chat ${chatId} from user userId: ${userId} in course: ${courseName}`);
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const result = await userCollection.updateOne(
            { userId },
            {
                $pull: { chats: { id: chatId } } as any,
                $set: { updatedAt: new Date() }
            } as any
        );
        if (result.matchedCount === 0) {
            throw new Error(`User not found with userId: ${userId}`);
        }
        appLogger.log(`[MONGODB] ✅ Chat deleted successfully from user`);
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error deleting chat from user:`, error);
        throw error;
    }
}
