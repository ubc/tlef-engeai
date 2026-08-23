import { buildLabReportRubric, LAB_REPORT_CRITERIA, LAB_REPORT_LEVELS } from '../lab-report-profile';
import { writingRubricDraftInputSchema } from '../rubric-schema';

describe('lab report rubric profile', () => {
    it('uses the seven APSC 182 evaluation-form sections', () => {
        expect(LAB_REPORT_CRITERIA.map((criterion) => criterion.id)).toEqual([
            'report_presentation',
            'language',
            'abstract',
            'results_discussion',
            'conclusions',
            'references',
            'sample_calculations'
        ]);
    });

    it('carries the evaluation-form weights, summing to one hundred', () => {
        const rubric = buildLabReportRubric();
        const weights: number[] = rubric.criteria.map((criterion) => criterion.points ?? 0);
        expect(weights).toEqual([15, 5, 10, 45, 5, 5, 15]);
        expect(weights.reduce((total, weight) => total + weight, 0)).toBe(100);
    });

    it('ranks four levels contiguously from one', () => {
        expect(LAB_REPORT_LEVELS.map((level) => level.rank)).toEqual([1, 2, 3, 4]);
        expect(LAB_REPORT_LEVELS.every((level) => typeof level.points === 'number')).toBe(true);
    });

    it('builds an unapproved draft', () => {
        const rubric = buildLabReportRubric('platform', new Date('2026-08-20T00:00:00.000Z'));
        expect(rubric.status).toBe('draft');
        expect(rubric.version).toBe(1);
        expect(rubric.labContext).toBeUndefined();
    });

    it('passes the instructor rubric validation schema', () => {
        const rubric = buildLabReportRubric();
        const parsed = writingRubricDraftInputSchema.safeParse({
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
        expect(parsed.success).toBe(true);
    });

    it('returns detached copies so an editor cannot mutate the template', () => {
        const first = buildLabReportRubric();
        first.criteria[0]!.label = 'changed';
        expect(buildLabReportRubric().criteria[0]!.label).toBe('Report Presentation');
    });
});

describe('APSC 182 weights are data, not prose', () => {
    it('carries the evaluation form weights as points summing to 100', () => {
        const rubric = buildLabReportRubric('u', new Date());
        expect(rubric.criteria.map((c) => c.points)).toEqual([15, 5, 10, 45, 5, 5, 15]);
        expect(rubric.criteria.reduce((total, c) => total + (c.points ?? 0), 0)).toBe(100);
    });

    it('no longer states the weight inside the description', () => {
        const rubric = buildLabReportRubric('u', new Date());
        rubric.criteria.forEach((criterion) => {
            expect(criterion.description).not.toMatch(/\(\d+ points?\)/);
        });
    });

    it('gives every criterion a band at every level', () => {
        const rubric = buildLabReportRubric('u', new Date());
        rubric.criteria.forEach((criterion) => {
            rubric.levels.forEach((level) => {
                expect(criterion.cells?.[level.id]).toBeDefined();
            });
        });
    });
});
