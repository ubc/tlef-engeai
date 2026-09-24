/**
 * student-view-mongo.test.ts
 *
 * Pins the three guarantees Student View rests on: one exclusion rule shared by every
 * staff-facing listing, a test student minted from generated ids rather than a real PUID,
 * and a purge that cannot touch anyone who is not a flagged test student.
 */

import type { activeCourse } from '../../../types/shared';

const createStudentMock = jest.fn(async (_ctx: unknown, _courseName: string, doc: unknown) => doc);
const getCourseUsersMongoCollectionMock = jest.fn();
const getCollectionNamesMock = jest.fn(async () => ({
    users: 'DemoCourse_users',
    flags: 'DemoCourse_flags',
    memoryAgent: 'DemoCourse_memory-agent',
    guidedPathwayFlags: 'DemoCourse_guided_pathway_flags'
}));
const initializeMemoryAgentForUserMock = jest.fn(async () => undefined);

jest.mock('../course-user-mongo', () => ({
    createStudent: (...args: unknown[]) => (createStudentMock as any)(...args),
    getCourseUsersMongoCollection: (...args: unknown[]) =>
        (getCourseUsersMongoCollectionMock as any)(...args)
}));

jest.mock('../collection-registry-mongo', () => ({
    getCollectionNames: (...args: unknown[]) => (getCollectionNamesMock as any)(...args)
}));

jest.mock('../memory-agent-mongo', () => ({
    initializeMemoryAgentForUser: (...args: unknown[]) =>
        (initializeMemoryAgentForUserMock as any)(...args)
}));

import {
    EXCLUDE_TEST_STUDENTS_MATCH,
    ensureTestStudentForOwner,
    findTestStudentForOwner,
    listTestStudentUserIds,
    purgeTestStudentData,
    testStudentPuid,
    withoutTestStudents
} from '../student-view-mongo';

const course = {
    id: 'course-1',
    courseName: 'DemoCourse',
    instructors: [],
    teachingAssistants: [],
    collections: { scenarioProgress: 'DemoCourse_scenario_progress' }
} as unknown as activeCourse;

/** Minimal MongoDalContext double: one `active-users` collection plus per-name course collections. */
function makeCtx(options: { existingGlobalUser?: unknown; courseUserRow?: unknown } = {}) {
    const activeUsers = {
        findOne: jest.fn(async (_filter: Record<string, unknown>) => options.existingGlobalUser ?? null),
        insertOne: jest.fn(async (_doc: Record<string, unknown>) => ({
            insertedId: 'inserted-global-user'
        })),
        deleteMany: jest.fn(async (_filter: Record<string, unknown>) => ({ deletedCount: 1 }))
    };

    const users = {
        findOne: jest.fn(async (_filter: Record<string, unknown>) => options.courseUserRow ?? null),
        find: jest.fn((_filter: Record<string, unknown>, _options?: Record<string, unknown>) => ({
            toArray: async () => [{ userId: 'ts-user-1' }, { userId: 'ts-user-2' }]
        })),
        deleteMany: jest.fn(async (_filter: Record<string, unknown>) => ({ deletedCount: 1 }))
    };

    const courseCollections = new Map<string, { deleteMany: jest.Mock }>();
    const collectionFor = (name: string) => {
        if (name === 'active-users') return activeUsers as unknown as Record<string, unknown>;
        if (!courseCollections.has(name)) {
            courseCollections.set(name, {
                deleteMany: jest.fn(async (_filter: Record<string, unknown>) => ({ deletedCount: 1 }))
            });
        }
        return courseCollections.get(name) as unknown as Record<string, unknown>;
    };

    getCourseUsersMongoCollectionMock.mockResolvedValue(users);

    const ctx = {
        db: { collection: jest.fn((name: string) => collectionFor(name)) },
        idGenerator: {
            globalUserID: jest.fn(() => 'ts-user-1'),
            userID: jest.fn(() => 'ts-row-1')
        }
    } as unknown as never;

    return { ctx, activeUsers, users, courseCollections };
}

describe('test-student-mongo exclusion fragment', () => {
    it('excludes rows flagged as test students and keeps rows without the field', () => {
        expect(EXCLUDE_TEST_STUDENTS_MATCH).toEqual({ isTestStudent: { $ne: true } });
    });

    it('merges into an existing filter without dropping its keys', () => {
        expect(withoutTestStudents({ affiliation: 'student' })).toEqual({
            affiliation: 'student',
            isTestStudent: { $ne: true }
        });
    });

    it('mints a synthetic identifier that carries no real PUID', () => {
        expect(testStudentPuid('course-1', 'owner-9')).toBe('test-student:course-1:owner-9');
    });
});

