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

import {
    ONBOARDING_STAGE_LABELS,
    SKIPPABLE_ONBOARDING_STAGES,
    buildOnboardingStageSequence,
    isSkippableOnboardingStage,
    resolveInstructorModeRedirect,
    resolveOnboardingStagePosition
} from '../instructor-onboarding-redirect';
import {
    FEATURE_ONBOARDING_STAGES,
    ONBOARDING_STAGE_LABELS as BROWSER_STAGE_LABELS,
    SKIPPABLE_ONBOARDING_STAGES as BROWSER_SKIPPABLE_STAGES,
    buildOnboardingStageSequence as browserBuildStageSequence,
    isSkippableOnboardingStage as browserIsSkippableStage,
    resolveNextOnboardingStage,
    resolveOnboardingStagePosition as browserResolveStagePosition,
    type InstructorOnboardingStage,
    type OnboardingCourseProgress,
    type OnboardingUserProgress
} from '../../../public/scripts/utils/onboarding-stage-order';
import type { activeCourse, GlobalUser, InstructorOnboardingProgress } from '../../types/shared';

const COURSE_ID = 'abcdef123456';
const FEATURE_KEYS = ['scenarioGeneration', 'writingFeedback', 'guidedPathway'] as const;

/** Progress for someone who has been taught every inherited tutorial and no feature one. */
const LEGACY_DONE: InstructorOnboardingProgress = {
    contentSetup: true,
    flagSetup: true,
    monitorSetup: true
};

const FULL_DONE: InstructorOnboardingProgress = {
    ...LEGACY_DONE,
    scenarioGeneration: true,
    writingFeedback: true,
    guidedPathway: true
};

/** One division carrying a filed item, which is what proves a course holds content. */
const FILED_CONTENT = [{ id: 'w1', items: [{ id: 'i1' }] }] as unknown as activeCourse['topicOrWeekInstances'];

/** Divisions Course Setup created but Document Setup never filled. */
const EMPTY_DIVISIONS = [{ id: 'w1', items: [] }] as unknown as activeCourse['topicOrWeekInstances'];

/**
 * Builds a fully configured course whose missing feature map inherits registry defaults.
 *
 * Content is filed by default because that is what a course past Document Setup looks
 * like, and the resolver reads the items to decide whether the stage is still owed.
 */
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
        topicOrWeekInstances: FILED_CONTENT,
        ...overrides
    } as activeCourse;
}

/** Wraps tutorial progress in the shape the backend resolver reads. */
function buildUser(progress: InstructorOnboardingProgress): Pick<GlobalUser, 'instructorOnboarding'> {
    return { instructorOnboarding: progress };
}

function disabled(...features: Array<'scenarioGeneration' | 'writingFeedback' | 'guidedPathway'>) {
    return features.reduce<Record<string, { enabled: boolean }>>((map, feature) => {
        map[feature] = { enabled: false };
        return map;
    }, {});
}

function enabled(...features: Array<'scenarioGeneration' | 'writingFeedback' | 'guidedPathway'>) {
    const map = disabled(...FEATURE_KEYS);
    for (const feature of features) {
        map[feature] = { enabled: true };
    }
    return map;
}

