/**
 * ChatApp Class
 * 
 * This module provides the ChatApp class for managing chat conversations,
 * RAG integration, and message handling for the EngE-AI platform.
 * 
 * Key Features:
 * - Streaming chat responses from LLM
 * - RAG (Retrieval-Augmented Generation) with document similarity search
 * - Document retrieval from Qdrant vector database
 * - Context injection with text decorators for retrieved documents
 * - Support for conversational message history
 * - Real-time response streaming for better UX
 * - Chat inactivity timer management
 * 
 * @author: EngE-AI Team
 * @version: 2.0.0
 * @since: 2025-01-27
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { LoggerInterface } from 'ubc-genai-toolkit-core';
import { LLMModule, Message } from 'ubc-genai-toolkit-llm';
import { AppConfig } from '../routes/config';
import { RAGModule, RetrievedChunk } from 'ubc-genai-toolkit-rag';
import { Conversation } from 'ubc-genai-toolkit-llm/dist/conversation-interface';
import { IDGenerator } from './unique-id-generator';
import { ChatMessage, LearningObjective, TopicOrWeekInstance, TopicOrWeekItem } from './types';
import { EngEAI_MongoDB } from './EngEAI_MongoDB';
import { 
    getSystemPrompt, 
    getInitialAssistantMessage, 
    formatRAGPrompt
} from './chat-prompts';
import { memoryAgent } from '../memory-agent/memory-agent';
import { isDeveloperMode, generateMockStreamingResponse } from './developer-mode';

/**
 * Interface for initializing a new chat conversation
 */
export interface initChatRequest {
    userID: string;
    courseName: string;
    date: Date;
    chatId: string;
    initAssistantMessage: ChatMessage;
}

export class ChatApp {
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
        const timestamp = new Date().toISOString();
        console.log(`🧹 [CHAT-APP] ⏰ TIME LIMIT EXCEEDED - Cleaning up inactive chat: ${chatId} at ${timestamp}`);
        
        // Log state before cleanup
        const stateBeforeCleanup = {
            totalConversations: this.conversations.size,
            totalChatHistory: this.chatHistory.size,
            totalChatIDs: this.chatID.length,
            totalTimers: this.chatTimers.size,
            activeChatIds: Array.from(this.chatID),
            activeTimerIds: Array.from(this.chatTimers.keys())
        };
        
        console.log(`📊 [CHAT-APP] 📋 STATE BEFORE CLEANUP:`, stateBeforeCleanup);


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

        // Log state after cleanup
        const stateAfterCleanup = {
            totalConversations: this.conversations.size,
            totalChatHistory: this.chatHistory.size,
            totalChatIDs: this.chatID.length,
            totalTimers: this.chatTimers.size,
            activeChatIds: Array.from(this.chatID),
            activeTimerIds: Array.from(this.chatTimers.keys())
        };
        
        console.log(`📊 [CHAT-APP] 📋 STATE AFTER CLEANUP:`, stateAfterCleanup);
        console.log(`✅ [CHAT-APP] 🧹 Chat ${chatId} cleaned up successfully. Remaining active chats: ${this.chatID.length}`);
        console.log('─'.repeat(80));
        
