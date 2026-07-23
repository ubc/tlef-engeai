/**
 * Writing Feedback service — verified generation, append-only review, PDF, and release
 *
 * Orchestrates the feature's domain transitions over the Mongo façade, structured
 * feedback engine, PDF renderer, and Canvas release boundary. Routes remain responsible
 * for course capability/RBAC; this service enforces verification, rubric, approval,
 * immutable-release, and exact-anchor invariants.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.0.0
 * @description: Coordinates the staff-reviewed Writing Feedback lifecycle.
 */

import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type {
    A2FeedbackResult,
    AnchoredComment,
    CanvasReleaseService,
    FeedbackPdfInclude,
    StaffReviewRevision,
    WritingAssignment,
    WritingFeedbackEngine,
    WritingFeedbackRun,
    WritingSubmission
} from './contracts';
import { seedCommentsFromRun, validateAnchoredComments, withStaleFlags, type AnchoredCommentWithState } from './anchored-comments';
import { A2WritingFeedbackEngine } from './feedback-engine';
import { StudentWritingFeedbackPdfService } from './pdf-service';
import { resolveNumericGrade } from './feedback-schema';

type ReviewableSubmission = WritingSubmission & { reviews?: StaffReviewRevision[] };

/** Staff detail payload combining persistent state with safe read-time comment derivations. */
export interface SubmissionDetail {
    submission: ReviewableSubmission; // submission plus append-only review history
    feedbackRun: WritingFeedbackRun | null; // latest immutable model draft
    /** Latest stored working set, stale-flagged against the current verified text. */
    comments: AnchoredCommentWithState[];
    /** Model-derived seeds; present only while no revision has stored comments yet. */
    seedComments: AnchoredComment[];
}

/**
 * Coordinates Writing Feedback domain rules across persistence and side-effect boundaries.
 *
 * Model runs remain immutable, staff edits append revisions, approval is explicit, and
 * Canvas release is delegated only after current-rubric validation.
 */
export class WritingFeedbackService {
    /**
     * Creates the lifecycle service with injectable generation and PDF implementations.
     *
     * @param mongo - Persistence façade for course-scoped Writing Feedback records
     * @param engine - Structured feedback generator; defaults to the A2 engine
     * @param pdfService - Student-safe renderer; defaults to the PDFKit implementation
     */
    constructor(
        private readonly mongo: EngEAI_MongoDB,
        private readonly engine: WritingFeedbackEngine = new A2WritingFeedbackEngine(),
        private readonly pdfService = new StudentWritingFeedbackPdfService()
    ) {}

    /**
     * Generates a new immutable feedback run from staff-verified text.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission selected by staff
     * @returns Validated structured model draft
     * @throws Error when verification, assignment lookup, generation, or persistence fails
     */
    async generate(courseId: string, submissionId: string): Promise<A2FeedbackResult> {
        // Verified text is the only student content allowed across the model boundary.
        const submission = await this.requireSubmission(courseId, submissionId);
        if (submission.requiresVerification || !submission.verifiedText?.trim()) {
            throw new Error('Staff must verify the submission text before feedback generation');
        }
        const assignment = await this.requireAssignment(courseId, submission.assignmentId);
        // Expose a durable in-progress state before the asynchronous model call begins.
        await this.mongo.setWritingSubmissionStatus(courseId, submissionId, 'generating');
        try {
            const result = await this.engine.generate({ assignment, verifiedText: submission.verifiedText });
            // Persist immutable provenance before declaring the draft review-ready.
            await this.mongo.createWritingFeedbackRun({
                courseId,
                assignmentId: assignment.id,
                submissionId,
                profileVersion: assignment.profileVersion,
                rubricVersion: assignment.rubric.version,
                result,
                modelMetadata: { engine: this.engine.constructor.name, promptVersion: 'a2-v1' }
            });
            await this.mongo.setWritingSubmissionStatus(courseId, submissionId, 'draft_ready');
            return result;
        } catch (error) {
            // Preserve a visible retryable failure state without logging student/model content.
            await this.mongo.setWritingSubmissionStatus(courseId, submissionId, 'failed');
            throw error;
        }
    }

