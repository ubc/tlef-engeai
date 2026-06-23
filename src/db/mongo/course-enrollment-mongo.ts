/**
 * course-enrollment-mongo.ts
 *
 * Shared enrollment side effects: `coursesEnrolled` on `active-users` and `{courseName}_users` roster row.
 */

import type { GlobalUser, InstructorInfo, User, activeCourse } from '../../types/shared';
import { getActiveCourse } from './course-mongo';
import { createStudent, findStudentByUserId } from './course-user-mongo';
import { addCourseToGlobalUser, findGlobalUserByUserId } from './global-user-mongo';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';

/**
 * Idempotent enroll: `$addToSet` on global user + create faculty CourseUser when absent.
 */
export async function enrollUserInCourse(
    ctx: MongoDalContext,
    globalUser: GlobalUser,
    courseId: string,
    affiliation: 'faculty' | 'student' = 'faculty'
): Promise<void> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course not found: ${courseId}`);
    }

    const courseName = course.courseName;
    const userId = globalUser.userId;

    if (!globalUser.coursesEnrolled.includes(courseId)) {
        await addCourseToGlobalUser(ctx, globalUser.puid, courseId);
    }

    const existing = await findStudentByUserId(ctx, courseName, userId);
    if (!existing) {
        const newCourseUser: Partial<User> = {
            name: globalUser.name,
            userId,
            courseName,
            courseId,
            userOnboarding: affiliation === 'faculty',
            affiliation,
            status: 'active',
            chats: []
        };
        await createStudent(ctx, courseName, newCourseUser);
        appLogger.log(`[enrollment] Created CourseUser for ${globalUser.name} in ${courseName}`);
    }
}

/**
 * Ensures a platform admin is enrolled for roster/monitor consistency when entering a course.
 */
export async function ensureAdminCourseEnrollment(
    ctx: MongoDalContext,
    adminUser: GlobalUser,
    courseId: string
): Promise<void> {
    await enrollUserInCourse(ctx, adminUser, courseId, 'faculty');
}

/**
 * Enrolls multiple instructors by userId and merges them into `activeCourse.instructors`.
 */
export async function enrollInstructorsOnCourse(
    ctx: MongoDalContext,
    course: activeCourse,
    instructorUserIds: string[]
): Promise<InstructorInfo[]> {
    const instructors: InstructorInfo[] = [...normalizeInstructors(course.instructors)];

    for (const userId of instructorUserIds) {
        const globalUser = await findGlobalUserByUserId(ctx, userId);
        if (!globalUser) {
            appLogger.warn(`[enrollment] Skipping unknown instructor userId: ${userId}`);
            continue;
        }
        if (globalUser.affiliation !== 'faculty') {
            appLogger.warn(`[enrollment] Skipping non-faculty user ${userId} as instructor`);
            continue;
        }

        await enrollUserInCourse(ctx, globalUser, course.id, 'faculty');

        if (!instructors.some((i) => i.userId === userId)) {
            instructors.push({ userId, name: globalUser.name });
        }
    }

    return instructors;
}

function normalizeInstructors(
    raw: InstructorInfo[] | string[] | undefined
): InstructorInfo[] {
    if (!raw?.length) {
        return [];
    }
    return raw.map((inst) =>
        typeof inst === 'string' ? { userId: inst, name: 'Unknown' } : inst
    );
}
