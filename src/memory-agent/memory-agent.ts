/**
 * Memory Agent System
 * 
 * This module provides a memory agent that analyzes student conversations
 * to identify topics/concepts they struggle with. It stores these struggle words
 * per-user in MongoDB and appends them to system prompts for new chats.
 * 
 * Key Features:
 * - Analyzes user messages using LLM to extract struggle topics
 * - Creates conversations on-the-fly with system prompt for analysis
 * - Stores struggle words per-user in course-specific collections
 * - Appends struggle words to system prompts when creating new chats
 * - Ensures uniqueness when updating struggle words in MongoDB
 * 
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */
import { LLMModule } from 'ubc-genai-toolkit-llm';
import { AppConfig, loadConfig } from '../routes/config';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';
import { MemoryAgentEntry } from '../functions/types';
import { STRUGGLE_ANALYSIS_PROMPT } from './memory-agent-prompt';


export class MemoryAgent {
    private llmModule: LLMModule;
    private appConfig: AppConfig;

    constructor(config: AppConfig) {
        this.appConfig = config;
        this.llmModule = new LLMModule(this.appConfig.llmConfig);
    }

    /**
     * Get struggle words for a user
     * 
     * @param userId - The user ID
     * @param courseName - The course name
     * @returns Promise<string[]> - Array of struggle words
     */
    public async getStruggleWords(userId: number, courseName: string): Promise<string[]> {
        try {
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const entry = await mongoDB.getMemoryAgentEntry(courseName, userId);
            
            if (!entry) {
                console.log(`[MEMORY-AGENT] ⚠️ No memory agent entry found for userId: ${userId}`);
                return [];
            }
            
            return entry.struggleWords || [];
        } catch (error) {
            console.error(`[MEMORY-AGENT] 🚨 Error getting struggle words:`, error);
            return [];
        }
    }

    /**
     * Ensure memory agent entry exists for a user
     * Creates entry if it doesn't exist
     * 
     * @param userId - The user ID
     * @param courseName - The course name
     */
    private async ensureMemoryAgentEntryExists(userId: number, courseName: string): Promise<void> {
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Check if entry exists
        const existingEntry = await mongoDB.getMemoryAgentEntry(courseName, userId);
        
        if (existingEntry) {
            return; // Entry exists, no need to create
        }
        
        // Entry doesn't exist, get user info from MongoDB
        const userInfo = await mongoDB.findUserByUserId(courseName, userId);
        
        if (!userInfo) {
            console.warn(`[MEMORY-AGENT] ⚠️ User not found in course ${courseName} with userId: ${userId}, cannot create memory agent entry`);
            throw new Error(`User not found for userId: ${userId}`);
        }
        
        // Create memory agent entry
        await mongoDB.initializeMemoryAgentForUser(
            courseName,
            userId,
            userInfo.name,
            userInfo.affiliation as 'student' | 'faculty'
        );
        
        console.log(`[MEMORY-AGENT] ✅ Created memory agent entry for userId: ${userId}`);
    }

    /**
     * Update struggle words for a user
     * Merges new words with existing words and ensures uniqueness
     * Creates memory agent entry if it doesn't exist
     * 
     * @param userId - The user ID
     * @param courseName - The course name
     * @param newWords - New struggle words to add
     */
    public async updateStruggleWords(userId: number, courseName: string, newWords: string[]): Promise<void> {
        try {
            // Validate userId
            if (!userId || userId === 0) {
                console.warn(`[MEMORY-AGENT] ⚠️ Invalid userId: ${userId}, skipping struggle words update`);
                return;
            }
            
            const mongoDB = await EngEAI_MongoDB.getInstance();
            
            // Ensure memory agent entry exists
            await this.ensureMemoryAgentEntryExists(userId, courseName);
            
            // Get existing struggle words
            const existingEntry = await mongoDB.getMemoryAgentEntry(courseName, userId);
            const existingWords = existingEntry?.struggleWords || [];
            
            // Normalize and merge words
            const normalizeWord = (word: string): string => {
                return word.trim().toLowerCase();
            };
            
            const normalizedExisting = existingWords.map(normalizeWord);
            const normalizedNew = newWords.map(normalizeWord).filter(word => word.length > 0);
            
            // Merge and deduplicate using Set
            const allWords = [...normalizedExisting, ...normalizedNew];
            const uniqueWords = Array.from(new Set(allWords));
            
            // Sort for consistency
            uniqueWords.sort();
            
            // Update in database
            await mongoDB.updateMemoryAgentStruggleWords(courseName, userId, uniqueWords);
            
            const addedCount = uniqueWords.length - normalizedExisting.length;
            console.log(`[MEMORY-AGENT] ✅ Updated struggle words for userId: ${userId}. Total: ${uniqueWords.length} words (${addedCount > 0 ? `+${addedCount} new` : 'no new words'})`);
        } catch (error) {
            console.error(`[MEMORY-AGENT] 🚨 Error updating struggle words:`, error);
            throw error;
        }
    }

