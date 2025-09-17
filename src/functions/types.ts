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
    completed: boolean;
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
}

/**
 * Student data structure for chat integration
 * TODO: Replace with proper user authentication system when backend user mechanism is implemented
 */
export interface Student {
    id: string;
    name: string;
    courseAttended: string; // Default: "APSC 099" - can be changed when user system is implemented
    userId: number; // Hardcoded for now - will be replaced with proper user authentication
}

/**
 * user in the database
 */
export interface UserDB {
    id: string;
    name: string;
    UBCID: string;
    userId: number;
    activeCourseId: string;
    activeCourseName: string;
    role: 'instructor' | 'teaching assistant' | 'student';
    status: 'active' | 'inactive';
    chats: Chat[];
    createdAt: Date;
    updatedAt: Date;
}

// Types for artefacts
export interface Artefact {
    type: 'mermaid';
    source: string;
    title?: string;
}

// Types for flag reports
export interface FlagReport {
    id: string;
    timestamp: Date;
    flagType: 'safety' | 'harassment' | 'inappropriate' | 'dishonesty' | 'interface bug' | 'other';
    reportType: string;
    chatContent: string;
    userId: number;
    status: 'unresolved' | 'resolved';
    response?: string; // if resolved, the response from the instructor
    createdAt: Date;
    updatedAt: Date;
}
