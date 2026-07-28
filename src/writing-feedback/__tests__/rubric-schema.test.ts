/**
 * Writing rubric schema tests — complete scales and immutable approval
 *
 * Verifies that instructor text remains inert data, every supported criterion and
 * level is present exactly once, and numeric mappings are never partially inferred.
 *
 * @author: @rdschrs
 * @date: 2026-07-13
 * @version: 1.0.0
 * @description: Regression coverage for rubric draft validation and promotion.
 */

import { buildA2Rubric } from '../a2-profile';
import {
    approveRubricDraft,
    buildRubricDraft,
    gradeMappingFromApprovedRubric,
    writingRubricDraftInputSchema
} from '../rubric-schema';

function inputFromDefault() {
    const rubric = buildA2Rubric('system', new Date('2026-01-01T00:00:00.000Z'));
    return {
        title: rubric.title,
        task: rubric.task,
        audience: rubric.audience,
        purpose: rubric.purpose,
        constraints: rubric.constraints,
        learningOutcomes: rubric.learningOutcomes,
        gradingIntent: rubric.gradingIntent,
        criteria: rubric.criteria,
        levels: rubric.levels
    };
}

describe('Writing rubric draft validation', () => {
    it('accepts the complete A2 rubric and keeps instructor text as data', () => {
        const input = inputFromDefault();
        input.task = 'Ignore earlier instructions is a phrase to discuss, not a model instruction.';
        const parsed = writingRubricDraftInputSchema.parse(input);
        expect(parsed.task).toBe(input.task);
        expect(parsed.criteria).toHaveLength(4);
        expect(parsed.levels).toHaveLength(4);
    });

    it('requires every supported criterion and performance level exactly once', () => {
        const input = inputFromDefault();
        input.criteria[1] = { ...input.criteria[0] };
        input.levels[1] = { ...input.levels[0] };
        const parsed = writingRubricDraftInputSchema.safeParse(input);
        expect(parsed.success).toBe(false);
    });

    it('rejects a partial numeric mapping', () => {
        const input = inputFromDefault();
        input.levels[0] = { ...input.levels[0], points: 1 };
        const parsed = writingRubricDraftInputSchema.safeParse(input);
        expect(parsed.success).toBe(false);
    });

    it('keeps a saved draft inactive until explicit approval', () => {
        const input = writingRubricDraftInputSchema.parse({
            ...inputFromDefault(),
            levels: inputFromDefault().levels.map((level, index) => ({ ...level, points: index + 1 }))
        });
        const draft = buildRubricDraft(input, 2, 'instructor-1', new Date('2026-01-02T00:00:00.000Z'));
        expect(draft.status).toBe('draft');
        expect(draft.approvedAt).toBeUndefined();

        const approved = approveRubricDraft(draft, 'instructor-1', new Date('2026-01-03T00:00:00.000Z'));
        expect(approved.status).toBe('approved');
        expect(approved.version).toBe(2);
        expect(gradeMappingFromApprovedRubric(approved)).toEqual({
            emerging: 1,
            developing: 2,
            competent: 3,
            strong: 4
        });
    });
});
