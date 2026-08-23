/**
 * Writing Feedback contracts — canonical records and service boundaries
 *
 * Defines the domain vocabulary shared by orchestration, persistence, Canvas adapters,
 * model generation, and PDF rendering. These types contain no HTTP or Mongo behavior and
 * keep student-facing output separate from internal provenance and staff-only review data.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.0.0
 * @description: Owns the staff-only Writing Feedback domain and port contracts.
 */

import type { LLMOptions } from 'ubc-genai-toolkit-llm';

/** Template identifier stored with new assignments and feedback runs for traceability. */
export const DEFAULT_WRITING_PROFILE_VERSION = 'writing-feedback-v1';

/** Lifecycle states used by the staff queue and guarded generation/release transitions. */
export type WritingSubmissionStatus =
    | 'imported'
    | 'verification_needed'
    | 'generating'
    | 'draft_ready'
    | 'approved'
    | 'released'
    | 'failed';

/** Supported intake provenance; scan sources require explicit staff verification. */
export type WritingSourceType = 'manual' | 'canvas_text' | 'digital_file' | 'paper_scan';

/** Which feedback lens a rubric, prompt, or generated run belongs to. */
export type WritingFeedbackLens = 'linguistic' | 'technical';

/** Instructor-authored criterion slug, frozen after its first approval. */
export type WritingCriterionId = string;

/** Instructor-authored performance-level slug, frozen after its first approval. */
export type WritingLevelId = string;

/** Academic Writing Matrix axis shared by rubric criteria and anchored comments. */
export type WritingFunctionTag = 'content' | 'interpersonal' | 'organizational';

/**
 * One cell of the rubric grid: the points a criterion earns at one level, and the
 * descriptor that justifies it. A range rather than a single value, because staff
 * award within a band. `min` and `max` may be equal where a small weight leaves no
 * room to spread.
 */
export interface WritingRubricCell {
    min: number; // lowest points awardable in this band, inclusive
    max: number; // highest points awardable in this band, inclusive
    descriptor?: string; // criterion-specific meaning of this level
}

/** One instructor-authored criterion in a versioned Writing Feedback rubric. */
export interface WritingRubricCriterion {
    id: WritingCriterionId; // stable instructor-authored slug shared across model output and staff UI
    label: string; // staff/student-facing criterion name
    description: string; // instructor-authored assessment meaning
    functionTag?: WritingFunctionTag; // optional SFL metafunction used by staff filters
    sflDimension?: string; // optional instructor-editable linguistic lens supplied to generation
    /** Maximum points this criterion contributes. Absent means the rubric is ordinal only. */
    points?: number;
    /**
     * Per-level band and descriptor. Sparse on purpose: a level with no entry renders
     * as an empty cell, which is how a criterion carrying fewer ratings than the rubric
     * has columns is represented.
     */
    cells?: Record<WritingLevelId, WritingRubricCell>;
}

/** One allowed ordinal level, optionally carrying an instructor-approved numeric value. */
export interface WritingRubricLevel {
    id: WritingLevelId; // stable instructor-authored slug emitted by the feedback engine
    label: string; // human-readable level shown in review and PDF output
    description: string; // instructor-authored performance descriptor
    rank: number; // explicit worst-to-best position, contiguous from one
    /** Optional instructor-authored points. Every level is required for numeric release. */
    points?: number;
}

/** Versioned rubric definition used as either an editable draft or approved generation contract. */
export interface WritingRubricDefinition {
    version: number; // monotonically increasing rubric provenance
    status: 'draft' | 'approved'; // only approved definitions may govern generation
    title: string; // staff-visible rubric identity
    task: string; // assessed writing task supplied to the feedback engine
    audience: string; // intended reader context for interpersonal judgments
    purpose: string; // communicative goal that bounds feedback
    constraints: string[]; // instructor-authored task requirements
    learningOutcomes: string[]; // approved outcomes feedback may address
    gradingIntent: string; // states formative/ordinal/numeric intent without inferred weights
    criteria: WritingRubricCriterion[]; // complete supported criterion set
    levels: WritingRubricLevel[]; // complete supported ordinal scale
    updatedAt: Date; // audit timestamp for the current definition
    updatedBy: string; // internal actor responsible for the latest edit
    approvedAt?: Date; // present only after explicit rubric approval
    approvedBy?: string; // internal approving instructor/admin actor
    /** Instructor-approved lab handout context: indications, steps, and expected observations. */
    labContext?: string;
}

