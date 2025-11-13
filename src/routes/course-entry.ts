/**
 * COURSE ENTRY API
 * 
 * Handles course selection and entry logic
 */

import express, { Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../middleware/asyncHandler';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';
import { GlobalUser, CourseUser, User } from '../functions/types';

const router = express.Router();

/**
 * POST /api/course/enter
 * 
 * Enters a course by creating/retrieving CourseUser
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
        
        console.log(`[COURSE-ENTRY] User ${globalUser.puid} entering course ${courseId}`);
        
        // 1. Get course details from active-course-list
        const mongoDB = await EngEAI_MongoDB.getInstance();
        const course = await mongoDB.getActiveCourse(courseId);
        
        if (!course) {
            console.error(`[COURSE-ENTRY] Course not found: ${courseId}`);
            return res.status(404).json({ error: 'Course not found' });
        }
        
        console.log(`[COURSE-ENTRY] Course found: ${course.courseName}`);
        
        // 2. Check if CourseUser exists in {courseName}_users
        let courseUser = await mongoDB.findStudentByPUID(
            course.courseName, 
            globalUser.puid
        );
        
        // 3. If CourseUser doesn't exist, create it
        if (!courseUser) {
            console.log(`[COURSE-ENTRY] CourseUser not found, creating new one`);
            
            const newCourseUserData: Partial<User> = {
                name: globalUser.name,
                puid: globalUser.puid,
                userId: globalUser.userId,  // Reuse from GlobalUser
                courseName: course.courseName,
                courseId: course.id,
                userOnboarding: false,
                affiliation: globalUser.affiliation,
                status: 'active',
                chats: []
            };
            
            courseUser = await mongoDB.createStudent(course.courseName, newCourseUserData) as any;
            
            console.log(`[COURSE-ENTRY] CourseUser created`);
            
            // Initialize memory agent entry for the user
            try {
                await mongoDB.initializeMemoryAgentForUser(
                    course.courseName,
                    globalUser.userId,
                    globalUser.name,
                    globalUser.affiliation
                );
                console.log(`[COURSE-ENTRY] Memory agent initialized for user`);
            } catch (error) {
                console.error(`[COURSE-ENTRY] ⚠️ Error initializing memory agent:`, error);
                // Continue even if memory agent initialization fails
            }
            
            // 4. Add course to GlobalUser's enrolled list
            if (!globalUser.coursesEnrolled.includes(courseId)) {
                await mongoDB.addCourseToGlobalUser(
                    globalUser.puid, 
                    courseId
                );
                console.log(`[COURSE-ENTRY] Added course to GlobalUser's enrolled list`);
            }
        } else {
            console.log(`[COURSE-ENTRY] CourseUser found`);
        }
        
        // 5. Store current course in session
        (req.session as any).currentCourse = {
            courseId: course.id,
            courseName: course.courseName
        };
        
        console.log(`[COURSE-ENTRY] Course stored in session`);
        
        // 6. Determine redirect based on affiliation + onboarding
        let redirect: string;
        let requiresOnboarding = false;
        
        if (globalUser.affiliation === 'student' && !(courseUser as any).userOnboarding) {
            redirect = '/pages/student-mode.html';
            requiresOnboarding = true;
            console.log(`[COURSE-ENTRY] Redirecting student to onboarding`);
        } else if (globalUser.affiliation === 'faculty') {
            redirect = '/pages/instructor-mode.html';
            console.log(`[COURSE-ENTRY] Redirecting faculty to instructor mode`);
        } else {
            redirect = '/pages/student-mode.html';
            console.log(`[COURSE-ENTRY] Redirecting student to chat interface`);
        }
        
        return res.json({
            redirect,
            requiresOnboarding,
            courseUser,
            courseName: course.courseName
        });
        
    } catch (error) {
        console.error('[COURSE-ENTRY] Error:', error);
        return res.status(500).json({ 
            error: 'Failed to enter course',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

/**
 * GET /api/course/current
 * 
 * Get current course information from session
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
        console.error('[COURSE-CURRENT] Error:', error);
        return res.status(500).json({ 
            error: 'Failed to get current course'
        });
    }
}));


export default router;

