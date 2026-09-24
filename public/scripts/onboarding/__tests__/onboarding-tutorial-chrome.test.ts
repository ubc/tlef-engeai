/**
 * onboarding-tutorial-chrome.test.ts
 *
 * Pins the tutorial chrome's copy and segment state.
 *
 * Rendering is DOM work this Node-environment project cannot execute, so the browser pass
 * covers the markup; what is covered here is the arithmetic an instructor reads as
 * "Tutorial 3 of 7", which must stay honest when a capability is disabled or the viewer is
 * a teaching assistant.
 *
 * @author: @rdschrs
 */

import { buildTutorialChromeCopy } from '../onboarding-tutorial-chrome';
import type { OnboardingCourseProgress } from '../../utils/onboarding-stage-order';

/** Course with every tutorial-owning capability enabled. */
const FULL_COURSE: OnboardingCourseProgress = {
    courseSetup: true,
    features: {
        scenarioGeneration: { enabled: true },
        writingFeedback: { enabled: true },
        guidedPathway: { enabled: true }
    }
};

/** Same course with Writing Feedback off, so its stage is never in the sequence. */
const NO_WRITING_FEEDBACK: OnboardingCourseProgress = {
    courseSetup: true,
    features: {
        scenarioGeneration: { enabled: true },
        writingFeedback: { enabled: false },
        guidedPathway: { enabled: true }
    }
};

describe('buildTutorialChromeCopy', () => {
    it('names the stage position out of the viewer total', () => {
        const copy = buildTutorialChromeCopy('writing-feedback-setup', FULL_COURSE, true);

        expect(copy.position).toBe('Tutorial 4 of 7');
        expect(copy.stageLabel).toBe('Writing Feedback');
    });

    it('counts only the stages this viewer is routed through', () => {
        expect(buildTutorialChromeCopy('flag-setup', NO_WRITING_FEEDBACK, true).position).toBe(
            'Tutorial 5 of 6'
        );
        expect(buildTutorialChromeCopy('document-setup', FULL_COURSE, false).position).toBe(
            'Tutorial 1 of 6'
        );
    });

    it('gives one segment per stage and marks the current one, matching the label', () => {
        const first = buildTutorialChromeCopy('course-setup', FULL_COURSE, true);
        expect(first.segmentCount).toBe(7);
        expect(first.currentSegment).toBe(1);

        const middle = buildTutorialChromeCopy('writing-feedback-setup', FULL_COURSE, true);
        expect(middle.segmentCount).toBe(7);
        expect(middle.currentSegment).toBe(4);

        const teachingAssistant = buildTutorialChromeCopy('document-setup', FULL_COURSE, false);
        expect(teachingAssistant.segmentCount).toBe(6);
        expect(teachingAssistant.currentSegment).toBe(1);
    });

    it('falls back to a plain label with no segments for a stage outside the sequence', () => {
        const copy = buildTutorialChromeCopy('writing-feedback-setup', NO_WRITING_FEEDBACK, true);

        expect(copy.position).toBe('Tutorial');
        expect(copy.segmentCount).toBe(0);
        expect(copy.currentSegment).toBe(0);
        expect(copy.stageLabel).toBe('Writing Feedback');
    });

    it('labels every stage from the shared label map', () => {
        expect(buildTutorialChromeCopy('document-setup', FULL_COURSE, true).stageLabel).toBe('Course Content');
        expect(buildTutorialChromeCopy('flag-setup', FULL_COURSE, true).stageLabel).toBe('Flags');
        expect(buildTutorialChromeCopy('monitor-setup', FULL_COURSE, true).stageLabel).toBe('Monitor');
    });
});
