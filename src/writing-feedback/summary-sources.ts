/**
 * Summary sources — which annotations and staff edits a lens's summary uses (D-125–D-127)
 *
 * Pure rules shared by submission detail, the student PDF, and the release payload, so the
 * review page, the PDF, and Canvas always agree on what the student is told.
 *
 * @author: @rdschrs
 * @date: 2026-09-13
 * @version: 1.0.0
 * @description: Comment resolution, edit binding, evidence-from-annotations, redraft runs.
 */

import type {
    AnchoredComment,
    CriterionFeedback,
    RevisionGoal,
    RubricEvidence,
    StaffFinalAssessment,
    StaffReviewRevision,
    StaffSummaryEdit,
    WritingAssignment,
    WritingFeedbackLens,
    WritingFeedbackResult,
    WritingFeedbackRun,
    WritingRubricCriterion,
    WritingRubricDefinition
} from './contracts';
import { selectRubric } from './rubric-lens';
import { earnedLevelFor } from './rubric-bands';
import { isStaffAssessed } from './criterion-assessment';

/** Prompt version stamped on every redraft run. */
export const SUMMARY_REDRAFT_PROMPT_VERSION = 'summary-redraft-v1.1.0';

/** Validated writer-only redraft output for one lens. */
export interface SummaryRedraftOutput {
    criteria: Array<{ criterion: string; suggestedLevel: string; explanation: string; confidence: number }>;
    strengths: string[];
    revisionGoals: RevisionGoal[];
}

/**
 * commentsForLens - the comments that belong to one lens.
 *
 * @param comments - Mixed-lens comments; a missing lens means linguistic
 * @param lens - Lens to keep
 * @returns Comments for that lens, in their original order
 */
export function commentsForLens(comments: AnchoredComment[], lens: WritingFeedbackLens): AnchoredComment[] {
    return comments.filter((comment) => (comment.lens ?? 'linguistic') === lens);
}

/**
 * resolveLensComments - picks the annotation set a lens currently has.
 *
 * A redraft run carries the annotations it was drafted from; a saved revision carries the
 * annotations staff saved. Whichever is newer wins. Seeds apply only when neither exists.
 *
 * @param lens - Lens being resolved
 * @param sources - Latest revision with comments, latest run for the lens, and model seeds
 * @param options - Whether model seeds may be used (review page yes, student PDF no)
 * @returns The comments and where they came from
 */
export function resolveLensComments(
    lens: WritingFeedbackLens,
    sources: {
        revision?: { comments: AnchoredComment[]; createdAt: Date | string };
        run: WritingFeedbackRun | null;
        seeds: AnchoredComment[];
    },
    options: { includeSeeds: boolean }
): { comments: AnchoredComment[]; origin: 'redraft' | 'revision' | 'seed' | 'none' } {
    const redraftComments = sources.run?.sourceComments;
    const redraftIsNewer = Boolean(redraftComments) && (
        !sources.revision
        || new Date(sources.run!.createdAt).getTime() > new Date(sources.revision.createdAt).getTime()
    );
    if (redraftComments && redraftIsNewer) return { comments: redraftComments, origin: 'redraft' };
    if (sources.revision) return { comments: commentsForLens(sources.revision.comments, lens), origin: 'revision' };
    if (options.includeSeeds) return { comments: sources.seeds, origin: 'seed' };
    return { comments: [], origin: 'none' };
}

/**
 * bindingSummaryEdit - the staff summary edit that still applies to a lens.
 *
 * @param review - Latest staff revision
 * @param lens - Lens being rendered
 * @param runId - Latest run id for that lens
 * @returns The edit when it was written against that exact run
 */
export function bindingSummaryEdit(
    review: StaffReviewRevision | undefined,
    lens: WritingFeedbackLens,
    runId: string | undefined
): StaffSummaryEdit | undefined {
    if (!runId) return undefined;
    return review?.summaryEdits?.find((edit) => edit.lens === lens && edit.feedbackRunId === runId);
}

/**
 * bindingStudentFeedback - the staff "Priority revision goals" text that still applies.
 *
 * @param review - Latest staff revision
 * @param linguisticRunId - Latest linguistic run id
 * @returns The text when the revision was saved against that run
 */
