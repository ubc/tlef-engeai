// src/chat/chat-app.ts


import * as fs from 'fs/promises';
import * as path from 'path';
import { appLogger } from '../utils/logger';
import { LLMModule, Message } from 'ubc-genai-toolkit-llm';
import { AppConfig } from '../utils/config';
import { RAGApp } from '../rag/rag-app';
import {
    ragPrompts,
    RAG_ERROR_MESSAGE,
    RAG_NO_DOCS_MESSAGE,
    COURSE_MATERIALS_OPEN,
} from '../rag/rag-prompts';
import { Conversation } from 'ubc-genai-toolkit-llm/dist/conversation-interface';
import { IDGenerator } from '../utils/unique-id-generator';
import { Chat, ChatMessage, ConversationModeId, PersistedConversationModeId, LearningObjectiveForDisplay, activeCourse, DEFAULT_PROMPT_ID } from '../types/shared';
import { conversationModePrompts } from './compose-system-prompt';
import { assembleCourseSystemPrompt } from './system-prompts/assemble-course-system-prompt';
import { getDefaultAssistantMessage } from './initial-assistant-prompt-default';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { memoryAgent } from '../memory-agent/memory-agent';
import { isDeveloperMode, generateMockStreamingResponse } from '../helpers/developer-mode';

/**
 * Shown to students who try to send a new message in a retired scenario-generation chat.
 * History still renders; see `planner/improved-scenario-generation-deliverables.md` §3.8/§11.
 */
export const RETIRED_CONVERSATION_MODE_MESSAGE =
    'Scenario Generation is no longer available in chat. Please use Practice Scenarios from the sidebar to work on troubleshooting cases.';

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
 * @since: 2026-03-16
 */
export class ChatApp {

    private llmModule: LLMModule;
    private debug: boolean;
    private conversations : Map<string, Conversation>; // it maps chatId to conversation
    private chatHistory : Map<string, ChatMessage[]>; // it maps chatId to chat history
    private chatID : string[];
    private chatIDGenerator: IDGenerator;
    private llmProvider: any;
    private chatTimers: Map<string, NodeJS.Timeout>; // Maps chatId to cleanup timer
    private chatConversationModes: Map<string, PersistedConversationModeId>; // Maps chatId to persisted teaching mode
    private chatInactivityTimeout: number = 5 * 60 * 1000; // 5 minutes in milliseconds

    constructor(config: AppConfig) {
        this.llmModule = new LLMModule(config.llmConfig);
        this.debug = config.debug;
        this.conversations = new Map(); 
        this.chatHistory = new Map();
        this.chatID = [];
        this.chatIDGenerator = IDGenerator.getInstance();
        this.llmProvider = config.llmConfig.provider;
        this.chatTimers = new Map();
        this.chatConversationModes = new Map();
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
        appLogger.log(`🕐 Timer reset for chat ${chatId} - will cleanup in ${this.chatInactivityTimeout / 1000 / 60} minutes`);
    }

