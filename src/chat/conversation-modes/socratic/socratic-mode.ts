/**
 * Socratic conversation mode implementation.
 *
 */

import {
    buildMetaFromDescription,
    ConversationModeMeta,
} from '../metadata/conversation-mode-types';
import { ConversationMode } from '../metadata/conversation-mode';
import { RAG_CONTEXT_SEPARATOR } from '../shared/rag-utils';
import { DIAGRAM_GUIDANCE_SECTION } from './diagram-guidance';
import { INITIAL_ASSISTANT_MESSAGE } from './initial-assistant';
import { PRACTICE_QUESTIONS_SECTION } from './practice-questions';
import { RAG_BRIDGE_PROMPT } from './rag-bridge';
import { SOCRATIC_MODE_DESCRIPTION } from './mode-description';
import { TEACHING_METHODOLOGY_SECTION } from './teaching-methodology';

export class SocraticConversationMode extends ConversationMode {
    readonly meta: ConversationModeMeta = buildMetaFromDescription(SOCRATIC_MODE_DESCRIPTION);

    getTeachingMethodologySection(): string {
        return TEACHING_METHODOLOGY_SECTION;
    }

    getPracticeQuestionsSection(): string {
        return PRACTICE_QUESTIONS_SECTION;
    }

    getDiagramGuidanceSection(): string {
        return DIAGRAM_GUIDANCE_SECTION;
    }

    formatRagPrompt(context: string, userMessage: string): string {
        return `${context}${RAG_CONTEXT_SEPARATOR}${RAG_BRIDGE_PROMPT}${userMessage}`;
    }

    getWelcomeMessage(studentName?: string): string {
        if (studentName) {
            return `Hello ${studentName}! ${INITIAL_ASSISTANT_MESSAGE}`;
        }
        return INITIAL_ASSISTANT_MESSAGE;
    }
}