export function bindingStudentFeedback(
    review: StaffReviewRevision | undefined,
    linguisticRunId: string | undefined
): string | undefined {
    return review && linguisticRunId && review.feedbackRunId === linguisticRunId
        ? review.studentFeedback
        : undefined;
}

/**
 * evidenceFromComments - one criterion's evidence, taken from its final annotations (D-127).
 *
 * @param comments - Comments for one lens
 * @param criterion - Criterion id
 * @returns Evidence items in text order
 */
export function evidenceFromComments(comments: AnchoredComment[], criterion: string): RubricEvidence[] {
    return comments
        .filter((comment) => comment.criterion === criterion)
        .sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset)
        .map((comment) => ({
            quote: comment.quote,
            rationale: comment.comment,
            ...(comment.howToImprove?.trim() ? { revisionGuidance: comment.howToImprove.trim() } : {}),
            ...(comment.courseMaterialMention ? { courseMaterialMention: comment.courseMaterialMention } : {}),
            ...(comment.glossaryEntryId ? { glossaryEntryId: comment.glossaryEntryId } : {}),
            ...(comment.glossarySnapshot ? { glossarySnapshot: comment.glossarySnapshot } : {})
        }));
}

/**
 * staffAuthoredCriterion - the rendered row for a criterion the model never saw.
 *
 * A staff-assessed criterion is absent from the run, so there is no row to overlay the
 * staff explanation onto. It is built here instead, from the three things staff supply:
 * the explanation they wrote, the points they entered, and any passages they annotated.
 *
 * Returns nothing until staff have written the explanation -- the honest state of a
 * criterion nobody has assessed yet, and what keeps a half-finished row out of the staff
 * preview. The level is separate: it comes from the staff points, which exist only on the
 * lens that carries the grade. A lab report's writing rubric is generated but graded on
 * its technical rubric, so a staff-assessed criterion there has written feedback and no
 * points to name a rating with. It renders without one rather than disappearing, which is
 * what it used to do while approval still required staff to write it.
 *
 * @param criterion - Staff-assessed criterion from the run's rubric
 * @param rubric - Rubric version the run was generated against
 * @param explanation - Staff-written feedback for this criterion, if any
 * @param points - Staff-entered points for this criterion, if any
 * @param comments - Final annotations for the lens, when they govern evidence
 * @returns The rendered row, or undefined while staff have not finished it
 */
function staffAuthoredCriterion(
    criterion: WritingRubricCriterion,
    rubric: WritingRubricDefinition,
    explanation: string | undefined,
    points: number | undefined,
    comments: AnchoredComment[] | undefined
): CriterionFeedback | undefined {
    if (!explanation?.trim()) return undefined;
    const level = points === undefined ? undefined : earnedLevelFor(criterion, rubric.levels, points);
    return {
        criterion: criterion.id,
        ...(level ? { suggestedLevel: level.id } : {}),
        evidence: comments ? evidenceFromComments(comments, criterion.id) : [],
        explanation: explanation.trim(),
        // Inert for a staff row: nothing here is a model draft. Never student-facing.
        confidence: 1
    };
}

/**
 * applySummaryToResult - the result a student document is rendered from.
 *
 * Iterates the rubric rather than the run, because the two no longer hold the same
 * criteria: a staff-assessed criterion is excluded from generation, so mapping the run
 * alone would drop it from the student's document without failing anywhere. Rows the
 * rubric no longer carries are kept at the end, so feedback generated against an earlier
 * version still renders in full.
 *
 * @param result - Latest run result for the lens
 * @param input - Final comments for the lens (omit to keep model evidence), a bound edit,
 *   the rubric the run was generated against (pass `undefined` only when that version is
 *   no longer stored), and the staff grade supplying staff-assessed levels
 * @returns A new result; the stored run is never mutated
 */
