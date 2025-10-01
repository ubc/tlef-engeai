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

        const userPromptHook = `, 
                                    # Extra Info
                                    In order to help, here is some additional information in the form of course materials:
                                `;

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

    public initializeConversation(userID: string, courseName: string, date: Date): initChatRequest {
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
            chatId: chatId,
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

            When replying to student's questions:
            1. Use the provided course materials to ask contextually relevant questions
            2. Reference the materials naturally using phrases like:
                - In the module, it is discussed that...
                - According to the course materials...
                - The lecture notes explain that...
            3. If the materials don't contain relevant information, indicate this (by saying things like "I was unable to find anything specifically relevant to this in the course materials, but I can still help based on my own knowledge.") and ask contextually relevant socratic questions based on your general knowledge.

            If as part of your questions you need to include equations, please use LaTeX notation. The system now supports LaTeX rendering, so you can use:
            - Inline math: $E = mc^2$ for simple equations within text
            - Block math: $$\int_0^\infty e^{-x} dx = 1$$ for centered equations
            - Complex expressions: $$\frac{\partial^2 u}{\partial t^2} = c^2 \nabla^2 u$$ for advanced mathematics

            For engineering flow diagrams, process flows, or visual representations, use the following artefact format:
            - Start with: <Artefact>
            - Include your Mermaid diagram code
            - End with: </Artefact>
            - Continue with any additional text below the artefact

            Example artefact usage:
            <Artefact>
            graph TD
                A[Input] --> B[Process]
                B --> C[Output]
            </Artefact>
            
            The artefact will be displayed as an interactive diagram that students can view.

            IMPORTANT: Never output the course materials tags <course_materials>...</course_materials> in your responses. Only use them internally for context.
            Additional Instructions: If required to use an equation, use LaTEX notation. If a flow diagram is required, use Mermaid notation.
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
        const defaultMessageText = `Hello! I am EngE-AI, your AI companion for chemical, environmental, and materials engineering. As this is week 2, in lectures this week we have learned about Thermodynamics in Electrochemistry. 

Here's a diagram to help visualize the key concepts we've covered:

<Artefact>
graph TD
    A[Thermodynamics in Electrochemistry] --> B[Gibbs Free Energy]
    A --> C[Electrode Potentials]
    A --> D[Electrochemical Cells]
    
    B --> E["ΔG = -nFE"]
    C --> F["E = E° - (RT/nF)lnQ"]
    D --> G[Anode: Oxidation]
    D --> H[Cathode: Reduction]
    
    G --> I[Electrons Flow]
    H --> I
    I --> J[Current Generation]
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#f3e5f5
    style D fill:#f3e5f5
    style E fill:#fff3e0
    style F fill:#fff3e0
</Artefact>

What would you like to discuss? I can help you understand:
- The relationship between thermodynamics and electrochemistry
- How to calculate cell potentials
- The Nernst equation and its applications
- Electrochemical cell design and operation

Remember: I am designed to enhance your learning, not replace it, always verify important information.`;
        
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


}

const chatApp = new ChatApp(appConfig);

// console.log(`DEBUG #666: Chat exists: ${chatApp.validateChatExists('1234567890')}`);

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
            itemTitle: '', // Empty for now, will be set by user later
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
            
            // Use the ChatApp's streaming method but don't stream to client - just wait for complete response
            const assistantMessage = await chatApp.sendUserMessageStream(
                message,
                chatId,
                userId,
                courseName || 'APSC 099',
                () => {} // Empty callback - we don't stream to client
            );

            //START DEBUG LOG : DEBUG-CODE(SEND-MSG-006)
            console.log('✅ AI response received');
            console.log('📊 Response length:', assistantMessage.text.length, 'characters');
            //END DEBUG LOG : DEBUG-CODE(SEND-MSG-006)

            // Create the user message object (sendUserMessageStream adds it internally but we need to save it to DB)
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
 * Delete a chat (REQUIRES AUTH)
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
        
        //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-001)
        console.log('\n🗑️ DELETE CHAT REQUEST:');
        console.log('='.repeat(50));
        console.log(`Chat ID: ${chatId}`);
        console.log(`PUID: ${puid}`);
        console.log(`Course: ${courseName}`);
        console.log('='.repeat(50));
        //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-001)
        
        // Validate input
        if (!chatId) {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-002)
            console.log('❌ DELETE FAILED: Chat ID is required');
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-002)
            return res.status(400).json({
                success: false,
                error: 'Chat ID is required'
            });
        }
        
        if (!puid) {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-003)
            console.log('❌ DELETE FAILED: PUID not found in session');
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-003)
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }
        
        // Validate chat exists in memory
        if (!chatApp.validateChatExists(chatId)) {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-004)
            console.log(`❌ DELETE FAILED: Chat ${chatId} not found in memory`);
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-004)
            return res.status(404).json({
                success: false,
                error: 'Chat not found'
            });
        }
        
        //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-005)
        console.log(`✅ Chat ${chatId} exists, proceeding with deletion`);
        //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-005)
        
        // Delete from memory
        const deleted = chatApp.deleteChat(chatId);
        
        if (deleted) {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-006)
            console.log(`✅ Chat ${chatId} deleted from memory`);
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-006)
            
            // Delete from MongoDB
            try {
                const mongoDB = await EngEAI_MongoDB.getInstance();
                await mongoDB.deleteChatFromUser(courseName, puid, chatId);
                
                //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-007)
                console.log(`✅ Chat ${chatId} deleted from MongoDB`);
                //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-007)
            } catch (dbError) {
                //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-008)
                console.error('⚠️ WARNING: Failed to delete chat from MongoDB:', dbError);
                console.log('Chat deleted from memory but not from database');
                //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-008)
                // Continue execution - chat is deleted from memory
            }
            
            res.json({
                success: true,
                message: 'Chat deleted successfully',
                chatId: chatId
            });
        } else {
            //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-009)
            console.log(`❌ DELETE FAILED: Failed to delete chat ${chatId} from memory`);
            //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-009)
            res.status(500).json({
                success: false,
                error: 'Failed to delete chat'
            });
        }
        
    } catch (error) {
        //START DEBUG LOG : DEBUG-CODE(DELETE-CHAT-010)
        console.error('❌ DELETE ERROR:', error);
        //END DEBUG LOG : DEBUG-CODE(DELETE-CHAT-010)
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

