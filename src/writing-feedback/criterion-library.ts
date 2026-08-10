/**
 * Writing Feedback criterion library — optional assignment-specific rubric rows
 *
 * Provides neutral, data-only criterion templates that instructors may add to
 * a rubric draft. Nothing in this module silently scores or activates a criterion.
 *
 * @author: @rdschrs
 * @date: 2026-08-10
 * @version: 1.0.0
 * @description: Optional rubric criteria available to the staff editor.
 */

import type { WritingRubricCriterion } from './contracts';

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
