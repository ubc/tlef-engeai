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
 * @author: @rdschrs
 */

import { resolveInstructorModeRedirect } from '../instructor-onboarding-redirect';
import {
    FEATURE_ONBOARDING_STAGES,
    resolveNextOnboardingStage,
    type InstructorOnboardingStage,
    type OnboardingCourseProgress
} from '../../../public/scripts/utils/onboarding-stage-order';
import type { activeCourse } from '../../types/shared';

const COURSE_ID = 'abcdef123456';

/** Builds a course whose legacy stages are all complete and no feature enabled. */
function buildCourse(overrides: Partial<activeCourse> = {}): activeCourse {
    return {
        id: COURSE_ID,
        date: new Date('2026-08-17T00:00:00.000Z'),
        courseSetup: true,
        contentSetup: true,
        flagSetup: true,
        monitorSetup: true,
        courseName: 'CHBE 241',
        instructors: [],
        teachingAssistants: [],
        frameType: 'byWeek',
        tilesNumber: 12,
        topicOrWeekInstances: [],
        ...overrides
    } as activeCourse;
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
    stage: InstructorOnboardingStage | null,
    canManageRoster = true
): void {
    expect(resolveNextOnboardingStage(course as OnboardingCourseProgress, canManageRoster)).toBe(stage);

    const result = resolveInstructorModeRedirect(COURSE_ID, course, canManageRoster);
    expect(result.redirect).toBe(expectedRedirect(stage));
    expect(result.requiresOnboarding).toBe(stage !== null);
}

