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

const compactText = z.string().trim().min(1).max(1200);
const optionalCompactText = z.string().trim().max(1200).optional();
const slug = z.string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, 'Use a lowercase slug with letters, numbers, and underscores');

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
        id: slug,
        label: z.string().trim().min(1).max(80),
        description: compactText,
        functionTag: z.enum(['content', 'interpersonal', 'organizational']).optional(),
        sflDimension: optionalCompactText
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
});

/** Validated instructor payload used to create a new rubric draft version. */
export type WritingRubricDraftInput = z.infer<typeof writingRubricDraftInputSchema>;

/**
 * assertApprovedRubricIdsStable - prevents structural id changes after first approval.
 *
 * New assignments may freely shape their initial draft. Once approved, the exact
 * criterion and level id sets remain stable across versions so stored joins cannot
 * be reinterpreted; labels, descriptions, ordering, and points remain editable.
 *
 * @param approved - Current approved rubric, or a still-unapproved initial draft
 * @param input - Validated next draft payload
 * @throws Error when an approved id is added, removed, or renamed
 */
export function assertApprovedRubricIdsStable(
    approved: WritingRubricDefinition,
    input: WritingRubricDraftInput
): void {
    if (approved.status !== 'approved') return;
    const sameSet = (current: string[], next: string[]): boolean =>
        current.length === next.length && current.every((id) => next.includes(id));
    if (!sameSet(approved.criteria.map((criterion) => criterion.id), input.criteria.map((criterion) => criterion.id))) {
        throw new Error('Approved criterion ids cannot be added, removed, or renamed');
    }
    if (!sameSet(approved.levels.map((level) => level.id), input.levels.map((level) => level.id))) {
        throw new Error('Approved performance-level ids cannot be added, removed, or renamed');
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
