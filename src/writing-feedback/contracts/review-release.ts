/**
 * Writing Feedback contracts — staff review, final assessment, release, jobs, and service ports
 *
 * Part of the Writing Feedback domain vocabulary; import from `../contracts`, which re-exports
 * every part. These types contain no HTTP or Mongo behavior.
 *
 * @author: @rdschrs
 * @date: 2026-10-19
 * @version: 1.0.0
 * @description: Review revisions, staff assessment, release records, jobs, and adapter interfaces.
 */

import type { LLMOptions } from 'ubc-genai-toolkit-llm';
import type {
    WritingAssignment,
    WritingCriterionId,
    WritingFeedbackLens,
    WritingRubricDefinition,
    WritingSubmission
} from './assignment';
import type { AnchoredComment, WritingFeedbackResult, WritingFeedbackRun } from './feedback';
import type { WritingSourceMaterial } from './canvas';

/**
 * Staff-edited summary sections for one lens, bound to the run they were edited against (D-126).
 *
 * Applies only while `feedbackRunId` is still the latest run for the lens, so text written
 * against a summary staff later redrafted is never released.
 */
export interface StaffSummaryEdit {
    lens: WritingFeedbackLens;
    feedbackRunId: string; // run the edits were made against
    strengths: string[]; // "What you did well", 0..5
    criterionExplanations: Array<{ criterion: WritingCriterionId; explanation: string }>;
    revisionGoalsText?: string; // technical lens only; the writing lens keeps `studentFeedback`
    /** Staff edit of the overall message (writing lens, whole-text problem runs only). */
    overallMessage?: string;
}

/** Which run a lens's summary currently comes from, and the annotations it reflects. */
export interface SummarySource {
    runId: string;
    annotationsFingerprint: string;
}

/** Append-only staff revision that snapshots narrative and anchored-comment edits. */
export interface StaffReviewRevision {
    id: string; // immutable revision identity
    submissionId: string; // reviewed submission
    feedbackRunId: string; // immutable model draft being revised
    staffUserId: string; // internal reviewer audit identity
    studentFeedback: string; // student-safe narrative authored/approved by staff
    internalNote?: string; // staff-only note excluded from student output
    /** Full working set of anchored comments snapshotted with this revision. */
    comments?: AnchoredComment[];
    /** Human-authored rubric result. Model suggestions remain separate and staff-only. */
    finalAssessment?: StaffFinalAssessment;
    /** Grades saved before every criterion had one; replaced by `finalAssessment` once complete. */
    assessmentDraft?: StaffAssessmentDraft;
    /** Technical run the technical summary edits were made against, for a lab report. */
    technicalFeedbackRunId?: string;
    /** Editable summary sections per lens (D-126). */
    summaryEdits?: StaffSummaryEdit[];
    /**
     * Staff hold-back choice (the inverse of the "Include annotations" checkbox), saved only when staff change it.
     * Absent means the default: held back exactly when the run has a whole-text problem.
     */
    holdBackAnnotations?: boolean;
    createdAt: Date; // append-only revision timestamp
}

/** One criterion score explicitly entered by course staff. */
export interface StaffCriterionAssessment {
    criterionId: WritingCriterionId; // joins to the immutable rubric version
    points: number; // awarded points, bounded by the criterion weight
}

/** Complete, staff-authored numeric assessment saved with a review revision. */
export interface StaffFinalAssessment {
    /**
     * Which rubric this grade was awarded against. A lab report is graded on its technical
     * rubric, so a reader cannot assume the writing one. Absent on assessments stored before
     * two-lens grading, which are all linguistic.
     */
    lens?: WritingFeedbackLens;
    rubricVersion: number; // rubric version whose criteria and weights were graded
    criteria: StaffCriterionAssessment[]; // exactly one score per weighted criterion
    totalPoints: number; // server-computed sum of awarded points
    maxPoints: number; // server-computed rubric total
}

/** Staff-entered points for some criteria, saved while grading is unfinished. Never approved or released. */
export interface StaffAssessmentDraft {
    lens?: WritingFeedbackLens; // rubric the points were entered against
    rubricVersion: number; // rubric version whose criteria and weights were graded
    criteria: StaffCriterionAssessment[]; // at most one score per criterion, in rubric order
}

/** Persisted preview or completed Canvas release keyed by a payload fingerprint. */
/** How long a release lock is honoured before a worker is assumed to have died. */
export const RELEASE_LOCK_TTL_MS = 30 * 60 * 1000;

