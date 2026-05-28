/**
 * Explanatory mode catalog — descriptions only (M1 stub).
 *
 * @latest app version: 1.2.9.11
 */

import { ModeDescriptionInput } from '../metadata/conversation-mode-types';

export const EXPLANATORY_MODE_DESCRIPTION: ModeDescriptionInput = {
    id: 'explanatory',
    version: '0.0.0',
    status: 'coming_soon',
    displayName: 'Explanatory',
    shortDescription: 'Clear explanations with optional check-in questions',
    longDescription: 'EngE-AI explains concepts directly, then checks your understanding.',
    pedagogy: {
        primaryApproach: 'direct_instruction',
        questionPolicy: 'flexible',
        answerStyle: 'explain_then_check',
    },
    capabilities: {
        usesRag: true,
        offersPracticeQuestions: false,
        offersDiagrams: true,
        struggleTopicOverride: 'inherit_methodology',
    },
    promptModules: [
        'core_identity',
        'teaching_methodology',
        'response_formatting',
        'diagram_guidance',
        'safety_restrictions',
        'rag_bridge',
    ],
    isDefault: false,
    sortOrder: 1,
};
