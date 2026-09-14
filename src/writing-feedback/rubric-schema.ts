/**
 * Rubric schema — assignment-specific drafts, approval, and grade mapping
 *
 * Validates bounded instructor-authored criteria and performance levels without
 * embedding a course or assignment taxonomy. Builders create versioned values,
 * and numeric mapping remains unavailable unless every level has points.
 *
 * @author: @rdschrs
 * @date: 2026-07-13
 * @version: 2.0.0
 * @description: Validates and promotes assignment-specific Writing Feedback rubrics.
 */

import { z } from 'zod';
import type {
    WritingLevelId,
    WritingRubricDefinition
} from './contracts';
import { resolveBand } from './rubric-bands';

const compactText = z.string().trim().min(1).max(1200);
const optionalCompactText = z.string().trim().max(1200).optional();
const slug = z.string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, 'Use a lowercase slug with letters, numbers, and underscores');

const sflStageSchema = z.object({
    id: slug,
    label: z.string().trim().min(1).max(120),
    purpose: z.string().trim().min(1).max(600),
    required: z.boolean().optional(),
    order: z.number().int().min(1).max(50).optional()
});

/** Staff-reviewed genre/register profile saved with the linguistic rubric draft. */
export const writingSflContextProfileInputSchema = z.object({
    genreId: z.string().trim().min(1).max(120).optional(),
    genreLabel: z.string().trim().min(1).max(160),
    genreState: z.enum(['declared', 'staff_confirmed', 'custom', 'composite', 'needs_staff_input']),
    task: compactText,
    purpose: compactText,
    audience: compactText,
    field: compactText,
    tenor: compactText,
    mode: compactText,
    actualEvaluator: compactText,
    productionConditions: compactText,
    stages: z.array(sflStageSchema).min(1).max(20),
    embeddedGenres: z.array(z.string().trim().min(1).max(160)).max(12),
    taskRequirements: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
    learningOutcomes: z.array(z.string().trim().min(1).max(400)).min(1).max(20),
    approvedGlossaryTerms: z.array(z.string().trim().min(1).max(80)).max(30).optional()
});

/**
 * Fewest ratings a criterion may offer. A row shorter than this cannot separate work at
 * all, whatever the rest of the grid does.
 */
export const MIN_RATINGS_PER_CRITERION = 2;

/** One grid cell. Ranges are inclusive and may collapse to a single value. */
const rubricCell = z.object({
    min: z.number().finite().min(0).max(1000),
    max: z.number().finite().min(0).max(1000),
    // Canvas names its ratings per row, so the name belongs to the cell rather than to
    // the column. Optional: a hand-authored grid may carry none, and the level's own
    // label stands in wherever a cell has not been named.
    label: z.string().trim().max(60).optional(),
    descriptor: z.string().trim().max(400).optional()
});