const NO_FEATURES = disabled(...FEATURE_KEYS);

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

        it('advances to the first default-on feature once documents are complete', () => {
            expectStage(buildCourse(), { contentSetup: true }, 'scenario-generation-setup');
        });

        it('advances to flag-setup once documents are complete and every feature is disabled', () => {
            expectStage(buildCourse({ features: NO_FEATURES }), { contentSetup: true }, 'flag-setup');
        });

        it('advances to monitor-setup as the final inherited stage', () => {
            expectStage(buildCourse({ features: NO_FEATURES }), { contentSetup: true, flagSetup: true }, 'monitor-setup');
        });

        it('resolves to the dashboard when every stage is complete', () => {
            expectStage(buildCourse(), FULL_DONE, null);
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
            expectStage(buildCourse({ courseSetup: false }), FULL_DONE, 'course-setup');
            expectStage(buildCourse(), FULL_DONE, null);
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

    /**
     * Document Setup teaches the instructor *and* files the course's content, so it is owed
     * when either job is outstanding.
     *
     * OB-002 moved the tutorial onto the user so a colleague joining a configured course is
     * still taught. That left the other half unowned: a veteran creating their second course
     * was taught nothing and landed on the dashboard with an empty course. `courseSetup` was
     * always kept on the course for exactly this reason, and content is course state by the
     * same argument, so the course now carries `contentSetup` as "content has been filed".
     *
     * `undefined` means a course that predates the field and is left alone: forcing the stage
     * on every legacy course would send established instructors back through it.
     */
    describe('document setup is owed for the course as well as the person', () => {
        it('teaches a veteran on a newly provisioned course with no content', () => {
            expectStage(buildCourse({ contentSetup: false, topicOrWeekInstances: EMPTY_DIVISIONS }), FULL_DONE, 'document-setup');
        });

        it('still teaches a newcomer on a course whose content is already filed', () => {
            expectStage(buildCourse({ contentSetup: true, topicOrWeekInstances: FILED_CONTENT }), {}, 'document-setup');
        });

        it('asks nobody once the content is filed and the viewer has been taught', () => {
            expectStage(buildCourse({ contentSetup: true, topicOrWeekInstances: FILED_CONTENT }), FULL_DONE, null);
        });

        /**
         * The regression this predicate exists to avoid. `provisionCourse` has written
         * `contentSetup: false` on every course created since OB-002 and nothing wrote it
         * back, so a flag-only test would re-teach every one of them.
         */
        it('leaves a course whose content is filed but whose flag was never updated', () => {
            expectStage(buildCourse({ contentSetup: false, topicOrWeekInstances: FILED_CONTENT }), FULL_DONE, null);
        });

        it('treats divisions without items as no content, since Course Setup creates them', () => {
            expectStage(buildCourse({ topicOrWeekInstances: EMPTY_DIVISIONS }), FULL_DONE, 'document-setup');
        });

        it('lets a recorded flag settle a course with no items', () => {
            expectStage(buildCourse({ contentSetup: true, topicOrWeekInstances: EMPTY_DIVISIONS }), FULL_DONE, null);
        });

        it('keeps course setup ahead of an unfiled course', () => {
            expectStage(
                buildCourse({ courseSetup: false, contentSetup: false, topicOrWeekInstances: EMPTY_DIVISIONS }),
                FULL_DONE,
                'course-setup'
            );
        });

        it('owes a teaching assistant nothing on an unconfigured course', () => {
            expectStage(
                buildCourse({ courseSetup: false, contentSetup: false, topicOrWeekInstances: EMPTY_DIVISIONS }),
                FULL_DONE,
                null,
                false
            );
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
            expectStage(
                buildCourse({ features: { ...NO_FEATURES, writingFeedback: { enabled: true } } }),
                progress,
                'writing-feedback-setup'
            );
        });

        it('treats an explicit false the same as a missing value', () => {
            expectStage(
                buildCourse({ features: enabled('guidedPathway') }),
                { ...LEGACY_DONE, guidedPathway: false },
                'guided-pathway-setup'
            );
        });

        it('skips a tutorial whose feature is disabled even when incomplete', () => {
            expectStage(buildCourse({ features: NO_FEATURES }), LEGACY_DONE, null);
        });

        it('keeps completion across a disable and re-enable cycle', () => {
            const taught: InstructorOnboardingProgress = { ...LEGACY_DONE, writingFeedback: true };
            expectStage(buildCourse({ features: { ...NO_FEATURES, writingFeedback: { enabled: false } } }), taught, null);
            expectStage(buildCourse({ features: enabled('writingFeedback') }), taught, null);
        });

        it('triggers a never-completed tutorial when its feature is enabled later', () => {
            const taught: InstructorOnboardingProgress = { ...LEGACY_DONE, guidedPathway: true };
            expectStage(buildCourse({ features: NO_FEATURES }), taught, null);
            expectStage(
                buildCourse({ features: { ...NO_FEATURES, scenarioGeneration: { enabled: true } } }),
                taught,
                'scenario-generation-setup'
            );
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
                [{ contentSetup: true }, 'scenario-generation-setup'],
                [{ contentSetup: true, scenarioGeneration: true, writingFeedback: true, guidedPathway: true }, 'flag-setup'],
                [{ contentSetup: true, scenarioGeneration: true, writingFeedback: true, guidedPathway: true, flagSetup: true }, 'monitor-setup'],
                [FULL_DONE, null]
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

/**
 * Stage sequence, position, labels and the skippable set.
 *
 * These feed the tutorial chrome and the Skip tutorial affordance (D-130, D-133).
 * The sequence deliberately ignores completion: it is the denominator of
 * "Tutorial 3 of 7", which must not shrink as stages are finished.
 */
describe('onboarding stage sequence and position', () => {
    const ALL_FEATURES = enabled(...FEATURE_KEYS);
    const ALL_STAGES: InstructorOnboardingStage[] = [
        'course-setup',
        'document-setup',
        'scenario-generation-setup',
        'writing-feedback-setup',
        'guided-pathway-setup',
        'flag-setup',
        'monitor-setup'
    ];

    it('sequences all seven stages for a roster manager on a fully enabled course', () => {
        expect(buildOnboardingStageSequence(buildCourse({ features: ALL_FEATURES }), true)).toEqual(ALL_STAGES);
    });

    it('drops a disabled capability from the sequence', () => {
        const course = buildCourse({ features: enabled('scenarioGeneration', 'guidedPathway') });
        const sequence = buildOnboardingStageSequence(course, true);
        expect(sequence).not.toContain('writing-feedback-setup');
        expect(sequence).toHaveLength(6);
    });

    it('omits course setup for a teaching assistant', () => {
        const sequence = buildOnboardingStageSequence(buildCourse({ features: ALL_FEATURES }), false);
        expect(sequence).not.toContain('course-setup');
        expect(sequence[0]).toBe('document-setup');
        expect(sequence).toHaveLength(6);
    });

    it('reports a one-based position out of the viewer-specific total', () => {
        expect(
            resolveOnboardingStagePosition('writing-feedback-setup', buildCourse({ features: ALL_FEATURES }), true)
        ).toEqual({ index: 4, total: 7 });
        expect(
            resolveOnboardingStagePosition(
                'flag-setup',
                buildCourse({ features: enabled('writingFeedback', 'guidedPathway') }),
                true
            )
        ).toEqual({ index: 5, total: 6 });
        expect(
            resolveOnboardingStagePosition('document-setup', buildCourse({ features: ALL_FEATURES }), false)
        ).toEqual({ index: 1, total: 6 });
    });

    it('returns null for a stage the viewer is never routed through', () => {
        expect(
            resolveOnboardingStagePosition('course-setup', buildCourse({ features: ALL_FEATURES }), false)
        ).toBeNull();
        expect(
            resolveOnboardingStagePosition(
                'writing-feedback-setup',
                buildCourse({ features: enabled('scenarioGeneration', 'guidedPathway') }),
                true
            )
        ).toBeNull();
    });

    it('treats every stage after document setup as skippable', () => {
        expect(SKIPPABLE_ONBOARDING_STAGES).toEqual([
            'scenario-generation-setup',
            'writing-feedback-setup',
            'guided-pathway-setup',
            'flag-setup',
            'monitor-setup'
        ]);
        expect(isSkippableOnboardingStage('course-setup')).toBe(false);
        expect(isSkippableOnboardingStage('document-setup')).toBe(false);
        expect(isSkippableOnboardingStage('monitor-setup')).toBe(true);
    });

    it('labels every stage without an internal slug', () => {
        expect(ONBOARDING_STAGE_LABELS).toEqual({
            'course-setup': 'Course Setup',
            'document-setup': 'Course Content',
            'scenario-generation-setup': 'Scenario Generation',
            'writing-feedback-setup': 'Writing Feedback',
            'guided-pathway-setup': 'Guided Pathway',
            'flag-setup': 'Flags',
            'monitor-setup': 'Monitor'
        });
        ALL_STAGES.forEach(stage => expect(ONBOARDING_STAGE_LABELS[stage]).not.toContain('-'));
    });
});

/**
 * Parity for the new helpers.
 *
 * Same contract as the pre-existing stage-order parity: neither module can import
 * the other, so every input combination is asserted on both.
 */
describe('browser and backend stage helpers agree', () => {
    const courses = [
        buildCourse({ features: enabled(...FEATURE_KEYS) }),
        buildCourse({ features: enabled('writingFeedback') }),
        buildCourse({ features: NO_FEATURES }),
        buildCourse({ courseSetup: false, features: enabled('guidedPathway') })
    ];
    const stages: InstructorOnboardingStage[] = [
        'course-setup',
        'document-setup',
        'scenario-generation-setup',
        'writing-feedback-setup',
        'guided-pathway-setup',
        'flag-setup',
        'monitor-setup'
    ];

    it('produces identical labels and skippable sets', () => {
        expect(BROWSER_STAGE_LABELS).toEqual(ONBOARDING_STAGE_LABELS);
        expect(BROWSER_SKIPPABLE_STAGES).toEqual(SKIPPABLE_ONBOARDING_STAGES);
        stages.forEach(stage =>
            expect(browserIsSkippableStage(stage)).toBe(isSkippableOnboardingStage(stage))
        );
    });

    it('produces identical sequences and positions for every input combination', () => {
        for (const course of courses) {
            for (const canManageRoster of [true, false]) {
                expect(browserBuildStageSequence(course as OnboardingCourseProgress, canManageRoster)).toEqual(
                    buildOnboardingStageSequence(course, canManageRoster)
                );
                for (const stage of stages) {
                    expect(
                        browserResolveStagePosition(stage, course as OnboardingCourseProgress, canManageRoster)
                    ).toEqual(resolveOnboardingStagePosition(stage, course, canManageRoster));
                }
            }
        }
    });
});