export function applySummaryToResult(
    result: WritingFeedbackResult,
    input: {
        comments?: AnchoredComment[];
        edit?: StaffSummaryEdit;
        rubric: WritingRubricDefinition | undefined;
        assessment?: Pick<StaffFinalAssessment, 'criteria'>;
    }
): WritingFeedbackResult {
    const explanations = new Map(
        (input.edit?.criterionExplanations ?? []).map((item) => [item.criterion, item.explanation])
    );
    const points = new Map(
        (input.assessment?.criteria ?? []).map((item) => [item.criterionId, item.points])
    );
    const fromRun = (criterion: CriterionFeedback): CriterionFeedback => ({
        ...criterion,
        explanation: explanations.get(criterion.criterion) ?? criterion.explanation,
        evidence: input.comments ? evidenceFromComments(input.comments, criterion.criterion) : criterion.evidence
    });

    const criteria: CriterionFeedback[] = [];
    if (input.rubric) {
        const rubric = input.rubric;
        rubric.criteria.forEach((criterion) => {
            if (isStaffAssessed(criterion)) {
                const authored = staffAuthoredCriterion(
                    criterion,
                    rubric,
                    explanations.get(criterion.id),
                    points.get(criterion.id),
                    input.comments
                );
                if (authored) criteria.push(authored);
                return;
            }
            const generated = result.criteria.find((item) => item.criterion === criterion.id);
            if (generated) criteria.push(fromRun(generated));
        });
    }
    // Criteria the rubric no longer lists, and every criterion when the rubric version is
    // gone, keeping this a superset of what mapping the run alone produced.
    const rendered = new Set(criteria.map((criterion) => criterion.criterion));
    result.criteria.forEach((criterion) => {
        if (!rendered.has(criterion.criterion)) criteria.push(fromRun(criterion));
    });

    return {
        ...result,
        strengths: input.edit ? [...input.edit.strengths] : result.strengths,
        criteria
    };
}

/**
 * rubricForRun - the rubric version a run was generated against.
 *
 * @param assignment - Assignment owning the run
 * @param run - Run whose rubric is wanted
 * @returns The matching current or historical rubric, if still stored
 */
export function rubricForRun(assignment: WritingAssignment, run: WritingFeedbackRun): WritingRubricDefinition | undefined {
    const selected = selectRubric(assignment, run.lens ?? 'linguistic');
    return [selected.approved, selected.draft, ...(selected.history ?? [])]
        .find((rubric): rubric is WritingRubricDefinition => rubric?.version === run.rubricVersion);
}

/**
 * buildRedraftRun - the immutable run record for a summary redraft.
 *
 * Staff-only provenance is copied from the previous run so readings, analyzer trace and
 * flags stay attached. Evidence is built from the annotations, never from the model.
 *
 * @param previous - Latest run the redraft replaces (may carry a Mongo `_id`, which is dropped)
 * @param output - Validated redraft output
 * @param comments - Final annotations for the lens
 * @param annotationsFingerprint - `fingerprintAnnotations(comments)`
 * @param engineName - Constructor name of the engine that produced the output
 * @returns Insertable run fields
 */
export function buildRedraftRun(
    previous: WritingFeedbackRun,
    output: SummaryRedraftOutput,
    comments: AnchoredComment[],
    annotationsFingerprint: string,
    engineName: string
): Omit<WritingFeedbackRun, 'id' | 'createdAt'> {
    const {
        _id: _mongoId,
        id: previousId,
        createdAt: _createdAt,
        result,
        modelMetadata: _modelMetadata,
        redraftOfRunId: _redraftOf,
        sourceComments: _source,
        annotationsFingerprint: _fingerprint,
        ...provenance
    } = previous as WritingFeedbackRun & { _id?: unknown };
    return {
        ...provenance,
        result: {
            ...(result.schemaVersion ? { schemaVersion: result.schemaVersion } : {}),
            criteria: output.criteria.map((criterion) => ({
                criterion: criterion.criterion,
                suggestedLevel: criterion.suggestedLevel,
                explanation: criterion.explanation,
                confidence: criterion.confidence,
                evidence: evidenceFromComments(comments, criterion.criterion)
            })),
            strengths: output.strengths,
            revisionGoals: output.revisionGoals,
            internalFlags: result.internalFlags,
            ...(result.courseMaterialMentions ? { courseMaterialMentions: result.courseMaterialMentions } : {})
        },
        modelMetadata: { engine: engineName, promptVersion: SUMMARY_REDRAFT_PROMPT_VERSION },
        redraftOfRunId: previousId,
        sourceComments: comments,
        annotationsFingerprint
    };
}
