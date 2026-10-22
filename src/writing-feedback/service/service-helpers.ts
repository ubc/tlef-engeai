/**
 * Writing Feedback service helpers — pure rules shared by the service and the release workflow
 *
 * Content-free failure logging, the student's view of the writing lens, the student-facing
 * document a PDF or release is built from, and the staleness checks every draft passes before
 * approval or release. Nothing here writes to Mongo or calls a model.
 *
 * @author: @rdschrs
 * @date: 2026-10-19
 * @version: 1.0.0
 * @description: Pure helpers split out of writing-feedback-service.ts.
 */

import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import type {
    AnchoredComment,
    StaffReviewRevision,
    SummarySource,
    WritingAssignment,
    WritingFeedbackLens,
    WritingFeedbackRunTrace,
    WritingFeedbackResult,
    WritingFeedbackRun,
    WritingRubricDefinition,
    WritingRelease,
    WritingPendingReplacement,
    WritingSubmission
} from '../contracts';
import type { AnchoredCommentWithState } from '../review/anchored-comments';
import { NO_REVISION_GOALS_MESSAGE } from '../generation/feedback-engine';
import { TEXT_DIAGNOSIS_FAILED_MESSAGE } from '../generation/text-diagnosis';
import { hasWholeTextProblem, resolveHoldBack, studentFacingComments } from '../generation/feedback-gate';
import { lensesForAssignment, selectRubric, rubricForVersion } from '../rubric/rubric-lens';
import { TEXT_EDITED_MESSAGE, reviewsSinceTextEdit, runPredatesTextEdit } from '../intake/transcript';
import {
    applySummaryToResult,
    bindingStudentFeedback,
    bindingSummaryEdit,
    resolveLensComments,
    rubricForRun
} from '../review/summary';

/**
 * isDuplicateKeyError - whether Mongo refused a write because a unique index already held it.
 *
 * @param error - Whatever the insert threw
 * @returns True for a duplicate-key violation, which a race is allowed to treat as success
 */
export function isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error
        && (error as { code?: unknown }).code === 11000;
}

/**
 * Fixed, developer-authored error strings this codebase throws for known validation
 * failures (never model- or student-derived text) — safe to log verbatim. Anything
 * outside this set (SDK errors, zod issues, etc.) must log only its error type.
 */
const SAFE_TO_LOG_MESSAGES = new Set([
    'An approved rubric requires performance levels',
    'Feedback referenced an unknown SFL finding',
    'Verified submission text is required',
    'An approved rubric is required before feedback generation',
    'An approved rubric requires criteria and performance levels',
    'Feedback evidence did not match the verified submission text',
    'SFL analysis reused a finding id',
    'SFL observation and interpretation must remain separate',
    'SFL analysis referenced a stage outside the approved profile',
    'SFL analysis evidence did not match the verified submission text',
    'Ferreira expectedness rules cannot be extrapolated to a custom genre',
    'SFL analysis referenced an unknown rule id',
    'SFL analysis referenced an unknown source id',
    'SFL analysis duplicated a genre-staging finding',
    'SFL analysis returned too many findings',
    NO_REVISION_GOALS_MESSAGE,
    TEXT_DIAGNOSIS_FAILED_MESSAGE
]);

/**
 * latestHoldBackChoice - the staff "Hold back annotations" choice in force for a submission.
 *
 * Staff save a choice only when they change the checkbox, and a later revision without one
 * keeps the earlier one. A choice belongs to the feedback it was made against: regenerating
 * starts from the new gate decision, while a summary redraft (same generation, see
 * `generatedAt`) keeps it.
 *
 * @param submission - Submission with its append-only reviews
 * @param run - Latest linguistic run; choices saved before its generation are ignored
 * @returns The newest applicable choice since the last text edit, if any
 */
export function latestHoldBackChoice(
    submission: Pick<WritingSubmission, 'transcriptEditedAt'> & { reviews?: StaffReviewRevision[] },
    run?: Pick<WritingFeedbackRun, 'createdAt' | 'generatedAt'> | null
): boolean | undefined {
    const since = run ? new Date(run.generatedAt ?? run.createdAt).getTime() : -Infinity;
    return [...reviewsSinceTextEdit(submission)].reverse()
        // Only a boolean is a choice; a revision saved without one may hold null.
        .find((review) => typeof review.holdBackAnnotations === 'boolean' && new Date(review.createdAt).getTime() > since)?.holdBackAnnotations;
}

/**
 * resolveStudentView - the writing lens's whole-text additions and visible annotations.
 *
 * @param run - Latest linguistic run
 * @param submission - Submission with its reviews
 * @param comments - Working-set comments for the writing lens
 * @returns The overall message (staff edit over the model's; only on a whole-text problem),
 *          the effective hold-back, and the annotations the student sees
 */
