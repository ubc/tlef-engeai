
/**
 * ===========================================
 * ========= MONGODB DATABASE MANAGER =======
 * ===========================================
 *
 * This module provides MongoDB integration for the EngE-AI platform's course management system.
 * It implements a singleton pattern for database connections and provides CRUD operations
 * for active course management within the educational platform.
 *
 * Key Features:
 * - Singleton MongoDB connection management with authentication
 * - Active course list database operations (CRUD)
 * - Native MongoDB driver integration for direct database operations
 * - Environment-based configuration for database credentials
 * - Express.js router integration for RESTful API endpoints
 *
 * Database Structure:
 * - Database: TLEF-ENGEAI-DB
 * - Collection: active-course-list
 * - Document Structure: Course with id, name, description, timestamps
 *
 * Environment Variables Required:
 * - MONGO_USERNAME: MongoDB authentication username
 * - MONGO_PASSWORD: MongoDB authentication password
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 * 
 */

import express, { Request, Response } from 'express';
import { asyncHandler, asyncHandlerWithAuth } from '../middleware/asyncHandler';
import { EngEAI_MongoDB } from '../functions/EngEAI_MongoDB';
import { activeCourse, AdditionalMaterial, TopicOrWeekInstance, TopicOrWeekItem, FlagReport } from '../functions/types';
import { IDGenerator } from '../functions/unique-id-generator';
import dotenv from 'dotenv';

const router = express.Router();
export default router;

dotenv.config();


/**
 * ===========================================
 * ========= EXPRESS ROUTES SETUP ===========
 * ===========================================
 */


// Validation middleware for existing courses (requires ID)
const validateCourse = (req: Request, res: Response, next: Function) => {
    const course = req.body;
    
    if (!course) {
        return res.status(400).json({
            success: false,
            error: 'Request body is required'
        });
    }

    if (!course.id || typeof course.id !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Course ID is required and must be a string'
        });
    }

    if (!course.name || typeof course.name !== 'string' || course.name.trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'Course name is required and must be a non-empty string'
        });
    }

    if (!course.frameType || !['byWeek', 'byTopic'].includes(course.frameType)) {
        return res.status(400).json({
            success: false,
            error: 'Frame type is required and must be either "byWeek" or "byTopic"'
        });
    }

    if (!course.tilesNumber || typeof course.tilesNumber !== 'number' || course.tilesNumber < 0) {
        return res.status(400).json({
            success: false,
            error: 'Tiles number is required and must be a positive number'
        });
    }

    // Accept Date object or date string (from JSON)
    if (!course.date) {
        return res.status(400).json({
            success: false,
            error: 'Date is required'
        });
    }
    
    // Convert string to Date if needed (JSON.stringify converts Date to string)
    if (!(course.date instanceof Date)) {
        if (typeof course.date === 'string') {
            course.date = new Date(course.date);
        } else {
            return res.status(400).json({
                success: false,
                error: 'Date must be a Date object or valid date string'
            });
        }
    }

    // Validate new fields
    if (typeof course.onBoarded !== 'boolean') {
        return res.status(400).json({
            success: false,
            error: 'onBoarded is required and must be a boolean'
        });
    }

    if (!Array.isArray(course.instructors)) {
        return res.status(400).json({
            success: false,
            error: 'instructors is required and must be an array'
        });
    }

    if (!Array.isArray(course.teachingAssistants)) {
        return res.status(400).json({
            success: false,
            error: 'teachingAssistants is required and must be an array'
        });
    }

    if (!Array.isArray(course.topicOrWeekInstances)) {
        return res.status(400).json({
            success: false,
            error: 'topicOrWeekInstances is required and must be an array'
        });
    }

    next();
};

// Validation middleware for new course creation (doesn't require ID)
const validateNewCourse = (req: Request, res: Response, next: Function) => {
    const course = req.body as activeCourse;
    
    if (!course) {
        console.log("🔴 Request body is required");
        return res.status(400).json({
            success: false,
            error: 'Request body is required'
        });
    }

    if (!course.courseName || typeof course.courseName !== 'string' || course.courseName.trim() === '') {
        console.log("🔴 Course name is required and must be a non-empty string");
        return res.status(400).json({
            success: false,
            error: 'Course name is required and must be a non-empty string'
        });
    }

    if (!course.frameType || !['byWeek', 'byTopic'].includes(course.frameType)) {
        console.log("🔴 Frame type is required and must be either \"byWeek\" or \"byTopic\"");
        return res.status(400).json({
            success: false,
            error: 'Frame type is required and must be either "byWeek" or "byTopic"'
        });
    }

    if (!course.tilesNumber || typeof course.tilesNumber !== 'number' || course.tilesNumber <= 0) {
        console.log("🔴 Tiles number is required and must be a positive number");
        return res.status(400).json({
            success: false,
            error: 'Tiles number is required and must be a positive number'
        });
    }

    if (!course.instructors || !Array.isArray(course.instructors) || course.instructors.length === 0) {
        console.log("🔴 Instructors array is required and must contain at least one instructor");
        return res.status(400).json({
            success: false,
            error: 'Instructors array is required and must contain at least one instructor'
        });
    }

    if (!course.teachingAssistants || !Array.isArray(course.teachingAssistants)) {
        console.log("🔴 Teaching assistants array is required");
        return res.status(400).json({
            success: false,
            error: 'Teaching assistants array is required'
        });
    }

    // Accept Date object or date string (from JSON)
    if (!course.date) {
        console.log("🔴 Date is required");
        return res.status(400).json({
            success: false,
            error: 'Date is required'
        });
    }
    
    // Convert string to Date if needed (JSON.stringify converts Date to string)
    if (!(course.date instanceof Date)) {
        if (typeof course.date === 'string') {
            course.date = new Date(course.date);
        } else {
            console.log("🔴 Date must be a Date object or valid date string");
            return res.status(400).json({
                success: false,
                error: 'Date must be a Date object or valid date string'
            });
        }
    }

    next();
};

// Routes

