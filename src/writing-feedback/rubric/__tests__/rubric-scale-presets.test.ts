/**
 * Rubric scale preset tests — the levels a rubric gets when its source states none
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for scale presets, their bands, and the suggestion rule.
 */

import { parseScaleChoice, scaleBands, scaleLevels, suggestScale } from '../rubric-presets';

describe('scale presets', () => {
    it('gives each preset its levels, weakest first', () => {
        expect(scaleLevels('four_level').map((level) => level.label)).toEqual(['Weak', 'Developing', 'Proficient', 'Exemplary']);
        expect(scaleLevels('three_level_met').map((level) => level.label)).toEqual(['Not met', 'Partly met', 'Met']);
        expect(scaleLevels('ubc_percent_bands').map((level) => level.rank)).toEqual([1, 2, 3, 4, 5]);
    });

    it('spreads named scales evenly and keeps UBC bands as percentage shares', () => {
        expect(scaleBands('three_level_met', 9, scaleLevels('three_level_met'))).toEqual({
            not_met: { min: 0, max: 3 }, partly_met: { min: 4, max: 6 }, met: { min: 7, max: 9 }
        });
        expect(scaleBands('ubc_percent_bands', 10, scaleLevels('ubc_percent_bands')).below_50).toEqual({ min: 0, max: 4.9 });
        expect(scaleBands('four_level', undefined, scaleLevels('four_level'))).toEqual({});
    });
});

describe('suggestScale', () => {
    it.each([
        ['a checklist', 'checklist', 'Tick each item.', 'three_level_met'],
        ['material in the UBC bands', 'weighted_list', 'Grades: 80-100% excellent, 68 to 79% good.', 'ubc_percent_bands'],
        ['anything else', 'breakdown_only', 'Introduction /5, Results /35', 'four_level']
    ])('suggests the right scale for %s', (_name, shape, material, expected) => {
        expect(suggestScale(shape, material)).toBe(expected);
    });
});

describe('parseScaleChoice', () => {
    it('reads the choices, with absent meaning suggested', () => {
        expect(parseScaleChoice(undefined)).toBe('suggested');
        expect(parseScaleChoice('three_level_met')).toBe('three_level_met');
        expect(() => parseScaleChoice('ten_level')).toThrow();
    });
});