export function resolveStudentView(
    run: WritingFeedbackRun,
    submission: Pick<WritingSubmission, 'transcriptEditedAt'> & { reviews?: StaffReviewRevision[] },
    comments: AnchoredComment[]
): { overallMessage?: string; holdBackAnnotations: boolean; comments: AnchoredComment[] } {
    const wholeTextProblem = hasWholeTextProblem(run);
    const holdBackAnnotations = resolveHoldBack(wholeTextProblem, latestHoldBackChoice(submission, run));
    const edit = [...reviewsSinceTextEdit(submission)].reverse()
        .flatMap((review) => review.summaryEdits ?? [])
        .find((candidate) => candidate.lens === 'linguistic' && candidate.feedbackRunId === run.id && candidate.overallMessage !== undefined);
    // Staff clearing the message (an empty string) removes it.
    const overallMessage = wholeTextProblem ? (edit?.overallMessage ?? run.result.overallMessage)?.trim() : undefined;
    return {
        ...(overallMessage ? { overallMessage } : {}),
        holdBackAnnotations,
        comments: studentFacingComments(comments, holdBackAnnotations)
    };
}

/**
 * describeFailureSafely — renders a generation failure with no model or student content.
 *
 * A model/SDK error message can echo the prompt back, and the prompt carries verified
 * submission text, so the raw message is never emitted. What is emitted is:
 *
 * - the error's constructor name (e.g. `APIError`, `ZodError`);
 * - its message only when it exactly matches a fixed string this codebase throws;
 * - Zod issue paths and codes, which name schema fields rather than values;
 * - the evidence diagnostic attached by `validateSflAnalysis` (check name plus lengths);
 * - transport fields (`status`, `code`, `type`), which are provider status metadata.
 *
 * @param error - Any thrown value from a lens run
 * @returns One-line, content-free description safe for application logs
 */
export function describeFailureSafely(error: unknown): string {
    const name = error instanceof Error ? error.constructor.name : typeof error;
    const zodIssues = error && typeof error === 'object' && Array.isArray((error as { issues?: unknown[] }).issues)
        ? (error as { issues: Array<{ path: (string | number)[]; code: string }> }).issues
            .map((issue) => `${issue.path.join('.')}: ${issue.code}`).join('; ')
        : undefined;
    const message = zodIssues
        ?? (error instanceof Error && SAFE_TO_LOG_MESSAGES.has(error.message)
            ? error.message
            : '(message withheld: not on the safe-to-log allowlist)');
    const details = error && typeof error === 'object'
        ? {
            ...(('diagnostic' in error) ? { diagnostic: (error as { diagnostic: unknown }).diagnostic } : {}),
            ...(('status' in error) ? { status: (error as { status: unknown }).status } : {}),
            ...(('code' in error) ? { code: (error as { code: unknown }).code } : {}),
            ...(('type' in error) ? { type: (error as { type: unknown }).type } : {})
        }
        : {};
    const suffix = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
    return `${name} - ${message}${suffix}`;
}

/** Refusal for a redraft requested once the submission has left `draft_ready`. */
export const REDRAFT_NOT_DRAFT_READY_MESSAGE = 'The summary can only be redrafted before approval';

/** Refusal for a staff edit while the worker is replacing the submission's draft. */
export const REVIEW_WHILE_GENERATING_MESSAGE = 'Wait for feedback generation to finish before editing this submission';

/** Refusal for approval while the worker is replacing the submission's draft. */
export const APPROVE_WHILE_GENERATING_MESSAGE = 'Wait for feedback generation to finish before approving this submission';

export type GeneratedFeedbackWithTrace = WritingFeedbackResult & { runTrace?: WritingFeedbackRunTrace };

export type ReviewableSubmission = WritingSubmission & { reviews?: StaffReviewRevision[] };

/** Detail submission, with the newer Canvas attempt waiting to replace it when there is one. */
export type DetailSubmission = ReviewableSubmission & { pendingReplacement?: WritingPendingReplacement };