// POST /api/courses - Create a new course (REQUIRES AUTH - Instructors only)
router.post('/', validateNewCourse, asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();

        //creating id - ensure date is a Date object for ID generation
        const tempActiveClass = {
            ...req.body,
            date: new Date()
        } as activeCourse;
        const id = instance.idGenerator.courseID(tempActiveClass);

        //create  coursecontent based on the frametype and tilesNumber
        const courseContent : TopicOrWeekInstance[] = [];
        if (req.body.frameType === 'byWeek') {
            for (let i = 0; i < req.body.tilesNumber; i++) {

                //mock lecture 1
                const courseContentLecture1: TopicOrWeekItem = {
                    id: '',
                    date: new Date(),
                    title: `Lecture 1`,
                    courseName: req.body.name,
                    topicOrWeekTitle: `Week ${i + 1}`,
                    itemTitle: `Lecture 1`,
                    learningObjectives: [],
                    additionalMaterials: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }


                //mock lecture 2
                const courseContentLecture2: TopicOrWeekItem = {
                    id: '',
                    date: new Date(),
                    title: `Lecture 2`,
                    courseName: req.body.name,
                    topicOrWeekTitle: `Week ${i + 1}`,
                    itemTitle: `Lecture 2`,
                    learningObjectives: [],
                    additionalMaterials: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }

                //mock lecture 3
                const courseContentLecture3: TopicOrWeekItem = {
                    id: '',
                    date: new Date(),
                    title: `Lecture 3`,
                    courseName: req.body.name,
                    topicOrWeekTitle: `Week ${i + 1}`,
                    itemTitle: `Lecture 3`,
                    learningObjectives: [],
                    additionalMaterials: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }

                //mock content
                const contentMock: TopicOrWeekInstance = {
                    id: '',
                    date: new Date(),
                    title: `Week ${i + 1}`,
                    courseName: req.body.name,
                    published: true,
                    items: [courseContentLecture1, courseContentLecture2, courseContentLecture3],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }

                //initiate id for each lecture
                courseContentLecture1.id = instance.idGenerator.itemID(courseContentLecture1, contentMock.title, req.body.name);
                courseContentLecture2.id = instance.idGenerator.itemID(courseContentLecture2, contentMock.title, req.body.name);
                courseContentLecture3.id = instance.idGenerator.itemID(courseContentLecture3, contentMock.title, req.body.name);

                courseContent.push({
                    id: instance.idGenerator.topicOrWeekID(contentMock, req.body.name),
                    date: new Date(),
                    title: `Week ${i + 1}`,
                    courseName: req.body.name,
                    published: false,
                    items: [courseContentLecture1, courseContentLecture2, courseContentLecture3],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }
        } else if (req.body.frameType === 'byTopic') {
            for (let i = 0; i < req.body.tilesNumber; i++) {

                //mock topic 1
                const courseContentTopic1: TopicOrWeekItem = {
                    id: '',
                    date: new Date(),
                    title: `Topic ${i + 1}`,
                    courseName: req.body.name,
                    topicOrWeekTitle: `Topic ${i + 1}`,
                    itemTitle: `Topic ${i + 1}`,
                    learningObjectives: [],
                    additionalMaterials: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }

                //mock course topic/week instance
                const contentMock: TopicOrWeekInstance = {
                    id: '',
                    date: new Date(),
                    title: `Topic ${i + 1}`,
                    courseName: req.body.name,
                    published: false,
                    items: [courseContentTopic1],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }

                //initiate id for each lecture
                courseContentTopic1.id = instance.idGenerator.itemID(courseContentTopic1, contentMock.title, req.body.name);

                courseContent.push({
                    id: instance.idGenerator.topicOrWeekID(contentMock, req.body.name),
                    date: new Date(),
                    title: `Topic ${i + 1}`,
                    courseName: req.body.name,
                    published: false,
                    items: [courseContentTopic1],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }
        }

        //add the coursecontent to the body
        req.body.topicOrWeekInstances = courseContent;

        const courseData: activeCourse = {
            ...req.body, //spread the properties of the body first
            id: id, // use the generated id
            date: new Date(),
            onBoarded: true, // default to false for new courses
            instructors: req.body.instructors || [],
            teachingAssistants: req.body.teachingAssistants || [],
            tilesNumber: req.body.tilesNumber || 0
        };
        
        
        await instance.postActiveCourse(courseData);

        // Since activeCourse is the correct type, we can return it directly
        const activeClassData: activeCourse = courseData as activeCourse;

        res.status(201).json({
            success: true,
            data: activeClassData,
            message: 'Course created successfully'
        });

    } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate')) {
            res.status(409).json({
                success: false,
                error: 'Course with this ID already exists'
            });
        } else {
            throw error;
        }
    }
}));


// GET /api/courses/:id - Get course by ID
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const instance = await EngEAI_MongoDB.getInstance();
    const course = await instance.getActiveCourse(req.params.id);
    
    if (!course) {
        return res.status(404).json({
            success: false,
            error: 'Course not found'
        });
    }
    
    res.status(200).json({
        success: true,
        data: course
    });
}));

// GET /api/courses - Get all courses or course by name (query param)
// GET /api/courses?name=CHBE241 - Get course by name
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const instance = await EngEAI_MongoDB.getInstance();
    
    // Check if name query parameter is provided
    const courseName = req.query.name as string;
    
    if (courseName) {
        // Get course by name
        const course = await instance.getCourseByName(courseName);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        return res.status(200).json({
            success: true,
            data: course
        });
    } else {
        // Get all courses
        const courses = await instance.getAllActiveCourses();
        
        res.status(200).json({
            success: true,
            data: courses,
            count: courses.length
        });
    }
}));

// PUT /api/courses/:id - Update course (REQUIRES AUTH - Instructors only)
router.put('/:id', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const instance = await EngEAI_MongoDB.getInstance();
    
    // First check if course exists
    const existingCourse = await instance.getActiveCourse(req.params.id);
    if (!existingCourse) {
        return res.status(404).json({
            success: false,
            error: 'Course not found'
        });
    }
    
    // Update the course
    const updateData = req.body;
    const updatedCourse = await instance.updateActiveCourse(req.params.id, updateData);
    
    res.status(200).json({
        success: true,
        data: updatedCourse,
        message: 'Course updated successfully'
    });
}));

