/**
 *
 * This module provides Express.js routes for integrating with Ollama local LLM server
 * to enable AI-powered chat functionality for the EngE-AI platform with RAG capabilities.
 *
 * Key Features:
 * - Streaming chat responses from local Ollama instance
 * - RAG (Retrieval-Augmented Generation) with document similarity search
 * - Document retrieval from Qdrant vector database
 * - Context injection with text decorators for retrieved documents
 * - Support for conversational message history
 * - Real-time response streaming for better UX
 * - Configurable model selection (currently llama3.1:latest)
 *
 * API Endpoints:
 * - POST /chat - Send messages to Ollama with RAG and stream responses
 * - POST /chat/rag - Enhanced chat with RAG functionality
 * - GET /test - Test endpoint for API validation
 *
 * Dependencies:
 * - Ollama server running on localhost:11434
 * - Qdrant vector database for document retrieval
 * - Compatible LLM model (llama3.1:latest) installed in Ollama
 *
 * @author: EngE-AI Team
 * @version: 2.0.0
 * @since: 2025-01-27
 * 
 */

import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import {loadConfig } from './config';
import { IDGenerator } from '../functions/unique-id-generator';
import { ChatMessage, Chat } from '../functions/types';
import { asyncHandlerWithAuth } from '../middleware/asyncHandler';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';
import { ChatApp } from '../functions/ChatApp';

import { getRandomYesResponse, getRandomNoResponse } from '../memory-agent/unstruggle-responses';
import { memoryAgent } from '../memory-agent/memory-agent';
import { stripQuestionUnstruggleTag } from '../utils/message-utils';

// Load environment variables
dotenv.config();

const router = express.Router();

const appConfig = loadConfig();

const chatApp = new ChatApp(appConfig);

// Add process handlers for graceful shutdown
process.on('SIGTERM', () => {
    console.log('📴 Received SIGTERM signal, cleaning up chat timers...');
    chatApp.cleanup();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 Received SIGINT signal, cleaning up chat timers...');
    chatApp.cleanup();
    process.exit(0);
});

// console.log(`DEBUG #666: Chat exists: ${chatApp.validateChatExists('1234567890')}`);

/**
 * Load chat metadata for the authenticated user (REQUIRES AUTH)
 * Returns only chat titles, IDs, and basic info without full message history
 * 
 * @returns Array of user's chat metadata from MongoDB
 */
router.get('/user/chats/metadata', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        const currentCourse = (req.session as any).currentCourse;
        const courseName = currentCourse?.courseName;
        
        console.log('\n📊 LOADING USER CHAT METADATA:');
        console.log('='.repeat(50));
        console.log(`PUID: ${puid}`);
        console.log(`Course Name: ${courseName}`);
        console.log('='.repeat(50));
        
        if (!puid) {
            console.log('❌ VALIDATION FAILED: PUID not found in session');
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }
        
        if (!courseName) {
            console.log('❌ VALIDATION FAILED: Course name not found in session');
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
            console.log('❌ VALIDATION FAILED: GlobalUser not found for puid');
            return res.status(401).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        const userId = globalUser.userId;
        console.log(`[CHAT-METADATA] Converting puid to userId: ${puid} -> ${userId}`);
        
        const chatMetadata = await mongoDB.getUserChatsMetadata(courseName, userId);
        
        console.log(`✅ LOADED ${chatMetadata.length} CHAT METADATA FROM MONGODB`);
        console.log('='.repeat(50));
        
        res.json({ 
            success: true, 
            chats: chatMetadata
        });
        
    } catch (error) {
        console.error('❌ ERROR LOADING USER CHAT METADATA:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load user chat metadata' 
        });
    }
}));

/**
 * Load all chats for the authenticated user (REQUIRES AUTH)
 * 
 * @returns Array of user's chats from MongoDB
 */
router.get('/user/chats', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        const currentCourse = (req.session as any).currentCourse;
        const courseName = currentCourse?.courseName;
        
        //START DEBUG LOG : DEBUG-CODE(LOAD-CHATS-001)
        console.log('\n📂 LOADING USER CHATS:');
        console.log('='.repeat(50));
        console.log(`PUID: ${puid}`);
        console.log(`Course Name: ${courseName}`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(LOAD-CHATS-001)
        
        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(LOAD-CHATS-002)
            console.log('❌ VALIDATION FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(LOAD-CHATS-002)
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }
        
        if (!courseName) {
            console.log('❌ VALIDATION FAILED: Course name not found in session');
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
            console.log('❌ VALIDATION FAILED: GlobalUser not found for puid');
            return res.status(401).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        const userId = globalUser.userId;
        console.log(`[LOAD-CHATS] Converting puid to userId: ${puid} -> ${userId}`);
        
        const chats = await mongoDB.getUserChats(courseName, userId);
        
        //START DEBUG LOG : DEBUG-CODE(LOAD-CHATS-003)
        console.log(`✅ LOADED ${chats.length} CHATS FROM MONGODB`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(LOAD-CHATS-003)
        
        res.json({ 
            success: true, 
            chats: chats
        });
        
    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(LOAD-CHATS-004)
        console.error('❌ ERROR LOADING USER CHATS:', error);
        //END DEBUG LOG : DEBUG-CODE(LOAD-CHATS-004)
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load user chats' 
        });
    }
}));

