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
    SummarySource,
    WritingAssignment,
    WritingFeedbackEngine,
    WritingFeedbackLens,
    WritingFeedbackRunTrace,
    WritingFeedbackResult,
    WritingFeedbackRun,
    WritingJob,
    WritingRubricDefinition,
    WritingRelease,
    WritingPendingReplacement,
    WritingSubmission
} from './contracts';
import { RELEASE_LOCK_TTL_MS } from './contracts';
import { computeReleaseFingerprint } from './canvas-release-service';
import { seedCommentsFromRun, stampCommentAuthors, validateAnchoredComments, withStaleFlags, type AnchoredCommentWithState } from './anchored-comments';
import { NO_REVISION_GOALS_MESSAGE, RubricWritingFeedbackEngine } from './feedback-engine';
import { TECHNICAL_PROMPT_VERSION, TechnicalWritingFeedbackEngine } from './technical-feedback-engine';
import { lensesForAssignment, selectRubric, rubricForVersion } from './rubric-lens';
import { ModelSelectionService } from '../dashboard-setting/model-selection-service';
import { StudentWritingFeedbackPdfService } from '../report-generation/writing-feedback-report';
import {
    APPROVAL_REQUIRES_GRADE_MESSAGE,
    buildStaffAssessmentDraft,
    buildStaffFinalAssessment,
    gradedLensFor,
    rubricSupportsStaffAssessment,
    type StaffAssessmentDraftInput,
    type StaffFinalAssessmentInput
} from './staff-final-assessment';
import {
    MAX_SUBMISSION_RELEASES,
    countCompletedReleases,
    nextReleaseRevision,
    releaseCapMessage
} from './release-cap';
import { SanitizedJobError } from './job-runner';
import { resolveQueuedReleaseService } from './queued-release-service';
import {
    TEXT_EDITED_MESSAGE,
    TRANSCRIPT_EDITABLE_STATUSES,
    reviewsSinceTextEdit,
    runPredatesTextEdit
} from './transcript-edit';
import { requireCompleteSflProfile } from './sfl-analysis';
import { appLogger } from '../utils/logger';
import { fingerprintAnnotations } from './annotation-fingerprint';
import { assertSummaryEditsBound } from './summary-edits';
import { assertStaffCriteriaWritten } from './criterion-assessment';
import { LlmSummaryRedraftEngine, SUMMARY_REDRAFT_FAILED_MESSAGE, type SummaryRedraftEngine } from './summary-redraft-engine';
import {
    applySummaryToResult,
    bindingStudentFeedback,
    bindingSummaryEdit,
    buildRedraftRun,
    commentsForLens,
    resolveLensComments,
    rubricForRun
} from './summary-sources';

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
    'SFL analysis returned too many findings',
    NO_REVISION_GOALS_MESSAGE
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

/** Refusal for a redraft requested once the submission has left `draft_ready`. */
export const REDRAFT_NOT_DRAFT_READY_MESSAGE = 'The summary can only be redrafted before approval';

/** Refusal for a staff edit while the worker is replacing the submission's draft. */
export const REVIEW_WHILE_GENERATING_MESSAGE = 'Wait for feedback generation to finish before editing this submission';

/** Refusal for approval while the worker is replacing the submission's draft. */
export const APPROVE_WHILE_GENERATING_MESSAGE = 'Wait for feedback generation to finish before approving this submission';

type GeneratedFeedbackWithTrace = WritingFeedbackResult & { runTrace?: WritingFeedbackRunTrace };

type ReviewableSubmission = WritingSubmission & { reviews?: StaffReviewRevision[] };

