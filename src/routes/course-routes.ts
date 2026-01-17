/**
 * Course Route Handlers
 * 
 * Handles all course-scoped routes including instructor and student interfaces
 * Uses SPA pattern: All routes serve the same HTML shell, frontend handles component loading
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { asyncHandlerWithAuth } from '../middleware/asyncHandler';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';

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
            return res.status(401).redirect('/auth/login');
        }
        
        // Get course from database
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const course = await mongoDB.getActiveCourse(courseId);
        
        if (!course) {
            // Return 404 (not 403) to prevent courseId enumeration
            return res.status(404).send('Course not found');
        }
        
        // Check if user has access
        const globalUser = await mongoDB.findGlobalUserByPUID(user.puid);
        if (!globalUser) {
            return res.status(401).redirect('/auth/login');
        }
        
        // Verify user is enrolled or is instructor
        const isInstructor = globalUser.affiliation === 'faculty' && 
                            course.instructors?.some((inst: any) => 
                                (typeof inst === 'string' ? inst : inst.userId) === globalUser.userId
                            );
        const isEnrolled = globalUser.coursesEnrolled.includes(courseId);
        
        if (!isInstructor && !isEnrolled) {
            return res.status(403).send('Access denied: You are not enrolled in this course');
        }
        
        // Set course context in request
        (req as any).courseContext = {
            courseId: course.id,
            courseName: course.courseName,
            course: course
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
        console.error('[COURSE-ROUTES] Error validating course access:', error);
        res.status(500).send('Internal server error');
    }
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
            return res.status(401).redirect('/auth/login');
        }
        
        // Check if user is faculty
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const globalUser = await mongoDB.findGlobalUserByPUID(user.puid);
        
        if (!globalUser) {
            return res.status(401).redirect('/auth/login');
        }
        
        if (globalUser.affiliation !== 'faculty') {
            return res.status(403).send('Access denied: Only instructors can create new courses');
        }
        
        next();
    } catch (error) {
        console.error('[COURSE-ROUTES] Error validating instructor auth:', error);
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

// Instructor Routes - All serve the same shell, frontend handles component loading
router.get('/course/:courseId/instructor/documents', validateCourseAccess, serveInstructorShell());
router.get('/course/:courseId/instructor/flags', validateCourseAccess, serveInstructorShell());
router.get('/course/:courseId/instructor/monitor', validateCourseAccess, serveInstructorShell());
router.get('/course/:courseId/instructor/chat', validateCourseAccess, serveInstructorShell());
router.get('/course/:courseId/instructor/assistant-prompts', validateCourseAccess, serveInstructorShell());
router.get('/course/:courseId/instructor/system-prompts', validateCourseAccess, serveInstructorShell());
router.get('/course/:courseId/instructor/course-information', validateCourseAccess, serveInstructorShell());
router.get('/course/:courseId/instructor/about', validateCourseAccess, serveInstructorShell());

// Instructor Onboarding Routes (for existing courses)
router.get('/course/:courseId/instructor/onboarding/course-setup', validateCourseAccess, serveInstructorShell());
router.get('/course/:courseId/instructor/onboarding/document-setup', validateCourseAccess, serveInstructorShell());
router.get('/course/:courseId/instructor/onboarding/flag-setup', validateCourseAccess, serveInstructorShell());
router.get('/course/:courseId/instructor/onboarding/monitor-setup', validateCourseAccess, serveInstructorShell());

// New Course Onboarding Route (no courseId required - course doesn't exist yet)
router.get('/instructor/onboarding/new-course', validateInstructorAuth, serveInstructorShell());

// Student Routes - All serve the same shell, frontend handles component loading
router.get('/course/:courseId/student', validateCourseAccess, serveStudentShell());
router.get('/course/:courseId/student/chat', validateCourseAccess, serveStudentShell());
router.get('/course/:courseId/student/profile', validateCourseAccess, serveStudentShell());
router.get('/course/:courseId/student/flag-history', validateCourseAccess, serveStudentShell());
router.get('/course/:courseId/student/about', validateCourseAccess, serveStudentShell());

// Student Onboarding Routes
router.get('/course/:courseId/student/onboarding/student', validateCourseAccess, serveStudentShell());

// Default instructor route - redirect to documents
router.get('/course/:courseId/instructor', validateCourseAccess, (req: Request, res: Response) => {
    const { courseId } = req.params;
    res.redirect(`/course/${courseId}/instructor/documents`);
});

export default router;

