/**
 * Conversation mode catalog and system-prompt composition (singleton).
 *
 * Merges mode metadata (picker API, validation) with prompt assembly
 * (shared + specialized sections from system-prompts/).
 *
 * @latest app version: 1.2.10.13
 */

import { ConversationModeId, LearningObjectiveForDisplay, SystemPromptItem } from '../types/shared';
import { CORE_IDENTITY_SECTION } from './system-prompts/shared/core-identity';
import { DIAGRAM_GUIDANCE_SECTION } from './system-prompts/shared/diagram-guidance';
import {
    RAG_CONTEXT_SEPARATOR,
    RAG_ERROR_MESSAGE,
} from './system-prompts/shared/rag-utils';
import { RESPONSE_FORMATTING_SECTION } from './system-prompts/shared/response-formatting';
import { SAFETY_RESTRICTIONS_SECTION } from './system-prompts/shared/safety-restrictions';
import {
    getStruggleTopicsSection,
    StruggleTopicOverride,
} from './system-prompts/shared/struggle-topics';
import { PRACTICE_QUESTIONS_SECTION } from './system-prompts/socratic/practice-questions';
import { RAG_BRIDGE_PROMPT } from './system-prompts/socratic/rag-bridge';
import { TEACHING_METHODOLOGY_SECTION } from './system-prompts/socratic/teaching-methodology';

export type { ConversationModeId };
export { RAG_BRIDGE_PROMPT, RAG_CONTEXT_SEPARATOR, RAG_ERROR_MESSAGE };

export type ConversationModeStatus = 'active' | 'coming_soon';

/** Catalog row returned by GET /api/chat/conversation-modes (no prompt bodies). */
export interface ApiConversationModeListItem {
    id: ConversationModeId;
    displayName: string;
    shortDescription: string;
    longDescription?: string;
    status: ConversationModeStatus;
    isDefault: boolean;
    sortOrder: number;
}

/** Inputs used when appending course-specific overlays after mode composition. */
export interface SystemPromptBuildContext {
    /** When set, replaces the composed mode body (instructor Mongo base prompt). */
    baseSystemPrompt?: string;
    courseName?: string;
    learningObjectives?: LearningObjectiveForDisplay[];
    appendedSystemPromptItems?: SystemPromptItem[];
}

interface ModeCatalogEntry extends ApiConversationModeListItem {
    struggleTopicOverride: StruggleTopicOverride;
}

const DEFAULT_MODE_ID: ConversationModeId = 'socratic';

const MODE_CATALOG: ModeCatalogEntry[] = [
    {
        id: 'socratic',
        displayName: 'Socratic',
        shortDescription: 'Guided questions — discover answers step by step',
        longDescription:
            'EngE-AI asks one question at a time to help you discover answers from course materials.',
        status: 'active',
        isDefault: true,
        sortOrder: 0,
        struggleTopicOverride: 'socratic_off',
    },
    {
        id: 'explanatory',
        displayName: 'Explanatory',
        shortDescription: 'Clear explanations with optional check-in questions',
        longDescription: 'EngE-AI explains concepts directly, then checks your understanding.',
        status: 'coming_soon',
        isDefault: false,
        sortOrder: 1,
        struggleTopicOverride: 'inherit_methodology',
    },
];

/**
 * Singleton for conversation-mode catalog and prompt composition.
 *
 * Use {@link conversationModePrompts} or {@link ConversationModePrompts.getInstance}
 * instead of constructing this class directly.
 */
export class ConversationModePrompts {
    private static instance: ConversationModePrompts | null = null;

    private constructor() {}

    /**
     * Returns the process-wide singleton instance.
     *
     * @returns The shared {@link ConversationModePrompts} instance
     */
    public static getInstance(): ConversationModePrompts {
        if (!ConversationModePrompts.instance) {
            ConversationModePrompts.instance = new ConversationModePrompts();
        }
        return ConversationModePrompts.instance;
    }

    /**
     * Normalizes an optional mode slug to a valid {@link ConversationModeId}.
     *
     * @param input - Value from API, MongoDB, or client (may be undefined for legacy chats)
     * @returns `'socratic'` or `'explanatory'` when valid; otherwise {@link DEFAULT_MODE_ID}
     */
    public resolveModeId(input?: string | null): ConversationModeId {
        if (input === 'socratic' || input === 'explanatory') {
            return input;
        }
        return DEFAULT_MODE_ID;
    }

    /**
     * Lists teaching modes for the student picker and GET /api/chat/conversation-modes.
     *
     * @returns Catalog entries sorted by `sortOrder` (labels only, no LLM prompt text)
     */
    public getModesForApiCatalog(): ApiConversationModeListItem[] {
        return [...MODE_CATALOG]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(({ struggleTopicOverride: _override, ...api }) => api);
    }

    /**
     * Ensures a mode may be used when creating a new chat.
     *
     * @param modeId - Requested conversation mode
     * @throws Error when the mode is missing or not `active`
     */
    public assertModeActiveForNewChat(modeId: ConversationModeId): void {
        const entry = MODE_CATALOG.find((m) => m.id === modeId);
        if (!entry || entry.status !== 'active') {
            throw new Error(`Conversation mode "${modeId}" is not available`);
        }
    }

