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
    CanvasReleaseInput,
    CanvasReleaseService,
    FeedbackPdfInclude,
    FeedbackPdfLens,
    StaffReviewRevision,
    WritingAssignment,
    WritingFeedbackEngine,
    WritingFeedbackLens,
    WritingFeedbackRunTrace,
    WritingFeedbackResult,
    WritingFeedbackRun,
    WritingJob,
    WritingRubricDefinition,
    WritingRelease,
    WritingSubmission
} from './contracts';
import { RELEASE_LOCK_TTL_MS } from './contracts';
import { computeReleaseFingerprint } from './canvas-release-service';
import { seedCommentsFromRun, stampCommentAuthors, validateAnchoredComments, withStaleFlags, type AnchoredCommentWithState } from './anchored-comments';
import { RubricWritingFeedbackEngine } from './feedback-engine';
import { TECHNICAL_PROMPT_VERSION, TechnicalWritingFeedbackEngine } from './technical-feedback-engine';
import { lensesForAssignment, selectRubric } from './rubric-lens';
import { ModelSelectionService } from '../dashboard-setting/model-selection-service';
import { StudentWritingFeedbackPdfService } from '../report-generation/writing-feedback-report';
import { buildStaffFinalAssessment, gradedLensFor, type StaffFinalAssessmentInput } from './staff-final-assessment';
import {
    MAX_SUBMISSION_RELEASES,
    countCompletedReleases,
    nextReleaseRevision,
    releaseCapMessage
} from './release-cap';
import { SanitizedJobError } from './job-runner';
import { resolveQueuedReleaseService } from './queued-release-service';
import { requireCompleteSflProfile } from './sfl-analysis';
import { appLogger } from '../utils/logger';

/**
 * Fixed, developer-authored error strings this codebase throws for known validation
 * failures (never model- or student-derived text) — safe to log verbatim. Anything
 * outside this set (SDK errors, zod issues, etc.) must log only its error type.
 */
/**
 * isDuplicateKeyError - whether Mongo refused a write because a unique index already held it.
 *
 * @param error - Whatever the insert threw
 * @returns True for a duplicate-key violation, which a race is allowed to treat as success
 */
function isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error
        && (error as { code?: unknown }).code === 11000;
}

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
    /** Latest persisted Canvas release state, including any reconciliation requirement. */
    release: WritingRelease | null;
    /** How many times this submission's feedback has reached the student in Canvas. */
    releaseCount: number;
    /** The cap, sent so the page names the limit rather than hard-coding it. */
    maxReleases: number;
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
        private readonly technicalEngine?: WritingFeedbackEngine,
        /**
         * How a queued release rebuilds its Canvas coordinator without a request.
         *
         * Injected so the queued path can be tested without Canvas configuration, tokens, or a
         * course link; production always passes through {@link resolveQueuedReleaseService}.
         */
        private readonly resolveQueuedRelease = resolveQueuedReleaseService
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
        const release = await this.mongo.getLatestWritingRelease(courseId, submissionId);
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
        // Release counts travel with the detail so the review page can say a submission has
        // been revised without fetching and counting its release history itself.
        const priorReleases = await this.mongo.listWritingReleases(courseId, submissionId);
        return {
            submission,
            feedbackRun,
            technicalFeedbackRun,
            comments,
            seedComments,
            release,
            releaseCount: countCompletedReleases(priorReleases),
            maxReleases: MAX_SUBMISSION_RELEASES
        };
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
        revision: Omit<StaffReviewRevision, 'id' | 'createdAt' | 'submissionId' | 'finalAssessment'> & {
            finalAssessment?: StaffFinalAssessmentInput;
        },
        staffName?: string
    ): Promise<StaffReviewRevision> {
        const submission = await this.requireSubmission(courseId, submissionId);
        if (submission.status === 'released') {
            throw new Error('Released feedback cannot be edited; create a new attempt for a revised release');
        }
        await this.assertNoReleaseInFlight(courseId, submissionId);
        let comments = revision.comments;
        if (comments?.length) {
            // Attribution is server-derived: carried from the prior snapshot or stamped
            // with the saving staff member for comments new to this revision.
            const previous = [...(submission.reviews ?? [])].reverse().find((review) => review.comments)?.comments ?? [];
            comments = stampCommentAuthors(comments, previous, staffName);
            // Validate offsets against the current verified text immediately before persistence.
            validateAnchoredComments(comments, submission.verifiedText ?? '');
        }
        const { finalAssessment: finalAssessmentInput, ...reviewFields } = revision;
        let finalAssessment;
        if (finalAssessmentInput) {
            const assignment = await this.requireAssignment(courseId, submission.assignmentId);
            // A lab report is graded on its technical rubric, not its writing one, so the
            // grade is validated against the lens that actually carries it.
            const lens = gradedLensFor(assignment);
            const gradedRubric = selectRubric(assignment, lens).approved;
            if (!gradedRubric) {
                throw new Error('Approve the rubric this assignment is graded on before saving a final grade');
            }
            finalAssessment = buildStaffFinalAssessment(finalAssessmentInput, gradedRubric, lens);
        }
        return this.mongo.appendWritingReview(courseId, submissionId, {
            ...reviewFields,
            comments,
            ...(finalAssessment ? { finalAssessment } : {})
        });
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
    async renderPdf(
        courseId: string,
        submissionId: string,
        include: FeedbackPdfInclude = 'general',
        lens: FeedbackPdfLens = 'writing'
    ): Promise<Buffer> {
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
            grade: latestReview?.finalAssessment?.totalPoints,
            staffFeedback: latestReview?.studentFeedback,
            comments,
            include,
            lens,
            finalAssessment: latestReview?.finalAssessment,
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
        const revision = await this.requireReleasableSubmission(courseId, submission);
        const feedbackRun = await this.mongo.getLatestWritingFeedbackRun(submissionId);
        if (!feedbackRun) throw new Error('Generate feedback before a release preview');
        this.assertCurrentRubric(feedbackRun.rubricVersion, assignment);
        const { technicalRun, technicalRubric } = await this.loadTechnicalLens(submissionId, assignment);
        const latestReview = submission.reviews?.[submission.reviews.length - 1];
        // One document per submission. A lab report carries its technical feedback inside the
        // same PDF, ahead of the writing feedback, rather than arriving as a second attachment
        // a student has to open separately.
        const completePdf = await this.pdfService.render({
            assignment,
            submission,
            feedback: feedbackRun.result,
            grade: latestReview?.finalAssessment?.totalPoints,
            staffFeedback: latestReview?.studentFeedback,
            finalAssessment: latestReview?.finalAssessment,
            ...(technicalRun && technicalRubric
                ? { technicalFeedback: technicalRun.result, technicalRubric }
                : {}),
            include: 'both',
            lens: 'writing'
        });
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
            finalAssessment: latestReview?.finalAssessment,
            studentFeedback: latestReview?.studentFeedback,
            ...(technicalRun ? { technicalFeedbackRun: technicalRun } : {})
        });
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
        const submission = await this.requireSubmission(courseId, submissionId);
        await this.requireReleasableSubmission(courseId, submission);
        if (submission.status !== 'approved') throw new Error('Staff approval is required before Canvas release');
        // One queued release per submission: a second click must join the first attempt rather
        // than schedule another Canvas comment.
        const existing = await this.mongo.findActiveWritingJob(courseId, submissionId, 'release');
        if (existing) return existing;

        const release = await this.mongo.getLatestWritingRelease(courseId, submissionId);
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
        const claimed = await this.mongo.claimWritingReleaseForQueue(release.payloadFingerprint, { queuedByUserId });
        if (!claimed) {
            const concurrent = await this.mongo.findActiveWritingJob(courseId, submissionId, 'release');
            if (concurrent) return concurrent;
            throw new Error('A release for this submission is already in progress.');
        }

        let job: WritingJob;
        try {
            job = await this.mongo.enqueueWritingJob({
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
            await this.mongo.releaseWritingReleaseLock(release.payloadFingerprint);
            // The unique partial index refused a second queued release for this submission.
            // The job that beat this one is the answer the caller wanted, not an error.
            if (!isDuplicateKeyError(error)) throw error;
            const concurrent = await this.mongo.findActiveWritingJob(courseId, submissionId, 'release');
            if (concurrent) return concurrent;
            throw new Error('A release for this submission is already in progress.');
        }
        // Recorded after the fact: the claim is what prevents a second release, and the job id
        // is the audit trail that says which run carried this one out.
        await this.mongo.finalizeWritingRelease(release.payloadFingerprint, { releaseJobId: job.id });
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
        const release = await this.mongo.getLatestWritingRelease(courseId, submissionId);
        if (!release) throw new SanitizedJobError('The release record for this submission is missing; preview the release again.');
        if (release.status === 'released' || release.status === 'reconciled') return;
        // Reconciliation is a human decision about a Canvas write nobody can confirm. The queue
        // must leave it alone rather than retry it.
        if (release.status === 'reconciliation_required') return;
        if (!release.queuedByUserId) {
            throw new SanitizedJobError('This release was queued without a staff Canvas account; release it again from the review page.');
        }

        const resolved = await this.resolveQueuedRelease(this.mongo, courseId, release.queuedByUserId);
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
        } finally {
            // However this ended, the next attempt reads how far it got from the release
            // status; holding the lock past the run would only make staff wait out the
            // abandonment window before they could retry.
            await this.mongo.releaseWritingReleaseLock(release.payloadFingerprint);
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
        const feedbackRun = await this.mongo.getLatestWritingFeedbackRun(submission.id);
        if (!feedbackRun) return null;
        const assignment = await this.requireAssignment(submission.courseId, submission.assignmentId);
        const { technicalRun } = await this.loadTechnicalLens(submission.id, assignment);
        const latestReview = submission.reviews?.[submission.reviews.length - 1];
        return computeReleaseFingerprint({
            submissionId: submission.id,
            feedbackRunId: feedbackRun.id,
            rubricVersion: feedbackRun.rubricVersion,
            grade: latestReview?.finalAssessment?.totalPoints,
            studentFeedback: latestReview?.studentFeedback,
            technicalFeedbackRunId: technicalRun?.id,
            finalAssessment: latestReview?.finalAssessment
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
    private async assertNoReleaseInFlight(courseId: string, submissionId: string): Promise<void> {
        const release = await this.mongo.getLatestWritingRelease(courseId, submissionId);
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
     * {@link MAX_SUBMISSION_RELEASES} times may not add another Canvas comment. Attempts that
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
        const priorReleases = await this.mongo.listWritingReleases(courseId, submission.id);
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
        const submission = await this.requireSubmission(courseId, submissionId);
        const assignment = await this.requireAssignment(courseId, submission.assignmentId);
        // Release is reachable without a preview, so the cap is enforced here too rather than
        // only on the path that usually precedes it.
        const revision = await this.requireReleasableSubmission(courseId, submission);
        const feedbackRun = await this.mongo.getLatestWritingFeedbackRun(submissionId);
        if (!feedbackRun) throw new Error('Generate feedback before release');
        this.assertCurrentRubric(feedbackRun.rubricVersion, assignment);
        const { technicalRun, technicalRubric } = await this.loadTechnicalLens(submissionId, assignment);
        const latestReview = submission.reviews?.[submission.reviews.length - 1];
        // One document per submission. A lab report carries its technical feedback inside the
        // same PDF, ahead of the writing feedback, rather than arriving as a second attachment
        // a student has to open separately.
        const completePdf = await this.pdfService.render({
            assignment,
            submission,
            feedback: feedbackRun.result,
            grade: latestReview?.finalAssessment?.totalPoints,
            staffFeedback: latestReview?.studentFeedback,
            finalAssessment: latestReview?.finalAssessment,
            ...(technicalRun && technicalRubric
                ? { technicalFeedback: technicalRun.result, technicalRubric }
                : {}),
            include: 'both',
            lens: 'writing'
        });
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
            finalAssessment: latestReview?.finalAssessment,
            studentFeedback: latestReview?.studentFeedback,
            ...(technicalRun ? { technicalFeedbackRun: technicalRun } : {})
        });
        // Mark local completion only after both the Canvas comment and async grade job are confirmed.
        if (release.status === 'released' || release.status === 'reconciled') {
            // Compare-and-set on `approved`: a submission staff have moved on from since this
            // release started must not be relabelled as released, because what reached the
            // student is no longer what the record would then claim.
            const marked = await this.mongo.setWritingSubmissionStatus(courseId, submissionId, 'released', ['approved']);
            if (!marked) {
                appLogger.log('[writing-feedback] release landed but the submission had moved on:', 'release_status_conflict');
            }
        }
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
