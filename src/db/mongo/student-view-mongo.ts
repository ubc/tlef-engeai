// student-view-mongo.ts
/**
 * student-view-mongo.ts
 * @description Student View test students: identity minting, lazy creation, lookup, and the
 *              scoped purge behind Reset.
 *
 * The exclusion rule itself lives in `student-view-filter.ts` and is re-exported here, so a
 * listing can import the rule without importing this module's write paths.
 */

import type { Document } from 'mongodb';
import type { activeCourse, CourseUser, GlobalUser } from '../../types/shared';
import { getCollectionNames } from './collection-registry-mongo';
import { createStudent, getCourseUsersMongoCollection } from './course-user-mongo';
import { initializeMemoryAgentForUser } from './memory-agent-mongo';
import type { MongoDalContext } from './mongo-context';
import { TEST_STUDENT_NAME, testStudentPuid } from './student-view-filter';
import { appLogger } from '../../utils/logger';

export {
    EXCLUDE_TEST_STUDENTS_MATCH,
    TEST_STUDENT_NAME,
    testStudentPuid,
    withoutTestStudents
} from './student-view-filter';

/** Identity of one staff member's test student in one course. */
export interface TestStudentIdentity {
    userId: string;
    courseId: string;
    ownerUserId: string;
}

/** `active-users` handle. Test students live beside real users so every identity path finds them. */
function activeUsers(ctx: MongoDalContext) {
    return ctx.db.collection('active-users');
}

/**
 * findTestStudentForOwner — the existing test student for one staff member in one course.
 *
 * @param courseId - Course being previewed
 * @param ownerUserId - `GlobalUser.userId` of the staff member
 * @returns Identity, or null when that staff member has never entered Student View here
 */
export async function findTestStudentForOwner(
    ctx: MongoDalContext,
    courseId: string,
    ownerUserId: string
): Promise<TestStudentIdentity | null> {
    const doc = await activeUsers(ctx).findOne({
        puid: testStudentPuid(courseId, ownerUserId),
        isTestStudent: true
    });
    if (!doc) {
        return null;
    }
    return { userId: (doc as unknown as GlobalUser).userId, courseId, ownerUserId };
}

/**
 * ensureTestStudentForOwner — lazily create this staff member's test student for this course.
 *
 * Idempotent: an existing test student is returned untouched, so chats survive re-entry and
 * only Reset clears them. A new one starts like a brand-new enrolment that has already
 * finished onboarding — `userOnboarding: true`, no chats — and receives the same empty
 * memory-agent row a real student gets on course entry, so the experience being previewed
 * is the real one.
 *
 * @param course - Course being previewed
 * @param ownerUserId - `GlobalUser.userId` of the staff member
 * @returns The test student's identity
 */
export async function ensureTestStudentForOwner(
    ctx: MongoDalContext,
    course: activeCourse,
    ownerUserId: string
): Promise<TestStudentIdentity> {
    const existing = await findTestStudentForOwner(ctx, course.id, ownerUserId);
    if (existing) {
        return existing;
    }

    // 1. Mint an identity from generated ids only — never from a real PUID.
    const puid = testStudentPuid(course.id, ownerUserId);
    const userId = ctx.idGenerator.globalUserID(puid, TEST_STUDENT_NAME, 'student');
    const now = new Date();

    // 2. The GlobalUser, enrolled in this one course, which is what refuses every other one.
    const globalUser: GlobalUser = {
        name: TEST_STUDENT_NAME,
        puid,
        userId,
        coursesEnrolled: [course.id],
        affiliation: 'student',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        studentOnboardingCompleted: true,
        isTestStudent: true,
        testStudentOwnerUserId: ownerUserId
    };
    await activeUsers(ctx).insertOne(globalUser as unknown as Document);

    // 3. The CourseUser, already past onboarding with an empty history.
    const courseUser: Partial<CourseUser> = {
        name: TEST_STUDENT_NAME,
        userId,
        courseName: course.courseName,
        courseId: course.id,
        userOnboarding: true,
        affiliation: 'student',
        status: 'active',
        chats: [],
        isTestStudent: true,
        testStudentOwnerUserId: ownerUserId
    };
    await createStudent(ctx, course.courseName, courseUser);

    // 4. Same empty memory-agent row a real student gets; a failure here must not block entry.
    try {
        await initializeMemoryAgentForUser(
            ctx,
            course.courseName,
            userId,
            TEST_STUDENT_NAME,
            'student'
        );
    } catch (error) {
        appLogger.error('[STUDENT-VIEW] memory agent init failed for test student', { error });
    }

    return { userId, courseId: course.id, ownerUserId };
}

/**
 * listTestStudentUserIds — every test-student `userId` in one course.
 *
 * For collections whose documents carry no `isTestStudent` field of their own
 * (`{courseName}_memory-agent`), where exclusion has to be by id.
 *
 * @param courseName - Logical course name
 * @returns Test-student user ids, empty when the course has none
 */
export async function listTestStudentUserIds(
    ctx: MongoDalContext,
    courseName: string
): Promise<string[]> {
    const users = await getCourseUsersMongoCollection(ctx, courseName);
    const rows = await users.find({ isTestStudent: true }, { projection: { userId: 1 } }).toArray();
    return rows
        .map((row) => (row as { userId?: string }).userId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/**
 * purgeTestStudentData — delete everything one test student produced.
 *
 * Called by Reset before recreation. The `isTestStudent` assertion is the safety interlock:
 * a `userId` that is not a flagged test student aborts the whole purge before any delete
 * runs, so a mistaken id can never reach a real student. Chats live inside the `CourseUser`
 * document, so deleting it deletes them.
 *
 * @param course - Course the test student belongs to
 * @param testStudentUserId - `userId` of the test student to clear
 * @throws When `testStudentUserId` is not a test student in this course
 */
export async function purgeTestStudentData(
    ctx: MongoDalContext,
    course: activeCourse,
    testStudentUserId: string
): Promise<void> {
    const users = await getCourseUsersMongoCollection(ctx, course.courseName);
    const subject = await users.findOne({ userId: testStudentUserId, isTestStudent: true });
    if (!subject) {
        throw new Error('Refusing to purge a user that is not a test student');
    }

    const names = await getCollectionNames(ctx, course.courseName);
    const scope = { userId: testStudentUserId };

    // 1. Chats travel inside the CourseUser document.
    await users.deleteMany(scope);
    // 2. Struggle / memory-agent state.
    await ctx.db.collection(names.memoryAgent).deleteMany(scope);
    // 3. Manual flags raised while previewing.
    await ctx.db.collection(names.flags).deleteMany(scope);
    // 4. Scenario practice drafts, when the course has been given the collection.
    if (course.collections?.scenarioProgress) {
        await ctx.db.collection(course.collections.scenarioProgress).deleteMany(scope);
    }
}
