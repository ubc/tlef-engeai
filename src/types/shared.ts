// src/types/shared.ts

/**
 * Types for the student mode
 * @author: @gatahcha
 * @version: 1.0.1
 * @since: 2025-09-02
 */

// =====================================
// ========= CHAT DATA TYPE ============
// =====================================
//
// MongoDB layout (conversation / struggle data):
//
//   {courseName}_users  →  CourseUser.chats[]     →  Chat  (one thread per element)
//   {courseName}_memory-agent  →  MemoryAgentEntry  (one row per userId; struggle labels)
//
// Struggle topics are NOT stored on Chat. They are written on MemoryAgentEntry and injected
// at LLM call time for Socratic chats only (see planner/struggle-topics-socratic-only-simplification.md).


/**
 * Selectable teaching mode slug for prompts and student picker choices.
 *
 * `undeclared` is not a prompt mode. It is a persisted lifecycle state on
 * {@link Chat.conversationMode} until the first user message finalizes the chat to a real mode.
 *
 * Current product phase: memory-agent struggle detection and per-turn struggle tags apply only
 * when the resolved mode is `'socratic'`. Explanatory does not consume {@link MemoryAgentEntry}.
 */
export const CONVERSATION_MODE_IDS = ['socratic', 'explanatory'] as const;

export type ConversationModeId = (typeof CONVERSATION_MODE_IDS)[number];

/**
 * Retired chat mode slugs. `scenario-generation` was removed from the chat mode picker and
 * replaced by the standalone Practice Scenarios / Scenario Questions feature (see
 * `planner/improved-scenario-generation-deliverables.md`). Kept only so legacy chat documents
 * that already persisted this value continue to type-check and render history; never selectable
 * for new chats or sends.
 */
export const RETIRED_CONVERSATION_MODE_IDS = ['scenario-generation'] as const;

export type RetiredConversationModeId = (typeof RETIRED_CONVERSATION_MODE_IDS)[number];

/**
 * Persisted chat lifecycle mode. `undeclared` means the chat has not received a user message yet.
 * Includes {@link RetiredConversationModeId} so legacy chat documents remain type-safe.
 */
export type PersistedConversationModeId = ConversationModeId | RetiredConversationModeId | 'undeclared';

/**
 * Catalog availability for a {@link ConversationModeId} (GET /api/chat/conversation-modes).
 * Not stored on MongoDB chat documents.
 */
export type ConversationModeStatus = 'active' | 'coming_soon';

/** Request body for changing a welcome-only chat's teaching mode. */
export interface UpdateChatConversationModeRequest {
    conversationMode: ConversationModeId;
}

/** Response from PATCH `/api/chat/:chatId/conversation-mode`. */
export interface UpdateChatConversationModeResponse {
    success: boolean;
    conversationMode?: ConversationModeId;
    error?: string;
}

/**
 * One persisted turn in a chat thread.
 *
 * **MongoDB:** embedded in {@link Chat.messages} inside `{courseName}_users.chats[]`.
 * **Written:** user and assistant turns via chat routes / `updateUserChat`.
 *
 * Only student-visible message text is stored. RAG wrappers (`<course_materials>`), struggle
 * tags (`<struggle_topics>`), and unstruggle tags are assembled in a forked LLM context at
 * send time and are not written to this field.
 */
export interface ChatMessage {
    /** Stable message id (generated server-side). */
    id: string;
    sender: 'user' | 'bot';
    /** Roster userId (string), not puid. */
    userId: string;
    courseName: string;
    /** Plain message body as shown in the UI (no ephemeral LLM context). */
    text: string;
    /** Unix epoch milliseconds. */
    timestamp: number;
}

/**
 * Persisted chat conversation (one thread).
 *
 * **MongoDB path:** `{courseName}_users` document where `userId` matches → `chats[]` element.
 * **Created:** `ChatMongo.addChatToUser` on `POST /api/chat/newchat`.
 * **Updated:** `ChatMongo.updateUserChat` after each message, pin, title, or soft-delete.
 *
 * {@link MemoryAgentEntry.struggleTopics} is per-user/per-course, not per-chat. Socratic chats
 * read that collection at runtime; struggle state is never duplicated on this document.
 */
