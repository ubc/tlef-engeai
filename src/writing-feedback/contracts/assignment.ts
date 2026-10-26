/**
 * Writing Feedback contracts — assignments, submissions, SFL genre profiles, and rubrics
 *
 * Part of the Writing Feedback domain vocabulary; import from `../contracts`, which re-exports
 * every part. These types contain no HTTP or Mongo behavior.
 *
 * @author: @rdschrs
 * @date: 2026-10-19
 * @version: 1.0.0
 * @description: Assignment, submission, genre profile, diagnosis, rubric, and batch records.
 */

import type { CanvasAssignmentDetails, CanvasRubricIdMap, CanvasRubricRefusal, ImportedRubricShape } from './canvas';

/** Template identifier stored with new assignments and feedback runs for traceability. */
export const DEFAULT_WRITING_PROFILE_VERSION = 'writing-feedback-v2';

/** Structured linguistic-feedback result schema introduced by the SFL-founded pipeline. */
export const WRITING_FEEDBACK_SCHEMA_V2 = 'writing-feedback-v2';

/** Version label for the curated, paraphrased SFL analyzer foundation used at runtime. */
export const SFL_FOUNDATION_VERSION = 'lled200-sfl-analyzer-foundation@1.0.0';

/** Lifecycle states used by the staff queue and guarded generation/release transitions. */
export type WritingSubmissionStatus =
    | 'imported'
    | 'verification_needed'
    | 'generating'
    | 'draft_ready'
    | 'approved'
    | 'released'
    | 'failed';

/**
 * Whether a submission is the one a student has in the queue.
 *
 * A student holds at most one `active` submission per assignment. A newer Canvas attempt for a
 * student who already has one arrives `held` until staff choose between them, and a replaced
 * submission whose feedback already reached Canvas is kept `superseded` for its release history.
 * Rows written before this field existed carry no value and are treated as active.
 */
export type WritingSubmissionSlot = 'active' | 'held' | 'superseded';

/** Staff choice between a student's current submission and a held newer attempt. */
export type WritingReplacementDecision = 'use_newer' | 'keep_current';

/** What the queue shows about a held newer attempt; never includes its text. */
export interface WritingPendingReplacement {
    submissionId: string; // held row, addressed only through the replacement route
    attempt: number;
    submittedAt?: Date;
    sourceType: WritingSourceType;
}

/** Supported intake provenance; scan sources require explicit staff verification. */
export type WritingSourceType = 'manual' | 'canvas_text' | 'digital_file' | 'paper_scan';

/** Which feedback lens a rubric, prompt, or generated run belongs to. */
export type WritingFeedbackLens = 'linguistic' | 'technical';

/** Instructor-authored criterion slug, frozen after its first approval. */
export type WritingCriterionId = string;

/** Instructor-authored performance-level slug, frozen after its first approval. */
export type WritingLevelId = string;

/** SFL communicative function shared by rubric criteria and anchored comments. */
export type WritingFunctionTag = 'content' | 'interpersonal' | 'organizational';

/** Language scale used by the SFL analyzer and staff annotation filters. */
export type WritingLanguageLevel = 'text' | 'section' | 'clause_word';

/** Known Ferreira genre profile ids; custom staff profiles are represented as free text. */
export type WritingFoundedGenreId = 'descriptive_report' | 'data_commentary' | 'problem_solution';

/** Explicit state of the staff-reviewed genre/register profile used by V2 analysis. */
export type WritingGenreProfileState = 'declared' | 'staff_confirmed' | 'custom' | 'composite' | 'needs_staff_input';

/** One staff-approved stage or embedded move in a genre/register profile. */
export interface WritingSflStage {
    id: string; // stable staff-authored stage key used only inside this rubric version
    label: string; // staff-visible stage name
    purpose: string; // communicative work this stage is expected to perform
    required?: boolean; // whether absence can be treated as an assignment issue
    order?: number; // optional expected order, allowing composite/repeated stages
}

/**
 * Staff-approved assignment profile for SFL-founded linguistic feedback.
 *
 * This is versioned with the linguistic rubric. It gives the analyzer enough
 * genre/register context to interpret language choices without inventing hidden
 * assignment requirements.
 */
