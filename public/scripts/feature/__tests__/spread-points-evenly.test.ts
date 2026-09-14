/**
 * spread-points-evenly.test.ts
 *
 * "Spread points evenly" replaces bands, and autosave keeps whatever it produces within
 * seconds. These pin what it may and may not replace: the numbers only, never a rating's
 * title or description, and never the shape of a criterion Canvas rated more coarsely.
 */

import { respaceBandsEvenly } from '../writing-feedback-grid';
import type { RubricCriterion, RubricLevel } from '../writing-feedback-shared';

const LEVELS: RubricLevel[] = [
    { id: 'weak', label: 'Weak', description: 'd', rank: 1 },
    { id: 'developing', label: 'Developing', description: 'd', rank: 2 },
    { id: 'proficient', label: 'Proficient', description: 'd', rank: 3 },
    { id: 'exemplary', label: 'Exemplary', description: 'd', rank: 4 }
];

function criterion(id: string, points: number | undefined, cells?: RubricCriterion['cells']): RubricCriterion {
    return { id, label: id, description: 'd', points, ...(cells ? { cells } : {}) };
}

const FULL = criterion('full', 40, {
    weak: { min: 0, max: 2, label: 'No Attempt', descriptor: 'W' },
    developing: { min: 3, max: 30, label: 'Needs Improvement', descriptor: 'D' },
    proficient: { min: 31, max: 35, label: 'Satisfactory', descriptor: 'P' },
    exemplary: { min: 36, max: 40, label: 'Good', descriptor: 'E' }
});

describe('respaceBandsEvenly', () => {
    it('replaces the bands but keeps every rating title and description', () => {
        const [spread] = respaceBandsEvenly([FULL], LEVELS);
        expect(spread.cells).toEqual({
            weak: { min: 0, max: 10, label: 'No Attempt', descriptor: 'W' },
            developing: { min: 11, max: 20, label: 'Needs Improvement', descriptor: 'D' },
            proficient: { min: 21, max: 30, label: 'Satisfactory', descriptor: 'P' },
            exemplary: { min: 31, max: 40, label: 'Good', descriptor: 'E' }
        });
    });

    it('leaves the columns a shorter row does not use empty, as the grid shows them n/a', () => {
        // A Canvas criterion rated on three ratings where the widest row has four.
        const short = criterion('short', 30, {
            weak: { min: 0, max: 5, label: 'Missing', descriptor: 'M' },
            developing: { min: 6, max: 25, label: 'Partial', descriptor: 'P' },
            proficient: { min: 26, max: 30, label: 'Complete', descriptor: 'C' }
        });
        const [, spread] = respaceBandsEvenly([FULL, short], LEVELS);
        expect(Object.keys(spread.cells ?? {})).toEqual(['weak', 'developing', 'proficient']);
        expect(spread.cells).toEqual({
            weak: { min: 0, max: 10, label: 'Missing', descriptor: 'M' },
            developing: { min: 11, max: 20, label: 'Partial', descriptor: 'P' },
            proficient: { min: 21, max: 30, label: 'Complete', descriptor: 'C' }
        });
    });

    it('fills a column no criterion uses yet, since a just-added rating is still owed', () => {
        const three = LEVELS.slice(0, 3);
        const withNewColumn: RubricLevel[] = [...three, { id: 'new_rating', label: 'New rating', description: '', rank: 4 }];
        const row = criterion('row', 40, {
            weak: { min: 0, max: 10, descriptor: 'W' },
            developing: { min: 11, max: 25, descriptor: 'D' },
            proficient: { min: 26, max: 40, descriptor: 'P' }
        });
        const [spread] = respaceBandsEvenly([row], withNewColumn);
        expect(Object.keys(spread.cells ?? {})).toEqual(['weak', 'developing', 'proficient', 'new_rating']);
        expect(spread.cells?.new_rating).toEqual({ min: 31, max: 40 });
    });

    it('fills a gap in the middle of a row, which approval would refuse anyway', () => {
        const gapped = criterion('gapped', 40, {
            weak: { min: 0, max: 10, descriptor: 'W' },
            proficient: { min: 21, max: 30, descriptor: 'P' },
            exemplary: { min: 31, max: 40, descriptor: 'E' }
        });
        const [, spread] = respaceBandsEvenly([FULL, gapped], LEVELS);
        expect(Object.keys(spread.cells ?? {})).toEqual(['weak', 'developing', 'proficient', 'exemplary']);
        expect(spread.cells?.developing).toEqual({ min: 11, max: 20 });
    });

    it('leaves a criterion without points untouched', () => {
        const unweighted = criterion('unweighted', undefined, { weak: { min: 0, max: 3, descriptor: 'W' } });
        const [, spread] = respaceBandsEvenly([FULL, unweighted], LEVELS);
        expect(spread).toBe(unweighted);
    });

    it('does not modify the criteria it is given', () => {
        const before = JSON.stringify(FULL);
        respaceBandsEvenly([FULL], LEVELS);
        expect(JSON.stringify(FULL)).toBe(before);
    });
});
