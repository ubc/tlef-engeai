/**
 * Writing Feedback release workflow — preview, queue, and send approved feedback to Canvas
 *
 * The release half of the Writing Feedback lifecycle, moved out of the service so each file
 * stays readable. The service owns construction and delegates its release methods here; the
 * workflow reaches persistence, PDF rendering, and submission lookup only through the context
 * the service hands it.
 *
 * @author: @rdschrs
 * @date: 2026-10-19
 * @version: 1.0.0
 * @description: Canvas release preview, single-release queueing, the queued run, and the release itself.
 */

import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import {
    type CanvasReleaseInput,
    type CanvasReleaseService,
    type WritingAssignment,
    type WritingFeedbackRun,
    type WritingJob,
    type WritingRubricDefinition,
    RELEASE_LOCK_TTL_MS
} from '../contracts';
import { computeReleaseFingerprint } from './canvas-release-service';
import { selectRubric } from '../rubric/rubric-lens';
import type { StudentWritingFeedbackPdfService } from '../../report-generation/writing-feedback-report';
import { gradedLensFor } from '../review/staff-final-assessment';
import { nextReleaseRevision, releaseCapMessage, toSanitizedReleaseError } from './release-refusals';
import { SanitizedJobError } from '../jobs/job-runner';
import { resolveQueuedReleaseService } from './queued-release-service';
import { appLogger } from '../../utils/logger';
import { bindingStudentFeedback } from '../review/summary';
import {
    isDuplicateKeyError,
    type ReviewableSubmission,
    assertRunsMatchText,
    assertCurrentRubric,
    loadTechnicalLens,
    buildStudentDocument
} from '../service/service-helpers';

/** What the release workflow needs from the service that owns it. */
export interface ReleaseWorkflowContext {
    mongo: EngEAI_MongoDB;
    pdfService: Pick<StudentWritingFeedbackPdfService, 'render'>;
    /** Rebuilds the Canvas coordinator for a queued release that runs without a request. */
    resolveQueuedRelease: typeof resolveQueuedReleaseService;
    requireSubmission(courseId: string, submissionId: string): Promise<ReviewableSubmission>;
    requireAssignment(courseId: string, assignmentId: string): Promise<WritingAssignment>;
}

/**
 * Releases approved Writing Feedback to Canvas exactly once per submission.
 *
 * Preview is idempotent per payload fingerprint, queueing claims a lock so only one release
 * runs, and a completed release marks the submission released only if it is still approved.
 */
export class WritingFeedbackReleaseWorkflow {
    constructor(private readonly ctx: ReleaseWorkflowContext) {}

    /**
     * Builds and persists an idempotent Canvas release preview without external mutation.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission selected for preview
     * @param releaseService - Canvas release coordinator
     * @returns Existing or newly persisted release preview
     */
    async previewRelease(courseId: string, submissionId: string, releaseService: CanvasReleaseService) {
        const submission = await this.ctx.requireSubmission(courseId, submissionId);
        const assignment = await this.ctx.requireAssignment(courseId, submission.assignmentId);
        const revision = await this.requireReleasableSubmission(courseId, submission);
        const feedbackRun = await this.ctx.mongo.getLatestWritingFeedbackRun(submissionId);
        if (!feedbackRun) throw new Error('Generate feedback before a release preview');
        assertCurrentRubric(feedbackRun.rubricVersion, assignment);
        const { technicalRun, technicalRubric } = await loadTechnicalLens(this.ctx.mongo, submissionId, assignment);
        assertRunsMatchText(submission, [feedbackRun, technicalRun]);
        const completePdf = await this.renderReleasePdf(assignment, submission, feedbackRun, technicalRun, technicalRubric);
        const studentDocument = buildStudentDocument(submission, feedbackRun, technicalRun, assignment);
        const artifacts: CanvasReleaseInput['artifacts'] = [
            { kind: 'writing', filename: 'writing-feedback-complete.pdf', data: completePdf }
        ];
        // The lens is known here, so the adapter never re-derives which rubric carries marks.
        const gradedRubric = selectRubric(assignment, gradedLensFor(assignment)).approved;
        if (!gradedRubric) {
            throw new Error('Approve the rubric this assignment is graded on before releasing');
        }
        return releaseService.preview({
            submission,
            assignment,
            feedbackRun,
            artifacts,
            gradedRubric,
            revision,
            finalAssessment: studentDocument.latestReview?.finalAssessment,
            studentFeedback: studentDocument.staffFeedback,
            summaryEdits: studentDocument.latestReview?.summaryEdits,
            ...(technicalRun ? { technicalFeedbackRun: technicalRun } : {})
        });
    }

