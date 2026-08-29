/**
 * Canvas rubric mapping — the instructor's Canvas rubric as a seedable draft grid
 *
 * Turns the rubric authored in Canvas into the {@link ImportedRubricShape} that
 * {@link seedRubricForLens} uses as a new draft's starting grid. Nothing here approves a rubric
 * or writes to Canvas; the result is an unapproved draft an instructor edits and approves.
 *
 * **Two shapes that do not line up.** Canvas defines ratings *per criterion*, so one row may
 * carry five and the next three. EngE-AI's grid has one shared set of levels (its columns) and
 * a sparse per-criterion `cells` map. Reconciling them needs a rule, and the rule is stated
 * rather than inferred: a canonical column set is taken from the richest row, and every row's
 * ratings are aligned to it from the weakest end, leaving the strongest columns empty for a row
 * that carries fewer. The common case — a Canvas rubric whose rows all share one rating scale —
 * maps exactly, with no empty cells at all.
 *
 * **It can refuse.** The grid contract allows 1–10 criteria and 2–8 levels; a Canvas rubric
 * outside that cannot be represented, and this returns `null` so the caller seeds the built-in
 * profile instead of importing something malformed.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Maps a Canvas rubric onto the EngE-AI rubric grid, or refuses.
 */

import type {
    CanvasImportedRubric,
    CanvasRubricRating,
    CanvasRubricRow,
    WritingRubricCell,
    WritingRubricCriterion,
    WritingRubricLevel
} from './contracts';
import type { ImportedRubricShape } from './rubric-seed';

/** Grid limits from `writingRubricDraftInputSchema`; a rubric outside them cannot be seeded. */
const MIN_LEVELS = 2;
const MAX_LEVELS = 8;
const MAX_CRITERIA = 10;

/** Field caps from the same schema, applied here so a mapped rubric always validates. */
const MAX_CRITERION_LABEL = 80;
const MAX_LEVEL_LABEL = 60;
const MAX_TEXT = 1200;
const MAX_DESCRIPTOR = 400;
const MAX_POINTS = 1000;

/**
 * Text seeded where Canvas carries no equivalent.
 *
 * Canvas's `long_description` is optional and routinely empty, while the grid schema requires a
 * non-empty description on every criterion and level — an empty one blocks the draft from being
 * saved at all. Repeating the name instead would print the same words twice in the editor and
 * read as a bug, so these follow the house style of {@link SFL_PROFILE_PLACEHOLDERS}: a plain
 * imperative that is obviously staff's to replace.
 *
 * Exported so an approval gate can reject them verbatim, as the SFL profile's placeholders are.
 */
export const CANVAS_IMPORT_PLACEHOLDERS = {
    criterionDescription: 'Describe what this criterion assesses.',
    levelDescription: 'Describe what this performance level means.'
} as const;

/**
 * slugify — derives a schema-valid id from Canvas text.
 *
 * The schema requires `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$`, which a Canvas criterion id (often
 * `_1234`) does not satisfy, so the visible name is the better source. `fallbackIndex` covers
 * text that slugifies to nothing at all — CJK names, or a row called "1".
 */
function slugify(text: string, fallbackIndex: number): string {
    const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_{2,}/g, '_')
        .replace(/^[^a-z]+/, '')
        .slice(0, 64)
        .replace(/_+$/, '');
    return slug || `item_${fallbackIndex + 1}`;
}

/** Makes ids unique within one rubric, since the schema rejects duplicates. */
function uniqueSlug(candidate: string, taken: Set<string>): string {
    if (!taken.has(candidate)) {
        taken.add(candidate);
        return candidate;
    }
    for (let suffix = 2; ; suffix += 1) {
        const next = `${candidate.slice(0, 60)}_${suffix}`;
        if (!taken.has(next)) {
            taken.add(next);
            return next;
        }
    }
}

/** Trims to a cap, and substitutes when the schema demands non-empty text Canvas left blank. */
function boundedText(value: string | undefined, cap: number, fallback: string): string {
    const trimmed = (value ?? '').trim().replace(/\s+/g, ' ');
    return (trimmed || fallback).slice(0, cap);
}

