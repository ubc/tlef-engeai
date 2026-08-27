// public/scripts/utils/course-permissions.ts

/**
 * Shared frontend course-permission predicates.
 * These guards control presentation only; backend middleware remains authoritative.
 *
 * @author EngE-AI Team
 * @date 2026-08-08
 * @version 1.0.0
 * @description Shared, presentation-only course authorization helpers.
 */

import type { activeCourse, AuthUser, InstructorInfo } from '../types.js';

/** Return the stable user id from either current or legacy course-roster entries. */
function rosterUserId(entry: InstructorInfo | string): string {
    return typeof entry === 'string' ? entry : entry.userId;
}

/**
 * Determine whether a user may configure or review Guided Pathway alerts.
 *
 * Platform administrators and faculty instructors qualify. Teaching assistants
 * do not qualify unless they are also explicitly present in the instructor roster.
 * This is a presentation guard only; APIs must enforce the same rule server-side.
 */
export function canManageGuidedPathways(
    course: activeCourse,
    user: AuthUser | null | undefined
): boolean {
    if (!user) return false;
    if (user.isAdmin === true) return true;
    return (course.instructors ?? []).some((entry) => rosterUserId(entry) === user.userId);
}
