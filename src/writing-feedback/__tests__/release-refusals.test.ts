/**
 * Release refusal tests — what a failed queued release may tell staff
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for the release refusal allow-list and Canvas error translation.
 */

import { canvas } from '@ubc/ubc-genai-toolkit-lms-integration';
import { SanitizedJobError } from '../job-runner';
import { rubricRefusalMessage } from '../canvas-rubric-write';
import { toSanitizedReleaseError } from '../release-refusals';

describe('toSanitizedReleaseError', () => {
    it.each([
        'Canvas has a newer submission attempt; regenerate and approve feedback for the current attempt',
        'Canvas assignment points do not match the approved Writing Feedback rubric total',
        'Canvas returned a different submission during release verification',
        rubricRefusalMessage('stale_canvas_rubric')
    ])('keeps the wording of %s', (message) => {
        const sanitized = toSanitizedReleaseError(new Error(message));
        expect(sanitized).toBeInstanceOf(SanitizedJobError);
        expect((sanitized as Error).message).toBe(message);
    });

    it('describes a Canvas HTTP failure by status, never by its body', () => {
        const sanitized = toSanitizedReleaseError(new canvas.CanvasApiError('body quoting <student text>', 404));
        expect(sanitized).toBeInstanceOf(SanitizedJobError);
        expect((sanitized as Error).message).toContain('HTTP 404');
        expect((sanitized as Error).message).not.toContain('student text');
    });

    it('names anonymous grading when the grade export refuses it', () => {
        const sanitized = toSanitizedReleaseError(new canvas.CanvasGradeExportError('refused', 'unsupported-grading'));
        expect((sanitized as Error).message).toMatch(/anonymous or moderated grading/);
    });

    it('passes an already-sanitized error through unchanged', () => {
        const original = new SanitizedJobError('Reconnect Canvas');
        expect(toSanitizedReleaseError(original)).toBe(original);
    });

    it('leaves anything unrecognised for the runner to replace', () => {
        const original = new Error('provider said: <student text>');
        expect(toSanitizedReleaseError(original)).toBe(original);
    });
});
