/**
 * Guided Pathway flag trigger-actor policy
 *
 * Resolves a database-backed course/user pair into either a production student
 * actor or a course-staff test actor (`instructor-test`). HTTP request fields
 * never select origin.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-17
 * @version: 1.0.0
 * @description: Server-owned role policy for automatic Guided Pathway flag creation.
 */

import type { GlobalUser, activeCourse } from '../types/shared';
import { isCourseStaff } from '../utils/course-staff';
import type { GuidedPathwayFlagTriggerActor } from './guided-pathway-flag-contracts';

/**
 * resolveGuidedPathwayFlagTriggerActor - Classifies an authenticated chat sender.
 *
 * Course staff (listed instructors, TAs, platform admins) are checked before
 * enrollment so dual-role records remain tests. Only enrolled non-staff users
 * create production student flags. Outsiders and missing context are skipped.
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

    // Resolve course staff before enrollment to avoid production-student misclassification.
    if (isCourseStaff(course, user)) {
        return { origin: 'instructor-test', userId: user.userId };
    }

    if (user.coursesEnrolled?.includes(course.id) === true) {
        return { origin: 'student', userId: user.userId };
    }

    return null;
}
