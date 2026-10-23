/**
 * Rubric presets — scale presets for rubrics without levels, and the optional criterion library
 *
 * @author: EngE-AI Team
 * @date: 2026-10-19
 * @version: 1.0.0
 * @description: Scale presets and the suggestion rule; optional assignment-specific criterion templates.
 */

import type { WritingRubricCell, WritingRubricLevel, WritingRubricCriterion } from '../contracts';
import { DEFAULT_WRITING_LEVELS } from './default-rubric-profile';
import { spaceBandsEvenly } from './rubric-bands';

/*
 * Rubric scale presets — the rating levels a rubric gets when its source states none
 *
 * Many instructors grade with weighted criteria or a checklist and never write rating levels.
 * A marking grid needs at least two, so such a rubric gets one of these scales. The scale is
 * data, never the model's: staff choose it, or a fixed rule suggests one. Bands are derived
 * from each criterion's points, evenly for the named scales and from the percentage ranges
 * for the UBC bands.
 */

/** A named scale. `suggested` asks the fixed rule to pick one. */
export type ScalePresetId = 'four_level' | 'three_level_met' | 'ubc_percent_bands';
export type ScaleChoice = ScalePresetId | 'suggested';

export const SCALE_CHOICES: ReadonlyArray<ScaleChoice> = ['suggested', 'four_level', 'three_level_met', 'ubc_percent_bands'];

/** Percentage ranges for the UBC bands, weakest first, as instructors write them. */
const UBC_BANDS: ReadonlyArray<{ id: string; label: string; min: number; max: number }> = [
    { id: 'below_50', label: '<50%', min: 0, max: 49 },
    { id: 'pct_50_54', label: '50–54%', min: 50, max: 54 },
    { id: 'pct_55_67', label: '55–67%', min: 55, max: 67 },
    { id: 'pct_68_79', label: '68–79%', min: 68, max: 79 },
    { id: 'pct_80_100', label: '80–100%', min: 80, max: 100 }
];

/** A scale's name as staff see it, for notes and the scale picker. */
export const SCALE_NAMES: Record<ScalePresetId, string> = {
    four_level: 'Weak / Developing / Proficient / Exemplary',
    three_level_met: 'Not met / Partly met / Met',
    ubc_percent_bands: 'UBC percentage bands (<50% to 80–100%)'
};

/**
 * scaleLevels - the levels a preset gives a grid, weakest first.
 *
 * @param preset - The scale
 * @returns Fresh level objects
 */
export function scaleLevels(preset: ScalePresetId): WritingRubricLevel[] {
    if (preset === 'four_level') return DEFAULT_WRITING_LEVELS.map((level) => ({ ...level }));
    if (preset === 'three_level_met') {
        return [
            { id: 'not_met', label: 'Not met', description: 'The criterion is not met.', rank: 1 },
            { id: 'partly_met', label: 'Partly met', description: 'The criterion is met in part.', rank: 2 },
            { id: 'met', label: 'Met', description: 'The criterion is fully met.', rank: 3 }
        ];
    }
    return UBC_BANDS.map((band, index) => ({
        id: band.id,
        label: band.label,
        description: `Work in the ${band.label} range.`,
        rank: index + 1
    }));
}

/**
 * scaleBands - each level's points range for one criterion on a preset scale.
 *
 * The UBC bands keep their percentage ranges as shares of the criterion's points; the named
 * scales split the points evenly, as "Space points evenly" does.
 *
 * @param preset - The scale
 * @param points - The criterion's points
 * @param levels - The levels `scaleLevels` returned for the preset
 * @returns Bands keyed by level id; empty when the criterion has no points
 */
export function scaleBands(
    preset: ScalePresetId,
    points: number | undefined,
    levels: ReadonlyArray<WritingRubricLevel>
): Record<string, WritingRubricCell> {
    if (!points || points <= 0) return {};
    if (preset !== 'ubc_percent_bands') return spaceBandsEvenly(points, levels);
    const round2 = (value: number): number => Math.round(value * 100) / 100;
    return Object.fromEntries(UBC_BANDS.map((band) => [
        band.id,
        { min: round2((band.min * points) / 100), max: round2((band.max * points) / 100) }
    ]));
}

/**
 * suggestScale - the scale a fixed rule picks for a rubric that states no levels.
 *
 * A checklist suggests Not met / Partly met / Met; material written in the UBC percentage
 * bands suggests those bands; anything else, EngE-AI's four levels.
 *
 * @param shape - How the rubric was laid out, as extraction reported it
 * @param material - The source's text, searched for UBC-style percentage bands
 * @returns The suggested scale
 */
export function suggestScale(shape: string, material: string): ScalePresetId {
    if (shape === 'checklist') return 'three_level_met';
    if (/\b80\s*(?:%\s*)?(?:-|–|to)\s*100\s*%/i.test(material) && /\b68\s*(?:%\s*)?(?:-|–|to)\s*79\s*%/i.test(material)) {
        return 'ubc_percent_bands';
    }
    return 'four_level';
}

/**
 * parseScaleChoice - validates an untrusted scale choice.
 *
 * @param value - Request value; absent means suggested
 * @returns The choice
 * @throws Error when the value names no known scale
 */
export function parseScaleChoice(value: unknown): ScaleChoice {
    if (value === undefined || value === null || value === '') return 'suggested';
    if (typeof value === 'string' && (SCALE_CHOICES as readonly string[]).includes(value)) return value as ScaleChoice;
    throw new Error('scale must be suggested, four_level, three_level_met, or ubc_percent_bands');
}

/*
 * Writing Feedback criterion library — optional assignment-specific rubric rows
 *
 * Provides neutral, data-only criterion templates that instructors may add to
 * a rubric draft. Nothing in this module silently scores or activates a criterion.
 */

/** Optional rubric criteria returned as fresh copies to prevent shared mutation. */
export const WRITING_CRITERION_LIBRARY: ReadonlyArray<WritingRubricCriterion> = [
    {
        id: 'task_constraints',
        label: 'Task Constraints',
        description: 'How completely the submission follows the assignment’s explicit format and scope requirements.'
    },
    {
        id: 'sources_referencing',
        label: 'Sources and Referencing',
        description: 'How effectively sources are attributed and the required citation or reference conventions are followed.',
        functionTag: 'organizational',
        sflDimension: 'Citation practice, attribution, reference-list structure, and source integration.'
    },
    {
        id: 'genre_staging',
        label: 'Genre Staging',
        description: 'How effectively the writing includes and orders the stages expected for this assignment.',
        functionTag: 'organizational',
        sflDimension: 'Assignment-specific stage presence, ordering, optionality, and repetition.'
    }
];

/**
 * listCriterionLibrary - returns detached optional criterion templates.
 *
 * @returns Fresh criterion objects safe for an editor to modify
 */
export function listCriterionLibrary(): WritingRubricCriterion[] {
    return WRITING_CRITERION_LIBRARY.map((criterion) => ({ ...criterion }));
}
