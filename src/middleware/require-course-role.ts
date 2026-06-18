/**
 * Role-Based Access Control Middleware for API Routes
 *
 * Provides middleware to enforce instructor-only or student-only access
 * for course-scoped API endpoints. Returns 403 JSON for unauthorized access.
 */

import { Request, Response, NextFunction } from 'express';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import {
    buildCourseAnalyticsAccessFlags,
    canAccessPostPeriodAnalytics,
    resolveCourseAcademicPeriod
} from '../helpers/academic-period-access';
import { isAdminUser } from '../utils/admin';
import { canManageCourseRoster, isCourseStaff } from '../utils/course-staff';
import { appLogger } from '../utils/logger';
import type { activeCourse, GlobalUser } from '../types/shared';

type CourseIdSource = 'params' | 'paramsId' | 'body' | 'query' | 'session';

/**
 * Resolve courseId from request using specified sources (in order)
 */
function resolveCourseId(req: Request, sources: CourseIdSource[]): string | null {
    for (const source of sources) {
        switch (source) {
            case 'params':
                if (req.params.courseId) return req.params.courseId;
                break;
            case 'paramsId':
                if (req.params.id) return req.params.id;
                break;
            case 'body':
                if (req.body?.courseId) return req.body.courseId;
                if (req.body?.course?.id) return req.body.course.id;
                break;
            case 'query':
                if (req.query?.courseId) return req.query.courseId as string;
                break;
            case 'session':
                if ((req.session as any)?.currentCourse?.courseId) {
                    return (req.session as any).currentCourse.courseId;
                }
                break;
        }
    }
    return null;
}

async function loadCourseContext(
    req: Request,
    sources: CourseIdSource[]
): Promise<
    | { ok: true; course: activeCourse; globalUser: GlobalUser; courseId: string }
    | { ok: false; status: number; error: string }
> {
    const user = (req as any).user;
    if (!user) {
        return { ok: false, status: 401, error: 'Authentication required' };
    }

    const courseId = resolveCourseId(req, sources);
    if (!courseId) {
        return { ok: false, status: 400, error: 'Course ID is required' };
    }

    const mongoDB = await EngEAI_MongoDB.getInstance();
    const globalUser = await mongoDB.findGlobalUserByPUID(user.puid);
    if (!globalUser) {
        return { ok: false, status: 401, error: 'User not found' };
    }

    const course = await mongoDB.getActiveCourse(courseId);
    if (!course) {
        return { ok: false, status: 404, error: 'Course not found' };
    }

    return { ok: true, course: course as activeCourse, globalUser, courseId };
}

/**
 * Middleware: Require instructor role for course-scoped API endpoints
 * Resolves courseId from params (courseId or id), body, query, or session.
 * Returns 403 JSON if user is not course staff (faculty instructor, TA, or admin).
 */
