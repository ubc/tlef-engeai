/**
 * Canvas rubric assessment — filling the instructor's own rubric with the staff-final grade
 *
 * A total tells a student their mark. Filling the Canvas rubric tells them where it came from:
 * each criterion scored, with the level they earned highlighted in the grid their instructor
 * authored. Canvas accepts that as `rubric_assessment[<criterion id>][points]` on the
 * submission, which is only addressable because import kept Canvas's own ids beside our own
 * (see {@link CanvasRubricIdMap}).
 *
 * **It refuses as a whole or not at all.** A partial rubric assessment is worse than none: a
 * student sees a filled grid with silent gaps and no indication anything is missing, and staff
 * have no signal either. So a criterion with no Canvas id, or an id the live Canvas rubric no
 * longer carries, refuses the entire write and the release stops before touching Canvas.
 *
 * Nothing here writes. It plans, so every refusal happens before the first Canvas call.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Builds the Canvas rubric_assessment payload, or names why it cannot.
 */

import type {
    CanvasRubricIdMap,
    StaffFinalAssessment,
    WritingRubricDefinition
} from './contracts';
import { resolveBand } from './rubric-bands';

/** Why a staff-final grade cannot be written into the Canvas rubric. */
export type RubricWriteRefusal =
    | 'no_id_map' // the rubric was never imported from Canvas, so nothing maps
    | 'unmapped_criterion' // a criterion authored in EngE-AI has no Canvas counterpart
    | 'stale_canvas_rubric'; // the instructor changed the rubric in Canvas after import

/** One criterion's entry in Canvas's `rubric_assessment` object. */
export interface CanvasRubricAssessmentEntry {
    points: number;
    /** Canvas rating whose band contains the award. Absent when no single band does. */
    rating_id?: string;
}

/** A complete payload, or the reason there is not one. */
export interface RubricWritePlan {
    payload?: Record<string, CanvasRubricAssessmentEntry>;
    refusal?: RubricWriteRefusal;
}

/** Everything needed to decide the write, all of it already loaded by the caller. */
export interface RubricWriteInput {
    assessment: StaffFinalAssessment;
    rubric: WritingRubricDefinition;
    ids?: CanvasRubricIdMap;
    /** Criterion ids the live Canvas rubric carries right now, not at import time. */
    liveCanvasCriterionIds: string[];
}

/**
 * planRubricWrite - the Canvas rubric assessment for one staff-final grade, or a refusal.
 *
 * @param input - Staff-final grade, its rubric, the import id map, and the live Canvas ids
 * @returns The payload to send, or the reason the write must not happen
 */
export function planRubricWrite(input: RubricWriteInput): RubricWritePlan {
    const { assessment, rubric, ids, liveCanvasCriterionIds } = input;
    if (!ids) return { refusal: 'no_id_map' };

    const live = new Set(liveCanvasCriterionIds);
    const payload: Record<string, CanvasRubricAssessmentEntry> = {};

    for (const scored of assessment.criteria) {
        const mapping = ids[scored.criterionId];
        // A criterion staff added in EngE-AI has no Canvas counterpart to score.
        if (!mapping) return { refusal: 'unmapped_criterion' };
        // The map is fixed at import; an instructor who rebuilt the rubric in Canvas since then
        // has new ids, and writing to the old ones would score criteria that no longer exist.
        if (!live.has(mapping.criterionId)) return { refusal: 'stale_canvas_rubric' };

        const criterion = rubric.criteria.find((candidate) => candidate.id === scored.criterionId);
        if (!criterion) return { refusal: 'unmapped_criterion' };

        // A Canvas rating is a single value while a cell is a band, so the rating is the one
        // whose band contains the award. Where the bands leave a gap — which an imported
        // rubric can — the points go on their own rather than highlighting a wrong cell.
        const earnedLevel = rubric.levels.find((level) => {
            const band = resolveBand(criterion, level.id, rubric.levels);
            return band !== undefined && scored.points >= band.min && scored.points <= band.max;
        });
        const ratingId = earnedLevel ? mapping.ratingIds[earnedLevel.id] : undefined;

        payload[mapping.criterionId] = {
            points: scored.points,
            ...(ratingId ? { rating_id: ratingId } : {})
        };
    }

    return { payload };
}

/**
 * rubricRefusalMessage - staff-facing sentence naming what to fix.
 *
 * @param refusal - Why the rubric write was refused
 * @returns A message that says which side of the integration to change
 */
export function rubricRefusalMessage(refusal: RubricWriteRefusal): string {
    switch (refusal) {
        case 'no_id_map':
            return 'This rubric was not imported from Canvas, so the grade cannot be filled into a Canvas rubric.';
        case 'unmapped_criterion':
            return 'This rubric has a criterion that the Canvas rubric does not, so the grade cannot be filled in criterion by criterion.';
        case 'stale_canvas_rubric':
            return 'The rubric in Canvas has changed since this assignment was imported. Re-import the assignment before releasing.';
    }
}
