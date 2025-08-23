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
    onBoarded : boolean;
    name: string,
    instructors: string[],
    teachingAssistants: string[],
    frameType: frameType;
    tilesNumber: number;
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
    title: string;
    description: string;
    published: boolean;
}

/**
 * Additional material attached to a course content item (front-end only for now)
 */
export type AdditionalMaterialSource = 'file' | 'url' | 'text';

export interface AdditionalMaterial {
    id: string; // unique client-side id
    name: string;
    sourceType: AdditionalMaterialSource;
    // For 'file' we keep a reference to the File and an object URL for preview
    file?: File;
    previewUrl?: string;
    // For 'url' we store the link
    url?: string;
    // For 'text' we store the raw text content
    text?: string;
    status: 'added';
}

/**
 * The type for a piece of course content (e.g., lecture, tutorial)
 */
export interface CourseContent {
    id: number;
    title: string;
    status: 'Draft' | 'Published';
    learningObjectives: LearningObjective[];
    additionalMaterials?: AdditionalMaterial[];
}

/**
 * The type for a weekly section of course content
 */
export interface WeeklySection {
    weekNumber: number;
    title: string;
    content: CourseContent[];
}


