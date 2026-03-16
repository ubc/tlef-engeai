// src/routes/route-chat-app.ts

/**
 * route-chat-app.ts
 * @author: @gatahcha
 * @date: 2026-03-13
 * @latest backend version: 2.0.0
 * @description: Express routes for chat CRUD, send message, pin/unpin, dismiss unstruggle, restore. Integrates ChatApp, MongoDB, RAG.
 */

import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { loadConfig } from '../utils/config';
import { IDGenerator } from '../utils/unique-id-generator';
import { ChatMessage, Chat } from '../types/shared';
import { asyncHandlerWithAuth } from '../middleware/async-handler';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { ChatApp } from '../chat/chat-app';

import { getRandomYesResponse, getRandomNoResponse } from '../memory-agent/unstruggle-responses';
import { memoryAgent } from '../memory-agent/memory-agent';
import { stripQuestionUnstruggleTag } from '../utils/message-utils';
import { appLogger } from '../utils/logger';

// Load environment variables
dotenv.config();

const router = express.Router();

const appConfig = loadConfig();

const chatApp = new ChatApp(appConfig);

/**
 * SIGTERM signal handler
 * Cleans up chat timers on server shutdown
 */
process.on('SIGTERM', () => {
    appLogger.log('📴 Received SIGTERM signal, cleaning up chat timers...');
    chatApp.cleanup();
    process.exit(0);
});

/**
 * SIGINT signal handler
 * Cleans up chat timers on server shutdown
 */
process.on('SIGINT', () => {
    appLogger.log('📴 Received SIGINT signal, cleaning up chat timers...');
    chatApp.cleanup();
    process.exit(0);
});

/**
 * GET /user/chats/metadata
 * Load chat metadata for the authenticated user. Returns only chat titles, IDs, and basic info without full message history.
 *
 * @route GET /api/chat/user/chats/metadata
 * @returns {object} { success: boolean, chats?: array, error?: string }
 * @response 200 - Success
 * @response 400 - No active course selected
 * @response 401 - User not authenticated or not found
 * @response 500 - Failed to load user chat metadata
 */
router.get('/user/chats/metadata', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        const currentCourse = (req.session as any).currentCourse;
        const courseName = currentCourse?.courseName;
        
        appLogger.log('\n📊 LOADING USER CHAT METADATA:');
        appLogger.log('='.repeat(50));
        appLogger.log(`PUID: ${puid}`);
        appLogger.log(`Course Name: ${courseName}`);
        appLogger.log('='.repeat(50));
        
        if (!puid) {
            appLogger.log('❌ VALIDATION FAILED: PUID not found in session');
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }
        
        if (!courseName) {
            appLogger.log('❌ VALIDATION FAILED: Course name not found in session');
            return res.status(400).json({ 
                success: false, 
                error: 'No active course selected' 
            });
        }
        
        // Load chat metadata from MongoDB
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Get userId from GlobalUser using puid
        const globalUser = await mongoDB.findGlobalUserByPUID(puid);
        if (!globalUser || !globalUser.userId) {
            appLogger.log('❌ VALIDATION FAILED: GlobalUser not found for puid');
            return res.status(401).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        const userId = globalUser.userId;
        appLogger.log(`[CHAT-METADATA] Converting puid to userId: ${puid} -> ${userId}`);
        
        const chatMetadata = await mongoDB.getUserChatsMetadata(courseName, userId);
        
        appLogger.log(`✅ LOADED ${chatMetadata.length} CHAT METADATA FROM MONGODB`);
        appLogger.log('='.repeat(50));
        
        res.json({ 
            success: true, 
            chats: chatMetadata
        });
        
    } catch (error) {
        appLogger.error('❌ ERROR LOADING USER CHAT METADATA:', { error });
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load user chat metadata' 
        });
    }
}));

/**
 * GET /user/chats
 * Load all chats for the authenticated user from MongoDB.
 *
 * @route GET /api/chat/user/chats
 * @returns {object} { success: boolean, chats?: array, error?: string }
 * @response 200 - Success
 * @response 400 - No active course selected
 * @response 401 - User not authenticated or not found
 * @response 500 - Failed to load user chats
 */
