/**
 * resolveInstructorModeRedirect: course setup comes from the course, tutorials from the user.
 */

import type { activeCourse, GlobalUser } from '../../types/shared';
import { resolveInstructorModeRedirect } from '../instructor-onboarding-redirect';

const COURSE_ID = 'abc123def456';

function makeCourse(overrides: Partial<activeCourse> = {}): activeCourse {
    return {
        id: COURSE_ID,
        date: new Date('2026-01-01T00:00:00.000Z'),
        courseSetup: true,
        courseName: 'APSC 183',
        instructors: [],
        teachingAssistants: [],
        frameType: 'byWeek',
        tilesNumber: 12,
        topicOrWeekInstances: [],
        ...overrides,
    } as activeCourse;
}

function makeUser(progress?: GlobalUser['instructorOnboarding']): Pick<GlobalUser, 'instructorOnboarding'> {
    return { instructorOnboarding: progress };
}

const ALL_DONE = { contentSetup: true, flagSetup: true, monitorSetup: true };

describe('resolveInstructorModeRedirect', () => {
    it('sends an unconfigured course to course setup regardless of user progress', () => {
        const result = resolveInstructorModeRedirect(
            COURSE_ID,
            makeCourse({ courseSetup: false }),
            makeUser(ALL_DONE)
        );

        expect(result).toEqual({
            redirect: `/course/${COURSE_ID}/instructor/onboarding/course-setup`,
            requiresOnboarding: true,
        });
    });

    // The case this whole change exists for: instructor B joins a course instructor A set up.
    it('teaches a new instructor on an already-set-up course', () => {
        const result = resolveInstructorModeRedirect(COURSE_ID, makeCourse(), makeUser({}));

        expect(result).toEqual({
            redirect: `/course/${COURSE_ID}/instructor/onboarding/document-setup`,
            requiresOnboarding: true,
        });
    });

    it('never sends a second instructor back through course setup', () => {
        const result = resolveInstructorModeRedirect(COURSE_ID, makeCourse(), makeUser({}));

        expect(result.redirect).not.toContain('course-setup');
    });

    it('resumes at the first tutorial the user has not finished', () => {
        expect(
            resolveInstructorModeRedirect(
                COURSE_ID,
                makeCourse(),
                makeUser({ contentSetup: true })
            ).redirect
        ).toBe(`/course/${COURSE_ID}/instructor/onboarding/flag-setup`);

        expect(
            resolveInstructorModeRedirect(
                COURSE_ID,
                makeCourse(),
                makeUser({ contentSetup: true, flagSetup: true })
            ).redirect
        ).toBe(`/course/${COURSE_ID}/instructor/onboarding/monitor-setup`);
    });

    it('sends a fully taught instructor to the dashboard', () => {
        expect(resolveInstructorModeRedirect(COURSE_ID, makeCourse(), makeUser(ALL_DONE))).toEqual({
            redirect: `/course/${COURSE_ID}/instructor/dashboard`,
            requiresOnboarding: false,
        });
    });

    // A veteran creating a new course still configures it, but is not re-taught afterwards.
    it('asks a veteran to configure a new course without repeating the tutorials', () => {
        const fresh = makeCourse({ courseSetup: false });

        expect(resolveInstructorModeRedirect(COURSE_ID, fresh, makeUser(ALL_DONE)).redirect).toBe(
            `/course/${COURSE_ID}/instructor/onboarding/course-setup`
        );
        expect(
            resolveInstructorModeRedirect(COURSE_ID, makeCourse(), makeUser(ALL_DONE)).redirect
        ).toBe(`/course/${COURSE_ID}/instructor/dashboard`);
    });

    it('treats a missing user record as no progress rather than throwing', () => {
        expect(resolveInstructorModeRedirect(COURSE_ID, makeCourse(), null).redirect).toBe(
            `/course/${COURSE_ID}/instructor/onboarding/document-setup`
        );
        expect(resolveInstructorModeRedirect(COURSE_ID, makeCourse(), undefined).redirect).toBe(
            `/course/${COURSE_ID}/instructor/onboarding/document-setup`
        );
    });

    it('ignores stale course-level tutorial flags', () => {
        // Deprecated fields left on old documents must not grant progress.
        const stale = makeCourse({ contentSetup: true, flagSetup: true, monitorSetup: true });

        expect(resolveInstructorModeRedirect(COURSE_ID, stale, makeUser({})).redirect).toBe(
            `/course/${COURSE_ID}/instructor/onboarding/document-setup`
        );
    });
});
