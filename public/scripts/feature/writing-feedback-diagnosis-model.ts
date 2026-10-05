/**
 * @fileoverview Pure model for the review page's whole-text diagnosis: banner copy,
 * effective mode, held-back annotations, and when a course reading is shown.
 */

import type { AnchoredComment, FeedbackMode, FeedbackRun } from './writing-feedback-shared.js';

const GENRE_NAMES: Record<string, string> = {
    descriptive_report: 'a descriptive report',
    data_commentary: 'a data commentary',
    problem_solution: 'a problem-solution text',
    explanation: 'an explanation',
    recount: 'a recount',
    procedure: 'a procedure',
    argument: 'an argument',
    personal_response: 'a personal response',
    unclear: 'no recognizable genre'
};

const STATUS_LABELS: Record<string, string> = { present: 'Present', weak: 'Weak', missing: 'Missing' };

/** Chip tone per status, matching the annotation chips (status is also spelled out). */
const STATUS_TONES: Record<string, 'green' | 'amber' | 'red' | 'neutral'> = { Present: 'green', Weak: 'amber', Missing: 'red' };

/**
 * resolvedMode - the effective mode on the review page.
 *
 * @param run - Latest linguistic run, if any
 * @param override - Staff override from the latest revision, or the unsaved toggle state
 * @returns Override, else the run's gate decision, else standard
 */
export function resolvedMode(run: FeedbackRun | null, override?: FeedbackMode): FeedbackMode {
    return override ?? run?.gateDecision ?? run?.result.gateDecision ?? 'standard';
}

/**
 * diagnosisBannerView - staff-facing banner content.
 *
 * @param run - Latest linguistic run
 * @param stages - Approved profile stages
 * @param mode - Effective mode
 * @returns Banner content, or null when the run has no diagnosis
 */
export function diagnosisBannerView(
    run: FeedbackRun,
    stages: Array<{ id: string; label: string; required?: boolean }>,
    mode: FeedbackMode
): { headline: string; stageChips: Array<{ label: string; status: string; required: boolean; tone: 'green' | 'amber' | 'red' | 'neutral' }>; warnings: string[]; rationale: string; toggleLabel: string } | null {
    const diagnosis = run.textDiagnosis;
    if (!diagnosis) return null;
    const genre = GENRE_NAMES[diagnosis.realizedGenre] ?? diagnosis.realizedGenre;
    const headline = diagnosis.genreFit === 'mismatch'
        ? `This reads as ${genre}, not the target genre.`
        : diagnosis.genreFit === 'partial'
            ? 'This does the target genre\'s work, but a stage is weak.'
            : 'This does the target genre\'s work.';
    const byId = new Map(diagnosis.stages.map((stage) => [stage.stageId, stage.status]));
    const warnings: string[] = [];
    if (run.flags?.includes('no_genre_material')) warnings.push('No course material on this genre was found, so the diagnosis relies on general knowledge.');
    if (run.flags?.includes('relevance_unavailable')) warnings.push('Course materials could not be checked for this run, so no readings were cited.');
    return {
        headline,
        stageChips: stages.map((stage) => {
            const status = STATUS_LABELS[byId.get(stage.id) ?? ''] ?? 'Not checked';
            return { label: stage.label, status, required: stage.required === true, tone: STATUS_TONES[status] ?? 'neutral' };
        }),
        warnings,
        rationale: diagnosis.rationale,
        toggleLabel: mode === 'global_revision' ? 'Switch to standard feedback' : 'Switch to rewrite feedback only'
    };
}

/**
 * splitHeldBack - comments shown normally versus held back, under a mode.
 *
 * @param comments - Working set for the writing lens
 * @param mode - Effective mode
 * @returns Visible and held-back comments; nothing is held back in standard mode
 */
export function splitHeldBack(comments: AnchoredComment[], mode: FeedbackMode): { visible: AnchoredComment[]; heldBack: AnchoredComment[] } {
    if (mode !== 'global_revision') return { visible: comments, heldBack: [] };
    // Same rule as the server: a model seed stays back until staff release it (heldBack: false).
    const held = (comment: AnchoredComment) => comment.heldBack === true || (comment.origin === 'model_seed' && comment.heldBack !== false);
    return {
        visible: comments.filter((comment) => !held(comment)),
        heldBack: comments.filter(held)
    };
}

/**
 * releaseHeldBack - lets one held-back comment reach the student.
 *
 * @param comments - Working set
 * @param id - Comment to release
 * @returns A new working set with that comment's flag cleared
 */
export function releaseHeldBack(comments: AnchoredComment[], id: string): AnchoredComment[] {
    return comments.map((comment) => comment.id === id ? { ...comment, heldBack: false } : comment);
}

/**
 * readAgainLabel - the course reading an annotation names, if any.
 *
 * A model citation counts only when its excerpt was judged to support the passage; a title
 * or legacy link staff typed always counts, whoever created the annotation.
 *
 * @param comment - Annotation
 * @param run - Latest run, for the supported-excerpt list
 * @returns The label to print beside the annotation, or undefined for none
 */
export function readAgainLabel(comment: AnchoredComment, run: FeedbackRun | null): string | undefined {
    const mentionSupported = Boolean(comment.courseMaterialMention) && (
        comment.origin === 'staff'
        || !run?.supportedExcerptIds // run stored before evidence-backed citations
        || Boolean(comment.supportingExcerptId && run.supportedExcerptIds.includes(comment.supportingExcerptId))
    );
    return (mentionSupported ? comment.courseMaterialMention?.label : undefined)
        ?? comment.courseMaterialTitle
        ?? comment.courseMaterialLink;
}

/**
 * showReadAgain - whether an annotation shows a course reading.
 *
 * @param comment - Annotation
 * @param run - Latest run, for the supported-excerpt list
 * @returns True when {@link readAgainLabel} names a reading
 */
export function showReadAgain(comment: AnchoredComment, run: FeedbackRun | null): boolean {
    return readAgainLabel(comment, run) !== undefined;
}