// POST /api/courses/:courseId/instructors - Add instructor to course's instructors array
router.post('/:courseId/instructors', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { courseId } = req.params;
        const globalUser = (req.session as any).globalUser;
        
        if (!globalUser) {
            return res.status(401).json({ 
                success: false,
                error: 'User not authenticated' 
            });
        }
        
        if (globalUser.affiliation !== 'faculty') {
            return res.status(403).json({ 
                success: false,
                error: 'Only faculty members can join courses as instructors' 
            });
        }
        
        const instance = await EngEAI_MongoDB.getInstance();
        const course = await instance.getActiveCourse(courseId);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        const courseData = course as unknown as activeCourse;
        const instructorUserId = globalUser.userId;
        
        // Check if instructor is already in the instructors array
        if (courseData.instructors && courseData.instructors.includes(instructorUserId)) {
            return res.status(200).json({
                success: true,
                data: courseData,
                message: 'Instructor is already part of this course'
            });
        }
        
        // Add instructor to the instructors array
        const updatedInstructors = courseData.instructors || [];
        updatedInstructors.push(instructorUserId);
        
        const updatedCourse = await instance.updateActiveCourse(courseId, {
            instructors: updatedInstructors
        } as Partial<activeCourse>);
        
        console.log(`[ADD-INSTRUCTOR] Added instructor ${instructorUserId} to course ${courseId}`);
        
        res.status(200).json({
            success: true,
            data: updatedCourse,
            message: 'Instructor added to course successfully'
        });
        
    } catch (error) {
        console.error('[ADD-INSTRUCTOR] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to add instructor to course',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

// DELETE /api/courses/:id/restart-onboarding - Restart onboarding by deleting course and related collections, then recreating with empty defaults
// NOTE: This route must come before the general /:id route to ensure proper matching
router.delete('/:id/restart-onboarding', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const instance = await EngEAI_MongoDB.getInstance();
    
    try {
        // First check if course exists and save the courseName
        const existingCourse = await instance.getActiveCourse(req.params.id);
        if (!existingCourse) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        const course = existingCourse as unknown as activeCourse;
        const courseName = course.courseName; // Preserve course name
        
        // Get collection names before deleting the course (to use stored names if available)
        const collectionNames = await instance.getCollectionNames(courseName);
        
        // Remove course from active-course-list
        await instance.deleteActiveCourse(course);
        
        // Drop the users collection
        const usersDropResult = await instance.dropCollection(collectionNames.users);
        if (!usersDropResult.success) {
            console.error(`Failed to drop ${collectionNames.users}:`, usersDropResult.error);
            // Continue with other operations even if one fails
        }
        
        // Drop the flags collection
        const flagsDropResult = await instance.dropCollection(collectionNames.flags);
        if (!flagsDropResult.success) {
            console.error(`Failed to drop ${collectionNames.flags}:`, flagsDropResult.error);
            // Continue with other operations even if one fails
        }
        
        // Recreate the course with empty defaults but preserved courseName
        const tempCourseForId = {
            courseName: courseName,
            date: new Date()
        } as activeCourse;
        const newCourseId = instance.idGenerator.courseID(tempCourseForId);
        
        const newCourse: activeCourse = {
            id: newCourseId,
            date: new Date(),
            courseName: courseName, // Preserved from original
            courseSetup: false,
            contentSetup: false,
            flagSetup: false,
            monitorSetup: false,
            instructors: [], // Empty array
            teachingAssistants: [], // Empty array
            frameType: 'byTopic', // Default frame type
            tilesNumber: 0, // Empty/zero tiles
            topicOrWeekInstances: [] // Empty topic/week instances array
        };
        
        // Create the new course (this also creates the users and flags collections)
        await instance.postActiveCourse(newCourse);
        
        res.status(200).json({
            success: true,
            message: 'Onboarding restarted successfully. Course recreated with empty defaults.',
            data: {
                courseId: newCourseId,
                courseName: courseName
            }
        });
    } catch (error) {
        console.error('Error restarting onboarding:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
}));

// DELETE /api/courses/:id - Delete course (REQUIRES AUTH - Instructors only)
router.delete('/:id', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const instance = await EngEAI_MongoDB.getInstance();
    
    // First check if course exists
    const existingCourse = await instance.getActiveCourse(req.params.id);
    if (!existingCourse) {
        return res.status(404).json({
            success: false,
            error: 'Course not found'
        });
    }
    
    // Delete the course
    await instance.deleteActiveCourse(existingCourse as unknown as activeCourse);
    
    res.status(200).json({
        success: true,
        message: 'Course deleted successfully'
    });
}));

// POST /api/courses/:courseId/topic-or-week-instances - Add a new topic/week instance (REQUIRES AUTH)
router.post('/:courseId/topic-or-week-instances', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId } = req.params;
        const { title } = req.body || {};

        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        const instances: TopicOrWeekInstance[] = (course.topicOrWeekInstances as unknown as TopicOrWeekInstance[]) || [];
        const existingNumericIds = instances
            .map(d => parseInt(d.id as unknown as string, 10))
            .filter(n => !Number.isNaN(n));
        const nextIdNum = (existingNumericIds.length ? Math.max(...existingNumericIds) : 0) + 1;
        const nextId = String(nextIdNum);

        const isByWeek = (course as any).frameType === 'byWeek';
        const resolvedTitle = (typeof title === 'string' && title.trim())
            ? title.trim()
            : (isByWeek ? `Week ${nextIdNum}` : `Topic ${nextIdNum}`);

        const defaultItemTitle = isByWeek ? 'Lecture 1' : 'Session 1';
        const now = new Date();

        const newInstance: TopicOrWeekInstance = {
            id: nextId,
            date: now,
            title: resolvedTitle,
            courseName: (course as any).courseName,
            published: false,
            items: [
                {
                    id: '1',
                    date: now,
                    title: defaultItemTitle,
                    courseName: (course as any).courseName,
                    topicOrWeekTitle: resolvedTitle,
                    itemTitle: defaultItemTitle,
                    learningObjectives: [],
                    additionalMaterials: [],
                    createdAt: now,
                    updatedAt: now
                } as unknown as TopicOrWeekItem
            ],
            createdAt: now,
            updatedAt: now
        } as unknown as TopicOrWeekInstance;

        const updatedInstances = [...instances, newInstance];
        await instance.updateActiveCourse(courseId, { topicOrWeekInstances: updatedInstances } as any);

        return res.status(201).json({ success: true, data: newInstance, message: 'Topic/Week instance added successfully' });
    } catch (error) {
        console.error('Error adding topic/week instance:', error);
        return res.status(500).json({ success: false, error: 'Failed to add topic/week instance' });
    }
}));

