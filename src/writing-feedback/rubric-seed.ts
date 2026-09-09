/**
 * Rubric seed — which rubric a new draft starts from
 *
 * One decision, made once when a draft is first created. A rubric imported from the
 * course's LMS is the instructor's real rubric and always wins; the built-in profile
 * is the fallback for an assignment that has none.
 *
 * @author: @rdschrs
 * @date: 2026-08-23
 * @version: 1.0.0
 * @description: Resolves the starting rubric for a lens.
 */

import type {
    ImportedRubricShape,
    WritingFeedbackLens,
    WritingRubricCriterion,
    WritingRubricDefinition,
    WritingRubricLevel
} from './contracts';
import { buildDefaultWritingRubric } from './default-rubric-profile';
import { buildLabReportRubric } from './lab-report-profile';

export type { ImportedRubricShape };

/** Everything the resolver needs to choose and build a starting rubric. */
export interface SeedRubricInput {
    lens: WritingFeedbackLens;
    actorUserId: string;
    /**
     * Rubric pulled from the course LMS, when the assignment carried one. Supplied by
     * the LMS integration; this module only decides that it takes precedence.
     */
    canvasRubric?: ImportedRubricShape;
    now?: Date;
}

/**
 * seedRubricForLens - builds the unapproved rubric a new draft starts from.
 *
 * A lab report's writing rubric seeds from the same metafunctions as any other assignment —
 * a lab handout describes an experiment, not linguistic expectations — so nothing *here*
 * branches on whether the assignment is a lab report. The branching lives one level up, in
 * {@link routeRubricsForLabReport}: marking an assignment a lab report moves an imported
 * Canvas grid onto the technical lens and returns the writing lens to the metafunctions.
 *
 * @param input - Lens, actor, and any imported rubric
 * @returns A draft rubric. Never approved: approval stays the gate that lets a
 *          rubric reach the model.
 */
export function seedRubricForLens(input: SeedRubricInput): WritingRubricDefinition {
    const now = input.now ?? new Date();

    // The built-in profile supplies the surrounding fields — task, audience, purpose —
    // in every case. Only the grid is replaced when an imported rubric exists.
    const base = input.lens === 'technical'
        ? buildLabReportRubric(input.actorUserId, now)
        : buildDefaultWritingRubric(input.actorUserId, now);

    // An imported rubric with no criteria carries no structure worth preferring.
    if (input.canvasRubric && input.canvasRubric.criteria.length > 0) {
        return {
            ...base,
            criteria: input.canvasRubric.criteria.map((criterion) => ({ ...criterion })),
            levels: input.canvasRubric.levels.map((level) => ({ ...level }))
        };
    }

    return base;
}

/** What marking an assignment as a lab report does to both of its rubrics. */
export interface LabReportRouting {
    technicalDraft: WritingRubricDefinition; // the technical lens's new editable draft
    technicalRubricSource: 'canvas' | 'builtin'; // where that draft's grid came from
    writingDraft: WritingRubricDefinition; // the writing lens returned to the metafunctions
    writingRubricSource: 'internal_profile'; // provenance the writing lens reverts to
}

/**
 * routeRubricsForLabReport - moves an imported Canvas grid onto the lens that owns it.
 *
 * At import time nothing knows whether an assignment is a lab report: `isLabReport` is set by a
 * later PATCH, so the Canvas grid seeds the writing lens and is also kept whole on the
 * assignment as `canvasRubricImport`. When staff then mark the assignment a lab report, that
 * grid is the technical marking scheme and belongs to the technical lens — while the writing
 * lens returns to the three metafunctions it should have had, so its auto-fill works again.
 *
 * Both results are drafts. Approval stays the only gate that lets a rubric reach the model.
 *
 * @param input - The stored import, if any, and the staff member performing the change
 * @returns Both lenses' new drafts and the provenance each should record
 */
export function routeRubricsForLabReport(input: {
    canvasRubricImport?: { shape: ImportedRubricShape };
    actorUserId: string;
    now?: Date;
}): LabReportRouting {
    const now = input.now ?? new Date();
    const canvasRubric = input.canvasRubricImport?.shape;
    return {
        technicalDraft: seedRubricForLens({
            lens: 'technical',
            actorUserId: input.actorUserId,
            canvasRubric,
            now
        }),
        technicalRubricSource: canvasRubric ? 'canvas' : 'builtin',
        writingDraft: buildDefaultWritingRubric(input.actorUserId, now),
        writingRubricSource: 'internal_profile'
    };
}
