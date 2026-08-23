/**
 * @fileoverview Pins band derivation. Bands partition a criterion's weight across
 * its levels without overlapping, and collapse to single values when the weight is
 * too small to spread.
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
    it('partitions a 30-point criterion across four levels without overlap', () => {
        expect(spaceBandsEvenly(30, levels)).toEqual({
            weak: { min: 0, max: 7 },
            developing: { min: 8, max: 15 },
            proficient: { min: 16, max: 22 },
            exemplary: { min: 23, max: 30 }
        });
    });

    it('starts the lowest band at zero and ends the highest at the full weight', () => {
        const bands = spaceBandsEvenly(45, levels);
        expect(bands.weak.min).toBe(0);
        expect(bands.exemplary.max).toBe(45);
    });

    it('collapses middle bands to single values when the weight is small', () => {
        expect(spaceBandsEvenly(5, levels)).toEqual({
            weak: { min: 0, max: 1 },
            developing: { min: 2, max: 2 },
            proficient: { min: 3, max: 3 },
            exemplary: { min: 4, max: 5 }
        });
    });

    it('never overlaps two bands', () => {
        const bands = spaceBandsEvenly(45, levels);
        const ordered = levels.map((level) => bands[level.id]);
        ordered.slice(1).forEach((band, index) => {
            expect(band.min).toBeGreaterThan(ordered[index].max);
        });
    });

    it('orders by rank, not array position', () => {
        const shuffled = [levels[3], levels[0], levels[2], levels[1]];
        expect(spaceBandsEvenly(30, shuffled)).toEqual(spaceBandsEvenly(30, levels));
    });

    it('returns an empty map when the criterion has no weight', () => {
        expect(spaceBandsEvenly(0, levels)).toEqual({});
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
        expect(resolveBand(criterion, 'weak', levels)).toEqual({ min: 0, max: 7 });
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