/** Staff detail payload combining persistent state with safe read-time comment derivations. */
export interface SubmissionDetail {
    submission: DetailSubmission; // submission plus append-only review history and any held newer attempt
    feedbackRun: WritingFeedbackRun | null; // latest immutable linguistic model draft
    /** Latest immutable technical draft; null for assignments without the technical lens. */
    technicalFeedbackRun: WritingFeedbackRun | null;
    /** Latest stored working set, stale-flagged against the current verified text. */
    comments: AnchoredCommentWithState[];
    /** Model-derived seeds; present only while no revision has stored comments yet. */
    seedComments: AnchoredComment[];
    /** Annotation working set resolved per lens (newest of saved revision or redraft, else seeds). */
    workingComments: AnchoredCommentWithState[];
    /** Per lens, the run the summary comes from and the annotations fingerprint it reflects. */
    summarySources: Partial<Record<WritingFeedbackLens, SummarySource>>;
    /** Staff "Hold back annotations" choice in force for this generation; absent means the default. */
    holdBackAnnotations?: boolean;
    /** The overall message the student would receive (whole-text problem only): newest staff edit over the model's. */
    overallMessage?: string;
    /** Latest persisted Canvas release state, including any reconciliation requirement. */
    release: WritingRelease | null;
    /** How many times this submission's feedback has reached the student in Canvas. */
    releaseCount: number;
    /** The cap, sent so the page names the limit rather than hard-coding it. */
    maxReleases: number;
}

/** Refuses feedback generated before staff last edited the submission text. */
export function assertRunsMatchText(submission: WritingSubmission, runs: Array<WritingFeedbackRun | null>): void {
    if (runs.some((run) => runPredatesTextEdit(submission, run))) throw new Error(TEXT_EDITED_MESSAGE);
}

/**
 * Refuses a draft generated against a rubric version other than the assignment's current one.
 *
 * @param runRubricVersion - Rubric version stamped on the run; absent on legacy runs, read as version 1
 * @param assignment - Assignment whose current writing rubric version must match
 * @throws Error when the rubric changed after generation, so feedback must be regenerated before approval or release
 */
export function assertCurrentRubric(runRubricVersion: number | undefined, assignment: WritingAssignment): void {
    // Legacy runs predate explicit provenance and are treated as profile version 1.
    const effectiveRunVersion = runRubricVersion ?? 1;
    if (effectiveRunVersion !== assignment.rubric.version) {
        throw new Error('Rubric changed after feedback generation; regenerate feedback before approval or release');
    }
}

/**
 * Loads the technical draft and rubric for a PDF/release call, refusing a stale draft.
 *
 * Mirrors `WritingFeedbackService.approve`: an assignment that is not a lab report, or whose technical
 * rubric was never approved, owes no technical draft at all, so no run is even fetched.
 * Once an approved technical rubric exists, any existing run is checked against it with
 * the same staleness rule approval already enforces, before the caller renders or releases.
 *
 * @param mongo - Reads the latest technical run
 * @param submissionId - Submission whose technical draft is being resolved
 * @param assignment - Assignment supplying the technical lens's approved rubric, if any
 * @returns The latest technical run (or null when none applies yet) and its rubric
 * @throws Error when a technical run exists but predates the currently-approved technical rubric
 */
export async function loadTechnicalLens(
    mongo: Pick<EngEAI_MongoDB, 'getLatestWritingFeedbackRun'>,
    submissionId: string,
    assignment: WritingAssignment
): Promise<{ technicalRun: WritingFeedbackRun | null; technicalRubric: WritingRubricDefinition | undefined }> {
    if (!lensesForAssignment(assignment).includes('technical')) {
        return { technicalRun: null, technicalRubric: undefined };
    }
    const technicalRubric = selectRubric(assignment, 'technical').approved;
    if (!technicalRubric) return { technicalRun: null, technicalRubric: undefined };
    const technicalRun = await mongo.getLatestWritingFeedbackRun(submissionId, 'technical');
    if (technicalRun) assertCurrentRubricForLens(technicalRun.rubricVersion, technicalRubric, 'technical');
    return { technicalRun, technicalRubric };
}

/**
 * Loads the technical run for released feedback, with the technical rubric it was generated with.
 *
 * The released counterpart of {@link loadTechnicalLens}: no staleness check, because released
 * feedback is exempt, and the rubric comes from the technical lens's history by the run's own
 * version rather than from whatever is approved now.
 *
 * @param mongo - Reads the latest technical run
 * @param submissionId - Released submission whose technical run is being resolved
 * @param assignment - Assignment supplying the technical lens's approved rubric and history
 * @returns The latest technical run (or null when the assignment has none) and its own rubric
 */
export async function loadReleasedTechnicalLens(
    mongo: Pick<EngEAI_MongoDB, 'getLatestWritingFeedbackRun'>,
    submissionId: string,
    assignment: WritingAssignment
): Promise<{ technicalRun: WritingFeedbackRun | null; technicalRubric: WritingRubricDefinition | undefined }> {
    if (!lensesForAssignment(assignment).includes('technical')) {
        return { technicalRun: null, technicalRubric: undefined };
    }
    const technicalRun = await mongo.getLatestWritingFeedbackRun(submissionId, 'technical');
    if (!technicalRun) return { technicalRun: null, technicalRubric: undefined };
    return {
        technicalRun,
        technicalRubric: rubricForVersion(assignment, 'technical', technicalRun.rubricVersion)
    };
}

