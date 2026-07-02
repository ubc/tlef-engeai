/**
 * RAG user-turn bridge prompts per conversation mode.
 */

import { ragPrompts } from '../rag-prompts';

describe('RAGPrompts.formatRagUserTurn', () => {
    const context = '\n\n<course_materials>\n--- START document ---\n</course_materials>\n';
    const userMessage = 'Calculate the pH of a weak base solution.';

    it('appends scenario-generation bridge for scenario-generation mode', () => {
        const turn = ragPrompts.formatRagUserTurn('scenario-generation', context, userMessage);
        expect(turn).toContain('Scenario Generation mode');
        expect(turn).toContain('one sub-question per later turn');
        expect(turn).toContain(userMessage);
    });

    it('strips scenario-generation bridge from stored user message', () => {
        const turn = ragPrompts.formatRagUserTurn('scenario-generation', context, userMessage);
        const stripped = ragPrompts.stripRagFromUserMessage(turn);
        expect(stripped).toBe(userMessage);
    });
});