router.get('/user/chats', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        const currentCourse = (req.session as any).currentCourse;
        const courseName = currentCourse?.courseName;
        
        //START DEBUG LOG : DEBUG-CODE(LOAD-CHATS-001)
        appLogger.log('\n📂 LOADING USER CHATS:');
        appLogger.log('='.repeat(50));
        appLogger.log(`PUID: ${puid}`);
        appLogger.log(`Course Name: ${courseName}`);
        appLogger.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(LOAD-CHATS-001)
        
        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(LOAD-CHATS-002)
            appLogger.log('❌ VALIDATION FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(LOAD-CHATS-002)
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }
        
        if (!courseName) {
            appLogger.log('❌ VALIDATION FAILED: Course name not found in session');
            return res.status(400).json({ 
                success: false, 
                error: 'No active course selected' 
            });
        }
        
        // Load chats from MongoDB
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Get userId from GlobalUser using puid
        const globalUser = await mongoDB.findGlobalUserByPUID(puid);
        if (!globalUser || !globalUser.userId) {
            appLogger.log('❌ VALIDATION FAILED: GlobalUser not found for puid');
            return res.status(401).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        const userId = globalUser.userId;
        appLogger.log(`[LOAD-CHATS] Converting puid to userId: ${puid} -> ${userId}`);
        
        const chats = await mongoDB.getUserChats(courseName, userId);
        
        //START DEBUG LOG : DEBUG-CODE(LOAD-CHATS-003)
        appLogger.log(`✅ LOADED ${chats.length} CHATS FROM MONGODB`);
        appLogger.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(LOAD-CHATS-003)
        
        res.json({ 
            success: true, 
            chats: chats
        });
        
    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(LOAD-CHATS-004)
        appLogger.error('❌ ERROR LOADING USER CHATS:', { error });
        //END DEBUG LOG : DEBUG-CODE(LOAD-CHATS-004)
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load user chats' 
        });
    }
}));

/**
 * POST /newchat
 * Create a new chat in memory and MongoDB.
 *
 * @route POST /api/chat/newchat
 * @param {string} userID - User ID (body)
 * @param {string} courseName - Course name (body)
 * @returns {object} { success: boolean, chatId?: string, initAssistantMessage?: object, chat?: object, error?: string }
 * @response 200 - Success
 * @response 400 - Missing required fields
 * @response 401 - User not authenticated
 * @response 500 - Failed to create new chat
 */
router.post('/newchat', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const userID = req.body.userID;
        const courseName = req.body.courseName;
        const date = new Date(); // the date is the current date inside the backend
        
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        
        //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-001)
        appLogger.log('\n🆕 NEW CHAT CREATION REQUEST:');
        appLogger.log('='.repeat(50));
        appLogger.log(`User ID: ${userID}`);
        appLogger.log(`Course Name: ${courseName}`);
        appLogger.log(`PUID from session: ${puid}`);
        appLogger.log(`Date: ${date}`);
        appLogger.log(`Timestamp: ${new Date().toISOString()}`);
        appLogger.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-001)
    
        
        if (!userID || !courseName || !date) {
            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-002)
            appLogger.log('❌ VALIDATION FAILED: Missing required fields for new chat');
            //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-002)
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: userID, courseName, and date are required' 
            });
        }

        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-003)
            appLogger.log('❌ VALIDATION FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-003)
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }

        // Actually create the chat using the ChatApp class FIRST
        const initRequest = await chatApp.initializeConversation(userID, courseName, date);
        const chatId = initRequest.chatId;
        
        // Use the proper welcome message from the backend (includes diagrams and course context)
        const backendWelcomeMessage = initRequest.initAssistantMessage;
        
        //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-004)
        appLogger.log('\n✅ NEW CHAT CREATED IN MEMORY:');
        appLogger.log('='.repeat(50));
        appLogger.log(`Generated Chat ID: ${chatId}`);
        appLogger.log(`Assistant Message ID: ${backendWelcomeMessage.id}`);
        appLogger.log(`Assistant Message Preview: "${backendWelcomeMessage.text.substring(0, 100)}..."`);
        appLogger.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-004)
        
        // Create Chat object to save to MongoDB
        const newChat: Chat = {
            id: chatId,
            courseName: courseName,
            topicOrWeekTitle: '', // Empty for now, will be set by user later
            itemTitle: 'New Chat', // Set initial title as "New Chat"
            messages: [backendWelcomeMessage], // Use the proper backend welcome message with diagrams
            isPinned: false,
            pinnedMessageId: null
        };
        
        // Save chat to MongoDB
        try {
            const mongoDB = await EngEAI_MongoDB.getInstance();
            
            // Get userId from GlobalUser using puid
            const globalUser = await mongoDB.findGlobalUserByPUID(puid);
            if (!globalUser || !globalUser.userId) {
                throw new Error(`GlobalUser not found for puid: ${puid}`);
            }
            
            const userId = globalUser.userId;
            
            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-005-PRE)
            appLogger.log(`[NEW-CHAT] Converting puid to userId: ${puid} -> ${userId}`);
            //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-005-PRE)
            
            await mongoDB.addChatToUser(courseName, userId, newChat);
            
            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-005)
            appLogger.log('✅ CHAT SAVED TO MONGODB SUCCESSFULLY');
            //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-005)
        } catch (dbError) {
            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-006)
            appLogger.error('⚠️ WARNING: Failed to save chat to MongoDB:', { error: dbError });
            appLogger.log('Chat created in memory but not persisted to database');
            //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-006)
            // Continue execution - chat is still in memory
        }
        
        // Return the complete response with the proper backend welcome message
        res.json({ 
            success: true, 
            chatId: chatId,
            initAssistantMessage: backendWelcomeMessage,
            chat: newChat // Return full chat object for frontend
        });
        
    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-007)
        appLogger.error('❌ ERROR CREATING NEW CHAT:', { error });
        //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-007)
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create new chat' 
        });
    }
}));


