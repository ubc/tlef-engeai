import { buildDefaultWritingRubric, DEFAULT_WRITING_CRITERIA, DEFAULT_WRITING_LEVELS } from '../default-rubric-profile';

describe('default writing rubric profile', () => {
    it('uses the three SFL metafunction criteria', () => {
        expect(DEFAULT_WRITING_CRITERIA.map((criterion) => criterion.id)).toEqual([
            'organization',
            'content',
            'interpersonal_positioning'
        ]);
    });

    it('carries weights summing to one hundred', () => {
        const rubric = buildDefaultWritingRubric();
        const weights = rubric.criteria.map((criterion) => criterion.points ?? 0);
        expect(weights).toEqual([30, 40, 30]);
        expect(weights.reduce((total, weight) => total + weight, 0)).toBe(100);
    });

    it('gives every criterion a descriptor at every level', () => {
        const rubric = buildDefaultWritingRubric();
        rubric.criteria.forEach((criterion) => {
            DEFAULT_WRITING_LEVELS.forEach((level) => {
                const cell = criterion.cells?.[level.id];
                expect(cell).toBeDefined();
                expect(cell?.descriptor?.trim().length ?? 0).toBeGreaterThan(0);
            });
        });
    });

    it('returns detached copies so an editor cannot mutate the template', () => {
        const first = buildDefaultWritingRubric();
        first.criteria[0]!.cells!['weak']!.descriptor = 'changed';
        const second = buildDefaultWritingRubric();
        expect(second.criteria[0]!.cells!['weak']!.descriptor).not.toBe('changed');
    });
});
