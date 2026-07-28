/**
 * StruggleTopicGenerator — post-upload instructor struggle-topic catalog generation
 *
 * Owns schema, FIFO prior-topic context, LLM/predetermined/dev-mock label resolution,
 * and Mongo append. Prompt builders live in struggle-generation-prompt.ts.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-23
 * @version: 1.0.0
 * @description: Post-upload struggle-topic generation pipeline and persistence.
 */

import { z } from 'zod';
import { LLMModule, type Message } from 'ubc-genai-toolkit-llm';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { AppConfig, loadConfig } from '../utils/config';
import type {
    activeCourse,
    InstructorStruggleTopic,
    TopicOrWeekItem,
    UploadStruggleGenerationPayload,
} from '../types/shared';
import { appLogger } from '../utils/logger';
import {
    buildStruggleGenerationSystemPrompt,
    buildStruggleGenerationUserTurn,
} from './struggle-generation-prompt';
import { isDeveloperMode, getMockGeneratedStruggleTopics } from '../helpers/developer-mode';
import {
    getPredeterminedLabels,
    resolveTopicNumber,
    usesPredeterminedStruggleCatalog,
} from './predetermined-struggle-catalog';

/* =================================================
 *    Interfaces & variables & Structured schema
 * =================================================
 */

/** Max characters of uploaded material text sent to the LLM (token safety). */
export const MAX_EXTRACTED_TEXT_CHARS = 14000;

/** Input for post-upload struggle-topic generation. */
export interface StruggleGenerationInput {
    courseId: string;
    topicOrWeekId: string;
    itemId: string;
    extractedText: string;
    sectionTitles: { topicOrWeekTitle: string; itemTitle: string };
    materialName: string;
}

/** Max labels returned from one generation run (product rule). */
export const MAX_STRUGGLE_TOPICS = 5;

/** Max characters per instructor struggle-topic label. */
export const MAX_STRUGGLE_TOPIC_LABEL_LENGTH = 300;

/**
 * Zod schema passed to {@link LLMModule.sendStructuredConversation} for struggle-topic generation.
 * Enforces `struggleTopics` as a string array with at most five elements.
 */
export const struggleGenerationResponseSchema = z.object({
    struggleTopics: z.array(z.string()).max(MAX_STRUGGLE_TOPICS),
});

/** Parsed shape of {@link struggleGenerationResponseSchema}. */
export type StruggleGenerationResponse = z.infer<typeof struggleGenerationResponseSchema>;

/** One section's struggle labels for generation prompt assembly. */
export interface PriorStruggleSection {
    topicOrWeekTitle: string;
    itemTitle: string;
    topics: string[];
    isCurrent: boolean;
}

/* =================================================
 *    Main Functions
 * =================================================
 */

/**
 * filterGeneratedStruggleTopics - validate LLM output after structured parsing.
 *
 * Trims each candidate, drops empty or over-length labels, removes labels present in
 * `excludedSet` (exact match, case-sensitive), deduplicates within the batch, and returns
 * at most {@link MAX_STRUGGLE_TOPICS} labels.
 *
 * @param rawTopics - Values from `response.parsed.struggleTopics` (may be empty or invalid)
 * @param excludedSet - All prior + current-section labels from FIFO XML (exact match)
 * @returns Labels safe to append to the instructor catalog
 */
export function filterGeneratedStruggleTopics(
    rawTopics: string[],
    excludedSet: ReadonlySet<string>
): string[] {
    const seen = new Set<string>();
    const validated: string[] = [];

    for (const raw of rawTopics) {
        const trimmed = raw.trim();
        if (
            !trimmed ||
            trimmed.length > MAX_STRUGGLE_TOPIC_LABEL_LENGTH ||
            excludedSet.has(trimmed) ||
            seen.has(trimmed)
        ) {
            continue;
        }
        seen.add(trimmed);
        validated.push(trimmed);
        if (validated.length >= MAX_STRUGGLE_TOPICS) {
            break;
        }
    }

    return validated;
}

/**
 * collectPriorStruggleTopicsForGeneration - prior and current-section topics in curriculum order.
 *
 * Walks `course.topicOrWeekInstances` then `items` in array order, stopping at the
 * target section (inclusive). Earlier sections contribute exclusion labels; the target
 * section lists existing labels only (append context).
 *
 * @param course - Active course document with embedded topic/week instances
 * @param topicOrWeekId - Target topic/week instance id
 * @param itemId - Target content item id within that instance
 * @returns Sections in curriculum order through the target section
 * @throws When the target section is not found in the course
 */
