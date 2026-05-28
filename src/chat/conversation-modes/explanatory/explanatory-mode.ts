/**
 * Explanatory conversation mode (M1 stub — coming_soon).
 *
 */

import {
    buildMetaFromDescription,
    ConversationModeMeta,
} from '../metadata/conversation-mode-types';
import { ConversationMode } from '../metadata/conversation-mode';
import { RAG_CONTEXT_SEPARATOR } from '../shared/rag-utils';
import { EXPLANATORY_MODE_DESCRIPTION } from './mode-description';

export class ExplanatoryConversationMode extends ConversationMode {
    readonly meta: ConversationModeMeta = buildMetaFromDescription(EXPLANATORY_MODE_DESCRIPTION);

    formatRagPrompt(context: string, userMessage: string): string {
        return `${context}${RAG_CONTEXT_SEPARATOR}${userMessage}`;
    }

    getWelcomeMessage(_studentName?: string): string {
        return 'Explanatory mode is coming soon. Please start a chat in Socratic mode.';
    }
}
