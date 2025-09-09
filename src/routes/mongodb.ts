
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
const router = express.Router();
export default router;
import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { activeCourse, ContentDivision, courseItem } from '../functions/types';
import { IDGenerator } from '../functions/unique-id-generator';

dotenv.config();


export class EngEAI_MongoDB {

    private static instance: EngEAI_MongoDB;
    private static activeCourseListDatabase: string = 'TLEF-ENGEAI-DB';
    private static activeCourseListCollection: string = 'active-course-list';
    private static MONGO_URL = `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@localhost:27017`;
    private client: MongoClient;
    private db!: Db;
    private activeCourses = [];
    public idGenerator : IDGenerator; 
    
    constructor() {
        this.idGenerator = new IDGenerator();
        this.client = new MongoClient(EngEAI_MongoDB.MONGO_URL, {
            authSource: 'admin',
        });
    }

    /**
     * Get the singleton instance of the EngEAI_MongoDB class
     */
    public static async getInstance(): Promise<EngEAI_MongoDB> {
        if (!EngEAI_MongoDB.instance) {
            EngEAI_MongoDB.instance = new EngEAI_MongoDB();
            
            // Connect to MongoDB if not already connected
            try {
                await EngEAI_MongoDB.instance.client.connect();
                EngEAI_MongoDB.instance.db = EngEAI_MongoDB.instance.client.db(EngEAI_MongoDB.activeCourseListDatabase);
            } catch (error) {
                // Connection already exists or failed
                if (!EngEAI_MongoDB.instance.db) {
                    EngEAI_MongoDB.instance.db = EngEAI_MongoDB.instance.client.db(EngEAI_MongoDB.activeCourseListDatabase);
                }
            }
        }
        return EngEAI_MongoDB.instance;
    }

    /**
     * Get the active course list collection
     */
    private getCourseCollection(): Collection {
        return this.db.collection(EngEAI_MongoDB.activeCourseListCollection);
    }

    /**
     * post active course, creates a database and collection for the course
     * 
     * it sets up the following collections and schemas:
     * - users
     * - messages
     * - learning objectives
     * - flag reports
     * 
     * @param course - the active course to post
     * @returns void
     */
    public postActiveCourse = async (course: activeCourse) => {

        try {
        
            await this.getCourseCollection().insertOne(course);

            //use singleton's DB
            const courseName = course.courseName;

            //create users collection
            const userCollection = `${courseName}_users`;
            await this.db.createCollection(userCollection);
    
            //create messages collection
            const messagesCollection = `${courseName}_messages`;
            await this.db.createCollection(messagesCollection);
    
            //create flags collection
            const flagsCollection = `${courseName}_flags`;
            await this.db.createCollection(flagsCollection);
        
        } catch (error) {
            console.error('Error creating collections and schemas:', error);
        }
    }
        
    /**
     * Delete an active course from the database
     * @param course - the course to delete
     * @returns Promise<void>
     */
    public deleteActiveCourse = async (course: activeCourse) => {
        await this.getCourseCollection().deleteOne({ id: course.id });
    }

    /**
     * Get an active course by its ID
     * @param id - the course ID to search for
     * @returns Promise<any> - the course document or null if not found
     */
    public getActiveCourse = async (id: string) => {
        return await this.getCourseCollection().findOne({ id: id });
    }

    /**
     * Get a course by its name
     * @param name - the course name to search for
     * @returns Promise<any> - the course document or null if not found
     */
    public getCourseByName = async (name: string) => {

        if (name === 'CHBE241') {
            return await this.getCourseCollection().findOne({ courseName: 'CHBE 241' });
        }
        else {
            
            // Try exact match first
            let course = await this.getCourseCollection().findOne({ courseName: name });
            
            // If no exact match, try case-insensitive search
            if (!course) {
                course = await this.getCourseCollection().findOne({ 
                    courseName: { $regex: new RegExp(`^${name.replace(/\s+/g, '\\s*')}$`, 'i') }
                });
            }
            
        
            
            return course;
        }
    }

    /**
     * Get all active courses from the database
     * @returns Promise<any[]> - array of all course documents
     */
    public getAllActiveCourses = async () => {
        return await this.getCourseCollection().find({}).toArray();
    }

