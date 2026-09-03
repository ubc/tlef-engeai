/**
 * Staff-final rubric assessment — validates the only grade eligible for release
 *
 * Model-selected levels remain a suggestion. This module accepts the points a
 * staff reviewer actually entered, binds them to the immutable rubric version,
 * and computes totals on the server so neither the browser nor Canvas can
 * redefine the grading contract.
 */

import { z } from 'zod';
import type {
    StaffFinalAssessment,
    WritingAssignment,
    WritingFeedbackLens,
    WritingRubricDefinition
} from './contracts';
import { totalRubricPoints } from './rubric-bands';

const criterionId = z.string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);

/** Browser payload accepted when an immutable staff revision is saved. */
export const staffFinalAssessmentInputSchema = z.object({
    rubricVersion: z.number().int().min(1),
    criteria: z.array(z.object({
        criterionId,
        points: z.number().finite().min(0).max(1000)
    })).min(1).max(10)
});

export type StaffFinalAssessmentInput = z.infer<typeof staffFinalAssessmentInputSchema>;

/**
 * gradedLensFor - which of an assignment's rubrics carries its grade.
 *
 * A lab report is graded on the technical rubric: the department's evaluation form, or the
 * instructor's own Canvas rubric imported in its place, is where the marks come from. Its
 * writing feedback is still generated, annotated and printed — it simply carries no grade.
 *
 * @param assignment - Assignment whose gradeable lens is being resolved
 * @returns The lens whose rubric staff grade against
 */
export function gradedLensFor(assignment: WritingAssignment): WritingFeedbackLens {
    return assignment.isLabReport ? 'technical' : 'linguistic';
}

/** Whether this rubric has a complete numeric scale that staff can grade. */
export function rubricSupportsStaffAssessment(rubric: WritingRubricDefinition): boolean {
    return rubric.criteria.length > 0
        && rubric.criteria.every((criterion) => criterion.points !== undefined && criterion.points > 0)
        && totalRubricPoints(rubric.criteria) > 0;
}

/**
 * Validates one complete assessment and returns server-computed totals.
 *
 * Every weighted criterion appears exactly once. Scores may be fractional but
 * are rounded to two decimals to keep PDF and Canvas values stable.
 */
export function buildStaffFinalAssessment(
    input: StaffFinalAssessmentInput,
    rubric: WritingRubricDefinition,
    lens: WritingFeedbackLens = 'linguistic'
): StaffFinalAssessment {
    if (!rubricSupportsStaffAssessment(rubric)) {
        throw new Error('Final grading requires points on every rubric criterion');
    }
    if (input.rubricVersion !== rubric.version) {
        throw new Error('Final grading uses an outdated rubric version');
    }

    const received = new Map<string, number>();
    for (const entry of input.criteria) {
        if (received.has(entry.criterionId)) {
            throw new Error('Final grading contains a duplicate rubric criterion');
        }
        received.set(entry.criterionId, entry.points);
    }

    const criteria = rubric.criteria.map((criterion) => {
        const points = received.get(criterion.id);
        if (points === undefined) {
            throw new Error('Final grading requires a score for every rubric criterion');
        }
        if (points > criterion.points!) {
            throw new Error(`Final grade for "${criterion.label}" exceeds its ${criterion.points}-point maximum`);
        }
        return { criterionId: criterion.id, points: Math.round(points * 100) / 100 };
    });

    if (received.size !== criteria.length) {
        throw new Error('Final grading contains a criterion outside the approved rubric');
    }

    return {
        lens,
        rubricVersion: rubric.version,
        criteria,
        totalPoints: Math.round(criteria.reduce((sum, entry) => sum + entry.points, 0) * 100) / 100,
        maxPoints: totalRubricPoints(rubric.criteria)
    };
}

