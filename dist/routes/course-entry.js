"use strict";
/**
 * COURSE ENTRY API
 *
 * Handles course selection and entry logic
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
const asyncHandler_1 = require("../middleware/asyncHandler");
const EngEAI_MongoDB_1 = require("../functions/EngEAI_MongoDB");
const router = express_1.default.Router();
/**
 * POST /api/course/enter
 *
 * Enters a course by creating/retrieving CourseUser
 */
router.post('/enter', (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { courseId } = req.body;
        const globalUser = req.session.globalUser;
        if (!globalUser) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        if (!courseId) {
            return res.status(400).json({ error: 'Course ID is required' });
        }
        console.log(`[COURSE-ENTRY] User ${globalUser.puid} entering course ${courseId}`);
        // 1. Get course details from active-course-list
        const mongoDB = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
        const course = yield mongoDB.getActiveCourse(courseId);
        if (!course) {
            console.error(`[COURSE-ENTRY] Course not found: ${courseId}`);
            return res.status(404).json({ error: 'Course not found' });
        }
        console.log(`[COURSE-ENTRY] Course found: ${course.courseName}`);
        // 1.5. Handle instructor joining existing course
        if (globalUser.affiliation === 'faculty') {
            const courseData = course;
            const instructorUserId = globalUser.userId;
            const instructorName = globalUser.name;
            // Helper function to check if instructor is already in the array (handles both old and new formats)
            const isInstructorInArray = (instructors) => {
                if (!instructors || instructors.length === 0)
                    return false;
                return instructors.some(inst => {
                    if (typeof inst === 'string') {
                        return inst === instructorUserId; // Old format
                    }
                    else if (inst && inst.userId) {
                        return inst.userId === instructorUserId; // New format
                    }
                    return false;
                });
            };
            // Check if instructor is already in the course's instructors array
            if (!isInstructorInArray(courseData.instructors || [])) {
                console.log(`[COURSE-ENTRY] Instructor ${instructorUserId} not in course instructors list, adding...`);
                // Get existing instructors and convert to new format if needed
                const existingInstructors = courseData.instructors || [];
                const updatedInstructors = existingInstructors.map((inst) => {
                    // Convert old format to new format if needed
                    if (typeof inst === 'string') {
                        return { userId: inst, name: 'Unknown' }; // Will be updated later if needed
                    }
                    return inst; // Already in new format
                });
                // Add new instructor with name
                updatedInstructors.push({
                    userId: instructorUserId,
                    name: instructorName
                });
                yield mongoDB.updateActiveCourse(courseId, {
                    instructors: updatedInstructors
                });
                console.log(`[COURSE-ENTRY] Added instructor ${instructorName} (${instructorUserId}) to course's instructors list`);
            }
            // Ensure instructor is enrolled in the course (add to coursesEnrolled)
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                yield mongoDB.addCourseToGlobalUser(globalUser.puid, courseId);
                console.log(`[COURSE-ENTRY] Added course ${courseId} to instructor's enrolled list`);
            }
        }
        // 2. Check if CourseUser exists in {courseName}_users
        // Use userId instead of puid (CourseUser doesn't store puid for privacy)
        let courseUser = yield mongoDB.findStudentByUserId(course.courseName, globalUser.userId);
        // 3. If CourseUser doesn't exist, create it
        if (!courseUser) {
            console.log(`[COURSE-ENTRY] CourseUser not found, creating new one`);
            const newCourseUserData = {
                name: globalUser.name,
                userId: globalUser.userId, // Reuse from GlobalUser
                courseName: course.courseName,
                courseId: course.id,
                userOnboarding: false,
                affiliation: globalUser.affiliation,
                status: 'active',
                chats: []
            };
            courseUser = (yield mongoDB.createStudent(course.courseName, newCourseUserData));
            console.log(`[COURSE-ENTRY] CourseUser created`);
            // Initialize memory agent entry for the user
            try {
                yield mongoDB.initializeMemoryAgentForUser(course.courseName, globalUser.userId, globalUser.name, globalUser.affiliation);
                console.log(`[COURSE-ENTRY] Memory agent initialized for user`);
            }
            catch (error) {
                console.error(`[COURSE-ENTRY] ⚠️ Error initializing memory agent:`, error);
                // Continue even if memory agent initialization fails
            }
            // 4. Add course to GlobalUser's enrolled list
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                yield mongoDB.addCourseToGlobalUser(globalUser.puid, courseId);
                console.log(`[COURSE-ENTRY] Added course to GlobalUser's enrolled list`);
            }
        }
        else {
            console.log(`[COURSE-ENTRY] CourseUser found`);
            // Ensure course is in GlobalUser's enrolled list (fixes data inconsistency)
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                yield mongoDB.addCourseToGlobalUser(globalUser.puid, courseId);
                console.log(`[COURSE-ENTRY] Added course to GlobalUser's enrolled list (was missing)`);
            }
        }
        // 5. Store current course in session
        req.session.currentCourse = {
            courseId: course.id,
            courseName: course.courseName
        };
        console.log(`[COURSE-ENTRY] Course stored in session`);
        // 6. Determine redirect based on affiliation + onboarding
        let redirect;
        let requiresOnboarding = false;
        if (globalUser.affiliation === 'student' && !courseUser.userOnboarding) {
            redirect = `/course/${courseId}/student/onboarding/student`;
            requiresOnboarding = true;
            console.log(`[COURSE-ENTRY] Redirecting student to onboarding`);
        }
        else if (globalUser.affiliation === 'faculty') {
            // Check which onboarding stage is incomplete for instructors
            const courseData = course;
            if (!courseData.courseSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/course-setup`;
                requiresOnboarding = true;
                console.log(`[COURSE-ENTRY] Redirecting faculty to course-setup onboarding`);
            }
            else if (!courseData.contentSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/document-setup`;
                requiresOnboarding = true;
                console.log(`[COURSE-ENTRY] Redirecting faculty to document-setup onboarding`);
            }
            else if (!courseData.flagSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/flag-setup`;
                requiresOnboarding = true;
                console.log(`[COURSE-ENTRY] Redirecting faculty to flag-setup onboarding`);
            }
            else if (!courseData.monitorSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/monitor-setup`;
                requiresOnboarding = true;
                console.log(`[COURSE-ENTRY] Redirecting faculty to monitor-setup onboarding`);
            }
            else {
                redirect = `/course/${courseId}/instructor/documents`;
                console.log(`[COURSE-ENTRY] Redirecting faculty to instructor documents`);
            }
        }
        else {
            redirect = `/course/${courseId}/student`;
            console.log(`[COURSE-ENTRY] Redirecting student to chat interface`);
        }
        return res.json({
            redirect,
            requiresOnboarding,
            courseUser,
            courseName: course.courseName
        });
    }
    catch (error) {
        console.error('[COURSE-ENTRY] Error:', error);
        return res.status(500).json({
            error: 'Failed to enter course',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
})));
/**
 * POST /api/course/enter-by-code
 *
 * Enters a course using a 6-character course code PIN
 */
