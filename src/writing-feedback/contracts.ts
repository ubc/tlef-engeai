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
    /** Legacy complete level-to-points mapping derived at approval when levels carry points. */
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
    /**
     * Set when this assignment was imported from Canvas but its Canvas rubric could
     * not be represented as a grid, so the built-in profile seeded the draft instead.
     */
    canvasRubricRefusal?: CanvasRubricRefusal;
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
    technicalRubricSource?: 'canvas' | 'builtin';
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
    /** Internal operational identifier, never an institutional PUID. */
    studentId: string;
    /** Staff-visible label; never returned to students. */
    studentLabel?: string;
    attempt: number; // distinguishes repeat attempts by the same student for idempotent import/release
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
 * One rating (column) on an imported Canvas rubric row.
 *
 * Canvas defines ratings **per criterion**, so two rows of the same rubric may carry different
 * numbers of ratings. That raggedness is preserved rather than normalized: padding rows to a
 * rectangle would invent rating cells the instructor never wrote.
 */
export interface CanvasRubricRating {
    /** Canvas's own rating id. Transport only — never persisted locally. */
    canvasRatingId: string;
    label: string; // Canvas `description`; the short rating name, e.g. "Full Marks"
    description: string; // Canvas `long_description`; the performance descriptor
    /** Points Canvas assigns this rating. Displayed only — never used to compute a grade today. */
    points?: number;
}

/**
 * One criterion (row) of a Canvas rubric, exactly as Canvas returned it.
 *
 * A transport shape, not a stored one: `canvas-rubric-mapping.ts` turns these rows into the
 * criteria and levels that seed an assignment's first rubric draft, and nothing persists this
 * shape. An assignment therefore only ever carries one rubric.
 */
export interface CanvasRubricRow {
    /** Canvas's own criterion id. Transport only — never persisted locally. */
    canvasCriterionId: string;
    label: string; // Canvas `description`; the row name, e.g. "Thesis"
    description: string; // Canvas `long_description`; the row's fuller explanation
    /**
     * Canvas's per-criterion point value — a weight, carried onto the seeded criterion's
     * `points`. It arrives inside an *unapproved* draft, so a Canvas weight only reaches
     * grading after an instructor has reviewed and approved it: nothing is inferred.
     */
    points?: number;
    ratings: CanvasRubricRating[]; // this row's own ratings, in Canvas order
}

/**
 * A rubric authored in Canvas, as read from Canvas.
 *
 * This is what crosses the wire, not what is stored. The rubric grid model now carries a
 * variable criterion count, per-criterion cells, and row weights, so a Canvas rubric maps onto
 * {@link WritingRubricDefinition} directly — `canvas-rubric-mapping.ts` does that mapping and
 * `seedRubricForLens` makes the result an assignment's starting draft. There is no second
 * stored rubric to keep in step, and no editor for one.
 */
/** Why a Canvas rubric could not become a grid. Staff-facing text lives in the page. */
export type CanvasRubricRefusal =
    | 'no_rubric'
    | 'too_few_ratings'
    | 'too_many_criteria'
    | 'too_many_levels';

/**
 * Rubric structure lifted from an imported LMS assignment, before it becomes a draft.
 *
 * Defined here rather than beside `seedRubricForLens` because {@link WritingAssignment}
 * stores one, and this module deliberately imports nothing from the Writing Feedback
 * modules that import it. `rubric-seed.ts` re-exports it, so every existing import resolves.
 */
export interface ImportedRubricShape {
    criteria: WritingRubricCriterion[];
    levels: WritingRubricLevel[];
}

/**
 * Canvas's own ids for one imported rubric, keyed by the ids the mapper derived.
 *
 * The mapper builds our ids from each criterion's visible name, because a Canvas id such as
 * `_1234` cannot satisfy the grid schema's id pattern. Writing a staff assessment back into
 * the Canvas rubric needs the id that would otherwise be discarded, so it is kept beside the
 * grid rather than adopted as ours — every stored feedback run, evidence record and PDF
 * references our criterion id, and changing its format would mean migrating all of them.
 *
 * Lives here for the same reason {@link CanvasRubricRefusal} does: `canvas-rubric-mapping.ts`
 * imports this module, so the type it needs on {@link WritingAssignment} cannot live there.
 * That module re-exports it.
 */
export interface CanvasRubricIdMap {
    [ourCriterionId: string]: {
        criterionId: string; // Canvas criterion id, e.g. "_1234"
        ratingIds: Record<string, string>; // our level id -> Canvas rating id
    };
}

export interface CanvasImportedRubric {
    /** Canvas rubric id when `rubric_settings` reports one. */
    canvasRubricId?: string;
    title: string; // Canvas rubric title, or the assignment title when unnamed
    /** Total points Canvas reports for the rubric. Display only. */
    pointsPossible?: number;
    rows: CanvasRubricRow[]; // criteria in Canvas order
    importedAt: Date; // when this rubric was pulled from Canvas
}

