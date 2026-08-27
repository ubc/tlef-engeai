/**
 * course-enrollment-mongo.ts
 *
 * Shared enrollment side effects: `coursesEnrolled` on `active-users` and `{courseName}_users` roster row.
 */

import type { GlobalUser, InstructorInfo, User, activeCourse } from '../../types/shared';
import { getActiveCourse } from './course-mongo';
import { createStudent, findStudentByUserId } from './course-user-mongo';
import {
    addCourseToGlobalUser,
    findGlobalUserByUserId,
    removeCourseFromGlobalUser
} from './global-user-mongo';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';
import { isAdminUser } from '../../utils/admin';
import { instructorEntryUserId } from '../../utils/course-staff';

export interface RemoveInstructorsFromCourseOptions {
    /** Platform admin performing the removal — cannot remove their own userId. */
    callerUserId?: string;
}

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
        if (globalUser.affiliation !== 'faculty' && !isAdminUser(globalUser)) {
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

/**
 * removeInstructorsFromCourse - Removes faculty instructors from catalog roster and global enrollment.
 *
 * Updates `activeCourse.instructors[]` and `$pull`s `coursesEnrolled` on each removed user.
 * Preserves `{courseName}_users` rows and chat history. Platform admins are never removable.
 *
 * @param ctx - MongoDalContext
 * @param course - Course document (catalog row)
 * @param userIdsToRemove - Faculty userIds to remove after admin UI confirmation
 * @param options - Optional caller userId for self-removal guard
 * @returns Updated `instructors[]` with removals applied
 * @throws Error when caller removes self, targets a platform admin, or userId is not on roster
 */
export async function removeInstructorsFromCourse(
    ctx: MongoDalContext,
    course: activeCourse,
    userIdsToRemove: string[],
    options?: RemoveInstructorsFromCourseOptions
): Promise<InstructorInfo[]> {
    const uniqueIds = [...new Set(userIdsToRemove.filter((id) => typeof id === 'string' && id))];
    if (uniqueIds.length === 0) {
        return normalizeInstructors(course.instructors);
    }

    const callerUserId = options?.callerUserId;
    const current = normalizeInstructors(course.instructors);
    const rosterUserIds = new Set(current.map((i) => i.userId));

    // Validate each removal target before mutating catalog or global enrollment
    for (const userId of uniqueIds) {
        if (callerUserId && userId === callerUserId) {
            throw new Error('Cannot remove yourself from the course');
        }
        if (!rosterUserIds.has(userId)) {
            throw new Error(`User ${userId} is not an instructor on this course`);
        }

        const globalUser = await findGlobalUserByUserId(ctx, userId);
        if (globalUser && isAdminUser(globalUser)) {
            throw new Error('Platform admins cannot be removed from a course');
        }
    }

    const removeSet = new Set(uniqueIds);
    // Filter catalog instructors — admins remain even if client sent their ids
    const nextInstructors = current.filter((inst) => {
        if (removeSet.has(inst.userId)) {
            return false;
        }
        return true;
    });

    // Revoke course-selection access; keep per-course roster documents for history
    for (const userId of uniqueIds) {
        const globalUser = await findGlobalUserByUserId(ctx, userId);
        if (!globalUser) {
            appLogger.warn(`[enrollment] removeInstructors: unknown userId ${userId}`);
            continue;
        }
        await removeCourseFromGlobalUser(ctx, globalUser.puid, course.id);
        appLogger.log(
            `[enrollment] Removed instructor ${globalUser.name} (${userId}) from course ${course.id}`
        );
    }

    return nextInstructors;
}

/**
 * normalizeInstructors - Normalizes instructor data for consistent processing.
 *
 * @param raw - Instructor data to normalize
 * @returns Normalized instructor list
 */
function normalizeInstructors(
    raw: InstructorInfo[] | string[] | undefined
): InstructorInfo[] {
    if (!raw?.length) {
        return [];
    }
    return raw.map((inst) =>
        typeof inst === 'string'
            ? { userId: inst, name: 'Unknown' }
            : { userId: instructorEntryUserId(inst), name: inst.name ?? 'Unknown' }
    );
}
