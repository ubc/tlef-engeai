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
export type ConversationModeId = 'socratic' | 'explanatory';

/** Must match src/types/shared.ts. Persisted lifecycle state on Chat. */
export type PersistedConversationModeId = ConversationModeId | 'undeclared';

/** Must match src/types/shared.ts */
export type ConversationModeStatus = 'active' | 'coming_soon';

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
    isPinned: boolean;
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
    isPinned: boolean;
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
    };
    collectionOfInitialAssistantPrompts?: InitialAssistantPrompt[];
    /** @deprecated v2 uses systemPromptConfig; retained for lazy migration reads only */
    collectionOfSystemPromptItems?: SystemPromptItem[];
    systemPromptConfig?: CourseSystemPromptConfig;
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
export interface MonitorStruggleUserRow {
    userId: string;
    userName: string;
    role: 'student' | 'instructor' | 'admin';
    conversationCount: number;
    struggleTopicCount: number;
    struggleTopics: string[];
    struggleTopicsByChapter: MemoryAgentChapterStruggle[];
    chats: Array<{ id: string; title: string }>;
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