export function requireInstructorForCourseAPI(sources: CourseIdSource[] = ['params', 'paramsId', 'body', 'session']) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = await loadCourseContext(req, sources);
            if (!ctx.ok) {
                return res.status(ctx.status).json({ error: ctx.error });
            }

            if (!isCourseStaff(ctx.course, ctx.globalUser)) {
                appLogger.log(`[RBAC] User ${(req as any).user.puid} denied instructor API access for course ${ctx.courseId}`);
                return res.status(403).json({ error: 'Instructor access required' });
            }

            next();
        } catch (error) {
            appLogger.error('[RBAC] Error in requireInstructorForCourseAPI:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
}

/**
 * Middleware: Require student role for course-scoped API endpoints
 * Returns 403 JSON if user is not enrolled or is course staff.
 */
export function requireStudentForCourseAPI(sources: CourseIdSource[] = ['params', 'paramsId', 'body', 'session']) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = await loadCourseContext(req, sources);
            if (!ctx.ok) {
                return res.status(ctx.status).json({ error: ctx.error });
            }

            const isEnrolled = ctx.globalUser.coursesEnrolled.includes(ctx.courseId);

            if (!isEnrolled || isCourseStaff(ctx.course, ctx.globalUser)) {
                appLogger.log(`[RBAC] User ${(req as any).user.puid} denied student API access for course ${ctx.courseId}`);
                return res.status(403).json({ error: 'Student access required' });
            }

            next();
        } catch (error) {
            appLogger.error('[RBAC] Error in requireStudentForCourseAPI:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
}

/**
 * Middleware: Require roster manage permission (faculty instructor or platform admin).
 * TAs are course staff but cannot promote/demote.
 */
export function requireRosterManageAPI(sources: CourseIdSource[] = ['params', 'paramsId', 'body', 'session']) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = await loadCourseContext(req, sources);
            if (!ctx.ok) {
                return res.status(ctx.status).json({ error: ctx.error });
            }

            if (!canManageCourseRoster(ctx.course, ctx.globalUser)) {
                appLogger.log(`[RBAC] User ${(req as any).user.puid} denied roster manage for course ${ctx.courseId}`);
                return res.status(403).json({ error: 'Roster management access required' });
            }

            next();
        } catch (error) {
            appLogger.error('[RBAC] Error in requireRosterManageAPI:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
}

/**
 * Middleware: Post-period analytics (struggle stats, bulk exports).
 * Platform admins always; other staff only after academic period ends.
 */
export function requirePostPeriodAnalyticsAPI(sources: CourseIdSource[] = ['params', 'paramsId', 'body', 'session']) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = await loadCourseContext(req, sources);
            if (!ctx.ok) {
                return res.status(ctx.status).json({ error: ctx.error });
            }

            const period = await resolveCourseAcademicPeriod(ctx.course);
            if (!canAccessPostPeriodAnalytics(ctx.course, ctx.globalUser, period)) {
                appLogger.log(`[RBAC] User ${(req as any).user.puid} denied post-period analytics for course ${ctx.courseId}`);
                return res.status(403).json({ error: 'Analytics not available until academic period ends' });
            }

            next();
        } catch (error) {
            appLogger.error('[RBAC] Error in requirePostPeriodAnalyticsAPI:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
}

/**
 * Middleware: Require global faculty (instructor) role
 * For routes without course scope (e.g. create new course).
 * Returns 403 JSON if user is not faculty.
 */
export function requireInstructorGlobal(req: Request, res: Response, next: NextFunction) {
    const globalUser = (req.session as any)?.globalUser;
    if (!globalUser) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (globalUser.affiliation !== 'faculty' && !isAdminUser(globalUser)) {
        appLogger.log(`[RBAC] User ${globalUser.userId} denied global instructor access`);
        return res.status(403).json({ error: 'Instructor access required' });
    }
    next();
}

/**
 * Middleware: Require platform admin (global)
 * Returns 403 JSON if user is not admin.
 */
export function requireAdminGlobal(req: Request, res: Response, next: NextFunction) {
    const globalUser = (req.session as any)?.globalUser;
    if (!globalUser) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (!isAdminUser(globalUser)) {
        appLogger.log(`[RBAC] User ${globalUser.userId} denied global admin access`);
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

/**
 * Middleware: Require platform admin for course-scoped API endpoints
 * Resolves courseId from params (courseId or id), body, query, or session.
 */
export function requireAdminForCourseAPI(sources: CourseIdSource[] = ['params', 'paramsId', 'body', 'session']) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = await loadCourseContext(req, sources);
            if (!ctx.ok) {
                return res.status(ctx.status).json({ error: ctx.error });
            }

            if (!isAdminUser(ctx.globalUser)) {
                appLogger.log(`[RBAC] User ${(req as any).user.puid} denied admin API access for course ${ctx.courseId}`);
                return res.status(403).json({ error: 'Admin access required' });
            }

            next();
        } catch (error) {
            appLogger.error('[RBAC] Error in requireAdminForCourseAPI:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
}

export { buildCourseAnalyticsAccessFlags };
