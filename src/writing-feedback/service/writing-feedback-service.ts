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

import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import type {
    AnchoredComment,
    CanvasReleaseService,
    FeedbackPdfInclude,
    FeedbackPdfLens,
    StaffReviewRevision,
    SummarySource,
    WritingAssignment,
    WritingFeedbackEngine,
    WritingFeedbackLens,
    WritingFeedbackResult,
    WritingFeedbackRun,
    WritingJob,
    WritingRubricDefinition,
    WritingSourceMaterial,
    WritingSubmission
} from '../contracts';
import {
    seedCommentsFromRun,
    stampCommentAuthors,
    validateAnchoredComments,
    withStaleFlags,
    type AnchoredCommentWithState,
    fingerprintAnnotations
} from '../review/anchored-comments';
import { RubricWritingFeedbackEngine } from '../generation/feedback-engine';
import { GENERAL_FEEDBACK_PROMPT_VERSION, GeneralFeedbackEngine } from '../generation/general-feedback-engine';
import { TECHNICAL_PROMPT_VERSION, TechnicalWritingFeedbackEngine } from '../generation/technical-feedback-engine';
import { lensesForAssignment, selectRubric, rubricForVersion } from '../rubric/rubric-lens';
import { ModelSelectionService } from '../../dashboard-setting/model-selection-service';
import { StudentWritingFeedbackPdfService } from '../../report-generation/writing-feedback-report';
import {
    APPROVAL_REQUIRES_GRADE_MESSAGE,
    buildStaffAssessmentDraft,
    buildStaffFinalAssessment,
    gradedLensFor,
    rubricSupportsStaffAssessment,
    type StaffAssessmentDraftInput,
    type StaffFinalAssessmentInput
} from '../review/staff-final-assessment';
import { MAX_SUBMISSION_RELEASES, countCompletedReleases } from '../release/release-refusals';
import { resolveQueuedReleaseService } from '../release/queued-release-service';
import {
    TEXT_EDITED_MESSAGE,
    TRANSCRIPT_EDITABLE_STATUSES,
    reviewsSinceTextEdit,
    runPredatesTextEdit
} from '../intake/transcript';
import { getAnalysisMode, requireAnalysisProfile } from '../shared/analysis-mode';
import { appLogger } from '../../utils/logger';
import {
    assertSummaryEditsBound,
    bindingSummaryEdit,
    buildRedraftRun,
    commentsForLens,
    resolveLensComments,
    rubricForRun
} from '../review/summary';
import { assertStaffCriteriaWritten } from '../rubric/criterion-assessment';
import {
    LlmSummaryRedraftEngine,
    SUMMARY_REDRAFT_FAILED_MESSAGE,
    type SummaryRedraftEngine
} from '../generation/summary-redraft-engine';
import {
    latestHoldBackChoice,
    resolveStudentView,
    describeFailureSafely,
    REDRAFT_NOT_DRAFT_READY_MESSAGE,
    REVIEW_WHILE_GENERATING_MESSAGE,
    APPROVE_WHILE_GENERATING_MESSAGE,
    type GeneratedFeedbackWithTrace,
    type ReviewableSubmission,
    type SubmissionDetail,
    assertRunsMatchText,
    assertCurrentRubric,
    loadTechnicalLens,
    loadReleasedTechnicalLens,
    assertCurrentRubricForLens,
    buildStudentDocument
} from './service-helpers';
import { WritingFeedbackReleaseWorkflow } from '../release/release-workflow';


