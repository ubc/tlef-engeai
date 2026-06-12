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
import * as fs from 'fs/promises';
import * as path from 'path';
import { LLMModule, type Message } from 'ubc-genai-toolkit-llm';
import { AppConfig, loadConfig } from '../utils/config';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { buildMemoryAgentSystemPrompt } from './memory-agent-prompt';
import {
    filterVerbatimStruggleTopics,
    struggleAnalysisResponseSchema
} from './struggle-analysis-schema';
import { isDeveloperMode, getMockStruggleWords } from '../helpers/developer-mode';
import { getStruggleLabelsFromEntry, sanitizeStruggleLabels } from '../helpers/struggle-chapter-normalize';
import { appLogger } from '../utils/logger';


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
    public async getStruggleWords(userId: string, courseName: string): Promise<string[]> {
        try {
            await this.ensureMemoryAgentEntryExists(userId, courseName);
            
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const entry = await mongoDB.getMemoryAgentEntry(courseName, userId);
            
            if (!entry) {
                appLogger.log(`[MEMORY-AGENT] ⚠️ No memory agent entry found for userId: ${userId} after ensuring existence`);
                return [];
            }
            
            return getStruggleLabelsFromEntry(entry);
        } catch (error) {
            appLogger.error(`[MEMORY-AGENT] 🚨 Error getting struggle words:`, error);
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
    private async ensureMemoryAgentEntryExists(userId: string, courseName: string): Promise<void> {
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        const existingEntry = await mongoDB.getMemoryAgentEntry(courseName, userId);
        
        if (existingEntry) {
            return;
        }
        
        const userInfo = await mongoDB.findUserByUserId(courseName, userId);
        
        if (!userInfo) {
            appLogger.warn(`[MEMORY-AGENT] ⚠️ User not found in course ${courseName} with userId: ${userId}, cannot create memory agent entry`);
            throw new Error(`User not found for userId: ${userId}`);
        }
        
        await mongoDB.initializeMemoryAgentForUser(
            courseName,
            userId,
            userInfo.name,
            userInfo.affiliation as 'student' | 'faculty'
        );
        
        appLogger.log(`[MEMORY-AGENT] ✅ Created memory agent entry for userId: ${userId}`);
    }

    /**
     * Update struggle words for a user (idempotent)
     * Only adds words that don't already exist in the database
     * Creates memory agent entry if it doesn't exist
     * 
     * @param userId - The user ID
     * @param courseName - The course name
     * @param newWords - New struggle words to add (only new words will be added)
     */
    public async updateStruggleWords(
        userId: string,
        courseName: string,
        newWords: string[]
    ): Promise<void> {
        try {
            if (!userId || userId === '') {
                appLogger.warn(`[MEMORY-AGENT] ⚠️ Invalid userId: ${userId}, skipping struggle words update`);
                return;
            }
            
            const mongoDB = await EngEAI_MongoDB.getInstance();
            
            await this.ensureMemoryAgentEntryExists(userId, courseName);
            
            const existingEntry = await mongoDB.getMemoryAgentEntry(courseName, userId);
            const existingLabels = new Set(getStruggleLabelsFromEntry(existingEntry!));

            const trimWord = (word: string): string => word.trim();
            const trimmedNew = newWords.map(trimWord).filter((word) => word.length > 0);
            const wordsToAdd = trimmedNew.filter((word) => !existingLabels.has(word));

            if (wordsToAdd.length === 0) {
                appLogger.log(`[MEMORY-AGENT] ℹ️ No new struggle words to add for userId: ${userId}. All words already exist.`);
                return;
            }

            const mergedLabels = sanitizeStruggleLabels([...existingLabels, ...wordsToAdd]);
            await mongoDB.updateMemoryAgentStruggleWords(courseName, userId, mergedLabels);
            
            appLogger.log(
                `[MEMORY-AGENT] ✅ Updated struggle words for userId: ${userId}. ` +
                    `Distinct labels: ${mergedLabels.length} (+${wordsToAdd.length} new)`
            );
        } catch (error) {
            appLogger.error(`[MEMORY-AGENT] 🚨 Error updating struggle words:`, error);
            throw error;
        }
    }

    /**
     * Remove a struggle word for a user
     * Removes the specified word from the user's struggle topics list
     * 
     * @param userId - The user ID
     * @param courseName - The course name
     * @param wordToRemove - The struggle word to remove
     */
    public async removeStruggleWord(userId: string, courseName: string, wordToRemove: string): Promise<void> {
        try {
            if (!userId || userId === '') {
                appLogger.warn(`[MEMORY-AGENT] ⚠️ Invalid userId: ${userId}, skipping struggle word removal`);
                return;
            }
            
            const mongoDB = await EngEAI_MongoDB.getInstance();
            
            await this.ensureMemoryAgentEntryExists(userId, courseName);
            
            const existingEntry = await mongoDB.getMemoryAgentEntry(courseName, userId);
            const beforeCount = getStruggleLabelsFromEntry(existingEntry!).length;
            const trimmedRemove = wordToRemove.trim();
            const remainingLabels = existingEntry!.struggleTopics.filter((l) => l.trim() !== trimmedRemove);
            const afterCount = remainingLabels.length;

            if (afterCount === beforeCount) {
                appLogger.log(`[MEMORY-AGENT] ℹ️ Struggle word "${wordToRemove}" not found for userId: ${userId}. Nothing to remove.`);
                return;
            }
            
            await mongoDB.updateMemoryAgentStruggleWords(courseName, userId, remainingLabels);
            
            appLogger.log(`[MEMORY-AGENT] ✅ Removed struggle word "${wordToRemove}" for userId: ${userId}. Remaining: ${afterCount} labels (was ${beforeCount})`);
        } catch (error) {
            appLogger.error(`[MEMORY-AGENT] 🚨 Error removing struggle word:`, error);
            throw error;
        }
    }

    /**
     * Log the LLM invocation for memory agent analysis
     * Saves the system and user messages, and optionally the LLM response, to a file for debugging
     * 
     * @param userId - The user ID
     * @param courseName - The course name
     * @param systemPrompt - The memory agent's system prompt (minimal, not the chat's system prompt)
     * @param userMessage - The user message (analysis prompt) being sent
     * @param response - Optional LLM response content to include in the log
     */
    private async logLLMInvocation(
        userId: string,
        courseName: string,
        systemPrompt: string,
        userMessage: string,
        response?: string
    ): Promise<void> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `memory-agent-invocation-${userId}-${timestamp}.txt`;
            const filePath = path.join(process.cwd(), 'prompt-test', fileName);
            
            const promptTestDir = path.join(process.cwd(), 'prompt-test');
            await fs.mkdir(promptTestDir, { recursive: true });
            
            let logContent = `Memory Agent LLM Invocation Log\n`;
            logContent += `${'='.repeat(80)}\n\n`;
            logContent += `Timestamp: ${new Date().toISOString()}\n`;
            logContent += `User ID: ${userId}\n`;
            logContent += `Course Name: ${courseName}\n`;
            logContent += `\n${'='.repeat(80)}\n\n`;
            
            logContent += `SYSTEM MESSAGE:\n`;
            logContent += `${'-'.repeat(80)}\n`;
            logContent += `Content Length: ${systemPrompt.length} characters (~${Math.ceil(systemPrompt.length / 4)} tokens)\n\n`;
            logContent += `${systemPrompt}\n`;
            logContent += `\n${'='.repeat(80)}\n\n`;
            
            logContent += `USER MESSAGE (Analysis Prompt):\n`;
            logContent += `${'-'.repeat(80)}\n`;
            logContent += `Content Length: ${userMessage.length} characters (~${Math.ceil(userMessage.length / 4)} tokens)\n\n`;
            logContent += `${userMessage}\n`;
            logContent += `\n${'='.repeat(80)}\n\n`;
            
            if (response !== undefined) {
                logContent += `LLM RESPONSE:\n`;
                logContent += `${'-'.repeat(80)}\n`;
                logContent += `Content Length: ${response.length} characters (~${Math.ceil(response.length / 4)} tokens)\n\n`;
                logContent += `${response}\n`;
                logContent += `\n${'='.repeat(80)}\n`;
            }
            
            await fs.writeFile(filePath, logContent, 'utf-8');
            appLogger.log(`[MEMORY-AGENT] 📄 LLM invocation logged to: ${filePath}`);
            
            appLogger.log(`[MEMORY-AGENT] 📤 LLM Invocation Details:`);
            appLogger.log(`[MEMORY-AGENT]   System Prompt (${systemPrompt.length} chars):\n${systemPrompt}`);
            appLogger.log(`[MEMORY-AGENT]   User Message (${userMessage.length} chars):\n${userMessage}`);
            if (response !== undefined) {
                appLogger.log(`[MEMORY-AGENT]   LLM Response (${response.length} chars):\n${response}`);
            }
        } catch (error) {
            appLogger.error(`[MEMORY-AGENT] 🚨 Error logging LLM invocation:`, error);
        }
    }


    /**
     * Analyze the last chat excerpt and append at most one instructor-catalog struggle label for the student.
     *
     * V2 flow: resolve course by name → load `getAllInstructorStruggleTopics` → skip if catalog empty →
     * `buildMemoryAgentSystemPrompt` + `sendStructuredConversation` ({@link struggleAnalysisResponseSchema}) →
     * {@link filterVerbatimStruggleTopics} → `updateStruggleWords` (case-sensitive, no paraphrase).
     *
     * Does not throw; failures are logged so chat is unaffected.
     *
     * @param userId - Student user id (`{course}_memory-agent` document key).
     * @param courseName - Course display name used for collection lookup and catalog resolution.
     * @param userMessages - Last messages formatted as `Student:` / `AI Tutor:` (RAG stripped from student lines).
     * @returns Promise<void>
     */
    public async analyzeAndUpdateStruggleWords(
        userId: string,
        courseName: string,
        userMessages: string
    ): Promise<void> {
        try {
            if (!userId || userId === '') {
                appLogger.warn(`[MEMORY-AGENT] ⚠️ Invalid userId: ${userId}, skipping struggle words analysis`);
                return;
            }
            
            if (!userMessages || userMessages.length === 0) {
                appLogger.log(`[MEMORY-AGENT] ⚠️ No user messages to analyze (empty excerpt)`);
                return;
            }

            appLogger.log(
                `[MEMORY-AGENT] 📨 Conversation excerpt (raw ${userMessages.length} chars, userId=${userId}, course=${courseName}):`
            );
            appLogger.log(userMessages);

            if (isDeveloperMode()) {
                appLogger.log(`[MEMORY-AGENT] 🧪 Developer mode active - skipping LLM analysis, using mock struggle words`);
                const mockStruggleWords = getMockStruggleWords();
                appLogger.log(`[MEMORY-AGENT] ✅ Using mock struggle words:`, mockStruggleWords);
                
                if (mockStruggleWords.length > 0) {
                    await this.updateStruggleWords(userId, courseName, mockStruggleWords);
                }
                return;
            }

            const mongoDB = await EngEAI_MongoDB.getInstance();
            const course = await mongoDB.getCourseByName(courseName);
            if (!course?.id) {
                appLogger.warn(`[MEMORY-AGENT] ⚠️ Course not found for name: ${courseName}, skipping analysis`);
                return;
            }

            const catalog = await mongoDB.getAllInstructorStruggleTopics(course.id);
            if (catalog.length === 0) {
                appLogger.log(`[MEMORY-AGENT] ℹ️ No instructor struggle catalog for course ${courseName}; skipping analysis`);
                return;
            }

            const allowedLabels = new Set(catalog.map((row) => row.struggleTopic.trim()));

            const existingStruggleWords = await this.getStruggleWords(userId, courseName);

            appLogger.log(`[MEMORY-AGENT] 📋 Existing struggle topics (${existingStruggleWords.length}):`, existingStruggleWords);

            appLogger.log(`[MEMORY-AGENT] 🔍 Analyzing conversation for struggle topics...`);

            const systemPrompt = buildMemoryAgentSystemPrompt(catalog, existingStruggleWords);

            const userTurn = `<conversation_excerpt>\n${userMessages.trim()}\n</conversation_excerpt>`;

            appLogger.log(`[MEMORY-AGENT] 📨 LLM user turn (${userTurn.length} chars, as sent to model):`);
            appLogger.log(userTurn);

            const messages: Message[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userTurn }
            ];

            const response = await this.llmModule.sendStructuredConversation(
                messages,
                struggleAnalysisResponseSchema,
                { structuredOutputName: 'struggle_analysis' }
            );

            const rawTopics = response?.parsed?.struggleTopics ?? [];

            const uniqueStruggleWords = filterVerbatimStruggleTopics(rawTopics, allowedLabels);

            appLogger.log(`[MEMORY-AGENT] 📥 LLM raw struggleTopics:`, rawTopics);
            appLogger.log(`[MEMORY-AGENT] ✅ Extracted ${uniqueStruggleWords.length} struggle topics:`, uniqueStruggleWords);

            await this.logLLMInvocation(userId, courseName, systemPrompt, userTurn, JSON.stringify(response?.parsed ?? {}));

            if (uniqueStruggleWords.length > 0) {
                await this.updateStruggleWords(userId, courseName, uniqueStruggleWords);
            } else {
                appLogger.log(`[MEMORY-AGENT] ℹ️ No struggle words extracted from conversation`);
            }
        } catch (error) {
            appLogger.error(`[MEMORY-AGENT] 🚨 Error in analyzeAndUpdateStruggleWords:`, error);
        }
    }
}

const appConfig = loadConfig();
export const memoryAgent = new MemoryAgent(appConfig);