/**
 * POST /:chatId/dismiss-unstruggle
 * Remove <questionUnstruggle> tag from a bot message.
 *
 * @route POST /api/chat/:chatId/dismiss-unstruggle
 * @param {string} chatId - Chat ID (path param)
 * @param {string} messageId - ID of the bot message containing the unstruggle block (body)
 * @param {string} topic - Topic to dismiss (body)
 * @returns {object} { success: boolean, updatedText?: string, error?: string }
 * @response 200 - Success
 * @response 400 - messageId and topic required, or invalid dismiss request
 * @response 401 - User not found
 * @response 404 - Chat not found
 * @response 500 - Failed to dismiss unstruggle block
 */
router.post('/:chatId/dismiss-unstruggle', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const { messageId, topic } = req.body;

        const user = (req as any).user;
        const puid = user?.puid;
        const currentCourse = (req.session as any).currentCourse;
        const courseName = currentCourse?.courseName;

        const mongoDB = await EngEAI_MongoDB.getInstance();
        const globalUserFromDB = await mongoDB.findGlobalUserByPUID(puid);
        if (!globalUserFromDB?.userId) {
            return res.status(401).json({ success: false, error: 'User not found in database' });
        }
        const userId = globalUserFromDB.userId;

        if (!messageId || !topic) {
            return res.status(400).json({ success: false, error: 'messageId and topic are required' });
        }

        if (!chatApp.validateChatExists(chatId)) {
            return res.status(404).json({ success: false, error: 'Chat not found' });
        }

        const chatHistory = chatApp.getChatHistory(chatId);
        const lastBotMessage = chatHistory.filter(m => m.sender === 'bot').pop();

        const hasTag = lastBotMessage?.text.includes('<questionUnstruggle');
        const topicMatch = lastBotMessage?.text.match(/Topic=["']([^"']+)["']/);
        const prevTopic = topicMatch?.[1];

        if (!lastBotMessage || !hasTag || prevTopic !== topic || lastBotMessage.id !== messageId) {
            return res.status(400).json({ success: false, error: 'Invalid dismiss request' });
        }

        const newText = stripQuestionUnstruggleTag(lastBotMessage.text, topic);

        await mongoDB.updateMessageInChat(courseName, userId, chatId, messageId, newText);
        chatApp.updateMessageInChat(chatId, messageId, newText);

        return res.json({ success: true, updatedText: newText });
    } catch (error) {
        appLogger.error('❌ Error dismissing unstruggle block:', { error });
        res.status(500).json({ success: false, error: 'Failed to dismiss unstruggle block' });
    }
}));

/**
 * POST /:chatId
 * Send a user message and receive AI response. Handles unstruggle responses and regular AI chat.
 *
 * @route POST /api/chat/:chatId
 * @param {string} chatId - Chat ID (path param)
 * @param {string} message - User message text (body)
 * @param {string} [userId] - User ID, optional; session/MongoDB used as source of truth (body)
 * @returns {object} { success: boolean, userMessage?: object, assistantMessage?: object, error?: string }
 * @response 200 - Success
 * @response 400 - Message required, or no active course selected
 * @response 401 - User not authenticated or not found
 * @response 404 - Chat not found
 * @response 500 - AI communication failed or failed to process message
 */