/** Course-scoped assignment whose current approved rubric governs all downstream artifacts. */
export interface WritingAssignment {
    id: string; // internal assignment identity
    courseId: string; // authorization and persistence boundary
    title: string; // staff/student-facing assignment label
    profileVersion: string; // originating platform-template provenance retained on feedback runs
    rubricSource: 'internal_profile' | 'canvas'; // import provenance, not synchronization state
    /** Raw instructor-approved assignment directions used as rubric-editor context. */
    instructions?: string;
    /** Complete approved level-to-points mapping. Omit when feedback is ordinal only. */
    gradeMapping?: Record<WritingLevelId, number>;
    /** Current rubric. New assignments hold a draft here until their first approval. */
    rubric: WritingRubricDefinition;
    /** Editable staff draft. Saving never changes the approved rubric. */
    rubricDraft?: WritingRubricDefinition;
    /** Immutable, previously approved versions retained for audit and calibration. */
    rubricHistory?: WritingRubricDefinition[];
    /** True when this assignment is a lab report and also receives technical feedback. */
    isLabReport?: boolean;
    /** Approved technical rubric governing the technical lens. Absent until first approval. */
    technicalRubric?: WritingRubricDefinition;
    /** Editable staff draft of the technical rubric; saving never changes the approved one. */
    technicalRubricDraft?: WritingRubricDefinition;
    /** Immutable previously approved technical rubrics retained for audit. */
    technicalRubricHistory?: WritingRubricDefinition[];
    canvasAssignmentId?: string; // optional source reference for approved integration work
    /** Submission deadline shown to staff; sourced from Canvas or manual entry. */
    dueAt?: Date;
    createdAt: Date; // assignment audit creation timestamp
    updatedAt: Date; // latest assignment/rubric state timestamp
}

/** Local, course-scoped student submission used by verification and staff review workflows. */
export interface WritingSubmission {
    id: string; // internal submission identity
    courseId: string; // authorization and persistence boundary
    assignmentId: string; // owning rubric/assignment relationship
    /** Internal operational identifier, never an institutional PUID. */
    studentId: string;
    /** Staff-visible label; never returned to students. */
    studentLabel?: string;
    attempt: number; // distinguishes repeat attempts by the same student for idempotent import/release
    sourceType: WritingSourceType; // controls intake and verification expectations
    originalText: string; // extracted/source transcript retained for staff comparison
    verifiedText?: string; // sole text permitted to enter feedback generation
    requiresVerification: boolean; // hard gate for OCR or unresolved extraction
    status: WritingSubmissionStatus; // drives allowed staff actions and queue state
    sourceFileId?: string; // restricted retained upload reference when policy permits
    createdAt: Date; // submission audit creation timestamp
    updatedAt: Date; // latest workflow transition timestamp
    retentionAt?: Date; // configurable deletion/retention deadline
    approvedAt?: Date; // explicit human approval timestamp
    /** Roster userId of the approving staff member. */
    approvedBy?: string;
    /** Display name captured at approval; used as the PDF annotation author. */
    approvedByName?: string;
}

/** Exact verified-text excerpt and rationale supporting one rubric judgment. */
export interface RubricEvidence {
    quote: string; // exact substring, capped to 280 characters at model validation
    rationale: string; // explains how the excerpt supports the criterion judgment
}

/** Internal model draft for one rubric criterion; staff reviews it before release. */
export interface CriterionFeedback {
    criterion: WritingCriterionId; // assignment-rubric key
    suggestedLevel: WritingLevelId; // non-final model suggestion
    evidence: RubricEvidence[]; // exact verified-text support for the suggestion
    explanation: string; // formative criterion-level guidance
    confidence: number; // staff-only model signal, excluded from student PDF
}

/** One formative next-step prompt included in the reviewed feedback. */
export interface RevisionGoal {
    skillTag: string; // stable pedagogical category for staff scanning
    goal: string; // concise revision outcome
    guidedQuestion: string; // student action/question rather than supplied rewrite
}

/** Structured model result before staff revision, approval, and release. */
export interface WritingFeedbackResult {
    criteria: CriterionFeedback[]; // exactly one result for each supported criterion
    strengths: string[]; // concise formative positives safe for staff review
    revisionGoals: RevisionGoal[]; // at most three prioritized next steps
    internalFlags: string[]; // staff-only uncertainty/constraint signals
}

