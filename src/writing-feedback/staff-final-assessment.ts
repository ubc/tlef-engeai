/**
 * Staff-final rubric assessment — validates the only grade eligible for release
 *
 * Model-selected levels remain a suggestion. This module accepts the points a
 * staff reviewer actually entered, binds them to the immutable rubric version,
 * and computes totals on the server so neither the browser nor Canvas can
 * redefine the grading contract. A partial set of points may be saved as a draft
 * while grading is under way; only a complete assessment can be approved or released.
 */

import { z } from 'zod';
import type {
    StaffAssessmentDraft,
    StaffCriterionAssessment,
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

/** Browser payload for grades saved before every criterion has one. Same shape; fewer criteria allowed. */
export const staffAssessmentDraftInputSchema = staffFinalAssessmentInputSchema;

export type StaffAssessmentDraftInput = z.infer<typeof staffAssessmentDraftInputSchema>;

/** Why approval was refused for a gradable rubric without a complete, current grade. */
export const APPROVAL_REQUIRES_GRADE_MESSAGE = 'Enter and save a final grade for every rubric criterion before approval';

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
 * readScores - validates entered points against one rubric version, without requiring all of them.
 *
 * @param input - Criterion points as entered
 * @param rubric - Rubric version the points were entered against
 * @returns Rounded points by criterion id, only for criteria the input names
 * @throws Error for an ungradable rubric, a stale version, a duplicate or unknown criterion,
 *   or points above a criterion's maximum
 */
function readScores(input: StaffFinalAssessmentInput, rubric: WritingRubricDefinition): Map<string, number> {
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
        const criterion = rubric.criteria.find((item) => item.id === entry.criterionId);
        if (!criterion) {
            throw new Error('Final grading contains a criterion outside the approved rubric');
        }
        if (entry.points > criterion.points!) {
            throw new Error(`Final grade for "${criterion.label}" exceeds its ${criterion.points}-point maximum`);
        }
        received.set(entry.criterionId, Math.round(entry.points * 100) / 100);
    }
    return received;
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
    const received = readScores(input, rubric);
    const criteria: StaffCriterionAssessment[] = rubric.criteria.map((criterion) => {
        const points = received.get(criterion.id);
        if (points === undefined) {
            throw new Error('Final grading requires a score for every rubric criterion');
        }
        return { criterionId: criterion.id, points };
    });

    return {
        lens,
        rubricVersion: rubric.version,
        criteria,
        totalPoints: Math.round(criteria.reduce((sum, entry) => sum + entry.points, 0) * 100) / 100,
        maxPoints: totalRubricPoints(rubric.criteria)
    };
}

/**
 * buildStaffAssessmentDraft - validates grades saved partway through grading.
 *
 * Each score is held to the same rules as a final assessment, but criteria may be missing.
 * A draft carries no totals and is never read by approval, the PDF or release.
 *
 * @param input - Points for the criteria graded so far
 * @param rubric - Rubric version the points were entered against
 * @param lens - Lens that rubric belongs to
 * @returns The draft, in rubric criterion order
 * @throws Error under the same conditions as {@link buildStaffFinalAssessment}, except a missing criterion
 */
export function buildStaffAssessmentDraft(
    input: StaffAssessmentDraftInput,
    rubric: WritingRubricDefinition,
    lens: WritingFeedbackLens = 'linguistic'
): StaffAssessmentDraft {
    const received = readScores(input, rubric);
    return {
        lens,
        rubricVersion: rubric.version,
        criteria: rubric.criteria
            .filter((criterion) => received.has(criterion.id))
            .map((criterion) => ({ criterionId: criterion.id, points: received.get(criterion.id)! }))
    };
}
