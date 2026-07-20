/**
 * Practice feedback prompt builders — Socratic vs descriptive tiers.
 */

import {
    buildScenarioPracticeDescriptiveFeedbackSystemPrompt,
    buildScenarioPracticeFeedbackUserTurn,
    buildScenarioPracticeSocraticFeedbackSystemPrompt,
} from '../prompts/scenario-feedback-prompt';
import {
    assemblePracticeDescriptiveFeedback,
    sanitizeScenarioPracticeDescriptiveFeedback,
    sanitizeScenarioPracticeFeedback,
} from '../scenario-schemas';

describe('scenario-feedback-prompt practice tiers', () => {
    it('socratic system prompt requires Socratic questioning', () => {
        const prompt = buildScenarioPracticeSocraticFeedbackSystemPrompt();
        expect(prompt).toContain('Socratic');
        expect(prompt).toContain('ONE guiding question');
    });

    it('descriptive system prompt requires direct evaluation', () => {
        const prompt = buildScenarioPracticeDescriptiveFeedbackSystemPrompt();
        expect(prompt).toContain('direct');
        expect(prompt).toContain('evaluation');
    });

    it('user turns differ by tier', () => {
        const socratic = buildScenarioPracticeFeedbackUserTurn('n', 'p', 'model', 'student', 'socratic');
        const descriptive = buildScenarioPracticeFeedbackUserTurn('n', 'p', 'model', 'student', 'descriptive');
        expect(socratic).toContain('Socratic coaching');
        expect(descriptive).toContain('direct evaluation');
    });
});

describe('scenario-schemas practice sanitizers', () => {
    it('socratic sanitizer strips model answer leaks', () => {
        const model = 'The correct answer is forty-two units exactly.';
        const result = sanitizeScenarioPracticeFeedback(
            { feedback: `You wrote: ${model}` },
            model
        );
        expect(result.feedback).not.toContain('forty-two units exactly');
    });

    it('descriptive sanitizer keeps evaluation text', () => {
        const result = sanitizeScenarioPracticeDescriptiveFeedback({
            feedback: 'Your units are inconsistent.',
        });
        expect(result.feedback).toContain('units are inconsistent');
    });

    it('assemblePracticeDescriptiveFeedback attaches model answer', () => {
        const combined = assemblePracticeDescriptiveFeedback('Good start.', 'Step 1: x = 42');
        expect(combined).toContain('Good start.');
        expect(combined).toContain('**Model answer:**');
        expect(combined).toContain('Step 1: x = 42');
    });
});