// POST /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items - Add a new content item (section) to a topic/week instance (REQUIRES AUTH)
router.post('/:courseId/topic-or-week-instances/:topicOrWeekId/items', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, topicOrWeekId } = req.params;
        const { contentItem } = req.body || {};

        if (!contentItem || typeof contentItem.title !== 'string' || !contentItem.title.trim()) {
            return res.status(400).json({ success: false, error: 'Valid content item title is required' });
        }

        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        const instances: TopicOrWeekInstance[] = (course.topicOrWeekInstances as unknown as TopicOrWeekInstance[]) || [];
        const topicOrWeekInstance = instances.find(d => (d.id as unknown as string) === topicOrWeekId);
        if (!topicOrWeekInstance) {
            return res.status(404).json({ success: false, error: 'Topic/Week instance not found' });
        }

        const existingNumericIds = (topicOrWeekInstance.items as unknown as TopicOrWeekItem[])
            .map(i => parseInt((i.id as unknown as string), 10))
            .filter(n => !Number.isNaN(n));
        const nextItemIdNum = (existingNumericIds.length ? Math.max(...existingNumericIds) : 0) + 1;
        const nextItemId = String(nextItemIdNum);

        const now = new Date();
        const newItem: TopicOrWeekItem = {
            id: nextItemId,
            date: now,
            title: contentItem.title.trim(),
            courseName: (course as any).courseName,
            topicOrWeekTitle: (topicOrWeekInstance as any).title,
            itemTitle: contentItem.title.trim(),
            learningObjectives: Array.isArray(contentItem.learningObjectives) ? contentItem.learningObjectives : [],
            additionalMaterials: Array.isArray(contentItem.additionalMaterials) ? contentItem.additionalMaterials : [],
            createdAt: now,
            updatedAt: now
        } as unknown as TopicOrWeekItem;

        (topicOrWeekInstance.items as any) = [ ...(topicOrWeekInstance.items as any || []), newItem ];
        (topicOrWeekInstance as any).updatedAt = now;

        await instance.updateActiveCourse(courseId, { topicOrWeekInstances: instances } as any);

        return res.status(201).json({ success: true, data: newItem, message: 'Content item added successfully' });
    } catch (error) {
        console.error('Error adding content item:', error);
        return res.status(500).json({ success: false, error: 'Failed to add content item' });
    }
}));

// GET /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives - Get learning objectives for a course item
router.get('/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives', asyncHandler(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, topicOrWeekId, itemId } = req.params;
        
        const course = await instance.getActiveCourse(courseId);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        // Find the specific topic/week instance and content item
        const instance_topicOrWeek = course.topicOrWeekInstances?.find((d: any) => d.id === topicOrWeekId);
        if (!instance_topicOrWeek) {
            return res.status(404).json({
                success: false,
                error: 'Topic/Week instance not found'
            });
        }
        
        const contentItem = instance_topicOrWeek.items?.find((item: any) => item.id === itemId);
        if (!contentItem) {
            return res.status(404).json({
                success: false,
                error: 'Content item not found'
            });
        }
        
        res.status(200).json({
            success: true,
            data: contentItem.learningObjectives || [],
            message: 'Learning objectives retrieved successfully'
        });
    } catch (error) {
        console.error('Error getting learning objectives:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get learning objectives'
        });
    }
}));

// POST /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives - Add a learning objective (REQUIRES AUTH)
router.post('/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        console.log('🎯 [BACKEND] Add learning objective request received');
        console.log('🔍 [BACKEND] Request params:', req.params);
        console.log('🔍 [BACKEND] Request body:', req.body);
        
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, topicOrWeekId, itemId } = req.params;
        const { learningObjective } = req.body;
        
        if (!learningObjective) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: learningObjective'
            });
        }
        // Validate and sanitize objective text
        const rawText = (learningObjective?.LearningObjective ?? '').toString();
        const sanitizedText = rawText.trim();
        if (!sanitizedText) {
            return res.status(400).json({ success: false, error: 'Learning objective cannot be empty' });
        }
        if (sanitizedText.length > 300) {
            return res.status(400).json({ success: false, error: 'Learning objective too long (max 300 characters)' });
        }
        // Ensure timestamps and normalized text
        learningObjective.LearningObjective = sanitizedText;
        learningObjective.createdAt = learningObjective.createdAt || new Date();
        learningObjective.updatedAt = new Date();
        
        console.log('📡 [BACKEND] Calling addLearningObjective with:', { courseId, topicOrWeekId, itemId, learningObjective });
        
        const result = await instance.addLearningObjective(courseId, topicOrWeekId, itemId, learningObjective);
        
        console.log('✅ [BACKEND] Add learning objective result:', result);
        
        res.status(200).json({
            success: true,
            data: result,
            message: 'Learning objective added successfully'
        });
    } catch (error) {
        console.error('Error adding learning objective:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add learning objective'
        });
    }
}));

// PUT /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId - Update a learning objective (REQUIRES AUTH)
router.put('/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, topicOrWeekId, itemId, objectiveId } = req.params;
        const { updateData } = req.body;
        
        if (!updateData) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: updateData'
            });
        }
        // Validate and sanitize objective text
        const rawText = (updateData?.LearningObjective ?? '').toString();
        const sanitizedText = rawText.trim();
        if (!sanitizedText) {
            return res.status(400).json({ success: false, error: 'Learning objective cannot be empty' });
        }
        if (sanitizedText.length > 300) {
            return res.status(400).json({ success: false, error: 'Learning objective too long (max 300 characters)' });
        }
        updateData.LearningObjective = sanitizedText;
        
        const result = await instance.updateLearningObjective(courseId, topicOrWeekId, itemId, objectiveId, updateData);
        
        res.status(200).json({
            success: true,
            data: result,
            message: 'Learning objective updated successfully'
        });
    } catch (error) {
        console.error('Error updating learning objective:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update learning objective'
        });
    }
}));

// DELETE /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId - Delete a learning objective (REQUIRES AUTH)
router.delete('/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        console.log('🗑️ [BACKEND] Delete learning objective request received');
        console.log('🔍 [BACKEND] Request params:', req.params);
        
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, topicOrWeekId, itemId, objectiveId } = req.params;
        
        console.log('📡 [BACKEND] Calling deleteLearningObjective with:', { courseId, topicOrWeekId, itemId, objectiveId });
        
        const result = await instance.deleteLearningObjective(courseId, topicOrWeekId, itemId, objectiveId);
        
        console.log('✅ [BACKEND] Delete learning objective result:', result);
        
        res.status(200).json({
            success: true,
            data: result,
            message: 'Learning objective deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting learning objective:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete learning objective'
        });
    }
}));




