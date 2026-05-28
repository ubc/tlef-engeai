/**
 * Conversation modes package exports.
 *
 * @latest app version: 1.2.9.11
 */

export {
    composeSystemPrompt,
    formatRagPromptForMode,
    getDefaultComposedSystemPrompt,
    getInitialAssistantMessageForMode,
} from './compose-system-prompt';
export type { SystemPromptBuildContext } from './compose-system-prompt-context';
export {
    assertModeActiveForNewChat,
    getActiveModesForApi,
    getConversationMode,
    getModesForApiCatalog,
    resolveConversationModeId,
} from './metadata/modes-registry';
export type {
    ApiConversationModeListItem,
    ConversationModeId,
    ConversationModeMeta,
} from './metadata/conversation-mode-types';