/**
 * Assignment context imported from Canvas alongside the rubric.
 *
 * Held as raw source text. A future agent derives the rubric's `task`, `purpose`, `audience`,
 * and `constraints` from it; until that exists this is reference material for staff, and
 * nothing reads it automatically.
 */
export interface CanvasAssignmentDetails {
    /** Canvas `description` — rich-editor HTML, stored as delivered. */
    descriptionHtml?: string;
    /** Plain-text rendering of the description, for display and future extraction. */
    descriptionText?: string;
    pointsPossible?: number; // Canvas assignment points, distinct from the rubric total
    dueAt?: Date; // Canvas due date at import time
    importedAt: Date; // when these details were pulled
}

/** Exact verified-text excerpt and rationale supporting one rubric judgment. */
export interface RubricEvidence {
    quote: string; // exact substring, capped to 280 characters at model validation
    rationale: string; // explains how the excerpt supports the criterion judgment
    /** V2 SFL finding ids this evidence item came from, if generated by the analyzer pipeline. */
    sflFindingIds?: string[];
    /** Student-visible course-material label selected from server-validated retrieved sources. */
    courseMaterialMention?: CourseMaterialMention;
    /** Optional glossary entry id reused by staff/model; definitions are resolved server-side. */
    glossaryEntryId?: string;
    /** Definition snapshot retained so old annotations/PDFs do not change after glossary edits. */
    glossarySnapshot?: WritingGlossarySnapshot;
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
    /** Absent on legacy V1 results; `writing-feedback-v2` for the SFL-founded linguistic pipeline. */
    schemaVersion?: string;
    criteria: CriterionFeedback[]; // exactly one result for each supported criterion
    strengths: string[]; // concise formative positives safe for staff review
    revisionGoals: RevisionGoal[]; // at most three prioritized next steps
    internalFlags: string[]; // staff-only uncertainty/constraint signals
    /** Deduplicated student-visible course-material labels selected from validated retrieval. */
    courseMaterialMentions?: CourseMaterialMention[];
}

/** One exact evidence span used by the SFL analyzer before rubric evaluation. */
export interface SflEvidenceSpan {
    quote: string; // exact substring from verified submission text
    startOffset?: number; // optional UTF-16 offset into the verified text
    endOffset?: number; // optional UTF-16 exclusive offset into the verified text
}

/** Structured analyzer finding, intentionally separate from feedback prose and rubric levels. */
export interface SflFinding {
    id: string; // stable id within one run, referenced by later feedback evidence
    evidence: SflEvidenceSpan[]; // exact observed language support
    observation: string; // verifiable language pattern only
    functionalInterpretation: string; // what the pattern may be doing in this assignment context
    primaryFunction: WritingFunctionTag; // Content, Interpersonal, or Organizational owner
    crossFunctions: WritingFunctionTag[]; // additional metafunction links retained for dedupe
    languageLevel: WritingLanguageLevel; // text, section, or clause/word scale
    ruleIds: string[]; // curated SFL/Ferreira rule ids, staff-only
    sourceIds: string[]; // curated source ids/locators, staff-only
    confidence: number; // analyzer confidence, never student-facing
    alternatives: string[]; // acceptable alternatives or non-deficit interpretations
    abstentionReason?: string; // why this finding should not become feedback
    stageId?: string; // staff-profile stage/move this finding applies to
}

/** Validated analyzer output consumed by the separate feedback writer call. */
export interface SflAnalysis {
    schemaVersion: string; // analyzer schema version
    foundationVersion: string; // curated resource version used for this analysis
    profileGenreState: WritingGenreProfileState; // copied from the approved profile
    findings: SflFinding[]; // validated observations/interpretable findings
    abstentions: string[]; // non-blocking gaps such as inaccessible figures or unsupported genres
    internalFlags: string[]; // staff-only validation and context warnings
}

/** Server-resolved course material label safe for student-facing feedback. */
export interface CourseMaterialMention {
    id: string; // deterministic mention identity within a run
    label: string; // e.g. "Week 4 · Lecture 2 · Information flow"
    courseId?: string; // stable course id when metadata supports it
    topicOrWeekId?: string; // stable topic/week id when metadata supports it
    topicOrWeekTitle?: string; // legacy title fallback for display
    itemId?: string; // stable item id when metadata supports it
    itemTitle?: string; // legacy item title fallback for display
    materialId?: string; // uploaded material id from RAG metadata
    materialName?: string; // uploaded material title/name
    version?: string; // material/source version when metadata supplies one
}

/**
 * Staff- and model-only course text.
 *
 * Deliberately separate from {@link CourseMaterialMention}: a mention is a student-facing
 * label, and this is the document text behind it. It must never reach an AnchoredComment,
 * a mention, a generated student PDF, or a release payload.
 */
export interface CourseMaterialExcerpt {
    /** Present only for published material, which is the only material the writer may cite. */
    mentionId?: string;
    /** Truncated course-document text. Never student writing. */
    text: string;
}

