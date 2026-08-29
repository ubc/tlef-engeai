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
    AnchoredComment,
    CanvasReleaseService,
    FeedbackPdfInclude,
    StaffReviewRevision,
    WritingAssignment,
    WritingFeedbackEngine,
    WritingFeedbackLens,
    WritingFeedbackRunTrace,
    WritingFeedbackResult,
    WritingFeedbackRun,
    WritingJob,
    WritingRubricDefinition,
    WritingSubmission
} from './contracts';
import { seedCommentsFromRun, stampCommentAuthors, validateAnchoredComments, withStaleFlags, type AnchoredCommentWithState } from './anchored-comments';
import { RubricWritingFeedbackEngine } from './feedback-engine';
import { TECHNICAL_PROMPT_VERSION, TechnicalWritingFeedbackEngine } from './technical-feedback-engine';
import { lensesForAssignment, selectRubric } from './rubric-lens';
import { ModelSelectionService } from '../dashboard-setting/model-selection-service';
import { StudentWritingFeedbackPdfService } from '../report-generation/writing-feedback-report';
import { resolveNumericGrade } from './feedback-schema';
import { requireCompleteSflProfile } from './sfl-analysis';
import { appLogger } from '../utils/logger';

/**
 * Fixed, developer-authored error strings this codebase throws for known validation
 * failures (never model- or student-derived text) — safe to log verbatim. Anything
 * outside this set (SDK errors, zod issues, etc.) must log only its error type.
 */
const SAFE_TO_LOG_MESSAGES = new Set([
    'An approved rubric requires performance levels',
    'Feedback referenced an unknown SFL finding',
    'Feedback referenced a course material outside the retrieval allowlist',
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
    'SFL analysis returned too many findings'
]);

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

type GeneratedFeedbackWithTrace = WritingFeedbackResult & { runTrace?: WritingFeedbackRunTrace };

type ReviewableSubmission = WritingSubmission & { reviews?: StaffReviewRevision[] };

/** Staff detail payload combining persistent state with safe read-time comment derivations. */
export interface SubmissionDetail {
    submission: ReviewableSubmission; // submission plus append-only review history
    feedbackRun: WritingFeedbackRun | null; // latest immutable linguistic model draft
    /** Latest immutable technical draft; null for assignments without the technical lens. */
    technicalFeedbackRun: WritingFeedbackRun | null;
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
    /** Memoised technical engine; built at most once, and only if the technical lens ever runs. */
    private lazyTechnicalEngine?: WritingFeedbackEngine;

    /**
     * Creates the lifecycle service with injectable generation and PDF implementations.
     *
     * @param mongo - Persistence façade for course-scoped Writing Feedback records
     * @param engine - Structured linguistic feedback generator; defaults to the rubric-driven engine
     * @param pdfService - Student-safe renderer; defaults to the PDFKit implementation
     * @param technicalEngine - Structured technical feedback generator for lab reports; a test
     *   double passed here always takes precedence. Left undefined in production so the real
     *   LLM-backed engine (and its client construction) is built lazily, only the first time a
     *   lab report's technical lens actually runs, and never for assignments that are not lab reports.
     */
    constructor(
        private readonly mongo: EngEAI_MongoDB,
        private readonly engine: WritingFeedbackEngine = new RubricWritingFeedbackEngine(),
        private readonly pdfService = new StudentWritingFeedbackPdfService(),
        private readonly technicalEngine?: WritingFeedbackEngine
    ) {}

    /**
     * Resolves the technical engine, constructing the default implementation at most once.
     *
     * @returns The injected test double, or the lazily-built default technical engine
     */
    private getTechnicalEngine(): WritingFeedbackEngine {
        if (this.technicalEngine) return this.technicalEngine;
        if (!this.lazyTechnicalEngine) this.lazyTechnicalEngine = new TechnicalWritingFeedbackEngine();
        return this.lazyTechnicalEngine;
    }

