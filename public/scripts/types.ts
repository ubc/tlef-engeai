/**
 * types.ts
 * @author: @gatahcha
 * @date: 2025-03-05
 * @description: Frontend type definitions. Self-contained; must NOT import from src/.
 * Keep in sync manually with src/types/shared.ts when shared types change.
 */

// =====================================
// ========= CHAT DATA TYPE ============
// =====================================
//
// Must match src/types/shared.ts (MongoDB layout):
//   {courseName}_users.chats[]  → Chat
//   {courseName}_memory-agent   → MemoryAgentEntry (struggleTopics; Socratic-only at runtime)

/**
 * Must match src/types/shared.ts.
 * Selectable teaching mode; struggle overlay applies to Socratic only (current phase).
 */
export const CONVERSATION_MODE_IDS = ['socratic', 'explanatory'] as const;

export type ConversationModeId = (typeof CONVERSATION_MODE_IDS)[number];

/**
 * Must match src/types/shared.ts.
 * Retired chat mode kept only so legacy chat documents (already persisted before this mode was
 * removed) continue to type-check and render history; never selectable for new chats or sends.
 */
export const RETIRED_CONVERSATION_MODE_IDS = ['scenario-generation'] as const;

export type RetiredConversationModeId = (typeof RETIRED_CONVERSATION_MODE_IDS)[number];

/** Must match src/types/shared.ts. Persisted lifecycle state on Chat. */
export type PersistedConversationModeId = ConversationModeId | RetiredConversationModeId | 'undeclared';

/** Must match src/types/shared.ts */
export type ConversationModeStatus = 'active' | 'coming_soon';

/** Must match src/types/shared.ts. */
export interface PathwayCta {
    id: string;
    label: string;
    url: string;
    color: string; // #RRGGBB
}

/** Must match src/types/shared.ts — one pathway in `{courseName}_pathways`. */
export interface GuidedPathway {
    id: string;
    order: number; // library list position
    title: string;
    enabled: boolean; // on for this course; false = listed but not evaluated
    notifyInstructorOnTrigger: boolean; // creates an anonymous instructor alert when this active pathway wins
    triggerDescription: string;
    assistantResponse: string;
    ctas: PathwayCta[];
    updatedAt: number;
}

/** Must match src/types/shared.ts. Automatic Guided Pathway alert lifecycle. */
export type GuidedPathwayFlagStatus = 'pending' | 'escalated' | 'dismissed';

/** Must match src/types/shared.ts. Server-owned trigger origin. */
export type GuidedPathwayFlagOrigin = 'student' | 'instructor-test';

/** Must match src/types/shared.ts. Instructor decision request value. */
export type GuidedPathwayFlagDecision = 'escalate' | 'dismiss';

/** Must match src/types/shared.ts. Admin review-state filter. */
export type GuidedPathwayFlagReviewState = 'needs-review' | 'reviewed' | 'all';

/**
 * Must match src/types/shared.ts. Anonymous alert DTO used by instructor and admin pages.
 * Restricted student identity and audit fields are deliberately absent.
 */
export interface GuidedPathwayFlagView {
    id: string; // stable alert id for review actions
    courseId: string; // owning course id
    courseName: string; // course-name snapshot at trigger time
    pathwayId: string; // winning pathway id
    pathwayTitle: string; // winning pathway title snapshot
    messageText: string; // exact triggering chat message
    origin: GuidedPathwayFlagOrigin; // production student alert or non-escalatable instructor test
    status: GuidedPathwayFlagStatus; // instructor decision lifecycle
    triggeredAt: string; // ISO trigger timestamp
    decidedAt?: string; // ISO instructor-decision timestamp
    decidedByName?: string; // staff display-name snapshot
    adminReviewedAt?: string; // ISO platform-review timestamp
    adminReviewedByName?: string; // platform-admin display-name snapshot
}

/** Must match src/types/shared.ts. Safe pathway choice for administrator filtering. */
export interface GuidedPathwayFlagPathwayFacet {
    pathwayId: string; // stable winning-pathway id
    pathwayTitle: string; // instructor-facing title snapshot
}

/** Must match src/types/shared.ts. Full-queue administrator filter choices. */
export interface GuidedPathwayFlagFacets {
    pathways: GuidedPathwayFlagPathwayFacet[]; // all scoped pathways except the active pathway filter
    reviewers: string[]; // all scoped staff names except the active reviewer filter
}