    /**
     * Update an active course in the database
     * @param id - the course ID to update
     * @param updateData - the data to update
     * @returns Promise<any> - the updated course document
     */
    public updateActiveCourse = async (id: string, updateData: Partial<activeCourse>) => {
        const result = await this.getCourseCollection().findOneAndUpdate(
            { id: id },
            { $set: { ...updateData, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );
        return result;
    }

    /**
     * Add a learning objective to a specific course item
     * @param courseId - the course ID
     * @param divisionId - the division ID
     * @param contentId - the content item ID
     * @param learningObjective - the learning objective to add
     * @returns Promise<any> - the updated course document
     */
    public addLearningObjective = async (courseId: string, divisionId: string, contentId: string, learningObjective: any) => {
        const result = await this.getCourseCollection().findOneAndUpdate(
            { 
                id: courseId,
                'divisions.id': divisionId,
                'divisions.items.id': contentId
            },
            { 
                $push: { 
                    'divisions.$[division].items.$[item].learningObjectives': learningObjective
                },
                $set: { updatedAt: new Date() }
            },
            { 
                arrayFilters: [
                    { 'division.id': divisionId },
                    { 'item.id': contentId }
                ],
                returnDocument: 'after' 
            }
        );
        return result;
    }

    /**
     * Update a learning objective in a specific course item
     * @param courseId - the course ID
     * @param divisionId - the division ID
     * @param contentId - the content item ID
     * @param objectiveId - the learning objective ID
     * @param updateData - the data to update
     * @returns Promise<any> - the updated course document
     */
    public updateLearningObjective = async (courseId: string, divisionId: string, contentId: string, objectiveId: string, updateData: any) => {
        const result = await this.getCourseCollection().findOneAndUpdate(
            { 
                id: courseId,
                'divisions.id': divisionId,
                'divisions.items.id': contentId,
                'divisions.items.learningObjectives.id': objectiveId
            },
            { 
                $set: { 
                    'divisions.$[division].items.$[item].learningObjectives.$[objective].subcontentTitle': updateData.subcontentTitle,
                    'divisions.$[division].items.$[item].learningObjectives.$[objective].content': updateData.content,
                    'divisions.$[division].items.$[item].learningObjectives.$[objective].updatedAt': new Date(),
                    updatedAt: new Date()
                }
            },
            { 
                arrayFilters: [
                    { 'division.id': divisionId },
                    { 'item.id': contentId },
                    { 'objective.id': objectiveId }
                ],
                returnDocument: 'after' 
            }
        );
        return result;
    }

    /**
     * Delete a learning objective from a specific course item
     * @param courseId - the course ID
     * @param divisionId - the division ID
     * @param contentId - the content item ID
     * @param objectiveId - the learning objective ID
     * @returns Promise<any> - the updated course document
     */
    public deleteLearningObjective = async (courseId: string, divisionId: string, contentId: string, objectiveId: string) => {
        const result = await this.getCourseCollection().findOneAndUpdate(
            { 
                id: courseId,
                'divisions.id': divisionId,
                'divisions.items.id': contentId
            },
            { 
                $pull: { 
                    'divisions.$[division].items.$[item].learningObjectives': { id: objectiveId }
                } as any,
                $set: { updatedAt: new Date() }
            },
            { 
                arrayFilters: [
                    { 'division.id': divisionId },
                    { 'item.id': contentId }
                ],
                returnDocument: 'after' 
            }
        );
        return result;
    }

}

/**
 * ===========================================
 * ========= EXPRESS ROUTES SETUP ===========
 * ===========================================
 */

// Middleware for error handling
const asyncHandler = (fn: (req: Request, res: Response) => Promise<any>) => 
    (req: Request, res: Response) => {
        Promise.resolve(fn(req, res))
            .catch((error) => {
                console.error('Error in MongoDB route:', error);
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    details: error.message
                });
            });
    };

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

    if (!course.date || !(course.date instanceof Date) && !Date.parse(course.date)) {
        return res.status(400).json({
            success: false,
            error: 'Date is required and must be a valid date'
        });
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

    if (!Array.isArray(course.divisions)) {
        return res.status(400).json({
            success: false,
            error: 'divisions is required and must be an array'
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

    if (!course.date) {
        console.log("🔴 Date is required");
        return res.status(400).json({
            success: false,
            error: 'Date is required'
        });
    }

    next();
};

// Routes

// POST /api/mongodb/courses - Create a new course
router.post('/courses', validateNewCourse, asyncHandler(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();

        //creating id - ensure date is a Date object for ID generation
        const tempActiveClass = {
            ...req.body,
            date: new Date(req.body.date)
        } as activeCourse;
        const id = instance.idGenerator.courseID(tempActiveClass);

        //create  coursecontent based on the frametype and tilesNumber
        const courseContent : ContentDivision[] = [];
        if (req.body.frameType === 'byWeek') {
            for (let i = 0; i < req.body.tilesNumber; i++) {

                //mock lecture 1
                const courseContentLecture1: courseItem = {
                    id: '',
                    date: new Date(),
                    title: `Lecture 1`,
                    courseName: req.body.name,
                    divisionTitle: `Week ${i + 1}`,
                    itemTitle: `Lecture 1`,
                    completed: false,
                    learningObjectives: [],
                    additionalMaterials: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }


                //mock lecture 2
                const courseContentLecture2: courseItem = {
                    id: '',
                    date: new Date(),
                    title: `Lecture 2`,
                    courseName: req.body.name,
                    divisionTitle: `Week ${i + 1}`,
                    itemTitle: `Lecture 2`,
                    completed: false,
                    learningObjectives: [],
                    additionalMaterials: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }

                //mock lecture 3
                const courseContentLecture3: courseItem = {
                    id: '',
                    date: new Date(),
                    title: `Lecture 3`,
                    courseName: req.body.name,
                    divisionTitle: `Week ${i + 1}`,
                    itemTitle: `Lecture 3`,
                    completed: false,
                    learningObjectives: [],
                    additionalMaterials: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }

                //mock content
                const contentMock: ContentDivision = {
                    id: '',
                    date: new Date(req.body.date),
                    title: `Week ${i + 1}`,
                    courseName: req.body.name,
                    published: true,
                    items: [courseContentLecture1, courseContentLecture2, courseContentLecture3],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }

                //initiate id for each lecture
                courseContentLecture1.id = instance.idGenerator.subContentID(courseContentLecture1, contentMock.title, req.body.name);
                courseContentLecture2.id = instance.idGenerator.subContentID(courseContentLecture2, contentMock.title, req.body.name);
                courseContentLecture3.id = instance.idGenerator.subContentID(courseContentLecture3, contentMock.title, req.body.name);

                courseContent.push({
                    id: instance.idGenerator.contentID(contentMock, req.body.name),
                    date: new Date(req.body.date),
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
                const courseContentTopic1: courseItem = {
                    id: '',
                    date: new Date(req.body.date),
                    title: `Topic ${i + 1}`,
                    courseName: req.body.name,
                    divisionTitle: `Topic ${i + 1}`,
                    itemTitle: `Topic ${i + 1}`,
                    completed: false,
                    learningObjectives: [],
                    additionalMaterials: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }

                //mock course division
                const contentMock: ContentDivision = {
                    id: '',
                    date: new Date(req.body.date),
                    title: `Topic ${i + 1}`,
                    courseName: req.body.name,
                    published: false,
                    items: [courseContentTopic1],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }

                //initiate id for each lecture
                courseContentTopic1.id = instance.idGenerator.subContentID(courseContentTopic1, contentMock.title, req.body.name);

                courseContent.push({
                    id: instance.idGenerator.contentID(contentMock, req.body.name),
                    date: new Date(req.body.date),
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
        req.body.divisions = courseContent;

        const courseData: activeCourse = {
            ...req.body, //spread the properties of the body first
            id: id, // use the generated id
            date: new Date(req.body.date),
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

// GET /api/mongodb/courses - Get all courses
router.get('/courses', asyncHandler(async (req: Request, res: Response) => {
    const instance = await EngEAI_MongoDB.getInstance();
    const courses = await instance.getAllActiveCourses();
    
    res.status(200).json({
        success: true,
        data: courses,
        count: courses.length
    });
}));

// GET /api/mongodb/courses/:id - Get course by ID
router.get('/courses/:id', asyncHandler(async (req: Request, res: Response) => {
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

// GET /api/mongodb/courses/name/:name - Get course by name
router.get('/courses/name/:name', asyncHandler(async (req: Request, res: Response) => {
    const instance = await EngEAI_MongoDB.getInstance();


    const course = await instance.getCourseByName(req.params.name);
    
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

// PUT /api/mongodb/courses/:id - Update course
router.put('/courses/:id', asyncHandler(async (req: Request, res: Response) => {
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

// DELETE /api/mongodb/courses/:id - Delete course
router.delete('/courses/:id', asyncHandler(async (req: Request, res: Response) => {
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

// POST /api/mongodb/learning-objectives - Add a learning objective
router.post('/learning-objectives', asyncHandler(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, divisionId, contentId, learningObjective } = req.body;
        
        if (!courseId || !divisionId || !contentId || !learningObjective) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: courseId, divisionId, contentId, learningObjective'
            });
        }
        
        const result = await instance.addLearningObjective(courseId, divisionId, contentId, learningObjective);
        
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

// PUT /api/mongodb/learning-objectives - Update a learning objective
router.put('/learning-objectives', asyncHandler(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, divisionId, contentId, objectiveId, updateData } = req.body;
        
        if (!courseId || !divisionId || !contentId || !objectiveId || !updateData) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: courseId, divisionId, contentId, objectiveId, updateData'
            });
        }
        
        const result = await instance.updateLearningObjective(courseId, divisionId, contentId, objectiveId, updateData);
        
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

// DELETE /api/mongodb/learning-objectives - Delete a learning objective
router.delete('/learning-objectives', asyncHandler(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const { courseId, divisionId, contentId, objectiveId } = req.body;
        
        if (!courseId || !divisionId || !contentId || !objectiveId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: courseId, divisionId, contentId, objectiveId'
            });
        }
        
        const result = await instance.deleteLearningObjective(courseId, divisionId, contentId, objectiveId);
        
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


// Health check endpoint
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        // Test the connection by pinging the database
        await instance['db'].admin().ping();
        
        res.status(200).json({
            success: true,
            data: {
                status: 'healthy',
                database: 'connected',
                connectionState: 1,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            error: 'Database connection unhealthy'
        });
    }
}));











