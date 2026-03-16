
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
import { asyncHandler, asyncHandlerWithAuth } from '../middleware/async-handler';
import { requireInstructorForCourseAPI, requireInstructorGlobal } from '../middleware/require-course-role';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { activeCourse, AdditionalMaterial, TopicOrWeekInstance, TopicOrWeekItem, FlagReport, User, InitialAssistantPrompt, SystemPromptItem } from '../types/shared';
import { IDGenerator } from '../utils/unique-id-generator';
import { memoryAgent } from '../memory-agent/memory-agent';
import dotenv from 'dotenv';
import { RAGApp } from '../rag/rag-app';
import { addCharismaAndRichToCourse } from '../helpers/instructor-helpers';

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

    // Instructors can be empty - backend adds the authenticated creator as instructor
    if (!course.instructors || !Array.isArray(course.instructors)) {
        console.log("🔴 Instructors must be an array");
        return res.status(400).json({
            success: false,
            error: 'Instructors must be an array'
        });
    }

    if (!course.teachingAssistants || !Array.isArray(course.teachingAssistants)) {
        console.log("🔴 Teaching assistants must be an array");
        return res.status(400).json({
            success: false,
            error: 'Teaching assistants must be an array'
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

/**
 * POST /
 * Create a new course. Instructors only.
 *
 * @route POST /api/courses
 * @param {string} courseName - Course name (body)
 * @param {string} frameType - Frame type: "byWeek" or "byTopic" (body)
 * @param {number} tilesNumber - Number of tiles (body)
 * @param {array} instructors - Instructors array (body)
 * @param {array} teachingAssistants - Teaching assistants array (body)
 * @returns {object} { success: boolean, data?: activeCourse, message?: string, error?: string }
 * @response 201 - Course created successfully
 * @response 400 - Validation error (missing or invalid fields)
 * @response 401 - User not authenticated
 * @response 403 - Instructors only
 * @response 409 - Course with this ID already exists
 * @response 500 - Failed to create course
 */
router.post('/', validateNewCourse, requireInstructorGlobal, asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

        // Get the current user (course creator) from session
        const globalUser = (req.session as any).globalUser;
        if (!globalUser) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        // Ensure the creator is in the instructors array
        const creatorUserId = globalUser.userId;
        const creatorName = globalUser.name;
        
        // Helper function to check if instructor is already in the array (handles both old and new formats)
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') {
                    return inst === creatorUserId; // Old format
                } else if (inst && inst.userId) {
                    return inst.userId === creatorUserId; // New format
                }
                return false;
            });
        };

        // Get existing instructors and convert to new format if needed
        const existingInstructors = req.body.instructors || [];
        let updatedInstructors = existingInstructors.map((inst: any) => {
            // Convert old format to new format if needed
            if (typeof inst === 'string') {
                return { userId: inst, name: 'Unknown' }; // Will be updated later if needed
            }
            return inst; // Already in new format
        });

        // Add creator to instructors array if not already present
        if (!isInstructorInArray(updatedInstructors)) {
            updatedInstructors.push({
                userId: creatorUserId,
                name: creatorName
            });
            console.log(`[CREATE-COURSE] Added course creator ${creatorName} (${creatorUserId}) to instructors array`);
        }

        let courseData: activeCourse = {
            ...req.body, //spread the properties of the body first
            id: id, // use the generated id
            date: new Date(),
            onBoarded: true, // default to false for new courses
            instructors: updatedInstructors,
            teachingAssistants: req.body.teachingAssistants || [],
            tilesNumber: req.body.tilesNumber || 0
        };
        
        
        await instance.postActiveCourse(courseData);
        
        // Fetch the created course to get the generated courseCode
        const createdCourse = await instance.getActiveCourse(id);
        if (createdCourse) {
            courseData = createdCourse as unknown as activeCourse;
        }

        // Add creator to the course's users collection ({courseName}_users)
        try {
            const courseName = courseData.courseName;
            const collectionNames = await instance.getCollectionNames(courseName);
            
            // Check if CourseUser already exists
            let courseUser = await instance.findStudentByUserId(courseName, creatorUserId);
            
            if (!courseUser) {
                // Create CourseUser entry for the creator
                const newCourseUserData: Partial<User> = {
                    name: creatorName,
                    userId: creatorUserId,
                    courseName: courseName,
                    courseId: id,
                    userOnboarding: false, // Creator doesn't need onboarding
                    affiliation: 'faculty',
                    status: 'active',
                    chats: []
                };
                
                await instance.createStudent(courseName, newCourseUserData);
                console.log(`[CREATE-COURSE] Created CourseUser entry for creator ${creatorName} (${creatorUserId}) in ${collectionNames.users}`);
            } else {
                console.log(`[CREATE-COURSE] CourseUser entry already exists for creator ${creatorName} (${creatorUserId})`);
            }
        } catch (courseUserError) {
            console.error(`[CREATE-COURSE] ⚠️ Error creating CourseUser for creator:`, courseUserError);
            // Continue even if CourseUser creation fails - course is already created
        }

        // Add course to creator's coursesEnrolled array
        try {
            if (!globalUser.coursesEnrolled.includes(id)) {
                await instance.addCourseToGlobalUser(globalUser.puid, id);
                console.log(`[CREATE-COURSE] Added course ${id} to creator's enrolled list`);
            }
        } catch (enrollmentError) {
            console.error(`[CREATE-COURSE] ⚠️ Error adding course to creator's enrolled list:`, enrollmentError);
            // Continue even if enrollment fails - course is already created
        }

        // Always add Charisma and Rich when a course is initiated (any creator)
        try {
            const courseName = courseData.courseName;
            const instructorsWithCR = await addCharismaAndRichToCourse(
                instance,
                id,
                courseName,
                courseData.instructors
            );
            await instance.updateActiveCourse(id, { instructors: instructorsWithCR });
            courseData = { ...courseData, instructors: instructorsWithCR };
            console.log(`[CREATE-COURSE] Added Charisma and Rich to course ${id} (creator: ${creatorName})`);
        } catch (crError) {
            console.error(`[CREATE-COURSE] Error adding Charisma and Rich to course:`, crError);
        }

        // Since activeCourse is the correct type, we can return it directly
        // This now includes the generated courseCode
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

/**
 * GET /check-exists
 * Check if a course exists by name. Always returns 200.
 *
 * @route GET /api/courses/check-exists
 * @param {string} [name] - Course name (query)
 * @returns {object} { success: boolean, exists?: boolean }
 * @response 200 - Success (exists: true if course found, false otherwise)
 */
router.get('/check-exists', asyncHandler(async (req: Request, res: Response) => {
    const courseName = req.query.name as string;
    if (!courseName || typeof courseName !== 'string') {
        return res.status(200).json({ success: true, exists: false });
    }
    const instance = await EngEAI_MongoDB.getInstance();
    const course = await instance.getCourseByName(courseName.trim());
    return res.status(200).json({ success: true, exists: !!course });
}));

/**
 * GET /allowed-for-instructor
 * Get courses allowed for the current instructor. Instructors only.
 *
 * @route GET /api/courses/allowed-for-instructor
 * @returns {object} { success: boolean, allowedCourses?: string[], error?: string }
 * @response 200 - Success
 * @response 401 - Not authenticated
 * @response 403 - Instructors only
 */
router.get('/allowed-for-instructor', requireInstructorGlobal, asyncHandlerWithAuth(async (req: Request, res: Response) => {
    const globalUser = (req.session as any).globalUser;
    if (!globalUser) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (globalUser.affiliation !== 'faculty') {
        return res.status(403).json({ success: false, error: 'Instructors only' });
    }
    const instance = await EngEAI_MongoDB.getInstance();
    const coll = instance.db.collection<{ puid: string; allowed_courses: string[] }>('instructor-allowed-courses');
    const docs = await coll.find({}).toArray();
    const match = docs.find((d) => d.puid === globalUser.puid);
    const allowedCourses = match ? (match.allowed_courses || []) : [];
    return res.status(200).json({ success: true, allowedCourses });
}));

// GET /api/courses/export/database - Export entire database hierarchically (REQUIRES AUTH - Instructors only)
// COMMENTED OUT - feature removed
/*
router.get('/export/database', requireInstructorGlobal, asyncHandlerWithAuth(async (req: Request, res: Response) => {
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
*/

// DELETE /api/courses/clear-active-users - Remove all users from active-users AND from every course's users collection (REQUIRES AUTH - Instructors only)
// COMMENTED OUT - feature removed
/*
router.delete('/clear-active-users', requireInstructorGlobal, asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongoDB = await EngEAI_MongoDB.getInstance();

        // Step 1: Clear users from every course's users collection ({courseName}_users)
        const courses = await mongoDB.getAllActiveCourses();
        let totalCourseUsersDeleted = 0;
        for (const course of courses) {
            const courseName = course.courseName;
            const usersCollectionName = course.collections?.users ?? `${courseName}_users`;
            try {
                const courseUsersColl = mongoDB.db.collection(usersCollectionName);
                const courseDeleteResult = await courseUsersColl.deleteMany({});
                totalCourseUsersDeleted += courseDeleteResult.deletedCount;
                if (courseDeleteResult.deletedCount > 0) {
                    console.log(`[CLEAR-ACTIVE-USERS] Cleared ${courseDeleteResult.deletedCount} user(s) from course ${courseName}`);
                }
            } catch (courseErr) {
                console.warn(`[CLEAR-ACTIVE-USERS] Could not clear users for course ${courseName}:`, courseErr);
                // Continue with other courses - don't fail if one course collection is missing
            }
        }

        // Step 2: Clear active-users (global user records)
        const activeUsersCollection = mongoDB.db.collection('active-users');
        const deleteResult = await activeUsersCollection.deleteMany({});

        res.status(200).json({
            success: true,
            message: `All users removed successfully. ${deleteResult.deletedCount} global user(s) and ${totalCourseUsersDeleted} course-specific user(s) deleted.`,
            deletedCount: deleteResult.deletedCount,
            courseUsersDeletedCount: totalCourseUsersDeleted
        });
    } catch (error) {
        console.error('Error clearing active users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear active users',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));
*/

