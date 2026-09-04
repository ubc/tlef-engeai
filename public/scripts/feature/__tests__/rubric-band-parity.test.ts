/**
 * rubric-band-parity.test.ts
 *
 * `spaceBandsEvenly` exists twice: once in src/writing-feedback/rubric-bands.ts for
 * the seeded profiles and suggested grading, and again in the grid module because
 * the browser bundle cannot import from src/. The band the server seeds and the band
 * the browser derives must be the same band, and until now nothing checked that --
 * the backend suite's docstring claimed to pin both mirrors while importing only one.
 *
 * @author: @rdschrs
 */

import { earnedLevelFor as backendEarned, spaceBandsEvenly as backendBands } from '../../../../src/writing-feedback/rubric-bands';
import { earnedLevelFor as browserEarned, spaceBandsEvenly as browserBands, formatBand, parseBand } from '../writing-feedback-grid';
import type { RubricLevel } from '../writing-feedback-shared';

const FOUR: RubricLevel[] = [
    { id: 'weak', label: 'Weak', description: 'd', rank: 1 },
    { id: 'developing', label: 'Developing', description: 'd', rank: 2 },
    { id: 'proficient', label: 'Proficient', description: 'd', rank: 3 },
    { id: 'exemplary', label: 'Exemplary', description: 'd', rank: 4 }
];

function levelsOf(count: number): RubricLevel[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `l${index + 1}`,
        label: `Level ${index + 1}`,
        description: 'd',
        rank: index + 1
    }));
}

describe('the two spaceBandsEvenly copies agree', () => {
    it('produces identical bands across every level count and a wide range of weights', () => {
        for (let count = 2; count <= 8; count += 1) {
            const levels = levelsOf(count);
            [0, 1, 2, 3, 5, 7, 10, 30, 45, 100, 1000].forEach((points) => {
                expect(browserBands(points, levels)).toEqual(backendBands(points, levels as never));
            });
        }
    });
});

describe('band display round-trips', () => {
    it('shows a collapsed band as one number', () => {
        expect(formatBand({ min: 22, max: 22 })).toBe('22');
    });

    it('shows a real band as an inclusive range', () => {
        expect(formatBand({ min: 16, max: 22 })).toBe('16–22');
    });

    it('survives format then parse without flattening', () => {
        const band = { min: 16, max: 22 };
        expect(parseBand(formatBand(band))).toEqual(band);
    });

    it('round-trips every band the spread rule produces', () => {
        Object.values(browserBands(30, FOUR)).forEach((band) => {
            expect(parseBand(formatBand(band))).toEqual({ min: band.min, max: band.max });
        });
    });
});

describe('the two earnedLevelFor copies agree', () => {
    it('awards the same level for every grade a criterion can carry', () => {
        for (let count = 2; count <= 8; count += 1) {
            const levels = levelsOf(count);
            [1, 2, 3, 5, 7, 10, 30, 45, 100].forEach((points) => {
                const criterion = { id: 'c', label: 'C', description: 'd', points };
                // Halves as well as whole points: the review page admits 0.01 steps, and a
                // grade landing between two integer bands is exactly where the two copies
                // could disagree.
                for (let grade = 0; grade <= points; grade += 0.5) {
                    expect(browserEarned(criterion, levels, grade)?.id)
                        .toBe(backendEarned(criterion as never, levels as never, grade)?.id);
                }
            });
        }
    });

    it('agrees on authored, sparse, and collapsed cells alike', () => {
        const levels = levelsOf(4);
        const shapes: Array<{ cells?: Record<string, { min: number; max: number }> }> = [
            { cells: { l1: { min: 0, max: 7 }, l2: { min: 8, max: 15 }, l3: { min: 16, max: 22 }, l4: { min: 23, max: 30 } } },
            { cells: { l3: { min: 16, max: 22 } } },
            { cells: { l1: { min: 0, max: 0 }, l2: { min: 10, max: 10 }, l3: { min: 20, max: 20 }, l4: { min: 30, max: 30 } } },
            {}
        ];
        shapes.forEach((shape) => {
            const criterion = { id: 'c', label: 'C', description: 'd', points: 30, ...shape };
            for (let grade = 0; grade <= 33; grade += 0.5) {
                expect(browserEarned(criterion, levels, grade)?.id)
                    .toBe(backendEarned(criterion as never, levels as never, grade)?.id);
            }
        });
    });
});
