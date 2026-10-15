/**
 * @fileoverview Pure model for the review page's "Off-genre or missing sections" card: whether
 * the run has a whole-text problem, its copy, held-back annotations, and when a course reading
 * is shown.
 */

import type { AnchoredComment, FeedbackRun } from './writing-feedback-shared.js';

/** Share of required sections weak or missing that trips the gate; mirrors the server gate in feedback-gate.ts. */
const MISSING_SECTIONS_SHARE = 0.75;

const STATUS_LABELS: Record<string, string> = { present: 'Present', weak: 'Weak', missing: 'Missing' };

/** Chip tone per status, matching the annotation chips (status is also spelled out). */
const STATUS_TONES: Record<string, 'green' | 'amber' | 'red' | 'neutral'> = { Present: 'green', Weak: 'amber', Missing: 'red' };

/**
 * hasWholeTextProblem - whether the run's gate found a whole-text problem.
 *
 * Mirrors the server's `hasWholeTextProblem`: decided once, at generation.
 *
 * @param run - Latest linguistic run, if any
 * @returns True when the stored gate decision is `global_revision`
 */
export function hasWholeTextProblem(run: FeedbackRun | null): boolean {
    return (run?.gateDecision ?? run?.result.gateDecision) === 'global_revision';
}

/**
 * resolveHoldBack - whether annotations are held back on the review page.
 *
 * @param run - Latest linguistic run
 * @param staffChoice - The saved or unsaved staff choice, if staff changed the checkbox
 * @returns The staff choice when set, else whether the run has a whole-text problem
 */
export function resolveHoldBack(run: FeedbackRun | null, staffChoice?: boolean): boolean {
    return staffChoice ?? hasWholeTextProblem(run);
}

/**
 * sectionCheckView - staff-facing section check content.
 *
 * Shown only for a whole-text problem; without one, staff see nothing, since a missing
 * section already reaches the student through the first revision goal.
 *
 * @param run - Latest linguistic run
 * @param stages - Approved profile stages
 * @returns Section check content, or null when the run has no diagnosis or no whole-text problem
 */
export function sectionCheckView(
    run: FeedbackRun,
    stages: Array<{ id: string; label: string; required?: boolean }>
): { headline: string; stageChips: Array<{ label: string; status: string; required: boolean; tone: 'green' | 'amber' | 'red' | 'neutral' }>; warnings: string[]; rationale: string } | null {
    const diagnosis = run.textDiagnosis;
    if (!diagnosis || !hasWholeTextProblem(run)) return null;
    const byId = new Map(diagnosis.stages.map((stage) => [stage.stageId, stage.status]));
    // Two things trip the gate, alone or together, and the fixed headline names which did.
    const required = stages.filter((stage) => stage.required === true);
    const failing = required.filter((stage) => byId.has(stage.id) && byId.get(stage.id) !== 'present');
    const offGenre = diagnosis.genreFit === 'mismatch';
    const missingSections = required.length > 0 && failing.length / required.length >= MISSING_SECTIONS_SHARE;
    const headline = offGenre && missingSections
        ? 'This submission is off-genre and missing several sections.'
        : offGenre
            ? 'This submission is off-genre.'
            : 'This submission is missing several sections.';
    const warnings: string[] = [];
    // Missing genre material is a course-setup gap, shown once in the rubric page's coverage
    // report rather than on every submission.
    if (run.flags?.includes('relevance_unavailable')) warnings.push('Course materials could not be checked for this run, so no readings were cited.');
    return {
        headline,
        stageChips: stages.map((stage) => {
            const status = STATUS_LABELS[byId.get(stage.id) ?? ''] ?? 'Not checked';
            return { label: stage.label, status, required: stage.required === true, tone: STATUS_TONES[status] ?? 'neutral' };
        }),
        warnings,
        rationale: diagnosis.rationale
    };
}

/**
 * splitHeldBack - comments shown normally versus held back.
 *
 * @param comments - Working set for the writing lens
 * @param holdBack - Effective hold-back (the inverse of "Include annotations")
 * @returns Visible and held-back comments; nothing is held back when the box is unticked
 */
export function splitHeldBack(comments: AnchoredComment[], holdBack: boolean): { visible: AnchoredComment[]; heldBack: AnchoredComment[] } {
    if (!holdBack) return { visible: comments, heldBack: [] };
    return {
        visible: comments.filter((comment) => !isHeldBack(comment)),
        heldBack: comments.filter(isHeldBack)
    };
}

/**
 * isHeldBack - whether a comment stays back while annotations are held back.
 *
 * Same rule as the server: a model seed stays back until staff release it (`heldBack: false`).
 *
 * @param comment - Annotation
 * @returns True when flagged, or a model seed staff have not released
 */
export function isHeldBack(comment: AnchoredComment): boolean {
    return comment.heldBack === true || (comment.origin === 'model_seed' && comment.heldBack !== false);
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