export interface WritingRelease {
    id: string; // internal release identity
    courseId: string; // authorization and audit boundary
    submissionId: string; // released submission attempt
    feedbackRunId: string; // immutable draft provenance
    rubricVersion?: number; // approved rubric used for the payload
    /** Whether per-criterion points reached the instructor's Canvas rubric. */
    rubricAssessmentWritten?: boolean;
    /**
     * Which release of this submission this record is, 1 to 5.
     *
     * Assigned at preview from the count of releases that already reached the student, so the
     * review page can say a submission has been revised without reading its whole history.
     */
    revision?: number;
    /**
     * `GlobalUser.userId` of the staff member who queued this release.
     *
     * A queued release runs after that person has closed the page, and it writes to Canvas with
     * their stored OAuth credential — never a shared or service account — so the record names
     * whose authority the write carried. Never a PUID.
     */
    queuedByUserId?: string;
    payloadFingerprint: string; // idempotency key across preview and retry
    /** External-write lifecycle. */
    status: 'previewed' | 'feedback_attached' | 'grade_queued' | 'released' | 'reconciliation_required' | 'failed' | 'reconciled';
    /**
     * When a queued job took the in-progress lock on this release.
     *
     * The lock is a field rather than a status because the status is what tells a resumed
     * release how far the last attempt got — a comment already attached must not be attached
     * again. Taking the lock is a single atomic update, so of two staff members pressing
     * Release at the same moment exactly one wins. It is cleared when the worker stops, and
     * a lock older than {@link RELEASE_LOCK_TTL_MS} is treated as abandoned so a worker that
     * died cannot freeze a submission for good.
     */
    releaseLockedAt?: Date;
    /** The queue job holding the lock; audit trail once the job has stopped. */
    releaseJobId?: string;
    grade?: number; // staff-final total sent to Canvas
    integration?: 'mock_canvas' | 'canvas';
    postManually?: boolean; // Canvas posting policy observed at preflight
    canvasFileIds?: string[]; // uploaded feedback files retained for reconciliation
    canvasProgressId?: string; // asynchronous grade-write job id
    failureStage?: 'preflight' | 'feedback' | 'grade' | 'progress';
    sanitizedError?: string; // content-free operational result
    canvasCommentId?: string; // remote identifier retained for reconciliation
    canvasSubmissionId?: string; // remote submission identifier retained for reconciliation
    createdAt: Date; // preview creation timestamp
    updatedAt: Date; // latest release/reconciliation timestamp
}

/** Leased background work item with bounded retry state and sanitized failures. */
export interface WritingJob {
    id: string; // internal job identity
    courseId: string; // course scope for handler-side authorization
    type: 'extract' | 'generate' | 'pdf' | 'release'; // selects injected domain handler
    state: 'queued' | 'leased' | 'completed' | 'failed'; // durable worker state
    attempts: number; // completed lease attempts used by retry policy
    maxAttempts: number; // hard ceiling preventing unbounded retries
    leaseUntil?: Date; // expiry permitting recovery after worker loss
    sanitizedError?: string; // content-free operational failure summary
    payload: { submissionId: string }; // minimum internal pointer, never student content
    createdAt: Date; // queue insertion timestamp
    updatedAt: Date; // latest lease/completion/failure timestamp
}

/**
 * Semantic description of one released payload, used to derive its idempotency key.
 *
 * Deliberately excludes the rendered PDF: annotation identifiers and embedded
 * timestamps differ on every render, so hashing bytes would give the same content
 * a new fingerprint per attempt and defeat retry deduplication.
 */
export interface WritingReleasePayload {
    submissionId: string; // released submission attempt
    feedbackRunId: string; // immutable model draft provenance
    rubricVersion?: number; // approved rubric backing the judgments
    grade?: number; // instructor-mapped numeric result, when one exists
    studentFeedback?: string; // staff-approved narrative a re-approval can change
    /** Technical model draft provenance for a lab report; absent for single-lens releases. */
    technicalFeedbackRunId?: string;
    finalAssessment?: StaffFinalAssessment;
    /** Staff summary edits that shape the released PDF; part of the release fingerprint. */
    summaryEdits?: StaffSummaryEdit[];
}

/** Canvas release adapter boundary invoked only after release policy checks succeed. */
export interface CanvasGateway {
    /** Performs one idempotency-keyed external release and returns reconciliation identifiers. */
    release(input: {
        submissionId: string;
        artifacts: CanvasReleaseInput['artifacts'];
        grade: number;
        payloadFingerprint: string;
    }): Promise<{ canvasCommentId: string; canvasSubmissionId: string }>;
}

