/**
 * Feedback gate — decides between local feedback and rewrite-level feedback
 *
 * A text that is the wrong genre, or leaves out a stage staff marked required, needs a
 * rewrite. Local annotations on it would tell the student those sentences can stay, so
 * they are held back. The rule is code, not prompt, so staff can predict it and the
 * eval can pin it.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 1.0.0
 * @description: Pure gate decision, effective mode, and student-facing comment filter.
 */

import type { FeedbackMode, TextDiagnosis, WritingSflContextProfile } from './contracts';

/**
 * resolveGateDecision - the mode a fresh run gets from its diagnosis.
 *
 * Only `required === true` counts: a stage stored without the flag is treated as
 * optional, so an absent value can never hide a student's local feedback.
 *
 * @param diagnosis - Validated whole-text diagnosis
 * @param profile - Approved genre profile whose stages the diagnosis covers
 * @returns `global_revision` on a mismatch or a missing required stage, else `standard`
 */
export function resolveGateDecision(diagnosis: TextDiagnosis, profile: WritingSflContextProfile): FeedbackMode {
    if (diagnosis.genreFit === 'mismatch') return 'global_revision';
    const required = new Set(profile.stages.filter((stage) => stage.required === true).map((stage) => stage.id));
    return diagnosis.stages.some((stage) => required.has(stage.stageId) && stage.status === 'missing')
        ? 'global_revision'
        : 'standard';
}

/**
 * effectiveMode - the mode staff and students actually get.
 *
 * @param gateDecision - The run's gate decision; absent on runs stored before the gate
 * @param modeOverride - The latest review revision's staff override, if any
 * @returns The override when set, else the gate decision, else `standard`
 */
export function effectiveMode(gateDecision?: FeedbackMode, modeOverride?: FeedbackMode): FeedbackMode {
    return modeOverride ?? gateDecision ?? 'standard';
}

/**
 * studentFacingComments - the annotations a student may see under a mode.
 *
 * In global mode a model seed is held back unless staff released it (`heldBack: false`):
 * seeds of a standard-gated run carry no flag, and forcing rewrite mode must still keep
 * them from the student. Staff comments always count.
 *
 * @param comments - Working set of annotations
 * @param mode - Effective mode
 * @returns Every comment in standard mode; staff comments and released seeds in global mode
 */
export function studentFacingComments<T extends { heldBack?: boolean; origin?: string }>(comments: T[], mode: FeedbackMode): T[] {
    return mode === 'global_revision' ? comments.filter((comment) => !isHeldBack(comment)) : comments;
}

/**
 * isHeldBack - whether a comment is withheld while rewrite feedback applies.
 *
 * @param comment - Annotation
 * @returns True when flagged, or a model seed staff have not released
 */
export function isHeldBack(comment: { heldBack?: boolean; origin?: string }): boolean {
    return comment.heldBack === true || (comment.origin === 'model_seed' && comment.heldBack !== false);
}
