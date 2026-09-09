// apply-roster-enrollment.ts
/**
 * apply-roster-enrollment.ts
 *
 * Grants a signing-in user the courses whose stored LMS roster names them.
 *
 * This is the login half of Canvas enrollment. An instructor's roster sync writes keyed digests
 * of each enrolled student's PUID (`canvas-roster-sync.ts`); this hashes the PUID CWL just
 * authenticated and enrolls the user in whatever it matches. The student authorizes nothing and
 * never sees Canvas — which is the whole reason the design exists, since a student's own Canvas
 * token can neither read SIS identifiers nor be proven to belong to them.
 *
 * **Never blocks a login.** Every failure here is swallowed and logged. A user whose roster
 * lookup fails still signs in and still reaches their courses by course code; a user locked out
 * of EngE-AI because Canvas enrollment could not be resolved would be a far worse outcome than a
 * missing course tile, and the next login retries for free.
 *
 * Runs on **every** sign-in rather than behind a "refresh" button. It is one indexed query
 * against `course-lms-rosters`, with no LMS call — the expensive half is the roster fetch, which
 * only staff and the scheduled job trigger. A student-facing refresh button would also be
 * misleading: a student holds no credential that could reach Canvas, so it could only ever
 * re-read a snapshot that only staff can refresh.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Login-time enrollment from stored LMS roster snapshots.
 */

import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type { GlobalUser } from '../types/shared';
import { hashRosterPuid, isRosterIdentityConfigured } from '../utils/roster-identity';
import { appLogger } from '../utils/logger';

/**
 * applyRosterEnrollment — enrolls the signed-in user in every course whose roster lists them.
 *
 * Idempotent. Courses the user already has are skipped, and `enrollUserInCourse` is itself
 * idempotent, so repeating this on every login converges rather than accumulating.
 *
 * Two categories are deliberately skipped:
 *
 * - **Courses the user already has.** Re-enrolling would be a no-op, but skipping avoids a
 *   course read per already-known course on every single login.
 * - **Courses still in setup (`courseSetup === false`).** An imported course exists before its
 *   instructor has configured it. Surfacing it to students at that point shows them a course
 *   with no content and no prompts. They are picked up on a later login once setup completes.
 *
 * Enrollment is granted as `'student'` because the snapshot is built from the LMS's *student*
 * roster. Course staff reach their courses through `instructors[]` and the existing entry paths,
 * not through this one.
 *
 * @param mongoDB - connected `EngEAI_MongoDB` singleton
 * @param globalUser - the user who has just authenticated
 *
 * @returns The user, refreshed when anything was granted, or the argument unchanged. Never
 * throws: callers are login handlers and must not fail on this.
 */
export async function applyRosterEnrollment(
    mongoDB: EngEAI_MongoDB,
    globalUser: GlobalUser
): Promise<GlobalUser> {
    // Not configured is not an error — a deployment without roster sync simply has no snapshots,
    // and hashing would throw. Course-code entry is unaffected.
    if (!isRosterIdentityConfigured() || !globalUser.puid) {
        return globalUser;
    }

    try {
        const matches = await mongoDB.findCoursesByRosterIdentity(hashRosterPuid(globalUser.puid));
        if (matches.length === 0) {
            return globalUser;
        }

        let granted = 0;
        for (const match of matches) {
            if (globalUser.coursesEnrolled.includes(match.courseId)) {
                continue;
            }

            const course = await mongoDB.getActiveCourse(match.courseId);
            if (!course) {
                // A roster outliving its course is a cleanup gap, not a reason to fail a login.
                continue;
            }
            if (course.courseSetup !== true) {
                continue;
            }

            await mongoDB.enrollUserInCourse(globalUser, match.courseId, 'student');
            granted += 1;
        }

        if (granted === 0) {
            return globalUser;
        }

        // Counts only: this line names a course-less number precisely because the surrounding
        // login logs already identify the person.
        appLogger.log(`[roster-enrollment] Granted ${granted} course(s) from LMS roster match`);

        // Re-read so the session carries the enrollment the caller is about to store. Returning
        // the stale argument would leave `coursesEnrolled` short until the next login.
        return (await mongoDB.findGlobalUserByPUID(globalUser.puid)) ?? globalUser;
    } catch (error) {
        appLogger.error('[roster-enrollment] Roster enrollment check failed; continuing login:', error);
        return globalUser;
    }
}