// ===========================================
// ========= FLAG REPORT ROUTES ============
// ===========================================

// POST /api/courses/:courseId/flags - Create a new flag report (REQUIRES AUTH)
router.post('/:courseId/flags', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId } = req.params;
        const { flagType, reportType, chatContent, userId } = req.body;
        
        // Validate required fields
        if (!flagType || !reportType || !chatContent || userId === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: flagType, reportType, chatContent, userId'
            });
        }

        // Validate flagType
        const validFlagTypes = ['innacurate_response', 'harassment', 'inappropriate', 'dishonesty', 'interface bug', 'other'];
        if (!validFlagTypes.includes(flagType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid flagType. Must be one of: ' + validFlagTypes.join(', ')
            });
        }

        // Get course name from courseId for flag report creation
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        // Create flag report object with unique ID using IDGenerator
        const idGenerator = IDGenerator.getInstance();
        const flagDate = new Date();
        const uniqueId = idGenerator.flagIDGenerator(chatContent, userId.toString(), course.courseName, flagDate);
        
        const flagReport: FlagReport = {
            id: uniqueId,
            courseName: course.courseName,
            date: flagDate,
            flagType: flagType,
            reportType: reportType,
            chatContent: chatContent,
            userId: userId,
            status: 'unresolved',
            response: '', // Initialize as empty string
            createdAt: flagDate,
            updatedAt: flagDate
        };

        //START DEBUG LOG : DEBUG-CODE(006)
        console.log('🏴 Creating flag report with ID:', flagReport.id);
        //END DEBUG LOG : DEBUG-CODE(006)

        const result = await instance.createFlagReport(flagReport);
        
        res.status(201).json({
            success: true,
            message: 'Flag report created successfully',
            data: {
                id: flagReport.id,
                insertedId: result.insertedId
            }
        });
    } catch (error) {
        console.error('Error creating flag report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create flag report'
        });
    }
}));

// GET /api/courses/:courseId/flags - Get all flag reports for a course (REQUIRES AUTH - Instructors only)
router.get('/:courseId/flags', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId } = req.params;
        
        // Get course to get course name
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const flagReports = await instance.getAllFlagReports(course.courseName);
        
        res.json({
            success: true,
            data: flagReports,
            count: flagReports.length
        });
    } catch (error) {
        console.error('Error getting flag reports:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get flag reports'
        });
    }
}));

// GET /api/courses/:courseId/flags/with-names - Get flag reports with resolved user names (REQUIRES AUTH - Instructors only)
router.get('/:courseId/flags/with-names', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId } = req.params;
        
        // Get course to get course name
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        //START DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-API)
        console.log('🔍 Getting flag reports with user names for course:', course.courseName);
        //END DEBUG LOG : DEBUG-CODE(GET-FLAGS-WITH-NAMES-API)

        const flagsWithNames = await instance.getFlagReportsWithUserNames(course.courseName);
        
        res.json({
            success: true,
            data: flagsWithNames,
            count: flagsWithNames.length
        });
    } catch (error) {
        console.error('Error getting flag reports with user names:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get flag reports with user names'
        });
    }
}));

// GET /api/courses/:courseId/flags/:flagId - Get a specific flag report (REQUIRES AUTH - Instructors only)
router.get('/:courseId/flags/:flagId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, flagId } = req.params;
        
        // Get course to get course name
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const flagReport = await instance.getFlagReport(course.courseName, flagId);
        
        if (!flagReport) {
            return res.status(404).json({
                success: false,
                error: 'Flag report not found'
            });
        }
        
        res.json({
            success: true,
            data: flagReport
        });
    } catch (error) {
        console.error('Error getting flag report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get flag report'
        });
    }
}));

// PUT /api/courses/:courseId/flags/:flagId - Update a flag report (REQUIRES AUTH - Instructors only)
router.put('/:courseId/flags/:flagId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, flagId } = req.params;
        const { status, response } = req.body;
        
        // Get course to get course name
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        // Validate status if provided
        if (status && !['unresolved', 'resolved'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Must be "unresolved" or "resolved"'
            });
        }

        // Prepare update data
        const updateData: Partial<FlagReport> = {};
        if (status !== undefined) updateData.status = status;
        if (response !== undefined) updateData.response = response;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid fields to update'
            });
        }

        //START DEBUG LOG : DEBUG-CODE(007)
        console.log('🏴 Updating flag report:', flagId, 'with data:', updateData);
        //END DEBUG LOG : DEBUG-CODE(007)

        const result = await instance.updateFlagReport(course.courseName, flagId, updateData);
        
        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Flag report not found'
            });
        }

        console.log('='.repeat(60));
        console.log('🏴 Result:', JSON.stringify(result, null, 2));
        console.log('='.repeat(60));
        
        res.json({
            success: true,
            message: 'Flag report updated successfully',
            data: result
        });
    } catch (error) {
        console.error('Error updating flag report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update flag report'
        });
    }
}));

// DELETE /api/courses/:courseId/flags/:flagId - Delete a flag report (REQUIRES AUTH - Instructors only)
router.delete('/:courseId/flags/:flagId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, flagId } = req.params;
        
        // Get course to get course name
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        //START DEBUG LOG : DEBUG-CODE(008)
        console.log('🏴 Deleting flag report:', flagId, 'from course:', course.courseName);
        //END DEBUG LOG : DEBUG-CODE(008)

        const result = await instance.deleteFlagReport(course.courseName, flagId);
        
        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Flag report not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Flag report deleted successfully',
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Error deleting flag report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete flag report'
        });
    }
}));

// DELETE /api/courses/:courseId/flags - Delete all flag reports for a course (REQUIRES AUTH - Instructors only)
router.delete('/:courseId/flags', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId } = req.params;
        
        // Get course to get course name
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        //START DEBUG LOG : DEBUG-CODE(009)
        console.log('🏴 Deleting all flag reports from course:', course.courseName);
        //END DEBUG LOG : DEBUG-CODE(009)

        const result = await instance.deleteAllFlagReports(course.courseName);
        
        res.json({
            success: true,
            message: 'All flag reports deleted successfully',
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Error deleting all flag reports:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete all flag reports'
        });
    }
}));

// ===========================================
// ========= DATABASE MANAGEMENT ROUTES =====
// ===========================================

