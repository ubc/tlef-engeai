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
import type { PublishedTaggedChunk } from '../rag/rag-app';
import { isMockResponse } from '../helpers/mock-response';
import type {
    CourseMaterialExcerpt,
    CourseMaterialMention,
    SflAnalysis,
    SflFinding,
    WritingAssignment
} from './contracts';
import { COURSE_MATERIAL_RESOLVER_VERSION, SFL_RULES_BY_ID } from './sfl-foundation';

/** Dependency seam used by tests to avoid constructing Qdrant/RAG. */
export interface WritingFeedbackMaterialRetriever {
    retrieve(input: { courseId: string; query: string; limit: number; scoreThreshold: number }): Promise<PublishedTaggedChunk[]>;
}

class RagWritingFeedbackMaterialRetriever implements WritingFeedbackMaterialRetriever {
    async retrieve(input: { courseId: string; query: string; limit: number; scoreThreshold: number }): Promise<PublishedTaggedChunk[]> {
        const rag = await RAGApp.getInstance();
        // Ground on the whole uploaded corpus; the published subset is what may be cited,
        // which the caller enforces by building its allowlist from published chunks alone.
        return rag.retrieveForWritingFeedback(input.query, input.courseId, {
            limit: input.limit,
            scoreThreshold: input.scoreThreshold,
            includeUnpublished: true
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

/**
 * uniqueMentions - deduplicated mentions for a set of chunks.
 *
 * @param chunks - Retrieved chunks, in the order retrieval returned them
 * @param limit - How many to keep. The student-facing list is capped at five by the
 *                feedback schema; the writer allowlist and the staff list are not, because
 *                capping those would make a per-finding citation fail validation for no
 *                reason other than its cluster having been retrieved late.
 * @returns Deduplicated mentions, longest-lived first
 */
function uniqueMentions(chunks: PublishedTaggedChunk[], limit = STUDENT_MENTION_LIMIT): CourseMaterialMention[] {
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
    return mentions.slice(0, limit);
}

/** The feedback schema caps the student-facing source list at five mentions. */
const STUDENT_MENTION_LIMIT = 5;

/** Retrieval budget per run: enough for a typical three-to-six cluster analysis, bounded. */
export const MAX_RETRIEVAL_QUERIES = 8;
/** Per-chunk truncation: enough to carry an idea, short enough that several fit. */
export const MAX_EXCERPT_CHARS = 600;
/** Total course text one writer call may read. */
export const EXCERPT_BUDGET_CHARS = 4000;
const RETRIEVAL_LIMIT = 5;
const RETRIEVAL_SCORE_THRESHOLD = 0.45;

/**
 * findingClusterKey - the retrieval identity of one finding.
 *
 * Findings that differ only in which sentence they point at want the same course material,
 * so they share a query. The key uses only curated fields, which is also what keeps student
 * text out of the clustering.
 *
 * @param finding - Validated analyzer finding
 * @returns Stable key shared by findings that should retrieve together
 */
export function findingClusterKey(finding: SflFinding): string {
    return [
        finding.primaryFunction,
        finding.languageLevel,
        [...finding.ruleIds].sort().join(',')
    ].join('|');
}

/**
 * buildFindingRetrievalQuery - a course-material query for one finding, without student text.
 *
 * `evidence[].quote` is exact student writing, and `observation` and
 * `functionalInterpretation` are model prose about that writing. None of the three may reach
 * the course-material pipeline, so the query is assembled only from curated rule summaries,
 * the finding's function and level labels, the approved profile's stage, and the assignment
 * description staff wrote. This rule is pinned by test, not only by comment.
 *
 * @param assignment - Assignment supplying approved title, task, and profile
 * @param finding - Validated analyzer finding; only its curated labels are read
 * @returns Query string safe to send to the course-material RAG pipeline
 */
export function buildFindingRetrievalQuery(assignment: WritingAssignment, finding: SflFinding): string {
    const profile = assignment.rubric.sflContext;
    const rules = finding.ruleIds
        .map((ruleId) => SFL_RULES_BY_ID.get(ruleId))
        .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule))
        .map((rule) => `${rule.primaryFunction} ${rule.languageLevel} ${rule.summary}`);
    const stage = profile?.stages.find((candidate) => candidate.id === finding.stageId);
    return [
        assignment.title,
        assignment.rubric.task,
        profile?.genreLabel,
        finding.primaryFunction,
        finding.languageLevel,
        stage ? `${stage.label} ${stage.purpose}` : undefined,
        rules.join(' ')
    ].filter(Boolean).join('\n');
}

/** What one run's retrieval produced, split by who may see each part. */
export interface CourseMaterialGrounding {
    /** Published and deduplicated: everything the writer is allowed to cite. */
    mentions: CourseMaterialMention[];
    /** The first five of {@link mentions}: the assignment-level list a student reads. */
    studentMentions: CourseMaterialMention[];
    /** Everything retrieved, published or not. Staff-only. */
    staffMentions: CourseMaterialMention[];
    /** Citable mentions per finding id. An empty list means this finding cites nothing. */
    byFinding: Map<string, CourseMaterialMention[]>;
    /** Course text for the writer to read. Staff- and model-only; never student-facing. */
    excerpts: CourseMaterialExcerpt[];
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
 * buildExcerpts - fills the writer's reading budget, best match first.
 *
 * An excerpt carries a `mentionId` only when its material is published: that id is the only
 * thing the writer may cite, so unpublished text can inform the guidance without being
 * nameable to the student.
 *
 * @param chunks - Retrieved chunks across every query in the run
 * @returns Truncated excerpts within the per-chunk and total budgets
 */
function buildExcerpts(chunks: PublishedTaggedChunk[]): CourseMaterialExcerpt[] {
    const excerpts: CourseMaterialExcerpt[] = [];
    const seen = new Set<string>();
    let used = 0;
    [...chunks]
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
        .forEach((chunk, index) => {
            const text = (chunk.content ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_EXCERPT_CHARS);
            if (!text || seen.has(text) || used + text.length > EXCERPT_BUDGET_CHARS) return;
            seen.add(text);
            used += text.length;
            const mention = chunk.published ? mentionFromChunk(chunk, index) : null;
            excerpts.push({ ...(mention ? { mentionId: mention.id } : {}), text });
        });
    return excerpts;
}

/**
 * resolveCourseMaterialGrounding - retrieves course material per finding cluster.
 *
 * Retrieval is advisory: any failure yields empty lists and generation continues with
 * feedback that cites no material. Grounding must never become a new way for a run to fail.
 *
 * @param assignment - Assignment supplying course id and approved context
 * @param analysis - Validated SFL analysis; only curated fields are read
 * @param retriever - Optional test seam; defaults to the shared RAGApp
 * @returns Citable mentions, the staff-only full list, per-finding mentions, and excerpts
 */
export async function resolveCourseMaterialGrounding(
    assignment: WritingAssignment,
    analysis: SflAnalysis,
    retriever?: WritingFeedbackMaterialRetriever
): Promise<CourseMaterialGrounding> {
    const empty: CourseMaterialGrounding = {
        mentions: [], studentMentions: [], staffMentions: [], byFinding: new Map(), excerpts: []
    };
    if (isMockResponse() && !retriever) return empty;

    const runQuery = buildWritingFeedbackRetrievalQuery(assignment, analysis);
    if (!runQuery.trim()) return empty;

    try {
        const activeRetriever = retriever ?? new RagWritingFeedbackMaterialRetriever();
        const ask = (query: string): Promise<PublishedTaggedChunk[]> => activeRetriever.retrieve({
            courseId: assignment.courseId,
            query,
            limit: RETRIEVAL_LIMIT,
            scoreThreshold: RETRIEVAL_SCORE_THRESHOLD
        });

        // Step 1: the run-level query still runs. It is the assignment-level source list and
        // the fallback for any cluster past the budget.
        const runChunks = await ask(runQuery);

        // Step 2: one query per distinct cluster, bounded. Clusters past the cap reuse the
        // run-level result rather than being dropped, so no finding is left bare arbitrarily.
        const clusters = new Map<string, SflFinding>();
        analysis.findings.forEach((finding) => {
            const key = findingClusterKey(finding);
            if (!clusters.has(key)) clusters.set(key, finding);
        });
        const clusterChunks = new Map<string, PublishedTaggedChunk[]>();
        for (const [key, representative] of [...clusters.entries()].slice(0, MAX_RETRIEVAL_QUERIES)) {
            const query = buildFindingRetrievalQuery(assignment, representative);
            clusterChunks.set(key, query.trim() ? await ask(query) : runChunks);
        }

        // Step 3: split by publication. Only published material is citable, so only published
        // material reaches the allowlist, the per-finding map, and anything student-facing.
        const allChunks = [...runChunks, ...[...clusterChunks.values()].flat()];
        const mentions = uniqueMentions(allChunks.filter((chunk) => chunk.published), Number.POSITIVE_INFINITY);
        const staffMentions = uniqueMentions(allChunks, Number.POSITIVE_INFINITY);
        const citable = new Set(mentions.map((mention) => mention.id));

        const byFinding = new Map<string, CourseMaterialMention[]>();
        analysis.findings.forEach((finding) => {
            const chunks = clusterChunks.get(findingClusterKey(finding)) ?? runChunks;
            byFinding.set(
                finding.id,
                uniqueMentions(chunks.filter((chunk) => chunk.published), Number.POSITIVE_INFINITY)
                    .filter((mention) => citable.has(mention.id))
            );
        });

        return {
            mentions,
            studentMentions: mentions.slice(0, STUDENT_MENTION_LIMIT),
            staffMentions,
            byFinding,
            excerpts: buildExcerpts(allChunks)
        };
    } catch {
        return empty;
    }
}

/**
 * resolveCourseMaterialMentions - the deduplicated citable label list for one run.
 *
 * @param assignment - Assignment supplying course id and approved context
 * @param analysis - Validated SFL analysis, never raw student text
 * @param retriever - Optional test seam; defaults to the shared RAGApp
 * @returns The student-facing published mentions, or an empty list on retrieval failure
 */
export async function resolveCourseMaterialMentions(
    assignment: WritingAssignment,
    analysis: SflAnalysis,
    retriever?: WritingFeedbackMaterialRetriever
): Promise<CourseMaterialMention[]> {
    return (await resolveCourseMaterialGrounding(assignment, analysis, retriever)).studentMentions;
}

/** Exposed for run provenance without coupling callers to the foundation file. */
export const WRITING_FEEDBACK_COURSE_SOURCE_VERSION = COURSE_MATERIAL_RESOLVER_VERSION;
