/**
 * Practice feedback prompt builders — Socratic vs descriptive tiers.
 */

import {
    buildScenarioExamFeedbackSystemPrompt,
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

    it('every feedback system prompt asks for dollar-delimited math', () => {
        for (const prompt of [
            buildScenarioPracticeSocraticFeedbackSystemPrompt(),
            buildScenarioPracticeDescriptiveFeedbackSystemPrompt(),
            buildScenarioExamFeedbackSystemPrompt(),
        ]) {
            expect(prompt).toContain('<module id="math formatting">');
            expect(prompt).toContain('Never use `\\(...\\)`');
        }
    });

    it('asks for plain-text output on practice prompts only', () => {
        expect(buildScenarioPracticeSocraticFeedbackSystemPrompt()).toContain('<module id="output format">');
        expect(buildScenarioPracticeDescriptiveFeedbackSystemPrompt()).toContain('<module id="output format">');
        // Exam grading still returns JSON (per-part grades), so it keeps its structured contract
        expect(buildScenarioExamFeedbackSystemPrompt()).not.toContain('<module id="output format">');
    });

    it("tells the model not to invite a retry on the student's last request", () => {
        const last = buildScenarioPracticeFeedbackUserTurn('n', 'p', 'm', 's', 'socratic', 0);
        const notLast = buildScenarioPracticeFeedbackUserTurn('n', 'p', 'm', 's', 'socratic', 1);
        const preview = buildScenarioPracticeFeedbackUserTurn('n', 'p', 'm', 's', 'socratic');
        expect(last).toContain("last feedback request for this part today");
        expect(notLast).not.toContain('last feedback request');
        expect(preview).not.toContain('last feedback request');
        // The Socratic rules defer to that note
        expect(buildScenarioPracticeSocraticFeedbackSystemPrompt()).toContain(
            "unless the user turn says this is the student's last feedback request"
        );
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
