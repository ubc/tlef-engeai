/**
 * Feedback gate — decides whether a text has a whole-text problem
 *
 * A text that is the wrong genre, or leaves most required stages weak or missing, has a
 * whole-text problem: its feedback opens with an overall message and a restructuring goal,
 * and its annotations are held back by default, since local comments would suggest those
 * sentences can stay. A text missing one or two sections has no whole-text problem; its
 * first goal names them. The rule is code, not prompt, so staff can predict it and the
 * eval can pin it.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 2.0.0
 * @description: Pure gate decision, whole-text flag, hold-back resolution, and student-facing comment filter.
 */

import type { FeedbackMode, TextDiagnosis, WritingSflContextProfile } from '../contracts';

/** Share of required stages that must be weak or missing before the text has a whole-text problem. */
export const REWRITE_STAGE_SHARE = 0.75;

/**
 * resolveGateDecision - whether a fresh run has a whole-text problem, from its diagnosis.
 *
 * A whole-text problem is a text that misses the point: the wrong genre, or at least
 * `REWRITE_STAGE_SHARE` of the required stages weak or missing. Only `required === true`
 * counts, so an absent flag can never create a whole-text problem; a profile with no
 * required stage has one only on a genre mismatch.
 *
 * @param diagnosis - Validated whole-text diagnosis
 * @param profile - Approved genre profile whose stages the diagnosis covers
 * @returns `global_revision` on a mismatch or when most required stages fail, else `standard`
 */
export function resolveGateDecision(diagnosis: TextDiagnosis, profile: WritingSflContextProfile): FeedbackMode {
    if (diagnosis.genreFit === 'mismatch') return 'global_revision';
    const required = new Set(profile.stages.filter((stage) => stage.required === true).map((stage) => stage.id));
    if (!required.size) return 'standard';
    const failing = new Set(diagnosis.stages
        .filter((stage) => required.has(stage.stageId) && stage.status !== 'present')
        .map((stage) => stage.stageId));
    return failing.size / required.size >= REWRITE_STAGE_SHARE ? 'global_revision' : 'standard';
}

/**
 * hasWholeTextProblem - whether a run's gate found a whole-text problem.
 *
 * Decided once, at generation. It adds the overall message and the restructuring first goal
 * to the feedback, shows staff the section check, and holds annotations back by default.
 *
 * @param run - Run or result carrying the stored gate decision
 * @returns True when the gate decision is `global_revision`
 */
export function hasWholeTextProblem(run: { gateDecision?: FeedbackMode; result?: { gateDecision?: FeedbackMode } }): boolean {
    return (run.gateDecision ?? run.result?.gateDecision) === 'global_revision';
}

/**
 * resolveHoldBack - whether annotations are held back from the student.
 *
 * Staff save a choice only when they change the checkbox, so an absent choice means the
 * default: held back exactly when the gate found a whole-text problem.
 *
 * @param wholeTextProblem - The run's gate result
 * @param staffChoice - The latest explicit staff choice for this generation, if any
 * @returns The staff choice when set, else the gate result
 */
export function resolveHoldBack(wholeTextProblem: boolean, staffChoice?: boolean): boolean {
    return staffChoice ?? wholeTextProblem;
}

/**
 * studentFacingComments - the annotations a student may see.
 *
 * While annotations are held back, a model seed stays back unless staff released it
 * (`heldBack: false`); staff-written comments always count.
 *
 * @param comments - Working set of annotations
 * @param holdBack - Effective hold-back (the inverse of the staff "Include annotations" checkbox)
 * @returns Every comment when not held back; staff comments and released seeds otherwise
 */
export function studentFacingComments<T extends { heldBack?: boolean; origin?: string }>(comments: T[], holdBack: boolean): T[] {
    return holdBack ? comments.filter((comment) => !isHeldBack(comment)) : comments;
}

/**
 * isHeldBack - whether a comment is withheld while annotations are held back.
 *
 * @param comment - Annotation
 * @returns True when flagged, or a model seed staff have not released
 */
export function isHeldBack(comment: { heldBack?: boolean; origin?: string }): boolean {
    return comment.heldBack === true || (comment.origin === 'model_seed' && comment.heldBack !== false);
}
