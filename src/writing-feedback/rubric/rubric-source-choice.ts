/**
 * Rubric source choice — where the graded marking grid comes from
 *
 * The rubric page's first step lets staff choose the grid's source: the Canvas rubric the
 * assignment was imported with, EngE-AI's default, or (with rubric extraction) a rubric in
 * their own material. This module reports the graded grid's current source, re-seeds a grid
 * from Canvas or the default, and says whether replacing the current grid needs staff to
 * confirm first. The choice applies to the lens that carries the grade only.
 *
 * @author: EngE-AI Team
 * @date: 2026-10-09
 * @version: 1.0.0
 * @description: Reports and switches the source of an assignment's graded rubric grid.
 */

import type {
    WritingAssignment,
    WritingFeedbackLens,
    WritingRubricCriterion,
    WritingRubricDefinition,
    WritingRubricLevel
} from '../contracts';
import { rubricGridSource, selectRubric, storedGridSource, type StoredGridSource } from './rubric-lens';
import { seedRubricForLens } from './rubric-seed';
import { gradedLensFor } from '../review/staff-final-assessment';
import { rubricContentEquals } from './rubric-schema';
import { parseScaleChoice, type ScaleChoice } from './rubric-presets';

/**
 * Where a fill should take the graded grid from. `keep` leaves the grid as it is; `{ sourceId }`
 * names an uploaded file or paste holding the rubric.
 */
export type RubricSourceChoice = 'keep' | 'canvas' | 'default' | { sourceId: string; scale?: ScaleChoice };

/** Refusal messages staff can read and act on. Each is also a safe error prefix for routes. */
export const RUBRIC_SOURCE_ERRORS = {
    invalid: 'rubricFrom must be keep, canvas, default, or a source',
    sourceGone: 'The source chosen for the rubric no longer exists. Reload the page and choose again.',
    noPending: 'There are no rubric versions waiting for a choice',
    notGraded: 'The rubric source can only be chosen for the rubric that carries the grade',
    noCanvas: 'This assignment has no imported Canvas rubric'
} as const;

/** The graded grid's source as the rubric page shows it. */
export interface GradedGridState {
    lens: WritingFeedbackLens;
    current: StoredGridSource;
    /** Present when Canvas supplied a rubric at import. */
    canvas?: { criteria: number; points: number };
    /** Whether replacing the grid would discard an approved version's grid or staff edits. */
    replaceNeedsConfirmation: boolean;
    /** For a grid built from staff material: which source, and the notes extraction raised. */
    uploaded?: { sourceLabel: string; notes: string[] };
    /** Rubric versions found in staff material and held for staff to choose between. */
    pending?: {
        sourceLabel: string;
        candidates: Array<{ title: string; criteria: string[]; levels: string[]; points: number; notes: string[] }>;
    };
}

/**
 * parseRubricSourceChoice - validates an untrusted `rubricFrom` value.
 *
 * @param value - Request body value; absent means keep
 * @returns The choice
 * @throws Error with {@link RUBRIC_SOURCE_ERRORS.invalid} for anything else
 */
export function parseRubricSourceChoice(value: unknown): RubricSourceChoice {
    if (value === undefined || value === null || value === '') return 'keep';
    if (value === 'keep' || value === 'canvas' || value === 'default') return value;
    const sourceId = (value as { sourceId?: unknown })?.sourceId;
    if (typeof value === 'object' && typeof sourceId === 'string' && sourceId.length > 0 && sourceId.length <= 64) {
        return { sourceId, scale: parseScaleChoice((value as { scale?: unknown }).scale) };
    }
    throw new Error(RUBRIC_SOURCE_ERRORS.invalid);
}

/**
 * seedGrid - a fresh grid from Canvas or the default, for one lens.
 *
 * @param assignment - Assignment holding the imported Canvas rubric, if any
 * @param lens - Lens whose grid is seeded
 * @param source - Which grid to seed
 * @returns The seeded criteria and levels
 * @throws Error with {@link RUBRIC_SOURCE_ERRORS.noCanvas} when Canvas supplied no rubric
 */
export function seedGrid(
    assignment: WritingAssignment,
    lens: WritingFeedbackLens,
    source: 'canvas' | 'default'
): { criteria: WritingRubricCriterion[]; levels: WritingRubricLevel[] } {
    const canvasRubric = source === 'canvas' ? assignment.canvasRubricImport?.shape : undefined;
    if (source === 'canvas' && !canvasRubric?.criteria.length) throw new Error(RUBRIC_SOURCE_ERRORS.noCanvas);
    const seeded = seedRubricForLens({ lens, actorUserId: 'platform', canvasRubric });
    return { criteria: seeded.criteria, levels: seeded.levels };
}

/**
 * gridMatchesSeed - whether a rubric's grid is still exactly what its source seeded.
 *
 * A grid from uploaded material never counts as unedited: it cannot be re-derived here.
 *
 * @param rubric - Draft or approved rubric whose grid is compared
 * @param assignment - Assignment whose stored source decides the seed
 * @param lens - Lens the rubric belongs to
 * @returns True when the criteria and levels match a fresh seed
 */
