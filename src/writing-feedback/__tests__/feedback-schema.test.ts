/**
 * Feedback schema tests — assignment-specific output, evidence, and numeric grading
 *
 * Covers rubric-derived criterion and level validation, exact-evidence enforcement,
 * normalized quote reconciliation, focused annotation limits, and complete grading.
 *
 * @author: @rdschrs
 * @date: 2026-07-23
 * @version: 2.0.0
 * @description: Regression coverage for dynamic model-output and grading invariants.
 */

import type {
    WritingFeedbackResult,
    WritingRubricDefinition
} from '../contracts';
import { buildDefaultWritingRubric } from '../default-rubric-profile';
import {
    buildFeedbackSchema,
    MAX_EVIDENCE_QUOTE_LENGTH,
    reconcileExactEvidence,
    resolveNumericGrade,
    validateExactEvidence
} from '../feedback-schema';

const verifiedText = 'The heat exchanger transfers thermal energy from the hot stream to the cold stream.';

function feedbackFor(
    rubric: WritingRubricDefinition,
    criterionIds: string[] = rubric.criteria.map((criterion) => criterion.id)
): WritingFeedbackResult {
    return {
        criteria: criterionIds.map((criterion, index) => ({
            criterion,
            suggestedLevel: rubric.levels[index % rubric.levels.length].id,
            evidence: [{ quote: 'transfers thermal energy', rationale: 'Verified technical relationship.' }],
            explanation: 'Criterion-level formative guidance.',
            confidence: 0.8
        })),
        strengths: ['Technical process is named.'],
        revisionGoals: [{
            skillTag: 'audience-awareness',
            goal: 'Define the key term.',
            guidedQuestion: 'What does a reader need to know first?'
        }],
        internalFlags: []
    };
}

function sixCriterionRubric(): WritingRubricDefinition {
    const rubric = buildDefaultWritingRubric('instructor-1', new Date('2026-01-01T00:00:00.000Z'));
    return {
        ...rubric,
        criteria: [
            ...rubric.criteria,
            { id: 'task_constraints', label: 'Task Constraints', description: 'Required task features.' },
            { id: 'sources_referencing', label: 'Sources and Referencing', description: 'Use and attribution of sources.' },
            { id: 'genre_staging', label: 'Genre Staging', description: 'Expected stages for this assignment.' }
        ]
    };
}

function legacyFourCriterionRubric(): WritingRubricDefinition {
    const rubric = buildDefaultWritingRubric('legacy-system', new Date('2026-01-01T00:00:00.000Z'));
    return {
        ...rubric,
        criteria: [
            ...rubric.criteria,
            { id: 'task_constraints', label: 'Task Constraints', description: 'Legacy fourth criterion.' }
        ],
        levels: [
            { id: 'emerging', label: 'Emerging', description: 'Legacy level.' },
            { id: 'developing', label: 'Developing', description: 'Legacy level.' },
            { id: 'competent', label: 'Competent', description: 'Legacy level.' },
            { id: 'strong', label: 'Strong', description: 'Legacy level.' }
        ]
    } as unknown as WritingRubricDefinition;
}

describe('assignment-specific feedback validation', () => {
    it('validates the default three-criterion rubric', () => {
        const rubric = buildDefaultWritingRubric();
        const parsed = buildFeedbackSchema(rubric).parse(feedbackFor(rubric));

        expect(parsed.criteria).toHaveLength(3);
        expect(parsed.criteria.map((criterion) => criterion.criterion)).toEqual([
            'organization',
            'content',
            'interpersonal_positioning'
        ]);
    });

    it('validates an expanded six-criterion rubric', () => {
        const rubric = sixCriterionRubric();

        expect(buildFeedbackSchema(rubric).safeParse(feedbackFor(rubric)).success).toBe(true);
    });

    it('accepts criterion judgments in arbitrary order', () => {
        const rubric = sixCriterionRubric();
        const reversedIds = rubric.criteria.map((criterion) => criterion.id).reverse();
        const parsed = buildFeedbackSchema(rubric).parse(feedbackFor(rubric, reversedIds));

        expect(parsed.criteria.map((criterion) => criterion.criterion)).toEqual(reversedIds);
    });

    it('rejects a performance level outside the assignment rubric', () => {
        const rubric = buildDefaultWritingRubric();
        const invalid = feedbackFor(rubric);
        invalid.criteria[0].suggestedLevel = 'distinguished';

        expect(buildFeedbackSchema(rubric).safeParse(invalid).success).toBe(false);
    });

    it('requires each rubric criterion exactly once', () => {
        const rubric = buildDefaultWritingRubric();
        const invalid = feedbackFor(rubric);
        invalid.criteria[1].criterion = invalid.criteria[0].criterion;

        expect(buildFeedbackSchema(rubric).safeParse(invalid).success).toBe(false);
    });

    it('validates legacy four-criterion output against legacy ids without stored ranks', () => {
        const rubric = legacyFourCriterionRubric();

        expect(buildFeedbackSchema(rubric).safeParse(feedbackFor(rubric)).success).toBe(true);
    });

    it('accepts exact evidence from verified text', () => {
        const rubric = buildDefaultWritingRubric();
        const feedback = feedbackFor(rubric);

        expect(validateExactEvidence(feedback, verifiedText)).toBe(feedback);
    });

    it('rejects invented evidence', () => {
        const rubric = buildDefaultWritingRubric();
        const invalid = feedbackFor(rubric);
        invalid.criteria[0].evidence[0].quote = 'Invented sentence';

        expect(() => validateExactEvidence(invalid, verifiedText)).toThrow('did not match');
    });

    it('rejects paragraph-length model evidence so seeded annotations stay focused', () => {
        const rubric = buildDefaultWritingRubric();
        const invalid = feedbackFor(rubric);
        invalid.criteria[0].evidence[0].quote = 'a'.repeat(MAX_EVIDENCE_QUOTE_LENGTH + 1);
        expect(buildFeedbackSchema(rubric).safeParse(invalid).success).toBe(false);

        invalid.criteria[0].evidence[0].quote = 'a'.repeat(MAX_EVIDENCE_QUOTE_LENGTH);
        expect(buildFeedbackSchema(rubric).safeParse(invalid).success).toBe(true);
    });

    it('blocks numeric grading without a complete instructor-approved mapping', () => {
        const rubric = legacyFourCriterionRubric();
        const feedback = feedbackFor(rubric);

        expect(resolveNumericGrade(feedback, undefined)).toBeUndefined();
        expect(resolveNumericGrade(feedback, {
            emerging: 1,
            developing: 2,
            competent: 3,
            strong: 4
        })).toBe(2.5);
    });
});

describe('reconcileExactEvidence', () => {
    const styledText = 'The “Endless track vehicle” uses two grips — one per ski —\nto change direction over snow.';

    function withQuote(quote: string): WritingFeedbackResult {
        const result = feedbackFor(buildDefaultWritingRubric());
        result.criteria.forEach((criterion) => { criterion.evidence[0].quote = quote; });
        return result;
    }

    it('keeps quotes that are already exact', () => {
        const result = reconcileExactEvidence(feedbackFor(buildDefaultWritingRubric()), verifiedText);
        expect(result.criteria[0].evidence[0].quote).toBe('transfers thermal energy');
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
