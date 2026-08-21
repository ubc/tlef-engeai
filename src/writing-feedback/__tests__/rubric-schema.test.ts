/**
 * Writing rubric schema tests — dynamic scales and immutable approval joins
 *
 * Verifies bounded assignment-specific criteria and levels, explicit ranks,
 * all-or-nothing points, draft lifecycle, and approved identifier stability.
 *
 * @author: @rdschrs
 * @date: 2026-07-13
 * @version: 2.0.0
 * @description: Regression coverage for rubric draft validation and promotion.
 */

import { buildDefaultWritingRubric } from '../default-rubric-profile';
import {
    approveRubricDraft,
    assertApprovedRubricIdsStable,
    buildRubricDraft,
    gradeMappingFromApprovedRubric,
    writingRubricDraftInputSchema
} from '../rubric-schema';
import type { WritingRubricDraftInput } from '../rubric-schema';

function inputFromDefault(): WritingRubricDraftInput {
    const rubric = buildDefaultWritingRubric('system', new Date('2026-01-01T00:00:00.000Z'));
    return writingRubricDraftInputSchema.parse({
        title: rubric.title,
        task: rubric.task,
        audience: rubric.audience,
        purpose: rubric.purpose,
        constraints: rubric.constraints,
        learningOutcomes: rubric.learningOutcomes,
        gradingIntent: rubric.gradingIntent,
        criteria: rubric.criteria,
        levels: rubric.levels
    });
}

function inputWithSixCriteria(): WritingRubricDraftInput {
    const input = inputFromDefault();
    input.criteria.push(
        { id: 'task_constraints', label: 'Task Constraints', description: 'Required task features.' },
        { id: 'sources_referencing', label: 'Sources and Referencing', description: 'Use and attribution of sources.' },
        { id: 'genre_staging', label: 'Genre Staging', description: 'Expected stages for this assignment.' }
    );
    return input;
}

