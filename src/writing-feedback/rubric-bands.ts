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
 * spaceBandsEvenly - divides a criterion's weight into a contiguous band per level.
 *
 * Each level takes a slice of the weight, the slices touch so every whole point from
 * zero to the weight falls in exactly one band, and the top level's band ends on the
 * weight so rounding never loses a point. A weight smaller than the number of levels
 * cannot give each level its own slice — whole points cannot be divided more finely
 * than one apiece — so adjacent levels share a band. That is a real state, not an
 * error, but callers that render these should warn staff it has happened.
 *
 * @param points - Maximum points the criterion contributes
 * @param levels - Levels of the rubric, in any order; rank decides the sequence
 * @returns Bands per level id, or an empty map when the criterion carries no weight
 */
export function spaceBandsEvenly(
    points: number,
    levels: ReadonlyArray<WritingRubricLevel>
): Record<WritingLevelId, WritingRubricCell> {
    if (!points || points <= 0 || levels.length === 0) return {};

    const ordered = [...levels].sort((left, right) => left.rank - right.rank);
    const bands: Record<WritingLevelId, WritingRubricCell> = {};
    let previousTop = -1;

    ordered.forEach((level, index) => {
        // The top level ends on the weight exactly; the rest take their proportional
        // share rounded down, which is what makes the slices whole points.
        const top = index === ordered.length - 1
            ? points
            : Math.floor((points * (index + 1)) / ordered.length);
        // Where the weight is too small to advance, the band collapses onto its
        // neighbour's value rather than starting above where it ends -- which the
        // draft schema rejects outright.
        const min = Math.min(previousTop + 1, top);
        bands[level.id] = { min, max: top };
        previousTop = top;
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

/**
 * earnedLevelFor - the level a staff-final grade falls in.
 *
 * Resolves through {@link resolveBand}, so a criterion that authored no cells still
 * awards a level rather than none: `cells` is sparse, and reading it directly left
 * every unbanded criterion unmarked wherever this answer is drawn.
 *
 * Bands do not always cover the criterion. An imported rubric can leave gaps, a rubric
 * stored under the superseded single-value rule has `min === max` at every level, and a
 * grade may be fractional. In each case the points fall in no band at all, so the answer
 * clamps: the highest-ranked level the points reach, or the lowest banded level when
 * they reach none. No band is invented — every band here is one the rubric page already
 * shows staff.
 *
 * @param criterion - Criterion the grade was awarded against
 * @param levels - Complete level set of the rubric
 * @param points - Staff-final points awarded for this criterion
 * @returns The level earned, or undefined when the criterion has no bands to compare
 */
export function earnedLevelFor(
    criterion: WritingRubricCriterion,
    levels: ReadonlyArray<WritingRubricLevel>,
    points: number
): WritingRubricLevel | undefined {
    if (!Number.isFinite(points)) return undefined;

    const banded = [...levels]
        .sort((left, right) => left.rank - right.rank)
        .map((level) => ({ level, band: resolveBand(criterion, level.id, levels) }))
        .filter((entry): entry is { level: WritingRubricLevel; band: WritingRubricCell } =>
            entry.band !== undefined);
    if (!banded.length) return undefined;

    const containing = banded.find((entry) => points >= entry.band.min && points <= entry.band.max);
    if (containing) return containing.level;

    // No band contains the points, so award the highest level they reach. Below every
    // band, that is the lowest level the criterion offers.
    const reached = banded.filter((entry) => points >= entry.band.min);
    return reached.length ? reached[reached.length - 1].level : banded[0].level;
}
