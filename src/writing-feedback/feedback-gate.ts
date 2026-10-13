/**
 * Feedback gate — decides between local feedback and rewrite-level feedback
 *
 * A text that is the wrong genre, or leaves most required stages weak or missing, needs a
 * rewrite. Local annotations on it would tell the student those sentences can stay, so
 * they are held back. A text missing one or two sections still gets standard feedback,
 * whose first goal names them. The rule is code, not prompt, so staff can predict it and the
 * eval can pin it.
 *
 * @author: @rdschrs
 * @date: 2026-09-28
 * @version: 1.1.0
 * @description: Pure gate decision, effective mode, rewrite goal, and student-facing comment filter.
 */

import type { FeedbackMode, GlobalRevision, RevisionGoal, TextDiagnosis, WritingFeedbackResult, WritingSflContextProfile } from './contracts';

/** Share of required stages that must be weak or missing before rewrite feedback applies. */
export const REWRITE_STAGE_SHARE = 0.75;

/**
 * resolveGateDecision - the mode a fresh run gets from its diagnosis.
 *
 * Rewrite feedback is for a text that misses the point: the wrong genre, or at least
 * `REWRITE_STAGE_SHARE` of the required stages weak or missing. Only `required === true`
 * counts, so an absent flag can never push a student into rewrite feedback; a profile
 * with no required stage rewrites only on a genre mismatch.
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
 * resolveRewriteGoal - the one goal printed with rewrite feedback.
 *
 * New runs store it on the rewrite block, so staff can switch any submission to rewrite
 * feedback. Runs stored before that wrote it as the first goal only when gated to
 * rewrite; a standard run's first goal is about local revision and is never shown as one.
 *
 * @param feedback - Student-facing result (staff edits applied)
 * @param globalRevision - Resolved rewrite block, if any
 * @returns The rewrite goal, or undefined when the run has none
 */
export function resolveRewriteGoal(
    feedback: Pick<WritingFeedbackResult, 'gateDecision' | 'revisionGoals'>,
    globalRevision?: Pick<GlobalRevision, 'rewriteGoal'>
): RevisionGoal | undefined {
    if (globalRevision?.rewriteGoal) return globalRevision.rewriteGoal;
    return feedback.gateDecision === 'global_revision' ? feedback.revisionGoals[0] : undefined;
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
