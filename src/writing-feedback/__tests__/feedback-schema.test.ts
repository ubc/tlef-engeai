/**
 * Feedback schema tests — structured output, evidence, and numeric grading
 *
 * Covers exact-evidence enforcement, normalized quote reconciliation, focused
 * annotation limits, complete criterion output, and all-or-nothing grade mapping.
 *
 * @author: @rdschrs
 * @date: 2026-07-23
 * @version: 1.0.0
 * @description: Regression coverage for model-output and grading invariants.
 */

import {
    a2FeedbackSchema,
    MAX_EVIDENCE_QUOTE_LENGTH,
    reconcileExactEvidence,
    resolveNumericGrade,
    validateExactEvidence
} from '../feedback-schema';
import type { A2FeedbackResult } from '../contracts';

const verifiedText = 'The heat exchanger transfers thermal energy from the hot stream to the cold stream.';
const feedback: A2FeedbackResult = {
    criteria: [
        { criterion: 'organization', suggestedLevel: 'competent', evidence: [{ quote: 'The heat exchanger', rationale: 'Opening subject.' }], explanation: 'Clear opening.', confidence: 0.8 },
        { criterion: 'content', suggestedLevel: 'strong', evidence: [{ quote: 'transfers thermal energy', rationale: 'Technical relationship.' }], explanation: 'Precise process.', confidence: 0.8 },
        { criterion: 'interpersonal_positioning', suggestedLevel: 'developing', evidence: [{ quote: 'hot stream', rationale: 'Terminology to define.' }], explanation: 'Consider the audience.', confidence: 0.6 },
        { criterion: 'task_constraints', suggestedLevel: 'emerging', evidence: [{ quote: 'cold stream', rationale: 'Verified excerpt.' }], explanation: 'Check all constraints.', confidence: 0.6 }
    ],
    strengths: ['Technical process is named.'],
    revisionGoals: [{ skillTag: 'audience-awareness', goal: 'Define the key term.', guidedQuestion: 'What does a reader need to know first?' }],
    internalFlags: []
};

describe('A2 feedback validation', () => {
    it('accepts exact evidence from verified text', () => {
        expect(validateExactEvidence(feedback, verifiedText)).toBe(feedback);
    });

    it('rejects invented evidence', () => {
        const invalid = JSON.parse(JSON.stringify(feedback)) as A2FeedbackResult;
        invalid.criteria[0].evidence[0].quote = 'Invented sentence';
        expect(() => validateExactEvidence(invalid, verifiedText)).toThrow('did not match');
    });

    it('requires each A2 criterion exactly once', () => {
        const invalid = JSON.parse(JSON.stringify(feedback)) as A2FeedbackResult;
        invalid.criteria[1].criterion = 'organization';
        expect(a2FeedbackSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects paragraph-length model evidence so seeded annotations stay focused', () => {
        const invalid = JSON.parse(JSON.stringify(feedback)) as A2FeedbackResult;
        invalid.criteria[0].evidence[0].quote = 'a'.repeat(MAX_EVIDENCE_QUOTE_LENGTH + 1);
        expect(a2FeedbackSchema.safeParse(invalid).success).toBe(false);

        invalid.criteria[0].evidence[0].quote = 'a'.repeat(MAX_EVIDENCE_QUOTE_LENGTH);
        expect(a2FeedbackSchema.safeParse(invalid).success).toBe(true);
    });

    it('blocks numeric grading without a complete instructor-approved mapping', () => {
        expect(resolveNumericGrade(feedback, undefined)).toBeUndefined();
        expect(resolveNumericGrade(feedback, { emerging: 1, developing: 2, competent: 3, strong: 4 })).toBe(2.5);
    });
});

describe('reconcileExactEvidence', () => {
    const styledText = 'The “Endless track vehicle” uses two grips — one per ski —\nto change direction over snow.';

    function withQuote(quote: string): A2FeedbackResult {
        const copy = JSON.parse(JSON.stringify(feedback)) as A2FeedbackResult;
        copy.criteria.forEach((criterion) => { criterion.evidence[0].quote = quote; });
        return copy;
    }

    it('keeps quotes that are already exact', () => {
        const result = reconcileExactEvidence(feedback, verifiedText);
        expect(result.criteria[0].evidence[0].quote).toBe('The heat exchanger');
    });

    it('re-locates quotes with straightened typographic quotes and dashes', () => {
        const result = reconcileExactEvidence(withQuote('The "Endless track vehicle" uses two grips - one per ski -'), styledText);
        expect(result.criteria[0].evidence[0].quote).toBe('The “Endless track vehicle” uses two grips — one per ski —');
        expect(styledText.includes(result.criteria[0].evidence[0].quote)).toBe(true);
    });

    it('re-locates quotes with collapsed whitespace across a line break', () => {
        const result = reconcileExactEvidence(withQuote('one per ski — to change direction'), styledText);
        expect(styledText.includes(result.criteria[0].evidence[0].quote)).toBe(true);
        expect(result.criteria[0].evidence[0].quote).toContain('\n');
    });

    it('strips stray wrapping quotation marks added by the model', () => {
        const result = reconcileExactEvidence(withQuote('"to change direction over snow."'), styledText);
        expect(result.criteria[0].evidence[0].quote).toBe('to change direction over snow.');
    });

    it('still rejects paraphrased evidence', () => {
        expect(() => reconcileExactEvidence(withQuote('The vehicle steers with handles.'), styledText))
            .toThrow('did not match');
    });
});
