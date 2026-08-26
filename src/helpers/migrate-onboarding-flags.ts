/**
 * Onboarding Flags Migration (OB-001)
 *
 * Backfills `studentOnboardingCompleted` on GlobalUser from existing CourseUser data.
 * Runs on every server restart.
 *
 * - Student: true if any CourseUser (across enrolled courses) has userOnboarding=true
 *
 * Only ever promotes a flag to `true`; a user who has completed onboarding is never
 * downgraded by a later run. Idempotent.
 *
 * **Amended 2026-08-25 (OB-002):** the instructor branch was removed. It derived
 * `instructorOnboardingCompleted` from `activeCourse.monitorSetup`, which is no longer
 * maintained now that instructor tutorial progress lives on the user record. Left in
 * place it would have written `false` for every instructor on the next restart, wiping
 * the signal OB-002 seeds from. `instructorOnboardingCompleted` is now set forward only,
 * by `PATCH /api/user/onboarding/instructor-completed`.
 *
 * @author: EngE-AI Team
 * @since: 2026-03-18
 */

import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { GlobalUser, activeCourse } from '../types/shared';
import { appLogger } from '../utils/logger';

/**
 * Migrates student onboarding flags for all GlobalUsers.
 * Sets studentOnboardingCompleted where any enrolled CourseUser has completed onboarding.
 */
export async function migrateOnboardingFlags(): Promise<void> {
    const instance = await EngEAI_MongoDB.getInstance();

    const globalUsers = (await instance.db.collection('active-users').find({}).toArray()) as unknown as GlobalUser[];
    const courses = (await instance.getAllActiveCourses()) as unknown as activeCourse[];

    let updatedCount = 0;

    for (const globalUser of globalUsers) {
        const { userId, puid, coursesEnrolled } = globalUser;
        if (!userId || !puid) continue;

        // Already promoted; nothing a later run could add.
        if (globalUser.studentOnboardingCompleted === true) continue;

        let studentPassed = false;

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

        // Promote only. Never write `false` over an existing value.
        if (!studentPassed) continue;

        await instance.updateGlobalUser(puid, { studentOnboardingCompleted: true });
        updatedCount++;
    }

    appLogger.log(`[MIGRATE-ONBOARDING] Processed ${globalUsers.length} users, promoted ${updatedCount} to studentOnboardingCompleted`);
}
