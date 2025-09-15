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
import { ChatMessage, } from '../functions/types';

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
    date: string;
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

    constructor(config: AppConfig) {
        this.llmModule = new LLMModule(config.llmConfig);
        this.logger = config.logger;
        this.debug = config.debug;
        this.ragConfig = config.ragConfig;
        this.conversations = new Map(); 
        this.chatHistory = new Map();
        this.chatID = [];
        this.chatIDGenerator = IDGenerator.getInstance();
        
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

            // this.logger.debug(`🔍 RAG Query: "${contextualQuery}"`);
            // this.logger.debug(`🔍 RAG Options: limit=${limit}, scoreThreshold=${scoreThreshold}, courseName=${courseName}`);
            
            const results = await this.ragModule.retrieveContext(contextualQuery, {
                limit: limit,
                scoreThreshold: scoreThreshold
            });

            // this.logger.debug(`📄 RAG Results: Retrieved ${results.length} documents`);
            
            // Print each retrieved document
            // results.forEach((doc, index) => {
            //     this.logger.debug(`\n--- Document ${index + 1} ---`);
            //     this.logger.debug(`Score: ${(doc as any).score || 0}`);
            //     
            //     const title = (doc as any).payload?.contentTitle || 
            //                  (doc as any).contentTitle || 
            //                  (doc as any).title || 
            //                  'Untitled';
            //     this.logger.debug(`Title: ${title}`);
            //     
            //     const subTitle = (doc as any).payload?.subContentTitle || 
            //                     (doc as any).subContentTitle || 
            //                     (doc as any).section;
            //     if (subTitle) {
            //         this.logger.debug(`Section: ${subTitle}`);
            //     }
            //     
            //     const text = (doc as any).payload?.text || 
            //                 (doc as any).text || 
            //                 (doc as any).content || 
            //                 '';
            //     this.logger.debug(`Content Preview: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
            //     this.logger.debug(`Full Content Length: ${text.length} characters`);
            // });

            // this.logger.debug(`Retrieved ${results.length} documents for query: ${query}`);
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
            
            // const score = (doc as any).score || 0;
            // context += `Relevance Score: ${score.toFixed(3)}\n`;
        });
        
        context += '\n</course_materials>\n';

        // console.log(`DEBUG #287: Formatted documents for context: ${context}`);
        return context;
    }
    /**
     * Send a user message and get streaming response from LLM
     * 
     * @param message - The user's message
     * @param chatId - The chat ID
     * @param userId - The user ID
     * @returns Promise<ChatMessage> - The assistant's response message
     */
    public async sendUserMessage(message: string, chatId: string, userId: string): Promise<ChatMessage> {
        // Validate chat exists
        if (!this.conversations.has(chatId)) {
            throw new Error('Chat not found');
        }

        // Check rate limiting (50 messages per chat)
        const chatHistory = this.chatHistory.get(chatId);
        if (chatHistory && chatHistory.length >= 50) {
            throw new Error('Rate limit exceeded: Maximum 50 messages per chat');
        }

        // Add user message to conversation and history
        const userMessage = this.addUserMessage(chatId, message, userId);
        
        // Get conversation and send message
        const conversation = this.conversations.get(chatId);
        if (!conversation) {
            throw new Error('Conversation not found');
        }

        // Send message to LLM and get response
        const response = await conversation.send({
            temperature: 0.7,
            num_ctx: 32768
        });

        // Add assistant response to conversation and history
        const assistantMessage = this.addAssistantMessage(chatId, response.content);
        
        return assistantMessage;
    }

    /**
     * Send a user message and stream the response from LLM with RAG
     * 
     * @param message - The user's message
     * @param chatId - The chat ID
     * @param userId - The user ID
     * @param courseName - The course name for RAG context
     * @param onChunk - Callback function for each chunk of the stream
     * @returns Promise<ChatMessage> - The complete assistant's response message
     */
    public async sendUserMessageStream(
        message: string, 
        chatId: string, 
        userId: string, 
        courseName: string,
        onChunk: (chunk: string) => void
    ): Promise<ChatMessage> {
        // Validate chat exists
        if (!this.conversations.has(chatId)) {
            throw new Error('Chat not found');
        }

        // Check rate limiting (50 messages per chat)
        const chatHistory = this.chatHistory.get(chatId);
        if (chatHistory && chatHistory.length >= 50) {
            throw new Error('Rate limit exceeded: Maximum 50 messages per chat');
        }


        // console.log(`DEBUG #286: User message added: ${userMessage}`);
        
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

        const userPromptHook = `, and in order to help respond to user's question, you can use the following course materials:`;

        //construct the user full prompt
        let userFullPrompt = '';
        if (documentsLength > 0) {  
            userFullPrompt = message + userPromptHook + ragContext;
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

        const response = await conversation.stream(
            (chunk: string) => {
                // console.log(`📦 Received chunk: "${chunk}"`);
                assistantResponse += chunk;
                onChunk(chunk);
            },
            {
                temperature: 0.7,
                num_ctx: 32768
            }
        );
        
        // console.log(`\n✅ Streaming completed. Full response length: ${fullResponse.length}`);
        // console.log(`Full response: "${fullResponse}"`);

        // Add complete assistant response to conversation and history
        const assistantMessage = this.addAssistantMessage(chatId, assistantResponse);
        
        return assistantMessage;
    }

    public initializeConversation(userID: string, courseName: string, date: string): initChatRequest {
        //create chatID from the user ID
        const chatId = this.chatIDGenerator.chatID(userID, courseName, date);

        this.chatID.push(chatId);
        this.conversations.set(chatId, this.llmModule.createConversation());
        this.chatHistory.set(chatId, []);
        
        // Add default system message
        this.addDefaultSystemMessage(chatId);
        
        // Add default assistant message and get it
        const initAssistantMessage = this.addDefaultAssistantMessage(chatId);
        
        // Set the course name on the assistant message
        initAssistantMessage.courseName = courseName;

        const initChatRequest: initChatRequest = {
            userID: userID,
            courseName: courseName,
            date: date,
            initAssistantMessage: initAssistantMessage
        }
        
        return initChatRequest;
    }

    /**
     * this method directly add the Default System Message to the conversation
     */
    private addDefaultSystemMessage(chatId: string) {

        const defaultSystemMessage =  `
            You are an AI tutor for chemical, environmental, and materials engineering students called EngE-AI. 
            Your role is to help undergraduate university students understand course concepts by connecting their questions to the provided course materials. 
            Course materials will be provided to you within code blocks such as <course_materials>relevant materials here</course_materials>

            When replying to student’s questions:
            1. Use the provided course materials to ask contextually relevant questions
            2. Reference the materials naturally using phrases like:
              - In the module, it is discussed that...
              - According to the course materials...
              - The lecture notes explain that...
            3. If the materials don't contain relevant information, indicate this (by saying things like “I was unable to find anything specifically relevant to this in the course materials, but I can still help based on my own knowledge.”) and ask contextually relevant socratic questions based on your general knowledge.

            If as part of your questions you need to include equations, please use LaTEX notation. If you need to output engineering flow diagrams, use MERMAID notation.
        `;

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
        const defaultMessageText = "Hello! I am EngE-AI, your AI companion for chemical, environmental, and materials engineering. As this is week 2, in lectures this week we have learned about Thermodynamics in Electrochemistry. What would you like to discuss? Remember: I am designed to enhance your learning, not replace it, always verify important information.";
        
        // Generate message ID using the first 10 words, chatID, and current date
        const currentDate = new Date().toISOString().split('T')[0];
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
        const currentDate = new Date().toISOString().split('T')[0];
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
        const currentDate = new Date().toISOString().split('T')[0];
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


}

const chatApp = new ChatApp(appConfig);

// console.log(`DEBUG #666: Chat exists: ${chatApp.validateChatExists('1234567890')}`);

/**
 * create an new chat for user
 * 
 * @param userID - The user ID
 * @param courseName - The name of the course
 * @param date - The date of the chat
 * @returns The new chat ID
 */
router.post('/newchat', async (req: Request, res: Response) => {
    try {
        const userID = req.body.userID;
        const courseName = req.body.courseName;
        const date = req.body.date;
        
        // Debug: Print all incoming new chat input
        // console.log('\n🆕 NEW CHAT INPUT RECEIVED:');
        // console.log('='.repeat(50));
        // console.log(`User ID: ${userID}`);
        // console.log(`Course Name: ${courseName}`);
        // console.log(`Date: ${date}`);
        // console.log(`Timestamp: ${new Date().toISOString()}`);
        // console.log('='.repeat(50));
        
        if (!userID || !courseName || !date) {
            // console.log('❌ VALIDATION FAILED: Missing required fields for new chat');
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: userID, courseName, and date are required' 
            });
        }

        // Initialize conversation and get the response
        const initResponse = chatApp.initializeConversation(userID, courseName, date);
        
        // Generate the actual chatId using the IDGenerator singleton
        const chatId = IDGenerator.getInstance().chatID(userID, courseName, date);
        
        // Debug: Print response being sent
        // console.log('\n📤 NEW CHAT RESPONSE SENT:');
        // console.log('='.repeat(50));
        // console.log(`Chat ID: ${chatId}`);
        // console.log(`Success: true`);
        // console.log(`Init Message: "${initResponse.initAssistantMessage.text}"`);
        // console.log(`Init Message Length: ${initResponse.initAssistantMessage.text.length} characters`);
        // console.log('='.repeat(50));
        
        // Return the complete response with the default message
        res.json({ 
            success: true, 
            chatId: chatId,
            initAssistantMessage: initResponse.initAssistantMessage
        });
        
    } catch (error) {
        // console.error('Error creating new chat:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create new chat' 
        });
    }
});