export interface Chat {
    /** Deterministic chat id from user, course, and creation date. */
    id: string;
    courseName: string;
    /** Course content frame label (week/topic); may be empty at creation. */
    topicOrWeekTitle: string;
    /** Sidebar title; starts as `"New Chat"`, may be auto-updated after first exchange. */
    itemTitle: string;
    /** Ordered transcript; see {@link ChatMessage}. */
    messages: ChatMessage[];
    isPinned: boolean;
    pinnedMessageId?: string | null;
    /** Soft delete; omitted or false = active. Filtered out by `getUserChats`. */
    isDeleted?: boolean;
     /**
      * Persisted lifecycle state. New welcome-only chats start as `'undeclared'`; first user send
      * finalizes to a real {@link ConversationModeId}. Legacy rows are lazily restored based on
      * message history.
      */
     conversationMode?: PersistedConversationModeId;
}

/**
 * Lightweight chat summary derived from {@link Chat} (no `messages` payload).
 *
 * **Produced by:** `ChatMongo.getUserChatsMetadata` → GET `/api/chat/user/chats/metadata`.
 * Used for sidebar listing and sort-by-last-activity.
 */
export interface ChatMetadataSummary {
    id: string;
    courseName: string;
    itemTitle: string;
    isPinned: boolean;
    pinnedMessageId?: string | null;
    messageCount: number;
    lastMessageTimestamp: number;
    /**
     * Persisted mode for picker display. Omitted by metadata query today; load full {@link Chat}
     * when mode is required (e.g. conversation mode picker lock).
     */
    conversationMode?: PersistedConversationModeId;
}

// ===========================================
// ========= ONBOARDING DATA TYPE ============
// ===========================================

export enum onBoardingScreen {
    GettingStarted = 1,
    CourseName = 2,
    InstructorName = 3,
    TAName = 4,
    CourseFrame = 5,
    ContentNumber = 6,
    Finalization = 7,
}

// ===========================================
// ========= INSTRUCTOR DATA TYPE ============
// ===========================================

// Instructor/TA data structure - stores both userId and name
export interface InstructorInfo {
    userId: string;
    name: string;
}

export interface activeCourse {
    id : string,
    date : Date,
    courseSetup : boolean, 
    contentSetup : boolean,
    flagSetup : boolean,
    monitorSetup : boolean,
    courseName: string,
    instructors: InstructorInfo[] | string[]; // Support both old format (string[]) and new format (InstructorInfo[])
    teachingAssistants: InstructorInfo[] | string[]; // Support both old format (string[]) and new format (InstructorInfo[])
    frameType: frameType;
    tilesNumber: number;
    topicOrWeekInstances: TopicOrWeekInstance[]; // previously content, previously divisions
    courseCode?: string; // 6-character uppercase alphanumeric PIN code for course entry
    collections?: {
        users: string;
        flags: string;
        memoryAgent: string;
        /** Per-course scheduled publish jobs (e.g. `${courseName}_scheduled_tasks`) */
        scheduledTasks?: string;
        /** Per-course Practice Scenarios question bank (e.g. `${courseName}_scenario_questions`); SQ-001 lazy-provisions on existing courses */
        scenarioQuestions?: string;
    };
    collectionOfInitialAssistantPrompts?: InitialAssistantPrompt[];
    /** @deprecated v2 uses systemPromptConfig; retained for lazy migration reads only */
    collectionOfSystemPromptItems?: SystemPromptItem[];
    systemPromptConfig?: CourseSystemPromptConfig;
    /** FK to `academic-periods.id`; lazy-migrated via AP-001 when missing */
    academicPeriodId?: string;
}

/**
 * Academic period catalog document (`academic-periods` collection).
 */
