/**
 * Academic period resolution and post-period analytics access gates.
 */

import type { AcademicPeriodDocument, activeCourse, GlobalUser, CourseAnalyticsAccessFlags } from '../types/shared';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { isAdminUser } from '../utils/admin';
import { isCourseStaff, canManageCourseRoster } from '../utils/course-staff';

export type { CourseAnalyticsAccessFlags };

/** True when now is strictly after period.endDate (end of calendar day UTC). */
export function isAcademicPeriodEnded(period: AcademicPeriodDocument | null | undefined): boolean {
    if (!period?.endDate) {
        return false;
    }
    const end = period.endDate instanceof Date ? period.endDate : new Date(period.endDate);
    if (Number.isNaN(end.getTime())) {
        return false;
    }
    return Date.now() > end.getTime();
}

/**
 * Resolves the academic period linked to a course (lazy AP-001 via getActiveCourse).
 */
export async function resolveCourseAcademicPeriod(
    course: activeCourse
): Promise<AcademicPeriodDocument | null> {
    if (!course.academicPeriodId) {
        return null;
    }
    const mongo = await EngEAI_MongoDB.getInstance();
    return mongo.getAcademicPeriodById(course.academicPeriodId);
}

function toIsoDate(d: Date | string | undefined | null): string | null {
    if (d == null) {
        return null;
    }
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString();
}

/**
 * Struggle chart, bulk exports, and summary struggle/download sections.
 * Admins always; other staff only after period ends.
 */
export function canAccessPostPeriodAnalytics(
    course: activeCourse,
    globalUser: GlobalUser | null | undefined,
    period: AcademicPeriodDocument | null | undefined
): boolean {
    if (!globalUser) {
        return false;
    }
    if (isAdminUser(globalUser)) {
        return true;
    }
    if (!isCourseStaff(course, globalUser)) {
        return false;
    }
    return isAcademicPeriodEnded(period);
}

/**
 * Whether the course-summary API may return a full payload.
 * Admins always; other staff only after period ends.
 */
export function canViewCourseSummary(
    course: activeCourse,
    globalUser: GlobalUser | null | undefined,
    period: AcademicPeriodDocument | null | undefined
): boolean {
    return canAccessPostPeriodAnalytics(course, globalUser, period);
}

/**
 * Auto modal overlay: false during active period for everyone; true for staff after period ends.
 */
export function shouldAutoDisplayCourseSummaryModal(
    course: activeCourse,
    globalUser: GlobalUser | null | undefined,
    period: AcademicPeriodDocument | null | undefined
): boolean {
    if (!globalUser || !isCourseStaff(course, globalUser)) {
        return false;
    }
    return isAcademicPeriodEnded(period);
}

/**
 * Builds analytics access flags for API / monitor bootstrap.
 */
export async function buildCourseAnalyticsAccessFlags(
    course: activeCourse,
    globalUser: GlobalUser | null | undefined
): Promise<CourseAnalyticsAccessFlags> {
    const period = await resolveCourseAcademicPeriod(course);
    const periodEnded = isAcademicPeriodEnded(period);
    const isAdmin = isAdminUser(globalUser);
    const postPeriod = canAccessPostPeriodAnalytics(course, globalUser, period);

    return {
        canAccessPostPeriodAnalytics: postPeriod,
        canViewCourseSummary: canViewCourseSummary(course, globalUser, period),
        canManageRoster: canManageCourseRoster(course, globalUser),
        periodEndDate: toIsoDate(period?.endDate),
        isAdminEarlyAccess: isAdmin && !periodEnded,
        isAcademicPeriodEnded: periodEnded
    };
}