        // TODO: Remove after testing lazy loading functionality
        // this.logActiveChats('CHAT CLEANED UP (TIMER EXPIRED)');
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
     * DEBUG LOGGER - Print list of active chat IDs
     * TODO: Remove after testing lazy loading functionality
     */
    private logActiveChats(event: string): void {
        console.log('\n' + '='.repeat(60));
        console.log(`🔍 DEBUG - ACTIVE CHATS @ ${event}`);
        console.log('='.repeat(60));
        console.log(`Total Active Chats: ${this.chatID.length}`);
        console.log(`Active Chat IDs: [${this.chatID.join(', ')}]`);
        console.log(`Conversations Map Size: ${this.conversations.size}`);
        console.log(`Chat History Map Size: ${this.chatHistory.size}`);
        console.log(`Active Timers: ${this.chatTimers.size}`);
        console.log('='.repeat(60) + '\n');
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
        // Check if developer mode is enabled - skip RAG retrieval
        if (isDeveloperMode()) {
            console.log('[DEVELOPER-MODE] 🧪 Skipping RAG document retrieval');
            return [];
        }
        
        if (!this.ragModule) {

            // DEBUG 18: Print the query
            console.log(`DEBUG #118: RAG Query:`, query);
            //END DEBUG 18
            // this.logger.warn('RAG module not available, skipping document retrieval');
            return [];
        }

        try {
            // Get course from MongoDB to check published status
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const course = await mongoDB.getCourseByName(courseName);
            
            if (!course) {
                this.logger.warn(`Course not found: ${courseName}, skipping document retrieval`);
                return [];
            }

            // Extract published item titles
            const publishedItemTitles: string[] = [];
            if (course.topicOrWeekInstances) {
                course.topicOrWeekInstances
                    .filter((instance_topicOrWeek: TopicOrWeekInstance) => instance_topicOrWeek.published === true)
                    .forEach((instance_topicOrWeek: TopicOrWeekInstance) => {
                        if (instance_topicOrWeek.items) {
                            instance_topicOrWeek.items.forEach((item: TopicOrWeekItem) => {
                                if (item.itemTitle && !publishedItemTitles.includes(item.itemTitle)) {
                                    publishedItemTitles.push(item.itemTitle);
                                }
                            });
                        }
                    });
            }

            // If no published items exist, return empty array
            if (publishedItemTitles.length === 0) {
                this.logger.debug(`No published items found for course: ${courseName}`);
                return [];
            }

            // Build filter for RAG retrieval
            // Qdrant filter format: must conditions with match clauses
            const filter: Record<string, any> = {
                must: [
                    { key: "courseName", match: { value: courseName } },
                    { key: "itemTitle", match: { any: publishedItemTitles } }
                ]
            };

            // Add course context to the query for better retrieval
            const contextualQuery = ` ${query}`;
            

            const results = await this.ragModule.retrieveContext(contextualQuery, {
                limit: limit,
                scoreThreshold: scoreThreshold,
                filter: filter
            });

            // DEBUG 19: Print the results
            console.log(`DEBUG #119: RAG Results:`, results);
            console.log(`DEBUG #119: RAG Results length:`, results.length);
            //END DEBUG 19

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
            
            // Parse metadata safely - extract only chapter and learning objectives
            let chapter = '';
            let learningObjectives: any[] = [];
            
            try {
                // Handle metadata - could be object or string
                let metadataObj: any = {};
                if (typeof doc.metadata === 'string') {
                    metadataObj = JSON.parse(doc.metadata);
                } else if (doc.metadata && typeof doc.metadata === 'object') {
                    metadataObj = doc.metadata;
                }
                
                // Extract chapter (topicOrWeekTitle)
                chapter = metadataObj.topicOrWeekTitle || '';
                
                // Extract learning objectives
                if (metadataObj.learningObjectives && Array.isArray(metadataObj.learningObjectives)) {
                    learningObjectives = metadataObj.learningObjectives;
                }
            } catch (error) {
                console.warn(`⚠️ Error parsing metadata for document ${index + 1}:`, error);
                // Continue with empty values if parsing fails
            }
            
            // Build formatted content with chapter and learning objectives BEFORE content
            if (chapter) {
                context += `chapter: ${chapter}\n`;
            }
            
            if (learningObjectives.length > 0) {
                context += `learningObjectives:\n`;
                learningObjectives.forEach((obj, objIndex) => {
                    const objectiveText = obj.text || obj.LearningObjective || obj.learningObjective || '';
                    if (objectiveText) {
                        context += `  ${objIndex + 1}. ${objectiveText}\n`;
                    }
                });
            }
            
            // Content comes after chapter and learning objectives
            context += `content: ${doc.content}\n`;
            
            context += `\n`;
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
        
        // TODO: Remove after testing lazy loading functionality
        // this.logActiveChats('MESSAGE SENT (TIMER RESET)');

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

        // ====================================================================
        // STEP 1: MEMORY AGENT ANALYSIS (runs BEFORE adding current message)
        // Analyzes the PREVIOUS complete exchange from conversation history
        // ====================================================================
        try {
            // Read conversation history BEFORE modifying anything (no race conditions)
            const historyBeforeAdding = conversation.getHistory();
            
            // Count messages excluding system message
            const nonSystemMessagesBefore = historyBeforeAdding.filter(msg => msg.role !== 'system');
            const messageCountBeforeAdding = nonSystemMessagesBefore.length;

            const MEMORY_AGENT_MIN_MESSAGES_THRESHOLD = 6; // change this later, by retrieving the data from .env file
            
            // Only analyze if conversation has more than threshold messages (previous exchanges)
            if (messageCountBeforeAdding > MEMORY_AGENT_MIN_MESSAGES_THRESHOLD) {
                // Extract last 3 messages from PREVIOUS complete exchange:
                // - Previous user message
                // - Previous LLM response  
                // - User message before that
                const lastMessages = nonSystemMessagesBefore.slice(-3);
                
                // Format the last 3 messages for analysis
                // Pattern: User prompt -> LLM response -> User prompt
                // Remove RAG document content from user messages to focus on actual conversation
                let formattedMessages = '';
                lastMessages.forEach((msg) => {
                    const role = msg.role === 'user' ? 'Student' : 'AI Tutor';
                    let content = msg.content;
                    
                    // Remove RAG document content from user messages
                    // RAG format: <course_materials>...</course_materials>\n\n---\n\n[bridge prompt]Student's question: [actual question]
                    if (role === 'Student' && content.includes('<course_materials>')) {
                        // Remove <course_materials> tags and all content inside them
                        content = content.replace(/<course_materials>[\s\S]*?<\/course_materials>/g, '');
                        
                        // Remove the separator and bridge prompt
                        content = content.replace(/\n\n---\n\n/g, '');
                        content = content.replace(/Based on the course materials[\s\S]*?Student's question:/g, '');
                        
                        // Extract only the actual user question (after "Student's question:" if it still exists)
                        const questionMarker = 'Student\'s question:';
                        const questionIndex = content.indexOf(questionMarker);
                        if (questionIndex !== -1) {
                            content = content.substring(questionIndex + questionMarker.length).trim();
                        }
                        
                        // Clean up any remaining whitespace
                        content = content.trim();
                    }
                    
                    formattedMessages += `${role}: ${content}\n\n`;
                });
                
                // Run memory agent analysis on PREVIOUS exchange
                await memoryAgent.analyzeAndUpdateStruggleWords(
                    userId,
                    courseName,
                    formattedMessages.trim()
                );
                console.log(`🧠 Memory agent analysis completed for chat ${chatId} (analyzed last 3 of ${messageCountBeforeAdding} messages from previous exchange)`);
            } else {
                console.log(`[CHAT-APP] ℹ️ Memory agent skipped: conversation has ${messageCountBeforeAdding} messages (requires >${MEMORY_AGENT_MIN_MESSAGES_THRESHOLD})`);
            }
        } catch (error) {
            console.error('❌ Error in memory agent analysis:', error);
            // Don't throw - memory agent failure shouldn't break the chat flow
        }

        // ====================================================================
        // STEP 2: RAG DOCUMENT RETRIEVAL (for CURRENT user message)
        // ====================================================================
        let ragContext = '';
        let documentsLength = 0;
        let retrievedDocumentTexts: string[] = [];  // NEW: Store document texts

        try {
            const documents = await this.retrieveRelevantDocuments(message, courseName, 3, 0.4); // Limit to 3 docs, threshold 0.4
            ragContext = this.formatDocumentsForContext(documents);
            documentsLength = documents.length;
            
            // NEW: Extract full text content from each retrieved document
            documents.forEach((doc) => {
                const content = (doc as any).payload?.text || 
                               (doc as any).text || 
                               (doc as any).content || 
                               '';
                if (content) {
                    retrievedDocumentTexts.push(content);
                }
            });
            
            console.log(`📚 Captured ${retrievedDocumentTexts.length} documents for storage`);
        } catch (error) {
            console.log(`❌ RAG Context Error:`, error);
            this.logger.error('Error retrieving RAG documents:', error as any);
            // Continue without RAG context if retrieval fails
        }

        // ====================================================================
        // STEP 3: FORMAT USER PROMPT WITH RAG CONTEXT
        // ====================================================================
        let userFullPrompt = '';
        if (documentsLength > 0) {  
            userFullPrompt = formatRAGPrompt(ragContext, message);
        }
        else {
            userFullPrompt = message;
        }

        // ====================================================================
        // STEP 4: ADD USER MESSAGE TO CONVERSATION
        // ====================================================================
        conversation.addMessage('user', userFullPrompt);

        // Calculate token statistics for file logging
        const history = conversation.getHistory();
        let totalCharacters = 0;
        let totalEstimatedTokens = 0;
        
        history.forEach((msg) => {
            const charCount = msg.content.length;
            const estimatedTokens = Math.ceil(charCount / 4); // Rough estimate: ~4 chars per token
            totalCharacters += charCount;
            totalEstimatedTokens += estimatedTokens;
        });
        
        // Write conversation history to file in prompt-test folder
        // await this.writeConversationHistoryToFile(chatId, courseName, userId, history, totalCharacters, totalEstimatedTokens);
        
        // Stream the response
        console.log(`\n🚀 Starting LLM streaming...`);

        let assistantResponse = '';

        // Check if developer mode is enabled - use mock response instead of real LLM
        if (isDeveloperMode()) {
            console.log('[DEVELOPER-MODE] 🧪 Using mock streaming response instead of LLM');
            assistantResponse = await generateMockStreamingResponse(onChunk);
            console.log(`\n✅ Mock streaming completed. Full response length: ${assistantResponse.length}`);
            console.log(`Full response: "${assistantResponse}"`);
        } else {
            // Normal LLM streaming
            let conversationConfig: any = {
                temperature: 0.7,
            }

            if (this.llmProvider === 'ollama') {

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
        }

        // ====================================================================
        // STEP 5: ADD ASSISTANT MESSAGE TO CONVERSATION AND HISTORY
        // ====================================================================
        // Note: userId parameter is string but we'll parse it - should be numeric from session
        const assistantMessage = this.addAssistantMessage(chatId, assistantResponse, userId, courseName, retrievedDocumentTexts);
        
        // Check if this is the first user-AI exchange and update title if needed
        await this.updateChatTitleIfNeeded(chatId, assistantResponse, courseName, userId);
        
        return assistantMessage;
    }

    public async initializeConversation(userID: string, courseName: string, date: Date): Promise<initChatRequest> {
        //create chatID from the user ID
        const chatId = this.chatIDGenerator.chatID(userID, courseName, date);

        // Add chatId to active chats array (only if not already present)
        if (!this.chatID.includes(chatId)) {
            this.chatID.push(chatId);
        } else {
            console.log(`⚠️ Chat ${chatId} already exists in chatID array, skipping duplicate addition`);
        }
        
        this.conversations.set(chatId, this.llmModule.createConversation());
        this.chatHistory.set(chatId, []);
        
        // Retrieve struggle words from memory agent
        let struggleTopics: string[] = [];
        try {
            struggleTopics = await memoryAgent.getStruggleWords(userID, courseName);
            console.log(`🧠 Retrieved ${struggleTopics.length} struggle words for user ${userID}`);
        } catch (error) {
            console.error('❌ Error retrieving struggle words:', error);
            // Continue without struggle words if retrieval fails
        }
        
        // Add default system message (now async to retrieve learning objectives and include struggle words)
        await this.addDefaultSystemMessage(chatId, courseName, struggleTopics);
        
        
        // Add default assistant message and get it
        const initAssistantMessage = this.addDefaultAssistantMessage(chatId);
        
        // Set the course name on the assistant message
        initAssistantMessage.courseName = courseName;

        // Start the inactivity timer for this new chat
        this.resetChatTimer(chatId);

        // TODO: Remove after testing lazy loading functionality
        // this.logActiveChats('NEW CHAT CREATED');

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
    private async addDefaultSystemMessage(chatId: string, courseName?: string, struggleTopics?: string[]): Promise<void> {
        const conversation = this.conversations.get(chatId);
        if (!conversation) {
            throw new Error('Conversation not found');
        }
        
        // Retrieve all learning objectives for the course
        let learningObjectives: LearningObjective[] = [];
        if (courseName) {
            try {
                const mongoDB = await EngEAI_MongoDB.getInstance();
                // Get course by name to extract courseId
                const course = await mongoDB.getCourseByName(courseName);
                if (course && course.id) {
                    learningObjectives = await mongoDB.getAllLearningObjectives(course.id);
                    console.log(`📚 Retrieved ${learningObjectives.length} learning objectives for system prompt`);
                }
            } catch (error) {
                console.error('❌ Error retrieving learning objectives:', error);
                // Continue without learning objectives if retrieval fails
            }
        }
        
        const defaultSystemMessage = getSystemPrompt(courseName, learningObjectives, struggleTopics);

        try {
            conversation.addMessage('system', defaultSystemMessage);
        } catch (error) {
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
            userId: '',
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
            userId: userId,
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
     * Write conversation history to files in prompt-test folder
     * Creates both a formatted text file and a JSON file for analysis
     * 
     * @param chatId - The chat ID
     * @param courseName - The course name
     * @param userId - The user ID
     * @param history - The conversation history array
     * @param totalCharacters - Total character count
     * @param totalEstimatedTokens - Total estimated token count
     */
    private async writeConversationHistoryToFile(
        chatId: string,
        courseName: string,
        userId: string,
        history: Message[],
        totalCharacters: number,
        totalEstimatedTokens: number
    ): Promise<void> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `conversation-history-${chatId}-${timestamp}.txt`;
            const filePath = path.join(process.cwd(), 'prompt-test', fileName);
            
            // Create formatted text content
            let fileContent = `CONVERSATION HISTORY\n`;
            fileContent += `Chat ID: ${chatId}\n`;
            fileContent += `Course: ${courseName}\n`;
            fileContent += `User ID: ${userId}\n`;
            fileContent += `Timestamp: ${new Date().toISOString()}\n`;
            fileContent += `${'='.repeat(80)}\n\n`;
            
            fileContent += `TOKEN SUMMARY:\n`;
            fileContent += `  Total Messages: ${history.length}\n`;
            fileContent += `  Total Characters: ${totalCharacters}\n`;
            fileContent += `  Estimated Total Tokens: ~${totalEstimatedTokens}\n`;
            fileContent += `  Average Tokens per Message: ~${Math.round(totalEstimatedTokens / history.length)}\n`;
            fileContent += `${'='.repeat(80)}\n\n`;
            
            history.forEach((msg, index) => {
                const charCount = msg.content.length;
                const estimatedTokens = Math.ceil(charCount / 4);
                
                fileContent += `MESSAGE ${index + 1}\n`;
                fileContent += `${'-'.repeat(80)}\n`;
                fileContent += `Role: ${msg.role}\n`;
                fileContent += `Content Length: ${charCount} characters (~${estimatedTokens} tokens)\n`;
                fileContent += `Timestamp: ${msg.timestamp || 'N/A'}\n`;
                fileContent += `\nContent:\n${msg.content}\n`;
                fileContent += `\n${'='.repeat(80)}\n\n`;
            });
            
            // Ensure prompt-test directory exists
            const promptTestDir = path.join(process.cwd(), 'prompt-test');
            await fs.mkdir(promptTestDir, { recursive: true });
            
            // Write to file
            await fs.writeFile(filePath, fileContent, 'utf-8');
            console.log(`📄 Conversation history saved to: ${filePath}`);
            
            // Also save as JSON for programmatic access
            const jsonFileName = `conversation-history-${chatId}-${timestamp}.json`;
            const jsonFilePath = path.join(process.cwd(), 'prompt-test', jsonFileName);
            const jsonContent = {
                chatId,
                courseName,
                userId,
                timestamp: new Date().toISOString(),
                summary: {
                    totalMessages: history.length,
                    totalCharacters,
                    estimatedTotalTokens: totalEstimatedTokens,
                    averageTokensPerMessage: Math.round(totalEstimatedTokens / history.length)
                },
                messages: history.map((msg, index) => ({
                    index: index + 1,
                    role: msg.role,
                    content: msg.content,
                    contentLength: msg.content.length,
                    estimatedTokens: Math.ceil(msg.content.length / 4),
                    timestamp: msg.timestamp
                }))
            };
            
            await fs.writeFile(jsonFilePath, JSON.stringify(jsonContent, null, 2), 'utf-8');
            console.log(`📄 Conversation history (JSON) saved to: ${jsonFilePath}`);
        } catch (error) {
            console.error(`❌ Error writing conversation history to file:`, error);
            // Don't throw - file writing failure shouldn't break the chat flow
        }
    }

    /**
     * Add an assistant message to conversation and chat history
     * 
     * @param chatId - The chat ID
     * @param message - The assistant's message
     * @param userId - Optional user ID (defaults to 0)
     * @param courseName - Optional course name (defaults to empty string)
     * @param retrievedDocuments - Optional array of retrieved document texts
     * @returns ChatMessage - The created assistant message
     */
    private addAssistantMessage(chatId: string, message: string, userId: string, courseName: string = '', retrievedDocuments?: string[]): ChatMessage {
        // Generate message ID
        const currentDate = new Date();
        const messageId = this.chatIDGenerator.messageID(message, chatId, currentDate);
        
        // Create the ChatMessage object
        const chatMessage: ChatMessage = {
            id: messageId,
            sender: 'bot',
            userId: userId,
            courseName: courseName,
            text: message,
            timestamp: Date.now(),
            retrievedDocuments: retrievedDocuments  // NEW: Add retrieved documents
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
            // Retrieve learning objectives for the course
            let learningObjectives: LearningObjective[] = [];
            try {
                const course = await mongoDB.getCourseByName(courseName);
                if (course && course.id) {
                    learningObjectives = await mongoDB.getAllLearningObjectives(course.id);
                    console.log(`📚 Retrieved ${learningObjectives.length} learning objectives during chat restoration`);
                }
            } catch (error) {
                console.error('❌ Error retrieving learning objectives during restore:', error);
                // Continue without learning objectives if retrieval fails
            }
            
            // Retrieve struggle words from memory agent
            let struggleTopics: string[] = [];
            try {
                struggleTopics = await memoryAgent.getStruggleWords(userId, courseName);
                console.log(`🧠 Retrieved ${struggleTopics.length} struggle words during chat restoration`);
            } catch (error) {
                console.error('❌ Error retrieving struggle words during restore:', error);
                // Continue without struggle words if retrieval fails
            }
            
            const defaultSystemMessage = getSystemPrompt(courseName, learningObjectives, struggleTopics);
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
            
            // Add chatId to active chats array (only if not already present)
            if (!this.chatID.includes(chatId)) {
                this.chatID.push(chatId);
            } else {
                console.log(`⚠️ Chat ${chatId} already exists in chatID array, skipping duplicate addition`);
            }
            
            // Start the inactivity timer
            this.resetChatTimer(chatId);

            console.log(`✅ Chat ${chatId} restored successfully with ${restoredMessages.length} messages`);
            
            // TODO: Remove after testing lazy loading functionality
            // this.logActiveChats('CHAT RESTORED FROM DB');
            
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
            
            // TODO: Remove after testing lazy loading functionality
            // this.logActiveChats('CHAT EXPLICITLY DELETED');
            
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