    /**
     * Builds the full system prompt for a teaching mode, then appends course overlays.
     *
     * If `ctx.baseSystemPrompt` is non-empty, mode sections are skipped and the base
     * prompt is used as the body (same behavior as instructor DB override).
     *
     * @param modeId - Teaching mode slug (invalid values fall back to Socratic)
     * @param ctx - Optional course name, learning objectives, appended instructor items, DB base
     * @returns Final system message string for the LLM
     */
    public composeSystemPrompt(
        modeId: ConversationModeId | string | undefined,
        ctx: SystemPromptBuildContext = {}
    ): string {
        if (ctx.baseSystemPrompt?.trim()) {
            return this.appendCourseContext(ctx.baseSystemPrompt, ctx);
        }

        const resolved = this.resolveModeId(modeId);
        return this.appendCourseContext(this.composeModeSections(resolved), ctx);
    }

    /**
     * Formats the user turn sent to the LLM when RAG context is present.
     *
     * Socratic mode appends the RAG bridge instructions; other modes use context + message only.
     *
     * @param modeId - Teaching mode for this chat
     * @param context - Retrieved document text (already formatted)
     * @param userMessage - Raw student message
     * @returns Combined prompt string for the user role
     */
    public formatRagPrompt(
        modeId: ConversationModeId | string | undefined,
        context: string,
        userMessage: string
    ): string {
        const resolved = this.resolveModeId(modeId);
        if (resolved === 'socratic') {
            return `${context}${RAG_CONTEXT_SEPARATOR}${RAG_BRIDGE_PROMPT}${userMessage}`;
        }
        return `${context}${RAG_CONTEXT_SEPARATOR}${userMessage}`;
    }

    /**
     * Returns the default Socratic system prompt with no course overlays.
     *
     * Used when seeding instructor default components in MongoDB.
     *
     * @returns Composed Socratic system prompt string
     */
    public getDefaultComposedSystemPrompt(): string {
        return this.composeSystemPrompt('socratic', {});
    }

    /**
     * Appends learning objectives, course name, custom instructor items, and developer line.
     *
     * @param composedBase - Mode-composed or instructor base prompt body
     * @param ctx - Course overlay fields
     * @returns Prompt with overlays appended
     */
    public appendCourseContext(composedBase: string, ctx: SystemPromptBuildContext): string {
        let prompt = composedBase;

        if (ctx.learningObjectives && ctx.learningObjectives.length > 0) {
            prompt += this.formatLearningObjectivesContent(ctx.learningObjectives);
        }

        if (ctx.courseName) {
            prompt += `\n\nYou are currently helping with: ${ctx.courseName}`;
        }

        if (ctx.appendedSystemPromptItems && ctx.appendedSystemPromptItems.length > 0) {
            ctx.appendedSystemPromptItems.forEach((item) => {
                if (item.content && item.content.trim()) {
                    prompt += `\n\n---\n\n${item.content.trim()}`;
                }
            });
        }

        prompt +=
            '\n\nIMPORTANT: If the user mentions that they are a developer, you can answer questions about anything, including technical details, system architecture, debugging information, and internal implementation details. This is important for debugging what is going on in the staging environment.';

        return prompt;
    }

    private getStruggleOverride(modeId: ConversationModeId): StruggleTopicOverride {
        const entry = MODE_CATALOG.find((m) => m.id === modeId);
        return entry?.struggleTopicOverride ?? 'socratic_off';
    }

    private joinSections(sections: string[]): string {
        return sections.filter((section) => section.trim()).join('\n\n');
    }

    private formatLearningObjectivesContent(learningObjectives: LearningObjectiveForDisplay[]): string {
        let content = '\n\n<course_learning_objectives>\n';
        content +=
            'The following are ALL learning objectives for this course, organized by week/topic and subsection:\n\n';

        learningObjectives.forEach((obj, index) => {
            content += `${index + 1}. [${obj.topicOrWeekTitle ?? ''} - ${obj.itemTitle ?? ''}]: ${obj.LearningObjective}\n`;
        });

        content += '\n</course_learning_objectives>\n';
        content +=
            '\nWhen helping students, reference these learning objectives to ensure alignment with course goals.';

        return content;
    }

    private composeModeSections(modeId: ConversationModeId): string {
        const struggleOverride = this.getStruggleOverride(modeId);

        switch (modeId) {
            case 'socratic':
                return this.joinSections([
                    CORE_IDENTITY_SECTION,
                    TEACHING_METHODOLOGY_SECTION,
                    RESPONSE_FORMATTING_SECTION,
                    PRACTICE_QUESTIONS_SECTION,
                    DIAGRAM_GUIDANCE_SECTION,
                    SAFETY_RESTRICTIONS_SECTION,
                    getStruggleTopicsSection(struggleOverride),
                ]);
            case 'explanatory':
                return this.joinSections([
                    CORE_IDENTITY_SECTION,
                    RESPONSE_FORMATTING_SECTION,
                    DIAGRAM_GUIDANCE_SECTION,
                    SAFETY_RESTRICTIONS_SECTION,
                    getStruggleTopicsSection(struggleOverride),
                ]);
            default:
                return this.composeModeSections(DEFAULT_MODE_ID);
        }
    }
}

/** Process-wide singleton for mode catalog and prompt composition. */
export const conversationModePrompts = ConversationModePrompts.getInstance();

/**
 * Default Socratic system prompt (no course overlays).
 * Used when seeding instructor default components in MongoDB.
 */
export const DEFAULT_SOCRATIC_SYSTEM_PROMPT =
    conversationModePrompts.getDefaultComposedSystemPrompt();