    /**
     * Loads review state and derives either persisted comments or transient model seeds.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission opened in the staff workspace
     * @returns Detail payload with stale flags and seeds that are never auto-persisted
     */
    async detail(courseId: string, submissionId: string): Promise<SubmissionDetail> {
        const submission = await this.requireSubmission(courseId, submissionId);
        const feedbackRun = await this.mongo.getLatestWritingFeedbackRun(submissionId);
        const verifiedText = submission.verifiedText ?? '';
        // The newest revision that snapshots comments is authoritative, even if newer prose exists.
        const latestWithComments = [...(submission.reviews ?? [])].reverse().find((review) => review.comments);
        const comments = latestWithComments?.comments
            ? withStaleFlags(latestWithComments.comments, verifiedText)
            : [];
        // Model evidence remains transient until staff explicitly saves a first comment revision.
        const seedComments = !latestWithComments && feedbackRun && verifiedText
            ? seedCommentsFromRun(feedbackRun, verifiedText)
            : [];
        return { submission, feedbackRun, comments, seedComments };
    }

    /**
     * Appends one staff revision after validating every exact-span comment checksum.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission being reviewed
     * @param revision - Staff-authored narrative and optional complete comment snapshot
     * @returns Persisted append-only review revision
     * @throws Error when feedback is already released or any anchor is stale
     */
    async appendReview(
        courseId: string,
        submissionId: string,
        revision: Omit<StaffReviewRevision, 'id' | 'createdAt' | 'submissionId'>
    ): Promise<StaffReviewRevision> {
        const submission = await this.requireSubmission(courseId, submissionId);
        if (submission.status === 'released') {
            throw new Error('Released feedback cannot be edited; create a new attempt for a revised release');
        }
        if (revision.comments?.length) {
            // Validate offsets against the current verified text immediately before persistence.
            validateAnchoredComments(revision.comments, submission.verifiedText ?? '');
        }
        return this.mongo.appendWritingReview(courseId, submissionId, revision);
    }

    /**
     * Records explicit human approval for a draft generated with the current rubric.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Draft-ready submission to approve
     * @param staffUserId - Internal approving actor
     * @param staffName - Optional display name used as PDF annotation author
     * @returns Approved submission from persistence
     * @throws Error when no run exists, rubric provenance is stale, or state is not draft-ready
     */
    async approve(courseId: string, submissionId: string, staffUserId: string, staffName?: string) {
        const submission = await this.requireSubmission(courseId, submissionId);
        const assignment = await this.requireAssignment(courseId, submission.assignmentId);
        const run = await this.mongo.getLatestWritingFeedbackRun(submissionId);
        if (!run) throw new Error('Generate feedback before staff approval');
        this.assertCurrentRubric(run.rubricVersion, assignment);
        const approved = await this.mongo.approveWritingSubmission(courseId, submissionId, staffUserId, staffName);
        if (!approved) throw new Error('A draft-ready submission is required before approval');
        return approved;
    }