    /**
     * Generates an immutable feedback run for every lens this assignment requires.
     *
     * The linguistic lens is mandatory: its failure fails the submission and rethrows. The
     * technical lens runs only for a lab report whose technical rubric is currently approved,
     * and it is best-effort — its failure leaves the linguistic draft reviewable rather than
     * discarding it. Every model error (linguistic or technical) can carry prompt/student
     * content, so none of it is ever logged.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission selected by staff
     * @returns Validated model drafts keyed by lens; a skipped or failed lens is absent
     * @throws Error when verification, assignment lookup, or linguistic generation fails
     */
    async generate(
        courseId: string,
        submissionId: string
    ): Promise<Partial<Record<WritingFeedbackLens, WritingFeedbackResult>>> {
        // Verified text is the only student content allowed across the model boundary.
        const submission = await this.requireSubmission(courseId, submissionId);
        if (submission.requiresVerification || !submission.verifiedText?.trim()) {
            throw new Error('Staff must verify the submission text before feedback generation');
        }
        const assignment = await this.requireAssignment(courseId, submission.assignmentId);
        const verifiedText = submission.verifiedText;
        // Expose a durable in-progress state before the asynchronous model call begins.
        await this.mongo.setWritingSubmissionStatus(courseId, submissionId, 'generating');

        const llmCallOptions = await ModelSelectionService.getInstance().buildFeatureLlmCallOptions(
            courseId,
            'writingFeedback'
        );
        const results: Partial<Record<WritingFeedbackLens, WritingFeedbackResult>> = {};

        try {
            results.linguistic = await this.runLens('linguistic', {
                courseId, submissionId, assignment, verifiedText, llmCallOptions
            });
        } catch (error) {
            // Preserve a visible retryable failure state. The description is content-free by
            // construction, so an operator can tell a schema rejection from a rate limit from
            // an evidence mismatch without any student text reaching the log.
            appLogger.log('[writing-feedback] linguistic lens failed:', describeFailureSafely(error));
            await this.mongo.setWritingSubmissionStatus(courseId, submissionId, 'failed');
            throw error;
        }

        // The technical lens only ever applies to a lab report with a currently-approved rubric.
        if (lensesForAssignment(assignment).includes('technical') && selectRubric(assignment, 'technical').approved) {
            try {
                results.technical = await this.runLens('technical', {
                    courseId, submissionId, assignment, verifiedText, llmCallOptions
                });
            } catch (error) {
                // Not rethrown: a technical failure must leave the linguistic draft reviewable
                // (D-058). It is described rather than swallowed silently, because an
                // undiagnosable missing draft is an operational dead end — and
                // describeFailureSafely never emits model or student content.
                appLogger.log('[writing-feedback] technical lens failed:', describeFailureSafely(error));
            }
        }

        await this.mongo.setWritingSubmissionStatus(courseId, submissionId, 'draft_ready');
        return results;
    }

    /**
     * Enqueues linguistic/technical generation without sending student text in the job.
     *
     * This is the HTTP-facing async contract: it validates the same prerequisites that
     * would otherwise fail immediately, marks the submission as generating, and queues
     * only internal ids. Duplicate queued/leased jobs are returned instead of creating
     * additional model attempts.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission selected by staff
     * @returns Active or newly queued generate job
     * @throws Error when verification or approved-rubric prerequisites are missing
     */
    async enqueueGeneration(courseId: string, submissionId: string): Promise<WritingJob> {
        const submission = await this.requireSubmission(courseId, submissionId);
        if (submission.requiresVerification || !submission.verifiedText?.trim()) {
            throw new Error('Staff must verify the submission text before feedback generation');
        }
        const assignment = await this.requireAssignment(courseId, submission.assignmentId);
        if (!assignment.rubric || assignment.rubric.status !== 'approved') {
            throw new Error('An approved rubric is required before feedback generation');
        }
        requireCompleteSflProfile(assignment.rubric.sflContext);
        const existing = await this.mongo.findActiveWritingJob(courseId, submissionId, 'generate');
        if (existing) return existing;

        await this.mongo.setWritingSubmissionStatus(courseId, submissionId, 'generating');
        return this.mongo.enqueueWritingJob({
            courseId,
            type: 'generate',
            state: 'queued',
            maxAttempts: 3,
            payload: { submissionId }
        });
    }

