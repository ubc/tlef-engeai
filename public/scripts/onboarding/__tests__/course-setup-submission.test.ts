/**
 * course-setup-submission.test.ts
 *
 * Pins the guarantee that Course Setup submits at most once per mount.
 *
 * Arriving at step 5 fires the submission. Nothing used to record that it had
 * run, so stepping Back to step 4 and forward again re-POSTed: resume mode hit
 * 409 "Course setup is already complete", create mode hit 409 "A course with
 * this name already exists". Both surfaced as a Submission Error modal that
 * returned the instructor to step 4, leaving the tutorial unfinishable.
 */

import {
    isAlreadyCompleteError,
    shouldSubmitCourseSetup
} from '../course-setup-submission';

describe('shouldSubmitCourseSetup', () => {
    it('submits on the first arrival at the submission step', () => {
        expect(shouldSubmitCourseSetup({ submitted: false, isSubmitting: false })).toBe(true);
    });

    it('does not submit again after a successful submission', () => {
        expect(shouldSubmitCourseSetup({ submitted: true, isSubmitting: false })).toBe(false);
    });

    it('does not submit while a submission is already in flight', () => {
        expect(shouldSubmitCourseSetup({ submitted: false, isSubmitting: true })).toBe(false);
    });
});

describe('isAlreadyCompleteError', () => {
    it.each([
        'Course setup is already complete',
        'A course with this name already exists'
    ])('treats %s as success rather than failure', (message) => {
        // The server is reporting the state the caller wanted. Showing an error
        // and bouncing back a step is what trapped the instructor.
        expect(isAlreadyCompleteError(message)).toBe(true);
    });

    it.each([
        'Frame type must be either "byWeek" or "byTopic"',
        'Course not found',
        'Failed to save course data. Please try again.',
        'Course with this ID already exists'
    ])('leaves %s as a real failure', (message) => {
        expect(isAlreadyCompleteError(message)).toBe(false);
    });

    it('matches regardless of casing', () => {
        expect(isAlreadyCompleteError('COURSE SETUP IS ALREADY COMPLETE')).toBe(true);
    });
});
