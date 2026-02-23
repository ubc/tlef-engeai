/**
 * Instructor Helpers
 *
 * Shared utilities for instructor-allowed-courses and auto-adding Charisma/Rich to courses.
 * Used by initInstructorAllowedCourses and mongo-routes course creation.
 *
 * @author: EngE-AI Team
 * @since: 2025-02-23
 */

import { EngEAI_MongoDB } from './EngEAI_MongoDB';
import { GlobalUser } from './types';
import { InstructorInfo } from './types';
import { User } from './types';

/**
 * Returns PUIDs that should auto-add Charisma and Rich when they create a course (Alireza, Amir).
 */
function getTeamInstructorPuids(): string[] {
    return [
        process.env.ALIREZA_BAGHERZADEH_PUID?.trim(),
        process.env.AMIR_DEHKHODA_PUID?.trim()
    ].filter(Boolean) as string[];
}

/**
 * Returns true if the given PUID is Alireza or Amir (team members who trigger auto-add of Charisma/Rich).
 */
export function isTeamInstructorPuid(puid: string | undefined): boolean {
    if (!puid || typeof puid !== 'string') return false;
    return getTeamInstructorPuids().includes(puid.trim());
}

/**
 * Gets or creates GlobalUser records for Charisma and Richard Tape.
 * Used when adding them to courses - they must exist in active-users.
 *
 * @returns Array of GlobalUser (may be empty if env vars not set)
 */
export async function getOrCreateCharismaAndRich(mongoDB: EngEAI_MongoDB): Promise<GlobalUser[]> {
    const results: GlobalUser[] = [];
    const configs = [
        { puid: process.env.CHARISMA_RUSDIYANTO_PUID?.trim(), name: 'Charisma Rusdiyanto' },
        { puid: process.env.RICHARD_TAPE_PUID?.trim(), name: 'Richard Tape' }
    ];

    for (const { puid, name } of configs) {
        if (!puid) {
            console.warn(`[INSTRUCTOR-HELPERS] Skipping ${name}: PUID env var not set`);
            continue;
        }
        let user = await mongoDB.findGlobalUserByPUID(puid);
        if (!user) {
            user = await mongoDB.createGlobalUser({
                puid,
                name,
                userId: mongoDB.idGenerator.globalUserID(puid, name, 'faculty'),
                coursesEnrolled: [],
                affiliation: 'faculty',
                status: 'active'
            });
            console.log(`[INSTRUCTOR-HELPERS] Created GlobalUser for ${name} (${user.userId})`);
        }
        results.push(user);
    }
    return results;
}

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
 * Adds Charisma and Rich to a course: instructors array, CourseUser entries, and coursesEnrolled.
 * Idempotent: skips if already present.
 *
 * @param mongoDB - MongoDB instance
 * @param courseId - Course ID
 * @param courseName - Course name (for users collection)
 * @param existingInstructors - Current instructors array (will be mutated and returned)
 * @returns Updated instructors array with Charisma and Rich added
 */
export async function addCharismaAndRichToCourse(
    mongoDB: EngEAI_MongoDB,
    courseId: string,
    courseName: string,
    existingInstructors: InstructorInfo[] | string[]
): Promise<InstructorInfo[]> {
    const charismaAndRich = await getOrCreateCharismaAndRich(mongoDB);
    if (charismaAndRich.length === 0) return existingInstructors as InstructorInfo[];

    // Normalize to InstructorInfo[]
    let instructors: InstructorInfo[] = existingInstructors.map((inst: any) => {
        if (typeof inst === 'string') return { userId: inst, name: 'Unknown' };
        return inst as InstructorInfo;
    });

    for (const user of charismaAndRich) {
        if (!isInstructorInArray(instructors, user.userId)) {
            instructors.push({ userId: user.userId, name: user.name });
            console.log(`[INSTRUCTOR-HELPERS] Added ${user.name} (${user.userId}) to course ${courseId}`);

            // Create CourseUser in {courseName}_users
            try {
                const collectionNames = await mongoDB.getCollectionNames(courseName);
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
                    console.log(`[INSTRUCTOR-HELPERS] Created CourseUser for ${user.name} in ${collectionNames.users}`);
                }
            } catch (err) {
                console.error(`[INSTRUCTOR-HELPERS] Error creating CourseUser for ${user.name}:`, err);
            }

            // Add course to their coursesEnrolled
            try {
                if (!user.coursesEnrolled.includes(courseId)) {
                    await mongoDB.addCourseToGlobalUser(user.puid, courseId);
                    console.log(`[INSTRUCTOR-HELPERS] Added course ${courseId} to ${user.name}'s enrolled list`);
                }
            } catch (err) {
                console.error(`[INSTRUCTOR-HELPERS] Error adding course to ${user.name}'s enrolled list:`, err);
            }
        }
    }

    return instructors;
}
