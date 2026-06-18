/**
 * Course listing access: enrolled courses + course staff roles.
 */

import type { AcademicPeriodDocument, activeCourse, GlobalUser, InstructorInfo } from '../types/shared';
import { isAdminUser } from '../utils/admin';
import { isCourseStaff } from '../utils/course-staff';

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

function mapInstructorNames(course: activeCourse): string {
    const names =
        course.instructors?.map((inst: InstructorInfo | string) => {
            if (typeof inst === 'string') {
                return inst;
            }
            return inst?.name ?? inst?.userId ?? 'Unknown';
        }) ?? [];
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
    defaultPeriodId: string
): CourseSelectionPayload {
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
                ...c,
                instructorDisplay: mapInstructorNames(c)
            }))
        };
    });

    return { periods: payload, defaultPeriodId };
}