router.post('/:chatId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const { message, userId: userIdFromBody } = req.body; // Rename to avoid conflict
        
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        const globalUser = (req.session as any).globalUser;
        const currentCourse = (req.session as any).currentCourse;
        
        // Get courseName from session (source of truth), fallback to request body if needed
        const courseName = currentCourse?.courseName || req.body.courseName;
        
        // Get userId from MongoDB using puid (source of truth for all operations)
        // This ensures consistency between memory agent and MongoDB operations
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const globalUserFromDB = await mongoDB.findGlobalUserByPUID(puid);
        if (!globalUserFromDB || !globalUserFromDB.userId) {
            return res.status(401).json({ 
                success: false, 
                error: 'User not found in database' 
            });
        }
        const userId = globalUserFromDB.userId; // Use this consistently throughout
        
        //START DEBUG LOG : DEBUG-CODE(SEND-MSG-001)
        appLogger.log('\n💬 SENDING MESSAGE:');
        appLogger.log('='.repeat(50));
        appLogger.log(`Chat ID: ${chatId}`);
        appLogger.log(`User ID (from body): ${userIdFromBody}`);
        appLogger.log(`User ID (from MongoDB): ${userId}`);
        appLogger.log(`PUID: ${puid}`);
        appLogger.log(`Course: ${courseName}`);
        appLogger.log(`Message: ${message.substring(0, 100)}...`);
        appLogger.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(SEND-MSG-001)
        
        // Validate input
        if (!message) {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-002)
            appLogger.log('❌ VALIDATION FAILED: Missing message');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-002)
            return res.status(400).json({ 
                success: false, 
                error: 'Message is required' 
            });
        }

        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-003)
            appLogger.log('❌ VALIDATION FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-003)
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }
        
        // userId already validated above when fetching from MongoDB

        // Validate chat exists (or restore from database if evicted from memory)
        if (!chatApp.validateChatExists(chatId)) {
            // Attempt to restore chat from database before returning 404
            if (!courseName) {
                return res.status(400).json({
                    success: false,
                    error: 'No active course selected'
                });
            }
            const restored = await chatApp.restoreChatFromDatabase(chatId, courseName, userId);
            if (!restored) {
                //START DEBUG LOG : DEBUG-CODE(SEND-MSG-004)
                appLogger.log('❌ VALIDATION FAILED: Chat not found in memory and restore failed');
                //END DEBUG LOG : DEBUG-CODE(SEND-MSG-004)
                return res.status(404).json({
                    success: false,
                    error: 'Chat not found'
                });
            }
        }

        // Check if this is a questionUnstruggle response (natural language format)
        // Format: "yes, I am confident with [topic]" or "I might need some practice with [topic]"
        const yesPattern = /yes,?\s+I\s+(?:am\s+)?confident\s+with\s+["'](.+?)["']/i;
        const noPattern = /I\s+might\s+need\s+some\s+practice\s+with\s+["'](.+?)["']/i;
        
        const yesMatch = message.match(yesPattern);
        const noMatch = message.match(noPattern);
        
        if (yesMatch || noMatch) {
            const topic = yesMatch ? yesMatch[1] : noMatch![1];
            const isConfident = !!yesMatch;
            
            //START DEBUG LOG : DEBUG-CODE(UNSTRUGGLE-001)
            appLogger.log(`\n🔄 PROCESSING UNSTRUGGLE RESPONSE:`);
            appLogger.log(`Message: ${message}`);
            appLogger.log(`Topic: ${topic}`);
            appLogger.log(`Response: ${isConfident ? 'Yes (confident)' : 'No (needs practice)'}`);
            //END DEBUG LOG : DEBUG-CODE(UNSTRUGGLE-001)
            
            // Get chat history to check if previous message has same topic
            const chatHistory = chatApp.getChatHistory(chatId);
            const lastBotMessage = chatHistory
                .filter(msg => msg.sender === 'bot')
                .pop();
            
            // Validate: Check if last bot message contains questionUnstruggle with same topic
            // This prevents false positives from natural conversation
            const hasUnstruggleTag = lastBotMessage?.text.includes(`<questionUnstruggle`);
            const topicMatch = lastBotMessage?.text.match(/Topic=["']([^"']+)["']/);
            const prevTopic = topicMatch?.[1];
            
            const isValidUnstruggle = hasUnstruggleTag && 
                                    prevTopic === topic;
            
            if (isValidUnstruggle) {
                //START DEBUG LOG : DEBUG-CODE(UNSTRUGGLE-VALIDATION)
                appLogger.log('✅ Unstruggle validation passed - previous message matches');
                //END DEBUG LOG : DEBUG-CODE(UNSTRUGGLE-VALIDATION)
                
                // Get hardcoded response (no LLM call)
                let responseText: string;
                
                if (isConfident) {
                    // User is confident - remove struggle word and send yes response
                    await memoryAgent.removeStruggleWord(userId.toString(), courseName, topic);
                    responseText = getRandomYesResponse();
                } else {
                    // User needs more practice - send no response
                    responseText = getRandomNoResponse();
                }
                
                // Create messages
                const currentDate = new Date();
                const idGenerator = IDGenerator.getInstance();
                const userMessageId = idGenerator.messageID(message, chatId, currentDate);
                const assistantMessageId = idGenerator.messageID(responseText, chatId, currentDate);
                
                const userMessage: ChatMessage = {
                    id: userMessageId,
                    sender: 'user',
                    userId: userId,
                    courseName: courseName,
                    text: message,
                    timestamp: Date.now()
                };
                
                const assistantMessage: ChatMessage = {
                    id: assistantMessageId,
                    sender: 'bot',
                    userId: userId,
                    courseName: courseName,
                    text: responseText,
                    timestamp: Date.now()
                };
                
                // Save to MongoDB
                try {
                    await mongoDB.addMessageToChat(courseName, userId, chatId, userMessage);
                    await mongoDB.addMessageToChat(courseName, userId, chatId, assistantMessage);
                    //START DEBUG LOG : DEBUG-CODE(UNSTRUGGLE-002)
                    appLogger.log('✅ Unstruggle messages saved to MongoDB');
                    //END DEBUG LOG : DEBUG-CODE(UNSTRUGGLE-002)
                } catch (dbError) {
                    appLogger.error('⚠️ WARNING: Failed to save unstruggle messages to MongoDB:', { error: dbError });
                }
                
                // Return response without sending to LLM
                return res.json({
                    success: true,
                    userMessage: userMessage,
                    assistantMessage: assistantMessage
                });
            } else {
                // Previous message doesn't match - treat as regular message
                //START DEBUG LOG : DEBUG-CODE(UNSTRUGGLE-003)
                appLogger.log('⚠️ Unstruggle pattern detected but validation failed:');
                appLogger.log(`   Has unstruggle tag: ${hasUnstruggleTag}`);
                appLogger.log(`   Previous topic: ${prevTopic || 'none'}`);
                appLogger.log(`   User topic: ${topic}`);
                appLogger.log('   Treating as regular message.');
                //END DEBUG LOG : DEBUG-CODE(UNSTRUGGLE-003)
            }
        }

        // REAL AI COMMUNICATION (NO STREAMING - WAIT FOR COMPLETE RESPONSE)
        try {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-005)
            appLogger.log('🤖 Waiting for AI response...');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-005)
            
            // Send message through ChatApp and wait for complete response
            // Use userId from MongoDB (convert to string for sendUserMessage signature)
            // This ensures consistency with memory agent and MongoDB operations
            if (!courseName) {
                return res.status(400).json({
                    success: false,
                    error: 'No active course selected'
                });
            }
            
            const assistantMessage = await chatApp.sendUserMessage(
                message,
                chatId,
                userId.toString(), // Use userId from MongoDB (consistent source)
                courseName,
                () => {} // Empty callback - not streaming to client
            );

            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-006)
            appLogger.log('✅ AI response received');
            appLogger.log('📊 Response length:', assistantMessage.text.length, 'characters');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-006)

            // Create the user message object (sendUserMessage adds it internally but we need to save it to DB)
            const currentDate = new Date();
            const idGenerator = IDGenerator.getInstance();
            const userMessageId = idGenerator.messageID(message, chatId, currentDate);
            
            const userMessage: ChatMessage = {
                id: userMessageId,
                sender: 'user',
                userId: userId, // Use userId from MongoDB (already fetched above)
                courseName: courseName,
                text: message,
                timestamp: Date.now()
            };

            // Save both messages to MongoDB
            // userId already fetched from MongoDB above (consistent source)
            appLogger.log(`[SEND-MSG] Using userId from MongoDB: ${puid} -> ${userId}`);
            
            try {
                // Save user message
                await mongoDB.addMessageToChat(courseName, userId, chatId, userMessage);
                
                //START DEBUG LOG : DEBUG-CODE(SEND-MSG-007)
                appLogger.log('✅ User message saved to MongoDB');
                appLogger.log('   User message ID:', userMessage.id);
                appLogger.log('   Text:', userMessage.text.substring(0, 50) + '...');
                //END DEBUG LOG : DEBUG-CODE(SEND-MSG-007)
                
                // Save assistant message
                await mongoDB.addMessageToChat(courseName, userId, chatId, assistantMessage);
                
                //START DEBUG LOG : DEBUG-CODE(SEND-MSG-008)
                appLogger.log('✅ Assistant message saved to MongoDB');
                appLogger.log('   Assistant message ID:', assistantMessage.id);
                appLogger.log('   Text:', assistantMessage.text.substring(0, 50) + '...');
                //END DEBUG LOG : DEBUG-CODE(SEND-MSG-008)
                
                // Check if chat title needs updating (first user-AI exchange)
                await chatApp.updateChatTitleIfNeeded(chatId, assistantMessage.text, courseName, userId);
                
                // Reset timer after successful message processing
                chatApp.resetChatTimer(chatId);
                
            } catch (dbError) {
                //START DEBUG LOG : DEBUG-CODE(SEND-MSG-009)
                appLogger.error('⚠️ WARNING: Failed to save messages to MongoDB:', { error: dbError });
                appLogger.log('Messages in memory but not persisted to database');
                //END DEBUG LOG : DEBUG-CODE(SEND-MSG-009)
                // Continue execution - messages are still in memory
            }

            // Return the complete response (no streaming)
            res.json({ 
                success: true, 
                userMessage: userMessage,
                assistantMessage: assistantMessage
            });

        } catch (aiError) {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-010)
            appLogger.error('❌ AI Communication Error:', { error: aiError });
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-010)
            
            return res.status(500).json({ 
                success: false, 
                error: aiError instanceof Error ? aiError.message : 'AI communication failed'
            });
        }

    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(SEND-MSG-011)
        appLogger.error('❌ ERROR IN SEND MESSAGE ENDPOINT:', { error });
        //END DEBUG LOG : DEBUG-CODE(SEND-MSG-011)
        res.status(500).json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Failed to process message' 
        });
    }
}));

