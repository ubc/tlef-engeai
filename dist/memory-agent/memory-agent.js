"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryAgent = exports.MemoryAgent = void 0;
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
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const ubc_genai_toolkit_llm_1 = require("ubc-genai-toolkit-llm");
const config_1 = require("../routes/config");
const EngEAI_MongoDB_1 = require("../functions/EngEAI_MongoDB");
const memory_agent_prompt_1 = require("./memory-agent-prompt");
const developer_mode_1 = require("../functions/developer-mode");
class MemoryAgent {
    constructor(config) {
        this.appConfig = config;
        this.llmModule = new ubc_genai_toolkit_llm_1.LLMModule(this.appConfig.llmConfig);
    }
    /**
     * Get struggle words for a user
     *
     * @param userId - The user ID
     * @param courseName - The course name
     * @returns Promise<string[]> - Array of struggle words
     */
    getStruggleWords(userId, courseName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Ensure memory agent entry exists before retrieving (prevents race conditions)
                yield this.ensureMemoryAgentEntryExists(userId, courseName);
                const mongoDB = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
                const entry = yield mongoDB.getMemoryAgentEntry(courseName, userId);
                if (!entry) {
                    console.log(`[MEMORY-AGENT] ⚠️ No memory agent entry found for userId: ${userId} after ensuring existence`);
                    return ['---THE STRUGGLE WORD IS NOT PROPERLY ATTACHED TO THE USER---'];
                }
                return entry.struggleTopics || ["---THE STRUGGLE WORD IS NOT PROPERLY SETTLED (DEFAULT VALUE)---"];
            }
            catch (error) {
                console.error(`[MEMORY-AGENT] 🚨 Error getting struggle words:`, error);
                return ['---THE STRUGGLE WORD IS NOT PROPERLY ATTACHED (ERROR ENCOUNTERED) TO THE USER---'];
            }
        });
    }
    /**
     * Ensure memory agent entry exists for a user
     * Creates entry if it doesn't exist
     *
     * @param userId - The user ID
     * @param courseName - The course name
     */
    ensureMemoryAgentEntryExists(userId, courseName) {
        return __awaiter(this, void 0, void 0, function* () {
            const mongoDB = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
            // Check if entry exists
            const existingEntry = yield mongoDB.getMemoryAgentEntry(courseName, userId);
            if (existingEntry) {
                return; // Entry exists, no need to create
            }
            // Entry doesn't exist, get user info from MongoDB
            const userInfo = yield mongoDB.findUserByUserId(courseName, userId);
            if (!userInfo) {
                console.warn(`[MEMORY-AGENT] ⚠️ User not found in course ${courseName} with userId: ${userId}, cannot create memory agent entry`);
                throw new Error(`User not found for userId: ${userId}`);
            }
            // Create memory agent entry
            yield mongoDB.initializeMemoryAgentForUser(courseName, userId, userInfo.name, userInfo.affiliation);
            console.log(`[MEMORY-AGENT] ✅ Created memory agent entry for userId: ${userId}`);
        });
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
    updateStruggleWords(userId, courseName, newWords) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate userId
                if (!userId || userId === '') {
                    console.warn(`[MEMORY-AGENT] ⚠️ Invalid userId: ${userId}, skipping struggle words update`);
                    return;
                }
                const mongoDB = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
                // Ensure memory agent entry exists
                yield this.ensureMemoryAgentEntryExists(userId, courseName);
                // Get existing struggle words
                const existingEntry = yield mongoDB.getMemoryAgentEntry(courseName, userId);
                const existingWords = (existingEntry === null || existingEntry === void 0 ? void 0 : existingEntry.struggleTopics) || [];
                // Normalize words for comparison
                const normalizeWord = (word) => {
                    return word.trim().toLowerCase();
                };
                const normalizedExisting = existingWords.map(normalizeWord);
                const normalizedNew = newWords.map(normalizeWord).filter(word => word.length > 0);
                // Filter out words that already exist (idempotent behavior)
                const existingSet = new Set(normalizedExisting);
                const wordsToAdd = normalizedNew.filter(word => !existingSet.has(word));
                // If no new words to add, skip database update
                if (wordsToAdd.length === 0) {
                    console.log(`[MEMORY-AGENT] ℹ️ No new struggle words to add for userId: ${userId}. All words already exist.`);
                    return;
                }
                // Merge existing words with new words (only new ones)
                const allWords = [...normalizedExisting, ...wordsToAdd];
                const uniqueWords = Array.from(new Set(allWords));
                // Sort for consistency
                uniqueWords.sort();
                // Update in database
                yield mongoDB.updateMemoryAgentStruggleWords(courseName, userId, uniqueWords);
                console.log(`[MEMORY-AGENT] ✅ Updated struggle words for userId: ${userId}. Total: ${uniqueWords.length} words (+${wordsToAdd.length} new, ${normalizedExisting.length} existing)`);
            }
            catch (error) {
                console.error(`[MEMORY-AGENT] 🚨 Error updating struggle words:`, error);
                throw error;
            }
        });
    }
    /**
     * Remove a struggle word for a user
     * Removes the specified word from the user's struggle topics list
     *
     * @param userId - The user ID
     * @param courseName - The course name
     * @param wordToRemove - The struggle word to remove
     */
    removeStruggleWord(userId, courseName, wordToRemove) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate userId
                if (!userId || userId === '') {
                    console.warn(`[MEMORY-AGENT] ⚠️ Invalid userId: ${userId}, skipping struggle word removal`);
                    return;
                }
                const mongoDB = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
                // Ensure memory agent entry exists
                yield this.ensureMemoryAgentEntryExists(userId, courseName);
                // Get existing struggle words
                const existingEntry = yield mongoDB.getMemoryAgentEntry(courseName, userId);
                const existingWords = (existingEntry === null || existingEntry === void 0 ? void 0 : existingEntry.struggleTopics) || [];
                // Normalize word for comparison
                const normalizeWord = (word) => {
                    return word.trim().toLowerCase();
                };
                const normalizedWordToRemove = normalizeWord(wordToRemove);
                const normalizedExisting = existingWords.map(normalizeWord);
                // Filter out the word to remove (case-insensitive)
                const remainingWords = normalizedExisting.filter(word => word !== normalizedWordToRemove);
                // If word wasn't found, log and return
                if (remainingWords.length === normalizedExisting.length) {
                    console.log(`[MEMORY-AGENT] ℹ️ Struggle word "${wordToRemove}" not found for userId: ${userId}. Nothing to remove.`);
                    return;
                }
                // Update in database with remaining words
                yield mongoDB.updateMemoryAgentStruggleWords(courseName, userId, remainingWords);
                console.log(`[MEMORY-AGENT] ✅ Removed struggle word "${wordToRemove}" for userId: ${userId}. Remaining: ${remainingWords.length} words (was ${normalizedExisting.length})`);
            }
            catch (error) {
                console.error(`[MEMORY-AGENT] 🚨 Error removing struggle word:`, error);
                throw error;
            }
        });
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
    logLLMInvocation(userId, courseName, systemPrompt, userMessage, response) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `memory-agent-invocation-${userId}-${timestamp}.txt`;
                const filePath = path.join(process.cwd(), 'prompt-test', fileName);
                // Ensure prompt-test directory exists
                const promptTestDir = path.join(process.cwd(), 'prompt-test');
                yield fs.mkdir(promptTestDir, { recursive: true });
                // Format the log content
                let logContent = `Memory Agent LLM Invocation Log\n`;
                logContent += `${'='.repeat(80)}\n\n`;
                logContent += `Timestamp: ${new Date().toISOString()}\n`;
                logContent += `User ID: ${userId}\n`;
                logContent += `Course Name: ${courseName}\n`;
                logContent += `\n${'='.repeat(80)}\n\n`;
                // System message
                logContent += `SYSTEM MESSAGE:\n`;
                logContent += `${'-'.repeat(80)}\n`;
                logContent += `Content Length: ${systemPrompt.length} characters (~${Math.ceil(systemPrompt.length / 4)} tokens)\n\n`;
                logContent += `${systemPrompt}\n`;
                logContent += `\n${'='.repeat(80)}\n\n`;
                // User message
                logContent += `USER MESSAGE (Analysis Prompt):\n`;
                logContent += `${'-'.repeat(80)}\n`;
                logContent += `Content Length: ${userMessage.length} characters (~${Math.ceil(userMessage.length / 4)} tokens)\n\n`;
                logContent += `${userMessage}\n`;
                logContent += `\n${'='.repeat(80)}\n\n`;
                // LLM response (if provided)
                if (response !== undefined) {
                    logContent += `LLM RESPONSE:\n`;
                    logContent += `${'-'.repeat(80)}\n`;
                    logContent += `Content Length: ${response.length} characters (~${Math.ceil(response.length / 4)} tokens)\n\n`;
                    logContent += `${response}\n`;
                    logContent += `\n${'='.repeat(80)}\n`;
                }
                // Write to file
                yield fs.writeFile(filePath, logContent, 'utf-8');
                console.log(`[MEMORY-AGENT] 📄 LLM invocation logged to: ${filePath}`);
                // Also log to console for immediate visibility (only request details, not response)
                console.log(`[MEMORY-AGENT] 📤 LLM Invocation Details:`);
                console.log(`[MEMORY-AGENT]   System Prompt Length: ${systemPrompt.length} chars (~${Math.ceil(systemPrompt.length / 4)} tokens)`);
                console.log(`[MEMORY-AGENT]   User Message Length: ${userMessage.length} chars (~${Math.ceil(userMessage.length / 4)} tokens)`);
                if (response !== undefined) {
                    console.log(`[MEMORY-AGENT]   Response Length: ${response.length} chars (~${Math.ceil(response.length / 4)} tokens)`);
                }
                console.log(`[MEMORY-AGENT]   System Prompt Preview: ${systemPrompt.substring(0, 100)}...`);
                console.log(`[MEMORY-AGENT]   User Message Preview: ${userMessage.substring(0, 100)}...`);
            }
            catch (error) {
                console.error(`[MEMORY-AGENT] 🚨 Error logging LLM invocation:`, error);
                // Don't throw - logging failure shouldn't break the analysis flow
            }
        });
    }
    /**
     * Analyze user messages and update struggle words
     * Creates a conversation on-the-fly with a minimal system prompt and user messages,
     * sends to LLM for analysis, and updates MongoDB with unique struggle words
     *
     * @param userId - The user ID
     * @param courseName - The course name
     * @param userMessages - Formatted conversation messages to analyze (without RAG content)
     */
    analyzeAndUpdateStruggleWords(userId, courseName, userMessages) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate userId
                if (!userId || userId === '') {
                    console.warn(`[MEMORY-AGENT] ⚠️ Invalid userId: ${userId}, skipping struggle words analysis`);
                    return;
                }
                if (!userMessages || userMessages.length === 0) {
                    //START DEBUG LOG : DEBUG-CODE(ANALYZE-AND-UPDATE-STRUGGLE-WORDS-NO-USER-MESSAGES)
                    console.log(`userMessages: ${userMessages}`);
                    console.log(`[MEMORY-AGENT] ⚠️ No user messages to analyze`);
                    return;
                }
                // Check if developer mode is enabled - use mock struggle words instead of LLM analysis
                if ((0, developer_mode_1.isDeveloperMode)()) {
                    console.log(`[MEMORY-AGENT] 🧪 Developer mode active - skipping LLM analysis, using mock struggle words`);
                    const mockStruggleWords = (0, developer_mode_1.getMockStruggleWords)();
                    console.log(`[MEMORY-AGENT] ✅ Using mock struggle words:`, mockStruggleWords);
                    if (mockStruggleWords.length > 0) {
                        // Update struggle words in database (ensures uniqueness)
                        yield this.updateStruggleWords(userId, courseName, mockStruggleWords);
                    }
                    return; // Early return - skip LLM analysis
                }
                // Retrieve existing struggle words to provide feedback to LLM
                const existingStruggleWords = yield this.getStruggleWords(userId, courseName);
                console.log(`[MEMORY-AGENT] 📋 Existing struggle topics (${existingStruggleWords.length}):`, existingStruggleWords);
                // Create conversation with system prompt that includes existing topics
                console.log(`[MEMORY-AGENT] 🔍 Analyzing conversation for struggle topics...`);
                const conversation = this.llmModule.createConversation();
                const systemPrompt = (0, memory_agent_prompt_1.getMemoryAgentPrompt)(existingStruggleWords);
                conversation.addMessage('system', systemPrompt);
                conversation.addMessage('user', userMessages);
                // Get response from LLM
                const response = yield conversation.send();
                if (!response || !response.content) {
                    console.warn(`[MEMORY-AGENT] ⚠️ Empty response from LLM analysis`);
                    // Log to file even if response is empty
                    // await this.logLLMInvocation(userId, courseName, systemPrompt, userMessages, '');
                    return;
                }
                // Parse the JSON response and extract StruggleTopics array
                let struggleTopics = [];
                let parseSuccess = false;
                try {
                    // Clean the response content
                    const jsonContent = response.content.trim();
                    // Parse JSON
                    const parsed = JSON.parse(jsonContent);
                    // Extract StruggleTopics array
                    if (parsed && Array.isArray(parsed.StruggleTopics)) {
                        struggleTopics = parsed.StruggleTopics;
                        parseSuccess = true;
                    }
                    else if (parsed && parsed.StruggleTopics === undefined) {
                        console.warn(`[MEMORY-AGENT] ⚠️ Response missing 'StruggleTopics' field`);
                        struggleTopics = [`[MEMORY-AGENT] ⚠️ Response missing 'StruggleTopics' field`];
                    }
                    else {
                        console.warn(`[MEMORY-AGENT] ⚠️ 'StruggleTopics' is not an array in response`);
                        struggleTopics = [`[MEMORY-AGENT] ⚠️ 'StruggleTopics' is not an array in response`];
                    }
                }
                catch (jsonError) {
                    console.error(`[MEMORY-AGENT] 🚨 Error parsing JSON response:`, jsonError);
                    console.error(`[MEMORY-AGENT] Response content:`, response.content);
                    struggleTopics = [`[MEMORY-AGENT] 🚨 Error parsing JSON response: ${jsonError}`];
                }
                // // Log the complete LLM invocation (request + response) to file when response succeeds
                // if (parseSuccess) {
                //     await this.logLLMInvocation(userId, courseName, systemPrompt, userMessages, response.content);
                // }
                // Normalize and filter struggle words
                const normalizedStruggleWords = struggleTopics
                    .map((word) => word.trim())
                    .filter((word) => word.length > 0)
                    .map((word) => word.toLowerCase()); // Normalize to lowercase
                // Remove exact duplicates
                const uniqueStruggleWords = Array.from(new Set(normalizedStruggleWords));
                console.log(`[MEMORY-AGENT] ✅ Extracted ${uniqueStruggleWords.length} struggle topics:`, uniqueStruggleWords);
                if (uniqueStruggleWords.length > 0) {
                    // Update struggle words in database (ensures uniqueness and avoids duplicates via LLM prompt)
                    yield this.updateStruggleWords(userId, courseName, uniqueStruggleWords);
                }
                else {
                    console.log(`[MEMORY-AGENT] ℹ️ No struggle words extracted from conversation`);
                }
            }
            catch (error) {
                console.error(`[MEMORY-AGENT] 🚨 Error in analyzeAndUpdateStruggleWords:`, error);
                // Don't throw - this shouldn't break the chat flow
            }
        });
    }
}
exports.MemoryAgent = MemoryAgent;
// Create singleton instance
const appConfig = (0, config_1.loadConfig)();
exports.memoryAgent = new MemoryAgent(appConfig);