/** Must match src/types/shared.ts. Paginated anonymous alert list. */
export interface GuidedPathwayFlagListPage {
    items: GuidedPathwayFlagView[]; // safe alerts for this page
    page: number; // one-based page number
    pageSize: number; // bounded page size
    total: number; // total matching alerts
    facets?: GuidedPathwayFlagFacets; // always present on admin list responses; omitted for course lists
}

/** Must match src/types/shared.ts. Staff identity snapshot on manual flag escalation/review. */
export interface FlagReportActor {
    userId: string;
    name: string;
}

/** Must match src/types/shared.ts. Student-reported moderation flag. */
export type ManualFlagType =
    | 'innacurate_response'
    | 'harassment'
    | 'inappropriate'
    | 'dishonesty'
    | 'interface bug'
    | 'other';

export type ManualFlagStatus = 'unresolved' | 'resolved' | 'escalated';

/** Must match src/types/shared.ts. */
export interface FlagReport {
    id: string;
    courseName: string;
    date: string | Date;
    flagType: ManualFlagType;
    reportType: string;
    chatContent: string;
    userId: string | number;
    status: ManualFlagStatus;
    response?: string;
    escalatedAt?: string | Date;
    escalatedBy?: FlagReportActor;
    adminReviewedAt?: string | Date;
    adminReviewedBy?: FlagReportActor;
    createdAt: string | Date;
    updatedAt: string | Date;
    userName?: string;
    userAffiliation?: string;
}

/** Must match src/types/shared.ts. Safe cross-course manual escalation row for admins. */
export interface ManualFlagEscalationView {
    id: string;
    courseId: string;
    courseName: string;
    flagType: ManualFlagType;
    reportType: string;
    chatContent: string;
    status: 'escalated';
    escalatedAt: string;
    escalatedByName?: string;
    adminReviewedAt?: string;
    adminReviewedByName?: string;
    createdAt: string;
}

export interface ManualFlagEscalationListPage {
    items: ManualFlagEscalationView[];
    page: number;
    pageSize: number;
    total: number;
}

/** Unified instructor Flag Management workflow tab. */
export type FlagWorkflowStatus = 'unresolved' | 'resolved' | 'escalated';

/** Unified instructor Flag Management source discriminator. */
export type FlagSource = 'manual' | 'guided-pathway';

export interface FlagManagementFilters {
    workflowStatus: FlagWorkflowStatus;
    sources: Set<FlagSource>;
    manualCategories: Set<ManualFlagType>;
    /** Pathway library ids plus `others` for GP alert category filtering. */
    guidedCategories: Set<string>;
    period: {
        from?: Date;
        to?: Date;
    };
}

/** Frontend-only normalized row for the unified instructor flag list. */
export interface UnifiedFlagListItem {
    id: string;
    source: FlagSource;
    workflowStatus: FlagWorkflowStatus;
    sortDate: Date;
    titlePrefix: string;
    titleDetail: string;
    previewText: string;
    footerLabel: string;
    statusBadge: string;
    collapsed: boolean;
    editing: boolean;
    raw: FlagReport | GuidedPathwayFlagView;
}

/** Admin escalations queue source filter. */
export type AdminEscalationSource = 'manual' | 'guided-pathway' | 'both';

/**
 * Must match src/types/shared.ts.
 * Persisted turn — plain UI text only (no RAG/struggle tags in MongoDB).
 */
export interface ChatMessage {
    id: string;
    sender: 'user' | 'bot';
    userId: string;
    courseName: string;
    text: string;
    timestamp: number;
    ctas?: PathwayCta[];
}

/** Catalog item from GET /api/chat/conversation-modes */
export interface ConversationModeCatalogItem {
    id: ConversationModeId;
    displayName: string;
    shortDescription: string;
    longDescription?: string;
    status: ConversationModeStatus;
    isDefault: boolean;
    sortOrder: number;
}

/**
 * Must match src/types/shared.ts.
 * Embedded chat thread in `{courseName}_users.chats[]`.
 * struggleTopics live on MemoryAgentEntry, not on Chat.
 */
export interface Chat {
    id: string;
    courseName: string;
    topicOrWeekTitle: string;
    itemTitle: string;
    messages: ChatMessage[];
    /** Optional id of the one message pinned inside this conversation. */
    pinnedMessageId?: string | null;
    isDeleted?: boolean;
    /** New welcome-only chats start undeclared, then finalize on the first user message */
    conversationMode?: PersistedConversationModeId;
}

/**
 * Must match src/types/shared.ts.
 * Sidebar metadata from GET /api/chat/user/chats/metadata (no messages array).
 */