/**
 * GET /:chatId/history
 * Returns messages from in-memory chat history.
 *
 * @route GET /api/chat/:chatId/history
 * @param {string} chatId - Chat ID (path param)
 * @returns {object} { success: boolean, chatId?: string, history?: array, messageCount?: number, error?: string }
 * @response 200 - Success
 * @response 404 - Chat not found
 * @response 500 - Failed to get chat history
 */
router.get('/:chatId/history', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        
        // Validate chat exists
        if (!chatApp.validateChatExists(chatId)) {
            return res.status(404).json({ 
                success: false, 
                error: 'Chat not found' 
            });
        }

        // Get chat history
        const history = chatApp.getChatHistory(chatId);
        
        res.json({ 
            success: true, 
            chatId: chatId,
            history: history,
            messageCount: history.length
        });
        
    } catch (error) {
        appLogger.error('Error getting chat history:', { error });
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get chat history' 
        });
    }
}));


/**
 * GET /:chatId/message/:messageId
 * Returns a single message from chat history.
 *
 * @route GET /api/chat/:chatId/message/:messageId
 * @param {string} chatId - Chat ID (path param)
 * @param {string} messageId - Message ID (path param)
 * @returns {object} { success: boolean, message?: object, error?: string }
 * @response 200 - Success
 * @response 404 - Chat or message not found
 * @response 500 - Failed to get message
 */
