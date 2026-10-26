/**
 * Analysis mode — which feedback analysis the whole deployment runs
 *
 * `general` (the default) grounds every assignment's feedback in its approved rubric, its
 * assignment details, the instructor's materials, and published course material. `sfl` restores
 * the SFL-founded pipeline: genre and register profile, text diagnosis, SFL analyzer, rewrite
 * gate, assignment-type question, and the technical lens. The SFL code stays in place and is only
 * switched off, so it can be tried again by setting `WRITING_FEEDBACK_ANALYSIS_MODE=sfl`.
 *
 * @author: @rdschrs
 * @date: 2026-10-26
 * @version: 1.0.0
 * @description: Reads the global analysis-mode switch and applies the mode-dependent profile gate.
 */

import type { WritingFeedbackAnalysisMode, WritingSflContextProfile } from '../contracts';
import { requireCompleteSflProfile } from '../language/sfl-analysis';

export type { WritingFeedbackAnalysisMode };

/** Environment variable holding the switch. */
export const ANALYSIS_MODE_ENV = 'WRITING_FEEDBACK_ANALYSIS_MODE';

/**
 * getAnalysisMode - reads the deployment-wide analysis mode.
 *
 * Only the exact value `sfl` turns the SFL pipeline on; anything else, including an unset or
 * misspelled value, runs the general analysis, so a typo can never re-enable SFL by accident.
 *
 * @param env - Environment to read; defaults to the process environment
 * @returns `'sfl'` when explicitly requested, otherwise `'general'`
 */
export function getAnalysisMode(env: NodeJS.ProcessEnv = process.env): WritingFeedbackAnalysisMode {
    return env[ANALYSIS_MODE_ENV]?.trim().toLowerCase() === 'sfl' ? 'sfl' : 'general';
}

/**
 * requireAnalysisProfile - the writing-profile gate for approval and generation.
 *
 * The SFL genre and register profile is required only in `sfl` mode. In `general` mode the
 * approved rubric and assignment material are enough, and an absent or partial profile is ignored.
 *
 * @param profile - The writing rubric's stored SFL profile, if any
 * @param mode - Active analysis mode
 * @throws Error the existing SFL profile messages, only in `sfl` mode
 */
export function requireAnalysisProfile(
    profile: WritingSflContextProfile | undefined,
    mode: WritingFeedbackAnalysisMode = getAnalysisMode()
): void {
    if (mode === 'sfl') requireCompleteSflProfile(profile);
}

/**
 * carriedSflProfile - the stored SFL profile a general-mode draft save keeps.
 *
 * In general mode the profile is inactive data. It is never edited or validated, so a blank
 * default profile cannot block a save, but it is kept so SFL can be switched back on. Its
 * glossary is dropped because those terms now live in the rubric's `courseTerms`.
 *
 * @param stored - The profile on the draft or approved rubric being replaced
 * @returns The profile without `approvedGlossaryTerms`, or undefined when there is none
 */
export function carriedSflProfile(stored: WritingSflContextProfile | undefined): WritingSflContextProfile | undefined {
    if (!stored) return undefined;
    const { approvedGlossaryTerms: _moved, ...rest } = stored;
    return rest;
}
