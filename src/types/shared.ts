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
 * when the resolved mode is `'socratic'`. Explanatory mode does not consume {@link MemoryAgentEntry}.
 */
export type ConversationModeId = 'socratic' | 'explanatory';

/**
 * Persisted chat lifecycle mode. `undeclared` means the chat has not received a user message yet.
 */
export type PersistedConversationModeId = ConversationModeId | 'undeclared';

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
    name: string;
    userId: string;
    role: 'instructor' | 'TA' | 'Student';
    /** Distinct verbatim catalog labels for this user (canonical Mongo field). */
    struggleTopics: string[];
    createdAt: Date;
    updatedAt: Date;
}

/** One cell in the course-summary / monitor stacked bar chart. */
export interface CourseSummaryStackedBarValue {
    categoryId: string;
    studentCount: number;
    tooltip: string;
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

/** Per-user row in GET /api/courses/monitor/:courseId/conversations (no struggle fields). */
export interface MonitorConversationUserRow {
    userId: string;
    userName: string;
    role: 'student' | 'instructor' | 'admin';
    conversationCount: number;
    chats: Array<{ id: string; title: string }>;
}

/** Per-user row in GET /api/courses/monitor/:courseId/struggle-stats. */
export interface MonitorStruggleUserRow {
    userId: string;
    userName: string;
    role: 'student' | 'instructor' | 'admin';
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