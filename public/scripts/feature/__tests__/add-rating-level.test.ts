/**
 * add-rating-level.test.ts
 *
 * "Add a rating" appends a level whose description and points the grid gives staff no
 * control over. These pin that the appended level is one the client check and the server
 * draft schema both accept, whether or not the existing levels carry points.
 */

import { ADDED_RATING_DESCRIPTION, newRatingLevel } from '../writing-feedback-grid';
import type { RubricLevel } from '../writing-feedback-shared';
import { writingRubricDraftInputSchema } from '../../../../src/writing-feedback/rubric/rubric-schema';
import { buildLabReportRubric } from '../../../../src/writing-feedback/rubric/lab-report-profile';

const ORDINAL: RubricLevel[] = [
    { id: 'poor', label: 'Poor', description: 'd', rank: 1 },
    { id: 'good', label: 'Good', description: 'd', rank: 2 }
];

const SCALED: RubricLevel[] = [
    { id: 'weak', label: 'Weak', description: 'd', rank: 1, points: 0 },
    { id: 'strong', label: 'Strong', description: 'd', rank: 2, points: 3 }
];

describe('newRatingLevel', () => {
    it('gives the new level a description, since staff cannot write one', () => {
        expect(newRatingLevel('new_rating', 'New rating', ORDINAL).description).toBe(ADDED_RATING_DESCRIPTION);
    });

    it('ranks the new level after the existing ones', () => {
        expect(newRatingLevel('new_rating', 'New rating', ORDINAL).rank).toBe(3);
    });

    it('leaves points off when the existing levels have none', () => {
        expect(newRatingLevel('new_rating', 'New rating', ORDINAL)).not.toHaveProperty('points');
    });

    it('continues the scale when every existing level has points', () => {
        expect(newRatingLevel('new_rating', 'New rating', SCALED).points).toBe(4);
    });

    it('leaves points off when only some existing levels have them', () => {
        const mixed = [SCALED[0], ORDINAL[1]];
        expect(newRatingLevel('new_rating', 'New rating', mixed)).not.toHaveProperty('points');
    });
});

describe('a rubric with an added rating', () => {
    it('passes the server draft schema when the levels carry points', () => {
        // The built-in lab-report rubric is the one whose levels are scored 0-3.
        const rubric = buildLabReportRubric('staff-user', new Date('2026-10-14T00:00:00Z'));
        expect(rubric.levels.every((level) => typeof level.points === 'number')).toBe(true);
        const levels = [...rubric.levels, newRatingLevel('new_rating', 'New rating', rubric.levels)];
        const result = writingRubricDraftInputSchema.safeParse({ ...rubric, levels });
        expect(result.success ? [] : result.error.issues).toEqual([]);
    });

    it('passes the server draft schema when the levels are ordinal', () => {
        const rubric = buildLabReportRubric('staff-user', new Date('2026-10-14T00:00:00Z'));
        const ordinal = rubric.levels.map(({ points: _points, ...level }) => level);
        const levels = [...ordinal, newRatingLevel('new_rating', 'New rating', ordinal)];
        const result = writingRubricDraftInputSchema.safeParse({ ...rubric, levels });
        expect(result.success ? [] : result.error.issues).toEqual([]);
    });
});
