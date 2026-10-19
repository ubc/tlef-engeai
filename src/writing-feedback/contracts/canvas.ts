/**
 * Writing Feedback contracts — Canvas rubric import and source material
 *
 * Part of the Writing Feedback domain vocabulary; import from `../contracts`, which re-exports
 * every part. These types contain no HTTP or Mongo behavior.
 *
 * @author: @rdschrs
 * @date: 2026-10-19
 * @version: 1.0.0
 * @description: Imported Canvas rubric shapes, id maps, source material, and assignment details.
 */

import type { WritingRubricCriterion, WritingRubricLevel } from './assignment';

/**
 * One rating (column) on an imported Canvas rubric row.
 *
 * Canvas defines ratings **per criterion**, so two rows of the same rubric may carry different
 * numbers of ratings. That raggedness is preserved rather than normalized: padding rows to a
 * rectangle would invent rating cells the instructor never wrote.
 */
export interface CanvasRubricRating {
    /** Canvas's own rating id. Transport only — never persisted locally. */
    canvasRatingId: string;
    label: string; // Canvas `description`; the short rating name, e.g. "Full Marks"
    description: string; // Canvas `long_description`; the performance descriptor
    /** Points Canvas assigns this rating. Displayed only — never used to compute a grade today. */
    points?: number;
}

/**
 * One criterion (row) of a Canvas rubric, exactly as Canvas returned it.
 *
 * A transport shape, not a stored one: `canvas-rubric-mapping.ts` turns these rows into the
 * criteria and levels that seed an assignment's first rubric draft, and nothing persists this
 * shape. An assignment therefore only ever carries one rubric.
 */
export interface CanvasRubricRow {
    /** Canvas's own criterion id. Transport only — never persisted locally. */
    canvasCriterionId: string;
    label: string; // Canvas `description`; the row name, e.g. "Thesis"
    description: string; // Canvas `long_description`; the row's fuller explanation
    /**
     * Canvas's per-criterion point value — a weight, carried onto the seeded criterion's
     * `points`. It arrives inside an *unapproved* draft, so a Canvas weight only reaches
     * grading after an instructor has reviewed and approved it: nothing is inferred.
     */
    points?: number;
    ratings: CanvasRubricRating[]; // this row's own ratings, in Canvas order
}

/**
 * A rubric authored in Canvas, as read from Canvas.
 *
 * This is what crosses the wire, not what is stored. The rubric grid model now carries a
 * variable criterion count, per-criterion cells, and row weights, so a Canvas rubric maps onto
 * {@link WritingRubricDefinition} directly — `canvas-rubric-mapping.ts` does that mapping and
 * `seedRubricForLens` makes the result an assignment's starting draft. There is no second
 * stored rubric to keep in step, and no editor for one.
 */
/** Why a Canvas rubric could not become a grid. Staff-facing text lives in the page. */
export type CanvasRubricRefusal =
    | 'no_rubric'
    | 'too_few_ratings'
    | 'too_many_criteria'
    | 'too_many_levels';

/**
 * Rubric structure lifted from an imported LMS assignment, before it becomes a draft.
 *
 * Defined here rather than beside `seedRubricForLens` because {@link WritingAssignment}
 * stores one, and this module deliberately imports nothing from the Writing Feedback
 * modules that import it. `rubric-seed.ts` re-exports it, so every existing import resolves.
 */
export interface ImportedRubricShape {
    criteria: WritingRubricCriterion[];
    levels: WritingRubricLevel[];
}

/**
 * Canvas's own ids for one imported rubric, keyed by the ids the mapper derived.
 *
 * The mapper builds our ids from each criterion's visible name, because a Canvas id such as
 * `_1234` cannot satisfy the grid schema's id pattern. Writing a staff assessment back into
 * the Canvas rubric needs the id that would otherwise be discarded, so it is kept beside the
 * grid rather than adopted as ours — every stored feedback run, evidence record and PDF
 * references our criterion id, and changing its format would mean migrating all of them.
 *
 * Lives here for the same reason {@link CanvasRubricRefusal} does: `canvas-rubric-mapping.ts`
 * imports this module, so the type it needs on {@link WritingAssignment} cannot live there.
 * That module re-exports it.
 */
export interface CanvasRubricIdMap {
    [ourCriterionId: string]: {
        criterionId: string; // Canvas criterion id, e.g. "_1234"
        ratingIds: Record<string, string>; // our level id -> Canvas rating id
    };
}

export interface CanvasImportedRubric {
    /** Canvas rubric id when `rubric_settings` reports one. */
    canvasRubricId?: string;
    title: string; // Canvas rubric title, or the assignment title when unnamed
    /** Total points Canvas reports for the rubric. Display only. */
    pointsPossible?: number;
    rows: CanvasRubricRow[]; // criteria in Canvas order
    importedAt: Date; // when this rubric was pulled from Canvas
}

/**
 * Assignment context imported from Canvas alongside the rubric.
 *
 * Held as raw source text. A future agent derives the rubric's `task`, `purpose`, `audience`,
 * and `constraints` from it; until that exists this is reference material for staff, and
 * nothing reads it automatically.
 */
/**
 * Instructor-supplied assignment material: an uploaded file or pasted text, kept as extracted
 * text only. Instructor material, never student work, and never sent to the course RAG index.
 */
export interface WritingSourceMaterial {
    id: string;
    courseId: string;
    assignmentId: string;
    kind: 'file' | 'paste';
    /** Sanitized basename of an uploaded file, for display only. */
    fileName?: string;
    /** Extracted text. Tables are kept as markdown tables wherever the source had real ones. */
    text: string;
    /** Whether `text` holds tables whose rows and columns came from the source's own structure. */
    hasTables: boolean;
    characterCount: number;
    addedAt: Date;
    /** Internal user id of the staff member who added it; never a PUID. */
    addedBy: string;
    /** When staff last corrected the text by hand, if they have. */
    editedAt?: Date;
    /** Internal user id of the staff member who last corrected it; never a PUID. */
    editedBy?: string;
}

export interface CanvasAssignmentDetails {
    /** Canvas `description` — rich-editor HTML, stored as delivered. */
    descriptionHtml?: string;
    /** Plain-text rendering of the description, for display and future extraction. */
    descriptionText?: string;
    pointsPossible?: number; // Canvas assignment points, distinct from the rubric total
    dueAt?: Date; // Canvas due date at import time
    importedAt: Date; // when these details were pulled
}