function pointsOrUndefined(value: number | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.min(value, MAX_POINTS)
        : undefined;
}

/** Weakest first, so index 0 is always the lowest band and rank 1 means the same everywhere. */
function weakestFirst(ratings: CanvasRubricRating[]): CanvasRubricRating[] {
    return [...ratings].sort((left, right) => (left.points ?? 0) - (right.points ?? 0));
}

/**
 * canvasRubricToSeedShape — the Canvas rubric as a draft grid, or `null` if it cannot be one.
 *
 * @param rubric - Rubric read from Canvas, unmodified
 * @returns Criteria and levels ready to seed a draft, or `null` when out of contract
 */
export function canvasRubricToSeedShape(rubric: CanvasImportedRubric | null | undefined): ImportedRubricShape | null {
    const rows = (rubric?.rows ?? []).filter((row) => row.ratings.length > 0);
    if (rows.length === 0 || rows.length > MAX_CRITERIA) return null;

    // The richest row defines the columns; anything wider than the contract cannot be seeded.
    const widest = rows.reduce((best, row) => (row.ratings.length > best.ratings.length ? row : best), rows[0]);
    const columnCount = widest.ratings.length;
    if (columnCount < MIN_LEVELS || columnCount > MAX_LEVELS) return null;

    const levelIds = new Set<string>();
    const levels: WritingRubricLevel[] = weakestFirst(widest.ratings).map((rating, index) => {
        const label = boundedText(rating.label, MAX_LEVEL_LABEL, `Level ${index + 1}`);
        return {
            id: uniqueSlug(slugify(rating.label || `level_${index + 1}`, index), levelIds),
            label,
            description: boundedText(rating.description, MAX_TEXT, CANVAS_IMPORT_PLACEHOLDERS.levelDescription),
            rank: index + 1,
            ...(pointsOrUndefined(rating.points) !== undefined ? { points: pointsOrUndefined(rating.points) } : {})
        };
    });

    const criterionIds = new Set<string>();
    const criteria: WritingRubricCriterion[] = rows.map((row, rowIndex) => {
        const label = boundedText(row.label, MAX_CRITERION_LABEL, `Criterion ${rowIndex + 1}`);
        return {
            id: uniqueSlug(slugify(row.label || `criterion_${rowIndex + 1}`, rowIndex), criterionIds),
            label,
            description: boundedText(row.description, MAX_TEXT, CANVAS_IMPORT_PLACEHOLDERS.criterionDescription),
            // Canvas's per-criterion weight now has a home: the grid model carries row points.
            ...(pointsOrUndefined(row.points) !== undefined ? { points: pointsOrUndefined(row.points) } : {}),
            cells: buildCells(row, levels)
        };
    });

    return { criteria, levels };
}

/**
 * Aligns one row's ratings to the shared columns, weakest to weakest.
 *
 * A row with fewer ratings than the rubric has columns leaves its strongest columns absent,
 * which the grid renders as empty cells. Canvas gives no way to know *which* distinction a
 * shorter row is missing, so this does not guess at the middle — the instructor fills the gaps
 * while the draft is still unapproved.
 */
function buildCells(row: CanvasRubricRow, levels: WritingRubricLevel[]): Record<string, WritingRubricCell> {
    const cells: Record<string, WritingRubricCell> = {};
    weakestFirst(row.ratings).forEach((rating, index) => {
        const level = levels[index];
        if (!level) return;
        // A Canvas rating is a single value, not a band, so the band has no width to spread.
        const points = pointsOrUndefined(rating.points) ?? 0;
        // Only a descriptor Canvas actually supplied. `descriptor` is optional, and the grid
        // already prompts "Enter a description" on a cell that has none — which is the honest
        // state here. Falling back to the rating name would just repeat the column header.
        const descriptor = (rating.description ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_DESCRIPTOR);
        cells[level.id] = {
            min: points,
            max: points,
            ...(descriptor ? { descriptor } : {})
        };
    });
    return cells;
}