    /**
     * Clean up an inactive chat from memory
     * Removes chat from all maps and arrays, clears its timer
     * 
     * @param chatId - The chat ID to clean up
     */
    private cleanupInactiveChat(chatId: string): void {
        const timestamp = new Date().toISOString();
        appLogger.log(`🧹 [CHAT-APP] ⏰ TIME LIMIT EXCEEDED - Cleaning up inactive chat: ${chatId} at ${timestamp}`);
        
        // Log state before cleanup
        const stateBeforeCleanup = {
            totalConversations: this.conversations.size,
            totalChatHistory: this.chatHistory.size,
            totalChatIDs: this.chatID.length,
            totalTimers: this.chatTimers.size,
            activeChatIds: Array.from(this.chatID),
            activeTimerIds: Array.from(this.chatTimers.keys())
        };
        
        appLogger.log(`📊 [CHAT-APP] 📋 STATE BEFORE CLEANUP:`, stateBeforeCleanup);


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
        this.chatConversationModes.delete(chatId);

        // Log state after cleanup
        const stateAfterCleanup = {
            totalConversations: this.conversations.size,
            totalChatHistory: this.chatHistory.size,
            totalChatIDs: this.chatID.length,
            totalTimers: this.chatTimers.size,
            activeChatIds: Array.from(this.chatID),
            activeTimerIds: Array.from(this.chatTimers.keys())
        };
        
        appLogger.log(`📊 [CHAT-APP] 📋 STATE AFTER CLEANUP:`, stateAfterCleanup);
        appLogger.log(`✅ [CHAT-APP] 🧹 Chat ${chatId} cleaned up successfully. Remaining active chats: ${this.chatID.length}`);
        appLogger.log('─'.repeat(80));
        
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
            appLogger.log(`⏹️ Timer stopped for chat ${chatId}`);
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
        appLogger.log(`[CHAT-APP] 📝 Generating title from response: "${responseText.substring(0, 100)}..."`);
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
            appLogger.log(`[CHAT-APP] ✅ Generated title: "${title}"`);
            //END DEBUG LOG : DEBUG-CODE(GENERATE-TITLE-SUCCESS)
            
            return title || 'New Chat'; // Fallback to "New Chat" if empty
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(GENERATE-TITLE-ERROR)
            appLogger.error(`[CHAT-APP] 🚨 Error generating title:`, error);
            //END DEBUG LOG : DEBUG-CODE(GENERATE-TITLE-ERROR)
            return 'New Chat'; // Fallback to "New Chat" on error
        }
    }

    /**
     * DEBUG LOGGER - Print list of active chat IDs
     * TODO: Remove after testing lazy loading functionality
     */
    private logActiveChats(event: string): void {
        appLogger.log('\n' + '='.repeat(60));
        appLogger.log(`🔍 DEBUG - ACTIVE CHATS @ ${event}`);
        appLogger.log('='.repeat(60));
        appLogger.log(`Total Active Chats: ${this.chatID.length}`);
        appLogger.log(`Active Chat IDs: [${this.chatID.join(', ')}]`);
        appLogger.log(`Conversations Map Size: ${this.conversations.size}`);
        appLogger.log(`Chat History Map Size: ${this.chatHistory.size}`);
        appLogger.log(`Active Timers: ${this.chatTimers.size}`);
        appLogger.log('='.repeat(60) + '\n');
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
        appLogger.log(`[CHAT-APP] 🔍 Checking if title needs update for chat ${chatId}`);
        //END DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-CHECK)
        
        try {
            // Get current chat from MongoDB to check title
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const userChats = await mongoDB.getUserChats(courseName, userId);
            const currentChat = userChats.find(chat => chat.id === chatId);
            
            if (!currentChat) {
                //START DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-NO-CHAT)
                appLogger.log(`[CHAT-APP] ⚠️ Chat ${chatId} not found in MongoDB`);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-NO-CHAT)
                return;
            }
            
            // Check if title needs updating (is "New Chat" or empty)
            const currentTitle = currentChat.itemTitle || '';
            const needsUpdate = currentTitle === 'New Chat' || currentTitle === '';
            
            //START DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-DECISION)
            appLogger.log(`[CHAT-APP] 📊 Title update decision: current="${currentTitle}", needsUpdate=${needsUpdate}`);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-DECISION)
            
            if (needsUpdate) {
                // Generate new title from AI response
                const newTitle = this.generateChatTitleFromResponse(assistantResponse);
                
                // Update title in MongoDB
                await mongoDB.updateChatTitle(courseName, userId, chatId, newTitle);
                
                //START DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-SUCCESS)
                appLogger.log(`[CHAT-APP] ✅ Chat title updated from "${currentTitle}" to "${newTitle}"`);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-SUCCESS)
            } else {
                //START DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-SKIP)
                appLogger.log(`[CHAT-APP] ⏭️ Title update skipped - current title is not "New Chat"`);
                //END DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-SKIP)
            }
        } catch (error) {
            //START DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-ERROR)
            appLogger.error(`[CHAT-APP] 🚨 Error updating chat title:`, error);
            //END DEBUG LOG : DEBUG-CODE(UPDATE-TITLE-ERROR)
            // Don't throw error - title update failure shouldn't break the chat flow
        }
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


        // ====================================================================
        // STEP 1: Add user message to conversation and history
        // ====================================================================

        // Add user message to both LLM conversation and chatHistory for frontend sync
        const addedUserMessage = this.addUserMessage(chatId, message, userId, courseName);
        // ====================================================================
        // STEP 2: RAG DOCUMENT RETRIEVAL (for CURRENT user message)
        // ====================================================================
        
        let additionalContext = '';
        

        let ragContext : string = '';
        let documentsLength : number = 0;
        let ragRetrievalFailed = false;

        try {
            const ragApp = await RAGApp.getInstance();
            const documents = await ragApp.retrieveForChat(message, courseName, {
                limit: 3,
                scoreThreshold: 0.4,
            });
            ragContext = ragPrompts.formatRetrievedContext(documents);
            documentsLength = documents.length;
            
            appLogger.log(`📚 Captured ${documents.length} documents for storage`);
            appLogger.log(`📚 Retrieved document texts: ${ragContext}`);
        } catch (error) {
            appLogger.log(`❌ RAG Context Error:`, error);
            appLogger.error('Error retrieving RAG documents:', error as any);
            ragRetrievalFailed = true;
        }

        // ====================================================================
        // STEP 3: FORMAT USER PROMPT WITH RAG CONTEXT AND UNSTRUGGLE REVEAL TAG
        // ====================================================================
        
        if (documentsLength > 0) {
            const persistedMode = this.chatConversationModes.get(chatId);
            const ragMode = conversationModePrompts.resolveModeId(persistedMode);
            additionalContext = ragPrompts.formatRagUserTurn(ragMode, ragContext, message);
        }
        else if (ragRetrievalFailed) {
            additionalContext = RAG_ERROR_MESSAGE;
        }
        else {
            additionalContext = RAG_NO_DOCS_MESSAGE;
        }

        // Phase note: struggle topics apply to Socratic chats only (see isStruggleTopicsEnabledForChat).
        if (this.isStruggleTopicsEnabledForChat(chatId)) {
            const struggleTopics = await memoryAgent.getStruggleWords(userId, courseName);

            if (struggleTopics.length > 0) {
                additionalContext += `Based on our conversation, I've identified these topics you might want to focus on: <struggle_topics>${struggleTopics.join(', ')}</struggle_topics>\n\nPlease see the rules int he system prompt for how to covney information about any of these topics if the current user prompt is not asking about any of these topics`;
                additionalContext += '\n<questionUnstruggle reveal="TRUE"> \n by this tag this means that you SHOULD select the most relevant struggle topic from the <struggle_topics> tags, and add the <questionUnstruggle Topic="topic"> tag to the end of the response. ';
            } else {
                additionalContext += '\n<questionUnstruggle reveal="FALSE"> \n by this tag this means that you should NOT add the <questionUnstruggle Topic="topic"> tag to the end of the response';
            }
        }

        // ====================================================================
        // STEP 4: CREATE FORKED CONVERSATION WITH ADDITIONAL CONTEXT
        // ====================================================================

        // Create a forked conversation for LLM call (additional context won't pollute original conversation)
        const forkedConversation = this.llmModule.createConversation();

        // Copy all messages from original conversation to forked conversation
        const originalConversationHistory = conversation.getHistory();
        (originalConversationHistory as any[]).forEach((msg: any) => {
            forkedConversation.addMessage(msg.role, msg.content);
        });

        // Add additional context to forked conversation only
        forkedConversation.addMessage('user', additionalContext);

        // ====================================================================
        // LOG BOTH ORIGINAL AND FORKED CONVERSATION HISTORIES
        // ====================================================================

        // Log original conversation (stored in Maps)
        appLogger.log(`\n📝 ORIGINAL CONVERSATION HISTORY (Chat: ${chatId}, User: ${userId}) - STORED IN MAPS:`);
        appLogger.log(`Total messages: ${originalConversationHistory.length}`);
        appLogger.log('='.repeat(80));

        originalConversationHistory.forEach((msg: any, index: number) => {
            const role = msg.role.toUpperCase();
            const content = msg.content;
            const charCount = content.length;

            appLogger.log(`[${index + 1}] ${role} - ${charCount} chars:`);
            appLogger.log(`${content}`);
            appLogger.log('-'.repeat(40));
        });
        appLogger.log('='.repeat(80));

        appLogger.log('\n'.repeat(10));

        // Log forked conversation (used for LLM call)
        const forkedConversationHistory : Message[] = forkedConversation.getHistory();
        appLogger.log(`\n📝 FORKED CONVERSATION HISTORY (Chat: ${chatId}, User: ${userId}) - SENT TO LLM:`);
        appLogger.log(`Total messages: ${forkedConversationHistory.length}`);
        appLogger.log('='.repeat(80));

        forkedConversationHistory.forEach((msg: Message, index: number) => {
            const role = msg.role.toUpperCase();
            const content = msg.content;
            const charCount = content.length;

            appLogger.log(`[${index + 1}] ${role} - ${charCount} chars:`);
            appLogger.log(`${content}`);
            appLogger.log('-'.repeat(40));
        });
        appLogger.log('='.repeat(80));

        // // printing out the full user prompt from this conversation
        // appLogger.log(`\n\n📝 FULL USER PROMPT FROM THIS CONVERSATION:\n\n`);
        // appLogger.log(`${message}`);
        // appLogger.log('='.repeat(80));

        // appLogger.log(`\n\n📝 FULL ADDITIONAL CONTEXT FROM THIS CONVERSATION:\n\n`);
        // appLogger.log(`${additionalContext}`);
        // appLogger.log('='.repeat(80));

        // appLogger.log(`📝 END CONVERSATION LOG\n`);

        // Calculate token statistics for file logging
        let totalCharacters = 0;
        let totalEstimatedTokens = 0;

        (originalConversationHistory as any[]).forEach((msg: any) => {
            const charCount = msg.content.length;
            const estimatedTokens = Math.ceil(charCount / 4); // Rough estimate: ~4 chars per token
            totalCharacters += charCount;
            totalEstimatedTokens += estimatedTokens;
        });
        
        // Write conversation history to file in prompt-test folder
        // await this.writeConversationHistoryToFile(chatId, courseName, userId, history, totalCharacters, totalEstimatedTokens);
        
        // Stream the response
        appLogger.log(`\n🚀 Starting LLM streaming...`);

        let assistantResponse = '';

        // Check if developer mode is enabled - use mock response instead of real LLM
        if (isDeveloperMode()) {
            appLogger.log('[DEVELOPER-MODE] 🧪 Using mock streaming response instead of LLM');
            assistantResponse = await generateMockStreamingResponse(onChunk);
            appLogger.log(`\n✅ Mock streaming completed. Full response length: ${assistantResponse.length}`);
            appLogger.log(`Full response: "${assistantResponse}"`);
        } else {
            // Normal LLM streaming
            let conversationConfig: any = {
                temperature: 0.7,
            }

            if (this.llmProvider === 'ollama') {

                conversationConfig.num_ctx = 32768;
            }

            const response = await forkedConversation.stream(
                (chunk: string) => {
                    appLogger.log(`📦 Received chunk: "${chunk}"`);
                    assistantResponse += chunk;
                    onChunk(chunk);
                },
                conversationConfig
            );
            
            appLogger.log(`\n✅ Streaming completed. Full response length: ${assistantResponse.length}`);
            appLogger.log(`Full response: "${assistantResponse}"`);
        }

        // ====================================================================
        // STEP 5: ADD ASSISTANT MESSAGE TO CONVERSATION AND HISTORY
        // ====================================================================

        // Note: userId parameter is string but we'll parse it - should be numeric from session
        const assistantMessage = this.addAssistantMessage(chatId, assistantResponse, userId, courseName);

        // Add assistant message to original conversation
        conversation.addMessage('assistant', assistantResponse);
        
        // Check if this is the first user-AI exchange and update title if needed
        await this.updateChatTitleIfNeeded(chatId, assistantResponse, courseName, userId);


        // The forked message is automatically discarded after LLM call, so no cleanup needed

        // ====================================================================
        // STEP 6: MEMORY AGENT ANALYSIS (runs BEFORE adding current message)
        // Analyzes the PREVIOUS complete exchange from conversation history
        // ====================================================================

        // Read conversation history BEFORE modifying anything (no race conditions)
        const conversationHistory = conversation.getHistory();

        const messageCount = conversationHistory.length;

        // 6 is chosen because we want to take the first 2 user conversation
        // {System prompt, inital assistant message, user message 1, assistant message1, user message 2, and assistant message2}
        const MEMORY_AGENT_MIN_MESSAGES_THRESHOLD = 6; 
        
        // Memory agent activates after 4 messages

        if (this.isStruggleTopicsEnabledForChat(chatId)) {
            try {
                if (messageCount > MEMORY_AGENT_MIN_MESSAGES_THRESHOLD) {
                    const lastMessages = conversationHistory.slice(-3);

                    let formattedMessages = '';

                    // Format the last 3 messages for memory agent analysis
                    lastMessages.forEach((msg : any) => {
                        const role = msg.role === 'user' ? 'Student' : 'AI Tutor';
                        let content = msg.content;

                        if (role === 'Student' && content.includes(COURSE_MATERIALS_OPEN)) {
                            content = ragPrompts.stripRagFromUserMessage(content);
                        }

                        formattedMessages += `${role}: ${content}\n\n`;
                    });

                    // Analyze the formatted messages for struggle words (untrimmed for debug fidelity)
                    await memoryAgent.analyzeAndUpdateStruggleWords(
                        userId,
                        courseName,
                        formattedMessages
                    );

                    appLogger.log(`🧠 Memory agent analysis completed for chat ${chatId} (analyzed last 3 of ${messageCount} messages from previous exchange)`);

                } else {
                    appLogger.log(`[CHAT-APP] ℹ️ Memory agent skipped: conversation has ${messageCount} messages (requires >${MEMORY_AGENT_MIN_MESSAGES_THRESHOLD})`);
                }
            } catch (error) {
                appLogger.error('❌ Error in memory agent analysis:', error);
            }
        }
        
        return assistantMessage;
    }

    /**
     * this method initializes a new conversation for a user
     * 
     * @param userID - The user ID
     * @param courseName - The course name
     * @param date - The date of the chat
     * @returns The initial chat request
     */
    public async initializeConversation(
        userID: string,
        courseName: string,
        date: Date,
        conversationMode?: ConversationModeId | string
    ): Promise<initChatRequest> {
        //create chatID from the user ID
        const chatId = this.chatIDGenerator.chatID(userID, courseName, date);

        // Add chatId to active chats array (only if not already present)
        if (!this.chatID.includes(chatId)) {
            this.chatID.push(chatId);
        } else {
            appLogger.log(`⚠️ Chat ${chatId} already exists in chatID array, skipping duplicate addition`);
        }
        
        this.conversations.set(chatId, this.llmModule.createConversation());
        this.chatHistory.set(chatId, []);
        const persistedMode = this.toPersistedConversationMode(conversationMode);
        this.chatConversationModes.set(chatId, persistedMode);

        if (conversationModePrompts.isValidConversationMode(persistedMode)) {
            await this.addDefaultSystemMessage(chatId, courseName);
        }
        
        
        // Add default assistant message and get it (now async to retrieve selected prompt)
        const initAssistantMessage = await this.addDefaultAssistantMessage(chatId, courseName);
        
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
     * Normalizes init/API mode input to a persisted chat mode slug.
     */
    private toPersistedConversationMode(
        conversationMode?: ConversationModeId | string
    ): PersistedConversationModeId {
        if (conversationMode === 'undeclared') {
            return 'undeclared';
        }
        if (conversationMode === 'explanatory') {
            return 'explanatory';
        }
        if (conversationMode === 'socratic') {
            return 'socratic';
        }
        return conversationModePrompts.resolveModeId(conversationMode);
    }

    /**
     * Adds the composed system message (code-owned mode sections + course overlays) to the conversation.
     *
     * Skipped when the chat mode is `undeclared` (mode chosen on first user message).
     *
     * @param chatId - Active chat identifier
     * @param courseName - Course used for learning objectives overlay
     */
    private async addDefaultSystemMessage(chatId: string, courseName?: string): Promise<void> {
        const conversation = this.conversations.get(chatId);
        if (!conversation) {
            throw new Error('Conversation not found');
        }

        const persistedMode = this.chatConversationModes.get(chatId);
        if (!persistedMode || !conversationModePrompts.isValidConversationMode(persistedMode)) {
            return;
        }

        let learningObjectives: LearningObjectiveForDisplay[] = [];
        let systemPromptConfig = null;

        if (courseName) {
            try {
                const mongoDB = await EngEAI_MongoDB.getInstance();
                const course = await mongoDB.getCourseByName(courseName);
                if (course?.id) {
                    learningObjectives = await mongoDB.getAllLearningObjectives(course.id);
                    systemPromptConfig = await mongoDB.getSystemPromptConfig(course.id);
                    appLogger.log(
                        `📚 Retrieved ${learningObjectives.length} learning objectives for system prompt (mode=${persistedMode})`
                    );
                }
            } catch (error) {
                appLogger.error('❌ Error retrieving learning objectives for system prompt:', error);
            }
        }

        const defaultSystemMessage = assembleCourseSystemPrompt({
            mode: persistedMode,
            courseName,
            learningObjectives,
            config: systemPromptConfig,
        });

        try {
            conversation.addMessage('system', defaultSystemMessage);
        } catch (error) {
            appLogger.error('Error adding default message:', error);
        }
    }

    /**
     * Builds XML system prompt from course config and platform defaults.
     */
    private async buildCourseSystemPromptXml(
        courseName: string | undefined,
        mode: ConversationModeId,
        learningObjectives: LearningObjectiveForDisplay[]
    ): Promise<string> {
        let systemPromptConfig = null;
        if (courseName) {
            try {
                const mongoDB = await EngEAI_MongoDB.getInstance();
                const course = await mongoDB.getCourseByName(courseName);
                if (course?.id) {
                    systemPromptConfig = await mongoDB.getSystemPromptConfig(course.id);
                }
            } catch (error) {
                appLogger.error('❌ Error loading system prompt config:', error);
            }
        }
        return assembleCourseSystemPrompt({
            mode,
            courseName,
            learningObjectives,
            config: systemPromptConfig,
        });
    }

    /**
     * this method directly add the Default Assistant Message to the conversation and the message is added to the chat history
     * Retrieves the selected initial assistant prompt from the course if available, otherwise uses default
     * 
     * @param chatId - The chat ID
     * @param courseName - The course name (used to retrieve selected prompt)
     * @return the message object, so this message can be passed to the client when initiate a chat
     */
    private async addDefaultAssistantMessage(chatId: string, courseName?: string): Promise<ChatMessage> {
        let defaultMessageText: string = getDefaultAssistantMessage();
        
        // Try to retrieve selected initial assistant prompt from course
        if (courseName) {
            try {
                const mongoDB = await EngEAI_MongoDB.getInstance();
                const course = await mongoDB.getCourseByName(courseName);
                
                if (!course) {
                    appLogger.log(`⚠️ [CHAT-INIT] Course not found for courseName: ${courseName}, using default message`);
                } else {
                    const courseData = course as unknown as activeCourse;
                    const courseId = courseData.id;
                    
                    if (!courseId) {
                        appLogger.error(`❌ [CHAT-INIT] Course found but courseId is missing for courseName: ${courseName}. This indicates a data integrity issue.`);
                    } else {
                        // Ensure default prompt exists
                        await mongoDB.ensureDefaultPromptExists(courseId, courseName);
                        
                        // Get selected prompt
                        const selectedPrompt = await mongoDB.getSelectedInitialAssistantPrompt(courseId);
                        
                        if (selectedPrompt && selectedPrompt.content) {
                            defaultMessageText = selectedPrompt.content;
                            appLogger.log(`✅ Using selected initial assistant prompt: "${selectedPrompt.title}"`);
                        } else {
                            // Fall back to default if no prompt selected
                            appLogger.log('ℹ️ No selected initial assistant prompt found, using default');
                        }
                    }
                }
            } catch (error) {
                appLogger.error('❌ Error retrieving selected initial assistant prompt:', error);
                // Fall back to default on error
            }
        }
        
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
                appLogger.error('Error adding message to chat history:', historyError);
                // Ensure the chat history is properly initialized even if there was an error
                if (!this.chatHistory.has(chatId)) {
                    this.chatHistory.set(chatId, [chatMessage]);
                }
            }
            
        } catch (error) {
            appLogger.error('Error adding default assistant message:', error);
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
    private addUserMessage(chatId: string, message: string, userId: string, courseName: string = ''): ChatMessage {
        // Generate message ID
        const currentDate = new Date();
        const messageId = this.chatIDGenerator.messageID(message, chatId, currentDate);
        
        // Create the ChatMessage object
        const chatMessage: ChatMessage = {
            id: messageId,
            sender: 'user',
            userId: userId,
            courseName: courseName,
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
            //console.error('Error adding user message:', error);
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
            appLogger.log(`📄 Conversation history saved to: ${filePath}`);
            
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
            appLogger.log(`📄 Conversation history (JSON) saved to: ${jsonFilePath}`);
        } catch (error) {
            appLogger.error(`❌ Error writing conversation history to file:`, error);
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
    private addAssistantMessage(chatId: string, message: string, userId: string, courseName: string = ''): ChatMessage {
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
        };
        
        try {
            // Add message to conversation - No need to add to conversation, it is already added in the addAssistantMessage function, this is just for the chat history
            
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
            appLogger.error('Error adding assistant message:', error);
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
     * Update a message's text in the in-memory chat history
     * Keeps ChatApp state in sync after MongoDB updates (e.g. dismiss unstruggle block)
     * @param chatId - The chat ID
     * @param messageId - The message ID to update
     * @param newText - The new text content
     */
    public updateMessageInChat(chatId: string, messageId: string, newText: string): void {
        const messages = this.chatHistory.get(chatId);
        if (!messages) return;
        const msg = messages.find(m => m.id === messageId);
        if (msg) msg.text = newText;
    }

    /**
     * appendMessagesToChat - sync in-memory history and LLM conversation after route-level persist.
     */
    public appendMessagesToChat(chatId: string, userMessage: ChatMessage, assistantMessage: ChatMessage): void {
        const conversation = this.conversations.get(chatId);
        if (conversation) {
            conversation.addMessage('user', userMessage.text);
            conversation.addMessage('assistant', assistantMessage.text);
        }

        const history = this.chatHistory.get(chatId) ?? [];
        history.push(userMessage, assistantMessage);
        this.chatHistory.set(chatId, history);
    }

    /**
     * formatRecentChatExcerpt - last N messages for forked unstruggle-yes prompt context.
     */
    public formatRecentChatExcerpt(chatId: string, maxMessages = 6): string {
        const history = this.chatHistory.get(chatId) ?? [];
        const tail = history.slice(-maxMessages);
        return tail
            .map((msg) => {
                const role = msg.sender === 'user' ? 'Student' : 'AI Tutor';
                return `${role}: ${msg.text}`;
            })
            .join('\n\n');
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
     * Returns the in-memory persisted teaching mode for a chat, populated after
     * {@link restoreChatFromDatabase} or chat creation. Used by the send route to block new
     * messages on retired-mode chats (e.g. `scenario-generation`) without an extra DB read.
     *
     * @param chatId - The chat ID to look up
     * @returns The persisted mode, or `undefined` when the chat's mode has not been resolved yet
     */
    public getPersistedConversationMode(chatId: string): PersistedConversationModeId | undefined {
        return this.chatConversationModes.get(chatId);
    }

    /**
     * Updates a chat's teaching mode before the first user message and rebuilds LLM memory.
     *
     * @param chatId - The chat ID to update
     * @param courseName - The course name used for MongoDB lookup and prompt overlays
     * @param userId - Roster user ID that owns the chat
     * @param conversationMode - Requested teaching mode
     * @returns The persisted conversation mode, or `null` when the chat is not found
     * @throws When the chat already contains a user message
     */
    public async updateConversationModeBeforeFirstUserMessage(
        chatId: string,
        courseName: string,
        userId: string,
        conversationMode: ConversationModeId
    ): Promise<ConversationModeId | null> {
        const resolvedMode = conversationModePrompts.resolveModeId(conversationMode);
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const userChats = await mongoDB.getUserChats(courseName, userId);
        const chatData = userChats.find((chat) => chat.id === chatId);

        if (!chatData || chatData.isDeleted) {
            return null;
        }

        const messages = chatData.messages ?? [];
        if (messages.some((message) => message.sender === 'user')) {
            throw new Error('Conversation mode cannot be changed after the first user message');
        }

        await mongoDB.ensureChatConversationMode(courseName, userId, chatId, resolvedMode);
        chatData.conversationMode = resolvedMode;
        this.chatConversationModes.set(chatId, resolvedMode);

        const conversation = this.llmModule.createConversation();
        this.conversations.set(chatId, conversation);
        this.chatHistory.set(chatId, [...messages]);

        if (!this.chatID.includes(chatId)) {
            this.chatID.push(chatId);
        }

        await this.addDefaultSystemMessage(chatId, courseName);
        for (const message of messages) {
            const role = message.sender === 'user' ? 'user' : 'assistant';
            conversation.addMessage(role, message.text);
        }

        this.resetChatTimer(chatId);
        return resolvedMode;
    }

    /**
     * Finalizes an undeclared chat to a real teaching mode before first user-turn processing.
     *
     * @param chatId - The chat ID to finalize
     * @param courseName - The course name used for MongoDB lookup and prompt overlays
     * @param userId - Roster user ID that owns the chat
     * @param conversationMode - Selected teaching mode from the first send request
     * @returns The real mode used for runtime processing, or `null` when the chat is not found
     * @throws When the chat already contains a user message
     */
    public async finalizeUndeclaredConversationModeBeforeFirstUserMessage(
        chatId: string,
        courseName: string,
        userId: string,
        conversationMode: ConversationModeId
    ): Promise<ConversationModeId | null> {
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const userChats = await mongoDB.getUserChats(courseName, userId);
        const chatData = userChats.find((chat) => chat.id === chatId);

        if (!chatData || chatData.isDeleted) {
            return null;
        }

        if (chatData.conversationMode !== 'undeclared') {
            const resolvedMode = conversationModePrompts.resolveModeId(chatData.conversationMode);
            this.chatConversationModes.set(chatId, resolvedMode);
            return resolvedMode;
        }

        const messages = chatData.messages ?? [];
        if (messages.some((message) => message.sender === 'user')) {
            throw new Error('Conversation mode cannot be changed after the first user message');
        }

        return this.updateConversationModeBeforeFirstUserMessage(
            chatId,
            courseName,
            userId,
            conversationMode
        );
    }

    /**
     * Whether memory-agent struggle detection and per-turn struggle tags apply to this chat.
     *
     * Current product phase: struggle topics are a Socratic-mode overlay only. Explanatory and
     * future modes do not receive struggle instructions, memory-agent analysis, or unstruggle tags.
     */
    private isStruggleTopicsEnabledForChat(chatId: string): boolean {
        return this.chatConversationModes.get(chatId) === 'socratic';
    }

    /**
     * True when Mongo row needs `conversationMode` persisted for the current message history.
     */
    private chatNeedsConversationModeBackfill(chat: Chat, targetMode: PersistedConversationModeId): boolean {
        const raw = chat.conversationMode;
        if (raw === undefined || raw === null) {
            return true;
        }
        return raw !== targetMode;
    }

    /**
     * Ensures legacy chats have conversationMode persisted before restore continues.
     * Missing, invalid, or undeclared rows with user messages become `'socratic'`; welcome-only
     * chats become `'undeclared'` so the student can still choose a real mode.
     *
     * @param chat - The chat to ensure the conversation mode is persisted
     * @param courseName - The course name
     * @param userId - The user ID
     * @returns Persisted mode for in-memory maps and system prompt composition
     */
    private async ensureLegacyChatModePersisted(
        chat: Chat,
        courseName: string,
        userId: string
    ): Promise<PersistedConversationModeId> {
        const hasUserMessage = (chat.messages ?? []).some((message) => message.sender === 'user');
        const raw = chat.conversationMode;

        if (
            raw === 'socratic' ||
            raw === 'explanatory' ||
            raw === 'scenario-generation' ||
            raw === 'undeclared'
        ) {
            return raw;
        }

        const targetMode: PersistedConversationModeId = hasUserMessage ? 'socratic' : 'undeclared';

        if (!this.chatNeedsConversationModeBackfill(chat, targetMode)) {
            return targetMode;
        }

        try {
            const mongoDB = await EngEAI_MongoDB.getInstance();
            await mongoDB.ensureChatConversationMode(courseName, userId, chat.id, targetMode);
            chat.conversationMode = targetMode;
            appLogger.log(`[CHAT-APP] 📝 Backfilled conversationMode=${targetMode} for chat ${chat.id}`);
        } catch (error) {
            appLogger.error(`[CHAT-APP] ⚠️ Failed to backfill conversationMode for chat ${chat.id}:`, error);
            chat.conversationMode = targetMode;
        }
        return targetMode;
    }

    /**
     * restoreChatFromDatabase - Restore a chat from MongoDB with full conversation context
     * 
     * @param chatId - The chat ID to restore
     * @param courseName - The course name
     * @param userId - The user ID
     * @returns Promise<boolean> - True if restoration was successful, false otherwise
     */
    public async restoreChatFromDatabase(chatId: string, courseName: string, userId: string): Promise<boolean> {
        try {
            // Get the MongoDB instance
            const mongoDB = await EngEAI_MongoDB.getInstance();

            // Get the chat data from the MongoDB
            const userChats = await mongoDB.getUserChats(courseName, userId);
            const chatData = userChats.find((chat) => chat.id === chatId);

            // If the chat data is not found, then return false
            if (!chatData) {
                appLogger.log(`❌ Chat ${chatId} not found in MongoDB`);
                return false;
            }

            // If the chat is marked as deleted, then return false
            if (chatData.isDeleted) {
                appLogger.log(`❌ Chat ${chatId} is marked as deleted`);
                return false;
            }

            // Ensure the legacy chat mode is persisted
            const restoredMode = await this.ensureLegacyChatModePersisted(chatData, courseName, userId);
            this.chatConversationModes.set(chatId, restoredMode);

            if (this.conversations.has(chatId)) {
                appLogger.log(`📋 Chat ${chatId} already exists in memory, resetting timer`);
                this.resetChatTimer(chatId);
                return true;
            }

            appLogger.log(`🔄 Restoring chat ${chatId} from MongoDB with ${chatData.messages.length} messages`);

            const conversation = this.llmModule.createConversation();
            
            // Add system message first (same as in initializeConversation)
            // Retrieve learning objectives for the course
            let learningObjectives: LearningObjectiveForDisplay[] = [];
            try {
                const course = await mongoDB.getCourseByName(courseName);
                if (course && course.id) {
                    learningObjectives = await mongoDB.getAllLearningObjectives(course.id);
                    appLogger.log(`📚 Retrieved ${learningObjectives.length} learning objectives during chat restoration`);
                }
            } catch (error) {
                appLogger.error('❌ Error retrieving learning objectives during restore:', error);
            }

            if (conversationModePrompts.isValidConversationMode(restoredMode)) {
                const defaultSystemMessage = await this.buildCourseSystemPromptXml(
                    courseName,
                    restoredMode,
                    learningObjectives
                );
                conversation.addMessage('system', defaultSystemMessage);
            }

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
                appLogger.log(`⚠️ Chat ${chatId} already exists in chatID array, skipping duplicate addition`);
            }
            
            // Start the inactivity timer
            this.resetChatTimer(chatId);

            appLogger.log(`✅ Chat ${chatId} restored successfully with ${restoredMessages.length} messages`);
            
            // TODO: Remove after testing lazy loading functionality
            // this.logActiveChats('CHAT RESTORED FROM DB');
            
            return true;

        } catch (error) {
            appLogger.error(`❌ Error restoring chat ${chatId}:`, error);
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
                appLogger.warn(`Attempted to delete non-existent chat: ${chatId}`);
                return false;
            }

            // Stop the inactivity timer for this chat
            this.stopChatTimer(chatId);


            // Remove from conversations map
            const conversationDeleted = this.conversations.delete(chatId);
            
            // Remove from chat history map
            const historyDeleted = this.chatHistory.delete(chatId);
            this.chatConversationModes.delete(chatId);

            // Remove from chatID array
            const index = this.chatID.indexOf(chatId);
            let arrayDeleted = false;
            if (index > -1) {
                this.chatID.splice(index, 1);
                arrayDeleted = true;
            }
            
            // Log the deletion
            appLogger.log(`🗑️ CHAT DELETION SUCCESSFUL:`);
            appLogger.log(`   Chat ID: ${chatId}`);
            appLogger.log(`   Conversation deleted: ${conversationDeleted}`);
            appLogger.log(`   History deleted: ${historyDeleted}`);
            appLogger.log(`   Array entry deleted: ${arrayDeleted}`);
            appLogger.log(`   Remaining active chats: ${this.chatID.length}`);
            
            appLogger.info(`Chat ${chatId} deleted successfully`);
            
            // TODO: Remove after testing lazy loading functionality
            // this.logActiveChats('CHAT EXPLICITLY DELETED');
            
            return true;
            
        } catch (error) {
            appLogger.error(`🗑️ FAILED TO DELETE CHAT ${chatId}:`, error);
            appLogger.error(`Failed to delete chat ${chatId}: ${error}`);
            return false;
        }
    }

    /**
     * Clean up all active timers on server shutdown
     * Called by process signal handlers to prevent memory leaks
     */
    public cleanup(): void {
        appLogger.log('🧹 Cleaning up all active chat timers...');
        let timerCount = 0;
        
        for (const [chatId, timer] of this.chatTimers) {
            if (timer) {
                clearTimeout(timer);
                timerCount++;
            }
        }
        
        this.chatTimers.clear();
        appLogger.log(`✅ Cleaned up ${timerCount} active timers`);
    }

}

