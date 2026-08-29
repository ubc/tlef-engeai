/**
 * COURSE ENTRY API
 * 
 * Handles course selection and entry logic
 */

import express, { Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../middleware/async-handler';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { GlobalUser, CourseUser, User, activeCourse } from '../types/shared';
import { appLogger } from '../utils/logger';
import { refreshSessionGlobalUser } from '../helpers/session-global-user';
import { canManageCourseRoster, isCourseStaff, isInCourseTAs } from '../utils/course-staff';
import { isCourseAccessible } from '../helpers/course-access';
import { courseScopedAffiliation, joinsCourseAsStudent } from '../utils/affiliation';
import { resolveInstructorModeRedirect } from '../helpers/instructor-onboarding-redirect';

const router = express.Router();

/**
 * POST /enter
 * Enters a course by courseId. Creates or retrieves CourseUser, stores course in session, returns redirect path.
 *
 * @route POST /api/course/enter
 * @param {string} courseId - Course ID (body)
 * @returns {object} { redirect?: string, requiresOnboarding?: boolean, courseUser?: object, courseName?: string, error?: string }
 * @response 200 - Success
 * @response 400 - Course ID required
 * @response 401 - User not authenticated
 * @response 404 - Course not found
 * @response 500 - Failed to enter course
 */
router.post('/enter', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { courseId } = req.body;
        const globalUser = (req.session as any).globalUser;
        
        if (!globalUser) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        
        if (!courseId) {
            return res.status(400).json({ error: 'Course ID is required' });
        }
        
        appLogger.log(`[COURSE-ENTRY] User ${globalUser.puid} entering course ${courseId}`);
        
        // 1. Get course details from active-course-list
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const course = await mongoDB.getActiveCourse(courseId);
        
        if (!course) {
            appLogger.error(`[COURSE-ENTRY] Course not found: ${courseId}`);
            return res.status(404).json({ error: 'Course not found' });
        }
        
        appLogger.log(`[COURSE-ENTRY] Course found: ${course.courseName}`);

        const courseData = course as unknown as activeCourse;

        // Block removed faculty; students and staff joining by code are allowed through below
        if (!joinsCourseAsStudent(globalUser.affiliation) && !isCourseAccessible(courseData, globalUser)) {
            return res.status(403).json({ error: 'Course membership required' });
        }

        // Keep coursesEnrolled in sync for roster staff without re-adding instructors[]
        if (isCourseStaff(courseData, globalUser) && !globalUser.coursesEnrolled.includes(courseId)) {
            await mongoDB.addCourseToGlobalUser(globalUser.puid, courseId);
            appLogger.log(`[COURSE-ENTRY] Added course ${courseId} to staff enrolled list`);
        }
        
        // 2. Check if CourseUser exists in {courseName}_users
        // Use userId instead of puid (CourseUser doesn't store puid for privacy)
        let courseUser = await mongoDB.findStudentByUserId(
            course.courseName, 
            globalUser.userId
        );
        
        // 3. If CourseUser doesn't exist, create it
        if (!courseUser) {
            appLogger.log(`[COURSE-ENTRY] CourseUser not found, creating new one`);
            
            const courseAffiliation = courseScopedAffiliation(globalUser.affiliation);

            const newCourseUserData: Partial<User> = {
                name: globalUser.name,
                userId: globalUser.userId,  // Reuse from GlobalUser
                courseName: course.courseName,
                courseId: course.id,
                userOnboarding: false,
                affiliation: courseAffiliation,
                status: 'active',
                chats: []
            };
            
            courseUser = await mongoDB.createStudent(course.courseName, newCourseUserData) as any;
            
            appLogger.log(`[COURSE-ENTRY] CourseUser created`);
            
            // Initialize memory agent entry for the user
            try {
                await mongoDB.initializeMemoryAgentForUser(
                    course.courseName,
                    globalUser.userId,
                    globalUser.name,
                    courseAffiliation
                );
                appLogger.log(`[COURSE-ENTRY] Memory agent initialized for user`);
            } catch (error) {
                appLogger.error(`[COURSE-ENTRY] ⚠️ Error initializing memory agent:`, { error });
                // Continue even if memory agent initialization fails
            }
            
            // 4. Add course to GlobalUser's enrolled list
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                await mongoDB.addCourseToGlobalUser(
                    globalUser.puid, 
                    courseId
                );
                appLogger.log(`[COURSE-ENTRY] Added course to GlobalUser's enrolled list`);
            }
        } else {
            appLogger.log(`[COURSE-ENTRY] CourseUser found`);
            
            // Ensure course is in GlobalUser's enrolled list (fixes data inconsistency)
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                await mongoDB.addCourseToGlobalUser(
                    globalUser.puid, 
                    courseId
                );
                appLogger.log(`[COURSE-ENTRY] Added course to GlobalUser's enrolled list (was missing)`);
            }
        }
        
        // 5. Store current course in session
        (req.session as any).currentCourse = {
            courseId: course.id,
            courseName: course.courseName
        };
        
        appLogger.log(`[COURSE-ENTRY] Course stored in session`);
        
        // 6. Determine redirect based on affiliation + onboarding
        let redirect: string;
        let requiresOnboarding = false;

        const isTA = isInCourseTAs(courseData, globalUser.userId);

        if (isTA && !globalUser.coursesEnrolled.includes(courseId)) {
            await mongoDB.addCourseToGlobalUser(globalUser.puid, courseId);
            appLogger.log(`[COURSE-ENTRY] Added course ${courseId} to TA enrolled list`);
        }

        const isStaff = isCourseStaff(courseData, globalUser);

        // Sync session globalUser after enrollment mutations (coursesEnrolled drift fix).
        // Must precede the instructor redirect, which now reads per-user tutorial progress.
        const freshGlobalUser = await refreshSessionGlobalUser(req, mongoDB);

        if (joinsCourseAsStudent(globalUser.affiliation) && !isStaff && !(courseUser as any).userOnboarding) {
            redirect = `/course/${courseId}/student/onboarding/student`;
            requiresOnboarding = true;
            appLogger.log(`[COURSE-ENTRY] Redirecting student to onboarding`);
        } else if (isStaff) {
            const instructorRedirect = resolveInstructorModeRedirect(
                courseId,
                courseData,
                freshGlobalUser ?? globalUser,
                canManageCourseRoster(courseData, globalUser)
            );
            redirect = instructorRedirect.redirect;
            requiresOnboarding = instructorRedirect.requiresOnboarding;
            appLogger.log(`[COURSE-ENTRY] Redirecting course staff to instructor mode`);
        } else {
            redirect = `/course/${courseId}/student`;
            appLogger.log(`[COURSE-ENTRY] Redirecting student to chat interface`);
        }

        return res.json({
            redirect,
            requiresOnboarding,
            studentOnboardingCompleted: freshGlobalUser?.studentOnboardingCompleted ?? false,
            instructorOnboardingCompleted: freshGlobalUser?.instructorOnboardingCompleted ?? false,
            courseUser,
            courseName: course.courseName,
            courseId: course.id
        });
        
    } catch (error) {
        appLogger.error('[COURSE-ENTRY] Error:', { error });
        return res.status(500).json({ 
            error: 'Failed to enter course',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

/**
 * POST /enter-by-code
 * Enters a course using a 6-character uppercase alphanumeric course code.
 *
 * Students join without prior enrollment. Faculty not on `instructors[]` are auto-added
 * when they present a valid code (see `enrollFacultyInstructorViaCourseCode`). Other
 * non-students without membership receive 403. Contrast with POST `/enter`, which never
 * auto-adds faculty and blocks removed instructors who only have a course ID.
 *
 * @route POST /api/course/enter-by-code
 * @param {string} courseCode - 6-character course code (body)
 * @returns {object} { redirect?: string, requiresOnboarding?: boolean, courseUser?: object, courseName?: string, error?: string }
 * @response 200 - Success
 * @response 400 - Course code required or invalid format
 * @response 401 - User not authenticated
 * @response 404 - Course not found
 * @response 500 - Failed to enter course
 */
router.post('/enter-by-code', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { courseCode } = req.body;
        const globalUser = (req.session as any).globalUser;
        
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
        
        appLogger.log(`[COURSE-ENTRY] User ${globalUser.puid} entering course with code: ${courseCode}`);
        
        // 1. Get course details by course code
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const course = await mongoDB.getActiveCourseByCode(courseCode);
        
        if (!course) {
            appLogger.error(`[COURSE-ENTRY] Course not found with code: ${courseCode}`);
            return res.status(404).json({ error: 'Course not found. Please check the course code and try again.' });
        }
        
        appLogger.log(`[COURSE-ENTRY] Course found: ${course.courseName} (ID: ${course.id})`);
        
        const courseId = course.id;
        let courseData = course as unknown as activeCourse;

        // ====================================================================
        // STEP 2: Course-code access gate (differs from POST /enter by course ID)
        // ====================================================================
        //
        // A valid PIN is the trust boundary for enter-by-code. Students may join before
        // they appear in coursesEnrolled. Faculty not yet on instructors[] are auto-added
        // so downstream isCourseStaff checks and instructor redirects succeed.
        // POST /enter still blocks removed faculty who only have a bookmarked course ID.

        // Faculty with a valid code join as instructor when not already course staff
        if (globalUser.affiliation === 'faculty' && !isCourseAccessible(courseData, globalUser)) {
            courseData = await mongoDB.enrollFacultyInstructorViaCourseCode(courseData, globalUser);
        } else if (!joinsCourseAsStudent(globalUser.affiliation) && !isCourseAccessible(courseData, globalUser)) {
            // Non-student, non-faculty (e.g. TA/staff) without roster membership cannot self-join
            return res.status(403).json({ error: 'Course membership required' });
        }

        if (isCourseStaff(courseData, globalUser) && !globalUser.coursesEnrolled.includes(courseId)) {
            await mongoDB.addCourseToGlobalUser(globalUser.puid, courseId);
            appLogger.log(`[COURSE-ENTRY] Added course ${courseId} to staff enrolled list`);
        }
        
        // 3. Check if CourseUser exists in {courseName}_users
        // Use userId instead of puid (CourseUser doesn't store puid for privacy)
        let courseUser = await mongoDB.findStudentByUserId(
            course.courseName, 
            globalUser.userId
        );
        
        // 4. If CourseUser doesn't exist, create it
        if (!courseUser) {
            appLogger.log(`[COURSE-ENTRY] CourseUser not found, creating new one`);
            
            const courseAffiliation = courseScopedAffiliation(globalUser.affiliation);

            const newCourseUserData: Partial<User> = {
                name: globalUser.name,
                userId: globalUser.userId,  // Reuse from GlobalUser
                courseName: course.courseName,
                courseId: course.id,
                userOnboarding: false,
                affiliation: courseAffiliation,
                status: 'active',
                chats: []
            };
            
            courseUser = await mongoDB.createStudent(course.courseName, newCourseUserData) as any;
            
            appLogger.log(`[COURSE-ENTRY] CourseUser created`);
            
            // Initialize memory agent entry for the user
            try {
                await mongoDB.initializeMemoryAgentForUser(
                    course.courseName,
                    globalUser.userId,
                    globalUser.name,
                    courseAffiliation
                );
                appLogger.log(`[COURSE-ENTRY] Memory agent initialized for user`);
            } catch (error) {
                appLogger.error(`[COURSE-ENTRY] ⚠️ Error initializing memory agent:`, { error });
                // Continue even if memory agent initialization fails
            }
            
            // 5. Add course to GlobalUser's enrolled list
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                await mongoDB.addCourseToGlobalUser(
                    globalUser.puid, 
                    courseId
                );
                appLogger.log(`[COURSE-ENTRY] Added course to GlobalUser's enrolled list`);
            }
        } else {
            appLogger.log(`[COURSE-ENTRY] CourseUser found`);
            
            // Ensure course is in GlobalUser's enrolled list (fixes data inconsistency)
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                await mongoDB.addCourseToGlobalUser(
                    globalUser.puid, 
                    courseId
                );
                appLogger.log(`[COURSE-ENTRY] Added course to GlobalUser's enrolled list (was missing)`);
            }
        }
        
        // 6. Store current course in session
        (req.session as any).currentCourse = {
            courseId: course.id,
            courseName: course.courseName
        };
        
        appLogger.log(`[COURSE-ENTRY] Course stored in session`);
        
        // 7. Determine redirect based on affiliation + onboarding
        let redirect: string;
        let requiresOnboarding = false;

        const isTA = isInCourseTAs(courseData, globalUser.userId);

        if (isTA && !globalUser.coursesEnrolled.includes(courseId)) {
            await mongoDB.addCourseToGlobalUser(globalUser.puid, courseId);
            appLogger.log(`[COURSE-ENTRY] Added course ${courseId} to TA enrolled list`);
        }

        const isStaff = isCourseStaff(courseData, globalUser);

        // Sync session globalUser after enrollment mutations (coursesEnrolled drift fix).
        // Must precede the instructor redirect, which now reads per-user tutorial progress.
        const freshGlobalUser = await refreshSessionGlobalUser(req, mongoDB);

        if (joinsCourseAsStudent(globalUser.affiliation) && !isStaff && !(courseUser as any).userOnboarding) {
            redirect = `/course/${courseId}/student/onboarding/student`;
            requiresOnboarding = true;
            appLogger.log(`[COURSE-ENTRY] Redirecting student to onboarding`);
        } else if (isStaff) {
            const instructorRedirect = resolveInstructorModeRedirect(
                courseId,
                courseData,
                freshGlobalUser ?? globalUser,
                canManageCourseRoster(courseData, globalUser)
            );
            redirect = instructorRedirect.redirect;
            requiresOnboarding = instructorRedirect.requiresOnboarding;
            appLogger.log(`[COURSE-ENTRY] Redirecting course staff to instructor mode`);
        } else {
            redirect = `/course/${courseId}/student`;
            appLogger.log(`[COURSE-ENTRY] Redirecting student to chat interface`);
        }

        return res.json({
            redirect,
            requiresOnboarding,
            studentOnboardingCompleted: freshGlobalUser?.studentOnboardingCompleted ?? false,
            instructorOnboardingCompleted: freshGlobalUser?.instructorOnboardingCompleted ?? false,
            courseUser,
            courseName: course.courseName,
            courseId: course.id
        });
        
    } catch (error) {
        appLogger.error('[COURSE-ENTRY] Error:', { error });
        return res.status(500).json({ 
            error: 'Failed to enter course',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

/**
 * GET /current
 * Returns current course information from session.
 *
 * @route GET /api/course/current
 * @returns {object} { course?: object, error?: string }
 * @response 200 - Success
 * @response 404 - No current course in session
 * @response 500 - Failed to get current course
 */
router.get('/current', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const currentCourse = (req.session as any).currentCourse;
        
        if (!currentCourse) {
            return res.status(404).json({ error: 'No current course' });
        }
        
        return res.json({
            course: currentCourse
        });
        
    } catch (error) {
        appLogger.error('[COURSE-CURRENT] Error:', { error });
        return res.status(500).json({ 
            error: 'Failed to get current course'
        });
    }
}));


export default router;

