import { buildDefaultWritingRubric } from '../default-rubric-profile';
import {
    lensesForAssignment,
    parseLens,
    rubricFieldPaths,
    selectRubric,
    WRITING_FEEDBACK_LENSES
} from '../rubric-lens';
import type { WritingAssignment } from '../contracts';

function assignment(overrides: Partial<WritingAssignment> = {}): WritingAssignment {
    const now = new Date('2026-08-20T00:00:00.000Z');
    return {
        id: 'assignment-1',
        courseId: 'course-1',
        title: 'Lab 1',
        profileVersion: 'writing-feedback-v1',
        rubricSource: 'internal_profile',
        rubric: buildDefaultWritingRubric('platform', now),
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

describe('rubric lens mapping', () => {
    it('lists both lenses', () => {
        expect(WRITING_FEEDBACK_LENSES).toEqual(['linguistic', 'technical']);
    });

    it('maps each lens to its assignment fields', () => {
        expect(rubricFieldPaths('linguistic')).toEqual({
            approved: 'rubric',
            draft: 'rubricDraft',
            history: 'rubricHistory'
        });
        expect(rubricFieldPaths('technical')).toEqual({
            approved: 'technicalRubric',
            draft: 'technicalRubricDraft',
            history: 'technicalRubricHistory'
        });
    });

    it('selects the linguistic rubric, treating a draft-status rubric as the draft', () => {
        const selected = selectRubric(assignment(), 'linguistic');
        expect(selected.approved).toBeUndefined();
        expect(selected.draft?.status).toBe('draft');
        expect(selected.history).toEqual([]);
    });

    it('selects the technical rubric independently of the linguistic one', () => {
        const technicalDraft = buildDefaultWritingRubric('platform', new Date('2026-08-20T00:00:00.000Z'));
        const selected = selectRubric(assignment({ technicalRubricDraft: technicalDraft }), 'technical');
        expect(selected.draft).toBe(technicalDraft);
        expect(selected.approved).toBeUndefined();
    });

    it('asks for only the linguistic lens on an ordinary assignment', () => {
        expect(lensesForAssignment(assignment())).toEqual(['linguistic']);
    });

    it('asks for both lenses on a lab report', () => {
        expect(lensesForAssignment(assignment({ isLabReport: true }))).toEqual(['linguistic', 'technical']);
    });

    it('parses a lens and defaults to linguistic', () => {
        expect(parseLens('technical')).toBe('technical');
        expect(parseLens(undefined)).toBe('linguistic');
    });

    it('rejects an unknown lens', () => {
        expect(() => parseLens('vibes')).toThrow('Unknown feedback lens');
    });
});
