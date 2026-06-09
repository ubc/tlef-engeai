/**
 * struggle-topic-generator.ts
 *
 * Post-upload LLM generation of instructor struggle-topic catalog entries.
 * Uses FIFO prior-topic context, structured output, exact dedup, and auto-append via Mongo.
 */

import { LLMModule, type Message } from 'ubc-genai-toolkit-llm';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { AppConfig, loadConfig } from '../utils/config';
import type { InstructorStruggleTopic, UploadStruggleGenerationPayload } from '../types/shared';
import { appLogger } from '../utils/logger';
import {
    collectPriorStruggleTopicsForGeneration,
    formatPriorStruggleTopicsXml,
} from './struggle-fifo-collector';
import {
    buildStruggleGenerationSystemPrompt,
    buildStruggleGenerationUserTurn,
} from './struggle-generation-prompt';
import {
    filterGeneratedStruggleTopics,
    struggleGenerationResponseSchema,
} from './struggle-generation-schema';
import { isDeveloperMode, getMockGeneratedStruggleTopics } from '../helpers/developer-mode';

/** Max characters of uploaded material text sent to the LLM (token safety). */
export const MAX_EXTRACTED_TEXT_CHARS = 14000;

export interface StruggleGenerationInput {
    courseId: string;
    topicOrWeekId: string;
    itemId: string;
    extractedText: string;
    sectionTitles: { topicOrWeekTitle: string; itemTitle: string };
    materialName: string;
}

function buildExcludedTopicSet(
    sections: ReturnType<typeof collectPriorStruggleTopicsForGeneration>
): Set<string> {
    const excluded = new Set<string>();
    for (const section of sections) {
        for (const topic of section.topics) {
            excluded.add(topic);
        }
    }
    return excluded;
}

function truncateExtractedText(text: string): { text: string; truncated: boolean } {
    if (text.length <= MAX_EXTRACTED_TEXT_CHARS) {
        return { text, truncated: false };
    }
    return {
        text: text.slice(0, MAX_EXTRACTED_TEXT_CHARS),
        truncated: true,
    };
}

function createStruggleTopicEntry(label: string): InstructorStruggleTopic {
    const now = new Date();
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        struggleTopic: label,
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Generates struggle-topic labels from uploaded material and appends them to the section catalog.
 *
 * `buildStruggleGenerationSystemPrompt` + `sendStructuredConversation` ({@link struggleGenerationResponseSchema}) →
 * {@link filterGeneratedStruggleTopics} → Mongo append.
 */
export class StruggleTopicGenerator {
    private llmModule: LLMModule;
    private appConfig: AppConfig;

    constructor(config: AppConfig) {
        this.appConfig = config;
        this.llmModule = new LLMModule(this.appConfig.llmConfig);
    }

    /**
     * Runs LLM generation (or dev-mode mock), deduplicates, and persists new catalog entries.
     *
     * @param input - Course/section ids, extracted upload text, and display titles.
     * @returns Saved entries and optional skip/warning metadata for the upload 201 response.
     */
    public async generateAndAppend(
        input: StruggleGenerationInput
    ): Promise<UploadStruggleGenerationPayload> {

        // Trim the extracted text
        const trimmedText = input.extractedText?.trim() ?? '';
        if (!trimmedText) {
            return {
                generatedStruggleTopics: [],
                struggleGenerationSkipped: true,
            };
        }

        // Get the active course
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const course = await mongoDB.getActiveCourse(input.courseId);
        if (!course) {
            appLogger.warn(
                `[STRUGGLE-GEN] Course not found: ${input.courseId}; skipping generation`
            );
            return {
                generatedStruggleTopics: [],
                struggleGenerationSkipped: true,
                struggleGenerationWarning: 'Course not found for struggle topic generation',
            };
        }

        // Collect the prior struggle topics
        let sections: ReturnType<typeof collectPriorStruggleTopicsForGeneration>;
        try {
            sections = collectPriorStruggleTopicsForGeneration(
                course,
                input.topicOrWeekId,
                input.itemId
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Target section not found';
            appLogger.warn(`[STRUGGLE-GEN] FIFO collection failed: ${message}`);
            return {
                generatedStruggleTopics: [],
                struggleGenerationSkipped: true,
                struggleGenerationWarning: message,
            };
        }

        // Format the current section info
        const currentSectionInfo = `${input.sectionTitles.topicOrWeekTitle} / ${input.sectionTitles.itemTitle}`;

        // Format the prior struggle topics XML
        const priorXml = formatPriorStruggleTopicsXml(currentSectionInfo, sections);

        // Build the excluded topic set
        const excludedSet = buildExcludedTopicSet(sections);

        // Truncate the extracted text
        const { text: materialText, truncated } = truncateExtractedText(trimmedText);

        // Build the user turn
        const userTurn = buildStruggleGenerationUserTurn(
            priorXml,
            input.materialName,
            materialText,
            truncated
        );

        // Send the structured conversation
        let rawTopics: string[];
        if (isDeveloperMode()) {
            appLogger.log('[STRUGGLE-GEN] Developer mode — using mock generated struggle topics');
            rawTopics = getMockGeneratedStruggleTopics();
        } else {
            const systemPrompt = buildStruggleGenerationSystemPrompt();

            // Build the messages
            const messages: Message[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userTurn },
            ];

            // Send the structured conversation
            const response = await this.llmModule.sendStructuredConversation(
                messages,
                struggleGenerationResponseSchema,
                { structuredOutputName: 'struggle_generation' }
            );

            // Get the raw topics
            rawTopics = response?.parsed?.struggleTopics ?? [];
        }

        // Filter the raw topics
        const labels = filterGeneratedStruggleTopics(rawTopics, excludedSet);
        if (labels.length === 0) {
            return { generatedStruggleTopics: [] };
        }

        // Create the saved entries
        const saved: InstructorStruggleTopic[] = [];
        for (const label of labels) {
            const entry = createStruggleTopicEntry(label);
            await mongoDB.addInstructorStruggleTopic(
                input.courseId,
                input.topicOrWeekId,
                input.itemId,
                entry
            );
            saved.push(entry);
        }

        appLogger.log(
            `[STRUGGLE-GEN] Appended ${saved.length} struggle topic(s) for section ${input.itemId}`
        );
        return { generatedStruggleTopics: saved };
    }
}

const appConfig = loadConfig();
export const struggleTopicGenerator = new StruggleTopicGenerator(appConfig);
