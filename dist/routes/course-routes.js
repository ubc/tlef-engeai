"use strict";
/**
 * Course Route Handlers
 *
 * Handles all course-scoped routes including instructor and student interfaces
 * Uses SPA pattern: All routes serve the same HTML shell, frontend handles component loading
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const asyncHandler_1 = require("../middleware/asyncHandler");
const EngEAI_MongoDB_1 = require("../functions/EngEAI_MongoDB");
const router = express_1.default.Router();
/**
 * Middleware: Validate course access
 *
 * Ensures:
 * - courseId exists in database
 * - User is authenticated
 * - User has access to the course (instructor or enrolled student)
 */
function validateCourseAccess(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { courseId } = req.params;
            const user = req.user;
            if (!user) {
                return res.status(401).redirect('/auth/login');
            }
            // Get course from database
            const mongoDB = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
            const course = yield mongoDB.getActiveCourse(courseId);
            if (!course) {
                // Return 404 with error page (not 403) to prevent courseId enumeration
                console.log(`[COURSE-ROUTES] Course ${courseId} not found, serving error page`);
                return res.status(404).sendFile(path_1.default.join(__dirname, '../../public/pages/course-error.html'));
            }
            // Check if user has access
            const globalUser = yield mongoDB.findGlobalUserByPUID(user.puid);
            if (!globalUser) {
                return res.status(401).redirect('/auth/login');
            }
            // Verify user is enrolled or is instructor
            const isInstructor = globalUser.affiliation === 'faculty' &&
                ((_a = course.instructors) === null || _a === void 0 ? void 0 : _a.some((inst) => (typeof inst === 'string' ? inst : inst.userId) === globalUser.userId));
            const isEnrolled = globalUser.coursesEnrolled.includes(courseId);
            if (!isInstructor && !isEnrolled) {
                console.log(`[COURSE-ROUTES] User ${user.puid} not authorized for course ${courseId}, serving error page`);
                return res.status(403).sendFile(path_1.default.join(__dirname, '../../public/pages/course-error.html'));
            }
            // Set course context in request
            req.courseContext = {
                courseId: course.id,
                courseName: course.courseName,
                course: course
            };
            // Update session if needed
            if (!req.session.currentCourse ||
                req.session.currentCourse.courseId !== courseId) {
                req.session.currentCourse = {
                    courseId: course.id,
                    courseName: course.courseName
                };
            }
            next();
        }
        catch (error) {
            console.error('[COURSE-ROUTES] Error validating course access:', error);
            // For server errors, still serve the error page but with 500 status
            res.status(500).sendFile(path_1.default.join(__dirname, '../../public/pages/course-error.html'));
        }
    });
}
/**
 * Serve instructor shell page
 *
 * All instructor routes serve the same HTML shell (instructor-mode.html)
 * Frontend JavaScript parses URL to determine which component to load
 */
function serveInstructorShell() {
    return (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(this, void 0, void 0, function* () {
        const publicPath = path_1.default.join(__dirname, '../../public');
        const instructorPagePath = path_1.default.join(publicPath, 'pages/instructor-mode.html');
        // Serve the same HTML shell for all instructor routes
        // Frontend will parse URL and load appropriate component
        res.sendFile(instructorPagePath);
    }));
}
/**
 * Middleware: Validate authentication only (for new course onboarding)
 *
 * Ensures:
 * - User is authenticated
 * - User is faculty (instructor)
 * Does NOT check course existence (course doesn't exist yet)
 */
function validateInstructorAuth(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).redirect('/auth/login');
            }
            // Check if user is faculty
            const mongoDB = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
            const globalUser = yield mongoDB.findGlobalUserByPUID(user.puid);
            if (!globalUser) {
                return res.status(401).redirect('/auth/login');
            }
            if (globalUser.affiliation !== 'faculty') {
                return res.status(403).send('Access denied: Only instructors can create new courses');
            }
            next();
        }
        catch (error) {
            console.error('[COURSE-ROUTES] Error validating instructor auth:', error);
            res.status(500).send('Internal server error');
        }
    });
}
/**
 * Serve student shell page
 *
 * All student routes serve the same HTML shell (student-mode.html)
 * Frontend JavaScript parses URL to determine which component to load
 */
function serveStudentShell() {
    return (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(this, void 0, void 0, function* () {
        const publicPath = path_1.default.join(__dirname, '../../public');
        const studentPagePath = path_1.default.join(publicPath, 'pages/student-mode.html');
        // Serve the same HTML shell for all student routes
        // Frontend will parse URL and load appropriate component
        res.sendFile(studentPagePath);
    }));
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
router.get('/course/:courseId/instructor', validateCourseAccess, (req, res) => {
    const { courseId } = req.params;
    res.redirect(`/course/${courseId}/instructor/documents`);
});
exports.default = router;