/** Instructor-editable rubric payload required before a draft can be saved or approved. */
export const writingRubricDraftInputSchema = z.object({
    title: z.string().trim().min(1).max(160),
    task: compactText,
    audience: compactText,
    purpose: compactText,
    constraints: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
    learningOutcomes: z.array(z.string().trim().min(1).max(400)).min(1).max(12),
    gradingIntent: compactText,
    /** Optional instructor-approved lab handout context supplied to the technical lens. */
    labContext: z.string().trim().max(12000).optional(),
    /** Staff-reviewed genre/register profile used by the V2 linguistic pipeline. */
    sflContext: writingSflContextProfileInputSchema.optional(),
    criteria: z.array(z.object({
        id: slug,
        label: z.string().trim().min(1).max(80),
        description: compactText,
        functionTag: z.enum(['content', 'interpersonal', 'organizational']).optional(),
        sflDimension: optionalCompactText,
        points: z.number().finite().min(0).max(1000).optional(),
        cells: z.record(rubricCell).optional()
    })).min(1).max(10),
    levels: z.array(z.object({
        id: slug,
        label: z.string().trim().min(1).max(60),
        description: compactText,
        rank: z.number().int().min(1).max(8),
        points: z.number().finite().min(0).max(1000).optional()
    })).min(2).max(8)
}).superRefine((rubric, ctx) => {
    // Stable slugs are the join keys used by runs, comments, reports, and releases.
    if (new Set(rubric.criteria.map((criterion) => criterion.id)).size !== rubric.criteria.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Criterion ids must be unique', path: ['criteria'] });
    }
    if (new Set(rubric.levels.map((level) => level.id)).size !== rubric.levels.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Performance-level ids must be unique', path: ['levels'] });
    }

    // Persist explicit contiguous order so reports never infer meaning from array position.
    const ranks = rubric.levels.map((level) => level.rank).sort((left, right) => left - right);
    if (ranks.some((rank, index) => rank !== index + 1)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Performance-level ranks must be unique and contiguous from 1',
            path: ['levels']
        });
    }

    // Partial point scales would create invented or ambiguous numeric grades.
    const pointCount = rubric.levels.filter((level) => level.points !== undefined).length;
    if (pointCount > 0 && pointCount !== rubric.levels.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide points for every performance level or leave every level ordinal',
            path: ['levels']
        });
    }

    // Bands are inclusive ranges and must key to levels this rubric actually has.
    const levelIds = new Set(rubric.levels.map((level) => level.id));
    rubric.criteria.forEach((criterion, criterionIndex) => {
        Object.entries(criterion.cells ?? {}).forEach(([levelId, cell]) => {
            if (!levelIds.has(levelId)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Criterion "${criterion.label}" has points for an unknown performance level`,
                    path: ['criteria', criterionIndex, 'cells', levelId]
                });
            }
            if (cell.min > cell.max) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `A points range cannot start above where it ends`,
                    path: ['criteria', criterionIndex, 'cells', levelId]
                });
            }
        });
    });
});

/** Validated instructor payload used to create a new rubric draft version. */
export type WritingRubricDraftInput = z.infer<typeof writingRubricDraftInputSchema>;

/**
 * assertRetiredIdsNotReused - protects the meaning of a criterion or level id.
 *
 * Criteria and levels may be added or removed at any time; each structural change
 * produces a new rubric version, and every feedback run resolves against the version
 * that produced it. What must never happen is a retired id returning with a different
 * meaning: `AnchoredComment.criterion` stores a bare id with no version, so reuse
 * would silently re-tag comments written about the old criterion.
 *
 * @param approvedVersions - Every approved rubric version for this lens, current and historical
 * @param input - Validated draft the instructor is trying to save
 * @throws Error when an id absent from the newest approved version is reintroduced
 */
export function assertRetiredIdsNotReused(
    approvedVersions: ReadonlyArray<WritingRubricDefinition>,
    input: WritingRubricDraftInput
): void {
    const approved = approvedVersions.filter((rubric) => rubric.status === 'approved');
    if (approved.length === 0) return;

    const newest = approved.reduce((latest, rubric) => (rubric.version > latest.version ? rubric : latest));
    const liveCriteria = new Set(newest.criteria.map((criterion) => criterion.id));
    const liveLevels = new Set(newest.levels.map((level) => level.id));

    // Every id ever approved but no longer live is retired and must stay retired.
    const retiredCriteria = new Set<string>();
    const retiredLevels = new Set<string>();
    approved.forEach((rubric) => {
        rubric.criteria.forEach((criterion) => {
            if (!liveCriteria.has(criterion.id)) retiredCriteria.add(criterion.id);
        });
        rubric.levels.forEach((level) => {
            if (!liveLevels.has(level.id)) retiredLevels.add(level.id);
        });
    });

    const reusedCriterion = input.criteria.find((criterion) => retiredCriteria.has(criterion.id));
    if (reusedCriterion) {
        throw new Error(`"${reusedCriterion.label}" reuses a name previously used by a removed criterion. Choose another.`);
    }
    const reusedLevel = input.levels.find((level) => retiredLevels.has(level.id));
    if (reusedLevel) {
        throw new Error(`"${reusedLevel.label}" reuses a name previously used by a removed level. Choose another.`);
    }
}

/**
 * requireCompleteRubricCells - approval gate ensuring every criterion carries
 * points and a usable run of described ratings.
 *
 * Draft saves are never blocked by this — staff may save a partially filled
 * grid at any time. Only approval, which is what lets a rubric reach the
 * feedback engine, requires the grid to be complete.
 *
 * Completeness is no longer "every cell filled". A Canvas rubric rates each row
 * independently, and a criterion that offers four ratings where the widest row
 * offers six is a rubric as its author wrote it, not an unfinished one. What is
 * required is that a row's ratings run from the weakest upwards with no gap in
 * the middle, so every score from zero to the criterion's points still lands on
 * a named rating, and that each rating given points is also described.
 *
 * The points come first because the grid cannot be read without them: a criterion
 * carrying no points contributes nothing to the mark, so an empty points cell is
 * either an oversight or a criterion that should have been deleted.
 *
 * Both checks once had holes. The cell check skipped any criterion whose points
 * were undefined or zero, which made leaving the points blank a silent way to
 * carry a wholly empty criterion past approval and in front of students; and
 * nothing checked the points cell itself, so a criterion could be approved with
 * every descriptor written and no weight to award them against.
 *
 * This does mean a purely ordinal rubric -- levels with no points anywhere --
 * cannot be approved. That is deliberate: a staff-final grade is points per
 * criterion, and there is nothing for the engine to award without them.
 *
 * @param draft - Candidate rubric draft about to be approved
 * @throws Error naming the criteria with no points, the criteria whose ratings
 *         leave a gap, the criteria offering too few ratings, and the criteria
 *         carrying a rating with no description
 */
export function requireCompleteRubricCells(draft: WritingRubricDefinition): void {
    const unweighted = draft.criteria.filter(
        (criterion) => criterion.points === undefined || criterion.points <= 0
    );
    if (unweighted.length > 0) {
        const named = unweighted.map((criterion) => `"${criterion.label}"`).join(', ');
        throw new Error(
            `Give every criterion its points before approving: ${named} ${unweighted.length === 1 ? 'has' : 'have'} none.`
        );
    }

    // Canvas rates each row independently, so a criterion may offer fewer ratings than
    // the widest one and the grid carries that shape rather than flattening it. What a
    // row may not do is leave a hole: the ratings it offers run from the weakest upwards,
    // so every score from zero to the criterion's points still lands on a named rating.
    const ordered = [...draft.levels].sort((left, right) => left.rank - right.rank);
    const ragged: string[] = [];
    const undescribed: string[] = [];
    const tooFew: string[] = [];

    draft.criteria.forEach((criterion) => {
        const bands = ordered.map((level) => resolveBand(criterion, level.id, draft.levels));
        const offered = bands.filter((band) => band !== undefined).length;
        const contiguous = bands.every((band, index) => (band === undefined) === (index >= offered));

        if (!contiguous) ragged.push(`"${criterion.label}"`);
        else if (offered < MIN_RATINGS_PER_CRITERION) tooFew.push(`"${criterion.label}"`);
        if (bands.some((band) => band !== undefined && !band.descriptor?.trim())) {
            undescribed.push(`"${criterion.label}"`);
        }
    });

    if (ragged.length > 0) {
        throw new Error(
            `Fill each criterion's ratings from the weakest upwards before approving: ${ragged.join(', ')} ${ragged.length === 1 ? 'leaves a gap' : 'leave gaps'} in the middle.`
        );
    }
    if (tooFew.length > 0) {
        throw new Error(
            `Give every criterion at least ${MIN_RATINGS_PER_CRITERION} ratings before approving: ${tooFew.join(', ')} ${tooFew.length === 1 ? 'has' : 'have'} fewer.`
        );
    }
    if (undescribed.length > 0) {
        throw new Error(
            `Describe every rating you have given points to before approving: ${undescribed.join(', ')} ${undescribed.length === 1 ? 'has' : 'have'} a rating with no description.`
        );
    }
}

/** Fields that record which version a rubric is and who touched it when, not what it says. */
const RUBRIC_METADATA_FIELDS = ['version', 'status', 'updatedAt', 'updatedBy', 'approvedAt', 'approvedBy'] as const;

/**
 * canonicalRubricContent - a stable form of a rubric value, for comparing two of them
 *
 * Object keys are sorted, and `null` and a missing value are treated alike: the database
 * driver stores an undefined-valued key as `null`, so a draft sent from the browser and
 * the approved copy read back from Mongo would otherwise never match. Array order is kept,
 * because criteria and rating order is part of what a rubric says.
 *
 * @param value - Any part of a rubric definition
 * @returns The same value with sorted keys and no null or undefined entries
 */
function canonicalRubricContent(value: unknown): unknown {
    if (value === null || value === undefined) return undefined;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonicalRubricContent);
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return Object.fromEntries(
            Object.keys(record)
                .sort()
                .map((key) => [key, canonicalRubricContent(record[key])] as const)
                .filter(([, entry]) => entry !== undefined)
        );
    }
    return value;
}

