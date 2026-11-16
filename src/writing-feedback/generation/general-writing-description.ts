/**
 * General writing description — the staff-approved "Describe the writing" profile, as general
 * analysis reads it
 *
 * Staff describe what kind of writing an assignment asks for, what it is about, how the student
 * should sound, its length and conditions, its sections, and what it must include. General
 * analysis reads that description beside the rubric: the writer judges against it, and the
 * whole-text check takes its sections as the required parts instead of inferring them.
 *
 * The description belongs to the assignment, so a lab report's technical lens reads the one
 * kept on its writing rubric. Staff-approved material only; no student text is involved.
 *
 * @author: @rdschrs
 * @date: 2026-11-13
 * @version: 1.0.0
 * @description: Selects and serializes the approved writing description for general prompts.
 */

import type { WritingAssignment, WritingSflContextProfile, WritingSflStage } from '../contracts';
import { requireCompleteSflProfile } from '../language/sfl-analysis';
import { selectRubric } from '../rubric/rubric-lens';

/**
 * approvedWritingDescription - the assignment's approved description, when it is complete.
 *
 * Approval requires a complete description, but a rubric approved before that rule, or one
 * still holding the blank default, has none worth sending; it yields undefined instead.
 *
 * @param assignment - Assignment whose approved writing rubric holds the description
 * @returns The complete profile, or undefined
 */
export function approvedWritingDescription(assignment: WritingAssignment): WritingSflContextProfile | undefined {
    const profile = selectRubric(assignment, 'linguistic').approved?.sflContext;
    try {
        requireCompleteSflProfile(profile);
        return profile;
    } catch {
        return undefined;
    }
}

/**
 * orderedSections - the description's sections in the order staff gave them.
 *
 * @param description - Approved description
 * @returns Sections sorted by their order, falling back to list position
 */
export function orderedSections(description: WritingSflContextProfile): WritingSflStage[] {
    return description.stages
        .map((stage, index) => ({ stage, order: stage.order ?? index + 1 }))
        .sort((left, right) => left.order - right.order)
        .map(({ stage }) => stage);
}

/**
 * writingDescriptionBlock - the description as a prompt block, in staff wording.
 *
 * Task, purpose, audience and outcomes are left out: the profile copies them from the rubric's
 * own details, which the prompt already carries.
 *
 * @param description - Approved description
 * @returns `<writing_description>` block
 */
export function writingDescriptionBlock(description: WritingSflContextProfile): string {
    return `<writing_description>${JSON.stringify({
        kindOfWriting: description.genreLabel,
        whatItIsAbout: description.field,
        howTheStudentShouldSound: description.tenor,
        lengthAndForm: description.mode,
        whoMarksIt: description.actualEvaluator,
        writingConditions: description.productionConditions,
        sections: orderedSections(description).map(({ id, label, purpose, required }) => ({
            id,
            label,
            purpose,
            // Matches the gate: only a section marked required counts toward a whole-text problem.
            required: required === true
        })),
        smallerPiecesInside: description.embeddedGenres,
        mustInclude: description.taskRequirements
    })}</writing_description>`;
}
