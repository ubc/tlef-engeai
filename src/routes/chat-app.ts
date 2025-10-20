/**
 * ===========================================
 * ========= OLLAMA LLM INTEGRATION ==========
 * ===========================================
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
import fetch from 'node-fetch';
import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingsModule, EmbeddingsConfig, EmbeddingProviderType } from 'ubc-genai-toolkit-embeddings';
import { ConsoleLogger, LoggerInterface } from 'ubc-genai-toolkit-core';
import { LLMConfig, LLMModule, Message, ProviderType } from 'ubc-genai-toolkit-llm';
import { AppConfig, loadConfig } from './config';
import { RAGModule, RetrievedChunk } from 'ubc-genai-toolkit-rag';
import { Conversation } from 'ubc-genai-toolkit-llm/dist/conversation-interface';
import { IDGenerator } from '../functions/unique-id-generator';
import { ChatMessage, Chat } from '../functions/types';
import { asyncHandlerWithAuth } from '../middleware/asyncHandler';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';
import { 
    getSystemPrompt, 
    getInitialAssistantMessage, 
    formatRAGPrompt, 
    RAG_CONTEXT_SEPARATOR,
    RAG_ERROR_MESSAGE 
} from '../functions/chat-prompts';

// Load environment variables
dotenv.config();

const router = express.Router();

/**
 * Interface for RAG request body
 */
interface RAGRequest {
    messages: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
    }>;
    courseName?: string;
    enableRAG?: boolean;
    maxDocuments?: number;
    scoreThreshold?: number;
}

/**
 * Interface for retrieved document
 */
interface RetrievedDocument {
    id: string;
    score: number;
    payload: {
        text: string;
        courseName?: string;
        contentTitle?: string;
        subContentTitle?: string;
        chunkNumber?: number;
    };
}

interface initChatRequest {
    userID: string;
    courseName: string;
    date: Date;
    chatId: string;
    initAssistantMessage: ChatMessage;
}

const appConfig = loadConfig();


class ChatApp {
    private llmModule: LLMModule;
    private ragModule: RAGModule | null = null;
    private logger: LoggerInterface;
    private debug: boolean;
    private conversations : Map<string, Conversation>; // it maps chatId to conversation
    private chatHistory : Map<string, ChatMessage[]>; // it maps chatId to chat history
    private chatID : string[];
    private chatIDGenerator: IDGenerator;
    private ragConfig: any;
    private llmProvider: any;
    private chatTimers: Map<string, NodeJS.Timeout>; // Maps chatId to cleanup timer
    private chatInactivityTimeout: number = 5 * 60 * 1000; // 5 minutes in milliseconds

    constructor(config: AppConfig) {
        this.llmModule = new LLMModule(config.llmConfig);
        this.logger = config.logger;
        this.debug = config.debug;
        this.ragConfig = config.ragConfig;
        this.conversations = new Map(); 
        this.chatHistory = new Map();
        this.chatID = [];
        this.chatIDGenerator = IDGenerator.getInstance();
        this.llmProvider = config.llmConfig.provider;
        this.chatTimers = new Map();
            
        // Initialize RAG module asynchronously
        this.initializeRAG();
    }

    /**
     * Initialize RAG module asynchronously
     */
    private async initializeRAG() {
        try {
            this.ragModule = await RAGModule.create(this.ragConfig);
            // this.logger.debug('RAG module initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize RAG module:', error as any);
            this.ragModule = null;
        }
    }

    /**
     * Reset the inactivity timer for a chat
     * Clears existing timer and creates a new one for 5 minutes
     * 
     * @param chatId - The chat ID to reset timer for
     */
    public resetChatTimer(chatId: string): void {
        // Clear existing timer if present
        if (this.chatTimers.has(chatId)) {
            const existingTimer = this.chatTimers.get(chatId);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }
        }

        // Create new timer that will clean up the chat after inactivity
        const timer = setTimeout(() => {
            this.cleanupInactiveChat(chatId);
        }, this.chatInactivityTimeout);

