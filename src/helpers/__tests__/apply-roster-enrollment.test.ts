/**
 * apply-roster-enrollment — login-time enrollment from stored LMS roster snapshots
 *
 * The behaviours pinned here are the ones whose failure modes are silent or severe:
 *
 * - A roster lookup failure must never block a login. Locking a user out of EngE-AI because
 *   Canvas enrollment could not be resolved is far worse than a missing course tile, and the
 *   next login retries for free.
 * - A course still in setup must not reach students. An imported course exists before its
 *   instructor has configured it, and surfacing it then shows a course with no content.
 * - The check must be idempotent. It runs on every sign-in, so any accumulation would compound.
 * - A deployment with no hashing salt must degrade to a no-op, not throw: course-code entry is
 *   unaffected and must keep working.
 */

jest.mock('../../utils/logger', () => ({
    appLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { applyRosterEnrollment } from '../apply-roster-enrollment';
import { hashRosterPuid, ROSTER_SALT_ENV } from '../../utils/roster-identity';
import type { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import type { activeCourse, GlobalUser } from '../../types/shared';

function makeUser(overrides: Partial<GlobalUser> = {}): GlobalUser {
    return {
        name: 'Test Student',
        puid: 'puid-one',
        userId: 'user-1',
        coursesEnrolled: [],
        affiliation: 'student',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as GlobalUser;
}

function makeMongo(options: {
    matches?: Array<{ courseId: string; lmsUserId: string }>;
    courses?: Record<string, Partial<activeCourse> | null>;
} = {}) {
    const courses = options.courses ?? {};
    return {
        findCoursesByRosterIdentity: jest.fn().mockResolvedValue(options.matches ?? []),
        getActiveCourse: jest.fn(async (id: string) => (courses[id] ?? null) as activeCourse | null),
        enrollUserInCourse: jest.fn().mockResolvedValue(undefined),
        findGlobalUserByPUID: jest.fn(async () => makeUser({ coursesEnrolled: ['course-1'] })),
    } as unknown as EngEAI_MongoDB & Record<string, jest.Mock>;
}

const ORIGINAL_SALT = process.env[ROSTER_SALT_ENV];

beforeEach(() => {
    process.env[ROSTER_SALT_ENV] = 'test-salt-value';
    jest.clearAllMocks();
});

afterAll(() => {
    if (ORIGINAL_SALT === undefined) {
        delete process.env[ROSTER_SALT_ENV];
    } else {
        process.env[ROSTER_SALT_ENV] = ORIGINAL_SALT;
    }
});

describe('applyRosterEnrollment', () => {
    it('enrolls the user as a student in a matched, set-up course', async () => {
        const mongo = makeMongo({
            matches: [{ courseId: 'course-1', lmsUserId: '11' }],
            courses: { 'course-1': { id: 'course-1', courseSetup: true } },
        });

        const result = await applyRosterEnrollment(mongo, makeUser());

        expect(mongo.findCoursesByRosterIdentity).toHaveBeenCalledWith(hashRosterPuid('puid-one'));
        expect(mongo.enrollUserInCourse).toHaveBeenCalledWith(expect.anything(), 'course-1', 'student');
        // The session must carry the new enrollment immediately, not one login later.
        expect(result.coursesEnrolled).toContain('course-1');
    });

    it('skips a course whose instructor has not finished setup', async () => {
        const mongo = makeMongo({
            matches: [{ courseId: 'course-1', lmsUserId: '11' }],
            courses: { 'course-1': { id: 'course-1', courseSetup: false } },
        });

        await applyRosterEnrollment(mongo, makeUser());

        expect(mongo.enrollUserInCourse).not.toHaveBeenCalled();
    });

    it('skips courses the user already has', async () => {
        const mongo = makeMongo({
            matches: [{ courseId: 'course-1', lmsUserId: '11' }],
            courses: { 'course-1': { id: 'course-1', courseSetup: true } },
        });

        const result = await applyRosterEnrollment(mongo, makeUser({ coursesEnrolled: ['course-1'] }));

        expect(mongo.enrollUserInCourse).not.toHaveBeenCalled();
        expect(result.coursesEnrolled).toEqual(['course-1']);
    });

    it('tolerates a roster that outlived its course', async () => {
        const mongo = makeMongo({
            matches: [{ courseId: 'gone', lmsUserId: '11' }],
            courses: {},
        });

        await expect(applyRosterEnrollment(mongo, makeUser())).resolves.toBeDefined();
        expect(mongo.enrollUserInCourse).not.toHaveBeenCalled();
    });

    it('returns the user unchanged when a lookup throws, so the login continues', async () => {
        const mongo = makeMongo();
        (mongo.findCoursesByRosterIdentity as jest.Mock).mockRejectedValue(new Error('mongo down'));

        const user = makeUser();
        await expect(applyRosterEnrollment(mongo, user)).resolves.toBe(user);
    });

    it('is a no-op when the deployment has no hashing salt', async () => {
        delete process.env[ROSTER_SALT_ENV];
        const mongo = makeMongo({ matches: [{ courseId: 'course-1', lmsUserId: '11' }] });

        const user = makeUser();
        await expect(applyRosterEnrollment(mongo, user)).resolves.toBe(user);
        // Must not hash, and must not query: an unconfigured deployment simply has no snapshots.
        expect(mongo.findCoursesByRosterIdentity).not.toHaveBeenCalled();
    });

    it('is a no-op for a user with no PUID', async () => {
        const mongo = makeMongo({ matches: [{ courseId: 'course-1', lmsUserId: '11' }] });

        const user = makeUser({ puid: '' });
        await expect(applyRosterEnrollment(mongo, user)).resolves.toBe(user);
        expect(mongo.findCoursesByRosterIdentity).not.toHaveBeenCalled();
    });

    it('does not re-read the user when nothing was granted', async () => {
        const mongo = makeMongo({ matches: [] });

        const user = makeUser();
        await expect(applyRosterEnrollment(mongo, user)).resolves.toBe(user);
        expect(mongo.findGlobalUserByPUID).not.toHaveBeenCalled();
    });
});
