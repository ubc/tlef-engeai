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
import { RAGModule } from 'ubc-genai-toolkit-rag';
import { Conversation } from 'ubc-genai-toolkit-llm/dist/conversation-interface';
import { IDGenerator } from '../functions/unique-id-generator';
import { ChatMessage } from '../functions/types';

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
    // private ragModule: RAGModule;
    private logger: LoggerInterface;
    private debug: boolean;
    // private conversation : Conversation;
    // private mongoDB: EngEAI_MongoDB;
    private conversations : Map<string, Conversation>; // it maps chatId to conversation
    private chatHistory : Map<string, ChatMessage[]>; // it maps chatId to chat history
    private chatID : string[];
    private chatIDGenerator: IDGenerator;

    constructor(config: AppConfig) {
        this.llmModule = new LLMModule(config.llmConfig);
        // this.ragModule = await RAGModule.create(config.ragConfig);
        this.logger = config.logger;
        this.debug = config.debug;
        // this.mongoDB = {} as EngEAI_MongoDB; // initialize later
        this.conversations = new Map(); 
        this.chatHistory = new Map();
        this.chatID = [];
        this.chatIDGenerator = IDGenerator.getInstance();
    }
    /**
     * it will send the whole conversation to the LLM
     * 
     * return a streamed response
     */
    public async sendMessage(message: string, chatId: string) {
        const response = await this.llmModule.sendMessage(message);
        return response;
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


}

const chatApp = new ChatApp(appConfig);

/**
 * Enhanced chat endpoint with RAG functionality
 */
router.post('/chat/:chatId', async (req: Request, res: Response) => {
    
});

/**
 * create an new chat for user
 * 
 * @param userID - The user ID
 * @param courseName - The name of the course
 * @param date - The date of the chat
 * @returns The new chat ID
 */
router.post('/chat/newchat', async (req: Request, res: Response) => {
    try {
        const userID = req.body.userID;
        const courseName = req.body.courseName;
        const date = req.body.date;
        
        if (!userID || !courseName || !date) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: userID, courseName, and date are required' 
            });
        }

        // Initialize conversation and get the response
        const initResponse = chatApp.initializeConversation(userID, courseName, date);
        
        // Generate the actual chatId using the IDGenerator singleton
        const chatId = IDGenerator.getInstance().chatID(userID, courseName, date);
        
        res.json({ 
            success: true, 
            chatId: chatId,
            initAssistantMessage: initResponse.initAssistantMessage
        });
        
    } catch (error) {
        console.error('Error creating new chat:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create new chat' 
        });
    }
});


export default router;

