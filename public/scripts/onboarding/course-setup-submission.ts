/**
 * course-setup-submission.ts
 *
 * Decides whether Course Setup should submit, and which server errors mean
 * "already done" rather than "failed".
 *
 * Deliberately import-free and DOM-free so it can be unit tested from the
 * backend Jest project, following the precedent set by
 * `public/scripts/utils/onboarding-stage-order.ts`.
 *
 * @author: @rdschrs
 * @date: 2026-08-31
 */

/** The wizard state fields the submission decision depends on. */
export interface CourseSetupSubmissionState {
    /** True once a submission has succeeded, or been resolved as already done. */
    submitted: boolean;
    /** True while a submission is in flight. */
    isSubmitting: boolean;
}

/**
 * shouldSubmitCourseSetup - true only on the first, non-concurrent arrival.
 *
 * Stepping Back from the submission step and forward again must not re-POST.
 * The create and resume endpoints both reject a second attempt with a 409, which
 * the caller surfaces as an error modal and a bounce back one step, so without
 * this guard the instructor can never reach the final step again.
 */
export function shouldSubmitCourseSetup(state: CourseSetupSubmissionState): boolean {
    return !state.submitted && !state.isSubmitting;
}

/**
 * Server messages that report the outcome the caller was asking for.
 *
 * Matched on text because both are 409s raised by different routes with no
 * shared error code. Compared lowercase so a future wording change in casing
 * does not silently reopen the trap.
 *
 * `'this name already exists'` is deliberately narrower than a bare
 * `'already exists'`: the create route also raises "Course with this ID
 * already exists" on an internal ID collision, a genuine failure with no
 * course written. That message must NOT match here — matching it would mark
 * the wizard submitted and advance to the congratulations step for a course
 * that was never created, while permanently blocking any retry.
 */
const ALREADY_COMPLETE_MESSAGES = [
    'course setup is already complete',
    'this name already exists'
];

/**
 * isAlreadyCompleteError - true when a rejection means the work was already done.
 *
 * A second tab, a retry, or a stale click can still reach the server after this
 * client has submitted. The state it reports is the state the caller wanted, so
 * it is treated as success rather than shown as a failure.
 *
 * @param message - Server error text
 */
export function isAlreadyCompleteError(message: string): boolean {
    const normalized = message.toLowerCase();
    return ALREADY_COMPLETE_MESSAGES.some(fragment => normalized.includes(fragment));
}
