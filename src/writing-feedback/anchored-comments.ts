/**
 * Anchored comments — exact-span feedback over verified student text
 *
 * Comments anchor to exact spans of the staff-verified submission text. Offsets are the
 * anchor source of truth; the stored quote is a checksum re-validated on every save so a
 * re-verified transcript can never silently mis-anchor staff feedback. Seeds are derived
 * from the immutable model run at read time and only persisted with a staff revision.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.0.0
 * @description: Validates, seeds, and stale-checks exact UTF-16 comment anchors.
 */

import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { AnchoredComment, SflFinding, WritingFeedbackRun, WritingRubricDefinition } from './contracts';

/** Built-in rubric criterion to SFL function fallback for legacy/no-trace runs. */
const CRITERION_FUNCTION_TAG: Partial<Record<string, AnchoredComment['functionTag']>> = {
    organization: 'organizational',
    content: 'content',
    interpersonal_positioning: 'interpersonal'
};

const httpUrl = z.string().trim().max(500).url().refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    { message: 'Course material links must use http or https' }
);

const courseMaterialMentionSchema = z.object({
    id: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(240),
    courseId: z.string().trim().min(1).max(120).optional(),
    topicOrWeekId: z.string().trim().min(1).max(120).optional(),
    topicOrWeekTitle: z.string().trim().min(1).max(160).optional(),
    itemId: z.string().trim().min(1).max(120).optional(),
    itemTitle: z.string().trim().min(1).max(160).optional(),
    materialId: z.string().trim().min(1).max(120).optional(),
    materialName: z.string().trim().min(1).max(160).optional(),
    version: z.string().trim().min(1).max(120).optional()
});

const glossarySnapshotSchema = z.object({
    id: z.string().trim().min(1).max(120),
    term: z.string().trim().min(1).max(80),
    definition: z.string().trim().min(1).max(600),
    version: z.number().int().min(1)
});

/**
 * Validated API shape for one staff-editable anchored comment.
 *
 * The 4,000-character quote allowance supports deliberate staff selections; generated
 * evidence is constrained separately to 280 characters before it becomes a seed.
 */
export const anchoredCommentInputSchema = z.object({
    id: z.string().trim().min(1).max(64),
    // Stored comments predate lab-report annotation and carry no lens; they are all
    // linguistic, so the default backfills them at read time rather than by migration.
    lens: z.enum(['linguistic', 'technical']).default('linguistic'),
    criterion: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/).optional(),
    // This checksum may represent a deliberate staff span; generated seeds are capped upstream.
    quote: z.string().min(1).max(4000),
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().min(1),
    comment: z.string().trim().min(1).max(2000),
    howToImprove: z.string().trim().min(1).max(2000).optional(),
    courseMaterialLink: httpUrl.optional(),
    courseMaterialTitle: z.string().trim().min(1).max(240).optional(),
    courseMaterialId: z.string().trim().min(1).max(120).optional(),
    courseMaterialMention: courseMaterialMentionSchema.optional(),
    glossaryDefinition: z.object({
        term: z.string().trim().min(1).max(80),
        definition: z.string().trim().min(1).max(600)
    }).optional(),
    glossaryEntryId: z.string().trim().min(1).max(120).optional(),
    glossarySnapshot: glossarySnapshotSchema.optional(),
    origin: z.enum(['model_seed', 'staff']),
    functionTag: z.enum(['content', 'interpersonal', 'organizational']).optional(),
    levelTag: z.enum(['text', 'section', 'clause_word']).optional(),
    priority: z.enum(['high', 'medium', 'low']).optional()
}).refine((comment) => comment.endOffset > comment.startOffset, {
    message: 'Comment anchor must cover a non-empty span',
    path: ['endOffset']
});

/** Bounded working set accepted when a staff revision snapshots its comments. */
export const anchoredCommentsInputSchema = z.array(anchoredCommentInputSchema).max(50);

/** Validated request payload for one anchored comment. */
export type AnchoredCommentInput = z.infer<typeof anchoredCommentInputSchema>;

/** A stored comment plus a read-time flag marking anchors invalidated by re-verification. */
export type AnchoredCommentWithState = AnchoredComment & { stale?: boolean };

/**
 * Which criterion owns each finding cited by more than one of them.
 *
 * A finding seeds one annotation (D-111), so when two criteria cite the same one, something
 * has to choose. Rubric order alone handed an interpersonal finding to Content because
 * Content is listed first, leaving Interpersonal Positioning — where the point belongs —
 * with nothing to show. The criterion whose own metafunction matches the finding wins, and
 * rubric order still decides when none matches or several do.
 *
 * @param result - Writer output whose criteria cite validated findings
 * @param findingsById - Validated analyzer findings by id
 * @param functionTags - Criterion id to its rubric metafunction
 * @returns Finding id to the criterion id that keeps its annotation
 */