router.post('/enter-by-code', (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { courseCode } = req.body;
        const globalUser = req.session.globalUser;
        if (!globalUser) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        if (!courseCode) {
            return res.status(400).json({ error: 'Course code is required' });
        }
        // Validate course code format: exactly 6 characters, uppercase alphanumeric
        const codeRegex = /^[A-Z0-9]{6}$/;
        if (!codeRegex.test(courseCode)) {
            return res.status(400).json({ error: 'Invalid course code format. Must be 6 uppercase alphanumeric characters.' });
        }
        console.log(`[COURSE-ENTRY] User ${globalUser.puid} entering course with code: ${courseCode}`);
        // 1. Get course details by course code
        const mongoDB = yield EngEAI_MongoDB_1.EngEAI_MongoDB.getInstance();
        const course = yield mongoDB.getActiveCourseByCode(courseCode);
        if (!course) {
            console.error(`[COURSE-ENTRY] Course not found with code: ${courseCode}`);
            return res.status(404).json({ error: 'Course not found. Please check the course code and try again.' });
        }
        console.log(`[COURSE-ENTRY] Course found: ${course.courseName} (ID: ${course.id})`);
        // 2. Use the same course entry logic as /enter endpoint
        const courseId = course.id;
        // 2.5. Handle instructor joining existing course
        if (globalUser.affiliation === 'faculty') {
            const courseData = course;
            const instructorUserId = globalUser.userId;
            const instructorName = globalUser.name;
            // Helper function to check if instructor is already in the array (handles both old and new formats)
            const isInstructorInArray = (instructors) => {
                if (!instructors || instructors.length === 0)
                    return false;
                return instructors.some(inst => {
                    if (typeof inst === 'string') {
                        return inst === instructorUserId; // Old format
                    }
                    else if (inst && inst.userId) {
                        return inst.userId === instructorUserId; // New format
                    }
                    return false;
                });
            };
            // Check if instructor is already in the course's instructors array
            if (!isInstructorInArray(courseData.instructors || [])) {
                console.log(`[COURSE-ENTRY] Instructor ${instructorUserId} not in course instructors list, adding...`);
                // Get existing instructors and convert to new format if needed
                const existingInstructors = courseData.instructors || [];
                const updatedInstructors = existingInstructors.map((inst) => {
                    // Convert old format to new format if needed
                    if (typeof inst === 'string') {
                        return { userId: inst, name: 'Unknown' }; // Will be updated later if needed
                    }
                    return inst; // Already in new format
                });
                // Add new instructor with name
                updatedInstructors.push({
                    userId: instructorUserId,
                    name: instructorName
                });
                yield mongoDB.updateActiveCourse(courseId, {
                    instructors: updatedInstructors
                });
                console.log(`[COURSE-ENTRY] Added instructor ${instructorName} (${instructorUserId}) to course's instructors list`);
            }
            // Ensure instructor is enrolled in the course (add to coursesEnrolled)
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                yield mongoDB.addCourseToGlobalUser(globalUser.puid, courseId);
                console.log(`[COURSE-ENTRY] Added course ${courseId} to instructor's enrolled list`);
            }
        }
        // 3. Check if CourseUser exists in {courseName}_users
        // Use userId instead of puid (CourseUser doesn't store puid for privacy)
        let courseUser = yield mongoDB.findStudentByUserId(course.courseName, globalUser.userId);
        // 4. If CourseUser doesn't exist, create it
        if (!courseUser) {
            console.log(`[COURSE-ENTRY] CourseUser not found, creating new one`);
            const newCourseUserData = {
                name: globalUser.name,
                userId: globalUser.userId, // Reuse from GlobalUser
                courseName: course.courseName,
                courseId: course.id,
                userOnboarding: false,
                affiliation: globalUser.affiliation,
                status: 'active',
                chats: []
            };
            courseUser = (yield mongoDB.createStudent(course.courseName, newCourseUserData));
            console.log(`[COURSE-ENTRY] CourseUser created`);
            // Initialize memory agent entry for the user
            try {
                yield mongoDB.initializeMemoryAgentForUser(course.courseName, globalUser.userId, globalUser.name, globalUser.affiliation);
                console.log(`[COURSE-ENTRY] Memory agent initialized for user`);
            }
            catch (error) {
                console.error(`[COURSE-ENTRY] ⚠️ Error initializing memory agent:`, error);
                // Continue even if memory agent initialization fails
            }
            // 5. Add course to GlobalUser's enrolled list
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                yield mongoDB.addCourseToGlobalUser(globalUser.puid, courseId);
                console.log(`[COURSE-ENTRY] Added course to GlobalUser's enrolled list`);
            }
        }
        else {
            console.log(`[COURSE-ENTRY] CourseUser found`);
            // Ensure course is in GlobalUser's enrolled list (fixes data inconsistency)
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                yield mongoDB.addCourseToGlobalUser(globalUser.puid, courseId);
                console.log(`[COURSE-ENTRY] Added course to GlobalUser's enrolled list (was missing)`);
            }
        }
        // 6. Store current course in session
        req.session.currentCourse = {
            courseId: course.id,
            courseName: course.courseName
        };
        console.log(`[COURSE-ENTRY] Course stored in session`);
        // 7. Determine redirect based on affiliation + onboarding
        let redirect;
        let requiresOnboarding = false;
        if (globalUser.affiliation === 'student' && !courseUser.userOnboarding) {
            redirect = `/course/${courseId}/student/onboarding/student`;
            requiresOnboarding = true;
            console.log(`[COURSE-ENTRY] Redirecting student to onboarding`);
        }
        else if (globalUser.affiliation === 'faculty') {
            // Check which onboarding stage is incomplete for instructors
            const courseData = course;
            if (!courseData.courseSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/course-setup`;
                requiresOnboarding = true;
                console.log(`[COURSE-ENTRY] Redirecting faculty to course-setup onboarding`);
            }
            else if (!courseData.contentSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/document-setup`;
                requiresOnboarding = true;
                console.log(`[COURSE-ENTRY] Redirecting faculty to document-setup onboarding`);
            }
            else if (!courseData.flagSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/flag-setup`;
                requiresOnboarding = true;
                console.log(`[COURSE-ENTRY] Redirecting faculty to flag-setup onboarding`);
            }
            else if (!courseData.monitorSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/monitor-setup`;
                requiresOnboarding = true;
                console.log(`[COURSE-ENTRY] Redirecting faculty to monitor-setup onboarding`);
            }
            else {
                redirect = `/course/${courseId}/instructor/documents`;
                console.log(`[COURSE-ENTRY] Redirecting faculty to instructor documents`);
            }
        }
        else {
            redirect = `/course/${courseId}/student`;
            console.log(`[COURSE-ENTRY] Redirecting student to chat interface`);
        }
        return res.json({
            redirect,
            requiresOnboarding,
            courseUser,
            courseName: course.courseName
        });
    }
    catch (error) {
        console.error('[COURSE-ENTRY] Error:', error);
        return res.status(500).json({
            error: 'Failed to enter course',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
})));
/**
 * GET /api/course/current
 *
 * Get current course information from session
 */
router.get('/current', (0, asyncHandler_1.asyncHandlerWithAuth)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentCourse = req.session.currentCourse;
        if (!currentCourse) {
            return res.status(404).json({ error: 'No current course' });
        }
        return res.json({
            course: currentCourse
        });
    }
    catch (error) {
        console.error('[COURSE-CURRENT] Error:', error);
        return res.status(500).json({
            error: 'Failed to get current course'
        });
    }
})));
exports.default = router;