export interface ChatMetadataSummary {
    id: string;
    courseName: string;
    itemTitle: string;
    /** Optional id of the one message pinned inside this conversation. */
    pinnedMessageId?: string | null;
    messageCount: number;
    lastMessageTimestamp: number;
    conversationMode?: PersistedConversationModeId;
}

// ===========================================
// ========= INSTRUCTOR DATA TYPE ============
// ===========================================

/**
 * Must match src/types/shared.ts
 * Instructor/TA data structure - stores both userId and name
 */
export interface InstructorInfo {
    userId: string;
    name: string;
}

/** One optional course capability with first-enable provenance. */
export interface CourseFeatureCapability {
    enabled: boolean;
    enabledAt?: Date;
    enabledBy?: string;
}

// @rdschrs: Added the opt-in Writing Feedback capability contract to course state.
export interface CourseFeatures {
    writingFeedback?: CourseFeatureCapability;
    memoryAgent?: CourseFeatureCapability;
    guidedPathway?: CourseFeatureCapability;
    scenarioGeneration?: CourseFeatureCapability;
}

/** UI catalog ids for course-wide LLM model selection (API contract). */
export type CourseLlmModelId = 'gpt-5.6-luna' | 'gpt-5.4-mini' | 'gpt-4o-mini';

/** App UI + persisted reasoning from dashboard catalog / PATCH (API contract). */
export type AppReasoningLevel = 'none' | 'low' | 'medium' | 'high';

/** Feature keys that each have their own model + reasoning selection. */
export type LlmFeatureKey =
    | 'chat'
    | 'scenarioGeneration'
    | 'writingFeedback'
    | 'guidedPathway'
    | 'memoryAgent';

/** One feature's model + reasoning selection. */
export interface FeatureLlmSelection {
    modelId: CourseLlmModelId;
    reasoningLevel: AppReasoningLevel;
}

/**
 * Course-wide LLM settings: one selection per consuming feature.
 * Must match src/types/shared.ts. Legacy flat rows are hydrated server-side.
 */
export interface CourseLlmSettings {
    chat: FeatureLlmSelection;
    scenarioGeneration: FeatureLlmSelection;
    writingFeedback: FeatureLlmSelection;
    guidedPathway: FeatureLlmSelection;
    memoryAgent: FeatureLlmSelection;
    updatedAt?: Date;
    updatedBy?: string;
}

/** One reasoning row in the dashboard catalog API (ids + labels only; brains are client-side). */
export interface LlmReasoningCatalogOption {
    id: AppReasoningLevel;
    label: string;
}

/** Model row returned by GET llm-model-catalog for dashboard pickers. */
export interface LlmModelDashboardCatalogEntry {
    id: CourseLlmModelId;
    label: string;
    costTier: 'low' | 'medium' | 'high';
    reasoningOptions: LlmReasoningCatalogOption[];
}

/** GET `/api/courses/:courseId/llm-model-catalog` response body. */
export interface LlmModelCatalogApiResponse {
    models: LlmModelDashboardCatalogEntry[];
    defaultSelection: FeatureLlmSelection;
}

/** PATCH `/api/courses/:courseId/llm-settings` request body. */
export interface UpdateCourseLlmSettingsRequest {
    chat: FeatureLlmSelection;
    scenarioGeneration: FeatureLlmSelection;
    writingFeedback: FeatureLlmSelection;
    guidedPathway: FeatureLlmSelection;
    memoryAgent: FeatureLlmSelection;
}

/**
 * Must match src/types/shared.ts
 */
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
        scheduledTasks?: string;
        /** Per-course Practice Scenarios question bank; SQ-001 lazy-provisions on existing courses */
        scenarioQuestions?: string;
        /** Per-course Guided Pathway Library; lazy-provisions on existing courses */
        pathways?: string;
        /** Registered course-owned collection for automatic Guided Pathway alerts. */
        guidedPathwayFlags?: string;
    };
    collectionOfInitialAssistantPrompts?: InitialAssistantPrompt[];
    /** @deprecated v2 uses systemPromptConfig; retained for lazy migration reads only */
    collectionOfSystemPromptItems?: SystemPromptItem[];
    systemPromptConfig?: CourseSystemPromptConfig;
    /** FK to `academic-periods.id`; lazy-migrated via AP-001 when missing */
    academicPeriodId?: string;
    /** Optional course capabilities. Missing entries are disabled for backward compatibility. */
    features?: CourseFeatures;
    /** Per-feature LLM model + reasoning for Chat, Writing Feedback, Scenarios, Guided Pathway. */
    llmSettings?: CourseLlmSettings;
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
 * Must match src/types/shared.ts
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
 * Must match src/types/shared.ts
 * Default prompt ID constant
 * Used to identify the system default initial assistant prompt
 */
