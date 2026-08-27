/**
 * Suggested grading — a staff-only points suggestion derived from a feedback run
 *
 * Nothing here is stored and nothing is released. Each criterion reports the band of
 * the level the model chose and the explanation it gave; the total is the sum of those
 * bands, expressed as a range. Derived from fields every run already carries, so this
 * works on runs generated before the feature existed.
 *
 * @author: @rdschrs
 * @date: 2026-08-23
 * @version: 1.0.0
 * @description: Derives the staff-only suggested grading for one run.
 */

import type { WritingFeedbackRun, WritingRubricDefinition } from './contracts';
import { resolveBand } from './rubric-bands';

/** One criterion's suggested points band and the reason for it. */
export interface SuggestedCriterionGrade {
    criterionId: string;
    label: string;
    levelLabel: string;
    min: number;
    max: number;
    reason: string;
}

/** Staff-only suggestion for one run. Never persisted, never released. */
export interface SuggestedGrading {
    criteria: SuggestedCriterionGrade[];
    totalMin: number;
    totalMax: number;
}

/**
 * deriveSuggestedGrading - points suggestion for one feedback run.
 *
 * @param run - Immutable model run
 * @param rubric - The rubric version that produced the run, resolved by the caller
 * @returns Per-criterion bands and their total. Criteria the rubric no longer holds,
 *          and criteria carrying no points, are omitted rather than guessed at.
 */
export function deriveSuggestedGrading(
    run: WritingFeedbackRun,
    rubric: WritingRubricDefinition
): SuggestedGrading {
    const criteria: SuggestedCriterionGrade[] = [];

    run.result.criteria.forEach((feedback) => {
        const definition = rubric.criteria.find((criterion) => criterion.id === feedback.criterion);
        if (!definition) return; // retired in a later version; the run still renders elsewhere
        const band = resolveBand(definition, feedback.suggestedLevel, rubric.levels);
        if (!band) return; // ordinal-only criterion: no points to suggest
        const level = rubric.levels.find((entry) => entry.id === feedback.suggestedLevel);

        criteria.push({
            criterionId: definition.id,
            label: definition.label,
            levelLabel: level?.label ?? feedback.suggestedLevel,
            min: band.min,
            max: band.max,
            // Confidence and internal flags are staff-only model signals and stay out
            // of this structure entirely.
            reason: feedback.explanation
        });
    });

    return {
        criteria,
        totalMin: criteria.reduce((total, entry) => total + entry.min, 0),
        totalMax: criteria.reduce((total, entry) => total + entry.max, 0)
    };
}