/**
 * Checks one lens's run against its currently-approved rubric version.
 *
 * @param runRubricVersion - Rubric version stamped on the run being checked
 * @param rubric - This lens's currently-approved rubric, if any
 * @param lens - Lens being checked, selecting the error message
 * @throws Error when the rubric is missing or the run predates the current approval
 */
export function assertCurrentRubricForLens(
    runRubricVersion: number | undefined,
    rubric: WritingRubricDefinition | undefined,
    lens: WritingFeedbackLens
): void {
    // Legacy runs predate explicit provenance and are treated as profile version 1.
    const effectiveRunVersion = runRubricVersion ?? 1;
    if (!rubric || effectiveRunVersion !== rubric.version) {
        throw new Error(lens === 'technical'
            ? 'Technical rubric changed after feedback generation; regenerate technical feedback before approval or release'
            : 'Rubric changed after feedback generation; regenerate feedback before approval or release');
    }
}

/**
 * buildStudentDocument - the student-facing content for one submission (D-126, D-127).
 *
 * Applies staff summary edits bound to the latest runs, takes evidence from the final
 * annotations when any exist, and resolves the comments printed on the annotated pages.
 *
 * @param submission - Submission with its review history
 * @param feedbackRun - Latest linguistic run
 * @param technicalRun - Latest technical run, when the assignment has one
 * @returns Render-ready feedback, staff goals, comments and the latest revision
 */
export function buildStudentDocument(
    submission: ReviewableSubmission,
    feedbackRun: WritingFeedbackRun,
    technicalRun: WritingFeedbackRun | null,
    assignment: WritingAssignment
) {
    const verifiedText = submission.verifiedText ?? '';
    const latestReview = submission.reviews?.[submission.reviews.length - 1];
    const latestWithComments = [...reviewsSinceTextEdit(submission)].reverse().find((review) => review.comments);
    const revision = latestWithComments?.comments
        ? { comments: latestWithComments.comments, createdAt: latestWithComments.createdAt }
        : undefined;
    // Re-check checksums defensively so stale anchors never reach a student PDF.
    const anchored = (comments: AnchoredComment[]) =>
        comments.filter((comment) => verifiedText.slice(comment.startOffset, comment.endOffset) === comment.quote);

    const linguistic = resolveLensComments('linguistic', { revision, run: feedbackRun, seeds: [] }, { includeSeeds: false });
    const technical = technicalRun
        ? resolveLensComments('technical', { revision, run: technicalRun, seeds: [] }, { includeSeeds: false })
        : { comments: [], origin: 'none' as const };
    // Held-back annotations are withheld from everything the student receives.
    const view = resolveStudentView(feedbackRun, submission, anchored(linguistic.comments));
    const linguisticComments = view.comments;
    const technicalComments = anchored(technical.comments);

    // The grade belongs to one lens, so it supplies staff-assessed levels only there.
    // A draft grade is deliberately not read: a preview shows what release would send.
    const assessment = latestReview?.finalAssessment;
    const assessmentFor = (lens: WritingFeedbackLens) =>
        assessment && (assessment.lens ?? 'linguistic') === lens ? { assessment } : {};

    return {
        latestReview,
        ...(view.overallMessage ? { overallMessage: view.overallMessage } : {}),
        // Technical first, so a lab report's annotated pages lead with the graded rubric.
        comments: [...technicalComments, ...linguisticComments],
        feedback: applySummaryToResult(feedbackRun.result, {
            ...(linguistic.origin === 'none' ? {} : { comments: linguisticComments }),
            edit: bindingSummaryEdit(latestReview, 'linguistic', feedbackRun.id),
            rubric: rubricForRun(assignment, feedbackRun),
            ...assessmentFor('linguistic')
        }),
        staffFeedback: bindingStudentFeedback(latestReview, feedbackRun.id),
        ...(technicalRun
            ? {
                technicalFeedback: applySummaryToResult(technicalRun.result, {
                    ...(technical.origin === 'none' ? {} : { comments: technicalComments }),
                    edit: bindingSummaryEdit(latestReview, 'technical', technicalRun.id),
                    rubric: rubricForRun(assignment, technicalRun),
                    ...assessmentFor('technical')
                }),
                technicalStaffFeedback: bindingSummaryEdit(latestReview, 'technical', technicalRun.id)?.revisionGoalsText
            }
            : {})
    };
}
