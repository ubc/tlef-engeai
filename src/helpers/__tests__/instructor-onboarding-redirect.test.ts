/**
 * instructor-onboarding-redirect.test.ts
 *
 * Pins the instructor onboarding stage order across both implementations.
 *
 * Stage ordering is mirrored the same way shared types are: the backend owns
 * `resolveInstructorModeRedirect` for entry-time redirects, and the browser owns
 * `resolveNextOnboardingStage` for in-page routing. Neither can import the other,
 * so every case below asserts on both and the parity test proves they cannot
 * silently diverge.
 *
 * `courseSetup` is course state; every tutorial, feature tutorials included, is
 * the viewer's own progress (OB-002).
 *
 * @author: @rdschrs
 */

import { resolveInstructorModeRedirect } from '../instructor-onboarding-redirect';
import {
    FEATURE_ONBOARDING_STAGES,
    resolveNextOnboardingStage,
    type InstructorOnboardingStage,
    type OnboardingCourseProgress,
    type OnboardingUserProgress
} from '../../../public/scripts/utils/onboarding-stage-order';
import type { activeCourse, GlobalUser, InstructorOnboardingProgress } from '../../types/shared';

const COURSE_ID = 'abcdef123456';

/** Progress for someone who has been taught every inherited tutorial and no feature one. */
const LEGACY_DONE: InstructorOnboardingProgress = {
    contentSetup: true,
    flagSetup: true,
    monitorSetup: true
};

/** Builds a configured course with no feature enabled. */
function buildCourse(overrides: Partial<activeCourse> = {}): activeCourse {
    return {
        id: COURSE_ID,
        date: new Date('2026-08-17T00:00:00.000Z'),
        courseSetup: true,
        courseName: 'CHBE 241',
        instructors: [],
        teachingAssistants: [],
        frameType: 'byWeek',
        tilesNumber: 12,
        topicOrWeekInstances: [],
        ...overrides
    } as activeCourse;
}

/** Wraps tutorial progress in the shape the backend resolver reads. */
function buildUser(progress: InstructorOnboardingProgress): Pick<GlobalUser, 'instructorOnboarding'> {
    return { instructorOnboarding: progress };
}

function enabled(...features: Array<'scenarioGeneration' | 'writingFeedback' | 'guidedPathway'>) {
    return features.reduce<Record<string, { enabled: boolean }>>((map, feature) => {
        map[feature] = { enabled: true };
        return map;
    }, {});
}

/** Expected redirect URL for a resolved stage, or the dashboard when none remain. */
function expectedRedirect(stage: InstructorOnboardingStage | null): string {
    return stage === null
        ? `/course/${COURSE_ID}/instructor/dashboard`
        : `/course/${COURSE_ID}/instructor/onboarding/${stage}`;
}

/** Asserts both implementations resolve to the same stage for the given authority. */
function expectStage(
    course: activeCourse,
    progress: InstructorOnboardingProgress,
    stage: InstructorOnboardingStage | null,
    canManageRoster = true
): void {
    expect(
        resolveNextOnboardingStage(
            course as OnboardingCourseProgress,
            progress as OnboardingUserProgress,
            canManageRoster
        )
    ).toBe(stage);

    const result = resolveInstructorModeRedirect(COURSE_ID, course, buildUser(progress), canManageRoster);
    expect(result.redirect).toBe(expectedRedirect(stage));
    expect(result.requiresOnboarding).toBe(stage !== null);
}