/**
 * create an new chat for user (REQUIRES AUTH)
 * 
 * @param userID - The user ID
 * @param courseName - The name of the course
 * @param date - The date of the chat
 * @returns The new chat ID
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
        console.log('\n🆕 NEW CHAT CREATION REQUEST:');
        console.log('='.repeat(50));
        console.log(`User ID: ${userID}`);
        console.log(`Course Name: ${courseName}`);
        console.log(`PUID from session: ${puid}`);
        console.log(`Date: ${date}`);
        console.log(`Timestamp: ${new Date().toISOString()}`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-001)
    
        
        if (!userID || !courseName || !date) {
            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-002)
            console.log('❌ VALIDATION FAILED: Missing required fields for new chat');
            //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-002)
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: userID, courseName, and date are required' 
            });
        }

        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-003)
            console.log('❌ VALIDATION FAILED: PUID not found in session');
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
        console.log('\n✅ NEW CHAT CREATED IN MEMORY:');
        console.log('='.repeat(50));
        console.log(`Generated Chat ID: ${chatId}`);
        console.log(`Assistant Message ID: ${backendWelcomeMessage.id}`);
        console.log(`Assistant Message Preview: "${backendWelcomeMessage.text.substring(0, 100)}..."`);
        console.log('='.repeat(50));
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
            console.log(`[NEW-CHAT] Converting puid to userId: ${puid} -> ${userId}`);
            //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-005-PRE)
            
            await mongoDB.addChatToUser(courseName, userId, newChat);
            
            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-005)
            console.log('✅ CHAT SAVED TO MONGODB SUCCESSFULLY');
            //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-005)
        } catch (dbError) {
            //START DEBUG LOG : DEBUG-CODE(NEW-CHAT-006)
            console.error('⚠️ WARNING: Failed to save chat to MongoDB:', dbError);
            console.log('Chat created in memory but not persisted to database');
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
        console.error('❌ ERROR CREATING NEW CHAT:', error);
        //END DEBUG LOG : DEBUG-CODE(NEW-CHAT-007)
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create new chat' 
        });
    }
}));

/**
 * Dismiss unstruggle block endpoint (REQUIRES AUTH)
 * Hides the "Do you think you're confident with the topic of X?" block when user clicks "No, maybe later"
 * Updates the bot message in MongoDB by removing the <questionUnstruggle> tag
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
        console.error('❌ Error dismissing unstruggle block:', error);
        res.status(500).json({ success: false, error: 'Failed to dismiss unstruggle block' });
    }
}));

/**
 * Send message endpoint (REQUIRES AUTH) - Simple request-response, no streaming
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
        console.log('\n💬 SENDING MESSAGE:');
        console.log('='.repeat(50));
        console.log(`Chat ID: ${chatId}`);
        console.log(`User ID (from body): ${userIdFromBody}`);
        console.log(`User ID (from MongoDB): ${userId}`);
        console.log(`PUID: ${puid}`);
        console.log(`Course: ${courseName}`);
        console.log(`Message: ${message.substring(0, 100)}...`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(SEND-MSG-001)
        
        // Validate input
        if (!message) {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-002)
            console.log('❌ VALIDATION FAILED: Missing message');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-002)
            return res.status(400).json({ 
                success: false, 
                error: 'Message is required' 
            });
        }

        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-003)
            console.log('❌ VALIDATION FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-003)
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated' 
            });
        }
        
        // userId already validated above when fetching from MongoDB

        // Validate chat exists
        if (!chatApp.validateChatExists(chatId)) {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-004)
            console.log('❌ VALIDATION FAILED: Chat not found in memory');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-004)
            return res.status(404).json({ 
                success: false, 
                error: 'Chat not found' 
            });
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
            console.log(`\n🔄 PROCESSING UNSTRUGGLE RESPONSE:`);
            console.log(`Message: ${message}`);
            console.log(`Topic: ${topic}`);
            console.log(`Response: ${isConfident ? 'Yes (confident)' : 'No (needs practice)'}`);
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
                console.log('✅ Unstruggle validation passed - previous message matches');
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
                    console.log('✅ Unstruggle messages saved to MongoDB');
                    //END DEBUG LOG : DEBUG-CODE(UNSTRUGGLE-002)
                } catch (dbError) {
                    console.error('⚠️ WARNING: Failed to save unstruggle messages to MongoDB:', dbError);
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
                console.log('⚠️ Unstruggle pattern detected but validation failed:');
                console.log(`   Has unstruggle tag: ${hasUnstruggleTag}`);
                console.log(`   Previous topic: ${prevTopic || 'none'}`);
                console.log(`   User topic: ${topic}`);
                console.log('   Treating as regular message.');
                //END DEBUG LOG : DEBUG-CODE(UNSTRUGGLE-003)
            }
        }

        // REAL AI COMMUNICATION (NO STREAMING - WAIT FOR COMPLETE RESPONSE)
        try {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-005)
            console.log('🤖 Waiting for AI response...');
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
            console.log('✅ AI response received');
            console.log('📊 Response length:', assistantMessage.text.length, 'characters');
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
            console.log(`[SEND-MSG] Using userId from MongoDB: ${puid} -> ${userId}`);
            
            try {
                // Save user message
                await mongoDB.addMessageToChat(courseName, userId, chatId, userMessage);
                
                //START DEBUG LOG : DEBUG-CODE(SEND-MSG-007)
                console.log('✅ User message saved to MongoDB');
                console.log('   User message ID:', userMessage.id);
                console.log('   Text:', userMessage.text.substring(0, 50) + '...');
                //END DEBUG LOG : DEBUG-CODE(SEND-MSG-007)
                
                // Save assistant message
                await mongoDB.addMessageToChat(courseName, userId, chatId, assistantMessage);
                
                //START DEBUG LOG : DEBUG-CODE(SEND-MSG-008)
                console.log('✅ Assistant message saved to MongoDB');
                console.log('   Assistant message ID:', assistantMessage.id);
                console.log('   Text:', assistantMessage.text.substring(0, 50) + '...');
                //END DEBUG LOG : DEBUG-CODE(SEND-MSG-008)
                
                // Check if chat title needs updating (first user-AI exchange)
                await chatApp.updateChatTitleIfNeeded(chatId, assistantMessage.text, courseName, userId);
                
                // Reset timer after successful message processing
                chatApp.resetChatTimer(chatId);
                
            } catch (dbError) {
                //START DEBUG LOG : DEBUG-CODE(SEND-MSG-009)
                console.error('⚠️ WARNING: Failed to save messages to MongoDB:', dbError);
                console.log('Messages in memory but not persisted to database');
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
            console.error('❌ AI Communication Error:', aiError);
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-010)
            
            return res.status(500).json({ 
                success: false, 
                error: aiError instanceof Error ? aiError.message : 'AI communication failed'
            });
        }

    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(SEND-MSG-011)
        console.error('❌ ERROR IN SEND MESSAGE ENDPOINT:', error);
        //END DEBUG LOG : DEBUG-CODE(SEND-MSG-011)
        res.status(500).json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Failed to process message' 
        });
    }
}));

/**
 * Get chat history for a specific chat (REQUIRES AUTH)
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
        console.error('Error getting chat history:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get chat history' 
        });
    }
}));

/**
 * Get a specific message from a chat (REQUIRES AUTH)
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
        console.error('Error getting message:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get message' 
        });
    }
}));

/**
 * Restore a chat from MongoDB (REQUIRES AUTH)
 * 
 * Loads a past chat from MongoDB into memory with full conversation context
 * so the user can continue chatting with that conversation.
 * 
 * @param chatId - The chat ID to restore
 * @returns JSON response with restoration status
 */