    /**
     * Generates and persists one lens's immutable run against its currently-approved rubric.
     *
     * @param lens - Lens to generate; selects the engine and stamped prompt version
     * @param input - Shared generation context common to every lens
     * @returns Validated structured model draft for this lens
     * @throws Error when this lens has no approved rubric, or the engine call fails
     */
    private async runLens(
        lens: WritingFeedbackLens,
        input: {
            courseId: string;
            submissionId: string;
            assignment: WritingAssignment;
            verifiedText: string;
            llmCallOptions: Awaited<ReturnType<ModelSelectionService['buildFeatureLlmCallOptions']>>;
        }
    ): Promise<WritingFeedbackResult> {
        const engine = lens === 'technical' ? this.getTechnicalEngine() : this.engine;
        const rubric = selectRubric(input.assignment, lens).approved;
        if (!rubric) throw new Error(`An approved ${lens} rubric is required before feedback generation`);
        const result = await engine.generate({
            assignment: input.assignment,
            verifiedText: input.verifiedText,
            llmCallOptions: input.llmCallOptions
        }) as GeneratedFeedbackWithTrace;
        const { runTrace, ...storedResult } = result;
        // Persist immutable provenance before declaring the draft review-ready.
        await this.mongo.createWritingFeedbackRun({
            courseId: input.courseId,
            assignmentId: input.assignment.id,
            submissionId: input.submissionId,
            profileVersion: input.assignment.profileVersion,
            rubricVersion: rubric.version,
            lens,
            result: storedResult,
            modelMetadata: {
                engine: engine.constructor.name,
                promptVersion: lens === 'technical'
                    ? TECHNICAL_PROMPT_VERSION
                    : (runTrace?.writerPromptVersion ?? 'writing-feedback-v2')
            },
            ...(lens === 'linguistic' && runTrace ? runTrace : {})
        });
        return storedResult;
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
        const technicalFeedbackRun = await this.mongo.getLatestWritingFeedbackRun(submissionId, 'technical');
        const verifiedText = submission.verifiedText ?? '';
        const assignment = feedbackRun
            ? await this.requireAssignment(courseId, submission.assignmentId)
            : null;
        const runRubric = feedbackRun && assignment
            ? [assignment.rubric, ...(assignment.rubricHistory ?? [])]
                .find((rubric) => rubric.version === feedbackRun.rubricVersion)
            : undefined;
        // The newest revision that snapshots comments is authoritative, even if newer prose exists.
        const latestWithComments = [...(submission.reviews ?? [])].reverse().find((review) => review.comments);
        const comments = latestWithComments?.comments
            ? withStaleFlags(latestWithComments.comments, verifiedText)
            : [];
        // Model evidence remains transient until staff explicitly saves a first comment revision.
        const seedComments = !latestWithComments && feedbackRun && verifiedText
            ? seedCommentsFromRun(feedbackRun, verifiedText, runRubric)
            : [];
        return { submission, feedbackRun, technicalFeedbackRun, comments, seedComments };
    }

    /**
     * Appends one staff revision after validating every exact-span comment checksum.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission being reviewed
     * @param revision - Staff-authored narrative and optional complete comment snapshot
     * @param staffName - Display name of the saving staff member; attributes their new comments
     * @returns Persisted append-only review revision
     * @throws Error when feedback is already released or any anchor is stale
     */
    async appendReview(
        courseId: string,
        submissionId: string,
        revision: Omit<StaffReviewRevision, 'id' | 'createdAt' | 'submissionId'>,
        staffName?: string
    ): Promise<StaffReviewRevision> {
        const submission = await this.requireSubmission(courseId, submissionId);
        if (submission.status === 'released') {
            throw new Error('Released feedback cannot be edited; create a new attempt for a revised release');
        }
        let comments = revision.comments;
        if (comments?.length) {
            // Attribution is server-derived: carried from the prior snapshot or stamped
            // with the saving staff member for comments new to this revision.
            const previous = [...(submission.reviews ?? [])].reverse().find((review) => review.comments)?.comments ?? [];
            comments = stampCommentAuthors(comments, previous, staffName);
            // Validate offsets against the current verified text immediately before persistence.
            validateAnchoredComments(comments, submission.verifiedText ?? '');
        }
        return this.mongo.appendWritingReview(courseId, submissionId, { ...revision, comments });
    }