/** Digital-document parser boundary that does not upload submissions to course RAG. */
export interface DocumentExtractionService {
    /** Extracts text from a supported local buffer and returns its sanitized filename. */
    extract(input: { buffer: Buffer; fileName: string }): Promise<{ text: string; fileName: string }>;
}

/** OCR boundary whose output remains unverified until an explicit staff action. */
export interface OcrProvider {
    /** Produces a draft transcript and provider confidence without marking it verified. */
    extract(input: { buffer: Buffer; fileName: string }): Promise<{ text: string; confidence: number }>;
}

/** Structured feedback generator constrained by the assignment's approved rubric. */
export interface WritingFeedbackEngine {
    /** Generates and validates a model draft from staff-verified text only. */
    generate(input: {
        assignment: WritingAssignment;
        verifiedText: string;
        llmCallOptions?: LLMOptions;
        /** Rubric lens to assess against; engines bound to one lens ignore it. */
        lens?: WritingFeedbackLens;
        /** Instructor files and pastes for this assignment; never student work. */
        sourceMaterials?: WritingSourceMaterial[];
    }): Promise<WritingFeedbackResult>;
}

/** Student PDF section selector used by staff download endpoints. */
export type FeedbackPdfInclude = 'general' | 'annotated' | 'both';

/** Feedback artifact selected for PDF rendering. Technical output is never mixed into writing output. */
export type FeedbackPdfLens = 'writing' | 'technical';

/** Student-safe PDF renderer boundary for general and exact-span annotated output. */
export interface WritingFeedbackPdfService {
    /** Renders the selected PDF sections while excluding internal flags and model metadata. */
    render(input: {
        assignment: WritingAssignment;
        submission: WritingSubmission;
        feedback: WritingFeedbackResult;
        grade?: number;
        staffFeedback?: string;
        comments?: AnchoredComment[];
        include?: FeedbackPdfInclude;
        lens?: FeedbackPdfLens;
        finalAssessment?: StaffFinalAssessment;
        /** Shown as the highlight-popup author (`/T`); defaults to "Teaching Team". */
        annotationAuthor?: string;
        /** Technical lens draft rendered as its own section for a lab report. */
        technicalFeedback?: WritingFeedbackResult;
        /** Approved technical rubric supplying criterion labels for that section. */
        technicalRubric?: WritingRubricDefinition;
        /** Staff-edited technical revision goals text; replaces the model goals in the technical section. */
        technicalStaffFeedback?: string;
    }): Promise<Buffer>;
}

/** Single-step worker boundary for polling one durable Writing Feedback job. */
export interface WritingFeedbackJobRunner {
    /** Leases and handles at most one job; returns false when the queue is empty. */
    runNext(): Promise<boolean>;
}

/** Inputs shared by release preview and finalization. */
export interface CanvasReleaseInput {
    submission: WritingSubmission;
    assignment: WritingAssignment;
    feedbackRun: WritingFeedbackRun;
    /** Student-safe, separately named artifacts handed to the adapter. */
    artifacts: Array<{ kind: 'writing' | 'technical'; filename: string; data: Buffer }>;
    /** Complete staff-authored grade saved in the latest review revision. */
    finalAssessment?: StaffFinalAssessment;
    /**
     * The rubric the grade was awarded against — the technical one for a lab report.
     *
     * Resolved by the service, where the lens is already known, so the release adapter never
     * re-derives which of an assignment's two rubrics carries its marks.
     */
    gradedRubric: WritingRubricDefinition;
    /** Latest staff-approved narrative, so an edited re-approval releases as new content. */
    studentFeedback?: string;
    /** Technical model draft released alongside the linguistic one, when the assignment has one. */
    technicalFeedbackRun?: WritingFeedbackRun;
    /**
     * Which release of this submission this would be, 1 to `MAX_SUBMISSION_RELEASES`.
     *
     * The service counts the submission's release history and applies the cap; the coordinator
     * only records the number it is given, so neither adapter has to query that history itself.
     */
    revision?: number;
    /** Staff summary edits that shape the released PDF; part of the release fingerprint. */
    summaryEdits?: StaffSummaryEdit[];
}

/** Release coordinator boundary separating preview persistence from external mutation. */
export interface CanvasReleaseService {
    /** Persists or reuses an idempotent release preview without external submission. */
    preview(input: CanvasReleaseInput): Promise<WritingRelease>;
    /** Requires approval and numeric mapping before finalizing an external release. */
    release(input: CanvasReleaseInput): Promise<WritingRelease>;
}
