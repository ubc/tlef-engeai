/**
 * Batch feedback generation — queue every submission of an assignment that needs a draft
 *
 * Staff start one run for an assignment; each submission becomes its own ordinary `generate`
 * job, so the worker drafts them one at a time and staff can review finished submissions while
 * the rest wait. File transcripts that pass the automatic quality check are confirmed on staff's
 * behalf first. Stopping removes the jobs that have not started.
 *
 * @author: EngE-AI Team
 * @date: 2026-09-16
 * @version: 1.0.0
 * @description: Previews, starts, and stops batch feedback generation for one assignment.
 */

import type {
    WritingAssignment,
    WritingBatchCategory,
    WritingBatchPreview,
    WritingBatchStartResult,
    WritingFeedbackLens,
    WritingFeedbackRun,
    WritingJob,
    WritingSubmission
} from './contracts';
import { selectRubric } from './rubric-lens';
import { requireCompleteSflProfile } from './sfl-analysis';
import { assessExtractedTranscript } from './transcript-quality';
import { appLogger } from '../utils/logger';

/** Persistence batch generation needs; implemented by `EngEAI_MongoDB`. */
export interface BatchGenerationStore {
    getWritingAssignment(courseId: string, assignmentId: string): Promise<WritingAssignment | null>;
    listWritingSubmissions(courseId: string, assignmentId: string): Promise<WritingSubmission[]>;
    listLatestWritingRunVersions(courseId: string, assignmentId: string): Promise<Map<string, Partial<Record<WritingFeedbackLens, number>>>>;
    listActiveWritingGenerationSubmissionIds(courseId: string, submissionIds: string[]): Promise<Set<string>>;
    autoConfirmWritingTranscript(courseId: string, submissionId: string, verifiedText: string): Promise<WritingSubmission | null>;
    cancelWritingGenerationJobs(courseId: string, submissionIds: string[]): Promise<string[]>;
    getLatestWritingFeedbackRun(submissionId: string, lens?: WritingFeedbackLens): Promise<WritingFeedbackRun | null>;
    setWritingSubmissionStatus(
        courseId: string,
        submissionId: string,
        status: WritingSubmission['status'],
        expectedStatuses?: ReadonlyArray<WritingSubmission['status']>
    ): Promise<WritingSubmission | null>;
}

/** Queues one submission; `WritingFeedbackService.enqueueGeneration` in production. */
export type EnqueueGeneration = (courseId: string, submissionId: string) => Promise<WritingJob>;

/** Refusals staff can read; the route passes these through unchanged. */
export const BATCH_ERRORS = {
    notFound: 'Writing assignment not found',
    rubricNotApproved: 'Approve the rubric before generating feedback',
    profileIncomplete: 'Complete the genre and register profile before generating feedback'
} as const;

/** Categories a batch queues without asking; `stale` is added only when staff opt in. */
const ALWAYS_QUEUED: ReadonlySet<WritingBatchCategory> = new Set(['no_draft', 'failed', 'transcript']);

/**
 * batchBlockedReason - why nothing in this assignment can be generated, if anything stops it.
 *
 * @param assignment - Assignment the batch would run for
 * @returns A {@link BATCH_ERRORS} message, or `undefined` when generation may proceed
 */
export function batchBlockedReason(assignment: WritingAssignment): string | undefined {
    if (!assignment.rubric || assignment.rubric.status !== 'approved') return BATCH_ERRORS.rubricNotApproved;
    try {
        requireCompleteSflProfile(assignment.rubric.sflContext);
    } catch {
        return BATCH_ERRORS.profileIncomplete;
    }
    return undefined;
}

/**
 * classifyForBatch - what batch generation should do with one submission.
 *
 * Feedback is `stale` when a lens it owes was generated with an older rubric version, or a lab
 * report with an approved technical rubric has no technical feedback. Both are opt-in, because
 * regenerating replaces the summary staff may already have edited.
 *
 * @param submission - Active submission
 * @param context - Assignment, the submission's latest run version per lens, and whether it has an active job
 * @returns The submission's batch category
 */
export function classifyForBatch(
    submission: WritingSubmission,
    context: {
        assignment: WritingAssignment;
        runVersions: Partial<Record<WritingFeedbackLens, number>> | undefined;
        hasActiveJob: boolean;
    }
): WritingBatchCategory {
    // Step 1: finished or already under way.
    if (submission.status === 'released') return 'done';
    if (context.hasActiveJob) return 'in_progress';

    // Step 2: text that has not been confirmed yet.
    if (submission.requiresVerification || !submission.verifiedText?.trim()) {
        return submission.sourceType === 'digital_file' && assessExtractedTranscript(submission.originalText).ok
            ? 'transcript'
            : 'needs_transcript';
    }

    // Step 3: a failed attempt, or one left generating with no job behind it.
    if (submission.status === 'failed' || submission.status === 'generating') return 'failed';

    // Step 4: compare existing feedback with the rubric versions now approved. Feedback on an
    // `imported` submission was made for text staff have since edited, so it owes a new draft;
    // nothing staff wrote for it is still loaded, so there is nothing to opt in to losing.
    const linguistic = context.runVersions?.linguistic;
    if (linguistic === undefined || submission.status === 'imported') return 'no_draft';
    if (linguistic !== context.assignment.rubric.version) return 'stale';
    const technicalRubric = context.assignment.isLabReport
        ? selectRubric(context.assignment, 'technical').approved
        : undefined;
    if (technicalRubric && context.runVersions?.technical !== technicalRubric.version) return 'stale';
    return 'done';
}