function resolveFindingOwners(
    result: WritingFeedbackRun['result'],
    findingsById: Map<string, SflFinding>,
    functionTags: Map<string, AnchoredComment['functionTag'] | undefined>
): Map<string, string> {
    const owners = new Map<string, string>();
    for (const criterion of result.criteria) {
        const criterionFunction = functionTags.get(criterion.criterion)
            ?? CRITERION_FUNCTION_TAG[criterion.criterion];
        for (const evidence of criterion.evidence) {
            for (const findingId of evidence.sflFindingIds ?? []) {
                const finding = findingsById.get(findingId);
                if (!finding) continue;
                const currentOwner = owners.get(findingId);
                if (currentOwner === undefined) {
                    owners.set(findingId, criterion.criterion);
                    continue;
                }
                // Only an agreeing criterion takes a finding off the one that claimed it first.
                const ownerFunction = functionTags.get(currentOwner) ?? CRITERION_FUNCTION_TAG[currentOwner];
                if (finding.primaryFunction === criterionFunction && finding.primaryFunction !== ownerFunction) {
                    owners.set(findingId, criterion.criterion);
                }
            }
        }
    }
    return owners;
}

/** Similarity at or above which two annotations are treated as the same point. */
const DUPLICATE_COMMENT_SIMILARITY = 0.8;

/** Lowercased word set, punctuation and spacing discarded, for comparing two comments. */
function commentTokens(text: string): Set<string> {
    return new Set(text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean));
}

/**
 * Jaccard overlap of two annotation word sets.
 *
 * Word-set rather than string equality: the writer restates a point in slightly different
 * words as often as it repeats one verbatim, and both read to a student as two separate
 * pieces of advice about the same problem.
 */
function commentSimilarity(left: Set<string>, right: Set<string>): number {
    if (!left.size || !right.size) return 0;
    let shared = 0;
    left.forEach((token) => { if (right.has(token)) shared += 1; });
    return shared / (left.size + right.size - shared);
}

function anchorMatches(comment: AnchoredComment, verifiedText: string): boolean {
    // JavaScript string offsets are UTF-16 code units, matching the browser selection API.
    return comment.endOffset <= verifiedText.length
        && verifiedText.slice(comment.startOffset, comment.endOffset) === comment.quote;
}

/**
 * Derive an initial working set of comments from a model run's evidence quotes.
 * Quotes were validated as exact substrings at generation time; any quote no longer
 * present (defensive) is skipped. Duplicate quotes advance past the previous match so
 * each seed anchors a distinct span.
 *
 * @param run - Immutable model result containing validated evidence quotes
 * @param verifiedText - Current staff-verified anchor source
 * @returns Up to 50 transient model seeds in rubric order
 */