/**
 * withCellNamesResolved - the same rubric with every cell naming its rating
 *
 * A cell with no name of its own is shown in the grid, sent to the feedback prompt, and
 * printed under its level's label, so an unnamed cell and one named with that label say the
 * same thing. Rubrics approved before cells carried names have none, while the grid now fills
 * each cell's name in from its level on every save. Compared as stored, every such rubric
 * looked edited for good, however carefully staff undid their changes.
 *
 * @param rubric - Rubric whose cells may be unnamed
 * @returns A copy whose cells each carry a name, their own or their level's
 */
function withCellNamesResolved(rubric: WritingRubricDefinition): WritingRubricDefinition {
    const levelLabels = new Map((rubric.levels ?? []).map((level) => [level.id, level.label]));
    return {
        ...rubric,
        criteria: (rubric.criteria ?? []).map((criterion) => (criterion.cells
            ? {
                ...criterion,
                cells: Object.fromEntries(Object.entries(criterion.cells).map(([levelId, cell]) => [
                    levelId,
                    { ...cell, label: cell.label?.trim() || levelLabels.get(levelId) }
                ]))
            }
            : criterion))
    };
}

/**
 * rubricContentEquals - whether two rubrics say the same thing
 *
 * Compares everything a rubric says -- the shared description, the genre profile, the lab
 * handout, and every criterion, rating and band -- and ignores which version it is, its
 * status, and who changed or approved it when. An approval that changes nothing would still
 * create a new version and put every feedback draft generated with the current one out of
 * date, so the routes use this to refuse it.
 *
 * An unnamed cell is compared as if it carried its level's label, which is how every reader of
 * the rubric already treats it (see {@link withCellNamesResolved}).
 *
 * @param left - One rubric, typically the saved draft
 * @param right - The other, typically the approved rubric
 * @returns True only when both exist and their content matches
 */
