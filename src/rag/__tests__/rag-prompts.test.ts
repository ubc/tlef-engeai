/**
 * RAG user-turn bridge prompts per conversation mode.
 */

import { ragPrompts } from '../rag-prompts';

describe('RAGPrompts.formatRagUserTurn', () => {
    const context = '\n\n<course_materials>\n--- START document ---\n</course_materials>\n';
    const userMessage = 'Calculate the pH of a weak base solution.';

    it('appends explanatory bridge for explanatory mode', () => {
        const turn = ragPrompts.formatRagUserTurn('explanatory', context, userMessage);
        expect(turn).toContain('Explanatory mode');
        expect(turn).toContain(userMessage);
    });

    it('strips explanatory bridge from stored user message', () => {
        const turn = ragPrompts.formatRagUserTurn('explanatory', context, userMessage);
        const stripped = ragPrompts.stripRagFromUserMessage(turn);
        expect(stripped).toBe(userMessage);
    });

    it('falls back to socratic bridge for a retired mode slug (e.g. scenario-generation)', () => {
        const turn = ragPrompts.formatRagUserTurn('scenario-generation', context, userMessage);
        expect(turn).toContain('Socratic method');
        expect(turn).toContain(userMessage);
    });
});