    /**
     * releaseToCanvas - releases approved feedback from one staff action (D-128).
     *
     * Staff no longer preview separately: this prepares the release preview (PDF render and Canvas
     * preflight, no Canvas write) and queues the write in the same request. Feedback reaches Canvas
     * once; the cap refuses a second release.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Approved submission to release
     * @param releaseService - Canvas release coordinator resolved for this request
     * @param queuedByUserId - `GlobalUser.userId` of the staff member releasing
     * @returns The active or newly queued release job
     * @throws Error with the staff-facing reason when the release cannot be attempted
     */
    async releaseToCanvas(
        courseId: string,
        submissionId: string,
        releaseService: CanvasReleaseService,
        queuedByUserId: string
    ): Promise<WritingJob> {
        // Step 1: refuse cheaply, before rendering a PDF or preflighting Canvas.
        const submission = await this.ctx.requireSubmission(courseId, submissionId);
        if (submission.status !== 'approved') throw new Error('Staff approval is required before Canvas release');
        // Step 2: the dry-run preview staff no longer trigger separately. It is idempotent per payload,
        // so pressing Release again reuses the same preview rather than creating another.
        await this.previewRelease(courseId, submissionId, releaseService);
        // Step 3: queue the write against the preview just prepared.
        return this.enqueueRelease(courseId, submissionId, queuedByUserId);
    }

    /**
     * Queues a Canvas release, checking now everything that can be checked before the worker runs.
     *
     * A live release uploads the feedback PDF, posts a comment, and starts a Canvas grade job; doing that
     * inside the HTTP request meant staff watched a spinner for as long as Canvas took, and a
     * dropped connection left the outcome unknown. The queue owns the wait instead. Everything
     * that can fail cheaply — the cap, the Canvas identity, approval, an existing preview — is
     * refused here, where staff are still looking at the page and can act on the reason.
     *
     * The job carries only the submission id. Whose Canvas credential the write acts with is
     * recorded on the release record, because that is the durable thing the worker reloads.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Approved submission whose previewed release is being sent
     * @param queuedByUserId - `GlobalUser.userId` of the staff member queuing it
     * @returns The active or newly queued release job
     * @throws Error when the release cannot be attempted at all, with the staff-facing reason
     */
    async enqueueRelease(courseId: string, submissionId: string, queuedByUserId: string): Promise<WritingJob> {
        const submission = await this.ctx.requireSubmission(courseId, submissionId);
        await this.requireReleasableSubmission(courseId, submission);
        if (submission.status !== 'approved') throw new Error('Staff approval is required before Canvas release');
        // One queued release per submission: a second click must join the first attempt rather
        // than schedule another Canvas comment.
        const existing = await this.ctx.mongo.findActiveWritingJob(courseId, submissionId, 'release');
        if (existing) return existing;

        const release = await this.ctx.mongo.getLatestWritingRelease(courseId, submissionId);
        if (!release) throw new Error('Preview this release before sending it to Canvas');
        if (release.status === 'reconciliation_required') {
            throw new Error('Canvas returned an uncertain result for this submission. Reconcile it in Canvas before releasing again.');
        }
        if (release.status === 'released' || release.status === 'reconciled') {
            throw new Error('This feedback has already been released to Canvas.');
        }

        // What staff are looking at must be what the worker sends. A payload edited after the
        // preview hashes differently, and queueing it anyway only moves the refusal into a
        // background job nobody is watching.
        const current = await this.currentReleaseFingerprint(submission);
        if (current && current !== release.payloadFingerprint) {
            throw new Error('This feedback changed after it was previewed; preview the release again before sending it.');
        }

        // The claim is the lock. Two staff members pressing Release at the same moment both
        // reach here; the atomic claim lets exactly one through, and the loser is told a
        // release is already under way rather than queueing a second Canvas comment.
        const claimed = await this.ctx.mongo.claimWritingReleaseForQueue(release.payloadFingerprint, { queuedByUserId });
        if (!claimed) {
            const concurrent = await this.ctx.mongo.findActiveWritingJob(courseId, submissionId, 'release');
            if (concurrent) return concurrent;
            throw new Error('A release for this submission is already in progress.');
        }

        let job: WritingJob;
        try {
            job = await this.ctx.mongo.enqueueWritingJob({
                courseId,
                type: 'release',
                state: 'queued',
                // One attempt. The queue's generic retry is right for a model call and wrong
                // for an external write: a failure whose outcome is unknown must be looked at,
                // not repeated.
                maxAttempts: 1,
                payload: { submissionId }
            });
        } catch (error) {
            // Nothing is going to run, so the lock must not outlive the attempt.
            await this.ctx.mongo.releaseWritingReleaseLock(release.payloadFingerprint);
            // The unique partial index refused a second queued release for this submission.
            // The job that beat this one is the answer the caller wanted, not an error.
            if (!isDuplicateKeyError(error)) throw error;
            const concurrent = await this.ctx.mongo.findActiveWritingJob(courseId, submissionId, 'release');
            if (concurrent) return concurrent;
            throw new Error('A release for this submission is already in progress.');
        }
        // Recorded after the fact: the claim is what prevents a second release, and the job id
        // is the audit trail that says which run carried this one out.
        await this.ctx.mongo.finalizeWritingRelease(release.payloadFingerprint, { releaseJobId: job.id });
        return job;
    }