// POST /api/courses/:courseId/flags/create-indexes - Create database indexes for flag collection (REQUIRES AUTH - Instructors only)
router.post('/:courseId/flags/create-indexes', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId } = req.params;
        
        // Get course to get course name
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        //START DEBUG LOG : DEBUG-CODE(CREATE-INDEXES-API)
        console.log('📊 Creating indexes for flag collection:', course.courseName);
        //END DEBUG LOG : DEBUG-CODE(CREATE-INDEXES-API)

        const result = await instance.createFlagIndexes(course.courseName);
        
        res.json({
            success: result.success,
            message: result.success ? 'Indexes created successfully' : 'Some indexes failed to create',
            data: {
                indexesCreated: result.indexesCreated,
                errors: result.errors
            }
        });
    } catch (error) {
        console.error('Error creating indexes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create indexes'
        });
    }
}));

// GET /api/courses/:courseId/flags/validate - Validate flag collection integrity (REQUIRES AUTH - Instructors only)
router.get('/:courseId/flags/validate', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId } = req.params;
        
        // Get course to get course name
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        //START DEBUG LOG : DEBUG-CODE(VALIDATE-COLLECTION-API)
        console.log('🔍 Validating flag collection for course:', course.courseName);
        //END DEBUG LOG : DEBUG-CODE(VALIDATE-COLLECTION-API)

        const validation = await instance.validateFlagCollection(course.courseName);
        
        res.json({
            success: true,
            data: validation
        });
    } catch (error) {
        console.error('Error validating flag collection:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate flag collection'
        });
    }
}));

// GET /api/courses/:courseId/flags/statistics - Get flag statistics (REQUIRES AUTH - Instructors only)
router.get('/:courseId/flags/statistics', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId } = req.params;
        
        // Get course to get course name
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        //START DEBUG LOG : DEBUG-CODE(GET-STATISTICS-API)
        console.log('📊 Getting flag statistics for course:', course.courseName);
        //END DEBUG LOG : DEBUG-CODE(GET-STATISTICS-API)

        const statistics = await instance.getFlagStatistics(course.courseName);
        
        res.json({
            success: true,
            data: statistics
        });
    } catch (error) {
        console.error('Error getting flag statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get flag statistics'
        });
    }
}));

// GET /api/courses/:courseId/flags/student/:userId - Get flag reports for a specific student (REQUIRES AUTH - Student view)
router.get('/:courseId/flags/student/:userId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, userId } = req.params;
        
        // Get course to get course name
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        //START DEBUG LOG : DEBUG-CODE(GET-STUDENT-FLAGS-API)
        console.log('🔍 Getting flag reports for student:', userId, 'in course:', course.courseName);
        //END DEBUG LOG : DEBUG-CODE(GET-STUDENT-FLAGS-API)

        // Get all flags and filter by userId
        const allFlags = await instance.getAllFlagReports(course.courseName);
        const studentFlags = allFlags.filter((flag: FlagReport) => flag.userId.toString() === userId.toString());
        
        // Sort by most recent first
        studentFlags.sort((a: FlagReport, b: FlagReport) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        
        res.json({
            success: true,
            data: studentFlags,
            count: studentFlags.length
        });
    } catch (error) {
        console.error('Error getting student flag reports:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get student flag reports'
        });
    }
}));

// DELETE /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/materials/:materialId - Delete a material (REQUIRES AUTH)
router.delete('/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/materials/:materialId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { courseId, topicOrWeekId, itemId, materialId } = req.params;
        
        console.log(`🗑️ Deleting material ${materialId} from course ${courseId}, topic/week instance ${topicOrWeekId}, item ${itemId}`);
        
        // Get MongoDB instance
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Get the course
        const course = await mongoDB.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        // Find the topic/week instance
        const instance_topicOrWeek = course.topicOrWeekInstances?.find((d: any) => d.id === topicOrWeekId);
        if (!instance_topicOrWeek) {
            return res.status(404).json({
                success: false,
                error: 'Topic/Week instance not found'
            });
        }
        
        // Find the content item
        const contentItem = instance_topicOrWeek.items?.find((item: any) => item.id === itemId);
        if (!contentItem) {
            return res.status(404).json({
                success: false,
                error: 'Content item not found'
            });
        }
        
        // Find the material
        const material = contentItem.additionalMaterials?.find((m: any) => m.id === materialId);
        if (!material) {
            return res.status(404).json({
                success: false,
                error: 'Material not found'
            });
        }
        
        // Delete from Qdrant first if material has qdrantId
        if (material.qdrantId) {
            try {
                const { RAGApp } = await import('../routes/RAG-App.js');
                const ragApp = await RAGApp.getInstance();
                await ragApp.deleteDocument(materialId, courseId, topicOrWeekId, itemId);
                console.log(`✅ Material ${materialId} deleted from Qdrant`);
            } catch (qdrantError) {
                console.error('Failed to delete from Qdrant:', qdrantError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to delete material from vector database'
                });
            }
        }
        
        // Hard delete: Remove material from array
        contentItem.additionalMaterials = contentItem.additionalMaterials.filter((m: any) => m.id !== materialId);
        
        // Update the course in MongoDB
        const result = await mongoDB.updateActiveCourse(courseId, course as any);
        
        if (!result) {
            return res.status(500).json({
                success: false,
                error: 'Failed to update course in database'
            });
        }
        
        console.log(`✅ Material ${materialId} deleted from MongoDB`);
        
        res.json({
            success: true,
            message: 'Material deleted successfully',
            data: {
                materialId: materialId,
                deleted: true
            }
        });
        
    } catch (error) {
        console.error('Error deleting material:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete material'
        });
    }
}));