router.post('/restore/:chatId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        const currentCourse = (req.session as any).currentCourse;
        const courseName = currentCourse?.courseName;
        
        console.log('\n🔄 CHAT RESTORATION REQUEST:');
        console.log('='.repeat(50));
        console.log(`Chat ID: ${chatId}`);
        console.log(`PUID: ${puid}`);
        console.log(`Course: ${courseName}`);
        console.log('='.repeat(50));
        
        // Validate input
        if (!chatId) {
            console.log('❌ RESTORATION FAILED: Chat ID is required');
            return res.status(400).json({
                success: false,
                error: 'Chat ID is required'
            });
        }
        
        if (!puid) {
            console.log('❌ RESTORATION FAILED: PUID not found in session');
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }
        
        if (!courseName) {
            console.log('❌ RESTORATION FAILED: Course name not found in session');
            return res.status(400).json({
                success: false,
                error: 'No active course selected'
            });
        }
        
        // Get userId from GlobalUser using puid (needed for restore and chat retrieval)
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const globalUser = await mongoDB.findGlobalUserByPUID(puid);
        if (!globalUser || !globalUser.userId) {
            console.log('❌ RESTORATION FAILED: GlobalUser not found for puid');
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const userId = globalUser.userId;
        console.log(`[RESTORE-CHAT] Converting puid to userId: ${puid} -> ${userId}`);
        
        // Restore chat from database
        const restored = await chatApp.restoreChatFromDatabase(chatId, courseName, userId);
        
        if (restored) {
            console.log(`✅ Chat ${chatId} restored successfully`);
            
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
            console.log(`❌ Chat ${chatId} restoration failed`);
            res.status(404).json({
                success: false,
                error: 'Chat not found or could not be restored'
            });
        }
        
    } catch (error) {
        console.error('❌ CHAT RESTORATION ERROR:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}));

/**
 * Delete a chat (REQUIRES AUTH) - Using Soft Delete
 * 
 * Marks the chat as deleted (isDeleted: true) instead of removing it from the database.
 * This preserves chat history for audit/analytics while hiding it from users.
 * 
 * @param chatId - The chat ID to delete
 * @returns JSON response with deletion status
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
        console.log('\n🗑️ SOFT DELETE CHAT REQUEST:');
        console.log('='.repeat(50));
        console.log(`Chat ID: ${chatId}`);
        console.log(`PUID: ${puid}`);
        console.log(`Course: ${courseName}`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-001)
        
        // Validate input
        if (!chatId) {
            //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-002)
            console.log('❌ SOFT DELETE FAILED: Chat ID is required');
            //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-002)
            return res.status(400).json({
                success: false,
                error: 'Chat ID is required'
            });
        }
        
        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-003)
            console.log('❌ SOFT DELETE FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-003)
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }
        
        if (!courseName) {
            console.log('❌ VALIDATION FAILED: Course name not found in session');
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
            console.log(`✅ Chat ${chatId} removed from server memory`);
            //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-004)
        } else {
            //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-005)
            console.log(`ℹ️ Chat ${chatId} not in memory (may have been loaded from database after restart)`);
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
            console.log(`✅ Chat ${chatId} marked as deleted in database`);
            //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-006)
            
            res.json({
                success: true,
                message: 'Chat deleted successfully',
                chatId: chatId
            });
        } catch (dbError) {
            //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-007)
            console.error('⚠️ Database error during soft delete:', dbError);
            //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-007)
            res.status(404).json({
                success: false,
                error: 'Chat not found or already deleted'
            });
        }
        
    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-008)
        console.error('❌ SOFT DELETE ERROR:', error);
        //END DEBUG LOG : DEBUG-CODE(SOFT-DELETE-CHAT-008)
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}));

/**
 * Update chat pin status
 *
 * @param chatId - The chat ID to update pin status for
 * @param isPinned - Boolean indicating if chat should be pinned
 * @returns JSON response with update status
 */
router.put('/:chatId/pin', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const { isPinned } = req.body;

        //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-001)
        console.log('\n📌 PIN CHAT REQUEST:');
        console.log('='.repeat(50));
        console.log(`Chat ID: ${chatId}`);
        console.log(`Pin Status: ${isPinned}`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-001)

        // Validate input
        if (!chatId) {
            //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-002)
            console.log('❌ PIN CHAT FAILED: Chat ID is required');
            //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-002)
            return res.status(400).json({
                success: false,
                error: 'Chat ID is required'
            });
        }

        if (typeof isPinned !== 'boolean') {
            //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-003)
            console.log('❌ PIN CHAT FAILED: isPinned must be a boolean');
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
            console.log('❌ PIN CHAT FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-004)
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        if (!courseName) {
            //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-005)
            console.log('❌ PIN CHAT FAILED: Course name not found in session');
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
                console.log('❌ PIN CHAT FAILED: User not found in database');
                //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-006)
                return res.status(401).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const userId = globalUser.userId;
            await mongoDB.updateChatPinStatus(courseName, userId, chatId, isPinned);

            //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-007)
            console.log(`✅ Chat ${chatId} pin status updated to ${isPinned} in database`);
            //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-007)

            res.json({
                success: true,
                message: `Chat ${isPinned ? 'pinned' : 'unpinned'} successfully`,
                chatId: chatId,
                isPinned: isPinned
            });
        } catch (dbError) {
            //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-008)
            console.error('⚠️ Database error during pin update:', dbError);
            //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-008)
            res.status(500).json({
                success: false,
                error: 'Failed to update chat pin status'
            });
        }
    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(PIN-CHAT-009)
        console.error('🚨 Unexpected error in pin chat endpoint:', error);
        //END DEBUG LOG : DEBUG-CODE(PIN-CHAT-009)
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}));

/**
 * Test endpoint for API validation
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

