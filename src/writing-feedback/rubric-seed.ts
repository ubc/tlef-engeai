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
    WritingFeedbackLens,
    WritingRubricCriterion,
    WritingRubricDefinition,
    WritingRubricLevel
} from './contracts';
import { buildDefaultWritingRubric } from './default-rubric-profile';
import { buildLabReportRubric } from './lab-report-profile';

/** Rubric structure lifted from an imported LMS assignment, before it becomes a draft. */
export interface ImportedRubricShape {
    criteria: WritingRubricCriterion[];
    levels: WritingRubricLevel[];
}

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
 * A lab report's writing rubric seeds from the same metafunctions as any other
 * assignment — a lab handout describes an experiment, not linguistic expectations —
 * so nothing here branches on whether the assignment is a lab report.
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