/** Detail submission, with the newer Canvas attempt waiting to replace it when there is one. */
type DetailSubmission = ReviewableSubmission & { pendingReplacement?: WritingPendingReplacement };

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
    /** Memoised summary redraft engine, built only when a redraft actually runs. */
    private lazyRedraftEngine?: SummaryRedraftEngine;

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
        private readonly resolveQueuedRelease = resolveQueuedReleaseService,
        /** Summary redraft engine; a test double here always wins, production builds one lazily. */
        private readonly redraftEngine?: SummaryRedraftEngine
    ) {}

    /**
     * Resolves the summary redraft engine, constructing the default implementation at most once.
     *
     * @returns The injected test double, or the lazily-built default redraft engine
     */
    private getRedraftEngine(): SummaryRedraftEngine {
        if (this.redraftEngine) return this.redraftEngine;
        if (!this.lazyRedraftEngine) this.lazyRedraftEngine = new LlmSummaryRedraftEngine();
        return this.lazyRedraftEngine;
    }

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
     * The linguistic lens is mandatory: its failure rethrows, and marks the submission failed
     * unless `markFailed` is false (the worker passes false while it still has retries). The
     * technical lens runs only for a lab report whose technical rubric is currently approved,
     * and it is best-effort — its failure leaves the linguistic draft reviewable rather than
     * discarding it. Every model error (linguistic or technical) can carry prompt/student
     * content, so none of it is ever logged.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission selected by staff
     * @param options - `markFailed: false` leaves the submission generating when the linguistic lens fails
     * @returns Validated model drafts keyed by lens; a skipped or failed lens is absent
     * @throws Error when verification, assignment lookup, or linguistic generation fails
     */
    async generate(
        courseId: string,
        submissionId: string,
        options: { markFailed?: boolean } = {}
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
            if (options.markFailed !== false) {
                await this.mongo.setWritingSubmissionStatus(courseId, submissionId, 'failed', ['generating']);
            }
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

        // Only a submission still generating moves on; one deleted or stopped meanwhile stays as it is.
        await this.mongo.setWritingSubmissionStatus(courseId, submissionId, 'draft_ready', ['generating']);
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
     * editTranscript - corrects a submission's confirmed text after it was first confirmed.
     *
     * Existing feedback is anchored to the old text, so the submission returns to `imported`
     * (withdrawing any approval) and needs generating again; annotations and summary edits saved
     * before the edit are no longer loaded. Grades and the internal note stay in the history and
     * carry forward. Unchanged text is not an edit and changes nothing.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission whose text is corrected
     * @param text - Corrected text
     * @returns The updated submission, or the unchanged one when the text did not change
     * @throws Error when the text is empty, still awaiting first confirmation, generating,
     *   released, or a release is in progress
     */
    async editTranscript(courseId: string, submissionId: string, text: string): Promise<WritingSubmission> {
        const submission = await this.requireSubmission(courseId, submissionId);
        if (!text.trim()) throw new Error('The submission text cannot be empty');
        if (submission.requiresVerification) throw new Error('Confirm the extracted text before editing it');
        if (submission.status === 'generating') throw new Error(REVIEW_WHILE_GENERATING_MESSAGE);
        if (submission.status === 'released') {
            throw new Error('Released feedback cannot be edited; create a new attempt for a revised release');
        }
        await this.assertNoReleaseInFlight(courseId, submissionId);
        // Confirming trims surrounding whitespace, so that alone is not a correction.
        if (text.trim() === (submission.verifiedText ?? '').trim()) return submission;

        const updated = await this.mongo.editWritingTranscript(courseId, submissionId, text, TRANSCRIPT_EDITABLE_STATUSES);
        if (!updated) throw new Error('This submission changed while you were editing. Reload it and try again.');
        return updated;
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
        const assignment = feedbackRun || technicalFeedbackRun
            ? await this.requireAssignment(courseId, submission.assignmentId)
            : null;

        // Step 1: the newest saved revision that snapshotted comments (legacy fields kept as before).
        // Revisions from before a text edit are anchored to the old text and no longer apply.
        const latestWithComments = [...reviewsSinceTextEdit(submission)].reverse().find((review) => review.comments);
        const comments = latestWithComments?.comments ? withStaleFlags(latestWithComments.comments, verifiedText) : [];
        const runsByLens: Record<WritingFeedbackLens, WritingFeedbackRun | null> = {
            linguistic: feedbackRun,
            technical: technicalFeedbackRun
        };

        // Step 2: per lens, seeds from its latest run, then the newest of revision or redraft wins.
        // Seeds are transient until staff explicitly save a revision or a redraft stores them.
        const workingComments: AnchoredCommentWithState[] = [];
        const seedComments: AnchoredComment[] = [];
        const summarySources: Partial<Record<WritingFeedbackLens, SummarySource>> = {};
        for (const lens of ['technical', 'linguistic'] as const) {
            // A run belongs to the lens it was generated for; a missing lens means linguistic.
            const candidate = runsByLens[lens];
            const run = candidate && (candidate.lens ?? 'linguistic') === lens ? candidate : null;
            const seeds = run && assignment && verifiedText
                ? seedCommentsFromRun(run, verifiedText, rubricForRun(assignment, run))
                : [];
            if (!latestWithComments) seedComments.push(...seeds);
            const resolved = resolveLensComments(lens, {
                revision: latestWithComments?.comments
                    ? { comments: latestWithComments.comments, createdAt: latestWithComments.createdAt }
                    : undefined,
                run,
                seeds
            }, { includeSeeds: true });
            workingComments.push(...withStaleFlags(resolved.comments, verifiedText));
            if (run) {
                summarySources[lens] = {
                    runId: run.id,
                    annotationsFingerprint: run.annotationsFingerprint ?? fingerprintAnnotations(seeds)
                };
            }
        }

        // Release counts travel with the detail so the review page can say a submission has
        // been revised without fetching and counting its release history itself.
        const priorReleases = await this.mongo.listWritingReleases(courseId, submissionId);
        // Summarize a held newer attempt so the review page can offer the same choice as the queue.
        const held = await this.mongo.getHeldWritingReplacement(courseId, submissionId);
        return {
            submission: held
                ? {
                    ...submission,
                    pendingReplacement: {
                        submissionId: held.id,
                        attempt: held.attempt,
                        submittedAt: held.submittedAt,
                        sourceType: held.sourceType
                    }
                }
                : submission,
            feedbackRun,
            technicalFeedbackRun,
            comments,
            seedComments,
            workingComments,
            summarySources,
            release,
            releaseCount: countCompletedReleases(priorReleases),
            maxReleases: MAX_SUBMISSION_RELEASES
        };
    }

    /**
     * redraftSummary - rewrites the summary of every changed lens from its final annotations (D-125).
     *
     * Synchronous by design: the working annotations are unsaved student-derived text and a job
     * payload may carry only ids. Each redraft is stored as a new immutable run, so suggested
     * grading, approval, the PDF and release all read it as the latest run.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Draft-ready submission under review
     * @param input - Complete working annotations and the lenses the page believes changed
     * @returns Refreshed detail and the lenses actually redrafted
     * @throws Error for a non-draft-ready submission, a release in flight, stale anchors, a stale
     *   rubric, or `SUMMARY_REDRAFT_FAILED_MESSAGE` when the model call fails
     */
    async redraftSummary(
        courseId: string,
        submissionId: string,
        input: { comments: AnchoredComment[]; lenses: WritingFeedbackLens[] }
    ): Promise<{ detail: SubmissionDetail; redraftedLenses: WritingFeedbackLens[] }> {
        // Step 1: state and anchor checks, before any model call.
        const submission = await this.requireSubmission(courseId, submissionId);
        if (submission.status !== 'draft_ready') throw new Error(REDRAFT_NOT_DRAFT_READY_MESSAGE);
        await this.assertNoReleaseInFlight(courseId, submissionId);
        const verifiedText = submission.verifiedText ?? '';
        validateAnchoredComments(input.comments, verifiedText);
        const assignment = await this.requireAssignment(courseId, submission.assignmentId);

        // Step 2: plan only the lenses whose annotations differ from their current summary.
        const allowed = lensesForAssignment(assignment);
        const plans: Array<{
            lens: WritingFeedbackLens;
            run: WritingFeedbackRun;
            rubric: WritingRubricDefinition;
            comments: AnchoredComment[];
            fingerprint: string;
        }> = [];
        for (const lens of [...new Set(input.lenses)].filter((item) => allowed.includes(item))) {
            const run = await this.mongo.getLatestWritingFeedbackRun(submissionId, lens);
            if (!run) continue;
            if (runPredatesTextEdit(submission, run)) throw new Error(TEXT_EDITED_MESSAGE);
            const rubric = selectRubric(assignment, lens).approved;
            this.assertCurrentRubricForLens(run.rubricVersion, rubric, lens);
            const comments = commentsForLens(input.comments, lens);
            const fingerprint = fingerprintAnnotations(comments);
            const current = run.annotationsFingerprint
                ?? fingerprintAnnotations(seedCommentsFromRun(run, verifiedText, rubricForRun(assignment, run)));
            if (fingerprint === current) continue;
            plans.push({ lens, run, rubric: rubric!, comments, fingerprint });
        }

        // Step 3: one structured call per lens, in parallel. Nothing is stored unless all succeed.
        let outputs;
        try {
            const llmCallOptions = plans.length
                ? await ModelSelectionService.getInstance().buildFeatureLlmCallOptions(courseId, 'writingFeedback')
                : undefined;
            outputs = await Promise.all(plans.map((plan) => this.getRedraftEngine().redraft({
                assignment,
                lens: plan.lens,
                rubric: plan.rubric,
                verifiedText,
                previousResult: plan.run.result,
                comments: plan.comments,
                llmCallOptions
            })));
        } catch (error) {
            // Model errors can echo the prompt, which carries student text: describe, never quote.
            appLogger.log('[writing-feedback] summary redraft failed:', describeFailureSafely(error));
            throw new Error(SUMMARY_REDRAFT_FAILED_MESSAGE);
        }

        // Step 4: persist immutable redraft runs.
        const engineName = this.getRedraftEngine().constructor.name;
        for (const [index, plan] of plans.entries()) {
            await this.mongo.createWritingFeedbackRun(
                buildRedraftRun(plan.run, outputs[index], plan.comments, plan.fingerprint, engineName)
            );
        }
        return { detail: await this.detail(courseId, submissionId), redraftedLenses: plans.map((plan) => plan.lens) };
    }

    /**
     * Appends one staff revision after validating every exact-span comment checksum.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission being reviewed
     * @param revision - Staff-authored narrative and optional complete comment snapshot
     * @param staffName - Display name of the saving staff member; attributes their new comments
     * @returns Persisted append-only review revision
     * @throws Error when feedback is already released or generating, or any anchor is stale
     */
    async appendReview(
        courseId: string,
        submissionId: string,
        revision: Omit<StaffReviewRevision, 'id' | 'createdAt' | 'submissionId' | 'finalAssessment' | 'assessmentDraft'> & {
            finalAssessment?: StaffFinalAssessmentInput;
            assessmentDraft?: StaffAssessmentDraftInput;
        },
        staffName?: string
    ): Promise<StaffReviewRevision> {
        const submission = await this.requireSubmission(courseId, submissionId);
        if (submission.status === 'released') {
            throw new Error('Released feedback cannot be edited; create a new attempt for a revised release');
        }
        if (submission.status === 'generating') throw new Error(REVIEW_WHILE_GENERATING_MESSAGE);
        await this.assertNoReleaseInFlight(courseId, submissionId);
        const loadLatestRuns = async () => ({
            linguistic: await this.mongo.getLatestWritingFeedbackRun(submissionId),
            technical: await this.mongo.getLatestWritingFeedbackRun(submissionId, 'technical')
        });
        // Saving marks the submission draft-ready, which feedback made for the old text is not.
        if (submission.transcriptEditedAt) {
            const runs = await loadLatestRuns();
            if (runPredatesTextEdit(submission, runs.linguistic) || runPredatesTextEdit(submission, runs.technical)) {
                throw new Error(TEXT_EDITED_MESSAGE);
            }
        }
        // Summary edits apply only to the runs staff were looking at (D-126).
        if (revision.summaryEdits?.length) {
            assertSummaryEditsBound(
                revision.summaryEdits,
                await loadLatestRuns(),
                await this.requireAssignment(courseId, submission.assignmentId)
            );
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
        const { finalAssessment: finalAssessmentInput, assessmentDraft: draftInput, ...reviewFields } = revision;
        if (finalAssessmentInput && draftInput) {
            throw new Error('Send either a complete final grade or a partial one, not both');
        }
        let finalAssessment;
        let assessmentDraft;
        if (finalAssessmentInput || draftInput) {
            const assignment = await this.requireAssignment(courseId, submission.assignmentId);
            // A lab report is graded on its technical rubric, not its writing one, so the
            // grade is validated against the lens that actually carries it.
            const lens = gradedLensFor(assignment);
            const gradedRubric = selectRubric(assignment, lens).approved;
            if (!gradedRubric) {
                throw new Error('Approve the rubric this assignment is graded on before saving a final grade');
            }
            if (finalAssessmentInput) finalAssessment = buildStaffFinalAssessment(finalAssessmentInput, gradedRubric, lens);
            else assessmentDraft = buildStaffAssessmentDraft(draftInput!, gradedRubric, lens);
        }
        const stored = await this.mongo.appendWritingReview(courseId, submissionId, {
            ...reviewFields,
            comments,
            ...(finalAssessment ? { finalAssessment } : {}),
            ...(assessmentDraft ? { assessmentDraft } : {})
        });
        // Generation can start between the check above and the write; the write refuses it too.
        if (stored === null) throw new Error(REVIEW_WHILE_GENERATING_MESSAGE);
        return stored;
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
        // The draft checks below would describe the draft being replaced, so say what is happening.
        if (submission.status === 'generating') throw new Error(APPROVE_WHILE_GENERATING_MESSAGE);
        const assignment = await this.requireAssignment(courseId, submission.assignmentId);

        const latestReview = submission.reviews?.[submission.reviews.length - 1];
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
            if (runPredatesTextEdit(submission, run)) throw new Error(TEXT_EDITED_MESSAGE);
            this.assertCurrentRubricForLens(run.rubricVersion, rubric, lens);
            // Nothing generates a staff-assessed criterion, so nothing else would notice it
            // was left blank: it is simply absent from the student's document.
            assertStaffCriteriaWritten(rubric, bindingSummaryEdit(latestReview, lens, run.id));
        }

        // Approval vouches for the grade Release will send, so a gradable rubric needs a
        // complete one, saved in the latest revision against the rubric version now in force.
        const gradedRubric = selectRubric(assignment, gradedLensFor(assignment)).approved;
        if (gradedRubric && rubricSupportsStaffAssessment(gradedRubric)) {
            const saved = latestReview?.finalAssessment;
            if (!saved || saved.rubricVersion !== gradedRubric.version) {
                throw new Error(APPROVAL_REQUIRES_GRADE_MESSAGE);
            }
        }

        const approved = await this.mongo.approveWritingSubmission(courseId, submissionId, staffUserId, staffName);
        if (!approved) throw new Error('A draft-ready submission is required before approval');
        return approved;
    }

    /**
     * Renders a student-safe PDF from the latest run and latest staff revision.
     *
     * Unreleased feedback must have been generated with the current approved rubric. Released
     * feedback is exempt: it was approved and sent to the student against the rubric it was
     * generated with, and approving a newer rubric must not make it impossible to download.
     * It is drawn with that rubric version, read from the lens's history.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission whose feedback is downloaded
     * @param include - General, annotated, or combined PDF section selection
     * @returns Complete PDF bytes
     * @throws Error when no run exists, unreleased feedback's rubric is stale, or released
     *   feedback's own rubric version is no longer on record
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

        // Step 1: pick the rubric each lens is drawn with. Released feedback keeps the version it
        // was generated with; anything else must match the current approved rubric.
        let pdfAssignment = assignment;
        let technicalRun: WritingFeedbackRun | null;
        let technicalRubric: WritingRubricDefinition | undefined;
        if (submission.status === 'released') {
            const releasedRubric = rubricForVersion(assignment, 'linguistic', run.rubricVersion);
            // Drawing released feedback with a rubric it was not generated with would put the
            // wrong criteria and bands in front of a student, so a missing version stops here.
            if (!releasedRubric) {
                throw new Error(`Rubric v${run.rubricVersion ?? 1} used for this released feedback is no longer on record`);
            }
            pdfAssignment = { ...assignment, rubric: releasedRubric };
            ({ technicalRun, technicalRubric } = await this.loadReleasedTechnicalLens(submissionId, assignment));
        } else {
            this.assertCurrentRubric(run.rubricVersion, assignment);
            ({ technicalRun, technicalRubric } = await this.loadTechnicalLens(submissionId, assignment));
            this.assertRunsMatchText(submission, [run, technicalRun]);
        }
        // Step 2: assemble the student-safe feedback, staff text, and comments from the reviews.
        const studentDocument = this.buildStudentDocument(submission, run, technicalRun, assignment);
        return this.pdfService.render({
            assignment: pdfAssignment,
            submission,
            feedback: studentDocument.feedback,
            grade: studentDocument.latestReview?.finalAssessment?.totalPoints,
            staffFeedback: studentDocument.staffFeedback,
            comments: studentDocument.comments,
            include,
            lens,
            finalAssessment: studentDocument.latestReview?.finalAssessment,
            // Approving staff name (user decision 2026-07-22); generic fallback pre-approval.
            annotationAuthor: submission.approvedByName,
            ...(technicalRun && technicalRubric && studentDocument.technicalFeedback
                ? {
                    technicalFeedback: studentDocument.technicalFeedback,
                    technicalRubric,
                    technicalStaffFeedback: studentDocument.technicalStaffFeedback
                }
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
        this.assertRunsMatchText(submission, [feedbackRun, technicalRun]);
        const completePdf = await this.renderReleasePdf(assignment, submission, feedbackRun, technicalRun, technicalRubric);
        const studentDocument = this.buildStudentDocument(submission, feedbackRun, technicalRun, assignment);
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
        const submission = await this.requireSubmission(courseId, submissionId);
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
        this.assertRunsMatchText(submission, [feedbackRun, technicalRun]);
        const completePdf = await this.renderReleasePdf(assignment, submission, feedbackRun, technicalRun, technicalRubric);
        const studentDocument = this.buildStudentDocument(submission, feedbackRun, technicalRun, assignment);
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
            const marked = await this.mongo.setWritingSubmissionStatus(courseId, submissionId, 'released', ['approved']);
            if (!marked) {
                appLogger.log('[writing-feedback] release landed but the submission had moved on:', 'release_status_conflict');
            }
        }
        return release;
    }

    private async requireSubmission(courseId: string, submissionId: string): Promise<ReviewableSubmission> {
        const submission = await this.mongo.getWritingSubmission(courseId, submissionId);
        // Held and superseded attempts are outside the queue; only the replacement route acts on them.
        if (!submission || (submission.slot ?? 'active') !== 'active') throw new Error('Writing submission not found');
        return submission;
    }

    private async requireAssignment(courseId: string, assignmentId: string): Promise<WritingAssignment> {
        const assignment = await this.mongo.getWritingAssignment(courseId, assignmentId);
        if (!assignment) throw new Error('Writing assignment not found');
        return assignment;
    }

    /** Refuses feedback generated before staff last edited the submission text. */
    private assertRunsMatchText(submission: WritingSubmission, runs: Array<WritingFeedbackRun | null>): void {
        if (runs.some((run) => runPredatesTextEdit(submission, run))) throw new Error(TEXT_EDITED_MESSAGE);
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
    private buildStudentDocument(
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
        const linguisticComments = anchored(linguistic.comments);
        const technicalComments = anchored(technical.comments);

        // The grade belongs to one lens, so it supplies staff-assessed levels only there.
        // A draft grade is deliberately not read: a preview shows what release would send.
        const assessment = latestReview?.finalAssessment;
        const assessmentFor = (lens: WritingFeedbackLens) =>
            assessment && (assessment.lens ?? 'linguistic') === lens ? { assessment } : {};

        return {
            latestReview,
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
        const studentDocument = this.buildStudentDocument(submission, feedbackRun, technicalRun, assignment);
        return this.pdfService.render({
            assignment,
            submission,
            feedback: studentDocument.feedback,
            grade: studentDocument.latestReview?.finalAssessment?.totalPoints,
            staffFeedback: studentDocument.staffFeedback,
            finalAssessment: studentDocument.latestReview?.finalAssessment,
            comments: studentDocument.comments,
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
     * Loads the technical run for released feedback, with the technical rubric it was generated with.
     *
     * The released counterpart of {@link loadTechnicalLens}: no staleness check, because released
     * feedback is exempt, and the rubric comes from the technical lens's history by the run's own
     * version rather than from whatever is approved now.
     *
     * @param submissionId - Released submission whose technical run is being resolved
     * @param assignment - Assignment supplying the technical lens's approved rubric and history
     * @returns The latest technical run (or null when the assignment has none) and its own rubric
     */
    private async loadReleasedTechnicalLens(
        submissionId: string,
        assignment: WritingAssignment
    ): Promise<{ technicalRun: WritingFeedbackRun | null; technicalRubric: WritingRubricDefinition | undefined }> {
        if (!lensesForAssignment(assignment).includes('technical')) {
            return { technicalRun: null, technicalRubric: undefined };
        }
        const technicalRun = await this.mongo.getLatestWritingFeedbackRun(submissionId, 'technical');
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