export function seedCommentsFromRun(
    run: WritingFeedbackRun,
    verifiedText: string,
    rubric?: WritingRubricDefinition
): AnchoredComment[] {
    const seeds: AnchoredComment[] = [];
    const seededTokens: Array<Set<string>> = [];
    const seededFindingIds = new Set<string>();
    const searchFrom = new Map<string, number>();
    const functionTags = new Map(rubric?.criteria.map((criterion) => [criterion.id, criterion.functionTag]) ?? []);
    const findingsById = new Map((run.sflAnalysis?.findings ?? []).map((finding) => [finding.id, finding]));
    const findingOwners = resolveFindingOwners(run.result, findingsById, functionTags);
    for (const criterion of run.result.criteria) {
        for (const evidence of criterion.evidence) {
            // Keyed per criterion, not per quote: two criteria may legitimately cite the
            // same passage, and a shared cursor made the second lookup start past it and
            // drop that annotation. rubric-schema.ts constrains criterion ids to values
            // that cannot contain a newline, so criterion/quote pairs cannot collide.
            const searchKey = `${criterion.criterion}\n${evidence.quote}`;
            const from = searchFrom.get(searchKey) ?? 0;
            const start = verifiedText.indexOf(evidence.quote, from);
            if (start === -1) continue;
            // Advance within the criterion so repeated evidence maps to successive occurrences.
            searchFrom.set(searchKey, start + evidence.quote.length);
            // Function and language level come from the validated analyzer trace linked by
            // the writer's evidence ids. They are descriptive provenance, not a staff grade.
            const linkedFindings = (evidence.sflFindingIds ?? [])
                .map((findingId) => findingsById.get(findingId))
                .filter((finding): finding is SflFinding => Boolean(finding));
            const criterionFunctionTag = functionTags.get(criterion.criterion)
                ?? CRITERION_FUNCTION_TAG[criterion.criterion];
            // Evidence may link up to six findings. Prefer one that agrees with the
            // criterion's own metafunction so the label does not depend on writer ordering.
            const agreeingFinding = linkedFindings
                .find((finding) => finding.primaryFunction === criterionFunctionTag);
            const linkedFinding = agreeingFinding ?? linkedFindings[0];
            // CRITERION_FUNCTION_TAG is the legacy/no-trace fallback its own comment
            // describes. A run whose analyzer trace exists but did not reach this passage
            // gets no label rather than the criterion's metafunction asserted as the
            // passage's: an unlabelled annotation is honest, a wrong one is not.
            //
            // Only an agreeing finding supplies the chip. Labelling a Content annotation
            // "Interpersonal" because that is what its linked finding happened to be reads
            // to staff as a defect, and the criterion it sits under already says more than
            // a contradicting chip does. The language level still comes from the finding,
            // which describes the passage rather than classifying it.
            const functionTag = agreeingFinding?.primaryFunction
                ?? (run.sflAnalysis ? undefined : criterionFunctionTag);
            // Drop a point already made, wherever it was made. The writer is instructed not
            // to repeat itself across criteria; this keeps a run that did anyway from
            // reaching the student as two annotations saying one thing. Rubric order wins,
            // and the criterion explanations still carry the full per-criterion picture.
            //
            // One validated finding is one point about the text, so a finding already
            // seeded is the decisive test: a live run linked finding F4 to both the content
            // and the interpersonal criterion, and the two rationales it wrote about that
            // one sentence were worded too differently for the text comparison to catch.
            const findingIds = linkedFindings.map((finding) => finding.id);
            // A finding cited by two criteria belongs to the one its metafunction matches.
            if (findingIds.some((findingId) => findingOwners.get(findingId) !== criterion.criterion)) continue;
            if (findingIds.some((findingId) => seededFindingIds.has(findingId))) continue;
            // The text comparison still applies on top, covering runs with no analyzer
            // trace and two distinct findings the writer wrote up the same way.
            const tokens = commentTokens(evidence.rationale);
            if (seededTokens.some((seeded) => commentSimilarity(seeded, tokens) >= DUPLICATE_COMMENT_SIMILARITY)) continue;
            findingIds.forEach((findingId) => seededFindingIds.add(findingId));
            seededTokens.push(tokens);
            seeds.push({
                id: randomUUID(),
                // A seed belongs to the lens that produced the run it came from. Runs written
                // before two-lens generation carry no lens and are linguistic, matching the
                // default the stored-comment validator applies.
                lens: run.lens ?? 'linguistic',
                criterion: criterion.criterion,
                quote: evidence.quote,
                startOffset: start,
                endOffset: start + evidence.quote.length,
                comment: evidence.rationale,
                ...(evidence.revisionGuidance?.trim() ? { howToImprove: evidence.revisionGuidance.trim() } : {}),
                origin: 'model_seed',
                ...(evidence.courseMaterialMention ? { courseMaterialMention: evidence.courseMaterialMention } : {}),
                ...(evidence.glossaryEntryId ? { glossaryEntryId: evidence.glossaryEntryId } : {}),
                ...(evidence.glossarySnapshot ? { glossarySnapshot: evidence.glossarySnapshot } : {}),
                ...(functionTag ? { functionTag } : {}),
                ...(linkedFinding ? { levelTag: linkedFinding.languageLevel } : {})
            });
            if (seeds.length >= 50) return seeds;
        }
    }
    return seeds;
}

/**
 * stampCommentAuthors — applies server-authoritative comment attribution.
 *
 * The client never controls `authorName`: any client-sent value is discarded by
 * the input schema, and this stamp re-derives attribution on every save. A
 * comment keeps the author recorded in the previous snapshot; a comment new to
 * this save is attributed to the saving staff member when staff-authored.
 * Model seeds stay unattributed so student output never implies a person wrote them.
 *
 * @param comments - Incoming complete comment snapshot for one revision
 * @param previousComments - Comments from the newest prior revision that stored any
 * @param staffName - Display name of the staff member saving this revision
 * @returns Cloned comments with authoritative `authorName` values
 */
export function stampCommentAuthors(
    comments: AnchoredComment[],
    previousComments: AnchoredComment[],
    staffName?: string
): AnchoredComment[] {
    const previousAuthor = new Map(previousComments.map((comment) => [comment.id, comment.authorName]));
    return comments.map((comment) => {
        // Drop any client-supplied attribution before re-deriving it.
        const { authorName: _clientAuthor, ...rest } = comment;
        const carried = previousAuthor.has(comment.id)
            ? previousAuthor.get(comment.id)
            : comment.origin === 'staff' ? staffName?.trim() || undefined : undefined;
        return carried ? { ...rest, authorName: carried } : rest;
    });
}

/**
 * validateAnchoredComments — rejects comments whose offsets and quote checksum diverge.
 *
 * @param comments - Complete comment snapshot proposed for a staff revision
 * @param verifiedText - Current staff-verified anchor source
 * @throws Error when any span is out of bounds or no longer matches exactly
 */
export function validateAnchoredComments(comments: AnchoredComment[], verifiedText: string): void {
    for (const comment of comments) {
        if (!anchorMatches(comment, verifiedText)) {
            throw new Error('Feedback comments no longer match the verified text');
        }
    }
}

/**
 * withStaleFlags — decorates invalidated anchors for staff review without persisting changes.
 *
 * @param comments - Stored comments from a prior review revision
 * @param verifiedText - Current staff-verified anchor source
 * @returns Cloned comments with `stale` set only where the checksum fails
 */
export function withStaleFlags(comments: AnchoredComment[], verifiedText: string): AnchoredCommentWithState[] {
    return comments.map((comment) => (
        anchorMatches(comment, verifiedText) ? { ...comment } : { ...comment, stale: true }
    ));
}