export const DEFAULT_PROMPT_ID = 'default-engeai-welcome';

/**
 * Must match src/types/shared.ts
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
 * Must match src/types/shared.ts
 * Default system prompt component ID constants
 * Used to identify the three default system prompt components
 */
export const DEFAULT_BASE_PROMPT_ID = 'default-base-system-prompt';
export const DEFAULT_LEARNING_OBJECTIVES_ID = 'default-learning-objectives';
export const DEFAULT_STRUGGLE_TOPICS_ID = 'default-struggle-topics';

/** Must match src/types/shared.ts — single editable module within a course system prompt. */
export interface SystemPromptModule {
    id: string;
    body: string;
    sortOrder: number;
}

/** Must match src/types/shared.ts — per-mode system prompt state. */
export interface ModeSystemPromptState {
    usePlatformDefault: boolean;
    modules: SystemPromptModule[];
    updatedAt: string;
    platformDefaultVersion?: string;
}

/** Must match src/types/shared.ts — course-level system prompt configuration (v2). */
export interface CourseSystemPromptConfig {
    schemaVersion: 1;
    defaultConversationMode: ConversationModeId;
    modes: {
        socratic: ModeSystemPromptState;
        explanatory: ModeSystemPromptState;
    };
}

/**
 * Must match src/types/shared.ts
 * frameTypes: Course content organization strategy.
 * It is either percourse or perweek
 */
export type frameType = 
    | 'byWeek'
    | 'byTopic'
;

/**
 * Must match src/types/shared.ts
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

/**
 * Must match src/types/shared.ts
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
 * Must match src/types/shared.ts
 * The type of a single learning objective (stored in MongoDB, used for CRUD)
 */