router.get('/:chatId/message/:messageId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId, messageId } = req.params;
        
        // Validate chat exists
        if (!chatApp.validateChatExists(chatId)) {
            return res.status(404).json({ 
                success: false, 
                error: 'Chat not found' 
            });
        }

        // Get chat history and find the specific message
        const history = chatApp.getChatHistory(chatId);
        const message = history.find(msg => msg.id === messageId);
        
        if (!message) {
            return res.status(404).json({ 
                success: false, 
                error: 'Message not found' 
            });
        }
        
        res.json({ 
            success: true, 
            message: message
        });
        
    } catch (error) {
        appLogger.error('Error getting message:', { error });
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get message' 
        });
    }
}));

/**
 * POST /restore/:chatId
 * Load chat from MongoDB into memory for continued conversation.
 *
 * @route POST /api/chat/restore/:chatId
 * @param {string} chatId - Chat ID to restore (path param)
 * @returns {object} { success: boolean, message?: string, chatId?: string, chat?: object, error?: string }
 * @response 200 - Success
 * @response 400 - Chat ID required or no active course selected
 * @response 401 - User not authenticated or not found
 * @response 404 - Chat not found or could not be restored
 * @response 500 - Internal server error
 */
router.post('/restore/:chatId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        const currentCourse = (req.session as any).currentCourse;
        const courseName = currentCourse?.courseName;
        
        appLogger.log('\n🔄 CHAT RESTORATION REQUEST:');
        appLogger.log('='.repeat(50));
        appLogger.log(`Chat ID: ${chatId}`);
        appLogger.log(`PUID: ${puid}`);
        appLogger.log(`Course: ${courseName}`);
        appLogger.log('='.repeat(50));
        
        // Validate input
        if (!chatId) {
            appLogger.log('❌ RESTORATION FAILED: Chat ID is required');
            return res.status(400).json({
                success: false,
                error: 'Chat ID is required'
            });
        }
        
        if (!puid) {
            appLogger.log('❌ RESTORATION FAILED: PUID not found in session');
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }
        
        if (!courseName) {
            appLogger.log('❌ RESTORATION FAILED: Course name not found in session');
            return res.status(400).json({
                success: false,
                error: 'No active course selected'
            });
        }
        
        // Get userId from GlobalUser using puid (needed for restore and chat retrieval)
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const globalUser = await mongoDB.findGlobalUserByPUID(puid);
        if (!globalUser || !globalUser.userId) {
            appLogger.log('❌ RESTORATION FAILED: GlobalUser not found for puid');
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const userId = globalUser.userId;
        appLogger.log(`[RESTORE-CHAT] Converting puid to userId: ${puid} -> ${userId}`);
        
        // Restore chat from database
        const restored = await chatApp.restoreChatFromDatabase(chatId, courseName, userId);
        
        if (restored) {
            appLogger.log(`✅ Chat ${chatId} restored successfully`);
            
            // Get the restored chat data from MongoDB to return in response
            const userChats = await mongoDB.getUserChats(courseName, userId);
            const chatData = userChats.find(chat => chat.id === chatId);
            
            res.json({
                success: true,
                message: 'Chat restored successfully',
                chatId: chatId,
                chat: chatData  // Add full chat object to response
            });
        } else {
            appLogger.log(`❌ Chat ${chatId} restoration failed`);
            res.status(404).json({
                success: false,
                error: 'Chat not found or could not be restored'
            });
        }
        
    } catch (error) {
        appLogger.error('❌ CHAT RESTORATION ERROR:', { error });
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}));

