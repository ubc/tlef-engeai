/**
 * Release refusals — which release failures staff may read, and in what words
 *
 * A queued release runs in the background job runner, which replaces any error it has not been
 * told is safe with "Writing feedback job failed". That rule protects against provider errors that
 * quote submission text, but it also hid every reason a release stops for a fixable cause — a
 * newer Canvas attempt, a points mismatch, a rubric changed in Canvas. The refusals listed here are
 * fixed sentences written in this codebase, so they carry no submission content and can be shown.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Allow-list and translation of release failures into staff-readable job errors.
 */

import { canvas } from '@ubc/ubc-genai-toolkit-lms-integration';
import { SanitizedJobError } from './job-runner';
import { rubricRefusalMessage, type RubricWriteRefusal } from './canvas-rubric-write';
import { releaseCapMessage } from './release-cap';
import { TEXT_EDITED_MESSAGE } from './transcript-edit';

const RUBRIC_REFUSALS: ReadonlyArray<RubricWriteRefusal> = ['no_id_map', 'unmapped_criterion', 'stale_canvas_rubric'];

/**
 * Starts of the fixed messages the release path throws when it refuses on purpose.
 *
 * Shared with the route's `safeError`, so a refusal reads the same whether staff hit it while
 * pressing Release or the worker hits it afterwards.
 */
export const RELEASE_REFUSAL_PREFIXES: ReadonlyArray<string> = [
    'Canvas release requires',
    'Canvas release contains',
    'Canvas release feedback',
    'Canvas release preview expired',
    'Canvas assignment points do not match',
    'Canvas returned inconsistent posting policy',
    'Canvas returned a different submission',
    'Canvas has a newer submission attempt',
    'Preview this exact Canvas release',
    'Staff approval is required',
    'Generate feedback before',
    'Approve the rubric this assignment is graded on',
    'Rubric changed after feedback generation',
    'Technical rubric changed after feedback generation',
    'Release reconciliation record was not found',
    'Writing assignment not found',
    'Writing submission not found',
    TEXT_EDITED_MESSAGE,
    releaseCapMessage(),
    ...RUBRIC_REFUSALS.map(rubricRefusalMessage)
];

/**
 * isReleaseRefusal - whether a message is one of the release path's own fixed refusals.
 *
 * @param message - Error message to test
 * @returns True when the message starts with an allow-listed refusal
 */
export function isReleaseRefusal(message: string): boolean {
    return RELEASE_REFUSAL_PREFIXES.some((prefix) => message.startsWith(prefix));
}

/**
 * Describes a Canvas HTTP failure by its status code alone.
 *
 * Canvas error bodies are not shown: they are Canvas's text, not ours, and are not vetted.
 * Every Canvas call that can throw this far up runs before the first write — the writes catch
 * their own failures and record them on the release — so nothing reached the student.
 */
function canvasApiMessage(statusCode: number): string {
    switch (statusCode) {
        case 401:
            return 'Canvas rejected the Canvas authorization of the staff member who released this. '
                + 'Ask them to reconnect Canvas and release it again.';
        case 403:
            return 'Canvas refused permission for this release (HTTP 403). The staff member who released it '
                + 'may not have grading rights on this Canvas assignment. Nothing was sent to the student.';
        case 404:
            return 'Canvas could not find this assignment or the student\'s submission (HTTP 404). The student may '
                + 'have left the Canvas course, or the assignment may have been deleted. Nothing was sent to the student.';
        default:
            return `Canvas returned an error (HTTP ${statusCode}) before anything was sent to the student. Try the release again.`;
    }
}

/**
 * Describes a grade export the Canvas package stopped before sending.
 *
 * @param reason - The package's refusal code
 * @returns A staff-readable sentence
 */
function gradeExportMessage(reason: string): string {
    if (reason === 'unsupported-grading') {
        return 'This Canvas assignment uses anonymous or moderated grading, which does not accept grades '
            + 'for a named student. Nothing was sent to the student.';
    }
    return `Canvas grade export was stopped before sending (${reason}). Nothing was sent to the student.`;
}

/**
 * toSanitizedReleaseError - turns a release failure into something the job may show staff.
 *
 * An allow-listed refusal keeps its own wording; a Canvas HTTP or grade-export failure is
 * described from its status or reason code; anything else is returned untouched, so the job
 * runner still replaces it with its generic sentence.
 *
 * @param error - Whatever the release threw
 * @returns A {@link SanitizedJobError} when the failure can be described safely, else `error`
 */
export function toSanitizedReleaseError(error: unknown): unknown {
    if (error instanceof SanitizedJobError) return error;
    if (error instanceof canvas.CanvasApiError) return new SanitizedJobError(canvasApiMessage(error.statusCode));
    if (error instanceof canvas.CanvasGradeExportError) return new SanitizedJobError(gradeExportMessage(error.reason));
    if (error instanceof Error && isReleaseRefusal(error.message)) return new SanitizedJobError(error.message);
    return error;
}
