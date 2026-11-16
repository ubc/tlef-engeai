/**
 * Analysis mode — which feedback analysis one assignment uses
 *
 * Staff choose it per assignment on the rubric page. `general` grounds feedback in the approved
 * rubric, the "Describe the writing" profile, the assignment details, the instructor's
 * materials, and published course material. `sfl` runs the SFL-founded pipeline: text
 * diagnosis, SFL analyzer, and rewrite gate (and, for a lab report created before assignments
 * had one rubric, the technical engine on its technical rubric).
 *
 * New assignments start in `general`. An assignment with no stored mode was created before the
 * choice existed and keeps the SFL analysis it has always had.
 *
 * @author: @rdschrs
 * @date: 2026-10-26
 * @version: 2.0.0
 * @description: Resolves an assignment's analysis mode and applies the mode-dependent profile gate.
 */

import type { WritingAssignment, WritingFeedbackAnalysisMode, WritingSflContextProfile } from '../contracts';
import { requireCompleteSflProfile } from '../language/sfl-analysis';

export type { WritingFeedbackAnalysisMode };

/** The mode a newly created assignment starts in. */
export const DEFAULT_ANALYSIS_MODE: WritingFeedbackAnalysisMode = 'general';

/**
 * isAnalysisMode - whether a value names an analysis mode.
 *
 * @param value - Untrusted input, such as a request body field
 * @returns True for `general` or `sfl`
 */
export function isAnalysisMode(value: unknown): value is WritingFeedbackAnalysisMode {
    return value === 'general' || value === 'sfl';
}

/**
 * analysisModeOf - the analysis one assignment uses.
 *
 * @param assignment - Assignment, or undefined when there is none
 * @returns Its stored mode; `sfl` when none is stored, because it predates the choice
 */
export function analysisModeOf(assignment: Pick<WritingAssignment, 'analysisMode'> | undefined): WritingFeedbackAnalysisMode {
    return assignment?.analysisMode === 'general' ? 'general' : 'sfl';
}

/**
 * requireAnalysisProfile - the writing-profile gate at generation.
 *
 * Approval requires a complete "Describe the writing" profile in both modes. Generation checks
 * it again only in `sfl` mode, whose pipeline cannot run without it; general analysis uses the
 * profile when present, so a rubric approved without one still generates.
 *
 * @param profile - The writing rubric's stored SFL profile, if any
 * @param mode - The assignment's analysis mode
 * @throws Error the existing SFL profile messages, only in `sfl` mode
 */
export function requireAnalysisProfile(
    profile: WritingSflContextProfile | undefined,
    mode: WritingFeedbackAnalysisMode
): void {
    if (mode === 'sfl') requireCompleteSflProfile(profile);
}

/**
 * draftForValidation - the form of an imported or auto-filled draft the draft schema should check.
 *
 * Staff finish the "Describe the writing" profile on the rubric page and approval checks it, so
 * a blank default one must not fail an import. Validate this value and save the original, which
 * keeps the profile.
 *
 * @param draft - Draft about to be validated
 * @returns A copy without the profile; the draft itself is unchanged
 */
export function draftForValidation<T extends object>(draft: T): T {
    return { ...draft, sflContext: undefined };
}