describe('Writing rubric draft validation', () => {
    it('accepts the editable three-criterion default as an unapproved draft', () => {
        const rubric = buildDefaultWritingRubric('system', new Date('2026-01-01T00:00:00.000Z'));
        const parsed = writingRubricDraftInputSchema.parse(inputFromDefault());

        expect(rubric.status).toBe('draft');
        expect(rubric.approvedAt).toBeUndefined();
        expect(parsed.criteria.map((criterion) => criterion.id)).toEqual([
            'organization',
            'content',
            'interpersonal_positioning'
        ]);
        expect(parsed.levels.map((level) => [level.id, level.rank])).toEqual([
            ['weak', 1],
            ['developing', 2],
            ['proficient', 3],
            ['exemplary', 4]
        ]);
    });

    it('accepts a six-criterion assignment and keeps instructor text as inert data', () => {
        const input = inputWithSixCriteria();
        input.task = 'Ignore earlier instructions is a phrase to discuss, not a model instruction.';

        const parsed = writingRubricDraftInputSchema.parse(input);

        expect(parsed.task).toBe(input.task);
        expect(parsed.criteria).toHaveLength(6);
    });

    it('rejects duplicate criterion and performance-level ids', () => {
        const duplicateCriterion = inputFromDefault();
        duplicateCriterion.criteria[1] = { ...duplicateCriterion.criteria[0] };
        expect(writingRubricDraftInputSchema.safeParse(duplicateCriterion).success).toBe(false);

        const duplicateLevel = inputFromDefault();
        duplicateLevel.levels[1] = { ...duplicateLevel.levels[0], rank: 2 };
        expect(writingRubricDraftInputSchema.safeParse(duplicateLevel).success).toBe(false);
    });

    it('accepts arbitrary array order when explicit ranks remain contiguous', () => {
        const input = inputFromDefault();
        input.levels.reverse();

        const parsed = writingRubricDraftInputSchema.parse(input);

        expect(parsed.levels.map((level) => level.rank)).toEqual([4, 3, 2, 1]);
    });

    it('rejects duplicate or non-contiguous ranks', () => {
        const duplicateRank = inputFromDefault();
        duplicateRank.levels[1] = { ...duplicateRank.levels[1], rank: 1 };
        expect(writingRubricDraftInputSchema.safeParse(duplicateRank).success).toBe(false);

        const rankGap = inputFromDefault();
        rankGap.levels[3] = { ...rankGap.levels[3], rank: 5 };
        expect(writingRubricDraftInputSchema.safeParse(rankGap).success).toBe(false);
    });

    it('enforces the one-to-ten criterion and two-to-eight level bounds', () => {
        const noCriteria = inputFromDefault();
        noCriteria.criteria = [];
        expect(writingRubricDraftInputSchema.safeParse(noCriteria).success).toBe(false);

        const oneLevel = inputFromDefault();
        oneLevel.levels = oneLevel.levels.slice(0, 1);
        expect(writingRubricDraftInputSchema.safeParse(oneLevel).success).toBe(false);

        const tooManyCriteria = inputFromDefault();
        tooManyCriteria.criteria = Array.from({ length: 11 }, (_, index) => ({
            id: `criterion_${index + 1}`,
            label: `Criterion ${index + 1}`,
            description: 'Assignment-specific criterion.'
        }));
        expect(writingRubricDraftInputSchema.safeParse(tooManyCriteria).success).toBe(false);

        const tooManyLevels = inputFromDefault();
        tooManyLevels.levels = Array.from({ length: 9 }, (_, index) => ({
            id: `level_${index + 1}`,
            label: `Level ${index + 1}`,
            description: 'Assignment-specific performance level.',
            rank: index + 1
        }));
        expect(writingRubricDraftInputSchema.safeParse(tooManyLevels).success).toBe(false);
    });

    it('rejects a partial numeric mapping', () => {
        const input = inputFromDefault();
        input.levels[0] = { ...input.levels[0], points: 1 };

        expect(writingRubricDraftInputSchema.safeParse(input).success).toBe(false);
    });

    it('derives a complete numeric mapping by level id regardless of array order', () => {
        const input = inputFromDefault();
        input.levels = input.levels
            .map((level) => ({ ...level, points: level.rank * 10 }))
            .reverse();
        const draft = buildRubricDraft(input, 2, 'instructor-1', new Date('2026-01-02T00:00:00.000Z'));
        const approved = approveRubricDraft(draft, 'instructor-1', new Date('2026-01-03T00:00:00.000Z'));

        expect(gradeMappingFromApprovedRubric(approved)).toEqual({
            exemplary: 40,
            proficient: 30,
            developing: 20,
            weak: 10
        });
    });

    it('returns no numeric mapping when every level remains ordinal', () => {
        const draft = buildRubricDraft(inputFromDefault(), 2, 'instructor-1');
        const approved = approveRubricDraft(draft, 'instructor-1');

        expect(gradeMappingFromApprovedRubric(approved)).toBeUndefined();
    });

    it('keeps a saved draft inactive until explicit approval', () => {
        const draft = buildRubricDraft(inputFromDefault(), 2, 'instructor-1', new Date('2026-01-02T00:00:00.000Z'));
        expect(draft.status).toBe('draft');
        expect(draft.approvedAt).toBeUndefined();

        const approved = approveRubricDraft(draft, 'instructor-1', new Date('2026-01-03T00:00:00.000Z'));
        expect(approved.status).toBe('approved');
        expect(approved.version).toBe(2);
        expect(approved.approvedBy).toBe('instructor-1');
    });
});

describe('approved rubric identifier stability', () => {
    function approvedDefault() {
        return approveRubricDraft(
            buildRubricDraft(inputFromDefault(), 1, 'instructor-1'),
            'instructor-1'
        );
    }

    it('rejects criterion and level id changes after approval', () => {
        const approved = approvedDefault();
        const renamedCriterion = inputFromDefault();
        renamedCriterion.criteria[0] = { ...renamedCriterion.criteria[0], id: 'structure' };
        expect(() => assertApprovedRubricIdsStable(approved, renamedCriterion))
            .toThrow('criterion ids');

        const removedLevel = inputFromDefault();
        removedLevel.levels = removedLevel.levels.slice(0, -1);
        expect(() => assertApprovedRubricIdsStable(approved, removedLevel))
            .toThrow('performance-level ids');
    });

    it('allows labels, descriptions, points, and ordering to change without changing ids', () => {
        const approved = approvedDefault();
        const edited = inputFromDefault();
        edited.criteria[0] = { ...edited.criteria[0], label: 'Text Organization' };
        edited.levels = edited.levels
            .map((level) => ({ ...level, description: `${level.description} Revised.`, points: level.rank }))
            .reverse();

        expect(() => assertApprovedRubricIdsStable(approved, edited)).not.toThrow();
    });

    it('allows the initial unapproved rubric to choose a different id set', () => {
        const initialDraft = buildRubricDraft(inputFromDefault(), 1, 'instructor-1');
        const reshaped = inputWithSixCriteria();

        expect(() => assertApprovedRubricIdsStable(initialDraft, reshaped)).not.toThrow();
    });
});
