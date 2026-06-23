/**
 * Course-scoped staff role helpers (instructors, TAs, roster management).
 */

import type { activeCourse, GlobalUser, InstructorInfo } from '../types/shared';
import { isAdminUser } from './admin';

/** Extract userId from InstructorInfo or legacy string entry. */
export function instructorEntryUserId(entry: InstructorInfo | string): string {
    return typeof entry === 'string' ? entry : entry.userId;
}

/** True when userId is in course.instructors[]. */
export function isInCourseInstructors(course: activeCourse, userId: string): boolean {
    return (course.instructors ?? []).some((inst) => instructorEntryUserId(inst) === userId);
}

/** True when userId is in course.teachingAssistants[]. */
export function isInCourseTAs(course: activeCourse, userId: string): boolean {
    return (course.teachingAssistants ?? []).some((ta) => instructorEntryUserId(ta) === userId);
}

/**
 * Course staff: platform admin, faculty in instructors[], or TA in teachingAssistants[].
 */
export function isCourseStaff(course: activeCourse, globalUser: GlobalUser | null | undefined): boolean {
    if (!globalUser) {
        return false;
    }
    if (isAdminUser(globalUser)) {
        return true;
    }
    if (globalUser.affiliation === 'faculty' && isInCourseInstructors(course, globalUser.userId)) {
        return true;
    }
    return isInCourseTAs(course, globalUser.userId);
}

/**
 * Roster promote/demote: platform admin or faculty listed in course.instructors[] only.
 * TAs are staff but cannot manage roster.
 */
export function canManageCourseRoster(course: activeCourse, globalUser: GlobalUser | null | undefined): boolean {
    if (!globalUser) {
        return false;
    }
    if (isAdminUser(globalUser)) {
        return true;
    }
    return globalUser.affiliation === 'faculty' && isInCourseInstructors(course, globalUser.userId);
}