export interface WritingSflContextProfile {
    genreId?: WritingFoundedGenreId | string; // known profile id or staff-authored custom/composite label
    genreLabel: string; // plain-language genre or document type shown to staff
    genreState: WritingGenreProfileState; // whether the profile is confirmed enough for evaluation
    task: string; // what students were asked to produce
    purpose: string; // communicative work expected of the submission
    audience: string; // intended reader named by the assignment
    field: string; // disciplinary subject matter and technical activity
    tenor: string; // writer-reader relationship and expected stance
    mode: string; // channel/format, preparation, length, and interaction conditions
    actualEvaluator: string; // who will actually mark/review the submission
    productionConditions: string; // exam/homework/collaborative/resource constraints
    stages: WritingSflStage[]; // staff-confirmed stages or moves; may be custom/composite
    embeddedGenres: string[]; // nested genres, e.g. data commentary inside a lab report
    taskRequirements: string[]; // explicit task objects such as title, citations, figures, APA
    learningOutcomes: string[]; // outcomes the analyzer may connect to
    approvedGlossaryTerms?: string[]; // optional course glossary terms relevant to this assignment
}

/** Genres the diagnosis may say a text realizes: the founded three plus common neighbours. */
export const REALIZED_GENRES = [
    'descriptive_report', 'data_commentary', 'problem_solution',
    'explanation', 'recount', 'procedure', 'argument', 'personal_response', 'unclear'
] as const;

export type RealizedGenre = typeof REALIZED_GENRES[number];

/**
 * The gate decision stored on a run: `global_revision` marks a whole-text problem (wrong genre,
 * or most required stages weak or missing). Staff-only; read it through `hasWholeTextProblem`.
 */
export type FeedbackMode = 'standard' | 'global_revision';

/** One profile stage as the diagnosis found it in the text. */
export interface TextDiagnosisStage {
    stageId: string; // a stage id from the approved profile
    status: 'present' | 'weak' | 'missing';
    evidence?: string; // exact quote; absent when the stage is missing
}

/**
 * Whole-text judgment made before any local analysis. Staff-only except where the writer
 * turns a whole-text problem into the student-facing `overallMessage`.
 */
export interface TextDiagnosis {
    realizedGenre: RealizedGenre;
    genreFit: 'fits' | 'partial' | 'mismatch';
    stages: TextDiagnosisStage[]; // exactly one entry per approved profile stage
    contradictingFeatures: Array<{ quote: string; note: string }>; // language doing another genre's work
    transferableStrengths: Array<{ text: string; quote?: string }>; // choices worth keeping whatever the student writes next
    rationale: string; // staff-only
}

/** What a retrieval need is about. */
export type RetrievalNeedKind = 'genre' | 'stage' | 'task_requirement' | 'language_function' | 'contrast' | 'finding' | 'criterion';

/**
 * One cell of the rubric grid: the points a criterion earns at one level, and the
 * descriptor that justifies it. A range rather than a single value, because staff
 * award within a band. `min` and `max` may be equal where a small weight leaves no
 * room to spread.
 */
export interface WritingRubricCell {
    min: number; // lowest points awardable in this band, inclusive
    max: number; // highest points awardable in this band, inclusive
    label?: string; // rating name for this criterion at this level, as Canvas names it per row
    descriptor?: string; // criterion-specific meaning of this level
    /**
     * Who wrote the descriptor: copied from staff material (`source`), or written by EngE-AI
     * because the material had none (`proposed`). Absent means staff wrote or accepted it;
     * editing a cell's descriptor removes the marker, and approval clears `proposed`.
     */
    origin?: 'source' | 'proposed';
}

/** One instructor-authored criterion in a versioned Writing Feedback rubric. */
export interface WritingRubricCriterion {
    id: WritingCriterionId; // stable instructor-authored slug shared across model output and staff UI
    label: string; // staff/student-facing criterion name
    description: string; // instructor-authored assessment meaning
    /**
     * `'proposed'` when EngE-AI wrote the description because staff material gave none.
     * Absent means staff wrote or accepted it; editing the description removes the marker,
     * and approval clears it.
     */
    descriptionOrigin?: 'proposed';
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
    /**
     * Who writes this criterion's feedback. Absent means `'model'`, which is what every
     * rubric authored before this field carried.
     *
     * `'staff'` marks a criterion the model has no evidence for -- formatting, file naming,
     * anything resting on how the document looks rather than what it says, since extraction
     * yields text alone. The generator is not asked about such a criterion at all: made to
     * answer, it can only report the absence, which is how every submission came to carry the
     * same sentence about fonts and margins. Staff write it in review instead.
     */
    assessedBy?: 'model' | 'staff';
}

