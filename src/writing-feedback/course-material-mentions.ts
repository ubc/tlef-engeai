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
    RealizedGenre,
    RetrievalNeedKind,
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

/**
 * mentionFromChunk - one retrieved chunk as a citable source label.
 *
 * The fallback id is built from the same titles `uniqueMentions` dedupes on, deliberately
 * not from the chunk's position: the citable list, the staff list, and each per-finding list
 * enumerate different arrays, so a positional id gave one document three different ids and
 * the per-finding citation was then filtered out as uncitable.
 *
 * @param chunk - Retrieved chunk, with metadata as the pipeline stored it
 * @returns The mention, or null when the chunk carries no nameable material
 */
function mentionFromChunk(chunk: RetrievedChunk): CourseMaterialMention | null {
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
        id: textField(metadata, 'id') ?? `${topicTitle ?? 'topic'}:${itemTitle ?? 'item'}:${materialName ?? 'material'}`,
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

/** Retrieval budget per run: enough for a typical three-to-six cluster analysis, bounded. */
export const MAX_RETRIEVAL_QUERIES = 8;
/** Per-chunk truncation: enough to carry an idea, short enough that several fit. */
export const MAX_EXCERPT_CHARS = 600;
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

/** Exposed for run provenance without coupling callers to the foundation file. */
export const WRITING_FEEDBACK_COURSE_SOURCE_VERSION = COURSE_MATERIAL_RESOLVER_VERSION;

/** Genre-pass budget: course text the diagnosis and analyzer calls may read. */
export const GENRE_EXCERPT_BUDGET_CHARS = 4000;
/** Finding-pass budget: course text the writer may read. */
export const FINDING_EXCERPT_BUDGET_CHARS = 4000;
/** Genre pass: 1 genre + up to 5 stages + up to 3 requirements + 5 language functions. */
export const MAX_GENRE_QUERIES = 14;

/**
 * Curated query terms per language function. These double as coverage rows, which is why
 * they are fixed rather than derived from the rubric.
 */
export const LANGUAGE_FUNCTION_QUERIES: Record<string, { label: string; query: string }> = {
    definition: { label: 'Formal definition', query: 'formal definition term class distinguishing features' },
    classification: { label: 'Classification into types', query: 'classification types subtypes classify an entity' },
    composition: { label: 'Composition into parts', query: 'composition whole parts components of an entity' },
    theme: { label: 'Theme and thematic progression', query: 'theme rheme point of departure thematic progression information flow' },
    noun_groups: { label: 'Noun groups', query: 'noun group expanded noun phrase modifier qualifier' }
};

/**
 * Curated vocabulary per rule, matched to how course notes word the idea. A rule absent
 * here queries on its summary alone.
 */
export const RULE_QUERY_TERMS: Record<string, string> = {
    C01: 'genre stages report structure',
    C04: 'title topic purpose',
    C05: 'stage purpose section work',
    C06: 'paragraph one main idea topic sentence',
    C07: 'define new technical term for the reader',
    C08: 'logical relations cause comparison conjunction',
    C10: 'specific participants noun group detail',
    C11: 'process type relational material verb choice',
    C12: 'formal definition class distinguishing features',
    C13: 'nominalization technical abstraction',
    I01: 'academic register stance objective',
    I02: 'certainty evaluation claim strength',
    I10: 'hedging boosting modality',
    I11: 'attitudinal evaluative language informal',
    I12: 'tense timeless present modality reporting verbs',
    I14: 'formal precise vocabulary word choice',
    O01: 'stage sequence genre staging',
    O05: 'paragraph thematic focus',
    O06: 'information flow cohesion between sentences',
    O07: 'transitions linking words',
    O08: 'reference cohesion pronouns tracking participants',
    O10: 'theme rheme point of departure thematic progression',
    O11: 'new information end focus',
    O13: 'clause structure sentence complexity written mode',
    O14: 'punctuation clause boundaries'
};

/** How course notes typically describe a neighbouring genre; keyed by realized genre. */
export const CONTRAST_PHRASES: Partial<Record<RealizedGenre, string>> = {
    explanation: 'explanation genre sequence of how or why a process happens temporal causal',
    recount: 'recount genre retelling past events in time order',
    procedure: 'procedure genre steps instructions',
    argument: 'argument exposition genre position reasons',
    personal_response: 'personal response opinion feelings about a topic'
};

/** One thing retrieval looks for. Queries are built from curated fields only. */
export interface RetrievalNeed {
    id: string;
    kind: RetrievalNeedKind;
    label: string;
    query: string;
    clusterKey?: string;
    stageId?: string;
}

/** Course text found for one or more needs. Staff- and model-only. */
export interface GroundingExcerpt {
    id: string;
    text: string;
    needIds: string[];
    score: number;
    published: boolean;
    /** Present only for published material with nameable metadata. */
    mention?: CourseMaterialMention;
    /** Label for staff whatever the publication state; never student-facing. */
    staffMention?: CourseMaterialMention;
}

export interface NeedRetrieval {
    excerpts: GroundingExcerpt[];
    failed: boolean;
}

/**
 * buildGenreNeeds - genre-pass needs from the approved profile.
 *
 * @param assignment - Assignment with an approved genre profile
 * @returns Short, curated needs; never reads student text
 */
export function buildGenreNeeds(assignment: WritingAssignment): RetrievalNeed[] {
    const profile = assignment.rubric.sflContext;
    if (!profile) return [];
    const needs: RetrievalNeed[] = [
        { id: 'genre', kind: 'genre', label: profile.genreLabel, query: `${profile.genreLabel}: ${profile.purpose}`.slice(0, 280) },
        ...profile.stages.slice(0, 5).map((stage) => ({
            id: `stage:${stage.id}`,
            kind: 'stage' as const,
            label: stage.label,
            query: `${profile.genreLabel} ${stage.label}: ${stage.purpose}`.slice(0, 280),
            stageId: stage.id
        })),
        ...profile.taskRequirements.slice(0, 3).map((requirement, index) => ({
            id: `task:${index}`,
            kind: 'task_requirement' as const,
            label: requirement,
            query: requirement.slice(0, 280)
        })),
        ...Object.entries(LANGUAGE_FUNCTION_QUERIES).map(([key, entry]) => ({
            id: `function:${key}`,
            kind: 'language_function' as const,
            label: entry.label,
            query: entry.query
        }))
    ];
    return needs.slice(0, MAX_GENRE_QUERIES);
}

/**
 * buildContrastNeed - a need for course text on the genre the student wrote instead.
 *
 * @param realizedGenre - Diagnosis enum value, never student text
 * @param targetGenreId - Profile genre id
 * @returns A need, or null when the genres match or no curated phrase exists
 */
export function buildContrastNeed(realizedGenre: RealizedGenre, targetGenreId?: string): RetrievalNeed | null {
    if (realizedGenre === targetGenreId) return null;
    const phrase = CONTRAST_PHRASES[realizedGenre];
    return phrase ? { id: `contrast:${realizedGenre}`, kind: 'contrast', label: realizedGenre, query: phrase } : null;
}

/**
 * buildFindingNeeds - one need per finding cluster, bounded by {@link MAX_RETRIEVAL_QUERIES}.
 *
 * @param assignment - Assignment supplying the profile's stages
 * @param analysis - Validated analysis; only curated labels are read
 * @returns Needs keyed by cluster, in first-seen order
 */
export function buildFindingNeeds(assignment: WritingAssignment, analysis: SflAnalysis): RetrievalNeed[] {
    const profile = assignment.rubric.sflContext;
    const clusters = new Map<string, SflFinding>();
    analysis.findings.forEach((finding) => {
        const key = findingClusterKey(finding);
        if (!clusters.has(key)) clusters.set(key, finding);
    });
    return [...clusters.entries()].slice(0, MAX_RETRIEVAL_QUERIES).map(([clusterKey, finding]) => {
        const rules = finding.ruleIds.map((ruleId) => [SFL_RULES_BY_ID.get(ruleId)?.summary, RULE_QUERY_TERMS[ruleId]].filter(Boolean).join(' '));
        const stage = profile?.stages.find((candidate) => candidate.id === finding.stageId);
        const query = [rules.join(' '), stage?.label, `${finding.primaryFunction} ${finding.languageLevel.replace('_', ' ')}`]
            .filter(Boolean).join(' ').slice(0, 280);
        return {
            id: `finding:${clusterKey}`,
            kind: 'finding' as const,
            label: rules[0] || `${finding.primaryFunction} ${finding.languageLevel}`,
            query,
            clusterKey,
            ...(finding.stageId ? { stageId: finding.stageId } : {})
        };
    });
}

/**
 * retrieveForNeeds - runs one query per need and fills a reading budget, best match first.
 *
 * Advisory: any retriever failure yields no excerpts and `failed: true`, and generation
 * continues without citations.
 *
 * @param assignment - Supplies the course id
 * @param needs - Needs to retrieve for
 * @param options - Retriever seam, character budget, and excerpt id prefix
 * @returns Deduplicated excerpts with every need that found each one
 */
export async function retrieveForNeeds(
    assignment: WritingAssignment,
    needs: RetrievalNeed[],
    options: { retriever?: WritingFeedbackMaterialRetriever; budgetChars: number; idPrefix: string }
): Promise<NeedRetrieval> {
    if (!needs.length || (isMockResponse() && !options.retriever)) return { excerpts: [], failed: false };
    try {
        const retriever = options.retriever ?? new RagWritingFeedbackMaterialRetriever();
        // Step 1: one short query per need.
        const found: Array<{ chunk: PublishedTaggedChunk; needId: string }> = [];
        for (const need of needs) {
            const chunks = await retriever.retrieve({
                courseId: assignment.courseId,
                query: need.query,
                limit: RETRIEVAL_LIMIT,
                scoreThreshold: RETRIEVAL_SCORE_THRESHOLD
            });
            chunks.forEach((chunk) => found.push({ chunk, needId: need.id }));
        }
        // Step 2: merge identical text across needs, keeping the best score.
        const byText = new Map<string, { chunk: PublishedTaggedChunk; needIds: Set<string>; score: number }>();
        found.forEach(({ chunk, needId }) => {
            const text = (chunk.content ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_EXCERPT_CHARS);
            if (!text) return;
            const entry = byText.get(text) ?? { chunk, needIds: new Set<string>(), score: 0 };
            entry.needIds.add(needId);
            entry.score = Math.max(entry.score, chunk.score ?? 0);
            byText.set(text, entry);
        });
        // Step 3: fill the budget best-first and assign run-scoped ids.
        const excerpts: GroundingExcerpt[] = [];
        let used = 0;
        [...byText.entries()]
            .sort((left, right) => right[1].score - left[1].score)
            .forEach(([text, entry]) => {
                if (used + text.length > options.budgetChars) return;
                used += text.length;
                const staffMention = mentionFromChunk(entry.chunk) ?? undefined;
                const mention = entry.chunk.published ? staffMention : undefined;
                excerpts.push({
                    id: `${options.idPrefix}${excerpts.length + 1}`,
                    text,
                    needIds: [...entry.needIds],
                    score: entry.score,
                    published: entry.chunk.published === true,
                    ...(mention ? { mention } : {}),
                    ...(staffMention ? { staffMention } : {})
                });
            });
        return { excerpts, failed: false };
    } catch {
        return { excerpts: [], failed: true };
    }
}

/**
 * toExcerpts - the stored, model-facing shape of grounding excerpts.
 *
 * @param excerpts - Grounding excerpts
 * @returns Excerpts with id, text, and a mention id only when published
 */
export function toExcerpts(excerpts: GroundingExcerpt[]): CourseMaterialExcerpt[] {
    return excerpts.map((excerpt) => ({
        id: excerpt.id,
        ...(excerpt.mention ? { mentionId: excerpt.mention.id } : {}),
        text: excerpt.text
    }));
}
