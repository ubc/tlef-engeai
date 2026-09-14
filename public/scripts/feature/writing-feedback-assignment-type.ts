/**
 * Assignment type modal — asks once whether a new assignment is a lab report (D-123)
 *
 * Uses the app's standard modal with every dismissal path turned off. The answer is saved
 * through the one-time type route; a lab report then has its writing rubric auto-filled from
 * the assignment details. Callers open the rubric page afterwards.
 *
 * @author: @rdschrs
 * @date: 2026-09-13
 * @version: 1.0.0
 * @description: Assignment type modal and save flow for the Writing Feedback workspace.
 */

import { showCustomModal } from '../ui/modal-overlay.js';
import { type Assignment, handleActionError, jsonRequest } from './writing-feedback-shared.js';
import {
    ASSIGNMENT_TYPE_QUESTION,
    LAB_REPORT_ASSIGNMENT_LABEL,
    TYPE_ALREADY_CHOSEN_MESSAGE,
    WRITING_ASSIGNMENT_LABEL,
    assignmentTypeFromAction,
    type AssignmentTypeChoice
} from './writing-feedback-assignment-type-state.js';

/**
 * askAssignmentType - shows the non-dismissible question until staff answer it.
 *
 * @param assignmentTitle - Shown as the modal body so staff know which assignment it is
 * @returns The chosen type
 */
export async function askAssignmentType(assignmentTitle: string): Promise<AssignmentTypeChoice> {
    for (;;) {
        const content = document.createElement('p');
        content.textContent = assignmentTitle;
        const result = await showCustomModal({
            type: 'info',
            title: ASSIGNMENT_TYPE_QUESTION,
            content,
            showCloseButton: false,
            closeOnOverlayClick: false,
            closeOnEscape: false,
            buttons: [
                { text: WRITING_ASSIGNMENT_LABEL, type: 'outline', closeOnClick: true },
                { text: LAB_REPORT_ASSIGNMENT_LABEL, type: 'outline', closeOnClick: true }
            ]
        });
        const choice = assignmentTypeFromAction(result.action);
        if (choice) return choice;
    }
}

/**
 * ensureAssignmentTypeChosen - asks and saves the type when it is still pending.
 *
 * A failed save shows the error and asks again. When another request answered first, the
 * assignment is treated as settled so the caller reloads it.
 *
 * @param assignment - Assignment to classify; updated in place with the server's copy
 * @returns The same assignment object, no longer pending
 */
export async function ensureAssignmentTypeChosen(assignment: Assignment): Promise<Assignment> {
    if (assignment.assignmentTypePending !== true) return assignment;
    const base = `/assignments/${encodeURIComponent(assignment.id)}`;
    for (;;) {
        const type = await askAssignmentType(assignment.title);

        // Step 1: record the answer. Retry on failure; stop if someone else already answered.
        try {
            Object.assign(assignment, await jsonRequest<Assignment>(`${base}/type`, 'PUT', { type }));
        } catch (error) {
            if (error instanceof Error && error.message.startsWith(TYPE_ALREADY_CHOSEN_MESSAGE)) {
                assignment.assignmentTypePending = false;
                return assignment;
            }
            await handleActionError(error);
            continue;
        }

        // Step 2: a lab report's writing rubric is filled from the assignment details. A
        // failure is reported but never blocks the rubric page, which staff can fill by hand.
        if (type === 'lab_report' && assignment.instructions?.trim()) {
            try {
                Object.assign(
                    assignment,
                    await jsonRequest<Assignment>(`${base}/rubric-draft/fill?lens=linguistic`, 'POST')
                );
            } catch (error) {
                await handleActionError(error);
            }
        }
        return assignment;
    }
}