/** One allowed ordinal level, optionally carrying an instructor-approved numeric value. */
export interface WritingRubricLevel {
    id: WritingLevelId; // stable instructor-authored slug emitted by the feedback engine
    label: string; // human-readable level shown in review and PDF output
    description: string; // instructor-authored performance descriptor
    rank: number; // explicit worst-to-best position, contiguous from one
    /** Optional instructor-authored points retained for rubric bands/legacy mappings. */
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
    /** Staff-approved genre/register profile required by the V2 linguistic pipeline. */
    sflContext?: WritingSflContextProfile;
    /** Course terms students were taught for this assignment; feedback may use them with a short gloss. */
    courseTerms?: string[];
    /**
     * Where this version's grid came from, set when a fill chose its source. Kept on the version
     * rather than the assignment so a discarded draft takes its source with it and an approval
     * carries it forward. Absent on older versions, where the assignment's `rubricSource` /
     * `technicalRubricSource` answer instead.
     */
    gridSource?: {
        kind: 'builtin' | 'canvas' | 'uploaded';
        label?: string; // the source's name, for a grid built from staff material
        notes?: string[]; // what extraction asked staff to check
    };
}

/** Course-scoped assignment whose current approved rubric governs all downstream artifacts. */
export interface WritingAssignment {
    id: string; // internal assignment identity
    courseId: string; // authorization and persistence boundary
    title: string; // staff/student-facing assignment label
    profileVersion: string; // originating platform-template provenance retained on feedback runs
    /**
     * Where the writing grid came from: the built-in profile, the Canvas rubric, or a rubric
     * extracted from instructor-uploaded material. Provenance, not synchronization state.
     */
    rubricSource: 'internal_profile' | 'canvas' | 'uploaded';
    /** Raw instructor-approved assignment directions used as rubric-editor context. */
    instructions?: string;
    /** Legacy complete level-to-points mapping derived at approval when levels carry points. */
    gradeMapping?: Record<WritingLevelId, number>;
    /** Current rubric. New assignments hold a draft here until their first approval. */
    rubric: WritingRubricDefinition;
    /** Editable staff draft. Saving never changes the approved rubric. */
    rubricDraft?: WritingRubricDefinition;
    /** Immutable, previously approved versions retained for audit and calibration. */
    rubricHistory?: WritingRubricDefinition[];
    /**
     * True from creation until staff choose the assignment type (D-123).
     *
     * Absent on every assignment created before the choice existed; those keep the type they
     * already have and are never asked. Cleared atomically by the one-time type choice, so the
     * type cannot change afterwards.
     */
    assignmentTypePending?: boolean;
    /** True when this assignment is a lab report and also receives technical feedback. */
    isLabReport?: boolean;
    /** Approved technical rubric governing the technical lens. Absent until first approval. */
    technicalRubric?: WritingRubricDefinition;
    /** Editable staff draft of the technical rubric; saving never changes the approved one. */
    technicalRubricDraft?: WritingRubricDefinition;
    /** Immutable previously approved technical rubrics retained for audit. */
    technicalRubricHistory?: WritingRubricDefinition[];
    canvasAssignmentId?: string; // optional source reference for approved integration work
    /**
     * Set when this assignment was imported from Canvas but its Canvas rubric could
     * not be represented as a grid, so the built-in profile seeded the draft instead.
     */
    canvasRubricRefusal?: CanvasRubricRefusal;
    /**
     * Rubrics extraction found in staff material, held until staff choose one, when the material
     * held more than one (for example a draft and a final version of the same rubric).
     */
    pendingRubricExtraction?: {
        lens: WritingFeedbackLens;
        sourceLabel: string;
        candidates: Array<{ title: string; shape: ImportedRubricShape; notes: string[]; deductions: string[]; needsDescriptions?: string[]; needsCriterionDescriptions?: string[] }>;
        createdAt: Date;
    };
    /**
     * Set when the imported Canvas rubric seeded the draft but some of its descriptions were
     * longer than the grid allows and were shortened. Written at creation only.
     */
    canvasRubricShortened?: boolean;
    /**
     * The Canvas rubric exactly as imported, held independently of which lens uses it.
     *
     * Kept whole because lens routing cannot happen at import time: `isLabReport` is set by a
     * later PATCH, so the import does not yet know whether this rubric belongs to the technical
     * lens. Written at creation only and never re-stamped — the rule `canvasRubricRefusal`
     * follows, and for the same reason: re-stamping onto a grid staff have since edited would
     * be wrong.
     *
     * `ids` is what makes a Canvas rubric writable. Our criterion ids are derived from criterion
     * names, so nothing else can address Canvas's own `_1234`-style ids on release.
     */
    canvasRubricImport?: {
        shape: ImportedRubricShape;
        ids: CanvasRubricIdMap;
        importedAt: Date;
    };
    /**
     * Where the technical grid came from. `rubricSource` describes the writing lens only.
     *
     * Split per lens so a Canvas-seeded technical rubric does not make the writing lens report
     * `canvas` and lose the metafunctions auto-fill that a lab report's writing lens needs.
     */
    technicalRubricSource?: 'canvas' | 'builtin' | 'uploaded';
    /** Assignment description and metadata imported from Canvas; reference material only. */
    canvasDetails?: CanvasAssignmentDetails;
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
    /** Internal per-student identifier, stable across attempts; never an institutional PUID. */
    studentId: string;
    /** Queue slot; absent on rows that predate it, which count as `active`. */
    slot?: WritingSubmissionSlot;
    /** On a `held` row: the active submission it would replace. */
    replacesSubmissionId?: string;
    /** On an active row: newer Canvas attempts staff chose not to use, so sync skips them. */
    declinedAttempts?: number[];
    /** On a `superseded` row: when staff replaced it. */
    supersededAt?: Date;
    /** Staff-visible label; never returned to students. */
    studentLabel?: string;
    attempt: number; // distinguishes repeat attempts by the same student for idempotent import/release
    /**
     * When the student submitted, as Canvas reports it. Absent for manually created
     * submissions, which have no trustworthy submission time; `createdAt` is the import time.
     */
    submittedAt?: Date;
    /**
     * Provider-scoped Canvas user id, present only on submissions pulled from a live Canvas
     * course. It exists because {@link WritingSubmission.studentId} is a one-way hash and
     * Canvas addresses a submission by user id on write-back, so release could not otherwise
     * find its target without re-deriving it from a fresh fetch.
     *
     * This is a Canvas-internal integer, the same class of identifier as
     * `activeCourse.lmsLink.courseId`. It is deliberately **not** an institutional identifier:
     * `integration_id` (PUID), `sis_user_id` (student number), and `login_id` (CWL) are never
     * read, never stored, and never logged.
     *
     * It travels in staff-facing responses, which is not a leak: Writing Feedback is a
     * staff-only surface, and those same payloads already carry the student's real name in
     * {@link WritingSubmission.studentLabel}, which identifies a person far more directly than
     * a provider-scoped integer does. What must hold is that it never reaches a student and is
     * never logged. The Canvas import preview strips it anyway, because that response also
     * carries attachment download URLs that must not leave the server.
     */
    canvasUserId?: string;
    sourceType: WritingSourceType; // controls intake and verification expectations
    originalText: string; // extracted/source transcript retained for staff comparison
    verifiedText?: string; // sole text permitted to enter feedback generation
    requiresVerification: boolean; // hard gate for OCR or unresolved extraction
    /**
     * Who confirmed `verifiedText` for a file submission. `batch` means batch generation accepted
     * the extracted text after the automatic quality check, and no person has compared it with
     * the file, so the review page says so. Absent on submissions that never needed confirming.
     */
    transcriptConfirmedBy?: 'staff' | 'batch';
    /**
     * When staff last edited `verifiedText` after it was first confirmed. Feedback runs and staff
     * revisions from before this moment are anchored to the old text: runs must be generated
     * again, and older annotations are no longer loaded.
     */
    transcriptEditedAt?: Date;
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

/**
 * Why a submission is, or is not, part of a batch generation run.
 *
 * - `no_draft`: verified text, no feedback yet
 * - `failed`: the last generation attempt failed
 * - `transcript`: a file submission whose extracted text passes the automatic check; the batch
 *   confirms it and then generates
 * - `stale`: feedback generated with an older rubric version; included only when staff opt in
 * - `needs_transcript`: text staff must confirm by hand (a scan, or extraction that failed the check)
 * - `in_progress`: already queued or generating
 * - `done`: current feedback, or already released
 */
export type WritingBatchCategory = 'no_draft' | 'failed' | 'transcript' | 'stale' | 'needs_transcript' | 'in_progress' | 'done';

/** What batch generation would do for one assignment; the confirmation modal shows it. */
export interface WritingBatchPreview {
    counts: Record<WritingBatchCategory, number>;
    /** Staff-readable reason nothing can be generated (for example, the rubric is not approved). */
    blockedReason?: string;
}

/** What a started batch actually queued. */
export interface WritingBatchStartResult {
    queued: number; // generation jobs added, including confirmed transcripts
    transcriptsConfirmed: number; // file transcripts the batch confirmed before queuing
    skipped: number; // submissions left for staff: transcripts to confirm, or queuing refused
}