describe('instructor onboarding stage order', () => {
    describe('legacy stages', () => {
        it('starts at course-setup when nothing is complete', () => {
            expectStage(
                buildCourse({ courseSetup: false, contentSetup: false, flagSetup: false, monitorSetup: false }),
                'course-setup'
            );
        });

        it('advances to document-setup once course setup is complete', () => {
            expectStage(
                buildCourse({ contentSetup: false, flagSetup: false, monitorSetup: false }),
                'document-setup'
            );
        });

        it('advances to flag-setup once documents are complete and no feature is enabled', () => {
            expectStage(buildCourse({ flagSetup: false, monitorSetup: false }), 'flag-setup');
        });

        it('advances to monitor-setup as the final legacy stage', () => {
            expectStage(buildCourse({ monitorSetup: false }), 'monitor-setup');
        });

        it('resolves to the dashboard when every stage is complete', () => {
            expectStage(buildCourse(), null);
        });
    });

    describe('feature stages', () => {
        it.each([
            ['scenarioGeneration', 'scenario-generation-setup'],
            ['writingFeedback', 'writing-feedback-setup'],
            ['guidedPathway', 'guided-pathway-setup']
        ] as const)('routes to %s tutorial when only that feature is enabled', (feature, stage) => {
            expectStage(buildCourse({ features: enabled(feature) }), stage);
        });

        it.each([
            ['scenarioGeneration', 'scenario-generation-setup'],
            ['writingFeedback', 'writing-feedback-setup'],
            ['guidedPathway', 'guided-pathway-setup']
        ] as const)('skips the %s tutorial once it is marked complete', (feature, _stage) => {
            expectStage(
                buildCourse({ features: enabled(feature), featureOnboarding: { [feature]: true } }),
                null
            );
        });

        it('treats an entirely absent featureOnboarding value as incomplete', () => {
            const course = buildCourse({ features: enabled('writingFeedback') });
            expect(course.featureOnboarding).toBeUndefined();
            expectStage(course, 'writing-feedback-setup');
        });

        it('treats an explicit false the same as a missing value', () => {
            expectStage(
                buildCourse({ features: enabled('guidedPathway'), featureOnboarding: { guidedPathway: false } }),
                'guided-pathway-setup'
            );
        });

        it('skips a tutorial whose feature is disabled even when incomplete', () => {
            expectStage(
                buildCourse({ features: { scenarioGeneration: { enabled: false } } }),
                null
            );
        });

        it('keeps completion across a disable and re-enable cycle', () => {
            const disabled = buildCourse({
                features: { writingFeedback: { enabled: false } },
                featureOnboarding: { writingFeedback: true }
            });
            expectStage(disabled, null);

            const reEnabled = buildCourse({
                features: enabled('writingFeedback'),
                featureOnboarding: { writingFeedback: true }
            });
            expectStage(reEnabled, null);
        });

        it('triggers a never-completed tutorial when its feature is enabled later', () => {
            const before = buildCourse({ featureOnboarding: { guidedPathway: true } });
            expectStage(before, null);

            const after = buildCourse({
                features: enabled('scenarioGeneration'),
                featureOnboarding: { guidedPathway: true }
            });
            expectStage(after, 'scenario-generation-setup');
        });

        it('orders all three feature stages Scenario, Writing Feedback, Guided Pathway', () => {
            const all = enabled('scenarioGeneration', 'writingFeedback', 'guidedPathway');

            expectStage(buildCourse({ features: all }), 'scenario-generation-setup');
            expectStage(
                buildCourse({ features: all, featureOnboarding: { scenarioGeneration: true } }),
                'writing-feedback-setup'
            );
            expectStage(
                buildCourse({
                    features: all,
                    featureOnboarding: { scenarioGeneration: true, writingFeedback: true }
                }),
                'guided-pathway-setup'
            );
            expectStage(
                buildCourse({
                    features: all,
                    featureOnboarding: { scenarioGeneration: true, writingFeedback: true, guidedPathway: true }
                }),
                null
            );
        });
    });

    describe('sequence invariants', () => {
        it('never runs a feature stage before document setup', () => {
            const all = enabled('scenarioGeneration', 'writingFeedback', 'guidedPathway');
            expectStage(
                buildCourse({ courseSetup: false, contentSetup: false, features: all }),
                'course-setup'
            );
            expectStage(buildCourse({ contentSetup: false, features: all }), 'document-setup');
        });

        it('never runs a feature stage after flag setup', () => {
            const all = enabled('scenarioGeneration', 'writingFeedback', 'guidedPathway');
            expectStage(
                buildCourse({ flagSetup: false, monitorSetup: false, features: all }),
                'scenario-generation-setup'
            );
            expectStage(
                buildCourse({
                    flagSetup: false,
                    monitorSetup: false,
                    features: all,
                    featureOnboarding: { scenarioGeneration: true, writingFeedback: true, guidedPathway: true }
                }),
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
            expectStage(buildCourse({ courseSetup: false }), 'course-setup', true);
        });

        it('owes a teaching assistant nothing while the course is unconfigured', () => {
            // Not merely "skip course-setup": every later stage files content under the
            // divisions course-setup defines, so document-setup on an unconfigured course
            // would trade the loop for a broken flow.
            expectStage(buildCourse({ courseSetup: false, contentSetup: false }), null, false);
        });

        it('resumes the normal sequence for a teaching assistant once setup is done', () => {
            expectStage(buildCourse({ contentSetup: false }), 'document-setup', false);
        });

        it('treats every stage after course-setup identically for both authorities', () => {
            const cases: Array<[Partial<activeCourse>, InstructorOnboardingStage | null]> = [
                [{ contentSetup: false }, 'document-setup'],
                [{ flagSetup: false }, 'flag-setup'],
                [{ monitorSetup: false }, 'monitor-setup'],
                [{}, null]
            ];

            for (const [overrides, stage] of cases) {
                expectStage(buildCourse(overrides), stage, true);
                expectStage(buildCourse(overrides), stage, false);
            }
        });

        it('defaults to roster-manager behaviour when authority is omitted', () => {
            const course = buildCourse({ courseSetup: false });
            expect(resolveNextOnboardingStage(course as OnboardingCourseProgress)).toBe('course-setup');
            expect(resolveInstructorModeRedirect(COURSE_ID, course).redirect).toBe(
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
