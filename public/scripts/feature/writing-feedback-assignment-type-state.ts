/**
 * Assignment type state — DOM-free rules for the one-time type question (D-123)
 *
 * @author: @rdschrs
 * @date: 2026-09-13
 * @version: 1.0.0
 * @description: Labels, modal action mapping, and pending-assignment selection.
 */

/** Answer to "What kind of assignment is this?". */
export type AssignmentTypeChoice = 'writing' | 'lab_report';

export const ASSIGNMENT_TYPE_QUESTION = 'What kind of assignment is this?';
export const WRITING_ASSIGNMENT_LABEL = 'Writing assignment';
export const LAB_REPORT_ASSIGNMENT_LABEL = 'Lab report assignment';
/** Server refusal when another request answered first; mirrors `src/writing-feedback/assignment-type.ts`. */
export const TYPE_ALREADY_CHOSEN_MESSAGE = 'The assignment type has already been chosen';

/**
 * assignmentTypeFromAction - reads the answer from a closed modal.
 *
 * ModalOverlay names an action after its button text, lower-cased with spaces as hyphens.
 *
 * @param action - `ModalResult.action`
 * @returns The answer, or null for any close that was not an answer
 */
export function assignmentTypeFromAction(action: string): AssignmentTypeChoice | null {
    if (action === 'writing-assignment') return 'writing';
    if (action === 'lab-report-assignment') return 'lab_report';
    return null;
}

/**
 * oldestPendingAssignment - the assignment the landing page should ask about first.
 *
 * @param assignments - Assignments as listed for the course
 * @returns The earliest-created assignment whose type is still pending, if any
 */
export function oldestPendingAssignment<T extends { assignmentTypePending?: boolean; createdAt: string | Date }>(
    assignments: T[]
): T | undefined {
    return assignments
        .filter((assignment) => assignment.assignmentTypePending === true)
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())[0];
}