export function collectPriorStruggleTopicsForGeneration(
    course: activeCourse,
    topicOrWeekId: string,
    itemId: string
): PriorStruggleSection[] {
    const sections: PriorStruggleSection[] = [];
    let found = false;

    for (const instance of course.topicOrWeekInstances ?? []) {
        for (const item of instance.items ?? []) {
            const section: PriorStruggleSection = {
                topicOrWeekTitle: instance.title || 'Untitled',
                itemTitle: resolveItemTitle(item),
                topics: extractStruggleTopicLabels(item.instructorStruggleTopics),
                isCurrent: instance.id === topicOrWeekId && item.id === itemId,
            };

            sections.push(section);

            if (section.isCurrent) {
                found = true;
                return sections;
            }
        }
    }

    if (!found) {
        throw new Error(
            `Struggle generation target not found: topicOrWeekId=${topicOrWeekId}, itemId=${itemId}`
        );
    }

    return sections;
}

/**
 * formatPriorStruggleTopicsXml - render prior/current struggle topics as one XML block.
 * 
 * Example output:
 * 
 * <prior_assigned_struggle_topics info="Topic 8 — Electrochemistry / Lecture notes">
 *   <section topic_or_week="Topic 8" item="Lecture notes">
 *     <struggle_topic>Electrochemical reactions and their applications</struggle_topic>
 *     <struggle_topic>Electrochemical cells and their components</struggle_topic>
 *     <struggle_topic>Electrochemical processes and their mechanisms</struggle_topic>
 *   </section>
 * </prior_assigned_struggle_topics>
 *
 * @param currentSectionInfo - Root `info` attribute, e.g. `"Topic 8 — Electrochemistry / Lecture notes"`
 * @param sections - Output of {@link collectPriorStruggleTopicsForGeneration}
 * @returns XML string for the user turn (no `order` attributes on sections)
 */
export function formatPriorStruggleTopicsXml(
    currentSectionInfo: string,
    sections: PriorStruggleSection[]
): string {
    const lines: string[] = [
        `<prior_assigned_struggle_topics info="${escapeXmlAttr(currentSectionInfo)}">`,
    ];

    // loop through the sections and add the struggle topics to the XML
    for (const section of sections) {
        if (section.topics.length === 0) {
            continue;
        }

        const attrs = [
            `topic_or_week="${escapeXmlAttr(section.topicOrWeekTitle)}"`,
            `item="${escapeXmlAttr(section.itemTitle)}"`,
        ];
        if (section.isCurrent) {
            attrs.push('info="current topic"');
        }

        lines.push(`  <section ${attrs.join(' ')}>`);
        for (const topic of section.topics) {
            lines.push(`    <struggle_topic>${escapeXmlText(topic)}</struggle_topic>`);
        }
        lines.push('  </section>');
    }

    lines.push('</prior_assigned_struggle_topics>');
    return lines.join('\n');
}

/**
 * StruggleTopicGenerator
 *
 * Post-upload generation of instructor struggle-topic catalog entries.
 *
 * Key Features:
 * - FIFO prior-topic exclusion from curriculum order
 * - Predetermined fixture catalog, developer mock, or LLM structured output
 * - Exact dedup before Mongo append
 */
export class StruggleTopicGenerator {
    private llmModule: LLMModule;
    private appConfig: AppConfig;

    constructor(config: AppConfig) {
        this.appConfig = config;
        this.llmModule = new LLMModule(this.appConfig.llmConfig);
    }

