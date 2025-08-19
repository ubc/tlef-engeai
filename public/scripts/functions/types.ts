// public/scripts/types.ts

/**
 * Types for the student mode
 * @author: @gatahcha
 * @version: 1.0.0
 * @since: 2025-08-16
 */

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

/**
 * The type of a single learning objective
 */
export interface LearningObjective {
    title: string;
    description: string;
    published: boolean;
}

/**
 * The type for an uploaded file
 */
export interface UploadedFile {
    name: string;
    url: string;
    status: 'uploaded' | 'missing';
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
    files: UploadedFile[];
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


