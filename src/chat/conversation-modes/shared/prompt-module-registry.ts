/**
 * Switch-based registry: maps prompt module ids to section strings.
 *
 */

import { ConversationMode } from '../metadata/conversation-mode';
import { ConversationModePromptModule } from '../metadata/conversation-mode-types';
import { CORE_IDENTITY_SECTION } from './modules/core-identity';
import { RESPONSE_FORMATTING_SECTION } from './modules/response-formatting';
import { SAFETY_RESTRICTIONS_SECTION } from './modules/safety-restrictions';
import { getStruggleTopicsSection } from './modules/struggle-topics';

/**
 * @param moduleId - Module to render
 * @param mode - Active mode instance (polymorphic sections)
 */
export function renderPromptModule(
    moduleId: ConversationModePromptModule,
    mode: ConversationMode
): string {
    switch (moduleId) {
        case 'core_identity':
            return CORE_IDENTITY_SECTION;
        case 'response_formatting':
            return RESPONSE_FORMATTING_SECTION;
        case 'safety_restrictions':
            return SAFETY_RESTRICTIONS_SECTION;
        case 'teaching_methodology':
            return mode.getTeachingMethodologySection();
        case 'practice_questions':
            return mode.getPracticeQuestionsSection();
        case 'diagram_guidance':
            return mode.getDiagramGuidanceSection();
        case 'struggle_topics':
            return getStruggleTopicsSection(mode.meta.capabilities.struggleTopicOverride);
        case 'rag_bridge':
            return '';
        default:
            return '';
    }
}