/** Versioned course glossary entry staff can reuse in annotations. */
export interface WritingGlossaryEntry {
    id: string; // internal glossary id
    courseId: string; // course scope and authorization boundary
    term: string; // staff-facing term
    normalizedTerm: string; // case/space-folded uniqueness key
    definition: string; // student-safe plain-language definition
    version: number; // increments on explicit staff update
    createdAt: Date; // audit timestamp
    createdBy: string; // internal staff actor
    updatedAt: Date; // latest update timestamp
    updatedBy: string; // internal staff actor
}

/** Definition snapshot copied into generated evidence or staff annotations. */
export interface WritingGlossarySnapshot {
    id: string; // glossary entry id
    term: string; // term as staff saw it at selection time
    definition: string; // definition as staff saw it at selection time
    version: number; // glossary version retained historically
}

/** Staff-only V2 provenance produced by the linguistic engine and stored on the run. */
export interface WritingFeedbackRunTrace {
    schemaVersion: string; // result schema version
    foundationVersion?: string; // curated SFL foundation version
    analyzerPromptVersion?: string; // analyzer prompt contract version
    writerPromptVersion?: string; // writer prompt contract version
    sflAnalysis?: SflAnalysis; // validated analyzer trace, staff-only
    courseMaterialMentions?: CourseMaterialMention[]; // allowlisted retrieved sources used by writer
    courseMaterialExcerpts?: CourseMaterialExcerpt[]; // course text shown to the writer, staff-only
    staffCourseMaterialMentions?: CourseMaterialMention[]; // retrieved material including unpublished, staff-only
    citableCourseMaterialMentionIds?: string[]; // ids staff may cite; the rest are unpublished, staff-only
    courseSourceVersion?: string; // retrieval/metadata resolver contract version
    glossaryEntryVersions?: WritingGlossarySnapshot[]; // glossary definitions referenced by the draft
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
    /** V2 run-level provenance; absent on legacy V1 records. */
    schemaVersion?: string;
    foundationVersion?: string;
    analyzerPromptVersion?: string;
    writerPromptVersion?: string;
    sflAnalysis?: SflAnalysis;
    courseMaterialMentions?: CourseMaterialMention[];
    /** Citable mention ids, including published material beyond the student-facing display cap. */
    citableCourseMaterialMentionIds?: string[];
    /** Staff-only retrieved material labels, including unpublished sources. */
    staffCourseMaterialMentions?: CourseMaterialMention[];
    /** Staff/model-only course text excerpts shown to the writer. */
    courseMaterialExcerpts?: CourseMaterialExcerpt[];
    courseSourceVersion?: string;
    glossaryEntryVersions?: WritingGlossarySnapshot[];
}

/** Staff/model comment anchored to an exact UTF-16 span of verified submission text. */
export interface AnchoredComment {
    id: string; // stable client/revision identity
    /**
     * Which rubric this comment is about.
     *
     * Absent on every comment stored before lab-report annotation existed, which are all
     * linguistic; the validator supplies that default, so no migration runs. `criterion`
     * is read against this lens's rubric, which is what lets the two lenses use criterion
     * ids independently.
     */
    lens: WritingFeedbackLens;
    /** Optional rubric association for filtering, resolved against this comment's lens. */
    criterion?: WritingCriterionId;
    /** Exact substring of the verified text; validation checksum for the offsets. */
    quote: string;
    /** UTF-16 code-unit offsets into the verified text. Offsets are the anchor source of truth. */
    startOffset: number; // inclusive UTF-16 source boundary
    endOffset: number; // exclusive UTF-16 source boundary
    comment: string; // primary student-safe popup feedback
    howToImprove?: string; // optional formative action appended to the popup
    courseMaterialLink?: string; // optional http(s) learning resource
    /** Server-resolved course-material label. Preferred over arbitrary links for V2 feedback. */
    courseMaterialMention?: CourseMaterialMention;
    glossaryDefinition?: { term: string; definition: string }; // optional term support
    glossaryEntryId?: string; // selected course glossary entry, if any
    glossarySnapshot?: WritingGlossarySnapshot; // historical definition retained for PDFs
    /** Seeded from immutable model evidence or authored by staff. */
    origin: 'model_seed' | 'staff';
    /**
     * Display name of the staff member who authored the comment. Stamped
     * server-side at save time (never client-controlled) and carried forward
     * across revisions; unset for model seeds. Roster display name, never a PUID.
     */
    authorName?: string;
    /**
     * Staff-facing triage metadata from SFL trace evidence or staff review.
     * Never printed in the student PDF.
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
    /** Human-authored rubric result. Model suggestions remain separate and staff-only. */
    finalAssessment?: StaffFinalAssessment;
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
}

/** Release coordinator boundary separating preview persistence from external mutation. */
export interface CanvasReleaseService {
    /** Persists or reuses an idempotent release preview without external submission. */
    preview(input: CanvasReleaseInput): Promise<WritingRelease>;
    /** Requires approval and numeric mapping before finalizing an external release. */
    release(input: CanvasReleaseInput): Promise<WritingRelease>;
}