    /**
     * generateAndAppend - run label generation and persist new catalog entries.
     *
     * May skip LLM when text is empty, course missing, or FIFO collection fails.
     * Appends surviving labels via Mongo. Returns saved entries and optional skip/warning metadata.
     *
     * @param input - Course/section ids, extracted upload text, and display titles
     * @returns Upload payload with `generatedStruggleTopics` and optional skip/warning fields
     */
    public async generateAndAppend(
        input: StruggleGenerationInput
    ): Promise<UploadStruggleGenerationPayload> {
        // Validate extracted text; skip when upload has no parseable content
        const trimmedText = input.extractedText?.trim() ?? '';
        if (!trimmedText) {
            return {
                generatedStruggleTopics: [],
                struggleGenerationSkipped: true,
            };
        }

        // Load active course; skip when course document is missing
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

        // Collect FIFO prior sections; skip when target section is not in curriculum
        let sections: PriorStruggleSection[];
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

        // Build prior XML, exclusion set, and truncated material excerpt
        const currentSectionInfo = `${input.sectionTitles.topicOrWeekTitle} / ${input.sectionTitles.itemTitle}`;

        
        const priorXml = formatPriorStruggleTopicsXml(currentSectionInfo, sections);
        const excludedSet = buildExcludedTopicSet(sections);
        const { text: materialText, truncated } = truncateExtractedText(trimmedText);

        // Build user turn (prior topics + uploaded material)
        const userTurn = buildStruggleGenerationUserTurn(
            priorXml,
            input.materialName,
            materialText,
            truncated
        );

        // Resolve labels: predetermined catalog → developer mock → LLM structured call
        let rawTopics: string[] | undefined;
        if (usesPredeterminedStruggleCatalog(course.courseName)) {
            const topicNumber = resolveTopicNumber(
                course.courseName,
                input.sectionTitles.topicOrWeekTitle,
                input.materialName
            );
            if (topicNumber !== null) {
                const predetermined = getPredeterminedLabels(
                    course.courseName,
                    topicNumber,
                    excludedSet
                );
                if (predetermined.length > 0) {
                    appLogger.log(
                        `[STRUGGLE-GEN] Using predetermined struggle catalog for ` +
                            `${course.courseName} Topic ${topicNumber}`
                    );
                    rawTopics = predetermined;
                }
            } else {
                appLogger.warn(
                    `[STRUGGLE-GEN] ${course.courseName} upload could not resolve topic number from ` +
                        `"${input.sectionTitles.topicOrWeekTitle}" / "${input.materialName}"`
                );
            }
        }

        if (rawTopics === undefined) {
            if (isDeveloperMode()) {
                appLogger.log('[STRUGGLE-GEN] Developer mode — using mock generated struggle topics');
                rawTopics = getMockGeneratedStruggleTopics();
            } else {
                const systemPrompt = buildStruggleGenerationSystemPrompt();
                const messages: Message[] = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userTurn },
                ];

                const response = await this.llmModule.sendStructuredConversation(
                    messages,
                    struggleGenerationResponseSchema,
                    { structuredOutputName: 'struggle_generation' }
                );

                rawTopics = response?.parsed?.struggleTopics ?? [];
            }
        }

        // Filter and dedup against FIFO exclusion set
        const labels = filterGeneratedStruggleTopics(rawTopics, excludedSet);
        if (labels.length === 0) {
            return { generatedStruggleTopics: [] };
        }

        // Append each surviving label to the section catalog in Mongo
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

/* =================================================
 *    Helper functions
 * =================================================
 */

/**
 * resolveItemTitle - resolve the item title from the item
 * 
 * @param item - the item to resolve the title from
 * @returns the item title
 */
function resolveItemTitle(item: TopicOrWeekItem): string {
    return item.itemTitle || item.title || 'Untitled';
}

/**
 * extractStruggleTopicLabels - extract the struggle topic labels from the item
 * 
 * @param topics - the topics to extract the labels from
 * @returns the struggle topic labels
 */
function extractStruggleTopicLabels(topics: InstructorStruggleTopic[] | undefined): string[] {
    if (!topics?.length) {
        return [];
    }
    return topics.map((entry) => entry.struggleTopic);
}

/**
 * escapeXmlAttr - escape the XML attribute value
 * 
 * @param value - the value to escape
 * @returns the escaped value
 */
function escapeXmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

/**
 * escapeXmlText - escape the XML text value
 * 
 * @param value - the value to escape
 * @returns the escaped value
 */
function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * buildExcludedTopicSet - build the excluded topic set
 * 
 * @param sections - the sections to build the excluded topic set from
 * @returns the excluded topic set
 */
function buildExcludedTopicSet(sections: PriorStruggleSection[]): Set<string> {
    const excluded = new Set<string>();
    for (const section of sections) {
        for (const topic of section.topics) {
            excluded.add(topic);
        }
    }
    return excluded;
}

/**
 * truncateExtractedText - truncate the extracted text if it is too long
 * 
 * @param text - the text to truncate
 * @returns the truncated text
 */
function truncateExtractedText(text: string): { text: string; truncated: boolean } {
    if (text.length <= MAX_EXTRACTED_TEXT_CHARS) {
        return { text, truncated: false };
    }
    return {
        text: text.slice(0, MAX_EXTRACTED_TEXT_CHARS),
        truncated: true,
    };
}

/**
 * createStruggleTopicEntry - create a new struggle topic entry
 *
 * Example output:
 * 
 * {
 *   id: '1234567890',
 *   struggleTopic: 'Electrochemical reactions and their applications',
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 * }
 *
 * @param label - the label to create the entry for
 * @returns the new struggle topic entry
 */
function createStruggleTopicEntry(label: string): InstructorStruggleTopic {
    const now = new Date();
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        struggleTopic: label,
        createdAt: now,
        updatedAt: now,
    };
}
