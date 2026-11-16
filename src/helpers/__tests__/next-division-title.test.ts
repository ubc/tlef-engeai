/**
 * next-division-title — default "Week N" / "Topic N" for a newly added division (#689).
 */

import { describe, expect, it } from '@jest/globals';
import { nextDivisionTitle } from '../next-division-title';

/** Builds minimal divisions with the given titles. */
function divisions(...titles: string[]): { title: string }[] {
    return titles.map((title) => ({ title }));
}

describe('nextDivisionTitle', () => {
    it('follows the last week, not a hash-derived id', () => {
        const weeks = divisions(...Array.from({ length: 11 }, (_, i) => `Week ${i + 1}`));
        expect(nextDivisionTitle(weeks, 'byWeek')).toBe('Week 12');
    });

    it('uses Topic for by-topic courses', () => {
        expect(nextDivisionTitle(divisions('Topic 1', 'Topic 2'), 'byTopic')).toBe('Topic 3');
    });

    it('starts at 1 for an empty course', () => {
        expect(nextDivisionTitle([], 'byWeek')).toBe('Week 1');
    });

    it('counts renamed divisions by position', () => {
        expect(nextDivisionTitle(divisions('Intro', 'Statics', 'Dynamics'), 'byWeek')).toBe('Week 4');
    });

    it('skips a number that is already taken after a deletion', () => {
        expect(nextDivisionTitle(divisions('Week 1', 'Week 2', 'Week 4'), 'byWeek')).toBe('Week 5');
    });

    it('ignores an outlier title left by the old bug', () => {
        expect(nextDivisionTitle(divisions('Week 1', 'Week 2', 'Week 2829'), 'byWeek')).toBe('Week 4');
    });

    it('matches existing titles regardless of case and spacing', () => {
        expect(nextDivisionTitle(divisions('week 1', ' Week  2 '), 'byWeek')).toBe('Week 3');
    });
});