export function gridMatchesSeed(
    rubric: WritingRubricDefinition,
    assignment: WritingAssignment,
    lens: WritingFeedbackLens
): boolean {
    const current = rubricGridSource(rubric, assignment, lens);
    if (current === 'uploaded') return false;
    let seeded: { criteria: WritingRubricCriterion[]; levels: WritingRubricLevel[] };
    try {
        seeded = seedGrid(assignment, lens, current === 'canvas' ? 'canvas' : 'default');
    } catch {
        return false;
    }
    // Compared as whole rubrics that differ only in their grids, so the comparison inherits
    // rubricContentEquals' tolerance for key order, nulls, and unnamed cells.
    return rubricContentEquals({ ...rubric, criteria: rubric.criteria, levels: rubric.levels }, { ...rubric, ...seeded });
}

/**
 * gradedGridState - the graded grid's current source, what Canvas offers, and whether
 * replacing the grid needs confirmation.
 *
 * Replacing needs confirmation when the lens has an approved rubric (its grid stays in use
 * until a new one is approved, but staff should know it is being superseded) or when the
 * draft grid differs from what its source seeded, meaning staff edited it.
 *
 * @param assignment - Assignment whose graded grid is described
 * @returns The state the rubric page's source choice is built from
 */
export function gradedGridState(assignment: WritingAssignment): GradedGridState {
    const lens = gradedLensFor(assignment);
    const selected = selectRubric(assignment, lens);
    const shape = assignment.canvasRubricImport?.shape;
    const draftEdited = selected.draft ? !gridMatchesSeed(selected.draft, assignment, lens) : false;
    const working = selected.draft ?? selected.approved;
    return {
        lens,
        current: storedGridSource(assignment, lens),
        ...(shape?.criteria.length
            ? { canvas: { criteria: shape.criteria.length, points: shape.criteria.reduce((sum, criterion) => sum + (criterion.points ?? 0), 0) } }
            : {}),
        replaceNeedsConfirmation: Boolean(selected.approved) || draftEdited,
        ...(working?.gridSource?.kind === 'uploaded'
            ? { uploaded: { sourceLabel: working.gridSource.label ?? 'your material', notes: working.gridSource.notes ?? [] } }
            : {}),
        ...(assignment.pendingRubricExtraction?.lens === lens
            ? {
                pending: {
                    sourceLabel: assignment.pendingRubricExtraction.sourceLabel,
                    candidates: assignment.pendingRubricExtraction.candidates.map((candidate) => ({
                        title: candidate.title,
                        criteria: candidate.shape.criteria.map((criterion) => criterion.label),
                        levels: candidate.shape.levels.map((level) => level.label),
                        points: candidate.shape.criteria.reduce((sum, criterion) => sum + (criterion.points ?? 0), 0),
                        notes: candidate.notes
                    }))
                }
            }
            : {})
    };
}

/**
 * isSourceChange - whether a choice would replace the grid rather than keep it.
 *
 * @param choice - The requested source
 * @param current - The grid's stored source
 * @returns False for `keep` and for a choice naming the source the grid already has
 */
export function isSourceChange(
    choice: RubricSourceChoice,
    current: StoredGridSource
): choice is 'canvas' | 'default' | { sourceId: string } {
    if (choice === 'keep') return false;
    // Building from material always replaces the grid, even one already built from material.
    if (typeof choice === 'object') return true;
    return choice === 'canvas' ? current !== 'canvas' : current !== 'builtin';
}

/**
 * gridSourceKind - the source a chosen grid records on its rubric version.
 *
 * @param choice - The source the grid came from
 * @returns The `gridSource.kind` value
 */
export function gridSourceKind(choice: 'canvas' | 'default' | { sourceId: string }): 'canvas' | 'builtin' | 'uploaded' {
    if (typeof choice === 'object') return 'uploaded';
    return choice === 'canvas' ? 'canvas' : 'builtin';
}

/** Most rules a rubric draft may hold, from `writingRubricDraftInputSchema`. */
const MAX_CONSTRAINTS = 12;

/**
 * withGrid - a draft carrying a new grid, with any deductions added to its rules.
 *
 * Deductions ("subtract 1 point if…") are assignment rules, never scored rows. They are added
 * after the draft's own rules, skipping any already there, up to the schema's limit.
 *
 * @param draft - Draft whose details are kept
 * @param grid - The new criteria and levels
 * @param deductions - Penalties found with the rubric
 * @returns The draft with the new grid
 */
export function withGrid(
    draft: WritingRubricDefinition,
    grid: { criteria: WritingRubricCriterion[]; levels: WritingRubricLevel[] },
    deductions: string[] = []
): WritingRubricDefinition {
    const constraints = [...draft.constraints];
    deductions.forEach((deduction) => {
        if (constraints.length < MAX_CONSTRAINTS && !constraints.some((rule) => rule.trim() === deduction.trim())) {
            constraints.push(deduction);
        }
    });
    return { ...draft, criteria: grid.criteria, levels: grid.levels, constraints };
}
