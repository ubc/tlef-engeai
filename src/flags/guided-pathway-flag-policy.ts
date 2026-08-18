/**
 * Guided Pathway flag trigger-actor policy
 *
 * Resolves a database-backed course/user pair into either a production student
 * actor or an instructor-test actor. HTTP request fields never select origin.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-17
 * @version: 1.0.0
 * @description: Server-owned role policy for automatic Guided Pathway flag creation.
 */

import type { GlobalUser, activeCourse } from '../types/shared';
import { isCourseStaff, isInCourseInstructors } from '../utils/course-staff';
import { isAdminUser } from '../utils/admin';
import type { GuidedPathwayFlagTriggerActor } from './guided-pathway-flag-contracts';

/**
 * resolveGuidedPathwayFlagTriggerActor - Classifies an authenticated chat sender.
 *
 * Listed faculty instructors are checked before enrollment so dual-role records
 * remain tests, including a listed instructor who also has platform-admin
 * privilege. TAs, admin-only users, outsiders, and missing context are skipped.
 *
 * @param course - Current active-course record loaded by the server
 * @param user - Current global-user record loaded by PUID
 * @returns Explicit student/instructor-test actor, or null when persistence must be skipped
 */
export function resolveGuidedPathwayFlagTriggerActor(
    course: activeCourse | null | undefined,
    user: GlobalUser | null | undefined
): GuidedPathwayFlagTriggerActor | null {
    if (!course?.id || !user?.userId) {
        return null;
    }

    // Resolve listed faculty instructors before enrollment to avoid production-student misclassification.
    if (user.affiliation === 'faculty' && isInCourseInstructors(course, user.userId)) {
        return { origin: 'instructor-test', userId: user.userId };
    }

    // Platform-admin privilege alone does not make a user a course instructor test actor.
    if (isAdminUser(user)) {
        return null;
    }

    // Only enrolled non-staff users create production student flags.
    if (user.coursesEnrolled?.includes(course.id) === true && !isCourseStaff(course, user)) {
        return { origin: 'student', userId: user.userId };
    }

    return null;
}
