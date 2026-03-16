/**
 * COURSE ENTRY API
 * 
 * Handles course selection and entry logic
 */

import express, { Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../middleware/async-handler';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { GlobalUser, CourseUser, User } from '../types/shared';
import { appLogger } from '../utils/logger';

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
        
        // 1.5. Handle instructor joining existing course
        if (globalUser.affiliation === 'faculty') {
            const courseData = course as any;
            const instructorUserId = globalUser.userId;
            const instructorName = globalUser.name;
            
            // Helper function to check if instructor is already in the array (handles both old and new formats)
            const isInstructorInArray = (instructors: any[]): boolean => {
                if (!instructors || instructors.length === 0) return false;
                return instructors.some(inst => {
                    if (typeof inst === 'string') {
                        return inst === instructorUserId; // Old format
                    } else if (inst && inst.userId) {
                        return inst.userId === instructorUserId; // New format
                    }
                    return false;
                });
            };
            
            // Check if instructor is already in the course's instructors array
            if (!isInstructorInArray(courseData.instructors || [])) {
                appLogger.log(`[COURSE-ENTRY] Instructor ${instructorUserId} not in course instructors list, adding...`);
                
                // Get existing instructors and convert to new format if needed
                const existingInstructors = courseData.instructors || [];
                const updatedInstructors = existingInstructors.map((inst: any) => {
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
                
                await mongoDB.updateActiveCourse(courseId, {
                    instructors: updatedInstructors
                } as any);
                
                appLogger.log(`[COURSE-ENTRY] Added instructor ${instructorName} (${instructorUserId}) to course's instructors list`);
            }
            
            // Ensure instructor is enrolled in the course (add to coursesEnrolled)
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                await mongoDB.addCourseToGlobalUser(
                    globalUser.puid, 
                    courseId
                );
                appLogger.log(`[COURSE-ENTRY] Added course ${courseId} to instructor's enrolled list`);
            }
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
            
            const newCourseUserData: Partial<User> = {
                name: globalUser.name,
                userId: globalUser.userId,  // Reuse from GlobalUser
                courseName: course.courseName,
                courseId: course.id,
                userOnboarding: false,
                affiliation: globalUser.affiliation,
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
                    globalUser.affiliation
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
        
        if (globalUser.affiliation === 'student' && !(courseUser as any).userOnboarding) {
            redirect = `/course/${courseId}/student/onboarding/student`;
            requiresOnboarding = true;
            appLogger.log(`[COURSE-ENTRY] Redirecting student to onboarding`);
        } else if (globalUser.affiliation === 'faculty') {
            // Check which onboarding stage is incomplete for instructors
            const courseData = course as any;
            if (!courseData.courseSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/course-setup`;
                requiresOnboarding = true;
                appLogger.log(`[COURSE-ENTRY] Redirecting faculty to course-setup onboarding`);
            } else if (!courseData.contentSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/document-setup`;
                requiresOnboarding = true;
                appLogger.log(`[COURSE-ENTRY] Redirecting faculty to document-setup onboarding`);
            } else if (!courseData.flagSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/flag-setup`;
                requiresOnboarding = true;
                appLogger.log(`[COURSE-ENTRY] Redirecting faculty to flag-setup onboarding`);
            } else if (!courseData.monitorSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/monitor-setup`;
                requiresOnboarding = true;
                appLogger.log(`[COURSE-ENTRY] Redirecting faculty to monitor-setup onboarding`);
            } else {
                redirect = `/course/${courseId}/instructor/documents`;
                appLogger.log(`[COURSE-ENTRY] Redirecting faculty to instructor documents`);
            }
        } else {
            redirect = `/course/${courseId}/student`;
            appLogger.log(`[COURSE-ENTRY] Redirecting student to chat interface`);
        }
        
        return res.json({
            redirect,
            requiresOnboarding,
            courseUser,
            courseName: course.courseName
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
        
        // 2. Use the same course entry logic as /enter endpoint
        const courseId = course.id;
        
        // 2.5. Handle instructor joining existing course
        if (globalUser.affiliation === 'faculty') {
            const courseData = course as any;
            const instructorUserId = globalUser.userId;
            const instructorName = globalUser.name;
            
            // Helper function to check if instructor is already in the array (handles both old and new formats)
            const isInstructorInArray = (instructors: any[]): boolean => {
                if (!instructors || instructors.length === 0) return false;
                return instructors.some(inst => {
                    if (typeof inst === 'string') {
                        return inst === instructorUserId; // Old format
                    } else if (inst && inst.userId) {
                        return inst.userId === instructorUserId; // New format
                    }
                    return false;
                });
            };
            
            // Check if instructor is already in the course's instructors array
            if (!isInstructorInArray(courseData.instructors || [])) {
                appLogger.log(`[COURSE-ENTRY] Instructor ${instructorUserId} not in course instructors list, adding...`);
                
                // Get existing instructors and convert to new format if needed
                const existingInstructors = courseData.instructors || [];
                const updatedInstructors = existingInstructors.map((inst: any) => {
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
                
                await mongoDB.updateActiveCourse(courseId, {
                    instructors: updatedInstructors
                } as any);
                
                appLogger.log(`[COURSE-ENTRY] Added instructor ${instructorName} (${instructorUserId}) to course's instructors list`);
            }
            
            // Ensure instructor is enrolled in the course (add to coursesEnrolled)
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                await mongoDB.addCourseToGlobalUser(
                    globalUser.puid, 
                    courseId
                );
                appLogger.log(`[COURSE-ENTRY] Added course ${courseId} to instructor's enrolled list`);
            }
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
            
            const newCourseUserData: Partial<User> = {
                name: globalUser.name,
                userId: globalUser.userId,  // Reuse from GlobalUser
                courseName: course.courseName,
                courseId: course.id,
                userOnboarding: false,
                affiliation: globalUser.affiliation,
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
                    globalUser.affiliation
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
        
        if (globalUser.affiliation === 'student' && !(courseUser as any).userOnboarding) {
            redirect = `/course/${courseId}/student/onboarding/student`;
            requiresOnboarding = true;
            appLogger.log(`[COURSE-ENTRY] Redirecting student to onboarding`);
        } else if (globalUser.affiliation === 'faculty') {
            // Check which onboarding stage is incomplete for instructors
            const courseData = course as any;
            if (!courseData.courseSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/course-setup`;
                requiresOnboarding = true;
                appLogger.log(`[COURSE-ENTRY] Redirecting faculty to course-setup onboarding`);
            } else if (!courseData.contentSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/document-setup`;
                requiresOnboarding = true;
                appLogger.log(`[COURSE-ENTRY] Redirecting faculty to document-setup onboarding`);
            } else if (!courseData.flagSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/flag-setup`;
                requiresOnboarding = true;
                appLogger.log(`[COURSE-ENTRY] Redirecting faculty to flag-setup onboarding`);
            } else if (!courseData.monitorSetup) {
                redirect = `/course/${courseId}/instructor/onboarding/monitor-setup`;
                requiresOnboarding = true;
                appLogger.log(`[COURSE-ENTRY] Redirecting faculty to monitor-setup onboarding`);
            } else {
                redirect = `/course/${courseId}/instructor/documents`;
                appLogger.log(`[COURSE-ENTRY] Redirecting faculty to instructor documents`);
            }
        } else {
            redirect = `/course/${courseId}/student`;
            appLogger.log(`[COURSE-ENTRY] Redirecting student to chat interface`);
        }
        
        return res.json({
            redirect,
            requiresOnboarding,
            courseUser,
            courseName: course.courseName
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