/**
 * GET /
 * Get all courses or a single course by name.
 *
 * @route GET /api/courses
 * @param {string} [name] - Course name filter (query)
 * @returns {object} { success: boolean, data?: activeCourse | activeCourse[], count?: number, error?: string }
 * @response 200 - Success (data: single course if name provided, array if not; count when listing all)
 * @response 404 - Course not found (when name provided)
 */
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

/**
 * GET /:id
 * Get a course by ID.
 *
 * @route GET /api/courses/:id
 * @param {string} id - Course ID (path param)
 * @returns {object} { success: boolean, data?: activeCourse, error?: string }
 * @response 200 - Success
 * @response 404 - Course not found
 */
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

/**
 * PUT /:id
 * Update a course. Instructors only.
 *
 * @route PUT /api/courses/:id
 * @param {string} id - Course ID (path param)
 * @param {object} body - Update payload (body)
 * @returns {object} { success: boolean, data?: activeCourse, message?: string, error?: string }
 * @response 200 - Course updated successfully
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course not found
 */
router.put('/:id', requireInstructorForCourseAPI(['paramsId']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * POST /:courseId/instructors
 * Add an instructor to a course's instructors array. Instructors only.
 *
 * @route POST /api/courses/:courseId/instructors
 * @param {string} courseId - Course ID (path param)
 * @param {object} body - Instructor data (body)
 * @returns {object} { success: boolean, data?: object, message?: string, error?: string }
 * @response 200 - Instructor added successfully
 * @response 400 - Validation error
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course not found
 * @response 500 - Failed to add instructor
 */
router.post('/:courseId/instructors', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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
        
        // Check if instructor is already in the instructors array
        if (isInstructorInArray(courseData.instructors || [])) {
            return res.status(200).json({
                success: true,
                data: courseData,
                message: 'Instructor is already part of this course'
            });
        }
        
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
        
        const updatedCourse = await instance.updateActiveCourse(courseId, {
            instructors: updatedInstructors
        } as Partial<activeCourse>);
        
        console.log(`[ADD-INSTRUCTOR] Added instructor ${instructorName} (${instructorUserId}) to course ${courseId}`);
        
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

/**
 * DELETE /:id/restart-onboarding
 * Restart onboarding by deleting course and related collections, then recreating with empty defaults. Instructors only.
 *
 * @route DELETE /api/courses/:id/restart-onboarding
 * @param {string} id - Course ID (path param)
 * @returns {object} { success: boolean, message?: string, data?: { courseId, courseName }, error?: string }
 * @response 200 - Onboarding restarted successfully
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course not found
 * @response 500 - Failed to restart onboarding
 */
router.delete('/:id/restart-onboarding', requireInstructorForCourseAPI(['paramsId']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

// COMMENTED OUT: Privilege action - Remove course (frontend removed)
// DELETE /api/courses/:id/remove - Remove course completely (REQUIRES AUTH - Instructors only)
// This removes the course and all associated data: collections, Qdrant documents, and user enrollments
/*
router.delete('/:id/remove', requireInstructorForCourseAPI(['paramsId']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const courseId = req.params.id;
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Step 1: Get course from active-course-list
        const course = await mongoDB.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        const courseData = course as unknown as activeCourse;
        const courseName = courseData.courseName;
        
        console.log(`🗑️ Removing course ${courseId} (${courseName}) and all associated data...`);
        
        // Step 2: Remove courseId from all users' coursesEnrolled in active-users
        let usersModified = 0;
        try {
            usersModified = await mongoDB.removeCourseFromAllUsers(courseId);
            console.log(`✅ Removed course from ${usersModified} user(s) in active-users`);
        } catch (error) {
            console.error(`❌ Failed to remove course from active-users:`, error);
            // Continue with other operations even if this fails
        }
        
        // Step 3: Get collection names
        const collectionNames = await mongoDB.getCollectionNames(courseName);
        
        // Step 4: Drop course collections (users, flags, memory-agent)
        const droppedCollections: string[] = [];
        const errors: string[] = [];
        
        const collectionsToDrop = [
            collectionNames.users,
            collectionNames.flags,
            collectionNames.memoryAgent
        ];
        
        for (const collectionName of collectionsToDrop) {
            try {
                const dropResult = await mongoDB.dropCollection(collectionName);
                if (dropResult.success) {
                    droppedCollections.push(collectionName);
                    console.log(`✅ Dropped collection: ${collectionName}`);
                } else {
                    errors.push(`Failed to drop ${collectionName}: ${dropResult.error}`);
                    console.error(`❌ Failed to drop ${collectionName}:`, dropResult.error);
                }
            } catch (error) {
                const errorMsg = `Error dropping ${collectionName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                errors.push(errorMsg);
                console.error(`❌ ${errorMsg}`);
            }
        }
        
        // Step 5: Delete all Qdrant documents for the course
        let qdrantDeleted = 0;
        const qdrantErrors: string[] = [];
        try {
            const ragApp = await RAGApp.getInstance();
            const qdrantResult = await ragApp.deleteAllDocumentsForCourse(courseId);
            qdrantDeleted = qdrantResult.deletedCount;
            if (qdrantResult.errors && qdrantResult.errors.length > 0) {
                qdrantErrors.push(...qdrantResult.errors);
            }
            console.log(`✅ Deleted ${qdrantDeleted} Qdrant document(s) for course`);
        } catch (error) {
            const errorMsg = `Failed to delete Qdrant documents: ${error instanceof Error ? error.message : 'Unknown error'}`;
            qdrantErrors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
            // Continue with course deletion even if Qdrant fails
        }
        
        // Step 6: Remove course from active-course-list
        await mongoDB.deleteActiveCourse(courseData);
        console.log(`✅ Removed course from active-course-list`);
        
        // Build success message
        let message = `Course "${courseName}" removed successfully. `;
        message += `Removed from ${usersModified} user(s), dropped ${droppedCollections.length} collection(s), `;
        message += `deleted ${qdrantDeleted} Qdrant document(s).`;
        
        if (errors.length > 0 || qdrantErrors.length > 0) {
            const allErrors = [...errors, ...qdrantErrors];
            message += ` (${allErrors.length} error(s) occurred)`;
        }
        
        res.status(200).json({
            success: true,
            message: message,
            data: {
                courseId: courseId,
                courseName: courseName,
                usersModified: usersModified,
                droppedCollections: droppedCollections,
                qdrantDeleted: qdrantDeleted,
                errors: [...errors, ...qdrantErrors]
            }
        });
        
    } catch (error) {
        console.error('❌ Error removing course:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove course',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));
*/

/**
 * DELETE /:id
 * Delete a course. Instructors only.
 *
 * @route DELETE /api/courses/:id
 * @param {string} id - Course ID (path param)
 * @returns {object} { success: boolean, message?: string, error?: string }
 * @response 200 - Course deleted successfully
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course not found
 */
router.delete('/:id', requireInstructorForCourseAPI(['paramsId']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * POST /:courseId/topic-or-week-instances
 * Add a new topic/week instance to a course. Instructors only.
 *
 * @route POST /api/courses/:courseId/topic-or-week-instances
 * @param {string} courseId - Course ID (path param)
 * @param {string} [title] - Instance title (body); defaults to "Week N" or "Topic N"
 * @returns {object} { success: boolean, data?: TopicOrWeekInstance, message?: string, error?: string }
 * @response 201 - Topic/Week instance added successfully
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course not found
 * @response 500 - Failed to add topic/week instance
 */
router.post('/:courseId/topic-or-week-instances', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * POST /:courseId/topic-or-week-instances/:topicOrWeekId/items
 * Add a new content item (section) to a topic/week instance. Instructors only.
 *
 * @route POST /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items
 * @param {string} courseId - Course ID (path param)
 * @param {string} topicOrWeekId - Topic/week instance ID (path param)
 * @param {object} contentItem - Content item with title, learningObjectives, additionalMaterials (body)
 * @returns {object} { success: boolean, data?: TopicOrWeekItem, message?: string, error?: string }
 * @response 201 - Content item added successfully
 * @response 400 - Valid content item title required
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course or topic/week instance not found
 * @response 500 - Failed to add content item
 */
router.post('/:courseId/topic-or-week-instances/:topicOrWeekId/items', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * GET /:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives
 * Get learning objectives for a course content item.
 *
 * @route GET /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives
 * @param {string} courseId - Course ID (path param)
 * @param {string} topicOrWeekId - Topic/week instance ID (path param)
 * @param {string} itemId - Content item ID (path param)
 * @returns {object} { success: boolean, data?: array, message?: string, error?: string }
 * @response 200 - Learning objectives retrieved successfully
 * @response 404 - Course, topic/week instance, or content item not found
 * @response 500 - Failed to get learning objectives
 */
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

/**
 * POST /:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives
 * Add a learning objective to a content item. Instructors only.
 *
 * @route POST /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives
 * @param {string} courseId - Course ID (path param)
 * @param {string} topicOrWeekId - Topic/week instance ID (path param)
 * @param {string} itemId - Content item ID (path param)
 * @param {object} learningObjective - Learning objective with LearningObjective text (body)
 * @returns {object} { success: boolean, data?: object, message?: string, error?: string }
 * @response 200 - Learning objective added successfully
 * @response 400 - Missing or invalid learningObjective
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 500 - Failed to add learning objective
 */
router.post('/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * PUT /:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId
 * Update a learning objective. Instructors only.
 *
 * @route PUT /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId
 * @param {string} courseId - Course ID (path param)
 * @param {string} topicOrWeekId - Topic/week instance ID (path param)
 * @param {string} itemId - Content item ID (path param)
 * @param {string} objectiveId - Learning objective ID (path param)
 * @param {object} updateData - Update payload with LearningObjective text (body)
 * @returns {object} { success: boolean, data?: object, message?: string, error?: string }
 * @response 200 - Learning objective updated successfully
 * @response 400 - Missing or invalid updateData
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 500 - Failed to update learning objective
 */
router.put('/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * DELETE /:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId
 * Delete a learning objective. Instructors only.
 *
 * @route DELETE /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId
 * @param {string} courseId - Course ID (path param)
 * @param {string} topicOrWeekId - Topic/week instance ID (path param)
 * @param {string} itemId - Content item ID (path param)
 * @param {string} objectiveId - Learning objective ID (path param)
 * @returns {object} { success: boolean, data?: object, message?: string, error?: string }
 * @response 200 - Learning objective deleted successfully
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 500 - Failed to delete learning objective
 */
router.delete('/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/objectives/:objectiveId', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * POST /:courseId/flags
 * Create a new flag report for a course.
 *
 * @route POST /api/courses/:courseId/flags
 * @param {string} courseId - Course ID (path param)
 * @param {string} flagType - Flag type: innacurate_response, harassment, inappropriate, dishonesty, interface bug, other (body)
 * @param {string} reportType - Report type (body)
 * @param {string} chatContent - Chat content being flagged (body)
 * @param {string} userId - User ID (body)
 * @returns {object} { success: boolean, message?: string, data?: { id, insertedId }, error?: string }
 * @response 201 - Flag report created successfully
 * @response 400 - Missing required fields or invalid flagType
 * @response 401 - User not authenticated
 * @response 404 - Course not found
 * @response 500 - Failed to create flag report
 */
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

/**
 * GET /:courseId/flags
 * Get all flag reports for a course. Instructors only.
 *
 * @route GET /api/courses/:courseId/flags
 * @param {string} courseId - Course ID (path param)
 * @returns {object} { success: boolean, data?: FlagReport[], count?: number, error?: string }
 * @response 200 - Success
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course not found
 * @response 500 - Failed to get flag reports
 */
router.get('/:courseId/flags', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * GET /:courseId/flags/with-names
 * Get flag reports with resolved user names for a course. Instructors only.
 *
 * @route GET /api/courses/:courseId/flags/with-names
 * @param {string} courseId - Course ID (path param)
 * @returns {object} { success: boolean, data?: array, count?: number, error?: string }
 * @response 200 - Success
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course not found
 * @response 500 - Failed to get flag reports with names
 */
router.get('/:courseId/flags/with-names', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * GET /:courseId/flags/:flagId
 * Get a specific flag report by ID. Instructors only.
 *
 * @route GET /api/courses/:courseId/flags/:flagId
 * @param {string} courseId - Course ID (path param)
 * @param {string} flagId - Flag report ID (path param)
 * @returns {object} { success: boolean, data?: FlagReport, error?: string }
 * @response 200 - Success
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course or flag report not found
 */
router.get('/:courseId/flags/:flagId', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * PUT /:courseId/flags/:flagId
 * Update a flag report (status, response). Instructors only.
 *
 * @route PUT /api/courses/:courseId/flags/:flagId
 * @param {string} courseId - Course ID (path param)
 * @param {string} flagId - Flag report ID (path param)
 * @param {string} [status] - Status: "unresolved" or "resolved" (body)
 * @param {string} [response] - Response text (body)
 * @returns {object} { success: boolean, message?: string, data?: FlagReport, error?: string }
 * @response 200 - Flag report updated successfully
 * @response 400 - Invalid status or no valid fields to update
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course or flag report not found
 * @response 500 - Failed to update flag report
 */
router.put('/:courseId/flags/:flagId', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * PATCH /:courseId/flags/:flagId/response
 * Update response text for a resolved flag only. Instructors only.
 *
 * @route PATCH /api/courses/:courseId/flags/:flagId/response
 * @param {string} courseId - Course ID (path param)
 * @param {string} flagId - Flag report ID (path param)
 * @param {string} [response] - Response text (body)
 * @returns {object} { success: boolean, message?: string, data?: FlagReport, error?: string }
 * @response 200 - Flag response updated successfully
 * @response 400 - Can only update response for resolved flags
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course or flag report not found
 * @response 500 - Failed to update flag response
 */
router.patch('/:courseId/flags/:flagId/response', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, flagId } = req.params;
        const { response } = req.body;

        // Get course to get course name
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        // Validate that flag exists and is resolved
        const flag = await instance.getFlagReport(course.courseName, flagId);
        if (!flag) {
            return res.status(404).json({
                success: false,
                error: 'Flag report not found'
            });
        }

        if (flag.status !== 'resolved') {
            return res.status(400).json({
                success: false,
                error: 'Can only update response for resolved flags'
            });
        }

        // Prepare update data - only update response and updatedAt timestamp
        const updateData: Partial<FlagReport> = {
            response: response?.trim() || '',
            updatedAt: new Date()
        };

        console.log('='.repeat(60));
        console.log('🏴 Updating resolved flag response:', flagId, 'with data:', updateData);
        console.log('='.repeat(60));

        const result = await instance.updateFlagReport(course.courseName, flagId, updateData);

        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Flag report not found'
            });
        }

        console.log('='.repeat(60));
        console.log('🏴 Response update result:', JSON.stringify(result, null, 2));
        console.log('='.repeat(60));

        res.json({
            success: true,
            message: 'Flag response updated successfully',
            data: result
        });
    } catch (error) {
        console.error('Error updating flag response:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update flag response'
        });
    }
}));

/**
 * DELETE /:courseId/flags/:flagId
 * Delete a flag report. Instructors only.
 *
 * @route DELETE /api/courses/:courseId/flags/:flagId
 * @param {string} courseId - Course ID (path param)
 * @param {string} flagId - Flag report ID (path param)
 * @returns {object} { success: boolean, message?: string, deletedCount?: number, error?: string }
 * @response 200 - Flag report deleted successfully
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course or flag report not found
 * @response 500 - Failed to delete flag report
 */
router.delete('/:courseId/flags/:flagId', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * DELETE /:courseId/flags
 * Delete all flag reports for a course. Instructors only.
 *
 * @route DELETE /api/courses/:courseId/flags
 * @param {string} courseId - Course ID (path param)
 * @returns {object} { success: boolean, message?: string, deletedCount?: number, error?: string }
 * @response 200 - All flag reports deleted successfully
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course not found
 * @response 500 - Failed to delete flag reports
 */
router.delete('/:courseId/flags', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * POST /:courseId/flags/create-indexes
 * Create database indexes for flag collection. Instructors only.
 *
 * @route POST /api/courses/:courseId/flags/create-indexes
 * @param {string} courseId - Course ID (path param)
 * @returns {object} { success: boolean, message?: string, data?: { indexesCreated, errors }, error?: string }
 * @response 200 - Indexes created (success may be false if some failed)
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course not found
 * @response 500 - Failed to create indexes
 */
router.post('/:courseId/flags/create-indexes', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * GET /:courseId/flags/validate
 * Validate flag collection integrity. Instructors only.
 *
 * @route GET /api/courses/:courseId/flags/validate
 * @param {string} courseId - Course ID (path param)
 * @returns {object} { success: boolean, data?: object, error?: string }
 * @response 200 - Validation result
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course not found
 * @response 500 - Failed to validate flag collection
 */
router.get('/:courseId/flags/validate', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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

/**
 * GET /:courseId/flags/statistics
 * Get flag statistics for a course.
 *
 * @route GET /api/courses/:courseId/flags/statistics
 * @param {string} courseId - Course ID (path param)
 * @returns {object} { success: boolean, data?: object, error?: string }
 * @response 200 - Success
 * @response 401 - User not authenticated
 * @response 404 - Course not found
 * @response 500 - Failed to get flag statistics
 */
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

/**
 * GET /:courseId/flags/student/:userId
 * Get flag reports for a specific student in a course.
 *
 * @route GET /api/courses/:courseId/flags/student/:userId
 * @param {string} courseId - Course ID (path param)
 * @param {string} userId - User ID (path param)
 * @returns {object} { success: boolean, data?: FlagReport[], count?: number, error?: string }
 * @response 200 - Success
 * @response 401 - User not authenticated
 * @response 404 - Course not found
 * @response 500 - Failed to get student flag reports
 */
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

/**
 * DELETE /:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/materials/:materialId
 * Delete an additional material from a content item. Removes from MongoDB and Qdrant. Instructors only.
 *
 * @route DELETE /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/materials/:materialId
 * @param {string} courseId - Course ID (path param)
 * @param {string} topicOrWeekId - Topic/week instance ID (path param)
 * @param {string} itemId - Content item ID (path param)
 * @param {string} materialId - Material ID (path param)
 * @returns {object} { success: boolean, message?: string, data?: { materialId, deleted, materialName, chunksDeleted }, error?: string }
 * @response 200 - Material deleted successfully
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course, topic/week, item, or material not found
 * @response 500 - Failed to delete material
 */
router.delete('/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/materials/:materialId', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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
        
        let qdrantResult: { materialName: string; chunksDeleted: number } | null = null;
        if (material.qdrantId) {
            try {
                const ragApp = await RAGApp.getInstance();
                const deleteResult = await ragApp.deleteDocument(materialId, courseId, topicOrWeekId, itemId);
                qdrantResult = { materialName: deleteResult.materialName, chunksDeleted: deleteResult.chunksDeleted };
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
                deleted: true,
                materialName: qdrantResult?.materialName ?? material.name,
                chunksDeleted: qdrantResult?.chunksDeleted ?? 0
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

/**
 * DELETE /:courseId/documents/all
 * Delete all RAG documents for a course (Qdrant and MongoDB additionalMaterials). Instructors only.
 *
 * @route DELETE /api/courses/:courseId/documents/all
 * @param {string} courseId - Course ID (path param)
 * @returns {object} { success: boolean, message?: string, data?: { deletedCount, courseId }, error?: string }
 * @response 200 - All documents deleted successfully
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course not found
 * @response 500 - Failed to delete documents
 */
router.delete('/:courseId/documents/all', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
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



/**
 * PATCH /:courseId/topic-or-week-instances/:topicOrWeekId/title
 * Update a topic/week instance title.
 *
 * @route PATCH /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/title
 * @param {string} courseId - Course ID (path param)
 * @param {string} topicOrWeekId - Topic/week instance ID (path param)
 * @param {string} title - New title (body)
 * @returns {object} { success: boolean, data?: TopicOrWeekInstance, message?: string, error?: string }
 * @response 200 - Title updated successfully
 * @response 400 - Invalid or empty title
 * @response 401 - User not authenticated
 * @response 404 - Course or topic/week instance not found
 * @response 500 - Failed to update title
 */
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
        
        const oldTitle = topicOrWeekInstance.title;
        
        // Update the topic/week instance title
        topicOrWeekInstance.title = trimmedTitle;
        topicOrWeekInstance.updatedAt = new Date();
        
        // Save the updated course
        const updatedCourse = await instance.updateActiveCourse(courseId, {
            topicOrWeekInstances: course.topicOrWeekInstances
        });
        
        // Sync title change to Qdrant chunk metadata (non-blocking)
        try {
            const ragApp = await RAGApp.getInstance();
            const result = await ragApp.updateTopicOrWeekTitleInQdrant(course.courseName, oldTitle, trimmedTitle);
            if (result.chunksUpdated > 0) {
                console.log(`✅ Qdrant: Updated topicOrWeekTitle in ${result.chunksUpdated} chunks`);
            }
        } catch (ragError) {
            console.warn('Qdrant metadata sync failed (MongoDB update succeeded):', ragError);
        }
        
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

/**
 * PATCH /:courseId/topic-or-week-instances/:topicOrWeekId/published
 * Update a topic/week instance published status.
 *
 * @route PATCH /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/published
 * @param {string} courseId - Course ID (path param)
 * @param {string} topicOrWeekId - Topic/week instance ID (path param)
 * @param {boolean} published - Published status (body)
 * @returns {object} { success: boolean, data?: TopicOrWeekInstance, message?: string, error?: string }
 * @response 200 - Published status updated successfully
 * @response 400 - Published must be a boolean
 * @response 401 - User not authenticated
 * @response 404 - Course or topic/week instance not found
 * @response 500 - Failed to update published status
 */
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

/**
 * DELETE /:courseId/topic-or-week-instances/:topicOrWeekId
 * Delete a topic/week instance. At least one must remain. Instructors only.
 *
 * @route DELETE /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId
 * @param {string} courseId - Course ID (path param)
 * @param {string} topicOrWeekId - Topic/week instance ID (path param)
 * @returns {object} { success: boolean, data?: { deletedTopicOrWeekId, deletedDocuments, totalChunksDeleted }, message?: string, error?: string }
 * @response 200 - Topic/week instance deleted successfully
 * @response 400 - Cannot delete last instance
 * @response 401 - User not authenticated
 * @response 403 - Instructor access required for course
 * @response 404 - Course or topic/week instance not found
 * @response 500 - Failed to delete topic/week instance
 */
router.delete('/:courseId/topic-or-week-instances/:topicOrWeekId', requireInstructorForCourseAPI(['params']), asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, topicOrWeekId } = req.params;

        if (!courseId || !topicOrWeekId) {
            return res.status(400).json({
                success: false,
                error: 'Course ID and Topic/Week Instance ID are required'
            });
        }

        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const instances: TopicOrWeekInstance[] = (course.topicOrWeekInstances as unknown as TopicOrWeekInstance[]) || [];
        if (instances.length <= 1) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete the last topic/week instance. At least one must remain.'
            });
        }

        const topicOrWeekInstance = instances.find((d: TopicOrWeekInstance) => d.id === topicOrWeekId);
        if (!topicOrWeekInstance) {
            return res.status(404).json({
                success: false,
                error: 'Topic/Week instance not found'
            });
        }

        // RAG cleanup: delete documents for all materials in this instance
        const deletedDocuments: { name: string; chunksDeleted: number }[] = [];
        let totalChunksDeleted = 0;
        try {
            const ragApp = await RAGApp.getInstance();
            const ragPromises: Promise<{ deleted: boolean; materialName: string; chunksDeleted: number }>[] = [];
            topicOrWeekInstance.items?.forEach((item: TopicOrWeekItem) => {
                (item.additionalMaterials || []).forEach((material: any) => {
                    if (material.id && material.qdrantId) {
                        ragPromises.push(ragApp.deleteDocument(material.id, courseId, topicOrWeekId, item.id));
                    }
                });
            });
            const results = await Promise.allSettled(ragPromises);
            results.forEach((r, i) => {
                if (r.status === 'fulfilled') {
                    deletedDocuments.push({ name: r.value.materialName, chunksDeleted: r.value.chunksDeleted });
                    totalChunksDeleted += r.value.chunksDeleted;
                } else {
                    console.warn(`RAG cleanup failed for material ${i}:`, r.reason);
                }
            });
        } catch (ragError) {
            console.warn('RAG cleanup failed (continuing with deletion):', ragError);
        }

        const filteredInstances = instances.filter((i: TopicOrWeekInstance) => i.id !== topicOrWeekId);
        await instance.updateActiveCourse(courseId, { topicOrWeekInstances: filteredInstances } as any);

        console.log(`✅ Topic/Week instance ${topicOrWeekId} deleted successfully`);

        res.status(200).json({
            success: true,
            data: {
                deletedTopicOrWeekId: topicOrWeekId,
                deletedDocuments,
                totalChunksDeleted
            },
            message: 'Topic/Week instance deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting topic/week instance:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete topic/week instance'
        });
    }
}));

/**
 * PATCH /:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/title
 * Update a content item title.
 *
 * @route PATCH /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId/title
 * @param {string} courseId - Course ID (path param)
 * @param {string} topicOrWeekId - Topic/week instance ID (path param)
 * @param {string} itemId - Content item ID (path param)
 * @param {string} title - New title (body)
 * @returns {object} { success: boolean, data?: TopicOrWeekItem, message?: string, error?: string }
 * @response 200 - Item title updated successfully
 * @response 400 - Invalid or empty title
 * @response 401 - User not authenticated
 * @response 404 - Course, topic/week, or item not found
 * @response 500 - Failed to update item title
 */
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
        
        const oldItemTitle = item.title || item.itemTitle || '';
        
        // Update the item title
        item.title = trimmedTitle;
        item.itemTitle = trimmedTitle;
        item.updatedAt = new Date();
        topicOrWeekInstance.updatedAt = new Date();
        
        // Save the updated course
        const updatedCourse = await instance.updateActiveCourse(courseId, {
            topicOrWeekInstances: course.topicOrWeekInstances
        });
        
        // Sync title change to Qdrant chunk metadata (non-blocking)
        try {
            const ragApp = await RAGApp.getInstance();
            const result = await ragApp.updateItemTitleInQdrant(
                course.courseName,
                topicOrWeekInstance.title,
                oldItemTitle,
                trimmedTitle
            );
            if (result.chunksUpdated > 0) {
                console.log(`✅ Qdrant: Updated itemTitle in ${result.chunksUpdated} chunks`);
            }
        } catch (ragError) {
            console.warn('Qdrant metadata sync failed (MongoDB update succeeded):', ragError);
        }
        
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

/**
 * DELETE /:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId
 * Delete a content item (section) from a topic/week instance. Cleans up RAG documents.
 *
 * @route DELETE /api/courses/:courseId/topic-or-week-instances/:topicOrWeekId/items/:itemId
 * @param {string} courseId - Course ID (path param)
 * @param {string} topicOrWeekId - Topic/week instance ID (path param)
 * @param {string} itemId - Content item ID (path param)
 * @returns {object} { success: boolean, data?: { deletedItemId, topicOrWeekId, remainingItems, deletedDocuments, totalChunksDeleted }, message?: string, error?: string }
 * @response 200 - Content item deleted successfully
 * @response 400 - Missing required params
 * @response 401 - User not authenticated
 * @response 404 - Course, topic/week, or item not found
 * @response 500 - Failed to delete content item
 */
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
        
        // RAG cleanup: delete documents for all materials in this item
        const deletedDocuments: { name: string; chunksDeleted: number }[] = [];
        let totalChunksDeleted = 0;
        try {
            const ragApp = await RAGApp.getInstance();
            const ragPromises = (item.additionalMaterials || [])
                .filter((material: any) => material.id && material.qdrantId)
                .map((material: any) => ragApp.deleteDocument(material.id, courseId, topicOrWeekId, itemId));
            const results = await Promise.allSettled(ragPromises);
            results.forEach((r, i) => {
                if (r.status === 'fulfilled') {
                    deletedDocuments.push({ name: r.value.materialName, chunksDeleted: r.value.chunksDeleted });
                    totalChunksDeleted += r.value.chunksDeleted;
                } else {
                    console.warn(`RAG cleanup failed for material ${i}:`, r.reason);
                }
            });
        } catch (ragError) {
            console.warn('RAG cleanup failed (continuing with deletion):', ragError);
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
                remainingItems: topicOrWeekInstance.items.length,
                deletedDocuments,
                totalChunksDeleted
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

// COMMENTED OUT: Privilege action - Download course info (frontend removed)
/*
router.get('/export/course-info', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Get all active courses
        const allCourses = await mongoDB.getAllActiveCourses();
        
        // Build hierarchical course information export
        let exportText = '';
        
        if (allCourses.length === 0) {
            exportText = 'No courses found.\n';
        } else {
            // Sort courses by courseName for consistent output
            const sortedCourses = allCourses.sort((a: any, b: any) => {
                const nameA = a.courseName || '';
                const nameB = b.courseName || '';
                return nameA.localeCompare(nameB);
            });
            
            for (const course of sortedCourses) {
                const courseData = course as any;
                const courseName = courseData.courseName || 'Unknown Course';
                
                // Add course header
                exportText += `========================================\n`;
                exportText += `COURSE: ${courseName}\n`;
                exportText += `Course ID: ${courseData.id || 'N/A'}\n`;
                exportText += `========================================\n\n`;
                
                // Export course information from active-course-list
                exportText += `--- Course Information (active-course-list) ---\n`;
                const courseJson = JSON.stringify(courseData, null, 2);
                exportText += `${courseJson}\n\n`;
                
                // Get collection names for this course
                try {
                    const collectionNames = await mongoDB.getCollectionNames(courseName);
                    
                    // Export course users collection
                    exportText += `--- Course Users (${collectionNames.users}) ---\n`;
                    try {
                        const usersCollection = mongoDB.db.collection(collectionNames.users);
                        const users = await usersCollection.find({}).toArray();
                        if (users.length === 0) {
                            exportText += '[Empty collection]\n';
                        } else {
                            for (let i = 0; i < users.length; i++) {
                                const userJson = JSON.stringify(users[i], null, 2);
                                exportText += `${userJson}\n`;
                                if (i < users.length - 1) {
                                    exportText += '\n';
                                }
                            }
                        }
                    } catch (usersError) {
                        exportText += `[Error reading collection: ${usersError instanceof Error ? usersError.message : 'Unknown error'}]\n`;
                    }
                    exportText += '\n\n';
                    
                    // Export course flags collection
                    exportText += `--- Course Flags (${collectionNames.flags}) ---\n`;
                    try {
                        const flagsCollection = mongoDB.db.collection(collectionNames.flags);
                        const flags = await flagsCollection.find({}).toArray();
                        if (flags.length === 0) {
                            exportText += '[Empty collection]\n';
                        } else {
                            for (let i = 0; i < flags.length; i++) {
                                const flagJson = JSON.stringify(flags[i], null, 2);
                                exportText += `${flagJson}\n`;
                                if (i < flags.length - 1) {
                                    exportText += '\n';
                                }
                            }
                        }
                    } catch (flagsError) {
                        exportText += `[Error reading collection: ${flagsError instanceof Error ? flagsError.message : 'Unknown error'}]\n`;
                    }
                    exportText += '\n\n';
                    
                    // Export course memory-agent collection
                    exportText += `--- Course Memory Agent (${collectionNames.memoryAgent}) ---\n`;
                    try {
                        const memoryAgentCollection = mongoDB.db.collection(collectionNames.memoryAgent);
                        const memoryAgents = await memoryAgentCollection.find({}).toArray();
                        if (memoryAgents.length === 0) {
                            exportText += '[Empty collection]\n';
                        } else {
                            for (let i = 0; i < memoryAgents.length; i++) {
                                const memoryAgentJson = JSON.stringify(memoryAgents[i], null, 2);
                                exportText += `${memoryAgentJson}\n`;
                                if (i < memoryAgents.length - 1) {
                                    exportText += '\n';
                                }
                            }
                        }
                    } catch (memoryAgentError) {
                        exportText += `[Error reading collection: ${memoryAgentError instanceof Error ? memoryAgentError.message : 'Unknown error'}]\n`;
                    }
                    exportText += '\n\n';
                    
                } catch (collectionNamesError) {
                    exportText += `[Error getting collection names: ${collectionNamesError instanceof Error ? collectionNamesError.message : 'Unknown error'}]\n\n`;
                }
                
                // Add spacing between courses
                exportText += '\n\n';
            }
        }
        
        // Set response headers for file download
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `course-info-export-${timestamp}.txt`;
        
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(exportText);
        
    } catch (error) {
        console.error('Error exporting course information:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export course information',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));
*/
// END COMMENTED OUT: export/course-info

// ===========================================
// ADMIN ROUTES (Instructor Only) - COMMENTED OUT: Privilege action (frontend removed)
// ===========================================
/*
router.post('/admin/reset-database', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        console.log('🗑️ [ADMIN] Reset Database request received');
        
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Step 1: Get all collections
        const allCollections = await mongoDB.db.listCollections().toArray();
        const collectionNames = allCollections.map(col => col.name);
        
        console.log(`📋 Found ${collectionNames.length} collection(s) in database`);
        
        // Collections to preserve initially (will be cleared later)
        const preservedCollections = ['active-course-list', 'active-users'];
        
        // Filter out collections to preserve
        const collectionsToDrop = collectionNames.filter(
            name => !preservedCollections.includes(name)
        );
        
        console.log(`🗑️ Dropping ${collectionsToDrop.length} collection(s)`);
        
        // Step 2: Drop all collections except preserved ones
        const droppedCollections: string[] = [];
        const errors: string[] = [];
        
        for (const collectionName of collectionsToDrop) {
            try {
                const dropResult = await mongoDB.dropCollection(collectionName);
                if (dropResult.success) {
                    droppedCollections.push(collectionName);
                    console.log(`✅ Dropped collection: ${collectionName}`);
                } else {
                    errors.push(`Failed to drop ${collectionName}: ${dropResult.error}`);
                    console.error(`❌ Failed to drop ${collectionName}:`, dropResult.error);
                }
            } catch (error) {
                const errorMsg = `Error dropping ${collectionName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                errors.push(errorMsg);
                console.error(`❌ ${errorMsg}`);
            }
        }
        
        // Step 3: Clear active-course-list
        console.log('🧹 Clearing active-course-list...');
        try {
            const activeCourseListCollection = mongoDB.db.collection('active-course-list');
            const deleteResult = await activeCourseListCollection.deleteMany({});
            console.log(`✅ Deleted ${deleteResult.deletedCount} course(s) from active-course-list`);
        } catch (error) {
            const errorMsg = `Failed to clear active-course-list: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
        }
        
        // Step 4: Clear active-users
        console.log('🧹 Clearing active-users...');
        try {
            const activeUsersCollection = mongoDB.db.collection('active-users');
            const deleteResult = await activeUsersCollection.deleteMany({});
            console.log(`✅ Deleted ${deleteResult.deletedCount} user(s) from active-users`);
        } catch (error) {
            const errorMsg = `Failed to clear active-users: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
        }
        
        // Step 5: Wipe vector database using NuclearClearRAGDatabase
        let qdrantDeleted = 0;
        const qdrantErrors: string[] = [];
        try {
            const ragApp = await RAGApp.getInstance();
            const qdrantResult = await ragApp.NuclearClearRAGDatabase();
            qdrantDeleted = qdrantResult.deletedCount;
            if (qdrantResult.errors && qdrantResult.errors.length > 0) {
                qdrantErrors.push(...qdrantResult.errors);
            }
            console.log(`✅ Deleted ${qdrantDeleted} Qdrant document(s) (nuclear clear)`);
        } catch (error) {
            const errorMsg = `Failed to clear vector database: ${error instanceof Error ? error.message : 'Unknown error'}`;
            qdrantErrors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
            // Continue even if Qdrant fails
        }
        
        let message = `Database reset successfully. Dropped ${droppedCollections.length} collection(s), cleared active-course-list and active-users, deleted ${qdrantDeleted} Qdrant document(s).`;
        if (errors.length > 0 || qdrantErrors.length > 0) {
            const allErrors = [...errors, ...qdrantErrors];
            message += ` (${allErrors.length} error(s) occurred)`;
        }
        
        console.log(`✅ ${message}`);
        
        res.status(200).json({
            success: true,
            message: message,
            data: {
                droppedCollections: droppedCollections,
                qdrantDeleted: qdrantDeleted,
                errors: [...errors, ...qdrantErrors]
            }
        });
        
    } catch (error) {
        console.error('❌ Error resetting database:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset database',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

// POST /api/courses/admin/reset-mongodb - Reset MongoDB only (commented out)
router.post('/admin/reset-mongodb', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        console.log('🗑️ [ADMIN] Reset MongoDB request received');
        
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Step 1: Get all collections
        const allCollections = await mongoDB.db.listCollections().toArray();
        const collectionNames = allCollections.map(col => col.name);
        
        console.log(`📋 Found ${collectionNames.length} collection(s) in database`);
        
        // Collections to preserve initially (will be cleared later)
        const preservedCollections = ['active-course-list', 'active-users'];
        
        // Filter out collections to preserve
        const collectionsToDrop = collectionNames.filter(
            name => !preservedCollections.includes(name)
        );
        
        console.log(`🗑️ Dropping ${collectionsToDrop.length} collection(s)`);
        
        // Step 2: Drop all collections except preserved ones
        const droppedCollections: string[] = [];
        const errors: string[] = [];
        
        for (const collectionName of collectionsToDrop) {
            try {
                const dropResult = await mongoDB.dropCollection(collectionName);
                if (dropResult.success) {
                    droppedCollections.push(collectionName);
                    console.log(`✅ Dropped collection: ${collectionName}`);
                } else {
                    errors.push(`Failed to drop ${collectionName}: ${dropResult.error}`);
                    console.error(`❌ Failed to drop ${collectionName}:`, dropResult.error);
                }
            } catch (error) {
                const errorMsg = `Error dropping ${collectionName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                errors.push(errorMsg);
                console.error(`❌ ${errorMsg}`);
            }
        }
        
        // Step 3: Clear active-course-list
        console.log('🧹 Clearing active-course-list...');
        try {
            const activeCourseListCollection = mongoDB.db.collection('active-course-list');
            const deleteResult = await activeCourseListCollection.deleteMany({});
            console.log(`✅ Deleted ${deleteResult.deletedCount} course(s) from active-course-list`);
        } catch (error) {
            const errorMsg = `Failed to clear active-course-list: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
        }
        
        // Step 4: Clear active-users
        console.log('🧹 Clearing active-users...');
        try {
            const activeUsersCollection = mongoDB.db.collection('active-users');
            const deleteResult = await activeUsersCollection.deleteMany({});
            console.log(`✅ Deleted ${deleteResult.deletedCount} user(s) from active-users`);
        } catch (error) {
            const errorMsg = `Failed to clear active-users: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
        }
        
        // Step 5: Recreate active-course-list and active-users as empty collections
        console.log('📝 Ensuring active-course-list and active-users collections exist...');
        try {
            // Check if collections exist, create if they don't
            const collections = await mongoDB.db.listCollections({ name: 'active-course-list' }).toArray();
            if (collections.length === 0) {
                await mongoDB.db.createCollection('active-course-list');
                console.log('✅ Created active-course-list collection');
            }
            
            const usersCollections = await mongoDB.db.listCollections({ name: 'active-users' }).toArray();
            if (usersCollections.length === 0) {
                await mongoDB.db.createCollection('active-users');
                console.log('✅ Created active-users collection');
            }
        } catch (error) {
            const errorMsg = `Error ensuring collections exist: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
        }
        
        let message = `MongoDB reset successfully. Dropped ${droppedCollections.length} collection(s), cleared active-course-list and active-users.`;
        if (errors.length > 0) {
            message += ` (${errors.length} error(s) occurred)`;
        }
        
        console.log(`✅ ${message}`);
        
        // Log out the user gracefully (logout + destroy session)
        req.logout((logoutErr) => {
            if (logoutErr) {
                console.error('❌ Error during logout after MongoDB reset:', logoutErr);
                errors.push(`Logout failed: ${logoutErr.message}`);
            }
            
            // Destroy the session after logout
            (req.session as any).destroy((sessionErr: any) => {
                if (sessionErr) {
                    console.error('❌ Error destroying session after MongoDB reset:', sessionErr);
                    errors.push(`Session destruction failed: ${sessionErr.message}`);
                } else {
                    console.log('✅ Session destroyed successfully after MongoDB reset');
                }
                
                res.status(200).json({
                    success: true,
                    message: message + ' You have been logged out.',
                    data: {
                        droppedCollections: droppedCollections,
                        errors: errors
                    }
                });
            });
        });
        
    } catch (error) {
        console.error('❌ Error resetting MongoDB:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset MongoDB',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

// POST /api/admin/reset-vector-database - Reset vector database only (commented out)
router.post('/admin/reset-vector-database', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        console.log('🗑️ [ADMIN] Reset Vector Database request received');
        
        // Wipe vector database using NuclearClearRAGDatabase
        let qdrantDeleted = 0;
        const qdrantErrors: string[] = [];
        try {
            const ragApp = await RAGApp.getInstance();
            const qdrantResult = await ragApp.NuclearClearRAGDatabase();
            qdrantDeleted = qdrantResult.deletedCount;
            if (qdrantResult.errors && qdrantResult.errors.length > 0) {
                qdrantErrors.push(...qdrantResult.errors);
            }
            console.log(`✅ Deleted ${qdrantDeleted} Qdrant document(s) (nuclear clear)`);
        } catch (error) {
            const errorMsg = `Failed to clear vector database: ${error instanceof Error ? error.message : 'Unknown error'}`;
            qdrantErrors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
            throw error;
        }
        
        let message = `Vector database reset successfully. Deleted ${qdrantDeleted} Qdrant document(s).`;
        if (qdrantErrors.length > 0) {
            message += ` (${qdrantErrors.length} error(s) occurred)`;
        }
        
        console.log(`✅ ${message}`);
        
        res.status(200).json({
            success: true,
            message: message,
            data: {
                qdrantDeleted: qdrantDeleted,
                errors: qdrantErrors
            }
        });
        
    } catch (error) {
        console.error('❌ Error resetting vector database:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset vector database',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));
*/
// END COMMENTED OUT: Admin routes

// ===========================================
// MONITOR ROUTES (Instructor Only)
// ===========================================

/**
 * GET /monitor/:courseId/chat-titles
 * Get chat titles for all users (students and instructors). Lightweight list without full message history.
 *
 * @route GET /api/courses/monitor/:courseId/chat-titles
 * @param {string} courseId - Course ID (path param)
 * @returns {object} { success: boolean, data?: array, count?: number, error?: string }
 * @response 200 - Success
 * @response 401 - User not authenticated
 * @response 404 - Course not found
 * @response 500 - Failed to get chat titles
 */
router.get('/monitor/:courseId/chat-titles', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { courseId } = req.params;
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Get course to get courseName
        const course = await mongoDB.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        const courseData = course as any;
        const courseName = courseData.courseName;
        
        // Get collection names
        const collectionNames = await mongoDB.getCollectionNames(courseName);
        
        // Get all users (students and faculty) from the course users collection (projection for efficiency)
        const usersCollection = mongoDB.db.collection(collectionNames.users);
        const allUsers = await usersCollection.find(
            { affiliation: { $in: ['student', 'faculty'] } },
            { projection: { userId: 1, name: 1, affiliation: 1, chats: 1 } }
        ).toArray();
        
        // Build response with chat titles for each user (students and instructors)
        const usersData: Array<{
            userId: string;
            userName: string;
            role: 'student' | 'instructor';
            chats: Array<{ id: string; title: string }>;
        }> = [];
        
        for (const user of allUsers) {
            const userData = user as any;
            const chats = (userData.chats || []).filter((chat: any) => !chat.isDeleted);
            const chatTitles = chats.map((chat: any) => ({
                id: chat.id,
                title: chat.itemTitle || chat.title || 'Untitled Chat'
            }));
            
            usersData.push({
                userId: userData.userId,
                userName: userData.name || 'Unknown User',
                role: userData.affiliation === 'faculty' ? 'instructor' : 'student',
                chats: chatTitles
            });
        }
        
        res.status(200).json({
            success: true,
            data: usersData,
            count: usersData.length
        });
        
    } catch (error) {
        console.error('Error getting chat titles:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get chat titles',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

/**
 * GET /monitor/:courseId/chat/:chatId/download
 * Download full chat conversation with all messages in hierarchical format.
 *
 * @route GET /api/courses/monitor/:courseId/chat/:chatId/download
 * @param {string} courseId - Course ID (path param)
 * @param {string} chatId - Chat ID (path param)
 * @returns {object} Plain text file download
 * @response 200 - Success (Content-Type: text/plain, Content-Disposition: attachment)
 * @response 401 - User not authenticated
 * @response 404 - Course or chat not found
 * @response 500 - Failed to download chat
 */
router.get('/monitor/:courseId/chat/:chatId/download', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const { courseId, chatId } = req.params;
        const mongoDB = await EngEAI_MongoDB.getInstance();
        
        // Get course to get courseName
        const course = await mongoDB.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        const courseData = course as any;
        const courseName = courseData.courseName;
        
        // Get collection names
        const collectionNames = await mongoDB.getCollectionNames(courseName);
        
        // Find the user and chat
        const usersCollection = mongoDB.db.collection(collectionNames.users);
        const user = await usersCollection.findOne({ 'chats.id': chatId });
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Chat not found'
            });
        }
        
        const userData = user as any;
        const chat = (userData.chats || []).find((c: any) => c.id === chatId);
        
        if (!chat) {
            return res.status(404).json({
                success: false,
                error: 'Chat not found'
            });
        }
        
        // Build hierarchical export text
        let exportText = '';
        exportText += `========================================\n`;
        exportText += `CHAT CONVERSATION EXPORT\n`;
        exportText += `========================================\n\n`;
        exportText += `Student: ${userData.name || 'Unknown'}\n`;
        exportText += `Student ID: ${userData.userId || 'N/A'}\n`;
        exportText += `Course: ${courseName}\n`;
        exportText += `Chat ID: ${chatId}\n`;
        exportText += `Chat Title: ${chat.itemTitle || chat.title || 'Untitled Chat'}\n`;
        exportText += `Topic/Week: ${chat.topicOrWeekTitle || 'N/A'}\n`;
        exportText += `Created: ${chat.createdAt || 'N/A'}\n`;
        exportText += `========================================\n\n`;
        
        // Export messages
        exportText += `--- Messages ---\n\n`;
        const messages = chat.messages || [];
        if (messages.length === 0) {
            exportText += '[No messages]\n';
        } else {
            for (let i = 0; i < messages.length; i++) {
                const message = messages[i];
                exportText += `Message ${i + 1}:\n`;
                exportText += `  Role: ${message.role || 'unknown'}\n`;
                exportText += `  Content: ${message.content || '[Empty]'}\n`;
                if (message.timestamp) {
                    exportText += `  Timestamp: ${message.timestamp}\n`;
                }
                if (i < messages.length - 1) {
                    exportText += '\n';
                }
            }
        }
        
        // Set response headers for file download
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const chatTitle = (chat.itemTitle || chat.title || 'chat').replace(/[^a-z0-9]/gi, '-').toLowerCase();
        const filename = `chat-${chatTitle}-${timestamp}.txt`;
        
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(exportText);
        
    } catch (error) {
        console.error('Error downloading chat:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to download chat',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

// ===========================================
// ========= INITIAL ASSISTANT PROMPTS ======
// ===========================================

/**
 * GET /:courseId/assistant-prompts
 * Get all initial assistant prompts for a course. Instructors only.
 *
 * @route GET /api/courses/:courseId/assistant-prompts
 * @param {string} courseId - Course ID (path param)
 * @returns {object} { success: boolean, data?: InitialAssistantPrompt[], error?: string }
 * @response 200 - Success
 * @response 403 - Instructor access required or not in course
 * @response 404 - Course not found
 * @response 500 - Failed to get assistant prompts
 */
router.get('/:courseId/assistant-prompts', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId } = req.params;
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Verify instructor is in course's instructors array
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const courseData = course as unknown as activeCourse;
        const instructorUserId = globalUser.userId;
        
        // Helper function to check if instructor is in the array (handles both old and new formats)
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') {
                    return inst === instructorUserId;
                } else if (inst && inst.userId) {
                    return inst.userId === instructorUserId;
                }
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        // Ensure default prompt exists before returning prompts
        await instance.ensureDefaultPromptExists(courseId, courseData.courseName);

        const prompts = await instance.getInitialAssistantPrompts(courseId);
        
        res.json({
            success: true,
            data: prompts
        });
    } catch (error) {
        console.error('Error getting initial assistant prompts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get initial assistant prompts',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));


// ===========================================
// ========= MEMORY AGENT (STRUGGLE WORDS) ===
// ===========================================
// COMMENTED OUT: Privilege action - List/Remove struggle words (frontend removed)
/*
// GET /api/courses/:courseId/memory-agent/struggle-words - Get struggle words for instructor (REQUIRES AUTH)
router.get('/:courseId/memory-agent/struggle-words', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId } = req.params;
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
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') return inst === instructorUserId;
                if (inst && inst.userId) return inst.userId === instructorUserId;
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        const struggleWords = await memoryAgent.getStruggleWords(instructorUserId, courseData.courseName);
        const filtered = struggleWords.filter(w => !w.startsWith('---'));
        res.json({ success: true, data: filtered });
    } catch (error) {
        console.error('Error getting struggle words:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get struggle words',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

// DELETE /api/courses/:courseId/memory-agent/struggle-words - Remove all struggle words for instructor (REQUIRES AUTH)
router.delete('/:courseId/memory-agent/struggle-words', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId } = req.params;
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
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') return inst === instructorUserId;
                if (inst && inst.userId) return inst.userId === instructorUserId;
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        const struggleWords = await memoryAgent.getStruggleWords(instructorUserId, courseData.courseName);
        const filtered = struggleWords.filter(w => !w.startsWith('---'));
        await instance.updateMemoryAgentStruggleWords(courseData.courseName, instructorUserId, []);
        res.json({
            success: true,
            data: { removed: filtered, count: filtered.length },
            message: `Removed ${filtered.length} struggle words`
        });
    } catch (error) {
        console.error('Error removing struggle words:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove struggle words',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));
*/
// END COMMENTED OUT: Struggle words endpoints

/**
 * POST /:courseId/assistant-prompts
 * Create a new initial assistant prompt. Instructors only.
 *
 * @route POST /api/courses/:courseId/assistant-prompts
 * @param {string} courseId - Course ID (path param)
 * @param {object} body - Prompt data (body)
 * @returns {object} { success: boolean, data?: InitialAssistantPrompt, error?: string }
 * @response 201 - Prompt created successfully
 * @response 400 - Validation error
 * @response 403 - Instructor access required or not in course
 * @response 404 - Course not found
 * @response 500 - Failed to create prompt
 */
router.post('/:courseId/assistant-prompts', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId } = req.params;
        const { title, content } = req.body;

        if (!title || typeof title !== 'string' || title.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Title is required'
            });
        }
        
        // Content can be empty, so we allow it

        const instance = await EngEAI_MongoDB.getInstance();
        
        // Verify instructor is in course's instructors array
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const courseData = course as unknown as activeCourse;
        const instructorUserId = globalUser.userId;
        
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') {
                    return inst === instructorUserId;
                } else if (inst && inst.userId) {
                    return inst.userId === instructorUserId;
                }
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        // Generate ID for the new prompt
        const dateCreated = new Date();
        const promptId = instance.idGenerator.initialAssistantPromptID(title, courseData.courseName, dateCreated);

        const newPrompt: InitialAssistantPrompt = {
            id: promptId,
            title: title.trim(),
            content: content.trim(),
            dateCreated: dateCreated,
            isSelected: false
        };

        await instance.createInitialAssistantPrompt(courseId, newPrompt);
        
        res.status(201).json({
            success: true,
            data: newPrompt,
            message: 'Initial assistant prompt created successfully'
        });
    } catch (error) {
        console.error('Error creating initial assistant prompt:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create initial assistant prompt',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

/**
 * PUT /:courseId/assistant-prompts/:promptId
 * Update an initial assistant prompt. Instructors only.
 *
 * @route PUT /api/courses/:courseId/assistant-prompts/:promptId
 * @param {string} courseId - Course ID (path param)
 * @param {string} promptId - Prompt ID (path param)
 * @param {object} body - Update payload (body)
 * @returns {object} { success: boolean, data?: InitialAssistantPrompt, error?: string }
 * @response 200 - Prompt updated successfully
 * @response 400 - Validation error
 * @response 403 - Instructor access required or not in course
 * @response 404 - Course or prompt not found
 * @response 500 - Failed to update prompt
 */
router.put('/:courseId/assistant-prompts/:promptId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId, promptId } = req.params;
        const { title, content } = req.body;

        if (!title && !content) {
            return res.status(400).json({
                success: false,
                error: 'At least one field (title or content) is required'
            });
        }

        const instance = await EngEAI_MongoDB.getInstance();
        
        // Verify instructor is in course's instructors array
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const courseData = course as unknown as activeCourse;
        const instructorUserId = globalUser.userId;
        
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') {
                    return inst === instructorUserId;
                } else if (inst && inst.userId) {
                    return inst.userId === instructorUserId;
                }
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        const updates: Partial<InitialAssistantPrompt> = {};
        if (title !== undefined) updates.title = title.trim();
        if (content !== undefined) updates.content = content.trim();

        await instance.updateInitialAssistantPrompt(courseId, promptId, updates);
        
        // Get updated prompt
        const prompts = await instance.getInitialAssistantPrompts(courseId);
        const updatedPrompt = prompts.find(p => p.id === promptId);
        
        res.json({
            success: true,
            data: updatedPrompt,
            message: 'Initial assistant prompt updated successfully'
        });
    } catch (error) {
        console.error('Error updating initial assistant prompt:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update initial assistant prompt',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

/**
 * DELETE /:courseId/assistant-prompts/:promptId
 * Delete an initial assistant prompt. Instructors only.
 *
 * @route DELETE /api/courses/:courseId/assistant-prompts/:promptId
 * @param {string} courseId - Course ID (path param)
 * @param {string} promptId - Prompt ID (path param)
 * @returns {object} { success: boolean, message?: string, error?: string }
 * @response 200 - Prompt deleted successfully
 * @response 400 - Cannot delete active prompt
 * @response 403 - Instructor access required or not in course
 * @response 404 - Course or prompt not found
 * @response 500 - Failed to delete prompt
 */
router.delete('/:courseId/assistant-prompts/:promptId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId, promptId } = req.params;
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Verify instructor is in course's instructors array
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const courseData = course as unknown as activeCourse;
        const instructorUserId = globalUser.userId;
        
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') {
                    return inst === instructorUserId;
                } else if (inst && inst.userId) {
                    return inst.userId === instructorUserId;
                }
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        await instance.deleteInitialAssistantPrompt(courseId, promptId);
        
        res.json({
            success: true,
            message: 'Initial assistant prompt deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting initial assistant prompt:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete initial assistant prompt',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

/**
 * POST /:courseId/assistant-prompts/:promptId/select
 * Select a prompt as the active initial assistant prompt. Instructors only.
 *
 * @route POST /api/courses/:courseId/assistant-prompts/:promptId/select
 * @param {string} courseId - Course ID (path param)
 * @param {string} promptId - Prompt ID (path param)
 * @returns {object} { success: boolean, data?: object, error?: string }
 * @response 200 - Prompt selected successfully
 * @response 403 - Instructor access required or not in course
 * @response 404 - Course or prompt not found
 * @response 500 - Failed to select prompt
 */
router.post('/:courseId/assistant-prompts/:promptId/select', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId, promptId } = req.params;
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Verify instructor is in course's instructors array
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const courseData = course as unknown as activeCourse;
        const instructorUserId = globalUser.userId;
        
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') {
                    return inst === instructorUserId;
                } else if (inst && inst.userId) {
                    return inst.userId === instructorUserId;
                }
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        await instance.selectInitialAssistantPrompt(courseId, promptId);
        
        // Get updated prompts
        const prompts = await instance.getInitialAssistantPrompts(courseId);
        const selectedPrompt = prompts.find(p => p.id === promptId);
        
        res.json({
            success: true,
            data: selectedPrompt,
            message: 'Initial assistant prompt selected successfully'
        });
    } catch (error) {
        console.error('Error selecting initial assistant prompt:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to select initial assistant prompt',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

// ===========================================
// ========= SYSTEM PROMPT ITEMS API ========
// ===========================================

/**
 * GET /:courseId/system-prompts
 * Get all system prompt items for a course. Instructors only.
 *
 * @route GET /api/courses/:courseId/system-prompts
 * @param {string} courseId - Course ID (path param)
 * @returns {object} { success: boolean, data?: SystemPromptItem[], error?: string }
 * @response 200 - Success
 * @response 403 - Instructor access required or not in course
 * @response 404 - Course not found
 * @response 500 - Failed to get system prompts
 */
router.get('/:courseId/system-prompts', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId } = req.params;
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Verify instructor is in course's instructors array
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const courseData = course as unknown as activeCourse;
        const instructorUserId = globalUser.userId;
        
        // Helper function to check if instructor is in the array (handles both old and new formats)
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') {
                    return inst === instructorUserId;
                } else if (inst && inst.userId) {
                    return inst.userId === instructorUserId;
                }
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        // Ensure default components exist before returning items
        await instance.ensureDefaultSystemPromptComponents(courseId, courseData.courseName);

        const items = await instance.getSystemPromptItems(courseId);
        
        res.json({
            success: true,
            data: items
        });
    } catch (error) {
        console.error('Error getting system prompt items:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get system prompt items',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

/**
 * POST /:courseId/system-prompts
 * Create a new system prompt item. Instructors only.
 *
 * @route POST /api/courses/:courseId/system-prompts
 * @param {string} courseId - Course ID (path param)
 * @param {object} body - System prompt item data (body)
 * @returns {object} { success: boolean, data?: SystemPromptItem, error?: string }
 * @response 201 - System prompt item created successfully
 * @response 400 - Validation error
 * @response 403 - Instructor access required or not in course
 * @response 404 - Course not found
 * @response 500 - Failed to create system prompt item
 */
router.post('/:courseId/system-prompts', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId } = req.params;
        const { title, content } = req.body;

        if (!title || typeof title !== 'string' || title.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Title is required'
            });
        }
        
        // Content can be empty, so we allow it

        const instance = await EngEAI_MongoDB.getInstance();
        
        // Verify instructor is in course's instructors array
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const courseData = course as unknown as activeCourse;
        const instructorUserId = globalUser.userId;
        
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') {
                    return inst === instructorUserId;
                } else if (inst && inst.userId) {
                    return inst.userId === instructorUserId;
                }
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        // Generate ID for the new item
        const dateCreated = new Date();
        const itemId = instance.idGenerator.initialAssistantPromptID(title, courseData.courseName, dateCreated);

        const newItem: SystemPromptItem = {
            id: itemId,
            title: title.trim(),
            content: content ? content.trim() : '',
            dateCreated: dateCreated,
            isAppended: false, // Default to not appended
            componentType: 'custom'
        };

        await instance.createSystemPromptItem(courseId, newItem);
        
        res.status(201).json({
            success: true,
            data: newItem,
            message: 'System prompt item created successfully'
        });
    } catch (error) {
        console.error('Error creating system prompt item:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create system prompt item',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

/**
 * PUT /:courseId/system-prompts/:itemId
 * Update a system prompt item. Instructors only.
 *
 * @route PUT /api/courses/:courseId/system-prompts/:itemId
 * @param {string} courseId - Course ID (path param)
 * @param {string} itemId - System prompt item ID (path param)
 * @param {object} body - Update payload (body)
 * @returns {object} { success: boolean, data?: SystemPromptItem, error?: string }
 * @response 200 - System prompt item updated successfully
 * @response 400 - Validation error
 * @response 403 - Instructor access required or not in course
 * @response 404 - Course or item not found
 * @response 500 - Failed to update system prompt item
 */
router.put('/:courseId/system-prompts/:itemId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId, itemId } = req.params;
        const { title, content } = req.body;

        if (!title && content === undefined) {
            return res.status(400).json({
                success: false,
                error: 'At least one field (title or content) is required'
            });
        }

        const instance = await EngEAI_MongoDB.getInstance();
        
        // Verify instructor is in course's instructors array
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const courseData = course as unknown as activeCourse;
        const instructorUserId = globalUser.userId;
        
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') {
                    return inst === instructorUserId;
                } else if (inst && inst.userId) {
                    return inst.userId === instructorUserId;
                }
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        const updates: Partial<SystemPromptItem> = {};
        if (title !== undefined) updates.title = title.trim();
        if (content !== undefined) updates.content = content.trim();

        await instance.updateSystemPromptItem(courseId, itemId, updates);
        
        // Get updated item
        const items = await instance.getSystemPromptItems(courseId);
        const updatedItem = items.find(item => item.id === itemId);
        
        res.json({
            success: true,
            data: updatedItem,
            message: 'System prompt item updated successfully'
        });
    } catch (error) {
        console.error('Error updating system prompt item:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update system prompt item',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

/**
 * DELETE /:courseId/system-prompts/:itemId
 * Delete a system prompt item. Instructors only.
 *
 * @route DELETE /api/courses/:courseId/system-prompts/:itemId
 * @param {string} courseId - Course ID (path param)
 * @param {string} itemId - System prompt item ID (path param)
 * @returns {object} { success: boolean, message?: string, error?: string }
 * @response 200 - System prompt item deleted successfully
 * @response 403 - Instructor access required or not in course
 * @response 404 - Course or item not found
 * @response 500 - Failed to delete system prompt item
 */
router.delete('/:courseId/system-prompts/:itemId', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId, itemId } = req.params;
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Verify instructor is in course's instructors array
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const courseData = course as unknown as activeCourse;
        const instructorUserId = globalUser.userId;
        
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') {
                    return inst === instructorUserId;
                } else if (inst && inst.userId) {
                    return inst.userId === instructorUserId;
                }
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        await instance.deleteSystemPromptItem(courseId, itemId);
        
        res.json({
            success: true,
            message: 'System prompt item deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting system prompt item:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Check if error is about default components
        if (errorMessage.includes('Cannot delete')) {
            return res.status(400).json({
                success: false,
                error: errorMessage
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to delete system prompt item',
            details: errorMessage
        });
    }
}));

/**
 * POST /:courseId/system-prompts/:itemId/append
 * Toggle append status for a system prompt item. Instructors only.
 *
 * @route POST /api/courses/:courseId/system-prompts/:itemId/append
 * @param {string} courseId - Course ID (path param)
 * @param {string} itemId - System prompt item ID (path param)
 * @returns {object} { success: boolean, data?: SystemPromptItem, error?: string }
 * @response 200 - Append status toggled successfully
 * @response 403 - Instructor access required or not in course
 * @response 404 - Course or item not found
 * @response 500 - Failed to toggle append status
 */
router.post('/:courseId/system-prompts/:itemId/append', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId, itemId } = req.params;
        const { append } = req.body;

        if (typeof append !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'append field must be a boolean'
            });
        }

        const instance = await EngEAI_MongoDB.getInstance();
        
        // Verify instructor is in course's instructors array
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const courseData = course as unknown as activeCourse;
        const instructorUserId = globalUser.userId;
        
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') {
                    return inst === instructorUserId;
                } else if (inst && inst.userId) {
                    return inst.userId === instructorUserId;
                }
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        await instance.toggleSystemPromptItemAppend(courseId, itemId, append);
        
        // Get updated item
        const items = await instance.getSystemPromptItems(courseId);
        const updatedItem = items.find(item => item.id === itemId);
        
        res.json({
            success: true,
            data: updatedItem,
            message: `System prompt item ${append ? 'appended' : 'removed'} successfully`
        });
    } catch (error) {
        console.error('Error toggling system prompt item append status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to toggle append status',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

/**
 * POST /:courseId/system-prompts/save-changes
 * Save multiple append status changes for system prompt items. Instructors only.
 *
 * @route POST /api/courses/:courseId/system-prompts/save-changes
 * @param {string} courseId - Course ID (path param)
 * @param {object} body - Array of items with append status changes (body)
 * @returns {object} { success: boolean, data?: object, error?: string }
 * @response 200 - Changes saved successfully
 * @response 400 - Validation error
 * @response 403 - Instructor access required or not in course
 * @response 404 - Course not found
 * @response 500 - Failed to save changes
 */
router.post('/:courseId/system-prompts/save-changes', asyncHandlerWithAuth(async (req: Request, res: Response) => {
    try {
        const globalUser = (req.session as any).globalUser;
        if (!globalUser || globalUser.affiliation !== 'faculty') {
            return res.status(403).json({
                success: false,
                error: 'Instructor access required'
            });
        }

        const { courseId } = req.params;
        const { changes } = req.body;

        if (!Array.isArray(changes)) {
            return res.status(400).json({
                success: false,
                error: 'changes must be an array'
            });
        }

        // Validate changes array
        for (const change of changes) {
            if (!change.itemId || typeof change.append !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'Each change must have itemId (string) and append (boolean)'
                });
            }
        }

        const instance = await EngEAI_MongoDB.getInstance();
        
        // Verify instructor is in course's instructors array
        const course = await instance.getActiveCourse(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const courseData = course as unknown as activeCourse;
        const instructorUserId = globalUser.userId;
        
        const isInstructorInArray = (instructors: any[]): boolean => {
            if (!instructors || instructors.length === 0) return false;
            return instructors.some(inst => {
                if (typeof inst === 'string') {
                    return inst === instructorUserId;
                } else if (inst && inst.userId) {
                    return inst.userId === instructorUserId;
                }
                return false;
            });
        };

        if (!isInstructorInArray(courseData.instructors || [])) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to access this course'
            });
        }

        await instance.saveSystemPromptAppendChanges(courseId, changes);
        
        // Get all updated items
        const items = await instance.getSystemPromptItems(courseId);
        
        res.json({
            success: true,
            data: items,
            message: 'System prompt changes saved successfully'
        });
    } catch (error) {
        console.error('Error saving system prompt changes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save system prompt changes',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));


