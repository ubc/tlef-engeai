/**
 * Instructor Helpers
 *
 * Shared utilities for auto-adding platform admins to courses.
 * Used by mongo-routes course creation.
 *
 * @author: EngE-AI Team
 * @since: 2025-02-23
 */

import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { InstructorInfo, User } from '../types/shared';
import { appLogger } from '../utils/logger';

/**
 * Checks if an instructor (by userId) is already in the instructors array.
 * Handles both old format (string[]) and new format (InstructorInfo[]).
 */
export function isInstructorInArray(instructors: any[], userId: string): boolean {
    if (!instructors || instructors.length === 0) return false;
    return instructors.some((inst: any) => {
        if (typeof inst === 'string') return inst === userId;
        if (inst && inst.userId) return inst.userId === userId;
        return false;
    });
}

/**
 * Adds all current platform admins (GlobalUser.isAdmin === true) to a course:
 * instructors array, CourseUser entries, and coursesEnrolled.
 * Idempotent: skips if already present.
 *
 * @param mongoDB - MongoDB instance
 * @param courseId - Course ID
 * @param courseName - Course name (for users collection)
 * @param existingInstructors - Current instructors array (will be mutated and returned)
 * @returns Updated instructors array with admins added
 */
export async function addAdminsToCourse(
    mongoDB: EngEAI_MongoDB,
    courseId: string,
    courseName: string,
    existingInstructors: InstructorInfo[] | string[]
): Promise<InstructorInfo[]> {
    const admins = await mongoDB.findAdminGlobalUsers();
    if (admins.length === 0) return existingInstructors as InstructorInfo[];

    // Normalize to InstructorInfo[]
    let instructors: InstructorInfo[] = existingInstructors.map((inst: any) => {
        if (typeof inst === 'string') return { userId: inst, name: 'Unknown' };
        return inst as InstructorInfo;
    });

    for (const user of admins) {
        // 1. Add to instructors if not present
        if (!isInstructorInArray(instructors, user.userId)) {
            instructors.push({ userId: user.userId, name: user.name });
            appLogger.log(`[INSTRUCTOR-HELPERS] Added admin ${user.name} (${user.userId}) to course ${courseId}`);
        }

        // 2. Always ensure CourseUser exists in {courseName}_users
        try {
            const courseUser = await mongoDB.findStudentByUserId(courseName, user.userId);
            if (!courseUser) {
                const newCourseUserData: Partial<User> = {
                    name: user.name,
                    userId: user.userId,
                    courseName,
                    courseId,
                    userOnboarding: false,
                    affiliation: 'faculty',
                    status: 'active',
                    chats: []
                };
                await mongoDB.createStudent(courseName, newCourseUserData);
                appLogger.log(`[INSTRUCTOR-HELPERS] Created CourseUser for ${user.name} in course ${courseName}`);
            }
        } catch (err) {
            appLogger.error(`[INSTRUCTOR-HELPERS] Error creating CourseUser for ${user.name}:`, err);
        }

        // 3. Always ensure course is in user's coursesEnrolled
        try {
            if (!user.coursesEnrolled.includes(courseId)) {
                await mongoDB.addCourseToGlobalUser(user.puid, courseId);
                appLogger.log(`[INSTRUCTOR-HELPERS] Added course ${courseId} to ${user.name}'s enrolled list`);
            }
        } catch (err) {
            appLogger.error(`[INSTRUCTOR-HELPERS] Error adding course to ${user.name}'s enrolled list:`, err);
        }
    }

    return instructors;
}