export function rubricContentEquals(left?: WritingRubricDefinition, right?: WritingRubricDefinition): boolean {
    if (!left || !right) return false;
    const contentOf = (rubric: WritingRubricDefinition): Record<string, unknown> => {
        const copy: Record<string, unknown> = { ...rubric };
        RUBRIC_METADATA_FIELDS.forEach((field) => { delete copy[field]; });
        return copy;
    };
    return JSON.stringify(canonicalRubricContent(contentOf(withCellNamesResolved(left))))
        === JSON.stringify(canonicalRubricContent(contentOf(withCellNamesResolved(right))));
}

/**
 * buildRubricDraft - creates a new editable rubric version from validated input.
 *
 * @param input - Complete instructor-authored rubric payload
 * @param nextVersion - Monotonically increasing version selected by persistence
 * @param actorUserId - Internal actor responsible for the draft
 * @param now - Audit timestamp, injectable for deterministic tests
 * @returns New draft value with no implicit approval
 */
export function buildRubricDraft(
    input: WritingRubricDraftInput,
    nextVersion: number,
    actorUserId: string,
    now: Date = new Date()
): WritingRubricDefinition {
    return {
        ...input,
        version: nextVersion,
        status: 'draft',
        updatedAt: now,
        updatedBy: actorUserId
    };
}

/**
 * approveRubricDraft - promotes a draft value with explicit approval provenance.
 *
 * @param draft - Versioned definition selected for approval
 * @param actorUserId - Instructor/admin performing the approval
 * @param now - Approval timestamp, injectable for deterministic tests
 * @returns Approved copy; the input draft is not mutated
 */
export function approveRubricDraft(
    draft: WritingRubricDefinition,
    actorUserId: string,
    now: Date = new Date()
): WritingRubricDefinition {
    return {
        ...draft,
        status: 'approved',
        updatedAt: now,
        updatedBy: actorUserId,
        approvedAt: now,
        approvedBy: actorUserId
    };
}

/**
 * gradeMappingFromApprovedRubric - derives points only from a complete level scale.
 *
 * @param rubric - Instructor-approved rubric definition
 * @returns Complete level-to-points mapping, or undefined when any level remains ordinal
 */
export function gradeMappingFromApprovedRubric(
    rubric: WritingRubricDefinition
): Record<WritingLevelId, number> | undefined {
    const mapping: Record<WritingLevelId, number> = {};
    for (const level of rubric.levels) {
        if (level.points === undefined) return undefined;
        mapping[level.id] = level.points;
    }
    return mapping;
}