    /**
     * Records explicit human approval for a draft generated with the current rubric.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Draft-ready submission to approve
     * @param staffUserId - Internal approving actor
     * @param staffName - Optional display name used as PDF annotation author
     * @returns Approved submission from persistence
     * @throws Error when a required lens has no current run, its rubric changed since
     *   generation, or the submission is not draft-ready
     */
    async approve(courseId: string, submissionId: string, staffUserId: string, staffName?: string) {
        const submission = await this.requireSubmission(courseId, submissionId);
        const assignment = await this.requireAssignment(courseId, submission.assignmentId);

        for (const lens of lensesForAssignment(assignment)) {
            const rubric = selectRubric(assignment, lens).approved;
            // A lab report whose technical rubric was never approved cannot owe a technical run.
            if (lens === 'technical' && !rubric) continue;
            const run = await this.mongo.getLatestWritingFeedbackRun(submissionId, lens);
            if (!run) {
                throw new Error(lens === 'technical'
                    ? 'Generate technical feedback before staff approval'
                    : 'Generate feedback before staff approval');
            }
            this.assertCurrentRubricForLens(run.rubricVersion, rubric, lens);
        }

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
        const { technicalRun, technicalRubric } = await this.loadTechnicalLens(submissionId, assignment);
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
            annotationAuthor: submission.approvedByName,
            ...(technicalRun && technicalRubric
                ? { technicalFeedback: technicalRun.result, technicalRubric }
                : {})
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
        const { technicalRun, technicalRubric } = await this.loadTechnicalLens(submissionId, assignment);
        const latestReview = submission.reviews?.[submission.reviews.length - 1];
        const pdf = await this.pdfService.render({
            assignment,
            submission,
            feedback: feedbackRun.result,
            grade: resolveNumericGrade(feedbackRun.result, assignment.gradeMapping),
            staffFeedback: latestReview?.studentFeedback,
            ...(technicalRun && technicalRubric
                ? { technicalFeedback: technicalRun.result, technicalRubric }
                : {})
        });
        return releaseService.preview({
            submission,
            assignment,
            feedbackRun,
            pdf,
            studentFeedback: latestReview?.studentFeedback,
            ...(technicalRun ? { technicalFeedbackRun: technicalRun } : {})
        });
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
        const { technicalRun, technicalRubric } = await this.loadTechnicalLens(submissionId, assignment);
        const latestReview = submission.reviews?.[submission.reviews.length - 1];
        const pdf = await this.pdfService.render({
            assignment,
            submission,
            feedback: feedbackRun.result,
            grade: resolveNumericGrade(feedbackRun.result, assignment.gradeMapping),
            staffFeedback: latestReview?.studentFeedback,
            ...(technicalRun && technicalRubric
                ? { technicalFeedback: technicalRun.result, technicalRubric }
                : {})
        });
        const release = await releaseService.release({
            submission,
            assignment,
            feedbackRun,
            pdf,
            studentFeedback: latestReview?.studentFeedback,
            ...(technicalRun ? { technicalFeedbackRun: technicalRun } : {})
        });
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

    /**
     * Loads the technical draft and rubric for a PDF/release call, refusing a stale draft.
     *
     * Mirrors {@link approve}: an assignment that is not a lab report, or whose technical
     * rubric was never approved, owes no technical draft at all, so no run is even fetched.
     * Once an approved technical rubric exists, any existing run is checked against it with
     * the same staleness rule approval already enforces, before the caller renders or releases.
     *
     * @param submissionId - Submission whose technical draft is being resolved
     * @param assignment - Assignment supplying the technical lens's approved rubric, if any
     * @returns The latest technical run (or null when none applies yet) and its rubric
     * @throws Error when a technical run exists but predates the currently-approved technical rubric
     */
    private async loadTechnicalLens(
        submissionId: string,
        assignment: WritingAssignment
    ): Promise<{ technicalRun: WritingFeedbackRun | null; technicalRubric: WritingRubricDefinition | undefined }> {
        if (!lensesForAssignment(assignment).includes('technical')) {
            return { technicalRun: null, technicalRubric: undefined };
        }
        const technicalRubric = selectRubric(assignment, 'technical').approved;
        if (!technicalRubric) return { technicalRun: null, technicalRubric: undefined };
        const technicalRun = await this.mongo.getLatestWritingFeedbackRun(submissionId, 'technical');
        if (technicalRun) this.assertCurrentRubricForLens(technicalRun.rubricVersion, technicalRubric, 'technical');
        return { technicalRun, technicalRubric };
    }

    /**
     * Checks one lens's run against its currently-approved rubric version.
     *
     * @param runRubricVersion - Rubric version stamped on the run being checked
     * @param rubric - This lens's currently-approved rubric, if any
     * @param lens - Lens being checked, selecting the error message
     * @throws Error when the rubric is missing or the run predates the current approval
     */
    private assertCurrentRubricForLens(
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
}
