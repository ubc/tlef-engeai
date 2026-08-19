/**
 * writing-feedback-demo-mode.ts
 *
 * Fail-closed switch that blocks every Writing Feedback mutation.
 *
 * The onboarding tutorial mounts the real Writing Feedback renderers so an
 * instructor sees the production interface rather than a copy of it. Those
 * renderers attach live handlers, so the tutorial arms this flag and every
 * mutation is refused at the single choke point in `jsonRequest`.
 *
 * This module is deliberately DOM-free and dependency-free. It is imported by a
 * Node Jest test, and keeping it free of `document` is what makes that possible.
 *
 * @author: @rdschrs
 * @date: 2026-08-18
 */

/** Raised instead of performing a mutation while a tutorial is being shown. */
export class WritingFeedbackDemoModeError extends Error {
    constructor() {
        super('This is a tutorial. Nothing was saved.');
        this.name = 'WritingFeedbackDemoModeError';
    }
}

// Module-scoped rather than exported, so no caller can assign it directly and
// every transition goes through the setter.
let demoModeEnabled = false;

/**
 * Arms or disarms tutorial demo mode.
 *
 * Only the onboarding Writing Feedback tutorial may pass `true`. Any other
 * caller doing so is a defect: it would silently stop the real staff workspace
 * from saving.
 *
 * @param enabled - true while a tutorial is displaying the real renderers
 */
export function setWritingFeedbackDemoMode(enabled: boolean): void {
    demoModeEnabled = enabled;
}

/** True while mutations must be refused. */
export function isWritingFeedbackDemoMode(): boolean {
    return demoModeEnabled;
}
