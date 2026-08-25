/**
 * @fileoverview Pins band derivation, and pins it identically for both mirrors. A cell
 * awards one value, so each level takes a whole-point share of the criterion's weight and
 * the top level takes all of it. `min` and `max` are always equal; the pair survives only
 * so stored rubrics, the draft schema, and the PDF keep their existing shape.
 */

import { resolveBand, spaceBandsEvenly, totalRubricPoints } from '../rubric-bands';
import type { WritingRubricLevel } from '../contracts';

const levels: WritingRubricLevel[] = [
    { id: 'weak', label: 'Weak', description: 'd', rank: 1 },
    { id: 'developing', label: 'Developing', description: 'd', rank: 2 },
    { id: 'proficient', label: 'Proficient', description: 'd', rank: 3 },
    { id: 'exemplary', label: 'Exemplary', description: 'd', rank: 4 }
];

describe('spaceBandsEvenly', () => {
    it('gives each level a whole-point share of a 30-point criterion', () => {
        expect(spaceBandsEvenly(30, levels)).toEqual({
            weak: { min: 7, max: 7 },
            developing: { min: 15, max: 15 },
            proficient: { min: 22, max: 22 },
            exemplary: { min: 30, max: 30 }
        });
    });

    it('awards the full weight at the highest level', () => {
        // Rounding is absorbed at the top so a criterion always reaches its own weight.
        const bands = spaceBandsEvenly(45, levels);
        expect(bands.exemplary).toEqual({ min: 45, max: 45 });
    });

    it('always writes an equal pair, never a range', () => {
        for (const points of [1, 2, 5, 30, 45, 1000]) {
            for (const cell of Object.values(spaceBandsEvenly(points, levels))) {
                expect(cell.min).toBe(cell.max);
            }
        }
    });

    it('rises with each level and never falls back', () => {
        const bands = spaceBandsEvenly(45, levels);
        const ordered = levels.map((level) => bands[level.id]);
        ordered.slice(1).forEach((cell, index) => {
            expect(cell.max).toBeGreaterThanOrEqual(ordered[index].max);
        });
    });

    it('orders by rank, not array position', () => {
        const shuffled = [levels[3], levels[0], levels[2], levels[1]];
        expect(spaceBandsEvenly(30, shuffled)).toEqual(spaceBandsEvenly(30, levels));
    });

    it('returns an empty map when the criterion has no weight', () => {
        expect(spaceBandsEvenly(0, levels)).toEqual({});
    });

    it('repeats a value when the weight cannot separate every level', () => {
        // Awards are whole points, so a weight of 2 cannot give four levels four distinct
        // values. Repeating is the intended degradation, and the grid warns staff when a
        // weight cannot separate its levels.
        expect(spaceBandsEvenly(2, levels)).toEqual({
            weak: { min: 0, max: 0 },
            developing: { min: 1, max: 1 },
            proficient: { min: 1, max: 1 },
            exemplary: { min: 2, max: 2 }
        });
    });
});

describe('resolveBand', () => {
    it('prefers an authored band over a derived one', () => {
        const criterion = {
            id: 'organization', label: 'Organization', description: 'd', points: 30,
            cells: { proficient: { min: 18, max: 25, descriptor: 'Clear order.' } }
        };
        expect(resolveBand(criterion, 'proficient', levels))
            .toEqual({ min: 18, max: 25, descriptor: 'Clear order.' });
    });

    it('derives a band from the weight when none is authored', () => {
        const criterion = { id: 'organization', label: 'Organization', description: 'd', points: 30 };
        expect(resolveBand(criterion, 'weak', levels)).toEqual({ min: 7, max: 7 });
    });

    it('returns undefined when the criterion is ordinal only', () => {
        const criterion = { id: 'organization', label: 'Organization', description: 'd' };
        expect(resolveBand(criterion, 'weak', levels)).toBeUndefined();
    });

    it('returns undefined for a level the criterion deliberately omits', () => {
        const criterion = {
            id: 'language', label: 'Language', description: 'd', points: 5,
            cells: { exemplary: { min: 0, max: 5 } }
        };
        expect(resolveBand(criterion, 'weak', levels)).toBeUndefined();
    });
});

describe('totalRubricPoints', () => {
    it('sums the criterion weights', () => {
        expect(totalRubricPoints([
            { id: 'a', label: 'A', description: 'd', points: 30 },
            { id: 'b', label: 'B', description: 'd', points: 45 },
            { id: 'c', label: 'C', description: 'd', points: 25 }
        ])).toBe(100);
    });

    it('ignores criteria with no weight', () => {
        expect(totalRubricPoints([
            { id: 'a', label: 'A', description: 'd', points: 30 },
            { id: 'b', label: 'B', description: 'd' }
        ])).toBe(30);
    });
});