/**
 * DELETE /:chatId
 * Soft-delete chat. Marks as deleted in MongoDB and removes from memory.
 *
 * @route DELETE /api/chat/:chatId
 * @param {string} chatId - Chat ID to delete (path param)
 * @returns {object} { success: boolean, message?: string, chatId?: string, error?: string }
 * @response 200 - Success
 * @response 400 - Chat ID required or no active course selected
 * @response 401 - User not authenticated or not found
 * @response 404 - Chat not found or already deleted
 * @response 500 - Internal server error
 */
router.delete('/:chatId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        const currentCourse = (req.session as any).currentCourse;
        const courseName = currentCourse?.courseName;
        
        //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-001)
        appLogger.log('\n🗑️ SOFT DELETE CHAT REQUEST:');
        appLogger.log('='.repeat(50));
        appLogger.log(`Chat ID: ${chatId}`);
        appLogger.log(`PUID: ${puid}`);
        appLogger.log(`Course: ${courseName}`);
        appLogger.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-001)
        
        // Validate input
        if (!chatId) {
            //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-002)
            appLogger.log('❌ SOFT DELETE FAILED: Chat ID is required');
            //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-002)
            return res.status(400).json({
                success: false,
                error: 'Chat ID is required'
            });
        }
        
        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-003)
            appLogger.log('❌ SOFT DELETE FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-003)
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }
        
        if (!courseName) {
            appLogger.log('❌ VALIDATION FAILED: Course name not found in session');
            return res.status(400).json({
                success: false,
                error: 'No active course selected'
            });
        }
        
        // Stop timer and remove from memory if exists (optional cleanup)
        // This doesn't block deletion if chat is not in memory (e.g., after server restart)
        if (chatApp.validateChatExists(chatId)) {
            chatApp.stopChatTimer(chatId);
            const memoryDeleted = chatApp.deleteChat(chatId);
            //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-004)
            appLogger.log(`✅ Chat ${chatId} removed from server memory`);
            //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-004)
        } else {
            //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-005)
            appLogger.log(`ℹ️ Chat ${chatId} not in memory (may have been loaded from database after restart)`);
            //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-005)
        }
        
        // Mark as deleted in database (soft delete)
        // This always happens, regardless of memory state
        try {
            const mongoDB = await EngEAI_MongoDB.getInstance();
            
            // Get userId from GlobalUser using puid
            const globalUser = await mongoDB.findGlobalUserByPUID(puid);
            if (!globalUser || !globalUser.userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not found'
                });
            }
            
            const userId = globalUser.userId;
            await mongoDB.markChatAsDeleted(courseName, userId, chatId);
            
            //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-006)
            appLogger.log(`✅ Chat ${chatId} marked as deleted in database`);
            //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-006)
            
            res.json({
                success: true,
                message: 'Chat deleted successfully',
                chatId: chatId
            });
        } catch (dbError) {
            //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-007)
            appLogger.error('⚠️ Database error during soft delete:', { error: dbError });
            //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-007)
            res.status(404).json({
                success: false,
                error: 'Chat not found or already deleted'
            });
        }
        
    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-008)
        appLogger.error('❌ SOFT DELETE ERROR:', { error });
        //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-008)
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}));