/**
 * Previews, starts, and stops batch generation for one assignment.
 */
export class WritingBatchGenerationService {
    constructor(
        private readonly store: BatchGenerationStore,
        private readonly enqueue: EnqueueGeneration
    ) {}

    /**
     * preview - counts what a batch would do, for the confirmation modal.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param assignmentId - Assignment to preview
     * @returns Counts per category, and why the batch cannot run when it cannot
     * @throws Error `BATCH_ERRORS.notFound` when the assignment is not in this course
     */
    async preview(courseId: string, assignmentId: string): Promise<WritingBatchPreview> {
        const { assignment, rows } = await this.classify(courseId, assignmentId);
        const counts: Record<WritingBatchCategory, number> = {
            no_draft: 0, failed: 0, transcript: 0, stale: 0, needs_transcript: 0, in_progress: 0, done: 0
        };
        for (const row of rows) counts[row.category] += 1;
        const blockedReason = batchBlockedReason(assignment);
        return blockedReason ? { counts, blockedReason } : { counts };
    }

    /**
     * start - confirms passing transcripts and queues every submission that needs a draft.
     *
     * Submissions are queued in the order the assignment's list shows them. A submission whose
     * state changed since it was classified is skipped rather than failing the whole batch.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param assignmentId - Assignment to generate for
     * @param options - `includeStale` also regenerates feedback made with an older rubric
     * @returns How many were queued, confirmed, and skipped
     * @throws Error with a {@link BATCH_ERRORS} message when the batch cannot run
     */
    async start(courseId: string, assignmentId: string, options: { includeStale: boolean }): Promise<WritingBatchStartResult> {
        const { assignment, rows } = await this.classify(courseId, assignmentId);
        const blockedReason = batchBlockedReason(assignment);
        if (blockedReason) throw new Error(blockedReason);

        const result: WritingBatchStartResult = { queued: 0, transcriptsConfirmed: 0, skipped: 0 };
        for (const { submission, category } of rows) {
            if (category === 'needs_transcript') {
                result.skipped += 1;
                continue;
            }
            const wanted = ALWAYS_QUEUED.has(category) || (category === 'stale' && options.includeStale);
            if (!wanted) continue;

            // Step 1: confirm the transcript on staff's behalf, only if it still needs it.
            if (category === 'transcript') {
                const quality = assessExtractedTranscript(submission.originalText);
                const confirmed = quality.ok
                    ? await this.store.autoConfirmWritingTranscript(courseId, submission.id, quality.text)
                    : null;
                if (!confirmed) {
                    result.skipped += 1;
                    continue;
                }
                result.transcriptsConfirmed += 1;
            }

            // Step 2: queue it. enqueueGeneration re-checks the submission and returns any job
            // that already exists instead of adding a second.
            try {
                await this.enqueue(courseId, submission.id);
                result.queued += 1;
            } catch {
                result.skipped += 1;
            }
        }
        appLogger.info('[writing-feedback] batch generation queued', {
            courseId, assignmentId, ...result, includeStale: options.includeStale
        });
        return result;
    }

    /**
     * stop - removes the assignment's generation jobs that have not started.
     *
     * A submission already generating finishes. Each stopped submission returns to the state its
     * feedback supports: `draft_ready` when it has feedback, `imported` when it has none. A
     * transcript the batch confirmed stays confirmed.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param assignmentId - Assignment whose pending generation stops
     * @returns Number of submissions taken out of the queue
     * @throws Error `BATCH_ERRORS.notFound` when the assignment is not in this course
     */
    async stop(courseId: string, assignmentId: string): Promise<{ stopped: number }> {
        const assignment = await this.store.getWritingAssignment(courseId, assignmentId);
        if (!assignment) throw new Error(BATCH_ERRORS.notFound);
        const submissions = await this.store.listWritingSubmissions(courseId, assignmentId);
        const cancelled = await this.store.cancelWritingGenerationJobs(courseId, submissions.map((item) => item.id));
        for (const submissionId of cancelled) {
            const run = await this.store.getLatestWritingFeedbackRun(submissionId);
            await this.store.setWritingSubmissionStatus(courseId, submissionId, run ? 'draft_ready' : 'imported', ['generating']);
        }
        appLogger.info('[writing-feedback] batch generation stopped', { courseId, assignmentId, stopped: cancelled.length });
        return { stopped: cancelled.length };
    }

    /** Loads the assignment and classifies each of its active submissions. */
    private async classify(courseId: string, assignmentId: string) {
        const assignment = await this.store.getWritingAssignment(courseId, assignmentId);
        if (!assignment) throw new Error(BATCH_ERRORS.notFound);
        const submissions = await this.store.listWritingSubmissions(courseId, assignmentId);
        const [runVersions, active] = await Promise.all([
            this.store.listLatestWritingRunVersions(courseId, assignmentId),
            this.store.listActiveWritingGenerationSubmissionIds(courseId, submissions.map((item) => item.id))
        ]);
        const rows = submissions.map((submission) => ({
            submission,
            category: classifyForBatch(submission, {
                assignment,
                runVersions: runVersions.get(submission.id),
                hasActiveJob: active.has(submission.id)
            })
        }));
        return { assignment, rows };
    }
}