    /**
     * Renders a student-safe PDF from the current-rubric run and latest staff revision.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission whose feedback is downloaded
     * @param include - General, annotated, or combined PDF section selection
     * @returns Complete PDF bytes
     * @throws Error when no run exists or its rubric provenance is stale
     */
    async renderPdf(courseId: string, submissionId: string, include: FeedbackPdfInclude = 'general'): Promise<Buffer> {
        const submission = await this.requireSubmission(courseId, submissionId);
        const assignment = await this.requireAssignment(courseId, submission.assignmentId);
        const run = await this.mongo.getLatestWritingFeedbackRun(submissionId);
        if (!run) throw new Error('Generate feedback before creating a PDF');
        this.assertCurrentRubric(run.rubricVersion, assignment);
        // Narrative feedback comes from the latest revision; comments may come from the
        // latest earlier revision that explicitly snapshotted the comment working set.
        const latestReview = submission.reviews?.[submission.reviews.length - 1];
        const latestWithComments = [...(submission.reviews ?? [])].reverse().find((review) => review.comments);
        // Re-check checksums defensively so stale anchors never reach a student PDF.
        const comments = (latestWithComments?.comments ?? [])
            .filter((comment) => (submission.verifiedText ?? '').slice(comment.startOffset, comment.endOffset) === comment.quote);
        return this.pdfService.render({
            assignment,
            submission,
            feedback: run.result,
            grade: resolveNumericGrade(run.result, assignment.gradeMapping),
            staffFeedback: latestReview?.studentFeedback,
            comments,
            include,
            // Approving staff name (user decision 2026-07-22); generic fallback pre-approval.
            annotationAuthor: submission.approvedByName
        });
    }

    /**
     * Builds and persists an idempotent Canvas release preview without external mutation.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission selected for preview
     * @param releaseService - Canvas release coordinator
     * @returns Existing or newly persisted release preview
     */
    async previewRelease(courseId: string, submissionId: string, releaseService: CanvasReleaseService) {
        const submission = await this.requireSubmission(courseId, submissionId);
        const assignment = await this.requireAssignment(courseId, submission.assignmentId);
        const feedbackRun = await this.mongo.getLatestWritingFeedbackRun(submissionId);
        if (!feedbackRun) throw new Error('Generate feedback before a release preview');
        this.assertCurrentRubric(feedbackRun.rubricVersion, assignment);
        const latestReview = submission.reviews?.[submission.reviews.length - 1];
        const pdf = await this.pdfService.render({
            assignment,
            submission,
            feedback: feedbackRun.result,
            grade: resolveNumericGrade(feedbackRun.result, assignment.gradeMapping),
            staffFeedback: latestReview?.studentFeedback
        });
        return releaseService.preview({ submission, assignment, feedbackRun, pdf });
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
        const submission = await this.requireSubmission(courseId, submissionId);
        const assignment = await this.requireAssignment(courseId, submission.assignmentId);
        const feedbackRun = await this.mongo.getLatestWritingFeedbackRun(submissionId);
        if (!feedbackRun) throw new Error('Generate feedback before release');
        this.assertCurrentRubric(feedbackRun.rubricVersion, assignment);
        const latestReview = submission.reviews?.[submission.reviews.length - 1];
        const pdf = await this.pdfService.render({
            assignment,
            submission,
            feedback: feedbackRun.result,
            grade: resolveNumericGrade(feedbackRun.result, assignment.gradeMapping),
            staffFeedback: latestReview?.studentFeedback
        });
        const release = await releaseService.release({ submission, assignment, feedbackRun, pdf });
        // Mark local completion only after the release boundary returns a terminal record.
        await this.mongo.setWritingSubmissionStatus(courseId, submissionId, 'released');
        return release;
    }

    private async requireSubmission(courseId: string, submissionId: string): Promise<ReviewableSubmission> {
        const submission = await this.mongo.getWritingSubmission(courseId, submissionId);
        if (!submission) throw new Error('Writing submission not found');
        return submission;
    }

    private async requireAssignment(courseId: string, assignmentId: string): Promise<WritingAssignment> {
        const assignment = await this.mongo.getWritingAssignment(courseId, assignmentId);
        if (!assignment) throw new Error('Writing assignment not found');
        return assignment;
    }

    private assertCurrentRubric(runRubricVersion: number | undefined, assignment: WritingAssignment): void {
        // Legacy runs predate explicit provenance and are treated as profile version 1.
        const effectiveRunVersion = runRubricVersion ?? 1;
        if (effectiveRunVersion !== assignment.rubric.version) {
            throw new Error('Rubric changed after feedback generation; regenerate feedback before approval or release');
        }
    }
}
