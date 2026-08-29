/**
 * A student escalated to TA is taught once, then carries that progress to later courses.
 *
 * Exercises the real round trip: each stage completion writes through
 * `completeInstructorOnboardingStage`, and the resulting record drives
 * `resolveInstructorModeRedirect` on the next course.
 */

import type { activeCourse, GlobalUser } from '../../types/shared';
import type { MongoDalContext } from '../../db/mongo/mongo-context';

jest.mock('../../db/mongo/mongo-collections', () => ({
    activeUsersMongoCollection: jest.fn(),
}));

import { activeUsersMongoCollection } from '../../db/mongo/mongo-collections';
import { completeInstructorOnboardingStage } from '../../db/mongo/global-user-mongo';
import { resolveInstructorModeRedirect } from '../instructor-onboarding-redirect';

/** Stand-in for the stored document, applying dotted $set the way MongoDB would. */
function fakeActiveUsers(doc: Record<string, any>) {
    const findOneAndUpdate = jest.fn(async (_filter: any, update: any) => {
        for (const [path, value] of Object.entries(update.$set)) {
            const parts = path.split('.');
            let cursor = doc;
            for (const key of parts.slice(0, -1)) {
                cursor[key] = cursor[key] ?? {};
                cursor = cursor[key];
            }
            cursor[parts[parts.length - 1]!] = value;
        }
        return doc;
    });
    (activeUsersMongoCollection as jest.Mock).mockReturnValue({ findOneAndUpdate });
    return doc;
}

function makeCourse(id: string, courseSetup = true): activeCourse {
    return {
        id,
        date: new Date('2026-01-01T00:00:00.000Z'),
        courseSetup,
        courseName: `Course ${id}`,
        instructors: [],
        teachingAssistants: [],
        frameType: 'byWeek',
        tilesNumber: 12,
        topicOrWeekInstances: [],
    } as activeCourse;
}

const ctx = { db: {}, idGenerator: {} } as unknown as MongoDalContext;

beforeEach(() => {
    jest.clearAllMocks();
});

it('teaches a newly promoted TA once, then skips them on later courses', async () => {
    // A student promoted to TA: affiliation stays 'student', all tutorials owed.
    const stored = fakeActiveUsers({
        puid: 'p-ta',
        affiliation: 'student',
        instructorOnboarding: { contentSetup: false, flagSetup: false, monitorSetup: false },
    });

    const first = makeCourse('course-one');

    // Stage by stage, the TA is walked through the tutorials in order.
    expect(resolveInstructorModeRedirect('course-one', first, stored as GlobalUser).redirect).toBe(
        '/course/course-one/instructor/onboarding/document-setup'
    );
    await completeInstructorOnboardingStage(ctx, 'p-ta', 'contentSetup');

    expect(resolveInstructorModeRedirect('course-one', first, stored as GlobalUser).redirect).toBe(
        '/course/course-one/instructor/onboarding/flag-setup'
    );
    await completeInstructorOnboardingStage(ctx, 'p-ta', 'flagSetup');

    expect(resolveInstructorModeRedirect('course-one', first, stored as GlobalUser).redirect).toBe(
        '/course/course-one/instructor/onboarding/monitor-setup'
    );
    await completeInstructorOnboardingStage(ctx, 'p-ta', 'monitorSetup');

    // Every stage is now recorded on the user, not on the course.
    expect(stored.instructorOnboarding).toEqual({
        contentSetup: true,
        flagSetup: true,
        monitorSetup: true,
    });

    // Same course: straight to the dashboard.
    expect(resolveInstructorModeRedirect('course-one', first, stored as GlobalUser)).toEqual({
        redirect: '/course/course-one/instructor/dashboard',
        requiresOnboarding: false,
    });

    // A different course they TA later: no repeat of the tutorials.
    expect(
        resolveInstructorModeRedirect('course-two', makeCourse('course-two'), stored as GlobalUser)
    ).toEqual({
        redirect: '/course/course-two/instructor/dashboard',
        requiresOnboarding: false,
    });
});

it('keeps a TA out of course setup on an unconfigured course they did not create', async () => {
    // courseSetup is course state, so it is still owed even by a fully taught TA.
    const stored = {
        puid: 'p-ta',
        affiliation: 'student',
        instructorOnboarding: { contentSetup: true, flagSetup: true, monitorSetup: true },
    };

    expect(
        resolveInstructorModeRedirect('course-three', makeCourse('course-three', false), stored as GlobalUser)
            .redirect
    ).toBe('/course/course-three/instructor/onboarding/course-setup');
});