        // Store the timer reference
        this.chatTimers.set(chatId, timer);

        // Log timer reset for debugging
        console.log(`🕐 Timer reset for chat ${chatId} - will cleanup in ${this.chatInactivityTimeout / 1000 / 60} minutes`);
    }

    /**
     * Clean up an inactive chat from memory
     * Removes chat from all maps and arrays, clears its timer
     * 
     * @param chatId - The chat ID to clean up
     */
    private cleanupInactiveChat(chatId: string): void {
        console.log(`🧹 Cleaning up inactive chat: ${chatId} at ${new Date().toISOString()}`);

        // Remove from conversations map
        this.conversations.delete(chatId);
        
        // Remove from chat history map
        this.chatHistory.delete(chatId);
        
        // Remove from chatID array
        const index = this.chatID.indexOf(chatId);
        if (index > -1) {
            this.chatID.splice(index, 1);
        }
        
        // Remove timer from chatTimers map
        this.chatTimers.delete(chatId);

        console.log(`✅ Chat ${chatId} cleaned up successfully. Remaining active chats: ${this.chatID.length}`);
    }

    /**
     * Stop the inactivity timer for a chat
     * Used when explicitly deleting a chat
     * 
     * @param chatId - The chat ID to stop timer for
     */
    public stopChatTimer(chatId: string): void {
        if (this.chatTimers.has(chatId)) {
            const timer = this.chatTimers.get(chatId);
            if (timer) {
                clearTimeout(timer);
            }
            this.chatTimers.delete(chatId);
            console.log(`⏹️ Timer stopped for chat ${chatId}`);
        }
    }

    /**
     * Generate chat title from AI response text
     * Extracts first 10 words from the response, cleaning up special characters
     * 
     * @param responseText - The AI response text
     * @returns Clean title string with first 10 words
     */
    private generateChatTitleFromResponse(responseText: string): string {
        //START DEBUG LOG : DEBUG-CODE(GENERATE-TITLE)
        console.log(`[CHAT-APP] 📝 Generating title from response: "${responseText.substring(0, 100)}..."`);
        //END DEBUG LOG : DEBUG-CODE(GENERATE-TITLE)
        
        try {
            // Remove LaTeX delimiters ($ and $$)
            let cleanText = responseText.replace(/\$\$.*?\$\$/g, ''); // Remove block math
            cleanText = cleanText.replace(/\$.*?\$/g, ''); // Remove inline math
            
            // Remove HTML tags and special characters
            cleanText = cleanText.replace(/<[^>]*>/g, ''); // Remove HTML tags
            cleanText = cleanText.replace(/[^\w\s]/g, ' '); // Replace special chars with spaces
            
            // Clean up multiple spaces and trim
            cleanText = cleanText.replace(/\s+/g, ' ').trim();
            
            // Split into words and take first 10
            const words = cleanText.split(' ').filter(word => word.length > 0);
            const title = words.slice(0, 10).join(' ');
            
            //START DEBUG LOG : DEBUG-CODE(GENERATE-TITLE-SUCCESS)
            console.log(`[CHAT-APP] ✅ Generated title: "${title}"`);
            //END DEBUG LOG : DEBUG-CODE(GENERATE-TITLE-SUCCESS)
            
            return title || 'New Chat'; // Fallback to "New Chat" if empty
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(GENERATE-TITLE-ERROR)
            console.error(`[CHAT-APP] 🚨 Error generating title:`, error);
            //END DEBUG LOG : DEBUG-CODE(GENERATE-TITLE-ERROR)
            return 'New Chat'; // Fallback to "New Chat" on error
        }
    }

    /**
     * Update chat title if this is the first user-AI exchange
     * Only updates title if current title is "New Chat" or empty
     * 
     * @param chatId - The chat ID
     * @param assistantResponse - The AI response text
     * @param courseName - The course name
     * @param userId - The user ID
     */
    public async updateChatTitleIfNeeded(chatId: string, assistantResponse: string, courseName: string, userId: string): Promise<void> {
        //START DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-CHECK)
        console.log(`[CHAT-APP] 🔍 Checking if title needs update for chat ${chatId}`);
        //END DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-CHECK)
        
        try {
            // Get current chat from MongoDB to check title
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const userChats = await mongoDB.getUserChats(courseName, userId);
            const currentChat = userChats.find(chat => chat.id === chatId);
            
            if (!currentChat) {
                //START DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-NO-CHAT)
                console.log(`[CHAT-APP] ⚠️ Chat ${chatId} not found in MongoDB`);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-NO-CHAT)
                return;
            }
            
            // Check if title needs updating (is "New Chat" or empty)
            const currentTitle = currentChat.itemTitle || '';
            const needsUpdate = currentTitle === 'New Chat' || currentTitle === '';
            
            //START DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-DECISION)
            console.log(`[CHAT-APP] 📊 Title update decision: current="${currentTitle}", needsUpdate=${needsUpdate}`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-DECISION)
            
            if (needsUpdate) {
                // Generate new title from AI response
                const newTitle = this.generateChatTitleFromResponse(assistantResponse);
                
                // Update title in MongoDB
                await mongoDB.updateChatTitle(courseName, userId, chatId, newTitle);
                
                //START DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-SUCCESS)
                console.log(`[CHAT-APP] ✅ Chat title updated from "${currentTitle}" to "${newTitle}"`);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-SUCCESS)
            } else {
                //START DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-SKIP)
                console.log(`[CHAT-APP] ⏭️ Title update skipped - current title is not "New Chat"`);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-SKIP)
            }
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-ERROR)
            console.error(`[CHAT-APP] 🚨 Error updating chat title:`, error);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-ERROR)
            // Don't throw error - title update failure shouldn't break the chat flow
        }
    }

    /**
     * Retrieve relevant documents using RAG
     * 
     * @param query - The user's query
     * @param courseName - The course name for context
     * @param limit - Maximum number of documents to retrieve
     * @param scoreThreshold - Minimum similarity score threshold
     * @returns Array of retrieved documents
     */
    private async retrieveRelevantDocuments(
        query: string, 
        courseName: string, 
        limit: number = 5, 
        scoreThreshold: number = 0.4
    ): Promise<RetrievedChunk[]> {
        if (!this.ragModule) {
            // this.logger.warn('RAG module not available, skipping document retrieval');
            return [];
        }

        try {
            // Add course context to the query for better retrieval
            const contextualQuery = ` ${query}`;
            

            const results = await this.ragModule.retrieveContext(contextualQuery, {
                limit: limit,
                scoreThreshold: scoreThreshold
            });

            return results;
        } catch (error) {
            this.logger.debug(`❌ RAG Error:`, error as any);
            this.logger.error('Error retrieving documents:', error as any);
            return [];
        }
    }

    /**
     * Format retrieved documents for context injection
     * 
     * @param documents - Array of retrieved documents
     * @returns Formatted context string
     */
    private formatDocumentsForContext(documents: RetrievedChunk[]): string {
        if (documents.length === 0) {
            return '';
        }

        let context = '\n\n<course_materials>\n';
        
        documents.forEach((doc, index) => {
            context += `\n--- Document ${index + 1} ---\n`;
            
            const content = (doc as any).payload?.text || 
                           (doc as any).text || 
                           (doc as any).content || 
                           '';
            context += `Content: ${content}\n`;
            
        });
        
        context += '\n</course_materials>\n';

        // console.log(`DEBUG #287: Formatted documents for context: ${context}`);
        return context;
    }
    /**
     * Send a user message and get response from LLM with RAG context
     * 
     * @param message - The user's message
     * @param chatId - The chat ID
     * @param userId - The user ID
     * @param courseName - The course name for RAG context
     * @param onChunk - Optional callback function for streaming chunks (defaults to no-op)
     * @returns Promise<ChatMessage> - The complete assistant's response message
     */
    public async sendUserMessage(
        message: string, 
        chatId: string, 
        userId: string, 
        courseName: string,
        onChunk: (chunk: string) => void
    ): Promise<ChatMessage> {
        // Reset the inactivity timer since user is actively using this chat
        this.resetChatTimer(chatId);

        // Validate chat exists
        if (!this.conversations.has(chatId)) {
            throw new Error('Chat not found');
        }

        // Check rate limiting (50 messages per chat)
        const chatHistory = this.chatHistory.get(chatId);
        if (chatHistory && chatHistory.length >= 50) {
            throw new Error('Rate limit exceeded: Maximum 50 messages per chat');
        }

        // Get conversation
        const conversation = this.conversations.get(chatId);
        if (!conversation) {
            throw new Error('Conversation not found');
        }

        // Retrieve relevant documents using RAG with limited context
        let ragContext = '';
        let documentsLength = 0;
        try {
            const documents = await this.retrieveRelevantDocuments(message, courseName, 3, 0.6); // Limit to 2 docs, higher threshold
            ragContext = this.formatDocumentsForContext(documents);
            documentsLength = documents.length;
        } catch (error) {
            console.log(`❌ RAG Context Error:`, error);
            this.logger.error('Error retrieving RAG documents:', error as any);
            // Continue without RAG context if retrieval fails
        }

        //construct the user full prompt using abstracted RAG formatting
        let userFullPrompt = '';
        if (documentsLength > 0) {  
            userFullPrompt = formatRAGPrompt(ragContext, message);
        }
        else {
            userFullPrompt = message;
        }

        //send whole user prompt to the LLM
        conversation.addMessage('user', userFullPrompt);

        // Print the entire conversation history for debugging
        console.log(`\n📋 CONVERSATION HISTORY DEBUG:`);
        console.log(`==================================================`);
        const history = conversation.getHistory();
        let totalCharacters = 0;
        let totalEstimatedTokens = 0;
        
        history.forEach((msg, index) => {
            const charCount = msg.content.length;
            const estimatedTokens = Math.ceil(charCount / 4); // Rough estimate: ~4 chars per token
            totalCharacters += charCount;
            totalEstimatedTokens += estimatedTokens;
            
            console.log(`Message ${index + 1}:`);
            console.log(`  Role: ${msg.role}`);
            console.log(`  Content Length: ${charCount} characters (~${estimatedTokens} tokens)`);
            console.log(`  Content Preview: "${msg.content}"`);
            console.log(`  Timestamp: ${msg.timestamp}`);
            console.log(`---`);
        });
        
        console.log(`📊 TOKEN SUMMARY:`);
        console.log(`  Total Messages: ${history.length}`);
        console.log(`  Total Characters: ${totalCharacters}`);
        console.log(`  Estimated Total Tokens: ~${totalEstimatedTokens}`);
        console.log(`  Average Tokens per Message: ~${Math.round(totalEstimatedTokens / history.length)}`);
        console.log(`==================================================\n`);
        
        // Stream the response
        console.log(`\n🚀 Starting LLM streaming...`);

        let assistantResponse = '';

        let conversationConfig: any = {
            temperature: 0.7,
        }

        if (this.llmProvider === 'ollama') {
            console.log('🔍 Ollama provider detected : JUJUJU');

            conversationConfig.num_ctx = 32768;
        }

        const response = await conversation.stream(
            (chunk: string) => {
                // console.log(`📦 Received chunk: "${chunk}"`);
                assistantResponse += chunk;
                onChunk(chunk);
            }, 
            conversationConfig
        );
        
        console.log(`\n✅ Streaming completed. Full response length: ${assistantResponse.length}`);
        console.log(`Full response: "${assistantResponse}"`);

        // Add complete assistant response to conversation and history
        const assistantMessage = this.addAssistantMessage(chatId, assistantResponse);
        
        // Check if this is the first user-AI exchange and update title if needed
        await this.updateChatTitleIfNeeded(chatId, assistantResponse, courseName, userId);
        
        return assistantMessage;
    }

    public initializeConversation(userID: string, courseName: string, date: Date): initChatRequest {
        //create chatID from the user ID
        const chatId = this.chatIDGenerator.chatID(userID, courseName, date);

        this.chatID.push(chatId);
        this.conversations.set(chatId, this.llmModule.createConversation());
        this.chatHistory.set(chatId, []);
        
        // Add default system message
        this.addDefaultSystemMessage(chatId, courseName);
        
        // Add default assistant message and get it
        const initAssistantMessage = this.addDefaultAssistantMessage(chatId);
        
        // Set the course name on the assistant message
        initAssistantMessage.courseName = courseName;

        // Start the inactivity timer for this new chat
        this.resetChatTimer(chatId);

        const initChatRequest: initChatRequest = {
            userID: userID,
            courseName: courseName,
            date: date,
            chatId: chatId,
            initAssistantMessage: initAssistantMessage
        }
        
        return initChatRequest;
    }

    /**
     * this method directly add the Default System Message to the conversation
     */
    private addDefaultSystemMessage(chatId: string, courseName?: string) {
        const defaultSystemMessage = getSystemPrompt(courseName);

        try {
            if (this.conversations.has(chatId)) {
                if (this.conversations.get(chatId) === undefined) {
                    throw new Error('Conversation not found');
                }
                else {
                    const message = this.conversations.get(chatId);
                    if (message === undefined) {
                        throw new Error('Message not found');
                    }
                    else {
                        message.addMessage('system', defaultSystemMessage);
                    }
                }
            }
            else {
                throw new Error('ChatId not found');
            }
        }
        catch (error) {
            console.error('Error adding default message:', error);
        }

    }

    /**
     * this method directly add the Default Assistant Message to the conversation and the message is added to the chat history
     * 
     * return the message object, so this message can be passed to the client when initiate a chat
     */
    private addDefaultAssistantMessage(chatId: string): ChatMessage {
        const defaultMessageText = getInitialAssistantMessage();
        
        // Generate message ID using the first 10 words, chatID, and current date
        const currentDate = new Date();
        const messageId = this.chatIDGenerator.messageID(defaultMessageText, chatId, currentDate);
        
        // Create the ChatMessage object
        const chatMessage: ChatMessage = {
            id: messageId, // Use the generated message ID directly as string
            sender: 'bot',
            userId: 0,
            courseName: '', // Will be set by the caller
            text: defaultMessageText,
            timestamp: Date.now()
        };
        
        try {
            // Add message to conversation
            if (this.conversations.has(chatId)) {
                const conversation = this.conversations.get(chatId);
                if (conversation) {
                    conversation.addMessage('assistant', defaultMessageText);
                }
            }
            
            // Add message to chat history with proper error handling
            try {
                if (this.chatHistory.has(chatId)) {
                    const existingHistory = this.chatHistory.get(chatId);
                    if (existingHistory) {
                        existingHistory.push(chatMessage);
                    } else {
                        // If the chatId exists but the array is null/undefined, create a new array
                        this.chatHistory.set(chatId, [chatMessage]);
                    }
                } else {
                    // If chatId doesn't exist, create a new entry
                    this.chatHistory.set(chatId, [chatMessage]);
                }
            } catch (historyError) {
                console.error('Error adding message to chat history:', historyError);
                // Ensure the chat history is properly initialized even if there was an error
                if (!this.chatHistory.has(chatId)) {
                    this.chatHistory.set(chatId, [chatMessage]);
                }
            }
            
        } catch (error) {
            console.error('Error adding default assistant message:', error);
        }
        
        return chatMessage;
    }

    /**
     * Add a user message to conversation and chat history
     * 
     * @param chatId - The chat ID
     * @param message - The user's message
     * @param userId - The user ID
     * @returns ChatMessage - The created user message
     */
    private addUserMessage(chatId: string, message: string, userId: string): ChatMessage {
        // Generate message ID
        const currentDate = new Date();
        const messageId = this.chatIDGenerator.messageID(message, chatId, currentDate);
        
        // Create the ChatMessage object
        const chatMessage: ChatMessage = {
            id: messageId,
            sender: 'user',
            userId: parseInt(userId) || 0,
            courseName: '', // Will be set by the caller if needed
            text: message,
            timestamp: Date.now()
        };
        
        try {
            // Add message to conversation
            if (this.conversations.has(chatId)) {
                const conversation = this.conversations.get(chatId);
                if (conversation) {
                    conversation.addMessage('user', message);
                }
            }
            
            // Add message to chat history
            if (this.chatHistory.has(chatId)) {
                const existingHistory = this.chatHistory.get(chatId);
                if (existingHistory) {
                    existingHistory.push(chatMessage);
                } else {
                    this.chatHistory.set(chatId, [chatMessage]);
                }
            } else {
                this.chatHistory.set(chatId, [chatMessage]);
            }
            
        } catch (error) {
            console.error('Error adding user message:', error);
        }
        
        return chatMessage;
    }

    /**
     * Add an assistant message to conversation and chat history
     * 
     * @param chatId - The chat ID
     * @param message - The assistant's message
     * @returns ChatMessage - The created assistant message
     */
    private addAssistantMessage(chatId: string, message: string): ChatMessage {
        // Generate message ID
        const currentDate = new Date();
        const messageId = this.chatIDGenerator.messageID(message, chatId, currentDate);
        
        // Create the ChatMessage object
        const chatMessage: ChatMessage = {
            id: messageId,
            sender: 'bot',
            userId: 0,
            courseName: '', // Will be set by the caller if needed
            text: message,
            timestamp: Date.now()
        };
        
        try {
            // Add message to conversation
            if (this.conversations.has(chatId)) {
                const conversation = this.conversations.get(chatId);
                if (conversation) {
                    conversation.addMessage('assistant', message);
                }
            }
            
            // Add message to chat history
            if (this.chatHistory.has(chatId)) {
                const existingHistory = this.chatHistory.get(chatId);
                if (existingHistory) {
                    existingHistory.push(chatMessage);
                } else {
                    this.chatHistory.set(chatId, [chatMessage]);
                }
            } else {
                this.chatHistory.set(chatId, [chatMessage]);
            }
            
        } catch (error) {
            console.error('Error adding assistant message:', error);
        }
        
        return chatMessage;
    }

    /**
     * Get chat history for a specific chat
     * 
     * @param chatId - The chat ID
     * @returns ChatMessage[] - Array of messages in the chat
     */
    public getChatHistory(chatId: string): ChatMessage[] {
        return this.chatHistory.get(chatId) || [];
    }

    /**
     * Validate if a chat exists
     * 
     * @param chatId - The chat ID to validate
     * @returns boolean - True if chat exists, false otherwise
     */
    public validateChatExists(chatId: string): boolean {
        return this.conversations.has(chatId);
    }

    /**
     * Restore a chat from MongoDB with full conversation context
     * 
     * @param chatId - The chat ID to restore
     * @param courseName - The course name
     * @param userId - The user ID
     * @returns Promise<boolean> - True if restoration was successful, false otherwise
     */
    public async restoreChatFromDatabase(chatId: string, courseName: string, userId: string): Promise<boolean> {
        // Check if chat already exists in memory
        if (this.conversations.has(chatId)) {
            console.log(`📋 Chat ${chatId} already exists in memory, resetting timer`);
            this.resetChatTimer(chatId);
            return true;
        }

        try {
            // Get MongoDB instance
            const mongoDB = await EngEAI_MongoDB.getInstance();
            
            // Fetch chat data from MongoDB
            const userChats = await mongoDB.getUserChats(courseName, userId);
            const chatData = userChats.find(chat => chat.id === chatId);
            
            if (!chatData) {
                console.log(`❌ Chat ${chatId} not found in MongoDB`);
                return false;
            }

            if (chatData.isDeleted) {
                console.log(`❌ Chat ${chatId} is marked as deleted`);
                return false;
            }

            console.log(`🔄 Restoring chat ${chatId} from MongoDB with ${chatData.messages.length} messages`);

            // Create new conversation
            const conversation = this.llmModule.createConversation();
            
            // Add system message first (same as in initializeConversation)
            const defaultSystemMessage = getSystemPrompt(courseName);
            conversation.addMessage('system', defaultSystemMessage);

            // Restore all messages from MongoDB in order
            const restoredMessages: ChatMessage[] = [];
            for (const message of chatData.messages) {
                // Determine role based on sender
                const role = message.sender === 'user' ? 'user' : 'assistant';
                
                // Add to conversation
                conversation.addMessage(role, message.text);
                
                // Add to local chat history
                restoredMessages.push(message);
            }

            // Store conversation in memory
            this.conversations.set(chatId, conversation);
            this.chatHistory.set(chatId, restoredMessages);
            
            // Add chatId to active chats array
            this.chatID.push(chatId);
            
            // Start the inactivity timer
            this.resetChatTimer(chatId);

            console.log(`✅ Chat ${chatId} restored successfully with ${restoredMessages.length} messages`);
            return true;

        } catch (error) {
            console.error(`❌ Error restoring chat ${chatId}:`, error);
            return false;
        }
    }

    /**
     * Delete a chat and all its associated data
     * 
     * @param chatId - The chat ID to delete
     * @returns boolean - True if deletion was successful, false otherwise
     */
    public deleteChat(chatId: string): boolean {
        try {
            // Validate chat exists before attempting deletion
            if (!this.validateChatExists(chatId)) {
                this.logger.warn(`Attempted to delete non-existent chat: ${chatId}`);
                return false;
            }

            // Stop the inactivity timer for this chat
            this.stopChatTimer(chatId);

            // Remove from conversations map
            const conversationDeleted = this.conversations.delete(chatId);
            
            // Remove from chat history map
            const historyDeleted = this.chatHistory.delete(chatId);
            
            // Remove from chatID array
            const index = this.chatID.indexOf(chatId);
            let arrayDeleted = false;
            if (index > -1) {
                this.chatID.splice(index, 1);
                arrayDeleted = true;
            }
            
            // Log the deletion
            console.log(`🗑️ CHAT DELETION SUCCESSFUL:`);
            console.log(`   Chat ID: ${chatId}`);
            console.log(`   Conversation deleted: ${conversationDeleted}`);
            console.log(`   History deleted: ${historyDeleted}`);
            console.log(`   Array entry deleted: ${arrayDeleted}`);
            console.log(`   Remaining active chats: ${this.chatID.length}`);
            
            this.logger.info(`Chat ${chatId} deleted successfully`);
            return true;
            
        } catch (error) {
            console.error(`🗑️ FAILED TO DELETE CHAT ${chatId}:`, error);
            this.logger.error(`Failed to delete chat ${chatId}: ${error}`);
            return false;
        }
    }

    /**
     * Clean up all active timers on server shutdown
     * Called by process signal handlers to prevent memory leaks
     */
    public cleanup(): void {
        console.log('🧹 Cleaning up all active chat timers...');
        let timerCount = 0;
        
        for (const [chatId, timer] of this.chatTimers) {
            if (timer) {
                clearTimeout(timer);
                timerCount++;
            }
        }
        
        this.chatTimers.clear();
        console.log(`✅ Cleaned up ${timerCount} active timers`);
    }

}

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
        const courseName = user?.activeCourseName || 'APSC 099: Engineering for Kindergarten';
        
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
        
        // Load chat metadata from MongoDB
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const chatMetadata = await mongoDB.getUserChatsMetadata(courseName, puid);
        
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
        const courseName = user?.activeCourseName || 'APSC 099: Engineering for Kindergarten'; // Use full course name
        
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
        
        // Load chats from MongoDB
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const chats = await mongoDB.getUserChats(courseName, puid);
        
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
        const initRequest = chatApp.initializeConversation(userID, courseName, date);
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
            divisionTitle: '', // Empty for now, will be set by user later
            itemTitle: 'New Chat', // Set initial title as "New Chat"
            messages: [backendWelcomeMessage], // Use the proper backend welcome message with diagrams
            isPinned: false,
            pinnedMessageId: null
        };
        
        // Save chat to MongoDB
        try {
            const mongoDB = await EngEAI_MongoDB.getInstance();
            await mongoDB.addChatToUser(courseName, puid, newChat);
            
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
 * Send message endpoint (REQUIRES AUTH) - Simple request-response, no streaming
 */
router.post('/:chatId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const { message, userId, courseName } = req.body;
        
        // Get user from session
        const user = (req as any).user;
        const puid = user?.puid;
        
        //START DEBUG LOG : DEBUG-CODE(SEND-MSG-001)
        console.log('\n💬 SENDING MESSAGE:');
        console.log('='.repeat(50));
        console.log(`Chat ID: ${chatId}`);
        console.log(`User ID: ${userId}`);
        console.log(`PUID: ${puid}`);
        console.log(`Course: ${courseName}`);
        console.log(`Message: ${message.substring(0, 100)}...`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(SEND-MSG-001)
        
        // Validate input
        if (!message || !userId) {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-002)
            console.log('❌ VALIDATION FAILED: Missing required fields');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-002)
            return res.status(400).json({ 
                success: false, 
                error: 'Message and userId are required' 
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

        // REAL AI COMMUNICATION (NO STREAMING - WAIT FOR COMPLETE RESPONSE)
        try {
            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-005)
            console.log('🤖 Waiting for AI response...');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-005)
            
            // Send message through ChatApp and wait for complete response
            const assistantMessage = await chatApp.sendUserMessage(
                message,
                chatId,
                userId,
                courseName || 'APSC 099',
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
                userId: parseInt(userId) || 0,
                courseName: courseName,
                text: message,
                timestamp: Date.now()
            };

            // Save both messages to MongoDB
            const mongoDB = await EngEAI_MongoDB.getInstance();
            
            try {
                // Save user message
                await mongoDB.addMessageToChat(courseName, puid, chatId, userMessage);
                
                //START DEBUG LOG : DEBUG-CODE(SEND-MSG-007)
                console.log('✅ User message saved to MongoDB');
                console.log('   User message ID:', userMessage.id);
                console.log('   Text:', userMessage.text.substring(0, 50) + '...');
                //END DEBUG LOG : DEBUG-CODE(SEND-MSG-007)
                
                // Save assistant message
                await mongoDB.addMessageToChat(courseName, puid, chatId, assistantMessage);
                
                //START DEBUG LOG : DEBUG-CODE(SEND-MSG-008)
                console.log('✅ Assistant message saved to MongoDB');
                console.log('   Assistant message ID:', assistantMessage.id);
                console.log('   Text:', assistantMessage.text.substring(0, 50) + '...');
                //END DEBUG LOG : DEBUG-CODE(SEND-MSG-008)
                
                // Check if chat title needs updating (first user-AI exchange)
                await chatApp.updateChatTitleIfNeeded(chatId, assistantMessage.text, courseName, puid);
                
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
        const courseName = user?.activeCourseName || 'APSC 099: Engineering for Kindergarten';
        
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
        
        // Restore chat from database
        const restored = await chatApp.restoreChatFromDatabase(chatId, courseName, puid);
        
        if (restored) {
            console.log(`✅ Chat ${chatId} restored successfully`);
            
            // Get the restored chat data from MongoDB to return in response
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const userChats = await mongoDB.getUserChats(courseName, puid);
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
        const courseName = user?.activeCourseName || 'APSC 099: Engineering for Kindergarten';
        
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
            await mongoDB.markChatAsDeleted(courseName, puid, chatId);
            
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

