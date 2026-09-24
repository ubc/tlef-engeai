/**
 * writing-feedback-demo-mode.test.ts
 *
 * Pins the guarantee that an onboarding tutorial cannot mutate course data.
 *
 * The Writing Feedback review renderers attach handlers that POST to /verify,
 * /generate, /reviews, /approve, /preview-release, and /release. The onboarding
 * tutorial mounts those renderers, so the demo-mode flag is the only thing
 * standing between a tutorial click and a real write. It is tested directly.
 *
 * @author: @rdschrs
 */

import {
    assertNotWritingFeedbackDemoMode,
    isWritingFeedbackDemoMode,
    setWritingFeedbackDemoMode,
    WritingFeedbackDemoModeError
} from '../../../public/scripts/feature/writing-feedback-demo-mode';

describe('writing feedback demo mode', () => {
    afterEach(() => {
        setWritingFeedbackDemoMode(false);
    });

    it('is off by default so the real workspace is unaffected', () => {
        expect(isWritingFeedbackDemoMode()).toBe(false);
    });

    it('reports enabled once set', () => {
        setWritingFeedbackDemoMode(true);
        expect(isWritingFeedbackDemoMode()).toBe(true);
    });

    it('clears back to disabled', () => {
        setWritingFeedbackDemoMode(true);
        setWritingFeedbackDemoMode(false);
        expect(isWritingFeedbackDemoMode()).toBe(false);
    });

    it('exposes a named error the caller can identify', () => {
        const error = new WritingFeedbackDemoModeError();
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('WritingFeedbackDemoModeError');
        expect(error.message).toContain('tutorial');
    });

    it('assertNotWritingFeedbackDemoMode throws while demo mode is on', () => {
        setWritingFeedbackDemoMode(true);
        expect(() => assertNotWritingFeedbackDemoMode()).toThrow(WritingFeedbackDemoModeError);
    });

    it('assertNotWritingFeedbackDemoMode returns normally while demo mode is off', () => {
        expect(() => assertNotWritingFeedbackDemoMode()).not.toThrow();
    });
});
