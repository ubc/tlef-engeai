/**
 * Role-Based Access Control Middleware for API Routes
 *
 * Provides middleware to enforce instructor-only or student-only access
 * for course-scoped API endpoints. Returns 403 JSON for unauthorized access.
 */

import { Request, Response, NextFunction } from 'express';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';

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

/**
 * Middleware: Require instructor role for course-scoped API endpoints
 * Resolves courseId from params (courseId or id), body, query, or session.
 * Returns 403 JSON if user is not an instructor for the course.
 */
export function requireInstructorForCourseAPI(sources: CourseIdSource[] = ['params', 'paramsId', 'body', 'session']) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const courseId = resolveCourseId(req, sources);
            if (!courseId) {
                return res.status(400).json({ error: 'Course ID is required' });
            }

            const mongoDB = await EngEAI_MongoDB.getInstance();
            const globalUser = await mongoDB.findGlobalUserByPUID(user.puid);
            if (!globalUser) {
                return res.status(401).json({ error: 'User not found' });
            }

            const course = await mongoDB.getActiveCourse(courseId);
            if (!course) {
                return res.status(404).json({ error: 'Course not found' });
            }

            const isInstructor = globalUser.affiliation === 'faculty' &&
                course.instructors?.some((inst: any) =>
                    (typeof inst === 'string' ? inst : inst.userId) === globalUser.userId
                );

            if (!isInstructor) {
                console.log(`[RBAC] User ${user.puid} denied instructor API access for course ${courseId}`);
                return res.status(403).json({ error: 'Instructor access required' });
            }

            next();
        } catch (error) {
            console.error('[RBAC] Error in requireInstructorForCourseAPI:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
}

/**
 * Middleware: Require student role for course-scoped API endpoints
 * Returns 403 JSON if user is not enrolled or is an instructor.
 */
export function requireStudentForCourseAPI(sources: CourseIdSource[] = ['params', 'paramsId', 'body', 'session']) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const courseId = resolveCourseId(req, sources);
            if (!courseId) {
                return res.status(400).json({ error: 'Course ID is required' });
            }

            const mongoDB = await EngEAI_MongoDB.getInstance();
            const globalUser = await mongoDB.findGlobalUserByPUID(user.puid);
            if (!globalUser) {
                return res.status(401).json({ error: 'User not found' });
            }

            const course = await mongoDB.getActiveCourse(courseId);
            if (!course) {
                return res.status(404).json({ error: 'Course not found' });
            }

            const isInstructor = globalUser.affiliation === 'faculty' &&
                course.instructors?.some((inst: any) =>
                    (typeof inst === 'string' ? inst : inst.userId) === globalUser.userId
                );
            const isEnrolled = globalUser.coursesEnrolled.includes(courseId);

            if (!isEnrolled || isInstructor) {
                console.log(`[RBAC] User ${user.puid} denied student API access for course ${courseId}`);
                return res.status(403).json({ error: 'Student access required' });
            }

            next();
        } catch (error) {
            console.error('[RBAC] Error in requireStudentForCourseAPI:', error);
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
    if (globalUser.affiliation !== 'faculty') {
        console.log(`[RBAC] User ${globalUser.userId} denied global instructor access`);
        return res.status(403).json({ error: 'Instructor access required' });
    }
    next();
}
