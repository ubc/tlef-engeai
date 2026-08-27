/**
 * Course material mentions — retrieval allowlist for linguistic feedback
 *
 * Builds non-student-text retrieval queries from assignment metadata and validated
 * SFL finding labels, then resolves retrieved chunks to short student-safe labels.
 * Retrieval is advisory: failures or ambiguous metadata produce no mention.
 *
 * @author: @rdschrs
 * @date: 2026-08-24
 * @version: 1.0.0
 * @description: Owns V2 Writing Feedback course-material retrieval and mention resolution.
 */

import type { RetrievedChunk } from 'ubc-genai-toolkit-rag';
import { RAGApp } from '../rag/rag-app';
import { isMockResponse } from '../helpers/mock-response';
import type { CourseMaterialMention, SflAnalysis, WritingAssignment } from './contracts';
import { COURSE_MATERIAL_RESOLVER_VERSION, SFL_RULES_BY_ID } from './sfl-foundation';

/** Dependency seam used by tests to avoid constructing Qdrant/RAG. */
export interface WritingFeedbackMaterialRetriever {
    retrieve(input: { courseId: string; query: string; limit: number; scoreThreshold: number }): Promise<RetrievedChunk[]>;
}

class RagWritingFeedbackMaterialRetriever implements WritingFeedbackMaterialRetriever {
    async retrieve(input: { courseId: string; query: string; limit: number; scoreThreshold: number }): Promise<RetrievedChunk[]> {
        const rag = await RAGApp.getInstance();
        return rag.retrieveForWritingFeedback(input.query, input.courseId, {
            limit: input.limit,
            scoreThreshold: input.scoreThreshold
        });
    }
}

function parseMetadata(metadata: unknown): Record<string, unknown> {
    if (typeof metadata === 'string') {
        try {
            const parsed = JSON.parse(metadata) as unknown;
            return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
        } catch {
            return {};
        }
    }
    return metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
}

function textField(metadata: Record<string, unknown>, key: string): string | undefined {
    const value = metadata[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function mentionFromChunk(chunk: RetrievedChunk, index: number): CourseMaterialMention | null {
    const metadata = parseMetadata(chunk.metadata);
    const topicTitle = textField(metadata, 'topicOrWeekTitle');
    const itemTitle = textField(metadata, 'itemTitle');
    const materialName = textField(metadata, 'name') ?? textField(metadata, 'materialName');
    if (!topicTitle && !itemTitle && !materialName) return null;

    const label = [topicTitle, itemTitle, materialName]
        .filter((part, partIndex, parts) => Boolean(part) && parts.indexOf(part) === partIndex)
        .join(' · ');
    if (!label) return null;

    return {
        id: textField(metadata, 'id') ?? `${topicTitle ?? 'topic'}:${itemTitle ?? 'item'}:${index}`,
        label,
        ...(textField(metadata, 'courseId') ? { courseId: textField(metadata, 'courseId') } : {}),
        ...(textField(metadata, 'topicOrWeekId') ? { topicOrWeekId: textField(metadata, 'topicOrWeekId') } : {}),
        ...(topicTitle ? { topicOrWeekTitle: topicTitle } : {}),
        ...(textField(metadata, 'itemId') ? { itemId: textField(metadata, 'itemId') } : {}),
        ...(itemTitle ? { itemTitle } : {}),
        ...(textField(metadata, 'id') ? { materialId: textField(metadata, 'id') } : {}),
        ...(materialName ? { materialName } : {}),
        ...(textField(metadata, 'version') ? { version: textField(metadata, 'version') } : {})
    };
}

function uniqueMentions(chunks: RetrievedChunk[]): CourseMaterialMention[] {
    const seen = new Set<string>();
    const mentions: CourseMaterialMention[] = [];
    chunks.forEach((chunk, index) => {
        const mention = mentionFromChunk(chunk, index);
        if (!mention) return;
        const key = mention.materialId ?? `${mention.topicOrWeekTitle ?? ''}/${mention.itemTitle ?? ''}/${mention.materialName ?? ''}`;
        if (!key.trim() || seen.has(key)) return;
        seen.add(key);
        mentions.push(mention);
    });
    return mentions.slice(0, 5);
}

/**
 * buildWritingFeedbackRetrievalQuery - creates a course-material query without student text.
 *
 * @param assignment - Assignment and approved rubric/profile metadata
 * @param analysis - Validated analyzer output; only rule/function labels are used
 * @returns Query string safe to send to the course-material RAG pipeline
 */
export function buildWritingFeedbackRetrievalQuery(assignment: WritingAssignment, analysis: SflAnalysis): string {
    const profile = assignment.rubric.sflContext;
    const rules = new Set<string>();
    analysis.findings.forEach((finding) => {
        finding.ruleIds.forEach((ruleId) => {
            const rule = SFL_RULES_BY_ID.get(ruleId);
            if (rule) rules.add(`${rule.primaryFunction} ${rule.languageLevel} ${rule.summary}`);
        });
    });
    return [
        assignment.title,
        assignment.rubric.task,
        profile?.genreLabel,
        profile?.field,
        profile?.mode,
        profile?.stages.map((stage) => `${stage.label} ${stage.purpose}`).join(' '),
        [...rules].join(' ')
    ].filter(Boolean).join('\n');
}

/**
 * resolveCourseMaterialMentions - retrieves and allowlists useful course labels.
 *
 * @param assignment - Assignment supplying course id and approved context
 * @param analysis - Validated SFL analysis, never raw student text
 * @param retriever - Optional test seam; defaults to the shared RAGApp
 * @returns Deduplicated mentions, or an empty list on retrieval failure
 */
export async function resolveCourseMaterialMentions(
    assignment: WritingAssignment,
    analysis: SflAnalysis,
    retriever?: WritingFeedbackMaterialRetriever
): Promise<CourseMaterialMention[]> {
    const query = buildWritingFeedbackRetrievalQuery(assignment, analysis);
    if (!query.trim()) return [];
    if (isMockResponse() && !retriever) return [];
    try {
        const activeRetriever = retriever ?? new RagWritingFeedbackMaterialRetriever();
        const chunks = await activeRetriever.retrieve({
            courseId: assignment.courseId,
            query,
            limit: 5,
            scoreThreshold: 0.45
        });
        return uniqueMentions(chunks);
    } catch {
        return [];
    }
}

/** Exposed for run provenance without coupling callers to the foundation file. */
export const WRITING_FEEDBACK_COURSE_SOURCE_VERSION = COURSE_MATERIAL_RESOLVER_VERSION;