// DELETE /api/courses/:courseId/documents/all - Delete all RAG documents (REQUIRES AUTH - Instructors only)
router.delete('/:courseId/documents/all', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { courseId } = req.params;
        
        console.log('🔍 BACKEND DELETE ALL DOCUMENTS - Request Details:');
        console.log('  Headers:', req.headers);
        console.log('  Params:', req.params);
        console.log('  User:', req.user);
        console.log(`🗑️ Deleting all documents from course ${courseId}`);
        
        // Get MongoDB instance
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Get the course
        const course = await mongoDB.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        // Delete from Qdrant first
        try {
            const { RAGApp } = await import('../routes/RAG-App.js');
            const ragApp = await RAGApp.getInstance();
            const qdrantResult = await ragApp.deleteAllDocumentsForCourse(courseId);
            console.log(`✅ Deleted ${qdrantResult.deletedCount} documents from Qdrant`);
        } catch (qdrantError) {
            console.error('Failed to delete from Qdrant:', qdrantError);
            return res.status(500).json({
                success: false,
                error: 'Failed to delete documents from vector database'
            });
        }
        
        // Clear all additionalMaterials arrays in MongoDB
        let totalDeleted = 0;
        course.topicOrWeekInstances?.forEach((instance_topicOrWeek: any) => {
            instance_topicOrWeek.items?.forEach((item: any) => {
                if (item.additionalMaterials && item.additionalMaterials.length > 0) {
                    totalDeleted += item.additionalMaterials.length;
                    item.additionalMaterials = [];
                }
            });
        });
        
        // Update the course in MongoDB
        const result = await mongoDB.updateActiveCourse(courseId, course as any);
        
        if (!result) {
            return res.status(500).json({
                success: false,
                error: 'Failed to update course in database'
            });
        }
        
        console.log(`✅ Deleted ${totalDeleted} documents from MongoDB`);
        
        res.json({
            success: true,
            message: 'All documents deleted successfully',
            data: {
                deletedCount: totalDeleted,
                courseId: courseId
            }
        });
        
    } catch (error) {
        console.error('Error deleting all documents:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete all documents'
        });
    }
}));

// COMMENTED OUT: DELETE /api/courses/:courseId/wipe-mongodb - Wipe all MongoDB collections for a course (REQUIRES AUTH - Instructors only)
/*
router.delete('/:courseId/wipe-mongodb', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { courseId } = req.params;
        
        console.log('🔍 BACKEND WIPE MONGODB - Request Details:');
        console.log('  Headers:', req.headers);
        console.log('  Params:', req.params);
        console.log('  User:', req.user);
        console.log(`🗑️ Wiping all MongoDB collections for course ${courseId}`);
        
        // Get MongoDB instance
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Get the course to get the courseName
        const course = await mongoDB.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        const courseName = (course as any).courseName;
        const droppedCollections: string[] = [];
        const errors: string[] = [];
        const operations: string[] = [];
        
        // 1. Delete course from active-course-list
        try {
            await mongoDB.deleteActiveCourse(course as any);
            operations.push('Deleted course from active-course-list');
            console.log(`✅ Deleted course ${courseId} from active-course-list`);
        } catch (error) {
            const errorMsg = `Failed to delete course from active-course-list: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
        }
        
        // 2. Remove courseId from all users' coursesEnrolled in active-users
        try {
            const activeUsersCollection = mongoDB.db.collection('active-users');
            const updateResult = await activeUsersCollection.updateMany(
                { coursesEnrolled: { $in: [courseId] } },
                { $pull: { coursesEnrolled: courseId } } as any
            );
            operations.push(`Removed course from ${updateResult.modifiedCount} user(s) in active-users`);
            console.log(`✅ Removed course ${courseId} from ${updateResult.modifiedCount} user(s) in active-users`);
        } catch (error) {
            const errorMsg = `Failed to remove course from active-users: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
        }
        
        // 3. Get all collections in the database
        const allCollections = await mongoDB.db.listCollections().toArray();
        const courseCollectionPrefix = `${courseName}_`;
        
        // Filter collections that belong to this course (start with courseName_)
        const courseCollections = allCollections
            .map(col => col.name)
            .filter(name => name.startsWith(courseCollectionPrefix));
        
        console.log(`📋 Found ${courseCollections.length} collection(s) for course ${courseName}:`, courseCollections);
        
        // 4. Drop all collections that belong to this course
        for (const collectionName of courseCollections) {
            const dropResult = await mongoDB.dropCollection(collectionName);
            if (dropResult.success) {
                droppedCollections.push(collectionName);
            } else {
                errors.push(`Failed to drop ${collectionName}: ${dropResult.error}`);
            }
        }
        
        console.log(`✅ Wiped ${droppedCollections.length} MongoDB collections for course ${courseId}`);
        
        res.json({
            success: true,
            message: 'MongoDB collections wiped successfully',
            data: {
                courseId: courseId,
                courseName: courseName,
                operations: operations,
                droppedCollections: droppedCollections,
                errors: errors
            }
        });
        
    } catch (error) {
        console.error('Error wiping MongoDB collections:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to wipe MongoDB collections'
        });
    }
}));
*/

// PATCH /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/title - Update topic/week instance title (REQUIRES AUTH)
router.patch('/:courseId/topic-or-week-instances/:topicOrWeekId/title', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, topicOrWeekId } = req.params;
        const { title } = req.body;
        
        // Validate input
        if (!title || typeof title !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Title is required and must be a string'
            });
        }
        
        const trimmedTitle = title.trim();
        
        if (!trimmedTitle) {
            return res.status(400).json({
                success: false,
                error: 'Title cannot be empty'
            });
        }
        
        if (trimmedTitle.length > 100) {
            return res.status(400).json({
                success: false,
                error: 'Title is too long (maximum 100 characters)'
            });
        }
        
        // Get the course
        const course = await instance.getActiveCourse(courseId);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        // Find the topic/week instance
        const topicOrWeekInstance = course.topicOrWeekInstances?.find((d: TopicOrWeekInstance) => d.id === topicOrWeekId);
        
        if (!topicOrWeekInstance) {
            return res.status(404).json({
                success: false,
                error: 'Topic/Week instance not found'
            });
        }
        
        // Update the topic/week instance title
        topicOrWeekInstance.title = trimmedTitle;
        topicOrWeekInstance.updatedAt = new Date();
        
        // Save the updated course
        const updatedCourse = await instance.updateActiveCourse(courseId, {
            topicOrWeekInstances: course.topicOrWeekInstances
        });
        
        console.log(`✅ Topic/Week instance ${topicOrWeekId} title updated to "${trimmedTitle}"`);
        
        res.status(200).json({
            success: true,
            data: topicOrWeekInstance,
            message: 'Topic/Week instance title updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating topic/week instance title:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update topic/week instance title'
        });
    }
}));

