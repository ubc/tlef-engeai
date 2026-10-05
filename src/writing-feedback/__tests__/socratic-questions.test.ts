/**
 * @fileoverview Socratic question rules and the one-retry gate (D-153).
 */
import { SanitizedJobError } from '../job-runner';
import {
    SOCRATIC_QUESTIONS_FAILED_MESSAGE,
    validateSocraticQuestions,
    withQuestionGate
} from '../socratic-questions';

const whole = { guidedQuestion: 'Who will read your report, and what do they need first?', questionScope: 'whole' };
const part = { guidedQuestion: 'In your first sentence, what makes renewable energy different?', questionScope: 'part' };

describe('validateSocraticQuestions', () => {
    it('accepts one whole and one part question', () => {
        expect(validateSocraticQuestions([whole, part])).toEqual([]);
    });

    it('requires a question and a scope on every goal', () => {
        expect(validateSocraticQuestions([whole, { guidedQuestion: null, questionScope: 'part' }]))
            .toContain('Goal 2 has no guidedQuestion.');
        expect(validateSocraticQuestions([whole, { guidedQuestion: part.guidedQuestion }]))
            .toContain('Goal 2 has no questionScope ("whole" or "part").');
    });

    it('requires at least one whole-submission question', () => {
        expect(validateSocraticQuestions([part])).toContain('At least one goal needs a question about the whole submission (questionScope "whole").');
    });

    it('rejects yes/no openers in any case, and questions without a question mark', () => {
        expect(validateSocraticQuestions([whole, { guidedQuestion: 'is your definition clear?', questionScope: 'part' }]))
            .toContain('Goal 2 asks a yes/no question; ask what, which, how or why instead.');
        expect(validateSocraticQuestions([whole, { guidedQuestion: 'Did you forget the closing?', questionScope: 'part' }]))
            .toContain('Goal 2 asks a yes/no question; ask what, which, how or why instead.');
        expect(validateSocraticQuestions([{ ...whole, guidedQuestion: 'Think about your reader.' }]))
            .toContain('Goal 1 question must end with a question mark.');
    });

    it.each([
        "Isn't your definition too short?",
        'Doesn’t the closing repeat the title?',
        '"Is this the best order?"',
        'Was the classification clear?',
        'Were all three types described?'
    ])('rejects a yes/no question in other forms: %s', (question) => {
        expect(validateSocraticQuestions([{ ...whole, guidedQuestion: question }]))
            .toContain('Goal 1 asks a yes/no question; ask what, which, how or why instead.');
    });

    it('does not mistake words that start like an opener', () => {
        expect(validateSocraticQuestions([{ ...whole, guidedQuestion: 'Issues aside, what does your reader need first?' }])).toEqual([]);
    });

    it('accepts a question mark followed by a closing quote or spaces', () => {
        expect(validateSocraticQuestions([{ ...whole, guidedQuestion: 'What does "first?" ' }])).toEqual([]);
        expect(validateSocraticQuestions([{ ...whole, guidedQuestion: 'What does your reader need first?"' }])).toEqual([]);
    });

    it('requires the rewrite block question when a rewrite block is present', () => {
        expect(validateSocraticQuestions([whole], { guidedQuestion: '' })).toContain('globalRevision has no guidedQuestion.');
        expect(validateSocraticQuestions([whole], { guidedQuestion: 'Did it work?' }))
            .toContain('globalRevision asks a yes/no question; ask what, which, how or why instead.');
        expect(validateSocraticQuestions([whole], { guidedQuestion: 'What does your reader need to know first?' })).toEqual([]);
    });
});

describe('withQuestionGate', () => {
    it('returns the first valid attempt without retrying', async () => {
        const attempt = jest.fn(async (_correction?: string) => 'ok');
        await expect(withQuestionGate(attempt, () => [])).resolves.toBe('ok');
        expect(attempt).toHaveBeenCalledTimes(1);
        expect(attempt).toHaveBeenCalledWith(undefined);
    });

    it('retries once with the problems as a correction', async () => {
        const attempt = jest.fn(async (correction?: string) => (correction ? 'fixed' : 'broken'));
        const result = await withQuestionGate(attempt, (value) => (value === 'broken' ? ['Goal 1 has no guidedQuestion.'] : []));
        expect(result).toBe('fixed');
        expect(attempt).toHaveBeenCalledTimes(2);
        expect(attempt.mock.calls[1][0]).toContain('Goal 1 has no guidedQuestion.');
    });

    it('fails with the fixed, prose-free message after a second invalid reply', async () => {
        const attempt = jest.fn(async (_correction?: string) => 'model prose that must not leak');
        const failure = withQuestionGate(attempt, () => ['Goal 1 has no guidedQuestion.']);
        await expect(failure).rejects.toBeInstanceOf(SanitizedJobError);
        await expect(withQuestionGate(attempt, () => ['x'])).rejects.toThrow(SOCRATIC_QUESTIONS_FAILED_MESSAGE);
        await expect(withQuestionGate(attempt, () => ['x'])).rejects.not.toThrow(/model prose/);
    });
});