    /**
     * Runs one queued release as the staff member who queued it.
     *
     * Reloads everything from durable state rather than trusting the job payload, which carries
     * only an id. Two outcomes are deliberately not failures: a release that already landed, and
     * one parked for reconciliation. Both mean the queue has nothing left to do, and failing the
     * job would invite a retry that could duplicate a student's feedback.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission whose queued release is running
     * @throws SanitizedJobError when the release cannot proceed, with a staff-readable reason
     */
    async runQueuedRelease(courseId: string, submissionId: string): Promise<void> {
        const release = await this.ctx.mongo.getLatestWritingRelease(courseId, submissionId);
        if (!release) throw new SanitizedJobError('The release record for this submission is missing; preview the release again.');
        if (release.status === 'released' || release.status === 'reconciled') return;
        // Reconciliation is a human decision about a Canvas write nobody can confirm. The queue
        // must leave it alone rather than retry it.
        if (release.status === 'reconciliation_required') return;
        if (!release.queuedByUserId) {
            throw new SanitizedJobError('This release was queued without a staff Canvas account; release it again from the review page.');
        }

        const resolved = await this.ctx.resolveQueuedRelease(this.ctx.mongo, courseId, release.queuedByUserId);
        if (!resolved.service) throw new SanitizedJobError(resolved.reason);
        // The adapter that runs must be the one the preview was made against. A course whose
        // Canvas link or configuration has gone missing since the preview resolves to the mock,
        // which would mark this release complete locally without writing anything to Canvas —
        // the student would be told nothing and staff would see "Released to Canvas".
        if (release.integration && resolved.integration !== release.integration) {
            throw new SanitizedJobError(
                'This release was prepared for Canvas, but the course is no longer connected to Canvas. '
                + 'Reconnect the course and release it again.'
            );
        }
        // Preview again before releasing. The prepared PDFs and preflight objects a preview
        // leaves behind are process-local, so a worker in another process — or the same one
        // after a restart — would otherwise find nothing and fail with "preview expired". The
        // coordinator keys everything on the payload fingerprint, so re-previewing the same
        // payload rebuilds those objects and returns the existing record untouched; a payload
        // that changed since staff queued it produces a different fingerprint, and the release
        // below refuses rather than sending something nobody previewed.
        try {
            await this.previewRelease(courseId, submissionId, resolved.service);
            await this.release(courseId, submissionId, resolved.service);
        } catch (error) {
            // Nobody is watching this run, so a fixable refusal has to reach the job error in
            // its own words rather than as the runner's generic sentence.
            throw toSanitizedReleaseError(error);
        } finally {
            // However this ended, the next attempt reads how far it got from the release
            // status; holding the lock past the run would only make staff wait out the
            // abandonment window before they could retry.
            await this.ctx.mongo.releaseWritingReleaseLock(release.payloadFingerprint);
        }
    }