/**
 * PUT /:chatId/pin
 * Update chat pin status in MongoDB.
 *
 * @route PUT /api/chat/:chatId/pin
 * @param {string} chatId - Chat ID (path param)
 * @param {boolean} isPinned - Whether chat should be pinned (body)
 * @returns {object} { success: boolean, message?: string, chatId?: string, isPinned?: boolean, error?: string }
 * @response 200 - Success
 * @response 400 - Chat ID required, isPinned must be boolean, or no active course selected
 * @response 401 - User not authenticated or not found
 * @response 500 - Failed to update pin status or internal server error
 */
router.put('/:chatId/pin', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const { isPinned } = req.body;

        //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-001)
        appLogger.log('\n📌 PIN CHAT REQUEST:');
        appLogger.log('='.repeat(50));
        appLogger.log(`Chat ID: ${chatId}`);
        appLogger.log(`Pin Status: ${isPinned}`);
        appLogger.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-001)

        // Validate input
        if (!chatId) {
            //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-002)
            appLogger.log('❌ PIN CHAT FAILED: Chat ID is required');
            //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-002)
            return res.status(400).json({
                success: false,
                error: 'Chat ID is required'
            });
        }

        if (typeof isPinned !== 'boolean') {
            //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-003)
            appLogger.log('❌ PIN CHAT FAILED: isPinned must be a boolean');
            //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-003)
            return res.status(400).json({
                success: false,
                error: 'isPinned must be a boolean value'
            });
        }

        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        const currentCourse = (req.session as any).currentCourse;
        const courseName = currentCourse?.courseName;

        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-004)
            appLogger.log('❌ PIN CHAT FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-004)
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        if (!courseName) {
            //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-005)
            appLogger.log('❌ PIN CHAT FAILED: Course name not found in session');
            //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-005)
            return res.status(400).json({
                success: false,
                error: 'No active course selected'
            });
        }

        // Update chat pin status in database
        try {
            const mongoDB = await EngEAI_MongoDB.getInstance();

            // Get userId from GlobalUser using puid
            const globalUser = await mongoDB.findGlobalUserByPUID(puid);
            if (!globalUser || !globalUser.userId) {
                //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-006)
                appLogger.log('❌ PIN CHAT FAILED: User not found in database');
                //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-006)
                return res.status(401).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const userId = globalUser.userId;
            await mongoDB.updateChatPinStatus(courseName, userId, chatId, isPinned);

            //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-007)
            appLogger.log(`✅ Chat ${chatId} pin status updated to ${isPinned} in database`);
            //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-007)

            res.json({
                success: true,
                message: `Chat ${isPinned ? 'pinned' : 'unpinned'} successfully`,
                chatId: chatId,
                isPinned: isPinned
            });
        } catch (dbError) {
            //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-008)
            appLogger.error('⚠️ Database error during pin update:', { error: dbError });
            //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-008)
            res.status(500).json({
                success: false,
                error: 'Failed to update chat pin status'
            });
        }
    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-009)
        appLogger.error('🚨 Unexpected error in pin chat endpoint:', { error });
        //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-009)
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}));

/**
 * GET /test
 * Health check for chat API.
 *
 * @route GET /api/chat/test
 * @returns {object} { success: boolean, message: string, timestamp: string, activeChats: number }
 * @response 200 - Success
 */
router.get('/test', async (req: Request, res: Response) => {
    res.json({ 
        success: true, 
        message: 'Chat API is working',
        timestamp: new Date().toISOString(),
        activeChats: chatApp['chatID'].length
    });
});


export default router;

