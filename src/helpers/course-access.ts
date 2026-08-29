/**
 * Course listing access: enrolled courses + course staff roles.
 */

import type { AcademicPeriodDocument, activeCourse, GlobalUser, InstructorInfo } from '../types/shared';
import { isAdminUser } from '../utils/admin';
import { isCourseStaff, instructorEntryUserId } from '../utils/course-staff';
import { coursePayloadForViewer } from '../dashboard-setting/course-student-view';

/** True when user may enter or list this course (non-admin). */
export function isCourseAccessible(course: activeCourse, globalUser: GlobalUser): boolean {
    if (isAdminUser(globalUser)) {
        return true;
    }
    if ((globalUser.coursesEnrolled ?? []).includes(course.id)) {
        return true;
    }
    return isCourseStaff(course, globalUser);
}

/** Filter active courses to those the user can access. Admins receive all courses. */
export function filterAccessibleCourses(
    allCourses: activeCourse[],
    globalUser: GlobalUser
): activeCourse[] {
    if (isAdminUser(globalUser)) {
        return allCourses;
    }
    return allCourses.filter((c) => isCourseAccessible(c, globalUser));
}

/**
 * mapFacultyInstructorDisplay - Comma-separated faculty instructor names for course cards.
 *
 * Excludes platform admin userIds and teaching assistants — cards show assigned faculty only.
 *
 * @param course - Active course catalog row
 * @param platformAdminUserIds - Set of `GlobalUser.userId` values flagged `isAdmin`
 * @returns Display string or `No instructors`
 */
export function mapFacultyInstructorDisplay(
    course: activeCourse,
    platformAdminUserIds: Set<string>
): string {
    const taIds = new Set(
        (course.teachingAssistants ?? []).map((ta) => instructorEntryUserId(ta))
    );
    const names =
        course.instructors
            ?.map((inst: InstructorInfo | string) => {
                const userId = instructorEntryUserId(inst);
                // Skip platform admins and TAs on the public instructor line
                if (platformAdminUserIds.has(userId) || taIds.has(userId)) {
                    return null;
                }
                if (typeof inst === 'string') {
                    return inst;
                }
                return inst?.name ?? inst?.userId ?? 'Unknown';
            })
            .filter((name): name is string => Boolean(name)) ?? [];
    return names.join(', ') || 'No instructors';
}

export interface CourseSelectionPeriodSection extends AcademicPeriodDocument {
    courseCount: number;
    courses: (activeCourse & { instructorDisplay?: string })[];
}

export interface CourseSelectionPayload {
    periods: CourseSelectionPeriodSection[];
    defaultPeriodId: string;
}

/**
 * Group accessible courses by academic period (all periods shown; empty periods allowed).
 */
export function buildCourseSelectionByPeriod(
    periods: AcademicPeriodDocument[],
    allCourses: activeCourse[],
    globalUser: GlobalUser,
    defaultPeriodId: string,
    platformAdminUserIds?: Set<string>
): CourseSelectionPayload {
    const adminIds = platformAdminUserIds ?? new Set<string>();
    const accessible = filterAccessibleCourses(allCourses, globalUser);
    const coursesByPeriod = new Map<string, activeCourse[]>();

    for (const period of periods) {
        coursesByPeriod.set(period.id, []);
    }

    for (const course of accessible) {
        const periodId = course.academicPeriodId ?? defaultPeriodId;
        if (!coursesByPeriod.has(periodId)) {
            coursesByPeriod.set(periodId, []);
        }
        coursesByPeriod.get(periodId)!.push(course);
    }

    const payload = periods.map((period) => {
        const periodCourses = coursesByPeriod.get(period.id) ?? [];
        return {
            ...period,
            courseCount: periodCourses.length,
            courses: periodCourses.map((c) => ({
                ...coursePayloadForViewer(c, globalUser),
                instructorDisplay: mapFacultyInstructorDisplay(c, adminIds)
            }))
        };
    });

    return { periods: payload, defaultPeriodId };
}
