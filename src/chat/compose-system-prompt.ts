/**
 * Conversation mode catalog (singleton).
 *
 * Mode metadata for picker API and validation. Prompt assembly lives in
 * assemble-course-system-prompt.ts and platform JSON defaults.
 */

import { ConversationModeId } from '../types/shared';

export type { ConversationModeId };

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

const DEFAULT_MODE_ID: ConversationModeId = 'socratic';

const MODE_CATALOG: ApiConversationModeListItem[] = [
    {
        id: 'socratic',
        displayName: 'Socratic',
        shortDescription: 'Guided questions — discover answers step by step',
        longDescription:
            'EngE-AI asks one question at a time to help you discover answers from course materials.',
        status: 'active',
        isDefault: true,
        sortOrder: 0,
    },
    {
        id: 'explanatory',
        displayName: 'Explanatory',
        shortDescription: 'Clear explanations with optional check-in questions',
        longDescription:
            'EngE-AI explains concepts directly using the PROSE framework, then optionally checks your understanding.',
        status: 'active',
        isDefault: false,
        sortOrder: 1,
    },
];

/**
 * Singleton for conversation-mode catalog.
 */
export class ConversationModePrompts {
    private static instance: ConversationModePrompts | null = null;

    private constructor() {}

    public static getInstance(): ConversationModePrompts {
        if (!ConversationModePrompts.instance) {
            ConversationModePrompts.instance = new ConversationModePrompts();
        }
        return ConversationModePrompts.instance;
    }

    /** True when the string is an active catalog mode slug (does not coerce invalid values). */
    public isValidConversationMode(mode: string): mode is ConversationModeId {
        return mode === 'socratic' || mode === 'explanatory';
    }

    public resolveModeId(input?: string | null): ConversationModeId {
        if (input !== undefined && input !== null && this.isValidConversationMode(input)) {
            return input;
        }
        return DEFAULT_MODE_ID;
    }

    public getModesForApiCatalog(defaultConversationMode?: ConversationModeId): ApiConversationModeListItem[] {
        const resolvedDefault = defaultConversationMode ?? DEFAULT_MODE_ID;
        return [...MODE_CATALOG]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((entry) => ({
                ...entry,
                isDefault: entry.id === resolvedDefault,
            }));
    }

    public assertModeActiveForNewChat(modeId: ConversationModeId): void {
        const entry = MODE_CATALOG.find((m) => m.id === modeId);
        if (!entry || entry.status !== 'active') {
            throw new Error(`Conversation mode "${modeId}" is not available`);
        }
    }
}

export const conversationModePrompts = ConversationModePrompts.getInstance();
