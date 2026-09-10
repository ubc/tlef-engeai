import {
    buildDefaultSflContextProfile,
    buildDefaultWritingRubric,
    DEFAULT_WRITING_CRITERIA,
    DEFAULT_WRITING_LEVELS
} from '../default-rubric-profile';
import { writingRubricDraftInputSchema } from '../rubric-schema';

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

    // A fresh draft asks the questions instead of answering them: seeded prose was
    // indistinguishable from a colleague's answer, so it invited approval of a rubric
    // nobody had read. The guidance lives in the page's input placeholders instead.
    it('seeds every description field empty for staff to answer', () => {
        const rubric = buildDefaultWritingRubric();
        expect(rubric.title).toBe('');
        expect(rubric.task).toBe('');
        expect(rubric.audience).toBe('');
        expect(rubric.purpose).toBe('');
        expect(rubric.constraints).toEqual([]);

        const profile = buildDefaultSflContextProfile();
        expect(profile.genreLabel).toBe('');
        expect(profile.field).toBe('');
        expect(profile.tenor).toBe('');
        expect(profile.mode).toBe('');
        expect(profile.productionConditions).toBe('');
        expect(profile.taskRequirements).toEqual([]);
    });

    it('keeps the defaults that are usable as written', () => {
        const rubric = buildDefaultWritingRubric();
        expect(rubric.learningOutcomes.length).toBe(3);
        expect(rubric.gradingIntent).toContain('formative, evidence-based feedback');

        const profile = buildDefaultSflContextProfile();
        expect(profile.actualEvaluator).toBe('Instructor or teaching assistant.');
        expect(profile.stages.map((stage) => stage.label)).toEqual(['Main response']);
    });

    // Saving is the gate that makes the empty seeds safe: an untouched draft cannot
    // reach storage, so nothing can be approved without staff having answered step 1.
    it('produces a draft the save schema refuses until it is filled in', () => {
        const rubric = buildDefaultWritingRubric();
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
        expect(parsed.success).toBe(false);
    });

    it('returns detached copies so an editor cannot mutate the template', () => {
        const first = buildDefaultWritingRubric();
        first.criteria[0]!.cells!['weak']!.descriptor = 'changed';
        const second = buildDefaultWritingRubric();
        expect(second.criteria[0]!.cells!['weak']!.descriptor).not.toBe('changed');
    });
});
