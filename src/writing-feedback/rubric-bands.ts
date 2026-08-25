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
 * spaceBandsEvenly - divides a criterion's weight into one value per level.
 *
 * Each level earns its share of the weight rounded to a whole point, with the top level
 * earning the full weight so rounding never loses a point. A weight smaller than the
 * number of levels forces adjacent levels onto the same value — whole points cannot be
 * divided more finely than one apiece — which is not an error, but callers that render
 * these should warn staff when a weight cannot separate its levels.
 *
 * @param points - Maximum points the criterion contributes
 * @param levels - Levels of the rubric, in any order; rank decides the sequence
 * @returns Points per level id, or an empty map when the criterion carries no weight
 */
export function spaceBandsEvenly(
    points: number,
    levels: ReadonlyArray<WritingRubricLevel>
): Record<WritingLevelId, WritingRubricCell> {
    if (!points || points <= 0 || levels.length === 0) return {};

    const ordered = [...levels].sort((left, right) => left.rank - right.rank);
    const bands: Record<WritingLevelId, WritingRubricCell> = {};

    ordered.forEach((level, index) => {
        // Each level earns its share of the weight; the top level earns all of it, so
        // rounding never loses a point. `min` and `max` are equal because a cell holds a
        // single award, not a range — the pair is kept only so stored rubrics keep their shape.
        const award = index === ordered.length - 1
            ? points
            : Math.floor((points * (index + 1)) / ordered.length);
        bands[level.id] = { min: award, max: award };
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
