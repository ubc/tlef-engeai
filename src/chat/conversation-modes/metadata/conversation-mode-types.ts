/**
 * Conversation mode metadata types.
 *
 */

/** Stable slug — stored on Chat + API */
export type ConversationModeId = 
    | 'socratic' 
    | 'explanatory';

export type ConversationModeStatus = 
    | 'active' 
    | 'coming_soon';

/** Which prompt modules this mode composes (abstraction only) */
export type ConversationModePromptModule =
    | 'core_identity'
    | 'response_formatting'
    | 'safety_restrictions'
    | 'teaching_methodology'
    | 'practice_questions'
    | 'diagram_guidance'
    | 'rag_bridge'
    | 'struggle_topics';

export type StruggleTopicOverride = 
    | 'socratic_off' 
    | 'inherit_methodology';

export interface ConversationModeMeta {
    id: ConversationModeId;
    version: string;
    status: ConversationModeStatus;
    displayName: string;
    shortDescription: string;
    longDescription?: string;
    pedagogy: {
        primaryApproach: string;
        questionPolicy: 'one_at_a_time' | 'flexible';
        answerStyle: 'questions_first' | 'explain_then_check';
    };
    capabilities: {
        usesRag: boolean;
        offersPracticeQuestions: boolean;
        offersDiagrams: boolean;
        struggleTopicOverride: StruggleTopicOverride;
    };
    promptModules: ConversationModePromptModule[];
    isDefault: boolean;
    sortOrder: number;
}

/** Fields exposed to the frontend catalog API */
export interface ApiConversationModeListItem {
    id: ConversationModeId;
    displayName: string;
    shortDescription: string;
    longDescription?: string;
    status: ConversationModeStatus;
    isDefault: boolean;
    sortOrder: number;
}

export interface ModeDescriptionInput {
    id: ConversationModeId;
    version: string;
    status: ConversationModeStatus;
    displayName: string;
    shortDescription: string;
    longDescription?: string;
    pedagogy: ConversationModeMeta['pedagogy'];
    capabilities: ConversationModeMeta['capabilities'];
    promptModules: readonly ConversationModePromptModule[];
    isDefault: boolean;
    sortOrder: number;
}

export function buildMetaFromDescription(input: ModeDescriptionInput): ConversationModeMeta {
    return {
        id: input.id,
        version: input.version,
        status: input.status,
        displayName: input.displayName,
        shortDescription: input.shortDescription,
        longDescription: input.longDescription,
        pedagogy: input.pedagogy,
        capabilities: input.capabilities,
        promptModules: [...input.promptModules],
        isDefault: input.isDefault,
        sortOrder: input.sortOrder,
    };
}
