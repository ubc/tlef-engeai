/**
 * Rubric bands — points ranges for one criterion across its performance levels
 *
 * A criterion carries a maximum weight; each level within it earns a band of that
 * weight rather than a single value, because staff award within a range. Bands are
 * either authored on the criterion or derived from the weight, and never overlap.
 *
 * @author: @rdschrs
 * @date: 2026-08-23
 * @version: 1.0.0
 * @description: Derives, spaces, and resolves per-criterion point bands.
 */

import type {
    WritingLevelId,
    WritingRubricCell,
    WritingRubricCriterion,
    WritingRubricLevel
} from './contracts';

/**
 * spaceBandsEvenly - partitions a criterion's weight across its levels.
 *
 * Each band ends at its share of the weight rounded to a whole point, and the next
 * begins one point above. A weight too small to spread leaves the top bands as single
 * values, which is correct rather than an error.
 *
 * @param points - Maximum points the criterion contributes
 * @param levels - Levels of the rubric, in any order; rank decides the sequence
 * @returns Band per level id, or an empty map when the criterion carries no weight
 */
export function spaceBandsEvenly(
    points: number,
    levels: ReadonlyArray<WritingRubricLevel>
): Record<WritingLevelId, WritingRubricCell> {
    if (!points || points <= 0 || levels.length === 0) return {};

    const ordered = [...levels].sort((left, right) => left.rank - right.rank);
    const bands: Record<WritingLevelId, WritingRubricCell> = {};

    ordered.forEach((level, index) => {
        // Each band begins one point above where the previous one ended, so bands
        // partition the weight without overlapping.
        const min = index === 0 ? 0 : Math.floor((points * index) / ordered.length) + 1;
        // The last band always ends exactly at the weight, so rounding never loses a point.
        const ceiling = index === ordered.length - 1
            ? points
            : Math.floor((points * (index + 1)) / ordered.length);
        // A small weight can push a band's floor past its natural ceiling; it then
        // collapses to a single value rather than inverting.
        bands[level.id] = { min, max: Math.max(min, ceiling) };
    });

    return bands;
}

/**
 * resolveBand - the band a criterion awards at one level.
 *
 * @param criterion - Criterion whose band is wanted
 * @param levelId - Level being resolved
 * @param levels - Complete level set, used only when the band must be derived
 * @returns The authored band, a derived one, or undefined when the criterion is
 *          ordinal only or deliberately omits this level
 */
export function resolveBand(
    criterion: WritingRubricCriterion,
    levelId: WritingLevelId,
    levels: ReadonlyArray<WritingRubricLevel>
): WritingRubricCell | undefined {
    // An authored cells map is exhaustive for that criterion: a missing key means the
    // criterion has no band at this level, not that one should be invented.
    if (criterion.cells) return criterion.cells[levelId];
    if (criterion.points === undefined) return undefined;
    return spaceBandsEvenly(criterion.points, levels)[levelId];
}

/**
 * totalRubricPoints - sum of the criterion weights.
 *
 * @param criteria - Criteria of one rubric
 * @returns Total points, counting only criteria that carry a weight
 */
export function totalRubricPoints(criteria: ReadonlyArray<WritingRubricCriterion>): number {
    return criteria.reduce((total, criterion) => total + (criterion.points ?? 0), 0);
}
