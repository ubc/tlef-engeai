/**
 * Criterion assessment tests — the model/staff partition and its default
 *
 * @author: @rdschrs
 * @date: 2026-09-15
 * @version: 1.0.0
 * @description: Covers the absent-means-model default and both partition helpers.
 */

import type { WritingRubricDefinition } from '../contracts';
import { buildDefaultWritingRubric } from '../default-rubric-profile';
import {
    assertStaffCriteriaWritten,
    isStaffAssessed,
    modelAssessedCriteria,
    staffAssessedCriteria
} from '../criterion-assessment';
import type { StaffSummaryEdit } from '../contracts';

function rubricWith(assessedBy: Array<'model' | 'staff' | undefined>): WritingRubricDefinition {
    const rubric = buildDefaultWritingRubric('platform', new Date('2026-09-15T00:00:00.000Z'));
    rubric.criteria = rubric.criteria.map((criterion, index) => ({
        ...criterion,
        ...(assessedBy[index] ? { assessedBy: assessedBy[index] } : {})
    }));
    return rubric;
}

describe('criterion assessment source', () => {
    it('treats a criterion with no assessedBy as model-assessed', () => {
        const rubric = rubricWith([undefined, undefined, undefined]);
        expect(rubric.criteria.some(isStaffAssessed)).toBe(false);
        expect(modelAssessedCriteria(rubric)).toHaveLength(rubric.criteria.length);
        expect(staffAssessedCriteria(rubric)).toHaveLength(0);
    });

    it('partitions an explicitly marked rubric and preserves rubric order', () => {
        const rubric = rubricWith(['model', 'staff', undefined]);
        expect(modelAssessedCriteria(rubric).map((criterion) => criterion.id))
            .toEqual(['organization', 'interpersonal_positioning']);
        expect(staffAssessedCriteria(rubric).map((criterion) => criterion.id)).toEqual(['content']);
    });

    it('returns every criterion to staff when none is model-assessed', () => {
        const rubric = rubricWith(['staff', 'staff', 'staff']);
        expect(modelAssessedCriteria(rubric)).toHaveLength(0);
        expect(staffAssessedCriteria(rubric)).toHaveLength(3);
    });
});

describe('assertStaffCriteriaWritten', () => {
    const edit = (explanations: Array<[string, string]>): StaffSummaryEdit => ({
        lens: 'linguistic',
        feedbackRunId: 'run-1',
        strengths: [],
        criterionExplanations: explanations.map(([criterion, explanation]) => ({ criterion, explanation }))
    });

    it('passes a rubric with no staff-assessed criteria, written or not', () => {
        expect(() => assertStaffCriteriaWritten(rubricWith([undefined, undefined, undefined]), undefined)).not.toThrow();
    });

    it('passes when every staff-assessed criterion carries text', () => {
        expect(() => assertStaffCriteriaWritten(
            rubricWith([undefined, 'staff', 'staff']),
            edit([['content', 'Written.'], ['interpersonal_positioning', 'Also written.']])
        )).not.toThrow();
    });

    it('refuses an unwritten staff criterion and names it', () => {
        expect(() => assertStaffCriteriaWritten(rubricWith([undefined, 'staff', undefined]), undefined))
            .toThrow(/"Content" is still blank/);
    });

    it('treats whitespace as unwritten', () => {
        expect(() => assertStaffCriteriaWritten(rubricWith([undefined, 'staff', undefined]), edit([['content', '   ']])))
            .toThrow(/"Content" is still blank/);
    });

    it('names every blank criterion when more than one is unwritten', () => {
        expect(() => assertStaffCriteriaWritten(rubricWith([undefined, 'staff', 'staff']), edit([['content', 'Written.']])))
            .toThrow(/"Interpersonal Positioning" is still blank/);
    });

    it('passes when the lens has no approved rubric', () => {
        expect(() => assertStaffCriteriaWritten(undefined, undefined)).not.toThrow();
    });
});
