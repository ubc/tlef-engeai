// public/scripts/types.ts



/**
 * Types for the student mode
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-08-16
 */

// =====================================
// ========= CHAT DATA TYPE ============
// =====================================

/**
 * The type of artefact
 */
export interface Artefact {
    type: 'mermaid';
    source: string;
    title?: string;
}

/**
 * The type of chat message
 */
export interface ChatMessage {
    id: number;
    sender: 'user' | 'bot';
    text: string;
    timestamp: number;
    artefact?: Artefact;
}

/**
 * The type of chat
 */
export interface Chat {
    id: number;
    title: string;
    messages: ChatMessage[];
    isPinned: boolean;
    pinnedMessageId?: number | null;
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

export interface activeClass {
    id : string,
    date : Date,
    onBoarded : boolean, 
    name: string,
    instructors: string[],
    teachingAssistants: string[],
    frameType: frameType;
    tilesNumber: number;
    content: ContentDivision[];
}

/**
 * frameTypes: Course content organization strategy. 
 *              It is either percourse or perweek 
 */
export type frameType = 
    | 'byWeek'
    | 'byTopic'
;

// ==========================================
// ========= DOCUMENTS DATA TYPE ============
// ==========================================


/**
 * The type of a single learning objective
 */
export interface LearningObjective {
    id : string,
    date : Date
    title: string;
    description: string;
    uploaded: boolean;
}

/**
 * Additional material attached to a course content item (front-end only for now)
 *
 * addtitional material is only applicable for text only eventually (as we use RAG)
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
    contentTitle: string;
    subcontentTitle: string;
    courseName: string;
    sourceType: AdditionalMaterialSource;
    // For 'file' we keep a reference to the File and an object URL for preview
    file?: File;
    previewUrl?: string;
    // For 'url' we store the link
    url?: string;
    // For 'text' we store the raw text content
    text?: string;
    uploaded: boolean;
    // ID returned from Qdrant after successful upload
    qdrantId?: string;
    // For 'text' we store the chunk number
    chunkNumber?: number;
}

/**
 * The type for a piece of course content (e.g., lecture, tutorial)
 */
export interface CourseContent {
    id: string;
    date: Date,
    title: string;
    completed: boolean;
    // uploaded: boolean; No need to set uploaded, as the content is uploaded by default
    learningObjectives: LearningObjective[];
    additionalMaterials?: AdditionalMaterial[];
}

/**
 * The type of content division : by week or by topic
 */
export interface ContentDivision {
    id : string;
    date : Date;
    title: string;
    published: boolean;
    content: CourseContent[];
}


