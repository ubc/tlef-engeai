/**
 * Public entry: compose system prompt for a conversation mode.
 *
 * @latest app version: 1.2.9.11
 */

import { SystemPromptBuildContext } from './compose-system-prompt-context';
import { getConversationMode, resolveConversationModeId } from './metadata/modes-registry';
import { ConversationModeId } from './metadata/conversation-mode-types';

/**
 * @param modeId - Conversation mode slug
 * @param ctx - Course overlays and optional instructor base prompt
 */
export function composeSystemPrompt(
    modeId: ConversationModeId | string | undefined,
    ctx: SystemPromptBuildContext = {}
): string {
    const resolved = resolveConversationModeId(modeId);
    return getConversationMode(resolved).buildSystemPrompt(ctx);
}

export function formatRagPromptForMode(
    modeId: ConversationModeId | string | undefined,
    context: string,
    userMessage: string
): string {
    const resolved = resolveConversationModeId(modeId);
    return getConversationMode(resolved).formatRagPrompt(context, userMessage);
}

export function getInitialAssistantMessageForMode(
    modeId: ConversationModeId | string | undefined,
    studentName?: string
): string {
    const resolved = resolveConversationModeId(modeId);
    return getConversationMode(resolved).getWelcomeMessage(studentName);
}

/** Composed Socratic system prompt without course overlays (backward compat). */
export function getDefaultComposedSystemPrompt(): string {
    return composeSystemPrompt('socratic', {});
}
