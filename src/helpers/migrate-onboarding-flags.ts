/**
 * Onboarding Flags Migration
 *
 * Backfills instructorOnboardingCompleted and studentOnboardingCompleted on GlobalUser
 * from existing course and CourseUser data. Runs on every server restart.
 *
 * - Instructor: true if user is in instructors/teachingAssistants of any course with monitorSetup=true, else false
 * - Student: true if any CourseUser (across enrolled courses) has userOnboarding=true, else false
 *
 * Always sets both flags explicitly (true or false) for every user for clarity. Idempotent.
 *
 * @author: EngE-AI Team
 * @since: 2026-03-18
 */

import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { GlobalUser, activeCourse } from '../types/shared';
import { appLogger } from '../utils/logger';

/**
 * Checks if userId is in instructors or teachingAssistants array.
 * Handles both InstructorInfo[] ({userId, name}) and string[] formats.
 */
function isUserInCourseStaff(course: activeCourse, userId: string): boolean {
    const checkArray = (arr: any[] | undefined): boolean => {
        if (!arr || !Array.isArray(arr)) return false;
        return arr.some((item: any) => {
            if (typeof item === 'string') return item === userId;
            if (item && typeof item === 'object' && item.userId) return item.userId === userId;
            return false;
        });
    };
    return checkArray(course.instructors) || checkArray(course.teachingAssistants);
}

/**
 * Migrates onboarding flags for all GlobalUsers.
 * Sets instructorOnboardingCompleted and studentOnboardingCompleted based on existing data.
 */
export async function migrateOnboardingFlags(): Promise<void> {
    const instance = await EngEAI_MongoDB.getInstance();

    const globalUsers = (await instance.db.collection('active-users').find({}).toArray()) as unknown as GlobalUser[];
    const courses = (await instance.getAllActiveCourses()) as unknown as activeCourse[];

    let updatedCount = 0;

    for (const globalUser of globalUsers) {
        const { userId, puid, coursesEnrolled } = globalUser;
        if (!userId || !puid) continue;

        let instructorPassed = false;
        let studentPassed = false;

        // Instructor: any course where user is instructor/TA and monitorSetup is true
        for (const course of courses) {
            if (isUserInCourseStaff(course, userId) && course.monitorSetup === true) {
                instructorPassed = true;
                break;
            }
        }

        // Student: any CourseUser with userOnboarding true (across enrolled courses)
        for (const courseId of coursesEnrolled || []) {
            const course = courses.find((c: activeCourse) => c.id === courseId) as activeCourse | undefined;
            if (!course?.courseName) continue;

            try {
                const courseUser = await instance.findStudentByUserId(course.courseName, userId);
                if (courseUser && (courseUser as any).userOnboarding === true) {
                    studentPassed = true;
                    break;
                }
            } catch {
                // Collection may not exist; skip
            }
        }

        await instance.updateGlobalUser(puid, {
            instructorOnboardingCompleted: instructorPassed,
            studentOnboardingCompleted: studentPassed,
        });
        updatedCount++;
    }

    appLogger.log(`[MIGRATE-ONBOARDING] Processed ${globalUsers.length} users, updated ${updatedCount} with onboarding flags`);
}
