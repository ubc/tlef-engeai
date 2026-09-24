// apply-roster-enrollment.ts
/**
 * apply-roster-enrollment.ts
 *
 * Grants a signing-in user the courses — and, for TAs, the TA role — whose stored LMS roster names them.
 *
 * This is the login half of Canvas enrollment. An instructor's roster sync writes keyed digests
 * of each enrolled student's and TA's PUID (`canvas-roster-sync.ts`); this hashes the PUID CWL just
 * authenticated and enrolls the user in whatever it matches. The user authorizes nothing and
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
 * only staff trigger. A student-facing refresh button would also be misleading: a student holds no
 * credential that could reach Canvas, so it could only ever re-read a snapshot that only staff can
 * refresh.
 *
 * @author: EngE-AI Team
 * @version: 1.1.0
 * @description: Login-time enrollment and TA role from stored LMS roster snapshots.
 */

import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type { GlobalUser } from '../types/shared';
import { isCourseStaff } from '../utils/course-staff';
import { hashRosterPuid, isRosterIdentityConfigured } from '../utils/roster-identity';
import { appLogger } from '../utils/logger';

/**
 * applyRosterEnrollment — enrolls the signed-in user in every course whose roster lists them.
 *
 * Idempotent. Nothing already granted is granted again, so repeating this on every login
 * converges rather than accumulating.
 *
 * - **Student match:** the course is added as `'student'`, unless the user already has it.
 * - **TA match:** the course is added as `'student'` if needed — promotion requires a course
 *   member — then the TA role is granted, unless the user already holds staff access there
 *   (instructor, platform admin, or TA). The role is never removed when a TA leaves the LMS
 *   roster; an instructor demotes by hand, matching how enrollment only ever accrues.
 * - **Courses still in setup (`courseSetup === false`)** are skipped for both. An imported course
 *   exists before its instructor has configured it. They are picked up on a later login.
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
            const alreadyEnrolled = globalUser.coursesEnrolled.includes(match.courseId);
            const isTa = match.role === 'ta';
            // A student match the user already has needs nothing, and costs no course read.
            if (alreadyEnrolled && !isTa) {
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

            // Step 1: course membership, as a student — the TA role is granted on top of it.
            if (!alreadyEnrolled) {
                await mongoDB.enrollUserInCourse(globalUser, match.courseId, 'student');
                granted += 1;
            }

            // Step 2: the TA role, for a TA match whose user holds no staff access here yet.
            if (isTa && !isCourseStaff(course, globalUser)) {
                try {
                    await mongoDB.promoteStudentToTA(course, globalUser.userId, globalUser.name);
                    granted += 1;
                } catch (error) {
                    // One course refusing the role must not stop the others, or the login.
                    appLogger.warn(
                        '[roster-enrollment] Could not grant the TA role from the LMS roster:',
                        error instanceof Error ? error.message : error
                    );
                }
            }
        }

        if (granted === 0) {
            return globalUser;
        }

        // Counts only: this line names a course-less number precisely because the surrounding
        // login logs already identify the person.
        appLogger.log(`[roster-enrollment] Granted ${granted} enrollment(s) or role(s) from LMS roster match`);

        // Re-read so the session carries the enrollment the caller is about to store. Returning
        // the stale argument would leave `coursesEnrolled` short until the next login.
        return (await mongoDB.findGlobalUserByPUID(globalUser.puid)) ?? globalUser;
    } catch (error) {
        appLogger.error('[roster-enrollment] Roster enrollment check failed; continuing login:', error);
        return globalUser;
    }
}