describe('instructor onboarding stage order', () => {
    describe('inherited stages', () => {
        it('starts at course-setup when nothing is complete', () => {
            expectStage(buildCourse({ courseSetup: false }), {}, 'course-setup');
        });

        it('advances to document-setup once course setup is complete', () => {
            expectStage(buildCourse(), {}, 'document-setup');
        });

        it('advances to flag-setup once documents are complete and no feature is enabled', () => {
            expectStage(buildCourse(), { contentSetup: true }, 'flag-setup');
        });

        it('advances to monitor-setup as the final inherited stage', () => {
            expectStage(buildCourse(), { contentSetup: true, flagSetup: true }, 'monitor-setup');
        });

        it('resolves to the dashboard when every stage is complete', () => {
            expectStage(buildCourse(), LEGACY_DONE, null);
        });
    });

    /**
     * The reason tutorial progress moved off the course (OB-002): a second instructor
     * joining a configured course must still be taught, and a veteran must not be.
     */
    describe('progress follows the person, not the course', () => {
        it('teaches a new instructor on an already-set-up course', () => {
            expectStage(buildCourse(), {}, 'document-setup');
        });

        it('never sends a second instructor back through course setup', () => {
            const result = resolveInstructorModeRedirect(COURSE_ID, buildCourse(), buildUser({}));
            expect(result.redirect).not.toContain('course-setup');
        });

        it('asks a veteran to configure a new course without repeating the tutorials', () => {
            expectStage(buildCourse({ courseSetup: false }), LEGACY_DONE, 'course-setup');
            expectStage(buildCourse(), LEGACY_DONE, null);
        });

        it('treats a missing user record as no progress rather than throwing', () => {
            for (const globalUser of [null, undefined]) {
                expect(resolveInstructorModeRedirect(COURSE_ID, buildCourse(), globalUser).redirect).toBe(
                    expectedRedirect('document-setup')
                );
            }
            expect(resolveNextOnboardingStage(buildCourse() as OnboardingCourseProgress, undefined)).toBe(
                'document-setup'
            );
        });

        it('ignores stale course-level tutorial flags', () => {
            // Deprecated fields left on old documents must not grant progress.
            const stale = buildCourse({ contentSetup: true, flagSetup: true, monitorSetup: true });
            expectStage(stale, {}, 'document-setup');
        });
    });

    describe('feature stages', () => {
        it.each([
            ['scenarioGeneration', 'scenario-generation-setup'],
            ['writingFeedback', 'writing-feedback-setup'],
            ['guidedPathway', 'guided-pathway-setup']
        ] as const)('routes to the %s tutorial when only that feature is enabled', (feature, stage) => {
            expectStage(buildCourse({ features: enabled(feature) }), LEGACY_DONE, stage);
        });

        it.each([
            ['scenarioGeneration'],
            ['writingFeedback'],
            ['guidedPathway']
        ] as const)('skips the %s tutorial once it is marked complete', (feature) => {
            expectStage(
                buildCourse({ features: enabled(feature) }),
                { ...LEGACY_DONE, [feature]: true },
                null
            );
        });

        it('treats an entirely absent feature entry as incomplete', () => {
            const progress: InstructorOnboardingProgress = { ...LEGACY_DONE };
            expect(progress.writingFeedback).toBeUndefined();
            expectStage(buildCourse({ features: enabled('writingFeedback') }), progress, 'writing-feedback-setup');
        });

        it('treats an explicit false the same as a missing value', () => {
            expectStage(
                buildCourse({ features: enabled('guidedPathway') }),
                { ...LEGACY_DONE, guidedPathway: false },
                'guided-pathway-setup'
            );
        });

        it('skips a tutorial whose feature is disabled even when incomplete', () => {
            expectStage(buildCourse({ features: { scenarioGeneration: { enabled: false } } }), LEGACY_DONE, null);
        });

        it('keeps completion across a disable and re-enable cycle', () => {
            const taught: InstructorOnboardingProgress = { ...LEGACY_DONE, writingFeedback: true };
            expectStage(buildCourse({ features: { writingFeedback: { enabled: false } } }), taught, null);
            expectStage(buildCourse({ features: enabled('writingFeedback') }), taught, null);
        });

        it('triggers a never-completed tutorial when its feature is enabled later', () => {
            const taught: InstructorOnboardingProgress = { ...LEGACY_DONE, guidedPathway: true };
            expectStage(buildCourse(), taught, null);
            expectStage(buildCourse({ features: enabled('scenarioGeneration') }), taught, 'scenario-generation-setup');
        });

        it('carries a taught feature tutorial to a second course that enables it', () => {
            const all = enabled('scenarioGeneration', 'writingFeedback', 'guidedPathway');
            const taught: InstructorOnboardingProgress = {
                ...LEGACY_DONE,
                scenarioGeneration: true,
                writingFeedback: true,
                guidedPathway: true
            };
            expectStage(buildCourse({ features: all }), taught, null);
        });

        it('orders all three feature stages Scenario, Writing Feedback, Guided Pathway', () => {
            const all = enabled('scenarioGeneration', 'writingFeedback', 'guidedPathway');

            expectStage(buildCourse({ features: all }), LEGACY_DONE, 'scenario-generation-setup');
            expectStage(
                buildCourse({ features: all }),
                { ...LEGACY_DONE, scenarioGeneration: true },
                'writing-feedback-setup'
            );
            expectStage(
                buildCourse({ features: all }),
                { ...LEGACY_DONE, scenarioGeneration: true, writingFeedback: true },
                'guided-pathway-setup'
            );
            expectStage(
                buildCourse({ features: all }),
                { ...LEGACY_DONE, scenarioGeneration: true, writingFeedback: true, guidedPathway: true },
                null
            );
        });
    });

    describe('sequence invariants', () => {
        it('never runs a feature stage before document setup', () => {
            const all = enabled('scenarioGeneration', 'writingFeedback', 'guidedPathway');
            expectStage(buildCourse({ courseSetup: false, features: all }), {}, 'course-setup');
            expectStage(buildCourse({ features: all }), {}, 'document-setup');
        });

        it('never runs a feature stage after flag setup', () => {
            const all = enabled('scenarioGeneration', 'writingFeedback', 'guidedPathway');
            expectStage(
                buildCourse({ features: all }),
                { contentSetup: true },
                'scenario-generation-setup'
            );
            expectStage(
                buildCourse({ features: all }),
                {
                    contentSetup: true,
                    scenarioGeneration: true,
                    writingFeedback: true,
                    guidedPathway: true
                },
                'flag-setup'
            );
        });
    });

    /**
     * Course entry routes every staff member through this resolver via `isCourseStaff`,
     * but Course Setup's endpoint requires roster-management authority. Without the
     * distinction a teaching assistant was sent to a stage they could not complete and
     * looped on it at every course entry.
     */
    describe('roster authority', () => {
        it('offers course-setup to a roster manager', () => {
            expectStage(buildCourse({ courseSetup: false }), {}, 'course-setup', true);
        });

        it('owes a teaching assistant nothing while the course is unconfigured', () => {
            // Not merely "skip course-setup": every later stage files content under the
            // divisions course-setup defines, so document-setup on an unconfigured course
            // would trade the loop for a broken flow.
            expectStage(buildCourse({ courseSetup: false }), {}, null, false);
        });

        it('resumes the normal sequence for a teaching assistant once setup is done', () => {
            expectStage(buildCourse(), {}, 'document-setup', false);
        });

        it('treats every stage after course-setup identically for both authorities', () => {
            const cases: Array<[InstructorOnboardingProgress, InstructorOnboardingStage | null]> = [
                [{}, 'document-setup'],
                [{ contentSetup: true }, 'flag-setup'],
                [{ contentSetup: true, flagSetup: true }, 'monitor-setup'],
                [LEGACY_DONE, null]
            ];

            for (const [progress, stage] of cases) {
                expectStage(buildCourse(), progress, stage, true);
                expectStage(buildCourse(), progress, stage, false);
            }
        });

        it('defaults to roster-manager behaviour when authority is omitted', () => {
            const course = buildCourse({ courseSetup: false });
            expect(resolveNextOnboardingStage(course as OnboardingCourseProgress, {})).toBe('course-setup');
            expect(resolveInstructorModeRedirect(COURSE_ID, course, buildUser({})).redirect).toBe(
                expectedRedirect('course-setup')
            );
        });
    });

    describe('stage catalog', () => {
        it('lists the three feature stages in spec order with their feature keys', () => {
            expect(FEATURE_ONBOARDING_STAGES).toEqual([
                { stage: 'scenario-generation-setup', feature: 'scenarioGeneration' },
                { stage: 'writing-feedback-setup', feature: 'writingFeedback' },
                { stage: 'guided-pathway-setup', feature: 'guidedPathway' }
            ]);
        });
    });
});
