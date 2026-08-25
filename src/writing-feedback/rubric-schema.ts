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

/** One grid cell. Ranges are inclusive and may collapse to a single value. */
const rubricCell = z.object({
    min: z.number().finite().min(0).max(1000),
    max: z.number().finite().min(0).max(1000),
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
 * requireCompleteRubricCells - approval gate ensuring every weighted criterion
 * carries a points range and a descriptor at every performance level.
 *
 * Draft saves are never blocked by this — staff may save a partially filled
 * grid at any time. Only approval, which is what lets a rubric reach the
 * feedback engine, requires the grid to be complete.
 *
 * @param draft - Candidate rubric draft about to be approved
 * @throws Error naming how many cells are missing a range or a description
 */
export function requireCompleteRubricCells(draft: WritingRubricDefinition): void {
    let missing = 0;
    draft.criteria.forEach((criterion) => {
        if (criterion.points === undefined || criterion.points <= 0) return;
        draft.levels.forEach((level) => {
            const band = resolveBand(criterion, level.id, draft.levels);
            if (!band || !band.descriptor?.trim()) missing += 1;
        });
    });
    if (missing > 0) {
        throw new Error(
            `Complete the rubric grid before approving: ${missing} cell${missing === 1 ? '' : 's'} still need${missing === 1 ? 's' : ''} a points range or a description.`
        );
    }
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

/**
 * Staff edits to an imported Canvas rubric's cells.
 *
 * Structure is deliberately absent from this contract. Rows and ratings are addressed by their
 * Canvas ids and reconciled against what is stored, so this payload cannot add, remove, or
 * reorder a row — the rubric's shape belongs to Canvas, and the instructor changes it there.
 * Only cell text travels here.
 *
 * Cell text may be blank: a Canvas rubric routinely leaves `long_description` empty, and
 * rejecting that would make otherwise valid rubrics uneditable.
 */
export const canvasRubricEditInputSchema = z.object({
    rows: z.array(z.object({
        canvasCriterionId: z.string().trim().min(1).max(120),
        label: z.string().trim().min(1).max(200),
        description: z.string().trim().max(1200),
        ratings: z.array(z.object({
            canvasRatingId: z.string().trim().min(1).max(120),
            label: z.string().trim().max(200),
            description: z.string().trim().max(1200)
        })).max(20)
    })).min(1).max(40)
});

export type CanvasRubricEditInput = z.infer<typeof canvasRubricEditInputSchema>;