// PATCH /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/published - Update topic/week instance published status (REQUIRES AUTH)
router.patch('/:courseId/topic-or-week-instances/:topicOrWeekId/published', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, topicOrWeekId } = req.params;
        const { published } = req.body;
        
        // Validate input
        if (typeof published !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'Published status is required and must be a boolean'
            });
        }
        
        // Get the course
        const course = await instance.getActiveCourse(courseId);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        // Find the topic/week instance
        const topicOrWeekInstance = course.topicOrWeekInstances?.find((d: TopicOrWeekInstance) => d.id === topicOrWeekId);
        
        if (!topicOrWeekInstance) {
            return res.status(404).json({
                success: false,
                error: 'Topic/Week instance not found'
            });
        }
        
        // Update the topic/week instance published status
        topicOrWeekInstance.published = published;
        topicOrWeekInstance.updatedAt = new Date();
        
        // Save the updated course
        const updatedCourse = await instance.updateActiveCourse(courseId, {
            topicOrWeekInstances: course.topicOrWeekInstances
        });
        
        console.log(`✅ Topic/Week instance ${topicOrWeekId} published status updated to ${published}`);
        
        res.status(200).json({
            success: true,
            data: topicOrWeekInstance,
            message: 'Topic/Week instance published status updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating topic/week instance published status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update topic/week instance published status'
        });
    }
}));

// PATCH /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/title - Update item title (REQUIRES AUTH)
router.patch('/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/title', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, topicOrWeekId, itemId } = req.params;
        const { title } = req.body;
        
        // Validate input
        if (!title || typeof title !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Title is required and must be a string'
            });
        }
        
        const trimmedTitle = title.trim();
        
        if (!trimmedTitle) {
            return res.status(400).json({
                success: false,
                error: 'Title cannot be empty'
            });
        }
        
        if (trimmedTitle.length > 100) {
            return res.status(400).json({
                success: false,
                error: 'Title is too long (maximum 100 characters)'
            });
        }
        
        // Get the course
        const course = await instance.getActiveCourse(courseId);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        // Find the topic/week instance
        const topicOrWeekInstance = course.topicOrWeekInstances?.find((d: TopicOrWeekInstance) => d.id === topicOrWeekId);
        
        if (!topicOrWeekInstance) {
            return res.status(404).json({
                success: false,
                error: 'Topic/Week instance not found'
            });
        }
        
        // Find the item
        const item = topicOrWeekInstance.items?.find((i: TopicOrWeekItem) => i.id === itemId);
        
        if (!item) {
            return res.status(404).json({
                success: false,
                error: 'Item not found'
            });
        }
        
        // Update the item title
        item.title = trimmedTitle;
        item.itemTitle = trimmedTitle;
        item.updatedAt = new Date();
        topicOrWeekInstance.updatedAt = new Date();
        
        // Save the updated course
        const updatedCourse = await instance.updateActiveCourse(courseId, {
            topicOrWeekInstances: course.topicOrWeekInstances
        });
        
        console.log(`✅ Item ${itemId} title updated to "${trimmedTitle}"`);
        
        res.status(200).json({
            success: true,
            data: item,
            message: 'Item title updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating item title:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update item title'
        });
    }
}));

// DELETE /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId - Delete a content item (section) (REQUIRES AUTH)
router.delete('/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        console.log('🗑️ [BACKEND] Delete content item request received');
        console.log('🔍 [BACKEND] Request params:', req.params);
        
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, topicOrWeekId, itemId } = req.params;
        
        // Validate input
        if (!courseId || !topicOrWeekId || !itemId) {
            return res.status(400).json({
                success: false,
                error: 'Course ID, Topic/Week Instance ID, and Item ID are required'
            });
        }
        
        // Get the course
        const course = await instance.getActiveCourse(courseId);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        // Find the topic/week instance
        const topicOrWeekInstance = course.topicOrWeekInstances?.find((d: TopicOrWeekInstance) => d.id === topicOrWeekId);
        
        if (!topicOrWeekInstance) {
            return res.status(404).json({
                success: false,
                error: 'Topic/Week instance not found'
            });
        }
        
        // Find the item
        const item = topicOrWeekInstance.items?.find((i: TopicOrWeekItem) => i.id === itemId);
        
        if (!item) {
            return res.status(404).json({
                success: false,
                error: 'Content item not found'
            });
        }
        
        // Remove the item from the topic/week instance
        topicOrWeekInstance.items = topicOrWeekInstance.items.filter((i: TopicOrWeekItem) => i.id !== itemId);
        topicOrWeekInstance.updatedAt = new Date();
        
        // Save the updated course
        const updatedCourse = await instance.updateActiveCourse(courseId, {
            topicOrWeekInstances: course.topicOrWeekInstances
        });
        
        console.log(`✅ Content item ${itemId} deleted successfully from topic/week instance ${topicOrWeekId}`);
        
        res.status(200).json({
            success: true,
            data: {
                deletedItemId: itemId,
                topicOrWeekId: topicOrWeekId,
                remainingItems: topicOrWeekInstance.items.length
            },
            message: 'Content item deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting content item:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete content item'
        });
    }
}));

/**
 * GET /api/courses/export/database - Export entire database hierarchically
 * Downloads all collections and their documents in a hierarchical text format
 */
router.get('/export/database', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Get all collection names from the database
        const collections = await mongoDB.db.listCollections().toArray();
        
        // Build hierarchical database export
        let exportText = '';
        
        // Sort collections alphabetically for consistent output
        const sortedCollections = collections
            .map(c => c.name)
            .sort();
        
        for (const collectionName of sortedCollections) {
            // Add collection name as header
            exportText += `${collectionName}\n`;
            
            try {
                // Get all documents from the collection
                const collection = mongoDB.db.collection(collectionName);
                const documents = await collection.find({}).toArray();
                
                if (documents.length === 0) {
                    // Empty collection - just add blank line
                    exportText += '\n';
                } else {
                    // Format each document
                    for (let i = 0; i < documents.length; i++) {
                        const doc = documents[i];
                        
                        // Convert MongoDB document to JSON string with proper formatting
                        const docJson = JSON.stringify(doc, null, 2);
                        
                        // Add document with indentation
                        exportText += `${docJson}\n`;
                        
                        // Add separator between documents (except last one)
                        if (i < documents.length - 1) {
                            exportText += '\n';
                        }
                    }
                }
                
                // Add spacing between collections
                exportText += '\n\n';
                
            } catch (collectionError) {
                console.error(`Error reading collection ${collectionName}:`, collectionError);
                exportText += `[Error reading collection: ${collectionError instanceof Error ? collectionError.message : 'Unknown error'}]\n\n\n`;
            }
        }
        
        // Set response headers for file download
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `database-export-${timestamp}.txt`;
        
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(exportText);
        
    } catch (error) {
        console.error('Error exporting database:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export database',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));


