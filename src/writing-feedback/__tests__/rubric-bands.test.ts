/**
 * @fileoverview Pins band derivation, and pins it identically for both mirrors. A cell
 * awards an inclusive range, so each level takes a contiguous slice of the criterion's
 * weight: the slices leave no gaps, the lowest starts at zero, and the highest ends on
 * the weight. A weight too small to separate every level makes adjacent levels share a
 * band rather than producing an invalid one.
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
    it('gives each level a contiguous band of a 30-point criterion', () => {
        expect(spaceBandsEvenly(30, levels)).toEqual({
            weak: { min: 0, max: 7 },
            developing: { min: 8, max: 15 },
            proficient: { min: 16, max: 22 },
            exemplary: { min: 23, max: 30 }
        });
    });

    it('starts at zero and tops out at the full weight', () => {
        const bands = spaceBandsEvenly(30, levels);
        expect(bands.weak.min).toBe(0);
        expect(bands.exemplary.max).toBe(30);
    });

    it('leaves no gap between one band and the next', () => {
        const bands = spaceBandsEvenly(100, levels);
        const ordered = [bands.weak, bands.developing, bands.proficient, bands.exemplary];
        ordered.slice(1).forEach((band, index) => {
            expect(band.min).toBe(ordered[index].max + 1);
        });
    });

    it('never produces a band that starts above where it ends', () => {
        // The schema rejects min > max outright, so this must hold at every weight.
        for (let points = 0; points <= 60; points += 1) {
            Object.values(spaceBandsEvenly(points, levels)).forEach((band) => {
                expect(band.min).toBeLessThanOrEqual(band.max);
            });
        }
    });

    it('collapses adjacent bands when the weight cannot separate every level', () => {
        // D-065: whole points cannot be divided more finely than one apiece. Two
        // points across four levels must share, and sharing is not an error.
        expect(spaceBandsEvenly(2, levels)).toEqual({
            weak: { min: 0, max: 0 },
            developing: { min: 1, max: 1 },
            proficient: { min: 1, max: 1 },
            exemplary: { min: 2, max: 2 }
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