/**
 * Enhanced chat endpoint with streaming functionality
 */
router.post('/:chatId', async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const { message, userId, courseName } = req.body;
        
        // Debug: Print all incoming chat input
        // console.log('\n📨 CHAT INPUT RECEIVED:');
        // console.log('='.repeat(50));
        // console.log(`Chat ID: ${chatId}`);
        // console.log(`User ID: ${userId}`);
        // console.log(`Course Name: ${courseName || 'Not provided'}`);
        // console.log(`Message: "${message}"`);
        // console.log(`Message Length: ${message ? message.length : 0} characters`);
        // console.log(`Timestamp: ${new Date().toISOString()}`);
        // console.log('='.repeat(50));
        
        // Validate input
        if (!message || !userId) {
            // console.log('❌ VALIDATION FAILED: Missing required fields');
            return res.status(400).json({ 
                success: false, 
                error: 'Message and userId are required' 
            });
        }

        // Validate chat exists
        if (!chatApp.validateChatExists(chatId)) {
            return res.status(404).json({ 
                success: false, 
                error: 'Chat not found' 
            });
        }

        // console.log(`DEBUG #666: Chat exists: ${chatApp.validateChatExists(chatId)}`);

        // Set up Server-Sent Events for streaming
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // Send initial event to confirm connection
        res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Streaming started' })}\n\n`);

        // Send user message and stream response with RAG
        let messageId = '';
        let fullResponse = '';
        
        const assistantMessage = await chatApp.sendUserMessageStream(
            message,
            chatId,
            userId,
            courseName || 'CHBE241', // Default course name if not provided
            (chunk: string) => {
                fullResponse += chunk;
                // Send each chunk as a Server-Sent Event
                res.write(`data: ${JSON.stringify({ 
                    type: 'chunk', 
                    content: chunk,
                    messageId: messageId || 'pending'
                })}\n\n`);
            }
        );
        
        // Set the messageId after the message is created
        messageId = assistantMessage.id;

        // Debug: Print streaming response completion
        // console.log('\n📤 STREAMING RESPONSE COMPLETED:');
        // console.log('='.repeat(50));
        // console.log(`Message ID: ${assistantMessage.id}`);
        // console.log(`Response Length: ${assistantMessage.text.length} characters`);
        // console.log(`Response Preview: "${assistantMessage.text.substring(0, 100)}${assistantMessage.text.length > 100 ? '...' : ''}"`);
        // console.log(`Success: true`);
        // console.log('='.repeat(50));

        // Send completion event
        res.write(`data: ${JSON.stringify({ 
            type: 'complete', 
            message: assistantMessage,
            success: true 
        })}\n\n`);

        // Close the stream
        res.end();

    } catch (error) {
        // console.error('Error in chat endpoint:', error);
        
        // Send error event if streaming hasn't started
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Failed to process message' 
            });
        } else {
            // Send error event through stream
            res.write(`data: ${JSON.stringify({ 
                type: 'error', 
                error: error instanceof Error ? error.message : 'Failed to process message',
                success: false 
            })}\n\n`);
            res.end();
        }
    }
});

/**
 * Get chat history for a specific chat
 */
router.get('/:chatId/history', async (req: Request, res: Response) => {
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
});

/**
 * Get a specific message from a chat
 */
router.get('/:chatId/message/:messageId', async (req: Request, res: Response) => {
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
});

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

