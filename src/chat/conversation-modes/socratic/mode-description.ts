/**
 * Socratic mode catalog — student-facing descriptions only (no LLM prompt bodies).
 *
 */

import { ModeDescriptionInput } from '../metadata/conversation-mode-types';

export const SOCRATIC_MODE_DESCRIPTION: ModeDescriptionInput = {
    id: 'socratic',
    version: '1.0.0',
    status: 'active',
    displayName: 'Socratic',
    shortDescription: 'Guided questions — discover answers step by step',
    longDescription:
        'EngE-AI asks one question at a time to help you discover answers from course materials.',
    pedagogy: {
        primaryApproach: 'guided_discovery',
        questionPolicy: 'one_at_a_time',
        answerStyle: 'questions_first',
    },
    capabilities: {
        usesRag: true,
        offersPracticeQuestions: true,
        offersDiagrams: true,
        struggleTopicOverride: 'socratic_off',
    },
    promptModules: [
        'core_identity',
        'teaching_methodology',
        'response_formatting',
        'practice_questions',
        'diagram_guidance',
        'safety_restrictions',
        'struggle_topics',
        'rag_bridge',
    ],
    isDefault: true,
    sortOrder: 0,
};
