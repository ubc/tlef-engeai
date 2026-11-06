/**
 * user-directory.ts
 * @description Request parsing and row shaping for the platform-admin user directory
 * (`GET /api/admin/user-directory`). Kept out of the route so both are unit-testable.
 */

import type { GlobalUserDirectoryQuery } from '../db/mongo/global-user-mongo';
import type { activeCourse, GlobalUser, UserDirectoryCourse, UserDirectoryEntry } from '../types/shared';
import { isInCourseInstructors, isInCourseTAs } from '../utils/course-staff';

export const USER_DIRECTORY_DEFAULT_PAGE_SIZE = 50;
export const USER_DIRECTORY_MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 200;
const AFFILIATIONS: ReadonlyArray<GlobalUser['affiliation']> = ['student', 'faculty', 'staff', 'empty'];

function positiveInteger(value: unknown, fallback: number): number | null {
    if (value === undefined || value === '') return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * parseUserDirectoryQuery
 *
 * Validates `q`, `affiliation`, `page`, and `pageSize` query parameters. Blank values mean "no
 * filter"; `pageSize` is capped at {@link USER_DIRECTORY_MAX_PAGE_SIZE}.
 *
 * @param query - `req.query`
 * @returns The directory query, or an error message for a 400 response
 */
export function parseUserDirectoryQuery(
    query: Record<string, unknown>
): { ok: true; value: GlobalUserDirectoryQuery } | { ok: false; error: string } {
    const page = positiveInteger(query.page, 1);
    const pageSize = positiveInteger(query.pageSize, USER_DIRECTORY_DEFAULT_PAGE_SIZE);
    if (page === null || pageSize === null) {
        return { ok: false, error: 'page and pageSize must be positive integers' };
    }

    const search = typeof query.q === 'string' ? query.q.trim() : '';
    if (search.length > MAX_SEARCH_LENGTH) {
        return { ok: false, error: `Search must be at most ${MAX_SEARCH_LENGTH} characters` };
    }

    const affiliation = typeof query.affiliation === 'string' ? query.affiliation.trim() : '';
    if (affiliation && !AFFILIATIONS.includes(affiliation as GlobalUser['affiliation'])) {
        return { ok: false, error: 'Invalid affiliation filter' };
    }

    return {
        ok: true,
        value: {
            page,
            pageSize: Math.min(pageSize, USER_DIRECTORY_MAX_PAGE_SIZE),
            ...(search ? { search } : {}),
            ...(affiliation ? { affiliation: affiliation as GlobalUser['affiliation'] } : {})
        }
    };
}

function isoOrNull(value: unknown): string | null {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (typeof value === 'string' && value) return value;
    return null;
}

/** Lookups shared by every row on one directory page. */
export interface UserDirectoryContext {
    /** Active course id → the course (name and staff lists). */
    courses: ReadonlyMap<string, Pick<activeCourse, 'courseName' | 'instructors' | 'teachingAssistants'>>;
    canvasConnected: ReadonlySet<string>;
    moodleConnected: ReadonlySet<string>;
}

function directoryCourse(id: string, userId: string, context: UserDirectoryContext): UserDirectoryCourse {
    const course = context.courses.get(id);
    if (!course) return { id, courseName: null, role: null };
    // Stored listing, not the access decision: `isCourseStaff` also needs a faculty affiliation.
    const role = isInCourseInstructors(course as activeCourse, userId)
        ? 'instructor'
        : isInCourseTAs(course as activeCourse, userId) ? 'ta' : 'student';
    return { id, courseName: course.courseName, role };
}

/**
 * toUserDirectoryEntry
 *
 * Shapes one `active-users` document for the directory: an explicit allow-list of fields (so
 * test-student ownership and anything added to `GlobalUser` later stay out), courses resolved to
 * names and the person's role in each, LMS connection presence, and missing optional fields filled
 * with explicit defaults.
 *
 * @param user - Stored global user
 * @param context - Courses and LMS connections for the current page
 * @returns Directory row; admin-only because it carries the PUID
 */
export function toUserDirectoryEntry(user: GlobalUser, context: UserDirectoryContext): UserDirectoryEntry {
    return {
        userId: user.userId,
        name: user.name,
        puid: user.puid,
        affiliation: user.affiliation,
        status: user.status,
        isAdmin: user.isAdmin === true,
        courses: (user.coursesEnrolled ?? []).map((id) => directoryCourse(id, user.userId, context)),
        createdAt: isoOrNull(user.createdAt),
        updatedAt: isoOrNull(user.updatedAt),
        studentOnboardingCompleted: user.studentOnboardingCompleted === true,
        instructorOnboarding: { ...(user.instructorOnboarding ?? {}) },
        canvasVerifiedUserId: user.canvasVerifiedUserId ?? null,
        canvasVerifiedAt: isoOrNull(user.canvasVerifiedAt),
        lmsConnections: {
            canvas: context.canvasConnected.has(user.userId),
            moodle: context.moodleConnected.has(user.userId)
        }
    };
}
