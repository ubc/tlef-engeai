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
    WritingAssignment,
    WritingFoundedGenreId
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
/** Genre pass: 1 genre + up to 5 stages + up to 3 requirements + up to 5 language functions. */
export const MAX_GENRE_QUERIES = 14;

/** A language skill course materials might teach, offered only for the genres that use it. */
export interface LanguageFunctionNeed {
    key: string;
    label: string; // staff-facing and readable; no SFL theory names
    query: string; // retrieval wording; may keep the technical words course notes use
    /** Dropped when an approved stage label matches: the stage row already covers it. */
    overlapsStage?: RegExp;
}

const SENTENCE_OPENINGS: LanguageFunctionNeed = { key: 'theme', label: 'Sentence openings that guide the reader', query: 'theme rheme point of departure thematic progression information flow' };
const LINKING: LanguageFunctionNeed = { key: 'cohesion', label: 'Linking ideas across sentences', query: 'cohesion linking words reference connecting sentences' };
const OBJECTIVE_STANCE: LanguageFunctionNeed = { key: 'stance', label: 'Objective stance', query: 'objective impersonal academic tone avoiding personal opinion' };

/**
 * Language skills per founded genre (D-154). These double as coverage rows, so each one is
 * a skill that genre actually asks for; custom genres get the general `default` list.
 */
export const GENRE_LANGUAGE_FUNCTIONS: Record<WritingFoundedGenreId | 'default', LanguageFunctionNeed[]> = {
    descriptive_report: [
        { key: 'definition', label: 'Defining the entity', query: 'formal definition term class distinguishing features', overlapsStage: /general statement|definition|identif/i },
        { key: 'classification', label: 'Classifying or naming parts', query: 'classification types subtypes composition parts of an entity', overlapsStage: /classif|composition|parts/i },
        SENTENCE_OPENINGS,
        { key: 'noun_groups', label: 'Building precise noun phrases', query: 'noun group expanded noun phrase modifier qualifier' },
        OBJECTIVE_STANCE
    ],
    data_commentary: [
        { key: 'trends', label: 'Describing trends and comparisons', query: 'describing trends comparisons figures tables data' },
        { key: 'data_claims', label: 'Linking data to claims', query: 'interpreting data linking evidence to claims location statement' },
        { key: 'hedging', label: 'Matching claims to the evidence', query: 'hedging modality qualifying claims tentative language' },
        SENTENCE_OPENINGS
    ],
    problem_solution: [
        { key: 'problem', label: 'Stating a problem and its cause', query: 'stating a problem cause and effect situation problem', overlapsStage: /problem/i },
        { key: 'solution', label: 'Proposing and justifying a solution', query: 'proposing a solution justification response', overlapsStage: /solution|response/i },
        { key: 'evaluation', label: 'Evaluating a solution', query: 'evaluating a solution advantages limitations', overlapsStage: /evaluat/i },
        LINKING
    ],
    default: [SENTENCE_OPENINGS, LINKING, OBJECTIVE_STANCE]
};

/** Requirements about length, format, timing or conditions: no reading teaches them. */
const LOGISTICS: RegExp[] = [
    /\b\d+\s*[–-]\s*\d+\s*(words?|pages?)\b/i,
    /\b\d+\s*(words?|pages?)\b/i,
    // Phrases, not bare words: "due to", "length of" and "format:" also appear in skill requirements.
    /\b(word count|word limit|page limit|font size|double[- ]spaced|margins?|file type|deadline)\b/i,
    /\.(docx|pdf)\b/i,
    /^\s*length\s*:/i,
    /\bdue\b(?!\s+to\b)/i,
    /\b(submit|upload)\b/i,
    /\bno (outside )?sources? (are )?required\b/i,
    /\b(individually|in groups?|in class|typed afterwards)\b/i
];

const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'into', 'its', 'it', 'that', 'this', 'your', 'you', 'for', 'in', 'on', 'with', 'as', 'by', 'their', 'main', 'write']);

function contentWords(text: string): string[] {
    return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * isTeachableRequirement - whether course materials could teach this requirement.
 *
 * Logistics, a list of the stages, and a restatement of the task are not topics a
 * reading teaches, so they would only ever show as uncovered.
 *
 * @param requirement - One approved task requirement
 * @param stageLabels - Approved stage labels
 * @param task - The profile's task statement
 * @returns False for logistics, stage repeats and task restatements
 */
export function isTeachableRequirement(requirement: string, stageLabels: string[], task: string): boolean {
    if (LOGISTICS.some((pattern) => pattern.test(requirement))) return false;
    const lower = requirement.toLowerCase();
    if (stageLabels.filter((label) => lower.includes(label.toLowerCase())).length >= 2) return false;
    const words = contentWords(requirement);
    const taskWords = new Set(contentWords(task));
    if (words.length && words.filter((word) => taskWords.has(word)).length / words.length >= 0.6) return false;
    return true;
}

/** First clause of a requirement, at most 60 characters, for a coverage label. */
function requirementLabel(requirement: string): string {
    const clause = requirement.split(/[.;:]/)[0].trim();
    return clause.length > 60 ? `${clause.slice(0, 59).trimEnd()}…` : clause;
}

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
    const stageLabels = profile.stages.map((stage) => stage.label);
    const genreKey = (profile.genreId ?? '') in GENRE_LANGUAGE_FUNCTIONS && profile.genreId !== 'default'
        ? profile.genreId as WritingFoundedGenreId
        : 'default';
    const functions = GENRE_LANGUAGE_FUNCTIONS[genreKey];
    const needs: RetrievalNeed[] = [
        { id: 'genre', kind: 'genre', label: profile.genreLabel, query: `${profile.genreLabel}: ${profile.purpose}`.slice(0, 280) },
        ...profile.stages.slice(0, 5).map((stage) => ({
            id: `stage:${stage.id}`,
            kind: 'stage' as const,
            label: stage.label,
            query: `${profile.genreLabel} ${stage.label}: ${stage.purpose}`.slice(0, 280),
            stageId: stage.id
        })),
        ...profile.taskRequirements
            .filter((requirement) => isTeachableRequirement(requirement, stageLabels, profile.task ?? ''))
            .slice(0, 3)
            .map((requirement, index) => ({
                id: `task:${index}`,
                kind: 'task_requirement' as const,
                label: requirementLabel(requirement),
                query: requirement.slice(0, 280)
            })),
        ...functions
            .filter((entry) => !entry.overlapsStage || !stageLabels.some((label) => entry.overlapsStage!.test(label)))
            .map((entry) => ({ id: `function:${entry.key}`, kind: 'language_function' as const, label: entry.label, query: entry.query }))
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