    /**
     * currentReleaseFingerprint - the fingerprint the payload staff are looking at would produce.
     *
     * Built from the same fields the adapters hash, so a preview that no longer matches the
     * stored feedback, grade, or staff narrative can be refused where staff can see it rather
     * than inside a worker minutes later.
     *
     * @param submission - Submission whose latest review and runs form the payload
     * @returns The fingerprint, or `null` when no feedback run exists to release yet
     */
    private async currentReleaseFingerprint(submission: ReviewableSubmission): Promise<string | null> {
        const feedbackRun = await this.ctx.mongo.getLatestWritingFeedbackRun(submission.id);
        if (!feedbackRun) return null;
        const assignment = await this.ctx.requireAssignment(submission.courseId, submission.assignmentId);
        const { technicalRun } = await loadTechnicalLens(this.ctx.mongo, submission.id, assignment);
        const latestReview = submission.reviews?.[submission.reviews.length - 1];
        return computeReleaseFingerprint({
            submissionId: submission.id,
            feedbackRunId: feedbackRun.id,
            rubricVersion: feedbackRun.rubricVersion,
            grade: latestReview?.finalAssessment?.totalPoints,
            studentFeedback: bindingStudentFeedback(latestReview, feedbackRun.id),
            technicalFeedbackRunId: technicalRun?.id,
            finalAssessment: latestReview?.finalAssessment,
            summaryEdits: latestReview?.summaryEdits
        });
    }

    /**
     * Refuses an edit while a release is on its way to Canvas.
     *
     * The release payload is rendered by the worker from what is stored, minutes after staff
     * pressed Release: a review revision saved in that window would send a student a PDF nobody
     * approved, or a grade that no longer matches the one previewed. `released` is already
     * refused by the caller; this covers the states between queueing and Canvas confirming, and
     * `reconciliation_required`, where nobody yet knows what the student received.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission being edited
     * @throws Error naming the release state that blocks the edit
     */
    async assertNoReleaseInFlight(courseId: string, submissionId: string): Promise<void> {
        const release = await this.ctx.mongo.getLatestWritingRelease(courseId, submissionId);
        if (!release) return;
        const lockedAt = release.releaseLockedAt ? new Date(release.releaseLockedAt).getTime() : 0;
        if (lockedAt && Date.now() - lockedAt < RELEASE_LOCK_TTL_MS) {
            throw new Error('A release is in progress for this submission; wait for it to finish before editing.');
        }
        if (release.status === 'feedback_attached' || release.status === 'grade_queued') {
            throw new Error('A release is in progress for this submission; finish or reconcile it before editing.');
        }
        if (release.status === 'reconciliation_required') {
            throw new Error('Canvas returned an uncertain result for this submission. Reconcile it in Canvas before editing.');
        }
    }

    /**
     * Checks that this submission may be released again, and says which release it would be.
     *
     * One rule, submission-scoped and separate from the payload fingerprint that deduplicates a
     * single attempt: a submission whose feedback has already reached the student
     * `MAX_SUBMISSION_RELEASES` times may not add another Canvas comment. Attempts that
     * never landed — previews, failures, anything awaiting reconciliation — cost nothing and are
     * not counted, so a part-way failure stays resumable by any staff member.
     *
     * Whether the submission has a Canvas identity is deliberately **not** checked here. It is a
     * live-Canvas requirement, enforced by `LiveCanvasReleaseService`, and checking it at this
     * level broke the local demo workflow: a manually created submission has no `canvasUserId`
     * and the mock gateway never needed one.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submission - Submission being previewed or released
     * @returns The revision number this release would carry, from 1
     * @throws Error when the submission has spent every revision
     */
    private async requireReleasableSubmission(
        courseId: string,
        submission: ReviewableSubmission
    ): Promise<number> {
        // Revising feedback is allowed; doing it without limit is not, because each release adds
        // another Canvas comment and another notification for the student.
        const priorReleases = await this.ctx.mongo.listWritingReleases(courseId, submission.id);
        const revision = nextReleaseRevision(priorReleases);
        if (revision === null) throw new Error(releaseCapMessage());
        return revision;
    }