describe('ensureTestStudentForOwner', () => {
    it('creates a GlobalUser marked as a test student, enrolled only in this course', async () => {
        const { ctx, activeUsers } = makeCtx();

        const identity = await ensureTestStudentForOwner(ctx, course, 'owner-9');

        expect(identity).toEqual({ userId: 'ts-user-1', courseId: 'course-1', ownerUserId: 'owner-9' });
        expect(activeUsers.insertOne).toHaveBeenCalledTimes(1);
        expect(activeUsers.insertOne.mock.calls[0][0]).toMatchObject({
            name: 'Test student',
            affiliation: 'student',
            isTestStudent: true,
            testStudentOwnerUserId: 'owner-9',
            coursesEnrolled: ['course-1'],
            puid: 'test-student:course-1:owner-9'
        });
    });

    it('creates the CourseUser with onboarding already complete and no chats', async () => {
        const { ctx } = makeCtx();

        await ensureTestStudentForOwner(ctx, course, 'owner-9');

        expect(createStudentMock).toHaveBeenCalledTimes(1);
        expect(createStudentMock.mock.calls[0][2]).toMatchObject({
            name: 'Test student',
            userId: 'ts-user-1',
            courseId: 'course-1',
            userOnboarding: true,
            affiliation: 'student',
            isTestStudent: true,
            testStudentOwnerUserId: 'owner-9',
            chats: []
        });
    });

    it('gives the test student the empty memory-agent row a real student gets on entry', async () => {
        const { ctx } = makeCtx();

        await ensureTestStudentForOwner(ctx, course, 'owner-9');

        expect(initializeMemoryAgentForUserMock).toHaveBeenCalledWith(
            ctx,
            'DemoCourse',
            'ts-user-1',
            'Test student',
            'student'
        );
    });

    it('returns the existing test student untouched, so chats survive re-entry', async () => {
        const { ctx, activeUsers } = makeCtx({
            existingGlobalUser: { userId: 'ts-existing', isTestStudent: true },
            courseUserRow: { userId: 'ts-existing', isTestStudent: true }
        });

        const identity = await ensureTestStudentForOwner(ctx, course, 'owner-9');

        expect(identity.userId).toBe('ts-existing');
        expect(activeUsers.insertOne).not.toHaveBeenCalled();
        expect(createStudentMock).not.toHaveBeenCalled();
    });

    // Found in the 2026-09-21 browser pass: Reset deletes the CourseUser, which is where the
    // chats live, and deliberately leaves the GlobalUser. Short-circuiting on the GlobalUser
    // alone left the test student with no course record, and the next entry bounced the
    // viewer to course selection instead of the student shell.
    it('recreates the course record after a reset, when only the identity survives', async () => {
        const { ctx, activeUsers } = makeCtx({
            existingGlobalUser: { userId: 'ts-existing', isTestStudent: true }
            // no courseUserRow: this is the state Reset leaves behind
        });

        const identity = await ensureTestStudentForOwner(ctx, course, 'owner-9');

        expect(identity.userId).toBe('ts-existing');
        expect(activeUsers.insertOne).not.toHaveBeenCalled();
        expect(createStudentMock).toHaveBeenCalledTimes(1);
        expect(createStudentMock.mock.calls[0][2]).toMatchObject({
            userId: 'ts-existing',
            userOnboarding: true,
            isTestStudent: true,
            chats: []
        });
    });
});

describe('findTestStudentForOwner', () => {
    it('looks the test student up by its synthetic puid and the test-student flag', async () => {
        const { ctx, activeUsers } = makeCtx({
            existingGlobalUser: { userId: 'ts-existing', isTestStudent: true }
        });

        const identity = await findTestStudentForOwner(ctx, 'course-1', 'owner-9');

        expect(activeUsers.findOne).toHaveBeenCalledWith({
            puid: 'test-student:course-1:owner-9',
            isTestStudent: true
        });
        expect(identity).toEqual({
            userId: 'ts-existing',
            courseId: 'course-1',
            ownerUserId: 'owner-9'
        });
    });

    it('is null when that staff member has never entered student view here', async () => {
        const { ctx } = makeCtx();
        expect(await findTestStudentForOwner(ctx, 'course-1', 'owner-9')).toBeNull();
    });
});

describe('listTestStudentUserIds', () => {
    it('returns the ids used to exclude rows that carry no isTestStudent field of their own', async () => {
        const { ctx, users } = makeCtx();

        const ids = await listTestStudentUserIds(ctx, 'DemoCourse');

        expect(users.find).toHaveBeenCalledWith(
            { isTestStudent: true },
            { projection: { userId: 1 } }
        );
        expect(ids).toEqual(['ts-user-1', 'ts-user-2']);
    });
});

describe('purgeTestStudentData', () => {
    it('refuses to delete a userId that is not a test student', async () => {
        const { ctx, users } = makeCtx();

        await expect(purgeTestStudentData(ctx, course, 'real-student-1')).rejects.toThrow(
            'Refusing to purge a user that is not a test student'
        );
        expect(users.deleteMany).not.toHaveBeenCalled();
    });

    it('scopes every delete to the one test student userId', async () => {
        const { ctx, users, courseCollections } = makeCtx({
            courseUserRow: { userId: 'ts-user-1', isTestStudent: true }
        });

        await purgeTestStudentData(ctx, course, 'ts-user-1');

        expect(users.deleteMany).toHaveBeenCalledWith({ userId: 'ts-user-1' });
        const touched = [...courseCollections.entries()];
        expect(touched.map(([name]) => name).sort()).toEqual([
            'DemoCourse_flags',
            'DemoCourse_guided_pathway_flags',
            'DemoCourse_memory-agent',
            'DemoCourse_scenario_progress'
        ]);
        for (const [name, collection] of touched) {
            // Guided Pathway alerts record the student under studentUserId, not userId.
            const expected =
                name === 'DemoCourse_guided_pathway_flags'
                    ? { studentUserId: 'ts-user-1' }
                    : { userId: 'ts-user-1' };
            expect(collection.deleteMany).toHaveBeenCalledWith(expected);
        }
    });

    it('asserts the flag before deleting anything, so a real student is unreachable', async () => {
        const { ctx, users } = makeCtx();

        await expect(purgeTestStudentData(ctx, course, 'ts-user-1')).rejects.toThrow();

        expect(users.findOne).toHaveBeenCalledWith({ userId: 'ts-user-1', isTestStudent: true });
    });
});
