/**
 * Course Route Handlers
 * 
 * Handles all course-scoped routes including instructor and student interfaces
 * Uses SPA pattern: All routes serve the same HTML shell, frontend handles component loading
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { appLogger } from '../utils/logger';
import { asyncHandlerWithAuth } from '../middleware/async-handler';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';

const router = express.Router();

/**
 * Middleware: Validate course access
 * 
 * Ensures:
 * - courseId exists in database
 * - User is authenticated
 * - User has access to the course (instructor or enrolled student)
 */
async function validateCourseAccess(req: Request, res: Response, next: express.NextFunction) {
    try {
        const { courseId } = req.params;
        const user = (req as any).user;
        
        if (!user) {
            return res.status(401).redirect('/');
        }
        
        // Get course from database
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const course = await mongoDB.getActiveCourse(courseId);
        
        if (!course) {
            // Return 404 with error page (not 403) to prevent courseId enumeration
            appLogger.log(`[COURSE-ROUTES] Course ${courseId} not found, serving error page`);
            return res.status(404).sendFile(path.join(__dirname, '../../public/pages/course-error.html'));
        }
        
        // Check if user has access
        const globalUser = await mongoDB.findGlobalUserByPUID(user.puid);
        if (!globalUser) {
            return res.status(401).redirect('/');
        }
        
        // Verify user is enrolled or is instructor
        const isInstructor = globalUser.affiliation === 'faculty' && 
                            course.instructors?.some((inst: any) => 
                                (typeof inst === 'string' ? inst : inst.userId) === globalUser.userId
                            );
        const isEnrolled = globalUser.coursesEnrolled.includes(courseId);
        
        if (!isInstructor && !isEnrolled) {
            appLogger.log(`[COURSE-ROUTES] User ${user.puid} not authorized for course ${courseId}, serving error page`);
            return res.status(403).sendFile(path.join(__dirname, '../../public/pages/course-error.html'));
        }
        
        // Set course context in request (including role flags for downstream middleware)
        (req as any).courseContext = {
            courseId: course.id,
            courseName: course.courseName,
            course: course,
            isInstructor,
            isEnrolled
        };
        
        // Update session if needed
        if (!(req.session as any).currentCourse || 
            (req.session as any).currentCourse.courseId !== courseId) {
            (req.session as any).currentCourse = {
                courseId: course.id,
                courseName: course.courseName
            };
        }
        
        next();
    } catch (error) {
        appLogger.error('[COURSE-ROUTES] Error validating course access:', error);
        // For server errors, still serve the error page but with 500 status
        res.status(500).sendFile(path.join(__dirname, '../../public/pages/course-error.html'));
    }
}

/**
 * Middleware: Require instructor role for course (page routes)
 * Must run after validateCourseAccess. Redirects non-instructors to course-selection.
 */
function requireInstructorForCourse(req: Request, res: Response, next: express.NextFunction) {
    const ctx = (req as any).courseContext;
    if (!ctx?.isInstructor) {
        appLogger.log(`[COURSE-ROUTES] User attempted instructor route without instructor role, redirecting to course-selection`);
        return res.redirect('/course-selection');
    }
    next();
}

/**
 * Middleware: Require student role for course (page routes)
 * Must run after validateCourseAccess. Redirects instructors and non-enrolled users to course-selection.
 */
function requireStudentForCourse(req: Request, res: Response, next: express.NextFunction) {
    const ctx = (req as any).courseContext;
    if (!ctx?.isEnrolled || ctx?.isInstructor) {
        appLogger.log(`[COURSE-ROUTES] User attempted student route without student role, redirecting to course-selection`);
        return res.redirect('/course-selection');
    }
    next();
}

/**
 * Serve instructor shell page
 * 
 * All instructor routes serve the same HTML shell (instructor-mode.html)
 * Frontend JavaScript parses URL to determine which component to load
 */
function serveInstructorShell() {
    return asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const publicPath = path.join(__dirname, '../../public');
        const instructorPagePath = path.join(publicPath, 'pages/instructor-mode.html');
        
        // Serve the same HTML shell for all instructor routes
        // Frontend will parse URL and load appropriate component
        res.sendFile(instructorPagePath);
    });
}

/**
 * Middleware: Validate authentication only (for new course onboarding)
 * 
 * Ensures:
 * - User is authenticated
 * - User is faculty (instructor)
 * Does NOT check course existence (course doesn't exist yet)
 */
async function validateInstructorAuth(req: Request, res: Response, next: express.NextFunction) {
    try {
        const user = (req as any).user;
        
        if (!user) {
            return res.status(401).redirect('/');
        }
        
        // Check if user is faculty
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const globalUser = await mongoDB.findGlobalUserByPUID(user.puid);
        
        if (!globalUser) {
            return res.status(401).redirect('/');
        }
        
        if (globalUser.affiliation !== 'faculty') {
            return res.status(403).send('Access denied: Only instructors can create new courses');
        }
        
        next();
    } catch (error) {
        appLogger.error('[COURSE-ROUTES] Error validating instructor auth:', error);
        res.status(500).send('Internal server error');
    }
}

/**
 * Serve student shell page
 * 
 * All student routes serve the same HTML shell (student-mode.html)
 * Frontend JavaScript parses URL to determine which component to load
 */
function serveStudentShell() {
    return asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const publicPath = path.join(__dirname, '../../public');
        const studentPagePath = path.join(publicPath, 'pages/student-mode.html');
        
        // Serve the same HTML shell for all student routes
        // Frontend will parse URL and load appropriate component
        res.sendFile(studentPagePath);
    });
}

/**
 * GET /course/:courseId/instructor/documents
 * Serves instructor documents page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/documents
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - Instructor documents page
 * @response 301 - Redirect to / or /course-selection (auth/role failure)
 * @response 404 - Course not found
 * @response 500 - Server error
 */