export {
    APPROVE_WHILE_GENERATING_MESSAGE,
    REDRAFT_NOT_DRAFT_READY_MESSAGE,
    REVIEW_WHILE_GENERATING_MESSAGE,
    describeFailureSafely,
    latestHoldBackChoice,
    resolveStudentView,
    type SubmissionDetail
} from './service-helpers';


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
    /** Release half of the lifecycle; see `release/release-workflow.ts`. */
    private readonly releases: WritingFeedbackReleaseWorkflow;

    /**
     * Creates the lifecycle service with injectable generation and PDF implementations.
     *
     * @param mongo - Persistence façade for course-scoped Writing Feedback records
     * @param engine - Structured feedback generator; defaults to the general engine, or to the
     *   SFL-founded engine when `WRITING_FEEDBACK_ANALYSIS_MODE=sfl`. In general mode it serves
     *   every lens.
     * @param pdfService - Student-safe renderer; defaults to the PDFKit implementation
     * @param technicalEngine - Structured technical feedback generator for lab reports; a test
     *   double passed here always takes precedence. Left undefined in production so the real
     *   LLM-backed engine (and its client construction) is built lazily, only the first time a
     *   lab report's technical lens actually runs, and never for assignments that are not lab reports.
     *   In general mode the general engine serves the technical lens too, unless a double is passed.
     */
    constructor(
        private readonly mongo: EngEAI_MongoDB,
        private readonly engine: WritingFeedbackEngine = getAnalysisMode() === 'sfl'
            ? new RubricWritingFeedbackEngine()
            : new GeneralFeedbackEngine(),
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
    ) {
        this.releases = new WritingFeedbackReleaseWorkflow({
            mongo,
            pdfService,
            resolveQueuedRelease,
            requireSubmission: (courseId, submissionId) => this.requireSubmission(courseId, submissionId),
            requireAssignment: (courseId, assignmentId) => this.requireAssignment(courseId, assignmentId)
        });
    }

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
        // General analysis has one engine for every rubric.
        if (getAnalysisMode() === 'general') return this.engine;
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
        requireAnalysisProfile(assignment.rubric.sflContext);
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
     * confirmTranscript - accepts staff's first confirmation of extracted text.
     *
     * Only the initial confirmation: text that is already confirmed is corrected through
     * {@link editTranscript}, which also records that earlier feedback no longer matches it.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param submissionId - Submission awaiting confirmation
     * @param verifiedText - Text staff confirmed against the student's file
     * @returns The confirmed submission, ready for generation
     * @throws Error when the text is already confirmed, or the submission is gone
     */
    async confirmTranscript(courseId: string, submissionId: string, verifiedText: string): Promise<WritingSubmission> {
        const submission = await this.requireSubmission(courseId, submissionId);
        if (!submission.requiresVerification) {
            throw new Error('This text is already confirmed; edit it from the submission instead');
        }
        const confirmed = await this.mongo.updateVerifiedWritingText(courseId, submissionId, verifiedText);
        if (!confirmed) throw new Error('This submission changed while you were editing. Reload it and try again.');
        return confirmed;
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
        await this.releases.assertNoReleaseInFlight(courseId, submissionId);
        // Confirming trims surrounding whitespace, so that alone is not a correction.
        if (text.trim() === (submission.verifiedText ?? '').trim()) return submission;

        const updated = await this.mongo.editWritingTranscript(courseId, submissionId, text, TRANSCRIPT_EDITABLE_STATUSES);
        if (!updated) throw new Error('This submission changed while you were editing. Reload it and try again.');
        return updated;
    }

    /**
     * The instructor files and pastes the general analysis reads for one assignment.
     *
     * Best-effort: a failed read leaves generation grounded in the rubric and instructions alone,
     * and the engine flags that for staff. The error is described without content.
     *
     * @param courseId - Course authorization/persistence boundary
     * @param assignmentId - Assignment whose material is read
     * @returns Stored materials, oldest first; empty when none or unreadable
     */
    private async loadSourceMaterials(courseId: string, assignmentId: string): Promise<WritingSourceMaterial[]> {
        try {
            return await this.mongo.listWritingSourceMaterials(courseId, assignmentId);
        } catch (error) {
            appLogger.log('[writing-feedback] assignment material unavailable:', describeFailureSafely(error));
            return [];
        }
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
        const general = getAnalysisMode() === 'general';
        const engine = lens === 'technical' ? this.getTechnicalEngine() : this.engine;
        const rubric = selectRubric(input.assignment, lens).approved;
        if (!rubric) throw new Error(`An approved ${lens} rubric is required before feedback generation`);
        const result = await engine.generate({
            assignment: input.assignment,
            verifiedText: input.verifiedText,
            llmCallOptions: input.llmCallOptions,
            lens,
            ...(general ? { sourceMaterials: await this.loadSourceMaterials(input.courseId, input.assignment.id) } : {})
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
                promptVersion: general
                    ? (runTrace?.writerPromptVersion ?? GENERAL_FEEDBACK_PROMPT_VERSION)
                    : lens === 'technical'
                        ? TECHNICAL_PROMPT_VERSION
                        : (runTrace?.writerPromptVersion ?? 'writing-feedback-v2')
            },
            // The general engine traces every lens; the SFL pipeline only the linguistic one.
            ...((general || lens === 'linguistic') && runTrace ? runTrace : {})
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
            ...(latestHoldBackChoice(submission, feedbackRun) !== undefined ? { holdBackAnnotations: latestHoldBackChoice(submission, feedbackRun) } : {}),
            // Same resolution the PDF uses, so the editor shows exactly what the student gets.
            ...(feedbackRun && resolveStudentView(feedbackRun, submission, []).overallMessage
                ? { overallMessage: resolveStudentView(feedbackRun, submission, []).overallMessage }
                : {}),
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
        await this.releases.assertNoReleaseInFlight(courseId, submissionId);
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
            assertCurrentRubricForLens(run.rubricVersion, rubric, lens);
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
        await this.releases.assertNoReleaseInFlight(courseId, submissionId);
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
            assertCurrentRubricForLens(run.rubricVersion, rubric, lens);
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
            ({ technicalRun, technicalRubric } = await loadReleasedTechnicalLens(this.mongo, submissionId, assignment));
        } else {
            assertCurrentRubric(run.rubricVersion, assignment);
            ({ technicalRun, technicalRubric } = await loadTechnicalLens(this.mongo, submissionId, assignment));
            assertRunsMatchText(submission, [run, technicalRun]);
        }
        // Step 2: assemble the student-safe feedback, staff text, and comments from the reviews.
        const studentDocument = buildStudentDocument(submission, run, technicalRun, assignment);
        return this.pdfService.render({
            assignment: pdfAssignment,
            submission,
            feedback: studentDocument.feedback,
            grade: studentDocument.latestReview?.finalAssessment?.totalPoints,
            staffFeedback: studentDocument.staffFeedback,
            comments: studentDocument.comments,
            ...(studentDocument.overallMessage ? { overallMessage: studentDocument.overallMessage } : {}),
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
     * See {@link WritingFeedbackReleaseWorkflow.previewRelease}.
     */
    async previewRelease(courseId: string, submissionId: string, releaseService: CanvasReleaseService) {
        return this.releases.previewRelease(courseId, submissionId, releaseService);
    }

    /**
     * Releases approved feedback from one staff action (D-128): preview, then queue.
     * See {@link WritingFeedbackReleaseWorkflow.releaseToCanvas}.
     */
    async releaseToCanvas(
        courseId: string,
        submissionId: string,
        releaseService: CanvasReleaseService,
        queuedByUserId: string
    ): Promise<WritingJob> {
        return this.releases.releaseToCanvas(courseId, submissionId, releaseService, queuedByUserId);
    }

    /**
     * Queues a previewed Canvas release after every check that can run before the worker.
     * See {@link WritingFeedbackReleaseWorkflow.enqueueRelease}.
     */
    async enqueueRelease(courseId: string, submissionId: string, queuedByUserId: string): Promise<WritingJob> {
        return this.releases.enqueueRelease(courseId, submissionId, queuedByUserId);
    }

    /**
     * Runs one queued release as the staff member who queued it.
     * See {@link WritingFeedbackReleaseWorkflow.runQueuedRelease}.
     */
    async runQueuedRelease(courseId: string, submissionId: string): Promise<void> {
        return this.releases.runQueuedRelease(courseId, submissionId);
    }

    /**
     * Releases approved feedback through the idempotent Canvas coordinator.
     * See {@link WritingFeedbackReleaseWorkflow.release}.
     */
    async release(courseId: string, submissionId: string, releaseService: CanvasReleaseService) {
        return this.releases.release(courseId, submissionId, releaseService);
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
}
