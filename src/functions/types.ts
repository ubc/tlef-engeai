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
    userId: number;
    courseName: string;
    text: string;
    timestamp: number;
    retrievedDocuments?: string[];  // NEW: Store full text of retrieved RAG documents
}

/**
 * The type of chat
 */
export interface Chat {
    id: string;
    courseName: string;
    divisionTitle: string;
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

export interface activeCourse {
    id : string,
    date : Date,
    courseSetup : boolean, 
    contentSetup : boolean,
    flagSetup : boolean,
    monitorSetup : boolean,
    courseName: string,
    instructors: string[],
    teachingAssistants: string[],
    frameType: frameType;
    tilesNumber: number;
    divisions: ContentDivision[]; // previously content
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
 * The type of content division : by week or by topic
 */
export interface ContentDivision {
    id : string;
    date : Date;
    title: string;
    courseName: string;
    published: boolean;
    items: courseItem[]; // previously content
    createdAt: Date;
    updatedAt: Date;
}

/**
 * The type for a piece of course content (e.g., lecture, tutorial)
 */
export interface courseItem {
    id: string;
    date: Date;
    title: string;
    courseName: string;
    divisionTitle: string;
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
    divisionTitle: string;
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
    divisionTitle: string;
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
    divisionId?: string;
    itemId?: string;
}

/**
 * Course-specific user data structure
 * Stores user data specific to a particular course
 */
export interface CourseUser {
    name: string;
    puid: string;
    userId: number;                // Obtained from GlobalUser
    courseName: string;            // Full name: "APSC 099: Engineering for Kindergarten"
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
    userId: number;
    status: 'unresolved' | 'resolved';
    response?: string; // if resolved, the response from the instructor
    createdAt: Date;
    updatedAt: Date;
}


/**
 * Global user registry
 * Stores core user identity across all courses
 */
export interface GlobalUser {
    name: string;
    puid: string;
    userId: number;                // Generated using IDGenerator
    coursesEnrolled: string[];     // Array of course IDs
    affiliation: 'student' | 'faculty';
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
    userId: number;
    role: 'instructor' | 'TA' | 'Student';
    struggleWords: string[]; // Array of strings representing topics/concepts student struggles with
    createdAt: Date;
    updatedAt: Date;
}