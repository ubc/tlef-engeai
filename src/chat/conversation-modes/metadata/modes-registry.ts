/**
 * Conversation mode factory and API catalog helpers.
 *
 */

import { ExplanatoryConversationMode } from '../explanatory/explanatory-mode';
import { SocraticConversationMode } from '../socratic/socratic-mode';
import { ConversationMode } from './conversation-mode';
import {
    ApiConversationModeListItem,
    ConversationModeId,
    ConversationModeMeta,
} from './conversation-mode-types';

const MODE_INSTANCES: Record<ConversationModeId, ConversationMode> = {
    socratic: new SocraticConversationMode(),
    explanatory: new ExplanatoryConversationMode(),
};

const DEFAULT_MODE_ID: ConversationModeId = 'socratic';

export function getConversationMode(id: ConversationModeId): ConversationMode {
    const mode = MODE_INSTANCES[id];
    if (!mode) {
        throw new Error(`Unknown conversation mode: ${id}`);
    }
    return mode;
}

export function resolveConversationModeId(input?: string | null): ConversationModeId {
    if (input === 'socratic' || input === 'explanatory') {
        return input;
    }
    return DEFAULT_MODE_ID;
}

export function getAllModesMeta(): ConversationModeMeta[] {
    return Object.values(MODE_INSTANCES)
        .map((m) => m.meta)
        .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getActiveModesForApi(): ApiConversationModeListItem[] {
    return getAllModesMeta()
        .filter((m) => m.status === 'active')
        .map((m) => ({
            id: m.id,
            displayName: m.displayName,
            shortDescription: m.shortDescription,
            longDescription: m.longDescription,
            status: m.status,
            isDefault: m.isDefault,
            sortOrder: m.sortOrder,
        }));
}

export function getModesForApiCatalog(): ApiConversationModeListItem[] {
    return getAllModesMeta().map((m) => ({
        id: m.id,
        displayName: m.displayName,
        shortDescription: m.shortDescription,
        longDescription: m.longDescription,
        status: m.status,
        isDefault: m.isDefault,
        sortOrder: m.sortOrder,
    }));
}

export function assertModeActiveForNewChat(modeId: ConversationModeId): void {
    const mode = getConversationMode(modeId);
    if (mode.meta.status !== 'active') {
        throw new Error(`Conversation mode "${modeId}" is not available`);
    }
}