    /**
     * Analyze user messages and update struggle words
     * Creates a conversation on-the-fly with system prompt and user messages,
     * sends to LLM for analysis, and updates MongoDB with unique struggle words
     * 
     * @param userId - The user ID
     * @param courseName - The course name
     * @param systemPrompt - The system prompt from the chat conversation
     * @param userMessages - Array of user messages to analyze
     */
    public async analyzeAndUpdateStruggleWords(
        userId: number,
        courseName: string,
        systemPrompt: string,
        userMessages: string
    ): Promise<void> {
        try {
            // Validate userId
            if (!userId || userId === 0) {
                console.warn(`[MEMORY-AGENT] ⚠️ Invalid userId: ${userId}, skipping struggle words analysis`);
                return;
            }
            
            if (!userMessages || userMessages.length === 0) {
                //START DEBUG LOG : DEBUG-CODE(ANALYZE-AND-UPDATE-STRUGGLE-WORDS-NO-USER-MESSAGES)
                console.log(`userMessages: ${userMessages}`);
                console.log(`[MEMORY-AGENT] ⚠️ No user messages to analyze`);
                return;
            }

            // Format conversation text for analysis (only user messages)
            const conversationText = `Student: ${userMessages}`;

            // Create conversation with system prompt (for context) and analysis prompt
            console.log(`[MEMORY-AGENT] 🔍 Analyzing conversation for struggle topics...`);
            const conversation = this.llmModule.createConversation();
            conversation.addMessage('system', systemPrompt);
            
            const analysisPrompt = STRUGGLE_ANALYSIS_PROMPT + conversationText;
            conversation.addMessage('user', analysisPrompt);
            
            // Get response from LLM
            const response = await conversation.send();
            
            if (!response || !response.content) {
                console.warn(`[MEMORY-AGENT] ⚠️ Empty response from LLM analysis`);
                return;
            }

            // Parse the comma-separated response into array
            const struggleWords = response.content
                .split(',')
                .map((word: string) => word.trim())
                .filter((word: string) => word.length > 0)
                .map((word: string) => word.toLowerCase()); // Normalize to lowercase

            // Remove duplicates
            const uniqueStruggleWords = Array.from(new Set(struggleWords));

            console.log(`[MEMORY-AGENT] ✅ Extracted ${uniqueStruggleWords.length} struggle topics:`, uniqueStruggleWords);
            
            if (uniqueStruggleWords.length > 0) {
                // Update struggle words in database (ensures uniqueness)
                await this.updateStruggleWords(userId, courseName, uniqueStruggleWords);
            } else {
                console.log(`[MEMORY-AGENT] ℹ️ No struggle words extracted from conversation`);
            }
        } catch (error) {
            console.error(`[MEMORY-AGENT] 🚨 Error in analyzeAndUpdateStruggleWords:`, error);
            // Don't throw - this shouldn't break the chat flow
        }
    }
}

// Create singleton instance
const appConfig = loadConfig();
export const memoryAgent = new MemoryAgent(appConfig);

