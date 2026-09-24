// student-view-filter.ts
/**
 * student-view-filter.ts
 * @description The single Student View exclusion rule, plus the synthetic identifier format.
 *
 * Deliberately import-free. Every staff-facing listing needs this rule, including
 * `course-user-mongo.ts`, which `test-student-mongo.ts` in turn depends on; keeping the
 * rule in a leaf module is what stops that from becoming an import cycle.
 */

import type { Document, Filter } from 'mongodb';

/** Display name every test student carries. */
export const TEST_STUDENT_NAME = 'Test student';

/**
 * The one exclusion rule. `$ne: true` rather than `$exists: false` so that every document
 * written before this feature — which carries no such field — still counts as a real user.
 */
export const EXCLUDE_TEST_STUDENTS_MATCH = { isTestStudent: { $ne: true } } as const;

/**
 * withoutTestStudents — merge the exclusion into a filter or aggregation `$match` stage.
 *
 * @param filter - The filter the call site already needs
 * @returns The same filter with the test-student exclusion added
 */
export function withoutTestStudents<T extends Document>(filter: Filter<T>): Filter<T> {
    return { ...filter, ...EXCLUDE_TEST_STUDENTS_MATCH } as Filter<T>;
}

/**
 * testStudentPuid — the synthetic identifier stored as the test student's `GlobalUser.puid`.
 *
 * Derived only from ids this application generates, so no real PUID is ever copied and the
 * value is meaningless outside EngE-AI.
 *
 * @param courseId - Course the test student belongs to
 * @param ownerUserId - `GlobalUser.userId` of the staff member who owns it
 */
export function testStudentPuid(courseId: string, ownerUserId: string): string {
    return `test-student:${courseId}:${ownerUserId}`;
}