    /**
     * Releases approved feedback through the idempotent Canvas coordinator.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Approved submission selected for release
     * @param releaseService - Canvas release coordinator
     * @returns Finalized or reconciled release record
     */
    async release(courseId: string, submissionId: string, releaseService: CanvasReleaseService) {
        const submission = await this.ctx.requireSubmission(courseId, submissionId);
        const assignment = await this.ctx.requireAssignment(courseId, submission.assignmentId);
        // Release is reachable without a preview, so the cap is enforced here too rather than
        // only on the path that usually precedes it.
        const revision = await this.requireReleasableSubmission(courseId, submission);
        const feedbackRun = await this.ctx.mongo.getLatestWritingFeedbackRun(submissionId);
        if (!feedbackRun) throw new Error('Generate feedback before release');
        assertCurrentRubric(feedbackRun.rubricVersion, assignment);
        const { technicalRun, technicalRubric } = await loadTechnicalLens(this.ctx.mongo, submissionId, assignment);
        assertRunsMatchText(submission, [feedbackRun, technicalRun]);
        const completePdf = await this.renderReleasePdf(assignment, submission, feedbackRun, technicalRun, technicalRubric);
        const studentDocument = buildStudentDocument(submission, feedbackRun, technicalRun, assignment);
        const artifacts: CanvasReleaseInput['artifacts'] = [
            { kind: 'writing', filename: 'writing-feedback-complete.pdf', data: completePdf }
        ];
        const gradedRubric = selectRubric(assignment, gradedLensFor(assignment)).approved;
        if (!gradedRubric) {
            throw new Error('Approve the rubric this assignment is graded on before releasing');
        }
        const release = await releaseService.release({
            submission,
            assignment,
            feedbackRun,
            artifacts,
            gradedRubric,
            revision,
            finalAssessment: studentDocument.latestReview?.finalAssessment,
            studentFeedback: studentDocument.staffFeedback,
            summaryEdits: studentDocument.latestReview?.summaryEdits,
            ...(technicalRun ? { technicalFeedbackRun: technicalRun } : {})
        });
        // Mark local completion only after both the Canvas comment and async grade job are confirmed.
        if (release.status === 'released' || release.status === 'reconciled') {
            // Compare-and-set on `approved`: a submission staff have moved on from since this
            // release started must not be relabelled as released, because what reached the
            // student is no longer what the record would then claim.
            const marked = await this.ctx.mongo.setWritingSubmissionStatus(courseId, submissionId, 'released', ['approved']);
            if (!marked) {
                appLogger.log('[writing-feedback] release landed but the submission had moved on:', 'release_status_conflict');
            }
        }
        return release;
    }

    /**
     * renderReleasePdf - the single complete PDF a Canvas release attaches.
     *
     * One document per submission: a lab report carries its technical feedback ahead of the
     * writing feedback. The annotated pages print the final annotations (user decision
     * 2026-09-13); before this, released PDFs passed no comments and printed none.
     *
     * @returns Complete PDF bytes
     */
    private async renderReleasePdf(
        assignment: WritingAssignment,
        submission: ReviewableSubmission,
        feedbackRun: WritingFeedbackRun,
        technicalRun: WritingFeedbackRun | null,
        technicalRubric: WritingRubricDefinition | undefined
    ): Promise<Buffer> {
        const studentDocument = buildStudentDocument(submission, feedbackRun, technicalRun, assignment);
        return this.ctx.pdfService.render({
            assignment,
            submission,
            feedback: studentDocument.feedback,
            grade: studentDocument.latestReview?.finalAssessment?.totalPoints,
            staffFeedback: studentDocument.staffFeedback,
            finalAssessment: studentDocument.latestReview?.finalAssessment,
            comments: studentDocument.comments,
            ...(studentDocument.overallMessage ? { overallMessage: studentDocument.overallMessage } : {}),
            annotationAuthor: submission.approvedByName,
            ...(technicalRun && technicalRubric && studentDocument.technicalFeedback
                ? {
                    technicalFeedback: studentDocument.technicalFeedback,
                    technicalRubric,
                    technicalStaffFeedback: studentDocument.technicalStaffFeedback
                }
                : {}),
            include: 'both',
            lens: 'writing'
        });
    }
}
