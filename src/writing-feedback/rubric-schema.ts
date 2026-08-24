/**
 * Rubric schema — complete A2 drafts, approval promotion, and grade mapping
 *
 * Validates instructor-authored rubric drafts against the fixed four-criterion and
 * four-level A2 contract. Builders create new versioned values rather than mutating
 * approved rubrics, and numeric mapping remains unavailable unless every level has points.
 *
 * @author: @rdschrs
 * @date: 2026-07-13
 * @version: 1.0.0
 * @description: Validates and promotes versioned Writing Feedback rubric definitions.
 */

import { z } from 'zod';
import type { A2Level, WritingRubricDefinition } from './contracts';

const criterionIds = ['organization', 'content', 'interpersonal_positioning', 'task_constraints'] as const;
const levelIds = ['emerging', 'developing', 'competent', 'strong'] as const;
const compactText = z.string().trim().min(1).max(1200);

/** Instructor-editable rubric payload required before a draft can be saved or approved. */
export const writingRubricDraftInputSchema = z.object({
    title: z.string().trim().min(1).max(160),
    task: compactText,
    audience: compactText,
    purpose: compactText,
    constraints: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
    learningOutcomes: z.array(z.string().trim().min(1).max(400)).min(1).max(12),
    gradingIntent: compactText,
    criteria: z.array(z.object({
        id: z.enum(criterionIds),
        label: z.string().trim().min(1).max(80),
        description: compactText,
        sflDimension: compactText
    })).length(4),
    levels: z.array(z.object({
        id: z.enum(levelIds),
        label: z.string().trim().min(1).max(60),
        description: compactText,
        points: z.number().finite().min(0).max(1000).optional()
    })).length(4)
}).superRefine((rubric, ctx) => {
    // Fixed lengths do not prevent duplicate IDs, so enforce complete unique sets.
    if (new Set(rubric.criteria.map((criterion) => criterion.id)).size !== criterionIds.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Rubric must contain each supported criterion exactly once', path: ['criteria'] });
    }
    if (new Set(rubric.levels.map((level) => level.id)).size !== levelIds.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Rubric must contain each supported level exactly once', path: ['levels'] });
    }
    // Partial point scales would create invented/ambiguous numeric grades.
    const pointCount = rubric.levels.filter((level) => level.points !== undefined).length;
    if (pointCount > 0 && pointCount !== levelIds.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide points for every performance level or leave every level ordinal',
            path: ['levels']
        });
    }
});

/** Validated instructor payload used to create a new rubric draft version. */
export type WritingRubricDraftInput = z.infer<typeof writingRubricDraftInputSchema>;

/**
 * buildRubricDraft — creates a new editable rubric version from validated input.
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
 * approveRubricDraft — promotes a draft value with explicit approval provenance.
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
 * gradeMappingFromApprovedRubric — derives points only from a complete level scale.
 *
 * Callers supply the approved definition; this helper checks point completeness rather
 * than changing or independently validating rubric status.
 *
 * @param rubric - Instructor-approved rubric definition
 * @returns Level-to-points mapping, or undefined when any level remains ordinal
 */
export function gradeMappingFromApprovedRubric(
    rubric: WritingRubricDefinition
): Partial<Record<A2Level, number>> | undefined {
    const mapping: Partial<Record<A2Level, number>> = {};
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
