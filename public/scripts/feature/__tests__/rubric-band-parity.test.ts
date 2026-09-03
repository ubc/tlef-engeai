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

import { spaceBandsEvenly as backendBands } from '../../../../src/writing-feedback/rubric-bands';
import { spaceBandsEvenly as browserBands, formatBand, parseBand } from '../writing-feedback-grid';
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
