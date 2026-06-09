/**
 * struggle-generation-upload.ts
 *
 * Post-upload struggle-topic generation hook for RAG document routes.
 * Isolated from route handlers for testability; LLM failures must not fail upload.
 */

import type { UploadStruggleGenerationPayload } from '../types/shared';
import { appLogger } from '../utils/logger';
import { struggleTopicGenerator } from '../memory-agent/struggle-topic-generator';

export interface PostUploadStruggleGenerationContext {
    courseId?: string;
    topicOrWeekId?: string;
    itemId?: string;
    extractedText?: string;
    topicOrWeekTitle: string;
    itemTitle: string;
    materialName: string;
    mongoMaterialSaved: boolean;
}

/**
 * Invokes struggle-topic generation after a successful material upload when prerequisites are met.
 *
 * @param ctx - Upload context including Mongo save status and section identifiers.
 * @returns Payload fields to merge into the RAG upload 201 `data` object.
 */
export async function runPostUploadStruggleGeneration(
    ctx: PostUploadStruggleGenerationContext
): Promise<UploadStruggleGenerationPayload> {
    if (!ctx.mongoMaterialSaved) {
        return {
            generatedStruggleTopics: [],
            struggleGenerationSkipped: true,
        };
    }

    if (!ctx.courseId || !ctx.topicOrWeekId || !ctx.itemId) {
        return {
            generatedStruggleTopics: [],
            struggleGenerationSkipped: true,
        };
    }

    if (!ctx.extractedText?.trim()) {
        return {
            generatedStruggleTopics: [],
            struggleGenerationSkipped: true,
        };
    }

    try {
        return await struggleTopicGenerator.generateAndAppend({
            courseId: ctx.courseId,
            topicOrWeekId: ctx.topicOrWeekId,
            itemId: ctx.itemId,
            extractedText: ctx.extractedText,
            sectionTitles: {
                topicOrWeekTitle: ctx.topicOrWeekTitle,
                itemTitle: ctx.itemTitle,
            },
            materialName: ctx.materialName,
        });
    } catch (error) {
        appLogger.error('[STRUGGLE-GEN] Generation failed after upload (upload unaffected):', error);
        return {
            generatedStruggleTopics: [],
            struggleGenerationWarning:
                error instanceof Error ? error.message : 'Struggle topic generation failed',
        };
    }
}