export interface LearningObjective {
    id: string;
    LearningObjective: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Must match src/types/shared.ts
 * For system prompt display - topic/week and item from predecessor (parent hierarchy)
 */
export interface LearningObjectiveForDisplay {
    LearningObjective: string;
    topicOrWeekTitle: string;
    itemTitle: string;
}

/** Minimal scenario row embedded in chat `<scenarioSuggestions>` tag. */
export interface ScenarioSuggestionForChat {
    id: string;
    title: string;
    difficulty: ScenarioDifficulty; // color-coded badge in unstruggle Yes follow-up list
}

/**
 * Must match src/types/shared.ts
 * Instructor-authored struggle topic catalog entry (per section).
 * `struggleTopic` is the verbatim label used by the memory agent and student struggle store.
 */
export interface InstructorStruggleTopic {
    id: string;
    struggleTopic: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Must match src/types/shared.ts
 * Flattened instructor struggle topic with parent hierarchy (memory-agent catalog).
 */
export interface InstructorStruggleTopicForDisplay {
    struggleTopic: string;
    topicOrWeekId: string;
    topicOrWeekTitle: string;
    itemTitle: string;
}

/**
 * Must match src/types/shared.ts
 * Struggle labels detected for one course chapter (topic/week instance).
 */
export interface MemoryAgentChapterStruggle {
    topicOrWeekId: string;
    topicOrWeekTitle: string;
    struggleTopics: string[];
}

/**
 * Must match src/types/shared.ts
 * Memory-agent row: struggle topic labels per user per course.
 */
export interface MemoryAgentEntry {
    name: string;
    userId: string;
    role: 'instructor' | 'TA' | 'Student';
    struggleTopics: string[];
    createdAt: Date;
    updatedAt: Date;
}

/** Must match src/types/shared.ts */
export interface CourseSummaryStackedBarValue {
    categoryId: string;
    studentCount: number;
    tooltip: string;
}

/** Must match src/types/shared.ts */
export interface CourseSummaryStackedBarSeries {
    topic: string;
    color: string;
    values: CourseSummaryStackedBarValue[];
}

/** Must match src/types/shared.ts */
export interface CourseSummaryCategory {
    id: string;
    label: string;
    order: number;
}

/** Must match src/types/shared.ts */
export interface CourseSummaryStackedBar {
    xAxisLabel: string;
    yAxisLabel: string;
    categories: CourseSummaryCategory[];
    series: CourseSummaryStackedBarSeries[];
}

/** Must match src/types/shared.ts */
export interface CourseSummaryTopTopic {
    topic: string;
    studentCount: number;
    percentageOfStudents: number;
}

/** Must match src/types/shared.ts */
export interface StruggleStatsLegendItem {
    topic: string;
    color: string;
    studentCount: number;
}

/** Must match src/types/shared.ts */
export interface CourseSummaryStruggleTopics {
    source: 'memory-agent-per-user';
    groupedBy: 'course-topic-or-week';
    topTopics: CourseSummaryTopTopic[];
    stackedBar: CourseSummaryStackedBar;
    legend: StruggleStatsLegendItem[];
}

/** Must match src/types/shared.ts */
export type MonitorRosterRole = 'student' | 'instructor' | 'admin' | 'ta';

/** Must match src/types/shared.ts */
export interface MonitorConversationUserRow {
    userId: string;
    userName: string;
    role: MonitorRosterRole;
    conversationCount: number;
    chats: Array<{ id: string; title: string }>;
}

/** Must match src/types/shared.ts */
export interface MonitorStruggleUserRow {
    userId: string;
    userName: string;
    role: MonitorRosterRole;
    conversationCount: number;
    struggleTopicCount: number;
    struggleTopics: string[];
    struggleTopicsByChapter: MemoryAgentChapterStruggle[];
    chats: Array<{ id: string; title: string }>;
}

/** Must match src/types/shared.ts */
export interface CourseAnalyticsAccessFlags {
    canAccessPostPeriodAnalytics: boolean;
    canViewCourseSummary: boolean;
    canManageRoster: boolean;
    periodEndDate: string | null;
    isAdminEarlyAccess: boolean;
    isAcademicPeriodEnded: boolean;
}

/**
 * Must match src/types/shared.ts
 * Additional material source type
 */
export type AdditionalMaterialSource = 'file' | 'url' | 'text';

/**
 * Must match src/types/shared.ts
 * Additional material attached to a course content item (front-end only for now)
 *
 * additional material is only applicable for text only eventually (as we use RAG)
 *
 * So initially, instructor can upload file, url, or text.
 *
 * But eventually, we will only allow text (processed in the backend).
 */
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
    courseId?: string;
    topicOrWeekId?: string;
    itemId?: string;
}

/**
 * Must match src/types/shared.ts
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
    chats: Chat[];                 // Course-specific chat history
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Must match src/types/shared.ts
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
 * Must match src/types/shared.ts
 * Backward compatibility alias
 * @deprecated Use CourseUser instead
 */
export type User = CourseUser;

// ===========================================
// ========= API / CHAT API ==================
// ===========================================

/** Return type of sendMessageToServer (api.ts) - message reply with timestamp */
export interface MessageReply {
    reply: string;
    timestamp: number;
}

/** Generic chat API response - success/error wrapper for chat operations */
export interface ChatApiResponse {
    success: boolean;
    message?: string;
    error?: string;
}

/** Request body for changing a welcome-only chat's teaching mode */
export interface UpdateChatConversationModeRequest {
    conversationMode: ConversationModeId;
}

/** Response from PATCH /api/chat/:chatId/conversation-mode */
export interface UpdateChatConversationModeResponse {
    success: boolean;
    conversationMode?: ConversationModeId;
    error?: string;
}

/** Request payload for creating a new chat */
export interface CreateChatRequest {
    userID: string;
    courseName: string;
    date: string;
    conversationMode?: ConversationModeId;
}

/** Response from createNewChat - extends ChatApiResponse */
export interface CreateChatResponse extends ChatApiResponse {
    chatId?: string;
    initAssistantMessage?: {
        id: string;
        sender: 'bot';
        userId: number;
        courseName: string;
        text: string;
        timestamp: number;
    };
}

/** Response from sendMessageToChat */
export interface SendMessageResponse {
    success: boolean;
    message?: ChatMessage;
    conversationMode?: ConversationModeId;
    error?: string;
}

/** Legacy CreateChatResponse from api.ts - standalone structure (unused, kept for API docs) */
export interface ApiCreateChatResponse {
    success: boolean;
    chatId?: string;
    error?: string;
    initAssistantMessage?: {
        id: string;
        sender: string;
        userId: number;
        courseName: string;
        text: string;
        timestamp: number;
    };
}

// ===========================================
// ========= AUTH ============================
// ===========================================

/** Auth user from /auth/me - distinct from CourseUser */
export interface AuthUser {
    name: string;
    userId: string;
    affiliation: string;
    isAdmin?: boolean;
}

/** Authentication state from AuthService */
export interface AuthState {
    isAuthenticated: boolean;
    user: AuthUser | null;
    isLoading: boolean;
}

// ===========================================
// ========= FACTORY CONTEXT =================
// ===========================================

/** Context for creating an instructor user from auth + course data */
export interface InstructorUserContext {
    authState: AuthState;
    courseContext?: activeCourse | null;
}

/** Context for creating a student user from API response */
export interface StudentUserContext {
    apiUser: Partial<CourseUser> & { userId: string; name: string };
}

// ===========================================
// ========= DOCUMENT UPLOAD =================
// ===========================================

/**
 * Must match src/types/shared.ts
 * Optional fields on RAG upload 201 responses when struggle-topic generation runs post-upload.
 */
export interface UploadStruggleGenerationPayload {
    generatedStruggleTopics?: InstructorStruggleTopic[];
    struggleGenerationSkipped?: boolean;
    struggleGenerationWarning?: string;
}

/** Result of document upload to RAG */
export interface UploadResult extends UploadStruggleGenerationPayload {
    success: boolean;
    document?: AdditionalMaterial;
    chunksGenerated?: number;
    error?: string;
}

/** Result of file/text validation */
export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

// ===========================================
// ========= ARTEFACT ========================
// ===========================================

/** Artefact data structure for Mermaid diagrams in chat */
export interface ArtefactData {
    id: string;
    mermaidCode: string;
    isOpen: boolean;
    messageId: string;
}

// ===========================================
// ========= CHAT MANAGER ====================
// ===========================================

/** Configuration for ChatManager */
export interface ChatManagerConfig {
    isInstructor: boolean;
    userContext: CourseUser;
    onModeSpecificCallback?: (action: string, data?: any) => void;
}

// ===========================================
// ========= MODAL ===========================
// ===========================================

/** Available modal types */
export type ModalType = 'error' | 'warning' | 'success' | 'info' | 'disclaimer' | 'custom';

/** Button configuration for modal footer */
export interface ModalButton {
    text: string;
    type: 'primary' | 'secondary' | 'outline' | 'danger' | 'muted';
    action?: () => void | Promise<void>;
    closeOnClick?: boolean;
}

/** Configuration options for creating a modal */
export interface ModalConfig {
    type: ModalType;
    title: string;
    content: string | HTMLElement;
    buttons?: ModalButton[];
    showCloseButton?: boolean;
    closeOnOverlayClick?: boolean;
    closeOnEscape?: boolean;
    maxWidth?: string;
    customClass?: string;
}

/** Result of modal interaction */
export interface ModalResult {
    action: string;
    data?: any;
}

// ===========================================
// ========= TOAST ===========================
// ===========================================

/** Toast notification position */
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

/** Toast notification type/variant */
export type ToastType = 'default' | 'success' | 'error';

/** Configuration for toast notification */
export interface ToastConfig {
    message: string;
    durationMs?: number;
    position?: ToastPosition;
    type?: ToastType;
}

// ===========================================
// ========= INACTIVITY ======================
// ===========================================

/** Configuration for InactivityTracker */
export interface InactivityTrackerConfig {
    warningTimeoutMs?: number;
    logoutTimeoutMs?: number;
    serverSyncIntervalMs?: number;
    activityDebounceMs?: number;
}

/** Activity data from server sync */
export interface ActivityData {
    lastActivityTime: number;
    serverLastActivityTime?: number;
    currentTime: number;
}

/** Inactivity tracker event types */
export type InactivityEvent = 'warning' | 'logout' | 'activity-reset';

// =====================================================
// ===== SCENARIO QUESTIONS (Practice Scenarios) ======
// =====================================================
//
// Must match src/types/shared.ts. Standalone practice bank replacing the retired
// `scenario-generation` chat mode. Chapter grouping uses TopicOrWeekInstance.id (D1).

/** Must match src/types/shared.ts. Drafts are invisible to students (404, not 403). */
export type ScenarioQuestionStatus = 'draft' | 'published' | 'rejected';

/** Must match src/types/shared.ts. Practice vs exam discriminator. */
export type ScenarioMode = 'practice' | 'exam';

/**
 * @deprecated Prefer subQuestionId. Legacy ordinal letter slot.
 */
export type ScenarioPartId = string;

/** @deprecated Legacy partId shape. */
export const SCENARIO_PART_ID_PATTERN = /^[a-z]$/;

/** Must match src/types/shared.ts — soft default framework, not a hard publish list. */
export const DEFAULT_SCENARIO_FRAMEWORK_PART_IDS = ['a', 'b', 'c'] as const;

/** @deprecated Alias of {@link DEFAULT_SCENARIO_FRAMEWORK_PART_IDS}. */
export const REQUIRED_SCENARIO_PART_IDS = DEFAULT_SCENARIO_FRAMEWORK_PART_IDS;

/** @deprecated Prefer non-empty subQuestionId checks. */
export function isScenarioPartId(value: unknown): value is ScenarioPartId {
    return typeof value === 'string' && SCENARIO_PART_ID_PATTERN.test(value);
}

/** Must match src/types/shared.ts. */
export type ScenarioSubQuestionType = 'calculation' | 'troubleshoot' | 'action' | 'corrective';

/** Must match src/types/shared.ts. */
export type ScenarioDifficulty = 'easy' | 'medium' | 'hard';

/** Must match src/types/shared.ts. Immutable LO snapshot on a question. */
export interface ScenarioLearningObjectiveSnapshot {
    objectiveId: string;
    text: string;
    sourceTopicOrWeekId: string;
    sourceItemId: string;
}

/** Must match src/types/shared.ts. Catalog option for instructor LO selector. */
export interface ScenarioLearningObjectiveOption {
    objectiveId: string;
    text: string;
    topicOrWeekId: string;
    topicOrWeekTitle: string;
    itemId: string;
    itemTitle: string;
}

/** Must match src/types/shared.ts. Embedded student submission (instructor/history APIs only). */
export interface ScenarioStudentResponse {
    id: string;
    studentUserId: string;
    mode: ScenarioMode;
    studentAnswer: string;
    grade?: number;
    feedback: string;
    submittedAt: string | Date;
}

/** Must match src/types/shared.ts (minus server-only trust boundary notes). */
export interface ScenarioSubQuestion {
    subQuestionId: string;
    /** @deprecated Legacy ordinal letter. */
    partId?: ScenarioPartId;
    subQuestionType: ScenarioSubQuestionType;
    prompt: string;
    points?: number;
    /** Only present on instructor-facing responses; never sent to students until solution reveal. */
    modelAnswer: string;
    /** Stripped from student list/detail projections. */
    studentResponses?: ScenarioStudentResponse[];
    /** Instructor projection only — total embedded submissions for this part. */
    studentResponseCount?: number;
}

/** Must match src/types/shared.ts. Instructor editor projection (no embedded response arrays). */
export type ScenarioSubQuestionForInstructor = Omit<ScenarioSubQuestion, 'studentResponses'> & {
    studentResponseCount: number;
};

export type ScenarioQuestionForInstructor = Omit<ScenarioQuestion, 'subQuestions'> & {
    subQuestions: ScenarioSubQuestionForInstructor[];
};

/** Must match src/types/shared.ts. One row in instructor paginated student-response history. */
export interface ScenarioInstructorStudentResponseRow {
    id: string;
    studentUserId: string;
    studentName: string;
    mode: ScenarioMode;
    studentAnswer: string;
    feedback: string;
    submittedAt: string;
}

/** Must match src/types/shared.ts. Paginated instructor student-response page. */
export interface ScenarioInstructorStudentResponsesPage {
    items: ScenarioInstructorStudentResponseRow[];
    total: number;
    hasMore: boolean;
    limit: number;
    offset: number;
}

/** Must match src/types/shared.ts. Full document — instructor views only. */
export interface ScenarioQuestion {
    id: string;
    courseId: string;
    courseName: string;
    topicOrWeekId: string;
    title: string;
    status: ScenarioQuestionStatus;
    sourcePrompt: string;
    questionBody: string;
    solutionBody: string;
    subQuestions: ScenarioSubQuestion[];
    difficulty: ScenarioDifficulty;
    expectedTimeMinutes: number;
    learningObjectives: ScenarioLearningObjectiveSnapshot[];
    generatedBy: 'instructor' | 'ai';
    aiGenerationJobId?: string;
    sortOrder: number;
    createdAt: string | Date;
    updatedAt: string | Date;
    publishedAt?: string | Date | null;
    createdByUserId: string;
    lastEditedByUserId?: string;
}

/** Must match src/types/shared.ts (`ScenarioQuestionForStudent`). Student-safe projection — no model answers/solution/history. */
export type ScenarioQuestionForStudent = Omit<ScenarioQuestion, 'solutionBody' | 'subQuestions'> & {
    subQuestions: Array<Omit<ScenarioSubQuestion, 'modelAnswer' | 'studentResponses'>>;
};

/** Must match src/types/shared.ts. One saved draft answer for a sub-question. */
export interface ScenarioProgressAnswer {
    subQuestionId: string;
    studentAnswer: string;
}

/** Must match src/types/shared.ts. Student draft progress for one question in one mode. */
export interface ScenarioStudentProgress {
    userId: string;
    questionId: string;
    mode: ScenarioMode;
    answers: ScenarioProgressAnswer[];
    updatedAt: string | Date;
}

/** Must match src/types/shared.ts. Request body for PUT .../progress. */
export interface ScenarioSaveProgressRequest {
    mode: ScenarioMode;
    answers: ScenarioProgressAnswer[];
}

/** Must match src/types/shared.ts. Response for GET .../progress. */
export interface ScenarioProgressResponse {
    questionId: string;
    mode: ScenarioMode;
    answers: ScenarioProgressAnswer[];
    updatedAt: string;
}

/** Must match src/types/shared.ts. Request body for POST .../check-answer. */
export interface ScenarioCheckAnswerRequest {
    subQuestionId: string;
    studentAnswer: string;
    mode: ScenarioMode;
}

/** Must match src/types/shared.ts. Response for POST .../check-answer. */
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

/** Must match src/types/shared.ts. */
export interface ScenarioExamPartResult {
    subQuestionId: string;
    grade: number;
    feedback: string;
}

/** Must match src/types/shared.ts. Response for POST .../submit-exam. */
export interface ScenarioExamSubmitResponse {
    success: boolean;
    overallGrade: number;
    results: ScenarioExamPartResult[];
    error?: string;
}

/** Must match src/types/shared.ts. */
export interface ScenarioExamAnswerInput {
    subQuestionId: string;
    studentAnswer: string;
}

/** Must match src/types/shared.ts. Request body for POST .../generate. */
export interface ScenarioGenerateRequest {
    mode: 'single' | 'batch';
    sourcePrompt: string;
    topicOrWeekId: string;
    learningObjectiveIds?: string[];
    subQuestionTypes?: ScenarioSubQuestionType[];
    difficulty?: ScenarioDifficulty;
    /** Instructor title override only — omit or send a placeholder to use the LLM-generated title. */
    title?: string;
    count?: number;
}

/** Must match src/types/shared.ts. Hard cap on batch generation size. */
export const SCENARIO_BATCH_MAX_COUNT = 10;

/** Must match src/types/shared.ts. */
export const SCENARIO_DIFFICULTY_BASE_MINUTES: Record<ScenarioDifficulty, number> = {
    easy: 15,
    medium: 20,
    hard: 30,
};

export function inferSubQuestionTypeFromPartId(partId: ScenarioPartId): ScenarioSubQuestionType {
    const byLetter: Record<string, ScenarioSubQuestionType> = {
        a: 'calculation',
        b: 'troubleshoot',
        c: 'action',
        d: 'corrective',
    };
    return byLetter[partId] ?? 'calculation';
}

export function defaultExpectedTimeMinutes(difficulty: ScenarioDifficulty, partCount: number): number {
    return SCENARIO_DIFFICULTY_BASE_MINUTES[difficulty] + Math.max(0, partCount) * 5;
}

export function computeScenarioOverallGrade(grades: number[]): number {
    if (grades.length === 0) return 0;
    return grades.reduce((acc, g) => acc + g, 0);
}

/** Must match src/types/shared.ts. Response for POST .../generate. */
export interface ScenarioGenerateResponse {
    success: boolean;
    data?: ScenarioQuestion[];
    aiGenerationJobId?: string;
    error?: string;
}

/** Must match src/types/shared.ts — live handler nests under `data`. */
export interface ScenarioSolutionResponse {
    success: boolean;
    data?: {
        questionBody: string;
        solutionBody: string;
        subQuestions: ScenarioSubQuestion[];
    };
    error?: string;
}

/** @deprecated Alias — fields now on {@link ScenarioSubQuestion}. */
export type ScenarioSubQuestionExtended = ScenarioSubQuestion;

/** @deprecated Alias — fields now on {@link ScenarioQuestion}. */
export type ScenarioQuestionExtended = ScenarioQuestion | ScenarioQuestionForInstructor;

/** Generate request shape used by instructor UI (maps to ScenarioGenerateRequest). */
export interface ScenarioMockGenerateRequest {
    topicOrWeekId: string;
    sourcePrompt: string;
    selectedTypes: ScenarioSubQuestionType[];
    difficulty: ScenarioDifficulty;
    title?: string;
    learningObjectiveIds?: string[];
}
