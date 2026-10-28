/**
 * current-academic-period.test.ts
 *
 * Course selection opens only the academic period running today, or none, instead of the
 * seeded 2025W2 period (instructors) or every period (admins).
 */

import { currentAcademicPeriodId } from '../utils/current-academic-period';

const period = (id: string, startDate: string, endDate: string) => ({ id, startDate, endDate });

// Periods are entered as calendar dates and stored as midnight UTC
const w2 = period('2025W2', '2026-01-06T00:00:00.000Z', '2026-04-30T00:00:00.000Z');
const w1 = period('2026W1', '2026-09-08T00:00:00.000Z', '2026-12-18T00:00:00.000Z');

describe('currentAcademicPeriodId', () => {
    it('returns the period whose dates contain today', () => {
        expect(currentAcademicPeriodId([w2, w1], new Date(2026, 9, 19))).toBe('2026W1');
    });

    it('returns null between periods', () => {
        expect(currentAcademicPeriodId([w2, w1], new Date(2026, 6, 1))).toBeNull();
    });

    it('counts the first and last day as inside the period', () => {
        expect(currentAcademicPeriodId([w2], new Date(2026, 0, 6, 0, 30))).toBe('2025W2');
        expect(currentAcademicPeriodId([w2], new Date(2026, 3, 30, 23, 30))).toBe('2025W2');
    });

    it('returns null the day after a period ends', () => {
        expect(currentAcademicPeriodId([w2], new Date(2026, 4, 1))).toBeNull();
    });

    it('prefers the most recently started period when two overlap', () => {
        const summer = period('2026S', '2026-05-01T00:00:00.000Z', '2026-09-30T00:00:00.000Z');
        expect(currentAcademicPeriodId([summer, w1], new Date(2026, 8, 15))).toBe('2026W1');
    });

    it('accepts Date values as well as serialized strings', () => {
        const p = { id: 'd', startDate: new Date('2026-10-01T00:00:00.000Z'), endDate: new Date('2026-10-31T00:00:00.000Z') };
        expect(currentAcademicPeriodId([p], new Date(2026, 9, 19))).toBe('d');
    });

    it('returns null with no periods', () => {
        expect(currentAcademicPeriodId([], new Date(2026, 9, 19))).toBeNull();
    });
});
