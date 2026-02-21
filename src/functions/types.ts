// public/scripts/types.ts

/**
 * Types for the student mode
 * @author: @gatahcha
 * @version: 1.0.1
 * @since: 2025-09-02
 */

// =====================================
// ========= CHAT DATA TYPE ============
// =====================================


/**
 * The type of chat message
 */
export interface ChatMessage {
    id: string;
    sender: 'user' | 'bot';
    userId: string;
    courseName: string;
    text: string;
    timestamp: number;
}

/**
 * The type of chat
 */
export interface Chat {
    id: string;
    courseName: string;
    topicOrWeekTitle: string;
    itemTitle: string;
    messages: ChatMessage[];
    isPinned: boolean;
    pinnedMessageId?: string | null;
    isDeleted?: boolean;  // Soft delete flag (defaults to false/undefined for backward compatibility)
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
    };
    collectionOfInitialAssistantPrompts?: InitialAssistantPrompt[];
    collectionOfSystemPromptItems?: SystemPromptItem[];
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
    items: TopicOrWeekItem[]; // previously content, previously courseItem
    createdAt: Date;
    updatedAt: Date;
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
    additionalMaterials?: AdditionalMaterial[];
    createdAt: Date;
    updatedAt: Date;
}


/**
 * The type of a single learning objective
 */
export interface LearningObjective {
    id: string;
    LearningObjective: string;
    courseName: string;
    topicOrWeekTitle: string;
    itemTitle: string;
    createdAt: Date;
    updatedAt: Date;
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
    deleted?: boolean; // Soft delete flag (defaults to false/undefined for backward compatibility)
    deletedAt?: Date; // Timestamp when material was deleted
    uploadedBy?: string; // Track who uploaded the material
    // Add these three optional fields:
    courseId?: string;
    topicOrWeekId?: string;
    itemId?: string;
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
    chats: Chat[];                 // Course-specific chat history
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
 * Memory Agent Entry
 * Stores struggle words/topics that a student has difficulty with
 * Stored per-user in course-specific collections: {courseName}_memory-agent
 */
export interface MemoryAgentEntry {
    name: string;
    userId: string;
    role: 'instructor' | 'TA' | 'Student';
    struggleTopics: string[]; // Array of strings representing topics/concepts student struggles with
    createdAt: Date;
    updatedAt: Date;
}