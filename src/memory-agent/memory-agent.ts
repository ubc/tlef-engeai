/**
 * Memory Agent System
 *
 * Analyzes student conversations to identify instructor-catalog struggle topics,
 * stores them per-user in MongoDB, and appends them to system prompts for new chats.
 * Owns the V2 analysis prompt, Zod schema, and catalog post-filter in this file.
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
import { z } from 'zod';
import { LLMModule, type Message } from 'ubc-genai-toolkit-llm';
import { AppConfig, loadConfig } from '../utils/config';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { isDeveloperMode, getMockStruggleWords } from '../helpers/developer-mode';
import { getStruggleLabelsFromEntry, sanitizeStruggleLabels } from '../helpers/struggle-chapter-normalize';
import type { InstructorStruggleTopicForDisplay } from '../types/shared';
import { appLogger } from '../utils/logger';

// =====================================================
// Struggle analysis schema + catalog filter
// =====================================================

/**
 * Zod schema passed to {@link LLMModule.sendStructuredConversation} for memory-agent analysis.
 * Enforces `struggleTopics` as a string array with at most one element.
 */
export const struggleAnalysisResponseSchema = z.object({
    struggleTopics: z.array(z.string()).max(1)
});

/** Parsed shape of {@link struggleAnalysisResponseSchema}. */
export type StruggleAnalysisResponse = z.infer<typeof struggleAnalysisResponseSchema>;

/**
 * filterVerbatimStruggleTopics - Keep only catalog-exact labels from LLM output.
 *
 * Trims each candidate, keeps only labels present in `allowedLabels` (exact match, case-sensitive),
 * deduplicates, and returns at most one label (V2 product rule).
 *
 * @param rawTopics - Values from `response.parsed.struggleTopics` (may be empty or invalid).
 * @param allowedLabels - Set of `struggleTopic` strings from `getAllInstructorStruggleTopics`.
 * @returns Zero or one catalog label safe to persist on the student's memory-agent entry.
 */
export function filterVerbatimStruggleTopics(
    rawTopics: string[],
    allowedLabels: ReadonlySet<string>
): string[] {
    const seen = new Set<string>();
    const validated: string[] = [];
    for (const raw of rawTopics) {
        const trimmed = raw.trim();
        if (!trimmed || !allowedLabels.has(trimmed) || seen.has(trimmed)) {
            continue;
        }
        seen.add(trimmed);
        validated.push(trimmed);
        if (validated.length >= 1) {
            break;
        }
    }
    return validated;
}

// =====================================================
// System prompt builders
// =====================================================

/**
 * formatStruggleCatalogForPrompt - Nested XML for the instructor struggle catalog.
 *
 * Structure: `course_struggle_catalog` → `topic_or_week` → `section` → `struggle_topic` text nodes.
 * Empty catalog yields an empty wrapper element (analysis should be skipped upstream when possible).
 *
 * @param catalog - Output of `getAllInstructorStruggleTopics` for the course.
 * @returns XML string embedded under `### course_struggle_catalog` in the system prompt.
 */
export function formatStruggleCatalogForPrompt(catalog: InstructorStruggleTopicForDisplay[]): string {
    if (catalog.length === 0) {
        return '<course_struggle_catalog>\n</course_struggle_catalog>';
    }

    const byTopicOrWeek = new Map<string, Map<string, string[]>>();
    for (const row of catalog) {
        const weekTitle = row.topicOrWeekTitle || 'Untitled';
        const sectionTitle = row.itemTitle || 'Untitled';
        if (!byTopicOrWeek.has(weekTitle)) {
            byTopicOrWeek.set(weekTitle, new Map());
        }
        const sections = byTopicOrWeek.get(weekTitle)!;
        if (!sections.has(sectionTitle)) {
            sections.set(sectionTitle, []);
        }
        sections.get(sectionTitle)!.push(row.struggleTopic);
    }

    const lines: string[] = ['<course_struggle_catalog>'];
    for (const [weekTitle, sections] of byTopicOrWeek) {
        lines.push(`  <topic_or_week title="${escapeXmlAttr(weekTitle)}">`);
        for (const [sectionTitle, topics] of sections) {
            lines.push(`    <section title="${escapeXmlAttr(sectionTitle)}">`);
            for (const topic of topics) {
                lines.push(`      <struggle_topic>${escapeXmlText(topic)}</struggle_topic>`);
            }
            lines.push('    </section>');
        }
        lines.push('  </topic_or_week>');
    }
    lines.push('</course_struggle_catalog>');
    return lines.join('\n');
}

/** Format existing student struggle topics as XML for the memory-agent system prompt. */
function formatExistingStudentTopics(existingStruggleTopics: string[]): string {
    if (existingStruggleTopics.length === 0) {
        return '<existing_student_struggle_topics>\n</existing_student_struggle_topics>';
    }
    const lines = ['<existing_student_struggle_topics>'];
    for (const topic of existingStruggleTopics) {
        lines.push(`  <topic>${escapeXmlText(topic)}</topic>`);
    }
    lines.push('</existing_student_struggle_topics>');
    return lines.join('\n');
}

function escapeXmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * buildMemoryAgentSystemPrompt - Full V2 system prompt (purpose, rules, catalog, existing topics).
 *
 * Used with {@link struggleAnalysisResponseSchema} via `LLMModule.sendStructuredConversation`.
 * The caller should add the user turn separately (wrapped in `conversation_excerpt`).
 *
 * @param catalog - Instructor-defined labels for the course (flattened with hierarchy).
 * @param existingStruggleTopics - Labels already on the student's memory-agent entry (verbatim strings).
 * @returns Markdown + XML system prompt string.
 */
export function buildMemoryAgentSystemPrompt(
    catalog: InstructorStruggleTopicForDisplay[],
    existingStruggleTopics: string[] = []
): string {
    const catalogBlock = formatStruggleCatalogForPrompt(catalog);
    const existingBlock = formatExistingStudentTopics(existingStruggleTopics);

    return `# Memory agent

## Purpose
Identify whether the student is struggling with a topic from the instructor-defined catalog, using only the last three chat messages, so the Socratic tutor can later switch to more direct teaching for that label.

## How this works
1. You receive a **conversation excerpt** (last 3 messages) in the user turn and the **course struggle catalog** below.
2. You may output **at most one** label that appears **verbatim** in the catalog.
3. If nothing in the excerpt supports a catalog label, output an empty list.
4. Do not invent labels. Do not paraphrase. Do not return labels already stored for this student (listed under Existing).

## Inputs

### course_struggle_catalog
${catalogBlock}

### existing_student_struggle_topics
${existingBlock}

## Output contract
Return JSON matching the schema: \`{ "struggleTopics": string[] }\` with 0 or 1 element; each element must equal a catalog \`<struggle_topic>\` text exactly.`;
}

/**
 * Legacy alias for {@link buildMemoryAgentSystemPrompt}.
 *
 * @deprecated Prefer `buildMemoryAgentSystemPrompt(catalog, existingStruggleTopics)`.
 * @param existingStruggleTopics - Student's current struggle labels.
 * @param catalog - Instructor catalog rows (defaults to empty).
 * @returns System prompt string.
 */
export const getMemoryAgentPrompt = (
    existingStruggleTopics: string[] = [],
    catalog: InstructorStruggleTopicForDisplay[] = []
): string => buildMemoryAgentSystemPrompt(catalog, existingStruggleTopics);

// =====================================================
// MemoryAgent
// =====================================================

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
