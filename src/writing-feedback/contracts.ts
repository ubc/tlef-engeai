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

/** Immutable profile identifier stored with assignments and feedback runs for traceability. */
export const A2_PROFILE_VERSION = 'lled200-a2-technical-description-v1';

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

/** Complete ordinal performance scale supported by the A2 rubric. */
export type A2Level = 'emerging' | 'developing' | 'competent' | 'strong';

/** Fixed A2 criterion identifiers accepted by schemas, prompts, and PDF output. */
export type A2CriterionId = 'organization' | 'content' | 'interpersonal_positioning' | 'task_constraints';

/** One instructor-authored criterion in a versioned Writing Feedback rubric. */
export interface WritingRubricCriterion {
    id: A2CriterionId; // stable key shared across model output and staff UI
    label: string; // staff/student-facing criterion name
    description: string; // instructor-authored assessment meaning
    sflDimension: string; // pedagogical lens supplied to generation
}

/** One allowed ordinal level, optionally carrying an instructor-approved numeric value. */
export interface WritingRubricLevel {
    id: A2Level; // stable key emitted by the feedback engine
    label: string; // human-readable level shown in review and PDF output
    description: string; // instructor-authored performance descriptor
    /** Optional instructor-authored points. All four levels are required for numeric release. */
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
}

/** Course-scoped assignment whose current approved rubric governs all downstream artifacts. */
export interface WritingAssignment {
    id: string; // internal assignment identity
    courseId: string; // authorization and persistence boundary
    title: string; // staff/student-facing assignment label
    profileVersion: string; // course-profile provenance retained on feedback runs
    rubricSource: 'internal_profile' | 'canvas'; // import provenance, not synchronization state
    /** Canvas-native/approved level-to-points mapping. Omit when feedback is ordinal only. */
    gradeMapping?: Partial<Record<A2Level, number>>;
    /** Current approved rubric used by generation, PDF output, and release. */
    rubric: WritingRubricDefinition;
    /** Editable staff draft. Saving never changes the approved rubric. */
    rubricDraft?: WritingRubricDefinition;
    /** Immutable, previously approved versions retained for audit and calibration. */
    rubricHistory?: WritingRubricDefinition[];
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
    criterion: A2CriterionId; // fixed rubric key
    suggestedLevel: A2Level; // non-final model suggestion
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
export interface A2FeedbackResult {
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
    result: A2FeedbackResult; // validated model draft, never mutated by staff edits
    createdAt: Date; // generation timestamp
    /** Model metadata excludes prompt bodies and student text. */
    modelMetadata: { engine: string; promptVersion: string };
}

/** Staff/model comment anchored to an exact UTF-16 span of verified submission text. */
export interface AnchoredComment {
    id: string; // stable client/revision identity
    criterion?: A2CriterionId; // optional rubric association for filtering
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
     * Staff-facing triage metadata mirroring the Academic Writing Matrix
     * taxonomy. Never printed in the student PDF.
     */
    functionTag?: 'content' | 'interpersonal' | 'organizational';
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

/** Canvas release adapter boundary invoked only after release policy checks succeed. */
export interface CanvasGateway {
    /** Derives the exact payload fingerprint before any external mutation. */
    previewRelease(input: { submissionId: string; pdf: Buffer; grade?: number }): Promise<{ payloadFingerprint: string }>;
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
    generate(input: { assignment: WritingAssignment; verifiedText: string }): Promise<A2FeedbackResult>;
}

/** Student PDF section selector used by staff download endpoints. */
export type FeedbackPdfInclude = 'general' | 'annotated' | 'both';

/** Student-safe PDF renderer boundary for general and exact-span annotated output. */
export interface WritingFeedbackPdfService {
    /** Renders the selected PDF sections while excluding internal flags and model metadata. */
    render(input: {
        assignment: WritingAssignment;
        submission: WritingSubmission;
        feedback: A2FeedbackResult;
        grade?: number;
        staffFeedback?: string;
        comments?: AnchoredComment[];
        include?: FeedbackPdfInclude;
        /** Shown as the highlight-popup author (`/T`); defaults to "Teaching Team". */
        annotationAuthor?: string;
    }): Promise<Buffer>;
}

/** Single-step worker boundary for polling one durable Writing Feedback job. */
export interface WritingFeedbackJobRunner {
    /** Leases and handles at most one job; returns false when the queue is empty. */
    runNext(): Promise<boolean>;
}

/** Release coordinator boundary separating preview persistence from external mutation. */
export interface CanvasReleaseService {
    /** Persists or reuses an idempotent release preview without external submission. */
    preview(input: { submission: WritingSubmission; assignment: WritingAssignment; feedbackRun: WritingFeedbackRun; pdf: Buffer }): Promise<WritingRelease>;
    /** Requires approval and numeric mapping before finalizing an external release. */
    release(input: { submission: WritingSubmission; assignment: WritingAssignment; feedbackRun: WritingFeedbackRun; pdf: Buffer }): Promise<WritingRelease>;
}