export interface AcademicPeriodDocument {
    id: string;
    title: string;
    startDate: Date;
    endDate: Date;
    courseIds: string[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Period-scoped instructor allow-list (`instructor-period-allowances` collection).
 */
export interface InstructorPeriodAllowance {
    puid: string;
    academicPeriodId: string;
    allowedCourseNames: string[];
    updatedAt: Date;
}

/**
 * Initial Assistant Prompt data structure
 * Stores custom initial assistant prompts that instructors can create and select for their courses
 */
export interface InitialAssistantPrompt {
    id: string;
    title: string;
    content: string;
    dateCreated: Date;
    isSelected: boolean;
    isDefault?: boolean; // If true, this is the system default prompt (unremovable)
}

/**
 * Default prompt ID constant
 * Used to identify the system default initial assistant prompt
 */
export const DEFAULT_PROMPT_ID = 'default-engeai-welcome';

/**
 * System Prompt Item data structure
 * Stores custom system prompt items that instructors can create and append to the system prompt
 */
export interface SystemPromptItem {
    id: string;
    title: string;
    content: string;
    dateCreated: Date;
    isAppended: boolean; // Tracks if item is chosen/unchosen - both stored in MongoDB
    isDefault?: boolean; // Marks the three default components (base prompt, learning objectives, struggle topics)
    componentType?: 'base' | 'learning-objectives' | 'struggle-topics' | 'custom'; // Type of component
}

/**
 * Default system prompt component ID constants
 * Used to identify the three default system prompt components
 */
export const DEFAULT_BASE_PROMPT_ID = 'default-base-system-prompt';
export const DEFAULT_LEARNING_OBJECTIVES_ID = 'default-learning-objectives';
export const DEFAULT_STRUGGLE_TOPICS_ID = 'default-struggle-topics';

/** Single editable module within a course system prompt (instructor-authored). */
export interface SystemPromptModule {
    id: string;
    body: string;
    sortOrder: number;
}

/** Per-mode system prompt state stored on activeCourse.systemPromptConfig.modes. */
export interface ModeSystemPromptState {
    usePlatformDefault: boolean;
    modules: SystemPromptModule[];
    updatedAt: string;
    platformDefaultVersion?: string;
}

/** Course-level system prompt configuration (v2). */
export interface CourseSystemPromptConfig {
    schemaVersion: 1;
    defaultConversationMode: ConversationModeId;
    modes: {
        socratic: ModeSystemPromptState;
        explanatory: ModeSystemPromptState;
    };
}

/**
 * frameTypes: Course content organization strategy. 
 *              It is either percourse or perweek 
 */
export type frameType = 
    | 'byWeek'
    | 'byTopic'
;

/**
 * The type of content instance : by week or by topic
 */
export interface TopicOrWeekInstance {
    id : string;
    date : Date;
    title: string;
    courseName: string;
    published: boolean;
    /** ISO date when this instance should auto-publish; only meaningful when published is false */
    scheduledPublishAt?: Date | string | null;
    items: TopicOrWeekItem[]; // previously content, previously courseItem
    createdAt: Date;
    updatedAt: Date;
}

/** Stored in each course’s `{courseName}_scheduled_tasks` collection (one pending job per topic/week). */
export type ScheduledTaskType = 'scheduled_topic_or_week';

export interface ScheduledTopicOrWeekContent {
    topicOrWeekId: string;
    title: string;
}

export interface ScheduledTaskDocument {
    id: string;
    type: ScheduledTaskType;
    /** Fire time — aligned with TopicOrWeekInstance.scheduledPublishAt for topic/week schedules */
    scheduledFor: Date;
    content: ScheduledTopicOrWeekContent;
    courseId?: string;
}

/**
 * The type for a piece of course content (e.g., lecture, tutorial)
 */
export interface TopicOrWeekItem {
    id: string;
    date: Date;
    title: string;
    courseName: string;
    topicOrWeekTitle: string;
    itemTitle: string;
    completed?: boolean;
    learningObjectives: LearningObjective[];
    instructorStruggleTopics?: InstructorStruggleTopic[];
    additionalMaterials?: AdditionalMaterial[];
    createdAt: Date;
    updatedAt: Date;
}


/**
 * The type of a single learning objective (stored in MongoDB, used for CRUD)
 */
export interface LearningObjective {
    id: string;
    LearningObjective: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * For system prompt display - topic/week and item from predecessor (parent hierarchy)
 */
export interface LearningObjectiveForDisplay {
    LearningObjective: string;
    topicOrWeekTitle: string;
    itemTitle: string;
}

/**
 * Instructor-authored struggle topic catalog entry (per section).
 *
 * `struggleTopic` is the exact label the memory agent may return and that is stored on the student entry.
 * Managed via Documents page CRUD (`/struggle-topics` API).
 */
export interface InstructorStruggleTopic {
    id: string;
    struggleTopic: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Flattened instructor struggle topic with parent hierarchy for memory-agent prompt assembly.
 *
 * Produced by `getAllInstructorStruggleTopics`; not used in the main Socratic system prompt.
 */
export interface InstructorStruggleTopicForDisplay {
    struggleTopic: string;
    /** Parent `topicOrWeekInstances.id` — chapter key for per-chapter struggle storage. */
    topicOrWeekId: string;
    topicOrWeekTitle: string;
    itemTitle: string;
}

/**
 * Additional material attached to a course content item (front-end only for now)
 *
 * additional material is only applicable for text only eventually (as we use RAG)
 * 
 * So initially, instructor can upload file, url, or text.
 * 
 * But eventually, we will only allow text (processed in the backend).
 */
export type AdditionalMaterialSource = 'file' | 'url' | 'text';

export interface AdditionalMaterial {
    id: string,
    date : Date,
    name: string;
    courseName: string;
    topicOrWeekTitle: string;
    itemTitle: string;
    sourceType: AdditionalMaterialSource;
    file?: File;
    text?: string;
    fileName?: string; // Store the actual filename for display
    uploaded?: boolean; // Track if successfully uploaded to Qdrant
    qdrantId?: string; // Store Qdrant document ID
    chunksGenerated?: number; // Number of chunks generated in Qdrant
    /** Parsed upload text for struggle-topic generation; not persisted on Mongo material records. */
    extractedText?: string;
    deleted?: boolean; // Soft delete flag (defaults to false/undefined for backward compatibility)
    deletedAt?: Date; // Timestamp when material was deleted
    uploadedBy?: string; // Track who uploaded the material
    // Add these three optional fields:
    courseId?: string;
    topicOrWeekId?: string;
    itemId?: string;
}

/**
 * Optional fields on RAG upload 201 responses when struggle-topic generation runs post-upload.
 */
export interface UploadStruggleGenerationPayload {
    generatedStruggleTopics?: InstructorStruggleTopic[];
    struggleGenerationSkipped?: boolean;
    struggleGenerationWarning?: string;
}

/**
 * Course-specific user data structure
 * Stores user data specific to a particular course
 * NOTE: PUID is NOT stored here for privacy - only userId is stored
 */
export interface CourseUser {
    name: string;
    userId: string;                // Obtained from GlobalUser (string format)
    courseName: string;            
    courseId: string;              // Course unique ID
    userOnboarding: boolean;       // Course-specific onboarding status
    affiliation: 'student' | 'faculty';
    status: 'active' | 'inactive';
    /** Embedded conversation threads — see {@link Chat}. Collection: `{courseName}_users`. */
    chats: Chat[];
    createdAt: Date;
    updatedAt: Date;
}


// Types for flag reports
export interface FlagReport {
    id: string;
    courseName: string; // Added to support course-specific flag collections
    date: Date;
    flagType: 'innacurate_response' | 'harassment' | 'inappropriate' | 'dishonesty' | 'interface bug' | 'other';
    reportType: string; // store the long explanation of the flag type
    chatContent: string;
    userId: string;
    status: 'unresolved' | 'resolved';
    response?: string; // if resolved, the response from the instructor
    createdAt: Date;
    updatedAt: Date;
}


/**
 * Global user registry
 * Stores core user identity across all courses
 * NOTE: This is the ONLY collection that should store PUID for privacy reasons
 */
export interface GlobalUser {
    name: string;
    puid: string;                   // Privacy-focused Unique Identifier - ONLY stored here
    userId: string;                 // Generated using IDGenerator (string format)
    coursesEnrolled: string[];     // Array of course IDs
    affiliation: 'student' | 'faculty' | 'staff' | 'empty';
    status: 'active' | 'inactive';
    createdAt: Date;
    updatedAt: Date;
    /** true if user has completed any instructor onboarding (optional for backward compat) */
    instructorOnboardingCompleted?: boolean;
    /** true if user has completed any student onboarding (optional for backward compat) */
    studentOnboardingCompleted?: boolean;
    /** platform admin — all instructor privileges plus admin-only features */
    isAdmin?: boolean;
}

/**
 * Backward compatibility alias
 * @deprecated Use CourseUser instead
 */
export type User = CourseUser;

// ===========================================
// ========= MEMORY AGENT DATA TYPE ==========
// ===========================================

/**
 * Memory-agent row: struggle topic labels for a user in one course.
 *
 * **MongoDB collection:** `{courseName}_memory-agent` (one document per `userId`).
 * **Written:** `MemoryAgentMongo.updateMemoryAgentStruggleWords` after memory-agent analysis;
 * initialized empty via `initializeMemoryAgentForUser` on course entry.
 *
 * Current product phase: struggle topics are consumed only by Socratic chats
 * (`Chat.conversationMode === 'socratic'` after resolution). They are injected into the
 * LLM fork on each send — not copied onto {@link Chat} or {@link ChatMessage}.
 *
 * Flow: empty at onboarding → memory agent appends labels after repeated difficulty in
 * Socratic conversations → later turns about those topics use direct explanation (see
 * system prompt `STRUGGLE_TOPICS_SECTION` in Socratic mode only).
 */
/** Derived view of struggle labels grouped by course chapter — not persisted on {@link MemoryAgentEntry}. */
export interface MemoryAgentChapterStruggle {
    topicOrWeekId: string;
    topicOrWeekTitle: string;
    /** Verbatim catalog labels; distinct within chapter. */
    struggleTopics: string[];
}

export interface MemoryAgentEntry {
    name: string; // the name of the user
    userId: string; // the user id of the user
    role: 'instructor' | 'TA' | 'Student'; // the role of the user
    /** Distinct verbatim catalog labels for this user (canonical Mongo field). */
    struggleTopics: string[]; // the struggle topics of the user
    createdAt: Date; // the date the user was created
    updatedAt: Date; // the date the user was updated
}

/** One cell in the course-summary / monitor stacked bar chart. */
export interface CourseSummaryStackedBarValue {
    categoryId: string; // used to identify the category of the student
    studentCount: number; // the number of students in the category
    tooltip: string; // the tooltip for the student
}

/** One stacked series (catalog struggle label) in the struggle-topics chart. */
export interface CourseSummaryStackedBarSeries {
    topic: string;
    color: string;
    values: CourseSummaryStackedBarValue[];
}

/** X-axis bucket (course topic or week). */
export interface CourseSummaryCategory {
    id: string;
    label: string;
    order: number;
}

/** Stacked bar chart payload for struggle-topic distribution. */
export interface CourseSummaryStackedBar {
    xAxisLabel: string;
    yAxisLabel: string;
    categories: CourseSummaryCategory[];
    series: CourseSummaryStackedBarSeries[];
}

/** Top struggle labels by course-wide unique student count. */
export interface CourseSummaryTopTopic {
    topic: string;
    studentCount: number;
    percentageOfStudents: number;
}

/** Course-wide legend entry for monitor two-column layout. */
export interface StruggleStatsLegendItem {
    topic: string;
    color: string;
    studentCount: number;
}

/**
 * Aggregated struggle-topic statistics — shared by monitor, course-summary, and PDF (D2+).
 */
export interface CourseSummaryStruggleTopics {
    source: 'memory-agent-per-user';
    groupedBy: 'course-topic-or-week';
    topTopics: CourseSummaryTopTopic[];
    stackedBar: CourseSummaryStackedBar;
    /** Full catalog legend with course-wide unique student counts. */
    legend: StruggleStatsLegendItem[];
}

export type MonitorRosterRole = 'student' | 'instructor' | 'admin' | 'ta';

/** Per-user row in GET /api/courses/monitor/:courseId/conversations (no struggle fields). */
export interface MonitorConversationUserRow {
    userId: string;
    userName: string;
    role: MonitorRosterRole;
    conversationCount: number;
    chats: Array<{ id: string; title: string }>;
}

/** Per-user row in GET /api/courses/monitor/:courseId/struggle-stats. */
export interface MonitorStruggleUserRow {
    userId: string;
    userName: string;
    role: MonitorRosterRole;
    conversationCount: number;
    struggleTopicCount: number;
    struggleTopics: string[];
    /** Derived at read time — not persisted. */
    struggleTopicsByChapter: MemoryAgentChapterStruggle[];
    chats: Array<{ id: string; title: string }>;
}

/** Result of {@link buildCourseStruggleStats}. */
export interface StruggleStatsResult {
    struggleTopics: CourseSummaryStruggleTopics;
    users: MonitorStruggleUserRow[];
}

/** GET /api/courses/:courseId/analytics-access response flags. */
export interface CourseAnalyticsAccessFlags {
    canAccessPostPeriodAnalytics: boolean;
    canViewCourseSummary: boolean;
    canManageRoster: boolean;
    periodEndDate: string | null;
    isAdminEarlyAccess: boolean;
    isAcademicPeriodEnded: boolean;
}

// =====================================================
// ===== SCENARIO QUESTIONS (Practice Scenarios) ======
// =====================================================
//
// Standalone practice bank replacing the retired `scenario-generation` chat mode — see
// `planner/improved-scenario-generation-deliverables.md`. Persisted one document per question in
// `{courseName}_scenario_questions` (collection name on `activeCourse.collections.scenarioQuestions`,
// lazy-provisioned by SQ-001). Not embedded on the `activeCourse` document.

/** Lifecycle of a scenario question. Drafts are invisible to students (404, not 403). */
export type ScenarioQuestionStatus = 'draft' | 'published' | 'rejected';

/** Practice vs exam discriminator on embedded student responses and grading requests. */
export type ScenarioMode = 'practice' | 'exam';

/**
 * @deprecated Prefer {@link ScenarioSubQuestion.subQuestionId}. Kept for SQ-003 backfill of legacy docs.
 * Ordinal letter slot (`a`, `b`, …) used by older drafts.
 */
export type ScenarioPartId = string;

/** @deprecated Legacy partId shape — single lowercase letter. */
export const SCENARIO_PART_ID_PATTERN = /^[a-z]$/;

/** Soft default framework labels used by prompts/docs — not a hard publish requirement. */
export const DEFAULT_SCENARIO_FRAMEWORK_PART_IDS = ['a', 'b', 'c'] as const;

/** @deprecated Use flexible publish (≥1 complete part). Kept as alias of {@link DEFAULT_SCENARIO_FRAMEWORK_PART_IDS}. */
export const REQUIRED_SCENARIO_PART_IDS = DEFAULT_SCENARIO_FRAMEWORK_PART_IDS;

/** @deprecated Prefer non-empty `subQuestionId` checks. */
export function isScenarioPartId(value: unknown): value is ScenarioPartId {
    return typeof value === 'string' && SCENARIO_PART_ID_PATTERN.test(value);
}

/** Instructor-selected / generated subquestion type. */
export type ScenarioSubQuestionType = 'calculation' | 'troubleshoot' | 'action' | 'corrective';

/** Difficulty set at generation; instructor-editable. */
export type ScenarioDifficulty = 'easy' | 'medium' | 'hard';

/**
 * Immutable snapshot of a course learning objective mapped onto a scenario question.
 * Resolved from the topic/week catalog at generate/edit time — not free text.
 */
export interface ScenarioLearningObjectiveSnapshot {
    objectiveId: string; // LearningObjective.id from course content
    text: string; // snapshot of LearningObjective.LearningObjective at mapping time
    sourceTopicOrWeekId: string; // TopicOrWeekInstance.id where the LO lives
    sourceItemId: string; // content item id that owns the LO
}

/** Catalog option returned by the topic-scoped learning-objective lookup for instructor UI. */
export interface ScenarioLearningObjectiveOption {
    objectiveId: string;
    text: string;
    topicOrWeekId: string;
    topicOrWeekTitle: string;
    itemId: string;
    itemTitle: string;
}

/**
 * One immutable student submission for a single sub-question.
 * Embedded on the question document; never written from untrusted client fields for grade/feedback/ids.
 */
export interface ScenarioStudentResponse {
    id: string; // server-generated response id
    studentUserId: string; // internal roster id — never PUID
    mode: ScenarioMode; // practice vs exam discriminator
    studentAnswer: string; // exact submitted text
    grade?: number; // AI integer grade 1–10 — present for exam submissions only
    feedback: string; // TA suggestions (practice) or academic feedback (exam)
    submittedAt: Date; // submission timestamp for history order
}

/**
 * One sub-question embedded on a {@link ScenarioQuestion}. Stored inline (not a separate
 * collection) so publish validation and check-answer stay simple. Count is variable (1–N).
 */
export interface ScenarioSubQuestion {
    subQuestionId: string; // server-generated stable id — survives reorder; API key for check-answer/exam
    /** @deprecated Legacy ordinal letter; retained only until SQ-003 backfill completes. */
    partId?: ScenarioPartId;
    /** Pedagogical type for this part (create UI / generate selection). */
    subQuestionType: ScenarioSubQuestionType;
    prompt: string; // student-facing sub-question text (no "Part (a)" title in prose — UI shows the label)
    points?: number; // optional instructor-assigned weight for this part
    /** Instructor-approved model answer — never sent to students except via the gated solution endpoint. */
    modelAnswer: string;
    /** Immutable history of student submissions for this sub-question. Stripped from student projections. */
    studentResponses: ScenarioStudentResponse[];
}

/**
 * A single practice scenario question. Chapter grouping uses {@link TopicOrWeekInstance.id} (D1).
 * Full document lives in `{courseName}_scenario_questions`; never embedded on `activeCourse`.
 */
export interface ScenarioQuestion {
    id: string; // business id from IDGenerator.scenarioQuestionID
    courseId: string; // activeCourse.id — cross-check FK
    courseName: string; // denormalized, matches the flags/scheduled-tasks pattern for queries/logging
    topicOrWeekId: string; // FK -> TopicOrWeekInstance.id (chapter); orphaned ids show as "Uncategorized" in instructor UI
    title: string;
    status: ScenarioQuestionStatus;
    sourcePrompt: string; // instructor seed (single mode) or batch prompt text used to generate this question
    questionBody: string; // Role + Setup + Crisis narrative (markdown + optional mermaid) — no sub-part titles in prose
    solutionBody: string; // full model solution for instructor review / gated student reveal — stripped on student list/detail APIs
    subQuestions: ScenarioSubQuestion[]; // ≥1 for publish; each present part needs non-empty prompt+modelAnswer
    difficulty: ScenarioDifficulty;
    expectedTimeMinutes: number;
    learningObjectives: ScenarioLearningObjectiveSnapshot[]; // question-level LO mappings from topic catalog
    generatedBy: 'instructor' | 'ai';
    aiGenerationJobId?: string; // groups sibling drafts created by the same batch generation request
    sortOrder: number; // instructor ordering within a chapter
    createdAt: Date;
    updatedAt: Date;
    publishedAt?: Date | null;
    createdByUserId: string;
    lastEditedByUserId?: string;
}

/** Student-safe projection — omits model answers, solution body, and embedded response history. */
export type ScenarioQuestionForStudent = Omit<ScenarioQuestion, 'solutionBody' | 'subQuestions' | 'learningObjectives'> & {
    learningObjectives: ScenarioLearningObjectiveSnapshot[];
    subQuestions: Array<Omit<ScenarioSubQuestion, 'modelAnswer' | 'studentResponses'>>;
};

/** Instructor editor projection — omits embedded response arrays; includes per-part counts only. */
export type ScenarioSubQuestionForInstructor = Omit<ScenarioSubQuestion, 'studentResponses'> & {
    studentResponseCount: number; // total submissions for this part — paginated fetch via instructor responses API
};

export type ScenarioQuestionForInstructor = Omit<ScenarioQuestion, 'subQuestions'> & {
    subQuestions: ScenarioSubQuestionForInstructor[];
};

/** One row in the instructor paginated student-responses API (roster name hydrated server-side). */
export interface ScenarioInstructorStudentResponseRow {
    id: string; // response id
    studentUserId: string; // roster id — never PUID
    studentName: string; // from course users; fallback when dropped from roster
    mode: ScenarioMode; // practice vs exam — drives badge color in editor UI
    studentAnswer: string; // submitted text
    feedback: string; // TA or exam feedback shown to instructor
    submittedAt: string; // ISO 8601 for display sorting
}

/** Paginated instructor view of embedded student responses for one sub-question. */
export interface ScenarioInstructorStudentResponsesPage {
    items: ScenarioInstructorStudentResponseRow[];
    total: number; // full count for this sub-question (all modes)
    hasMore: boolean; // true when offset + items.length < total
    limit: number; // applied page size (capped server-side)
    offset: number; // slice start into newest-first list
}

/** Request body for `POST .../check-answer`. */
export interface ScenarioCheckAnswerRequest {
    subQuestionId: string;
    studentAnswer: string;
    mode: ScenarioMode;
}

/**
 * Response for the per-part check-answer endpoint. Practice mode returns TA feedback only (no grade).
 * Exam grading uses submit-exam and returns grades per part.
 */
export interface ScenarioPartFeedbackResponse {
    success: boolean;
    responseId: string;
    subQuestionId: string;
    mode: ScenarioMode;
    grade?: number;
    feedback: string;
    error?: string;
    feedbackTier?: 'socratic' | 'descriptive';
    feedbackSource?: 'llm' | 'canned';
    blockReason?: 'cooldown' | 'daily_limit';
    attemptNumber?: number;
    attemptsRemaining?: number;
    maxAttemptsPerDay?: number;
    retryAfterSeconds?: number;
    resetsAt?: string;
    answerRevealed?: boolean;
}

/** One graded part returned inside an exam submit response. */
export interface ScenarioExamPartResult {
    subQuestionId: string;
    grade: number;
    feedback: string;
}

/** Response for `POST .../submit-exam`. `overallGrade` is the sum of part grades (not stored). */
export interface ScenarioExamSubmitResponse {
    success: boolean;
    overallGrade: number;
    results: ScenarioExamPartResult[];
    error?: string;
}

/** One answer slot in a submit-exam request. */
export interface ScenarioExamAnswerInput {
    subQuestionId: string;
    studentAnswer: string;
}

/** Request body for `POST /api/courses/:courseId/scenario-questions/generate`. */
export interface ScenarioGenerateRequest {
    mode: 'single' | 'batch';
    sourcePrompt: string;
    topicOrWeekId: string;
    /** Selected LO ids from the topic/week catalog — resolved server-side to snapshots. */
    learningObjectiveIds?: string[];
    /** Ordered types from create UI — become sub-questions in order. */
    subQuestionTypes?: ScenarioSubQuestionType[];
    difficulty?: ScenarioDifficulty;
    /** Instructor title override only — omit or send a placeholder to use the LLM-generated title. */
    title?: string;
    /** Batch mode only — number of drafts to generate; server caps at {@link SCENARIO_BATCH_MAX_COUNT}. */
    count?: number;
}

/** Hard cap on batch generation size (D — deliverables §2 default). */
export const SCENARIO_BATCH_MAX_COUNT = 10;

/** Default expected minutes by difficulty (+ 5 per part applied at create/generate). */
export const SCENARIO_DIFFICULTY_BASE_MINUTES: Record<ScenarioDifficulty, number> = {
    easy: 15,
    medium: 20,
    hard: 30,
};

/**
 * Infer `subQuestionType` for SQ-002/SQ-003 backfill of legacy parts missing the field.
 * Prefer `subQuestionType` on the document when present.
 */
export function inferSubQuestionTypeFromPartId(partId: ScenarioPartId): ScenarioSubQuestionType {
    const byLetter: Record<string, ScenarioSubQuestionType> = {
        a: 'calculation',
        b: 'troubleshoot',
        c: 'action',
        d: 'corrective',
    };
    return byLetter[partId] ?? 'calculation';
}

/** Expected time from difficulty + part count (instructor may override). */
export function defaultExpectedTimeMinutes(difficulty: ScenarioDifficulty, partCount: number): number {
    return SCENARIO_DIFFICULTY_BASE_MINUTES[difficulty] + Math.max(0, partCount) * 5;
}

/** Sum of integer part grades (1–10 each). */
export function computeScenarioOverallGrade(grades: number[]): number {
    if (grades.length === 0) return 0;
    return grades.reduce((acc, g) => acc + g, 0);
}

/** Response for `POST /api/courses/:courseId/scenario-questions/generate`. */
export interface ScenarioGenerateResponse {
    success: boolean;
    data?: ScenarioQuestion[]; // newly created draft(s); empty/omitted on parse failure (no orphan drafts persisted)
    aiGenerationJobId?: string;
    error?: string;
}

/**
 * Response for the gated `GET /api/courses/:courseId/scenario-questions/:questionId/solution`.
 * Live handler returns `{ success, data: { questionBody, solutionBody, subQuestions } }`.
 */
export interface ScenarioSolutionResponse {
    success: boolean;
    data?: {
        questionBody: string;
        solutionBody: string;
        subQuestions: ScenarioSubQuestion[];
    };
    error?: string;
}