router.get('/course/:courseId/instructor/documents', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());


/**
 * GET /course/:courseId/instructor/flags
 * Serves instructor flags page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/flags
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - Instructor flags page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor/flags', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());


/**
 * GET /course/:courseId/instructor/monitor
 * Serves instructor monitor page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/monitor
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - Instructor monitor page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor/monitor', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());


/**
 * GET /course/:courseId/instructor/chat
 * Serves instructor chat page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/chat
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - Instructor chat page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor/chat', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());


/**
 * GET /course/:courseId/instructor/assistant-prompts
 * Serves assistant prompts page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/assistant-prompts
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - Assistant prompts page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor/assistant-prompts', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());


/**
 * GET /course/:courseId/instructor/system-prompts
 * Serves system prompts page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/system-prompts
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - System prompts page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor/system-prompts', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());


/**
 * GET /course/:courseId/instructor/course-information
 * Serves course information page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/course-information
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - Course information page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor/course-information', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());


/**
 * GET /course/:courseId/instructor/about
 * Serves instructor about page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/about
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - Instructor about page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor/about', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());


/**
 * GET /course/:courseId/instructor/welcoming-message
 * Serves welcoming message page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/welcoming-message
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - Welcoming message page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor/welcoming-message', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());


/**
 * GET /course/:courseId/instructor/onboarding/course-setup
 * Serves course setup onboarding page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/onboarding/course-setup
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - Course setup onboarding page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor/onboarding/course-setup', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());


/**
 * GET /course/:courseId/instructor/onboarding/document-setup
 * Serves document setup onboarding page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/onboarding/document-setup
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - Document setup onboarding page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor/onboarding/document-setup', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());

/**
 * GET /course/:courseId/instructor/onboarding/flag-setup
 * Serves flag setup onboarding page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/onboarding/flag-setup
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - Flag setup onboarding page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor/onboarding/flag-setup', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());


/**
 * GET /course/:courseId/instructor/onboarding/monitor-setup
 * Serves monitor setup onboarding page. Requires course access and instructor role.
 *
 * @route GET /course/:courseId/instructor/onboarding/monitor-setup
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves instructor-mode.html
 * @response 200 - Monitor setup onboarding page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor/onboarding/monitor-setup', validateCourseAccess, requireInstructorForCourse, serveInstructorShell());


/**
 * GET /instructor/onboarding/new-course
 * Serves new course onboarding page. Requires faculty role; course does not exist yet.
 *
 * @route GET /instructor/onboarding/new-course
 * @returns {void} Serves instructor-mode.html
 * @response 200 - New course onboarding page
 * @response 301 - Redirect to / (auth failure)
 * @response 403 - Access denied (non-faculty)
 * @response 500 - Server error
 */
router.get('/instructor/onboarding/new-course', validateInstructorAuth, serveInstructorShell());

/**
 * GET /course/:courseId/student
 * Serves student chat interface. Requires course access and student role.
 *
 * @route GET /course/:courseId/student
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves student-mode.html
 * @response 200 - Student chat interface
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/student', validateCourseAccess, requireStudentForCourse, serveStudentShell());


/**
 * GET /course/:courseId/student/chat
 * Serves student chat page. Requires course access and student role.
 *
 * @route GET /course/:courseId/student/chat
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves student-mode.html
 * @response 200 - Student chat page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/student/chat', validateCourseAccess, requireStudentForCourse, serveStudentShell());


/**
 * GET /course/:courseId/student/profile
 * Serves student profile page. Requires course access and student role.
 *
 * @route GET /course/:courseId/student/profile
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves student-mode.html
 * @response 200 - Student profile page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/student/profile', validateCourseAccess, requireStudentForCourse, serveStudentShell());


/**
 * GET /course/:courseId/student/flag-history
 * Serves student flag history page. Requires course access and student role.
 *
 * @route GET /course/:courseId/student/flag-history
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves student-mode.html
 * @response 200 - Student flag history page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/student/flag-history', validateCourseAccess, requireStudentForCourse, serveStudentShell());


/**
 * GET /course/:courseId/student/about
 * Serves student about page. Requires course access and student role.
 *
 * @route GET /course/:courseId/student/about
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves student-mode.html
 * @response 200 - Student about page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/student/about', validateCourseAccess, requireStudentForCourse, serveStudentShell());


/**
 * GET /course/:courseId/student/welcoming-message
 * Serves student welcoming message page. Requires course access and student role.
 *
 * @route GET /course/:courseId/student/welcoming-message
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves student-mode.html
 * @response 200 - Student welcoming message page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/student/welcoming-message', validateCourseAccess, requireStudentForCourse, serveStudentShell());

/**
 * GET /course/:courseId/student/onboarding/student
 * Serves student onboarding page. Requires course access and student role.
 *
 * @route GET /course/:courseId/student/onboarding/student
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Serves student-mode.html
 * @response 200 - Student onboarding page
 * @response 301 - Redirect (auth/role failure)
 * @response 404 - Course not found
 */
router.get('/course/:courseId/student/onboarding/student', validateCourseAccess, requireStudentForCourse, serveStudentShell());

/**
 * GET /course/:courseId/instructor
 * Redirects to instructor documents page.
 *
 * @route GET /course/:courseId/instructor
 * @param {string} courseId - Course ID (path param)
 * @returns {void} Redirects to /course/:courseId/instructor/documents
 * @response 301 - Redirect to documents
 * @response 404 - Course not found
 */
router.get('/course/:courseId/instructor', validateCourseAccess, requireInstructorForCourse, (req: Request, res: Response) => {
    const { courseId } = req.params;
    res.redirect(`/course/${courseId}/instructor/documents`);
});

export default router;