/** Immutable generation record retaining rubric/profile provenance without prompt bodies. */
export interface WritingFeedbackRun {
    id: string; // immutable run identity
    courseId: string; // authorization and audit boundary
    assignmentId: string; // assignment used at generation time
    submissionId: string; // verified submission assessed by the run
    profileVersion: string; // immutable course-profile provenance
    /** Approved rubric version used to produce this immutable model result. */
    rubricVersion: number;
    /** Lens that produced this run. Absent means 'linguistic' for records written before two-lens generation. */
    lens?: WritingFeedbackLens;
    result: WritingFeedbackResult; // validated model draft, never mutated by staff edits
    createdAt: Date; // generation timestamp
    /** Model metadata excludes prompt bodies and student text. */
    modelMetadata: { engine: string; promptVersion: string };
}

/** Staff/model comment anchored to an exact UTF-16 span of verified submission text. */
export interface AnchoredComment {
    id: string; // stable client/revision identity
    // Optional rubric association for filtering. Carries no lens marker today —
    // only linguistic comments and model seeds exist, and the Technical tab is
    // read-only. Technical annotations will need an explicit lens field before
    // anchored comments can distinguish linguistic vs. technical criteria.
    criterion?: WritingCriterionId;
    /** Exact substring of the verified text; validation checksum for the offsets. */
    quote: string;
    /** UTF-16 code-unit offsets into the verified text. Offsets are the anchor source of truth. */
    startOffset: number; // inclusive UTF-16 source boundary
    endOffset: number; // exclusive UTF-16 source boundary
    comment: string; // primary student-safe popup feedback
    howToImprove?: string; // optional formative action appended to the popup
    courseMaterialLink?: string; // optional http(s) learning resource
    glossaryDefinition?: { term: string; definition: string }; // optional term support
    /** Seeded from immutable model evidence or authored by staff. */
    origin: 'model_seed' | 'staff';
    /**
     * Display name of the staff member who authored the comment. Stamped
     * server-side at save time (never client-controlled) and carried forward
     * across revisions; unset for model seeds. Roster display name, never a PUID.
     */
    authorName?: string;
    /**
     * Staff-facing triage metadata mirroring the Academic Writing Matrix
     * taxonomy. Never printed in the student PDF.
     */
    functionTag?: WritingFunctionTag;
    levelTag?: 'text' | 'section' | 'clause_word';
    priority?: 'high' | 'medium' | 'low';
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
    createdAt: Date; // append-only revision timestamp
}

/** Persisted preview or completed Canvas release keyed by a payload fingerprint. */
export interface WritingRelease {
    id: string; // internal release identity
    courseId: string; // authorization and audit boundary
    submissionId: string; // released submission attempt
    feedbackRunId: string; // immutable draft provenance
    rubricVersion?: number; // approved rubric used for the payload
    payloadFingerprint: string; // idempotency key across preview and retry
    status: 'previewed' | 'released' | 'reconciled'; // external-write lifecycle
    grade?: number; // present only with complete instructor-authored mapping
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
}

/** Canvas release adapter boundary invoked only after release policy checks succeed. */
export interface CanvasGateway {
    /** Performs one idempotency-keyed external release and returns reconciliation identifiers. */
    release(input: { submissionId: string; pdf: Buffer; grade: number; payloadFingerprint: string }): Promise<{ canvasCommentId: string; canvasSubmissionId: string }>;
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
    }): Promise<WritingFeedbackResult>;
}

/** Student PDF section selector used by staff download endpoints. */
export type FeedbackPdfInclude = 'general' | 'annotated' | 'both';

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
        /** Shown as the highlight-popup author (`/T`); defaults to "Teaching Team". */
        annotationAuthor?: string;
        /** Technical lens draft rendered as its own section for a lab report. */
        technicalFeedback?: WritingFeedbackResult;
        /** Approved technical rubric supplying criterion labels for that section. */
        technicalRubric?: WritingRubricDefinition;
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
    /** Student-safe bytes handed to the adapter; never part of the idempotency key. */
    pdf: Buffer;
    /** Latest staff-approved narrative, so an edited re-approval releases as new content. */
    studentFeedback?: string;
    /** Technical model draft released alongside the linguistic one, when the assignment has one. */
    technicalFeedbackRun?: WritingFeedbackRun;
}

/** Release coordinator boundary separating preview persistence from external mutation. */
export interface CanvasReleaseService {
    /** Persists or reuses an idempotent release preview without external submission. */
    preview(input: CanvasReleaseInput): Promise<WritingRelease>;
    /** Requires approval and numeric mapping before finalizing an external release. */
    release(input: CanvasReleaseInput): Promise<WritingRelease>;
}
